using System.Text.Json;
using System.Text.Json.Nodes;
using System.IO;

namespace SinuGameVault.Services;

public sealed class VaultRepository
{
    public const int CurrentSchema = 13;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _folder;
    private readonly string _vaultPath;
    private readonly string _recoveryFolder;

    public JsonObject Root { get; private set; } = NewVault();
    public string VaultPath => _vaultPath;
    public string StorageFolder => _folder;
    public string RecoveryFolder => _recoveryFolder;
    public long UpdatedAt => Root["updatedAt"]?.GetValue<long?>() ?? 0;
    public event EventHandler? Saved;

    public VaultRepository(string? storageFolder = null)
    {
        _folder = storageFolder ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SinuGameVault");
        _vaultPath = Path.Combine(_folder, "vault.json");
        _recoveryFolder = Path.Combine(_folder, "Recovery");
        Directory.CreateDirectory(_folder);
        Directory.CreateDirectory(_recoveryFolder);
    }

    public async Task LoadAsync()
    {
        if (!File.Exists(_vaultPath))
        {
            Root = NewVault();
            await SaveAsync(createRecovery: false);
            return;
        }

        try
        {
            var parsed = JsonNode.Parse(await File.ReadAllTextAsync(_vaultPath)) as JsonObject;
            Root = Normalize(parsed ?? NewVault());
        }
        catch
        {
            var broken = Path.Combine(_recoveryFolder, $"unreadable-{DateTime.Now:yyyyMMdd-HHmmss}.json");
            File.Copy(_vaultPath, broken, overwrite: true);
            Root = NewVault();
        }
    }

    public async Task ImportAsync(string path)
    {
        await ImportJsonAsync(await File.ReadAllTextAsync(path));
    }

    public async Task ImportJsonAsync(string json)
    {
        var parsed = JsonNode.Parse(json) as JsonObject
                     ?? throw new InvalidDataException("The selected data is not a GameVault JSON backup.");
        Validate(parsed);
        await SaveRecoveryAsync("before-import");
        Root = Normalize(parsed);
        RecordActivity("Backup restored", "Imported a GameVault backup", "system");
        await SaveAsync(createRecovery: false);
    }

    public async Task ExportAsync(string path)
    {
        await File.WriteAllTextAsync(path, Root.ToJsonString(JsonOptions));
    }

    public string ExportJson() => Root.ToJsonString(JsonOptions);

    public int UserItemCount()
    {
        string[] collections = ["rentals", "subscriptionGames", "playing", "queue", "played", "rentalHistory",
            "movieWatchlist", "watchingMovies", "watchedMovies", "seriesWatchlist", "watchingSeries", "watchedSeries"];
        return collections.Sum(name => Collection(name).Count);
    }

    public JsonArray Collection(string name)
    {
        if (Root[name] is not JsonArray array)
        {
            array = new JsonArray();
            Root[name] = array;
        }
        return array;
    }

    public async Task AddAsync(string collection, JsonObject item)
    {
        item["id"] ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        if (!AllowsDuplicates(collection) && Find(collection, item) is not null) return;
        Collection(collection).Insert(0, item);
        RecordActivity("Added", DisplayName(item), collection);
        Touch();
        await SaveAsync();
    }

    public async Task UpdateAsync(string collection, JsonObject item)
    {
        item["id"] ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var list = Collection(collection);
        var existing = Find(collection, item, identityOnly: AllowsDuplicates(collection));
        if (existing is null) list.Insert(0, item);
        else
        {
            var index = list.IndexOf(existing);
            list[index] = item;
        }
        RecordActivity("Updated", DisplayName(item), collection);
        Touch();
        await SaveAsync();
    }

    public async Task MoveAsync(string source, string destination, JsonObject item)
    {
        var sourceList = Collection(source);
        var existing = Find(source, item);
        if (existing is not null) sourceList.Remove(existing);
        if (AllowsDuplicates(destination) || Find(destination, item) is null) Collection(destination).Insert(0, item);
        RecordActivity("Status changed", $"{DisplayName(item)} · {Friendly(source)} → {Friendly(destination)}", destination);
        Touch();
        await SaveAsync();
    }

