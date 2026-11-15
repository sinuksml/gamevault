package in.sinu.gamevault.nativetv;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Record-level merge of two vaults: a port of mergeVault() in the website's core.js.
 *
 * It exists so that when the TV and another device have both changed the library,
 * the result keeps both sets of changes. Until now the TV chose one whole file and
 * parked the other in Recovery.
 *
 * The result has to match core.js exactly, because the website, the Windows app and
 * the TV merge the same Drive file. shared/fixtures/merge-cases.json holds vaults and
 * the merged output core.js produced for them; VaultMergeTest compares against it.
 */
final class VaultMerge {
    private VaultMerge() { }

    static JSONObject merge(JSONObject localInput, JSONObject remoteInput) throws Exception {
        JSONObject local = copy(localInput);
        JSONObject remote = copy(remoteInput);
        boolean localNewer = number(local.opt("updatedAt")) >= number(remote.opt("updatedAt"));
        JSONObject result = copy(localNewer ? local : remote);

        /* Reconcile every list either side has, not only the ones this client knows
           about, so a list owned by another client is merged rather than copied from
           whichever vault happened to be newer. */
        List<String> collections = new ArrayList<>();
        Collections.addAll(collections, SyncTracker.LISTS);
        for (JSONObject side : new JSONObject[]{local, remote}) {
            Iterator<String> keys = side.keys();
            List<String> names = new ArrayList<>();
            while (keys.hasNext()) names.add(keys.next());
            Collections.sort(names);
            for (String key : names) {
                if (key.startsWith("_") || key.equals("audit") || key.equals("deletions")) continue;
                if (side.opt(key) instanceof JSONArray && !collections.contains(key)) collections.add(key);
            }
        }

        JSONObject localSync = ensureSync(local, collections);
        JSONObject remoteSync = ensureSync(remote, collections);
        JSONObject records = new JSONObject();
        JSONObject tombstones = new JSONObject();
        result.put("_sync", new JSONObject().put("version", 1).put("records", records).put("tombstones", tombstones));

        for (String collection : collections) {
            Map<String, JSONObject> localItems = byKey(collection, local.optJSONArray(collection));
            Map<String, JSONObject> remoteItems = byKey(collection, remote.optJSONArray(collection));
            JSONObject localRecords = child(localSync, "records", collection);
            JSONObject remoteRecords = child(remoteSync, "records", collection);
            JSONObject localTombs = child(localSync, "tombstones", collection);
            JSONObject remoteTombs = child(remoteSync, "tombstones", collection);

            // Same order as core.js: local keys, then remote-only keys, then tombstone-only keys.
            Map<String, Boolean> keys = new LinkedHashMap<>();
            for (String key : localItems.keySet()) keys.put(key, true);
            for (String key : remoteItems.keySet()) keys.put(key, true);
            for (String key : sortedKeys(localTombs)) keys.put(key, true);
            for (String key : sortedKeys(remoteTombs)) keys.put(key, true);

            JSONArray merged = new JSONArray();
            JSONObject recordTimes = new JSONObject();
            JSONObject tombstoneTimes = new JSONObject();
            for (String key : keys.keySet()) {
                JSONObject localItem = localItems.get(key);
                JSONObject remoteItem = remoteItems.get(key);
                long lt = localItem == null ? 0 : firstNonZero(number(localRecords.opt(key)), number(local.opt("updatedAt")));
                long rt = remoteItem == null ? 0 : firstNonZero(number(remoteRecords.opt(key)), number(remote.opt("updatedAt")));
                long deletedAt = Math.max(number(localTombs.opt(key)), number(remoteTombs.opt(key)));
                JSONObject chosen = rt > lt ? remoteItem : (localItem != null ? localItem : remoteItem);
                long chosenAt = Math.max(lt, rt);
                if (deletedAt >= chosenAt) { tombstoneTimes.put(key, deletedAt); continue; }
                if (chosen != null) { merged.put(chosen); recordTimes.put(key, chosenAt); }
            }
            result.put(collection, merged);
            records.put(collection, recordTimes);
            tombstones.put(collection, tombstoneTimes);
        }

        applyDeletionMarkers(result, local, remote);
        result.put("updatedAt", Math.max(number(local.opt("updatedAt")), number(remote.opt("updatedAt"))));
        result.put("revision", Math.max(number(local.opt("revision")), number(remote.opt("revision"))));
        return result;
    }

    /**
     * Merges the TV copy with a Drive copy and stamps the result as the newest
     * version, so the next upload carries it. The merge keeps every record's own
     * timestamp, so stamping only advances the vault-level revision.
     */
    static VaultData mergeData(VaultData tv, VaultData drive) throws Exception {
        VaultData merged = new VaultData(merge(tv.root, drive.root));
        merged.stampMerged();
        return merged;
    }

