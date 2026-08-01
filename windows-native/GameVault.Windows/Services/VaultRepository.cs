using System.Text.Json;
using System.Text.Json.Nodes;
using System.IO;

namespace SinuGameVault.Services;

public sealed class VaultRepository
{
    public const int CurrentSchema = 14;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _folder;
    private readonly string _vaultPath;
    private readonly string _recoveryFolder;
    private readonly SemaphoreSlim _ioGate = new(1, 1);
    private readonly SemaphoreSlim _mutationGate = new(1, 1);

    public JsonObject Root { get; private set; } = NewVault();
    public string VaultPath => _vaultPath;
    public string StorageFolder => _folder;
    public string RecoveryFolder => _recoveryFolder;
    public long UpdatedAt => Root["updatedAt"]?.GetValue<long?>() ?? 0;
    public string LoadWarning { get; private set; } = "";
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
        catch (Exception ex)
        {
            var broken = Path.Combine(_recoveryFolder, $"unreadable-{DateTime.Now:yyyyMMdd-HHmmss}.json");
            File.Copy(_vaultPath, broken, overwrite: true);
            Root = NewVault();
            LoadWarning = $"The local vault was unreadable and was preserved as {Path.GetFileName(broken)}. Restore it from Settings > Recovery after checking the file.";
            DiagnosticsService.Log("Vault", "Unreadable local vault preserved for recovery", ex);
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
        await MutateAsync(async () =>
        {
            await SaveRecoveryAsync("before-import");
            Root = Normalize(parsed);
            RecordActivity("Backup restored", "Imported a GameVault backup", "system");
            await SaveAsync(createRecovery: false);
        });
    }

    public async Task ExportAsync(string path)
    {
        await File.WriteAllTextAsync(path, Root.ToJsonString(JsonOptions));
    }

    public string ExportJson() => Root.ToJsonString(JsonOptions);

    public int UserItemCount()
    {
        string[] collections = ["rentals", "subscriptions", "subscriptionGames", "playing", "queue", "upcoming", "upcomingRemoved", "played", "hiddenGames", "rentalHistory",
            "movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies", "seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries", "biglyHistory"];
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
        await MutateAsync(async () =>
        {
            item["id"] ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
            if (!AllowsDuplicates(collection) && Find(collection, item) is not null) return;
            ClearDeletion(collection, item);
            Collection(collection).Insert(0, item);
            RecordActivity("Added", DisplayName(item), collection);
            Touch();
            await SaveAsync();
        });
    }

    public async Task UpdateAsync(string collection, JsonObject item)
    {
        await MutateAsync(async () =>
        {
            item["id"] ??= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
            var list = Collection(collection);
            var existing = Find(collection, item, identityOnly: AllowsDuplicates(collection));
            if (existing is null) list.Insert(0, item);
            else list[list.IndexOf(existing)] = item;
            RecordActivity("Updated", DisplayName(item), collection);
            Touch();
            await SaveAsync();
        });
    }

    public async Task MoveAsync(string source, string destination, JsonObject item)
    {
        await MutateAsync(async () =>
        {
            var sourceList = Collection(source);
            var existing = Find(source, item);
            if (existing is not null)
            {
                sourceList.Remove(existing);
                RecordDeletion(source, existing);
            }
            ClearDeletion(destination, item);
            if (AllowsDuplicates(destination) || Find(destination, item) is null)
                Collection(destination).Insert(0, item.DeepClone());
            RecordActivity("Status changed", $"{DisplayName(item)} · {Friendly(source)} → {Friendly(destination)}", destination);
            Touch();
            await SaveAsync();
        });
    }

    public async Task SetRootValueAsync(string key, JsonNode? value)
    {
        await MutateAsync(async () =>
        {
            Root[key] = value?.DeepClone();
            Touch();
            await SaveAsync();
        });
    }

    public async Task SetCacheValueAsync(string key, JsonNode? value)
    {
        await MutateAsync(async () =>
        {
            Root[key] = value?.DeepClone();
            await SaveAsync(createRecovery: false, notifySaved: false);
        });
    }

