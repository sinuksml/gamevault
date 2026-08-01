using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;

namespace SinuGameVault;

public partial class AddGameWindow : Window
{
    public string CollectionName { get; private set; } = "playing";
    public JsonObject? Item { get; private set; }

    public AddGameWindow() => InitializeComponent();

    private void Add_Click(object sender, RoutedEventArgs e)
    {
        var name = NameBox.Text.Trim();
        if (name.Length < 2)
        {
            MessageBox.Show(this, "Enter a game title.", "GameVault", MessageBoxButton.OK, MessageBoxImage.Information);
            NameBox.Focus();
            return;
        }

        CollectionName = ((ComboBoxItem)CollectionBox.SelectedItem).Tag?.ToString() ?? "playing";
        var platform = ((ComboBoxItem)PlatformBox.SelectedItem).Content?.ToString() ?? "PS5";
        Item = new JsonObject
        {
            ["id"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(),
            ["name"] = name,
            ["platform"] = platform,
            ["platforms"] = new JsonArray(platform),
            ["date"] = DateBox.Text.Trim(),
            ["added"] = DateTime.Now.ToString("yyyy-MM-dd"),
            ["status"] = CollectionName == "played" ? "Completed" : CollectionName == "playing" ? "Playing" : ""
        };
        DialogResult = true;
    }
}
