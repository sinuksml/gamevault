package in.sinu.gamevault.nativetv;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * Records what a TV edit changed, in the form every other client merges by.
 *
 * The web site, the Windows app and the TV share one Drive file and merge it
 * record by record. A merge can only tell "this device deleted the title" from
 * "this device never had it" if the deleting device says so, so every edit has to
 * leave two things behind:
 *
 *  - a timestamp for each record it added or changed, in _sync.records;
 *  - a tombstone for each record it removed, in _sync.tombstones, plus a
 *    {collection, identity, at} marker in "deletions" for the Windows app.
 *
 * Without them a title moved from the queue to Now Playing on the TV looks, to the
 * next device that merges, like a queue entry the TV simply did not have — so the
 * title comes back into the queue and ends up in both lists.
 *
 * This is a port of trackChanges() and recordKey() in the website's core.js. The
 * key function must stay identical to it: the keys written here are looked up by
 * the other clients.
 */
final class SyncTracker {
    /** The lists the other clients merge record by record. */
    static final String[] LISTS = {
        "rentals", "upcoming", "played", "dismissed", "catalogExtra", "vendors", "queue", "rentalHistory", "playing",
        "upcomingRemoved", "watchedMovies", "movieWatchlist", "watchingMovies", "hiddenMovies", "watchedSeries",
        "seriesWatchlist", "watchingSeries", "hiddenSeries", "biglyHistory", "subscriptions", "subscriptionGames",
        "purchasedGames", "petrol", "hiddenGames"
    };

    private static final String[] IDENTITY_KEYS = {"canonicalId", "rawgId", "tmdbId", "imdbId", "plexRatingKey", "key", "id"};
    private static final int MAX_DELETIONS = 1000;

    /** What one record looked like, and the identity the Windows app would file it under. */
    private static final class Entry {
        final String signature;
        final String identity;
        Entry(String signature, String identity) { this.signature = signature; this.identity = identity; }
    }

    /** The state of every tracked list at one moment. */
    static final class Snapshot {
        private final Map<String, Map<String, Entry>> lists = new HashMap<>();
    }

    private SyncTracker() { }

    static Snapshot capture(JSONObject root) {
        Snapshot snapshot = new Snapshot();
        for (String list : LISTS) {
            Map<String, Entry> entries = new HashMap<>();
            JSONArray array = root.optJSONArray(list);
            if (array != null) {
                for (int i = 0; i < array.length(); i++) {
                    JSONObject item = array.optJSONObject(i);
                    if (item == null) continue;
                    String key = recordKey(list, item);
                    if (!key.isEmpty()) entries.put(key, new Entry(stable(item), deletionIdentity(item)));
                }
            }
            snapshot.lists.put(list, entries);
        }
        return snapshot;
    }

    /** Stamps what changed since {@code before}, and leaves a tombstone for what disappeared. */
    static void apply(JSONObject root, Snapshot before, long at) throws Exception {
        JSONObject sync = syncState(root);
        JSONArray deletions = root.optJSONArray("deletions");
        if (deletions == null) { deletions = new JSONArray(); root.put("deletions", deletions); }
        Snapshot now = capture(root);

        for (String list : LISTS) {
            Map<String, Entry> was = before.lists.get(list);
            Map<String, Entry> is = now.lists.get(list);
            if (was == null) was = new HashMap<>();
            if (is == null) is = new HashMap<>();
            JSONObject records = child(child(sync, "records"), list);
            JSONObject tombstones = child(child(sync, "tombstones"), list);

            for (Map.Entry<String, Entry> entry : is.entrySet()) {
                String key = entry.getKey();
                Entry previous = was.get(key);
                if (previous == null || !previous.signature.equals(entry.getValue().signature)) {
                    records.put(key, at);
                    // Adding a title again after deleting it is a genuine re-add.
                    removeMarkers(deletions, list, entry.getValue().identity);
                }
                tombstones.remove(key);
            }
            for (Map.Entry<String, Entry> entry : was.entrySet()) {
                String key = entry.getKey();
                if (is.containsKey(key)) continue;
                tombstones.put(key, Math.max(at, tombstones.optLong(key, 0L)));
                records.remove(key);
                addMarker(deletions, list, entry.getValue().identity, at);
            }
        }
        trimMarkers(root, deletions);
    }

    // ---- Keys -------------------------------------------------------------

    /** The key a record is tracked under inside one list. Identical to recordKey() in core.js. */
    static String recordKey(String collection, JSONObject item) {
        if (item == null) return "";
        String canonical = text(item, "canonicalId");
        if (!canonical.isEmpty()) return canonical;
        String key = text(item, "key");
        if (!key.isEmpty()) return key;
        if (present(item, "tmdbId")) return (collection.contains("series") ? "tmdbtv:" : "tmdb:") + item.opt("tmdbId");
        String imdb = text(item, "imdbId");
        if (!imdb.isEmpty()) return "imdb:" + imdb;
        if (present(item, "id")) return "id:" + item.opt("id");
        String label = text(item, "name");
        if (label.isEmpty()) label = text(item, "title");
        if (label.isEmpty()) label = text(item, "label");
        return "name:" + normalize(label.isEmpty() ? stable(item) : label);
    }

