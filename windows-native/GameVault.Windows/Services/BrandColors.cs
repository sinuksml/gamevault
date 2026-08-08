namespace SinuGameVault.Services;

/// <summary>
/// The colour each service is recognised by.
///
/// Spending colours were handed out by position in a palette, so GeForce NOW could
/// appear red and Game Pass yellow — the opposite of how anyone recognises them.
/// Known services now keep their own brand colour everywhere they are shown.
/// </summary>
public static class BrandColors
{
    public static string? For(string name)
    {
        var value = name.ToLowerInvariant();
        if (value.Contains("geforce") || value.Contains("nvidia")) return "#76B900";   // NVIDIA green
        if (value.Contains("game pass") || value.Contains("gamepass") || value.Contains("xbox")) return "#107C10";  // Xbox green
        if (value.Contains("playstation") || value.Contains("ps plus") || value.Contains("ps+") || value.Contains("ps5")) return "#0070D1";
        if (value.Contains("steam")) return "#1B2838";
        if (value.Contains("ubisoft")) return "#1272E3";
        if (value.Contains("ea play") || value.Contains("origin")) return "#FF4747";
        if (value.Contains("nintendo")) return "#E60012";
        if (value.Contains("netflix")) return "#E50914";
        if (value.Contains("prime video") || value.Contains("amazon")) return "#00A8E1";
        if (value.Contains("disney") || value.Contains("hotstar")) return "#113CCF";
        if (value.Contains("apple tv")) return "#000000";
        return null;
    }
}
