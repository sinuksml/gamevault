using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using SinuGameVault.Models;

namespace SinuGameVault.Controls;

/// <summary>
/// One title as a card: artwork, name, a line of detail and a status line.
/// Used by the library grids, the Home rows and Plex, so a title looks the same
/// wherever it appears.
/// </summary>
public sealed partial class TitleCard : UserControl
{
    public static readonly DependencyProperty RowProperty = DependencyProperty.Register(
        nameof(Row), typeof(LibraryRow), typeof(TitleCard), new PropertyMetadata(null, (d, _) => ((TitleCard)d).Update()));

    public static readonly DependencyProperty CompactProperty = DependencyProperty.Register(
        nameof(Compact), typeof(bool), typeof(TitleCard), new PropertyMetadata(false, (d, _) => ((TitleCard)d).Update()));

    public static readonly DependencyProperty ShowCategoryProperty = DependencyProperty.Register(
        nameof(ShowCategory), typeof(bool), typeof(TitleCard), new PropertyMetadata(false, (d, _) => ((TitleCard)d).Update()));

    public TitleCard() => InitializeComponent();

    public LibraryRow? Row
    {
        get => (LibraryRow?)GetValue(RowProperty);
        set => SetValue(RowProperty, value);
    }

    /// <summary>Smaller cards, so more titles fit on screen.</summary>
    public bool Compact
    {
        get => (bool)GetValue(CompactProperty);
        set => SetValue(CompactProperty, value);
    }

    /// <summary>Shows the list a title belongs to; for rows that mix several lists.</summary>
    public bool ShowCategory
    {
        get => (bool)GetValue(ShowCategoryProperty);
        set => SetValue(ShowCategoryProperty, value);
    }

    /// <summary>The card width for a kind of artwork at a density.</summary>
    public static double WidthFor(bool portrait, bool compact) => portrait ? (compact ? 132 : 168) : (compact ? 224 : 288);

    private void Update()
    {
        var row = Row;
        var portrait = row?.IsPortraitArt ?? true;
        var width = WidthFor(portrait, Compact);
        Root.Width = width;
        ArtFrame.Height = Math.Round(portrait ? width * 1.5 : width * 9 / 16);
        Art.SetDecodeWidth(ArtImage, (int)width);
        CategoryPill.Visibility = Ui.Show(ShowCategory && row is not null);
        if (row is null) { MetaText.Text = ""; StatusText.Text = ""; return; }

        MetaText.Text = string.Join("  ·  ", new[] { row.Date, row.CardRatingText, row.CostText }.Where(text => text.Length > 0).Distinct());
        MetaText.Visibility = Ui.ShowText(MetaText.Text);

        // The line that says what needs attention: a countdown, a rental vendor, or progress.
        var status = row.HasCountdown ? row.DaysText
            : row.Collection == "queue" ? row.CardStatusText
            : row.Collection is "plex" or "playing" or "watchingMovies" or "watchingSeries" or "rentalHistory" ? row.Status
            : row.Badges;
        StatusText.Text = status;
        StatusText.Visibility = Ui.ShowText(status);
        StatusText.Foreground = row.HasCountdown ? Ui.CountdownBrush(row.DaysLeft) : Ui.ThemeBrush("TextFillColorSecondaryBrush");
    }

    private void Card_PointerEntered(object sender, PointerRoutedEventArgs e) => MoreButton.Opacity = 1;
    private void Card_PointerExited(object sender, PointerRoutedEventArgs e) => MoreButton.Opacity = 0;

    private void More_Click(object sender, RoutedEventArgs e)
    {
        if (Row is { } row) LibraryCommands.CardMenu(row).ShowAt(MoreButton);
    }

    private void Root_ContextRequested(UIElement sender, ContextRequestedEventArgs args)
    {
        if (Row is not { } row) return;
        var menu = LibraryCommands.CardMenu(row);
        if (args.TryGetPosition(Root, out var point)) menu.ShowAt(Root, point);
        else menu.ShowAt(Root);
        args.Handled = true;
    }
}
