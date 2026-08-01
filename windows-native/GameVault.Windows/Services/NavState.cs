using System.Windows;

namespace SinuGameVault.Services;

/// <summary>
/// Marks the rail button for the section currently on screen.
///
/// The obvious place for this would be Tag, but Tag already carries the
/// navigation target for each rail button, so the active state needs its own
/// attached property to drive the style trigger.
/// </summary>
public static class NavState
{
    public static readonly DependencyProperty IsActiveProperty =
        DependencyProperty.RegisterAttached("IsActive", typeof(bool), typeof(NavState), new PropertyMetadata(false));

    public static void SetIsActive(DependencyObject element, bool value) => element.SetValue(IsActiveProperty, value);
    public static bool GetIsActive(DependencyObject element) => (bool)element.GetValue(IsActiveProperty);
}
