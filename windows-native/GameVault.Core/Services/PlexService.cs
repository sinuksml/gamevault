using System.Xml.Linq;
using System.Net.Http;
using System.Globalization;
using System.IO;

namespace SinuGameVault.Services;

public sealed record PlexLibraryItem(string RatingKey, string Title, string Type, string Year, string Summary, string Thumb, string Art,
    double Rating, long Duration, long ViewOffset, int ViewCount, string AddedAt, string Genres,
    // For a continue-watching episode these carry the show it belongs to, so an
    // in-progress episode can be recorded against the series, not the episode.
    string ShowTitle = "", string ShowThumb = "", string ShowKey = "");

public sealed class PlexService
{
    private const string UrlTarget = "SinuGameVault/Plex/Url";
    private const string TokenTarget = "SinuGameVault/Plex/Token";
    private const int PageSize = 200;
    private const int MaxPages = 100;
    private static readonly TimeSpan RequestGap = TimeSpan.FromMilliseconds(350);
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(30);
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly SemaphoreSlim _requestGate = new(1, 1);
    private DateTimeOffset _lastRequestAt = DateTimeOffset.MinValue;
    private readonly Dictionary<string, (DateTimeOffset At, IReadOnlyList<PlexLibraryItem> Items)> _cache = new(StringComparer.Ordinal);

    private readonly string _cachePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SinuGameVault", "plex-cache.json");

    public PlexService()
    {
        RemoveLegacyArtworkFolder();
        LoadCache();
    }

    /* The library cache used to live only in memory, so every launch re-walked
       every section on the server even though nothing had changed. Persisting it
       means a restart reuses the last result until it goes stale. */
    private void LoadCache()
    {
        try
        {
            if (!File.Exists(_cachePath)) return;
            var stored = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, CachedLibrary>>(File.ReadAllText(_cachePath));
            if (stored is null) return;
            lock (_cache)
                foreach (var entry in stored)
                    if (DateTimeOffset.UtcNow - entry.Value.At < CacheLifetime)
                        _cache[entry.Key] = (entry.Value.At, entry.Value.Items);
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Plex", "Could not read the cached library", ex);
        }
    }

