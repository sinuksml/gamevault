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
    static final int DATA_SCHEMA = 14;
    final JSONObject root;
    long updatedAt;

    VaultData(JSONObject root) {
        this.root = root == null ? new JSONObject() : root;
        this.updatedAt = this.root.optLong("updatedAt", 0L);
    }

    static VaultData empty() { return new VaultData(new JSONObject()); }

    int savedCount() {
        return count("rentals") + count("subscriptions") + count("subscriptionGames")
            + count("playing") + count("queue") + count("played") + count("rentalHistory")
            + count("movieWatchlist") + count("watchingMovies") + count("watchedMovies")
            + count("seriesWatchlist") + count("watchingSeries") + count("watchedSeries");
    }

    synchronized boolean updateItem(MediaItem item, JSONObject values) {
        if (item == null || values == null) return false;
        for (JSONArray source : sourceArrays(item.source)) {
            for (int i = 0; i < source.length(); i++) {
                JSONObject candidate = source.optJSONObject(i);
                if (!matches(candidate, item)) continue;
                try {
                    java.util.Iterator<String> keys = values.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        candidate.put(key, values.opt(key));
                    }
                    touch();
                    return true;
                } catch (Exception ignored) { return false; }
            }
        }
        return false;
    }

    private List<JSONArray> sourceArrays(String key) {
        List<JSONArray> out = new ArrayList<>();
        JSONArray direct = root.optJSONArray(key);
        if (direct != null) out.add(direct);
        JSONObject snapshot = root.optJSONObject("nativeTvCatalog");
        if (snapshot != null) {
            for (String group : new String[]{"movies", "series"}) {
                JSONObject catalog = snapshot.optJSONObject(group);
                JSONArray nested = catalog == null ? null : catalog.optJSONArray(key);
                if (nested != null) out.add(nested);
            }
        }
        return out;
    }

    synchronized boolean applyAction(MediaItem item, String action) {
        if (item == null || action == null) return false;
        try {
            boolean changed;
            if ("restore".equals(action)) changed = restore(item);
            else if ("return".equals(action)) changed = returnRental(item);
            else if ("movie".equals(item.kind)) changed = moveMedia(item, action,
                new String[]{"movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies"});
            else if ("series".equals(item.kind)) changed = moveMedia(item, action,
                new String[]{"seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries"});
            else changed = moveGame(item, action);
            if (changed) touch();
            return changed;
        } catch (Exception ignored) { return false; }
    }

    private boolean restore(MediaItem item) throws Exception {
        String target = "upcomingRemoved".equals(item.source) ? "upcoming"
            : "hiddenMovies".equals(item.source) ? "movieWatchlist"
            : "hiddenSeries".equals(item.source) ? "seriesWatchlist" : "queue";
        JSONArray source = array(item.source);
        JSONObject copy = item.raw == null ? mediaCopy(item) : new JSONObject(item.raw.toString());
        removeMatching(source, item);
        removeMatching(array(target), item);
        copy.put("status", target.equals("queue") ? "Queued" : target.equals("upcoming") ? "Upcoming" : "Watchlist");
        ensureArray(target).put(copy);
        return true;
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
        else if ("resume_later".equals(action) || "on_hold".equals(action)) target = "playing";
        else if ("not_interested".equals(action)) target = "hiddenGames";
        else return false;
        String[] keys = {"queue", "playing", "played", "hiddenGames"};
        for (String key : keys) removeMatching(array(key), item);
        JSONObject copy = mediaCopy(item);
        copy.put("name", item.title);
        if ("completed".equals(action)) copy.put("status", "Completed");
        if ("playing".equals(action)) copy.put("status", "Playing");
        if ("resume_later".equals(action)) copy.put("status", "Resume Later");
        if ("on_hold".equals(action)) copy.put("status", "On Hold");
        if ("not_interested".equals(action)) copy.put("status", "Not Interested");
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
        root.put("version", DATA_SCHEMA);
        root.put("schemaVersion", DATA_SCHEMA);
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

    List<MediaItem> biglyHistory() {
        List<MediaItem> out = new ArrayList<>();
        JSONArray history = array("biglyHistory");
        for (int i = 0; i < history.length(); i++) {
            JSONObject x = history.optJSONObject(i);
            if (x == null) continue;
            String title = first(x, "name", "title");
            if (title.isEmpty()) continue;
            String status = first(x, "status", "result", "reason");
            String date = first(x, "completedAt", "removedAt", "date", "at");
            out.add(new MediaItem(id(x, title), "torrent", "biglyHistory", title, status, date, "", "", "", -1, x));
        }
        return out;
    }

    private void home(List<Shelf> out) {
        Shelf playing = new Shelf("home-playing", "Continue Playing", true);
        addGames(playing, array("rentals"), "rental", "Active rental");
        addGames(playing, array("subscriptionGames"), "subscriptionGames", "Subscription game");
        addGames(playing, array("playing"), "playing", "Now playing");
        JSONArray played = array("played");
        for (int i = 0; i < played.length(); i++) {
            JSONObject x = played.optJSONObject(i);
            if (x == null) continue;
            String status = x.optString("status");
            if ("Playing".equalsIgnoreCase(status) || "Dropped".equalsIgnoreCase(status) || "On Hold".equalsIgnoreCase(status) || "Resume Later".equalsIgnoreCase(status))
                addUnique(playing, game(x, "playing", "Dropped".equalsIgnoreCase(status) || "On Hold".equalsIgnoreCase(status) ? "On hold" : "Playing".equalsIgnoreCase(status) ? "Now playing" : "Resume later"));
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
        addGames(playing, array("subscriptionGames"), "subscriptionGames", "Subscription game");
        addGames(playing, array("playing"), "playing", "Now playing");
        JSONArray played = array("played");
        for (int i = 0; i < played.length(); i++) {
            JSONObject x = played.optJSONObject(i);
            if (x == null) continue;
            String status = x.optString("status");
            if ("Playing".equalsIgnoreCase(status) || "Dropped".equalsIgnoreCase(status) || "On Hold".equalsIgnoreCase(status) || "Resume Later".equalsIgnoreCase(status))
                addUnique(playing, game(x, "playing", "Dropped".equalsIgnoreCase(status) || "On Hold".equalsIgnoreCase(status) ? "On hold" : "Playing".equalsIgnoreCase(status) ? "Now playing" : "Resume later"));
        }
        add(out, playing);

        Shelf rentals = new Shelf("games-rentals", "Active Rentals", true);
        addGames(rentals, array("rentals"), "rental", "Active rental"); add(out, rentals);

        Shelf subscriptions = new Shelf("games-subscriptions", "Gaming Subscriptions", true);
        addSubscriptions(subscriptions); add(out, subscriptions);
        Shelf subscriptionGames = new Shelf("games-subscription-games", "Included with Subscriptions", true);
        addGames(subscriptionGames, array("subscriptionGames"), "subscriptionGames", "Included game"); add(out, subscriptionGames);

        Shelf queue = new Shelf("games-queue", "Rental Queue", true);
        addGames(queue, array("queue"), "queue", "Rental queue"); add(out, queue);

        addPlatformGames(out, "PS5 Upcoming", "games-upcoming-ps5", array("upcoming"), "upcoming", "ps5", true);
        addPlatformGames(out, "Xbox & PC Upcoming", "games-upcoming-xbox", array("upcoming"), "upcoming", "xbox", true);
        addPlatformGames(out, "PS5 Discover", "games-discover-ps5", array("catalogExtra"), "catalogExtra", "ps5", false);
        addPlatformGames(out, "Xbox & PC Discover", "games-discover-xbox", array("catalogExtra"), "catalogExtra", "xbox", false);

        Shelf completed = new Shelf("games-completed", "Completed", true);
        for (int i = 0; i < played.length(); i++) {
            JSONObject x = played.optJSONObject(i);
            if (x == null) continue;
            String status = x.optString("status");
            if (!"Playing".equalsIgnoreCase(status) && !"Dropped".equalsIgnoreCase(status) && !"On Hold".equalsIgnoreCase(status) && !"Resume Later".equalsIgnoreCase(status)) completed.add(game(x, "completed", status));
        }
        add(out, completed);

        Shelf history = new Shelf("games-rental-history", "Rental History", true);
        addGames(history, array("rentalHistory"), "rentalHistory", "Returned"); add(out, history);
        Shelf removed = new Shelf("games-removed", "Removed Upcoming Games", true);
        addGames(removed, array("upcomingRemoved"), "upcomingRemoved", "Removed"); add(out, removed);
        Shelf hidden = new Shelf("games-hidden", "Not Interested", true);
        addGames(hidden, array("hiddenGames"), "hiddenGames", "Not interested"); add(out, hidden);
    }

    private void movies(List<Shelf> out) {
        Shelf watchlist = new Shelf("movies-watchlist", "My Watchlist", false);
        addMedia(watchlist, array("movieWatchlist"), "movie", "watchlist", "Watchlist"); add(out, watchlist);
        Shelf watching = new Shelf("movies-watching", "Watching", false);
        addMedia(watching, array("watchingMovies"), "movie", "watching", "Watching"); add(out, watching);
        Shelf coming = new Shelf("movies-coming", "Coming Soon", false);
        addMediaSorted(coming, catalog("movies", "uphw"), "movie", "uphw", "Coming soon", true); add(out, coming);
        Shelf bluray = new Shelf("movies-bluray", "New on Blu-ray", false);
        addMediaSorted(bluray, catalog("movies", "bluray"), "movie", "bluray", "Blu-ray", false); add(out, bluray);
        Shelf malayalamUpcoming = new Shelf("movies-malayalam-upcoming", "Coming to Malayalam OTT", false);
        addMalayalamOtt(malayalamUpcoming, true); add(out, malayalamUpcoming);
        Shelf malayalamReleased = new Shelf("movies-malayalam-released", "Released on Malayalam OTT", false);
        addMalayalamOtt(malayalamReleased, false); add(out, malayalamReleased);
        Shelf discover = new Shelf("movies-discover", "Discover", false);
        addMediaSorted(discover, catalog("movies", "relhw"), "movie", "relhw", "Recommended", false); add(out, discover);
        Shelf watched = new Shelf("movies-watched", "Watched", false);
        addMedia(watched, array("watchedMovies"), "movie", "watched", "Watched"); add(out, watched);
        Shelf hidden = new Shelf("movies-hidden", "Not Interested", false);
        addMedia(hidden, array("hiddenMovies"), "movie", "hiddenMovies", "Not interested"); add(out, hidden);
    }

    private void series(List<Shelf> out) {
        Shelf watchlist = new Shelf("series-watchlist", "My Watchlist", false);
        addMedia(watchlist, array("seriesWatchlist"), "series", "watchlist", "Watchlist"); add(out, watchlist);
        Shelf watching = new Shelf("series-watching", "Watching", false);
        addMedia(watching, array("watchingSeries"), "series", "watching", "Watching"); add(out, watching);
        String[][] catalogShelves={{"seriesnew","New Episodes"},{"seriesupcoming","Upcoming"},{"enseries","English"},{"mlseries","Malayalam"},{"taseries","Tamil"},{"hiseries","Hindi"}};
        for (String[] entry : catalogShelves) {
            Shelf shelf = new Shelf("series-" + entry[0], entry[1], false);
            addMediaSorted(shelf, catalog("series", entry[0]), "series", entry[0], entry[1], "seriesupcoming".equals(entry[0]));
            add(out, shelf);
        }
        Shelf watched = new Shelf("series-watched", "Watched", false);
        addMedia(watched, array("watchedSeries"), "series", "watched", "Watched"); add(out, watched);
        Shelf hidden = new Shelf("series-hidden", "Not Interested", false);
        addMedia(hidden, array("hiddenSeries"), "series", "hiddenSeries", "Not interested"); add(out, hidden);
    }

    private void addSubscriptions(Shelf shelf) {
        JSONArray source = array("subscriptions");
        for (int i = 0; i < source.length(); i++) {
            JSONObject x = source.optJSONObject(i);
            if (x == null) continue;
            String title = first(x, "service", "name");
            if (title.isEmpty()) title = "Gaming subscription";
            String renewal = first(x, "renewsAt", "end", "date");
            int days = daysUntil(renewal);
            String status = days == Integer.MIN_VALUE ? first(x, "status", "active") : days < 0 ? "Expired" : days == 0 ? "Renews today" : days + " days remaining";
            String image = first(x, "img", "poster", "cover");
            String lower = title.toLowerCase(Locale.US);
            String provider = lower.contains("geforce") || lower.contains("nvidia") ? "NVIDIA GeForce NOW" : lower.contains("xbox") || lower.contains("game pass") ? "Xbox Game Pass" : "Gaming subscription";
            shelf.add(new MediaItem(id(x, title), "game", "subscriptions", title, status, provider, image, image, first(x, "note", "remarks"), -1, x));
        }
    }

    private void addPlatformGames(List<Shelf> out, String title, String id, JSONArray source, String sourceName, String platform, boolean upcoming) {
        List<JSONObject> values = objects(source);
        Collections.sort(values, (a, b) -> compareDates(a, b, upcoming));
        Shelf shelf = new Shelf(id, title, true);
        for (JSONObject x : values) {
            if (!platformMatch(x, platform)) continue;
            if (!upcoming && titleSaved(first(x, "name", "title"), new String[]{"rentals", "subscriptionGames", "playing", "queue", "played", "hiddenGames"})) continue;
            String date = first(x, "date", "releaseDate");
            shelf.add(game(x, sourceName, upcoming ? dateLabel(date) : "Discover"));
        }
        add(out, shelf);
    }

    private static boolean platformMatch(JSONObject x, String platform) {
        String value = (first(x, "platform", "platforms") + " " + String.valueOf(x.optJSONArray("platforms"))).toLowerCase(Locale.US);
        if ("ps5".equals(platform)) return value.contains("ps5") || value.contains("playstation 5");
        return value.contains("xbox") || value.contains("pc") || value.contains("windows");
    }

    private void addMediaSorted(Shelf shelf, JSONArray source, String kind, String sourceName, String label, boolean upcoming) {
        List<JSONObject> values = objects(source);
        Collections.sort(values, (a, b) -> compareDates(a, b, upcoming));
        for (JSONObject x : values) {
            boolean datedUpcoming = "uphw".equals(sourceName) || "seriesupcoming".equals(sourceName);
            String[] saved = "movie".equals(kind)
                ? new String[]{"movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies"}
                : new String[]{"seriesWatchlist", "watchingSeries", "watchedSeries", "hiddenSeries"};
            if (!datedUpcoming && titleSaved(first(x, "title", "name"), saved)) continue;
            shelf.add(media(x, kind, sourceName, label));
        }
    }

    private static int compareDates(JSONObject a, JSONObject b, boolean upcoming) {
        String da = first(a, "date", "releaseDate", "airDate", "firstAirDate", "latestDate", "year");
        String db = first(b, "date", "releaseDate", "airDate", "firstAirDate", "latestDate", "year");
        if (upcoming) {
            int aa = daysUntil(da), bb = daysUntil(db);
            int ga = aa >= 0 ? 0 : 1, gb = bb >= 0 ? 0 : 1;
            if (ga != gb) return Integer.compare(ga, gb);
            if (ga == 0) return Integer.compare(aa, bb);
        }
        return db.compareTo(da);
    }

    private void addMalayalamOtt(Shelf shelf, boolean upcoming) {
        List<JSONObject> values = objects(catalog("movies", "mlott"));
        Collections.sort(values, (a, b) -> compareDates(a, b, upcoming));
        for (JSONObject x : values) {
            int days = daysUntil(first(x, "date", "releaseDate", "ottDate"));
            if (upcoming != (days >= 0)) continue;
            if (!upcoming && titleSaved(first(x, "title", "name"), new String[]{"movieWatchlist", "watchingMovies", "watchedMovies", "hiddenMovies"})) continue;
            shelf.add(media(x, "movie", "mlott", upcoming ? "Coming to OTT" : "Now streaming"));
        }
    }

    private boolean titleSaved(String title, String[] collections) {
        String wanted = normalize(title);
        if (wanted.isEmpty()) return false;
        for (String collection : collections) {
            JSONArray values = array(collection);
            for (int i = 0; i < values.length(); i++) {
                JSONObject item = values.optJSONObject(i);
                if (item != null && wanted.equals(normalize(first(item, "title", "name")))) return true;
            }
        }
        return false;
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
        } else if ("subscriptionGames".equals(source)) {
            JSONObject subscription = findById(array("subscriptions"), x.optString("subscriptionId"));
            if (subscription != null) {
                int days = daysUntil(first(subscription, "renewsAt", "end"));
                if (days != Integer.MIN_VALUE) status = days < 0 ? "Subscription expired" : days == 0 ? "Renews today" : days + " days remaining";
            }
        }
        String score = x.optString("rrating");
        if (score.isEmpty()) score = x.optString("score");
        String platform = first(x, "platform", "tier");
        if (platform.isEmpty()) platform = "Game";
        String meta = score.isEmpty() ? platform : "Rating " + score + " | " + platform;
        String backdrop = first(x, "backdrop", "background", "img");
        return new MediaItem(id(x, title), "game", source, title, status, meta, cover, backdrop,
            first(x, "plot", "overview", "summary", "note"), -1, x);
    }

    private MediaItem media(JSONObject x, String kind, String source, String label) {
        if (x == null) return null;
        String title = x.optString("title", "Untitled");
        String rating = x.has("imdb") ? String.format(Locale.US, "IMDb %.1f", x.optDouble("imdb")) : "";
        String year = first(x, "date", "releaseDate", "airDate", "firstAirDate", "latestDate", "year");
        String provider = first(x, "provider", "ott", "network");
        String meta = rating + ((!rating.isEmpty() && !year.isEmpty()) ? " | " : "") + year;
        if (!provider.isEmpty()) meta += (meta.isEmpty() ? "" : " | ") + provider;
        int days = daysUntil(year);
        String status = days >= 0 ? dateLabel(year) : label;
        return new MediaItem(id(x, title), kind, source, title, status, meta,
            x.optString("poster"), first(x, "backdrop", "poster"), first(x, "plot", "overview", "summary"),
            x.optInt("progress", -1), x);
    }

    private void add(List<Shelf> out, Shelf shelf) { if (!shelf.items.isEmpty()) out.add(shelf); }

    private void addUnique(Shelf shelf, MediaItem item) {
        if (item == null) return;
        String key = normalize(item.title);
        for (MediaItem existing : shelf.items) if (normalize(existing.title).equals(key)) return;
        shelf.add(item);
    }

    int count(String key) { return array(key).length(); }
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

    private static JSONObject findById(JSONArray source, String id) {
        if (id == null || id.isEmpty()) return null;
        for (int i = 0; i < source.length(); i++) {
            JSONObject item = source.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) return item;
        }
        return null;
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
            Calendar today = Calendar.getInstance();
            today.set(Calendar.HOUR_OF_DAY, 0); today.set(Calendar.MINUTE, 0); today.set(Calendar.SECOND, 0); today.set(Calendar.MILLISECOND, 0);
            return (int) Math.round((date.getTime() - today.getTimeInMillis()) / 86400000d);
        } catch (ParseException ignored) { return Integer.MIN_VALUE; }
    }

    private static int rentalDaysLeft(JSONObject rental) {
        String explicitEnd = first(rental, "returnDate", "end");
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
