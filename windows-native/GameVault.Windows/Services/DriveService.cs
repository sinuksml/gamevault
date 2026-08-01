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
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(45) };
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
    }

    public void SaveConfiguration()
    {
        File.WriteAllText(_settingsPath, new JsonObject { ["clientId"] = ClientId }.ToJsonString());
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
        var query = Uri.EscapeDataString($"name='{FileName}' and trashed=false");
        var list = await SendAsync(HttpMethod.Get, $"https://www.googleapis.com/drive/v3/files?q={query}&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size)&pageSize=10", token);
        var listJson = JsonNode.Parse(await list.Content.ReadAsStringAsync()) as JsonObject ?? new JsonObject();
        EnsureSuccess(list, listJson, "Could not list Google Drive backups");
        var remoteFile = (listJson["files"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault();
        if (remoteFile is null)
        {
            if (vault.UserItemCount() == 0) return "Drive connected. No backup exists, and the empty local vault was not uploaded.";
            await CreateFileAsync(vault.ExportJson(), token);
            return "Created game-vault-backup.json in Google Drive.";
        }

        var id = Text(remoteFile, "id");
        var download = await SendAsync(HttpMethod.Get, $"https://www.googleapis.com/drive/v3/files/{id}?alt=media", token);
        var remoteText = await download.Content.ReadAsStringAsync();
        if (!download.IsSuccessStatusCode) throw new InvalidOperationException($"Drive download failed ({(int)download.StatusCode}).");
        var remote = JsonNode.Parse(remoteText) as JsonObject ?? throw new InvalidDataException("The Drive backup is not valid JSON.");
        var remoteUpdated = remote["updatedAt"]?.GetValue<long?>() ?? 0;
        if (remoteUpdated > vault.UpdatedAt || vault.UserItemCount() == 0)
        {
            await vault.ImportJsonAsync(remoteText);
            return "Restored the newer Google Drive backup.";
        }
        if (vault.UpdatedAt > remoteUpdated && vault.UserItemCount() > 0)
        {
            var upload = new HttpRequestMessage(HttpMethod.Patch, $"https://www.googleapis.com/upload/drive/v3/files/{id}?uploadType=media")
            {
                Content = new StringContent(vault.ExportJson(), Encoding.UTF8, "application/json")
            };
            upload.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var result = await _http.SendAsync(upload);
            if (!result.IsSuccessStatusCode) throw new InvalidOperationException($"Drive upload failed ({(int)result.StatusCode}).");
            return "Saved the newer Windows vault to Google Drive.";
        }
        return "Google Drive and Windows are already synchronized.";
    }

    public async Task<DriveBackupInfo?> BackupInfoAsync()
    {
        var token = await AccessTokenAsync();
        if (string.IsNullOrWhiteSpace(token)) return null;
        var query = Uri.EscapeDataString($"name='{FileName}' and trashed=false");
        var response = await SendAsync(HttpMethod.Get,
            $"https://www.googleapis.com/drive/v3/files?q={query}&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime,size)&pageSize=1", token);
        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject ?? new JsonObject();
        EnsureSuccess(response, json, "Could not read Google Drive backup information");
        var file = (json["files"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault();
        if (file is null) return null;
        _ = long.TryParse(file["size"]?.ToString(), out var size);
        DateTimeOffset? modified = DateTimeOffset.TryParse(file["modifiedTime"]?.ToString(), out var parsed) ? parsed : null;
        return new DriveBackupInfo(size, modified);
    }

    public void Disconnect()
    {
        CredentialStore.Delete(AccessTarget);
        CredentialStore.Delete(RefreshTarget);
        _accessToken = "";
        _accessExpires = default;
    }

    private async Task CreateFileAsync(string json, string token)
    {
        var boundary = "gamevault_" + Guid.NewGuid().ToString("N");
        var body = $"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{{\"name\":\"{FileName}\",\"mimeType\":\"application/json\"}}\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n{json}\r\n--{boundary}--";
        var request = new HttpRequestMessage(HttpMethod.Post, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        {
            Content = new StringContent(body, Encoding.UTF8)
        };
        request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse($"multipart/related; boundary={boundary}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Drive file creation failed ({(int)response.StatusCode}).");
    }

    private async Task<string> AccessTokenAsync()
    {
        if (!string.IsNullOrWhiteSpace(_accessToken) && DateTimeOffset.Now < _accessExpires.Subtract(TimeSpan.FromMinutes(1))) return _accessToken;
        var refresh = CredentialStore.Read(RefreshTarget);
        if (string.IsNullOrWhiteSpace(refresh)) return CredentialStore.Read(AccessTarget);
        var form = new Dictionary<string, string> { ["client_id"] = ClientId, ["refresh_token"] = refresh, ["grant_type"] = "refresh_token" };
        if (!string.IsNullOrWhiteSpace(ClientSecret)) form["client_secret"] = ClientSecret;
        var response = await PostFormAsync("https://oauth2.googleapis.com/token", form);
        var json = await ParseAsync(response);
        EnsureSuccess(response, json, "Google session expired");
        SaveTokens(json);
        return _accessToken;
    }

    private void SaveTokens(JsonObject json)
    {
        _accessToken = Text(json, "access_token");
        _accessExpires = DateTimeOffset.Now.AddSeconds(json["expires_in"]?.GetValue<int?>() ?? 3600);
        CredentialStore.Save(AccessTarget, _accessToken);
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
}
