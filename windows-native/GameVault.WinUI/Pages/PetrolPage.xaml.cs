using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SinuGameVault.Models;

namespace SinuGameVault.Pages;

/// <summary>Logs petrol refills and shows how long each tank lasted.</summary>
public sealed partial class PetrolPage : Page
{
    private readonly AppState _state = AppState.Current;

    public PetrolPage()
    {
        InitializeComponent();
        RefillDate.Date = DateTimeOffset.Now;
        RefillDate.MaxDate = DateTimeOffset.Now;
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        _state.LibraryChanged += Refresh;
        Refresh();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e) => _state.LibraryChanged -= Refresh;

    private void Refresh()
    {
        var data = _state.Dashboard;
        var history = data.PetrolHistory();
        History.ItemsSource = history;
        EmptyText.Visibility = Ui.Show(history.Count == 0);
        TotalRefills.Text = history.Count.ToString(CultureInfo.InvariantCulture);
        DaysSince.Text = data.DaysSinceRefill()?.ToString(CultureInfo.InvariantCulture) ?? "--";
        LastDate.Text = history.Count > 0 ? $"Last filled {history[0].Date}" : "No refills logged yet";
        AverageGap.Text = data.AveragePetrolGap()?.ToString(CultureInfo.InvariantCulture) ?? "--";
    }

    private async void Save_Click(object sender, RoutedEventArgs e)
    {
        var date = (RefillDate.Date ?? DateTimeOffset.Now).Date;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var record = new JsonObject
        {
            ["id"] = now.ToString(CultureInfo.InvariantCulture),
            ["date"] = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["addedAt"] = now
        };
        if (!await _state.RunAsync(() => _state.Vault.AddAsync("petrol", record), "The refill could not be saved.")) return;
        RefillDate.Date = DateTimeOffset.Now;
        _state.Notify($"Refill on {date:dd MMM yyyy} saved.", InfoBarSeverity.Success);
    }

    private async void Delete_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is not PetrolRow { Id.Length: > 0 } row) return;
        if (!await Ui.ConfirmAsync("Delete refill", $"Delete the refill dated {row.Date}?", "Delete", destructive: true)) return;
        _state.Actions.CaptureUndo();
        if (await _state.RunAsync(() => _state.Vault.RemoveAsync("petrol", row.Id), "The refill could not be deleted."))
            _state.Notify("Refill deleted.", InfoBarSeverity.Success, offerUndo: true);
    }
}
