using System.Collections.ObjectModel;
using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SinuGameVault.Services;

namespace SinuGameVault.Dialogs;

public sealed record SubscriptionRow(string Service, string Detail, JsonObject Source);

/// <summary>Edits the list of gaming subscriptions; nothing is saved until Apply.</summary>
public sealed partial class SubscriptionsDialog : ContentDialog
{
    private readonly ObservableCollection<SubscriptionRow> _rows = [];

    /// <summary>The edited subscription list, set when the dialog is applied.</summary>
    internal JsonArray? Result { get; private set; }

    public SubscriptionsDialog(JsonArray subscriptions)
    {
        InitializeComponent();
        foreach (var item in subscriptions.OfType<JsonObject>()) _rows.Add(RowFor(Json.Clone(item)));
        List.ItemsSource = _rows;
        if (_rows.Count > 0) List.SelectedIndex = 0; else StartBox.Date = DateTimeOffset.Now;
    }

    private static SubscriptionRow RowFor(JsonObject item)
    {
        var renews = LibraryReader.DisplayDate(Json.Text(item, "renewsAt", "end"));
        var monthly = Json.Number(item, "monthlyCost", "cost");
        var detail = string.Join("  ·  ", new[] { renews.Length > 0 ? $"Renews {renews}" : "", monthly > 0 ? $"₹{monthly:N0} a month" : "" }.Where(text => text.Length > 0));
        return new SubscriptionRow(Json.Text(item, "service", "name"), detail.Length > 0 ? detail : "No renewal date", item);
    }

    private void List_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (List.SelectedItem is not SubscriptionRow row) return;
        Problem.IsOpen = false;
        ServiceBox.Text = row.Service;
        StartBox.Date = Date(Json.Text(row.Source, "start"));
        EndBox.Date = Date(Json.Text(row.Source, "renewsAt", "end"));
        MonthlyBox.Value = Amount(row.Source, "monthlyCost", "cost");
        TotalBox.Value = Amount(row.Source, "totalPaid");
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(ServiceBox.Text))
        {
            Problem.Message = "Enter the subscription service name.";
            Problem.IsOpen = true;
            return;
        }
        Problem.IsOpen = false;
        var existing = List.SelectedItem as SubscriptionRow;
        var item = existing is null ? new JsonObject { ["id"] = Guid.NewGuid().ToString("N") } : Json.Clone(existing.Source);
        item["service"] = ServiceBox.Text.Trim();
        item["start"] = Iso(StartBox.Date);
        item["renewsAt"] = Iso(EndBox.Date);
        item["monthlyCost"] = double.IsNaN(MonthlyBox.Value) ? 0 : MonthlyBox.Value;
        item["totalPaid"] = double.IsNaN(TotalBox.Value) ? 0 : TotalBox.Value;
        var row = RowFor(item);
        if (existing is not null) _rows[_rows.IndexOf(existing)] = row; else _rows.Add(row);
        List.SelectedItem = row;
    }

    private void New_Click(object sender, RoutedEventArgs e)
    {
        List.SelectedItem = null;
        ServiceBox.Text = "";
        StartBox.Date = DateTimeOffset.Now;
        EndBox.Date = null;
        MonthlyBox.Value = double.NaN;
        TotalBox.Value = double.NaN;
        ServiceBox.Focus(FocusState.Programmatic);
    }

    private void Remove_Click(object sender, RoutedEventArgs e)
    {
        // Nothing is saved until Apply, so removing here needs no second confirmation.
        if (List.SelectedItem is SubscriptionRow row) _rows.Remove(row);
        New_Click(sender, e);
    }

    private void Apply_Click(ContentDialog sender, ContentDialogButtonClickEventArgs args) =>
        Result = new JsonArray(_rows.Select(row => (JsonNode)row.Source.DeepClone()).ToArray());

    private static string Iso(DateTimeOffset? date) => date?.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";
    private static DateTimeOffset? Date(string value) => DateTime.TryParse(value, out var date) ? new DateTimeOffset(date) : null;
    private static double Amount(JsonObject item, params string[] keys) => Json.Number(item, keys) is > 0 and var value ? value : double.NaN;
}
