using SinuGameVault.Services;
using System.Text.Json.Nodes;

var temp = Path.Combine(Path.GetTempPath(), "gamevault-native-smoke-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temp);
try
{
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

    Console.WriteLine("Checking corrupt-vault recovery...");
    var corruptStore = Path.Combine(temp, "corrupt-store");
    Directory.CreateDirectory(corruptStore);
    var corruptPath = Path.Combine(corruptStore, "vault.json");
    await File.WriteAllTextAsync(corruptPath, "{not valid json");
    var corruptRepository = new VaultRepository(corruptStore);
    await corruptRepository.LoadAsync();
    Assert(corruptRepository.LoadWarning.Length > 0, "corrupt vault warning is visible");
    Assert(Directory.GetFiles(Path.Combine(corruptStore, "Recovery"), "unreadable-*.json").Length == 1, "corrupt vault is preserved");
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
