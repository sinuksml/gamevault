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

    /// <summary>
    /// Position in the stored collection. New entries are inserted at the front,
    /// so a smaller index means more recently added. Used to keep hand-curated
    /// lists in the order the user built them rather than re-sorting by release
    /// date, which made them look randomly ordered.
    /// </summary>
    public int SortIndex { get; init; }

    /// <summary>When the record was added, if it carries a timestamp.</summary>
    public long AddedAt { get; init; }

    /// <summary>
    /// Artwork arrives in two different shapes and used to be forced into one
    /// fixed frame: TMDB posters are 2:3 portrait, RAWG game art is 16:9
    /// landscape. Filling a 252x326 box with a 1920x1080 image cropped away more
    /// than half its width, which is why game art looked heavily zoomed in. The
    /// art frame now matches the shape of the source, so nothing is cropped or
    /// stretched — cards stay a uniform size within a section because every row
    /// there is the same media type.
    /// </summary>
    public bool IsPortraitArt => MediaType is "Movie" or "TV Show";

    /// <summary>
    /// Every card uses the same 2:3 frame so Games, Movies and TV all look alike.
    ///
    /// The two artwork shapes are reconciled without cropping: a 2:3 poster fills
    /// the frame exactly, while 16:9 game art is centred at its true aspect over a
    /// soft fill made from the same image. Forcing landscape art to fill a
    /// portrait frame would crop away half its width, which is the zoomed-in look
    /// this replaces.
    /// </summary>
    public double ArtHeight => 354;

    /// <summary>Portrait art fills the frame; landscape art is fitted whole inside it.</summary>
    public System.Windows.Media.Stretch ArtStretch =>
        IsPortraitArt ? System.Windows.Media.Stretch.UniformToFill : System.Windows.Media.Stretch.Uniform;

    /// <summary>Landscape art leaves space above and below, filled with a blurred copy of itself.</summary>
    public bool NeedsSoftFill => !IsPortraitArt && Image.Length > 0;

    /* Placeholder artwork is generated locally rather than fetched from an image
       service, so a title without a cover still shows something recognisable when
       the network is slow or unavailable. */
    private static readonly string[] PlaceholderColors =
        ["#2E4A6B", "#4A3A6B", "#6B3A4F", "#2F5B52", "#5B4A2F", "#3A4E6B", "#553A6B", "#6B4A3A"];

    /// <summary>Up to two initials taken from the title.</summary>
    public string Initials
    {
        get
        {
            var words = Name.Split([' ', '-', ':', '.'], StringSplitOptions.RemoveEmptyEntries)
                .Where(word => char.IsLetterOrDigit(word[0])).Take(2).ToArray();
            if (words.Length == 0) return "?";
            return string.Concat(words.Select(word => char.ToUpperInvariant(word[0])));
        }
    }

    /// <summary>A stable colour per title, so the same title always looks the same.</summary>
    public string PlaceholderColor
    {
        get
        {
            var hash = 0;
            foreach (var character in Name) hash = (hash * 31 + character) & 0x7FFFFFFF;
            return PlaceholderColors[hash % PlaceholderColors.Length];
        }
    }

    /// <summary>
    /// The one action that makes sense for this title right now, shown directly on
    /// the card so the common move does not require opening the detail page.
    /// Empty means the card has no obvious next step.
    /// </summary>
    public string QuickActionLabel => Collection switch
    {
        "rentals" => "Return & complete",
        "rentalHistory" => "Rent again",
        "queue" => "Start rental",
        "playing" when Status.Contains("hold", StringComparison.OrdinalIgnoreCase) || Status.Contains("drop", StringComparison.OrdinalIgnoreCase) => "Resume",
        "playing" => "Mark completed",
        "subscriptionGames" => "Play now",
        "catalogExtra" => "Add to queue",
        "upcoming" => "Add to queue",
        "movieWatchlist" or "seriesWatchlist" => "Mark watched",
        "watchingMovies" or "watchingSeries" => "Mark watched",
        "watchedMovies" or "watchedSeries" or "played" => "",
        _ => ""
    };

    /// <summary>Action key handled by the card's quick-action click handler.</summary>
    public string QuickActionKey => Collection switch
    {
        "rentals" => "return-complete",
        "rentalHistory" => "rent-again",
        "queue" => "start-rental",
        "playing" when Status.Contains("hold", StringComparison.OrdinalIgnoreCase) || Status.Contains("drop", StringComparison.OrdinalIgnoreCase) => "resume",
        "playing" => "mark-completed",
        "subscriptionGames" => "play-now",
        "catalogExtra" or "upcoming" => "add-queue",
        "movieWatchlist" or "seriesWatchlist" or "watchingMovies" or "watchingSeries" => "mark-watched",
        _ => ""
    };

    public bool HasQuickAction => QuickActionLabel.Length > 0;

    /// <summary>The release/air year as a section heading for the year-grouped Category view.</summary>
    public string YearGroup
    {
        get
        {
            if (int.TryParse(Source["year"]?.ToString(), out var stored) && stored > 1900) return stored.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var match = System.Text.RegularExpressions.Regex.Match(Date, @"(19|20)\d{2}");
            return match.Success ? match.Value : "Undated";
        }
    }
    /// <summary>Numeric year for sorting the Category sections; 0 sorts undated titles last.</summary>
    public int YearValue => int.TryParse(YearGroup, out var year) ? year : 0;

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
    public string AmountText => Amount > 0 ? $"\u20B9{Amount:N0}" : "";
    /// <summary>The month's bar split into one coloured section per vendor, tallest total scaled to the chart height.</summary>
    public List<SpendSegment> Segments { get; init; } = [];
}

/// <summary>One vendor's slice of a month's spending bar.</summary>
public sealed class SpendSegment
{
    public double Height { get; init; }
    public string ColorHex { get; init; } = "#4CC9F0";
    public string Tip { get; init; } = "";
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
