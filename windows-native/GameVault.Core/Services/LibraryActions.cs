using System.Globalization;
using System.Text.Json.Nodes;
using SinuGameVault.Models;

namespace SinuGameVault.Services;

/// <summary>
/// Every change a user can make to a title: moving it between lists, renting,
/// returning, hiding, rating, and filling in missing details from the catalog.
///
/// Nothing here asks a question or shows a message. The interface confirms a
/// destructive action first and then calls in, so the same rules can be run
/// from a test without a window.
/// </summary>
public sealed class LibraryActions(VaultRepository vault, LibraryReader reader, CatalogService catalog, AvailabilityService availability)
{
    private JsonObject? _undoRoot;
    private readonly HashSet<string> _catalogRefreshes = [];
    private bool _refreshingQueueAvailability;

    /// <summary>Raised when an undo snapshot is taken or used up.</summary>
    public event Action? UndoChanged;
    public bool CanUndo => _undoRoot is not null;

    private static string Today => DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    private static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>Remembers the whole vault so the next change can be reversed.</summary>
    public void CaptureUndo()
    {
        _undoRoot = Json.Clone(vault.Root);
        UndoChanged?.Invoke();
    }

    public async Task<bool> UndoAsync()
    {
        if (_undoRoot is not { } snapshot) return false;
        _undoRoot = null;
        UndoChanged?.Invoke();
        await vault.ImportJsonAsync(snapshot.ToJsonString());
        return true;
    }

    public static string WatchlistFor(string mediaType) => mediaType switch { "Movie" => "movieWatchlist", "TV Show" => "seriesWatchlist", _ => "queue" };
    public static string FinishedFor(string mediaType) => mediaType switch { "Movie" => "watchedMovies", "TV Show" => "watchedSeries", _ => "played" };
    public static string HiddenFor(string mediaType) => mediaType switch { "Movie" => "hiddenMovies", "TV Show" => "hiddenSeries", _ => "hiddenGames" };
    private static string WatchingFor(string mediaType) => mediaType == "Movie" ? "watchingMovies" : "watchingSeries";

    /// <summary>The lists a title of this kind can be moved to: label, collection, stored status.</summary>
    public static (string Label, string Collection, string Status)[] StatusChoices(string mediaType) => mediaType switch
    {
        "Movie" => [("Watchlist", "movieWatchlist", "Watchlist"), ("Watching", "watchingMovies", "Watching"), ("Watched", "watchedMovies", "Watched"), ("Not interested", "hiddenMovies", "Not Interested")],
        "TV Show" => [("Watchlist", "seriesWatchlist", "Watchlist"), ("Watching", "watchingSeries", "Watching"), ("Watched", "watchedSeries", "Watched"), ("Not interested", "hiddenSeries", "Not Interested")],
        _ => [("Rental queue", "queue", "Queued"), ("Playing", "playing", "Playing"), ("Resume later", "playing", "Resume Later"), ("On hold", "playing", "On Hold"), ("Completed", "played", "Finished")]
    };

    /// <summary>Moves a title to another list and records its new status.</summary>
    public async Task MoveToAsync(LibraryRow row, string destination, string status)
    {
        // Subscription plans are edited in their own manager, never moved between game lists.
        if (row.Collection == "subscriptions") return;
        CaptureUndo();
        var clone = Json.Clone(row.Source);
        clone["status"] = status;
        await vault.BulkAsync(async () =>
        {
            await vault.UpdateAsync(destination, clone);
            /* Purchased is an ownership ledger and a subscription game an
               entitlement, not a transient status. Starting or finishing one must
               never remove that record. */
            if (!LibraryReader.IsCatalog(row) && row.Collection is not ("plex" or "purchasedGames" or "subscriptionGames") && row.Collection != destination)
                await vault.RemoveAsync(row.Collection, row.Id);
        });
        if (destination == "queue") await UpdateAvailabilityAsync(clone);
    }

