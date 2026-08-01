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
    var edited = repository.Collection("playing")[0]!.DeepClone() as JsonObject ?? [];
    edited["status"] = "Resume Later";
    await repository.UpdateAsync("playing", edited);
    Assert(repository.Collection("playing")[0]?["status"]?.ToString() == "Resume Later", "full record editing");
    await repository.MarkViewedAsync(edited, "Game", "playing");
    Assert(repository.Collection("recentViewed").Count == 1, "recently viewed tracking");
    await repository.AddAsync("rentalHistory", new JsonObject { ["id"] = "period-1", ["name"] = "Repeat Rental", ["start"] = "2026-01-01" });
    await repository.AddAsync("rentalHistory", new JsonObject { ["id"] = "period-2", ["name"] = "Repeat Rental", ["start"] = "2026-02-01" });
    Assert(repository.Collection("rentalHistory").Count == 2, "separate repeated rental periods");
    await repository.MoveAsync("playing", "played", edited);
    Assert(repository.Collection("playing").Count == 0 && repository.Collection("played").Count == 1, "status move");
    await repository.RemoveAsync("rentals", "game:title:test game|");
    Assert(repository.Collection("rentals").Count == 0, "legacy canonical-id removal");

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
