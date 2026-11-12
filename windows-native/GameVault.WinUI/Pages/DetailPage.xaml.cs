using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SinuGameVault.Models;
using SinuGameVault.Services;

namespace SinuGameVault.Pages;

/// <summary>
/// Everything about one title: artwork, facts, story, episodes, your rating, and
/// the actions that move it between lists.
/// </summary>
public sealed partial class DetailPage : Page
{
    private readonly AppState _state = AppState.Current;
    private LibraryRow? _row;
    private bool _loading;
    private bool _active;

    public DetailPage() => InitializeComponent();

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        if (e.Parameter is not LibraryRow row) return;
        _active = true;
        Show(row);
        try
        {
            await _state.Vault.MarkViewedAsync(row.Source, row.MediaType, row.Collection);
            await EnrichAsync(row);
        }
        catch (Exception ex)
        {
            DiagnosticsService.Log("Details", "Could not finish loading title details", ex);
            SetStory(row, loading: false);
        }
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        _active = false;
        _row = null;
    }

    private bool StillShowing(LibraryRow row) => _active && ReferenceEquals(_row, row);

    // ---- Painting -----------------------------------------------------------

    private void Show(LibraryRow row)
    {
        _row = row;
        _loading = true;
        var game = row.MediaType == "Game";
        var portrait = row.IsPortraitArt;

        PosterFrame.Width = portrait ? 150 : 280;
        PosterFrame.Height = portrait ? 225 : 158;
        PosterFill.Background = Ui.Brush(row.PlaceholderColor);
        PosterInitials.Text = row.Initials;
        Art.SetUrl(Poster, row.Image);
        Art.SetUrl(Backdrop, row.Backdrop.Length > 0 ? row.Backdrop : row.Image);
        HeroFill.Background = Ui.Brush(row.PlaceholderColor);

        TypeText.Text = $"{row.MediaType}  ·  {row.CategoryLabel}".ToUpperInvariant();
        TitleText.Text = row.Name;
        MetaText.Text = string.Join("  ·  ", new[] { row.Date, row.Genre, row.Platform }.Where(text => text.Length > 0).Distinct());
        MetaText.Visibility = Ui.ShowText(MetaText.Text);
        RatingText.Text = row.AttributedRating;
        RatingPill.Visibility = Ui.Show(row.HasRating);
        CountdownText.Text = row.DaysText.Length > 0 ? row.DaysText : row.Status;
        CountdownPill.Visibility = Ui.ShowText(CountdownText.Text);
        EpisodesText.Text = string.Join("  ·  ", new[] { row.SeasonsText, row.EpisodesText }.Where(text => text.Length > 0));
        EpisodesPill.Visibility = Ui.Show(row.HasEpisodeInfo);

        PrimaryButton.Content = LibraryReader.PrimaryActionLabel(row);
        RemoveLabel.Text = LibraryReader.RemoveActionLabel(row);
        var stored = row.Collection is not ("plex" or "subscriptions") && !LibraryReader.IsCatalog(row);
        EditButton.Visibility = Ui.Show(stored);
        RemoveButton.Visibility = Ui.Show(row.Collection != "subscriptions");
        StatusButton.Visibility = Ui.Show(row.Collection is not ("plex" or "subscriptions"));
        StatusButton.Flyout = LibraryCommands.StatusMenu(row, Leave);
        LinksButton.Flyout = LinksMenu(row);
        TrailerButton.Visibility = Ui.Show(row.MediaType != "Subscription");

        OverviewText.Text = row.Overview;
        OverviewCard.Visibility = Ui.Show(row.HasOverview && !game);
        StoryHeading.Text = game ? "Story" : "Story from Wikipedia";
        RefreshStoryButton.Visibility = Ui.Show(row.Collection is not ("plex" or "subscriptions"));
        SetStory(row, loading: row.Collection is not ("plex" or "subscriptions"));

        AvailabilityHeading.Text = game ? "Where to get it" : "Where to watch";
        AvailabilityText.Text = row.Availability.Length > 0 ? row.Availability : game ? "No store or rental shop on record." : "No streaming provider on record.";
        VendorButtons.Visibility = Ui.Show(game && row.Collection is "queue" or "rentals");
        VendorRefreshButton.Visibility = Ui.Show(row.Collection == "queue");
        VendorLinksButton.Flyout = VendorMenu(row);

        BuildFacts(row);
        NoteText.Text = row.Note;
        NoteCard.Visibility = Ui.ShowText(row.Note);

        var rating = Math.Clamp((int)Math.Round(Json.Number(row.Source, "userRating", "myRating")), 0, 10);
        MyRating.Value = rating > 0 ? rating : -1;
        MyRating.IsEnabled = row.Collection is not ("plex" or "subscriptions");
        MyRatingText.Text = rating > 0 ? $"You rated this {rating} out of 10." : "Not rated yet.";

        EpisodesCard.Visibility = Ui.Show(row.MediaType == "TV Show" && row.Collection != "plex");
        if (row.MediaType == "TV Show") PopulateSeasons(row);
        _loading = false;
        Scroller.ChangeView(null, 0, null, disableAnimation: true);
    }

    /// <summary>The longer story: the Wikipedia plot for films and shows, the stored plot for games.</summary>
    private void SetStory(LibraryRow row, bool loading)
    {
        var story = CatalogService.CleanStoryText(Json.Text(row.Source, "wikipediaPlot"));
        if (story.Length == 0 && row.MediaType == "Game") story = row.Overview;
        StoryBusy.IsActive = loading && story.Length == 0;
        StoryText.Text = story.Length > 0 ? story
            : loading ? "Looking for the story…"
            : "No story was found for this title. Try Refresh from Wikipedia, or add one under Edit details.";
        StoryText.Foreground = Ui.ThemeBrush(story.Length > 0 ? "TextFillColorPrimaryBrush" : "TextFillColorSecondaryBrush");
    }

    private void BuildFacts(LibraryRow row)
    {
        while (Facts.Children.Count > 1) Facts.Children.RemoveAt(1);
        var duration = Json.Integer(row.Source, "used", "days");
        var started = Json.Text(row.Source, "start");
        var facts = new (string Label, string Value)[]
        {
            ("List", row.CategoryLabel),
            ("Status", row.Status),
            (row.Collection is "rentals" ? "Return by" : row.Collection == "purchasedGames" ? "Purchased" : "Date", row.Date),
            ("Started", started.Length > 0 ? LibraryReader.DisplayDate(started) : ""),
            ("Rental length", duration > 0 ? $"{duration} days" : ""),
            ("Cost", row.CostText),
            ("Genre", row.Genre),
            ("Platform", row.Platform),
            ("Highlights", row.Badges)
        };
        foreach (var (label, value) in facts.Where(fact => fact.Value.Length > 0))
        {
            var line = new Grid { ColumnSpacing = 12 };
            line.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(104) });
            line.ColumnDefinitions.Add(new ColumnDefinition());
            line.Children.Add(new TextBlock { Text = label, Style = (Style)Application.Current.Resources["SecondaryTextStyle"] });
            var text = new TextBlock { Text = value, TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true };
            Grid.SetColumn(text, 1);
            line.Children.Add(text);
            Facts.Children.Add(line);
        }
        FactsCard.Visibility = Ui.Show(Facts.Children.Count > 1);
    }

    private async Task EnrichAsync(LibraryRow row)
    {
        var refreshed = await _state.Actions.EnrichAsync(row, () => StillShowing(row));
        if (!StillShowing(row)) return;
        if (refreshed is null) { SetStory(row, loading: false); return; }
        Show(refreshed);
        SetStory(refreshed, loading: false);
        if (refreshed.Collection == "queue") _ = _state.Actions.RefreshQueueAvailabilityAsync(force: false);
    }

    private void Page_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        // Below this width the facts column would squeeze the story, so it moves underneath.
        var narrow = e.NewSize.Width < 900;
        SideColumn.Width = narrow ? new GridLength(0) : new GridLength(340);
        Grid.SetColumn(SidePanel, narrow ? 0 : 1);
        Grid.SetRow(SidePanel, narrow ? 1 : 0);
    }

    // ---- Actions ------------------------------------------------------------

    /// <summary>Returns to the list once the title is no longer where it was opened from.</summary>
    private void Leave() => App.Window?.GoBack();

    private async void Primary_Click(object sender, RoutedEventArgs e)
    {
        if (_row is not { } row) return;
        PrimaryButton.IsEnabled = false;
        try
        {
            if (await LibraryCommands.PrimaryAsync(row)) Leave();
        }
        finally { PrimaryButton.IsEnabled = true; }
    }

    private async void Remove_Click(object sender, RoutedEventArgs e)
    {
        if (_row is { } row && await LibraryCommands.RemoveAsync(row)) Leave();
    }

    private async void Edit_Click(object sender, RoutedEventArgs e)
    {
        if (_row is not { } row || !await LibraryCommands.EditAsync(row)) return;
        // Show the saved record rather than the one this page was opened with.
        var saved = _state.Reader.Collection(row.Collection, row.MediaType).FirstOrDefault(candidate => candidate.Id == row.Id);
        if (saved is not null) { Show(saved); SetStory(saved, loading: false); }
        else Leave();
    }

    private void Trailer_Click(object sender, RoutedEventArgs e)
    {
        if (_row is { } row) Ui.Open(Ui.Search("https://www.youtube.com/results?search_query=", row.Name + " official trailer"));
    }

    private async void MyRating_ValueChanged(RatingControl sender, object args)
    {
        if (_loading || _row is not { } row) return;
        var rating = sender.Value < 0 ? 0 : (int)Math.Round(sender.Value);
        if (!await _state.RunAsync(() => _state.Actions.RateAsync(row, rating), "The rating could not be saved.")) return;
        MyRatingText.Text = rating > 0 ? $"You rated this {rating} out of 10." : "Not rated yet.";
        if (rating > 0) row.Source["userRating"] = rating; else row.Source.Remove("userRating");
    }

    private async void RefreshStory_Click(object sender, RoutedEventArgs e)
    {
        if (_row is not { } row) return;
        StoryBusy.IsActive = true;
        RefreshStoryButton.IsEnabled = false;
        try
        {
            var story = "";
            await _state.RunAsync(async () => story = await _state.Actions.RefreshStoryAsync(row), "The story could not be refreshed.");
            if (!StillShowing(row)) return;
            if (story.Length == 0) _state.Notify("Wikipedia has no matching story section for this title.");
            SetStory(row, loading: false);
        }
        finally
        {
            StoryBusy.IsActive = false;
            RefreshStoryButton.IsEnabled = true;
        }
    }

    private async void VendorRefresh_Click(object sender, RoutedEventArgs e)
    {
        if (_row is not { Collection: "queue" } row) return;
        VendorRefreshButton.IsEnabled = false;
        AvailabilityText.Text = "Checking The Game Hub and Gamer Planet…";
        try
        {
            await _state.RunAsync(() => _state.Actions.UpdateAvailabilityAsync(row.Source), "Rental availability could not be checked.");
            if (!StillShowing(row)) return;
            var refreshed = _state.Reader.Row(Json.Clone(row.Source), row.Collection, row.MediaType);
            AvailabilityText.Text = refreshed is { Availability.Length: > 0 } ? refreshed.Availability : "No current rental listing was found.";
        }
        finally { VendorRefreshButton.IsEnabled = true; }
    }

    // ---- Menus --------------------------------------------------------------

    private static MenuFlyoutItem Link(string text, string url)
    {
        var item = new MenuFlyoutItem { Text = text };
        item.Click += (_, _) => Ui.Open(url);
        return item;
    }

    private static MenuFlyout VendorMenu(LibraryRow row)
    {
        var menu = new MenuFlyout();
        menu.Items.Add(Link("The Game Hub", Ui.Search("https://thegamehub.in/?s=", row.Name)));
        menu.Items.Add(Link("Gamer Planet", Ui.Search("https://gamerplanet.in/?s=", row.Name)));
        return menu;
    }

    private MenuFlyout LinksMenu(LibraryRow row)
    {
        const string youtube = "https://www.youtube.com/results?search_query=";
        var menu = new MenuFlyout();
        if (row.MediaType is "Movie" or "TV Show")
            menu.Items.Add(Link("IMDb", row.ImdbId.Length > 0 ? $"https://www.imdb.com/title/{row.ImdbId}/" : Ui.Search("https://www.imdb.com/find/?q=", row.Name)));
        menu.Items.Add(Link("Wikipedia", Ui.Search("https://en.wikipedia.org/w/index.php?search=", row.Name)));
        menu.Items.Add(Link("Google", Ui.Search("https://www.google.com/search?q=", row.Name)));
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Link("IGN review", Ui.Search(youtube, "IGN review " + row.Name)));
        menu.Items.Add(Link("Reeload Media review", Ui.Search(youtube, "@REELOADMEDIA review " + row.Name)));
        if (row.MediaType == "Movie" && (row.Collection == "mlott" || Json.Text(row.Source, "originalLanguage", "original_language") == "ml"))
        {
            menu.Items.Add(Link("Monsoon Media review", Ui.Search(youtube, row.Name + " Malayalam review Monsoon Media")));
            menu.Items.Add(Link("Aswanth Kok review", Ui.Search(youtube, row.Name + " Malayalam review Aswanth Kok")));
        }
        if (row.MediaType == "Game") menu.Items.Add(FandomMenu(row));
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(AssistantMenu(row));
        return menu;
    }

    /// <summary>A Fandom wiki page can be saved per game so reading can continue where it stopped.</summary>
    private MenuFlyoutSubItem FandomMenu(LibraryRow row)
    {
        var key = LibraryReader.NormalizedTitle(row.Name);
        var saved = Json.Text(_state.Vault.Root["fandom"] as JsonObject, key);
        var menu = new MenuFlyoutSubItem { Text = "Fandom wiki" };
        menu.Items.Add(Link(saved.Length > 0 ? "Continue saved page" : "Find the plot page",
            saved.Length > 0 ? saved : Ui.Search("https://www.google.com/search?btnI=1&q=", row.Name + " plot site:fandom.com")));
        var save = new MenuFlyoutItem { Text = "Save page address from clipboard" };
        save.Click += async (_, _) =>
        {
            var value = await Ui.ClipboardTextAsync();
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || !uri.Host.EndsWith("fandom.com", StringComparison.OrdinalIgnoreCase))
            {
                _state.Notify("Copy the Fandom page address first, then choose this again.", InfoBarSeverity.Warning);
                return;
            }
            var fandom = Json.Clone(_state.Vault.Root["fandom"] as JsonObject);
            fandom[key] = value;
            if (await _state.RunAsync(() => _state.Vault.SetRootValueAsync("fandom", fandom))) _state.Notify($"Saved the Fandom page for {row.Name}.", InfoBarSeverity.Success);
            LinksButton.Flyout = LinksMenu(row);
        };
        menu.Items.Add(save);
        if (saved.Length == 0) return menu;
        var forget = new MenuFlyoutItem { Text = "Forget saved page" };
        forget.Click += async (_, _) =>
        {
            var fandom = Json.Clone(_state.Vault.Root["fandom"] as JsonObject);
            fandom.Remove(key);
            if (await _state.RunAsync(() => _state.Vault.SetRootValueAsync("fandom", fandom))) _state.Notify($"Removed the saved Fandom page for {row.Name}.");
            LinksButton.Flyout = LinksMenu(row);
        };
        menu.Items.Add(forget);
        return menu;
    }

    /// <summary>
    /// Opens a spoiler-free "what should I know first" question in a chat
    /// assistant. The question is also copied, for assistants that ignore it in
    /// the address. A conversation can be saved per title and continued later.
    /// </summary>
    private MenuFlyoutSubItem AssistantMenu(LibraryRow row)
    {
        var prompt = row.MediaType == "Game"
            ? $"I am about to play {row.Name}. Tell me what I should know first, whether I should play previous games, and recap important earlier lore. Do not spoil {row.Name}."
            : $"I am about to watch {row.Name}. Tell me what I should know first, any earlier films, seasons, or lore I need, whether it is based on true events, and recap prequels if applicable. Do not spoil {row.Name}.";
        var services = new (string Name, string Url)[]
        {
            ("ChatGPT", "https://chatgpt.com/?q="), ("Claude", "https://claude.ai/new?q="),
            ("Grok", "https://grok.com/?q="), ("DeepSeek", "https://chat.deepseek.com/?q=")
        };
        var chatKey = $"{row.MediaType}:{(row.Id.Length > 0 ? row.Id : LibraryReader.NormalizedTitle(row.Name))}";
        var savedChats = (_state.Vault.Root["aiChats"] as JsonObject)?[chatKey] as JsonObject;
        var menu = new MenuFlyoutSubItem { Text = "Ask an AI before you start" };
        foreach (var (name, url) in services)
        {
            var saved = Json.Text(savedChats, name);
            var item = new MenuFlyoutItem { Text = saved.Length > 0 ? $"{name} — continue saved chat" : name };
            item.Click += (_, _) => { Ui.CopyText(prompt); Ui.Open(saved.Length > 0 ? saved : url + Uri.EscapeDataString(prompt)); };
            menu.Items.Add(item);
        }
        menu.Items.Add(new MenuFlyoutSeparator());
        var saveMenu = new MenuFlyoutSubItem { Text = "Save chat address from clipboard" };
        foreach (var (name, _) in services)
        {
            var item = new MenuFlyoutItem { Text = name };
            item.Click += async (_, _) =>
            {
                var value = await Ui.ClipboardTextAsync();
                if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
                {
                    _state.Notify("Copy the conversation address from your browser first.", InfoBarSeverity.Warning);
                    return;
                }
                var chats = Json.Clone(_state.Vault.Root["aiChats"] as JsonObject);
                var titleChats = Json.Clone(chats[chatKey] as JsonObject);
                titleChats[name] = value;
                chats[chatKey] = titleChats;
                if (await _state.RunAsync(() => _state.Vault.SetRootValueAsync("aiChats", chats))) _state.Notify($"Saved the {name} conversation for {row.Name}.", InfoBarSeverity.Success);
                LinksButton.Flyout = LinksMenu(row);
            };
            saveMenu.Items.Add(item);
        }
        menu.Items.Add(saveMenu);
        return menu;
    }

    // ---- Episodes -----------------------------------------------------------

    private void PopulateSeasons(LibraryRow row)
    {
        SeasonBox.Items.Clear();
        EpisodeBox.Items.Clear();
        var seasons = row.Seasons > 0 ? row.Seasons : (row.Source["seasonList"] as JsonArray)?.Count ?? 0;
        for (var season = 1; season <= seasons; season++) SeasonBox.Items.Add(season);
        EpisodesCard.Visibility = Ui.Show(seasons > 0 && row.Collection != "plex");
        // Selecting a season loads its episodes through Season_Changed.
        if (seasons > 0) SeasonBox.SelectedIndex = 0;
    }

    private async void Season_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_row is not { } row || SeasonBox.SelectedItem is not int season) return;
        EpisodeBox.Items.Clear();
        EpisodeBox.PlaceholderText = "Loading episodes…";
        IReadOnlyList<EpisodeChoice> episodes = [];
        try { episodes = await _state.Catalog.SeasonEpisodesAsync(row.TmdbId, row.ImdbId, season); }
        catch { /* Fall back to plain episode numbers below. */ }
        if (!StillShowing(row) || !Equals(SeasonBox.SelectedItem, season)) return;
        EpisodeBox.Items.Clear();
        EpisodeBox.PlaceholderText = "";
        if (episodes.Count > 0) foreach (var episode in episodes) EpisodeBox.Items.Add(episode);
        else
        {
            var count = 0;
            if (row.Source["seasonList"] is JsonArray list && list.OfType<JsonObject>().FirstOrDefault(item => Json.Integer(item, "n", "season_number") == season) is { } info)
                count = Json.Integer(info, "episodes", "episode_count");
            if (count == 0) count = row.Episodes > 0 && row.Seasons <= 1 ? row.Episodes : 20;
            for (var number = 1; number <= count; number++) EpisodeBox.Items.Add(new EpisodeChoice { Number = number, Name = $"Episode {number}" });
        }
        if (EpisodeBox.Items.Count > 0) EpisodeBox.SelectedIndex = 0;
    }

    private async void EpisodeStory_Click(object sender, RoutedEventArgs e)
    {
        if (_row is not { } row || SeasonBox.SelectedItem is not int season || EpisodeBox.SelectedItem is not EpisodeChoice choice) return;
        StoryBusy.IsActive = true;
        try
        {
            var details = await _state.Catalog.EpisodeAsync(row.TmdbId, row.ImdbId, season, choice.Number);
            var story = "";
            try { story = await _state.Catalog.WikipediaSummaryAsync($"{row.Name} season {season} episode {choice.Number} {details.Name}", "TV Show", Json.Text(row.Source, "year")); }
            catch { /* The TMDB summary below is the fallback. */ }
            if (!StillShowing(row)) return;
            if (story.Length == 0) story = details.Overview;
            StoryHeading.Text = $"S{season:00}E{choice.Number:00}  ·  {details.Name}";
            StoryText.Text = story.Length > 0 ? story : "No story was found for this episode.";
            StoryText.Foreground = Ui.ThemeBrush(story.Length > 0 ? "TextFillColorPrimaryBrush" : "TextFillColorSecondaryBrush");
            var rating = choice.Rating > 0 ? choice.Rating : details.Rating;
            if (rating > 0) { RatingText.Text = $"Episode {rating:0.0}"; RatingPill.Visibility = Visibility.Visible; }
            if (details.AirDate.Length > 0) { CountdownText.Text = LibraryReader.DisplayDate(details.AirDate); CountdownPill.Visibility = Visibility.Visible; }
        }
        catch (Exception ex)
        {
            _state.Notify($"The episode could not be loaded. {ex.Message}", InfoBarSeverity.Warning);
        }
        finally { StoryBusy.IsActive = false; }
    }
}
