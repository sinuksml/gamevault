package in.sinu.gamevault.nativetv;

import org.json.JSONObject;

final class MediaItem {
    final String id;
    final String kind;
    final String source;
    final String title;
    final String eyebrow;
    final String meta;
    final String poster;
    final String backdrop;
    final String overview;
    final int progress;
    final JSONObject raw;

    MediaItem(String id, String kind, String source, String title, String eyebrow,
              String meta, String poster, String backdrop, String overview,
              int progress, JSONObject raw) {
        this.id = id;
        this.kind = kind;
        this.source = source;
        this.title = title;
        this.eyebrow = eyebrow;
        this.meta = meta;
        this.poster = poster;
        this.backdrop = backdrop;
        this.overview = overview;
        this.progress = progress;
        this.raw = raw;
    }

    String image(boolean wide) {
        if (wide && !backdrop.isEmpty()) return backdrop;
        return poster.isEmpty() ? backdrop : poster;
    }
}
