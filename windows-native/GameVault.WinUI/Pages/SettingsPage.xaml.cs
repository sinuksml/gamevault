using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SinuGameVault.Services;

namespace SinuGameVault.Pages;

/// <summary>Appearance, sync, service sign-ins, backups and the About box.</summary>
public sealed partial class SettingsPage : Page
{
    private const string ReleasesPage = "https://github.com/sinuksml/gamevault/releases/latest";

    private readonly AppState _state = AppState.Current;
    private bool _loading;

    public SettingsPage() => InitializeComponent();

    private static string AppVersion =>
        typeof(App).Assembly.GetName().Version is { } version ? $"{version.Major}.{version.Minor}.{version.Build}" : "0.0.0";

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        _loading = true;
        if (!Ui.SelectTag(ThemeBox, _state.Preferences.Get("Theme", "system"))) Ui.SelectTag(ThemeBox, "dark");
        DriveClientId.Text = _state.Drive.ClientId;
        DriveClientSecret.Password = _state.Drive.ClientSecret;
        RawgKey.Password = _state.Catalog.RawgKey;
        TmdbKey.Password = _state.Catalog.TmdbKey;
        OmdbKey.Password = _state.Catalog.OmdbKey;
        PlexUrl.Text = _state.Plex.ServerUrl;
        PlexToken.Password = _state.Plex.Token;
        BiglyEndpoint.Text = _state.Bigly.Endpoint;
        BiglyAutoRemove.IsOn = !string.Equals(_state.Vault.Root["biglyAutoRemoveCompleted"]?.ToString(), "false", StringComparison.OrdinalIgnoreCase);
        VaultPath.Text = _state.Vault.VaultPath;
        VersionText.Text = $"Version {AppVersion}  ·  WinUI 3";
        _loading = false;

