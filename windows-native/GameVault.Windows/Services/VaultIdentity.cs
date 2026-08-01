using System.Globalization;
using System.Text.Json.Nodes;

namespace SinuGameVault.Services;

/// <summary>
/// The single source of truth for "are these two records the same title?".
///
/// This used to be three separate implementations — one for local duplicate
/// detection, one for deletion markers, and one for Drive merges — each with a
/// different key list and a different title fallback format. A deletion marker
/// written by one of them could therefore never be matched by another, so a
/// title deleted on one device reappeared the next time the vaults merged.
/// Every identity decision now goes through this class.
/// </summary>
public static class VaultIdentity
{
    /// Strongest identifier first. A record is identified by the first key it carries.
    private static readonly string[] StrongKeys =
        ["canonicalId", "rawgId", "tmdbId", "imdbId", "plexRatingKey", "key", "id"];

    /// <summary>The single canonical identity used when recording a deletion.</summary>
    public static string For(JsonObject? item, string collection = "")
    {
        if (item is null) return "";
        foreach (var key in StrongKeys)
            if (Text(item, key) is { Length: > 0 } value)
                return key + ":" + value;
        return TitleIdentity(item, collection);
    }

    /// <summary>
    /// Every identity this record could legitimately be known by. Two devices may
    /// each pick a different primary key for the same title (one has a rawgId, the
    /// other only an imdbId), so matching compares candidate sets rather than a
    /// single string.
    /// </summary>
    public static IEnumerable<string> Candidates(JsonObject? item, string collection = "")
    {
        if (item is null) yield break;
        foreach (var key in StrongKeys)
            if (Text(item, key) is { Length: > 0 } value)
                yield return key + ":" + value;
        if (TitleIdentity(item, collection) is { Length: > 0 } title) yield return title;
    }

    /// <summary>True when two records describe the same title by any shared identifier.</summary>
    public static bool Matches(JsonObject? left, JsonObject? right, string collection = "")
    {
        if (left is null || right is null) return false;
        var keys = Candidates(left, collection).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return Candidates(right, collection).Any(keys.Contains);
    }

    /// <summary>Title-based identity for records that carry no stable identifier.</summary>
    public static string TitleIdentity(JsonObject? item, string collection = "")
    {
        if (item is null) return "";
        var title = Text(item, "name");
        if (title.Length == 0) title = Text(item, "title");
        if (title.Length == 0) title = Text(item, "service");
        var normalized = new string(title.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
        if (normalized.Length == 0) return "";

        var year = Text(item, "year");
        if (year.Length == 0 && DateTime.TryParse(Text(item, "date"), CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            year = date.Year.ToString(CultureInfo.InvariantCulture);

        var discriminator = Text(item, "mediaType");
        if (discriminator.Length == 0) discriminator = Text(item, "platform");
        if (discriminator.Length == 0) discriminator = Text(item, "provider");

        return $"title:{normalized}:{year}:{discriminator.ToLowerInvariant()}";
    }

    private static string Text(JsonObject? item, string key) => item?[key]?.ToString() ?? "";
}
