using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Navigation;
using SinuGameVault.Models;
using SinuGameVault.Services;

namespace SinuGameVault.Pages;

/// <summary>The BiglyBT dashboard: live torrents, their controls, and a history of what finished.</summary>
public sealed partial class DownloadsPage : Page, IRefreshablePage
{
    private readonly AppState _state = AppState.Current;
    private readonly ObservableCollection<TorrentRow> _torrents = [];
    private readonly DispatcherQueueTimer _timer;
    private DateTime _lastInteraction = DateTime.Now;
    private bool _refreshing;

    public DownloadsPage()
    {
        InitializeComponent();
        Torrents.ItemsSource = _torrents;
        _timer = DispatcherQueue.CreateTimer();
        _timer.Interval = TimeSpan.FromSeconds(2);
        _timer.Tick += async (_, _) =>
        {
            // Stop polling a page nobody is looking at; moving the pointer resumes it.
            if (DateTime.Now - _lastInteraction >= TimeSpan.FromMinutes(5)) { _timer.Stop(); return; }
            await LoadAsync(silent: true);
        };
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        _lastInteraction = DateTime.Now;
        ShowHistory();
        await LoadAsync(silent: false);
        if (_state.Bigly.Connected) _timer.Start();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e) => _timer.Stop();

    public Task RefreshAsync() => LoadAsync(silent: false);

    private void Page_PointerMoved(object sender, PointerRoutedEventArgs e)
    {
        _lastInteraction = DateTime.Now;
        if (!_timer.IsRunning && _state.Bigly.Connected) _timer.Start();
    }

    private async Task LoadAsync(bool silent)
    {
        if (_refreshing) return;
        var connected = _state.Bigly.Connected;
        Setup.Visibility = Ui.Show(!connected);
        Dashboard.Visibility = Ui.Show(connected);
        if (!connected) { StatusText.Text = "Not connected"; return; }
        _refreshing = true;
        if (!silent) StatusText.Text = "Refreshing…";
        try
        {
            var result = await _state.Bigly.TorrentsAsync();
            var incoming = ((result["torrents"] as JsonArray)?.OfType<JsonObject>() ?? []).Select(item => new TorrentRow
            {
                Id = Json.Integer(item, "id"), Name = Json.Text(item, "name"),
                Status = StatusName(Json.Integer(item, "status"), Json.Text(item, "errorString")),
                Progress = Json.Number(item, "percentDone") * 100, TotalSize = (long)Json.Number(item, "totalSize"),
                Downloaded = (long)Json.Number(item, "downloadedEver"), RateDown = (long)Json.Number(item, "rateDownload"),
                RateUp = (long)Json.Number(item, "rateUpload"), Eta = (long)Json.Number(item, "eta"),
                Peers = Json.Integer(item, "peersConnected"), Priority = Json.Integer(item, "bandwidthPriority"), Hash = Json.Text(item, "hashString")
            }).ToList();

            if (!string.Equals(_state.Vault.Root["biglyAutoRemoveCompleted"]?.ToString(), "false", StringComparison.OrdinalIgnoreCase))
                incoming = await RemoveCompletedAsync(incoming);
            Merge(incoming);

            ActiveCount.Text = _torrents.Count(row => row.Progress < 100).ToString();
            DownSpeed.Text = $"{Ui.Bytes(_torrents.Sum(row => row.RateDown))}/s";
            UpSpeed.Text = $"Upload {Ui.Bytes(_torrents.Sum(row => row.RateUp))}/s";
            Remaining.Text = Ui.Bytes(_torrents.Sum(row => Math.Max(0, row.TotalSize - row.Downloaded)));
            EmptyText.Visibility = Ui.Show(_torrents.Count == 0);
            StatusText.Text = $"BiglyBT  ·  {_torrents.Count} torrent{(_torrents.Count == 1 ? "" : "s")}  ·  updated {DateTime.Now:t}";
        }
        catch (Exception ex)
        {
            StatusText.Text = ex.Message;
            if (!_state.Bigly.Connected) { Setup.Visibility = Visibility.Visible; Dashboard.Visibility = Visibility.Collapsed; }
        }
        finally { _refreshing = false; }
    }

    /// <summary>Finished torrents are recorded in History and removed from BiglyBT; their files are kept.</summary>
    private async Task<List<TorrentRow>> RemoveCompletedAsync(List<TorrentRow> rows)
    {
        var completed = rows.Where(row => row.TotalSize > 0 && row.Downloaded >= row.TotalSize && row.Progress >= 99.999
                                          && !row.Status.Contains("Error", StringComparison.OrdinalIgnoreCase)).ToList();
        if (completed.Count == 0) return rows;
        foreach (var row in completed)
        {
            if (!_state.Actions.TorrentAlreadyRecordedComplete(row.Hash))
                await _state.Actions.RecordTorrentHistoryAsync(row, "Completed - auto removed", filesDeleted: false);
            await _state.Bigly.RemoveAsync(row.Id, deleteFiles: false);
        }
        ShowHistory();
        return rows.Except(completed).ToList();
    }

