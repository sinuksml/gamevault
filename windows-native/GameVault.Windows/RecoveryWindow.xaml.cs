using SinuGameVault.Services;
using System.Collections.ObjectModel;
using System.Windows;

namespace SinuGameVault;

public sealed record RecoveryRow(string Path, string Name, DateTime ModifiedAt, string SizeText);

public partial class RecoveryWindow : Window
{
    public RecoveryRow? Selected { get; private set; }
    public RecoveryWindow(IEnumerable<RecoverySnapshot> snapshots)
    {
        InitializeComponent();
        SnapshotGrid.ItemsSource = new ObservableCollection<RecoveryRow>(snapshots.Select(item => new RecoveryRow(
            item.Path, item.Name, item.ModifiedAt, item.SizeBytes >= 1024 * 1024 ? $"{item.SizeBytes / 1024d / 1024d:0.0} MB" : $"{Math.Max(1, item.SizeBytes / 1024d):0} KB")));
    }
    private void Restore_Click(object sender, RoutedEventArgs e)
    {
        if (SnapshotGrid.SelectedItem is not RecoveryRow row) { MessageBox.Show(this, "Select a snapshot first.", "Recovery", MessageBoxButton.OK, MessageBoxImage.Information); return; }
        if (MessageBox.Show(this, $"Restore the snapshot from {row.ModifiedAt:g}?", "Confirm recovery", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        Selected = row; DialogResult = true;
    }
    private void Close_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
