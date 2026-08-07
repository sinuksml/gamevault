using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace SinuGameVault.Services;

public sealed record DeviceLogin(string VerificationUrl, string UserCode, string DeviceCode, int IntervalSeconds, DateTimeOffset ExpiresAt);
public sealed record DriveBackupInfo(long SizeBytes, DateTimeOffset? ModifiedAt);

public sealed class DriveService
{
    public const string DefaultClientId = "898110284062-76km1uptkth506kgaecoafohu15js0rh.apps.googleusercontent.com";
    private const string Scope = "https://www.googleapis.com/auth/drive.file";
    private const string FileName = "game-vault-backup.json";
    private const string AccessTarget = "SinuGameVault/GoogleDriveAccess";
    private const string RefreshTarget = "SinuGameVault/GoogleDriveRefresh";
    private const string SecretTarget = "SinuGameVault/GoogleDriveClientSecret";
    private const string ExpiryTarget = "SinuGameVault/GoogleDriveAccessExpiry";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(45) };
    private readonly SemaphoreSlim _tokenGate = new(1, 1);
    private readonly string _settingsPath;
    private string _accessToken = "";
    private DateTimeOffset _accessExpires;

    public string ClientId { get; set; } = DefaultClientId;
    public string ClientSecret { get; set; } = "";
    public bool Connected => !string.IsNullOrWhiteSpace(CredentialStore.Read(RefreshTarget)) || !string.IsNullOrWhiteSpace(CredentialStore.Read(AccessTarget));

    public DriveService(string settingsFolder)
    {
        Directory.CreateDirectory(settingsFolder);
        _settingsPath = Path.Combine(settingsFolder, "drive-settings.json");
        LoadSettings();
        _accessToken = CredentialStore.Read(AccessTarget);
        ClientSecret = CredentialStore.Read(SecretTarget);
        if (DateTimeOffset.TryParse(CredentialStore.Read(ExpiryTarget), out var expiry)) _accessExpires = expiry;
    }

    public void SaveConfiguration()
    {
        JsonObject settings;
        try { settings = File.Exists(_settingsPath) ? JsonNode.Parse(File.ReadAllText(_settingsPath)) as JsonObject ?? new JsonObject() : new JsonObject(); }
        catch { settings = new JsonObject(); }
        settings["clientId"] = ClientId;
        File.WriteAllText(_settingsPath, settings.ToJsonString());
        CredentialStore.Save(SecretTarget, ClientSecret);
    }

    public async Task<DeviceLogin> BeginLoginAsync()
    {
        SaveConfiguration();
        var response = await PostFormAsync("https://oauth2.googleapis.com/device/code", new()
        {
            ["client_id"] = ClientId,
            ["scope"] = Scope
        });
        var json = await ParseAsync(response);
        EnsureSuccess(response, json, "Could not create a Google login code");
        var verification = Text(json, "verification_url_complete", "verification_uri_complete", "verification_url", "verification_uri");
        return new DeviceLogin(verification, Text(json, "user_code"), Text(json, "device_code"),
            Math.Max(5, json["interval"]?.GetValue<int?>() ?? 5), DateTimeOffset.Now.AddSeconds(json["expires_in"]?.GetValue<int?>() ?? 1800));
    }

    public async Task SignInWithBrowserAsync(IProgress<string>? progress = null, CancellationToken cancellationToken = default)
    {
        SaveConfiguration();
        var portProbe = new TcpListener(IPAddress.Loopback, 0);
        portProbe.Start();
        var port = ((IPEndPoint)portProbe.LocalEndpoint).Port;
        portProbe.Stop();
        var redirect = $"http://127.0.0.1:{port}/";
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(48));
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var state = Base64Url(RandomNumberGenerator.GetBytes(24));
        var authorize = "https://accounts.google.com/o/oauth2/v2/auth?" + string.Join("&", new Dictionary<string, string>
        {
            ["client_id"] = ClientId,
            ["redirect_uri"] = redirect,
            ["response_type"] = "code",
            ["scope"] = Scope,
            ["access_type"] = "offline",
            ["prompt"] = "consent",
            ["code_challenge"] = challenge,
            ["code_challenge_method"] = "S256",
            ["state"] = state
        }.Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value)));

        using var listener = new HttpListener();
        listener.Prefixes.Add(redirect);
        listener.Start();
        progress?.Report("Complete sign-in in your browser…");
        Process.Start(new ProcessStartInfo(authorize) { UseShellExecute = true });
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromMinutes(5));
        var context = await listener.GetContextAsync().WaitAsync(timeout.Token);
        var query = context.Request.QueryString;
        var responseHtml = "<!doctype html><meta charset='utf-8'><title>GameVault connected</title><style>body{font:18px Segoe UI;background:#0a0d14;color:#f5f7fb;display:grid;place-items:center;height:100vh;margin:0}main{padding:32px;border:1px solid #334158;border-radius:12px;background:#111722}b{color:#4cc9f0}</style><main><b>GameVault connected.</b><p>You can close this browser tab and return to the Windows app.</p></main>";
        var responseBytes = Encoding.UTF8.GetBytes(responseHtml);
        context.Response.ContentType = "text/html; charset=utf-8";
        context.Response.ContentLength64 = responseBytes.Length;
        await context.Response.OutputStream.WriteAsync(responseBytes, timeout.Token);
        context.Response.Close();
        listener.Stop();

        if (!string.IsNullOrWhiteSpace(query["error"])) throw new InvalidOperationException(query["error_description"] ?? query["error"]);
        if (!string.Equals(query["state"], state, StringComparison.Ordinal)) throw new InvalidOperationException("Google login state validation failed.");
        var code = query["code"] ?? throw new InvalidOperationException("Google did not return an authorization code.");
        progress?.Report("Securing Google Drive session…");
        var form = new Dictionary<string, string>
        {
            ["client_id"] = ClientId,
            ["code"] = code,
            ["code_verifier"] = verifier,
            ["redirect_uri"] = redirect,
            ["grant_type"] = "authorization_code"
        };
        if (!string.IsNullOrWhiteSpace(ClientSecret)) form["client_secret"] = ClientSecret;
        var tokenResponse = await PostFormAsync("https://oauth2.googleapis.com/token", form);
        var tokenJson = await ParseAsync(tokenResponse);
        EnsureSuccess(tokenResponse, tokenJson, "Google token exchange failed");
        SaveTokens(tokenJson);
    }

    public void OpenLoginPage(DeviceLogin login)
    {
        Process.Start(new ProcessStartInfo(login.VerificationUrl) { UseShellExecute = true });
    }

    public async Task CompleteLoginAsync(DeviceLogin login, IProgress<string>? progress = null, CancellationToken cancellationToken = default)
    {
        var interval = login.IntervalSeconds;
        while (DateTimeOffset.Now < login.ExpiresAt)
        {
            await Task.Delay(TimeSpan.FromSeconds(interval), cancellationToken);
            progress?.Report("Waiting for Google authorization…");
            var form = new Dictionary<string, string>
            {
                ["client_id"] = ClientId,
                ["device_code"] = login.DeviceCode,
                ["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code"
            };
            if (!string.IsNullOrWhiteSpace(ClientSecret)) form["client_secret"] = ClientSecret;
            var response = await PostFormAsync("https://oauth2.googleapis.com/token", form);
            var json = await ParseAsync(response);
            if (response.IsSuccessStatusCode && !string.IsNullOrWhiteSpace(Text(json, "access_token")))
            {
                SaveTokens(json);
                return;
            }
            var error = Text(json, "error");
            if (error == "authorization_pending") continue;
            if (error == "slow_down") { interval += 5; continue; }
            throw new InvalidOperationException(Text(json, "error_description", "error"));
        }
        throw new TimeoutException("The Google authorization code expired. Start sign-in again.");
    }

    public async Task<string> SyncAsync(VaultRepository vault)
    {
        var token = await AccessTokenAsync();
        if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("Sign in with Google first.");
        var remoteFile = await FindBackupAsync(token);
        if (remoteFile is null)
        {
            if (vault.UserItemCount() == 0) return "Drive connected. No backup exists, and the empty local vault was not uploaded.";
            await CreateFileAsync(vault.ExportJson(), token);
            return "Created game-vault-backup.json in Google Drive.";
        }

        var id = Text(remoteFile, "id");
        // Remember what the file looked like when it was read, so a write from
        // another device between the read and the upload is not silently erased.
        var seenModified = Text(remoteFile, "modifiedTime");
        var download = await SendAsync(HttpMethod.Get, $"https://www.googleapis.com/drive/v3/files/{id}?alt=media", token);
        var remoteText = await download.Content.ReadAsStringAsync();
        if (!download.IsSuccessStatusCode) throw new InvalidOperationException($"Drive download failed ({(int)download.StatusCode}).");
        var remote = JsonNode.Parse(remoteText) as JsonObject ?? throw new InvalidDataException("The Drive backup is not valid JSON.");
        var remoteUpdated = VaultRepository.Number(remote["updatedAt"]);
        if (vault.UserItemCount() == 0)
        {
            await vault.ImportJsonAsync(remoteText);
            return "Restored the newer Google Drive backup.";
        }
        if (remoteUpdated != vault.UpdatedAt)
        {
            await vault.CreateSnapshotAsync("before-drive-merge");
            var local = JsonNode.Parse(vault.ExportJson()) as JsonObject ?? new JsonObject();
            var merged = MergeVaults(local, remote, preferRemote: remoteUpdated > vault.UpdatedAt);
            merged["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            merged["revision"] = Math.Max(VaultRepository.Number(local["revision"]), VaultRepository.Number(remote["revision"])) + 1;
            await vault.ImportJsonAsync(merged.ToJsonString());
            if (await RemoteChangedSinceAsync(id, seenModified, token))
                return "Google Drive changed while merging. The merge was kept locally and will upload on the next sync.";
            await UploadFileAsync(id, vault.ExportJson(), token);
            return "Merged Windows and Google Drive changes, then saved a recovery snapshot.";
        }
        return "Google Drive and Windows are already synchronized.";
    }

    public async Task<DriveBackupInfo?> BackupInfoAsync()
    {
        var token = await AccessTokenAsync();
        if (string.IsNullOrWhiteSpace(token)) return null;
        var file = await FindBackupAsync(token);
        if (file is null) return null;
        _ = long.TryParse(file["size"]?.ToString(), out var size);
        DateTimeOffset? modified = DateTimeOffset.TryParse(file["modifiedTime"]?.ToString(), out var parsed) ? parsed : null;
        return new DriveBackupInfo(size, modified);
    }

    public void Disconnect()
    {
        CredentialStore.Delete(AccessTarget);
        CredentialStore.Delete(RefreshTarget);
        CredentialStore.Delete(ExpiryTarget);
        CredentialStore.Delete(SecretTarget);
        ClientSecret = "";
        _accessToken = "";
        _accessExpires = default;
    }

    private async Task CreateFileAsync(string json, string token)
    {
        var boundary = "gamevault_" + Guid.NewGuid().ToString("N");
        var body = $"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{{\"name\":\"{FileName}\",\"mimeType\":\"application/json\",\"appProperties\":{{\"gameVault\":\"primary\"}}}}\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n{json}\r\n--{boundary}--";
        var request = new HttpRequestMessage(HttpMethod.Post, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        {
            Content = new StringContent(body, Encoding.UTF8)
        };
        request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse($"multipart/related; boundary={boundary}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Drive file creation failed ({(int)response.StatusCode}).");
        var created = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
        SaveFileId(Text(created ?? new JsonObject(), "id"));
    }

    /// <summary>
    /// Confirms nothing else wrote the backup between reading it and uploading the
    /// merge. Without this the last writer silently wins and the other device's
    /// changes are lost.
    /// </summary>
    private async Task<bool> RemoteChangedSinceAsync(string id, string seenModified, string token)
    {
        if (seenModified.Length == 0) return false;
        try
        {
            var response = await SendAsync(HttpMethod.Get, $"https://www.googleapis.com/drive/v3/files/{Uri.EscapeDataString(id)}?fields=modifiedTime", token);
            if (!response.IsSuccessStatusCode) return false;
            var current = Text(JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject ?? new JsonObject(), "modifiedTime");
            return current.Length > 0 && !string.Equals(current, seenModified, StringComparison.Ordinal);
        }
        catch { return false; }
    }

    private async Task<string> AccessTokenAsync()
    {
        if (HasUsableAccessToken()) return _accessToken;
        // One refresh at a time; concurrent callers would otherwise each spend the
        // refresh token and race to store the result.
        await _tokenGate.WaitAsync();
        try
        {
            if (HasUsableAccessToken()) return _accessToken;
            return await RefreshAccessTokenAsync();
        }
        finally { _tokenGate.Release(); }
    }

    private async Task<string> RefreshAccessTokenAsync()
    {
        var refresh = CredentialStore.Read(RefreshTarget);
        if (string.IsNullOrWhiteSpace(refresh))
        {
            throw new InvalidOperationException("The Google session expired. Sign in again to continue Drive sync.");
        }
        var form = new Dictionary<string, string> { ["client_id"] = ClientId, ["refresh_token"] = refresh, ["grant_type"] = "refresh_token" };
        if (!string.IsNullOrWhiteSpace(ClientSecret)) form["client_secret"] = ClientSecret;
        var response = await PostFormAsync("https://oauth2.googleapis.com/token", form);
        var json = await ParseAsync(response);
        EnsureSuccess(response, json, "Google session expired");
        SaveTokens(json);
        return _accessToken;
    }

    private bool HasUsableAccessToken()
    {
        // Older installations may have a token without the expiry value.
        return !string.IsNullOrWhiteSpace(_accessToken)
            && _accessExpires > DateTimeOffset.MinValue.AddMinutes(2)
            && DateTimeOffset.Now < _accessExpires - TimeSpan.FromMinutes(1);
    }

    private void SaveTokens(JsonObject json)
    {
        _accessToken = Text(json, "access_token");
        _accessExpires = DateTimeOffset.Now.AddSeconds(json["expires_in"]?.GetValue<int?>() ?? 3600);
        CredentialStore.Save(AccessTarget, _accessToken);
        CredentialStore.Save(ExpiryTarget, _accessExpires.ToString("O"));
        var refresh = Text(json, "refresh_token");
        if (!string.IsNullOrWhiteSpace(refresh)) CredentialStore.Save(RefreshTarget, refresh);
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, string token)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await _http.SendAsync(request);
    }

    private Task<HttpResponseMessage> PostFormAsync(string url, Dictionary<string, string> values) => _http.PostAsync(url, new FormUrlEncodedContent(values));
    private static async Task<JsonObject> ParseAsync(HttpResponseMessage response) => JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject ?? new JsonObject();
    private static void EnsureSuccess(HttpResponseMessage response, JsonObject json, string fallback)
    {
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(Text(json, "error_description", "error") is { Length: > 0 } message ? message : fallback);
    }
    private static string Text(JsonObject json, params string[] keys)
    {
        foreach (var key in keys) if (!string.IsNullOrWhiteSpace(json[key]?.ToString())) return json[key]!.ToString();
        return "";
    }
    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private void LoadSettings()
    {
        try
        {
            if (File.Exists(_settingsPath) && JsonNode.Parse(File.ReadAllText(_settingsPath)) is JsonObject settings)
                ClientId = settings["clientId"]?.ToString() ?? DefaultClientId;
        }
        catch { ClientId = DefaultClientId; }
    }

    private async Task<JsonObject?> FindBackupAsync(string token)
    {
        var savedId = LoadFileId();
        if (savedId.Length > 0)
        {
            var response = await SendAsync(HttpMethod.Get, $"https://www.googleapis.com/drive/v3/files/{Uri.EscapeDataString(savedId)}?fields=id,name,modifiedTime,size&supportsAllDrives=true", token);
            if (response.IsSuccessStatusCode) return JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
        }
        var query = Uri.EscapeDataString($"name='{FileName}' and trashed=false");
        var list = await SendAsync(HttpMethod.Get, $"https://www.googleapis.com/drive/v3/files?q={query}&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size,appProperties)&pageSize=10", token);
        var json = JsonNode.Parse(await list.Content.ReadAsStringAsync()) as JsonObject ?? new JsonObject();
        EnsureSuccess(list, json, "Could not list Google Drive backups");
        var file = (json["files"] as JsonArray)?.OfType<JsonObject>()
            .OrderByDescending(item => Text(item["appProperties"] as JsonObject ?? new JsonObject(), "gameVault") == "primary")
            .FirstOrDefault();
        if (file is not null) SaveFileId(Text(file, "id"));
        return file;
    }

    private async Task UploadFileAsync(string id, string json, string token)
    {
        var upload = new HttpRequestMessage(HttpMethod.Patch, $"https://www.googleapis.com/upload/drive/v3/files/{Uri.EscapeDataString(id)}?uploadType=media")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        upload.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var result = await _http.SendAsync(upload);
        if (!result.IsSuccessStatusCode) throw new InvalidOperationException($"Drive upload failed ({(int)result.StatusCode}).");
    }

    /// <summary>
    /// Pure vault merge. Public so the smoke suite can cover it directly — this is
    /// the most failure-prone code in the application and previously had no test.
    /// </summary>
    /// <summary>Append-only diagnostic logs: reconciled by keeping the newest entries, never by appending both sides.</summary>
    private static readonly string[] LogArrays = ["audit"];

    /// <summary>Reads a millisecond timestamp regardless of whether it is stored as int, long or text.</summary>
    private static long At(JsonObject? item) => long.TryParse(item?["at"]?.ToString(), out var value) ? value : 0;

    public static JsonObject MergeVaults(JsonObject local, JsonObject remote, bool preferRemote)
    {
        var preferred = (preferRemote ? remote : local).DeepClone() as JsonObject ?? new JsonObject();
        var secondary = preferRemote ? local : remote;
        var names = local.Concat(remote).Where(pair => pair.Value is JsonArray).Select(pair => pair.Key).Distinct(StringComparer.Ordinal).ToList();
        foreach (var name in names)
        {
            /* Append-only logs (audit) and tombstones (deletions) have no record
               identity, so the loop below would hit the "no candidates" branch for
               every entry and append the other side's whole array on every sync.
               That, uncapped, is what grew the vault past 600 MB (audit) and left
               18k copies of 2 real deletions. Both are reconciled after the loop. */
            if (LogArrays.Contains(name, StringComparer.Ordinal) || name == "deletions") continue;
            var output = preferred[name] as JsonArray;
            if (output is null)
            {
                output = new JsonArray();
                preferred[name] = output;
            }
            /* Match on any shared identity rather than one primary key: the same
               title can arrive keyed by rawgId from one device and by imdbId from
               another, which previously produced a duplicate on every merge. */
            var existing = output.OfType<JsonObject>()
                .SelectMany(item => VaultIdentity.Candidates(item, name)).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var item in (secondary[name] as JsonArray)?.OfType<JsonObject>() ?? [])
            {
                var candidates = VaultIdentity.Candidates(item, name).ToList();
                if (candidates.Count == 0) { output.Add(item.DeepClone()); continue; }
                if (candidates.Any(existing.Contains)) continue;
                foreach (var candidate in candidates) existing.Add(candidate);
                output.Add(item.DeepClone());
            }
        }
        /* Only arrays were merged, so any non-array field that existed on one side
           only — exactly the web-only data the architecture promises to preserve —
           was dropped here and then uploaded back, erasing it from Drive. */
        foreach (var pair in secondary)
        {
            if (pair.Value is JsonArray || preferred.ContainsKey(pair.Key)) continue;
            preferred[pair.Key] = pair.Value?.DeepClone();
        }

        /* Reconcile the append-only logs skipped above: take the newest entries
           from each side (so a legacy multi-million-entry log costs one sort, not
           a giant merged array), drop exact duplicates, and keep the newest few.
           Matches the web app, which caps its own audit log the same way. */
        foreach (var name in LogArrays)
        {
            IEnumerable<JsonObject> Newest(JsonArray? array) => (array?.OfType<JsonObject>() ?? [])
                .OrderByDescending(At).Take(VaultRepository.MaxAuditEntries);
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var trimmed = new JsonArray();
            foreach (var item in Newest(preferred[name] as JsonArray).Concat(Newest(secondary[name] as JsonArray))
                .OrderByDescending(At))
            {
                if (trimmed.Count >= VaultRepository.MaxAuditEntries) break;
                if (seen.Add(item.ToJsonString())) trimmed.Add(item.DeepClone());
            }
            preferred[name] = trimmed;
        }

        /* Deletion markers are tombstones keyed by (collection, identity); the
           timestamp only decides which copy is newest. Keep one marker per key —
           the newest — instead of appending a fresh duplicate on every sync. */
        var dedupedDeletions = new JsonArray();
        var newestByKey = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        foreach (var marker in ((preferred["deletions"] as JsonArray)?.OfType<JsonObject>() ?? [])
            .Concat((secondary["deletions"] as JsonArray)?.OfType<JsonObject>() ?? []))
        {
            var key = Text(marker, "collection") + " " + Text(marker, "identity");
            if (key == " ") continue;
            if (!newestByKey.TryGetValue(key, out var kept) || At(marker) > At(kept))
                newestByKey[key] = marker;
        }
        foreach (var marker in newestByKey.Values.OrderByDescending(At))
            dedupedDeletions.Add(marker.DeepClone());
        preferred["deletions"] = dedupedDeletions;

        ApplyHiddenWins(preferred, "hiddenGames", ["upcoming", "catalogExtra"]);
        ApplyHiddenWins(preferred, "upcomingRemoved", ["upcoming"]);
        ApplyHiddenWins(preferred, "hiddenMovies", ["movieWatchlist", "watchingMovies"]);
        ApplyHiddenWins(preferred, "hiddenSeries", ["seriesWatchlist", "watchingSeries"]);
        ApplyDeletionMarkers(preferred);
        return preferred;
    }

    private static void ApplyDeletionMarkers(JsonObject root)
    {
        var markers = (root["deletions"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
        foreach (var group in markers.GroupBy(marker => Text(marker, "collection"), StringComparer.Ordinal))
        {
            if (group.Key.Length == 0 || root[group.Key] is not JsonArray active) continue;
            var identities = group.Select(marker => Text(marker, "identity")).Where(value => value.Length > 0).ToHashSet(StringComparer.OrdinalIgnoreCase);
            /* Compare against every identity the record could be known by. A marker
               written on a device that only knew the IMDb id must still match the
               same title on a device that also has a TMDB id, otherwise the delete
               silently fails to travel and the title reappears. */
            foreach (var item in active.OfType<JsonObject>()
                         .Where(item => VaultIdentity.Candidates(item, group.Key).Any(identities.Contains)).ToList())
                active.Remove(item);
        }
    }

    private static void ApplyHiddenWins(JsonObject root, string hiddenName, string[] activeNames)
    {
        var hidden = (root[hiddenName] as JsonArray)?.OfType<JsonObject>()
            .SelectMany(item => VaultIdentity.Candidates(item, hiddenName)).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
        foreach (var name in activeNames)
            if (root[name] is JsonArray active)
                foreach (var item in active.OfType<JsonObject>()
                             .Where(item => VaultIdentity.Candidates(item, name).Any(hidden.Contains)).ToList())
                    active.Remove(item);
    }


    private string LoadFileId()
    {
        try { return File.Exists(_settingsPath) && JsonNode.Parse(File.ReadAllText(_settingsPath)) is JsonObject settings ? settings["fileId"]?.ToString() ?? "" : ""; }
        catch { return ""; }
    }

    private void SaveFileId(string id)
    {
        if (id.Length == 0) return;
        JsonObject settings;
        try { settings = File.Exists(_settingsPath) ? JsonNode.Parse(File.ReadAllText(_settingsPath)) as JsonObject ?? new JsonObject() : new JsonObject(); }
        catch { settings = new JsonObject(); }
        settings["clientId"] = ClientId;
        settings["fileId"] = id;
        File.WriteAllText(_settingsPath, settings.ToJsonString());
    }
}