    /// <summary>
    /// The step a title naturally takes next: watchlist to watching to watched,
    /// queue to playing to completed, discovery to the watchlist or queue.
    /// Rentals and Plex items have their own methods because they need a
    /// confirmation or a server call first.
    /// </summary>
    public async Task AdvanceAsync(LibraryRow row)
    {
        if (row.Collection == "rentalHistory") { await RentAgainAsync(row); return; }
        if (row.Collection == "upcomingRemoved")
        {
            await vault.MoveAsync("upcomingRemoved", "upcoming", Json.Clone(row.Source));
            return;
        }
        var destination = row.MediaType switch
        {
            "Movie" when row.Collection == "movieWatchlist" => "watchingMovies",
            "Movie" when row.Collection == "watchingMovies" => "watchedMovies",
            "Movie" when row.Collection == "watchedMovies" => "watchingMovies",
            "Movie" => "movieWatchlist",
            "TV Show" when row.Collection == "seriesWatchlist" => "watchingSeries",
            "TV Show" when row.Collection == "watchingSeries" => "watchedSeries",
            "TV Show" when row.Collection == "watchedSeries" => "watchingSeries",
            "TV Show" => "seriesWatchlist",
            _ when row.Collection is "upcoming" or "catalogExtra" => "queue",
            _ when row.Collection is "queue" or "subscriptionGames" or "purchasedGames" => "playing",
            _ => "played"
        };
        var clone = Json.Clone(row.Source);
        var status = destination switch
        {
            "watchedMovies" or "watchedSeries" => "Watched", "watchingMovies" or "watchingSeries" => "Watching",
            "movieWatchlist" or "seriesWatchlist" => "Watchlist", "playing" => "Playing", "played" => "Finished", "queue" => "Queued", _ => ""
        };
        if (status.Length > 0) clone["status"] = status;
        CaptureUndo();
        await vault.BulkAsync(async () =>
        {
            if (!reader.CollectionContains(destination, row)) await vault.AddAsync(destination, clone);
            if (!LibraryReader.IsCatalog(row) && row.Collection is not ("subscriptionGames" or "purchasedGames") && row.Collection != destination)
                await vault.RemoveAsync(row.Collection, row.Id);
        });
        if (destination == "queue") await UpdateAvailabilityAsync(clone);
    }

    /// <summary>Ends an active rental today and keeps it in Rental History.</summary>
    public async Task ReturnRentalAsync(LibraryRow row, bool alsoComplete)
    {
        CaptureUndo();
        var returned = Json.Clone(row.Source);
        returned["end"] = Today;
        returned["status"] = "Returned";
        if (DateTime.TryParse(Json.Text(returned, "start"), out var start)) returned["used"] = Math.Max(0, (DateTime.Today - start.Date).Days);
        await vault.BulkAsync(async () =>
        {
            await vault.MoveAsync("rentals", "rentalHistory", returned);
            if (!alsoComplete) return;
            var completed = Json.Clone(row.Source);
            completed["status"] = "Finished";
            await vault.UpdateAsync("played", completed);
        });
    }

    /// <summary>Starts a fresh 30-day rental today from a queued or previously rented title.</summary>
    public async Task StartRentalAsync(LibraryRow row)
    {
        CaptureUndo();
        var rental = Json.Clone(row.Source);
        rental["id"] = Guid.NewGuid().ToString("N");
        rental["start"] = Today;
        rental["returnDate"] = DateTime.Today.AddDays(30).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        rental["days"] = 30;
        rental["status"] = "Active";
        rental["added"] = Now;
        rental.Remove("end");
        rental.Remove("returnedAt");
        rental.Remove("used");
        await vault.BulkAsync(async () =>
        {
            await vault.AddAsync("rentals", rental);
            if (row.Collection == "queue") await vault.RemoveAsync("queue", Json.Text(row.Source, "id"));
        });
    }

    public Task RentAgainAsync(LibraryRow row) => StartRentalAsync(row);

    /// <summary>
    /// Removes a title the way its list expects: an upcoming game goes to Removed
    /// so a refresh cannot bring it back, a discovery title is hidden, and
    /// anything else is deleted from its list.
    /// </summary>
    public async Task RemoveAsync(LibraryRow row)
    {
        CaptureUndo();
        if (row.Collection == "upcoming")
        {
            await vault.MoveAsync("upcoming", "upcomingRemoved", Json.Clone(row.Source));
            return;
        }
        if (LibraryReader.IsCatalog(row))
        {
            var hidden = HiddenFor(row.MediaType);
            if (!reader.CollectionContains(hidden, row)) await vault.AddAsync(hidden, Json.Clone(row.Source));
            return;
        }
        await vault.RemoveAsync(row.Collection, row.Id);
    }

