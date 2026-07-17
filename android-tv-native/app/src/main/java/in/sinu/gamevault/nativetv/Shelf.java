package in.sinu.gamevault.nativetv;

import java.util.ArrayList;
import java.util.List;

final class Shelf {
    final String id;
    final String title;
    final boolean wide;
    final List<MediaItem> items = new ArrayList<>();

    Shelf(String id, String title, boolean wide) {
        this.id = id;
        this.title = title;
        this.wide = wide;
    }

    Shelf add(MediaItem item) {
        if (item != null) items.add(item);
        return this;
    }
}
