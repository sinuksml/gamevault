using System.Globalization;
using System.IO;
using System.Text.Json.Nodes;

namespace SinuGameVault.Services;

/// <summary>
/// View state — theme, last section, grid/list choice, window placement.
///
/// These were previously written to Windows Credential Manager, which is a
/// secrets vault: it is slower than a file, clutters the user's saved
/// credentials with non-secret UI state, and is the wrong tool for the job.
/// Real secrets (tokens, API keys) still live in CredentialStore.
/// </summary>
public sealed class UserPreferences
{
    private readonly string _path;
    private readonly object _gate = new();
    private JsonObject _values = new();

    public UserPreferences(string folder)
    {
        Directory.CreateDirectory(folder);
        _path = Path.Combine(folder, "preferences.json");
        try
        {
            if (File.Exists(_path) && JsonNode.Parse(File.ReadAllText(_path)) is JsonObject stored) _values = stored;
        }
        catch (Exception ex)
        {
            // Corrupt preferences must never stop the app opening.
            DiagnosticsService.Log("Preferences", "Unreadable preferences file; defaults used", ex);
            _values = new JsonObject();
        }
        MigrateFromCredentialStore();
    }

    public string Get(string key, string fallback = "")
    {
        lock (_gate) return _values[key]?.ToString() is { Length: > 0 } value ? value : fallback;
    }

    public void Set(string key, string value)
    {
        lock (_gate) { _values[key] = value; Save(); }
    }

    public double GetDouble(string key, double fallback)
    {
        var text = Get(key);
        return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : fallback;
    }

    public void SetDouble(string key, double value) => Set(key, value.ToString("R", CultureInfo.InvariantCulture));

    public bool GetBool(string key, bool fallback) => Get(key) is { Length: > 0 } text ? text == "true" : fallback;
    public void SetBool(string key, bool value) => Set(key, value ? "true" : "false");

    private void Save()
    {
        try
        {
            var temporary = _path + ".tmp";
            File.WriteAllText(temporary, _values.ToJsonString());
            File.Move(temporary, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Preferences", "Could not save preferences", ex);
        }
    }

    /// Moves settings written by earlier versions out of Credential Manager once.
    private void MigrateFromCredentialStore()
    {
        string[] keys = ["GamesView", "MediaView", "Theme", "LastSection"];
        var migrated = false;
        foreach (var key in keys)
        {
            var target = "SinuGameVault/Preferences/" + key;
            var existing = CredentialStore.Read(target);
            if (existing.Length == 0) continue;
            lock (_gate) _values[key] ??= existing;
            CredentialStore.Delete(target);
            migrated = true;
        }
        if (migrated) { lock (_gate) Save(); }
    }
}
