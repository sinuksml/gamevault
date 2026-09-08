using System.Globalization;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using SinuGameVault.Models;

namespace SinuGameVault;

public partial class MainWindow
{
    private bool _buildingMediaFilters;
    private string _shownSection = "";
    private string _renderedViewKey = "";
    private List<string> _renderedRows = [];
    private readonly Dictionary<string, (double Offset, int Count)> _viewPositions = [];
    private bool _compactCards;

    private static string MediaFamily(string mode) => mode switch
    {
        "watchlist" or "watched" or "hidden" => "library",
        "watching" => "watching",
        "uphw" or "mlup" or "seriesupcoming" => "upcoming",
        _ => "discover"
    };

    private void GamePlatform_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (!IsLoaded || _gameCollection is not ("upcoming" or "catalogExtra")) return;
        CloseDetails();
        _upcomingPlatform = (GamePlatformBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "ps5";
        RefreshGames();
    }

    private void MediaBrowse_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_buildingMediaFilters || !IsLoaded || MediaBrowseBox.SelectedItem is not ComboBoxItem option) return;
        CloseDetails();
        SetCategoryView(false);
        _mediaMode = option.Tag?.ToString() ?? "watchlist";
        RefreshMedia();
        _ = EnsureCurrentCatalogAsync();
    }

    private void OpenActionsMenu_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { ContextMenu: { } menu } button) return;
        menu.PlacementTarget = button;
        menu.Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom;
        menu.IsOpen = true;
    }

    private void RefreshHomeContinue()
    {
        var playing = ReadCollection("playing").Concat(ReadCollection("rentals"))
            .GroupBy(row => NormalizedTitle(row.Name)).Select(group => group.First()).Take(3).ToList();
        var watching = ReadCollection("watchingMovies").Concat(ReadCollection("watchingSeries")).Take(3).ToList();
        var upcoming = ReadCollection("upcoming").Concat(ReadNativeCatalog("movies", "uphw"))
            .Concat(ReadNativeCatalog("series", "seriesupcoming")).Where(row => row.DaysLeft is >= 0)
            .OrderBy(row => row.DaysLeft).Take(3).ToList();
        HomeContinuePlaying.ItemsSource = playing;
        HomeContinueWatching.ItemsSource = watching;
        HomeUpcoming.ItemsSource = upcoming;
        HomePlayingEmpty.Visibility = playing.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        HomeWatchingEmpty.Visibility = watching.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        HomeUpcomingEmpty.Visibility = upcoming.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private void HomeWatching_Click(object sender, RoutedEventArgs e)
    {
        _previousSection = _section;
        _section = "Movies";
        _mediaMode = "watching";
        ShowSection();
    }

    private void ConfigureExperience()
    {
        _compactCards = _preferences.GetBool("CompactCards", false);
        foreach (var button in RailNavigation.Children.OfType<Button>().Concat(RailFooter.Children.OfType<Button>()))
        {
            if (button.Content is not StackPanel stack || stack.Children.Count == 0 || stack.Children[0] is not TextBlock icon) continue;
            icon.FontFamily = new FontFamily("Segoe MDL2 Assets");
            icon.FontSize = 18;
            icon.Width = 30;
            icon.Text = button.Tag?.ToString() switch
            {
                "Overview" => "\uE80F", "Games" => "\uE7FC", "Movies" => "\uE714", "Series" => "\uE573",
                "Plex" => "\uE768", "BiglyBT" => "\uE896", "Petrol" => "\uE7C0", _ => "\uE713"
            };
        }
        VersionText.Text = $"Windows {AppVersion}";
        UpdateTileSize(Width);
    }

    private void UpdateTileSize(double width)
    {
        var available = Math.Max(520, width - RailColumn.Width.Value - 76);
        var columns = Math.Max(2, (int)Math.Floor(available / (_compactCards ? 214 : 280)));
        Resources["LibraryTileWidth"] = Math.Min(_compactCards ? 236 : 310, Math.Floor(available / columns) - 16);
        var compact = width < 1500;
        Grid.SetRow(GameToolbarOptions, compact ? 1 : 0);
        Grid.SetColumn(GameToolbarOptions, compact ? 0 : 1);
        Grid.SetRow(MediaToolbarOptions, 1);
        Grid.SetColumn(MediaToolbarOptions, 0);
        GameToolbarOptions.Margin = new Thickness(compact ? 0 : 18, compact ? 4 : 0, 0, 8);
        MediaToolbarOptions.Margin = new Thickness(0, 4, 0, 8);
        FeaturedTitleText.Visibility = Visibility.Collapsed;
        DriveHeaderStatus.MaxWidth = 150;
        DriveHeaderStatus.TextTrimming = TextTrimming.CharacterEllipsis;
    }

    private void LibraryEmpty_Click(object sender, RoutedEventArgs e)
    {
        if (SearchBox.Text.Length > 0 || MediaGenreBox.Text.Length > 0 || MediaYearBox.SelectedIndex > 0)
        {
            SearchBox.Clear();
            MediaGenreBox.Clear();
            MediaYearBox.SelectedIndex = 0;
            if (_section == "Games") RefreshGames(); else RefreshMedia();
            return;
        }
        FindOnline_Click(sender, e);
    }

    private void Density_Click(object sender, RoutedEventArgs e)
    {
        _compactCards = !_compactCards;
        _preferences.SetBool("CompactCards", _compactCards);
        UpdateTileSize(ActualWidth);
        StatusText.Text = _compactCards ? "Compact cards" : "Comfortable cards";
    }

    // Offline layout harness: never raises Loaded or accesses remote services.
    public FrameworkElement PrepareLayoutPreview(string section, bool light, double width, IEnumerable<LibraryRow> rows)
    {
        _section = section;
        _theme = light ? "light" : "dark";
        ApplyTheme();
        foreach (var page in new FrameworkElement[] { OverviewPage, GamesPage, MediaPage, PlexPage, BiglyPage, PetrolPage, SettingsPage, PlaceholderPage, DetailsPage })
            page.Visibility = Visibility.Collapsed;
        PageTitle.Text = section == "Series" ? "TV Shows" : section;
        PageSubtitle.Text = "Your personal library";
        UpdateRailSelection();
        UpdateTileSize(width);
        LibrarySectionBox.SelectedIndex = 0;
        GameSortBox.SelectedIndex = 0;
        MediaSortBox.SelectedIndex = 0;
        LibraryEmptyState.Visibility = Visibility.Collapsed;
        switch (section)
        {
            case "Games": GamesPage.Visibility = Visibility.Visible; StyleGameTabs(); SetRows(rows); break;
            case "Movies": case "Series": MediaPage.Visibility = Visibility.Visible; BuildMediaTabs(); SetRows(rows); break;
            case "Overview": OverviewPage.Visibility = Visibility.Visible; RefreshDashboard(); break;
            case "Plex": PlexPage.Visibility = Visibility.Visible; PlexSetupPanel.Visibility = Visibility.Collapsed; PlexLibraryScroll.Visibility = Visibility.Visible; PlexCards.ItemsSource = rows; break;
            case "Details":
                DetailsPage.Visibility = Visibility.Visible;
                DetailTitle.Text = "A long title with enough words to verify wrapping";
                DetailType.Text = "GAME";
                DetailMeta.Text = "Adventure | PC, Xbox | 06-April-2026";
                DetailRating.Text = "Rating 8.5";
                DetailSynopsis.Text = "Sample overview text used to check the native detail layout without accessing your library or online integrations.";
                DetailOverview.Text = "Story content is presented in a readable column. Actions wrap onto another line instead of requiring horizontal scrolling.";
                DetailSynopsisSection.Visibility = Visibility.Visible;
                DetailStorySection.Visibility = Visibility.Visible;
                break;
            case "BiglyBT": BiglyPage.Visibility = Visibility.Visible; break;
            case "Settings": SettingsPage.Visibility = Visibility.Visible; break;
        }
        return (FrameworkElement)Content;
    }
}
