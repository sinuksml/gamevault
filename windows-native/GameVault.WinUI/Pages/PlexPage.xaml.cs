using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SinuGameVault.Models;
using SinuGameVault.Services;

namespace SinuGameVault.Pages;

/// <summary>Browses the Plex server and mirrors its watch progress into the library.</summary>
public sealed partial class PlexPage : Page, IRefreshablePage
{
    public const string TokenGuide = "https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/";

    private readonly AppState _state = AppState.Current;
    private List<LibraryRow> _rows = [];
    private string _mode = "continue";
    private int _load;

    public PlexPage() => InitializeComponent();

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        _state.SearchChanged += ApplySearch;
        // Coming back from a title keeps the list; anything else reloads it.
        if (e.NavigationMode == NavigationMode.Back && _rows.Count > 0) { ApplySearch(); return; }
        await LoadAsync(force: false);
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e) => _state.SearchChanged -= ApplySearch;

    public Task RefreshAsync() => LoadAsync(force: true);

    private async Task LoadAsync(bool force)
    {
        var connected = _state.Plex.Connected;
        Setup.Visibility = Ui.Show(!connected);
        Cards.Visibility = Ui.Show(connected);
        Modes.IsEnabled = connected;
        RefreshButton.IsEnabled = connected;
        if (!connected)
        {
            SetupTitle.Text = "Connect your Plex server";
            StatusText.Text = "Not connected";
            return;
        }

        var load = ++_load;
        var mode = _mode;
        Busy.IsActive = true;
        StatusText.Text = "Loading from Plex…";
        try
        {
            var items = mode == "continue"
                ? await _state.Plex.ContinueWatchingAsync(force)
                : await _state.Plex.LibraryAsync(mode == "recent" ? "all" : mode, force);
            if (load != _load) return;   // A newer request replaced this one.
            if (mode == "recent") items = items.Take(50).ToList();
            _rows = items.Select(item => _state.Reader.Row(LibraryActions.PlexRecord(item), "plex")).OfType<LibraryRow>().ToList();
            ApplySearch();
            await _state.Actions.SyncPlexAsync(items);
        }
        catch (Exception ex)
        {
            if (load != _load) return;
            DiagnosticsService.Log("Plex", "The Plex library could not be loaded", ex);
            _rows = [];
            Cards.ItemsSource = null;
            Cards.Visibility = Visibility.Collapsed;
            Setup.Visibility = Visibility.Visible;
            SetupTitle.Text = "Plex could not be reached";
            StatusText.Text = ex.Message;
        }
        finally
        {
            if (load == _load) Busy.IsActive = false;
        }
    }

    private void ApplySearch()
    {
        var search = _state.SearchText;
        var shown = search.Length == 0 ? _rows : _rows.Where(row => row.Name.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();
        Cards.ItemsSource = shown;
        StatusText.Text = shown.Count == _rows.Count
            ? $"{_rows.Count} title{(_rows.Count == 1 ? "" : "s")}"
            : $"{shown.Count} of {_rows.Count} titles";
    }

    private async void Modes_SelectionChanged(SelectorBar sender, SelectorBarSelectionChangedEventArgs args)
    {
        if (!IsLoaded || sender.SelectedItem?.Tag is not string mode || mode == _mode) return;
        _mode = mode;
        await LoadAsync(force: false);
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e) => await LoadAsync(force: true);

    private void Cards_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is LibraryRow row) LibraryCommands.Open(row);
    }

    private void OpenSettings_Click(object sender, RoutedEventArgs e) => App.Window?.Navigate("Settings");
    private void TokenHelp_Click(object sender, RoutedEventArgs e) => Ui.Open(TokenGuide);
}
