using System.Net.Http.Headers;
using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;

namespace SinuGameVault.Services;

public sealed class BiglyBtService
{
    private const string EndpointTarget = "SinuGameVault/BiglyBT/Endpoint";
    private const string TokenTarget = "SinuGameVault/BiglyBT/Token";
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20) };

    public string Endpoint
    {
        get => CredentialStore.Read(EndpointTarget).TrimEnd('/');
        set => CredentialStore.Save(EndpointTarget, value.Trim().TrimEnd('/'));
    }
    public bool Connected => CredentialStore.Read(TokenTarget).Length > 0;

    public async Task SignInAsync(string username, string password)
    {
        EnsureEndpoint();
        var payload = new JsonObject { ["username"] = username.Trim(), ["password"] = password };
        using var response = await _http.PostAsync($"{Endpoint}/__native/login", Json(payload));
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(body?["message"]?.ToString() ?? $"BiglyBT sign-in failed ({(int)response.StatusCode}).");
        var token = body?["token"]?.ToString() ?? "";
        if (token.Length == 0) throw new InvalidOperationException("BiglyBT did not return a session token.");
        CredentialStore.Save(TokenTarget, token);
    }

    public void Disconnect() => CredentialStore.Delete(TokenTarget);

    public async Task<JsonObject> RpcAsync(string method, JsonObject? arguments = null)
    {
        EnsureEndpoint();
        var token = CredentialStore.Read(TokenTarget);
        if (token.Length == 0) throw new InvalidOperationException("Sign in to BiglyBT first.");
        var request = new HttpRequestMessage(HttpMethod.Post, $"{Endpoint}/__native/api")
        {
            Content = Json(new JsonObject { ["method"] = method, ["arguments"] = arguments ?? new JsonObject() })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        var result = JsonNode.Parse(text) as JsonObject ?? new JsonObject();
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
        {
            Disconnect();
            throw new InvalidOperationException("The saved BiglyBT login expired. Sign in again.");
        }
        if (!response.IsSuccessStatusCode || !string.Equals(result["result"]?.ToString(), "success", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(result["message"]?.ToString() ?? result["result"]?.ToString() ?? "BiglyBT request failed.");
        return result["arguments"] as JsonObject ?? new JsonObject();
    }

    public Task<JsonObject> TorrentsAsync() => RpcAsync("torrent-get", new JsonObject
    {
        ["fields"] = new JsonArray("id", "name", "status", "percentDone", "totalSize", "downloadedEver", "uploadedEver", "rateDownload", "rateUpload", "eta", "peersConnected", "peersSendingToUs", "peersGettingFromUs", "error", "errorString", "queuePosition", "bandwidthPriority", "isFinished", "hashString")
    });

    public Task StartAsync(int id) => RpcAsync("torrent-start", Ids(id));
    public Task StopAsync(int id) => RpcAsync("torrent-stop", Ids(id));
    public Task RemoveAsync(int id, bool deleteFiles) => RpcAsync("torrent-remove", new JsonObject { ["ids"] = new JsonArray(id), ["delete-local-data"] = deleteFiles });
    public Task AddMagnetAsync(string magnet) => RpcAsync("torrent-add", new JsonObject { ["filename"] = magnet });
    public Task PriorityAsync(int id, int priority) => RpcAsync("torrent-set", new JsonObject { ["ids"] = new JsonArray(id), ["bandwidthPriority"] = priority });

    private static JsonObject Ids(int id) => new() { ["ids"] = new JsonArray(id) };
    private static StringContent Json(JsonObject value) => new(value.ToJsonString(), Encoding.UTF8, "application/json");
    private void EnsureEndpoint()
    {
        if (!Uri.TryCreate(Endpoint, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidOperationException("Enter the HTTPS Cloudflare BiglyBT gateway address in Settings.");
    }
}