    /// <summary>
    /// Updates the list in place instead of replacing it, so a refresh every two
    /// seconds does not lose the selection or the scroll position.
    /// </summary>
    private void Merge(List<TorrentRow> incoming)
    {
        var selectedId = (Torrents.SelectedItem as TorrentRow)?.Id;
        var wanted = incoming.Select(row => row.Id).ToHashSet();
        for (var index = _torrents.Count - 1; index >= 0; index--)
            if (!wanted.Contains(_torrents[index].Id)) _torrents.RemoveAt(index);
        for (var index = 0; index < incoming.Count; index++)
        {
            var row = incoming[index];
            var existing = -1;
            for (var position = 0; position < _torrents.Count; position++)
                if (_torrents[position].Id == row.Id) { existing = position; break; }
            if (existing < 0) _torrents.Insert(Math.Min(index, _torrents.Count), row);
            else if (!Same(_torrents[existing], row)) _torrents[existing] = row;
        }
        if (selectedId is { } id && (Torrents.SelectedItem as TorrentRow)?.Id != id)
            Torrents.SelectedItem = _torrents.FirstOrDefault(row => row.Id == id);
    }

    private static bool Same(TorrentRow left, TorrentRow right) => left.Status == right.Status
        && Math.Abs(left.Progress - right.Progress) < 0.01 && left.Downloaded == right.Downloaded && left.TotalSize == right.TotalSize
        && left.RateDown == right.RateDown && left.RateUp == right.RateUp && left.Eta == right.Eta && left.Peers == right.Peers
        && left.Priority == right.Priority && left.Name == right.Name;

    private static string StatusName(int status, string error) => error.Length > 0 ? $"Error: {error}" : status switch
    {
        0 => "Paused", 1 => "Queued to verify", 2 => "Verifying", 3 => "Queued", 4 => "Downloading", 5 => "Queued to seed", 6 => "Seeding", _ => "Unknown"
    };

    private void ShowHistory()
    {
        var rows = _state.Vault.Collection("biglyHistory").OfType<JsonObject>()
            .OrderByDescending(item => Json.Number(item, "at")).Take(200)
            .Select(item => new TorrentHistoryRow
            {
                Name = Json.Text(item, "name"),
                Outcome = $"{Json.Text(item, "outcome")}  ·  files {(Json.Flag(item, "filesDeleted") ? "deleted" : "kept")}",
                Date = SafeDates.FromUnixMilliseconds((long)Json.Number(item, "at"))?.LocalDateTime.ToString("dd MMM yyyy, h:mm tt") ?? "",
                Progress = $"{Json.Number(item, "progress"):0.#}%",
                Downloaded = Ui.Bytes((long)Json.Number(item, "downloaded"))
            }).ToList();
        History.ItemsSource = rows;
        HistoryEmpty.Visibility = Ui.Show(rows.Count == 0);
    }

    // ---- Commands -----------------------------------------------------------

    private void Torrents_SelectionChanged(object sender, SelectionChangedEventArgs e) => _lastInteraction = DateTime.Now;

    private TorrentRow? Selected()
    {
        if (Torrents.SelectedItem is TorrentRow row) return row;
        _state.Notify("Select a torrent first.");
        return null;
    }

    private async Task ActAsync(string failure, Func<Task> action)
    {
        if (await _state.RunAsync(action, failure)) await LoadAsync(silent: true);
    }

    private async void AddMagnet_Click(object sender, RoutedEventArgs e)
    {
        var text = await Ui.ClipboardTextAsync();
        var start = text.IndexOf("magnet:?", StringComparison.OrdinalIgnoreCase);
        if (start < 0)
        {
            _state.Notify("The clipboard does not contain a magnet link. Copy one, then try again.", InfoBarSeverity.Warning);
            return;
        }
        var magnet = text[start..].Split(['\r', '\n', ' '], StringSplitOptions.RemoveEmptyEntries)[0];
        await ActAsync("The torrent could not be added.", () => _state.Bigly.AddMagnetAsync(magnet));
    }

    private async void Start_Click(object sender, RoutedEventArgs e)
    {
        if (Selected() is { } row) await ActAsync("The torrent could not be started.", () => _state.Bigly.StartAsync(row.Id));
    }

    private async void Pause_Click(object sender, RoutedEventArgs e)
    {
        if (Selected() is { } row) await ActAsync("The torrent could not be paused.", () => _state.Bigly.StopAsync(row.Id));
    }

    private async void Priority_Click(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse((sender as FrameworkElement)?.Tag?.ToString(), out var priority) || Selected() is not { } row) return;
        await ActAsync("The priority could not be changed.", () => _state.Bigly.PriorityAsync(row.Id, priority));
    }

    private async void Remove_Click(object sender, RoutedEventArgs e) => await RemoveAsync(deleteFiles: false);
    private async void Delete_Click(object sender, RoutedEventArgs e) => await RemoveAsync(deleteFiles: true);

    private async Task RemoveAsync(bool deleteFiles)
    {
        if (Selected() is not { } row) return;
        var confirmed = deleteFiles
            ? await Ui.ConfirmAsync("Delete torrent and files", $"Remove “{row.Name}” and permanently delete its downloaded files?\n\nThis cannot be undone.", "Delete files", destructive: true)
            : await Ui.ConfirmAsync("Remove torrent", $"Remove “{row.Name}” from BiglyBT? The downloaded files are kept.", "Remove");
        if (!confirmed) return;
        await ActAsync("The torrent could not be removed.", async () =>
        {
            await _state.Bigly.RemoveAsync(row.Id, deleteFiles);
            await _state.Actions.RecordTorrentHistoryAsync(row, row.Progress >= 100 ? "Completed - manually removed" : "Removed before completion", deleteFiles);
        });
        ShowHistory();
    }

    private void OpenSettings_Click(object sender, RoutedEventArgs e) => App.Window?.Navigate("Settings");
}
