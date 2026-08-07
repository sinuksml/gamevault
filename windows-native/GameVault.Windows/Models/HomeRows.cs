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

/// <summary>One petrol refill in the history, with the gap since the previous fill.</summary>
public sealed class PetrolRow
{
    public string Date { get; init; } = "";
    public int? Gap { get; init; }
    public double Litres { get; init; }
    public double Cost { get; init; }
    public double Odometer { get; init; }
    public string Note { get; init; } = "";
    public string GapText => Gap is null ? "First refill" : $"{Gap} day{(Gap == 1 ? "" : "s")}";
    public string LitresText => Litres > 0 ? $"{Litres:0.##} L" : "";
    public string CostText => Cost > 0 ? "₹" + Cost.ToString("N0", CultureInfo.InvariantCulture) : "";
    public string OdometerText => Odometer > 0 ? Odometer.ToString("N0", CultureInfo.InvariantCulture) + " km" : "";
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
