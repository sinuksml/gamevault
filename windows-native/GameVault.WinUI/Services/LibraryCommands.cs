using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SinuGameVault.Dialogs;
using SinuGameVault.Models;
using SinuGameVault.Services;

namespace SinuGameVault;

/// <summary>
/// The user-facing side of every library action: ask if the action is
/// destructive, run it through <see cref="LibraryActions"/>, then say what
/// happened and offer Undo. Cards and the detail page both call in here, so an
/// action behaves the same wherever it is started.
/// </summary>
public static class LibraryCommands
{
    private static AppState State => AppState.Current;

    private static async Task<bool> RunAsync(Func<Task> work, string done, bool offerUndo = true)
    {
        var succeeded = await State.RunAsync(work);
        if (succeeded) State.Notify(done, InfoBarSeverity.Success, offerUndo);
        return succeeded;
    }

    public static void Open(LibraryRow row) => App.Window?.ShowDetails(row);

    /// <summary>Moves a title to a list. Returns true when it moved.</summary>
    public static Task<bool> MoveAsync(LibraryRow row, string destination, string status, string done)
    {
        if (row.Collection == "subscriptions")
        {
            State.Notify("Subscription plans are edited under Manage subscriptions. Mark the individual games completed instead.");
            return Task.FromResult(false);
        }
        return RunAsync(() => State.Actions.MoveToAsync(row, destination, status), done);
    }

    /// <summary>The one-click action shown for a card. Returns true when the title changed lists.</summary>
    public static async Task<bool> QuickAsync(LibraryRow row)
    {
        switch (row.QuickActionKey)
        {
            case "return-complete":
                if (!await Ui.ConfirmAsync("Return and complete", $"Return “{row.Name}” and mark it completed? The rental stays in Rental History.", "Return and complete")) return false;
                return await RunAsync(() => State.Actions.ReturnRentalAsync(row, alsoComplete: true), $"{row.Name} returned and marked completed.");
            case "rent-again":
            case "start-rental":
                return await RunAsync(() => State.Actions.StartRentalAsync(row), $"Started a 30-day rental for {row.Name}.");
            case "resume": return await MoveAsync(row, "playing", "Playing", $"Resumed {row.Name}.");
            case "mark-completed": return await MoveAsync(row, "played", "Finished", $"{row.Name} marked completed.");
            case "play-now": return await MoveAsync(row, "playing", "Playing", $"Now playing {row.Name}.");
            case "add-queue": return await MoveAsync(row, "queue", "Queued", $"{row.Name} added to the rental queue.");
            case "mark-watched": return await MoveAsync(row, LibraryActions.FinishedFor(row.MediaType), "Watched", $"{row.Name} marked watched.");
            default: return false;
        }
    }

    /// <summary>The main button on a detail page. Returns true when the title left the list it was opened from.</summary>
    public static async Task<bool> PrimaryAsync(LibraryRow row)
    {
        if (row.Collection == "subscriptions") { await ManageSubscriptionsAsync(); return false; }
        if (row.Collection == "plex")
        {
            var makeWatched = !string.Equals(row.Status, "Watched", StringComparison.OrdinalIgnoreCase);
            return await RunAsync(async () =>
            {
                await State.Plex.MarkWatchedAsync(Json.Text(row.Source, "plexRatingKey"), makeWatched);
                await State.Actions.SetPlexWatchedAsync(row, makeWatched);
            }, makeWatched ? $"{row.Name} marked watched on Plex." : $"{row.Name} marked unwatched on Plex.", offerUndo: false);
        }
        if (row.Collection == "rentals")
        {
            if (!await Ui.ConfirmAsync("Return rental", $"Return “{row.Name}” today and move this rental to Rental History?", "Return rental")) return false;
            return await RunAsync(() => State.Actions.ReturnRentalAsync(row, alsoComplete: false), $"{row.Name} returned.");
        }
        var outcome = LibraryReader.PrimaryActionLabel(row) switch
        {
            "Add to watchlist" or "Restore to watchlist" => "added to your watchlist",
            "Start watching" or "Watch again" => "moved to Watching",
            "Mark watched" => "marked watched",
            "Add to rental queue" => "added to the rental queue",
            "Move to playing" or "Play now" => "moved to Now Playing",
            "Rent again" => "rented again for 30 days",
            "Restore to upcoming" => "restored to Upcoming",
            _ => "marked completed"
        };
        return await RunAsync(() => State.Actions.AdvanceAsync(row), $"{row.Name} {outcome}.");
    }