    /// <summary>Saves a personal rating from 0 (none) to 10.</summary>
    public async Task RateAsync(LibraryRow row, int rating)
    {
        var item = Json.Clone(row.Source);
        if (rating > 0) item["userRating"] = rating; else item.Remove("userRating");
        // Rating something from a discovery feed keeps it, so it joins the watchlist.
        var destination = LibraryReader.IsCatalog(row) ? WatchlistFor(row.MediaType) : row.Collection;
        await vault.UpdateAsync(destination, item);
    }

    /// <summary>Builds the record for a permanent Steam purchase; null when already owned.</summary>
    public JsonObject? PurchaseSeed(LibraryRow row)
    {
        if (vault.Collection("purchasedGames").OfType<JsonObject>().Any(item => VaultIdentity.Matches(item, row.Source))) return null;
        var owned = Json.Clone(row.Source);
        owned["id"] = Guid.NewGuid().ToString("N");
        owned["name"] = row.Name;
        owned["store"] = "Steam";
        owned["platform"] = "PC";
        owned.Remove("cost");
        owned["purchasePrice"] = 0;
        owned["purchaseDate"] = Today;
        owned["permanent"] = true;
        owned["status"] = "Owned";
        return owned;
    }

    /// <summary>Adds a new game, linking a subscription game to its plan and starting it.</summary>
    public async Task AddGameAsync(string collection, JsonObject item, JsonObject? subscription)
    {
        if (collection == "subscriptionGames" && subscription is not null)
        {
            item["subscriptionId"] = Json.Text(subscription, "id");
            item["provider"] = Json.Text(subscription, "service");
        }
        await vault.BulkAsync(async () =>
        {
            await vault.AddAsync(collection, item);
            if (collection != "subscriptionGames") return;
            var playing = Json.Clone(item);
            playing["source"] = "subscription";
            playing["status"] = "Playing";
            await vault.AddAsync("playing", playing);
        });
        if (collection == "queue") await UpdateAvailabilityAsync(item);
    }

    // ---- Rental availability ------------------------------------------------

    public async Task UpdateAvailabilityAsync(JsonObject item)
    {
        var title = Json.Text(item, "name", "title");
        if (title.Length == 0) return;
        item["shops"] = await availability.CheckAsync(title);
        await vault.UpdateAsync("queue", item);
    }

    /// <summary>Checks the rental vendors for queued games not checked in the last six hours.</summary>
    public async Task<int> RefreshQueueAvailabilityAsync(bool force, Action<string>? progress = null)
    {
        if (_refreshingQueueAvailability) return 0;
        var staleBefore = DateTimeOffset.UtcNow.Subtract(TimeSpan.FromHours(6)).ToUnixTimeMilliseconds();
        var pending = vault.Collection("queue").OfType<JsonObject>()
            .Where(item => force || item["shops"] is not JsonObject shops || Json.Number(shops, "t") < staleBefore).ToList();
        if (pending.Count == 0) return 0;
        _refreshingQueueAvailability = true;
        try
        {
            foreach (var item in pending)
            {
                progress?.Invoke(Json.Text(item, "name", "title"));
                try { await UpdateAvailabilityAsync(item); }
                catch (Exception ex) { DiagnosticsService.Log("Availability", "Rental availability check failed", ex); }
            }
            return pending.Count;
        }
        finally { _refreshingQueueAvailability = false; }
    }

    // ---- Catalogs -----------------------------------------------------------

