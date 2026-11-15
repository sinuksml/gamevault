package in.sinu.gamevault.nativetv;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * What can be done with a title on its detail page, and what each action does.
 *
 * Both layouts (the classic canvas view and the Compose one) read this, so the two
 * cannot offer different buttons or send the same button to different places. It is
 * a move of the table that used to live in VaultTvView, not a change to it.
 */
final class DetailActions {
    private DetailActions() { }

    /** The buttons for a title, in display order. */
    static String[] labels(MediaItem detail) {
        if ("game".equals(detail.kind)) {
            if ("plex".equals(detail.source)) return new String[]{"Trailer", "IMDb", "Load Story", "Mark Watched", "Delete Media", "Close"};
            if ("purchasedGames".equals(detail.source)) return new String[]{"Trailer", "IGN Review", "Google", "Load Story", "Rate", "Edit", "Playing", "Completed", "Close"};
            if ("subscriptions".equals(detail.source) || "subscriptionGames".equals(detail.source)) return new String[]{"Trailer", "IGN Review", "Google", "Load Story", "Rate", "Edit", "Purchased", "Playing", "Completed", "Close"};
            if ("hiddenGames".equals(detail.source) || "upcomingRemoved".equals(detail.source)) return new String[]{"Trailer", "IGN Review", "Google", "Load Story", "Restore", "Close"};
            if ("rental".equals(detail.source) || "rentalHistory".equals(detail.source)) return new String[]{"Trailer", "IGN Review", "Google", "Game Hub", "Gamer Planet", "Load Story", "Rate", "Edit", "Purchased", "Return", "Playing", "Resume Later", "On Hold", "Completed", "Not Interested", "Fandom", "Close"};
            if ("playing".equals(detail.source)) return new String[]{"Trailer", "IGN Review", "Google", "Load Story", "Fandom", "Rate", "Edit", "Purchased", "Queue", "Resume Later", "On Hold", "Completed", "Not Interested", "Close"};
            return new String[]{"Trailer", "IGN Review", "Google", "Game Hub", "Gamer Planet", "Load Story", "Rate", "Edit", "Purchased", "Queue", "Playing", "Resume Later", "On Hold", "Completed", "Not Interested", "AI Assistant", "Close"};
        }
        if ("plex".equals(detail.source)) return new String[]{"Trailer", "IMDb", "Load Story", "Episodes", "Mark Watched", "Delete Media", "Close"};
        String episodesAction = "series".equals(detail.kind) ? "Episodes" : "";
        if ("hiddenMovies".equals(detail.source) || "hiddenSeries".equals(detail.source)) return compact(new String[]{"Trailer", "IMDb", "Google", "Load Story", episodesAction, "Rate", "Restore", "Close"});
        if (isMalayalam(detail)) return compact(new String[]{"Trailer", "IMDb", "Google", "Load Story", episodesAction, "Monsoon Review", "Aswanth Review", "Rate", "Edit", "Watchlist", "Watching", "Watched", "Not Interested", "AI Assistant", "Close"});
        return compact(new String[]{"Trailer", "IMDb", "Google", "Load Story", episodesAction, "REELOAD Review", "Rate", "Edit", "Watchlist", "Watching", "Watched", "Not Interested", "AI Assistant", "Close"});
    }