    private void SaveCache()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_cachePath)!);
            Dictionary<string, CachedLibrary> snapshot;
            lock (_cache)
                snapshot = _cache.ToDictionary(entry => entry.Key, entry => new CachedLibrary(entry.Value.At, entry.Value.Items.ToList()));
            var temporary = _cachePath + ".tmp";
            File.WriteAllText(temporary, System.Text.Json.JsonSerializer.Serialize(snapshot));
            File.Move(temporary, _cachePath, overwrite: true);
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Plex", "Could not save the cached library", ex);
        }
    }

    private sealed record CachedLibrary(DateTimeOffset At, List<PlexLibraryItem> Items);

    /// <summary>
    /// Plex runs on the same box that transcodes, so every call is serialized with
    /// a minimum gap. Sections used to be fetched all at once with Task.WhenAll and
    /// no paging, which is the heaviest possible pattern against a home server.
    /// </summary>
    private async Task PaceAsync()
    {
        await _requestGate.WaitAsync();
        try
        {
            var wait = RequestGap - (DateTimeOffset.UtcNow - _lastRequestAt);
            if (wait > TimeSpan.Zero) await Task.Delay(wait);
            _lastRequestAt = DateTimeOffset.UtcNow;
        }
        finally { _requestGate.Release(); }
    }

    public void ClearCache()
    {
        lock (_cache) _cache.Clear();
        try { if (File.Exists(_cachePath)) File.Delete(_cachePath); } catch { /* best effort */ }
    }

    /// Artwork was mirrored into this folder and never trimmed. Images now load
    /// straight from the server through the shared thumbnail cache instead.
    private static void RemoveLegacyArtworkFolder()
    {
        try
        {
            var legacy = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SinuGameVault", "PlexArtwork");
            if (Directory.Exists(legacy)) Directory.Delete(legacy, recursive: true);
        }
        catch { /* Reclaiming disk space is best effort. */ }
    }

    public string ServerUrl
    {
        get => CredentialStore.Read(UrlTarget).TrimEnd('/');
        set => CredentialStore.Save(UrlTarget, value.Trim().TrimEnd('/'));
    }
    public string Token
    {
        get => CredentialStore.Read(TokenTarget);
        set => CredentialStore.Save(TokenTarget, value.Trim());
    }
    public bool Connected => ServerUrl.Length > 0 && Token.Length > 0;

    public async Task<string> DiscoverServerAsync(string token)
    {
        token = token.Trim();
        if (token.Length == 0) throw new InvalidOperationException("Enter the X-Plex-Token before discovering a server.");
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://plex.tv/api/resources?includeHttps=1&includeRelay=1");
        request.Headers.TryAddWithoutValidation("X-Plex-Token", token);
        request.Headers.TryAddWithoutValidation("X-Plex-Client-Identifier", "sinu-game-vault-windows");
        request.Headers.TryAddWithoutValidation("X-Plex-Product", "Sinu Game Vault");
        using var response = await _http.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Plex discovery returned {(int)response.StatusCode}. Check the token.");
        var xml = XDocument.Parse(text);
        var candidates = xml.Descendants("Device")
            .Where(device => ((string?)device.Attribute("provides") ?? "").Split(',').Contains("server"))
            .SelectMany(device => device.Elements("Connection"))
            .Select(connection => new
            {
                Uri = (string?)connection.Attribute("uri") ?? "",
                Local = (string?)connection.Attribute("local") == "1",
                Relay = (string?)connection.Attribute("relay") == "1"
            })
            .Where(connection => Uri.TryCreate(connection.Uri, UriKind.Absolute, out _))
            /* Prefer a connection that also works away from home. Preferring the
               LAN address meant a laptop set up at home saved an address that
               stopped resolving the moment it left the house. Relay is the last
               resort because it is slow. */
            .OrderByDescending(connection => connection.Uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            .ThenBy(connection => connection.Relay)
            .ThenBy(connection => connection.Local).ToList();
        var selected = candidates.FirstOrDefault()?.Uri ?? "";
        if (selected.Length == 0) throw new InvalidOperationException("No accessible Plex Media Server was found for this account.");
        return selected.TrimEnd('/');
    }

    public async Task<IReadOnlyList<PlexLibraryItem>> LibraryAsync(string kind, bool force = false)
    {
        EnsureConfigured();
        var cacheKey = "library:" + kind;
        if (!force && TryGetCached(cacheKey, out var cached)) return cached;

        var sections = await XmlAsync("/library/sections");
        var keys = sections.Descendants("Directory")
            .Where(x => kind == "all" || string.Equals((string?)x.Attribute("type"), kind, StringComparison.OrdinalIgnoreCase))
            .Select(x => (string?)x.Attribute("key"))
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .ToList();

        var items = new List<PlexLibraryItem>();
        // Sequential and paged: one section at a time, one page at a time.
        foreach (var key in keys)
        {
            for (var page = 0; page < MaxPages; page++)
            {
                var content = await XmlAsync($"/library/sections/{key}/all?X-Plex-Container-Start={page * PageSize}&X-Plex-Container-Size={PageSize}");
                var batch = (content.Root?.Elements().Where(x => x.Name.LocalName is "Video" or "Directory").Select(ParseItem) ?? []).ToList();
                items.AddRange(batch);
                var total = (int)Long((string?)content.Root?.Attribute("totalSize"));
                if (batch.Count < PageSize || (total > 0 && items.Count >= total)) break;
            }
        }

        var ordered = WithArtworkUrls(items.OrderByDescending(item => Long(item.AddedAt)).ToList());
        Store(cacheKey, ordered);
        return ordered;
    }

    public async Task<IReadOnlyList<PlexLibraryItem>> ContinueWatchingAsync(bool force = false)
    {
        EnsureConfigured();
        if (!force && TryGetCached("continue", out var cached)) return cached;
        var xml = await XmlAsync("/hubs/home/continueWatching");
        var items = WithArtworkUrls((xml.Root?.Descendants("Video").Select(ParseItem) ?? []).ToList());
        Store("continue", items);
        return items;
    }

    private bool TryGetCached(string key, out IReadOnlyList<PlexLibraryItem> items)
    {
        lock (_cache)
        {
            if (_cache.TryGetValue(key, out var entry) && DateTimeOffset.UtcNow - entry.At < CacheLifetime)
            {
                items = entry.Items;
                return true;
            }
        }
        items = [];
        return false;
    }

    private void Store(string key, IReadOnlyList<PlexLibraryItem> items)
    {
        lock (_cache) _cache[key] = (DateTimeOffset.UtcNow, items);
        SaveCache();
    }

    public Task MarkWatchedAsync(string ratingKey, bool watched) => RequestAsync(HttpMethod.Get,
        $"/:/{(watched ? "scrobble" : "unscrobble")}?key={Uri.EscapeDataString(ratingKey)}&identifier=com.plexapp.plugins.library");
    public Task DeleteAsync(string ratingKey) => RequestAsync(HttpMethod.Delete, $"/library/metadata/{Uri.EscapeDataString(ratingKey)}");

    private async Task<XDocument> XmlAsync(string path)
    {
        using var response = await SendAsync(HttpMethod.Get, path);
        var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Plex returned {(int)response.StatusCode}. Check the server URL and token.");
        return XDocument.Parse(text);
    }

    private async Task RequestAsync(HttpMethod method, string path)
    {
        using var response = await SendAsync(method, path);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Plex returned {(int)response.StatusCode}.");
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path)
    {
        EnsureConfigured();
        await PaceAsync();
        var request = new HttpRequestMessage(method, $"{ServerUrl}{path}");
        request.Headers.TryAddWithoutValidation("X-Plex-Token", Token);
        request.Headers.TryAddWithoutValidation("X-Plex-Client-Identifier", "sinu-game-vault-windows");
        request.Headers.TryAddWithoutValidation("X-Plex-Product", "Sinu Game Vault");
        return await _http.SendAsync(request);
    }

    private PlexLibraryItem ParseItem(XElement node)
    {
        var genres = string.Join(" / ", node.Elements("Genre").Select(x => (string?)x.Attribute("tag")).Where(x => !string.IsNullOrWhiteSpace(x)));
        return new PlexLibraryItem(
            (string?)node.Attribute("ratingKey") ?? "", (string?)node.Attribute("title") ?? "Untitled",
            (string?)node.Attribute("type") ?? "movie", (string?)node.Attribute("year") ?? "",
            (string?)node.Attribute("summary") ?? "", (string?)node.Attribute("thumb") ?? "", (string?)node.Attribute("art") ?? "",
            Double((string?)node.Attribute("rating")), Long((string?)node.Attribute("duration")), Long((string?)node.Attribute("viewOffset")),
            (int)Long((string?)node.Attribute("viewCount")), (string?)node.Attribute("addedAt") ?? "", genres,
            (string?)node.Attribute("grandparentTitle") ?? "", (string?)node.Attribute("grandparentThumb") ?? "", (string?)node.Attribute("grandparentRatingKey") ?? "");
    }

    private void EnsureConfigured()
    {
        if (!Uri.TryCreate(ServerUrl, UriKind.Absolute, out _)) throw new InvalidOperationException("Enter the Plex server URL in Settings.");
        if (Token.Length == 0) throw new InvalidOperationException("Enter the X-Plex-Token in Settings.");
    }
    private static long Long(string? value) => long.TryParse(value, out var number) ? number : 0;
    private static double Double(string? value) => double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ? number : 0;

    /// <summary>
    /// Turns Plex artwork paths into direct authenticated URLs.
    ///
    /// Every image used to be downloaded to disk before the library appeared, so
    /// the Plex tab stayed empty until the last file finished and the mirror grew
    /// without limit. The shared thumbnail cache now fetches each image on demand,
    /// only for cards actually on screen, and decodes it at display size.
    /// </summary>
    private IReadOnlyList<PlexLibraryItem> WithArtworkUrls(IReadOnlyList<PlexLibraryItem> items)
    {
        var server = ServerUrl;
        var token = Token;
        return items.Select(item => item with
        {
            Thumb = ArtworkUrl(server, token, item.Thumb),
            Art = ArtworkUrl(server, token, item.Art),
            ShowThumb = ArtworkUrl(server, token, item.ShowThumb)
        }).ToList();
    }

    private static string ArtworkUrl(string server, string token, string path)
    {
        if (path.Length == 0) return "";
        if (Uri.IsWellFormedUriString(path, UriKind.Absolute)) return path;
        var separator = path.Contains('?') ? "&" : "?";
        return $"{server}{path}{separator}X-Plex-Token={Uri.EscapeDataString(token)}";
    }
}
