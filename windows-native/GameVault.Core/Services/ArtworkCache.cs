using System.Security.Cryptography;
using System.Text;

namespace SinuGameVault.Services;

/// <summary>
/// Keeps artwork on disk so the interface always decodes a local file.
///
/// Handing a remote URL straight to an image control was unreliable: a poster
/// could come back as a 1x1 bitmap with no failure raised, and because the result
/// was cached the card showed its placeholder for the rest of the session.
/// Artwork is downloaded once with the app's own HTTP stack into
/// %LOCALAPPDATA%\SinuGameVault\Artwork. Titles keep their images offline, and a
/// failed fetch is retried next time rather than remembered forever.
/// </summary>
public static class ArtworkCache
{
    private static readonly string Folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SinuGameVault", "Artwork");

    private static readonly HttpClient Http = CreateClient();
    // One download per URL no matter how many cards ask for it at once.
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, Lazy<Task<string?>>> InFlight = new(StringComparer.Ordinal);
    private static readonly SemaphoreSlim Downloads = new(6);

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        // Some image CDNs answer requests without a user agent with an error page.
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "SinuGameVault/1.0");
        return client;
    }

    /// <summary>The local file for a piece of artwork, downloading it on first use; null when unavailable.</summary>
    public static async Task<string?> GetFileAsync(string url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
        if (uri.IsFile) return File.Exists(uri.LocalPath) ? uri.LocalPath : null;
        var path = CachedFile(uri.AbsoluteUri);
        if (File.Exists(path)) return path;

        var pending = InFlight.GetOrAdd(path, _ => new Lazy<Task<string?>>(() => DownloadAsync(uri, path)));
        try { return await pending.Value; }
        finally
        {
            // A late waiter must not remove a newer retry for the same cover.
            ((ICollection<KeyValuePair<string, Lazy<Task<string?>>>>)InFlight).Remove(new(path, pending));
        }
    }

    /// <summary>Drops a cached file that turned out not to be a readable image, so the next request fetches it again.</summary>
    public static void Discard(string path)
    {
        try
        {
            if (Path.GetFullPath(path).StartsWith(Path.GetFullPath(Folder), StringComparison.OrdinalIgnoreCase)) File.Delete(path);
        }
        catch { /* Best effort. */ }
    }

    private static async Task<string?> DownloadAsync(Uri uri, string path)
    {
        await Downloads.WaitAsync();
        try
        {
            return await Task.Run(async () =>
            {
                var bytes = await Http.GetByteArrayAsync(uri);
                if (bytes.Length == 0) return null;
                Directory.CreateDirectory(Folder);
                // Write beside the target and move into place so a cancelled
                // download cannot leave a truncated file to be read forever.
                var staging = path + "." + Guid.NewGuid().ToString("N") + ".part";
                try
                {
                    await File.WriteAllBytesAsync(staging, bytes);
                    File.Move(staging, path, overwrite: true);
                }
                finally { if (File.Exists(staging)) File.Delete(staging); }
                TrimFolder();
                return path;
            });
        }
        catch
        {
            // A missing host or a refused connection must never take the window
            // down; the card keeps its placeholder and the next attempt starts clean.
            return null;
        }
        finally { Downloads.Release(); }
    }

    /// <summary>
    /// Keeps the artwork folder under a size budget, dropping the least recently
    /// used files first. A full disk is what makes an otherwise atomic vault save fail.
    /// </summary>
    private static void TrimFolder()
    {
        const long budgetBytes = 300L * 1024 * 1024;
        try
        {
            var files = new DirectoryInfo(Folder).GetFiles("*.img");
            var total = files.Sum(file => file.Length);
            if (total <= budgetBytes) return;
            foreach (var file in files.OrderBy(file => file.LastAccessTimeUtc))
            {
                if (total <= budgetBytes) break;
                total -= file.Length;
                try { file.Delete(); } catch { /* In use: it is retried next time. */ }
            }
        }
        catch { /* Housekeeping must never break artwork loading. */ }
    }

    private static string CachedFile(string url)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(url));
        return Path.Combine(Folder, Convert.ToHexString(hash)[..32].ToLowerInvariant() + ".img");
    }
}
