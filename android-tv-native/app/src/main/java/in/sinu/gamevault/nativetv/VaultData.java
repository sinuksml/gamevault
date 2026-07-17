package in.sinu.gamevault.nativetv;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class VaultData {
    final JSONObject root;
    long updatedAt;

    VaultData(JSONObject root) {
        this.root = root == null ? new JSONObject() : root;
        this.updatedAt = this.root.optLong("updatedAt", 0L);
    }

    static VaultData empty() { return new VaultData(new JSONObject()); }

    int savedCount() {
        return count("rentals") + count("playing") + count("queue") + count("played")
            + count("movieWatchlist") + count("watchingMovies") + count("watchedMovies")
            + count("seriesWatchlist") + count("watchingSeries") + count("watchedSeries");
    }

    synchronized boolean applyAction(MediaItem item, String action) {
        if (item == null || action == null) return false;
        try {
            boolean changed;
            if ("return".equals(action)) changed = returnRental(item);
            else if ("movie".equals(item.kind)) changed = moveMedia(item, action,
                new String[]{"movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies"});
            else if ("series".equals(item.kind)) changed = moveMedia(item, action,
                new String[]{"seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries"});
            else changed = moveGame(item, action);
            if (changed) touch();
            return changed;
        } catch (Exception ignored) { return false; }
    }

    private boolean moveMedia(MediaItem item, String action, String[] keys) throws Exception {
        String target;
        if ("watchlist".equals(action)) target = keys[0];
        else if ("watching".equals(action)) target = keys[1];
        else if ("watched".equals(action)) target = keys[2];
        else if ("not_interested".equals(action)) target = keys[3];
        else return false;
        for (String key : keys) removeMatching(array(key), item);
        JSONObject copy = mediaCopy(item);
        if ("watched".equals(action)) copy.put("watchedAt", isoToday());
        ensureArray(target).put(copy);
        return true;
    }

    private boolean moveGame(MediaItem item, String action) throws Exception {
        String target;
        if ("queue".equals(action)) target = "queue";
        else if ("playing".equals(action)) target = "playing";
        else if ("completed".equals(action)) target = "played";
        else if ("not_interested".equals(action)) target = "dismissed";
        else return false;
        String[] keys = {"queue", "playing", "played", "dismissed"};
        for (String key : keys) removeMatching(array(key), item);
        JSONObject copy = mediaCopy(item);
        copy.put("name", item.title);
        if ("completed".equals(action)) copy.put("status", "Completed");
        ensureArray(target).put(copy);
        return true;
    }

    private boolean returnRental(MediaItem item) throws Exception {
        JSONArray rentals = array("rentals");
        JSONObject rental = null;
        for (int i = rentals.length() - 1; i >= 0; i--) {
            JSONObject candidate = rentals.optJSONObject(i);
            if (matches(candidate, item)) { rental = candidate; rentals.remove(i); break; }
        }
        if (rental == null) return false;
        JSONObject history = new JSONObject(rental.toString());
        history.put("end", isoToday());
        if (!history.has("used")) history.put("used", Math.max(0, elapsedDays(history.optString("start"))));
        ensureArray("rentalHistory").put(history);
        JSONObject played = new JSONObject(rental.toString());
        played.put("name", item.title); played.put("status", "Completed"); played.put("date", isoToday());
        removeMatching(array("played"), item);
        ensureArray("played").put(played);
        return true;
    }

    private JSONObject mediaCopy(MediaItem item) throws Exception {
        JSONObject copy = item.raw == null ? new JSONObject() : new JSONObject(item.raw.toString());
        if ("game".equals(item.kind)) copy.put("name", item.title); else copy.put("title", item.title);
        if (!item.poster.isEmpty()) copy.put("poster", item.poster);
        if (!item.backdrop.isEmpty()) copy.put("backdrop", item.backdrop);
        if (!item.overview.isEmpty()) copy.put("overview", item.overview);
        if (!copy.has("id")) copy.put("id", item.id);
        return copy;
    }

    private void removeMatching(JSONArray source, MediaItem item) {
        for (int i = source.length() - 1; i >= 0; i--) if (matches(source.optJSONObject(i), item)) source.remove(i);
    }

    private boolean matches(JSONObject object, MediaItem item) {
        if (object == null) return false;
        String objectId = object.optString("id");
        if (!objectId.isEmpty() && objectId.equals(item.id)) return true;
        return normalize(first(object, "title", "name")).equals(normalize(item.title));
    }

    private JSONArray ensureArray(String key) throws Exception {
        JSONArray result = root.optJSONArray(key);
        if (result == null) { result = new JSONArray(); root.put(key, result); }
        return result;
    }

    private void touch() throws Exception {
        updatedAt = System.currentTimeMillis();
        root.put("updatedAt", updatedAt);
        root.put("revision", root.optLong("revision", 0) + 1);
        root.put("lastDevice", "android-tv-native");
    }

    List<Shelf> shelves(String section) {
        List<Shelf> out = new ArrayList<>();
        if ("home".equals(section)) home(out);
        else if ("games".equals(section)) games(out);
        else if ("movies".equals(section)) movies(out);
        else if ("series".equals(section)) series(out);
        return out;
    }

    private void home(List<Shelf> out) {
        Shelf playing = new Shelf("home-playing", "Continue Playing", true);
        addGames(playing, array("rentals"), "rental", "Active rental");
        addGames(playing, array("playing"), "playing", "Now playing");
        JSONArray played = array("played");
        for (int i = 0; i < played.length(); i++) {
            JSONObject x = played.optJSONObject(i);
            if (x == null) continue;
            String status = x.optString("status");
            if ("Playing".equals(status) || "Dropped".equals(status))
                addUnique(playing, game(x, "playing", "Dropped".equals(status) ? "On hold" : "Resume later"));
        }
        add(out, playing);

        Shelf films = new Shelf("home-films", "Movie Watchlist", false);
        addMedia(films, array("movieWatchlist"), "movie", "watchlist", "Watchlist");
        add(out, films);

        Shelf shows = new Shelf("home-series", "Continue Watching", false);
        addMedia(shows, array("watchingSeries"), "series", "watching", "Watching");
        if (shows.items.isEmpty()) addMedia(shows, array("seriesWatchlist"), "series", "watchlist", "Watchlist");
        add(out, shows);

        Shelf coming = new Shelf("home-coming", "Coming Soon", false);
        addMedia(coming, catalog("movies", "uphw"), "movie", "coming", "Coming soon");
        add(out, coming);

        Shelf history = new Shelf("home-history", "Recently Completed", true);
        addGames(history, array("played"), "completed", "Completed");
        addMedia(history, array("watchedMovies"), "movie", "watched", "Watched");
        addMedia(history, array("watchedSeries"), "series", "watched", "Watched");
        add(out, history);
    }

    private void games(List<Shelf> out) {
        Shelf playing = new Shelf("games-playing", "Now Playing", true);
        addGames(playing, array("rentals"), "rental", "Active rental");
        addGames(playing, array("playing"), "playing", "Now playing");
        JSONArray played = array("played");
        for (int i = 0; i < played.length(); i++) {
            JSONObject x = played.optJSONObject(i);
            if (x == null) continue;
            String status = x.optString("status");
            if ("Playing".equals(status) || "Dropped".equals(status))
                addUnique(playing, game(x, "playing", "Dropped".equals(status) ? "On hold" : "Resume later"));
        }
        add(out, playing);

        Shelf rentals = new Shelf("games-rentals", "Active Rentals", true);
        addGames(rentals, array("rentals"), "rental", "Active rental"); add(out, rentals);
        Shelf queue = new Shelf("games-queue", "Rental Queue", true);
        addGames(queue, array("queue"), "queue", "Rental queue"); add(out, queue);

        List<JSONObject> upcoming = objects(array("upcoming"));
        Collections.sort(upcoming, new Comparator<JSONObject>() {
            @Override public int compare(JSONObject a, JSONObject b) {
                return a.optString("date", "9999").compareTo(b.optString("date", "9999"));
            }
        });
        Shelf coming = new Shelf("games-upcoming", "Upcoming Releases", true);
        for (JSONObject x : upcoming) coming.add(game(x, "upcoming", dateLabel(x.optString("date"))));
        add(out, coming);

        Shelf completed = new Shelf("games-completed", "Completed", true);
        for (int i = 0; i < played.length(); i++) {
            JSONObject x = played.optJSONObject(i);
            if (x == null) continue;
            String status = x.optString("status");
            if (!"Playing".equals(status) && !"Dropped".equals(status)) completed.add(game(x, "completed", status));
        }
        add(out, completed);
    }

    private void movies(List<Shelf> out) {
        Shelf watchlist = new Shelf("movies-watchlist", "My Watchlist", false);
        addMedia(watchlist, array("movieWatchlist"), "movie", "watchlist", "Watchlist"); add(out, watchlist);
        Shelf watching = new Shelf("movies-watching", "Watching", false);
        addMedia(watching, array("watchingMovies"), "movie", "watching", "Watching"); add(out, watching);
        Shelf coming = new Shelf("movies-coming", "Coming Soon", false);
        addMedia(coming, catalog("movies", "uphw"), "movie", "coming", "Coming soon"); add(out, coming);
        Shelf bluray = new Shelf("movies-bluray", "New on Blu-ray", false);
        addMedia(bluray, catalog("movies", "bluray"), "movie", "bluray", "Blu-ray"); add(out, bluray);
        Shelf malayalam = new Shelf("movies-malayalam", "Malayalam OTT", false);
        addMedia(malayalam, catalog("movies", "mlott"), "movie", "mlott", "Malayalam OTT"); add(out, malayalam);
        Shelf discover = new Shelf("movies-discover", "Discover", false);
        addMedia(discover, catalog("movies", "relhw"), "movie", "discover", "Recommended"); add(out, discover);
        Shelf watched = new Shelf("movies-watched", "Watched", false);
        addMedia(watched, array("watchedMovies"), "movie", "watched", "Watched"); add(out, watched);
    }

    private void series(List<Shelf> out) {
        Shelf watchlist = new Shelf("series-watchlist", "My Watchlist", false);
        addMedia(watchlist, array("seriesWatchlist"), "series", "watchlist", "Watchlist"); add(out, watchlist);
        Shelf watching = new Shelf("series-watching", "Watching", false);
        addMedia(watching, array("watchingSeries"), "series", "watching", "Watching"); add(out, watching);
        String[][] catalogShelves={{"seriesnew","New Episodes"},{"seriesupcoming","Upcoming"},{"enseries","English"},{"mlseries","Malayalam"},{"taseries","Tamil"},{"hiseries","Hindi"}};
        for (String[] entry : catalogShelves) {
            Shelf shelf = new Shelf("series-" + entry[0], entry[1], false);
            addMedia(shelf, catalog("series", entry[0]), "series", entry[0], entry[1]);
            add(out, shelf);
        }
        Shelf watched = new Shelf("series-watched", "Watched", false);
        addMedia(watched, array("watchedSeries"), "series", "watched", "Watched"); add(out, watched);
    }

    private void addGames(Shelf shelf, JSONArray source, String sourceName, String label) {
        for (int i = 0; i < source.length(); i++) addUnique(shelf, game(source.optJSONObject(i), sourceName, label));
    }

    private void addMedia(Shelf shelf, JSONArray source, String kind, String sourceName, String label) {
        for (int i = 0; i < source.length(); i++) addUnique(shelf, media(source.optJSONObject(i), kind, sourceName, label));
    }

    private MediaItem game(JSONObject x, String source, String label) {
        if (x == null) return null;
        String title = x.optString("name", "Untitled game");
        String cover = x.optString("img");
        if (cover.isEmpty()) cover = root.optJSONObject("covers") == null ? "" : root.optJSONObject("covers").optString(normalize(title));
        String status = label;
        if ("rental".equals(source)) {
            int days = rentalDaysLeft(x);
            if (days != Integer.MIN_VALUE) status = days < 0 ? "Return overdue" : days == 0 ? "Return today" : days + " days left";
        }
        String score = x.optString("rrating");
        if (score.isEmpty()) score = x.optString("score");
        String meta = score.isEmpty() ? x.optString("genre", "PS5") : "Rating " + score + " · " + x.optString("genre", "PS5");
        return new MediaItem(id(x, title), "game", source, title, status, meta, cover, cover,
            first(x, "overview", "summary", "note"), -1, x);
    }

    private MediaItem media(JSONObject x, String kind, String source, String label) {
        if (x == null) return null;
        String title = x.optString("title", "Untitled");
        String rating = x.has("imdb") ? String.format(Locale.US, "IMDb %.1f", x.optDouble("imdb")) : "";
        String year = x.optString("year");
        String meta = rating + ((!rating.isEmpty() && !year.isEmpty()) ? " · " : "") + year;
        return new MediaItem(id(x, title), kind, source, title, label, meta,
            x.optString("poster"), first(x, "backdrop", "poster"), first(x, "overview", "summary"),
            x.optInt("progress", -1), x);
    }

    private void add(List<Shelf> out, Shelf shelf) { if (!shelf.items.isEmpty()) out.add(shelf); }

    private void addUnique(Shelf shelf, MediaItem item) {
        if (item == null) return;
        String key = normalize(item.title);
        for (MediaItem existing : shelf.items) if (normalize(existing.title).equals(key)) return;
        shelf.add(item);
    }

    private int count(String key) { return array(key).length(); }
    private JSONArray array(String key) { return root.optJSONArray(key) == null ? new JSONArray() : root.optJSONArray(key); }
    private JSONArray catalog(String group, String key) {
        JSONObject snapshot = root.optJSONObject("nativeTvCatalog");
        JSONObject source = snapshot == null ? null : snapshot.optJSONObject(group);
        JSONArray items = source == null ? null : source.optJSONArray(key);
        return items == null ? new JSONArray() : items;
    }

    private static List<JSONObject> objects(JSONArray a) {
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i) != null) out.add(a.optJSONObject(i));
        return out;
    }

    private static String first(JSONObject x, String... keys) {
        for (String key : keys) { String value = x.optString(key); if (!value.isEmpty()) return value; }
        return "";
    }

    private static String id(JSONObject x, String fallback) {
        String value = x.optString("id");
        return value.isEmpty() ? normalize(fallback) : value;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.US).replaceAll("[^a-z0-9]", "");
    }

    private static String dateLabel(String value) {
        int days = daysUntil(value);
        if (days == Integer.MIN_VALUE) return "Date TBC";
        if (days == 0) return "Releases today";
        if (days > 0) return days + " days";
        return "Released";
    }

    private static int daysUntil(String value) {
        if (value == null || value.isEmpty()) return Integer.MIN_VALUE;
        try {
            Date date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(value);
            if (date == null) return Integer.MIN_VALUE;
            Date now = new Date();
            long today = now.getTime() - (now.getTime() % 86400000L);
            return (int) ((date.getTime() - today) / 86400000L);
        } catch (ParseException ignored) { return Integer.MIN_VALUE; }
    }

    private static int rentalDaysLeft(JSONObject rental) {
        String explicitEnd = rental.optString("end");
        if (!explicitEnd.isEmpty()) return daysUntil(explicitEnd);
        String start = rental.optString("start");
        int duration = rental.optInt("days", 0);
        if (start.isEmpty() || duration <= 0) return Integer.MIN_VALUE;
        try {
            Date date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(start);
            if (date == null) return Integer.MIN_VALUE;
            Calendar due = Calendar.getInstance(); due.setTime(date); due.add(Calendar.DAY_OF_MONTH, duration);
            return daysUntil(new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(due.getTime()));
        } catch (Exception ignored) { return Integer.MIN_VALUE; }
    }

    private static int elapsedDays(String start) {
        int remaining = daysUntil(start);
        return remaining == Integer.MIN_VALUE ? 0 : Math.max(0, -remaining);
    }

    private static String isoToday() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }
}
