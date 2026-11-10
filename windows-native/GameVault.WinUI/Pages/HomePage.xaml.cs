using System.Globalization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using Microsoft.UI.Xaml.Shapes;
using SinuGameVault.Models;
using Windows.Foundation;

namespace SinuGameVault.Pages;

/// <summary>
/// The first page: what is in progress, what is due, where the money went.
/// Everything here is read-only and leads somewhere — a card opens its title, a
/// figure opens its list.
/// </summary>
public sealed partial class HomePage : Page
{
    private readonly AppState _state = AppState.Current;
    private bool _wide = true;

    public HomePage() => InitializeComponent();

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        _state.LibraryChanged += Refresh;
        _state.DriveStatusChanged += RefreshSummary;
        Refresh();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        _state.LibraryChanged -= Refresh;
        _state.DriveStatusChanged -= RefreshSummary;
    }

    private void Refresh()
    {
        var data = _state.Dashboard;
        var hour = DateTime.Now.Hour;
        Greeting.Text = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

        var playing = data.ContinuePlaying(4);
        var watching = data.ContinueWatching(7);
        PlayingRepeater.ItemsSource = playing;
        WatchingRepeater.ItemsSource = watching;
        PlayingShelf.Visibility = Ui.Show(playing.Count > 0);
        WatchingShelf.Visibility = Ui.Show(watching.Count > 0);

        var due = data.DueDates();
        DueRepeater.ItemsSource = due;
        var overdue = due.Count(row => row.DaysLeft is < 0);
        var urgent = due.Count(row => row.DaysLeft is >= 0 and <= 3);
        DueSubtitle.Text = due.Count == 0 ? "No active rentals or subscriptions."
            : overdue > 0 ? $"{due.Count} tracked · {overdue} overdue"
            : urgent > 0 ? $"{due.Count} tracked · {urgent} due within 3 days"
            : $"{due.Count} tracked · nothing urgent";

        BuildUpcoming(data.ComingUp(6));
        BuildStats(data);
        BuildSpending(data);
        BuildMonthly(data.MonthlySpend(110));
        BuildPetrol(data);

        Welcome.Visibility = Ui.Show(_state.Vault.UserItemCount() == 0);
        _dueCount = due.Count;
        RefreshSummary();
    }

    private int _dueCount;

    private void RefreshSummary()
    {
        var active = _state.Dashboard.NowPlaying;
        Summary.Text = active == 0 && _dueCount == 0
            ? _state.DriveStatus
            : $"{active} game{(active == 1 ? "" : "s")} in progress  ·  {_dueCount} date{(_dueCount == 1 ? "" : "s")} to keep  ·  {_state.DriveStatus}";
    }

    // ---- Figures ------------------------------------------------------------

    private void BuildStats(Services.DashboardData data)
    {
        var tiles = new (string Label, string Value, string Caption, string Target)[]
        {
            ("ACTIVE RENTALS", Number(data.ActiveRentals), "games rented now", "Games:rentals"),
            ("NOW PLAYING", Number(data.NowPlaying), "games in progress", "Games:playing"),
            ("WATCHLIST", Number(data.Watchlist), "movies and shows", "Movies:watchlist"),
            ("COMPLETED", Number(data.Completed), "games finished", "Games:played"),
            ("TOTAL RENTED", Number(data.TotalRented), "rental periods", "Games:rentals"),
            ("TOTAL SPENT", $"₹{data.TotalSpent:N0}", "rentals, plans, purchases", "")
        };
        Stats.Children.Clear();
        Stats.ColumnDefinitions.Clear();
        Stats.RowDefinitions.Clear();
        var columns = _wide ? 6 : 3;
        for (var column = 0; column < columns; column++) Stats.ColumnDefinitions.Add(new ColumnDefinition());
        for (var row = 0; row < tiles.Length / columns; row++) Stats.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        for (var index = 0; index < tiles.Length; index++)
        {
            var (label, value, caption, target) = tiles[index];
            var content = new StackPanel { Spacing = 2 };
            content.Children.Add(new TextBlock { Text = label, Style = Res("OverlineStyle") });
            content.Children.Add(new TextBlock { Text = value, Style = Res("FigureStyle") });
            content.Children.Add(new TextBlock { Text = caption, Style = Res("CaptionSecondaryStyle"), TextTrimming = TextTrimming.CharacterEllipsis });
            FrameworkElement tile;
            if (target.Length > 0)
            {
                var button = new Button
                {
                    Content = content, Tag = target, Padding = new Thickness(16, 14, 16, 14), CornerRadius = new CornerRadius(8),
                    HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Left,
                    Background = Ui.ThemeBrush("CardBackgroundFillColorDefaultBrush")
                };
                button.Click += Shortcut_Click;
                tile = button;
            }
            else tile = new Border { Child = content, Style = Res("CardStyle"), Padding = new Thickness(16, 14, 16, 14) };
            Grid.SetColumn(tile, index % columns);
            Grid.SetRow(tile, index / columns);
            Stats.Children.Add(tile);
        }
    }

    private static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);
    private static Style Res(string key) => (Style)Application.Current.Resources[key];

    // ---- Coming up ----------------------------------------------------------

    private void BuildUpcoming(List<LibraryRow> rows)
    {
        UpcomingList.Children.Clear();
        UpcomingSubtitle.Text = rows.Count == 0
            ? "Upcoming releases appear after the Upcoming lists are refreshed."
            : "The next releases across games, movies and TV.";
        foreach (var row in rows)
        {
            var line = new Grid { ColumnSpacing = 14 };
            line.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(44) });
            line.ColumnDefinitions.Add(new ColumnDefinition());
            line.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var art = new Grid { Width = 44, Height = 44, CornerRadius = new CornerRadius(6) };
            art.Children.Add(new Border
            {
                Background = Ui.Brush(row.PlaceholderColor),
                Child = new TextBlock { Text = row.Initials, Foreground = new SolidColorBrush(Microsoft.UI.Colors.White), FontSize = 13, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center }
            });
            var image = new Image { Stretch = Stretch.UniformToFill };
            Art.SetDecodeWidth(image, 88);
            Art.SetUrl(image, row.Image);
            art.Children.Add(image);

            var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Spacing = 1 };
            text.Children.Add(new TextBlock { Text = row.Name, Style = Res("BodyStrongTextBlockStyle"), TextTrimming = TextTrimming.CharacterEllipsis });
            text.Children.Add(new TextBlock { Text = Ui.JoinDot(row.MediaType, row.Date), Style = Res("CaptionSecondaryStyle") });
            Grid.SetColumn(text, 1);

            var days = new TextBlock
            {
                Text = row.DaysLeft == 0 ? "Today" : $"{row.DaysLeft}d", FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Foreground = Ui.CountdownBrush(row.DaysLeft), VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(days, 2);

            line.Children.Add(art);
            line.Children.Add(text);
            line.Children.Add(days);
            var button = new Button
            {
                Content = line, Tag = row, Padding = new Thickness(8, 6, 8, 6), Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent),
                BorderThickness = new Thickness(0), HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch
            };
            button.Click += ShelfCard_Click;
            UpcomingList.Children.Add(button);
        }
    }

    // ---- Spending -----------------------------------------------------------

    private void BuildSpending(Services.DashboardData data)
    {
        var slices = data.SpendSlices();
        var total = slices.Sum(slice => slice.Amount);
        DonutTotal.Text = $"₹{total:N0}";
        SpendHint.Text = slices.Count == 0 ? "No spending recorded yet." : "By vendor and subscription. Select one to open its website.";
        SpendLegend.Children.Clear();
        foreach (var slice in slices.Take(8))
        {
            var line = new Grid { ColumnSpacing = 10 };
            line.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            line.ColumnDefinitions.Add(new ColumnDefinition());
            line.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            line.Children.Add(new Ellipse { Width = 10, Height = 10, Fill = Ui.Brush(slice.ToneColor), VerticalAlignment = VerticalAlignment.Center });
            var label = new TextBlock { Text = slice.Label, TextTrimming = TextTrimming.CharacterEllipsis };
            Grid.SetColumn(label, 1);
            var amount = new TextBlock { Text = slice.AmountText, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold };
            Grid.SetColumn(amount, 2);
            line.Children.Add(label);
            line.Children.Add(amount);
            var button = new Button
            {
                Content = line, Tag = slice.Website, IsEnabled = true, Padding = new Thickness(8, 6, 8, 6),
                Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent), BorderThickness = new Thickness(0),
                HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch
            };
            ToolTipService.SetToolTip(button, slice.LinkHint);
            button.Click += (sender, _) =>
            {
                if ((sender as Button)?.Tag is string { Length: > 0 } website) Ui.Open(website);
                else _state.Notify($"No website on record for {slice.Label}.");
            };
            SpendLegend.Children.Add(button);
        }
        DrawDonut(slices, total);
    }

    /// <summary>Draws the spend split as arcs around the total.</summary>
    private void DrawDonut(IReadOnlyList<SpendSliceRow> slices, decimal total)
    {
        Donut.Children.Clear();
        const double size = 176, thickness = 22;
        var radius = (size - thickness) / 2;
        var centre = new Point(size / 2, size / 2);

        Ellipse Ring(Brush stroke) => new()
        {
            Width = size - thickness, Height = size - thickness, Stroke = stroke, StrokeThickness = thickness
        };
        void Place(Ellipse ring)
        {
            Canvas.SetLeft(ring, thickness / 2);
            Canvas.SetTop(ring, thickness / 2);
            Donut.Children.Add(ring);
        }

        if (total <= 0 || slices.Count == 0) { Place(Ring(Ui.ThemeBrush("ControlStrokeColorDefaultBrush"))); return; }
        // A single slice cannot be drawn as an arc: its start and end coincide.
        if (slices.Count == 1) { Place(Ring(Ui.Brush(slices[0].ToneColor))); return; }

        var start = -90.0;
        foreach (var slice in slices)
        {
            var sweep = (double)(slice.Amount / total) * 360.0;
            if (sweep <= 0) continue;
            // Leave a hairline gap so neighbouring arcs stay distinguishable.
            var end = start + Math.Max(0.5, sweep - 1.5);
            var figure = new PathFigure { StartPoint = OnCircle(centre, radius, start), IsClosed = false, IsFilled = false };
            figure.Segments.Add(new ArcSegment
            {
                Point = OnCircle(centre, radius, end), Size = new Size(radius, radius),
                SweepDirection = SweepDirection.Clockwise, IsLargeArc = end - start > 180
            });
            var geometry = new PathGeometry();
            geometry.Figures.Add(figure);
            var arc = new Microsoft.UI.Xaml.Shapes.Path { Stroke = Ui.Brush(slice.ToneColor), StrokeThickness = thickness, Data = geometry };
            ToolTipService.SetToolTip(arc, $"{slice.Label} · {slice.AmountText}");
            Donut.Children.Add(arc);
            start += sweep;
        }
    }

    private static Point OnCircle(Point centre, double radius, double degrees)
    {
        var radians = degrees * Math.PI / 180.0;
        return new Point(centre.X + radius * Math.Cos(radians), centre.Y + radius * Math.Sin(radians));
    }

    /// <summary>One column per month: the stacked bar, then the month label underneath.</summary>
    private void BuildMonthly(List<MonthlySpendRow> months)
    {
        MonthlyChart.Children.Clear();
        MonthlyChart.ColumnDefinitions.Clear();
        foreach (var month in months)
        {
            MonthlyChart.ColumnDefinitions.Add(new ColumnDefinition());
            var column = new Grid();
            column.RowDefinitions.Add(new RowDefinition());
            column.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var stack = new StackPanel { VerticalAlignment = VerticalAlignment.Bottom, HorizontalAlignment = HorizontalAlignment.Center, Spacing = 2 };
            if (month.Amount > 0)
                stack.Children.Add(new TextBlock { Text = Compact(month.Amount), Style = Res("CaptionSecondaryStyle"), FontSize = 11, HorizontalAlignment = HorizontalAlignment.Center });
            var bar = new StackPanel { Width = 22, CornerRadius = new CornerRadius(4) };
            foreach (var segment in month.Segments)
            {
                var block = new Rectangle { Height = segment.Height, Fill = Ui.Brush(segment.ColorHex) };
                ToolTipService.SetToolTip(block, segment.Tip);
                bar.Children.Add(block);
            }
            if (month.Segments.Count == 0)
                bar.Children.Add(new Rectangle { Height = 3, Fill = Ui.ThemeBrush("ControlStrokeColorDefaultBrush") });
            stack.Children.Add(bar);
            column.Children.Add(stack);
            var label = new TextBlock { Text = month.Month, Style = Res("CaptionSecondaryStyle"), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 6, 0, 0) };
            Grid.SetRow(label, 1);
            column.Children.Add(label);
            Grid.SetColumn(column, MonthlyChart.ColumnDefinitions.Count - 1);
            MonthlyChart.Children.Add(column);
        }
    }

    /// <summary>₹1,250 as "1.3k" so a figure fits above a narrow bar.</summary>
    private static string Compact(decimal amount) => amount >= 1000 ? $"{amount / 1000m:0.#}k" : $"{amount:0}";

    // ---- Petrol -------------------------------------------------------------

    private void BuildPetrol(Services.DashboardData data)
    {
        var since = data.DaysSinceRefill();
        PetrolDays.Text = since?.ToString(CultureInfo.InvariantCulture) ?? "--";
        PetrolCaption.Text = since is null ? "no refills logged yet" : since == 1 ? "day since the last fill" : "days since the last fill";
        var months = data.PetrolMonths(70);
        var total = months.Sum(month => month.Count);
        PetrolHint.Text = total == 0 ? "No refills in the last year." : $"Honda Activa  ·  {total} refill{(total == 1 ? "" : "s")} in the last 12 months";

        PetrolChart.Children.Clear();
        PetrolChart.ColumnDefinitions.Clear();
        foreach (var month in months)
        {
            PetrolChart.ColumnDefinitions.Add(new ColumnDefinition());
            var column = new Grid();
            column.RowDefinitions.Add(new RowDefinition());
            column.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var stack = new StackPanel { VerticalAlignment = VerticalAlignment.Bottom, HorizontalAlignment = HorizontalAlignment.Center, Spacing = 2 };
            if (month.Count > 0)
                stack.Children.Add(new TextBlock { Text = month.CountText, Style = Res("CaptionSecondaryStyle"), FontSize = 11, HorizontalAlignment = HorizontalAlignment.Center });
            var bar = new Rectangle
            {
                Width = 22, Height = month.BarHeight, RadiusX = 4, RadiusY = 4,
                Fill = month.Count > 0 ? Ui.ThemeBrush("AccentFillColorDefaultBrush") : Ui.ThemeBrush("ControlStrokeColorDefaultBrush")
            };
            ToolTipService.SetToolTip(bar, month.Tip);
            stack.Children.Add(bar);
            column.Children.Add(stack);
            var label = new TextBlock { Text = month.Month, Style = Res("CaptionSecondaryStyle"), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 6, 0, 0) };
            Grid.SetRow(label, 1);
            column.Children.Add(label);
            Grid.SetColumn(column, PetrolChart.ColumnDefinitions.Count - 1);
            PetrolChart.Children.Add(column);
        }
    }

    // ---- Layout and navigation ---------------------------------------------

    private void Page_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        var wide = e.NewSize.Width >= 1040;
        // Two columns of panels when there is room, one when there is not.
        var panels = new FrameworkElement[] { DuePanel, UpcomingPanel, SpendPanel, MonthlyPanel, PetrolPanel };
        for (var index = 0; index < panels.Length; index++)
        {
            Grid.SetColumn(panels[index], wide ? index % 2 : 0);
            Grid.SetRow(panels[index], wide ? index / 2 : index);
            Grid.SetColumnSpan(panels[index], wide ? 1 : 2);
        }
        while (Panels.RowDefinitions.Count < panels.Length) Panels.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        if (wide == _wide) return;
        _wide = wide;
        BuildStats(_state.Dashboard);
    }

    private void ShelfCard_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is LibraryRow row) LibraryCommands.Open(row);
    }

    private void Shortcut_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is not string { Length: > 0 } target) return;
        var parts = target.Split(':');
        App.Window?.Navigate(parts[0], parts.Length > 1 ? parts[1] : null);
    }
}
