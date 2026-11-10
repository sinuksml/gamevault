using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SinuGameVault.Services;

namespace SinuGameVault.Dialogs;

/// <summary>
/// Adds or edits one library record. Fields the form does not show are carried
/// through untouched, so editing here never erases data another client wrote.
/// </summary>
public sealed partial class ItemEditorDialog : ContentDialog
{
    private readonly JsonObject _source;
    private readonly string _collection;
    private readonly bool _rental;
    private readonly bool _purchase;

    /// <summary>The edited record, set when the dialog is saved.</summary>
    internal JsonObject? Item { get; private set; }

    public ItemEditorDialog(string collection, JsonObject? source = null, string? heading = null, string? saveLabel = null)
    {
        InitializeComponent();
        _collection = collection;
        _source = Json.Clone(source);
        _rental = collection is "rentals" or "rentalHistory";
        _purchase = collection == "purchasedGames";
        Title = heading ?? (source is null ? "Add title" : "Edit title");
        PrimaryButtonText = saveLabel ?? (source is null ? "Add" : "Save changes");

        var media = collection.Contains("Movie", StringComparison.OrdinalIgnoreCase) || collection.Contains("Series", StringComparison.OrdinalIgnoreCase);
        foreach (var status in media ? new[] { "Watchlist", "Watching", "Watched", "On Hold", "Dropped" }
                     : new[] { "Queued", "Playing", "Resume Later", "On Hold", "Completed", "Dropped" })
            StatusBox.Items.Add(status);

        StartDateBox.Header = _rental ? "Rental start date" : _purchase ? "Purchase date" : "Release date";
        EndDateBox.Visibility = Ui.Show(_rental);
        CostBox.Visibility = Ui.Show(_rental || _purchase);
        if (_purchase)
        {
            Description.Text = "This is a permanent ownership record. Playing or completing the game will not remove it.";
            VendorBox.Header = "Store";
            CostBox.Header = "Purchase price (₹)";
            StatusBox.Visibility = Visibility.Collapsed;
        }
        Load();
    }

    private void Load()
    {
        NameBox.Text = Text("name", "title");
        StatusBox.Text = Text("status", "state");
        PlatformBox.Text = Text("platform", "provider", "vendor");
        VendorBox.Text = Text("store", "vendor", "provider");
        CostBox.Value = Number("purchasePrice", "cost");
        RatingBox.Value = Number("userRating", "myRating");
        GenreBox.Text = Text("genre");
        ImageBox.Text = Text("img", "poster", "cover");
        OverviewBox.Text = Text("overview", "plot", "summary", "description");
        NoteBox.Text = Text("note", "remarks");
        StartDateBox.Date = Date(Text("purchaseDate", "start", "date", "releaseDate", "added"));
        EndDateBox.Date = Date(Text("returnDate", "end"));
        if (_purchase)
        {
            if (PlatformBox.Text.Length == 0) PlatformBox.Text = "PC";
            if (VendorBox.Text.Length == 0) VendorBox.Text = "Steam";
            StartDateBox.Date ??= DateTimeOffset.Now;
        }
    }

    private void Save_Click(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        var name = NameBox.Text.Trim();
        if (name.Length < 2) { Reject(args, "Enter a title."); return; }
        var start = StartDateBox.Date?.Date;
        var end = EndDateBox.Date?.Date;
        if (_rental && start is not null && end is not null && end < start)
        {
            Reject(args, "The return date must be on or after the rental start date.");
            return;
        }

        var item = Json.Clone(_source);
        item["id"] ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture);
        var media = _collection.Contains("Movie", StringComparison.OrdinalIgnoreCase) || _collection.Contains("Series", StringComparison.OrdinalIgnoreCase);
        item[item.ContainsKey("title") || media ? "title" : "name"] = name;
        Set(item, "status", StatusBox.Text.Trim());
        Set(item, "platform", PlatformBox.Text.Trim());
        Set(item, _purchase ? "store" : "vendor", VendorBox.Text.Trim());
        SetNumber(item, _purchase ? "purchasePrice" : "cost", CostBox.Value);
        SetNumber(item, "userRating", RatingBox.Value);
        Set(item, "genre", GenreBox.Text.Trim());
        Set(item, item.ContainsKey("poster") ? "poster" : "img", ImageBox.Text.Trim());
        Set(item, "overview", OverviewBox.Text.Trim());
        Set(item, "note", NoteBox.Text.Trim());
        if (start is { } from)
        {
            var key = _purchase ? "purchaseDate" : _rental ? "start" : item.ContainsKey("releaseDate") ? "releaseDate" : "date";
            item[key] = Iso(from);
        }
        if (_rental && end is { } to)
        {
            item[_collection == "rentalHistory" ? "end" : "returnDate"] = Iso(to);
            if (start is { } began)
            {
                if (_collection == "rentals") item["days"] = Math.Max(1, (to - began).Days);
                else item["used"] = Math.Max(0, (to - began).Days);
            }
        }
        if (_purchase)
        {
            item["store"] = VendorBox.Text.Trim().Length > 0 ? VendorBox.Text.Trim() : "Steam";
            item["platform"] = PlatformBox.Text.Trim().Length > 0 ? PlatformBox.Text.Trim() : "PC";
            item["permanent"] = true;
            item["status"] = "Owned";
            item["added"] ??= Iso(DateTime.Today);
        }
        Item = item;
    }

    private void Reject(ContentDialogButtonClickEventArgs args, string message)
    {
        args.Cancel = true;
        Problem.Message = message;
        Problem.IsOpen = true;
    }

    private string Text(params string[] keys) => Json.Text(_source, keys);

    private double Number(params string[] keys)
    {
        var value = Json.Number(_source, keys);
        return value > 0 ? value : double.NaN;
    }

    private static string Iso(DateTime date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    private static DateTimeOffset? Date(string value) => DateTime.TryParse(value, out var date) ? new DateTimeOffset(date) : null;

    private static void Set(JsonObject item, string key, string value)
    {
        if (value.Length > 0) item[key] = value; else item.Remove(key);
    }

    private static void SetNumber(JsonObject item, string key, double value)
    {
        if (double.IsNaN(value) || value <= 0) item.Remove(key); else item[key] = value;
    }
}
