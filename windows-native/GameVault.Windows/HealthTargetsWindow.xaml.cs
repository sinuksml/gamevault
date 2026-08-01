using System.Text.Json.Nodes;
using System.Windows;

namespace SinuGameVault;

public partial class HealthTargetsWindow : Window
{
    public JsonObject Targets { get; private set; }
    public HealthTargetsWindow(JsonObject targets)
    {
        InitializeComponent(); Targets = targets.DeepClone() as JsonObject ?? [];
        PlantBox.Text = Value("plantMeals", 10); FishBox.Text = Value("fishMeals", 2); RedBox.Text = Value("redMeatMeals", 1); FriedBox.Text = Value("friedMeals", 1);
        FruitBox.Text = Value("fruitServings", 14); VegBox.Text = Value("vegetableServings", 21); ActivityBox.Text = Value("activityMinutes", 150); StrengthBox.Text = Value("strengthDays", 2);
    }
    private string Value(string key, int fallback) => Targets[key]?.ToString() ?? fallback.ToString();
    private void Save_Click(object sender, RoutedEventArgs e)
    {
        foreach (var entry in new[] { ("plantMeals", PlantBox), ("fishMeals", FishBox), ("redMeatMeals", RedBox), ("friedMeals", FriedBox), ("fruitServings", FruitBox), ("vegetableServings", VegBox), ("activityMinutes", ActivityBox), ("strengthDays", StrengthBox) })
            if (int.TryParse(entry.Item2.Text, out var value)) Targets[entry.Item1] = Math.Max(0, value);
        DialogResult = true;
    }
}