    /** The identity the Windows app files a deleted record under: its strongest identifier, else its title. */
    static String deletionIdentity(JSONObject item) {
        if (item == null) return "";
        for (String key : IDENTITY_KEYS) {
            if (!present(item, key)) continue;
            String value = String.valueOf(item.opt(key));
            if (!value.isEmpty()) return key + ":" + value;
        }
        return titleIdentity(item);
    }

    private static String titleIdentity(JSONObject item) {
        String title = text(item, "name");
        if (title.isEmpty()) title = text(item, "title");
        if (title.isEmpty()) title = text(item, "service");
        String letters = lettersAndDigits(title);
        if (letters.isEmpty()) return "";
        String year = text(item, "year");
        if (year.isEmpty()) {
            String date = text(item, "date");
            if (date.length() >= 4 && date.substring(0, 4).matches("\\d{4}")) year = date.substring(0, 4);
        }
        String discriminator = text(item, "mediaType");
        if (discriminator.isEmpty()) discriminator = text(item, "platform");
        if (discriminator.isEmpty()) discriminator = text(item, "provider");
        return "title:" + letters + ":" + year + ":" + discriminator.toLowerCase(java.util.Locale.ROOT);
    }

    // ---- Deletion markers -------------------------------------------------

    private static void addMarker(JSONArray deletions, String list, String identity, long at) throws Exception {
        if (identity.isEmpty()) return;
        removeMarkers(deletions, list, identity);   // one marker per list and identity, the newest
        deletions.put(new JSONObject().put("collection", list).put("identity", identity).put("at", at));
    }

    private static void removeMarkers(JSONArray deletions, String list, String identity) {
        if (identity.isEmpty()) return;
        for (int i = deletions.length() - 1; i >= 0; i--) {
            JSONObject marker = deletions.optJSONObject(i);
            if (marker != null && list.equals(marker.optString("collection")) && identity.equalsIgnoreCase(marker.optString("identity"))) deletions.remove(i);
        }
    }

    private static void trimMarkers(JSONObject root, JSONArray deletions) throws Exception {
        if (deletions.length() <= MAX_DELETIONS) return;
        List<JSONObject> markers = new ArrayList<>();
        for (int i = 0; i < deletions.length(); i++) { JSONObject marker = deletions.optJSONObject(i); if (marker != null) markers.add(marker); }
        java.util.Collections.sort(markers, (a, b) -> Long.compare(b.optLong("at"), a.optLong("at")));
        JSONArray kept = new JSONArray();
        for (int i = 0; i < Math.min(MAX_DELETIONS, markers.size()); i++) kept.put(markers.get(i));
        root.put("deletions", kept);
    }

    // ---- Helpers ----------------------------------------------------------

    private static JSONObject syncState(JSONObject root) throws Exception {
        JSONObject sync = root.optJSONObject("_sync");
        if (sync == null) { sync = new JSONObject().put("version", 1); root.put("_sync", sync); }
        child(sync, "records");
        child(sync, "tombstones");
        return sync;
    }

    private static JSONObject child(JSONObject parent, String name) throws Exception {
        JSONObject child = parent.optJSONObject(name);
        if (child == null) { child = new JSONObject(); parent.put(name, child); }
        return child;
    }

    private static boolean present(JSONObject item, String key) {
        return item.has(key) && !item.isNull(key);
    }

    /** A value as text; empty when missing or null. org.json would otherwise turn null into the word "null". */
    private static String text(JSONObject item, String key) {
        return present(item, key) ? String.valueOf(item.opt(key)) : "";
    }

    /** Lower-case ASCII letters and digits only, for comparing titles. Identical to normalize() in core.js. */
    static String normalize(String value) {
        String text = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKD).replaceAll("\\p{M}", "");
        return text.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "");
    }

    private static String lettersAndDigits(String value) {
        return value.toLowerCase(java.util.Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }

    /** JSON with sorted keys, so two equal records always produce the same text. */
    static String stable(Object value) {
        StringBuilder out = new StringBuilder();
        write(out, value);
        return out.toString();
    }

    private static void write(StringBuilder out, Object value) {
        if (value == null || value == JSONObject.NULL) { out.append("null"); return; }
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            TreeSet<String> keys = new TreeSet<>();
            Iterator<String> iterator = object.keys();
            while (iterator.hasNext()) keys.add(iterator.next());
            out.append('{');
            boolean first = true;
            for (String key : keys) {
                if (!first) out.append(',');
                first = false;
                out.append(JSONObject.quote(key)).append(':');
                write(out, object.opt(key));
            }
            out.append('}');
        } else if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            out.append('[');
            for (int i = 0; i < array.length(); i++) { if (i > 0) out.append(','); write(out, array.opt(i)); }
            out.append(']');
        } else if (value instanceof String) {
            out.append(JSONObject.quote((String) value));
        } else {
            out.append(value);
        }
    }
}
