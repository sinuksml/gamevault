package in.sinu.gamevault.nativetv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Pins the TV's side of the sync contract. The expected keys below were produced
 * by running recordKey() from the website's core.js on the same records; if they
 * ever disagree, a title moved on the TV is resurrected by the next device that
 * merges.
 */
public final class SyncTrackerTest {
    private static MediaItem item(String id, String kind, String source, String title, JSONObject raw) {
        return new MediaItem(id, kind, source, title, "", "", "", "", "", 0, raw);
    }

    private static VaultData vaultWith(String list, JSONObject record) throws Exception {
        JSONObject root = new JSONObject();
        root.put("updatedAt", 1000L).put("revision", 4L);
        root.put(list, new JSONArray().put(record));
        return new VaultData(root);
    }

    @Test public void recordKeysMatchTheWebsite() throws Exception {
        assertEquals("game:title:alpha|", SyncTracker.recordKey("queue", new JSONObject("{\"canonicalId\":\"game:title:alpha|\",\"id\":\"a\"}")));
        assertEquals("tmdb:7", SyncTracker.recordKey("movieWatchlist", new JSONObject("{\"key\":\"tmdb:7\",\"id\":7}")));
        assertEquals("tmdbtv:42", SyncTracker.recordKey("seriesWatchlist", new JSONObject("{\"tmdbId\":42,\"title\":\"Show\"}")));
        assertEquals("tmdb:42", SyncTracker.recordKey("movieWatchlist", new JSONObject("{\"tmdbId\":42,\"title\":\"Film\"}")));
        assertEquals("imdb:tt1", SyncTracker.recordKey("queue", new JSONObject("{\"imdbId\":\"tt1\",\"name\":\"X\"}")));
        assertEquals("id:zz", SyncTracker.recordKey("queue", new JSONObject("{\"id\":\"zz\",\"name\":\"Y\"}")));
        assertEquals("name:cafemananaepisode2", SyncTracker.recordKey("queue", new JSONObject("{\"name\":\"Café Mañana: Épisode 2!\"}")));
        assertEquals("name:testtitulo", SyncTracker.recordKey("queue", new JSONObject("{\"title\":\"Tëst  Título\"}")));
        assertEquals("name:date20260102", SyncTracker.recordKey("petrol", new JSONObject("{\"date\":\"2026-01-02\"}")));
    }

    @Test public void movingAGameLeavesATombstoneAndAStamp() throws Exception {
        JSONObject record = new JSONObject("{\"id\":\"a\",\"name\":\"Alpha\",\"canonicalId\":\"game:title:alpha|\"}");
        VaultData vault = vaultWith("queue", record);
        assertTrue(vault.applyAction(item("a", "game", "queue", "Alpha", record), "playing"));

        JSONObject root = vault.root;
        assertEquals(0, root.getJSONArray("queue").length());
        assertEquals(1, root.getJSONArray("playing").length());

        JSONObject sync = root.getJSONObject("_sync");
        long removedAt = sync.getJSONObject("tombstones").getJSONObject("queue").getLong("game:title:alpha|");
        long addedAt = sync.getJSONObject("records").getJSONObject("playing").getLong("game:title:alpha|");
        assertEquals(root.getLong("updatedAt"), removedAt);
        assertEquals(removedAt, addedAt);
        assertFalse(sync.getJSONObject("records").getJSONObject("queue").has("game:title:alpha|"));

        // The Windows app reads its own marker.
        JSONObject marker = root.getJSONArray("deletions").getJSONObject(0);
        assertEquals("queue", marker.getString("collection"));
        assertEquals("canonicalId:game:title:alpha|", marker.getString("identity"));

        assertEquals(5L, root.getLong("revision"));
        assertEquals("android-tv-native", root.getString("lastDevice"));
    }

    @Test public void aMovieMovesBetweenItsListsTheSameWay() throws Exception {
        JSONObject record = new JSONObject("{\"id\":7,\"key\":\"tmdb:7\",\"title\":\"Dune\"}");
        VaultData vault = vaultWith("movieWatchlist", record);
        assertTrue(vault.applyAction(item("7", "movie", "movieWatchlist", "Dune", record), "watched"));
        JSONObject sync = vault.root.getJSONObject("_sync");
        assertTrue(sync.getJSONObject("tombstones").getJSONObject("movieWatchlist").has("tmdb:7"));
        assertTrue(sync.getJSONObject("records").getJSONObject("watchedMovies").has("tmdb:7"));
    }

    @Test public void addingATitleBackClearsItsTombstoneAndMarker() throws Exception {
        JSONObject record = new JSONObject("{\"id\":\"a\",\"name\":\"Alpha\",\"canonicalId\":\"game:title:alpha|\"}");
        VaultData vault = vaultWith("queue", record);
        vault.applyAction(item("a", "game", "queue", "Alpha", record), "playing");
        JSONObject playing = vault.root.getJSONArray("playing").getJSONObject(0);
        vault.applyAction(item("a", "game", "playing", "Alpha", playing), "queue");

        JSONObject sync = vault.root.getJSONObject("_sync");
        assertFalse(sync.getJSONObject("tombstones").getJSONObject("queue").has("game:title:alpha|"));
        assertTrue(sync.getJSONObject("tombstones").getJSONObject("playing").has("game:title:alpha|"));
        // The queue marker is gone; only the newer playing marker remains.
        JSONArray markers = vault.root.getJSONArray("deletions");
        for (int i = 0; i < markers.length(); i++) assertFalse("queue".equals(markers.getJSONObject(i).getString("collection")));
    }

    @Test public void fetchedDetailsDoNotCountAsAnEdit() throws Exception {
        JSONObject record = new JSONObject("{\"id\":\"a\",\"name\":\"Alpha\"}");
        VaultData vault = vaultWith("playing", record);
        assertTrue(vault.updateCache(item("a", "game", "playing", "Alpha", record), new JSONObject("{\"plot\":\"A story.\"}")));
        assertEquals(1000L, vault.root.getLong("updatedAt"));
        assertEquals(4L, vault.root.getLong("revision"));
        assertFalse(vault.root.has("_sync"));
        assertEquals("A story.", vault.root.getJSONArray("playing").getJSONObject(0).getString("plot"));
    }

    @Test public void aRealEditBumpsTheRevisionAndStampsOnlyTheChangedRecord() throws Exception {
        JSONObject record = new JSONObject("{\"id\":\"a\",\"name\":\"Alpha\",\"canonicalId\":\"game:title:alpha|\"}");
        JSONObject other = new JSONObject("{\"id\":\"b\",\"name\":\"Beta\",\"canonicalId\":\"game:title:beta|\"}");
        JSONObject root = new JSONObject().put("updatedAt", 1000L).put("revision", 4L).put("playing", new JSONArray().put(record).put(other));
        VaultData vault = new VaultData(root);
        assertTrue(vault.updateItem(item("a", "game", "playing", "Alpha", record), new JSONObject("{\"userRating\":9}")));
        JSONObject stamps = vault.root.getJSONObject("_sync").getJSONObject("records").getJSONObject("playing");
        assertTrue(stamps.has("game:title:alpha|"));
        assertFalse(stamps.has("game:title:beta|"));
        assertEquals(5L, vault.root.getLong("revision"));
    }
}
