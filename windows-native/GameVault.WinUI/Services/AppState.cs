using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml.Controls;
using SinuGameVault.Services;

namespace SinuGameVault;

/// <summary>
/// The one place pages reach for data and services.
///
/// Pages never talk to each other. A page changes the vault through
/// <see cref="Actions"/> or <see cref="Vault"/>, the vault raises Saved, and every
/// page still alive hears <see cref="LibraryChanged"/> and redraws itself. That is
/// what replaces the old window's hand-written "refresh everything" calls.
/// </summary>
public sealed class AppState
{
    public static AppState Current { get; } = new();

    public VaultRepository Vault { get; } = new();
    public UserPreferences Preferences { get; }
    public DriveService Drive { get; }
    public PlexService Plex { get; } = new();
    public BiglyBtService Bigly { get; } = new();
    public CatalogService Catalog { get; } = new();
    public AvailabilityService Availability { get; } = new();
    public LibraryReader Reader { get; }
    public DashboardData Dashboard { get; }
    public LibraryActions Actions { get; }

    /// <summary>The vault changed; anything showing library data should redraw.</summary>
    public event Action? LibraryChanged;
    /// <summary>A message for the user: text, severity, and whether to offer Undo.</summary>
    public event Action<string, InfoBarSeverity, bool>? Notified;
    public event Action? DriveStatusChanged;
    public event Action? BusyChanged;
    public event Action? SearchChanged;

    public string DriveStatus { get; private set; } = "";
    /// <summary>The outcome of the most recent sync, shown in Settings.</summary>
    public string DriveDetail { get; private set; } = "";
    public bool Busy { get; private set; }
    public string SearchText { get; private set; } = "";

    private DispatcherQueue? _dispatcher;
    private DispatcherQueueTimer? _driveTimer;
    private bool _syncingDrive;
    private bool _driveSyncPending;
    private bool _libraryChangeQueued;
    private int _busyDepth;
    private DateTime _lastPlexSync = DateTime.MinValue;

    private AppState()
    {
        Preferences = new UserPreferences(Vault.StorageFolder);
        Drive = new DriveService(Vault.StorageFolder);
        Reader = new LibraryReader(Vault);
        Dashboard = new DashboardData(Vault, Reader);
        Actions = new LibraryActions(Vault, Reader, Catalog, Availability);
    }

    /// <summary>Loads the vault and starts listening for changes. Call once, on the UI thread.</summary>
    public async Task InitializeAsync()
    {
        _dispatcher = DispatcherQueue.GetForCurrentThread();
        /* Each sync downloads, merges and re-uploads the whole vault, so this waits
           for editing to settle instead of syncing on every keystroke-sized save.
           Closing the window still flushes what is pending. */
        _driveTimer = _dispatcher.CreateTimer();
        _driveTimer.Interval = TimeSpan.FromSeconds(20);
        _driveTimer.IsRepeating = false;
        _driveTimer.Tick += async (_, _) => await SyncDriveAsync(silent: true);

        await Vault.LoadAsync();
        Vault.Saved += (_, _) => OnUi(() =>
        {
            RaiseLibraryChanged();
            ScheduleDriveSync();
        });
        DriveStatus = Drive.Connected ? "Drive connected" : "Saved on this PC";
        DriveDetail = Drive.Connected ? "Connected securely through Windows Credential Manager." : "Not connected.";
    }

    private void OnUi(Action action)
    {
        if (_dispatcher is null || _dispatcher.HasThreadAccess) action();
        else _dispatcher.TryEnqueue(() => action());
    }

    /// <summary>
    /// Tells pages to redraw. Several saves in a row (a bulk import, a Plex scan)
    /// collapse into one redraw on the next idle moment.
    /// </summary>
    public void RaiseLibraryChanged()
    {
        if (_libraryChangeQueued || _dispatcher is null) return;
        _libraryChangeQueued = true;
        _dispatcher.TryEnqueue(DispatcherQueuePriority.Low, () =>
        {
            _libraryChangeQueued = false;
            LibraryChanged?.Invoke();
        });
    }

    public void Notify(string message, InfoBarSeverity severity = InfoBarSeverity.Informational, bool offerUndo = false) =>
        OnUi(() => Notified?.Invoke(message, severity, offerUndo));

