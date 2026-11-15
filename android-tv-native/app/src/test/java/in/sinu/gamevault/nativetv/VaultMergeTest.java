package in.sinu.gamevault.nativetv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * The TV must merge exactly as the website does. shared/fixtures/merge-cases.json
 * holds vaults and the merged output the website's core.js produced for them
 * (regenerate with node shared/fixtures/merge-cases.mjs). Any difference here means
 * the TV and another device would disagree about the library after a sync.
 */
public final class VaultMergeTest {
    private static JSONObject fixture() throws Exception {
        for (String path : new String[]{"../../shared/fixtures/merge-cases.json", "shared/fixtures/merge-cases.json", "../shared/fixtures/merge-cases.json"}) {
            File file = new File(path);
            if (file.isFile()) return new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
        }
        throw new AssertionError("merge-cases.json not found from " + new File(".").getAbsolutePath());
    }

    @Test public void mergesMatchTheWebsiteInBothDirections() throws Exception {
        JSONArray cases = fixture().getJSONArray("cases");
        assertTrue("fixture should hold several cases", cases.length() >= 10);
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            String name = c.getString("name");
            assertEquals(name, SyncTracker.stable(c.getJSONObject("merged")), SyncTracker.stable(VaultMerge.merge(c.getJSONObject("local"), c.getJSONObject("remote"))));
            assertEquals(name + " (reversed)", SyncTracker.stable(c.getJSONObject("mergedFromRemote")), SyncTracker.stable(VaultMerge.merge(c.getJSONObject("remote"), c.getJSONObject("local"))));
        }
    }

    @Test public void mergingDoesNotModifyItsInputs() throws Exception {
        JSONObject c = fixture().getJSONArray("cases").getJSONObject(0);
        String local = SyncTracker.stable(c.getJSONObject("local"));
        String remote = SyncTracker.stable(c.getJSONObject("remote"));
        VaultMerge.merge(c.getJSONObject("local"), c.getJSONObject("remote"));
        assertEquals(local, SyncTracker.stable(c.getJSONObject("local")));
        assertEquals(remote, SyncTracker.stable(c.getJSONObject("remote")));
    }

    @Test public void aMovePlusAnotherDevicesEditSurvivesTogether() throws Exception {
        // The scenario from the review: TV moves a game, another device edits a different one.
        // A synced vault: both records already carry the time they were last changed.
        JSONObject base = new JSONObject("{\"updatedAt\":1000,\"revision\":4,\"queue\":[{\"id\":\"a\",\"name\":\"Alpha\",\"canonicalId\":\"game:title:alpha|\"},{\"id\":\"b\",\"name\":\"Beta\",\"canonicalId\":\"game:title:beta|\"}],\"playing\":[],"
            + "\"_sync\":{\"version\":1,\"records\":{\"queue\":{\"game:title:alpha|\":1000,\"game:title:beta|\":1000}},\"tombstones\":{}}}");
        VaultData tv = new VaultData(new JSONObject(base.toString()));
        JSONObject alpha = tv.root.getJSONArray("queue").getJSONObject(0);
        assertTrue(tv.applyAction(new MediaItem("a", "game", "queue", "Alpha", "", "", "", "", "", 0, alpha), "playing"));
        Thread.sleep(5);   // the phone's edit comes later, so its timestamp is later

        VaultData phone = new VaultData(new JSONObject(base.toString()));
        JSONObject beta = phone.root.getJSONArray("queue").getJSONObject(1);
        assertTrue(phone.updateItem(new MediaItem("b", "game", "queue", "Beta", "", "", "", "", "", 0, beta), new JSONObject("{\"note\":\"edited on the phone\"}")));

        JSONObject merged = VaultMerge.merge(tv.root, phone.root);
        assertEquals(1, merged.getJSONArray("queue").length());
        assertEquals("edited on the phone", merged.getJSONArray("queue").getJSONObject(0).getString("note"));
        assertEquals("Alpha", merged.getJSONArray("playing").getJSONObject(0).getString("name"));
    }
}
