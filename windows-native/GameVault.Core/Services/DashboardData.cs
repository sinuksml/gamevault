using System.Globalization;
using System.Text.Json.Nodes;
using SinuGameVault.Models;

namespace SinuGameVault.Services;

/// <summary>The numbers behind the Home page: due dates, spending and petrol.</summary>
public sealed class DashboardData(VaultRepository vault, LibraryReader reader)
{
    private static readonly string[] SpendPalette =
        ["#4CC9F0", "#6366F1", "#F0616B", "#FFD166", "#5DE2B5", "#C77DFF", "#FF9F5A", "#4EA8DE"];

    public int ActiveRentals => vault.Collection("rentals").Count;
    public int NowPlaying => reader.Games("playing").Count();
    public int Watchlist => vault.Collection("movieWatchlist").Count + vault.Collection("seriesWatchlist").Count;
    public int Completed => vault.Collection("played").Count;
    public int TotalRented => vault.Collection("rentals").Count + vault.Collection("rentalHistory").Count;
    public int GamesCount => vault.Collection("rentals").Count + vault.Collection("playing").Count + vault.Collection("played").Count;
    public int MoviesCount => vault.Collection("movieWatchlist").Count + vault.Collection("watchingMovies").Count + vault.Collection("watchedMovies").Count;
    public int SeriesCount => vault.Collection("seriesWatchlist").Count + vault.Collection("watchingSeries").Count + vault.Collection("watchedSeries").Count;

    public List<LibraryRow> ContinuePlaying(int count) => reader.Games("playing").Take(count).ToList();

    public List<LibraryRow> ContinueWatching(int count) =>
        reader.Collection("watchingMovies").Concat(reader.Collection("watchingSeries")).Take(count).ToList();

    public List<LibraryRow> ComingUp(int count) =>
        reader.Collection("upcoming").Concat(reader.Catalog("movies", "uphw")).Concat(reader.Catalog("series", "seriesupcoming"))
            .Where(row => row.DaysLeft is >= 0).OrderBy(row => row.DaysLeft).Take(count).ToList();

    /// <summary>Every active rental return and subscription renewal, soonest first.</summary>
    public List<DueDateRow> DueDates()
    {
        var rows = new List<DueDateRow>();
        foreach (var item in vault.Collection("rentals").OfType<JsonObject>())
        {
            var name = Json.Text(item, "name", "title");
            if (name.Length == 0) continue;
            var due = LibraryReader.RentalReturnDate(item);
            var cost = Json.Number(item, "cost");
            rows.Add(new DueDateRow
            {
                Title = name, Kind = "Rental return", Vendor = Json.Text(item, "vendor"),
                DueText = due.Length > 0 ? LibraryReader.DisplayDate(due) : "",
                Cost = cost > 0 ? $"₹{cost:N0}" : "",
                Image = Json.Text(item, "img", "poster", "cover"),
                DaysLeft = DateTime.TryParse(due, out var parsed) ? (parsed.Date - DateTime.Today).Days : null
            });
        }
        foreach (var item in vault.Collection("subscriptions").OfType<JsonObject>())
        {
            var service = Json.Text(item, "service", "name");
            if (service.Length == 0) continue;
            // Cancelled subscriptions have no upcoming renewal to show.
            if (string.Equals(Json.Text(item, "active"), "false", StringComparison.OrdinalIgnoreCase)) continue;
            var renews = Json.Text(item, "renewsAt", "end", "start");
            var cost = Json.Number(item, "cost", "monthlyCost");
            rows.Add(new DueDateRow
            {
                Title = service, Kind = "Subscription renewal", Vendor = Json.Text(item, "provider", "platform"),
                DueText = renews.Length > 0 ? LibraryReader.DisplayDate(renews) : "",
                Cost = cost > 0 ? $"₹{cost:N0}" : "",
                Image = Json.Text(item, "img", "poster", "cover"),
                DaysLeft = DateTime.TryParse(renews, out var parsed) ? (parsed.Date - DateTime.Today).Days : null
            });
        }
        return rows.OrderBy(row => row.DaysLeft ?? int.MaxValue).ThenBy(row => row.Title).ToList();
    }

