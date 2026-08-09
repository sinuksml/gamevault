using SinuGameVault.Services;
using System.Text.Json.Nodes;

var temp = Path.Combine(Path.GetTempPath(), "gamevault-native-smoke-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temp);
// These checks load deliberately damaged vaults. Keep that noise out of the real
// diagnostics log, where it reads as the application corrupting live data.
DiagnosticsService.UseFolder(Path.Combine(temp, "Diagnostics"));
try
{
    var contractFixture = Path.Combine(AppContext.BaseDirectory, "Fixtures", "vault-v14.json");
    Assert(File.Exists(contractFixture), "shared vault contract fixture is packaged for compatibility tests");
    var contractRepository = new VaultRepository(Path.Combine(temp, "contract-store"));
    await contractRepository.LoadAsync();
    await contractRepository.ImportAsync(contractFixture);
    Assert(contractRepository.Root["version"]?.GetValue<int>() == VaultRepository.CurrentSchema, "shared contract schema matches Windows");
    Assert(contractRepository.Root["futureClientField"]?["mustSurvive"]?.GetValue<bool>() == true, "shared fixture future fields survive Windows import");

    var source = Path.Combine(temp, "source.json");
    var export = Path.Combine(temp, "export.json");
    await File.WriteAllTextAsync(source, """
    {
      "version": 7,
      "revision": 4,
      "rentals": [{"canonicalId":"game:title:test game|","name":"Test Game","vendor":"The Game Hub","returnDate":"2026-08-10","cost":500}],
      "played": [],
      "queue": [],
      "playing": [],
      "movieWatchlist": [{"id":"movie-1","title":"Test Movie","year":2026}],
      "seriesWatchlist": [],
      "subscriptions": [],
      "webOnlyFutureField": {"mustSurvive": true}
    }
    """);

    var repository = new VaultRepository(Path.Combine(temp, "store"));
    await repository.LoadAsync();
    await repository.ImportAsync(source);
    Assert(repository.Root["version"]?.GetValue<int>() == VaultRepository.CurrentSchema, "schema migration");
    Assert(repository.Collection("rentals").Count == 1, "rental import");
    Assert(repository.Root["webOnlyFutureField"]?["mustSurvive"]?.GetValue<bool>() == true, "unknown field preservation");

    await repository.AddAsync("playing", new JsonObject { ["id"] = "new-game", ["name"] = "Native Game", ["platform"] = "PC" });
    Assert(repository.Collection("playing").Count == 1, "native add");
    await repository.AddAsync("playing", new JsonObject { ["id"] = "duplicate-game", ["name"] = "Native Game", ["platform"] = "PC" });
    Assert(repository.Collection("playing").Count == 1, "same-tab duplicate prevention");
    await repository.AddAsync("playing", new JsonObject { ["id"] = "new-game-2027", ["name"] = "Native Game", ["year"] = "2027", ["platform"] = "PC" });
    Assert(repository.Collection("playing").Count == 2, "same title in a different year remains distinct");
    await repository.RemoveAsync("playing", "new-game-2027");
    var edited = repository.Collection("playing")[0]!.DeepClone() as JsonObject ?? [];
    edited["status"] = "Resume Later";
    await repository.UpdateAsync("playing", edited);
    Assert(repository.Collection("playing")[0]?["status"]?.ToString() == "Resume Later", "full record editing");
    var attachedEdit = repository.Collection("playing")[0] as JsonObject ?? throw new InvalidOperationException("missing attached edit record");
    attachedEdit["note"] = "enriched metadata";
    await repository.UpdateAsync("playing", attachedEdit);
    Assert(repository.Collection("playing")[0]?["note"]?.ToString() == "enriched metadata", "attached records are cloned before replacement");
    var revisionBeforeBrowsing = repository.Root["revision"]?.GetValue<long>() ?? 0;
    var updatedBeforeBrowsing = repository.Root["updatedAt"]?.GetValue<long>() ?? 0;
    await repository.MarkViewedAsync(edited, "Game", "playing");
    Assert(repository.Collection("recentViewed").Count == 1, "recently viewed tracking");
    Assert((repository.Root["revision"]?.GetValue<long>() ?? 0) == revisionBeforeBrowsing, "browsing does not advance cloud revision");
    Assert((repository.Root["updatedAt"]?.GetValue<long>() ?? 0) == updatedBeforeBrowsing, "browsing does not advance cloud timestamp");
    await repository.SetCacheValueAsync("smokeCatalog", new JsonArray(new JsonObject { ["title"] = "Cached" }));
    Assert((repository.Root["revision"]?.GetValue<long>() ?? 0) == revisionBeforeBrowsing, "catalog cache does not advance cloud revision");
    var attachedSubscriptions = repository.Root["subscriptions"];
    await repository.SetRootValueAsync("subscriptions", attachedSubscriptions);
    Assert(repository.Root["subscriptions"] is JsonArray, "attached JSON values are cloned before assignment");
    await repository.AddAsync("rentalHistory", new JsonObject { ["id"] = "period-1", ["name"] = "Repeat Rental", ["start"] = "2026-01-01" });
    await repository.AddAsync("rentalHistory", new JsonObject { ["id"] = "period-2", ["name"] = "Repeat Rental", ["start"] = "2026-02-01" });
    Assert(repository.Collection("rentalHistory").Count == 2, "separate repeated rental periods");
    await repository.MoveAsync("playing", "played", edited);
    Assert(repository.Collection("playing").Count == 0 && repository.Collection("played").Count == 1, "status move");
    Assert(repository.Collection("deletions").OfType<JsonObject>().Any(item => item["collection"]?.ToString() == "playing"), "status move records cloud tombstone");
    await repository.RemoveAsync("rentals", "game:title:test game|");
    Assert(repository.Collection("rentals").Count == 0, "legacy canonical-id removal");
    Assert(repository.Collection("deletions").OfType<JsonObject>().Any(item => item["collection"]?.ToString() == "rentals"), "removal records cloud tombstone");

    await repository.CreateSnapshotAsync("smoke");
    var snapshot = repository.RecoverySnapshots().First(item => item.Name.Contains("smoke", StringComparison.OrdinalIgnoreCase));
    await repository.AddAsync("queue", new JsonObject { ["id"] = "temporary", ["name"] = "Temporary Game" });
    Assert(repository.Collection("queue").Count == 1, "pre-restore mutation");
    await repository.RestoreSnapshotAsync(snapshot.Path);
    Assert(repository.Collection("queue").Count == 0, "manual snapshot restore");
    Assert(repository.RecentActivity().Count > 0, "activity history");

    await repository.ExportAsync(export);
    var roundTrip = JsonNode.Parse(await File.ReadAllTextAsync(export)) as JsonObject;
    Assert(roundTrip?["webOnlyFutureField"]?["mustSurvive"]?.GetValue<bool>() == true, "round-trip preservation");
    Assert(Directory.GetFiles(Path.Combine(temp, "store", "Recovery"), "*.json").Length > 0, "recovery snapshots");

    Console.WriteLine("Checking concurrent writes...");
    var concurrent = Enumerable.Range(0, 12).Select(index => repository.AddAsync("queue", new JsonObject
    {
        ["id"] = $"concurrent-{index}", ["name"] = $"Concurrent {index}"
    }));
    await Task.WhenAll(concurrent);
    Console.WriteLine("Concurrent writes complete.");
    Assert(repository.Collection("queue").Count == 12, "concurrent writes are serialized");

    /* A new vault stores "revision": 0 as an Int32, and reading it back with
       GetValue<long?>() threw — so the first edit after a fresh install failed
       instead of saving. Numbers must be read whatever their stored width. */
    Console.WriteLine("Checking fresh-vault edits...");
    var freshStore = Path.Combine(temp, "fresh-store");
    var fresh = new VaultRepository(freshStore);
    await fresh.LoadAsync();
    await fresh.AddAsync("playing", new JsonObject { ["id"] = "first", ["name"] = "First Ever Game" });
    Assert(fresh.Collection("playing").Count == 1, "the first edit on a brand new vault succeeds");
    Assert(VaultRepository.Number(fresh.Root["revision"]) == 1, "revision advances on a brand new vault");
    Assert(VaultRepository.Number(new JsonObject { ["n"] = 5 }["n"]) == 5, "an Int32 number reads back cleanly");
    Assert(VaultRepository.Number(new JsonObject { ["n"] = 5L }["n"]) == 5, "an Int64 number reads back cleanly");

    Console.WriteLine("Checking corrupt-vault recovery...");
    var corruptStore = Path.Combine(temp, "corrupt-store");
    Directory.CreateDirectory(corruptStore);
    var corruptPath = Path.Combine(corruptStore, "vault.json");
    await File.WriteAllTextAsync(corruptPath, "{not valid json");
    var corruptRepository = new VaultRepository(corruptStore);
    await corruptRepository.LoadAsync();
    Assert(corruptRepository.LoadWarning.Length > 0, "corrupt vault warning is visible");
    Assert(Directory.GetFiles(Path.Combine(corruptStore, "Recovery"), "unreadable-*.json").Length == 1, "corrupt vault is preserved");

    /* A damaged vault used to reset the library to empty, which then let the next
       Drive sync adopt the remote copy and drop anything saved locally since the
       last upload. It must rebuild from the newest snapshot instead. */
    var rescueStore = Path.Combine(temp, "rescue-store");
    var rescue = new VaultRepository(rescueStore);
    await rescue.LoadAsync();
    await rescue.AddAsync("playing", new JsonObject { ["id"] = "rescue-1", ["name"] = "Rescued Game" });
    await rescue.CreateSnapshotAsync("test");
    await File.WriteAllTextAsync(Path.Combine(rescueStore, "vault.json"), "{n");
    var rescued = new VaultRepository(rescueStore);
    await rescued.LoadAsync();
    Assert(rescued.Collection("playing").Count == 1, "a damaged vault is rebuilt from the newest snapshot, not emptied");
    Assert(rescued.Collection("playing")[0]?["name"]?.ToString() == "Rescued Game", "the rebuilt vault keeps its records");

    // The forensic copy must survive later saves; trimming used to delete it.
    var damagedBefore = Directory.GetFiles(Path.Combine(rescueStore, "Recovery"), "unreadable-*.json").Length;
    Assert(damagedBefore == 1, "the damaged vault is preserved for inspection");
    for (var i = 0; i < 8; i++) await rescued.AddAsync("playing", new JsonObject { ["id"] = $"fill-{i}", ["name"] = $"Fill {i}" });
    Assert(Directory.GetFiles(Path.Combine(rescueStore, "Recovery"), "unreadable-*.json").Length == damagedBefore,
        "trimming recovery snapshots does not delete the damaged-vault copies");

    // A batch writes once at the end rather than once per record.
    var bulkStore = Path.Combine(temp, "bulk-store");
    var bulk = new VaultRepository(bulkStore);
    await bulk.LoadAsync();
    var writes = 0;
    bulk.Saved += (_, _) => writes++;
    await bulk.BulkAsync(async () =>
    {
        for (var i = 0; i < 25; i++) await bulk.AddAsync("playing", new JsonObject { ["id"] = $"bulk-{i}", ["name"] = $"Bulk {i}" });
    });
    Assert(bulk.Collection("playing").Count == 25, "a batch still records every item");
    Assert(writes == 1, "a batch of 25 records writes the vault once, not 25 times");
    Console.WriteLine("Checking record identity...");
    // Identity used to be three disagreeing implementations. These pin the contract.
    var imdbOnly = new JsonObject { ["id"] = "local-1", ["imdbId"] = "tt1234567", ["title"] = "Identity Movie", ["year"] = "2026" };
    Assert(VaultIdentity.For(imdbOnly) == "imdbId:tt1234567", "imdbId is a first-class identity");
    Assert(VaultIdentity.Candidates(imdbOnly).Contains("id:local-1"), "every identifier is offered as a candidate");
    var titleOnly = new JsonObject { ["title"] = "Title Only", ["year"] = "2026" };
    Assert(VaultIdentity.For(titleOnly).StartsWith("title:", StringComparison.Ordinal)
        && !VaultIdentity.For(titleOnly).StartsWith("title:title:", StringComparison.Ordinal), "title identity is not double-prefixed");
    Assert(VaultIdentity.Matches(imdbOnly, new JsonObject { ["imdbId"] = "tt1234567" }), "records match on any shared identifier");
    Assert(!VaultIdentity.Matches(imdbOnly, new JsonObject { ["imdbId"] = "tt7654321" }), "different identifiers do not match");

    Console.WriteLine("Checking Drive merge...");
    // A delete recorded against the IMDb id must survive a merge with a copy of the
    // same title that also carries a TMDB id. This is the case that silently failed.
    var localVault = new JsonObject
    {
        ["updatedAt"] = 200,
        ["movieWatchlist"] = new JsonArray(),
        ["deletions"] = new JsonArray(new JsonObject
        {
            ["collection"] = "movieWatchlist", ["identity"] = "imdbId:tt1234567", ["at"] = 190
        })
    };
    var remoteVault = new JsonObject
    {
        ["updatedAt"] = 100,
        ["movieWatchlist"] = new JsonArray(new JsonObject
        {
            ["id"] = "remote-1", ["imdbId"] = "tt1234567", ["tmdbId"] = "555", ["title"] = "Identity Movie", ["year"] = "2026"
        })
    };
    var mergedVault = DriveService.MergeVaults(localVault, remoteVault, preferRemote: false);
    Assert((mergedVault["movieWatchlist"] as JsonArray)?.Count == 0, "deletion recorded by imdbId removes the remote copy");

    // The same title keyed differently on each device must not duplicate.
    var deviceA = new JsonObject
    {
        ["updatedAt"] = 200,
        ["queue"] = new JsonArray(new JsonObject { ["rawgId"] = "9001", ["imdbId"] = "tt222", ["name"] = "Shared Game" })
    };
    var deviceB = new JsonObject
    {
        ["updatedAt"] = 100,
        ["queue"] = new JsonArray(new JsonObject { ["imdbId"] = "tt222", ["name"] = "Shared Game" })
    };
    var mergedDevices = DriveService.MergeVaults(deviceA, deviceB, preferRemote: false);
    Assert((mergedDevices["queue"] as JsonArray)?.Count == 1, "one title keyed two ways merges into a single record");

    // Genuinely different titles must still both survive.
    var distinctA = new JsonObject { ["updatedAt"] = 2, ["queue"] = new JsonArray(new JsonObject { ["id"] = "a", ["name"] = "Game A" }) };
    var distinctB = new JsonObject { ["updatedAt"] = 1, ["queue"] = new JsonArray(new JsonObject { ["id"] = "b", ["name"] = "Game B" }) };
    Assert((DriveService.MergeVaults(distinctA, distinctB, preferRemote: false)["queue"] as JsonArray)?.Count == 2, "distinct titles both survive a merge");

    // Not-interested must continue to win over an active list.
    var hiddenLocal = new JsonObject
    {
        ["updatedAt"] = 2,
        ["hiddenMovies"] = new JsonArray(new JsonObject { ["tmdbId"] = "77", ["title"] = "Hidden Film" }),
        ["movieWatchlist"] = new JsonArray()
    };
    var hiddenRemote = new JsonObject
    {
        ["updatedAt"] = 1,
        ["movieWatchlist"] = new JsonArray(new JsonObject { ["tmdbId"] = "77", ["title"] = "Hidden Film" })
    };
    Assert((DriveService.MergeVaults(hiddenLocal, hiddenRemote, preferRemote: false)["movieWatchlist"] as JsonArray)?.Count == 0,
        "not-interested still wins over the watchlist");

    // Web-only fields must survive even when the local side wins the merge,
    // otherwise a Windows sync uploads a vault with the web's data erased.
    var webLocal = new JsonObject { ["updatedAt"] = 2, ["queue"] = new JsonArray() };
    var webRemote = new JsonObject { ["updatedAt"] = 1, ["queue"] = new JsonArray(), ["webOnlyFutureField"] = new JsonObject { ["mustSurvive"] = true } };
    Assert(DriveService.MergeVaults(webLocal, webRemote, preferRemote: false)["webOnlyFutureField"]?["mustSurvive"]?.GetValue<bool>() == true,
        "web-only fields survive a locally-preferred Drive merge");

    /* Finance and health are only ever edited on the web, so the desktop copy is
       just the last download. Keeping the local copy when both sides had one threw
       away newer edits made on the phone. */
    var staleLocal = new JsonObject
    {
        ["updatedAt"] = 900, ["queue"] = new JsonArray(),
        ["finance"] = new JsonObject { ["balance"] = 100 },
        ["nativeTvCatalog"] = new JsonObject { ["owner"] = "desktop" }
    };
    var freshRemote = new JsonObject
    {
        ["updatedAt"] = 100, ["queue"] = new JsonArray(),
        ["finance"] = new JsonObject { ["balance"] = 250 },
        ["nativeTvCatalog"] = new JsonObject { ["owner"] = "stale-download" }
    };
    var ownership = DriveService.MergeVaults(staleLocal, freshRemote, preferRemote: false);
    Assert(VaultRepository.Number(ownership["finance"]?["balance"]) == 250,
        "web-owned data comes from the cloud copy even when the desktop vault is newer");
    Assert(ownership["nativeTvCatalog"]?["owner"]?.ToString() == "desktop",
        "the catalog cache the desktop app writes keeps its own copy");

    /* The web application records deletions in _sync.tombstones, not in the
       "deletions" list. Ignoring them meant a title deleted on the phone looked
       like a record the phone merely lacked, and the union handed it back. */
    var webDeleted = new JsonObject
    {
        ["updatedAt"] = 100, ["watchingMovies"] = new JsonArray(),
        ["_sync"] = new JsonObject
        {
            ["records"] = new JsonObject { ["watchingMovies"] = new JsonObject() },
            ["tombstones"] = new JsonObject { ["watchingMovies"] = new JsonObject { ["tmdb:555"] = 5000L } }
        }
    };
    var desktopStillHas = new JsonObject
    {
        ["updatedAt"] = 200,
        ["watchingMovies"] = new JsonArray(new JsonObject { ["tmdbId"] = "555", ["title"] = "Deleted On Phone" })
    };
    var afterWebDelete = DriveService.MergeVaults(desktopStillHas, webDeleted, preferRemote: false);
    Assert((afterWebDelete["watchingMovies"] as JsonArray)?.Count == 0,
        "a title deleted on the web stays deleted after a desktop merge");

    // A title saved again after the deletion is a genuine re-add and must survive.
    var readded = new JsonObject
    {
        ["updatedAt"] = 200,
        ["watchingMovies"] = new JsonArray(new JsonObject { ["tmdbId"] = "555", ["title"] = "Added Back" }),
        ["_sync"] = new JsonObject
        {
            ["records"] = new JsonObject { ["watchingMovies"] = new JsonObject { ["tmdb:555"] = 9000L } },
            ["tombstones"] = new JsonObject { ["watchingMovies"] = new JsonObject() }
        }
    };
    Assert((DriveService.MergeVaults(readded, webDeleted, preferRemote: false)["watchingMovies"] as JsonArray)?.Count == 1,
        "a title added back after a deletion is kept");

    /* A collection missing from the item count reads as an empty vault, and Drive
       sync adopts the cloud copy wholesale when the vault looks empty. */
    var petrolOnly = new VaultRepository(Path.Combine(temp, "petrol-only"));
    await petrolOnly.LoadAsync();
    await petrolOnly.AddAsync("petrol", new JsonObject { ["id"] = "p1", ["date"] = "2026-08-07" });
    Assert(petrolOnly.UserItemCount() == 1, "a vault holding only petrol refills does not read as empty");

    // The audit log has no record identity, so an earlier merge appended both
    // sides' entries on every sync and grew the vault to hundreds of megabytes.
    // A merge of two large audit logs must stay capped, not accumulate.
    static JsonArray BigAudit(int count, long baseAt)
    {
        var log = new JsonArray();
        for (var i = 0; i < count; i++)
            log.Add(new JsonObject { ["at"] = baseAt + i, ["action"] = "sync", ["detail"] = $"entry {baseAt + i}", ["device"] = "d" });
        return log;
    }
    var auditLocal = new JsonObject { ["updatedAt"] = 2, ["queue"] = new JsonArray(), ["audit"] = BigAudit(5000, 1_000_000) };
    var auditRemote = new JsonObject { ["updatedAt"] = 1, ["queue"] = new JsonArray(), ["audit"] = BigAudit(5000, 2_000_000) };
    var auditMerged = DriveService.MergeVaults(auditLocal, auditRemote, preferRemote: false)["audit"] as JsonArray;
    Assert(auditMerged is { Count: <= 200 }, "merging two large audit logs stays capped instead of accumulating");
    Assert(auditMerged?.OfType<JsonObject>().First()["at"]?.GetValue<long>() == 2_004_999, "the newest audit entry is the one kept");

    // Deletion tombstones were appended, not deduped, so the same marker piled up
    // thousands of times across merges. A merge must keep one marker per key.
    static JsonArray DupDeletions(int count, string collection, string identity, long baseAt)
    {
        var log = new JsonArray();
        for (var i = 0; i < count; i++)
            log.Add(new JsonObject { ["collection"] = collection, ["identity"] = identity, ["at"] = baseAt + i });
        return log;
    }
    var delLocal = new JsonObject { ["updatedAt"] = 2, ["queue"] = new JsonArray(), ["deletions"] = DupDeletions(500, "queue", "tmdb:99", 10) };
    var delRemote = new JsonObject { ["updatedAt"] = 1, ["queue"] = new JsonArray(), ["deletions"] = DupDeletions(500, "queue", "tmdb:99", 500) };
    var delMerged = DriveService.MergeVaults(delLocal, delRemote, preferRemote: false)["deletions"] as JsonArray;
    Assert(delMerged?.Count == 1, "duplicate deletion markers collapse to one per (collection, identity)");
    Assert(delMerged?.OfType<JsonObject>().First()["at"]?.GetValue<long>() == 999, "the newest deletion marker is the one kept");

    Console.WriteLine("Checking Wikipedia story cleanup...");
    // Plots saved by earlier versions carry the heading, [edit], citation markers
    // and the reference list. Only the prose should survive.
    var dirtyStory = "Premise\n\n[ edit ]\nSet after a flu pandemic, the film centers on Hig [ 1 ] and Bangley.\n\n^ Yang, Katrina (23 May 2025). \"Some Article\". Screen Rant. Retrieved 15 October 2025.";
    var cleanStory = CatalogService.CleanStoryText(dirtyStory);
    Assert(!cleanStory.Contains("Premise", StringComparison.OrdinalIgnoreCase), "section heading is removed from stored plots");
    Assert(!cleanStory.Contains("edit", StringComparison.OrdinalIgnoreCase), "edit affordance is removed");
    Assert(!cleanStory.Contains("[ 1 ]", StringComparison.Ordinal) && !cleanStory.Contains("[1]", StringComparison.Ordinal), "citation markers are removed");
    Assert(!cleanStory.Contains("Retrieved", StringComparison.OrdinalIgnoreCase), "reference list is removed");
    Assert(cleanStory.StartsWith("Set after a flu pandemic", StringComparison.Ordinal), "the plot prose itself survives");
    Assert(CatalogService.CleanStoryText("") == "" && CatalogService.CleanStoryText(null) == "", "empty story text stays empty");

    Console.WriteLine("GameVault native smoke checks passed");
}
finally
{
    Directory.Delete(temp, recursive: true);
}

static void Assert(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException("Smoke check failed: " + name);
}
