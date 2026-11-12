using System.Globalization;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using SinuGameVault.Models;
using SinuGameVault.Services;

namespace SinuGameVault.Pages;

/// <summary>Which section to open, and optionally which of its lists.</summary>
public sealed record LibraryRequest(string Section, string? View = null);

/// <summary>A headed block of rows: "Active rentals", "2025", "Already released"…</summary>
public sealed class RowGroup
{
    public RowGroup(string key, IEnumerable<LibraryRow> rows)
    {
        Key = key;
        Rows = rows.ToList();
    }

    public string Key { get; }
    public List<LibraryRow> Rows { get; }
    public string Total => Rows.Count.ToString(CultureInfo.InvariantCulture);
}

/// <summary>
/// The Games, Movies and TV Shows pages. One page serves all three because they
/// are the same idea — four ways to browse (Library, in progress, Discover,
/// Upcoming), a list picker within each, then sort and filter.
/// </summary>
public sealed partial class LibraryPage : Page, IRefreshablePage
{
    private sealed record ViewDefinition(string Key, string Label, string Family);

    private static readonly (string Key, string Label, string Glyph)[] FamilyDefinitions =
        [("library", "Library", ""), ("active", "", ""), ("discover", "Discover", ""), ("upcoming", "Upcoming", "")];

    private static readonly Dictionary<string, ViewDefinition[]> Views = new()
    {
        ["Games"] =
        [
            new("rentals", "Rentals", "library"), new("subscriptionGames", "Subscriptions", "library"), new("purchasedGames", "Purchased", "library"),
            new("queue", "Rental queue", "library"), new("played", "Completed", "library"),
            new("playing", "Now playing", "active"), new("catalogExtra", "Discover", "discover"), new("upcoming", "Upcoming releases", "upcoming")
        ],
        ["Movies"] =
        [
            new("watchlist", "My watchlist", "library"), new("watched", "Watched", "library"), new("hidden", "Not interested", "library"),
            new("watching", "Watching", "active"),
            new("relhw", "Popular now", "discover"), new("bluray", "New on Blu-ray", "discover"), new("mlott", "Malayalam OTT", "discover"),
            new("uphw", "Coming soon", "upcoming"), new("mlup", "Coming to Malayalam OTT", "upcoming")
        ],
        ["Series"] =
        [
            new("watchlist", "My watchlist", "library"), new("watched", "Watched", "library"), new("hidden", "Not interested", "library"),
            new("watching", "Watching", "active"),
            new("seriesnew", "New episodes", "discover"), new("enseries", "English", "discover"), new("mlseries", "Malayalam", "discover"),
            new("taseries", "Tamil", "discover"), new("hiseries", "Hindi", "discover"),
            new("seriesupcoming", "Upcoming shows", "upcoming")
        ]
    };

    private readonly AppState _state = AppState.Current;
    private readonly Dictionary<string, string> _viewBySection = [];
    private bool _building;
    private bool _subscribed;
    private string _view = "rentals";
    private string _renderedKey = "";
    private string _renderedSignature = "";
    private int _total;

    public string Section { get; private set; } = "Games";

    private bool IsGames => Section == "Games";
    private bool IsMovies => Section == "Movies";
    private ViewDefinition[] SectionViews => Views[Section];
    private ViewDefinition CurrentView => SectionViews.FirstOrDefault(view => view.Key == _view) ?? SectionViews[0];
    private bool IsFeed => IsGames ? _view is "catalogExtra" or "upcoming" : LibraryReader.IsCatalog(_view);

    public LibraryPage()
    {
        InitializeComponent();
        CompactToggle.IsChecked = _state.Preferences.GetBool("CompactCards", false);
        ListToggle.IsChecked = _state.Preferences.GetBool("ListView", false);
        ApplyLayout();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        var request = e.Parameter as LibraryRequest ?? new LibraryRequest("Games");
        if (Section != request.Section) _renderedKey = "";
        Section = request.Section;
        var remembered = request.View ?? _viewBySection.GetValueOrDefault(Section) ?? _state.Preferences.Get("View." + Section, SectionViews[0].Key);
        _view = SectionViews.Any(view => view.Key == remembered) ? remembered : SectionViews[0].Key;
        BuildChrome();
        Subscribe(true);
        Reload();
        _ = BackgroundRefreshAsync();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e) => Subscribe(false);