    /// <summary>
    /// Refreshes one discovery feed. Unless forced, a feed that already has data
    /// and was fetched within twelve hours is left alone.
    /// </summary>
    /// <returns>True when new data was stored.</returns>
    public async Task<bool> RefreshCatalogAsync(string section, string mode, bool force)
    {
        var isGames = section == "Games";
        if (isGames && mode is not ("upcoming" or "catalogExtra")) return false;
        if (!isGames && !LibraryReader.IsCatalog(mode)) return false;
        if (isGames ? catalog.RawgKey.Length == 0 : catalog.TmdbKey.Length == 0)
        {
            if (force) throw new InvalidOperationException(isGames ? "Save a RAWG API key in Settings first." : "Save a TMDB API key in Settings first.");
            return false;
        }
        var key = isGames ? $"{section}:{mode}:catalog-v4" : $"{section}:{mode}:catalog-v3";
        if (!_catalogRefreshes.Add(key)) return false;
        try
        {
            var typeKey = section == "Movies" ? "movies" : "series";
            if (!force)
            {
                var previous = VaultRepository.Number((vault.Root["nativeCatalogRefreshAt"] as JsonObject)?[key]);
                if (!isGames) previous = Math.Max(previous, VaultRepository.Number(vault.Root["nativeTvCatalog"]?["generatedAt"]));
                var hasData = isGames ? vault.Collection(mode).Count > 0 : (vault.Root["nativeTvCatalog"]?[typeKey]?[mode] as JsonArray)?.Count > 0;
                if (hasData && Now - previous < TimeSpan.FromHours(12).TotalMilliseconds) return false;
            }
            if (isGames)
            {
                var items = await catalog.GameCatalogAsync(mode == "upcoming");
                var hidden = mode == "upcoming"
                    ? vault.Collection("upcomingRemoved").OfType<JsonObject>().Select(item => LibraryReader.NormalizedTitle(Json.Text(item, "name"))).ToHashSet()
                    : [];
                await vault.SetCacheValueAsync(mode, new JsonArray(items.Where(item => !hidden.Contains(LibraryReader.NormalizedTitle(Json.Text(item, "name"))))
                    .Select(item => (JsonNode)item.DeepClone()).ToArray()));
            }
            else
            {
                var items = await catalog.MediaCatalogAsync(section == "Movies" ? "Movie" : "TV Show", mode);
                var root = Json.Clone(vault.Root["nativeTvCatalog"] as JsonObject);
                if (root[typeKey] is not JsonObject typeRoot) { typeRoot = []; root[typeKey] = typeRoot; }
                typeRoot[mode] = new JsonArray(items.Select(item => (JsonNode)item.DeepClone()).ToArray());
                await vault.SetCacheValueAsync("nativeTvCatalog", root);
            }
            var timestamps = Json.Clone(vault.Root["nativeCatalogRefreshAt"] as JsonObject);
            timestamps[key] = Now;
            await vault.SetCacheValueAsync("nativeCatalogRefreshAt", timestamps);
            return true;
        }
        finally { _catalogRefreshes.Remove(key); }
    }

    // ---- Filling in details -------------------------------------------------

    /// <summary>
    /// Fills in whatever an open title is missing — artwork, synopsis, providers,
    /// rating, the Wikipedia story — and saves it.
    /// </summary>
    /// <param name="stillWanted">Returns false once the user has moved on, so a slow lookup is not saved over a different title.</param>
    /// <returns>The refreshed row, or null when nothing changed.</returns>
    public async Task<LibraryRow?> EnrichAsync(LibraryRow row, Func<bool> stillWanted)
    {
        if (row.Collection is "plex" or "subscriptions") return null;
        var changed = false;
        if (row.MediaType is "Movie" or "TV Show")
        {
            if (catalog.TmdbKey.Length > 0)
            {
                var ratingIsStale = SafeDates.IsStale(Json.Long(row.Source, "imdbCheckedAt"), TimeSpan.FromDays(7), DateTimeOffset.UtcNow);
                if (row.Image.Length == 0 || row.Overview.Length == 0 || row.Providers.Length == 0 || row.ImdbId.Length == 0 || ratingIsStale)
                {
                    if (row.TmdbId.Length == 0)
                    {
                        try
                        {
                            var expectedYear = Json.Text(row.Source, "year");
                            var found = (await catalog.SearchMediaAsync(row.Name, row.MediaType))
                                .OrderByDescending(item => expectedYear.Length > 0 && Json.Text(item, "year") == expectedYear)
                                .ThenByDescending(item => Json.Number(item, "popularity")).FirstOrDefault();
                            if (found is not null) Json.Merge(row.Source, found);
                        }
                        catch { /* The title simply stays as it is. */ }
                    }
                    try { await catalog.EnrichMediaAsync(row.Source, row.MediaType); changed = true; }
                    catch (Exception ex) { DiagnosticsService.Log("Details", "Catalog enrichment failed", ex); }
                    if (!stillWanted()) return null;
                }
            }
            if (CatalogService.CleanStoryText(Json.Text(row.Source, "wikipediaPlot")).Length == 0)
            {
                var story = await SafeStoryAsync(row.Name, row.MediaType, Json.Text(row.Source, "year", "date"));
                if (!stillWanted()) return null;
                if (story.Length > 0) { row.Source["wikipediaPlot"] = story; changed = true; }
            }
        }
        else if (row.MediaType == "Game")
        {
            if (Json.Text(row.Source, "img", "cover", "poster").Length == 0 && catalog.RawgKey.Length > 0)
            {
                try
                {
                    var found = (await catalog.SearchGamesAsync(row.Name)).FirstOrDefault();
                    if (found is not null) { Json.Merge(row.Source, found); changed = true; }
                }
                catch { /* Artwork is optional. */ }
                if (!stillWanted()) return null;
            }
            if (row.Overview.Length == 0)
            {
                var plot = await SafeStoryAsync(row.Name, "Game", Json.Text(row.Source, "year"));
                if (!stillWanted()) return null;
                if (plot.Length > 0) { row.Source["overview"] = plot; changed = true; }
            }
        }
        if (!changed) return null;
        if (LibraryReader.IsCatalog(row)) await PersistCatalogMetadataAsync(row);
        else await vault.UpdateAsync(row.Collection, row.Source);
        return reader.Row(Json.Clone(row.Source), row.Collection, row.MediaType);
    }

