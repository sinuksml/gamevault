using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;

namespace SinuGameVault;

public sealed record SubscriptionRow(string Id, string Service, string End, string Monthly, JsonObject Source);

public partial class SubscriptionManagerWindow : Window
{
    private readonly ObservableCollection<SubscriptionRow> _rows = [];
    public JsonArray Result { get; private set; } = [];

    public SubscriptionManagerWindow(JsonArray subscriptions)
    {
        InitializeComponent();
        foreach (var item in subscriptions.OfType<JsonObject>()) AddRow(item.DeepClone() as JsonObject ?? []);
        SubscriptionGrid.ItemsSource = _rows;
    }

    private void AddRow(JsonObject item) => _rows.Add(new SubscriptionRow(Text(item, "id"), Text(item, "service", "name"), Text(item, "renewsAt", "end"), Text(item, "monthlyCost", "cost"), item));
    private void SubscriptionGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SubscriptionGrid.SelectedItem is not SubscriptionRow row) return;
        ServiceBox.Text = row.Service;
        StartBox.SelectedDate = DateTime.TryParse(Text(row.Source, "start"), out var start) ? start : null;
        EndBox.SelectedDate = DateTime.TryParse(Text(row.Source, "renewsAt", "end"), out var end) ? end : null;
        MonthlyBox.Text = Text(row.Source, "monthlyCost", "cost"); TotalBox.Text = Text(row.Source, "totalPaid");
    }
    private void Save_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(ServiceBox.Text)) { MessageBox.Show(this, "Enter the subscription service name."); return; }
        var existing = SubscriptionGrid.SelectedItem as SubscriptionRow;
        var item = existing?.Source.DeepClone() as JsonObject ?? new JsonObject { ["id"] = Guid.NewGuid().ToString("N") };
        item["service"] = ServiceBox.Text.Trim(); item["start"] = StartBox.SelectedDate?.ToString("yyyy-MM-dd") ?? "";
        item["renewsAt"] = EndBox.SelectedDate?.ToString("yyyy-MM-dd") ?? "";
        item["monthlyCost"] = Number(MonthlyBox.Text); item["totalPaid"] = Number(TotalBox.Text);
        if (existing is not null) _rows.Remove(existing);
        AddRow(item); SubscriptionGrid.SelectedItem = _rows.Last();
    }
    private void New_Click(object sender, RoutedEventArgs e) { SubscriptionGrid.SelectedItem = null; ServiceBox.Clear(); StartBox.SelectedDate = DateTime.Today; EndBox.SelectedDate = null; MonthlyBox.Clear(); TotalBox.Clear(); ServiceBox.Focus(); }
    private void Remove_Click(object sender, RoutedEventArgs e)
    {
        if (SubscriptionGrid.SelectedItem is not SubscriptionRow row) return;
        if (MessageBox.Show(this, $"Remove the subscription '{row.Service}'? Linked games will remain in your library.", "Confirm removal", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes) _rows.Remove(row);
    }
    private void Apply_Click(object sender, RoutedEventArgs e) { Result = new JsonArray(_rows.Select(row => (JsonNode)row.Source.DeepClone()).ToArray()); DialogResult = true; }
    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
    private static string Text(JsonObject item, params string[] keys) => keys.Select(key => item[key]?.ToString()).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "";
    private static double Number(string value) => double.TryParse(value, out var number) ? number : 0;
}
