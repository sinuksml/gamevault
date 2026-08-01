using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace SinuGameVault.Services;

public sealed class CatalogService
{
    private const string RawgTarget = "SinuGameVault/API/RAWG";
    private const string TmdbTarget = "SinuGameVault/API/TMDB";
    private const string OmdbTarget = "SinuGameVault/API/OMDb";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly string _cacheFolder;
    private readonly object _requestLock = new();
    private readonly Dictionary<string, Task<JsonObject>> _inflight = [];

    public CatalogService()
    {
        _cacheFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SinuGameVault", "CatalogCache");
        Directory.CreateDirectory(_cacheFolder);
    }

    public string RawgKey { get => CredentialStore.Read(RawgTarget); set => CredentialStore.Save(RawgTarget, value.Trim()); }
    public string TmdbKey { get => CredentialStore.Read(TmdbTarget); set => CredentialStore.Save(TmdbTarget, value.Trim()); }
    public string OmdbKey { get => CredentialStore.Read(OmdbTarget); set => CredentialStore.Save(OmdbTarget, value.Trim()); }

    public async Task<IReadOnlyList<JsonObject>> SearchGamesAsync(string query)
    {
        if (RawgKey.Length == 0) throw new InvalidOperationException("Save a RAWG API key in Settings first.");
        var root = await GetAsync($"https://api.rawg.io/api/games?key={Uri.EscapeDataString(RawgKey)}&search={Uri.EscapeDataString(query)}&search_precise=true&page_size=20");
        return (root["results"] as JsonArray)?.OfType<JsonObject>().Select(Game).ToList() ?? [];
    }

    public async Task<IReadOnlyList<JsonObject>> GameCatalogAsync(bool upcoming)
    {
        if (RawgKey.Length == 0) throw new InvalidOperationException("Save a RAWG API key in Settings first.");
        var dateFilter = upcoming
            ? $"&dates={DateTime.Today:yyyy-MM-dd},{DateTime.Today.AddYears(1):yyyy-MM-dd}&ordering=released"
            : $"&dates={DateTime.Today.AddYears(-3):yyyy-MM-dd},{DateTime.Today:yyyy-MM-dd}&ordering=-released";
        var combined = new List<JsonObject>();
        for (var page = 1; page <= 3; page++)
        {
            var root = await GetAsync($"https://api.rawg.io/api/games?key={Uri.EscapeDataString(RawgKey)}{dateFilter}&page_size=40&page={page}&platforms=4,186,187");
            combined.AddRange((root["results"] as JsonArray)?.OfType<JsonObject>().Select(Game) ?? []);
        }
        return combined.GroupBy(item => item["canonicalId"]?.ToString()).Select(group => group.First()).ToList();
    }

    public async Task<IReadOnlyList<JsonObject>> SearchMediaAsync(string query, string type)
    {
        if (TmdbKey.Length == 0) throw new InvalidOperationException("Save a TMDB API key in Settings first.");
        var endpoint = type == "Movie" ? "movie" : "tv";
        var root = await GetAsync($"https://api.themoviedb.org/3/search/{endpoint}?api_key={Uri.EscapeDataString(TmdbKey)}&query={Uri.EscapeDataString(query)}&include_adult=false&page=1");
        var items = (root["results"] as JsonArray)?.OfType<JsonObject>().Take(20).Select(item => Media(item, type)).ToList() ?? [];
        foreach (var item in items.Take(8)) await EnrichMediaAsync(item, type);
        return items;
    }

