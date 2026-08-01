using System.Xml.Linq;
using System.Net.Http;

namespace SinuGameVault.Services;

public sealed record PlexLibraryItem(string RatingKey, string Title, string Type, string Year, string Summary, string Thumb, string Art,
    double Rating, long Duration, long ViewOffset, int ViewCount, string AddedAt, string Genres);

public sealed class PlexService
{
    private const string UrlTarget = "SinuGameVault/Plex/Url";
    private const string TokenTarget = "SinuGameVault/Plex/Token";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };

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
        var items = new List<PlexLibraryItem>();
        foreach (var section in directories)
        {
            var key = (string?)section.Attribute("key");
            if (string.IsNullOrWhiteSpace(key)) continue;
            var content = await XmlAsync($"/library/sections/{key}/all");
            items.AddRange(content.Root?.Elements().Where(x => x.Name.LocalName is "Video" or "Directory").Select(ParseItem) ?? []);
        }
        return items.OrderByDescending(item => Long(item.AddedAt)).ToList();
    }

    public async Task<IReadOnlyList<PlexLibraryItem>> ContinueWatchingAsync()
    {
        var xml = await XmlAsync("/hubs/home/continueWatching");
        return (xml.Root?.Descendants("Video").Select(ParseItem) ?? []).ToList();
    }

    public Task MarkWatchedAsync(string ratingKey, bool watched) => RequestAsync(HttpMethod.Get,
        $"/:/{(watched ? "scrobble" : "unscrobble")}?key={Uri.EscapeDataString(ratingKey)}&identifier=com.plexapp.plugins.library");
    public Task DeleteAsync(string ratingKey) => RequestAsync(HttpMethod.Delete, $"/library/metadata/{Uri.EscapeDataString(ratingKey)}");

    public string Artwork(string path)
    {
        if (path.Length == 0) return "";
        if (Uri.IsWellFormedUriString(path, UriKind.Absolute)) return path;
        return $"{ServerUrl}{path}{(path.Contains('?') ? '&' : '?')}X-Plex-Token={Uri.EscapeDataString(Token)}";
    }

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
        var separator = path.Contains('?') ? '&' : '?';
        var request = new HttpRequestMessage(method, $"{ServerUrl}{path}{separator}X-Plex-Token={Uri.EscapeDataString(Token)}");
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
            (string?)node.Attribute("summary") ?? "", Artwork((string?)node.Attribute("thumb") ?? ""), Artwork((string?)node.Attribute("art") ?? ""),
            Double((string?)node.Attribute("rating")), Long((string?)node.Attribute("duration")), Long((string?)node.Attribute("viewOffset")),
            (int)Long((string?)node.Attribute("viewCount")), (string?)node.Attribute("addedAt") ?? "", genres);
    }

    private void EnsureConfigured()
    {
        if (!Uri.TryCreate(ServerUrl, UriKind.Absolute, out _)) throw new InvalidOperationException("Enter the Plex server URL in Settings.");
        if (Token.Length == 0) throw new InvalidOperationException("Enter the X-Plex-Token in Settings.");
    }
    private static long Long(string? value) => long.TryParse(value, out var number) ? number : 0;
    private static double Double(string? value) => double.TryParse(value, out var number) ? number : 0;
}
