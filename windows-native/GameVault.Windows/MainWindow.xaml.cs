using Microsoft.Win32;
using SinuGameVault.Models;
using SinuGameVault.Services;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Globalization;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Threading;
using System.ComponentModel;
using System.Windows.Input;
using System.Windows.Media;

namespace SinuGameVault;

public partial class MainWindow : Window
{
    private readonly VaultRepository _vault = new();
    private readonly UserPreferences _preferences;
    private readonly DriveService _drive;
    private readonly PlexService _plex = new();
    private readonly BiglyBtService _bigly = new();
    private readonly CatalogService _catalog = new();
    private readonly AvailabilityService _availability = new();
    private List<LibraryRow> _rows = [];
    private readonly ObservableCollection<LibraryRow> _plexRows = [];
    private readonly ObservableCollection<TorrentRow> _torrentRows = [];
    private readonly ObservableCollection<TorrentHistoryRow> _torrentHistoryRows = [];
    private readonly ObservableCollection<MonthlySpendRow> _monthlySpendRows = [];
    /* Each sync downloads, merges and re-uploads the whole vault, so a 2.5 second
       debounce meant a burst of that work while the user was still typing. This
       waits for editing to settle instead; closing still flushes what is pending. */
    private readonly DispatcherTimer _driveSyncTimer = new() { Interval = TimeSpan.FromSeconds(20) };
    private readonly DispatcherTimer _biglyRefreshTimer = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly DispatcherTimer _searchDebounceTimer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    private JsonObject? _undoRoot;
    private bool _syncingDrive;
    private bool _driveSyncPending;
    private string _section = "Overview";
    private string _previousSection = "Overview";
    private string _gameCollection = "rentals";
    private string _mediaMode = "watchlist";
    private LibraryRow? _selectedRow;
    private bool _gamesListView;
    private bool _mediaListView;
    private string _plexMode = "continue";
    private string _upcomingPlatform = "all";
    private string _theme = "dark";
    private bool _loadingSettings;
    private bool _refreshingBigly;
    private bool _refreshingQueueAvailability;
    private DateTime _lastBiglyInteraction = DateTime.Now;
    private readonly HashSet<string> _catalogRefreshes = [];
    private bool _closingAfterDriveSync;
    private bool _windowIsClosing;

    public MainWindow()
    {
        InitializeComponent();
        _preferences = new UserPreferences(_vault.StorageFolder);
        _drive = new DriveService(_vault.StorageFolder);
        PlexCards.ItemsSource = _plexRows;
        BiglyGrid.ItemsSource = _torrentRows;
        BiglyHistoryGrid.ItemsSource = _torrentHistoryRows;
        GameSpendChart.ItemsSource = _monthlySpendRows;
        _gamesListView = _preferences.Get("GamesView") == "list";
        _mediaListView = _preferences.Get("MediaView") == "list";
        _theme = _preferences.Get("Theme", "dark");
        _section = _preferences.Get("LastSection", "Overview");
        ApplyViewPreferences();
        ApplyTheme();
        RestoreWindowPlacement();
        _driveSyncTimer.Tick += DriveSyncTimer_Tick;
        _biglyRefreshTimer.Tick += BiglyRefreshTimer_Tick;
        _searchDebounceTimer.Tick += (_, _) =>
        {
            _searchDebounceTimer.Stop();
            if (_section == "Games") RefreshGames();
            else if (_section is "Movies" or "Series") RefreshMedia();
        };
        _vault.Saved += (_, _) => ScheduleDriveSync();
        PreviewMouseDown += BiglyInteraction;
        PreviewMouseUp += Window_PreviewMouseUp;
        PreviewKeyDown += BiglyInteraction;
        Loaded += Window_Loaded;
        Closing += Window_Closing;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync("Loading native vault…", async () => await _vault.LoadAsync());
        VaultPathText.Text = _vault.VaultPath;
        AppVersionText.Text = $"Version {AppVersion} — Native Windows edition";
        VersionText.Text = $"Windows {AppVersion}";
        DriveClientIdBox.Text = _drive.ClientId;
        DriveClientSecretBox.Password = _drive.ClientSecret;
        RawgKeyBox.Password = _catalog.RawgKey;
        TmdbKeyBox.Password = _catalog.TmdbKey;
        OmdbKeyBox.Password = _catalog.OmdbKey;
        PlexUrlBox.Text = _plex.ServerUrl;
        PlexTokenBox.Password = _plex.Token;
        BiglyEndpointBox.Text = _bigly.Endpoint;
        _loadingSettings = true;
        BiglyAutoRemoveBox.IsChecked = !string.Equals(_vault.Root["biglyAutoRemoveCompleted"]?.ToString(), "false", StringComparison.OrdinalIgnoreCase);
        _loadingSettings = false;
        GameSortBox.SelectedIndex = 0;
        MediaSortBox.SelectedIndex = 0;
        UpdateDriveStatus();
        RefreshAll();
        if (_vault.LoadWarning.Length > 0)
            MessageBox.Show(this, _vault.LoadWarning, "Vault recovery", MessageBoxButton.OK, MessageBoxImage.Warning);
        if (_drive.Connected) await SyncDriveAsync(silent: true);
    }

    private async void Window_Closing(object? sender, CancelEventArgs e)
    {
        _windowIsClosing = true;
        SaveWindowPlacement();
        if (_closingAfterDriveSync || !_drive.Connected) return;
        // Nothing waiting to go up means nothing to wait for — close immediately.
        if (!_syncingDrive && !_driveSyncPending && !_driveSyncTimer.IsEnabled) return;
        e.Cancel = true;
        _closingAfterDriveSync = true;
        try
        {
            async Task FinishSyncAsync()
            {
                while (_syncingDrive) await Task.Delay(100);
                await SyncDriveAsync(silent: true);
            }
            // Local data is already durable and the next launch converges, so the
            // window must never feel stuck behind an unreachable Drive.
            await Task.WhenAny(FinishSyncAsync(), Task.Delay(TimeSpan.FromSeconds(3)));
        }
        finally { Close(); }
    }

    private void Navigate_Click(object sender, RoutedEventArgs e)
    {
        CloseDetails();
        _previousSection = _section;
        _section = (sender as Button)?.Tag?.ToString() ?? "Overview";
        _preferences.Set("LastSection", _section);
        ShowSection();
    }

    private void ShowSection()
    {
        UpdateRailSelection();
        if (_section != "BiglyBT") _biglyRefreshTimer.Stop();
        OverviewPage.Visibility = Visibility.Collapsed;
        GamesPage.Visibility = Visibility.Collapsed;
        MediaPage.Visibility = Visibility.Collapsed;
        PlaceholderPage.Visibility = Visibility.Collapsed;
        PlexPage.Visibility = Visibility.Collapsed;
        BiglyPage.Visibility = Visibility.Collapsed;
        SettingsPage.Visibility = Visibility.Collapsed;
        SearchBox.IsEnabled = _section is "Games" or "Movies" or "Series";
        SearchBox.Text = "";

        switch (_section)
        {
            case "Overview":
                PageTitle.Text = "Overview"; PageSubtitle.Text = "Your library at a glance"; OverviewPage.Visibility = Visibility.Visible; RefreshDashboard(); break;
            case "Games":
                PageTitle.Text = "Games"; PageSubtitle.Text = "Rentals, subscriptions, playing, queue and completed games"; GamesPage.Visibility = Visibility.Visible; UpcomingPlatformTabs.Visibility = ShowsPlatformFilter(_gameCollection) ? Visibility.Visible : Visibility.Collapsed; StyleGameTabs(); RefreshGames(); break;
            case "Movies":
                PageTitle.Text = "Movies"; PageSubtitle.Text = "Watchlist, releases, discovery and history"; MediaPage.Visibility = Visibility.Visible; BuildMediaTabs(); RefreshMedia(); _ = EnsureCurrentCatalogAsync(); break;
            case "Series":
                PageTitle.Text = "TV Shows"; PageSubtitle.Text = "Watchlist, new episodes, regional discovery and history"; MediaPage.Visibility = Visibility.Visible; BuildMediaTabs(); RefreshMedia(); _ = EnsureCurrentCatalogAsync(); break;
            case "Plex":
                PageTitle.Text = "Plex"; PageSubtitle.Text = "Continue watching and manage your Shield library"; PlexPage.Visibility = Visibility.Visible; _ = RefreshPlexAsync(); break;
            case "BiglyBT":
                PageTitle.Text = "BiglyBT"; PageSubtitle.Text = "Native download status, controls and history"; BiglyPage.Visibility = Visibility.Visible; _lastBiglyInteraction = DateTime.Now; _biglyRefreshTimer.Start(); _ = RefreshBiglyAsync(); break;
            case "Settings":
                PageTitle.Text = "Settings"; PageSubtitle.Text = "Data migration, backup and native services"; SettingsPage.Visibility = Visibility.Visible; break;
            default:
                PageTitle.Text = _section;
                PageSubtitle.Text = "Native Windows integration";
                PlaceholderTitle.Text = $"{_section} integration";
                PlaceholderMessage.Text = "This module is not available.";
                PlaceholderPage.Visibility = Visibility.Visible;
                break;
        }
        UpdateSectionBackdrop();
    }

    private void UpdateRailSelection()
    {
        /* The rail style paints the active row and its accent bar from this
           attached flag; Tag stays reserved for the navigation target. */
        foreach (var button in RailNavigation.Children.OfType<Button>().Where(button => button.Tag is not null))
            NavState.SetIsActive(button, string.Equals(button.Tag?.ToString(), _section, StringComparison.OrdinalIgnoreCase));
        foreach (var button in RailFooter.Children.OfType<Button>().Where(button => button.Tag is not null))
            NavState.SetIsActive(button, string.Equals(button.Tag?.ToString(), _section, StringComparison.OrdinalIgnoreCase));
    }

    private void UpdateSectionBackdrop()
    {
        IEnumerable<LibraryRow> candidates = _section switch
        {
            "Movies" => ReadNativeCatalog("movies", "uphw"),
            "Series" => ReadNativeCatalog("series", "seriesupcoming"),
            "BiglyBT" => ReadNativeCatalog("movies", "bluray"),
            "Plex" when _plexRows.Count > 0 => _plexRows,
            _ => ReadCollection("upcoming")
        };
        var featured = candidates.Where(row => row.DaysLeft is null or >= 0 || _section == "BiglyBT").OrderBy(row => row.DaysLeft ?? int.MaxValue).FirstOrDefault()
            ?? candidates.FirstOrDefault();
        var image = featured?.Backdrop.Length > 0 ? featured.Backdrop : featured?.Image ?? "";
        SetArtwork(SectionBackdrop, image, 1280);
        FeaturedTitleText.Text = featured is null ? "" : $"Featured: {featured.Name}";
    }

    private void RefreshAll()
    {
        RefreshDashboard();
        ShowSection();
        StatusText.Text = $"Loaded schema {_vault.Root["version"]} · revision {_vault.Root["revision"]}";
    }

    private void RefreshDashboard()
    {
        RentalCount.Text = _vault.Collection("rentals").Count.ToString();
        PlayingCount.Text = (_vault.Collection("playing").Count + _vault.Collection("rentals").Count).ToString();
        WatchlistCount.Text = (_vault.Collection("movieWatchlist").Count + _vault.Collection("seriesWatchlist").Count).ToString();
        CompletedCount.Text = _vault.Collection("played").Count.ToString();
        TotalRentedCount.Text = (_vault.Collection("rentals").Count + _vault.Collection("rentalHistory").Count).ToString();
        var rentalSpent = _vault.Collection("rentals").Concat(_vault.Collection("rentalHistory")).OfType<JsonObject>().Sum(item => Number(item, "cost"));
        var subscriptionSpent = _vault.Collection("subscriptions").OfType<JsonObject>().Sum(item => Number(item, "totalPaid", "cost"));
        RefreshGameSpendChart();
        TotalSpentCount.Text = $"₹{rentalSpent + subscriptionSpent:N0}";

        var dueDates = BuildDueDates();
        DueDatesList.ItemsSource = dueDates;
        var overdue = dueDates.Count(row => row.DaysLeft is < 0);
        var urgent = dueDates.Count(row => row.DaysLeft is >= 0 and <= 3);
        DueDatesSubtitle.Text = dueDates.Count == 0
            ? "No active rentals or subscriptions."
            : overdue > 0
                ? $"{dueDates.Count} tracked · {overdue} overdue"
                : urgent > 0
                    ? $"{dueDates.Count} tracked · {urgent} due within 3 days"
                    : $"{dueDates.Count} tracked · nothing urgent";

        BuildSpendBreakdown();

        // Counts live in their own label so the rail keeps its icon layout.
        GamesRailCount.Text = (_vault.Collection("rentals").Count + _vault.Collection("playing").Count + _vault.Collection("played").Count).ToString();
        MoviesRailCount.Text = (_vault.Collection("movieWatchlist").Count + _vault.Collection("watchingMovies").Count + _vault.Collection("watchedMovies").Count).ToString();
        SeriesRailCount.Text = (_vault.Collection("seriesWatchlist").Count + _vault.Collection("watchingSeries").Count + _vault.Collection("watchedSeries").Count).ToString();

        var activeCount = _vault.Collection("rentals").Count + _vault.Collection("playing").Count;
        HomeSummaryText.Text = activeCount == 0 && dueDates.Count == 0
            ? "Your library is ready. Add or import a title to begin."
            : $"{activeCount} active title{(activeCount == 1 ? "" : "s")} · {dueDates.Count} upcoming date{(dueDates.Count == 1 ? "" : "s")} · {DriveHeaderStatus.Text}.";
    }

    /// <summary>Every active rental return and subscription renewal, soonest first.</summary>
    private List<DueDateRow> BuildDueDates()
    {
        var rows = new List<DueDateRow>();
        foreach (var item in _vault.Collection("rentals").OfType<JsonObject>())
        {
            var name = Text(item, "name", "title");
            if (name.Length == 0) continue;
            var due = RentalReturnDate(item);
            int? days = DateTime.TryParse(due, out var parsed) ? (parsed.Date - DateTime.Today).Days : null;
            var vendor = Text(item, "vendor");
            var cost = Number(item, "cost");
            rows.Add(new DueDateRow
            {
                Title = name, Kind = "Rental return", Vendor = vendor,
                DueText = due.Length > 0 ? DisplayDate(due) : "",
                Cost = cost > 0 ? $"₹{cost:N0}" : "",
                Image = Text(item, "img", "poster", "cover"),
                DaysLeft = days
            });
        }
        foreach (var item in _vault.Collection("subscriptions").OfType<JsonObject>())
        {
            var service = Text(item, "service", "name");
            if (service.Length == 0) continue;
            // Cancelled subscriptions have no upcoming renewal to show.
            if (string.Equals(Text(item, "active"), "false", StringComparison.OrdinalIgnoreCase)) continue;
            var renews = Text(item, "renewsAt", "end", "start");
            int? days = DateTime.TryParse(renews, out var parsed) ? (parsed.Date - DateTime.Today).Days : null;
            var cost = Number(item, "cost", "monthlyCost");
            rows.Add(new DueDateRow
            {
                Title = service, Kind = "Subscription renewal",
                Vendor = Text(item, "provider", "platform"),
                DueText = renews.Length > 0 ? DisplayDate(renews) : "",
                Cost = cost > 0 ? $"₹{cost:N0}" : "",
                Image = Text(item, "img", "poster", "cover"),
                DaysLeft = days
            });
        }
        return rows.OrderBy(row => row.DaysLeft ?? int.MaxValue).ThenBy(row => row.Title).ToList();
    }

    private static readonly string[] SpendPalette =
        ["#4CC9F0", "#6366F1", "#F0616B", "#FFD166", "#5DE2B5", "#C77DFF", "#FF9F5A", "#4EA8DE"];

    /// <summary>Totals spend per vendor and per subscription, then draws the donut.</summary>
    private void BuildSpendBreakdown()
    {
        var totals = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in _vault.Collection("rentals").Concat(_vault.Collection("rentalHistory")).OfType<JsonObject>())
        {
            var cost = (decimal)Number(item, "cost");
            if (cost <= 0) continue;
            var vendor = Text(item, "vendor");
            if (vendor.Length == 0) vendor = "Other rentals";
            totals[vendor] = totals.GetValueOrDefault(vendor) + cost;
        }
        foreach (var item in _vault.Collection("subscriptions").OfType<JsonObject>())
        {
            var cost = (decimal)Number(item, "totalPaid", "cost");
            if (cost <= 0) continue;
            var service = Text(item, "service", "name");
            if (service.Length == 0) service = "Subscription";
            totals[service] = totals.GetValueOrDefault(service) + cost;
        }

        var colors = VendorColorMap();
        var slices = totals.OrderByDescending(pair => pair.Value)
            .Select(pair => new SpendSliceRow
            {
                Label = pair.Key,
                Amount = pair.Value,
                ToneColor = colors.GetValueOrDefault(pair.Key, "#4CC9F0"),
                Website = VendorWebsite(pair.Key)
            }).ToList();