    public async Task<IReadOnlyList<JsonObject>> MediaCatalogAsync(string type, string mode)
    {
        if (TmdbKey.Length == 0) throw new InvalidOperationException("Save a TMDB API key in Settings first.");
        var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var path = (type, mode) switch
        {
            ("Movie", "uphw") => "movie/upcoming?region=US",
            ("Movie", "bluray") => $"discover/movie?region=US&with_release_type=4|5&release_date.lte={today}&sort_by=primary_release_date.desc",
            ("Movie", "mlott") => "discover/movie?with_original_language=ml&watch_region=IN&with_watch_monetization_types=flatrate&sort_by=primary_release_date.desc",
            ("Movie", _) => "movie/top_rated?region=US",
            ("TV Show", "seriesnew") => "tv/on_the_air",
            ("TV Show", "seriesupcoming") => $"discover/tv?first_air_date.gte={today}&sort_by=first_air_date.asc",
            ("TV Show", "mlseries") => "discover/tv?with_original_language=ml&sort_by=first_air_date.desc&vote_average.gte=6&vote_count.gte=3&without_genres=10763,10764,10766,10767&without_networks=247",
            ("TV Show", "taseries") => "discover/tv?with_original_language=ta&sort_by=first_air_date.desc&vote_average.gte=6&vote_count.gte=5&without_genres=10763,10764,10766,10767&without_networks=247",
            ("TV Show", "hiseries") => "discover/tv?with_original_language=hi&sort_by=first_air_date.desc&vote_average.gte=6&vote_count.gte=8&without_genres=10763,10764,10766,10767&without_networks=247",
            ("TV Show", _) => "tv/top_rated",
            _ => throw new ArgumentOutOfRangeException(nameof(type), "Catalog type must be Movie or TV Show.")
        };
        var combined = new List<JsonObject>();
        for (var page = 1; page <= 3; page++)
        {
            var separator = path.Contains('?') ? '&' : '?';
            var root = await GetAsync($"https://api.themoviedb.org/3/{path}{separator}api_key={Uri.EscapeDataString(TmdbKey)}&page={page}&include_adult=false");
            combined.AddRange((root["results"] as JsonArray)?.OfType<JsonObject>().Select(item => Media(item, type)) ?? []);
        }
        var distinct = combined.GroupBy(item => item["canonicalId"]?.ToString()).Select(group => group.First());
        if (type == "Movie" && mode == "uphw")
            distinct = distinct.Where(item => Date(item, "date") >= DateTime.Today && (Number(item, "popularity") >= 8 || Number(item, "voteCount") >= 10));
        var result = distinct.ToList();
        foreach (var item in result) item["dateSource"] = mode == "mlott" ? "TMDB streaming availability; date is the title release date" : "TMDB";
        return result;
    }