    /**
     * Runs an action that needs nothing from the screen: opening a page, or changing
     * the library. "Close" and "Episodes" change what the screen shows, so each layout
     * handles those two itself.
     */
    static void perform(String act, MediaItem detail, VaultTvView.Actions actions) {
        if ("Trailer".equals(act)) actions.openYouTube(detail.title + " official trailer");
        else if ("IGN Review".equals(act)) actions.openYouTube("IGN " + detail.title + " review");
        else if ("REELOAD Review".equals(act)) actions.openYouTube("REELOAD MEDIA " + detail.title + " review");
        else if ("Monsoon Review".equals(act)) actions.openYouTube("Monsoon Media " + detail.title + " review");
        else if ("Aswanth Review".equals(act)) actions.openYouTube("Aswanth Kok " + detail.title + " review");
        else if ("Google".equals(act)) actions.openWeb("https://www.google.com/search?q=" + urlEncode(detail.title));
        else if ("Game Hub".equals(act)) actions.openWeb("https://thegamehub.in/?s=" + urlEncode(detail.title));
        else if ("Gamer Planet".equals(act)) actions.openWeb("https://gamerplanet.in/?s=" + urlEncode(detail.title));
        else if ("Fandom".equals(act)) actions.openWeb("https://www.google.com/search?q=" + urlEncode(detail.title + " Fandom plot"));
        else if ("AI Assistant".equals(act)) actions.openWeb("https://chatgpt.com/?q=" + urlEncode(("game".equals(detail.kind) ? "What should I know before playing " : "What should I know before watching ") + detail.title + "? Include required prequels and lore but no spoilers."));
        else if ("Load Story".equals(act)) actions.loadStory(detail);
        else if ("IMDb".equals(act)) actions.openWeb(imdbUrl(detail));
        else if ("Rate".equals(act)) actions.rateItem(detail);
        else if ("Edit".equals(act)) actions.editItem(detail);
        else if ("Mark Watched".equals(act)) actions.plexAction(detail, "watched");
        else if ("Delete Media".equals(act)) actions.plexAction(detail, "delete");
        else if ("Restore".equals(act)) actions.updateLibrary(detail, "restore");
        else if ("Watchlist".equals(act)) actions.updateLibrary(detail, "watchlist");
        else if ("Watching".equals(act)) actions.updateLibrary(detail, "watching");
        else if ("Watched".equals(act)) actions.updateLibrary(detail, "watched");
        else if ("Purchased".equals(act)) actions.updateLibrary(detail, "purchased");
        else if ("Queue".equals(act)) actions.updateLibrary(detail, "queue");
        else if ("Playing".equals(act)) actions.updateLibrary(detail, "playing");
        else if ("Resume Later".equals(act)) actions.updateLibrary(detail, "resume_later");
        else if ("On Hold".equals(act)) actions.updateLibrary(detail, "on_hold");
        else if ("Completed".equals(act)) actions.updateLibrary(detail, "completed");
        else if ("Return".equals(act)) actions.updateLibrary(detail, "return");
        else if ("Not Interested".equals(act)) actions.updateLibrary(detail, "not_interested");
    }

    /** Whether an action edits the library or a service, so a screen can warn before running it. */
    static boolean changesLibrary(String act) {
        switch (act) {
            case "Mark Watched": case "Delete Media": case "Restore": case "Watchlist": case "Watching": case "Watched":
            case "Purchased": case "Queue": case "Playing": case "Resume Later": case "On Hold": case "Completed":
            case "Return": case "Not Interested": case "Rate": case "Edit":
                return true;
            default:
                return false;
        }
    }

    private static String[] compact(String[] values) {
        List<String> out = new ArrayList<>();
        for (String value : values) if (value != null && !value.isEmpty()) out.add(value);
        return out.toArray(new String[0]);
    }

    private static boolean isMalayalam(MediaItem item) {
        String source = (item.source + " " + first(item.raw, "language", "originalLanguage", "lang")).toLowerCase(Locale.US);
        return source.contains("malayalam") || source.contains("mlseries") || source.contains("mlott") || source.contains(" ml");
    }

    static String imdbUrl(MediaItem item) {
        String id = first(item.raw, "imdbId", "imdb_id", "imdbID");
        if (id.matches("tt\\d+")) return "https://www.imdb.com/title/" + id + "/";
        return "https://www.imdb.com/find/?q=" + urlEncode(item.title);
    }

    static String first(JSONObject object, String... keys) {
        if (object == null) return "";
        for (String key : keys) {
            String value = object.optString(key);
            if (!value.isEmpty()) return value;
        }
        return "";
    }

    private static String urlEncode(String value) {
        try { return java.net.URLEncoder.encode(value, "UTF-8"); } catch (Exception ignored) { return value; }
    }
}