        SpendLegend.ItemsSource = slices;
        var total = slices.Sum(slice => slice.Amount);
        SpendDonutTotal.Text = $"₹{total:N0}";
        SpendLegendHint.Text = slices.Count == 0
            ? "No spending recorded yet."
            : slices.Any(slice => slice.Website.Length > 0)
                ? "Select a vendor to open its website."
                : "Totals across rentals and subscriptions.";
        DrawSpendDonut(slices, total);
    }

    /// <summary>Known storefronts, so a vendor in the breakdown can be opened directly.</summary>
    private static string VendorWebsite(string name)
    {
        var value = name.ToLowerInvariant();
        if (value.Contains("game hub") || value.Contains("gamehub")) return "https://thegamehub.in/";
        if (value.Contains("gamer planet") || value.Contains("gamerplanet")) return "https://gamerplanet.in/";
        if (value.Contains("geforce") || value.Contains("nvidia")) return "https://www.nvidia.com/en-in/geforce-now/";
        if (value.Contains("game pass") || value.Contains("xbox")) return "https://www.xbox.com/en-IN/xbox-game-pass";
        if (value.Contains("playstation") || value.Contains("ps plus") || value.Contains("ps+")) return "https://www.playstation.com/en-in/ps-plus/";
        if (value.Contains("ea play")) return "https://www.ea.com/ea-play";
        if (value.Contains("ubisoft")) return "https://www.ubisoft.com/en-us/ubisoft-plus";
        if (value.Contains("steam")) return "https://store.steampowered.com/";
        return "";
    }

    private void VendorSpend_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is not SpendSliceRow slice) return;
        if (slice.Website.Length == 0)
        {
            StatusText.Text = $"No website on record for {slice.Label}.";
            return;
        }
        OpenExternal(slice.Website);
    }

    /// <summary>Renders the spend split as donut arcs on the Home canvas.</summary>
    private void DrawSpendDonut(IReadOnlyList<SpendSliceRow> slices, decimal total)
    {
        SpendDonut.Children.Clear();
        const double size = 176, thickness = 26;
        var radius = (size - thickness) / 2;
        var centre = new Point(size / 2, size / 2);

        if (total <= 0 || slices.Count == 0)
        {
            SpendDonut.Children.Add(new System.Windows.Shapes.Ellipse
            {
                Width = size - thickness, Height = size - thickness,
                Stroke = (Brush)FindResource("DividerBrush"), StrokeThickness = thickness, Opacity = 0.5,
                Margin = new Thickness(thickness / 2)
            });
            return;
        }

        // A single slice cannot be drawn as an arc (start and end coincide).
        if (slices.Count == 1)
        {
            SpendDonut.Children.Add(new System.Windows.Shapes.Ellipse
            {
                Width = size - thickness, Height = size - thickness,
                Stroke = BrushFromHex(slices[0].ToneColor), StrokeThickness = thickness,
                Margin = new Thickness(thickness / 2)
            });
            return;
        }

        var startAngle = -90.0;
        foreach (var slice in slices)
        {
            var sweep = (double)(slice.Amount / total) * 360.0;
            if (sweep <= 0) continue;
            // Leave a hairline gap so neighbouring arcs stay distinguishable.
            var drawn = Math.Max(0.5, sweep - 1.5);
            var end = startAngle + drawn;
            var path = new System.Windows.Shapes.Path
            {
                Stroke = BrushFromHex(slice.ToneColor),
                StrokeThickness = thickness,
                StrokeStartLineCap = PenLineCap.Flat,
                StrokeEndLineCap = PenLineCap.Flat,
                Data = ArcGeometry(centre, radius, startAngle, end),
                ToolTip = $"{slice.Label} · {slice.AmountText}"
            };
            SpendDonut.Children.Add(path);
            startAngle += sweep;
        }
    }

    private static Geometry ArcGeometry(Point centre, double radius, double startAngle, double endAngle)
    {
        var start = PointOnCircle(centre, radius, startAngle);
        var end = PointOnCircle(centre, radius, endAngle);
        var figure = new PathFigure { StartPoint = start, IsClosed = false, IsFilled = false };
        figure.Segments.Add(new ArcSegment
        {
            Point = end,
            Size = new Size(radius, radius),
            SweepDirection = SweepDirection.Clockwise,
            IsLargeArc = endAngle - startAngle > 180
        });
        var geometry = new PathGeometry();
        geometry.Figures.Add(figure);
        return geometry;
    }

    private static Point PointOnCircle(Point centre, double radius, double angleDegrees)
    {
        var radians = angleDegrees * Math.PI / 180.0;
        return new Point(centre.X + radius * Math.Cos(radians), centre.Y + radius * Math.Sin(radians));
    }

    private static Brush BrushFromHex(string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        brush.Freeze();
        return brush;
    }

    /// <summary>
    /// A stable colour per vendor/subscription, ordered by total spend, so the
    /// monthly bar sections, the bar-chart legend and the spending donut all use
    /// the same colour for the same vendor.
    /// </summary>
    private Dictionary<string, string> VendorColorMap()
    {
        var totals = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in _vault.Collection("rentals").Concat(_vault.Collection("rentalHistory")).OfType<JsonObject>())
        {
            var cost = (decimal)Number(item, "cost");
            if (cost <= 0) continue;
            var vendor = Text(item, "vendor"); if (vendor.Length == 0) vendor = "Other rentals";
            totals[vendor] = totals.GetValueOrDefault(vendor) + cost;
        }
        foreach (var item in _vault.Collection("subscriptions").OfType<JsonObject>())
        {
            var cost = (decimal)Number(item, "totalPaid", "cost");
            if (cost <= 0) continue;
            var service = Text(item, "service", "name"); if (service.Length == 0) service = "Subscription";
            totals[service] = totals.GetValueOrDefault(service) + cost;
        }
        return totals.OrderByDescending(pair => pair.Value)
            .Select((pair, index) => (pair.Key, Color: SpendPalette[index % SpendPalette.Length]))
            .ToDictionary(entry => entry.Key, entry => entry.Color, StringComparer.OrdinalIgnoreCase);
    }

    private void RefreshGameSpendChart()
    {
        var months = Enumerable.Range(0, 12).Select(offset => new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1).AddMonths(offset - 11)).ToList();
        var colors = VendorColorMap();
        var perMonth = months.ToDictionary(month => month, _ => new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase));
        void Add(DateTime month, string vendor, decimal amount)
        {
            if (amount <= 0 || !perMonth.TryGetValue(month, out var bucket)) return;
            bucket[vendor] = bucket.GetValueOrDefault(vendor) + amount;
        }
        foreach (var item in _vault.Collection("rentals").Concat(_vault.Collection("rentalHistory")).OfType<JsonObject>())
        {
            if (!DateTime.TryParse(Text(item, "start", "date", "returnedAt", "end"), out var date)) continue;
            var vendor = Text(item, "vendor"); if (vendor.Length == 0) vendor = "Other rentals";
            Add(new DateTime(date.Year, date.Month, 1), vendor, (decimal)Number(item, "cost"));
        }
        foreach (var item in _vault.Collection("subscriptions").OfType<JsonObject>())
        {
            if (!DateTime.TryParse(Text(item, "start", "startedAt", "date"), out var date)) continue;
            var service = Text(item, "service", "name"); if (service.Length == 0) service = "Subscription";
            Add(new DateTime(date.Year, date.Month, 1), service, (decimal)Number(item, "totalPaid", "cost"));
        }

        const double maxBar = 116;
        var maximum = Math.Max(1m, perMonth.Values.Select(bucket => bucket.Values.DefaultIfEmpty(0).Sum()).DefaultIfEmpty(0).Max());
        _monthlySpendRows.Clear();
        foreach (var month in months)
        {
            var bucket = perMonth[month];
            // Vendors ordered by the shared colour map so a vendor keeps the same
            // position (and colour) in every month's stack.
            var segments = bucket.Where(pair => pair.Value > 0)
                .OrderBy(pair => colors.Keys.ToList().IndexOf(pair.Key))
                .Select(pair => new SpendSegment
                {
                    Height = Math.Max(2.0, (double)(pair.Value / maximum) * maxBar),
                    ColorHex = colors.GetValueOrDefault(pair.Key, "#4CC9F0"),
                    Tip = $"{pair.Key}: ₹{pair.Value:N0}"
                }).ToList();
            _monthlySpendRows.Add(new MonthlySpendRow
            {
                Month = month.ToString("MMM", CultureInfo.InvariantCulture),
                Amount = bucket.Values.DefaultIfEmpty(0).Sum(),
                Segments = segments
            });
        }

        // Legend: every vendor that contributed to the last 12 months.
        var vendorTotals = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var bucket in perMonth.Values)
            foreach (var pair in bucket) vendorTotals[pair.Key] = vendorTotals.GetValueOrDefault(pair.Key) + pair.Value;
        SpendChartLegend.ItemsSource = vendorTotals.OrderByDescending(pair => pair.Value)
            .Select(pair => new SpendSliceRow { Label = pair.Key, Amount = pair.Value, ToneColor = colors.GetValueOrDefault(pair.Key, "#4CC9F0") })
            .ToList();
    }

    private void HomeShortcut_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button) return;
        _section = button.Tag?.ToString() ?? "Overview";
        if (_section == "Games") _gameCollection = "playing";
        if (_section == "Movies") _mediaMode = "watchlist";
        ShowSection();
        if (_section == "Games") SelectGameCollection("playing");
        RefreshAll();
    }

    private void GamesTabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        StyleGameTabs();
        if (!IsLoaded || GamesTabs.SelectedItem is not TabItem tab) return;
        CloseDetails();
        _gameCollection = tab.Tag?.ToString() ?? "rentals";
        UpcomingPlatformTabs.Visibility = ShowsPlatformFilter(_gameCollection) ? Visibility.Visible : Visibility.Collapsed;
        UpdateUpcomingPlatformStyles();
        RefreshGames();
        _ = EnsureCurrentCatalogAsync();
        if (_gameCollection == "queue") _ = EnsureQueueAvailabilityAsync();
    }

    /// <summary>
    /// Fills the selected Games tab with its own colour (from the TabAccent set in
    /// XAML) and leaves the rest a thin coloured outline, so each tab is easy to
    /// identify. Done in code because a template binding to the attached colour did
    /// not resolve reliably.
    /// </summary>
    private void StyleGameTabs()
    {
        foreach (var tab in GamesTabs.Items.OfType<TabItem>())
        {
            var hex = Services.TabAccent.GetColor(tab);
            if (string.IsNullOrEmpty(hex)) continue;
            var accent = BrushFromHex(hex);
            if (tab.IsSelected)
            {
                tab.Background = accent;
                tab.BorderBrush = accent;
                tab.Foreground = Brushes.White;
            }
            else
            {
                tab.Background = Brushes.Transparent;
                tab.BorderBrush = new SolidColorBrush(((SolidColorBrush)accent).Color) { Opacity = 0.55 };
                tab.Foreground = (Brush)FindResource("MutedBrush");
            }
        }
    }

    private void RefreshGames()
    {
        var source = _gameCollection == "playing"
            ? ReadCollection("playing").Concat(ReadCollection("rentals")).GroupBy(row => NormalizedTitle(row.Name)).Select(group => group.First())
            : _gameCollection == "rentals"
            ? ReadCollection("rentals").Concat(ReadCollection("rentalHistory"))
            : _gameCollection == "subscriptionGames"
            ? ReadSubscriptions().Concat(ReadCollection("subscriptionGames"))
            : ReadCollection(_gameCollection);
        if (_gameCollection == "upcoming")
            source = source.Concat(ReadCollection("upcomingRemoved"));
        // PS5 vs Xbox & PC filtering also applies to Discover and Completed, so
        // those sections can be narrowed to one platform the same way.
        if (ShowsPlatformFilter(_gameCollection))
            source = source.Where(UpcomingPlatformMatches);
        /* A finished game has no business sitting in Discover, the queue or the
           upcoming list — it belongs in Completed only. */
        if (_gameCollection is "catalogExtra" or "queue" or "upcoming")
            source = ExcludeCompleted(source, "Game");
        SetRows(source, GameSortBox.SelectedItem as ComboBoxItem);
    }

    private void UpcomingPlatform_Click(object sender, RoutedEventArgs e)
    {
        CloseDetails();
        _upcomingPlatform = (sender as Button)?.Tag?.ToString() ?? "ps5";
        UpdateUpcomingPlatformStyles();
        RefreshGames();
    }

    /// <summary>Sections that offer the PS5 / Xbox &amp; PC platform filter.</summary>
    private static bool ShowsPlatformFilter(string collection) => collection is "upcoming" or "catalogExtra" or "played";

    private void UpdateUpcomingPlatformStyles()
    {
        UpcomingAllButton.Style = (Style)FindResource(_upcomingPlatform == "all" ? "LibraryTabSelectedButton" : "LibraryTabButton");
        UpcomingPs5Button.Style = (Style)FindResource(_upcomingPlatform == "ps5" ? "LibraryTabSelectedButton" : "LibraryTabButton");
        UpcomingXboxPcButton.Style = (Style)FindResource(_upcomingPlatform == "xboxpc" ? "LibraryTabSelectedButton" : "LibraryTabButton");
    }

    private bool UpcomingPlatformMatches(LibraryRow row)
    {
        if (_upcomingPlatform == "all") return true;
        var value = $"{row.Platform} {Text(row.Source, "platforms", "platform", "stores")}";
        var xboxPc = value.Contains("xbox", StringComparison.OrdinalIgnoreCase) || value.Contains("pc", StringComparison.OrdinalIgnoreCase) || value.Contains("windows", StringComparison.OrdinalIgnoreCase);
        var ps5 = value.Contains("playstation 5", StringComparison.OrdinalIgnoreCase) || value.Contains("ps5", StringComparison.OrdinalIgnoreCase) || value.Contains("playstation", StringComparison.OrdinalIgnoreCase);
        if (!xboxPc && !ps5) return false;
        return _upcomingPlatform == "ps5" ? ps5 : xboxPc;
    }

    private void MediaFilter_Click(object sender, RoutedEventArgs e)
    {
        CloseDetails();
        _mediaMode = (sender as Button)?.Tag?.ToString() ?? "watchlist";
        RefreshMedia();
        _ = EnsureCurrentCatalogAsync();
    }

    private async Task EnsureCurrentCatalogAsync()
    {
        var isGameCatalog = _section == "Games" && _gameCollection is "upcoming" or "catalogExtra";
        var mediaCatalogs = _section == "Movies" ? new[] { "uphw", "bluray", "relhw", "mlott", "mlup" }
            : _section == "Series" ? new[] { "seriesnew", "seriesupcoming", "enseries", "mlseries", "taseries", "hiseries" } : [];
        if (!isGameCatalog && !mediaCatalogs.Contains(_mediaMode)) return;
        if (isGameCatalog && _catalog.RawgKey.Length == 0 || !isGameCatalog && _catalog.TmdbKey.Length == 0) return;
        var mode = isGameCatalog ? _gameCollection : _mediaMode;
        var key = isGameCatalog ? $"{_section}:{mode}:catalog-v3" : $"{_section}:{mode}:catalog-v3";
        if (!_catalogRefreshes.Add(key)) return;
        try
        {
            var timestamps = _vault.Root["nativeCatalogRefreshAt"] as JsonObject;
            var previous = timestamps?[key]?.GetValue<long?>() ?? 0;
            if (!isGameCatalog)
            {
                var webSnapshotAt = _vault.Root["nativeTvCatalog"]?["generatedAt"]?.GetValue<long?>() ?? 0;
                previous = Math.Max(previous, webSnapshotAt);
            }
            var hasData = isGameCatalog ? _vault.Collection(mode).Count > 0 : (_vault.Root["nativeTvCatalog"]?[_section == "Movies" ? "movies" : "series"]?[mode] as JsonArray)?.Count > 0;
            if (hasData && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - previous < TimeSpan.FromHours(12).TotalMilliseconds) return;
            StatusText.Text = $"Refreshing {mode} in the background...";
            if (isGameCatalog)
            {
                var items = await _catalog.GameCatalogAsync(mode == "upcoming");
                var hidden = mode == "upcoming" ? _vault.Collection("upcomingRemoved").OfType<JsonObject>().Select(item => NormalizedTitle(Text(item, "name"))).ToHashSet() : [];
                await _vault.SetCacheValueAsync(mode, new JsonArray(items.Where(item => !hidden.Contains(NormalizedTitle(Text(item, "name")))).Select(item => (JsonNode)item.DeepClone()).ToArray()));
                if (_section == "Games" && _gameCollection == mode) RefreshGames();
            }
            else
            {
                var type = _section == "Movies" ? "Movie" : "TV Show";
                var items = await _catalog.MediaCatalogAsync(type, mode);
                var root = _vault.Root["nativeTvCatalog"]?.DeepClone() as JsonObject ?? [];
                var typeKey = _section == "Movies" ? "movies" : "series";
                if (root[typeKey] is not JsonObject typeRoot) { typeRoot = []; root[typeKey] = typeRoot; }
                typeRoot[mode] = new JsonArray(items.Select(item => (JsonNode)item.DeepClone()).ToArray());
                await _vault.SetCacheValueAsync("nativeTvCatalog", root);
                if ((_section == "Movies" || _section == "Series") && _mediaMode == mode) RefreshMedia();
            }
            timestamps = _vault.Root["nativeCatalogRefreshAt"]?.DeepClone() as JsonObject ?? [];
            timestamps[key] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await _vault.SetCacheValueAsync("nativeCatalogRefreshAt", timestamps);
            StatusText.Text = $"{mode} is up to date.";
        }
        catch (Exception ex) { StatusText.Text = $"Catalog refresh paused: {ex.Message}"; }
        finally { _catalogRefreshes.Remove(key); }
    }

    private void BuildMediaTabs()
    {
        MediaTabsPanel.Children.Clear();
        var definitions = _section == "Movies"
            ? new[] { ("watchlist", "My Watchlist"), ("watching", "Watching"), ("uphw", "Coming Soon"), ("bluray", "New on Blu-ray"), ("relhw", "Discover"), ("mlup", "Coming to Malayalam OTT"), ("mlott", "Malayalam OTT"), ("watched", "Watched"), ("hidden", "Not Interested") }
            : new[] { ("watchlist", "My Watchlist"), ("watching", "Watching"), ("seriesnew", "New Episodes"), ("seriesupcoming", "Upcoming"), ("enseries", "English"), ("mlseries", "Malayalam"), ("taseries", "Tamil"), ("hiseries", "Hindi"), ("watched", "Watched"), ("hidden", "Not Interested") };
        if (!definitions.Any(item => item.Item1 == _mediaMode)) _mediaMode = "watchlist";
        foreach (var (key, label) in definitions)
        {
            var button = new Button
            {
                Content = LibraryTabHeader(MediaTabGlyph(key), label), Tag = key, Margin = new Thickness(0, 0, 8, 8),
                Style = (Style)FindResource("LibraryTabButton")
            };
            // Each tab keeps its own colour, and the selected one fills with it, so
            // Movies and TV tabs are as easy to tell apart as the Games tabs: the
            // selected tab is filled, the rest carry a thin outline in that colour.
            var accent = BrushFromHex(TabColor(key));
            if (key == _mediaMode)
            {
                button.Background = accent;
                button.BorderBrush = accent;
                button.Foreground = Brushes.White;
            }
            else
            {
                button.BorderBrush = new SolidColorBrush(((SolidColorBrush)accent).Color) { Opacity = 0.55 };
            }
            button.Click += MediaFilter_Click;
            MediaTabsPanel.Children.Add(button);
        }
    }

    /// <summary>A distinct highlight colour per library tab, shared by Games, Movies and TV.</summary>
    private static string TabColor(string key) => key switch
    {
        "watchlist" or "rentals" or "seriesnew" => "#1E9BE0",
        "watching" or "playing" => "#16A97F",
        "uphw" or "queue" or "seriesupcoming" or "taseries" => "#E0952A",
        "bluray" or "enseries" => "#4A78E0",
        "relhw" or "catalogExtra" or "subscriptionGames" => "#8A63D2",
        "mlup" or "upcoming" or "hiseries" => "#E0558A",
        "mlott" or "mlseries" => "#C455C7",
        "watched" or "played" => "#35B37E",
        "hidden" => "#6B7686",
        _ => "#1E9BE0"
    };

    private static string MediaTabGlyph(string key) => key switch
    {
        "watchlist" => "\uE728", "watching" => "\uE768", "uphw" or "seriesupcoming" => "\uE787",
        "bluray" => "\uE7F1", "relhw" or "enseries" => "\uE721", "mlott" or "mlup" => "\uE8B2",
        "seriesnew" => "\uE823", "mlseries" => "\uE8D2", "taseries" => "\uE8D2", "hiseries" => "\uE8D2",
        "watched" => "\uE73E", "hidden" => "\uED1A", _ => "\uE8A9"
    };

    private static StackPanel LibraryTabHeader(string glyph, string label)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal };
        panel.Children.Add(new TextBlock { Text = glyph, FontFamily = new FontFamily("Segoe Fluent Icons"), FontSize = 16, Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center });
        panel.Children.Add(new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center });
        return panel;
    }

    private void RefreshMedia()
    {
        var prefix = _section == "Movies" ? "Movies" : "TV Shows";
        var collection = _mediaMode switch
        {
            "watching" => _section == "Movies" ? "watchingMovies" : "watchingSeries",
            "watched" => _section == "Movies" ? "watchedMovies" : "watchedSeries",
            "hidden" => _section == "Movies" ? "hiddenMovies" : "hiddenSeries",
            _ => _section == "Movies" ? "movieWatchlist" : "seriesWatchlist"
        };
        PageSubtitle.Text = $"{prefix} · {_mediaMode}";
        var catalog = _section == "Movies" ? new[] { "uphw", "bluray", "relhw", "mlott", "mlup" } : new[] { "seriesnew", "seriesupcoming", "enseries", "mlseries", "taseries", "hiseries" };
        var allRows = (catalog.Contains(_mediaMode) ? ReadNativeCatalog(_section == "Movies" ? "movies" : "series", _mediaMode) : ReadCollection(collection)).ToList();
        IEnumerable<LibraryRow> rows = allRows;
        var year = (MediaYearBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
        var genre = MediaGenreBox.Text.Trim();
        if (year.Length > 0) rows = rows.Where(row => ParseSortDate(row.Date).Year.ToString(CultureInfo.InvariantCulture) == year || row.Source["year"]?.ToString() == year);
        if (genre.Length > 0) rows = rows.Where(row => row.Genre.Contains(genre, StringComparison.OrdinalIgnoreCase));
        /* Discovery feeds already drop titles that live in a personal list, but the
           watchlist itself could still show something also marked watched. */
        if (_mediaMode is "watchlist" or "watching")
            rows = ExcludeCompleted(rows, _section == "Movies" ? "Movie" : "TV Show");
        SetRows(rows, MediaSortBox.SelectedItem as ComboBoxItem);
        PopulateMediaYears(allRows);
        BuildMediaTabs();
    }

    private IEnumerable<LibraryRow> ReadNativeCatalog(string type, string collection)
    {
        var array = _vault.Root["nativeTvCatalog"]?[type]?[collection] as JsonArray;
        if (array is null) return [];
        var excludedCollections = type == "movies"
            ? new[] { "movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies" }
            : new[] { "seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries" };
        var excluded = excludedCollections.SelectMany(name => _vault.Collection(name).OfType<JsonObject>())
            .Select(item => NormalizedTitle(Text(item, "name", "title"))).Where(value => value.Length > 0).ToHashSet();
        return ReadNodes(new JsonArray(array.Where(node => node is JsonObject item && !excluded.Contains(NormalizedTitle(Text(item, "name", "title")))).Select(node => node!.DeepClone()).ToArray()), collection);
    }

    private static string NormalizedTitle(string value) => new(value.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
    private static string CoverOrPlaceholder(string image, string title) => image.Length > 0
        ? image
        : "";   // Empty means "draw the local initials placeholder".

    private IEnumerable<LibraryRow> ReadCollection(string collection) => ReadNodes(_vault.Collection(collection), collection);

    private IEnumerable<LibraryRow> ReadSubscriptions()
    {
        foreach (var node in _vault.Collection("subscriptions").OfType<JsonObject>())
        {
            var service = Text(node, "service", "name");
            if (service.Length == 0) continue;
            var provider = service.Contains("geforce", StringComparison.OrdinalIgnoreCase) || service.Contains("nvidia", StringComparison.OrdinalIgnoreCase)
                ? "NVIDIA"
                : service.Contains("game pass", StringComparison.OrdinalIgnoreCase) || service.Contains("xbox", StringComparison.OrdinalIgnoreCase)
                ? "Xbox"
                : "Subscription";
            var renewal = Text(node, "renewsAt", "end", "start");
            int? days = DateTime.TryParse(renewal, out var parsed) ? (parsed.Date - DateTime.Today).Days : null;
            var active = !string.Equals(Text(node, "active"), "false", StringComparison.OrdinalIgnoreCase) && days is null or >= 0;
            var image = Text(node, "img", "poster", "cover");
            yield return new LibraryRow
            {
                Id = Text(node, "id"),
                Name = service,
                Collection = "subscriptions",
                MediaType = "Subscription",
                Platform = provider == "NVIDIA" ? "GeForce NOW" : provider == "Xbox" ? "PC / Xbox" : provider,
                Status = active ? "Active subscription" : "Inactive subscription",
                Date = DisplayDate(renewal),
                Genre = "Cloud gaming subscription",
                Image = image,
                Providers = provider,
                Note = Text(node, "note", "remarks"),
                Cost = (decimal)Number(node, "cost", "monthlyCost"),
                DaysLeft = days,
                GroupName = active ? "Active subscriptions" : "Past subscriptions",
                Badges = provider,
                Source = node
            };
        }
    }

    private IEnumerable<LibraryRow> ReadNodes(JsonArray source, string collection)
    {
        var index = -1;
        foreach (var node in source.OfType<JsonObject>())
        {
            index++;
            var name = Text(node, "name", "title");
            if (string.IsNullOrWhiteSpace(name)) continue;
            var date = collection == "rentals"
                ? RentalReturnDate(node)
                : Text(node, "returnDate", "end", "returnedAt", "date", "releaseDate", "firstAirDate", "latestDate", "year", "added");
            var platformText = ArrayText(node, "platforms", "networks", "platform", "tier");
            var providerText = ArrayText(node, "providers", "provider");
            if (collection == "subscriptionGames")
            {
                var subscriptionId = Text(node, "subscriptionId");
                var subscription = _vault.Collection("subscriptions").OfType<JsonObject>().FirstOrDefault(item => Text(item, "id") == subscriptionId);
                if (subscription is not null)
                {
                    date = Text(subscription, "renewsAt", "end", "start");
                    providerText = Text(subscription, "service");
                }
            }
            int? days = null;
            if (DateTime.TryParse(date, out var parsed)) days = (parsed.Date - DateTime.Today).Days;
            var mediaType = collection == "plex" ? (Text(node, "plexType") is "show" or "season" or "episode" ? "TV Show" : "Movie")
                : _section == "Movies" || collection.Contains("Movie", StringComparison.OrdinalIgnoreCase) ? "Movie"
                : _section == "Series" || collection.Contains("Series", StringComparison.OrdinalIgnoreCase) ? "TV Show" : "Game";
            yield return new LibraryRow
            {
                Id = Text(node, "id", "canonicalId", "rawgId", "tmdbId"),
                Name = name,
                Collection = collection,
                MediaType = mediaType,
                Platform = platformText,
                Status = Text(node, "status", "state"),
                Date = DisplayDate(date),
                Genre = GenreText(node),
                Image = CoverOrPlaceholder(Text(node, "img", "poster", "cover", "posterUrl"), name),
                Backdrop = Text(node, "backdrop", "background", "backdropUrl"),
                Overview = CatalogService.CleanStoryText(Text(node, "overview", "plot", "summary", "description")),
                Providers = providerText,
                Vendor = QueueAvailability(node, Text(node, "vendor")),
                Note = Text(node, "note", "remarks"),
                ImdbId = Text(node, "imdbId"),
                TmdbId = Text(node, "tmdbId", "id"),
                Seasons = Integer(node, "seasons", "numberOfSeasons"),
                Episodes = Integer(node, "episodeCount", "episodes"),
                Rating = Number(node, "imdb", "rating", "rrating", "tmdb", "score"),
                Cost = (decimal)Number(node, "cost"),
                DaysLeft = days,
                GroupName = GroupName(collection, Text(node, "status", "state"), days),
                Badges = GameBadges(name, node, mediaType),
                SortIndex = index,
                AddedAt = AddedTimestamp(node),
                Source = node
            };
        }
    }

    /// <summary>Timestamp a record was added, in milliseconds; 0 when unknown.</summary>
    private static long AddedTimestamp(JsonObject node)
    {
        foreach (var key in new[] { "added", "addedAt", "started", "t", "createdAt" })
        {
            var raw = node[key];
            if (raw is null) continue;
            if (raw.GetValueKind() == System.Text.Json.JsonValueKind.Number && raw.GetValue<long?>() is { } number && number > 0) return number;
            var text = raw.ToString();
            if (long.TryParse(text, out var parsedNumber) && parsedNumber > 0) return parsedNumber;
            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsedDate))
                return new DateTimeOffset(parsedDate).ToUnixTimeMilliseconds();
        }
        return 0;
    }

    /// <summary>
    /// Lists the user curates by hand. These keep the order they were built in;
    /// discovery feeds stay sorted by release date because they are not curated.
    /// </summary>
    private static bool IsCuratedList(string collection) => collection is
        "rentals" or "rentalHistory" or "playing" or "queue" or "played" or "upcoming" or "upcomingRemoved"
        or "subscriptions" or "subscriptionGames" or "hiddenGames"
        or "movieWatchlist" or "watchingMovies" or "watchedMovies" or "hiddenMovies"
        or "seriesWatchlist" or "watchingSeries" or "watchedSeries" or "hiddenSeries";

    /// <summary>
    /// Titles already finished, so they can be kept out of the active lists.
    /// A completed game reappearing under Discover or Queue is noise.
    /// </summary>
    private HashSet<string> CompletedTitleKeys(string mediaType)
    {
        var collections = mediaType switch
        {
            "Movie" => new[] { "watchedMovies", "hiddenMovies" },
            "TV Show" => ["watchedSeries", "hiddenSeries"],
            _ => new[] { "played", "hiddenGames" }
        };
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var collection in collections)
            foreach (var node in _vault.Collection(collection).OfType<JsonObject>())
            {
                var title = Text(node, "name", "title");
                if (title.Length > 0) keys.Add(NormalizedTitle(title));
            }
        return keys;
    }

    /// <summary>Removes finished titles from lists that are meant to show what is still outstanding.</summary>
    private IEnumerable<LibraryRow> ExcludeCompleted(IEnumerable<LibraryRow> source, string mediaType)
    {
        var completed = CompletedTitleKeys(mediaType);
        if (completed.Count == 0) return source;
        return source.Where(row => !completed.Contains(NormalizedTitle(row.Name)));
    }

    private void SetRows(IEnumerable<LibraryRow> source, ComboBoxItem? sortItem = null)
    {
        var query = SearchBox.Text.Trim();
        // Materialise once: the sort selection inspects the rows before ordering them.
        source = source as IList<LibraryRow> ?? source.ToList();
        source = _section == "Games" && _gameCollection == "upcoming"
            ? source.OrderBy(row => UpcomingOrder(row)).ThenBy(row => row.DaysLeft is >= 0 ? row.DaysLeft : int.MaxValue).ThenByDescending(row => ParseSortDate(row.Date)).ThenBy(row => row.Name)
            : _section == "Games" && _gameCollection == "catalogExtra" && (sortItem?.Tag?.ToString()) == "new"
            ? source.OrderByDescending(row => ParseSortDate(row.Date)).ThenByDescending(row => row.Rating).ThenBy(row => row.Name)
            : _section is "Movies" or "Series" && IsDatedMediaCatalog(_mediaMode)
            ? source.OrderBy(row => row.DaysLeft is >= 0 ? 0 : 1)
                .ThenBy(row => row.DaysLeft is >= 0 ? row.DaysLeft : int.MaxValue)
                .ThenByDescending(row => ParseSortDate(row.Date)).ThenBy(row => row.Name)
            : _section == "Games" && _gameCollection == "rentals"
            ? source.OrderBy(row => GroupOrder(row.GroupName)).ThenByDescending(row => ParseSortDate(Text(row.Source, "start", "date", "added")))
            : _section == "Games" && _gameCollection == "playing"
            ? source.OrderBy(row => GroupOrder(row.GroupName)).ThenByDescending(row => ParseSortDate(row.Date))
            : _section == "Games" && _gameCollection == "subscriptionGames"
            ? source.OrderBy(row => GroupOrder(row.GroupName)).ThenBy(row => row.Name)
            : (sortItem?.Tag?.ToString()) switch
            {
                "title" => source.OrderBy(row => row.Name),
                "date" => source.OrderBy(row => row.DaysLeft is < 0 ? 1 : 0).ThenBy(row => row.DaysLeft ?? int.MaxValue),
                "rating" => source.OrderByDescending(row => row.Rating),
                /* "Newest first" on a hand-built list means the order it was built
                   in, newest at the front — not newest by release date, which is
                   what made watchlists and queues look randomly shuffled. New
                   records are inserted at index 0, so a lower SortIndex is newer. */
                _ when source.Any() && source.All(row => IsCuratedList(row.Collection))
                    => source.OrderByDescending(row => row.AddedAt).ThenBy(row => row.SortIndex),
                _ => source.OrderByDescending(row => ParseSortDate(row.Date)).ThenBy(row => row.Name)
            };
        /* Suppress binding notifications while rebuilding the underlying collection
           so the view is not re-sorted and re-grouped once per added row — that was
           the switching-tabs stutter on a large library.

           DeferRefresh cannot be used here: the same view is bound to several
           ItemsControls at once, so WPF touches CurrentPosition for its selection
           cursor mid-block and throws "Cannot change... while Refresh is being
           deferred". Rebuilding into a fresh list and swapping the ItemsSource
           in one step gives the same benefit without that hazard. */
        _rows = source.Where(x => query.Length == 0 || x.Name.Contains(query, StringComparison.OrdinalIgnoreCase)).ToList();

        /* A fresh view per refresh, given only to the page being shown.
           One shared view used to feed all four card and list controls, so turning
           grouping on for Games turned it on for Movies and TV as well. Clearing it
           again did not undo the damage: those controls kept laying their cards out
           with the group panel, which stacked them in a single centred column
           instead of flowing them across the page. A new view also forces the item
           containers to be regenerated, so the panel always matches the current
           grouping instead of whatever the previous page left behind. */
        var view = new ListCollectionView(_rows);
        if ((_section == "Games" || _section == "Movies" && _mediaMode is "mlott" or "mlup") && _rows.Any(row => row.GroupName.Length > 0))
            view.GroupDescriptions.Add(new PropertyGroupDescription(nameof(LibraryRow.GroupName)));
        if (_section == "Games")
        {
            GamesCards.ItemsSource = view;
            GamesList.ItemsSource = view;
        }
        else
        {
            MediaCards.ItemsSource = view;
            MediaList.ItemsSource = view;
        }
        StatusText.Text = $"{_rows.Count} item{(_rows.Count == 1 ? "" : "s")}";
    }

    private static int UpcomingOrder(LibraryRow row) => row.Collection == "upcomingRemoved" ? 2 : row.DaysLeft is < 0 ? 1 : 0;
    private static bool IsDatedMediaCatalog(string mode) => mode is "uphw" or "bluray" or "relhw" or "mlott" or "mlup" or "seriesnew" or "seriesupcoming" or "enseries" or "mlseries" or "taseries" or "hiseries";

    private static string GroupName(string collection, string status, int? days) => collection switch
    {
        "rentals" => "Active rentals",
        "rentalHistory" => "Rental history",
        "playing" when status.Contains("resume", StringComparison.OrdinalIgnoreCase) => "Resume later",
        "playing" when status.Contains("hold", StringComparison.OrdinalIgnoreCase) || status.Contains("drop", StringComparison.OrdinalIgnoreCase) => "On hold",
        "playing" => "Playing now",
        "subscriptionGames" => "Included games",
        "upcoming" when days is < 0 => "Released",
        "upcoming" => "Upcoming releases",
        "upcomingRemoved" => "Removed games",
        "mlup" => "Coming to Malayalam OTT",
        "mlott" => "Released on Malayalam OTT",
        _ => ""
    };

    private static readonly HashSet<string> Ps5ProTitles = new(new[]
    {
        "Marvel's Spider-Man 2", "Marvel's Spider-Man: Miles Morales", "God of War Ragnarok", "Horizon Forbidden West",
        "Horizon Zero Dawn Remastered", "The Last of Us Part I", "The Last of Us Part II Remastered", "Demon's Souls",
        "Ratchet & Clank: Rift Apart", "Gran Turismo 7", "Ghost of Tsushima Director's Cut", "Astro Bot", "Alan Wake 2",
        "Final Fantasy VII Rebirth", "Final Fantasy XVI", "Dragon's Dogma 2", "Resident Evil 4", "Resident Evil Village",
        "Silent Hill 2", "Star Wars Jedi: Survivor", "Hogwarts Legacy", "Stellar Blade", "Black Myth: Wukong", "Cyberpunk 2077",
        "Kingdom Come: Deliverance II", "Monster Hunter Wilds", "Assassin's Creed Shadows", "Death Stranding 2: On the Beach",
        "Doom: The Dark Ages", "Clair Obscur: Expedition 33", "Lies of P", "Dead Space"
    }.Select(NormalizedTitle));
    private static string GameBadges(string name, JsonObject node, string mediaType)
    {
        if (mediaType != "Game") return "";
        var badges = new List<string>();
        var tier = Text(node, "tier", "classification"); if (tier.Length > 0) badges.Add(tier);
        if (Ps5ProTitles.Contains(NormalizedTitle(name)) || string.Equals(Text(node, "ps5Pro", "proEnhanced"), "true", StringComparison.OrdinalIgnoreCase)) badges.Add("PS5 Pro Enhanced");
        var remaster = Text(node, "rem", "edition"); if (remaster.Length > 0) badges.Add(remaster);
        var platforms = ArrayText(node, "platforms", "platform");
        if (platforms.Contains("Xbox", StringComparison.OrdinalIgnoreCase) && !platforms.Contains("PlayStation", StringComparison.OrdinalIgnoreCase) && !platforms.Contains("PS5", StringComparison.OrdinalIgnoreCase)) badges.Add("Xbox Exclusive");
        if ((platforms.Contains("PS5", StringComparison.OrdinalIgnoreCase) || platforms.Contains("PlayStation", StringComparison.OrdinalIgnoreCase)) && !platforms.Contains("Xbox", StringComparison.OrdinalIgnoreCase) && !platforms.Contains("PC", StringComparison.OrdinalIgnoreCase)) badges.Add("PS5 Exclusive");
        return string.Join(" · ", badges.Distinct());
    }

    private static DateTime ParseSortDate(string value) => DateTime.TryParse(value, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AllowWhiteSpaces, out var date)
        || DateTime.TryParse(value, System.Globalization.CultureInfo.CurrentCulture, System.Globalization.DateTimeStyles.AllowWhiteSpaces, out date) ? date : DateTime.MinValue;
    private static string DisplayDate(string value) => DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var date)
        || DateTime.TryParse(value, CultureInfo.CurrentCulture, DateTimeStyles.AllowWhiteSpaces, out date) ? date.ToString("dd-MMMM-yyyy", CultureInfo.InvariantCulture) : value;
    /* "Included games" sits last so the Subscriptions tab reads as the
       subscriptions themselves first, then the games they include. */
    private static int GroupOrder(string group) => group switch { "Active rentals" or "Playing now" or "Upcoming releases" or "Active subscriptions" => 0, "Resume later" => 1, "On hold" or "Released" or "Past subscriptions" => 2, "Rental history" => 3, "Removed games" => 4, "Included games" => 5, _ => 0 };

    private double RecommendationScore(LibraryRow candidate)
    {
        var historyNames = candidate.MediaType switch { "Movie" => new[] { "watchedMovies" }, "TV Show" => new[] { "watchedSeries" }, _ => new[] { "played" } };
        var candidateGenres = candidate.Genre.Split(['/', ',', '·'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(NormalizedTitle).ToHashSet();
        var affinity = historyNames.SelectMany(name => ReadCollection(name)).Sum(item =>
        {
            var personal = Number(item.Source, "userRating", "myRating");
            if (personal <= 0) return 0;
            var overlap = item.Genre.Split(['/', ',', '·'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(NormalizedTitle).Count(candidateGenres.Contains);
            return overlap * personal * personal;
        });
        return affinity + candidate.Rating * 2;
    }

    private void PopulateMediaYears(IEnumerable<LibraryRow> source)
    {
        var selected = (MediaYearBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
        var dataYears = source.Select(row => row.Source["year"]?.ToString() ?? (row.Date.Length >= 4 ? row.Date[..4] : ""))
            .Where(value => value.Length == 4 && int.TryParse(value, out _)).Select(int.Parse);
        /* Always offer the current year and the next two even before any title with
           that year has been fetched, so the filter keeps working as the years roll
           over instead of stopping at whatever the catalog last happened to hold. */
        var future = Enumerable.Range(DateTime.Today.Year - 1, 4);   // last year through two years ahead
        var years = dataYears.Concat(future).Distinct().OrderByDescending(value => value)
            .Select(value => value.ToString(CultureInfo.InvariantCulture)).ToList();
        MediaYearBox.SelectionChanged -= MediaFilter_Changed;
        MediaYearBox.Items.Clear();
        MediaYearBox.Items.Add(new ComboBoxItem { Content = "All years", Tag = "" });
        foreach (var year in years) MediaYearBox.Items.Add(new ComboBoxItem { Content = year, Tag = year });
        MediaYearBox.SelectedItem = MediaYearBox.Items.OfType<ComboBoxItem>().FirstOrDefault(item => item.Tag?.ToString() == selected) ?? MediaYearBox.Items[0];
        MediaYearBox.SelectionChanged += MediaFilter_Changed;
    }

    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (!IsLoaded) return;
        _searchDebounceTimer.Stop();
        _searchDebounceTimer.Start();
    }

    private void GameView_Click(object sender, RoutedEventArgs e)
    {
        _gamesListView = !_gamesListView;
        _preferences.Set("GamesView", _gamesListView ? "list" : "grid");
        ApplyViewPreferences();
    }

    private void MediaView_Click(object sender, RoutedEventArgs e)
    {
        _mediaListView = !_mediaListView;
        _preferences.Set("MediaView", _mediaListView ? "list" : "grid");
        ApplyViewPreferences();
    }

    private void ApplyViewPreferences()
    {
        GamesCards.Visibility = _gamesListView ? Visibility.Collapsed : Visibility.Visible;
        GamesList.Visibility = _gamesListView ? Visibility.Visible : Visibility.Collapsed;
        GameViewButton.Content = _gamesListView ? "Grid view" : "List view";
        MediaCards.Visibility = _mediaListView ? Visibility.Collapsed : Visibility.Visible;
        MediaList.Visibility = _mediaListView ? Visibility.Visible : Visibility.Collapsed;
        MediaViewButton.Content = _mediaListView ? "Grid view" : "List view";
    }

    private void Theme_Click(object sender, RoutedEventArgs e)
    {
        _theme = _theme == "light" ? "dark" : "light";
        _preferences.Set("Theme", _theme);
        ApplyTheme();
    }

    private void SetTheme_Click(object sender, RoutedEventArgs e)
    {
        _theme = (sender as Button)?.Tag?.ToString() ?? "dark";
        _preferences.Set("Theme", _theme);
        ApplyTheme();
    }

    private void ApplyTheme()
    {
        if (SystemParameters.HighContrast)
        {
            Application.Current.Resources["WindowBrush"] = SystemColors.WindowBrush;
            Application.Current.Resources["PanelBrush"] = SystemColors.WindowBrush;
            Application.Current.Resources["PanelRaisedBrush"] = SystemColors.ControlBrush;
            Application.Current.Resources["TextBrush"] = SystemColors.WindowTextBrush;
            Application.Current.Resources["MutedBrush"] = SystemColors.GrayTextBrush;
            Application.Current.Resources["RailBrush"] = SystemColors.ControlBrush;
            Application.Current.Resources["CardBrush"] = SystemColors.WindowBrush;
            Application.Current.Resources["CardBorderBrush"] = SystemColors.WindowTextBrush;
            Application.Current.Resources["InputBrush"] = SystemColors.WindowBrush;
            Application.Current.Resources["DividerBrush"] = SystemColors.GrayTextBrush;
            Application.Current.Resources["DetailsBrush"] = SystemColors.WindowBrush;
            Application.Current.Resources["HoverBrush"] = SystemColors.ControlBrush;
            Application.Current.Resources["SelectedBrush"] = SystemColors.HighlightBrush;
            Application.Current.Resources["BackdropScrimBrush"] = SystemColors.WindowBrush;
            SectionBackdrop.Opacity = 0;
            AuroraLayer.Opacity = 0;
            AuroraLayerTwo.Opacity = 0;
            PatternLayer.Opacity = 0;
            VignetteLayer.Opacity = 0;
            return;
        }
        var light = _theme == "light";
        var oled = _theme == "oled";
        SetBrush("WindowBrush", light ? "#EEF3F8" : oled ? "#000000" : "#0A0D14");
        SetBrush("PanelBrush", light ? "#F8FAFD" : oled ? "#080A0E" : "#111722");
        SetBrush("PanelRaisedBrush", light ? "#E5ECF4" : oled ? "#11151C" : "#182131");
        SetBrush("TextBrush", light ? "#182131" : "#F5F7FB");
        SetBrush("MutedBrush", light ? "#526177" : "#A7B3C7");
        SetBrush("RailBrush", light ? "#E2EAF3" : oled ? "#030405" : "#0D121C");
        SetBrush("CardBrush", light ? "#FFFFFF" : oled ? "#080B10" : "#111925");
        SetBrush("CardBorderBrush", light ? "#BCC8D7" : oled ? "#263040" : "#2B3A51");
        SetBrush("InputBrush", light ? "#FFFFFF" : oled ? "#030405" : "#0C111A");
        SetBrush("DividerBrush", light ? "#B8C4D3" : oled ? "#1D2531" : "#263247");
        SetBrush("DetailsBrush", light ? "#FAE8EEF7" : oled ? "#FC000000" : "#FA0A0D14");
        SetBrush("HoverBrush", light ? "#D3E4F5" : oled ? "#151B24" : "#22324A");
        SetBrush("SelectedBrush", light ? "#C9E5F5" : oled ? "#10283A" : "#17324B");
        SetBrush("BackdropScrimBrush", light ? "#E8EEF3F8" : oled ? "#E6000000" : "#CC0A0D14");
        SetBrush("DangerBrush", light ? "#B4233A" : "#FF6577");
        SetBrush("SuccessBrush", light ? "#16785D" : "#5DE2B5");
        SetBrush("WarningBrush", light ? "#9A6700" : "#FFD166");
        SetSystemBrush(SystemColors.WindowBrushKey, light ? "#FFFFFF" : oled ? "#030405" : "#0C111A");
        SetSystemBrush(SystemColors.WindowTextBrushKey, light ? "#182131" : "#F5F7FB");
        SetSystemBrush(SystemColors.ControlBrushKey, light ? "#F2F6FB" : oled ? "#080B10" : "#111925");
        SetSystemBrush(SystemColors.ControlTextBrushKey, light ? "#182131" : "#F5F7FB");
        SetSystemBrush(SystemColors.HighlightBrushKey, light ? "#C9E5F5" : oled ? "#10283A" : "#17324B");
        SetSystemBrush(SystemColors.HighlightTextBrushKey, light ? "#182131" : "#F5F7FB");
        SectionBackdrop.Opacity = light ? 0.045 : 0.12;
        /* The ambient glow and weave are tuned per theme: barely there in light
           mode, absent on OLED where the point is a true black background. */
        AuroraLayer.Opacity = light ? 0.30 : oled ? 0.0 : 1.0;
        AuroraLayerTwo.Opacity = light ? 0.22 : oled ? 0.0 : 0.85;
        PatternLayer.Opacity = light ? 0.18 : oled ? 0.14 : 0.35;
        VignetteLayer.Opacity = light ? 0.0 : oled ? 0.5 : 1.0;
        ThemeButton.Content = light ? "Dark mode" : oled ? "Light mode" : "Light mode";
        UpdateRailSelection();
    }
    private static void SetBrush(string key, string color)
    {
        var value = (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(color);
        Application.Current.Resources[key] = new System.Windows.Media.SolidColorBrush(value);
    }
    private static void SetSystemBrush(ResourceKey key, string color)
    {
        var value = (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(color);
        Application.Current.Resources[key] = new System.Windows.Media.SolidColorBrush(value);
    }

    private void LibrarySort_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (!IsLoaded) return;
        if (_section == "Games") RefreshGames();
        else if (_section is "Movies" or "Series") RefreshMedia();
    }
    private void MediaFilter_Changed(object sender, SelectionChangedEventArgs e) { if (IsLoaded && _section is "Movies" or "Series") RefreshMedia(); }
    private void MediaGenre_TextChanged(object sender, TextChangedEventArgs e) { if (IsLoaded && _section is "Movies" or "Series") RefreshMedia(); }

    private async void AddMedia_Click(object sender, RoutedEventArgs e)
    {
        var collection = _section == "Movies" ? "movieWatchlist" : "seriesWatchlist";
        var dialog = new ItemEditorWindow(collection) { Owner = this };
        if (dialog.ShowDialog() != true) return;
        await RunBusyAsync("Adding title...", () => _vault.AddAsync(collection, dialog.Item));
        _mediaMode = "watchlist";
        RefreshAll();
    }

    private async void FindOnline_Click(object sender, RoutedEventArgs e)
    {
        var type = _section == "Games" ? "Game" : _section == "Movies" ? "Movie" : "TV Show";
        var dialog = new CatalogSearchWindow(_catalog, type) { Owner = this };
        if (dialog.ShowDialog() != true || dialog.SelectedItem is null) return;
        var destination = type == "Game" ? "queue" : type == "Movie" ? "movieWatchlist" : "seriesWatchlist";
        await RunBusyAsync("Adding online result...", async () =>
        {
            await _vault.AddAsync(destination, dialog.SelectedItem);
            if (destination == "queue") await UpdateAvailabilityAsync(dialog.SelectedItem);
        });
        if (type == "Game") SelectGameCollection("queue"); else _mediaMode = "watchlist";
        RefreshAll();
    }

    private async void RefreshOnline_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (_section == "Games")
            {
                if (_gameCollection == "queue")
                {
                    await RefreshQueueAvailabilityAsync();
                    RefreshAll();
                    StatusText.Text = "Rental availability refreshed.";
                    return;
                }
                var upcoming = _gameCollection == "upcoming";
                var items = await _catalog.GameCatalogAsync(upcoming);
                var destination = upcoming ? "upcoming" : "catalogExtra";
                var hidden = upcoming ? _vault.Collection("upcomingRemoved").OfType<JsonObject>().Select(item => NormalizedTitle(Text(item, "name"))).ToHashSet() : [];
                var array = new JsonArray(items.Where(item => !hidden.Contains(NormalizedTitle(Text(item, "name")))).Select(item => (JsonNode)item.DeepClone()).ToArray());
                await _vault.SetRootValueAsync(destination, array);
                _gameCollection = destination;
                SelectGameCollection(destination);
            }
            else
            {
                var mediaType = _section == "Movies" ? "Movie" : "TV Show";
                var catalogModes = _section == "Movies" ? new[] { "uphw", "bluray", "relhw", "mlott", "mlup" } : new[] { "seriesnew", "seriesupcoming", "enseries", "mlseries", "taseries", "hiseries" };
                var mode = catalogModes.Contains(_mediaMode) ? _mediaMode : (_section == "Movies" ? "relhw" : "enseries");
                var items = await _catalog.MediaCatalogAsync(mediaType, mode);
                var root = _vault.Root["nativeTvCatalog"]?.DeepClone() as JsonObject ?? new JsonObject();
                var typeKey = _section == "Movies" ? "movies" : "series";
                if (root[typeKey] is not JsonObject typeRoot) { typeRoot = new JsonObject(); root[typeKey] = typeRoot; }
                typeRoot[mode] = new JsonArray(items.Select(item => (JsonNode)item.DeepClone()).ToArray());
                await _vault.SetRootValueAsync("nativeTvCatalog", root);
                _mediaMode = mode;
            }
            RefreshAll();
            StatusText.Text = "Online catalog refreshed.";
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Catalog", "Online catalog refresh failed", ex);
            StatusText.Text = ex.Message.Contains("404", StringComparison.OrdinalIgnoreCase)
                ? "The online catalog is temporarily unavailable. Existing titles remain visible."
                : $"Catalog refresh paused: {ex.Message}";
        }
    }

    private async Task RefreshQueueAvailabilityAsync()
    {
        foreach (var item in _vault.Collection("queue").OfType<JsonObject>().ToList())
        {
            StatusText.Text = $"Checking rental availability: {Text(item, "name", "title")}";
            await UpdateAvailabilityAsync(item);
        }
    }

    private async Task EnsureQueueAvailabilityAsync()
    {
        if (_refreshingQueueAvailability) return;
        var staleBefore = DateTimeOffset.UtcNow.Subtract(TimeSpan.FromHours(6)).ToUnixTimeMilliseconds();
        var pending = _vault.Collection("queue").OfType<JsonObject>()
            .Where(item => item["shops"] is not JsonObject shops || Number(shops, "t") < staleBefore)
            .ToList();
        if (pending.Count == 0) return;
        _refreshingQueueAvailability = true;
        try
        {
            foreach (var item in pending)
            {
                StatusText.Text = $"Checking The Game Hub and Gamer Planet for {Text(item, "name", "title")}...";
                await UpdateAvailabilityAsync(item);
                if (_section == "Games" && _gameCollection == "queue") RefreshGames();
            }
            StatusText.Text = $"Rental availability checked for {pending.Count} queued game{(pending.Count == 1 ? "" : "s")}.";
        }
        finally { _refreshingQueueAvailability = false; }
    }

    private async Task UpdateAvailabilityAsync(JsonObject item)
    {
        var title = Text(item, "name", "title");
        if (title.Length == 0) return;
        item["shops"] = await _availability.CheckAsync(title);
        await _vault.UpdateAsync("queue", item);
    }

    private async void EditSelected_Click(object sender, RoutedEventArgs e)
    {
        var row = _selectedRow;
        if (row is null)
        {
            MessageBox.Show(this, "Open a title first, then choose Edit details.", "GameVault", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        var dialog = new ItemEditorWindow(row.Collection, row.Source) { Owner = this };
        if (dialog.ShowDialog() != true) return;
        await RunBusyAsync("Saving changes...", () => _vault.UpdateAsync(row.Collection, dialog.Item));
        DetailsPage.Visibility = Visibility.Collapsed;
        RefreshAll();
    }

    private void RentalHistory_Click(object sender, RoutedEventArgs e)
    {
        _gameCollection = "rentalHistory";
        PageSubtitle.Text = "Games · Rental history (fully editable)";
        RefreshGames();
    }

    private void VendorReport_Click(object sender, RoutedEventArgs e)
    {
        var records = _vault.Collection("rentals").Concat(_vault.Collection("rentalHistory")).OfType<JsonObject>();
        new VendorReportWindow(records) { Owner = this }.ShowDialog();
    }

    private async void ManageSubscriptions_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SubscriptionManagerWindow(_vault.Collection("subscriptions")) { Owner = this };
        if (dialog.ShowDialog() != true) return;
        await RunBusyAsync("Saving subscriptions...", () => _vault.SetRootValueAsync("subscriptions", dialog.Result));
        RefreshAll();
    }

    private async void AddGame_Click(object sender, RoutedEventArgs e)
    {
        var collection = _gameCollection == "rentalHistory" ? "rentals" : _gameCollection;
        var dialog = new ItemEditorWindow(collection) { Owner = this };
        if (dialog.ShowDialog() != true) return;
        if (collection == "subscriptionGames" && _vault.Collection("subscriptions").OfType<JsonObject>().Any())
        {
            var picker = new SubscriptionPickerWindow(_vault.Collection("subscriptions").OfType<JsonObject>()) { Owner = this };
            if (picker.ShowDialog() != true || picker.SelectedSubscription is null) return;
            dialog.Item["subscriptionId"] = Text(picker.SelectedSubscription, "id");
            dialog.Item["provider"] = Text(picker.SelectedSubscription, "service");
        }
        await RunBusyAsync("Saving game...", async () =>
        {
            await _vault.AddAsync(collection, dialog.Item);
            if (collection == "subscriptionGames")
            {
                var playing = dialog.Item.DeepClone() as JsonObject ?? [];
                playing["source"] = "subscription";
                playing["status"] = "Playing";
                await _vault.AddAsync("playing", playing);
            }
            if (collection == "queue") await UpdateAvailabilityAsync(dialog.Item);
        });
        SelectGameCollection(collection);
        RefreshAll();
    }

    private void SelectGameCollection(string collection)
    {
        foreach (var item in GamesTabs.Items.OfType<TabItem>())
            if (string.Equals(item.Tag?.ToString(), collection, StringComparison.OrdinalIgnoreCase)) GamesTabs.SelectedItem = item;
    }

    private async void RemoveGame_Click(object sender, RoutedEventArgs e)
    {
        var row = _selectedRow;
        if (row is null) return;
        if (MessageBox.Show(this, $"Remove “{row.Name}” from this collection?\n\nThe native app will create a recovery snapshot first.",
                "Confirm removal", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        CaptureUndo();
        await RunBusyAsync("Removing game…", () => _vault.RemoveAsync(_gameCollection, row.Id));
        RefreshAll();
    }

    private async void Import_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog { Filter = "GameVault backup (*.json)|*.json|All files (*.*)|*.*", Title = "Import GameVault backup" };
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            await RunBusyAsync("Importing backup…", () => _vault.ImportAsync(dialog.FileName));
            RefreshAll();
            MessageBox.Show(this, "Backup imported successfully. Your original native vault was saved as a recovery snapshot.", "GameVault", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Import failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SaveFileDialog { Filter = "GameVault backup (*.json)|*.json", FileName = $"game-vault-windows-{DateTime.Today:yyyy-MM-dd}.json", Title = "Export GameVault backup" };
        if (dialog.ShowDialog(this) != true) return;
        await RunBusyAsync("Exporting backup…", () => _vault.ExportAsync(dialog.FileName));
        StatusText.Text = $"Backup exported to {dialog.FileName}";
    }

    private async void GlobalRefresh_Click(object sender, RoutedEventArgs e)
    {
        if (_drive.Connected) await SyncDriveAsync(silent: false);
        else { await _vault.LoadAsync(); RefreshAll(); }
        if (_section == "Plex") await RefreshPlexAsync(force: true);
        if (_section == "BiglyBT") await RefreshBiglyAsync();
        StatusText.Text = $"Refreshed {DateTime.Now:t}";
    }

    private async Task RunBusyAsync(string message, Func<Task> action)
    {
        StatusText.Text = message;
        GlobalProgress.Visibility = Visibility.Visible;
        Mouse.OverrideCursor = Cursors.Wait;
        try { await action(); }
        finally
        {
            Mouse.OverrideCursor = null;
            GlobalProgress.Visibility = Visibility.Collapsed;
            StatusText.Text = "Ready";
        }
    }

    private async void PlexMode_Click(object sender, RoutedEventArgs e)
    {
        CloseDetails();
        _plexMode = (sender as Button)?.Tag?.ToString() ?? "continue";
        await RefreshPlexAsync();
    }

    private async void PlexRefresh_Click(object sender, RoutedEventArgs e) => await RefreshPlexAsync(force: true);

    private async Task RefreshPlexAsync(bool force = false)
    {
        PlexSetupPanel.Visibility = _plex.Connected ? Visibility.Collapsed : Visibility.Visible;
        PlexLibraryScroll.Visibility = _plex.Connected ? Visibility.Visible : Visibility.Collapsed;
        if (!_plex.Connected) { PlexStatusText.Text = "Not connected"; return; }
        PlexStatusText.Text = "Loading Plex...";
        try
        {
            var items = _plexMode == "continue" ? await _plex.ContinueWatchingAsync(force) : await _plex.LibraryAsync(_plexMode == "recent" ? "all" : _plexMode, force);
            if (_plexMode == "recent") items = items.Take(50).ToList();
            _plexRows.Clear();
            foreach (var item in items)
            {
                var progress = item.Duration > 0 ? Math.Clamp(item.ViewOffset * 100d / item.Duration, 0, 100) : 0;
                var source = new JsonObject
                {
                    ["id"] = $"plex:{item.RatingKey}", ["plexRatingKey"] = item.RatingKey, ["title"] = item.Title,
                    ["year"] = item.Year, ["overview"] = item.Summary, ["poster"] = item.Thumb, ["backdrop"] = item.Art,
                    ["rating"] = item.Rating, ["genre"] = item.Genres, ["status"] = item.ViewCount > 0 ? "Watched" : progress > 0 ? $"{progress:0}% watched" : "Unwatched",
                    ["plexType"] = item.Type
                };
                _plexRows.Add(ReadNodes(new JsonArray(source), "plex").First());
                if (item.ViewCount > 0) await SyncPlexWatchedRecordAsync(source, item.Type is "show" or "season" or "episode" ? "TV Show" : "Movie");
            }
            PlexStatusText.Text = $"{_plexRows.Count} items";
            UpdateSectionBackdrop();
        }
        catch (Exception ex)
        {
            PlexStatusText.Text = ex.Message;
            PlexSetupPanel.Visibility = Visibility.Visible;
            PlexLibraryScroll.Visibility = Visibility.Collapsed;
        }
    }

    private async Task SyncPlexWatchedRecordAsync(JsonObject source, string mediaType)
    {
        var watched = mediaType == "Movie" ? "watchedMovies" : "watchedSeries";
        var watching = mediaType == "Movie" ? "watchingMovies" : "watchingSeries";
        var watchlist = mediaType == "Movie" ? "movieWatchlist" : "seriesWatchlist";
        var name = Text(source, "title", "name");
        var year = Text(source, "year");
        if (!_vault.Collection(watched).OfType<JsonObject>().Any(item => SameTitleAndYear(item, name, year)))
        {
            var clone = source.DeepClone() as JsonObject ?? []; clone["status"] = "Watched"; clone["plexSyncedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await _vault.AddAsync(watched, clone);
        }
        await RemoveMatchingTitleAsync(watching, name, year);
        await RemoveMatchingTitleAsync(watchlist, name, year);
    }

    private async void BiglyRefresh_Click(object sender, RoutedEventArgs e) { _lastBiglyInteraction = DateTime.Now; _biglyRefreshTimer.Start(); await RefreshBiglyAsync(); }

    private void BiglyInteraction(object sender, InputEventArgs e)
    {
        if (_section != "BiglyBT") return;
        _lastBiglyInteraction = DateTime.Now;
        if (!_biglyRefreshTimer.IsEnabled) { _biglyRefreshTimer.Start(); _ = RefreshBiglyAsync(silent: true); }
    }

    private async void BiglyRefreshTimer_Tick(object? sender, EventArgs e)
    {
        if (_section != "BiglyBT" || DateTime.Now - _lastBiglyInteraction >= TimeSpan.FromMinutes(5)) { _biglyRefreshTimer.Stop(); return; }
        await RefreshBiglyAsync(silent: true);
    }

    private async Task RefreshBiglyAsync(bool silent = false)
    {
        if (_refreshingBigly) return;
        _refreshingBigly = true;
        BiglySetupPanel.Visibility = _bigly.Connected ? Visibility.Collapsed : Visibility.Visible;
        if (!_bigly.Connected)
        {
            BiglyGrid.Visibility = Visibility.Collapsed;
            BiglyStatusText.Text = "Not connected";
            ShowBiglyHistory(false);
            _refreshingBigly = false;
            return;
        }
        if (!silent) BiglyStatusText.Text = "Refreshing...";
        try
        {
            var result = await _bigly.TorrentsAsync();
            var items = (result["torrents"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
            var incoming = new List<TorrentRow>();
            foreach (var item in items)
            {
                var statusCode = (int)JsonNumber(item, "status");
                incoming.Add(new TorrentRow
                {
                    Id = (int)JsonNumber(item, "id"), Name = Text(item, "name"), Status = TorrentStatus(statusCode, Text(item, "errorString")),
                    Progress = JsonNumber(item, "percentDone") * 100, TotalSize = (long)JsonNumber(item, "totalSize"), Downloaded = (long)JsonNumber(item, "downloadedEver"),
                    RateDown = (long)JsonNumber(item, "rateDownload"), RateUp = (long)JsonNumber(item, "rateUpload"), Eta = (long)JsonNumber(item, "eta"),
                    Peers = (int)JsonNumber(item, "peersConnected"), Priority = (int)JsonNumber(item, "bandwidthPriority"), Hash = Text(item, "hashString")
                });
            }
            /* Index by id instead of scanning. This runs every two seconds, and it
               previously copied the whole row list once per torrent to find a match. */
            var incomingIds = incoming.Select(item => item.Id).ToHashSet();
            foreach (var removed in _torrentRows.Where(existing => !incomingIds.Contains(existing.Id)).ToList()) _torrentRows.Remove(removed);
            var positions = new Dictionary<int, int>();
            for (var i = 0; i < _torrentRows.Count; i++) positions[_torrentRows[i].Id] = i;
            for (var index = 0; index < incoming.Count; index++)
            {
                var item = incoming[index];
                if (positions.TryGetValue(item.Id, out var existingIndex))
                {
                    if (!TorrentEquals(_torrentRows[existingIndex], item)) _torrentRows[existingIndex] = item;
                    continue;
                }
                _torrentRows.Insert(Math.Min(index, _torrentRows.Count), item);
                positions.Clear();
                for (var i = 0; i < _torrentRows.Count; i++) positions[_torrentRows[i].Id] = i;
            }
            if (BiglyAutoRemoveBox.IsChecked == true)
            {
                var completed = _torrentRows.Where(row => row.TotalSize > 0 && row.Downloaded >= row.TotalSize && row.Progress >= 99.999
                    && !row.Status.Contains("Error", StringComparison.OrdinalIgnoreCase)).ToList();
                foreach (var row in completed)
                {
                    if (!_vault.Collection("biglyHistory").OfType<JsonObject>().Any(item => Text(item, "hash") == row.Hash && Text(item, "outcome").StartsWith("Completed", StringComparison.OrdinalIgnoreCase)))
                        await RecordTorrentHistoryAsync(row, "Completed - auto removed", false);
                    await _bigly.RemoveAsync(row.Id, false);
                    _torrentRows.Remove(row);
                }
            }
            BiglySetupPanel.Visibility = Visibility.Collapsed;
            BiglyGrid.Visibility = Visibility.Visible;
            BiglyActiveCount.Text = _torrentRows.Count(row => row.Progress < 100).ToString();
            BiglyTransferSpeed.Text = $"↓ {FormatBytes(_torrentRows.Sum(row => row.RateDown))}/s  ↑ {FormatBytes(_torrentRows.Sum(row => row.RateUp))}/s";
            BiglyRemainingData.Text = FormatBytes(_torrentRows.Sum(row => Math.Max(0, row.TotalSize - row.Downloaded)));
            ShowBiglyHistory(false);
            BiglyStatusText.Text = $"{_torrentRows.Count} torrents · updated {DateTime.Now:t}";
        }
        catch (Exception ex)
        {
            BiglyStatusText.Text = ex.Message;
            if (!_bigly.Connected) BiglySetupPanel.Visibility = Visibility.Visible;
        }
        finally { _refreshingBigly = false; }
    }

    private static bool TorrentEquals(TorrentRow left, TorrentRow right) => left.Id == right.Id && left.Status == right.Status
        && Math.Abs(left.Progress - right.Progress) < 0.01 && left.Downloaded == right.Downloaded && left.TotalSize == right.TotalSize
        && left.RateDown == right.RateDown && left.RateUp == right.RateUp && left.Eta == right.Eta && left.Peers == right.Peers && left.Priority == right.Priority;

    private async void BiglyPaste_Click(object sender, RoutedEventArgs e)
    {
        var text = Clipboard.ContainsText() ? Clipboard.GetText().Trim() : "";
        var start = text.IndexOf("magnet:?", StringComparison.OrdinalIgnoreCase);
        if (start >= 0) text = text[start..].Split(['\r', '\n', ' '], StringSplitOptions.RemoveEmptyEntries)[0];
        if (!text.StartsWith("magnet:?", StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(this, "The clipboard does not contain a magnet link.", "BiglyBT", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        await BiglyActionAsync("Adding torrent...", () => _bigly.AddMagnetAsync(text));
    }
    private async void BiglyStart_Click(object sender, RoutedEventArgs e) { if (SelectedTorrent() is { } row) await BiglyActionAsync("Starting...", () => _bigly.StartAsync(row.Id)); }
    private async void BiglyStop_Click(object sender, RoutedEventArgs e) { if (SelectedTorrent() is { } row) await BiglyActionAsync("Pausing...", () => _bigly.StopAsync(row.Id)); }
    private async void BiglyRemove_Click(object sender, RoutedEventArgs e) => await RemoveTorrentAsync(false);
    private async void BiglyDelete_Click(object sender, RoutedEventArgs e) => await RemoveTorrentAsync(true);
    private async void BiglyPriority_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (!IsLoaded || BiglyPriorityBox.SelectedItem is not ComboBoxItem item || !int.TryParse(item.Tag?.ToString(), out var priority) || SelectedTorrent() is not { } row) return;
        await BiglyActionAsync("Changing priority...", () => _bigly.PriorityAsync(row.Id, priority));
        BiglyPriorityBox.SelectedIndex = 0;
    }
    private async Task RemoveTorrentAsync(bool deleteFiles)
    {
        if (SelectedTorrent() is not { } row) return;
        var warning = deleteFiles
            ? $"Permanently remove '{row.Name}' and delete its downloaded files? This cannot be undone."
            : $"Remove '{row.Name}' from BiglyBT but keep all downloaded files?";
        if (MessageBox.Show(this, warning, "Confirm torrent removal", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        await BiglyActionAsync("Removing torrent...", async () =>
        {
            await _bigly.RemoveAsync(row.Id, deleteFiles);
            await RecordTorrentHistoryAsync(row, row.Progress >= 100 ? "Completed - manually removed" : "Removed before completion", deleteFiles);
        });
    }
    private TorrentRow? SelectedTorrent()
    {
        if (BiglyGrid.SelectedItem is TorrentRow row) return row;
        MessageBox.Show(this, "Select a torrent first.", "BiglyBT", MessageBoxButton.OK, MessageBoxImage.Information);
        return null;
    }
    private async Task BiglyActionAsync(string message, Func<Task> action)
    {
        BiglyStatusText.Text = message;
        try { await action(); await RefreshBiglyAsync(); }
        catch (Exception ex) { BiglyStatusText.Text = ex.Message; }
    }
    private void ShowBiglyHistory(bool updateStatus = true)
    {
        _torrentHistoryRows.Clear();
        foreach (var item in _vault.Collection("biglyHistory").OfType<JsonObject>().OrderByDescending(item => JsonNumber(item, "at")))
        {
            var at = (long)JsonNumber(item, "at");
            _torrentHistoryRows.Add(new TorrentHistoryRow
            {
                Name = Text(item, "name"), Outcome = Text(item, "outcome"), Date = at > 0 ? DateTimeOffset.FromUnixTimeMilliseconds(at).LocalDateTime.ToString("g") : "",
                Progress = $"{JsonNumber(item, "progress"):0.#}%", Downloaded = FormatBytes((long)JsonNumber(item, "downloaded")), Files = item["filesDeleted"]?.ToString() == "true" ? "Deleted" : "Kept"
            });
        }
        BiglyHistoryGrid.Visibility = Visibility.Visible;
        if (updateStatus) BiglyStatusText.Text = $"{_torrentHistoryRows.Count} history records";
    }
    private Task RecordTorrentHistoryAsync(TorrentRow row, string outcome, bool filesDeleted) => _vault.AddAsync("biglyHistory", new JsonObject
    {
        ["id"] = $"native:{row.Hash}:{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", ["hash"] = row.Hash, ["name"] = row.Name,
        ["outcome"] = outcome, ["progress"] = row.Progress, ["downloaded"] = row.Downloaded, ["total"] = row.TotalSize,
        ["filesDeleted"] = filesDeleted, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
    });
    private static string TorrentStatus(int status, string error) => error.Length > 0 ? $"Error: {error}" : status switch { 0 => "Paused", 1 => "Queued to verify", 2 => "Verifying", 3 => "Queued", 4 => "Downloading", 5 => "Queued to seed", 6 => "Seeding", _ => "Unknown" };
    private static string FormatBytes(long value)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"]; double size = Math.Max(0, value); var unit = 0;
        while (size >= 1024 && unit < units.Length - 1) { size /= 1024; unit++; }
        return $"{size:0.#} {units[unit]}";
    }

#if false // Health was removed from the Windows application in 2.0.5.
    private JsonObject HealthRoot()
    {
        if (_vault.Root["health"] is not JsonObject health)
        {
            health = new JsonObject { ["foodLog"] = new JsonArray(), ["labs"] = new JsonArray(), ["targets"] = new JsonObject() };
            _vault.Root["health"] = health;
        }
        health["foodLog"] ??= new JsonArray(); health["labs"] ??= new JsonArray(); health["targets"] ??= new JsonObject();
        return health;
    }

    private void RefreshHealth()
    {
        var health = HealthRoot();
        var log = health["foodLog"] as JsonArray ?? [];
        var targets = health["targets"] as JsonObject ?? [];
        var start = DateTime.Today.AddDays(-(((int)DateTime.Today.DayOfWeek + 6) % 7));
        var week = log.OfType<JsonObject>().Where(item => DateTime.TryParse(Text(item, "date"), out var date) && date.Date >= start).ToList();
        double Sum(string type)
        {
            var field = HealthField(type);
            return week.Sum(item => item[field] is not null
                ? JsonNumber(item, field)
                : Text(item, "type") == type ? Math.Max(1, JsonNumber(item, "amount")) : 0);
        }
        double Target(string key, double fallback) => targets[key] is null ? fallback : JsonNumber(targets, key);
        PlantMealsText.Text = $"{Sum("plant"):0} / {Target("plantMeals", 10):0}";
        ActivityText.Text = $"{Sum("activity"):0} / {Target("activityMinutes", 150):0} min";
        FishMealsText.Text = $"{Sum("fish"):0} / {Target("fishMeals", 2):0}";
        LimitMealsText.Text = $"{Sum("redMeat") + Sum("fried"):0} / {Target("redMeatMeals", 1) + Target("friedMeals", 1):0}";
        HealthLogList.Items.Clear();
        foreach (var item in log.OfType<JsonObject>().OrderByDescending(item => Text(item, "date")).Take(40))
        {
            var type = Text(item, "type");
            if (type.Length > 0)
                HealthLogList.Items.Add($"{Text(item, "date")}   {HealthTypeName(type)}   {JsonNumber(item, "amount"):0.#}   {Text(item, "note", "notes")}".Trim());
            else
            {
                var meals = JsonNumber(item, "plantMeals") + JsonNumber(item, "fishMeals") + JsonNumber(item, "poultryMeals") + JsonNumber(item, "redMeatMeals");
                HealthLogList.Items.Add($"{Text(item, "date")}   {meals:0} meals · {JsonNumber(item, "vegetableServings"):0} veg · {JsonNumber(item, "activityMinutes"):0} min · {JsonNumber(item, "sleepHours"):0.#} h sleep   {Text(item, "notes")}".Trim());
            }
        }
        if (HealthLogList.Items.Count == 0) HealthLogList.Items.Add("No entries yet. Add the first meal or activity on the right.");
        foreach (var lab in (health["labs"] as JsonArray ?? []).OfType<JsonObject>().OrderByDescending(item => Text(item, "date")).Take(10))
            HealthLogList.Items.Add($"LAB  {Text(lab, "date")}   {Text(lab, "test")}: {Text(lab, "value")} {Text(lab, "unit")}   {Text(lab, "note")}".Trim());
        HealthDateBox.SelectedDate ??= DateTime.Today;
    }

    private async void HealthAdd_Click(object sender, RoutedEventArgs e)
    {
        if (HealthTypeBox.SelectedItem is not ComboBoxItem selected) return;
        var type = selected.Tag?.ToString() ?? "plant";
        if (!double.TryParse(HealthAmountBox.Text, out var amount) || amount <= 0) amount = 1;
        var health = HealthRoot().DeepClone() as JsonObject ?? [];
        var log = health["foodLog"] as JsonArray ?? new JsonArray(); health["foodLog"] = log;
        var date = (HealthDateBox.SelectedDate ?? DateTime.Today).ToString("yyyy-MM-dd");
        var entry = log.OfType<JsonObject>().FirstOrDefault(item => Text(item, "date") == date && Text(item, "type").Length == 0);
        if (entry is null)
        {
            entry = new JsonObject { ["date"] = date, ["notes"] = "" };
            log.Insert(0, entry);
        }
        var field = HealthField(type);
        if (field == "strength") entry[field] = true;
        else entry[field] = JsonNumber(entry, field) + amount;
        if (HealthNoteBox.Text.Trim().Length > 0) entry["notes"] = HealthNoteBox.Text.Trim();
        await _vault.SetRootValueAsync("health", health);
        HealthNoteBox.Clear(); HealthAmountBox.Text = "1"; RefreshHealth();
    }

    private async void HealthLab_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new HealthLabWindow { Owner = this };
        if (dialog.ShowDialog() != true || dialog.Item is null) return;
        var health = HealthRoot().DeepClone() as JsonObject ?? [];
        var labs = health["labs"] as JsonArray ?? new JsonArray(); health["labs"] = labs; labs.Insert(0, dialog.Item);
        await _vault.SetRootValueAsync("health", health); RefreshHealth();
    }
    private async void HealthTargets_Click(object sender, RoutedEventArgs e)
    {
        var health = HealthRoot().DeepClone() as JsonObject ?? [];
        var dialog = new HealthTargetsWindow(health["targets"] as JsonObject ?? []) { Owner = this };
        if (dialog.ShowDialog() != true) return;
        health["targets"] = dialog.Targets; await _vault.SetRootValueAsync("health", health); RefreshHealth();
    }
    private static string HealthField(string type) => type switch
    {
        "plant" => "plantMeals", "fish" => "fishMeals", "poultry" => "poultryMeals", "redMeat" => "redMeatMeals",
        "fried" => "friedMeals", "sugary" => "sugaryItems", "fruit" => "fruitServings", "vegetable" => "vegetableServings",
        "wholeGrain" => "wholeGrainMeals", "water" => "waterCups", "activity" => "activityMinutes", "strength" => "strength", "sleep" => "sleepHours", _ => type
    };
    private static string HealthTypeName(string type) => type switch { "plant" => "Plant-based meal", "fish" => "Fish meal", "poultry" => "Poultry / egg meal", "redMeat" => "Red meat meal", "fried" => "Fried / takeaway", "sugary" => "Sugary item", "fruit" => "Fruit serving", "vegetable" => "Vegetable serving", "wholeGrain" => "Whole grain / legume", "water" => "Water cup", "activity" => "Activity minutes", "strength" => "Strength day", "sleep" => "Sleep hours", _ => type };

#endif
    private async void DriveSignIn_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _drive.ClientId = string.IsNullOrWhiteSpace(DriveClientIdBox.Text) ? DriveService.DefaultClientId : DriveClientIdBox.Text.Trim();
            _drive.ClientSecret = DriveClientSecretBox.Password.Trim();
            var progress = new Progress<string>(message => DriveSettingsStatus.Text = message);
            await _drive.SignInWithBrowserAsync(progress);
            UpdateDriveStatus();
            await SyncDriveAsync(silent: false);
        }
        catch (Exception ex)
        {
            DriveSettingsStatus.Text = "Google sign-in failed";
            MessageBox.Show(this, ex.Message, "Google sign-in failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void DriveSync_Click(object sender, RoutedEventArgs e) => await SyncDriveAsync(silent: false);

    private void DriveDisconnect_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show(this, "Disconnect Google Drive on this Windows PC? Your local vault will remain available.", "Disconnect Drive",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        _drive.Disconnect();
        UpdateDriveStatus();
    }

    private async Task SyncDriveAsync(bool silent)
    {
        if (!_drive.Connected || _syncingDrive) return;
        _syncingDrive = true;
        _driveSyncTimer.Stop();
        try
        {
            DriveHeaderStatus.Text = "Drive syncing…";
            var revisionBefore = _vault.Root["revision"]?.GetValue<long?>() ?? 0;
            var updatedBefore = _vault.UpdatedAt;
            var result = await _drive.SyncAsync(_vault);
            DriveSettingsStatus.Text = result;
            DriveHeaderStatus.Text = "Drive connected";
            await UpdateDriveBackupInfoAsync();
            /* Only rebuild the lists when the sync actually brought something back.
               Refreshing unconditionally rewrote every view on each background
               sync, losing the user's place while they were still browsing. */
            var changed = (_vault.Root["revision"]?.GetValue<long?>() ?? 0) != revisionBefore || _vault.UpdatedAt != updatedBefore;
            if (changed) RefreshAll();
            if (!silent) StatusText.Text = result;
        }
        catch (Exception ex)
        {
            DriveHeaderStatus.Text = "Drive needs attention";
            DriveSettingsStatus.Text = ex.Message;
            if (!silent && !_windowIsClosing) MessageBox.Show(this, ex.Message, "Google Drive sync", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        finally
        {
            _syncingDrive = false;
            if (_driveSyncPending) { _driveSyncPending = false; ScheduleDriveSync(); }
        }
    }

    private void ScheduleDriveSync()
    {
        if (!_drive.Connected) return;
        /* A save that lands while a sync is already running used to be dropped
           entirely — the timer was never re-armed, so that change waited for the
           next unrelated save before it reached Drive. Remember it instead and
           re-schedule once the running sync finishes. */
        if (_syncingDrive) { _driveSyncPending = true; return; }
        _driveSyncTimer.Stop();
        _driveSyncTimer.Start();
    }

    private async void DriveSyncTimer_Tick(object? sender, EventArgs e)
    {
        _driveSyncTimer.Stop();
        await SyncDriveAsync(silent: true);
    }

    private void UpdateDriveStatus()
    {
        DriveHeaderStatus.Text = _drive.Connected ? "Drive connected" : "Drive offline";
        DriveSettingsStatus.Text = _drive.Connected ? "Connected securely through Windows Credential Manager" : "Not connected";
        if (!_drive.Connected) DriveBackupInfoText.Text = "Backup details will appear after connection.";
    }

    private async Task UpdateDriveBackupInfoAsync()
    {
        if (!_drive.Connected) return;
        try
        {
            var info = await _drive.BackupInfoAsync();
            if (info is null)
            {
                DriveBackupInfoText.Text = "No game-vault-backup.json file exists yet.";
                return;
            }
            var size = info.SizeBytes >= 1024 * 1024
                ? $"{info.SizeBytes / 1024d / 1024d:0.00} MB"
                : $"{Math.Max(1, info.SizeBytes / 1024d):0.0} KB";
            var modified = info.ModifiedAt?.ToLocalTime().ToString("dd MMM yyyy, h:mm tt") ?? "unknown";
            DriveBackupInfoText.Text = $"Drive backup: {size} · Last updated {modified}";
        }
        catch (Exception ex)
        {
            DriveBackupInfoText.Text = $"Backup details unavailable: {ex.Message}";
        }
    }

    private void SaveApiKeys_Click(object sender, RoutedEventArgs e)
    {
        _catalog.RawgKey = RawgKeyBox.Password;
        _catalog.TmdbKey = TmdbKeyBox.Password;
        _catalog.OmdbKey = OmdbKeyBox.Password;
        StatusText.Text = "Catalog API keys saved securely in Windows Credential Manager.";
    }

    private void SavePlex_Click(object sender, RoutedEventArgs e)
    {
        _plex.ServerUrl = PlexUrlBox.Text;
        _plex.Token = PlexTokenBox.Password;
        StatusText.Text = "Plex settings saved securely in Windows Credential Manager.";
    }

    private async void DiscoverPlex_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var discovered = await _plex.DiscoverServerAsync(PlexTokenBox.Password);
            PlexUrlBox.Text = discovered;
            _plex.ServerUrl = discovered;
            _plex.Token = PlexTokenBox.Password;
            var items = await _plex.LibraryAsync("movie");
            StatusText.Text = $"Plex server discovered and saved. {items.Count} movies found.";
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Plex discovery", MessageBoxButton.OK, MessageBoxImage.Warning); }
    }

    private void PlexTokenHelp_Click(object sender, RoutedEventArgs e) => OpenExternal("https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/");

    private async void BiglySignIn_Click(object sender, RoutedEventArgs e)
    {
        _bigly.Endpoint = BiglyEndpointBox.Text;
        try
        {
            await _bigly.SignInAsync(BiglyUserBox.Text, BiglyPasswordBox.Password);
            BiglyPasswordBox.Clear();
            StatusText.Text = "BiglyBT secure session saved in Windows Credential Manager.";
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "BiglyBT sign-in", MessageBoxButton.OK, MessageBoxImage.Warning); }
    }
    private void BiglyDisconnect_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show(this, "Forget the saved BiglyBT session on this PC?", "BiglyBT", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        _bigly.Disconnect(); StatusText.Text = "BiglyBT session removed.";
    }
    private async void BiglyAutoRemove_Changed(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded || _loadingSettings) return;
        await _vault.SetRootValueAsync("biglyAutoRemoveCompleted", BiglyAutoRemoveBox.IsChecked == true);
    }

    private static string Text(JsonObject node, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (node[key] is JsonValue scalar)
            {
                var value = scalar.ToString();
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
        }
        return "";
    }

    private static double Number(JsonObject node, params string[] keys)
    {
        foreach (var key in keys)
        {
            var text = node[key]?.ToString();
            if (double.TryParse(text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var value)
                || double.TryParse(text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.CurrentCulture, out value)) return value;
        }
        return 0;
    }

    private static double JsonNumber(JsonObject node, params string[] keys) => Number(node, keys);

    private static int Integer(JsonObject node, params string[] keys) => (int)Math.Round(Number(node, keys));
    private static long Long(JsonObject node, params string[] keys)
    {
        foreach (var key in keys) if (long.TryParse(node[key]?.ToString(), System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out var value)) return value;
        return 0;
    }

    private static string ArrayText(JsonObject node, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (node[key] is JsonArray array)
            {
                var values = array.Select(item => item is JsonValue ? item.ToString() : "").Where(value => !string.IsNullOrWhiteSpace(value));
                var result = string.Join(", ", values);
                if (result.Length > 0) return result;
            }
            var scalar = Text(node, key);
            if (scalar.Length > 0) return scalar;
        }
        return "";
    }

    private static string GenreText(JsonObject node)
    {
        var named = Text(node, "genre");
        if (named.Length > 0) return named.Replace("·", " / ");
        if (node["genres"] is JsonArray genres)
        {
            var values = genres.Select(item => item is JsonObject obj ? Text(obj, "name") : item is JsonValue value ? value.ToString() : "")
                .Select(value => int.TryParse(value, out var id) && TmdbGenres.TryGetValue(id, out var mapped) ? mapped : value)
                .Where(value => !string.IsNullOrWhiteSpace(value));
            return string.Join(" / ", values);
        }
        return "";
    }
    private static readonly Dictionary<int, string> TmdbGenres = new()
    {
        [28] = "Action", [12] = "Adventure", [16] = "Animation", [35] = "Comedy", [80] = "Crime", [99] = "Documentary",
        [18] = "Drama", [10751] = "Family", [14] = "Fantasy", [36] = "History", [27] = "Horror", [10402] = "Music",
        [9648] = "Mystery", [10749] = "Romance", [878] = "Science Fiction", [10770] = "TV Movie", [53] = "Thriller",
        [10752] = "War", [37] = "Western", [10759] = "Action & Adventure", [10762] = "Kids", [10763] = "News",
        [10764] = "Reality", [10765] = "Sci-Fi & Fantasy", [10766] = "Soap", [10767] = "Talk", [10768] = "War & Politics"
    };

    private static string RentalReturnDate(JsonObject node)
    {
        var explicitDate = Text(node, "returnDate");
        if (explicitDate.Length > 0) return explicitDate;
        if (DateTime.TryParse(Text(node, "start"), out var start) && Integer(node, "days") > 0)
            return start.AddDays(Integer(node, "days")).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        return Text(node, "date", "added");
    }

    private static string QueueAvailability(JsonObject node, string fallback)
    {
        if (node["shops"] is not JsonObject shops) return fallback;
        var parts = new List<string>();
        if (shops["hub"] is JsonObject hub && string.Equals(hub["found"]?.ToString(), "true", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var (label, key) in new[] { ("Game Hub primary", "primary"), ("Game Hub secondary", "secondary") })
                if (hub[key] is JsonObject option)
                {
                    var next = Text(option, "next"); var price = Number(option, "price");
                    var status = string.Equals(option["now"]?.ToString(), "true", StringComparison.OrdinalIgnoreCase) ? "Available now"
                        : next.Length > 0 ? $"Next: {next}" : "Not available";
                    parts.Add($"{label}: {status} {(price > 0 ? $"· Rs {price:N0}/mo" : "")}".Trim());
                }
        }
        if (shops["gp"] is JsonObject gp && string.Equals(gp["found"]?.ToString(), "true", StringComparison.OrdinalIgnoreCase))
        {
            var status = string.Equals(gp["stock"]?.ToString(), "true", StringComparison.OrdinalIgnoreCase) ? "Available now"
                : string.Equals(gp["pre"]?.ToString(), "true", StringComparison.OrdinalIgnoreCase) ? "PS5 Book / pre-book" : "Not available";
            var price = Number(gp, "rent", "price", "rentalPrice");
            parts.Add($"Gamer Planet: {status} {(price > 0 ? $"· Rs {price:N0}" : "")}".Trim());
        }
        if (parts.Count > 0) return string.Join("  |  ", parts);
        if (shops["t"] is not null) return "Checked The Game Hub and Gamer Planet: no current listing found";
        return fallback;
    }

    private async void LibraryCard_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is not LibraryRow row) return;
        try { await OpenDetailsAsync(row); }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Details", $"Could not open {row.Name}", ex);
            StatusText.Text = "Could not finish loading title details. The saved title is unchanged.";
        }
    }

    private async Task OpenDetailsAsync(LibraryRow row)
    {
        _selectedRow = row;
        // 260-wide frame: 2:3 for posters, 16:9 for game art.
        DetailPosterFrame.Height = row.IsPortraitArt ? 390 : 146;
        SetArtwork(DetailPoster, row.Image, 420);
        SetArtwork(DetailBackdrop, row.Backdrop.Length > 0 ? row.Backdrop : row.Image, 1280);
        DetailType.Text = $"{row.MediaType.ToUpperInvariant()}  /  {row.CategoryLabel.ToUpperInvariant()}";
        DetailTitle.Text = row.Name;
        var duration = Integer(row.Source, "used", "days");
        DetailMeta.Text = string.Join("  |  ", new[] { row.DetailMeta, row.Vendor, row.CostText,
            Text(row.Source, "start") is { Length: > 0 } start ? $"Started {DisplayDate(start)}" : "", duration > 0 ? $"{duration} days" : "" }.Where(value => value.Length > 0).Distinct());
        DetailRating.Text = $"IMDb / rating  {row.RatingText}";
        DetailCountdown.Text = row.DaysText.Length > 0 ? row.DaysText : row.Status;
        DetailEpisodes.Text = string.Join("  |  ", new[] { row.SeasonsText, row.EpisodesText }.Where(x => x.Length > 0));
        DetailEpisodesBadge.Visibility = row.HasEpisodeInfo ? Visibility.Visible : Visibility.Collapsed;
        // Overview (the short IMDb/TMDB synopsis) and the Wikipedia story are shown
        // as separate sections; the synopsis used to be hidden whenever a Wikipedia
        // plot existed, which is why the IMDb overview appeared to be missing.
        DetailSynopsis.Text = row.Overview;
        DetailSynopsisSection.Visibility = row.HasOverview ? Visibility.Visible : Visibility.Collapsed;
        var openWiki = CatalogService.CleanStoryText(Text(row.Source, "wikipediaPlot"));
        DetailStorySection.Visibility = row.MediaType is "Movie" or "TV Show" || row.Collection == "playing" ? Visibility.Visible : Visibility.Collapsed;
        DetailOverview.Text = openWiki.Length > 0 ? openWiki
            : row.MediaType is "Movie" or "TV Show" ? "Loading Wikipedia story..."
            : row.MediaType == "Game" && row.Collection == "playing" ? "Loading Wikipedia plot..."
            : row.Overview.Length > 0 ? row.Overview : "No summary is stored for this title yet.";
        DetailAvailability.Text = row.Availability.Length > 0 ? row.Availability : "No provider or vendor information stored.";
        DetailNote.Text = row.Note;
        FandomButton.Visibility = row.MediaType == "Game" && row.Collection == "playing" ? Visibility.Visible : Visibility.Collapsed;
        RefreshPlotButton.Visibility = row.MediaType is "Movie" or "TV Show" || row.MediaType == "Game" && row.Collection == "playing" ? Visibility.Visible : Visibility.Collapsed;
        VendorLinksButton.Visibility = row.MediaType == "Game" && row.Collection is "queue" or "rentals" ? Visibility.Visible : Visibility.Collapsed;
        VendorRefreshButton.Visibility = row.MediaType == "Game" && row.Collection == "queue" ? Visibility.Visible : Visibility.Collapsed;
        EpisodePicker.Visibility = row.MediaType == "TV Show" ? Visibility.Visible : Visibility.Collapsed;
        MalayalamReviewButtons.Visibility = row.MediaType == "Movie" && (row.Collection == "mlott" || Text(row.Source, "originalLanguage", "original_language") == "ml") ? Visibility.Visible : Visibility.Collapsed;
        var personalRating = Math.Clamp((int)Math.Round(Number(row.Source, "userRating", "myRating")), 0, 10);
        PersonalRatingBox.SelectedIndex = personalRating;
        PopulateEpisodePicker(row);
        DetailMoveButton.Content = PrimaryActionLabel(row);
        DetailRemoveButton.Content = row.Collection == "plex" ? "Delete from Plex" : IsCatalog(row) ? "Not interested" : row.Collection is "hiddenMovies" or "hiddenSeries" or "upcomingRemoved" ? "Delete permanently" : row.Collection == "upcoming" ? "Remove from upcoming" : "Remove";
        DetailsPage.Visibility = Visibility.Visible;
        DetailScroll.ScrollToHorizontalOffset(0);
        DetailScroll.ScrollToTop();
        await _vault.MarkViewedAsync(row.Source, row.MediaType, row.Collection);
        await EnrichOpenTitleAsync(row);
        if (row.Collection == "queue") _ = EnsureQueueAvailabilityAsync();
    }

    private async Task EnrichOpenTitleAsync(LibraryRow row)
    {
        if (row.Collection == "plex") return;
        var changed = false;
        if (row.MediaType is "Movie" or "TV Show")
        {
            var checkedAt = Long(row.Source, "imdbCheckedAt");
            var ratingIsStale = checkedAt <= 0 || DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(checkedAt) > TimeSpan.FromDays(7);
            if (row.Image.Length == 0 || row.Overview.Length == 0 || row.Providers.Length == 0 || row.ImdbId.Length == 0 || ratingIsStale)
            {
                if (DetailOverview.Text.Length == 0 || !DetailStorySection.IsVisible) DetailOverview.Text = "Loading Wikipedia story...";
                if (row.TmdbId.Length == 0)
                {
                    try
                    {
                        var expectedYear = Text(row.Source, "year");
                        var found = (await _catalog.SearchMediaAsync(row.Name, row.MediaType))
                            .OrderByDescending(item => expectedYear.Length > 0 && Text(item, "year") == expectedYear)
                            .ThenByDescending(item => Number(item, "popularity"))
                            .FirstOrDefault();
                        if (found is not null) Merge(row.Source, found);
                    }
                    catch { }
                }
                await _catalog.EnrichMediaAsync(row.Source, row.MediaType);
                changed = true;
            }
            var cachedWikipedia = CatalogService.CleanStoryText(Text(row.Source, "wikipediaPlot"));
            if (cachedWikipedia.Length == 0)
            {
                DetailOverview.Text = "Loading Wikipedia story...";
                cachedWikipedia = await _catalog.WikipediaSummaryAsync(row.Name, row.MediaType, Text(row.Source, "year", "date"));
                if (cachedWikipedia.Length > 0) { row.Source["wikipediaPlot"] = cachedWikipedia; changed = true; }
            }
            if (cachedWikipedia.Length > 0) DetailOverview.Text = cachedWikipedia;
        }
        else if (row.MediaType == "Game")
        {
            if (Text(row.Source, "img", "cover", "poster").Length == 0 && _catalog.RawgKey.Length > 0)
            {
                try
                {
                    var found = (await _catalog.SearchGamesAsync(row.Name)).FirstOrDefault();
                    if (found is not null) { Merge(row.Source, found); changed = true; }
                }
                catch { }
            }
            if (row.Collection == "playing" && row.Overview.Length == 0)
            {
                DetailOverview.Text = "Loading Wikipedia plot...";
                var plot = await _catalog.WikipediaSummaryAsync(row.Name, "Game", Text(row.Source, "year"));
                if (plot.Length > 0) { row.Source["overview"] = plot; changed = true; }
            }
        }
        if (!changed)
        {
            if (DetailOverview.Text.StartsWith("Loading", StringComparison.OrdinalIgnoreCase))
                DetailOverview.Text = row.Collection == "playing" && row.Overview.Length > 0 ? row.Overview : "No matching Wikipedia story section was found.";
            return;
        }
        var refreshed = ReadNodes(new JsonArray(row.Source.DeepClone()), row.Collection).First();
        _selectedRow = refreshed;
        DetailPosterFrame.Height = refreshed.IsPortraitArt ? 390 : 146;
        SetArtwork(DetailPoster, refreshed.Image, 420);
        SetArtwork(DetailBackdrop, refreshed.Backdrop.Length > 0 ? refreshed.Backdrop : refreshed.Image, 1280);
        // The IMDb/TMDB synopsis now that enrichment has filled it in.
        DetailSynopsis.Text = refreshed.Overview;
        DetailSynopsisSection.Visibility = refreshed.HasOverview ? Visibility.Visible : Visibility.Collapsed;
        DetailOverview.Text = CatalogService.CleanStoryText(Text(refreshed.Source, "wikipediaPlot")) is { Length: > 0 } wikipediaPlot ? wikipediaPlot
            : refreshed.MediaType == "Game" && refreshed.Collection == "playing" && refreshed.Overview.Length > 0 ? refreshed.Overview
            : refreshed.MediaType is "Movie" or "TV Show" ? "No matching Wikipedia story section was found."
            : refreshed.MediaType == "Game" && refreshed.Collection != "playing" ? "Story summaries are available for games in Now Playing."
            : "No matching summary was found for this title.";
        DetailAvailability.Text = refreshed.Availability.Length > 0 ? refreshed.Availability : "No streaming or rental provider information found.";
        DetailRating.Text = $"IMDb / rating  {refreshed.RatingText}";
        if (refreshed.MediaType == "TV Show") PopulateEpisodePicker(refreshed);
        if (!IsCatalog(row)) await _vault.UpdateAsync(row.Collection, row.Source);
        else await PersistCatalogMetadataAsync(row);
    }

    private static void Merge(JsonObject target, JsonObject source)
    {
        foreach (var pair in source) if (pair.Value is not null && (target[pair.Key] is null || string.IsNullOrWhiteSpace(target[pair.Key]?.ToString()))) target[pair.Key] = pair.Value.DeepClone();
    }

    private static bool IsCatalog(LibraryRow row) => row.Collection is "uphw" or "bluray" or "relhw" or "mlott" or "mlup" or "seriesnew" or "seriesupcoming" or "enseries" or "mlseries" or "taseries" or "hiseries";

    private async Task PersistCatalogMetadataAsync(LibraryRow row)
    {
        var root = _vault.Root["nativeTvCatalog"]?.DeepClone() as JsonObject ?? [];
        var typeKey = row.MediaType == "Movie" ? "movies" : "series";
        if (root[typeKey]?[row.Collection] is not JsonArray items) return;
        var identity = Text(row.Source, "canonicalId", "tmdbId", "id");
        var match = items.OfType<JsonObject>().FirstOrDefault(item => Text(item, "canonicalId", "tmdbId", "id") == identity);
        if (match is null) return;
        items[items.IndexOf(match)] = row.Source.DeepClone();
        await _vault.SetCacheValueAsync("nativeTvCatalog", root);
    }

    private static string PrimaryActionLabel(LibraryRow row)
    {
        if (row.Collection == "plex") return row.Status == "Watched" ? "Mark unwatched" : "Mark watched";
        if (row.Collection == "rentals") return "Return rental";
        if (row.Collection == "rentalHistory") return "Rent again";
        if (row.Collection == "upcomingRemoved") return "Restore to upcoming";
        if (row.Collection is "hiddenMovies" or "hiddenSeries") return "Restore to watchlist";
        if (IsCatalog(row)) return "Add to watchlist";
        if (row.MediaType == "Movie") return row.Collection == "movieWatchlist" ? "Start watching" : row.Collection == "watchingMovies" ? "Mark watched" : "Watch again";
        if (row.MediaType == "TV Show") return row.Collection == "seriesWatchlist" ? "Start watching" : row.Collection == "watchingSeries" ? "Mark watched" : "Watch again";
        return row.Collection is "upcoming" or "catalogExtra" ? "Add to rental queue" : row.Collection == "queue" ? "Move to playing" : "Move to completed";
    }

    private void CloseDetails_Click(object sender, RoutedEventArgs e) => CloseDetails();

    private void CloseDetails()
    {
        DetailsPage.Visibility = Visibility.Collapsed;
        _selectedRow = null;
    }

    private async void SaveRating_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedRow is not { } row || PersonalRatingBox.SelectedItem is not ComboBoxItem selected || !int.TryParse(selected.Tag?.ToString(), out var rating)) return;
        var item = row.Source.DeepClone() as JsonObject ?? [];
        item["userRating"] = rating;
        var destination = row.Collection;
        if (IsCatalog(row)) destination = row.MediaType == "Movie" ? "movieWatchlist" : row.MediaType == "TV Show" ? "seriesWatchlist" : "queue";
        await RunBusyAsync("Saving personal rating...", () => _vault.UpdateAsync(destination, item));
        StatusText.Text = rating > 0 ? $"Rated {row.Name} {rating}/10." : $"Removed your rating for {row.Name}.";
        RefreshAll();
    }

    /* Detail art and backdrops go through the shared cache too, so opening the
       same title repeatedly reuses one decoded bitmap instead of decoding the
       full-resolution original again each time. */
    /// <summary>Paints artwork into an Image once it has been downloaded and decoded.</summary>
    private static void SetArtwork(Image target, string url, int decodeWidth = 640)
    {
        Artwork.SetDecodeWidth(target, decodeWidth);
        Artwork.SetUrl(target, url ?? "");
    }

    private void Trailer_Click(object sender, RoutedEventArgs e) => OpenExternal($"https://www.youtube.com/results?search_query={Uri.EscapeDataString((_selectedRow?.Name ?? "") + " official trailer")}");
    private void Google_Click(object sender, RoutedEventArgs e) => OpenExternal($"https://www.google.com/search?q={Uri.EscapeDataString(_selectedRow?.Name ?? "")}");
    private void Wikipedia_Click(object sender, RoutedEventArgs e) => OpenExternal($"https://en.wikipedia.org/w/index.php?search={Uri.EscapeDataString(_selectedRow?.Name ?? "")}");
    private async void RefreshPlot_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedRow is not { } row) return;
        DetailOverview.Text = "Loading Wikipedia plot...";
        if (row.MediaType == "Game" && row.Collection != "playing") { DetailOverview.Text = "Story summaries are available for games in Now Playing."; return; }
        var plot = await _catalog.WikipediaSummaryAsync(row.Name, row.MediaType, Text(row.Source, "year", "date"));
        if (plot.Length == 0) { DetailOverview.Text = "No matching Wikipedia story section was found."; return; }
        row.Source[row.MediaType == "Game" ? "overview" : "wikipediaPlot"] = plot;
        DetailOverview.Text = plot;
        if (!IsCatalog(row)) await _vault.UpdateAsync(row.Collection, row.Source);
    }
    private void Imdb_Click(object sender, RoutedEventArgs e)
    {
        var row = _selectedRow;
        OpenExternal(!string.IsNullOrWhiteSpace(row?.ImdbId) ? $"https://www.imdb.com/title/{row.ImdbId}/" : $"https://www.imdb.com/find/?q={Uri.EscapeDataString(row?.Name ?? "")}");
    }

    private void IgnReview_Click(object sender, RoutedEventArgs e) => OpenExternal($"https://www.youtube.com/results?search_query={Uri.EscapeDataString("IGN review " + (_selectedRow?.Name ?? ""))}");
    private void ReeloadReview_Click(object sender, RoutedEventArgs e) => OpenExternal($"https://www.youtube.com/results?search_query={Uri.EscapeDataString("@REELOADMEDIA review " + (_selectedRow?.Name ?? ""))}");
    private void MonsoonReview_Click(object sender, RoutedEventArgs e) => OpenExternal($"https://www.youtube.com/results?search_query={Uri.EscapeDataString((_selectedRow?.Name ?? "") + " Malayalam review Monsoon Media")}");
    private void AswanthReview_Click(object sender, RoutedEventArgs e) => OpenExternal($"https://www.youtube.com/results?search_query={Uri.EscapeDataString((_selectedRow?.Name ?? "") + " Malayalam review Aswanth Kok")}");
    private void Fandom_Click(object sender, RoutedEventArgs e)
    {
        var name = _selectedRow?.Name ?? "";
        var saved = (_vault.Root["fandom"] as JsonObject)?[NormalizedTitle(name)]?.ToString() ?? "";
        var menu = new ContextMenu();
        var open = new MenuItem { Header = saved.Length > 0 ? "Continue saved Fandom page" : "Find Fandom page" };
        open.Click += (_, _) => OpenExternal(saved.Length > 0 ? saved : $"https://www.google.com/search?btnI=1&q={Uri.EscapeDataString(name + " plot site:fandom.com")}");
        var save = new MenuItem { Header = "Save Fandom page from clipboard" };
        save.Click += async (_, _) =>
        {
            var value = Clipboard.ContainsText() ? Clipboard.GetText().Trim() : "";
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || !uri.Host.Contains("fandom.com", StringComparison.OrdinalIgnoreCase))
            {
                MessageBox.Show(this, "Copy the Fandom page or section URL first, then choose this option.", "Fandom continuation", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            var fandom = _vault.Root["fandom"]?.DeepClone() as JsonObject ?? [];
            fandom[NormalizedTitle(name)] = value;
            await _vault.SetRootValueAsync("fandom", fandom);
            StatusText.Text = $"Saved the Fandom continuation page for {name}.";
        };
        menu.Items.Add(open); menu.Items.Add(save);
        if (saved.Length > 0)
        {
            var forget = new MenuItem { Header = "Forget saved Fandom page" };
            forget.Click += async (_, _) =>
            {
                var fandom = _vault.Root["fandom"]?.DeepClone() as JsonObject ?? [];
                fandom.Remove(NormalizedTitle(name));
                await _vault.SetRootValueAsync("fandom", fandom);
                StatusText.Text = $"Removed the saved Fandom continuation page for {name}.";
            };
            menu.Items.Add(forget);
        }
        menu.IsOpen = true;
    }
    private void VendorLinks_Click(object sender, RoutedEventArgs e)
    {
        var title = Uri.EscapeDataString(_selectedRow?.Name ?? "");
        var menu = new ContextMenu();
        var hub = new MenuItem { Header = "The Game Hub" };
        hub.Click += (_, _) => OpenExternal($"https://thegamehub.in/?s={title}");
        var planet = new MenuItem { Header = "Gamer Planet" };
        planet.Click += (_, _) => OpenExternal($"https://gamerplanet.in/?s={title}");
        menu.Items.Add(hub); menu.Items.Add(planet); menu.IsOpen = true;
    }

    private async void VendorRefresh_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedRow is not { Collection: "queue" } row) return;
        VendorRefreshButton.IsEnabled = false;
        DetailAvailability.Text = "Checking The Game Hub and Gamer Planet...";
        try
        {
            await UpdateAvailabilityAsync(row.Source);
            var refreshed = ReadNodes(new JsonArray(row.Source.DeepClone()), row.Collection).First();
            _selectedRow = refreshed;
            DetailAvailability.Text = refreshed.Availability.Length > 0 ? refreshed.Availability : "No current rental listing was found.";
            RefreshGames();
        }
        finally { VendorRefreshButton.IsEnabled = true; }
    }

    private void AiAssistant_Click(object sender, RoutedEventArgs e)
    {
        var row = _selectedRow;
        if (row is null) return;
        var prompt = row.MediaType == "Game"
            ? $"I am about to play {row.Name}. Tell me what I should know first, whether I should play previous games, and recap important earlier lore. Do not spoil {row.Name}."
            : $"I am about to watch {row.Name}. Tell me what I should know first, any earlier films, seasons, or lore I need, whether it is based on true events, and recap prequels if applicable. Do not spoil {row.Name}.";
        var services = new Dictionary<string, string>
        {
            ["ChatGPT"] = $"https://chatgpt.com/?q={Uri.EscapeDataString(prompt)}",
            ["Claude"] = $"https://claude.ai/new?q={Uri.EscapeDataString(prompt)}",
            ["Grok"] = $"https://grok.com/?q={Uri.EscapeDataString(prompt)}",
            ["DeepSeek"] = $"https://chat.deepseek.com/?q={Uri.EscapeDataString(prompt)}"
        };
        var menu = new ContextMenu();
        var chatKey = $"{row.MediaType}:{(row.Id.Length > 0 ? row.Id : NormalizedTitle(row.Name))}";
        var savedChats = (_vault.Root["aiChats"] as JsonObject)?[chatKey] as JsonObject;
        foreach (var service in services)
        {
            var serviceName = service.Key;
            var startUrl = service.Value;
            var savedUrl = savedChats?[serviceName]?.ToString() ?? "";
            var item = new MenuItem { Header = savedUrl.Length > 0 ? $"{serviceName} · continue saved chat" : serviceName };
            item.Click += (_, _) => { Clipboard.SetText(prompt); OpenExternal(savedUrl.Length > 0 ? savedUrl : startUrl); };
            menu.Items.Add(item);
        }
        menu.Items.Add(new Separator());
        var saveMenu = new MenuItem { Header = "Save current conversation URL from clipboard" };
        foreach (var serviceName in services.Keys)
        {
            var saveItem = new MenuItem { Header = serviceName };
            saveItem.Click += async (_, _) => await SaveAiConversationAsync(chatKey, serviceName);
            saveMenu.Items.Add(saveItem);
        }
        menu.Items.Add(saveMenu);
        menu.IsOpen = true;
    }

    private async Task SaveAiConversationAsync(string chatKey, string service)
    {
        var value = Clipboard.ContainsText() ? Clipboard.GetText().Trim() : "";
        if (!Uri.TryCreate(value, UriKind.Absolute, out _))
        {
            MessageBox.Show(this, "Copy the conversation URL from your browser first.", "AI assistant", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        var chats = _vault.Root["aiChats"]?.DeepClone() as JsonObject ?? [];
        var titleChats = chats[chatKey] as JsonObject ?? [];
        titleChats[service] = value;
        chats[chatKey] = titleChats;
        await _vault.SetRootValueAsync("aiChats", chats);
        StatusText.Text = $"Saved the {service} conversation for this title.";
    }

    private void ChangeStatus_Click(object sender, RoutedEventArgs e)
    {
        var row = _selectedRow;
        if (row is null) return;
        var actions = row.MediaType switch
        {
            "Movie" => new[] { ("Add to Watchlist", "movieWatchlist", "Watchlist"), ("Watching", "watchingMovies", "Watching"), ("Watched", "watchedMovies", "Watched"), ("Not Interested", "hiddenMovies", "Not Interested") },
            "TV Show" => new[] { ("Add to Watchlist", "seriesWatchlist", "Watchlist"), ("Watching", "watchingSeries", "Watching"), ("Watched", "watchedSeries", "Watched"), ("Not Interested", "hiddenSeries", "Not Interested") },
            _ => new[] { ("Rental Queue", "queue", "Queued"), ("Playing", "playing", "Playing"), ("Resume Later", "playing", "Resume Later"), ("On Hold", "playing", "On Hold"), ("Completed", "played", "Finished") }
        };
        var menu = new ContextMenu();
        foreach (var action in actions)
        {
            var item = new MenuItem { Header = action.Item1 };
            item.Click += async (_, _) => await MoveRowToAsync(row, action.Item2, action.Item3);
            menu.Items.Add(item);
        }
        menu.IsOpen = true;
    }

    private async Task MoveRowToAsync(LibraryRow row, string destination, string status)
    {
        CaptureUndo();
        var clone = row.Source.DeepClone() as JsonObject ?? [];
        clone["status"] = status;
        await RunBusyAsync("Updating status...", async () =>
        {
            await _vault.UpdateAsync(destination, clone);
            if (destination == "queue") await UpdateAvailabilityAsync(clone);
            if (!IsCatalog(row) && row.Collection != "plex" && row.Collection != destination) await _vault.RemoveAsync(row.Collection, row.Id);
        });
        DetailsPage.Visibility = Visibility.Collapsed;
        RefreshAll();
    }

    private async void CardQuickAction_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not MenuItem item ||
            item.Parent is not ContextMenu menu ||
            menu.PlacementTarget is not Button button ||
            button.Tag is not LibraryRow row) return;

        _selectedRow = row;
        switch (item.Tag?.ToString())
        {
            case "open":
                await OpenDetailsAsync(row);
                return;
            case "edit":
                EditSelected_Click(sender, e);
                return;
            case "primary":
                MoveStatus_Click(sender, e);
                return;
            case "watchlist":
                await MoveRowToAsync(row, row.MediaType switch
                {
                    "Movie" => "movieWatchlist",
                    "TV Show" => "seriesWatchlist",
                    _ => "queue"
                }, row.MediaType == "Game" ? "Queued" : "Watchlist");
                return;
            case "watched":
                await MoveRowToAsync(row, row.MediaType switch
                {
                    "Movie" => "watchedMovies",
                    "TV Show" => "watchedSeries",
                    _ => "played"
                }, row.MediaType == "Game" ? "Finished" : "Watched");
                return;
            case "hidden":
                await MoveRowToAsync(row, row.MediaType switch
                {
                    "Movie" => "hiddenMovies",
                    "TV Show" => "hiddenSeries",
                    _ => "hiddenGames"
                }, "Not Interested");
                return;
        }
    }

    /// <summary>
    /// The quick-action button on a card. Each action maps to the same move the
    /// detail page would perform, so behaviour stays consistent either way.
    /// </summary>
    private async void CardQuickButton_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is not LibraryRow row) return;
        // The card itself is a button; without this the click also opens details.
        e.Handled = true;
        _selectedRow = row;
        switch (row.QuickActionKey)
        {
            case "return-complete":
                await MoveRowToAsync(row, "played", "Finished");
                StatusText.Text = $"{row.Name} returned and marked completed.";
                return;
            case "rent-again":
            case "start-rental":
                await StartRentalAsync(row);
                return;
            case "resume":
                await MoveRowToAsync(row, "playing", "Playing");
                StatusText.Text = $"Resumed {row.Name}.";
                return;
            case "mark-completed":
                await MoveRowToAsync(row, "played", "Finished");
                StatusText.Text = $"{row.Name} marked completed.";
                return;
            case "play-now":
                await MoveRowToAsync(row, "playing", "Playing");
                StatusText.Text = $"Now playing {row.Name}.";
                return;
            case "add-queue":
                await MoveRowToAsync(row, "queue", "Queued");
                StatusText.Text = $"{row.Name} added to the rental queue.";
                return;
            case "mark-watched":
                await MoveRowToAsync(row, row.MediaType == "Movie" ? "watchedMovies" : "watchedSeries", "Watched");
                StatusText.Text = $"{row.Name} marked watched.";
                return;
        }
    }

    /// <summary>Moves a title into active rentals, starting a fresh 30-day period today.</summary>
    private async Task StartRentalAsync(LibraryRow row)
    {
        var rental = row.Source.DeepClone() as JsonObject ?? [];
        rental["id"] = Guid.NewGuid().ToString("N");
        rental["start"] = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        rental["returnDate"] = DateTime.Today.AddDays(30).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        rental["added"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        rental.Remove("end");
        rental.Remove("returnedAt");
        await _vault.AddAsync("rentals", rental);
        if (row.Collection == "queue") await _vault.RemoveAsync("queue", Text(row.Source, "id"));
        RefreshAll();
        StatusText.Text = $"Started a 30-day rental for {row.Name}.";
    }

    private static void OpenExternal(string url) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

    private void PopulateEpisodePicker(LibraryRow row)
    {
        DetailSeasonBox.SelectionChanged -= DetailSeason_Changed;
        DetailEpisodeBox.SelectionChanged -= DetailEpisode_Changed;
        DetailSeasonBox.Items.Clear();
        DetailEpisodeBox.Items.Clear();
        if (row.MediaType == "TV Show")
        {
            var seasons = row.Seasons > 0 ? row.Seasons : (row.Source["seasonList"] as JsonArray)?.Count ?? 0;
            for (var season = 1; season <= seasons; season++) DetailSeasonBox.Items.Add(season);
            if (DetailSeasonBox.Items.Count > 0) DetailSeasonBox.SelectedIndex = 0;
        }
        DetailSeasonBox.SelectionChanged += DetailSeason_Changed;
        DetailEpisodeBox.SelectionChanged += DetailEpisode_Changed;
        PopulateEpisodes();
        if (row.MediaType == "TV Show" && DetailSeasonBox.SelectedItem is int) _ = PopulateEpisodesAsync();
    }

    private async void DetailSeason_Changed(object sender, SelectionChangedEventArgs e) => await PopulateEpisodesAsync();
    private void DetailEpisode_Changed(object sender, SelectionChangedEventArgs e) { }
    private void PopulateEpisodes()
    {
        DetailEpisodeBox.Items.Clear();
        if (_selectedRow is not { } row || DetailSeasonBox.SelectedItem is not int season) return;
        var count = 0;
        if (row.Source["seasonList"] is JsonArray list)
        {
            var info = list.OfType<JsonObject>().FirstOrDefault(item => Integer(item, "n", "season_number") == season);
            if (info is not null) count = Integer(info, "episodes", "episode_count");
        }
        if (count == 0) count = row.Episodes > 0 && row.Seasons <= 1 ? row.Episodes : 20;
        for (var episode = 1; episode <= count; episode++) DetailEpisodeBox.Items.Add(episode);
        if (DetailEpisodeBox.Items.Count > 0) DetailEpisodeBox.SelectedIndex = 0;
    }

    private async Task PopulateEpisodesAsync()
    {
        if (_selectedRow is not { } row || DetailSeasonBox.SelectedItem is not int season) return;
        DetailEpisodeBox.Items.Clear();
        DetailEpisodeBox.Items.Add("Loading episodes and IMDb ratings...");
        try
        {
            var episodes = await _catalog.SeasonEpisodesAsync(row.TmdbId, row.ImdbId, season);
            DetailEpisodeBox.Items.Clear();
            foreach (var episode in episodes) DetailEpisodeBox.Items.Add(episode);
            if (DetailEpisodeBox.Items.Count > 0) DetailEpisodeBox.SelectedIndex = 0;
            else PopulateEpisodes();
        }
        catch { DetailEpisodeBox.Items.Clear(); PopulateEpisodes(); }
    }

    private async void EpisodePlot_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedRow is not { } row || DetailSeasonBox.SelectedItem is not int season) return;
        var episode = DetailEpisodeBox.SelectedItem is EpisodeChoice choice ? choice.Number : DetailEpisodeBox.SelectedItem is int number ? number : 0;
        if (episode <= 0) return;
        var tmdbId = row.TmdbId;
        var details = await _catalog.EpisodeAsync(tmdbId, row.ImdbId, season, episode);
        var overview = await _catalog.WikipediaSummaryAsync($"{row.Name} season {season} episode {episode} {details.Name}", "TV Show", Text(row.Source, "year"));
        if (overview.Length == 0) overview = details.Overview;
        DetailOverview.Text = overview.Length > 0 ? $"S{season:00}E{episode:00} {details.Name}\n\n{overview}" : "No Wikipedia episode story was found. TMDB also has no episode summary.";
        var selectedRating = DetailEpisodeBox.SelectedItem is EpisodeChoice selected && selected.Rating > 0 ? selected.Rating : details.Rating;
        DetailRating.Text = selectedRating > 0 ? $"Episode IMDb rating  {selectedRating:0.0}" : $"Series IMDb rating  {row.RatingText}";
        if (details.AirDate.Length > 0) DetailCountdown.Text = DisplayDate(details.AirDate);
    }

    private async void MoveStatus_Click(object sender, RoutedEventArgs e)
    {
        var row = _selectedRow;
        if (row is null) return;
        if (row.Collection == "plex")
        {
            var key = Text(row.Source, "plexRatingKey");
            var makeWatched = !string.Equals(row.Status, "Watched", StringComparison.OrdinalIgnoreCase);
            try { await _plex.MarkWatchedAsync(key, makeWatched); }
            catch (Exception ex) { MessageBox.Show(this, ex.Message, "Plex", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
            var watched = row.MediaType == "Movie" ? "watchedMovies" : "watchedSeries";
            var watching = row.MediaType == "Movie" ? "watchingMovies" : "watchingSeries";
            var watchlist = row.MediaType == "Movie" ? "movieWatchlist" : "seriesWatchlist";
            var plexClone = row.Source.DeepClone() as JsonObject ?? [];
            plexClone["key"] = $"plex:{key}"; plexClone["status"] = makeWatched ? "Watched" : "Watching"; plexClone["plexSyncedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await RunBusyAsync("Synchronizing Plex status...", async () =>
            {
                await _vault.AddAsync(makeWatched ? watched : watching, plexClone);
                var plexYear = Text(row.Source, "year");
                await RemoveMatchingTitleAsync(makeWatched ? watching : watched, row.Name, plexYear);
                await RemoveMatchingTitleAsync(watchlist, row.Name, plexYear);
            });
            DetailsPage.Visibility = Visibility.Collapsed; await RefreshPlexAsync(force: true); RefreshDashboard(); return;
        }
        if (row.Collection == "rentals")
        {
            if (MessageBox.Show(this, $"Return '{row.Name}' today and move this rental to Rental History?", "Return rental", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            var history = row.Source.DeepClone() as JsonObject ?? [];
            history["end"] = DateTime.Today.ToString("yyyy-MM-dd");
            if (DateTime.TryParse(Text(history, "start"), out var start)) history["used"] = Math.Max(0, (DateTime.Today - start.Date).Days);
            history["status"] = "Returned";
            await RunBusyAsync("Returning rental...", () => _vault.MoveAsync("rentals", "rentalHistory", history));
            DetailsPage.Visibility = Visibility.Collapsed; RefreshAll(); return;
        }
        if (row.Collection == "rentalHistory")
        {
            var rental = row.Source.DeepClone() as JsonObject ?? [];
            rental["id"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(); rental["start"] = DateTime.Today.ToString("yyyy-MM-dd"); rental["returnDate"] = DateTime.Today.AddDays(30).ToString("yyyy-MM-dd"); rental["days"] = 30; rental["status"] = "Active";
            await RunBusyAsync("Creating new rental period...", () => _vault.AddAsync("rentals", rental));
            DetailsPage.Visibility = Visibility.Collapsed; SelectGameCollection("rentals"); RefreshAll(); return;
        }
        if (row.Collection == "upcomingRemoved")
        {
            await RunBusyAsync("Restoring upcoming game...", () => _vault.MoveAsync("upcomingRemoved", "upcoming", row.Source.DeepClone() as JsonObject ?? []));
            DetailsPage.Visibility = Visibility.Collapsed; RefreshAll(); return;
        }
        var destination = row.MediaType switch
        {
            "Movie" when row.Collection == "movieWatchlist" => "watchingMovies",
            "Movie" when row.Collection == "watchingMovies" => "watchedMovies",
            "Movie" when row.Collection == "watchedMovies" => "watchingMovies",
            "Movie" => "movieWatchlist",
            "TV Show" when row.Collection == "seriesWatchlist" => "watchingSeries",
            "TV Show" when row.Collection == "watchingSeries" => "watchedSeries",
            "TV Show" when row.Collection == "watchedSeries" => "watchingSeries",
            "TV Show" => "seriesWatchlist",
            _ when row.Collection is "upcoming" or "catalogExtra" => "queue",
            _ when row.Collection == "queue" => "playing",
            _ => "played"
        };
        var clone = row.Source.DeepClone() as JsonObject ?? [];
        clone["status"] = destination switch { "watchedMovies" or "watchedSeries" => "Watched", "playing" => "Playing", "played" => "Finished", _ => clone["status"] };
        await RunBusyAsync("Updating library...", async () =>
        {
            if (!CollectionContains(destination, row)) await _vault.AddAsync(destination, clone);
            if (destination == "queue") await UpdateAvailabilityAsync(clone);
            if (!IsCatalog(row)) await _vault.RemoveAsync(row.Collection, row.Id);
        });
        DetailsPage.Visibility = Visibility.Collapsed;
        RefreshAll();
    }

    private async Task RemoveMatchingTitleAsync(string collection, string title, string year = "")
    {
        var item = _vault.Collection(collection).OfType<JsonObject>().FirstOrDefault(node => SameTitleAndYear(node, title, year));
        if (item is null) return;
        var id = Text(item, "id", "canonicalId", "tmdbId", "key");
        if (id.Length > 0) await _vault.RemoveAsync(collection, id);
    }

    private async void RemoveDetail_Click(object sender, RoutedEventArgs e)
    {
        var row = _selectedRow;
        if (row is null) return;
        if (row.Collection == "plex")
        {
            if (MessageBox.Show(this, $"Permanently delete '{row.Name}' from Plex, including its media files?\n\nThis cannot be undone.", "Delete Plex media", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
            try { await _plex.DeleteAsync(Text(row.Source, "plexRatingKey")); }
            catch (Exception ex) { MessageBox.Show(this, ex.Message, "Plex delete failed", MessageBoxButton.OK, MessageBoxImage.Error); return; }
            DetailsPage.Visibility = Visibility.Collapsed; await RefreshPlexAsync(force: true); return;
        }
        if (row.Collection == "upcoming")
        {
            if (MessageBox.Show(this, $"Move '{row.Name}' to Removed games? It will stay hidden from future internet refreshes.", "Remove upcoming title", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            CaptureUndo();
            await RunBusyAsync("Moving to Removed games...", () => _vault.MoveAsync("upcoming", "upcomingRemoved", row.Source.DeepClone() as JsonObject ?? []));
            DetailsPage.Visibility = Visibility.Collapsed; RefreshAll(); return;
        }
        if (IsCatalog(row))
        {
            CaptureUndo();
            var hidden = row.MediaType == "Movie" ? "hiddenMovies" : "hiddenSeries";
            if (!CollectionContains(hidden, row)) await RunBusyAsync("Hiding title...", () => _vault.AddAsync(hidden, row.Source.DeepClone() as JsonObject ?? []));
            DetailsPage.Visibility = Visibility.Collapsed;
            RefreshAll();
            return;
        }
        if (MessageBox.Show(this, $"Remove '{row.Name}' from {row.Collection}? A recovery snapshot will be created first.",
                "Confirm removal", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        CaptureUndo();
        await RunBusyAsync("Removing title...", () => _vault.RemoveAsync(row.Collection, row.Id));
        DetailsPage.Visibility = Visibility.Collapsed;
        RefreshAll();
    }

    private void CaptureUndo()
    {
        _undoRoot = _vault.Root.DeepClone() as JsonObject;
        UndoButton.Visibility = _undoRoot is null ? Visibility.Collapsed : Visibility.Visible;
    }

    private async void Undo_Click(object sender, RoutedEventArgs e)
    {
        if (_undoRoot is null) return;
        var snapshot = _undoRoot;
        _undoRoot = null;
        UndoButton.Visibility = Visibility.Collapsed;
        await RunBusyAsync("Restoring previous library state...", () => _vault.ImportJsonAsync(snapshot.ToJsonString()));
        DetailsPage.Visibility = Visibility.Collapsed;
        RefreshAll();
        StatusText.Text = "Previous library action restored.";
    }

    private bool CollectionContains(string collection, LibraryRow row) => _vault.Collection(collection).OfType<JsonObject>().Any(item =>
        StrongIdentityMatches(item, row.Source) || SameTitleAndYear(item, row.Name, Text(row.Source, "year")));

    private static bool StrongIdentityMatches(JsonObject left, JsonObject right)
    {
        foreach (var key in new[] { "canonicalId", "tmdbId", "rawgId", "imdbId", "plexRatingKey" })
        {
            var a = Text(left, key);
            var b = Text(right, key);
            if (a.Length > 0 && b.Length > 0 && string.Equals(a, b, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static bool SameTitleAndYear(JsonObject item, string title, string year)
    {
        if (!string.Equals(NormalizedTitle(Text(item, "name", "title")), NormalizedTitle(title), StringComparison.Ordinal)) return false;
        var itemYear = Text(item, "year");
        return year.Length == 0 || itemYear.Length == 0 || string.Equals(itemYear, year, StringComparison.Ordinal);
    }

    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape && DetailsPage.Visibility == Visibility.Visible) { CloseDetails(); e.Handled = true; return; }
        if (Keyboard.Modifiers == ModifierKeys.Control && e.Key == Key.K) { SearchBox.Focus(); SearchBox.SelectAll(); e.Handled = true; return; }
        if (Keyboard.Modifiers == ModifierKeys.Control && e.Key == Key.R) { GlobalRefresh_Click(this, new RoutedEventArgs()); e.Handled = true; return; }
        if (Keyboard.Modifiers == ModifierKeys.Control && e.Key == Key.OemComma) { _previousSection = _section; _section = "Settings"; ShowSection(); e.Handled = true; return; }
        if (Keyboard.Modifiers == ModifierKeys.Alt && e.Key == Key.Left)
        {
            if (DetailsPage.Visibility == Visibility.Visible) CloseDetails();
            else { (_section, _previousSection) = (_previousSection, _section); ShowSection(); }
            e.Handled = true;
        }
    }

    private void Window_PreviewMouseUp(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.XButton1) return;
        if (DetailsPage.Visibility == Visibility.Visible) CloseDetails();
        else if (_section != "Overview")
        {
            (_section, _previousSection) = (_previousSection, _section);
            ShowSection();
        }
        e.Handled = true;
    }

    /* The window reopened at a fixed 1440x900 in the middle of the screen every
       launch, ignoring wherever the user had put it. */
    private void RestoreWindowPlacement()
    {
        var width = _preferences.GetDouble("WindowWidth", 0);
        var height = _preferences.GetDouble("WindowHeight", 0);
        var left = _preferences.GetDouble("WindowLeft", double.NaN);
        var top = _preferences.GetDouble("WindowTop", double.NaN);
        if (width >= MinWidth && height >= MinHeight)
        {
            Width = width;
            Height = height;
        }
        // Only honour a position that still lands on a connected display, so a
        // window saved on a monitor that is now unplugged does not open offscreen.
        if (!double.IsNaN(left) && !double.IsNaN(top)
            && left + Width > SystemParameters.VirtualScreenLeft
            && top + Height > SystemParameters.VirtualScreenTop
            && left < SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth
            && top < SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight)
        {
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = left;
            Top = top;
        }
        if (_preferences.GetBool("WindowMaximized", false)) WindowState = WindowState.Maximized;
    }

    private void SaveWindowPlacement()
    {
        _preferences.SetBool("WindowMaximized", WindowState == WindowState.Maximized);
        // RestoreBounds holds the pre-maximise size, which is what should come back.
        var bounds = WindowState == WindowState.Normal
            ? new Rect(Left, Top, Width, Height)
            : RestoreBounds;
        if (bounds.Width < MinWidth || bounds.Height < MinHeight) return;
        _preferences.SetDouble("WindowWidth", bounds.Width);
        _preferences.SetDouble("WindowHeight", bounds.Height);
        _preferences.SetDouble("WindowLeft", bounds.Left);
        _preferences.SetDouble("WindowTop", bounds.Top);
    }

    private void Window_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        var compact = ActualWidth < 1320;
        RailColumn.Width = new GridLength(ActualWidth < 1180 ? 190 : compact ? 210 : 244);
        SearchBox.Width = ActualWidth < 1180 ? 140 : compact ? 180 : 260;
        FeaturedTitleText.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        PageSubtitle.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        ThemeButton.Visibility = ActualWidth < 1180 ? Visibility.Collapsed : Visibility.Visible;
        OverviewStats.Columns = ActualWidth < 1500 ? 3 : 6;
    }

    private void OpenVaultFolder_Click(object sender, RoutedEventArgs e) => Process.Start(new ProcessStartInfo(_vault.StorageFolder) { UseShellExecute = true });

    private async void CreateSnapshot_Click(object sender, RoutedEventArgs e)
    {
        await _vault.CreateSnapshotAsync();
        StatusText.Text = "Recovery snapshot created.";
    }

    private async void OpenRecovery_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new RecoveryWindow(_vault.RecoverySnapshots()) { Owner = this };
        if (dialog.ShowDialog() != true || dialog.Selected is null) return;
        await RunBusyAsync("Restoring recovery snapshot...", () => _vault.RestoreSnapshotAsync(dialog.Selected.Path));
        RefreshAll();
        StatusText.Text = "Recovery snapshot restored.";
    }

    private async void ExportDiagnostics_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SaveFileDialog { Filter = "Text report (*.txt)|*.txt", FileName = $"gamevault-diagnostics-{DateTime.Today:yyyy-MM-dd}.txt" };
        if (dialog.ShowDialog(this) != true) return;
        await DiagnosticsService.ExportAsync(dialog.FileName, _vault);
        StatusText.Text = "Private diagnostics exported.";
    }

    private static string AppVersion =>
        System.Reflection.Assembly.GetExecutingAssembly().GetName().Version is { } version
            ? $"{version.Major}.{version.Minor}.{version.Build}"
            : "0.0.0";

    /* Previously this just opened the releases page and left the comparison to
       the user. It now asks GitHub what the latest release is and says plainly
       whether this build is behind, falling back to the page if the check fails. */
    private async void CheckUpdates_Click(object sender, RoutedEventArgs e)
    {
        var button = sender as Button;
        if (button is not null) button.IsEnabled = false;
        try
        {
            using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(12) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("SinuGameVault-Windows");
            http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            var response = await http.GetAsync("https://api.github.com/repos/sinuksml/gamevault/releases/latest");
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"GitHub returned {(int)response.StatusCode}.");
            var payload = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject ?? [];
            var tag = (payload["tag_name"]?.ToString() ?? "").TrimStart('v', 'V');
            if (tag.Length == 0) throw new InvalidOperationException("No release tag was published.");

            var current = ParseVersion(AppVersion);
            var latest = ParseVersion(tag);
            if (latest > current)
            {
                var choice = MessageBox.Show(this,
                    $"Version {tag} is available. You are running {AppVersion}.\n\nOpen the download page?",
                    "Update available", MessageBoxButton.YesNo, MessageBoxImage.Information);
                if (choice == MessageBoxResult.Yes) OpenExternal("https://github.com/sinuksml/gamevault/releases/latest");
            }
            else
            {
                MessageBox.Show(this, $"Sinu Game Vault {AppVersion} is up to date.", "No updates", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Updates", "Update check failed", ex);
            var choice = MessageBox.Show(this,
                $"The update check could not reach GitHub ({ex.Message})\n\nOpen the releases page instead?",
                "Update check", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (choice == MessageBoxResult.Yes) OpenExternal("https://github.com/sinuksml/gamevault/releases/latest");
        }
        finally { if (button is not null) button.IsEnabled = true; }
    }

    private static Version ParseVersion(string value)
    {
        var cleaned = new string(value.Trim().TakeWhile(character => char.IsDigit(character) || character == '.').ToArray());
        return Version.TryParse(cleaned, out var parsed) ? parsed : new Version(0, 0, 0);
    }
}