    private void Subscribe(bool on)
    {
        if (on == _subscribed) return;
        _subscribed = on;
        if (on) { _state.LibraryChanged += Reload; _state.SearchChanged += Reload; }
        else { _state.LibraryChanged -= Reload; _state.SearchChanged -= Reload; }
    }

    // ---- Chrome -------------------------------------------------------------

    /// <summary>Rebuilds the heading, the four browse tabs and the list picker for the current section and view.</summary>
    private void BuildChrome()
    {
        _building = true;
        try
        {
            Heading.Text = Section == "Series" ? "TV Shows" : Section;
            AddLabel.Text = IsGames ? (_view == "purchasedGames" ? "Add Steam purchase" : "Add game") : IsMovies ? "Add movie" : "Add TV show";

            Families.Items.Clear();
            foreach (var (key, label, glyph) in FamilyDefinitions)
            {
                var text = key == "active" ? (IsGames ? "Now playing" : "Watching") : label;
                var item = new SelectorBarItem { Text = text, Tag = key, Icon = new FontIcon { Glyph = glyph } };
                Families.Items.Add(item);
                if (key == CurrentView.Family) Families.SelectedItem = item;
            }

            var siblings = SectionViews.Where(view => view.Family == CurrentView.Family).ToList();
            ViewBox.Items.Clear();
            foreach (var view in siblings)
            {
                var option = new ComboBoxItem { Content = view.Label, Tag = view.Key };
                ViewBox.Items.Add(option);
                if (view.Key == _view) ViewBox.SelectedItem = option;
            }
            ViewBox.Visibility = Ui.Show(siblings.Count > 1);
            PlatformBox.Visibility = Ui.Show(IsGames && _view is "catalogExtra" or "upcoming");
            YearBox.Visibility = Ui.Show(!IsGames);
            GenreBox.Visibility = Ui.Show(!IsGames);

            RefreshCatalogItem.Visibility = Ui.Show(IsFeed);
            AvailabilityItem.Visibility = Ui.Show(IsGames && _view == "queue");
            SubscriptionsItem.Visibility = Ui.Show(IsGames);
            VendorReportItem.Visibility = Ui.Show(IsGames);
        }
        finally { _building = false; }
    }

    private void SelectView(string view)
    {
        _view = view;
        _viewBySection[Section] = view;
        _state.Preferences.Set("View." + Section, view);
        YearToggle.IsChecked = false;
        BuildChrome();
        Reload();
        _ = BackgroundRefreshAsync();
    }

    /// <summary>Jumps to one list in this section, for example after adding a title to it.</summary>
    private void ShowCollection(string collection)
    {
        var key = IsGames ? collection : collection switch
        {
            "watchingMovies" or "watchingSeries" => "watching",
            "watchedMovies" or "watchedSeries" => "watched",
            "hiddenMovies" or "hiddenSeries" => "hidden",
            _ => "watchlist"
        };
        if (key == "rentalHistory") key = "rentals";
        if (SectionViews.Any(view => view.Key == key) && key != _view) SelectView(key);
    }

    private void Families_SelectionChanged(SelectorBar sender, SelectorBarSelectionChangedEventArgs args)
    {
        if (_building || sender.SelectedItem?.Tag is not string family || family == CurrentView.Family) return;
        // Come back to the list last used in that family, or its first one.
        var target = SectionViews.FirstOrDefault(view => view.Family == family && view.Key == _state.Preferences.Get($"View.{Section}.{family}"))
                     ?? SectionViews.First(view => view.Family == family);
        SelectView(target.Key);
    }