    public async Task SetRootValueAsync(string key, JsonNode? value)
    {
        Root[key] = value;
        Touch();
        await SaveAsync();
    }

    public async Task MarkViewedAsync(JsonObject item, string mediaType, string collection)
    {
        var recent = Collection("recentViewed");
        var title = DisplayName(item);
        foreach (var existing in recent.OfType<JsonObject>().Where(existing => string.Equals(DisplayName(existing), title, StringComparison.OrdinalIgnoreCase)).ToList()) recent.Remove(existing);
        var copy = item.DeepClone() as JsonObject ?? [];
        copy["mediaType"] = mediaType; copy["sourceCollection"] = collection; copy["viewedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        recent.Insert(0, copy);
        while (recent.Count > 30) recent.RemoveAt(recent.Count - 1);
        Touch();
        await SaveAsync(createRecovery: false);
    }

    public async Task RemoveAsync(string collection, string id)
    {
        var list = Collection(collection);
        var match = list.FirstOrDefault(node => RecordKeys(node).Any(key => string.Equals(key, id, StringComparison.OrdinalIgnoreCase)));
        if (match is not null)
        {
            RecordActivity("Removed", DisplayName(match), collection);
            list.Remove(match);
        }
        Touch();
        await SaveAsync();
    }

    private JsonNode? Find(string collection, JsonObject item, bool identityOnly = false)
    {
        var id = NodeText(item, "id");
        if (id.Length > 0)
        {
            var exact = Collection(collection).FirstOrDefault(node => string.Equals(NodeText(node, "id"), id, StringComparison.OrdinalIgnoreCase));
            if (exact is not null || identityOnly) return exact;
        }
        var keys = RecordKeys(item).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var title = NodeText(item, "name");
        if (title.Length == 0) title = NodeText(item, "title");
        return Collection(collection).FirstOrDefault(node =>
            RecordKeys(node).Any(keys.Contains)
            || (!string.IsNullOrWhiteSpace(title)
                && string.Equals(NodeText(node, "name").Length > 0 ? NodeText(node, "name") : NodeText(node, "title"), title, StringComparison.OrdinalIgnoreCase)));
    }

    private static bool AllowsDuplicates(string collection) => collection is "rentalHistory" or "biglyHistory";

    public async Task SaveAsync(bool createRecovery = true)
    {
        if (createRecovery && File.Exists(_vaultPath)) await SaveRecoveryAsync("autosave");
        var temporary = _vaultPath + ".tmp";
        await File.WriteAllTextAsync(temporary, Root.ToJsonString(JsonOptions));
        File.Move(temporary, _vaultPath, overwrite: true);
        TrimRecovery();
        Saved?.Invoke(this, EventArgs.Empty);
    }

    private void Touch()
    {
        Root["version"] = CurrentSchema;
        Root["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        Root["revision"] = (Root["revision"]?.GetValue<long?>() ?? 0) + 1;
    }

    private async Task SaveRecoveryAsync(string reason)
    {
        if (!File.Exists(_vaultPath)) return;
        var target = Path.Combine(_recoveryFolder, $"{DateTime.Now:yyyyMMdd-HHmmss-fff}-{reason}.json");
        await using var source = File.OpenRead(_vaultPath);
        await using var destination = File.Create(target);
        await source.CopyToAsync(destination);
    }

    private void TrimRecovery()
    {
        foreach (var old in new DirectoryInfo(_recoveryFolder).GetFiles("*.json").OrderByDescending(x => x.CreationTimeUtc).Skip(20))
            old.Delete();
    }

    public IReadOnlyList<RecoverySnapshot> RecoverySnapshots() => new DirectoryInfo(_recoveryFolder)
        .GetFiles("*.json").OrderByDescending(file => file.LastWriteTimeUtc)
        .Select(file => new RecoverySnapshot(file.FullName, file.Name, file.Length, file.LastWriteTime)).ToList();

    public async Task CreateSnapshotAsync(string reason = "manual") => await SaveRecoveryAsync(reason);

    public async Task RestoreSnapshotAsync(string path)
    {
        if (!Path.GetFullPath(path).StartsWith(Path.GetFullPath(_recoveryFolder), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only GameVault recovery snapshots can be restored here.");
        await ImportJsonAsync(await File.ReadAllTextAsync(path));
    }

    public JsonArray RecentActivity(int count = 50) => new(Collection("activity").OfType<JsonObject>()
        .OrderByDescending(item => item["at"]?.GetValue<long?>() ?? 0).Take(count)
        .Select(item => (JsonNode)item.DeepClone()).ToArray());

    private void RecordActivity(string action, string detail, string collection)
    {
        var activity = Collection("activity");
        activity.Insert(0, new JsonObject
        {
            ["id"] = Guid.NewGuid().ToString("N"), ["action"] = action, ["detail"] = detail,
            ["collection"] = collection, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
        while (activity.Count > 250) activity.RemoveAt(activity.Count - 1);
    }

    private static JsonObject Normalize(JsonObject root)
    {
        string[] arrays = ["rentals", "subscriptions", "subscriptionGames", "playing", "queue", "upcoming", "upcomingRemoved", "catalogExtra", "played", "hiddenGames", "rentalHistory",
            "movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies", "seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries", "biglyHistory", "activity", "recentViewed"];
        foreach (var name in arrays) if (root[name] is not JsonArray) root[name] = new JsonArray();
        foreach (var name in arrays.Where(name => !AllowsDuplicates(name)))
        {
            var source = (JsonArray)root[name]!;
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var unique = new JsonArray();
            foreach (var node in source)
            {
                if (node is not JsonObject item) continue;
                var identity = RecordKeys(item).FirstOrDefault();
                if (string.IsNullOrWhiteSpace(identity))
                {
                    var title = NodeText(item, "name"); if (title.Length == 0) title = NodeText(item, "title");
                    if (name == "subscriptions" && title.Length == 0) title = NodeText(item, "service");
                    identity = "title:" + new string(title.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
                }
                if (identity == "title:" || !seen.Add(identity)) continue;
                unique.Add(item.DeepClone());
            }
            root[name] = unique;
        }
        root["version"] = CurrentSchema;
        root["revision"] ??= 0;
        root["updatedAt"] ??= 0;
        return root;
    }

    private static void Validate(JsonObject root)
    {
        var recognized = new[] { "rentals", "played", "queue", "playing", "movieWatchlist", "seriesWatchlist", "subscriptions" };
        if (!recognized.Any(root.ContainsKey))
            throw new InvalidDataException("This JSON file does not contain a recognized GameVault library.");
    }

    private static JsonObject NewVault() => Normalize(new JsonObject());
    private static string DisplayName(JsonNode? item) => NodeText(item, "name") is { Length: > 0 } name ? name : NodeText(item, "title") is { Length: > 0 } title ? title : "Library item";
    private static string Friendly(string value) => value switch
    {
        "playing" => "Now Playing", "played" => "Completed", "movieWatchlist" or "seriesWatchlist" => "Watchlist",
        "watchingMovies" or "watchingSeries" => "Watching", "watchedMovies" or "watchedSeries" => "Watched",
        "hiddenMovies" or "hiddenSeries" => "Not Interested", _ => value
    };
    public static string NodeText(JsonNode? node, string key) => (node as JsonObject)?[key]?.ToString() ?? "";
    private static IEnumerable<string> RecordKeys(JsonNode? node)
    {
        foreach (var key in new[] { "id", "key", "canonicalId", "rawgId", "tmdbId", "plexRatingKey" })
        {
            var value = NodeText(node, key);
            if (!string.IsNullOrWhiteSpace(value)) yield return value;
        }
    }
}

public sealed record RecoverySnapshot(string Path, string Name, long SizeBytes, DateTime ModifiedAt);