    /** Honours deletion markers written by the Windows app and by this app's own edits. */
    private static void applyDeletionMarkers(JSONObject result, JSONObject local, JSONObject remote) throws Exception {
        // One marker per collection and identity, the newest.
        Map<String, JSONObject> newest = new LinkedHashMap<>();
        for (JSONObject side : new JSONObject[]{local, remote}) {
            JSONArray markers = side.optJSONArray("deletions");
            if (markers == null) continue;
            for (int i = 0; i < markers.length(); i++) {
                JSONObject marker = markers.optJSONObject(i);
                if (marker == null || !truthy(marker.opt("collection")) || !truthy(marker.opt("identity"))) continue;
                String key = marker.optString("collection") + " " + marker.optString("identity");
                JSONObject kept = newest.get(key);
                if (kept == null || number(marker.opt("at")) > number(kept.opt("at"))) newest.put(key, marker);
            }
        }
        List<JSONObject> markers = new ArrayList<>(newest.values());
        List<JSONObject> sorted = new ArrayList<>(markers);
        Collections.sort(sorted, (a, b) -> Long.compare(number(b.opt("at")), number(a.opt("at"))));
        JSONArray ordered = new JSONArray();
        for (JSONObject marker : sorted) ordered.put(marker);
        result.put("deletions", ordered);

        Map<String, Map<String, Long>> byCollection = new LinkedHashMap<>();
        for (JSONObject marker : markers) {
            String collection = marker.optString("collection");
            Map<String, Long> identities = byCollection.get(collection);
            if (identities == null) { identities = new HashMap<>(); byCollection.put(collection, identities); }
            identities.put(marker.optString("identity").toLowerCase(Locale.ROOT), number(marker.opt("at")));
        }
        JSONObject sync = result.optJSONObject("_sync");
        for (Map.Entry<String, Map<String, Long>> entry : byCollection.entrySet()) {
            String collection = entry.getKey();
            JSONArray items = result.optJSONArray(collection);
            if (items == null) continue;
            JSONObject times = sync == null || sync.optJSONObject("records") == null ? new JSONObject() : sync.optJSONObject("records").optJSONObject(collection);
            if (times == null) times = new JSONObject();
            JSONArray kept = new JSONArray();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                long hit = 0;
                for (String candidate : SyncTracker.identityCandidates(item)) {
                    Long at = entry.getValue().get(candidate.toLowerCase(Locale.ROOT));
                    if (at != null && at > 0 && at > hit) hit = at;
                }
                // A record saved again after the deletion is a genuine re-add; keep it.
                if (hit == 0 || number(times.opt(SyncTracker.recordKey(collection, item))) > hit) kept.put(items.opt(i));
            }
            result.put(collection, kept);
        }
    }

    // ---- Helpers ----------------------------------------------------------

    private static Map<String, JSONObject> byKey(String collection, JSONArray items) {
        Map<String, JSONObject> out = new LinkedHashMap<>();
        if (items == null) return out;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String key = SyncTracker.recordKey(collection, item);
            if (!key.isEmpty()) out.put(key, item);   // a later record with the same key wins, as in core.js
        }
        return out;
    }

    private static JSONObject ensureSync(JSONObject vault, List<String> collections) throws Exception {
        JSONObject sync = vault.optJSONObject("_sync");
        if (sync == null) { sync = new JSONObject().put("version", 1); vault.put("_sync", sync); }
        for (String part : new String[]{"records", "tombstones"}) {
            JSONObject group = sync.optJSONObject(part);
            if (group == null) { group = new JSONObject(); sync.put(part, group); }
            for (String collection : collections) if (group.optJSONObject(collection) == null) group.put(collection, new JSONObject());
        }
        return sync;
    }

    private static JSONObject child(JSONObject sync, String part, String collection) {
        JSONObject group = sync.optJSONObject(part);
        JSONObject child = group == null ? null : group.optJSONObject(collection);
        return child == null ? new JSONObject() : child;
    }

    private static List<String> sortedKeys(JSONObject object) {
        List<String> names = new ArrayList<>();
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) names.add(keys.next());
        Collections.sort(names);
        return names;
    }

    private static JSONObject copy(JSONObject value) throws Exception {
        return value == null ? new JSONObject() : new JSONObject(value.toString());
    }

    private static long firstNonZero(long first, long second) {
        return first != 0 ? first : second;
    }

    private static boolean truthy(Object value) {
        return value != null && value != JSONObject.NULL && !String.valueOf(value).isEmpty();
    }

    /** A timestamp as a whole number, whatever type it was stored as; 0 when missing or unreadable. */
    static long number(Object value) {
        if (value == null || value == JSONObject.NULL) return 0;
        if (value instanceof Number) return ((Number) value).longValue();
        try { return (long) Double.parseDouble(String.valueOf(value).trim()); } catch (NumberFormatException e) { return 0; }
    }
}
