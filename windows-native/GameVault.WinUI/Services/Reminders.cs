using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;
using SinuGameVault.Models;

namespace SinuGameVault.Services;

/// <summary>
/// Tells you about a rental return or subscription renewal before it costs money:
/// a Windows notification when something is overdue or due within two days.
/// Each date is announced once per day-count, so a notification never repeats itself.
/// </summary>
public static class Reminders
{
    public const string PreferenceKey = "DueReminders";
    private static DispatcherTimer? _timer;
    private static bool _registered;

    public static bool Enabled
    {
        get => AppState.Current.Preferences.GetBool(PreferenceKey, true);
        set => AppState.Current.Preferences.SetBool(PreferenceKey, value);
    }

    public static void Start()
    {
        try
        {
            AppNotificationManager.Default.NotificationInvoked += (_, _) =>
                App.Window?.DispatcherQueue.TryEnqueue(Surface);
            AppNotificationManager.Default.Register();
            _registered = true;
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Reminders", "Windows notifications are not available", ex);
            return;
        }
        AppState.Current.LibraryChanged += Check;
        _timer = new DispatcherTimer { Interval = TimeSpan.FromHours(4) };
        _timer.Tick += (_, _) => Check();
        _timer.Start();
        Check();
    }

    /// <summary>Brings the window to the front on Home, where the dates are listed.</summary>
    private static void Surface()
    {
        var window = App.Window;
        if (window is null) return;
        if (window.AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } presenter) presenter.Restore();
        window.Activate();
        window.Navigate("Home");
    }

    public static void Check()
    {
        if (!_registered || !Enabled) return;
        try
        {
            var prefs = AppState.Current.Preferences;
            var sent = prefs.Get("RemindedKeys").Split('\n', StringSplitOptions.RemoveEmptyEntries).ToList();
            var fresh = AppState.Current.Dashboard.DueDates()
                .Where(row => row.DaysLeft is { } left && left <= 2)
                .OrderBy(row => row.DaysLeft)
                .Select(row => (Row: row, Key: $"{row.Kind}|{row.Title}|{Math.Max(-1, row.DaysLeft ?? -1)}"))
                .Where(item => !sent.Contains(item.Key)).ToList();
            if (fresh.Count == 0) return;

            var builder = new AppNotificationBuilder()
                .AddText(fresh.Count == 1 ? Headline(fresh[0].Row) : $"{fresh.Count} dates need attention");
            foreach (var item in fresh.Take(4)) builder.AddText(Line(item.Row));
            AppNotificationManager.Default.Show(builder.BuildNotification());

            sent.AddRange(fresh.Select(item => item.Key));
            prefs.Set("RemindedKeys", string.Join('\n', sent.TakeLast(120)));
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Reminders", "A reminder could not be shown", ex);
        }
    }

    private static string When(DueDateRow row) => row.DaysLeft switch
    {
        < 0 => $"overdue by {Math.Abs(row.DaysLeft!.Value)} day{(row.DaysLeft == -1 ? "" : "s")}",
        0 => "today",
        1 => "tomorrow",
        _ => $"in {row.DaysLeft} days"
    };

    private static string Headline(DueDateRow row) =>
        $"{row.Title}: {(row.Kind.Contains("renewal", StringComparison.OrdinalIgnoreCase) ? "renews" : "return due")} {When(row)}";

    private static string Line(DueDateRow row) => $"{row.Title}  ·  {When(row)}";
}