    /// <summary>Removes, hides or deletes a title after confirming. Returns true when it was removed.</summary>
    public static async Task<bool> RemoveAsync(LibraryRow row)
    {
        if (row.Collection == "plex")
        {
            if (!await Ui.ConfirmAsync("Delete from Plex", $"Permanently delete “{row.Name}” from Plex, including its media files?\n\nThis cannot be undone.", "Delete media", destructive: true)) return false;
            return await RunAsync(() => State.Plex.DeleteAsync(Json.Text(row.Source, "plexRatingKey")), $"{row.Name} deleted from Plex.", offerUndo: false);
        }
        if (row.Collection == "upcoming")
        {
            if (!await Ui.ConfirmAsync("Remove from upcoming", $"Move “{row.Name}” to Removed games? It will stay hidden from future catalog refreshes.", "Remove")) return false;
            return await RunAsync(() => State.Actions.RemoveAsync(row), $"{row.Name} moved to Removed games.");
        }
        if (LibraryReader.IsCatalog(row))
            return await RunAsync(() => State.Actions.RemoveAsync(row), $"{row.Name} hidden. Find it again under Not interested.");
        if (!await Ui.ConfirmAsync("Remove title", $"Remove “{row.Name}” from {row.CategoryLabel.ToLowerInvariant()}?", "Remove", destructive: true)) return false;
        return await RunAsync(() => State.Actions.RemoveAsync(row), $"{row.Name} removed.");
    }

    /// <summary>Opens the editor for a stored title. Returns true when it was saved.</summary>
    public static async Task<bool> EditAsync(LibraryRow row)
    {
        if (row.Collection == "subscriptions") { await ManageSubscriptionsAsync(); return false; }
        if (row.Collection == "plex" || LibraryReader.IsCatalog(row))
        {
            State.Notify("Add this title to your library first, then edit its details.");
            return false;
        }
        var dialog = Ui.Host(new ItemEditorDialog(row.Collection, row.Source));
        if (await dialog.ShowAsync() != ContentDialogResult.Primary || dialog.Item is not { } item) return false;
        return await RunAsync(() => State.Vault.UpdateAsync(row.Collection, item), $"{row.Name} saved.", offerUndo: false);
    }

    /// <summary>Records a game as permanently owned on Steam.</summary>
    public static async Task<bool> MarkPurchasedAsync(LibraryRow row)
    {
        if (State.Actions.PurchaseSeed(row) is not { } seed)
        {
            State.Notify("This game is already in Purchased.");
            return false;
        }
        var dialog = Ui.Host(new ItemEditorDialog("purchasedGames", seed, "Add Steam purchase", "Add to Purchased"));
        if (await dialog.ShowAsync() != ContentDialogResult.Primary || dialog.Item is not { } item) return false;
        return await RunAsync(() => State.Vault.AddAsync("purchasedGames", item), "Added to Purchased. Ownership stays permanent when you play or complete it.", offerUndo: false);
    }

    public static async Task ManageSubscriptionsAsync()
    {
        var dialog = Ui.Host(new SubscriptionsDialog(State.Vault.Collection("subscriptions")));
        if (await dialog.ShowAsync() != ContentDialogResult.Primary || dialog.Result is not { } result) return;
        await RunAsync(() => State.Vault.SetRootValueAsync("subscriptions", result), "Subscriptions saved.", offerUndo: false);
    }

    /// <summary>
    /// Adds a title: search the catalog when a key is saved, otherwise (or on
    /// request) type the details in.
    /// </summary>
    /// <returns>The collection the title was added to, or null when cancelled.</returns>
    public static async Task<string?> AddAsync(string section, string collection)
    {
        var type = section == "Games" ? "Game" : section == "Movies" ? "Movie" : "TV Show";
        if (type == "Game")
        {
            if (collection is "rentalHistory") collection = "rentals";
            if (collection is "upcoming" or "catalogExtra") collection = "queue";
        }
        else collection = LibraryActions.WatchlistFor(type);

        JsonObject? seed = null;
        var canSearch = type == "Game" ? State.Catalog.RawgKey.Length > 0 : State.Catalog.TmdbKey.Length > 0;
        if (canSearch)
        {
            var search = Ui.Host(new CatalogSearchDialog(State.Catalog, type));
            var outcome = await search.ShowAsync();
            if (search.SelectedItem is not null) seed = search.SelectedItem;
            else if (!search.ManualEntry || outcome == ContentDialogResult.None) return null;
        }

        var heading = collection == "purchasedGames" ? "Add Steam purchase" : type == "Game" ? "Add game" : "Add title";
        var editor = Ui.Host(new ItemEditorDialog(collection, seed, heading, type == "Game" ? "Add to library" : "Add to watchlist"));
        if (await editor.ShowAsync() != ContentDialogResult.Primary || editor.Item is not { } item) return null;

        JsonObject? subscription = null;
        if (collection == "subscriptionGames")
        {
            var plans = State.Vault.Collection("subscriptions").OfType<JsonObject>().ToList();
            if (plans.Count > 0)
            {
                subscription = await PickSubscriptionAsync(plans);
                if (subscription is null) return null;
            }
        }
        var added = type == "Game"
            ? await RunAsync(() => State.Actions.AddGameAsync(collection, item, subscription), $"{Json.Text(item, "name", "title")} added.", offerUndo: false)
            : await RunAsync(() => State.Vault.AddAsync(collection, item), $"{Json.Text(item, "name", "title")} added to your watchlist.", offerUndo: false);
        return added ? collection : null;
    }

