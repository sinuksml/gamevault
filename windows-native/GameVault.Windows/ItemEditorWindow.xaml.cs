using System.Globalization;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;

namespace SinuGameVault;

public partial class ItemEditorWindow : Window
{
    private readonly JsonObject _source;
    private readonly string _collection;
    public JsonObject Item { get; private set; }

    public ItemEditorWindow(string collection, JsonObject? source = null)
    {
        InitializeComponent();
        _collection = collection;
        _source = source?.DeepClone() as JsonObject ?? new JsonObject();
        Item = _source;
        Heading.Text = source is null ? "Add library item" : "Edit library item";
        SaveButton.Content = source is null ? "Add" : "Save changes";
        LoadValues();
    }

    private void LoadValues()
    {
        NameBox.Text = Text("name", "title");
        SelectStatus(Text("status", "state"));
        PlatformBox.Text = Text("platform", "provider", "vendor");
        VendorBox.Text = Text("vendor", "provider");
        CostBox.Text = Text("cost");
        RatingBox.Text = Text("userRating", "myRating");
        GenreBox.Text = Text("genre");
        ImageBox.Text = Text("img", "poster", "cover");
        OverviewBox.Text = Text("overview", "plot", "summary", "description");
        NoteBox.Text = Text("note", "remarks");
        StartDateBox.SelectedDate = Date(Text("start", "date", "releaseDate", "added"));
        EndDateBox.SelectedDate = Date(Text("returnDate", "end"));
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        var name = NameBox.Text.Trim();
        if (name.Length < 2)
        {
            MessageBox.Show(this, "Enter a title.", "GameVault", MessageBoxButton.OK, MessageBoxImage.Information);
            NameBox.Focus();
            return;
        }
        Item = _source.DeepClone() as JsonObject ?? new JsonObject();
        Item["id"] ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture);
        var titleKey = Item.ContainsKey("title") || _collection.Contains("Movie", StringComparison.OrdinalIgnoreCase) || _collection.Contains("Series", StringComparison.OrdinalIgnoreCase) ? "title" : "name";
        Item[titleKey] = name;
        Set("status", StatusBox.Text.Trim());
        Set("platform", PlatformBox.Text.Trim());
        Set("vendor", VendorBox.Text.Trim());
        SetNumber("cost", CostBox.Text);
        SetNumber("userRating", RatingBox.Text);
        Set("genre", GenreBox.Text.Trim());
        Set(Item.ContainsKey("poster") ? "poster" : "img", ImageBox.Text.Trim());
        Set("overview", OverviewBox.Text.Trim());
        Set("note", NoteBox.Text.Trim());
        if (StartDateBox.SelectedDate is DateTime start)
        {
            var key = _collection == "rentals" ? "start" : Item.ContainsKey("releaseDate") ? "releaseDate" : "date";
            Item[key] = start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }
        if (EndDateBox.SelectedDate is DateTime end)
        {
            Item[_collection == "rentalHistory" ? "end" : "returnDate"] = end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            if (_collection == "rentals" && StartDateBox.SelectedDate is DateTime rentalStart)
                Item["days"] = Math.Max(1, (end.Date - rentalStart.Date).Days);
            if (_collection == "rentalHistory" && StartDateBox.SelectedDate is DateTime historyStart)
                Item["used"] = Math.Max(0, (end.Date - historyStart.Date).Days);
        }
        DialogResult = true;
    }

    private string Text(params string[] keys)
    {
        foreach (var key in keys)
        {
            var value = _source[key]?.ToString() ?? "";
            if (value.Length > 0) return value;
        }
        return "";
    }

    private static DateTime? Date(string value) => DateTime.TryParse(value, out var date) ? date : null;
    private void SelectStatus(string status)
    {
        if (status.Length == 0) { StatusBox.SelectedIndex = 0; return; }
        foreach (var item in StatusBox.Items.OfType<ComboBoxItem>())
        {
            if (!string.Equals(item.Content?.ToString(), status, StringComparison.OrdinalIgnoreCase)) continue;
            StatusBox.SelectedItem = item;
            return;
        }
        var custom = new ComboBoxItem { Content = status };
        StatusBox.Items.Add(custom);
        StatusBox.SelectedItem = custom;
    }
    private void Set(string key, string value) { if (value.Length > 0) Item[key] = value; else Item.Remove(key); }
    private void SetNumber(string key, string text)
    {
        if (double.TryParse(text, NumberStyles.Number, CultureInfo.CurrentCulture, out var value)
            || double.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out value)) Item[key] = value;
        else if (text.Trim().Length == 0) Item.Remove(key);
    }
}
