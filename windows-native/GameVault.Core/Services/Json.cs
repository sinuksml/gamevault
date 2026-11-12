using System.Globalization;
using System.Text.Json.Nodes;

namespace SinuGameVault.Services;

/// <summary>
/// Tolerant readers for vault records. The same field can arrive as text, a
/// number or an array depending on which client wrote it, so every read goes
/// through these instead of GetValue&lt;T&gt;(), which throws on a type mismatch.
/// </summary>
public static class Json
{
    /// <summary>The first non-empty scalar among the keys.</summary>
    public static string Text(JsonObject? node, params string[] keys)
    {
        if (node is null) return "";
        foreach (var key in keys)
        {
            if (node[key] is JsonValue scalar)
            {
                var value = scalar.ToString();
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
        }
        return "";
    }

    public static double Number(JsonObject? node, params string[] keys)
    {
        if (node is null) return 0;
        foreach (var key in keys)
        {
            var text = node[key]?.ToString();
            if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
                || double.TryParse(text, NumberStyles.Float, CultureInfo.CurrentCulture, out value)) return value;
        }
        return 0;
    }

    public static int Integer(JsonObject? node, params string[] keys) => (int)Math.Round(Number(node, keys));

    public static long Long(JsonObject? node, params string[] keys)
    {
        if (node is null) return 0;
        foreach (var key in keys)
            if (long.TryParse(node[key]?.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)) return value;
        return 0;
    }

    public static bool Flag(JsonObject? node, string key) =>
        string.Equals(node?[key]?.ToString(), "true", StringComparison.OrdinalIgnoreCase);

    /// <summary>An array joined with commas, or the scalar stored under the same key.</summary>
    public static string ArrayText(JsonObject? node, params string[] keys)
    {
        if (node is null) return "";
        foreach (var key in keys)
        {
            if (node[key] is JsonArray array)
            {
                var values = array.Select(item => item is JsonValue ? item.ToString() : "").Where(value => !string.IsNullOrWhiteSpace(value));
                var result = string.Join(", ", values);
                if (result.Length > 0) return result;
            }
            var scalar = Text(node, key);
            if (scalar.Length > 0) return scalar;
        }
        return "";
    }

    public static JsonObject Clone(JsonObject? node) => node?.DeepClone() as JsonObject ?? [];

    /// <summary>Copies fields the target is missing; never overwrites what is already stored.</summary>
    public static void Merge(JsonObject target, JsonObject source)
    {
        foreach (var pair in source)
            if (pair.Value is not null && (target[pair.Key] is null || string.IsNullOrWhiteSpace(target[pair.Key]?.ToString())))
                target[pair.Key] = pair.Value.DeepClone();
    }
}
