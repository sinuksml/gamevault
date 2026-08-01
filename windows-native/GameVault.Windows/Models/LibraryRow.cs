using System.Text.Json.Nodes;

namespace SinuGameVault.Models;

public sealed class LibraryRow
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "Untitled";
    public string Collection { get; init; } = "";
    public string MediaType { get; init; } = "Game";
    public string Platform { get; init; } = "";
    public string Status { get; init; } = "";
    public string Date { get; init; } = "";
    public string Genre { get; init; } = "";
    public string Image { get; init; } = "";
    public string Backdrop { get; init; } = "";
    public string Overview { get; init; } = "";
    public string Providers { get; init; } = "";
    public string Vendor { get; init; } = "";
    public string Note { get; init; } = "";
    public string ImdbId { get; init; } = "";
    public string TmdbId { get; init; } = "";
    public int Seasons { get; init; }
    public int Episodes { get; init; }
    public double Rating { get; init; }
    public decimal Cost { get; init; }
    public int? DaysLeft { get; init; }
    public JsonObject Source { get; init; } = [];
    public string GroupName { get; init; } = "";
    public string Badges { get; init; } = "";

    public string RatingText => Rating > 0 ? $"{Rating:0.0}" : "Not rated";
    public string CardRatingText => Collection == "subscriptions" ? (Cost > 0 ? $"\u20B9{Cost:N0} / cycle" : Status) : $"Rating {RatingText}";
    public string CostText => Cost > 0 ? $"₹{Cost:N0}" : "";
    public string DaysText => Collection == "rentalHistory" ? "Returned" : DaysLeft is null ? "" : DaysLeft < 0 ? (Collection == "subscriptions" ? "Expired" : "Released") : DaysLeft == 0 ? (Collection == "rentals" ? "Return today" : Collection == "subscriptions" ? "Renews today" : "Releases today") : Collection is "rentals" or "subscriptions" or "subscriptionGames" ? $"{DaysLeft} days remaining" : $"{DaysLeft} days left";
    public string CountdownColor => DaysLeft is null || DaysLeft < 0 ? "#98A5BA" : DaysLeft <= 7 ? "#FF6577" : DaysLeft <= 30 ? "#FFD166" : "#76E6C2";
    public string PrimaryMeta => Join(Genre, Platform);
    public string SecondaryMeta => Join(Date, Status, Badges);
    public string DetailMeta => Join(Date, Genre, Platform);
    public string SeasonsText => Seasons > 0 ? $"{Seasons} season{(Seasons == 1 ? "" : "s")}" : "";
    public string EpisodesText => Episodes > 0 ? $"{Episodes} episodes" : "";
    public string Availability => Join(Providers, Vendor);
    public bool HasImage => Uri.TryCreate(Image, UriKind.Absolute, out _);
    public bool HasOverview => !string.IsNullOrWhiteSpace(Overview);
    public bool HasRating => Rating > 0;
    public bool HasEpisodeInfo => Seasons > 0 || Episodes > 0;
    public bool HasBadges => !string.IsNullOrWhiteSpace(Badges);

    private static string Join(params string[] values) => string.Join("  |  ", values.Where(value => !string.IsNullOrWhiteSpace(value)).Distinct());
}
