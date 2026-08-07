using System.Collections.Concurrent;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace SinuGameVault.Services;

/// <summary>
/// Loads card artwork through an explicit download-then-decode path instead of
/// handing a remote URL to <see cref="BitmapImage.UriSource"/>.
///
/// Letting WPF fetch the URL itself was unreliable: a poster could come back as a
/// 1x1 bitmap with no DownloadFailed event, and because the result was cached the
/// card then showed its initials placeholder for the rest of the session. Movie
/// and TV posters were blank for exactly that reason while game art happened to
/// survive.
///
/// Artwork is now downloaded once with the app's own HTTP stack, kept in
/// %LOCALAPPDATA%\SinuGameVault\Artwork, and decoded from that file at the size
/// the card actually displays. Titles keep their images offline, a slow network
/// no longer means a blank library, and a failed fetch is retried next time
/// rather than remembered forever.
///
/// Usage from XAML:
///   &lt;Image app:Artwork.Url="{Binding Image}" app:Artwork.DecodeWidth="320"/&gt;
/// </summary>
public static class Artwork
{
    private const int MaxEntries = 400;

    private static readonly string Folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SinuGameVault", "Artwork");

    private static readonly HttpClient Http = CreateClient();
    private static readonly object Gate = new();
    private static readonly Dictionary<string, ImageSource> Cache = new(StringComparer.Ordinal);
    private static readonly LinkedList<string> Order = new();
    // One download per URL no matter how many cards ask for it at once.
    private static readonly ConcurrentDictionary<string, Task<ImageSource?>> InFlight = new(StringComparer.Ordinal);

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        // Some image CDNs answer requests without a user agent with an error page.
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "SinuGameVault/1.0");
        return client;
    }

    public static readonly DependencyProperty UrlProperty = DependencyProperty.RegisterAttached(
        "Url", typeof(string), typeof(Artwork), new PropertyMetadata("", OnChanged));

    public static readonly DependencyProperty DecodeWidthProperty = DependencyProperty.RegisterAttached(
        "DecodeWidth", typeof(int), typeof(Artwork), new PropertyMetadata(320, OnChanged));

    public static void SetUrl(DependencyObject element, string value) => element.SetValue(UrlProperty, value);
    public static string GetUrl(DependencyObject element) => (string)element.GetValue(UrlProperty);
    public static void SetDecodeWidth(DependencyObject element, int value) => element.SetValue(DecodeWidthProperty, value);
    public static int GetDecodeWidth(DependencyObject element) => (int)element.GetValue(DecodeWidthProperty);

    private static async void OnChanged(DependencyObject element, DependencyPropertyChangedEventArgs args)
    {
        if (element is not Image target) return;
        var url = GetUrl(target);
        var width = GetDecodeWidth(target);
        target.Source = null;
        if (string.IsNullOrWhiteSpace(url)) return;

        var image = await GetAsync(url, width);
        // Panels recycle their containers, so the row behind this Image may have
        // changed while the download was running. Only paint what is still wanted.
        if (image is not null && GetUrl(target) == url) target.Source = image;
    }

    /// <summary>The decoded artwork, downloading and caching it on first use.</summary>
    public static Task<ImageSource?> GetAsync(string url, int decodeWidth)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri)) return Task.FromResult<ImageSource?>(null);
        if (decodeWidth <= 0) decodeWidth = 320;
        var key = decodeWidth + "|" + url;

        lock (Gate)
        {
            if (Cache.TryGetValue(key, out var cached))
            {
                Order.Remove(key);
                Order.AddLast(key);
                return Task.FromResult<ImageSource?>(cached);
            }
        }

        return InFlight.GetOrAdd(key, _ => FetchAsync(uri, key, decodeWidth));
    }

    private static async Task<ImageSource?> FetchAsync(Uri uri, string key, int decodeWidth)
    {
        try
        {
            var image = await Task.Run(async () =>
            {
                var path = uri.IsFile ? uri.LocalPath : CachedFile(uri.AbsoluteUri);
                if (!File.Exists(path))
                {
                    if (uri.IsFile) return null;
                    var bytes = await Http.GetByteArrayAsync(uri);
                    if (bytes.Length == 0) return null;
                    Directory.CreateDirectory(Folder);
                    // Write beside the target and move into place so a cancelled
                    // download cannot leave a truncated file to be read forever.
                    var staging = path + ".part";
                    await File.WriteAllBytesAsync(staging, bytes);
                    File.Move(staging, path, overwrite: true);
                    TrimFolder();
                }
                return Decode(path, decodeWidth);
            });

            if (image is null) return null;
            lock (Gate)
            {
                Cache[key] = image;
                Order.AddLast(key);
                while (Order.Count > MaxEntries && Order.First is { } oldest)
                {
                    Cache.Remove(oldest.Value);
                    Order.RemoveFirst();
                }
            }
            return image;
        }
        catch
        {
            // A missing host, a corrupt file or a refused connection must never
            // take the window down; the card keeps its placeholder and the next
            // attempt starts clean.
            return null;
        }
        finally
        {
            InFlight.TryRemove(key, out _);
        }
    }

    private static ImageSource? Decode(string path, int decodeWidth)
    {
        try
        {
            using var stream = File.OpenRead(path);
            var image = new BitmapImage();
            image.BeginInit();
            image.StreamSource = stream;
            image.DecodePixelWidth = decodeWidth;
            // OnLoad reads everything up front so the stream can close here and
            // the bitmap can be frozen for use on the UI thread.
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.EndInit();
            image.Freeze();
            return image.PixelWidth > 1 ? image : null;
        }
        catch
        {
            /* A half written or non-image file decodes to nothing. Drop it so the
               next request downloads it again instead of failing forever. */
            try { File.Delete(path); } catch { /* best effort */ }
            return null;
        }
    }

    /// <summary>
    /// Keeps the artwork folder under a size budget, dropping the least recently
    /// used files first. Nothing trimmed it before, so it grew without limit — and
    /// a full disk is what makes an otherwise atomic vault save fail.
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
