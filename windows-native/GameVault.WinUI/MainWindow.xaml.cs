using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.UI.Xaml.Navigation;
using SinuGameVault.Models;
using SinuGameVault.Pages;
using Windows.Graphics;
using Windows.System;
using DispatcherQueueTimer = Microsoft.UI.Dispatching.DispatcherQueueTimer;

namespace SinuGameVault;

/// <summary>A page that can reload what it shows from its online source.</summary>
public interface IRefreshablePage
{
    Task RefreshAsync();
}

/// <summary>
/// The application shell: title bar, navigation rail and the frame pages load into.
/// It owns navigation and window placement and nothing about the library itself.
/// </summary>
public sealed partial class MainWindow : Window
{
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr window);

    private readonly AppState _state = AppState.Current;
    private readonly DispatcherQueueTimer _searchTimer;
    private readonly DispatcherQueueTimer _toastTimer;
    private bool _closing;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Sinu Game Vault";
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        AppWindow.SetIcon(System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "GameVault.ico"));
        RestorePlacement();
        ApplyTheme(_state.Preferences.Get("Theme", "system"));

        _searchTimer = DispatcherQueue.CreateTimer();
        _searchTimer.Interval = TimeSpan.FromMilliseconds(250);
        _searchTimer.IsRepeating = false;
        _searchTimer.Tick += (_, _) => _state.SetSearch(SearchBox.Text);

        _toastTimer = DispatcherQueue.CreateTimer();
        _toastTimer.IsRepeating = false;
        _toastTimer.Tick += (_, _) => Toast.IsOpen = false;

        _state.Notified += ShowToast;
        _state.BusyChanged += () => BusyBar.Visibility = Ui.Show(_state.Busy);
        _state.DriveStatusChanged += () => DriveStatusText.Text = _state.DriveStatus;
        _state.Actions.UndoChanged += () => { if (!_state.Actions.CanUndo) UndoButton.Visibility = Visibility.Collapsed; };

        AddAccelerator(VirtualKey.K, VirtualKeyModifiers.Control, () => { if (SearchBox.IsEnabled) SearchBox.Focus(FocusState.Keyboard); });
        AddAccelerator(VirtualKey.R, VirtualKeyModifiers.Control, () => Sync_Click(this, new RoutedEventArgs()));
        AddAccelerator(VirtualKey.F5, VirtualKeyModifiers.None, () => Sync_Click(this, new RoutedEventArgs()));
        AddAccelerator((VirtualKey)188, VirtualKeyModifiers.Control, () => Navigate("Settings"));
        AddAccelerator(VirtualKey.Left, VirtualKeyModifiers.Menu, GoBack);
        AddAccelerator(VirtualKey.GoBack, VirtualKeyModifiers.None, GoBack);

        RootGrid.Loaded += async (_, _) => await StartAsync();
        AppWindow.Closing += AppWindow_Closing;
    }

    private void AddAccelerator(VirtualKey key, VirtualKeyModifiers modifiers, Action action)
    {
        var accelerator = new KeyboardAccelerator { Key = key, Modifiers = modifiers };
        accelerator.Invoked += (_, args) => { action(); args.Handled = true; };
        RootGrid.KeyboardAccelerators.Add(accelerator);
    }

    private bool _started;

    private async Task StartAsync()
    {
        if (_started) return;
        _started = true;
        BusyBar.Visibility = Visibility.Visible;
        try { await _state.InitializeAsync(); }
        catch (Exception ex)
        {
            Services.DiagnosticsService.Log("Startup", "The vault could not be loaded", ex);
            await Ui.MessageAsync("The library could not be opened", ex.Message);
        }
        BusyBar.Visibility = Visibility.Collapsed;
        DriveStatusText.Text = _state.DriveStatus;
        Navigate(_state.Preferences.Get("LastSection", "Home"));
        if (_state.Vault.LoadWarning.Length > 0) await Ui.MessageAsync("Vault recovery", _state.Vault.LoadWarning);
        if (_state.Drive.Connected) _ = _state.SyncDriveAsync(silent: true);
    }

    // ---- Navigation ---------------------------------------------------------

    /// <summary>Opens a top-level section by its tag: Home, Games, Movies, Series, Plex, Downloads, Petrol or Settings.</summary>
    public void Navigate(string section, string? view = null)
    {
        if (section is "Overview") section = "Home";
        if (section is "BiglyBT") section = "Downloads";
        var (page, parameter) = section switch
        {
            "Games" or "Movies" or "Series" => (typeof(LibraryPage), (object)new LibraryRequest(section, view)),
            "Plex" => (typeof(PlexPage), (object)""),
            "Downloads" => (typeof(DownloadsPage), ""),
            "Petrol" => (typeof(PetrolPage), ""),
            "Settings" => (typeof(SettingsPage), ""),
            _ => (typeof(HomePage), "")
        };
        if (page == typeof(HomePage)) section = "Home";
        if (CurrentSection == section && view is null && ContentFrame.Content is not DetailPage) return;
        SearchBox.Text = "";
        _state.SetSearch("");
        _state.Preferences.Set("LastSection", section);
        ContentFrame.Navigate(page, parameter, new EntranceNavigationTransitionInfo());
    }

    /// <summary>Opens the detail page for one title.</summary>
    public void ShowDetails(LibraryRow row) => ContentFrame.Navigate(typeof(DetailPage), row, new DrillInNavigationTransitionInfo());

    public void GoBack()
    {
        if (ContentFrame.CanGoBack) ContentFrame.GoBack();
    }

    private string CurrentSection => ContentFrame.Content switch
    {
        LibraryPage library => library.Section,
        PlexPage => "Plex",
        DownloadsPage => "Downloads",
        PetrolPage => "Petrol",
        SettingsPage => "Settings",
        HomePage => "Home",
        _ => ""
    };

    private void Nav_ItemInvoked(NavigationView sender, NavigationViewItemInvokedEventArgs args)
    {
        // Invoked rather than SelectionChanged, so choosing the section a title was
        // opened from returns to its list even though the selection did not change.
        if (args.IsSettingsInvoked) Navigate("Settings");
        else if (args.InvokedItemContainer?.Tag is string tag) Navigate(tag);
    }

    /// <summary>Empties the search box and the filter it drives.</summary>
    public void ClearSearch()
    {
        SearchBox.Text = "";
        _searchTimer.Stop();
        _state.SetSearch("");
    }

    private void ContentFrame_Navigated(object sender, NavigationEventArgs e)
    {
        AppTitleBar.IsBackButtonEnabled = ContentFrame.CanGoBack;
        var section = CurrentSection;
        // Search filters the list on screen, so it is only offered where there is one.
        SearchBox.IsEnabled = section is "Games" or "Movies" or "Series" or "Plex";
        SearchBox.PlaceholderText = section switch
        {
            "Games" => "Search games (Ctrl+K)", "Movies" => "Search movies (Ctrl+K)",
            "Series" => "Search TV shows (Ctrl+K)", "Plex" => "Search Plex (Ctrl+K)", _ => "Search (Ctrl+K)"
        };
        if (section.Length == 0) return;   // A detail page keeps its parent selected.
        Nav.SelectedItem = section == "Settings"
            ? Nav.SettingsItem
            : Nav.MenuItems.OfType<NavigationViewItem>().FirstOrDefault(item => (string)item.Tag == section);
    }

    private void TitleBar_BackRequested(TitleBar sender, object args) => GoBack();
    private void TitleBar_PaneToggleRequested(TitleBar sender, object args) => Nav.IsPaneOpen = !Nav.IsPaneOpen;

    private void RootGrid_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        // The mouse's back thumb button.
        if (!e.GetCurrentPoint(RootGrid).Properties.IsXButton1Pressed) return;
        GoBack();
        e.Handled = true;
    }

    private void SearchBox_TextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        _searchTimer.Stop();
        _searchTimer.Start();
    }

    // ---- Status -------------------------------------------------------------

    private void ShowToast(string message, InfoBarSeverity severity, bool offerUndo)
    {
        _toastTimer.Stop();
        Toast.Message = message;
        Toast.Severity = severity;
        UndoButton.Visibility = Ui.Show(offerUndo && _state.Actions.CanUndo);
        Toast.IsOpen = true;
        // Errors stay until dismissed; everything else clears itself.
        if (severity == InfoBarSeverity.Error) return;
        _toastTimer.Interval = TimeSpan.FromSeconds(offerUndo ? 9 : 5);
        _toastTimer.Start();
    }

    private async void Undo_Click(object sender, RoutedEventArgs e)
    {
        Toast.IsOpen = false;
        var undone = false;
        await _state.RunAsync(async () => undone = await _state.Actions.UndoAsync(), "The change could not be undone.");
        if (undone) _state.Notify("The previous change was undone.", InfoBarSeverity.Success);
    }

    private async void Sync_Click(object sender, RoutedEventArgs e)
    {
        SyncButton.IsEnabled = false;
        try
        {
            if (_state.Drive.Connected) await _state.SyncDriveAsync(silent: false);
            if (ContentFrame.Content is IRefreshablePage page) await _state.RunAsync(page.RefreshAsync, "Refresh failed.");
            else if (!_state.Drive.Connected) _state.Notify("Everything is saved on this PC. Connect Google Drive in Settings to sync.");
        }
        finally { SyncButton.IsEnabled = true; }
    }

    // ---- Theme --------------------------------------------------------------

    /// <summary>Applies "light", "dark" or "system" to the whole window, title bar buttons included.</summary>
    public void ApplyTheme(string theme)
    {
        var element = theme switch { "light" => ElementTheme.Light, "system" => ElementTheme.Default, _ => ElementTheme.Dark };
        RootGrid.RequestedTheme = element;
        AppWindow.TitleBar.PreferredTheme = element switch
        {
            ElementTheme.Light => TitleBarTheme.Light,
            ElementTheme.Dark => TitleBarTheme.Dark,
            _ => TitleBarTheme.UseDefaultAppMode
        };
    }

    // ---- Window placement ---------------------------------------------------

    /* Sizes are stored in physical pixels under their own keys: the previous WPF
       edition stored device-independent units, which would open at the wrong size
       on a scaled display if they were read back here. */
    private void RestorePlacement()
    {
        var preferences = _state.Preferences;
        var scale = GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(this)) / 96d;
        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.PreferredMinimumWidth = (int)(900 * scale);
            presenter.PreferredMinimumHeight = (int)(600 * scale);
        }
        var width = (int)preferences.GetDouble("WinWidth", 1440 * scale);
        var height = (int)preferences.GetDouble("WinHeight", 900 * scale);
        var work = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Primary).WorkArea;
        width = Math.Clamp(width, (int)(900 * scale), Math.Max((int)(900 * scale), work.Width));
        height = Math.Clamp(height, (int)(600 * scale), Math.Max((int)(600 * scale), work.Height));
        AppWindow.Resize(new SizeInt32(width, height));

        var left = preferences.GetDouble("WinLeft", double.NaN);
        var top = preferences.GetDouble("WinTop", double.NaN);
        if (!double.IsNaN(left) && !double.IsNaN(top))
        {
            // Only honour a position that still lands on a connected display, so a
            // window saved on a monitor that is now unplugged does not open offscreen.
            var target = DisplayArea.GetFromRect(new RectInt32((int)left, (int)top, width, height), DisplayAreaFallback.None);
            if (target is not null) AppWindow.Move(new PointInt32((int)left, (int)top));
            else CenterOn(work, width, height);
        }
        else CenterOn(work, width, height);
        if (preferences.GetBool("WinMaximized", false)) (AppWindow.Presenter as OverlappedPresenter)?.Maximize();
    }

    private void CenterOn(RectInt32 work, int width, int height) =>
        AppWindow.Move(new PointInt32(work.X + Math.Max(0, (work.Width - width) / 2), work.Y + Math.Max(0, (work.Height - height) / 2)));

    private void SavePlacement()
    {
        var preferences = _state.Preferences;
        var state = (AppWindow.Presenter as OverlappedPresenter)?.State ?? OverlappedPresenterState.Restored;
        preferences.SetBool("WinMaximized", state == OverlappedPresenterState.Maximized);
        // A maximised or minimised window keeps the size it had before, which is what should come back.
        if (state != OverlappedPresenterState.Restored) return;
        preferences.SetDouble("WinWidth", AppWindow.Size.Width);
        preferences.SetDouble("WinHeight", AppWindow.Size.Height);
        preferences.SetDouble("WinLeft", AppWindow.Position.X);
        preferences.SetDouble("WinTop", AppWindow.Position.Y);
    }

    private async void AppWindow_Closing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_closing) return;
        SavePlacement();
        // Nothing waiting to go up means nothing to wait for — close immediately.
        if (!_state.Drive.Connected || !_state.DriveWorkPending) return;
        args.Cancel = true;
        _closing = true;
        _state.StopDriveTimer();
        /* Local data is already durable and the next launch converges, so the
           window must never feel stuck behind an unreachable Drive. */
        try { await Task.WhenAny(_state.FlushDriveAsync(), Task.Delay(TimeSpan.FromSeconds(3))); }
        catch { /* Closing regardless. */ }
        Close();
    }
}