    public void SetSearch(string text)
    {
        text = text.Trim();
        if (text == SearchText) return;
        SearchText = text;
        SearchChanged?.Invoke();
    }

    /// <summary>
    /// Runs a piece of work with the progress bar showing. A failure is logged and
    /// shown as a message instead of being thrown at the caller.
    /// </summary>
    /// <returns>True when the work finished without an error.</returns>
    public async Task<bool> RunAsync(Func<Task> work, string? failure = null)
    {
        _busyDepth++;
        if (!Busy) { Busy = true; BusyChanged?.Invoke(); }
        try
        {
            await work();
            return true;
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Action", failure ?? "An action failed", ex);
            Notify(failure is null ? ex.Message : $"{failure} {ex.Message}", InfoBarSeverity.Error);
            return false;
        }
        finally
        {
            if (--_busyDepth == 0) { Busy = false; BusyChanged?.Invoke(); }
        }
    }

    // ---- Google Drive -------------------------------------------------------

    private void SetDriveStatus(string status, string? detail = null)
    {
        DriveStatus = status;
        if (detail is not null) DriveDetail = detail;
        DriveStatusChanged?.Invoke();
    }

    public void RefreshDriveStatus() => SetDriveStatus(
        Drive.Connected ? "Drive connected" : "Saved on this PC",
        Drive.Connected ? "Connected securely through Windows Credential Manager." : "Not connected.");

    private void ScheduleDriveSync()
    {
        if (!Drive.Connected) { SetDriveStatus("Saved on this PC"); return; }
        SetDriveStatus("Saved locally · sync pending");
        /* A save that lands while a sync is already running must not be dropped.
           Remember it and schedule again once the running sync finishes. */
        if (_syncingDrive) { _driveSyncPending = true; return; }
        _driveTimer?.Stop();
        _driveTimer?.Start();
    }

    public bool DriveWorkPending => _syncingDrive || _driveSyncPending || (_driveTimer?.IsRunning ?? false);

    public async Task SyncDriveAsync(bool silent)
    {
        if (!Drive.Connected || _syncingDrive) return;
        _syncingDrive = true;
        _driveTimer?.Stop();
        try
        {
            SetDriveStatus("Syncing with Drive…");
            var revisionBefore = VaultRepository.Number(Vault.Root["revision"]);
            var updatedBefore = Vault.UpdatedAt;
            var result = await Drive.SyncAsync(Vault);
            SetDriveStatus($"Backed up {DateTime.Now:t}", result);
            /* Only redraw when the sync actually brought something back, so a
               background sync does not move the user's place in a list. */
            if (VaultRepository.Number(Vault.Root["revision"]) != revisionBefore || Vault.UpdatedAt != updatedBefore) RaiseLibraryChanged();
            if (!silent) Notify(result, InfoBarSeverity.Success);
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Drive", "Drive sync failed", ex);
            SetDriveStatus("Drive needs attention", ex.Message);
            if (!silent) Notify($"Google Drive sync failed. {ex.Message}", InfoBarSeverity.Warning);
        }
        finally
        {
            _syncingDrive = false;
            if (_driveSyncPending) { _driveSyncPending = false; ScheduleDriveSync(); }
        }
    }

    /// <summary>Finishes any pending upload before the window closes.</summary>
    public async Task FlushDriveAsync()
    {
        while (_syncingDrive) await Task.Delay(100);
        _driveSyncPending = false;
        await SyncDriveAsync(silent: true);
    }

    public void StopDriveTimer() => _driveTimer?.Stop();

    // ---- Plex ---------------------------------------------------------------

    /// <summary>
    /// Copies Plex continue-watching progress into the library, at most every ten
    /// minutes. Plex being unreachable must not disturb browsing, so it never throws.
    /// </summary>
    public async Task SyncPlexContinueAsync()
    {
        if (!Plex.Connected || DateTime.Now - _lastPlexSync < TimeSpan.FromMinutes(10)) return;
        _lastPlexSync = DateTime.Now;
        try { await Actions.SyncPlexAsync(await Plex.ContinueWatchingAsync()); }
        catch (Exception ex) { DiagnosticsService.Log("Plex", "Continue-watching sync skipped", ex); }
    }
}
