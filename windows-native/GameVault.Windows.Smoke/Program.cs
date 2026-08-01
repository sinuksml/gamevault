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
    var revisionBeforeBrowsing = repository.Root["revision"]?.GetValue<long>() ?? 0;
    var updatedBeforeBrowsing = repository.Root["updatedAt"]?.GetValue<long>() ?? 0;
    await repository.MarkViewedAsync(edited, "Game", "playing");
    Assert(repository.Collection("recentViewed").Count == 1, "recently viewed tracking");
    Assert((repository.Root["revision"]?.GetValue<long>() ?? 0) == revisionBeforeBrowsing, "browsing does not advance cloud revision");
    Assert((repository.Root["updatedAt"]?.GetValue<long>() ?? 0) == updatedBeforeBrowsing, "browsing does not advance cloud timestamp");
    await repository.SetCacheValueAsync("smokeCatalog", new JsonArray(new JsonObject { ["title"] = "Cached" }));
    Assert((repository.Root["revision"]?.GetValue<long>() ?? 0) == revisionBeforeBrowsing, "catalog cache does not advance cloud revision");
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
