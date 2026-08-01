using System.Text.Json.Nodes;

namespace SinuGameVault.Models;

public sealed class LibraryRow
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "Untitled";
    public string Collection { get; init; } = "";
    public string MediaType { get; init; } = "Game";
    public string Platform { get; init; } = "";
    public string Status { get; init; } = "";
    public string Date { get; init; } = "";
    public string Genre { get; init; } = "";
    public string Image { get; init; } = "";
    public string Backdrop { get; init; } = "";
    public string Overview { get; init; } = "";
    public string Providers { get; init; } = "";
    public string Vendor { get; init; } = "";
    public string Note { get; init; } = "";
    public string ImdbId { get; init; } = "";
    public string TmdbId { get; init; } = "";
    public int Seasons { get; init; }
    public int Episodes { get; init; }
    public double Rating { get; init; }
    public decimal Cost { get; init; }
    public int? DaysLeft { get; init; }
    public JsonObject Source { get; init; } = [];
    public string GroupName { get; init; } = "";
    public string Badges { get; init; } = "";

    public string RatingText => Rating > 0 ? $"{Rating:0.0}" : "Not rated";
    public string CardRatingText => Collection is "rentals" or "rentalHistory" ? ""
        : Collection == "subscriptions" ? (Cost > 0 ? $"\u20B9{Cost:N0} / cycle" : Status)
        : $"Rating {RatingText}";
    public string CategoryLabel => Collection switch
    {
        "rentals" => "Rental",
        "rentalHistory" => "Returned rental",
        "subscriptions" => "Subscription",
        "subscriptionGames" => "Subscription game",
        "playing" when Status.Contains("resume", StringComparison.OrdinalIgnoreCase) => "Resume later",
        "playing" when Status.Contains("hold", StringComparison.OrdinalIgnoreCase) || Status.Contains("drop", StringComparison.OrdinalIgnoreCase) => "On hold",
        "playing" => "Now playing",
        "queue" => "Rental queue",
        "upcoming" => DaysLeft is < 0 ? "Released" : "Upcoming",
        "upcomingRemoved" => "Removed",
        "catalogExtra" => "Discover",
        "played" => "Completed",
        "movieWatchlist" or "seriesWatchlist" or "watchlist" => "Watchlist",
        "watchingMovies" or "watchingSeries" or "watching" => "Watching",
        "watchedMovies" or "watchedSeries" or "watched" => "Watched",
        "hiddenMovies" or "hiddenSeries" or "hidden" => "Not interested",
        "uphw" or "seriesupcoming" or "mlup" => "Coming soon",
        "bluray" => "Blu-ray",
        "relhw" or "enseries" or "mlseries" or "taseries" or "hiseries" => "Discover",
        "mlott" => "Malayalam OTT",
        "seriesnew" => "New episodes",
        "plex" => "Plex",
        _ => MediaType
    };
    public string CategoryColor => Collection switch
    {
        "rentals" => "#1689D8", "rentalHistory" => "#66758C", "subscriptions" or "subscriptionGames" => "#5D56C9",
        "playing" => "#16836A", "queue" => "#B97816", "upcoming" => "#B13F68", "upcomingRemoved" => "#626D7D",
        "catalogExtra" or "relhw" or "enseries" or "mlseries" or "taseries" or "hiseries" => "#7255C7",
        "played" or "watchedMovies" or "watchedSeries" or "watched" => "#267A50",
        "movieWatchlist" or "seriesWatchlist" or "watchlist" => "#2A70B8", "watchingMovies" or "watchingSeries" or "watching" => "#16836A",
        "hiddenMovies" or "hiddenSeries" or "hidden" => "#626D7D", "uphw" or "seriesupcoming" or "mlup" => "#B13F68",
        "bluray" => "#356DA8", "mlott" => "#8B4D9C", "seriesnew" => "#1689D8", "plex" => "#D09822", _ => "#36577D"
    };
    public string CardStatusText => Collection == "queue"
        ? (Availability.Length > 0 ? Availability : "Checking rental vendors...")
        : Status.Length > 0 ? Status : CategoryLabel;
    public string CostText => Cost > 0 ? $"₹{Cost:N0}" : "";
    public string DaysText => Collection == "rentalHistory" ? "Returned" : DaysLeft is null ? "" : DaysLeft < 0 ? (Collection == "subscriptions" ? "Expired" : "Released") : DaysLeft == 0 ? (Collection == "rentals" ? "Return today" : Collection == "subscriptions" ? "Renews today" : "Releases today") : Collection is "rentals" or "subscriptions" or "subscriptionGames" ? $"{DaysLeft} days remaining" : $"{DaysLeft} days left";
    public string CountdownColor => DaysLeft is null || DaysLeft < 0 ? "#98A5BA" : DaysLeft <= 7 ? "#FF6577" : DaysLeft <= 30 ? "#FFD166" : "#76E6C2";
    public string PrimaryMeta => Join(Genre, Platform);
    public string SecondaryMeta => Join(Date, Collection == "queue" ? CardStatusText : Status, Badges);
    public string DetailMeta => Join(Date, Genre, Platform);
    public string SeasonsText => Seasons > 0 ? $"{Seasons} season{(Seasons == 1 ? "" : "s")}" : "";
    public string EpisodesText => Episodes > 0 ? $"{Episodes} episodes" : "";
    public string Availability => Join(Providers, Vendor);
    public bool HasImage => Uri.TryCreate(Image, UriKind.Absolute, out _);
    public bool HasOverview => !string.IsNullOrWhiteSpace(Overview);
    public bool HasRating => Rating > 0;
    public bool HasEpisodeInfo => Seasons > 0 || Episodes > 0;
    public bool HasBadges => !string.IsNullOrWhiteSpace(Badges);

    private static string Join(params string[] values) => string.Join("  |  ", values.Where(value => !string.IsNullOrWhiteSpace(value)).Distinct());
}

public sealed class MonthlySpendRow
{
    public string Month { get; init; } = "";
    public decimal Amount { get; init; }
    public double BarHeight { get; init; }
    public string AmountText => $"\u20B9{Amount:N0}";
}

public sealed class EpisodeChoice
{
    public int Number { get; init; }
    public string Name { get; init; } = "";
    public string AirDate { get; init; } = "";
    public double Rating { get; init; }
    public string Label => $"E{Number:00}  {Name}{(Rating > 0 ? $"  |  IMDb {Rating:0.0}" : "")}{(AirDate.Length > 0 ? $"  |  {AirDate}" : "")}";
    public override string ToString() => Label;
}
