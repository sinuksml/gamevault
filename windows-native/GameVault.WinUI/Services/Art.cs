using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using SinuGameVault.Services;

namespace SinuGameVault;

/// <summary>
/// Paints artwork into an Image from the on-disk cache.
///
/// Usage: &lt;Image local:Art.Url="{x:Bind Row.Image}" local:Art.DecodeWidth="360"/&gt;.
/// The picture is decoded at the width it is shown, not at source resolution,
/// which is what keeps a library of several hundred posters light on memory.
/// </summary>
public sealed class Art
{
    public static readonly DependencyProperty UrlProperty = DependencyProperty.RegisterAttached(
        "Url", typeof(string), typeof(Art), new PropertyMetadata("", OnChanged));

    public static readonly DependencyProperty DecodeWidthProperty = DependencyProperty.RegisterAttached(
        "DecodeWidth", typeof(int), typeof(Art), new PropertyMetadata(360));

    public static void SetUrl(DependencyObject element, string value) => element.SetValue(UrlProperty, value ?? "");
    public static string GetUrl(DependencyObject element) => (string)element.GetValue(UrlProperty);
    public static void SetDecodeWidth(DependencyObject element, int value) => element.SetValue(DecodeWidthProperty, value);
    public static int GetDecodeWidth(DependencyObject element) => (int)element.GetValue(DecodeWidthProperty);

    private static async void OnChanged(DependencyObject element, DependencyPropertyChangedEventArgs args)
    {
        if (element is not Image target) return;
        var url = GetUrl(target);
        target.Source = null;
        if (string.IsNullOrWhiteSpace(url)) return;
        try
        {
            var path = await ArtworkCache.GetFileAsync(url);
            // Lists recycle their containers, so the row behind this Image may have
            // changed while the download was running. Only paint what is still wanted.
            if (path is null || GetUrl(target) != url) return;
            var bitmap = new BitmapImage { DecodePixelWidth = GetDecodeWidth(target), DecodePixelType = DecodePixelType.Logical };
            // A half written or non-image file never decodes; drop it so the next
            // request downloads it again instead of failing forever.
            bitmap.ImageFailed += (_, _) => ArtworkCache.Discard(path);
            bitmap.UriSource = new Uri(path);
            target.Source = bitmap;
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Artwork", "Artwork could not be shown", ex);
        }
    }
}
