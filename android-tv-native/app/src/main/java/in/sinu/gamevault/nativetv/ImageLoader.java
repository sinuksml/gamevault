package in.sinu.gamevault.nativetv;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class ImageLoader {
    private final File cacheDir;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private final Map<String, Bitmap> memory = new LinkedHashMap<String, Bitmap>(80, .75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Bitmap> eldest) { return size() > 80; }
    };
    private final java.util.Set<String> pending = java.util.Collections.synchronizedSet(new java.util.HashSet<>());

    ImageLoader(Context context) {
        cacheDir = new File(context.getCacheDir(), "artwork");
        if (!cacheDir.exists()) cacheDir.mkdirs();
    }

    Bitmap get(String url, Runnable ready) {
        if (url == null || url.isEmpty()) return null;
        synchronized (memory) { if (memory.containsKey(url)) return memory.get(url); }
        File file = new File(cacheDir, hash(url));
        if (file.exists()) {
            Bitmap bitmap = decode(file);
            if (bitmap != null) { synchronized (memory) { memory.put(url, bitmap); } return bitmap; }
        }
        if (pending.add(url)) pool.execute(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(10000); c.setReadTimeout(15000); c.setInstanceFollowRedirects(true);
                if (c.getResponseCode() < 400) {
                    try (java.io.InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(file)) {
                        byte[] b = new byte[16384]; int n; while ((n = in.read(b)) > 0) out.write(b, 0, n);
                    }
                    Bitmap bitmap = decode(file);
                    if (bitmap != null) synchronized (memory) { memory.put(url, bitmap); }
                }
                c.disconnect();
            } catch (Exception ignored) { }
            pending.remove(url);
            if (ready != null) ready.run();
        });
        return null;
    }

    void clear() {
        synchronized (memory) { memory.clear(); }
        File[] files = cacheDir.listFiles(); if (files != null) for (File f : files) f.delete();
    }

    private Bitmap decode(File file) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
            int sample = 1; while (bounds.outWidth / sample > 1400 || bounds.outHeight / sample > 1400) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options(); opts.inSampleSize = sample; opts.inPreferredConfig = Bitmap.Config.RGB_565;
            return BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
        } catch (Exception ignored) { return null; }
    }

    private String hash(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes("UTF-8"));
            StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format("%02x", b)); return out.toString();
        } catch (Exception ignored) { return Integer.toHexString(value.hashCode()); }
    }
}