    public async Task MarkViewedAsync(JsonObject item, string mediaType, string collection)
    {
        await MutateAsync(async () =>
        {
            var recent = Collection("recentViewed");
            var title = DisplayName(item);
            foreach (var existing in recent.OfType<JsonObject>().Where(existing => string.Equals(DisplayName(existing), title, StringComparison.OrdinalIgnoreCase)).ToList()) recent.Remove(existing);
            var copy = item.DeepClone() as JsonObject ?? [];
            copy["mediaType"] = mediaType; copy["sourceCollection"] = collection; copy["viewedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            recent.Insert(0, copy);
            while (recent.Count > 30) recent.RemoveAt(recent.Count - 1);
            await SaveAsync(createRecovery: false, notifySaved: false);
        });
    }

    public async Task RemoveAsync(string collection, string id)
    {
        await MutateAsync(async () =>
        {
            var list = Collection(collection);
            var match = list.FirstOrDefault(node => string.Equals(NodeText(node, "id"), id, StringComparison.OrdinalIgnoreCase)
                || RecordKeys(node).Any(key => key.EndsWith(":" + id, StringComparison.OrdinalIgnoreCase)));
            if (match is null) return;
            RecordActivity("Removed", DisplayName(match), collection);
            list.Remove(match);
            RecordDeletion(collection, match);
            Touch();
            await SaveAsync();
        });
    }

    private void RecordDeletion(string collection, JsonNode item)
    {
        var identity = StableIdentity(item as JsonObject);
        if (identity.Length == 0) return;
        var deletions = Collection("deletions");
        foreach (var old in deletions.OfType<JsonObject>().Where(node => NodeText(node, "collection") == collection && NodeText(node, "identity") == identity).ToList()) deletions.Remove(old);
        deletions.Add(new JsonObject { ["collection"] = collection, ["identity"] = identity, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        while (deletions.Count > 1000) deletions.RemoveAt(0);
    }

    private void ClearDeletion(string collection, JsonObject item)
    {
        var identity = StableIdentity(item);
        var deletions = Collection("deletions");
        foreach (var old in deletions.OfType<JsonObject>().Where(node => NodeText(node, "collection") == collection && NodeText(node, "identity") == identity).ToList()) deletions.Remove(old);
    }

    private static string StableIdentity(JsonObject? item)
    {
        if (item is null) return "";
        foreach (var key in new[] { "canonicalId", "rawgId", "tmdbId", "imdbId", "plexRatingKey", "id" })
            if (NodeText(item, key) is { Length: > 0 } value) return key + ":" + value;
        return "title:" + FallbackIdentity(item, "");
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
        var fallback = FallbackIdentity(item, collection);
        return Collection(collection).FirstOrDefault(node =>
            RecordKeys(node).Any(keys.Contains)
            || (fallback.Length > 0 && string.Equals(FallbackIdentity(node as JsonObject, collection), fallback, StringComparison.OrdinalIgnoreCase)));
    }

    private static bool AllowsDuplicates(string collection) => collection is "rentalHistory" or "biglyHistory";

    private async Task MutateAsync(Func<Task> mutation)
    {
        await _mutationGate.WaitAsync();
        try { await mutation(); }
        finally { _mutationGate.Release(); }
    }

    public async Task SaveAsync(bool createRecovery = true, bool notifySaved = true)
    {
        await _ioGate.WaitAsync();
        try
        {
            if (createRecovery && File.Exists(_vaultPath)) await SaveRecoveryCoreAsync("autosave");
            var temporary = _vaultPath + $".{Environment.ProcessId}.tmp";
            var json = Root.ToJsonString(JsonOptions);
            await File.WriteAllTextAsync(temporary, json);
            File.Move(temporary, _vaultPath, overwrite: true);
            TrimRecovery();
        }
        finally { _ioGate.Release(); }
        if (notifySaved) Saved?.Invoke(this, EventArgs.Empty);
    }

    private void Touch()
    {
        Root["version"] = CurrentSchema;
        Root["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        Root["revision"] = (Root["revision"]?.GetValue<long?>() ?? 0) + 1;
    }

    private async Task SaveRecoveryAsync(string reason)
    {
        await _ioGate.WaitAsync();
        try { await SaveRecoveryCoreAsync(reason); }
        finally { _ioGate.Release(); }
    }

    private async Task SaveRecoveryCoreAsync(string reason)
    {
        if (!File.Exists(_vaultPath)) return;
        var target = Path.Combine(_recoveryFolder, $"{DateTime.Now:yyyyMMdd-HHmmss-fff}-{reason}.json");
        await using var source = new FileStream(_vaultPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        await using var destination = File.Create(target);
        await source.CopyToAsync(destination);
    }

    private void TrimRecovery()
    {
        foreach (var old in new DirectoryInfo(_recoveryFolder).GetFiles("*.json").OrderByDescending(x => x.CreationTimeUtc).Skip(60))
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
                    identity = FallbackIdentity(item, name);
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
        foreach (var key in new[] { "canonicalId", "rawgId", "tmdbId", "plexRatingKey", "key", "id" })
        {
            var value = NodeText(node, key);
            if (!string.IsNullOrWhiteSpace(value)) yield return key + ":" + value;
        }
    }

    private static string FallbackIdentity(JsonObject? item, string collection)
    {
        if (item is null) return "";
        var title = NodeText(item, "name");
        if (title.Length == 0) title = NodeText(item, "title");
        if (collection == "subscriptions" && title.Length == 0) title = NodeText(item, "service");
        var normalized = new string(title.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
        if (normalized.Length == 0) return "";
        var year = NodeText(item, "year");
        if (year.Length == 0 && DateTime.TryParse(NodeText(item, "date"), System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var date)) year = date.Year.ToString();
        var discriminator = NodeText(item, "mediaType");
        if (discriminator.Length == 0) discriminator = NodeText(item, "platform");
        if (discriminator.Length == 0) discriminator = NodeText(item, "provider");
        return $"title:{normalized}:{year}:{discriminator.ToLowerInvariant()}";
    }
}

public sealed record RecoverySnapshot(string Path, string Name, long SizeBytes, DateTime ModifiedAt);