    private static async Task<JsonObject?> PickSubscriptionAsync(List<JsonObject> plans)
    {
        var box = new ComboBox { HorizontalAlignment = HorizontalAlignment.Stretch, Header = "Subscription" };
        foreach (var plan in plans) box.Items.Add(new ComboBoxItem { Content = Json.Text(plan, "service", "name"), Tag = plan });
        box.SelectedIndex = 0;
        var dialog = Ui.Host(new ContentDialog
        {
            Title = "Which subscription includes this game?",
            Content = box, PrimaryButtonText = "Add game", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Primary
        });
        return await dialog.ShowAsync() == ContentDialogResult.Primary ? (box.SelectedItem as ComboBoxItem)?.Tag as JsonObject : null;
    }

    /// <summary>Rental spending per vendor, across active and returned rentals.</summary>
    public static async Task ShowVendorReportAsync()
    {
        var rentals = State.Vault.Collection("rentals").Concat(State.Vault.Collection("rentalHistory")).OfType<JsonObject>();
        var rows = rentals.GroupBy(item => Json.Text(item, "vendor") is { Length: > 0 } vendor ? vendor.Trim() : "Unknown vendor", StringComparer.OrdinalIgnoreCase)
            .Select(group => (Vendor: group.Key, Count: group.Count(), Total: group.Sum(item => Json.Number(item, "cost"))))
            .OrderByDescending(row => row.Total).ToList();
        var panel = new StackPanel { Spacing = 4, MinWidth = 420 };
        if (rows.Count == 0) panel.Children.Add(new TextBlock { Text = "No rentals recorded yet." });
        foreach (var (vendor, count, total) in rows)
        {
            var line = new Grid { Padding = new Thickness(0, 8, 0, 8) };
            line.ColumnDefinitions.Add(new ColumnDefinition());
            line.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var name = new StackPanel();
            name.Children.Add(new TextBlock { Text = vendor, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
            name.Children.Add(new TextBlock { Text = $"{count} rental period{(count == 1 ? "" : "s")}", Style = (Style)Application.Current.Resources["CaptionSecondaryStyle"] });
            var amount = new TextBlock { Text = $"₹{total:N0}", VerticalAlignment = VerticalAlignment.Center, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold };
            Grid.SetColumn(amount, 1);
            line.Children.Add(name);
            line.Children.Add(amount);
            panel.Children.Add(line);
        }
        await Ui.Host(new ContentDialog
        {
            Title = "Rental spending by vendor",
            Content = new ScrollViewer { Content = panel, MaxHeight = 420 },
            CloseButtonText = "Close", DefaultButton = ContentDialogButton.Close
        }).ShowAsync();
    }

    /// <summary>Lets the user pick a recovery snapshot and restores it after confirming.</summary>
    public static async Task RestoreSnapshotAsync()
    {
        var snapshots = State.Vault.RecoverySnapshots();
        var list = new ListView { SelectionMode = ListViewSelectionMode.Single, MaxHeight = 380, MinWidth = 460 };
        foreach (var snapshot in snapshots)
        {
            var size = snapshot.SizeBytes >= 1024 * 1024 ? $"{snapshot.SizeBytes / 1024d / 1024d:0.0} MB" : $"{Math.Max(1, snapshot.SizeBytes / 1024d):0} KB";
            var item = new StackPanel { Padding = new Thickness(0, 6, 0, 6) };
            item.Children.Add(new TextBlock { Text = snapshot.ModifiedAt.ToString("dd MMM yyyy, h:mm tt") });
            item.Children.Add(new TextBlock { Text = $"{snapshot.Name}  ·  {size}", Style = (Style)Application.Current.Resources["CaptionSecondaryStyle"] });
            list.Items.Add(new ListViewItem { Content = item, Tag = snapshot });
        }
        var content = new StackPanel { Spacing = 12 };
        content.Children.Add(new TextBlock
        {
            Text = snapshots.Count == 0 ? "No snapshots exist yet." : "Snapshots are taken before imports and during edits. Restoring also keeps a snapshot of the current vault.",
            TextWrapping = TextWrapping.Wrap, Style = (Style)Application.Current.Resources["SecondaryTextStyle"]
        });
        content.Children.Add(list);
        var dialog = Ui.Host(new ContentDialog
        {
            Title = "Recovery snapshots", Content = content,
            PrimaryButtonText = "Restore selected", CloseButtonText = "Close", DefaultButton = ContentDialogButton.Close,
            IsPrimaryButtonEnabled = false
        });
        list.SelectionChanged += (_, _) => dialog.IsPrimaryButtonEnabled = list.SelectedItem is not null;
        if (await dialog.ShowAsync() != ContentDialogResult.Primary || (list.SelectedItem as ListViewItem)?.Tag is not RecoverySnapshot chosen) return;
        if (!await Ui.ConfirmAsync("Restore snapshot", $"Replace the whole library with the snapshot from {chosen.ModifiedAt:g}?", "Restore", destructive: true)) return;
        await RunAsync(() => State.Vault.RestoreSnapshotAsync(chosen.Path), "Recovery snapshot restored.", offerUndo: false);
    }

    // ---- Menus --------------------------------------------------------------

    private static MenuFlyoutItem Item(string text, string glyph, Func<Task> action)
    {
        var item = new MenuFlyoutItem { Text = text, Icon = new FontIcon { Glyph = glyph } };
        item.Click += async (_, _) => await action();
        return item;
    }

    /// <summary>The right-click menu for a card.</summary>
    public static MenuFlyout CardMenu(LibraryRow row)
    {
        var menu = new MenuFlyout();
        menu.Items.Add(Item("Open", "", () => { Open(row); return Task.CompletedTask; }));
        if (row.HasQuickAction) menu.Items.Add(Item(row.QuickActionLabel, "", () => QuickAsync(row)));
        if (row.Collection is "plex" or "subscriptions") return menu;
        menu.Items.Add(new MenuFlyoutSeparator());
        var catalog = LibraryReader.IsCatalog(row) || row.Collection is "catalogExtra" or "upcoming";
        if (catalog)
            menu.Items.Add(Item(row.MediaType == "Game" ? "Add to rental queue" : "Add to watchlist", "",
                () => MoveAsync(row, LibraryActions.WatchlistFor(row.MediaType), row.MediaType == "Game" ? "Queued" : "Watchlist", $"{row.Name} added.")));
        menu.Items.Add(Item(row.MediaType == "Game" ? "Mark completed" : "Mark watched", "",
            () => MoveAsync(row, LibraryActions.FinishedFor(row.MediaType), row.MediaType == "Game" ? "Finished" : "Watched", $"{row.Name} marked {(row.MediaType == "Game" ? "completed" : "watched")}.")));
        menu.Items.Add(Item("Not interested", "",
            () => MoveAsync(row, LibraryActions.HiddenFor(row.MediaType), "Not Interested", $"{row.Name} hidden.")));
        if (!catalog)
        {
            menu.Items.Add(new MenuFlyoutSeparator());
            menu.Items.Add(Item("Edit details", "", () => EditAsync(row)));
            menu.Items.Add(Item(LibraryReader.RemoveActionLabel(row), "", () => RemoveAsync(row)));
        }
        return menu;
    }

    /// <summary>The "Change status" menu on a detail page.</summary>
    public static MenuFlyout StatusMenu(LibraryRow row, Action moved)
    {
        var menu = new MenuFlyout();
        foreach (var (label, collection, status) in LibraryActions.StatusChoices(row.MediaType))
        {
            var item = new MenuFlyoutItem { Text = label };
            item.Click += async (_, _) => { if (await MoveAsync(row, collection, status, $"{row.Name} moved to {label}.")) moved(); };
            menu.Items.Add(item);
        }
        if (row.MediaType == "Game")
        {
            menu.Items.Add(new MenuFlyoutSeparator());
            var owned = new MenuFlyoutItem { Text = "Purchased on Steam…" };
            owned.Click += async (_, _) => await MarkPurchasedAsync(row);
            menu.Items.Add(owned);
        }
        return menu;
    }
}
