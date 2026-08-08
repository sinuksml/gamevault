using System.Globalization;
using System.Linq;

namespace SinuGameVault.Models;

/// <summary>One rental return or subscription renewal on the Home page, shown as a title card.</summary>
public sealed class DueDateRow
{
    public string Title { get; init; } = "";
    /// <summary>"Rental return" or "Subscription renewal".</summary>
    public string Kind { get; init; } = "";
    public string Vendor { get; init; } = "";
    public string DueText { get; init; } = "";
    public string Cost { get; init; } = "";
    public string Image { get; init; } = "";
    public int? DaysLeft { get; init; }

    public bool HasVendor => Vendor.Length > 0;
    public bool HasCost => Cost.Length > 0;
    public string VendorLine => Vendor.Length > 0 && Cost.Length > 0 ? $"{Vendor}  ·  {Cost}"
        : Vendor.Length > 0 ? Vendor : Cost;
    public bool HasVendorLine => VendorLine.Length > 0;

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

    private static readonly string[] PlaceholderColors =
        ["#2E4A6B", "#4A3A6B", "#6B3A4F", "#2F5B52", "#5B4A2F", "#3A4E6B", "#553A6B", "#6B4A3A"];

    public string Initials
    {
        get
        {
            var words = Title.Split([' ', '-', ':', '.'], StringSplitOptions.RemoveEmptyEntries)
                .Where(word => char.IsLetterOrDigit(word[0])).Take(2).ToArray();
            return words.Length == 0 ? "?" : string.Concat(words.Select(word => char.ToUpperInvariant(word[0])));
        }
    }

    public string PlaceholderColor
    {
        get
        {
            var hash = 0;
            foreach (var character in Title) hash = (hash * 31 + character) & 0x7FFFFFFF;
            return PlaceholderColors[hash % PlaceholderColors.Length];
        }
    }
}

/// <summary>
/// One petrol refill in the history. Only the date is stored; the gap since the
/// previous fill is worked out from it.
/// </summary>
public sealed class PetrolRow
{
    /// <summary>Record identifier, so a mistaken refill can be removed again.</summary>
    public string Id { get; init; } = "";
    public string Date { get; init; } = "";
    public int? Gap { get; init; }
    /// <summary>Position in the history, newest first: "Most recent", "2nd most recent"…</summary>
    public string Ordinal { get; init; } = "";
    public string GapValue => Gap is null ? "—" : Gap.Value.ToString(CultureInfo.InvariantCulture);
    public string GapCaption => Gap is null ? "first refill" : Gap == 1 ? "day since previous" : "days since previous";
}

/// <summary>One month of the Home petrol chart: how many refills were logged.</summary>
public sealed class PetrolMonthRow
{
    public string Month { get; init; } = "";
    public int Count { get; init; }
    public double BarHeight { get; init; }
    public string CountText => Count > 0 ? Count.ToString(CultureInfo.InvariantCulture) : "";
    public string Tip => Count == 1 ? "1 refill" : $"{Count} refills";
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
