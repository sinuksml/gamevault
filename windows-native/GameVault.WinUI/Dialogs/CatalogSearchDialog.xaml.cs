using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using SinuGameVault.Services;

namespace SinuGameVault.Dialogs;

public sealed record SearchResultRow(string Title, string Detail, string Rating, JsonObject Source)
{
    public string Image => Json.Text(Source, "img", "poster", "cover");
}

/// <summary>Searches RAWG or TMDB and returns the record the user picked.</summary>
public sealed partial class CatalogSearchDialog : ContentDialog
{
    private readonly CatalogService _catalog;
    private readonly string _type;
    private readonly ObservableCollection<SearchResultRow> _results = [];

    /// <summary>The chosen catalog record; null when cancelled or entering manually.</summary>
    internal JsonObject? SelectedItem { get; private set; }
    /// <summary>True when the user chose to type the details in instead.</summary>
    public bool ManualEntry { get; private set; }

    public CatalogSearchDialog(CatalogService catalog, string type)
    {
        InitializeComponent();
        _catalog = catalog;
        _type = type;
        Title = type switch { "Game" => "Find a game", "Movie" => "Find a movie", _ => "Find a TV show" };
        Results.ItemsSource = _results;
        Opened += (_, _) => QueryBox.Focus(FocusState.Programmatic);
    }

    private async void Query_Submitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        var query = QueryBox.Text.Trim();
        if (query.Length < 2) return;
        Busy.Visibility = Visibility.Visible;
        Results.Visibility = Visibility.Collapsed;
        try
        {
            var items = _type == "Game" ? await _catalog.SearchGamesAsync(query) : await _catalog.SearchMediaAsync(query, _type);
            _results.Clear();
            foreach (var item in items)
            {
                var title = Json.Text(item, _type == "Game" ? "name" : "title", "name", "title");
                var rating = Json.Text(item, "imdb", "rrating", "tmdb");
                var detail = string.Join("  ·  ", new[] { LibraryReader.DisplayDate(Json.Text(item, "date")), Json.Text(item, "genre") }.Where(text => text.Length > 0));
                _results.Add(new SearchResultRow(title.Length > 0 ? title : "Untitled", detail, rating.Length > 0 ? $"★ {rating}" : "", item));
            }
            StatusText.Text = _results.Count == 0 ? "Nothing matched. Try another spelling, or enter it manually." : $"{_results.Count} results";
        }
        catch (Exception ex) { StatusText.Text = ex.Message; }
        finally
        {
            Busy.Visibility = Visibility.Collapsed;
            Results.Visibility = Visibility.Visible;
        }
    }

    private void Results_SelectionChanged(object sender, SelectionChangedEventArgs e) => IsPrimaryButtonEnabled = Results.SelectedItem is SearchResultRow;

    private void Results_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        if (Results.SelectedItem is not SearchResultRow row) return;
        SelectedItem = Json.Clone(row.Source);
        Hide();
    }

    private void Add_Click(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        if (Results.SelectedItem is SearchResultRow row) SelectedItem = Json.Clone(row.Source);
        else args.Cancel = true;
    }

    private void Manual_Click(ContentDialog sender, ContentDialogButtonClickEventArgs args) => ManualEntry = true;
}
