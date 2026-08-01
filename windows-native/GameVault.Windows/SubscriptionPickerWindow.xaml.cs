using System.Text.Json.Nodes;
using System.Windows;

namespace SinuGameVault;

public partial class SubscriptionPickerWindow : Window
{
    public JsonObject? SelectedSubscription { get; private set; }
    public SubscriptionPickerWindow(IEnumerable<JsonObject> subscriptions)
    {
        InitializeComponent();
        foreach (var item in subscriptions) SubscriptionBox.Items.Add(new System.Windows.Controls.ComboBoxItem { Content = item["service"]?.ToString() ?? "Subscription", Tag = item });
        SubscriptionBox.SelectedIndex = 0;
    }
    private void Add_Click(object sender, RoutedEventArgs e) { SelectedSubscription = (SubscriptionBox.SelectedItem as System.Windows.Controls.ComboBoxItem)?.Tag as JsonObject; if (SelectedSubscription is not null) DialogResult = true; }
    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
