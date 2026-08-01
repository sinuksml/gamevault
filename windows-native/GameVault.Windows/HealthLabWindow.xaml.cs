using System.Text.Json.Nodes;
using System.Windows;

namespace SinuGameVault;

public partial class HealthLabWindow : Window
{
    public JsonObject? Item { get; private set; }
    public HealthLabWindow() { InitializeComponent(); DateBox.SelectedDate = DateTime.Today; }
    private void Save_Click(object sender, RoutedEventArgs e)
    {
        if (TestBox.Text.Trim().Length < 2 || ValueBox.Text.Trim().Length == 0) { MessageBox.Show(this, "Enter the test and value."); return; }
        Item = new JsonObject { ["id"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(), ["date"] = (DateBox.SelectedDate ?? DateTime.Today).ToString("yyyy-MM-dd"), ["test"] = TestBox.Text.Trim(), ["value"] = ValueBox.Text.Trim(), ["unit"] = UnitBox.Text.Trim(), ["range"] = RangeBox.Text.Trim(), ["note"] = NoteBox.Text.Trim() };
        DialogResult = true;
    }
}
