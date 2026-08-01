using System.Net;
using System.Net.Http;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Globalization;

namespace SinuGameVault.Services;

public sealed partial class AvailabilityService
{
    private const string GamerPlanetStore = "bb9cd9c8-a958-457b-9037-32736c74d6dd";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };

    public async Task<JsonObject> CheckAsync(string gameName)
    {
        var hubTask = CheckGameHubAsync(gameName);
        var planetTask = CheckGamerPlanetAsync(gameName);
        await Task.WhenAll(hubTask, planetTask);
        return new JsonObject
        {
            ["t"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["hub"] = await hubTask,
            ["gp"] = await planetTask
        };
    }

    private async Task<JsonObject> CheckGamerPlanetAsync(string gameName)
    {
        try
        {
            var url = $"https://api.mydukaan.io/api/product/buyer/{GamerPlanetStore}/product-list/v2/?search={Uri.EscapeDataString(gameName)}&pop_fields=category_data";
            var root = JsonNode.Parse(await _http.GetStringAsync(url)) as JsonObject;
            var wanted = Fold(gameName);
            var products = (root?["results"] as JsonArray)?.OfType<JsonObject>()
                .Where(product =>
                {
                    var name = Text(product, "name");
                    if (Regex.IsMatch(name, @"\(pc\)|steam|epic|gamestick|controller|console &", RegexOptions.IgnoreCase)) return false;
                    var folded = Fold(name);
                    return MatchScore(folded, wanted) >= 0.72;
                })
                .OrderByDescending(product => MatchScore(Fold(Text(product, "name")), wanted))
                .ThenBy(product => Text(product, "name").Contains("PS5", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                .ThenBy(product => Text(product, "name").Length)
                .ToList() ?? [];
            var match = products.FirstOrDefault();
            if (match is null) return new JsonObject { ["found"] = false };
            double? rent = null;
            foreach (var sku in (match["skus"] as JsonArray)?.OfType<JsonObject>() ?? [])
            {
                var attributes = string.Join(" ", (sku["attributes"] as JsonArray)?.OfType<JsonObject>().Select(item => Text(item, "value")) ?? []);
                var price = Number(sku, "selling_price");
                if (attributes.Contains("rent", StringComparison.OrdinalIgnoreCase) && price > 0 && (rent is null || price < rent)) rent = price;
            }
            rent ??= (match["skus"] as JsonArray)?.OfType<JsonObject>().Select(item => Number(item, "selling_price")).FirstOrDefault(value => value > 0);
            return new JsonObject
            {
                ["found"] = true, ["name"] = Text(match, "name"), ["stock"] = Bool(match, "in_stock"),
                ["rent"] = rent, ["pre"] = Regex.IsMatch(Text(match, "name"), "pre.?book", RegexOptions.IgnoreCase),
                ["url"] = Text(match, "web_url")
            };
        }
        catch (Exception ex) { return new JsonObject { ["found"] = false, ["error"] = ex.Message }; }
    }

    private async Task<JsonObject> CheckGameHubAsync(string gameName)
    {
        try
        {
            var searchUrl = $"https://thegamehub.in/?s={Uri.EscapeDataString(gameName)}&post_type=product";
            var html = await _http.GetStringAsync(searchUrl);
            var wanted = Fold(gameName);
            var slugs = ProductLinkRegex().Matches(html).Select(match => match.Groups[1].Value).Distinct().ToList();
            var slug = slugs.Where(value => MatchScore(Fold(value), wanted) >= 0.72).OrderByDescending(value => MatchScore(Fold(value), wanted)).ThenBy(value => value.Length).FirstOrDefault();
            if (slug is null) return new JsonObject { ["found"] = false };
            var productUrl = $"https://thegamehub.in/product/{slug}/";
            var productHtml = WebUtility.HtmlDecode(await _http.GetStringAsync(productUrl));
            var sku = SkuRegex().Match(productHtml).Groups[1].Value;
            var title = string.Join(' ', slug.Split('-', StringSplitOptions.RemoveEmptyEntries).Select(word => char.ToUpperInvariant(word[0]) + word[1..]));
            if (sku.Length == 0) return new JsonObject { ["found"] = true, ["name"] = title, ["url"] = productUrl };
            var response = await _http.GetStringAsync($"https://n8n.thegamehub.in/webhook/availability?internal_game_key={Uri.EscapeDataString(sku)}");
            var rows = JsonNode.Parse(response) as JsonArray ?? [];
            return new JsonObject
            {
                ["found"] = true, ["name"] = title, ["url"] = productUrl,
                ["primary"] = SlotStatus(rows, "primaryps5"), ["secondary"] = SlotStatus(rows, "secondaryps5")
            };
        }
        catch (Exception ex) { return new JsonObject { ["found"] = false, ["error"] = ex.Message }; }
    }

    private static JsonObject? SlotStatus(JsonArray rows, string slotKey)
    {
        var matching = rows.OfType<JsonObject>().Where(row => Fold(Text(row, "Slot")) == slotKey).ToList();
        if (matching.Count == 0) return null;
        var available = matching.Where(row => !Text(row, "Remarks (Pre-booking)").Equals("booked", StringComparison.OrdinalIgnoreCase)
            && Text(row, "Availability").Equals("available", StringComparison.OrdinalIgnoreCase)).ToList();
        if (available.Count > 0)
            return new JsonObject { ["now"] = true, ["price"] = available.Select(row => Price(row, "Price (INR) Per Month")).Where(value => value > 0).DefaultIfEmpty().Min() };
        var next = matching.Select(row => new { Row = row, Text = Text(row, "Next Available on or After") })
            .Where(item => !item.Text.Equals("BOOKED", StringComparison.OrdinalIgnoreCase) && TryDate(item.Text, out _))
            .Select(item => new { item.Row, item.Text, Date = ParseDate(item.Text) }).Where(item => item.Date.Date >= DateTime.Today)
            .OrderBy(item => item.Date).FirstOrDefault();
        return next is null ? new JsonObject { ["no"] = true } : new JsonObject { ["next"] = next.Text, ["price"] = Price(next.Row, "Price (INR) Per Month") };
    }

    private static string Fold(string value) => new(value.ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD).Where(char.IsLetterOrDigit).ToArray());
    private static string Text(JsonObject node, string key) => node[key]?.ToString() ?? "";
    private static bool Bool(JsonObject node, string key) => bool.TryParse(node[key]?.ToString(), out var value) && value;
    private static double Number(JsonObject node, string key) => double.TryParse(node[key]?.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : 0;
    private static double Price(JsonObject node, string key) => double.TryParse(Regex.Replace(Text(node, key), @"[^\d.]", ""), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : 0;
    private static double MatchScore(string candidate, string wanted)
    {
        if (candidate == wanted) return 1;
        if (candidate.Contains(wanted, StringComparison.Ordinal) || wanted.Contains(candidate, StringComparison.Ordinal))
            return (double)Math.Min(candidate.Length, wanted.Length) / Math.Max(candidate.Length, wanted.Length);
        var a = candidate.Chunk(2).Select(chars => new string(chars)).ToHashSet();
        var b = wanted.Chunk(2).Select(chars => new string(chars)).ToHashSet();
        return a.Count == 0 || b.Count == 0 ? 0 : (double)a.Intersect(b).Count() / Math.Max(a.Count, b.Count);
    }
    private static bool TryDate(string value, out DateTime date) => DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out date)
        || DateTime.TryParse(value, CultureInfo.GetCultureInfo("en-IN"), DateTimeStyles.AllowWhiteSpaces, out date);
    private static DateTime ParseDate(string value) => TryDate(value, out var date) ? date : DateTime.MaxValue;

    [GeneratedRegex("href=[\"']https://thegamehub\\.in/product/([a-z0-9-]+)/", RegexOptions.IgnoreCase)]
    private static partial Regex ProductLinkRegex();
    [GeneratedRegex("[\"']sku[\"']\\s*:\\s*[\"']([^\"']+)[\"']", RegexOptions.IgnoreCase)]
    private static partial Regex SkuRegex();
}
