using SinuGameVault.Services;
using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Input;

namespace SinuGameVault;

public sealed record SearchResultRow(string Title, string Date, string Rating, string Genre, JsonObject Source);

public partial class CatalogSearchWindow : Window
{
    private readonly CatalogService _catalog;
    private readonly string _type;
    private readonly ObservableCollection<SearchResultRow> _results = [];
    public JsonObject? SelectedItem { get; private set; }

    public CatalogSearchWindow(CatalogService catalog, string type)
    {
        InitializeComponent();
        _catalog = catalog;
        _type = type;
        ResultsGrid.ItemsSource = _results;
        Loaded += (_, _) => QueryBox.Focus();
    }

    private async void Search_Click(object sender, RoutedEventArgs e) => await SearchAsync();
    private async void Query_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) { e.Handled = true; await SearchAsync(); } }
    private async Task SearchAsync()
    {
        var query = QueryBox.Text.Trim();
        if (query.Length < 2) return;
        IsEnabled = false;
        StatusText.Text = "Searching online...";
        try
        {
            var items = _type == "Game" ? await _catalog.SearchGamesAsync(query) : await _catalog.SearchMediaAsync(query, _type);
            _results.Clear();
            foreach (var item in items)
            {
                var title = item[_type == "Game" ? "name" : "title"]?.ToString() ?? "Untitled";
                var rating = item["imdb"]?.ToString() ?? item["rrating"]?.ToString() ?? item["tmdb"]?.ToString() ?? "--";
                _results.Add(new SearchResultRow(title, item["date"]?.ToString() ?? "", rating, item["genre"]?.ToString() ?? "", item));
            }
            StatusText.Text = $"{_results.Count} results";
        }
        catch (Exception ex) { StatusText.Text = ex.Message; }
        finally { IsEnabled = true; }
    }
    private void Results_DoubleClick(object sender, MouseButtonEventArgs e) => Choose();
    private void Add_Click(object sender, RoutedEventArgs e) => Choose();
    private void Choose()
    {
        if (ResultsGrid.SelectedItem is not SearchResultRow row) return;
        SelectedItem = row.Source.DeepClone() as JsonObject;
        DialogResult = true;
    }
}