    public async Task EnrichMediaAsync(JsonObject item, string type)
    {
        if (TmdbKey.Length == 0) return;
        var id = item["id"]?.ToString();
        if (string.IsNullOrWhiteSpace(id)) return;
        var endpoint = type == "Movie" ? "movie" : "tv";
        try
        {
            var details = await GetAsync($"https://api.themoviedb.org/3/{endpoint}/{id}?api_key={Uri.EscapeDataString(TmdbKey)}&append_to_response=external_ids,watch/providers,content_ratings,release_dates");
            foreach (var key in new[] { "overview", "backdrop_path", "poster_path", "status", "number_of_seasons", "number_of_episodes", "vote_average" })
                if (details[key] is not null) item[key switch { "backdrop_path" => "backdrop", "poster_path" => "poster", "number_of_seasons" => "seasons", "number_of_episodes" => "episodeCount", "vote_average" => "tmdb", _ => key }] = key.EndsWith("_path") ? Image(details[key]?.ToString(), key == "poster_path" ? "w500" : "w1280") : details[key]?.DeepClone();
            item["imdbId"] = details["external_ids"]?["imdb_id"]?.ToString();
            if (details["seasons"] is JsonArray seasons)
                item["seasonList"] = new JsonArray(seasons.OfType<JsonObject>().Where(season => int.TryParse(season["season_number"]?.ToString(), out var number) && number > 0)
                    .Select(season => (JsonNode)new JsonObject { ["n"] = season["season_number"]?.DeepClone(), ["name"] = season["name"]?.DeepClone(), ["episodes"] = season["episode_count"]?.DeepClone(), ["date"] = season["air_date"]?.DeepClone() }).ToArray());
            var country = details["watch/providers"]?["results"]?["IN"] as JsonObject ?? details["watch/providers"]?["results"]?["US"] as JsonObject;
            var providerNames = new JsonArray();
            foreach (var provider in new[] { "flatrate", "rent", "buy" }.SelectMany(key => (country?[key] as JsonArray)?.OfType<JsonObject>() ?? []))
            {
                var name = provider["provider_name"]?.ToString();
                if (!string.IsNullOrWhiteSpace(name) && !providerNames.Any(x => x?.ToString() == name)) providerNames.Add(name);
            }
            item["providers"] = providerNames;
            if (OmdbKey.Length > 0 && item["imdbId"]?.ToString() is { Length: > 0 } imdbId)
            {
                var omdb = await GetAsync($"https://www.omdbapi.com/?apikey={Uri.EscapeDataString(OmdbKey)}&i={Uri.EscapeDataString(imdbId)}");
                if (double.TryParse(omdb["imdbRating"]?.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var rating)) item["imdb"] = rating;
                item["imdbCheckedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            }
        }
        catch { /* Keep the stored catalog usable when a provider is temporarily unavailable. */ }
    }

    public async Task<string> WikipediaSummaryAsync(string title, string mediaType = "Game", string year = "")
    {
        try
        {
            var cleaned = Regex.Replace(title, @"\s+(plot|story|summary)$", "", RegexOptions.IgnoreCase).Trim();
            var qualifier = mediaType switch { "Game" => "video game", "Movie" => "film", "TV Show" => "television series", _ => "" };
            var query = $"\"{cleaned}\" {year} {qualifier}".Trim();
            var search = await GetAsync($"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={Uri.EscapeDataString(query)}&srlimit=5&format=json&origin=*");
            var candidates = (search["query"]?["search"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
            var normalized = NormalizeTitle(cleaned);
            var page = candidates.OrderByDescending(candidate => WikipediaScore(candidate["title"]?.ToString() ?? "", normalized, qualifier, year)).FirstOrDefault()?["title"]?.ToString();
            if (string.IsNullOrWhiteSpace(page))
            {
                search = await GetAsync($"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={Uri.EscapeDataString(cleaned)}&srlimit=3&format=json&origin=*");
                candidates = (search["query"]?["search"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
                page = candidates.OrderByDescending(candidate => WikipediaScore(candidate["title"]?.ToString() ?? "", normalized, qualifier, year)).FirstOrDefault()?["title"]?.ToString();
            }
            if (string.IsNullOrWhiteSpace(page)) return "";
            var parsed = await GetAsync($"https://en.wikipedia.org/w/api.php?action=parse&page={Uri.EscapeDataString(page)}&prop=sections&format=json&origin=*");
            var storySection = (parsed["parse"]?["sections"] as JsonArray)?.OfType<JsonObject>()
                .FirstOrDefault(section => Regex.IsMatch(section["line"]?.ToString() ?? "", "(plot|story|synopsis|premise|setting|narrative)", RegexOptions.IgnoreCase));
            var sectionIndex = storySection?["index"]?.ToString();
            if (!string.IsNullOrWhiteSpace(sectionIndex))
            {
                var section = await GetAsync($"https://en.wikipedia.org/w/api.php?action=parse&page={Uri.EscapeDataString(page)}&prop=text&section={Uri.EscapeDataString(sectionIndex)}&format=json&origin=*");
                var html = section["parse"]?["text"]?["*"]?.ToString() ?? "";
                var plot = WikipediaPlainText(html);
                if (plot.Length > 0) return plot;
            }
            var extract = await GetAsync($"https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=true&exsectionformat=plain&titles={Uri.EscapeDataString(page)}&format=json&origin=*");
            var pages = extract["query"]?["pages"] as JsonObject;
            return pages?.FirstOrDefault().Value?["extract"]?.ToString() ?? "";
        }
        catch { return ""; }
    }

    private static string WikipediaPlainText(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return "";
        var value = Regex.Replace(html, "<(script|style)[^>]*>.*?</\\1>", "", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        value = Regex.Replace(value, "</p>|<br\\s*/?>|</li>|</h[1-6]>", "\n\n", RegexOptions.IgnoreCase);
        value = Regex.Replace(value, "<[^>]+>", " ");
        value = WebUtility.HtmlDecode(value);
        value = Regex.Replace(value, @"\[[0-9]+\]", "");
        value = Regex.Replace(value, @"[ \t]+", " ");
        value = Regex.Replace(value, @"\n\s*\n+", "\n\n").Trim();
        return value;
    }

    public async Task<(string Name, string Overview, string AirDate, double Rating)> EpisodeAsync(string tmdbId, string imdbId, int season, int episode)
    {
        if (TmdbKey.Length == 0 || tmdbId.Length == 0) return ("", "", "", 0);
        try
        {
            var item = await GetAsync($"https://api.themoviedb.org/3/tv/{Uri.EscapeDataString(tmdbId)}/season/{season}/episode/{episode}?api_key={Uri.EscapeDataString(TmdbKey)}");
            var rating = double.TryParse(item["vote_average"]?.ToString(), CultureInfo.InvariantCulture, out var tmdbRating) ? tmdbRating : 0;
            if (OmdbKey.Length > 0)
            {
                try
                {
                    var external = await GetAsync($"https://api.themoviedb.org/3/tv/{Uri.EscapeDataString(tmdbId)}/season/{season}/episode/{episode}/external_ids?api_key={Uri.EscapeDataString(TmdbKey)}");
                    var episodeImdb = external["imdb_id"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(episodeImdb))
                    {
                        var omdb = await GetAsync($"https://www.omdbapi.com/?apikey={Uri.EscapeDataString(OmdbKey)}&i={Uri.EscapeDataString(episodeImdb)}");
                        if (double.TryParse(omdb["imdbRating"]?.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var imdbRating)) rating = imdbRating;
                    }
                }
                catch { /* TMDB remains available when OMDb is temporarily unavailable. */ }
            }
            return (item["name"]?.ToString() ?? "", item["overview"]?.ToString() ?? "", item["air_date"]?.ToString() ?? "", rating);
        }
        catch { return ("", "", "", 0); }
    }

    private async Task<JsonObject> GetAsync(string url)
    {
        Task<JsonObject> task;
        lock (_requestLock)
        {
            if (!_inflight.TryGetValue(url, out task!))
            {
                task = GetAndCacheAsync(url);
                _inflight[url] = task;
            }
        }
        try { return (await task).DeepClone() as JsonObject ?? new JsonObject(); }
        finally { lock (_requestLock) _inflight.Remove(url); }
    }

    private async Task<JsonObject> GetAndCacheAsync(string url)
    {
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(url)));
        var path = Path.Combine(_cacheFolder, key + ".json");
        var fresh = File.Exists(path) && DateTime.UtcNow - File.GetLastWriteTimeUtc(path) < TimeSpan.FromMinutes(30);
        if (fresh)
        {
            try { return JsonNode.Parse(await File.ReadAllTextAsync(path)) as JsonObject ?? new JsonObject(); }
            catch { /* Fetch a clean copy below. */ }
        }
        try
        {
            using var response = await _http.GetAsync(url);
            var text = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Online service returned {(int)response.StatusCode}.");
            var result = JsonNode.Parse(text) as JsonObject ?? new JsonObject();
            await File.WriteAllTextAsync(path, result.ToJsonString());
            return result;
        }
        catch when (File.Exists(path))
        {
            return JsonNode.Parse(await File.ReadAllTextAsync(path)) as JsonObject ?? new JsonObject();
        }
    }

    private static JsonObject Game(JsonObject item)
    {
        var platforms = new JsonArray((item["platforms"] as JsonArray)?.OfType<JsonObject>().Select(x => (JsonNode?)x["platform"]?["name"]?.ToString()).Where(x => x is not null).ToArray() ?? []);
        var genres = string.Join(" / ", (item["genres"] as JsonArray)?.OfType<JsonObject>().Select(x => x["name"]?.ToString()).Where(x => !string.IsNullOrWhiteSpace(x)) ?? []);
        return new JsonObject
        {
            ["id"] = item["id"]?.DeepClone(), ["rawgId"] = item["id"]?.DeepClone(), ["name"] = item["name"]?.DeepClone(),
            ["date"] = item["released"]?.DeepClone(), ["img"] = item["background_image"]?.DeepClone(), ["rrating"] = item["rating"]?.DeepClone(),
            ["genre"] = genres, ["platforms"] = platforms, ["canonicalId"] = $"rawg:{item["id"]}"
        };
    }

    private static JsonObject Media(JsonObject item, string type)
    {
        var title = item[type == "Movie" ? "title" : "name"]?.ToString() ?? "Untitled";
        var date = item[type == "Movie" ? "release_date" : "first_air_date"]?.ToString() ?? "";
        return new JsonObject
        {
            ["id"] = item["id"]?.DeepClone(), ["tmdbId"] = item["id"]?.DeepClone(), ["title"] = title,
            ["date"] = date, ["year"] = date.Length >= 4 ? date[..4] : "", ["poster"] = Image(item["poster_path"]?.ToString(), "w500"),
            ["backdrop"] = Image(item["backdrop_path"]?.ToString(), "w1280"), ["overview"] = item["overview"]?.DeepClone(),
            ["popularity"] = item["popularity"]?.DeepClone(), ["voteCount"] = item["vote_count"]?.DeepClone(),
            ["tmdb"] = item["vote_average"]?.DeepClone(), ["genres"] = item["genre_ids"]?.DeepClone(),
            ["voteCount"] = item["vote_count"]?.DeepClone(), ["popularity"] = item["popularity"]?.DeepClone(),
            ["originalLanguage"] = item["original_language"]?.DeepClone(),
            ["canonicalId"] = $"tmdb:{(type == "Movie" ? "movie" : "tv")}:{item["id"]}"
        };
    }

    private static double Number(JsonObject item, string key) => double.TryParse(item[key]?.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : 0;
    private static DateTime Date(JsonObject item, string key) => DateTime.TryParse(item[key]?.ToString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var value) ? value.Date : DateTime.MinValue;
    private static string NormalizeTitle(string title) => new(title.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
    private static int WikipediaScore(string candidate, string normalizedTitle, string qualifier, string year)
    {
        var normalizedCandidate = NormalizeTitle(candidate);
        var score = normalizedCandidate.StartsWith(normalizedTitle, StringComparison.Ordinal) ? 20 : normalizedCandidate.Contains(normalizedTitle, StringComparison.Ordinal) ? 10 : 0;
        if (qualifier.Length > 0 && candidate.Contains(qualifier, StringComparison.OrdinalIgnoreCase)) score += 8;
        if (year.Length >= 4 && candidate.Contains(year[..4], StringComparison.OrdinalIgnoreCase)) score += 6;
        if (candidate.Contains("disambiguation", StringComparison.OrdinalIgnoreCase)) score -= 20;
        return score;
    }
    private static string Image(string? path, string size) => string.IsNullOrWhiteSpace(path) ? "" : $"https://image.tmdb.org/t/p/{size}{path}";
}
