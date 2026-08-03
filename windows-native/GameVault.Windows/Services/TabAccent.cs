using System.Windows;

namespace SinuGameVault.Services;

/// <summary>
/// Per-tab highlight colour, as a hex string. Each library tab (Rentals,
/// Subscriptions, Queue, …) carries its own accent so the selected tab is filled
/// with a distinct colour and tabs are easy to tell apart at a glance, rather
/// than every tab sharing the one global accent. Read by the TabItem control
/// template, where the string is converted to a brush by the Background/
/// BorderBrush target — the same conversion the spending legend relies on.
/// </summary>
public static class TabAccent
{
    public static readonly DependencyProperty ColorProperty = DependencyProperty.RegisterAttached(
        "Color", typeof(string), typeof(TabAccent), new PropertyMetadata(""));

    public static void SetColor(DependencyObject element, string value) => element.SetValue(ColorProperty, value);
    public static string GetColor(DependencyObject element) => (string)element.GetValue(ColorProperty);
}
