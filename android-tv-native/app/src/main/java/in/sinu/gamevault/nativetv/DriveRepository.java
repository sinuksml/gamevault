package in.sinu.gamevault.nativetv;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class DriveRepository {
    interface Listener {
        void onStatus(String message);
        void onData(VaultData data);
        void onDeviceCode(String verificationUrl, String userCode, long expiresAt);
    }

    static final String DEFAULT_CLIENT_ID = "898110284062-76km1uptkth506kgaecoafohu15js0rh.apps.googleusercontent.com";
    private static final String FILE_NAME = "game-vault-backup.json";
    private static final String SCOPE = "https://www.googleapis.com/auth/drive.file";
    private final Context context;
    private final SecurePrefs secure;
    private final android.content.SharedPreferences prefs;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile long lastSyncedUpdatedAt;

    DriveRepository(Context context) {
        this.context = context.getApplicationContext();
        secure = new SecurePrefs(context);
        prefs = context.getSharedPreferences("native_tv", Context.MODE_PRIVATE);
        lastSyncedUpdatedAt = cached().updatedAt;
    }

    VaultData cached() {
        try {
            File file = new File(context.getFilesDir(), FILE_NAME);
            if (!file.exists()) return VaultData.empty();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (FileInputStream in = new FileInputStream(file)) {
                byte[] buffer = new byte[16384]; int count;
                while ((count = in.read(buffer)) > 0) out.write(buffer, 0, count);
            }
            return new VaultData(new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8)));
        } catch (Exception ignored) { return VaultData.empty(); }
    }

    boolean connected() { return !secure.get("drive_refresh").isEmpty() || !secure.get("drive_access").isEmpty(); }
    String clientId() { return prefs.getString("drive_client", DEFAULT_CLIENT_ID); }
    String clientSecret() { return secure.get("drive_secret"); }
    void configure(String client, String secret) {
        prefs.edit().putString("drive_client", client == null || client.trim().isEmpty() ? DEFAULT_CLIENT_ID : client.trim()).apply();
        if (secret != null && !secret.trim().isEmpty()) secure.put("drive_secret", secret.trim());
    }

    void disconnect() {
        secure.remove("drive_access"); secure.remove("drive_refresh"); secure.remove("drive_secret");
        prefs.edit().remove("drive_exp").remove("drive_file").apply();
    }

    void cache(VaultData value) {
        if (value == null) return;
        try (FileOutputStream out = new FileOutputStream(new File(context.getFilesDir(), FILE_NAME))) {
            out.write(value.root.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {}
    }

    void sync(Listener listener) {
        io.execute(() -> {
            try {
                listener.onStatus("Checking Google Drive...");
                String token = accessToken();
                if (token.isEmpty()) throw new Exception("Connect Google Drive in Settings first.");
                Map<String,String> h = new HashMap<>(); h.put("Authorization", "Bearer " + token);
                String q = URLEncoderCompat.encode("name='" + FILE_NAME + "' and trashed=false");
                Net.Response list = Net.request("https://www.googleapis.com/drive/v3/files?q=" + q + "&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size)&pageSize=10", "GET", h, null);
                if (list.code >= 400) throw new Exception("Drive returned " + list.code);
                JSONArray files = list.json().optJSONArray("files");
                if (files == null || files.length() == 0) throw new Exception("No " + FILE_NAME + " was found. Sync from your phone or PC first.");
                String id = files.optJSONObject(0).optString("id");
                Net.Response download = Net.request("https://www.googleapis.com/drive/v3/files/" + id + "?alt=media", "GET", h, null);
                if (download.code >= 400) throw new Exception("Backup download failed: " + download.code);
                JSONObject json = new JSONObject(download.body);
                if (!json.has("rentals") && !json.has("played") && !json.has("queue")) throw new Exception("Drive file is not a GameVault backup.");
                VaultData value = new VaultData(json);
                cache(value);
                lastSyncedUpdatedAt = value.updatedAt;
                prefs.edit().putString("drive_file", id).apply();
                listener.onData(value);
                listener.onStatus("Synced with Google Drive");
            } catch (Exception e) { listener.onStatus(e.getMessage() == null ? "Drive sync failed" : e.getMessage()); }
        });
    }

    void save(VaultData value, Listener listener) {
        if (value == null) return;
        cache(value);
        io.execute(() -> {
            try {
                listener.onStatus("Saving TV change...");
                String token = accessToken();
                if (token.isEmpty()) throw new Exception("TV change saved locally. Connect Drive to sync it.");
                Map<String,String> auth = new HashMap<>(); auth.put("Authorization", "Bearer " + token);
                String id = prefs.getString("drive_file", "");
                if (id.isEmpty()) {
                    String q = URLEncoderCompat.encode("name='" + FILE_NAME + "' and trashed=false");
                    Net.Response list = Net.request("https://www.googleapis.com/drive/v3/files?q=" + q + "&orderBy=modifiedTime%20desc&fields=files(id)&pageSize=1", "GET", auth, null);
                    JSONArray files = list.json().optJSONArray("files");
                    if (list.code >= 400 || files == null || files.length() == 0) throw new Exception("Drive backup was not found. Sync before editing on TV.");
                    id = files.optJSONObject(0).optString("id");
                    prefs.edit().putString("drive_file", id).apply();
                }
                Net.Response remoteResponse = Net.request("https://www.googleapis.com/drive/v3/files/" + id + "?alt=media", "GET", auth, null);
                if (remoteResponse.code >= 400) throw new Exception("Could not check the latest Drive copy.");
                VaultData remote = new VaultData(new JSONObject(remoteResponse.body));
                if (remote.updatedAt > lastSyncedUpdatedAt && !"android-tv-native".equals(remote.root.optString("lastDevice"))) {
                    cache(remote); lastSyncedUpdatedAt = remote.updatedAt;
                    listener.onData(remote);
                    listener.onStatus("Newer Drive changes restored; repeat the TV action if still needed");
                    return;
                }
                Map<String,String> headers = new HashMap<>(auth);
                headers.put("Content-Type", "application/json; charset=UTF-8");
                Net.Response upload = Net.request("https://www.googleapis.com/upload/drive/v3/files/" + id + "?uploadType=media", "PATCH", headers, value.root.toString());
                if (upload.code >= 400) throw new Exception("Drive save failed: " + upload.code);
                lastSyncedUpdatedAt = value.updatedAt;
                cache(value);
                listener.onStatus("TV change saved to Google Drive");
            } catch (Exception e) {
                listener.onStatus(e.getMessage() == null ? "Drive save failed" : e.getMessage());
            }
        });
    }

    void startDeviceLogin(Listener listener) {
        io.execute(() -> {
            try {
                listener.onStatus("Creating Google login code...");
                Map<String,String> f = new HashMap<>(); f.put("client_id", clientId()); f.put("scope", SCOPE);
                Map<String,String> h = new HashMap<>(); h.put("Content-Type", "application/x-www-form-urlencoded");
                Net.Response response = Net.request("https://oauth2.googleapis.com/device/code", "POST", h, Net.form(f));
                JSONObject info = response.json();
                if (response.code >= 400) throw new Exception(info.optString("error_description", "Device login failed"));
                String url = info.optString("verification_url_complete", info.optString("verification_uri_complete", info.optString("verification_url", info.optString("verification_uri"))));
                String code = info.optString("user_code");
                long expires = System.currentTimeMillis() + info.optLong("expires_in", 1800) * 1000L;
                listener.onDeviceCode(url, code, expires);
                poll(info.optString("device_code"), Math.max(5, info.optInt("interval", 5)), expires, listener);
            } catch (Exception e) { listener.onStatus(e.getMessage() == null ? "Google login failed" : e.getMessage()); }
        });
    }

    private void poll(String deviceCode, int interval, long expires, Listener listener) throws Exception {
        while (System.currentTimeMillis() < expires) {
            Thread.sleep(interval * 1000L);
            Map<String,String> f = new HashMap<>();
            f.put("client_id", clientId());
            if (!clientSecret().isEmpty()) f.put("client_secret", clientSecret());
            f.put("device_code", deviceCode);
            f.put("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
            Map<String,String> h = new HashMap<>(); h.put("Content-Type", "application/x-www-form-urlencoded");
            Net.Response response = Net.request("https://oauth2.googleapis.com/token", "POST", h, Net.form(f));
            JSONObject json = response.json();
            if (response.code < 400 && !json.optString("access_token").isEmpty()) {
                secure.put("drive_access", json.optString("access_token"));
                if (!json.optString("refresh_token").isEmpty()) secure.put("drive_refresh", json.optString("refresh_token"));
                prefs.edit().putLong("drive_exp", System.currentTimeMillis() + json.optLong("expires_in", 3600) * 1000L).apply();
                listener.onStatus("Google Drive connected");
                sync(listener);
                return;
            }
            String error = json.optString("error");
            if ("authorization_pending".equals(error)) continue;
            if ("slow_down".equals(error)) { interval += 5; continue; }
            throw new Exception(json.optString("error_description", error));
        }
        throw new Exception("Google login code expired.");
    }

    private String accessToken() throws Exception {
        String token = secure.get("drive_access");
        if (!token.isEmpty() && System.currentTimeMillis() < prefs.getLong("drive_exp", 0) - 60000) return token;
        String refresh = secure.get("drive_refresh");
        if (refresh.isEmpty()) return "";
        Map<String,String> f = new HashMap<>(); f.put("client_id", clientId()); f.put("refresh_token", refresh); f.put("grant_type", "refresh_token");
        if (!clientSecret().isEmpty()) f.put("client_secret", clientSecret());
        Map<String,String> h = new HashMap<>(); h.put("Content-Type", "application/x-www-form-urlencoded");
        Net.Response response = Net.request("https://oauth2.googleapis.com/token", "POST", h, Net.form(f));
        JSONObject json = response.json();
        if (response.code >= 400) throw new Exception(json.optString("error_description", "Google session expired"));
        token = json.optString("access_token");
        secure.put("drive_access", token);
        prefs.edit().putLong("drive_exp", System.currentTimeMillis() + json.optLong("expires_in", 3600) * 1000L).apply();
        return token;
    }

    private static final class URLEncoderCompat {
        static String encode(String value) throws Exception { return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20"); }
    }
}
