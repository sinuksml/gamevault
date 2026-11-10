using System.Globalization;
using System.Text.Json.Nodes;
using SinuGameVault.Models;

namespace SinuGameVault.Services;

/// <summary>
/// Turns stored vault records into the rows the interface shows.
///
/// This used to live inside the main window, tangled with controls, so none of
/// it could be exercised without starting the application. It holds no interface
/// state: every method takes what it needs and returns plain rows.
/// </summary>
public sealed class LibraryReader(VaultRepository vault)
{
    public static readonly string[] MovieCatalogs = ["uphw", "bluray", "relhw", "mlott", "mlup"];
    public static readonly string[] SeriesCatalogs = ["seriesnew", "seriesupcoming", "enseries", "mlseries", "taseries", "hiseries"];

    public static string NormalizedTitle(string value) => new(value.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

    public static DateTime ParseSortDate(string value) =>
        DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var date)
        || DateTime.TryParse(value, CultureInfo.CurrentCulture, DateTimeStyles.AllowWhiteSpaces, out date) ? date : DateTime.MinValue;

    public static string DisplayDate(string value) =>
        DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var date)
        || DateTime.TryParse(value, CultureInfo.CurrentCulture, DateTimeStyles.AllowWhiteSpaces, out date)
            ? date.ToString("dd MMM yyyy", CultureInfo.InvariantCulture) : value;

    public static bool IsCatalog(string collection) => MovieCatalogs.Contains(collection) || SeriesCatalogs.Contains(collection);
    public static bool IsCatalog(LibraryRow row) => IsCatalog(row.Collection);

    /// <summary>The Upcoming-style feeds are the only sections where future-dated titles belong.</summary>
    public static bool AllowsFutureYears(string mode) => mode is "uphw" or "mlup" or "seriesupcoming";

    /// <summary>
    /// Lists the user curates by hand. These keep the order they were built in;
    /// discovery feeds stay sorted by release date because they are not curated.
    /// </summary>
    public static bool IsCuratedList(string collection) => collection is
        "rentals" or "rentalHistory" or "playing" or "queue" or "played" or "upcoming" or "upcomingRemoved"
        or "subscriptions" or "subscriptionGames" or "purchasedGames" or "hiddenGames"
        or "movieWatchlist" or "watchingMovies" or "watchedMovies" or "hiddenMovies"
        or "seriesWatchlist" or "watchingSeries" or "watchedSeries" or "hiddenSeries";

    public static string RentalReturnDate(JsonObject node)
    {
        var explicitDate = Json.Text(node, "returnDate");
        if (explicitDate.Length > 0) return explicitDate;
        var days = Json.Integer(node, "days");
        if (DateTime.TryParse(Json.Text(node, "start"), out var start) && days > 0 && days <= (DateTime.MaxValue - start).TotalDays)
            return start.AddDays(days).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        return Json.Text(node, "date", "added");
    }

    public IEnumerable<LibraryRow> Collection(string collection, string mediaTypeHint = "") =>
        Nodes(vault.Collection(collection), collection, mediaTypeHint);

    /// <summary>A discovery feed, minus anything already in one of the personal lists.</summary>
    public IEnumerable<LibraryRow> Catalog(string type, string mode)
    {
        if (vault.Root["nativeTvCatalog"]?[type]?[mode] is not JsonArray array) return [];
        var personal = type == "movies"
            ? new[] { "movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies" }
            : new[] { "seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries" };
        var excluded = personal.SelectMany(name => vault.Collection(name).OfType<JsonObject>())
            .Select(item => NormalizedTitle(Json.Text(item, "name", "title"))).Where(value => value.Length > 0).ToHashSet();
        var kept = new JsonArray(array.Where(node => node is JsonObject item && !excluded.Contains(NormalizedTitle(Json.Text(item, "name", "title"))))
            .Select(node => node!.DeepClone()).ToArray());
        return Nodes(kept, mode, type == "movies" ? "Movie" : "TV Show");
    }

    public IEnumerable<LibraryRow> Subscriptions()
    {
        foreach (var node in vault.Collection("subscriptions").OfType<JsonObject>())
        {
            var service = Json.Text(node, "service", "name");
            if (service.Length == 0) continue;
            var provider = service.Contains("geforce", StringComparison.OrdinalIgnoreCase) || service.Contains("nvidia", StringComparison.OrdinalIgnoreCase) ? "NVIDIA"
                : service.Contains("game pass", StringComparison.OrdinalIgnoreCase) || service.Contains("xbox", StringComparison.OrdinalIgnoreCase) ? "Xbox"
                : "Subscription";
            var renewal = Json.Text(node, "renewsAt", "end", "start");
            int? days = DateTime.TryParse(renewal, out var parsed) ? (parsed.Date - DateTime.Today).Days : null;
            var active = !string.Equals(Json.Text(node, "active"), "false", StringComparison.OrdinalIgnoreCase) && days is null or >= 0;
            yield return new LibraryRow
            {
                Id = Json.Text(node, "id"),
                Name = service,
                Collection = "subscriptions",
                MediaType = "Subscription",
                Platform = provider == "NVIDIA" ? "GeForce NOW" : provider == "Xbox" ? "PC / Xbox" : provider,
                Status = active ? "Active subscription" : "Inactive subscription",
                Date = DisplayDate(renewal),
                Genre = "Cloud gaming subscription",
                Image = Json.Text(node, "img", "poster", "cover"),
                Providers = provider,
                Note = Json.Text(node, "note", "remarks"),
                Cost = (decimal)Json.Number(node, "cost", "monthlyCost"),
                DaysLeft = days,
                GroupName = active ? "Active subscriptions" : "Past subscriptions",
                Badges = provider,
                Source = node
            };
        }
    }

    public IEnumerable<LibraryRow> Nodes(JsonArray source, string collection, string mediaTypeHint = "")
    {
        var index = -1;
        foreach (var node in source.OfType<JsonObject>())
        {
            index++;
            var row = Row(node, collection, mediaTypeHint, index);
            if (row is not null) yield return row;
        }
    }

    /// <summary>One record as a row, or null when it has no usable title.</summary>
    public LibraryRow? Row(JsonObject node, string collection, string mediaTypeHint = "", int index = 0)
    {
        var name = Json.Text(node, "name", "title");
        if (string.IsNullOrWhiteSpace(name)) return null;
        var date = collection == "rentals"
            ? RentalReturnDate(node)
            : Json.Text(node, "purchaseDate", "returnDate", "end", "returnedAt", "date", "releaseDate", "firstAirDate", "latestDate", "year", "added");
        var platformText = Json.ArrayText(node, "platforms", "networks", "platform", "tier");
        var providerText = Json.ArrayText(node, "providers", "provider");
        if (collection == "purchasedGames") providerText = Json.Text(node, "store").Length > 0 ? Json.Text(node, "store") : "Steam";
        if (collection == "subscriptionGames")
        {
            var subscriptionId = Json.Text(node, "subscriptionId");
            var subscription = vault.Collection("subscriptions").OfType<JsonObject>().FirstOrDefault(item => Json.Text(item, "id") == subscriptionId);
            if (subscription is not null)
            {
                date = Json.Text(subscription, "renewsAt", "end", "start");
                providerText = Json.Text(subscription, "service");
            }
        }
        int? days = null;
        if (DateTime.TryParse(date, out var parsed)) days = (parsed.Date - DateTime.Today).Days;
        var status = Json.Text(node, "status", "state");
        var mediaType = collection == "plex" ? (Json.Text(node, "plexType") is "show" or "season" or "episode" ? "TV Show" : "Movie")
            : mediaTypeHint.Length > 0 ? mediaTypeHint
            : collection.Contains("Movie", StringComparison.OrdinalIgnoreCase) ? "Movie"
            : collection.Contains("Series", StringComparison.OrdinalIgnoreCase) ? "TV Show" : "Game";
        return new LibraryRow
        {
            Id = Json.Text(node, "id", "canonicalId", "rawgId", "tmdbId"),
            Name = name,
            Collection = collection,
            MediaType = mediaType,
            Platform = platformText,
            Status = status,
            Date = DisplayDate(date),
            Genre = GenreText(node),
            Image = Json.Text(node, "img", "poster", "cover", "posterUrl"),
            Backdrop = Json.Text(node, "backdrop", "background", "backdropUrl"),
            Overview = CatalogService.CleanStoryText(Json.Text(node, "overview", "plot", "summary", "description")),
            Providers = providerText,
            Vendor = QueueAvailability(node, Json.Text(node, "vendor")),
            Note = Json.Text(node, "note", "remarks"),
            ImdbId = Json.Text(node, "imdbId"),
            TmdbId = Json.Text(node, "tmdbId", "id"),
            Seasons = Json.Integer(node, "seasons", "numberOfSeasons"),
            Episodes = Json.Integer(node, "episodeCount", "episodes"),
            Rating = Json.Number(node, "imdb", "rating", "rrating", "tmdb", "score"),
            Cost = (decimal)Json.Number(node, "purchasePrice", "cost"),
            DaysLeft = days,
            GroupName = GroupName(collection, status, days),
            Badges = GameBadges(name, node, mediaType),
            SortIndex = index,
            AddedAt = AddedTimestamp(node),
            Source = node
        };
    }

    /// <summary>Timestamp a record was added, in milliseconds; 0 when unknown.</summary>
    private static long AddedTimestamp(JsonObject node)
    {
        foreach (var key in new[] { "added", "addedAt", "started", "t", "createdAt" })
        {
            var raw = node[key];
            if (raw is null) continue;
            var text = raw.ToString();
            if (long.TryParse(text, out var parsedNumber) && parsedNumber > 0) return parsedNumber;
            if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var real) && real > 0) return (long)real;
            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsedDate))
                return new DateTimeOffset(parsedDate).ToUnixTimeMilliseconds();
        }
        return 0;
    }

    public static string GroupName(string collection, string status, int? days) => collection switch
    {
        "rentals" => "Active rentals",
        "rentalHistory" => "Rental history",
        "playing" when status.Contains("resume", StringComparison.OrdinalIgnoreCase) => "Resume later",
        "playing" when status.Contains("hold", StringComparison.OrdinalIgnoreCase) || status.Contains("drop", StringComparison.OrdinalIgnoreCase) => "On hold",
        "playing" => "Playing now",
        "subscriptionGames" => "Included games",
        "purchasedGames" => "Owned permanently on Steam",
        /* Anything whose date has passed drops to its own section at the bottom, so
           a list of what is still to come is not mixed with what already arrived. */
        "upcoming" when days is < 0 => "Already released",
        "upcoming" => "Upcoming releases",
        "upcomingRemoved" => "Removed games",
        "uphw" when days is < 0 => "Already released",
        "uphw" => "Coming soon",
        "seriesupcoming" when days is < 0 => "Already released",
        "seriesupcoming" => "Upcoming shows",
        "mlup" when days is < 0 => "Already released",
        "mlup" => "Coming to Malayalam OTT",
        "mlott" => "Released on Malayalam OTT",
        _ => ""
    };

    /* "Included games" sits last so the Subscriptions view reads as the
       subscriptions themselves first, then the games they include. */
    public static int GroupOrder(string group) => group switch
    {
        "Active rentals" or "Playing now" or "Upcoming releases" or "Active subscriptions" or "Owned permanently on Steam"
            or "Coming soon" or "Upcoming shows" or "Coming to Malayalam OTT" => 0,
        "Resume later" => 1,
        "On hold" or "Past subscriptions" => 2,
        "Rental history" => 3,
        "Removed games" => 5,
        "Included games" => 6,
        "Already released" => 4,
        _ => 0
    };

    private static readonly HashSet<string> Ps5ProTitles = new(new[]
    {
        "Marvel's Spider-Man 2", "Marvel's Spider-Man: Miles Morales", "God of War Ragnarok", "Horizon Forbidden West",
        "Horizon Zero Dawn Remastered", "The Last of Us Part I", "The Last of Us Part II Remastered", "Demon's Souls",
        "Ratchet & Clank: Rift Apart", "Gran Turismo 7", "Ghost of Tsushima Director's Cut", "Astro Bot", "Alan Wake 2",
        "Final Fantasy VII Rebirth", "Final Fantasy XVI", "Dragon's Dogma 2", "Resident Evil 4", "Resident Evil Village",
        "Silent Hill 2", "Star Wars Jedi: Survivor", "Hogwarts Legacy", "Stellar Blade", "Black Myth: Wukong", "Cyberpunk 2077",
        "Kingdom Come: Deliverance II", "Monster Hunter Wilds", "Assassin's Creed Shadows", "Death Stranding 2: On the Beach",
        "Doom: The Dark Ages", "Clair Obscur: Expedition 33", "Lies of P", "Dead Space"
    }.Select(NormalizedTitle));

    private static string GameBadges(string name, JsonObject node, string mediaType)
    {
        if (mediaType != "Game") return "";
        var badges = new List<string>();
        var tier = Json.Text(node, "tier", "classification"); if (tier.Length > 0) badges.Add(tier);
        if (Ps5ProTitles.Contains(NormalizedTitle(name)) || Json.Flag(node, "ps5Pro") || Json.Flag(node, "proEnhanced")) badges.Add("PS5 Pro Enhanced");
        var remaster = Json.Text(node, "rem", "edition"); if (remaster.Length > 0) badges.Add(remaster);
        var platforms = Json.ArrayText(node, "platforms", "platform");
        var hasXbox = platforms.Contains("Xbox", StringComparison.OrdinalIgnoreCase);
        var hasPlayStation = platforms.Contains("PS5", StringComparison.OrdinalIgnoreCase) || platforms.Contains("PlayStation", StringComparison.OrdinalIgnoreCase);
        if (hasXbox && !hasPlayStation) badges.Add("Xbox Exclusive");
        if (hasPlayStation && !hasXbox && !platforms.Contains("PC", StringComparison.OrdinalIgnoreCase)) badges.Add("PS5 Exclusive");
        return string.Join(" · ", badges.Distinct());
    }

    private static readonly Dictionary<int, string> TmdbGenres = new()
    {
        [28] = "Action", [12] = "Adventure", [16] = "Animation", [35] = "Comedy", [80] = "Crime", [99] = "Documentary",
        [18] = "Drama", [10751] = "Family", [14] = "Fantasy", [36] = "History", [27] = "Horror", [10402] = "Music",
        [9648] = "Mystery", [10749] = "Romance", [878] = "Science Fiction", [10770] = "TV Movie", [53] = "Thriller",
        [10752] = "War", [37] = "Western", [10759] = "Action & Adventure", [10762] = "Kids", [10763] = "News",
        [10764] = "Reality", [10765] = "Sci-Fi & Fantasy", [10766] = "Soap", [10767] = "Talk", [10768] = "War & Politics"
    };

    private static string GenreText(JsonObject node)
    {
        var named = Json.Text(node, "genre");
        if (named.Length > 0) return named.Replace("·", " / ");
        if (node["genres"] is JsonArray genres)
        {
            var values = genres.Select(item => item is JsonObject obj ? Json.Text(obj, "name") : item is JsonValue value ? value.ToString() : "")
                .Select(value => int.TryParse(value, out var id) && TmdbGenres.TryGetValue(id, out var mapped) ? mapped : value)
                .Where(value => !string.IsNullOrWhiteSpace(value));
            return string.Join(" / ", values);
        }
        return "";
    }

    private static string QueueAvailability(JsonObject node, string fallback)
    {
        if (node["shops"] is not JsonObject shops) return fallback;
        var parts = new List<string>();
        if (shops["hub"] is JsonObject hub && Json.Flag(hub, "found"))
        {
            foreach (var (label, key) in new[] { ("Game Hub primary", "primary"), ("Game Hub secondary", "secondary") })
                if (hub[key] is JsonObject option)
                {
                    var next = Json.Text(option, "next"); var price = Json.Number(option, "price");
                    var status = Json.Flag(option, "now") ? "Available now" : next.Length > 0 ? $"Next: {next}" : "Not available";
                    parts.Add($"{label}: {status} {(price > 0 ? $"· Rs {price:N0}/mo" : "")}".Trim());
                }
        }
        if (shops["gp"] is JsonObject gp && Json.Flag(gp, "found"))
        {
            var status = Json.Flag(gp, "stock") ? "Available now" : Json.Flag(gp, "pre") ? "PS5 Book / pre-book" : "Not available";
            var price = Json.Number(gp, "rent", "price", "rentalPrice");
            parts.Add($"Gamer Planet: {status} {(price > 0 ? $"· Rs {price:N0}" : "")}".Trim());
        }
        if (parts.Count > 0) return string.Join("  |  ", parts);
        if (shops["t"] is not null) return "Checked The Game Hub and Gamer Planet: no current listing found";
        return fallback;
    }

    /// <summary>
    /// Titles already finished, so they can be kept out of the active lists.
    /// A completed game reappearing under Discover or Queue is noise.
    /// </summary>
    public IEnumerable<LibraryRow> ExcludeCompleted(IEnumerable<LibraryRow> source, string mediaType)
    {
        var collections = mediaType switch
        {
            "Movie" => new[] { "watchedMovies", "hiddenMovies" },
            "TV Show" => ["watchedSeries", "hiddenSeries"],
            _ => new[] { "played", "hiddenGames" }
        };
        var completed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var collection in collections)
            foreach (var node in vault.Collection(collection).OfType<JsonObject>())
            {
                var title = Json.Text(node, "name", "title");
                if (title.Length > 0) completed.Add(NormalizedTitle(title));
            }
        return completed.Count == 0 ? source : source.Where(row => !completed.Contains(NormalizedTitle(row.Name)));
    }

    /// <summary>Keeps a row when it belongs to the platform; an empty platform keeps everything.</summary>
    public static bool PlatformMatches(LibraryRow row, string platform)
    {
        if (platform.Length == 0) return true;
        var value = $"{row.Platform} {Json.Text(row.Source, "platforms", "platform", "stores")}";
        var xboxPc = value.Contains("xbox", StringComparison.OrdinalIgnoreCase) || value.Contains("pc", StringComparison.OrdinalIgnoreCase) || value.Contains("windows", StringComparison.OrdinalIgnoreCase);
        var ps5 = value.Contains("playstation", StringComparison.OrdinalIgnoreCase) || value.Contains("ps5", StringComparison.OrdinalIgnoreCase);
        if (!xboxPc && !ps5) return false;
        return platform == "ps5" ? ps5 : xboxPc;
    }

    /// <summary>The rows behind one Games view. Platform only applies to Upcoming and Discover.</summary>
    public IEnumerable<LibraryRow> Games(string collection, string platform = "")
    {
        IEnumerable<LibraryRow> source = collection switch
        {
            "playing" => Collection("playing").Concat(Collection("rentals")).GroupBy(row => NormalizedTitle(row.Name)).Select(group => group.First()),
            "rentals" => Collection("rentals").Concat(Collection("rentalHistory")),
            "subscriptionGames" => Subscriptions().Concat(Collection("subscriptionGames")),
            "upcoming" => Collection("upcoming").Concat(Collection("upcomingRemoved")),
            _ => Collection(collection)
        };
        if (collection is "upcoming" or "catalogExtra") source = source.Where(row => PlatformMatches(row, platform));
        /* A finished game has no business sitting in Discover, the queue or the
           upcoming list — it belongs in Completed only. */
        if (collection is "catalogExtra" or "queue" or "upcoming") source = ExcludeCompleted(source, "Game");
        return source;
    }

    /// <summary>The personal collection behind a Movies or TV view mode.</summary>
    public static string MediaCollection(bool movies, string mode) => mode switch
    {
        "watching" => movies ? "watchingMovies" : "watchingSeries",
        "watched" => movies ? "watchedMovies" : "watchedSeries",
        "hidden" => movies ? "hiddenMovies" : "hiddenSeries",
        _ => movies ? "movieWatchlist" : "seriesWatchlist"
    };

    /// <summary>The rows behind one Movies or TV view, before the year and genre filters.</summary>
    public IEnumerable<LibraryRow> Media(bool movies, string mode)
    {
        var mediaType = movies ? "Movie" : "TV Show";
        var rows = IsCatalog(mode) ? Catalog(movies ? "movies" : "series", mode) : Collection(MediaCollection(movies, mode), mediaType);
        /* Every section except the Upcoming feeds shows titles only up to the
           current year; anything dated later belongs under Coming Soon / Upcoming.
           Undated rows (year 0) are kept. */
        if (!AllowsFutureYears(mode))
        {
            var currentYear = DateTime.Today.Year;
            rows = rows.Where(row => RowYear(row) <= currentYear);
        }
        /* Discovery feeds already drop titles that live in a personal list, but the
           watchlist itself could still show something also marked watched. */
        if (mode is "watchlist" or "watching") rows = ExcludeCompleted(rows, mediaType);
        return rows;
    }

    /// <summary>A row's release year, preferring the stored year and falling back to its date; 0 when unknown.</summary>
    public static int RowYear(LibraryRow row)
    {
        if (int.TryParse(row.Source["year"]?.ToString(), out var stored) && stored > 1900) return stored;
        var parsed = ParseSortDate(row.Date).Year;
        return parsed > 1900 ? parsed : 0;
    }

    /// <summary>
    /// Orders rows for display.
    /// <paramref name="view"/> is the collection or catalog mode on screen and
    /// <paramref name="sort"/> one of new, title, date or rating.
    /// </summary>
    public static List<LibraryRow> Sort(IEnumerable<LibraryRow> source, string view, string sort, bool byYear)
    {
        var rows = source as IList<LibraryRow> ?? source.ToList();
        IEnumerable<LibraryRow> ordered =
            byYear ? rows.OrderByDescending(row => row.YearValue).ThenBy(row => row.Name)
            : view == "upcoming" ? rows.OrderBy(row => row.Collection == "upcomingRemoved" ? 2 : row.DaysLeft is < 0 ? 1 : 0)
                .ThenBy(row => row.DaysLeft is >= 0 ? row.DaysLeft : int.MaxValue).ThenByDescending(row => ParseSortDate(row.Date)).ThenBy(row => row.Name)
            : view == "catalogExtra" && sort == "new" ? rows.OrderByDescending(row => ParseSortDate(row.Date)).ThenByDescending(row => row.Rating).ThenBy(row => row.Name)
            : IsCatalog(view) && sort == "new" ? rows.OrderBy(row => row.DaysLeft is >= 0 ? 0 : 1)
                .ThenBy(row => row.DaysLeft is >= 0 ? row.DaysLeft : int.MaxValue).ThenByDescending(row => ParseSortDate(row.Date)).ThenBy(row => row.Name)
            : view == "rentals" ? rows.OrderBy(row => GroupOrder(row.GroupName)).ThenByDescending(row => ParseSortDate(Json.Text(row.Source, "start", "date", "added")))
            : view == "playing" ? rows.OrderBy(row => GroupOrder(row.GroupName)).ThenByDescending(row => ParseSortDate(row.Date))
            : view == "subscriptionGames" ? rows.OrderBy(row => GroupOrder(row.GroupName)).ThenBy(row => row.Name)
            : sort switch
            {
                "title" => rows.OrderBy(row => row.Name),
                "date" => rows.OrderBy(row => row.DaysLeft is < 0 ? 1 : 0).ThenBy(row => row.DaysLeft ?? int.MaxValue),
                "rating" => rows.OrderByDescending(row => row.Rating),
                /* "Newest first" on a hand-built list means the order it was built
                   in, newest at the front — not newest by release date, which is
                   what made watchlists and queues look randomly shuffled. New
                   records are inserted at index 0, so a lower SortIndex is newer. */
                _ when rows.Count > 0 && rows.All(row => IsCuratedList(row.Collection))
                    => rows.OrderByDescending(row => row.AddedAt).ThenBy(row => row.SortIndex),
                _ => rows.OrderByDescending(row => ParseSortDate(row.Date)).ThenBy(row => row.Name)
            };
        return ordered.ToList();
    }

    /// <summary>Whether a view splits its rows under section headings.</summary>
    public static bool IsGrouped(string view) => view is "rentals" or "playing" or "subscriptionGames" or "upcoming"
        or "mlott" or "mlup" or "uphw" or "seriesupcoming";

    public static bool SameTitleAndYear(JsonObject item, string title, string year)
    {
        if (!string.Equals(NormalizedTitle(Json.Text(item, "name", "title")), NormalizedTitle(title), StringComparison.Ordinal)) return false;
        var itemYear = Json.Text(item, "year");
        return year.Length == 0 || itemYear.Length == 0 || string.Equals(itemYear, year, StringComparison.Ordinal);
    }

    public static bool StrongIdentityMatches(JsonObject left, JsonObject right)
    {
        foreach (var key in new[] { "canonicalId", "tmdbId", "rawgId", "imdbId", "plexRatingKey" })
        {
            var a = Json.Text(left, key);
            var b = Json.Text(right, key);
            if (a.Length > 0 && b.Length > 0 && string.Equals(a, b, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    public bool CollectionContains(string collection, LibraryRow row) => vault.Collection(collection).OfType<JsonObject>().Any(item =>
        StrongIdentityMatches(item, row.Source) || SameTitleAndYear(item, row.Name, Json.Text(row.Source, "year")));

    /// <summary>The label for the main button on a title's detail page.</summary>
    public static string PrimaryActionLabel(LibraryRow row)
    {
        if (row.Collection == "subscriptions") return "Manage subscriptions";
        if (row.Collection is "subscriptionGames" or "purchasedGames") return "Play now";
        if (row.Collection == "plex") return row.Status == "Watched" ? "Mark unwatched" : "Mark watched";
        if (row.Collection == "rentals") return "Return rental";
        if (row.Collection == "rentalHistory") return "Rent again";
        if (row.Collection == "upcomingRemoved") return "Restore to upcoming";
        if (row.Collection is "hiddenMovies" or "hiddenSeries") return "Restore to watchlist";
        if (IsCatalog(row)) return "Add to watchlist";
        if (row.MediaType is "Movie" or "TV Show")
            return row.Collection is "movieWatchlist" or "seriesWatchlist" ? "Start watching"
                : row.Collection is "watchingMovies" or "watchingSeries" ? "Mark watched" : "Watch again";
        return row.Collection is "upcoming" or "catalogExtra" ? "Add to rental queue" : row.Collection == "queue" ? "Move to playing" : "Mark completed";
    }

    /// <summary>The label for the destructive button on a title's detail page.</summary>
    public static string RemoveActionLabel(LibraryRow row) =>
        row.Collection == "plex" ? "Delete from Plex"
        : IsCatalog(row) ? "Not interested"
        : row.Collection is "hiddenMovies" or "hiddenSeries" or "upcomingRemoved" ? "Delete permanently"
        : row.Collection == "upcoming" ? "Remove from upcoming" : "Remove";

    /// <summary>How well a title matches what the user has rated highly before.</summary>
    public double RecommendationScore(LibraryRow candidate)
    {
        var history = candidate.MediaType switch { "Movie" => "watchedMovies", "TV Show" => "watchedSeries", _ => "played" };
        static HashSet<string> Genres(string genre) => genre.Split(['/', ',', '·'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(NormalizedTitle).ToHashSet();
        var wanted = Genres(candidate.Genre);
        var affinity = Collection(history).Sum(item =>
        {
            var personal = Json.Number(item.Source, "userRating", "myRating");
            return personal <= 0 ? 0 : Genres(item.Genre).Count(wanted.Contains) * personal * personal;
        });
        return affinity + candidate.Rating * 2;
    }
}