    private void ViewBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_building || Ui.SelectedTag(ViewBox) is not { Length: > 0 } key || key == _view) return;
        _state.Preferences.Set($"View.{Section}.{CurrentView.Family}", key);
        SelectView(key);
    }

    private void Filter_Changed(object sender, SelectionChangedEventArgs e) { if (!_building && IsLoaded) Reload(); }
    private void Filter_Clicked(object sender, RoutedEventArgs e) => Reload();
    private void Genre_TextChanged(object sender, TextChangedEventArgs e) { if (!_building && IsLoaded) Reload(); }

    private void Compact_Click(object sender, RoutedEventArgs e)
    {
        _state.Preferences.SetBool("CompactCards", CompactToggle.IsChecked == true);
        ApplyLayout();
    }

    private void ListToggle_Click(object sender, RoutedEventArgs e)
    {
        _state.Preferences.SetBool("ListView", ListToggle.IsChecked == true);
        ApplyLayout();
        _renderedKey = "";
        Reload();
    }

    private bool ShowingList => ListToggle.IsChecked == true;

    private void ApplyLayout()
    {
        Cards.ItemTemplate = (DataTemplate)Resources[CompactToggle.IsChecked == true ? "CompactCardTemplate" : "CardTemplate"];
        CompactToggle.IsEnabled = !ShowingList;
    }

    // ---- Rows ---------------------------------------------------------------

    private void Reload()
    {
        var search = _state.SearchText;
        var sort = Ui.SelectedTag(SortBox, "new");
        var byYear = YearToggle.IsChecked == true;
        var platform = PlatformBox.Visibility == Visibility.Visible ? Ui.SelectedTag(PlatformBox, "ps5") : "";

        IEnumerable<LibraryRow> rows;
        if (IsGames) rows = _state.Reader.Games(_view, platform);
        else
        {
            var all = _state.Reader.Media(IsMovies, _view).ToList();
            PopulateYears(all);
            rows = all;
            var year = Ui.SelectedTag(YearBox);
            var genre = GenreBox.Text.Trim();
            if (year.Length > 0) rows = rows.Where(row => LibraryReader.RowYear(row).ToString(CultureInfo.InvariantCulture) == year);
            if (genre.Length > 0) rows = rows.Where(row => row.Genre.Contains(genre, StringComparison.OrdinalIgnoreCase));
        }
        var unfiltered = rows as ICollection<LibraryRow> ?? rows.ToList();
        _total = unfiltered.Count;
        var sorted = LibraryReader.Sort(
            search.Length == 0 ? unfiltered : unfiltered.Where(row => row.Name.Contains(search, StringComparison.OrdinalIgnoreCase)), _view, sort, byYear);

        var key = $"{Section}|{_view}|{platform}|{search}|{sort}|{byYear}|{Ui.SelectedTag(YearBox)}|{GenreBox.Text}|{ShowingList}";
        var signature = string.Join("\n", sorted.Select(row => $"{row.Collection}|{row.Id}|{row.Name}|{row.Date}|{row.DaysText}|{row.Status}|{row.Image}|{row.Rating}|{row.Vendor}|{row.Cost}"));
        UpdateSummary(sorted.Count, search);
        // Nothing visible changed: leave the list alone so the user keeps their place.
        if (key == _renderedKey && signature == _renderedSignature) return;
        var sameView = key == _renderedKey;
        _renderedKey = key;
        _renderedSignature = signature;

        object source = sorted;
        if (sorted.Count > 0 && (byYear || LibraryReader.IsGrouped(_view) && sorted.Any(row => row.GroupName.Length > 0)))
        {
            var groups = byYear
                ? sorted.GroupBy(row => row.YearGroup).Select(group => new RowGroup(group.Key, group))
                : sorted.GroupBy(row => row.GroupName).OrderBy(group => LibraryReader.GroupOrder(group.Key)).Select(group => new RowGroup(group.Key.Length > 0 ? group.Key : "Other", group));
            source = new CollectionViewSource { IsSourceGrouped = true, ItemsPath = new PropertyPath(nameof(RowGroup.Rows)), Source = groups.ToList() }.View;
        }

        ListViewBase active = ShowingList ? Rows : Cards;
        ListViewBase idle = ShowingList ? Cards : Rows;
        idle.ItemsSource = null;
        idle.Visibility = Visibility.Collapsed;
        active.Visibility = Ui.Show(sorted.Count > 0);
        // A background change to the list on screen (a sync, an availability check)
        // must not throw the user back to the top.
        var scroll = sameView ? FindScrollViewer(active) : null;
        var offset = scroll?.VerticalOffset ?? 0;
        active.ItemsSource = source;
        if (scroll is not null && offset > 0)
            DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, () => scroll.ChangeView(null, offset, null, disableAnimation: true));
    }

    private void UpdateSummary(int shown, string search)
    {
        var noun = IsGames ? "game" : IsMovies ? "movie" : "show";
        CountText.Text = shown == _total
            ? $"{CurrentView.Label}  ·  {shown} {noun}{(shown == 1 ? "" : "s")}"
            : $"{CurrentView.Label}  ·  {shown} of {_total} {noun}s";
        Empty.Visibility = Ui.Show(shown == 0);
        if (shown > 0) return;
        var filtered = search.Length > 0 || GenreBox.Text.Trim().Length > 0 || Ui.SelectedTag(YearBox).Length > 0;
        var missingKey = IsFeed && (IsGames ? _state.Catalog.RawgKey.Length == 0 : _state.Catalog.TmdbKey.Length == 0);
        if (filtered)
        {
            EmptyTitle.Text = "No matches";
            EmptyText.Text = "Nothing in this list matches the search and filters.";
            EmptyAction.Content = "Clear filters";
            EmptyAction.Tag = "clear";
        }
        else if (missingKey)
        {
            EmptyTitle.Text = "Connect a catalog";
            EmptyText.Text = IsGames
                ? "Discover and Upcoming come from RAWG. Save a RAWG API key in Settings to fill this list."
                : "Discover and Upcoming come from TMDB. Save a TMDB API key in Settings to fill this list.";
            EmptyAction.Content = "Open Settings";
            EmptyAction.Tag = "settings";
        }
        else if (IsFeed)
        {
            EmptyTitle.Text = "Nothing loaded yet";
            EmptyText.Text = "This list fills from the online catalog.";
            EmptyAction.Content = "Refresh catalog";
            EmptyAction.Tag = "refresh";
        }
        else
        {
            EmptyTitle.Text = "Nothing here yet";
            EmptyText.Text = $"Titles you add to {CurrentView.Label.ToLowerInvariant()} appear here.";
            EmptyAction.Content = AddLabel.Text;
            EmptyAction.Tag = "add";
        }
    }

    private void PopulateYears(IReadOnlyCollection<LibraryRow> rows)
    {
        var selected = Ui.SelectedTag(YearBox);
        var currentYear = DateTime.Today.Year;
        var allowFuture = LibraryReader.AllowsFutureYears(_view);
        var maxYear = allowFuture ? currentYear + 2 : currentYear;
        /* Always offer the recent years even before a title with that year has been
           fetched, so the filter keeps working as the years roll over. Only the
           Upcoming feeds extend into future years. */
        var years = rows.Select(LibraryReader.RowYear).Where(year => year > 1900)
            .Concat(Enumerable.Range(currentYear - 1, allowFuture ? 4 : 2))
            .Where(year => year <= maxYear).Distinct().OrderByDescending(year => year).ToList();
        if (YearBox.Items.Count == years.Count + 1 && YearBox.Items.OfType<ComboBoxItem>().Skip(1).Select(item => item.Tag).SequenceEqual(years.Select(year => (object)year.ToString(CultureInfo.InvariantCulture)))) return;
        var was = _building;
        _building = true;
        YearBox.Items.Clear();
        YearBox.Items.Add(new ComboBoxItem { Content = "All years", Tag = "" });
        foreach (var year in years) YearBox.Items.Add(new ComboBoxItem { Content = year.ToString(CultureInfo.InvariantCulture), Tag = year.ToString(CultureInfo.InvariantCulture) });
        if (!Ui.SelectTag(YearBox, selected)) YearBox.SelectedIndex = 0;
        _building = was;
    }

    private static ScrollViewer? FindScrollViewer(DependencyObject root)
    {
        for (var index = 0; index < VisualTreeHelper.GetChildrenCount(root); index++)
        {
            var child = VisualTreeHelper.GetChild(root, index);
            if (child is ScrollViewer viewer) return viewer;
            if (FindScrollViewer(child) is { } nested) return nested;
        }
        return null;
    }

    // ---- Background refreshes ----------------------------------------------

    /// <summary>Quietly brings the view on screen up to date: stale feeds, rental availability, Plex progress.</summary>
    private async Task BackgroundRefreshAsync()
    {
        var section = Section;
        var view = _view;
        try
        {
            if (IsFeed && await _state.Actions.RefreshCatalogAsync(section, view, force: false)) _state.RaiseLibraryChanged();
            if (section == "Games" && view == "queue") await _state.Actions.RefreshQueueAvailabilityAsync(force: false);
            if (section != "Games")
            {
                await _state.SyncPlexContinueAsync();
            }
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Catalog", "Background refresh skipped", ex);
        }
    }

    /// <summary>Ctrl+R on this page: reload the feed on screen from its source.</summary>
    public async Task RefreshAsync()
    {
        if (IsFeed)
        {
            if (await _state.Actions.RefreshCatalogAsync(Section, _view, force: true))
            {
                _state.RaiseLibraryChanged();
                _state.Notify($"{CurrentView.Label} refreshed.", InfoBarSeverity.Success);
            }
        }
        else if (IsGames && _view == "queue")
        {
            var count = await _state.Actions.RefreshQueueAvailabilityAsync(force: true);
            _state.Notify(count == 0 ? "The rental queue is empty." : $"Rental availability checked for {count} game{(count == 1 ? "" : "s")}.", InfoBarSeverity.Success);
        }
    }

    // ---- Commands -----------------------------------------------------------

    private void Rows_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is LibraryRow row) LibraryCommands.Open(row);
    }

    private void ListRow_ContextRequested(UIElement sender, ContextRequestedEventArgs args)
    {
        if (sender is not FrameworkElement { DataContext: LibraryRow row } element) return;
        var menu = LibraryCommands.CardMenu(row);
        if (args.TryGetPosition(element, out var point)) menu.ShowAt(element, point);
        else menu.ShowAt(element);
        args.Handled = true;
    }

    private async void Add_Click(object sender, RoutedEventArgs e)
    {
        var added = await LibraryCommands.AddAsync(Section, IsGames ? _view : "");
        if (added is not null) ShowCollection(added);
    }

    private async void RefreshCatalog_Click(object sender, RoutedEventArgs e) => await _state.RunAsync(RefreshAsync, "The catalog could not be refreshed.");
    private async void CheckAvailability_Click(object sender, RoutedEventArgs e) => await _state.RunAsync(RefreshAsync, "Rental availability could not be checked.");
    private async void ManageSubscriptions_Click(object sender, RoutedEventArgs e) => await LibraryCommands.ManageSubscriptionsAsync();
    private async void VendorReport_Click(object sender, RoutedEventArgs e) => await LibraryCommands.ShowVendorReportAsync();

    private async void EmptyAction_Click(object sender, RoutedEventArgs e)
    {
        switch (EmptyAction.Tag as string)
        {
            case "clear":
                _building = true;
                GenreBox.Text = "";
                if (YearBox.Items.Count > 0) YearBox.SelectedIndex = 0;
                _building = false;
                if (_state.SearchText.Length > 0) App.Window?.ClearSearch(); else Reload();
                break;
            case "settings": App.Window?.Navigate("Settings"); break;
            case "refresh": await _state.RunAsync(RefreshAsync, "The catalog could not be refreshed."); break;
            default: Add_Click(sender, e); break;
        }
    }
}