    /// <summary>Fetches the Wikipedia story again and stores it; empty when none was found.</summary>
    public async Task<string> RefreshStoryAsync(LibraryRow row)
    {
        var story = await SafeStoryAsync(row.Name, row.MediaType, Json.Text(row.Source, "year", "date"));
        if (story.Length == 0) return "";
        row.Source[row.MediaType == "Game" ? "overview" : "wikipediaPlot"] = story;
        if (!LibraryReader.IsCatalog(row) && row.Collection != "plex") await vault.UpdateAsync(row.Collection, row.Source);
        return story;
    }

    private async Task<string> SafeStoryAsync(string title, string mediaType, string year)
    {
        try { return await catalog.WikipediaSummaryAsync(title, mediaType, year); }
        catch (Exception ex) { DiagnosticsService.Log("Details", "Wikipedia lookup failed", ex); return ""; }
    }

    private async Task PersistCatalogMetadataAsync(LibraryRow row)
    {
        var root = Json.Clone(vault.Root["nativeTvCatalog"] as JsonObject);
        var typeKey = row.MediaType == "Movie" ? "movies" : "series";
        if (root[typeKey]?[row.Collection] is not JsonArray items) return;
        var identity = Json.Text(row.Source, "canonicalId", "tmdbId", "id");
        var match = items.OfType<JsonObject>().FirstOrDefault(item => Json.Text(item, "canonicalId", "tmdbId", "id") == identity);
        if (match is null) return;
        items[items.IndexOf(match)] = row.Source.DeepClone();
        await vault.SetCacheValueAsync("nativeTvCatalog", root);
    }

    // ---- Plex ---------------------------------------------------------------

    /// <summary>A Plex item as a vault-shaped record the reader can turn into a row.</summary>
    public static JsonObject PlexRecord(PlexLibraryItem item)
    {
        var progress = PlexProgress(item);
        return new JsonObject
        {
            ["id"] = $"plex:{item.RatingKey}", ["plexRatingKey"] = item.RatingKey, ["title"] = item.Title,
            ["year"] = item.Year, ["overview"] = item.Summary, ["poster"] = item.Thumb, ["backdrop"] = item.Art,
            ["rating"] = item.Rating, ["genre"] = item.Genres,
            ["status"] = item.ViewCount > 0 ? "Watched" : progress > 0 ? $"{progress:0}% watched" : "Unwatched",
            ["plexType"] = item.Type
        };
    }

    private static double PlexProgress(PlexLibraryItem item) => item.Duration > 0 ? Math.Clamp(item.ViewOffset * 100d / item.Duration, 0, 100) : 0;

