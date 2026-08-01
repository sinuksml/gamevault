using System.Xml.Linq;
using System.Net.Http;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.IO;

namespace SinuGameVault.Services;

public sealed record PlexLibraryItem(string RatingKey, string Title, string Type, string Year, string Summary, string Thumb, string Art,
    double Rating, long Duration, long ViewOffset, int ViewCount, string AddedAt, string Genres);

public sealed class PlexService
{
    private const string UrlTarget = "SinuGameVault/Plex/Url";
    private const string TokenTarget = "SinuGameVault/Plex/Token";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly string _artworkFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SinuGameVault", "PlexArtwork");
    private readonly SemaphoreSlim _artworkGate = new(4, 4);

    public PlexService() => Directory.CreateDirectory(_artworkFolder);

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

    public async Task<IReadOnlyList<PlexLibraryItem>> LibraryAsync(string kind)
    {
        EnsureConfigured();
        var sections = await XmlAsync("/library/sections");
        var directories = sections.Descendants("Directory")
            .Where(x => kind == "all" || string.Equals((string?)x.Attribute("type"), kind, StringComparison.OrdinalIgnoreCase));
        var tasks = directories.Select(async section =>
        {
            var key = (string?)section.Attribute("key");
            if (string.IsNullOrWhiteSpace(key)) return Array.Empty<PlexLibraryItem>();
            var content = await XmlAsync($"/library/sections/{key}/all");
            return (content.Root?.Elements().Where(x => x.Name.LocalName is "Video" or "Directory").Select(ParseItem) ?? []).ToArray();
        }).ToArray();
        var items = (await Task.WhenAll(tasks)).SelectMany(item => item).OrderByDescending(item => Long(item.AddedAt)).ToList();
        return await LocalizeArtworkAsync(items);
    }

    public async Task<IReadOnlyList<PlexLibraryItem>> ContinueWatchingAsync()
    {
        var xml = await XmlAsync("/hubs/home/continueWatching");
        return await LocalizeArtworkAsync((xml.Root?.Descendants("Video").Select(ParseItem) ?? []).ToList());
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

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string path)
    {
        EnsureConfigured();
        var request = new HttpRequestMessage(method, $"{ServerUrl}{path}");
        request.Headers.TryAddWithoutValidation("X-Plex-Token", Token);
        request.Headers.TryAddWithoutValidation("X-Plex-Client-Identifier", "sinu-game-vault-windows");
        request.Headers.TryAddWithoutValidation("X-Plex-Product", "Sinu Game Vault");
        return _http.SendAsync(request);
    }

    private PlexLibraryItem ParseItem(XElement node)
    {
        var genres = string.Join(" / ", node.Elements("Genre").Select(x => (string?)x.Attribute("tag")).Where(x => !string.IsNullOrWhiteSpace(x)));
        return new PlexLibraryItem(
            (string?)node.Attribute("ratingKey") ?? "", (string?)node.Attribute("title") ?? "Untitled",
            (string?)node.Attribute("type") ?? "movie", (string?)node.Attribute("year") ?? "",
            (string?)node.Attribute("summary") ?? "", (string?)node.Attribute("thumb") ?? "", (string?)node.Attribute("art") ?? "",
            Double((string?)node.Attribute("rating")), Long((string?)node.Attribute("duration")), Long((string?)node.Attribute("viewOffset")),
            (int)Long((string?)node.Attribute("viewCount")), (string?)node.Attribute("addedAt") ?? "", genres);
    }

    private void EnsureConfigured()
    {
        if (!Uri.TryCreate(ServerUrl, UriKind.Absolute, out _)) throw new InvalidOperationException("Enter the Plex server URL in Settings.");
        if (Token.Length == 0) throw new InvalidOperationException("Enter the X-Plex-Token in Settings.");
    }
    private static long Long(string? value) => long.TryParse(value, out var number) ? number : 0;
    private static double Double(string? value) => double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ? number : 0;

    private async Task<IReadOnlyList<PlexLibraryItem>> LocalizeArtworkAsync(IReadOnlyList<PlexLibraryItem> items)
    {
        var localized = await Task.WhenAll(items.Select(async item => item with
        {
            Thumb = await CacheArtworkAsync(item.Thumb),
            Art = await CacheArtworkAsync(item.Art)
        }));
        return localized;
    }

    private async Task<string> CacheArtworkAsync(string path)
    {
        if (path.Length == 0 || Uri.IsWellFormedUriString(path, UriKind.Absolute)) return path;
        var file = Path.Combine(_artworkFolder, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(ServerUrl + path))) + ".jpg");
        if (File.Exists(file) && new FileInfo(file).Length > 0) return new Uri(file).AbsoluteUri;
        await _artworkGate.WaitAsync();
        try
        {
            if (!File.Exists(file))
            {
                using var response = await SendAsync(HttpMethod.Get, path);
                response.EnsureSuccessStatusCode();
                await using var output = File.Create(file);
                await response.Content.CopyToAsync(output);
            }
            return new Uri(file).AbsoluteUri;
        }
        catch { return ""; }
        finally { _artworkGate.Release(); }
    }
}
