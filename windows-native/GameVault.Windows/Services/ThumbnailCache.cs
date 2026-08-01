using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace SinuGameVault.Services;

/// <summary>
/// Decodes artwork at the size it is actually displayed.
///
/// Binding a URL straight to Image.Source made WPF decode every poster at its
/// full source resolution — a 1000x1500 poster held about 6 MB of pixels to fill
/// a 252-pixel-wide card. Across a large library that is gigabytes of bitmaps.
/// DecodePixelWidth cuts that by roughly twenty times, and identical artwork is
/// shared between the card, list and detail views instead of decoded per view.
/// </summary>
public static class ThumbnailCache
{
    private const int MaxEntries = 400;
    private static readonly object Gate = new();
    private static readonly Dictionary<string, BitmapImage> Cache = new(StringComparer.Ordinal);
    private static readonly LinkedList<string> Order = new();

    public static ImageSource? Load(string? source, int decodeWidth)
    {
        if (string.IsNullOrWhiteSpace(source)) return null;
        if (!Uri.TryCreate(source, UriKind.Absolute, out var uri)) return null;
        if (decodeWidth <= 0) decodeWidth = 300;
        var key = decodeWidth.ToString(CultureInfo.InvariantCulture) + "|" + source;

        lock (Gate)
        {
            if (Cache.TryGetValue(key, out var cached))
            {
                Order.Remove(key);
                Order.AddLast(key);
                return cached;
            }
        }

        try
        {
            var image = new BitmapImage();
            image.BeginInit();
            image.UriSource = uri;
            image.DecodePixelWidth = decodeWidth;
            // OnLoad closes the underlying stream immediately, so files stay
            // deletable and the decoded bitmap is not tied to the source.
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.EndInit();
            // A remote image is still downloading here and cannot be frozen yet.
            if (image.CanFreeze) image.Freeze();

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
            // A missing or corrupt file must never take the window down; the card
            // simply shows its placeholder.
            return null;
        }
    }
}

/// <summary>Binds an artwork path or URL to a right-sized bitmap. ConverterParameter is the decode width in pixels.</summary>
public sealed class ThumbnailConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var width = 300;
        if (parameter is string text && int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)) width = parsed;
        else if (parameter is int direct) width = direct;
        return ThumbnailCache.Load(value as string, width);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