    /// <summary>One spending record: who was paid, how much, and when.</summary>
    private IEnumerable<(string Vendor, decimal Amount, string Date)> Spending()
    {
        foreach (var item in vault.Collection("rentals").Concat(vault.Collection("rentalHistory")).OfType<JsonObject>())
        {
            var vendor = Json.Text(item, "vendor");
            yield return (vendor.Length > 0 ? vendor : "Other rentals", (decimal)Json.Number(item, "cost"), Json.Text(item, "start", "date", "returnedAt", "end"));
        }
        foreach (var item in vault.Collection("subscriptions").OfType<JsonObject>())
        {
            var service = Json.Text(item, "service", "name");
            yield return (service.Length > 0 ? service : "Subscription", (decimal)Json.Number(item, "totalPaid", "cost"), Json.Text(item, "start", "startedAt", "date"));
        }
        foreach (var item in vault.Collection("purchasedGames").OfType<JsonObject>())
            yield return ("Steam purchases", (decimal)Json.Number(item, "purchasePrice", "cost"), Json.Text(item, "purchaseDate", "added", "date"));
    }

    private Dictionary<string, decimal> VendorTotals()
    {
        var totals = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var (vendor, amount, _) in Spending())
            if (amount > 0) totals[vendor] = totals.GetValueOrDefault(vendor) + amount;
        return totals;
    }

    /// <summary>
    /// A stable colour per vendor, ordered by total spend, so the monthly bars, the
    /// legend and the donut all use the same colour for the same vendor.
    /// </summary>
    private static Dictionary<string, string> ColorMap(Dictionary<string, decimal> totals) =>
        totals.OrderByDescending(pair => pair.Value)
            // A recognised service keeps its own brand colour; the rest take the palette.
            .Select((pair, index) => (pair.Key, Color: BrandColors.For(pair.Key) ?? SpendPalette[index % SpendPalette.Length]))
            .ToDictionary(entry => entry.Key, entry => entry.Color, StringComparer.OrdinalIgnoreCase);

    public decimal TotalSpent => VendorTotals().Values.Sum();

    /// <summary>Total spend per vendor and subscription, largest first.</summary>
    public List<SpendSliceRow> SpendSlices()
    {
        var totals = VendorTotals();
        var colors = ColorMap(totals);
        return totals.OrderByDescending(pair => pair.Value).Select(pair => new SpendSliceRow
        {
            Label = pair.Key, Amount = pair.Value,
            ToneColor = colors.GetValueOrDefault(pair.Key, SpendPalette[0]),
            Website = VendorWebsite(pair.Key)
        }).ToList();
    }

    /// <summary>The last twelve months of spending, each split into one section per vendor.</summary>
    public List<MonthlySpendRow> MonthlySpend(double maxBarHeight)
    {
        var months = LastTwelveMonths();
        var colors = ColorMap(VendorTotals());
        var order = colors.Keys.ToList();
        var perMonth = months.ToDictionary(month => month, _ => new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase));
        foreach (var (vendor, amount, dateText) in Spending())
        {
            if (amount <= 0 || !DateTime.TryParse(dateText, out var date)) continue;
            if (perMonth.TryGetValue(new DateTime(date.Year, date.Month, 1), out var bucket))
                bucket[vendor] = bucket.GetValueOrDefault(vendor) + amount;
        }
        var maximum = Math.Max(1m, perMonth.Values.Max(bucket => bucket.Values.Sum()));
        return months.Select(month =>
        {
            var bucket = perMonth[month];
            return new MonthlySpendRow
            {
                Month = month.ToString("MMM", CultureInfo.InvariantCulture),
                Amount = bucket.Values.Sum(),
                // Vendors keep the same position and colour in every month's stack.
                Segments = bucket.Where(pair => pair.Value > 0).OrderByDescending(pair => order.IndexOf(pair.Key)).Select(pair => new SpendSegment
                {
                    Height = Math.Max(2.0, (double)(pair.Value / maximum) * maxBarHeight),
                    ColorHex = colors.GetValueOrDefault(pair.Key, SpendPalette[0]),
                    Tip = $"{pair.Key}: ₹{pair.Value:N0}"
                }).ToList()
            };
        }).ToList();
    }

    private static List<DateTime> LastTwelveMonths() => Enumerable.Range(0, 12)
        .Select(offset => new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1).AddMonths(offset - 11)).ToList();

    /// <summary>Known storefronts, so a vendor in the breakdown can be opened directly.</summary>
    public static string VendorWebsite(string name)
    {
        var value = name.ToLowerInvariant();
        if (value.Contains("game hub") || value.Contains("gamehub")) return "https://thegamehub.in/";
        if (value.Contains("gamer planet") || value.Contains("gamerplanet")) return "https://gamerplanet.in/";
        if (value.Contains("geforce") || value.Contains("nvidia")) return "https://www.nvidia.com/en-in/geforce-now/";
        if (value.Contains("game pass") || value.Contains("xbox")) return "https://www.xbox.com/en-IN/xbox-game-pass";
        if (value.Contains("playstation") || value.Contains("ps plus") || value.Contains("ps+")) return "https://www.playstation.com/en-in/ps-plus/";
        if (value.Contains("ea play")) return "https://www.ea.com/ea-play";
        if (value.Contains("ubisoft")) return "https://www.ubisoft.com/en-us/ubisoft-plus";
        if (value.Contains("steam")) return "https://store.steampowered.com/";
        return "";
    }

    /// <summary>Parsed petrol refills, oldest first, so gaps between consecutive fills can be computed.</summary>
    public List<(DateTime Date, JsonObject Node)> PetrolRefills() =>
        vault.Collection("petrol").OfType<JsonObject>()
            .Select(node => (Ok: DateTime.TryParse(Json.Text(node, "date"), out var date), Date: date, Node: node))
            .Where(entry => entry.Ok).OrderBy(entry => entry.Date)
            .Select(entry => (entry.Date, entry.Node)).ToList();

    /// <summary>Days since the most recent refill, or null when none is logged.</summary>
    public int? DaysSinceRefill() => PetrolRefills() is { Count: > 0 } refills ? (int)(DateTime.Today - refills[^1].Date.Date).TotalDays : null;

    /// <summary>The refill history, newest first, each with the gap since the fill before it.</summary>
    public List<PetrolRow> PetrolHistory()
    {
        var refills = PetrolRefills();
        var rows = new List<PetrolRow>();
        for (var index = refills.Count - 1; index >= 0; index--)
        {
            var (date, node) = refills[index];
            var position = refills.Count - index;
            rows.Add(new PetrolRow
            {
                Id = Json.Text(node, "id"),
                Date = date.ToString("dd MMM yyyy", CultureInfo.InvariantCulture),
                Gap = index > 0 ? (int)(date.Date - refills[index - 1].Date.Date).TotalDays : null,
                Ordinal = position == 1 ? "Most recent fill" : $"{position - 1} fill{(position == 2 ? "" : "s")} before that"
            });
        }
        return rows;
    }

    /// <summary>The typical number of days between refills, or null with fewer than two fills.</summary>
    public int? AveragePetrolGap()
    {
        var refills = PetrolRefills();
        if (refills.Count < 2) return null;
        return (int)Math.Round(Enumerable.Range(1, refills.Count - 1).Average(i => (refills[i].Date.Date - refills[i - 1].Date.Date).TotalDays));
    }

    /// <summary>Refills per month over the last year.</summary>
    public List<PetrolMonthRow> PetrolMonths(double maxBarHeight)
    {
        var months = LastTwelveMonths();
        var counts = months.ToDictionary(month => month, _ => 0);
        foreach (var (date, _) in PetrolRefills())
        {
            var month = new DateTime(date.Year, date.Month, 1);
            if (counts.ContainsKey(month)) counts[month]++;
        }
        var busiest = Math.Max(1, counts.Values.Max());
        return months.Select(month => new PetrolMonthRow
        {
            Month = month.ToString("MMM", CultureInfo.InvariantCulture),
            Count = counts[month],
            BarHeight = counts[month] == 0 ? 3 : Math.Max(8, counts[month] / (double)busiest * maxBarHeight)
        }).ToList();
    }
}
