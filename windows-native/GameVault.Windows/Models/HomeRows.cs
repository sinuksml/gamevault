using System.Globalization;

namespace SinuGameVault.Models;

/// <summary>One rental return or subscription renewal on the Home page.</summary>
public sealed class DueDateRow
{
    public string Title { get; init; } = "";
    /// <summary>"Rental return" or "Subscription renewal".</summary>
    public string Kind { get; init; } = "";
    public string Detail { get; init; } = "";
    public int? DaysLeft { get; init; }

    public string Countdown => DaysLeft is null ? "--"
        : DaysLeft < 0 ? $"{Math.Abs(DaysLeft.Value)}d over"
        : DaysLeft == 0 ? "Today"
        : $"{DaysLeft}d";

    /// Red once overdue or due within three days, amber within ten, otherwise calm.
    public string ToneColor => DaysLeft is null ? "#8B96AC"
        : DaysLeft < 0 ? "#FF6577"
        : DaysLeft <= 3 ? "#FF6577"
        : DaysLeft <= 10 ? "#FFD166"
        : "#5DE2B5";
}

/// <summary>One arc of the Home spending donut, and its legend entry.</summary>
public sealed class SpendSliceRow
{
    public string Label { get; init; } = "";
    public decimal Amount { get; init; }
    public string ToneColor { get; init; } = "#4CC9F0";
    public string Website { get; init; } = "";

    public string AmountText => "₹" + Amount.ToString("N0", CultureInfo.InvariantCulture);
    public string LinkHint => Website.Length > 0 ? $"Open {Website}" : "No website on record for this entry";
}