    /// <summary>
    /// Records Plex progress in the library: finished items go to Watched,
    /// in-progress ones to Watching. An episode counts for its show, so a series
    /// in progress on Plex appears under TV Shows → Watching.
    /// </summary>
    public async Task SyncPlexAsync(IEnumerable<PlexLibraryItem> items)
    {
        // One vault write for the whole scan rather than one per title.
        await vault.BulkAsync(async () =>
        {
            foreach (var item in items)
            {
                var isTv = item.Type is "show" or "season" or "episode";
                var mediaType = isTv ? "TV Show" : "Movie";
                var key = isTv && item.ShowKey.Length > 0 ? item.ShowKey : item.RatingKey;
                var record = new JsonObject
                {
                    ["id"] = $"plex:{key}", ["plexRatingKey"] = key,
                    ["title"] = isTv && item.ShowTitle.Length > 0 ? item.ShowTitle : item.Title, ["year"] = item.Year,
                    ["poster"] = isTv && item.ShowThumb.Length > 0 ? item.ShowThumb : item.Thumb, ["backdrop"] = item.Art,
                    ["rating"] = item.Rating, ["genre"] = item.Genres, ["plexType"] = isTv ? "show" : "movie"
                };
                var progress = PlexProgress(item);
                if (item.ViewCount > 0) await RecordPlexStateAsync(record, mediaType, watched: true, "Watched");
                else if (progress >= 5) await RecordPlexStateAsync(record, mediaType, watched: false, $"{progress:0}% watched on Plex");
            }
        });
    }

    /// <summary>Mirrors a watched or unwatched change made in Plex into the personal lists.</summary>
    public Task SetPlexWatchedAsync(LibraryRow row, bool watched)
    {
        var record = Json.Clone(row.Source);
        record["key"] = $"plex:{Json.Text(row.Source, "plexRatingKey")}";
        return vault.BulkAsync(() => RecordPlexStateAsync(record, row.MediaType, watched, watched ? "Watched" : "Watching", replace: true));
    }

    private async Task RecordPlexStateAsync(JsonObject source, string mediaType, bool watched, string status, bool replace = false)
    {
        var watchedList = FinishedFor(mediaType);
        var watchingList = WatchingFor(mediaType);
        var name = Json.Text(source, "title", "name");
        var year = Json.Text(source, "year");
        bool Has(string collection) => vault.Collection(collection).OfType<JsonObject>().Any(item => LibraryReader.SameTitleAndYear(item, name, year));

        // An in-progress title never overrides one already marked watched.
        if (!watched && !replace && Has(watchedList)) return;
        var destination = watched ? watchedList : watchingList;
        if (!Has(destination))
        {
            var clone = Json.Clone(source);
            clone["status"] = status;
            clone["plexSyncedAt"] = Now;
            await vault.AddAsync(destination, clone);
        }
        if (watched || replace) await RemoveMatchingTitleAsync(watched ? watchingList : watchedList, name, year);
        await RemoveMatchingTitleAsync(WatchlistFor(mediaType), name, year);
    }

    private async Task RemoveMatchingTitleAsync(string collection, string title, string year)
    {
        var item = vault.Collection(collection).OfType<JsonObject>().FirstOrDefault(node => LibraryReader.SameTitleAndYear(node, title, year));
        if (item is null) return;
        var id = Json.Text(item, "id", "canonicalId", "tmdbId", "key");
        if (id.Length > 0) await vault.RemoveAsync(collection, id);
    }

    // ---- Downloads ----------------------------------------------------------

    public Task RecordTorrentHistoryAsync(TorrentRow row, string outcome, bool filesDeleted) => vault.AddAsync("biglyHistory", new JsonObject
    {
        ["id"] = $"native:{row.Hash}:{Now}", ["hash"] = row.Hash, ["name"] = row.Name,
        ["outcome"] = outcome, ["progress"] = row.Progress, ["downloaded"] = row.Downloaded, ["total"] = row.TotalSize,
        ["filesDeleted"] = filesDeleted, ["at"] = Now
    });

    public bool TorrentAlreadyRecordedComplete(string hash) => vault.Collection("biglyHistory").OfType<JsonObject>()
        .Any(item => Json.Text(item, "hash") == hash && Json.Text(item, "outcome").StartsWith("Completed", StringComparison.OrdinalIgnoreCase));
}
