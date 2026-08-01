using System.Text.Json.Nodes;
using System.Windows;

namespace SinuGameVault;

public sealed record VendorReportRow(string Vendor, int Count, string Total);

public partial class VendorReportWindow : Window
{
    public VendorReportWindow(IEnumerable<JsonObject> rentals)
    {
        InitializeComponent();
        VendorGrid.ItemsSource = rentals.GroupBy(item => item["vendor"]?.ToString()?.Trim() is { Length: > 0 } vendor ? vendor : "Unknown vendor", StringComparer.OrdinalIgnoreCase)
            .Select(group => new VendorReportRow(group.Key, group.Count(), $"Rs {group.Sum(item => double.TryParse(item["cost"]?.ToString(), out var cost) ? cost : 0):N0}"))
            .OrderByDescending(row => row.Count).ToList();
    }
    private void Close_Click(object sender, RoutedEventArgs e) => Close();
}
