using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SinuGameVault.Models;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Pickers;
using Windows.UI;

namespace SinuGameVault;

/// <summary>Small interface helpers shared by every page: brushes, dialogs, pickers, links.</summary>
public static class Ui
{
    private static readonly Dictionary<string, SolidColorBrush> Brushes = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>A brush for a "#RRGGBB" or "#AARRGGBB" colour; transparent when it cannot be read.</summary>
    public static Brush Brush(string? hex)
    {
        hex ??= "";
        if (Brushes.TryGetValue(hex, out var cached)) return cached;
        var brush = new SolidColorBrush(ParseColor(hex));
        Brushes[hex] = brush;
        return brush;
    }

    public static Color ParseColor(string hex)
    {
        var value = hex.TrimStart('#');
        try
        {
            if (value.Length == 6) return Color.FromArgb(255, Convert.ToByte(value[..2], 16), Convert.ToByte(value[2..4], 16), Convert.ToByte(value[4..6], 16));
            if (value.Length == 8) return Color.FromArgb(Convert.ToByte(value[..2], 16), Convert.ToByte(value[2..4], 16), Convert.ToByte(value[4..6], 16), Convert.ToByte(value[6..8], 16));
        }
        catch (FormatException) { }
        return Color.FromArgb(0, 0, 0, 0);
    }

    public static Brush ThemeBrush(string key) => (Brush)Application.Current.Resources[key];

    /// <summary>
    /// The colour for a countdown, taken from the system palette so it stays
    /// readable in both light and dark themes: red within a week, amber within a
    /// month, green beyond that.
    /// </summary>
    public static Brush CountdownBrush(int? daysLeft) => ThemeBrush(
        daysLeft is null or < 0 ? "TextFillColorSecondaryBrush"
        : daysLeft <= 7 ? "SystemFillColorCriticalBrush"
        : daysLeft <= 30 ? "SystemFillColorCautionBrush"
        : "SystemFillColorSuccessBrush");


    /// <summary>Two pieces of text joined with a middle dot, skipping whichever is empty.</summary>
    public static string JoinDot(string? first, string? second) =>
        string.Join("  ·  ", new[] { first ?? "", second ?? "" }.Where(text => text.Length > 0));

    /// <summary>Red once overdue or due within three days, amber within ten, otherwise green.</summary>
    public static Brush DueBrush(int? daysLeft) => ThemeBrush(
        daysLeft is null ? "TextFillColorSecondaryBrush"
        : daysLeft <= 3 ? "SystemFillColorCriticalBrush"
        : daysLeft <= 10 ? "SystemFillColorCautionBrush"
        : "SystemFillColorSuccessBrush");

    public static Visibility Show(bool visible) => visible ? Visibility.Visible : Visibility.Collapsed;
    public static Visibility ShowText(string? text) => string.IsNullOrWhiteSpace(text) ? Visibility.Collapsed : Visibility.Visible;

    public static void Open(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex) { AppState.Current.Notify($"Could not open the link: {ex.Message}", InfoBarSeverity.Warning); }
    }

    public static string Search(string site, string query) => site + Uri.EscapeDataString(query);

    public static async Task<string> ClipboardTextAsync()
    {
        try
        {
            var content = Clipboard.GetContent();
            return content.Contains(StandardDataFormats.Text) ? (await content.GetTextAsync()).Trim() : "";
        }
        catch { return ""; }
    }

    public static void CopyText(string text)
    {
        var package = new DataPackage();
        package.SetText(text);
        Clipboard.SetContent(package);
    }

    private static XamlRoot Root => App.Window!.Content.XamlRoot;

    private static ElementTheme Theme => (App.Window!.Content as FrameworkElement)?.RequestedTheme ?? ElementTheme.Default;

    /// <summary>Prepares a dialog to open over the main window in the current theme.</summary>
    public static T Host<T>(T dialog) where T : ContentDialog
    {
        dialog.XamlRoot = Root;
        dialog.RequestedTheme = Theme;
        return dialog;
    }

    /// <summary>Asks a yes/no question. Destructive confirmations default to Cancel.</summary>
    public static async Task<bool> ConfirmAsync(string title, string message, string confirm, bool destructive = false)
    {
        var dialog = Host(new ContentDialog
        {
            Title = title,
            Content = new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap },
            PrimaryButtonText = confirm,
            CloseButtonText = "Cancel",
            DefaultButton = destructive ? ContentDialogButton.Close : ContentDialogButton.Primary
        });
        return await dialog.ShowAsync() == ContentDialogResult.Primary;
    }

    public static async Task MessageAsync(string title, string message)
    {
        await Host(new ContentDialog
        {
            Title = title,
            Content = new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true },
            CloseButtonText = "OK",
            DefaultButton = ContentDialogButton.Close
        }).ShowAsync();
    }

    private static IntPtr WindowHandle => WinRT.Interop.WindowNative.GetWindowHandle(App.Window);

    /// <summary>Lets the user choose a file to open; null when cancelled.</summary>
    public static async Task<string?> PickOpenFileAsync(string extension)
    {
        var picker = new FileOpenPicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary };
        picker.FileTypeFilter.Add(extension);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WindowHandle);
        return (await picker.PickSingleFileAsync())?.Path;
    }

    /// <summary>Lets the user choose where to save a file; null when cancelled.</summary>
    public static async Task<string?> PickSaveFileAsync(string suggestedName, string typeLabel, string extension)
    {
        var picker = new FileSavePicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary, SuggestedFileName = suggestedName };
        picker.FileTypeChoices.Add(typeLabel, [extension]);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WindowHandle);
        return (await picker.PickSaveFileAsync())?.Path;
    }

    public static string Bytes(long value)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double size = Math.Max(0, value);
        var unit = 0;
        while (size >= 1024 && unit < units.Length - 1) { size /= 1024; unit++; }
        return $"{size:0.#} {units[unit]}";
    }

    /// <summary>The tag of the selected ComboBoxItem, or the fallback when nothing is selected.</summary>
    public static string SelectedTag(ComboBox box, string fallback = "") =>
        (box.SelectedItem as FrameworkElement)?.Tag?.ToString() ?? fallback;

    /// <summary>Selects the ComboBoxItem carrying a tag; returns false when there is none.</summary>
    public static bool SelectTag(ComboBox box, string tag)
    {
        foreach (var item in box.Items.OfType<FrameworkElement>())
            if (string.Equals(item.Tag?.ToString(), tag, StringComparison.OrdinalIgnoreCase)) { box.SelectedItem = item; return true; }
        return false;
    }
}