        _state.DriveStatusChanged += ShowDrive;
        ShowDrive();
        ShowSummaries();
        _ = ShowBackupInfoAsync();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e) => _state.DriveStatusChanged -= ShowDrive;

    private void ShowSummaries()
    {
        var keys = new[] { ("RAWG", _state.Catalog.RawgKey), ("TMDB", _state.Catalog.TmdbKey), ("OMDb", _state.Catalog.OmdbKey) }
            .Where(key => key.Item2.Length > 0).Select(key => key.Item1).ToList();
        CatalogSummary.Text = keys.Count == 0 ? "No keys saved. Search, Discover and Upcoming need them." : $"Saved: {string.Join(", ", keys)}";
        PlexSummary.Text = _state.Plex.Connected ? $"Connected to {_state.Plex.ServerUrl}" : "Not connected";
        BiglySummary.Text = _state.Bigly.Connected ? $"Signed in to {_state.Bigly.Endpoint}" : "Not signed in";
    }

    // ---- Appearance ---------------------------------------------------------

    private void Theme_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        var theme = Ui.SelectedTag(ThemeBox, "system");
        _state.Preferences.Set("Theme", theme);
        App.Window?.ApplyTheme(theme);
    }

    // ---- Google Drive -------------------------------------------------------

    private void ShowDrive()
    {
        var connected = _state.Drive.Connected;
        DriveSummary.Text = connected ? $"{_state.DriveStatus}  ·  {_state.DriveDetail}" : "Not connected. The library is saved on this PC only.";
        DriveSyncButton.IsEnabled = connected;
        DriveDisconnectButton.IsEnabled = connected;
        DriveSignInButton.Content = connected ? "Sign in again" : "Sign in with Google";
    }

    private async Task ShowBackupInfoAsync()
    {
        if (!_state.Drive.Connected) { DriveBackupInfo.Text = ""; return; }
        try
        {
            var info = await _state.Drive.BackupInfoAsync();
            if (info is null) { DriveBackupInfo.Text = "No game-vault-backup.json exists in Drive yet."; return; }
            var modified = info.ModifiedAt?.ToLocalTime().ToString("dd MMM yyyy, h:mm tt") ?? "unknown";
            DriveBackupInfo.Text = $"Drive backup: {Ui.Bytes(info.SizeBytes)}  ·  last updated {modified}";
        }
        catch (Exception ex) { DriveBackupInfo.Text = $"Backup details unavailable: {ex.Message}"; }
    }

    private async void DriveSignIn_Click(object sender, RoutedEventArgs e)
    {
        DriveSignInButton.IsEnabled = false;
        try
        {
            _state.Drive.ClientId = string.IsNullOrWhiteSpace(DriveClientId.Text) ? DriveService.DefaultClientId : DriveClientId.Text.Trim();
            _state.Drive.ClientSecret = DriveClientSecret.Password.Trim();
            var progress = new Progress<string>(message => DriveSummary.Text = message);
            await _state.Drive.SignInWithBrowserAsync(progress);
            _state.RefreshDriveStatus();
            await _state.SyncDriveAsync(silent: false);
            await ShowBackupInfoAsync();
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Drive", "Google sign-in failed", ex);
            ShowDrive();
            await Ui.MessageAsync("Google sign-in failed", ex.Message);
        }
        finally { DriveSignInButton.IsEnabled = true; }
    }

    private async void DriveSync_Click(object sender, RoutedEventArgs e)
    {
        await _state.SyncDriveAsync(silent: false);
        await ShowBackupInfoAsync();
    }

    private async void DriveDisconnect_Click(object sender, RoutedEventArgs e)
    {
        if (!await Ui.ConfirmAsync("Disconnect Google Drive", "Stop syncing on this PC? The library stays here and in Drive; nothing is deleted.", "Disconnect")) return;
        _state.Drive.Disconnect();
        _state.RefreshDriveStatus();
        DriveBackupInfo.Text = "";
    }

    // ---- Catalogs and services ---------------------------------------------

    private void SaveKeys_Click(object sender, RoutedEventArgs e)
    {
        _state.Catalog.RawgKey = RawgKey.Password;
        _state.Catalog.TmdbKey = TmdbKey.Password;
        _state.Catalog.OmdbKey = OmdbKey.Password;
        ShowSummaries();
        _state.Notify("Catalog keys saved in Windows Credential Manager.", InfoBarSeverity.Success);
    }

    private void PlexHelp_Click(object sender, RoutedEventArgs e) => Ui.Open(PlexPage.TokenGuide);

    private void PlexSave_Click(object sender, RoutedEventArgs e)
    {
        _state.Plex.ServerUrl = PlexUrl.Text;
        _state.Plex.Token = PlexToken.Password;
        _state.Plex.ClearCache();
        ShowSummaries();
        _state.Notify("Plex settings saved in Windows Credential Manager.", InfoBarSeverity.Success);
    }

    private async void PlexDiscover_Click(object sender, RoutedEventArgs e)
    {
        PlexDiscoverButton.IsEnabled = false;
        try
        {
            var found = await _state.Plex.DiscoverServerAsync(PlexToken.Password);
            PlexUrl.Text = found;
            _state.Plex.ServerUrl = found;
            _state.Plex.Token = PlexToken.Password;
            _state.Plex.ClearCache();
            var movies = await _state.Plex.LibraryAsync("movie");
            ShowSummaries();
            _state.Notify($"Plex server found and saved. {movies.Count} movies in its library.", InfoBarSeverity.Success);
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Plex", "Plex discovery failed", ex);
            await Ui.MessageAsync("Plex server not found", ex.Message);
        }
        finally { PlexDiscoverButton.IsEnabled = true; }
    }

    private async void BiglySignIn_Click(object sender, RoutedEventArgs e)
    {
        BiglySignInButton.IsEnabled = false;
        try
        {
            _state.Bigly.Endpoint = BiglyEndpoint.Text;
            await _state.Bigly.SignInAsync(BiglyUser.Text, BiglyPassword.Password);
            BiglyPassword.Password = "";
            ShowSummaries();
            _state.Notify("Signed in to BiglyBT. The session is saved in Windows Credential Manager.", InfoBarSeverity.Success);
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("BiglyBT", "BiglyBT sign-in failed", ex);
            await Ui.MessageAsync("BiglyBT sign-in failed", ex.Message);
        }
        finally { BiglySignInButton.IsEnabled = true; }
    }

    private async void BiglyForget_Click(object sender, RoutedEventArgs e)
    {
        if (!await Ui.ConfirmAsync("Forget BiglyBT session", "Remove the saved BiglyBT session from this PC?", "Forget session")) return;
        _state.Bigly.Disconnect();
        ShowSummaries();
        _state.Notify("BiglyBT session removed.");
    }

    private async void BiglyAutoRemove_Toggled(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        var value = BiglyAutoRemove.IsOn;
        await _state.RunAsync(() => _state.Vault.SetRootValueAsync("biglyAutoRemoveCompleted", JsonValue.Create(value)), "The setting could not be saved.");
    }

    // ---- Data ---------------------------------------------------------------

    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        var path = await Ui.PickSaveFileAsync($"game-vault-windows-{DateTime.Today:yyyy-MM-dd}", "GameVault backup", ".json");
        if (path is null) return;
        if (await _state.RunAsync(() => _state.Vault.ExportAsync(path), "The backup could not be exported."))
            _state.Notify($"Backup exported to {path}", InfoBarSeverity.Success);
    }

    private async void Import_Click(object sender, RoutedEventArgs e)
    {
        var path = await Ui.PickOpenFileAsync(".json");
        if (path is null) return;
        if (!await Ui.ConfirmAsync("Import backup", $"Replace the whole library with {System.IO.Path.GetFileName(path)}?\n\nThe current library is saved as a recovery snapshot first.", "Import", destructive: true)) return;
        if (await _state.RunAsync(() => _state.Vault.ImportAsync(path), "The backup could not be imported."))
            _state.Notify("Backup imported. The previous library was kept as a recovery snapshot.", InfoBarSeverity.Success);
    }

    private async void Snapshot_Click(object sender, RoutedEventArgs e)
    {
        if (await _state.RunAsync(() => _state.Vault.CreateSnapshotAsync(), "The snapshot could not be created."))
            _state.Notify("Recovery snapshot created.", InfoBarSeverity.Success);
    }

    private async void Restore_Click(object sender, RoutedEventArgs e) => await LibraryCommands.RestoreSnapshotAsync();

    private void OpenFolder_Click(object sender, RoutedEventArgs e) => Ui.Open(_state.Vault.StorageFolder);

    private async void Diagnostics_Click(object sender, RoutedEventArgs e)
    {
        var path = await Ui.PickSaveFileAsync($"gamevault-diagnostics-{DateTime.Today:yyyy-MM-dd}", "Text report", ".txt");
        if (path is null) return;
        if (await _state.RunAsync(() => DiagnosticsService.ExportAsync(path, _state.Vault), "The report could not be exported."))
            _state.Notify("Diagnostics report exported.", InfoBarSeverity.Success);
    }

    // ---- About --------------------------------------------------------------

    /// <summary>Asks GitHub for the latest release and says plainly whether this build is behind.</summary>
    private async void Updates_Click(object sender, RoutedEventArgs e)
    {
        UpdateButton.IsEnabled = false;
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(12) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("SinuGameVault-Windows");
            http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            var response = await http.GetAsync("https://api.github.com/repos/sinuksml/gamevault/releases/latest");
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                _state.Notify("No release has been published on GitHub yet.");
                return;
            }
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"GitHub returned {(int)response.StatusCode}.");
            var payload = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject ?? [];
            var tag = Json.Text(payload, "tag_name").TrimStart('v', 'V');
            if (ParseVersion(tag) > ParseVersion(AppVersion))
            {
                if (await Ui.ConfirmAsync("Update available", $"Version {tag} is available. You are running {AppVersion}.", "Open download page")) Ui.Open(ReleasesPage);
            }
            else _state.Notify($"Sinu Game Vault {AppVersion} is up to date.", InfoBarSeverity.Success);
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Updates", "Update check failed", ex);
            if (await Ui.ConfirmAsync("Update check failed", $"GitHub could not be reached. {ex.Message}", "Open releases page")) Ui.Open(ReleasesPage);
        }
        finally { UpdateButton.IsEnabled = true; }
    }

    private static Version ParseVersion(string value)
    {
        var cleaned = new string(value.Trim().TakeWhile(character => char.IsDigit(character) || character == '.').ToArray());
        return Version.TryParse(cleaned, out var parsed) ? parsed : new Version(0, 0, 0);
    }
}
