using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using SinuGameVault;
using SinuGameVault.Models;

internal static class VisualChecks
{
    public static void Run()
    {
        Exception? error = null;
        var thread = new Thread(() =>
        {
            try { Render(); }
            catch (Exception ex) { error = ex; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (error is not null) throw new InvalidOperationException("Visual checks failed", error);
    }

    private static void Render()
    {
        var app = new App();
        app.InitializeComponent();
        // Never show the real window: Loaded would read and synchronize personal data.
        var window = new MainWindow();
        var template = (DataTemplate)window.Resources["LibraryCardTemplate"];
        var output = Path.GetFullPath("visual-output");
        Directory.CreateDirectory(output);
        foreach (var light in new[] { false, true })
        {
            foreach (var pair in new Dictionary<string, string>
            {
                ["WindowBrush"] = light ? "#EEF3F8" : "#0A0D14",
                ["CardBrush"] = light ? "#F8FAFD" : "#111925",
                ["TextBrush"] = light ? "#182131" : "#F5F7FB",
                ["MutedBrush"] = light ? "#526177" : "#A7B3C7",
                ["AccentBrush"] = light ? "#086C9C" : "#4CC9F0",
                ["PanelRaisedBrush"] = light ? "#E5ECF4" : "#182131",
                ["CardBorderBrush"] = light ? "#BCC8D7" : "#2B3A51"
            }) app.Resources[pair.Key] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(pair.Value));

            foreach (var width in new[] { 1080, 1440 })
            {
                var root = new StackPanel { Background = (Brush)app.Resources["WindowBrush"], Width = width };
                root.Children.Add(new TextBlock { Text = "Library - layout test fixtures", FontSize = 28, Margin = new Thickness(24) });
                var cards = new WrapPanel { Margin = new Thickness(24, 0, 24, 24) };
                root.Children.Add(cards);
                foreach (var title in new[] { "A short title", "Assassin's Creed Black Flag Resynced", "A deliberately very long game title to verify three-line truncation and stable actions", "Subscription game" })
                {
                    var card = (Button)template.LoadContent();
                    card.DataContext = new LibraryRow { Name = title, Collection = "subscriptionGames", Genre = "Adventure", Date = "06-April-2026", Rating = 8.5 };
                    cards.Children.Add(card);
                }
                root.Measure(new Size(width, double.PositiveInfinity));
                root.Arrange(new Rect(0, 0, width, root.DesiredSize.Height));
                root.UpdateLayout();
                var heights = cards.Children.Cast<Button>().Select(card => card.ActualHeight).ToArray();
                if (heights.Max() - heights.Min() > 1) throw new Exception("Card heights vary with title length");
                var bitmap = new RenderTargetBitmap(width, (int)Math.Ceiling(root.ActualHeight), 96, 96, PixelFormats.Pbgra32);
                bitmap.Render(root);
                var encoder = new PngBitmapEncoder();
                encoder.Frames.Add(BitmapFrame.Create(bitmap));
                using var file = File.Create(Path.Combine(output, $"library-{(light ? "light" : "dark")}-{width}.png"));
                encoder.Save(file);
            }
        }
        Console.WriteLine($"PASS: four native WPF card layout renders: {output}");
    }
}
