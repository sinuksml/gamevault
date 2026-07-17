package in.sinu.gamevault.nativetv;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Remote-first, view-only renderer for Android TV. The fixed 1920x1080 design
 * surface is scaled into the real display while preserving TV safe areas.
 */
@SuppressLint("ViewConstructor")
final class VaultTvView extends View {
    interface Actions {
        void syncDrive();
        void connectDrive();
        void disconnectDrive();
        void configureDrive();
        void configurePlex();
        void refreshPlex();
        void configureBigly();
        void loginBigly();
        void refreshBigly();
        void clearArtwork();
        void updateLibrary(MediaItem item, String action);
        void openYouTube(String query);
        void openWeb(String url);
    }

    private static final float DESIGN_W = 1920f, DESIGN_H = 1080f;
    private static final int BG = Color.rgb(3, 6, 10);
    private static final int PANEL = Color.rgb(13, 23, 35);
    private static final int PANEL_2 = Color.rgb(19, 36, 54);
    private static final int TEXT = Color.rgb(242, 247, 252);
    private static final int MUTED = Color.rgb(158, 174, 194);
    private static final int ACCENT = Color.rgb(84, 242, 210);
    private static final int BLUE = Color.rgb(63, 135, 244);
    private static final int AMBER = Color.rgb(255, 190, 74);
    private static final int RED = Color.rgb(255, 99, 108);
    private static final long DIM_AFTER_MS = 3 * 60 * 1000L;
    private static final long AMBIENT_AFTER_MS = 6 * 60 * 1000L;

    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final ImageLoader images;
    private final Actions actions;
    private final String[] nav = {"Home", "Games", "Movies", "TV Shows", "Plex", "BiglyBT", "System"};
    private final String[] sections = {"home", "games", "movies", "series", "plex", "bigly", "settings"};
    private final Map<String, Integer> savedRows = new HashMap<>();
    private final Map<String, Integer> savedStarts = new HashMap<>();
    private final Map<String, Integer> savedCols = new HashMap<>();

    private VaultData data = VaultData.empty();
    private List<MediaItem> plexItems = new ArrayList<>();
    private List<ServiceRepository.TorrentItem> torrents = new ArrayList<>();
    private List<Shelf> shelves = new ArrayList<>();
    private int navIndex, row, col, rowStart, focusArea, detailAction, settingIndex, detailScroll;
    private MediaItem detail;
    private boolean torrentInspector;
    private String status = "Local library ready";
    private long statusChangedAt = SystemClock.uptimeMillis();
    private boolean driveConnected;
    private Bitmap qr;
    private String qrCode = "", qrUrl = "";
    private long qrExpires, lastBack, lastInteraction = SystemClock.uptimeMillis();
    private long focusStartedAt = SystemClock.uptimeMillis();
    private String lastA11y = "";

    VaultTvView(Context context, Actions actions) {
        super(context);
        this.actions = actions;
        this.images = new ImageLoader(context);
        setFocusable(true);
        setFocusableInTouchMode(true);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
        setLayerType(LAYER_TYPE_SOFTWARE, null);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(4);
        stroke.setColor(ACCENT);
        rebuild();
        updateAccessibility(false);
    }

    void setData(VaultData value) {
        data = value == null ? VaultData.empty() : value;
        rebuild();
    }

    void setPlex(List<MediaItem> value) {
        plexItems = value == null ? new ArrayList<>() : value;
        if (navIndex == 4) rebuild();
    }

    void setTorrents(List<ServiceRepository.TorrentItem> value) {
        torrents = value == null ? new ArrayList<>() : value;
        row = clamp(row, 0, Math.max(0, torrents.size() - 1));
        invalidate();
    }

    void setStatus(String value) {
        status = value == null ? "" : value;
        statusChangedAt = SystemClock.uptimeMillis();
        postInvalidate();
    }

    void setDriveConnected(boolean value) {
        driveConnected = value;
        invalidate();
    }

    void showQr(String url, String code, long expires) {
        qrUrl = url;
        qrCode = code;
        qrExpires = expires;
        qr = null;
        String image = "https://quickchart.io/qr?size=420&text=" + urlEncode(url);
        images.get(image, () -> {
            qr = images.get(image, null);
            postInvalidate();
        });
        invalidate();
    }

    void hideQr() {
        qrUrl = "";
        qrCode = "";
        qr = null;
        invalidate();
    }

    void clearArtwork() {
        images.clear();
        invalidate();
    }

    private String section() { return sections[navIndex]; }

    private void savePosition() {
        String section = section();
        savedRows.put(section, row);
        savedStarts.put(section, rowStart);
        if (row >= 0 && row < shelves.size()) savedCols.put(section + ":" + shelves.get(row).id, col);
    }

    private void rebuild() {
        if (navIndex < 4) shelves = data.shelves(section());
        else if (navIndex == 4) shelves = plexShelves();
        else shelves = new ArrayList<>();
        String section = section();
        row = clamp(value(savedRows, section), 0, Math.max(0, shelves.size() - 1));
        rowStart = clamp(value(savedStarts, section), 0, Math.max(0, shelves.size() - 1));
        col = clamp(savedCol(row), 0, Math.max(0, itemCount(row) - 1));
        keepRowVisible();
        invalidate();
    }

    private List<Shelf> plexShelves() {
        List<Shelf> out = new ArrayList<>();
        Shelf watching = new Shelf("plex-continue", "Continue Watching", true);
        Shelf recent = new Shelf("plex-recent", "Recently Added", false);
        Shelf movies = new Shelf("plex-movies", "Movies", false);
        Shelf shows = new Shelf("plex-shows", "TV Series", false);
        for (MediaItem item : plexItems) {
            if (item.progress > 0 && item.progress < 100) watching.add(item);
            recent.add(item);
            if ("series".equals(item.kind)) shows.add(item); else movies.add(item);
        }
        addShelf(out, watching);
        addShelf(out, recent);
        addShelf(out, movies);
        addShelf(out, shows);
        return out;
    }

    private static void addShelf(List<Shelf> out, Shelf shelf) {
        if (!shelf.items.isEmpty()) out.add(shelf);
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float scale = Math.min(getWidth() / DESIGN_W, getHeight() / DESIGN_H);
        float offsetX = (getWidth() - DESIGN_W * scale) / 2f;
        float offsetY = (getHeight() - DESIGN_H * scale) / 2f;
        canvas.save();
        canvas.translate(offsetX, offsetY);
        canvas.scale(scale, scale);
        long idle = SystemClock.uptimeMillis() - lastInteraction;
        if (idle >= AMBIENT_AFTER_MS) {
            drawAmbient(canvas);
            canvas.restore();
            postInvalidateDelayed(30_000L);
            return;
        }
        drawBackground(canvas);
        drawRail(canvas);
        if (!qrUrl.isEmpty()) drawQr(canvas);
        else if (detail != null) drawDetail(canvas);
        else if (navIndex == 6) drawSettings(canvas);
        else if (navIndex == 5) drawBigly(canvas);
        else if (navIndex == 0) drawHome(canvas);
        else drawLibrary(canvas, 170f, 2);
        drawStatusToast(canvas);
        if (idle >= DIM_AFTER_MS) {
            p.setColor(Color.argb(72, 0, 0, 0));
            canvas.drawRect(0, 0, DESIGN_W, DESIGN_H, p);
            postInvalidateDelayed(15_000L);
        }
        canvas.restore();
    }

    private void drawBackground(Canvas c) {
        c.drawColor(BG);
        MediaItem hero = detail != null ? detail : firstItem();
        if (hero != null) {
            Bitmap b = images.get(hero.image(true), this::postInvalidate);
            if (b != null) {
                RectF dst = new RectF(260, 0, DESIGN_W, DESIGN_H);
                drawCenterCrop(c, b, dst, 0);
                p.setColor(Color.argb(130, 2, 5, 9));
                c.drawRect(dst, p);
            }
        }
        p.setShader(new LinearGradient(180, 0, 1510, 0, BG, Color.argb(38, 3, 6, 10), Shader.TileMode.CLAMP));
        c.drawRect(100, 0, DESIGN_W, DESIGN_H, p);
        p.setShader(null);
        p.setShader(new LinearGradient(0, 620, 0, DESIGN_H, Color.TRANSPARENT, BG, Shader.TileMode.CLAMP));
        c.drawRect(100, 500, DESIGN_W, DESIGN_H, p);
        p.setShader(null);
    }

    private void drawRail(Canvas c) {
        boolean expanded = focusArea == 0;
        float railW = expanded ? 286 : 116;
        p.setColor(Color.argb(242, 5, 10, 17));
        c.drawRect(0, 0, railW, DESIGN_H, p);
        p.setColor(Color.rgb(31, 50, 68));
        c.drawRect(railW - 1, 46, railW + 1, DESIGN_H - 46, p);
        round(c, 31, 35, 95, 99, 17, ACCENT);
        text(c, "GV", 63, 77, 21, BG, true, Paint.Align.CENTER);
        if (expanded) {
            text(c, "SINU", 116, 62, 14, ACCENT, true, Paint.Align.LEFT);
            text(c, "GAME VAULT", 116, 87, 20, TEXT, true, Paint.Align.LEFT);
        }
        for (int i = 0; i < nav.length; i++) {
            float y = 182 + i * 112;
            boolean selected = i == navIndex;
            boolean focused = focusArea == 0 && selected;
            if (focused) round(c, 22, y - 42, expanded ? 262 : 101, y + 42, 15, Color.rgb(225, 243, 244));
            else if (selected) round(c, 25, y - 38, expanded ? 257 : 98, y + 38, 14, Color.argb(125, 24, 58, 70));
            int color = focused ? BG : selected ? ACCENT : MUTED;
            drawNavIcon(c, i, 59, y, color);
            if (expanded) text(c, nav[i], 104, y + 8, 22, focused ? BG : TEXT, selected, Paint.Align.LEFT);
        }
        if (expanded) {
            text(c, "TV COMPANION", 31, 1010, 12, MUTED, true, Paint.Align.LEFT);
            text(c, "v2.2", 254, 1010, 12, MUTED, false, Paint.Align.RIGHT);
        }
    }

    private void drawNavIcon(Canvas c, int index, float cx, float cy, int color) {
        p.setColor(color);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(4);
        p.setStrokeCap(Paint.Cap.ROUND);
        RectF r = new RectF(cx - 14, cy - 14, cx + 14, cy + 14);
        if (index == 0) {
            Path path = new Path(); path.moveTo(cx - 14, cy - 1); path.lineTo(cx, cy - 14); path.lineTo(cx + 14, cy - 1); c.drawPath(path, p);
            c.drawRect(cx - 10, cy - 1, cx + 10, cy + 13, p);
        } else if (index == 1) {
            c.drawRoundRect(new RectF(cx - 16, cy - 8, cx + 16, cy + 10), 8, 8, p);
            c.drawLine(cx - 10, cy + 1, cx - 2, cy + 1, p); c.drawLine(cx - 6, cy - 3, cx - 6, cy + 5, p);
            p.setStyle(Paint.Style.FILL); c.drawCircle(cx + 7, cy - 1, 2.5f, p); c.drawCircle(cx + 12, cy + 4, 2.5f, p);
        } else if (index == 2) {
            c.drawRoundRect(r, 3, 3, p); c.drawLine(cx - 14, cy - 5, cx + 14, cy - 5, p);
            c.drawLine(cx - 7, cy - 14, cx - 2, cy - 5, p); c.drawLine(cx + 4, cy - 14, cx + 9, cy - 5, p);
        } else if (index == 3) {
            c.drawRoundRect(new RectF(cx - 16, cy - 11, cx + 16, cy + 12), 4, 4, p);
            c.drawLine(cx - 7, cy - 16, cx, cy - 11, p); c.drawLine(cx + 7, cy - 16, cx, cy - 11, p);
        } else if (index == 4) {
            c.drawRoundRect(r, 5, 5, p); p.setStyle(Paint.Style.FILL); Path play = new Path(); play.moveTo(cx - 4, cy - 8); play.lineTo(cx + 9, cy); play.lineTo(cx - 4, cy + 8); play.close(); c.drawPath(play, p);
        } else if (index == 5) {
            c.drawLine(cx, cy - 14, cx, cy + 8, p); c.drawLine(cx - 8, cy + 1, cx, cy + 10, p); c.drawLine(cx + 8, cy + 1, cx, cy + 10, p); c.drawLine(cx - 12, cy + 14, cx + 12, cy + 14, p);
        } else {
            c.drawCircle(cx, cy, 13, p); c.drawCircle(cx, cy, 4, p); c.drawLine(cx, cy - 18, cx, cy - 12, p); c.drawLine(cx, cy + 12, cx, cy + 18, p); c.drawLine(cx - 18, cy, cx - 12, cy, p); c.drawLine(cx + 12, cy, cx + 18, cy, p);
        }
        p.setStyle(Paint.Style.FILL);
    }

    private void drawHome(Canvas c) {
        MediaItem hero = firstItem();
        header(c, "Home", homeSubtitle());
        if (hero == null) {
            empty(c, 322, 250, "Your library is ready to connect", "Open System and sync Google Drive to bring your collection to this TV.");
            return;
        }
        text(c, hero.eyebrow.toUpperCase(Locale.US), 322, 184, 16, ACCENT, true, Paint.Align.LEFT);
        drawMultilineTitle(c, hero.title, 322, 255, 46, 720, 2);
        text(c, hero.meta, 322, 347, 18, TEXT, false, Paint.Align.LEFT, 720);
        List<String> summary = wrap(hero.overview, 680, 18);
        for (int i = 0; i < Math.min(2, summary.size()); i++) text(c, summary.get(i), 322, 390 + i * 28, 18, MUTED, false, Paint.Align.LEFT);
        if (shelves.isEmpty()) return;
        drawShelves(c, 500, 1);
    }

    private String homeSubtitle() {
        if (!driveConnected) return "Local library";
        return data.savedCount() + " saved items";
    }

    private void drawLibrary(Canvas c, float top, int count) {
        header(c, nav[navIndex], librarySubtitle());
        if (shelves.isEmpty()) {
            empty(c, 322, 260, "Nothing saved here yet", "Content will appear after the next Google Drive sync.");
            return;
        }
        drawShelves(c, top, count);
    }

    private String librarySubtitle() {
        if (!driveConnected) return "Local data";
        return shelves.size() + (shelves.size() == 1 ? " shelf" : " shelves");
    }

    private void drawShelves(Canvas c, float top, int maxVisible) {
        int visible = 0;
        float y = top;
        for (int r = rowStart; r < shelves.size() && visible < maxVisible; r++, visible++) {
            Shelf shelf = shelves.get(r);
            boolean wide = shelf.wide;
            float cardW = wide ? 370 : 250;
            float cardH = wide ? 208 : 350;
            float gap = 28;
            float x = 322;
            text(c, shelf.title, x, y, 25, TEXT, true, Paint.Align.LEFT);
            text(c, shelf.items.size() + " titles", 1840, y, 14, MUTED, false, Paint.Align.RIGHT);
            y += 34;
            int start = visibleStart(r, cardW, gap);
            for (int i = start; i < shelf.items.size() && x + cardW <= 1870; i++) {
                MediaItem item = shelf.items.get(i);
                boolean focused = focusArea == 1 && r == row && i == col;
                drawCard(c, item, x, y, cardW, cardH, focused, wide);
                x += cardW + gap;
            }
            y += cardH + (wide ? 68 : 68);
        }
    }

    private int visibleStart(int shelfRow, float cardW, float gap) {
        if (shelfRow != row) return 0;
        int capacity = Math.max(1, (int) ((1548 + gap) / (cardW + gap)));
        return Math.max(0, col - capacity + 1);
    }

    private void drawCard(Canvas c, MediaItem item, float x, float y, float w, float h, boolean focused, boolean wide) {
        float focusProgress = Math.min(1f, (SystemClock.uptimeMillis() - focusStartedAt) / 150f);
        float easedFocus = 1f - (1f - focusProgress) * (1f - focusProgress);
        float grow = focused ? 8 * easedFocus : 0;
        RectF box = new RectF(x - grow, y - grow, x + w + grow, y + h + grow);
        if (focused) {
            p.setShadowLayer(24, 0, 8, Color.argb(180, 84, 242, 210));
            if (focusProgress < 1f) postInvalidateOnAnimation();
        }
        round(c, box.left, box.top, box.right, box.bottom, 12, PANEL_2);
        p.clearShadowLayer();
        Bitmap b = images.get(item.image(wide), this::postInvalidate);
        if (b != null) {
            drawCenterCrop(c, b, box, 12);
            p.setShader(new LinearGradient(0, box.centerY(), 0, box.bottom, Color.TRANSPARENT, Color.argb(245, 3, 7, 12), Shader.TileMode.CLAMP));
            c.drawRoundRect(box, 12, 12, p);
            p.setShader(null);
        } else {
            p.setShader(new LinearGradient(box.left, box.top, box.right, box.bottom, Color.rgb(23, 56, 80), Color.rgb(13, 25, 42), Shader.TileMode.CLAMP));
            c.drawRoundRect(box, 12, 12, p);
            p.setShader(null);
            text(c, initials(item.title), box.centerX(), box.centerY() - 4, 38, Color.rgb(119, 154, 184), true, Paint.Align.CENTER);
            text(c, "Artwork loading", box.centerX(), box.centerY() + 32, 12, MUTED, false, Paint.Align.CENTER);
        }
        if (item.progress >= 0) {
            round(c, x + 12, y + h - 9, x + w - 12, y + h - 4, 3, Color.rgb(47, 58, 72));
            round(c, x + 12, y + h - 9, x + 12 + (w - 24) * item.progress / 100f, y + h - 4, 3, ACCENT);
        }
        int eyebrowColor = urgencyColor(item);
        if (!item.meta.isEmpty()) {
            p.setTextSize(12);
            float chipW = Math.min(w - 24, p.measureText(item.meta) + 24);
            round(c, x + 12, y + 12, x + 12 + chipW, y + 43, 15, Color.argb(220, 4, 10, 17));
            text(c, item.meta, x + 24, y + 33, 12, TEXT, true, Paint.Align.LEFT, chipW - 24);
        }
        if ("rental".equals(item.source)) {
            p.setTextSize(25);
            float dueW = Math.min(w - 28, p.measureText(item.eyebrow.toUpperCase(Locale.US)) + 34);
            round(c, x + 14, y + 58, x + 14 + dueW, y + 104, 9, Color.argb(225, 3, 8, 13));
            text(c, item.eyebrow.toUpperCase(Locale.US), x + 31, y + 89, 25, eyebrowColor, true, Paint.Align.LEFT, dueW - 34);
        }
        text(c, item.title, x + 14, y + h - 43, wide ? 19 : 18, TEXT, true, Paint.Align.LEFT, w - 28);
        text(c, cardLabel(item), x + 14, y + h - 18, 13, eyebrowColor, true, Paint.Align.LEFT, w - 28);
        if (focused) {
            stroke.setStrokeWidth(4);
            c.drawRoundRect(new RectF(box.left - 3, box.top - 3, box.right + 3, box.bottom + 3), 15, 15, stroke);
        }
    }

    private String cardLabel(MediaItem item) {
        if (item.progress > 0 && item.progress < 100) return item.progress + "% watched";
        if (item.eyebrow != null && !item.eyebrow.isEmpty()) return item.eyebrow;
        return item.meta;
    }

    private int urgencyColor(MediaItem item) {
        String label = item.eyebrow == null ? "" : item.eyebrow.toLowerCase(Locale.US);
        if (label.contains("overdue") || label.contains("today") || daysIn(label) <= 2) return RED;
        int days = daysIn(label);
        if (days >= 0 && days <= 7) return AMBER;
        return ACCENT;
    }

    private int daysIn(String value) {
        if (value == null) return Integer.MAX_VALUE;
        String[] parts = value.split("\\s+");
        try { return Integer.parseInt(parts[0]); } catch (Exception ignored) { return Integer.MAX_VALUE; }
    }

    private void drawDetail(Canvas c) {
        Bitmap b = images.get(detail.image(true), this::postInvalidate);
        if (b != null) drawCenterCrop(c, b, new RectF(260, 0, DESIGN_W, DESIGN_H), 0);
        p.setShader(new LinearGradient(250, 0, 1420, 0, Color.argb(252, 3, 6, 10), Color.argb(38, 3, 6, 10), Shader.TileMode.CLAMP));
        c.drawRect(250, 0, DESIGN_W, DESIGN_H, p);
        p.setShader(null);
        p.setShader(new LinearGradient(0, 650, 0, DESIGN_H, Color.TRANSPARENT, BG, Shader.TileMode.CLAMP));
        c.drawRect(250, 520, DESIGN_W, DESIGN_H, p);
        p.setShader(null);

        text(c, detail.eyebrow.toUpperCase(Locale.US), 322, 126, 16, urgencyColor(detail), true, Paint.Align.LEFT);
        text(c, "BACK", 1790, 95, 16, MUTED, true, Paint.Align.RIGHT);
        drawMultilineTitle(c, detail.title, 322, 207, 51, 900, 2);
        drawChips(c, detail, 322, 300);

        c.save();
        c.clipRect(315, 340, 1180, 712);
        float startY = 385 - detailScroll * 72;
        List<String> lines = wrap(detail.overview.isEmpty() ? "No story summary is available in the synced library yet." : detail.overview, 790, 20);
        for (int i = 0; i < lines.size(); i++) text(c, lines.get(i), 322, startY + i * 31, 20, Color.rgb(212, 222, 234), false, Paint.Align.LEFT);
        c.restore();
        if (lines.size() > 10) text(c, detailScroll > 0 ? "UP / DOWN  Read story" : "DOWN  Continue reading", 322, 738, 14, MUTED, true, Paint.Align.LEFT);

        drawDetailActions(c);
        text(c, "Essential changes save to Google Drive", 322, 918, 14, MUTED, false, Paint.Align.LEFT);
    }

    private void drawChips(Canvas c, MediaItem item, float x, float y) {
        List<String> values = new ArrayList<>();
        addChip(values, item.meta);
        JSONObject raw = item.raw;
        if (raw != null) {
            addChip(values, first(raw, "genre", "genres"));
            addChip(values, first(raw, "platform", "provider", "ott", "network"));
            addChip(values, first(raw, "date", "releaseDate", "airDate"));
            String season = first(raw, "season", "seasonNumber");
            String episode = first(raw, "episode", "episodeNumber");
            if (!season.isEmpty() || !episode.isEmpty()) addChip(values, "S" + safeNumber(season) + "  E" + safeNumber(episode));
        }
        float cursor = x;
        for (String value : values) {
            if (value.isEmpty()) continue;
            p.setTextSize(15);
            float w = Math.min(330, p.measureText(value) + 34);
            if (cursor + w > 1210) break;
            round(c, cursor, y - 27, cursor + w, y + 12, 19, Color.argb(210, 25, 42, 58));
            text(c, value, cursor + 17, y - 1, 15, TEXT, true, Paint.Align.LEFT, w - 34);
            cursor += w + 12;
        }
    }

    private static void addChip(List<String> chips, String value) {
        if (value != null && !value.trim().isEmpty() && !chips.contains(value.trim())) chips.add(value.trim());
    }

    private static String safeNumber(String value) { return value == null || value.isEmpty() ? "-" : value; }

    private void drawDetailActions(Canvas c) {
        String[] acts = detailActions();
        int visible = Math.min(7, acts.length);
        int start = Math.max(0, Math.min(detailAction - visible + 1, acts.length - visible));
        float x = 322, width = 188, gap = 14;
        for (int i = start; i < start + visible; i++) {
            button(c, x, 790, x + width, 856, acts[i], focusArea == 2 && i == detailAction);
            x += width + gap;
        }
        if (acts.length > visible) text(c, (detailAction + 1) + " / " + acts.length + " actions", 1736, 885, 13, MUTED, true, Paint.Align.RIGHT);
    }

    private String[] detailActions() {
        if ("game".equals(detail.kind)) {
            if ("rental".equals(detail.source)) return new String[]{"Trailer", "IGN Review", "Wikipedia", "Return", "Playing", "Completed", "Not Interested", "Close"};
            if ("playing".equals(detail.source)) return new String[]{"Trailer", "IGN Review", "Wikipedia", "Queue", "Completed", "Not Interested", "Close"};
            return new String[]{"Trailer", "IGN Review", "Queue", "Playing", "Completed", "Not Interested", "Close"};
        }
        if (isMalayalam(detail)) return new String[]{"Trailer", "IMDb", "Monsoon Review", "Aswanth Review", "Watchlist", "Watching", "Watched", "Not Interested", "Close"};
        return new String[]{"Trailer", "IMDb", "REELOAD Review", "Watchlist", "Watching", "Watched", "Not Interested", "Close"};
    }

    private boolean isMalayalam(MediaItem item) {
        String source = (item.source + " " + first(item.raw, "language", "originalLanguage", "lang")).toLowerCase(Locale.US);
        return source.contains("malayalam") || source.contains("mlseries") || source.contains("mlott") || source.contains(" ml");
    }

    private void drawSettings(Canvas c) {
        header(c, "System", driveConnected ? "Google Drive connected" : "Local data only");
        String[] titles = {
            driveConnected ? "Sync Google Drive" : "Connect Google Drive",
            "Google TV login",
            "Plex Library",
            "BiglyBT",
            "Artwork cache",
            "About",
            "Disconnect Drive"
        };
        String[] desc = {
            driveConnected ? "Pull the newest library now" : "Use a phone QR to restore your library",
            "Advanced OAuth setup",
            plexItems.isEmpty() ? "Connect or refresh your server" : plexItems.size() + " titles available",
            torrents.isEmpty() ? "Connect or refresh downloads" : torrents.size() + " active downloads",
            "Clear downloaded posters and backdrops",
            "Native TV v2.2 - remote-first Shield companion",
            "Remove the encrypted Google session"
        };
        float x = 322, y = 190, w = 725, h = 112;
        for (int i = 0; i < titles.length; i++) {
            int column = i % 2, line = i / 2;
            float bx = x + column * (w + 28), by = y + line * (h + 24);
            boolean focused = focusArea == 1 && settingIndex == i;
            round(c, bx, by, bx + w, by + h, 12, focused ? Color.rgb(24, 64, 82) : PANEL);
            text(c, titles[i], bx + 24, by + 44, 22, TEXT, true, Paint.Align.LEFT, w - 48);
            text(c, desc[i], bx + 24, by + 80, 15, focused ? TEXT : MUTED, false, Paint.Align.LEFT, w - 48);
            if (focused) c.drawRoundRect(new RectF(bx - 3, by - 3, bx + w + 3, by + h + 3), 15, 15, stroke);
        }
        round(c, 322, 784, 1804, 876, 12, Color.argb(210, 10, 22, 34));
        text(c, "TV MODE", 348, 818, 13, ACCENT, true, Paint.Align.LEFT);
        text(c, "Essential status changes work here. Detailed editing and administration remain on phone or PC.", 348, 851, 17, MUTED, false, Paint.Align.LEFT);
    }

    private void drawBigly(Canvas c) {
        header(c, "BiglyBT", torrents.isEmpty() ? "No active downloads" : torrents.size() + " active downloads");
        if (torrents.isEmpty()) {
            empty(c, 322, 260, "BiglyBT is ready", "Open System to connect or refresh your secure gateway.");
            return;
        }
        float y = 170;
        for (int i = 0; i < torrents.size() && i < 8; i++) {
            ServiceRepository.TorrentItem t = torrents.get(i);
            boolean focused = focusArea == 1 && row == i;
            round(c, 322, y, 1838, y + 93, 10, focused ? Color.rgb(23, 61, 79) : PANEL);
            if (focused) c.drawRoundRect(new RectF(319, y - 3, 1841, y + 96), 13, 13, stroke);
            text(c, t.name, 347, y + 34, 19, TEXT, true, Paint.Align.LEFT, 610);
            text(c, t.status + "  |  " + t.progress + "%", 347, y + 66, 14, statusColor(t.status), true, Paint.Align.LEFT);
            round(c, 990, y + 31, 1450, y + 44, 6, Color.rgb(39, 51, 66));
            round(c, 990, y + 31, 990 + 460 * t.progress / 100f, y + 44, 6, BLUE);
            text(c, bytes(t.downloaded) + " / " + bytes(t.total), 990, y + 72, 14, TEXT, false, Paint.Align.LEFT);
            text(c, "Down " + bytes(t.downSpeed) + "/s", 1490, y + 32, 14, TEXT, true, Paint.Align.LEFT);
            text(c, eta(t.eta) + "  |  " + t.peers + " peers  |  " + t.seeds + " seeds", 1490, y + 64, 13, MUTED, false, Paint.Align.LEFT);
            y += 106;
        }
        text(c, "OK  Details     BACK  Navigation", 322, 1030, 14, MUTED, true, Paint.Align.LEFT);
        if (torrentInspector) drawTorrentInspector(c);
    }

    private void drawTorrentInspector(Canvas c) {
        if (row < 0 || row >= torrents.size()) return;
        ServiceRepository.TorrentItem t = torrents.get(row);
        p.setColor(Color.argb(210, 0, 0, 0)); c.drawRect(0, 0, DESIGN_W, DESIGN_H, p);
        round(c, 430, 215, 1500, 845, 18, Color.rgb(11, 23, 36));
        text(c, "DOWNLOAD DETAILS", 480, 270, 14, ACCENT, true, Paint.Align.LEFT);
        drawMultilineTitle(c, t.name, 480, 345, 35, 930, 2);
        text(c, t.status + "  |  " + t.progress + "%", 480, 410, 19, statusColor(t.status), true, Paint.Align.LEFT);
        round(c, 480, 455, 1420, 474, 9, Color.rgb(40, 52, 68));
        round(c, 480, 455, 480 + 940 * t.progress / 100f, 474, 9, BLUE);
        labelValue(c, "Downloaded", bytes(t.downloaded) + " / " + bytes(t.total), 480, 545);
        labelValue(c, "Speed", bytes(t.downSpeed) + "/s down  |  " + bytes(t.upSpeed) + "/s up", 480, 620);
        labelValue(c, "Availability", t.peers + " peers  |  " + t.seeds + " seeds  |  " + eta(t.eta), 480, 695);
        text(c, "BACK  Close details", 480, 785, 16, MUTED, true, Paint.Align.LEFT);
    }

    private void labelValue(Canvas c, String label, String value, float x, float y) {
        text(c, label.toUpperCase(Locale.US), x, y, 13, MUTED, true, Paint.Align.LEFT);
        text(c, value, x + 190, y, 20, TEXT, true, Paint.Align.LEFT);
    }

    private int statusColor(String value) {
        String s = value == null ? "" : value.toLowerCase(Locale.US);
        if (s.contains("error") || s.contains("stopped")) return RED;
        if (s.contains("queue") || s.contains("pause")) return AMBER;
        return ACCENT;
    }

    private void drawQr(Canvas c) {
        p.setColor(Color.argb(248, 3, 6, 10));
        c.drawRect(116, 0, DESIGN_W, DESIGN_H, p);
        text(c, "Connect Google Drive", 322, 126, 38, TEXT, true, Paint.Align.LEFT);
        text(c, "Scan with your phone and approve access. No TV keyboard is required.", 322, 168, 18, MUTED, false, Paint.Align.LEFT);
        round(c, 322, 215, 782, 675, 18, Color.WHITE);
        if (qr != null) c.drawBitmap(qr, new Rect(0, 0, qr.getWidth(), qr.getHeight()), new RectF(342, 235, 762, 655), p);
        else text(c, "Loading QR...", 552, 455, 22, BG, true, Paint.Align.CENTER);
        long seconds = Math.max(0, (qrExpires - System.currentTimeMillis()) / 1000L);
        text(c, "PHONE CODE", 860, 290, 14, ACCENT, true, Paint.Align.LEFT);
        text(c, qrCode, 860, 365, 48, TEXT, true, Paint.Align.LEFT);
        text(c, seconds > 0 ? "Expires in " + seconds / 60 + ":" + String.format(Locale.US, "%02d", seconds % 60) : "Code expired - press Back and try again", 860, 420, 18, seconds > 0 ? MUTED : RED, false, Paint.Align.LEFT);
        text(c, "Waiting for Google approval...", 860, 474, 18, TEXT, true, Paint.Align.LEFT);
        text(c, "BACK  Cancel", 860, 535, 16, MUTED, true, Paint.Align.LEFT);
        postInvalidateDelayed(1000L);
    }

    private void drawAmbient(Canvas c) {
        c.drawColor(Color.BLACK);
        MediaItem hero = firstItem();
        if (hero != null) {
            Bitmap b = images.get(hero.image(true), this::postInvalidate);
            if (b != null) {
                drawCenterCrop(c, b, new RectF(0, 0, DESIGN_W, DESIGN_H), 0);
                p.setColor(Color.argb(205, 0, 0, 0)); c.drawRect(0, 0, DESIGN_W, DESIGN_H, p);
            }
        }
        int shift = (int) ((System.currentTimeMillis() / 60_000L) % 5) * 4;
        String time = new SimpleDateFormat("h:mm", Locale.getDefault()).format(new Date());
        String date = new SimpleDateFormat("EEE, d MMM", Locale.getDefault()).format(new Date());
        text(c, time, 960 + shift, 500 + shift, 92, TEXT, false, Paint.Align.CENTER);
        text(c, date, 960 + shift, 552 + shift, 20, MUTED, false, Paint.Align.CENTER);
        if (hero != null) text(c, hero.title, 960 + shift, 645 + shift, 22, Color.rgb(180, 190, 201), true, Paint.Align.CENTER, 820);
        text(c, "Press any button to return", 960 + shift, 720 + shift, 15, MUTED, false, Paint.Align.CENTER);
    }

    private void header(Canvas c, String title, String subtitle) {
        text(c, "SINU GAME VAULT", 322, 58, 13, ACCENT, true, Paint.Align.LEFT);
        text(c, title, 322, 112, 38, TEXT, true, Paint.Align.LEFT);
        if (subtitle != null && !subtitle.isEmpty()) {
            p.setTextSize(14);
            float w = Math.min(430, p.measureText(subtitle) + 34);
            round(c, 1838 - w, 66, 1838, 106, 20, Color.argb(205, 14, 28, 42));
            text(c, subtitle, 1821, 92, 14, driveConnected ? ACCENT : MUTED, true, Paint.Align.RIGHT, w - 34);
        }
    }

    private void drawStatusToast(Canvas c) {
        if (status == null || status.isEmpty()) return;
        long age = SystemClock.uptimeMillis() - statusChangedAt;
        String lower = status.toLowerCase(Locale.US);
        boolean important = lower.contains("error") || lower.contains("failed") || lower.contains("offline") || lower.contains("press back");
        if (!important && age > 7000L) return;
        p.setTextSize(15);
        float width = Math.min(720, Math.max(260, p.measureText(status) + 70));
        float left = 1838 - width;
        int color = (lower.contains("error") || lower.contains("failed") || lower.contains("offline")) ? RED : ACCENT;
        round(c, left, 988, 1838, 1038, 12, Color.argb(238, 11, 24, 37));
        p.setColor(color);
        c.drawCircle(left + 25, 1013, 5, p);
        text(c, status, left + 43, 1019, 15, TEXT, true, Paint.Align.LEFT, width - 61);
        if (!important) postInvalidateDelayed(Math.max(100L, 7000L - age));
    }

    private void empty(Canvas c, float x, float y, String title, String desc) {
        round(c, x, y, 1810, y + 205, 14, Color.argb(220, 13, 25, 39));
        text(c, title, x + 38, y + 78, 28, TEXT, true, Paint.Align.LEFT);
        text(c, desc, x + 38, y + 125, 18, MUTED, false, Paint.Align.LEFT, 1350);
    }

    private void button(Canvas c, float l, float t, float r, float b, String label, boolean focused) {
        round(c, l, t, r, b, 10, focused ? Color.rgb(225, 244, 245) : PANEL_2);
        text(c, label, (l + r) / 2, t + 42, 17, focused ? BG : TEXT, true, Paint.Align.CENTER);
        if (focused) c.drawRoundRect(new RectF(l - 3, t - 3, r + 3, b + 3), 13, 13, stroke);
    }

    private void round(Canvas c, float l, float t, float r, float b, float radius, int color) {
        p.setShader(null); p.setStyle(Paint.Style.FILL); p.setColor(color);
        c.drawRoundRect(new RectF(l, t, r, b), radius, radius, p);
    }

    private void drawCenterCrop(Canvas c, Bitmap bitmap, RectF destination, float radius) {
        if (bitmap == null || bitmap.getWidth() == 0 || bitmap.getHeight() == 0) return;
        float srcRatio = bitmap.getWidth() / (float) bitmap.getHeight();
        float dstRatio = destination.width() / destination.height();
        Rect src;
        if (srcRatio > dstRatio) {
            int width = Math.round(bitmap.getHeight() * dstRatio);
            int left = (bitmap.getWidth() - width) / 2;
            src = new Rect(left, 0, left + width, bitmap.getHeight());
        } else {
            int height = Math.round(bitmap.getWidth() / dstRatio);
            int top = (bitmap.getHeight() - height) / 2;
            src = new Rect(0, top, bitmap.getWidth(), top + height);
        }
        if (radius > 0) {
            c.save(); Path path = new Path(); path.addRoundRect(destination, radius, radius, Path.Direction.CW); c.clipPath(path);
            c.drawBitmap(bitmap, src, destination, p); c.restore();
        } else c.drawBitmap(bitmap, src, destination, p);
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        long idle = SystemClock.uptimeMillis() - lastInteraction;
        lastInteraction = SystemClock.uptimeMillis();
        if (idle >= AMBIENT_AFTER_MS) { invalidate(); return true; }
        if (event.getRepeatCount() > 0 && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) return true;
        boolean handled;
        if (!qrUrl.isEmpty()) handled = qrKey(keyCode);
        else if (detail != null) handled = detailKey(keyCode);
        else if (torrentInspector) handled = inspectorKey(keyCode);
        else if (focusArea == 0) handled = railKey(keyCode);
        else if (navIndex == 6) handled = settingsKey(keyCode);
        else if (navIndex == 5) handled = biglyKey(keyCode);
        else handled = libraryKey(keyCode);
        if (handled) {
            focusStartedAt = SystemClock.uptimeMillis();
            updateAccessibility(true);
        }
        return handled || super.onKeyDown(keyCode, event);
    }

    private boolean qrKey(int key) {
        if (key == KeyEvent.KEYCODE_BACK) hideQr();
        return true;
    }

    private boolean railKey(int key) {
        if (key == KeyEvent.KEYCODE_DPAD_UP) {
            if (navIndex > 0) switchSection(navIndex - 1);
            return true;
        }
        if (key == KeyEvent.KEYCODE_DPAD_DOWN) {
            if (navIndex + 1 < nav.length) switchSection(navIndex + 1);
            return true;
        }
        if (key == KeyEvent.KEYCODE_DPAD_RIGHT || key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
            focusArea = 1;
            invalidate();
            return true;
        }
        return key == KeyEvent.KEYCODE_DPAD_LEFT;
    }

    private void switchSection(int index) {
        savePosition();
        navIndex = clamp(index, 0, nav.length - 1);
        detail = null;
        torrentInspector = false;
        rebuild();
    }

    private boolean libraryKey(int key) {
        if (shelves.isEmpty()) {
            if (key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_BACK) { focusArea = 0; invalidate(); }
            return true;
        }
        if (key == KeyEvent.KEYCODE_DPAD_LEFT) {
            if (col > 0) col--; else focusArea = 0;
        } else if (key == KeyEvent.KEYCODE_DPAD_RIGHT) {
            if (col + 1 < itemCount(row)) col++;
        } else if (key == KeyEvent.KEYCODE_DPAD_UP) {
            saveCurrentCol();
            if (row > 0) { row--; col = clamp(savedCol(row), 0, Math.max(0, itemCount(row) - 1)); }
            else focusArea = 0;
        } else if (key == KeyEvent.KEYCODE_DPAD_DOWN) {
            saveCurrentCol();
            if (row + 1 < shelves.size()) { row++; col = clamp(savedCol(row), 0, Math.max(0, itemCount(row) - 1)); }
        } else if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
            detail = shelves.get(row).items.get(col);
            focusArea = 2;
            detailAction = 0;
            detailScroll = 0;
        } else if (key == KeyEvent.KEYCODE_BACK) focusArea = 0;
        else return false;
        savePosition();
        keepRowVisible();
        invalidate();
        return true;
    }

    private boolean biglyKey(int key) {
        if (key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_BACK) focusArea = 0;
        else if (key == KeyEvent.KEYCODE_DPAD_UP && row > 0) row--;
        else if (key == KeyEvent.KEYCODE_DPAD_DOWN && row + 1 < torrents.size()) row++;
        else if ((key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) && !torrents.isEmpty()) torrentInspector = true;
        else return false;
        invalidate();
        return true;
    }

    private boolean inspectorKey(int key) {
        if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
            torrentInspector = false;
            invalidate();
        }
        return true;
    }

    private boolean settingsKey(int key) {
        if (key == KeyEvent.KEYCODE_DPAD_LEFT) {
            if (settingIndex % 2 == 1) settingIndex--; else focusArea = 0;
        } else if (key == KeyEvent.KEYCODE_DPAD_RIGHT && settingIndex % 2 == 0 && settingIndex + 1 < 7) settingIndex++;
        else if (key == KeyEvent.KEYCODE_DPAD_UP && settingIndex >= 2) settingIndex -= 2;
        else if (key == KeyEvent.KEYCODE_DPAD_DOWN && settingIndex + 2 < 7) settingIndex += 2;
        else if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) activateSetting();
        else if (key == KeyEvent.KEYCODE_BACK) focusArea = 0;
        else return false;
        invalidate();
        return true;
    }

    private boolean detailKey(int key) {
        String[] acts = detailActions();
        if (key == KeyEvent.KEYCODE_DPAD_LEFT && detailAction > 0) detailAction--;
        else if (key == KeyEvent.KEYCODE_DPAD_RIGHT && detailAction + 1 < acts.length) detailAction++;
        else if (key == KeyEvent.KEYCODE_DPAD_UP && detailScroll > 0) detailScroll--;
        else if (key == KeyEvent.KEYCODE_DPAD_DOWN && detailScroll < 8) detailScroll++;
        else if (key == KeyEvent.KEYCODE_BACK) closeDetail();
        else if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
            String act = acts[detailAction];
            if ("Close".equals(act)) closeDetail();
            else if ("Trailer".equals(act)) actions.openYouTube(detail.title + " official trailer");
            else if ("IGN Review".equals(act)) actions.openYouTube("IGN " + detail.title + " review");
            else if ("REELOAD Review".equals(act)) actions.openYouTube("REELOAD MEDIA " + detail.title + " review");
            else if ("Monsoon Review".equals(act)) actions.openYouTube("Monsoon Media " + detail.title + " review");
            else if ("Aswanth Review".equals(act)) actions.openYouTube("Aswanth Kok " + detail.title + " review");
            else if ("Wikipedia".equals(act)) actions.openWeb("https://en.wikipedia.org/wiki/Special:Search?search=" + urlEncode(detail.title + " video game plot"));
            else if ("IMDb".equals(act)) actions.openWeb(imdbUrl(detail));
            else if ("Watchlist".equals(act)) actions.updateLibrary(detail, "watchlist");
            else if ("Watching".equals(act)) actions.updateLibrary(detail, "watching");
            else if ("Watched".equals(act)) actions.updateLibrary(detail, "watched");
            else if ("Queue".equals(act)) actions.updateLibrary(detail, "queue");
            else if ("Playing".equals(act)) actions.updateLibrary(detail, "playing");
            else if ("Completed".equals(act)) actions.updateLibrary(detail, "completed");
            else if ("Return".equals(act)) actions.updateLibrary(detail, "return");
            else if ("Not Interested".equals(act)) actions.updateLibrary(detail, "not_interested");
        } else return false;
        invalidate();
        return true;
    }

    private void closeDetail() {
        detail = null;
        detailScroll = 0;
        focusArea = 1;
    }

    private void activateSetting() {
        switch (settingIndex) {
            case 0: if (driveConnected) actions.syncDrive(); else actions.connectDrive(); break;
            case 1: actions.configureDrive(); break;
            case 2: actions.configurePlex(); break;
            case 3: actions.configureBigly(); break;
            case 4: actions.clearArtwork(); break;
            case 5: setStatus("Sinu Game Vault Native TV v2.2"); break;
            case 6: actions.disconnectDrive(); break;
            default: break;
        }
    }

    boolean handleBack() {
        lastInteraction = SystemClock.uptimeMillis();
        if (!qrUrl.isEmpty()) { hideQr(); return true; }
        if (torrentInspector) { torrentInspector = false; invalidate(); return true; }
        if (detail != null) { closeDetail(); invalidate(); return true; }
        if (focusArea != 0) { focusArea = 0; invalidate(); return true; }
        long now = SystemClock.uptimeMillis();
        if (now - lastBack > 1800) { lastBack = now; setStatus("Press Back again to exit"); return true; }
        return false;
    }

    private void keepRowVisible() {
        int visibleRows = navIndex == 0 ? 1 : 2;
        if (row < rowStart) rowStart = row;
        else if (row >= rowStart + visibleRows) rowStart = row - visibleRows + 1;
        rowStart = Math.max(0, rowStart);
    }

    private void saveCurrentCol() {
        if (row >= 0 && row < shelves.size()) savedCols.put(section() + ":" + shelves.get(row).id, col);
    }

    private int itemCount(int r) { return r >= 0 && r < shelves.size() ? shelves.get(r).items.size() : 0; }

    private int savedCol(int r) {
        if (r < 0 || r >= shelves.size()) return 0;
        return value(savedCols, section() + ":" + shelves.get(r).id);
    }

    private MediaItem firstItem() {
        for (Shelf shelf : shelves) if (!shelf.items.isEmpty()) return shelf.items.get(0);
        return null;
    }

    private void updateAccessibility(boolean announce) {
        String description;
        if (!qrUrl.isEmpty()) description = "Google Drive phone login. Code " + qrCode;
        else if (detail != null) description = detail.title + ". " + detailActions()[detailAction];
        else if (torrentInspector && row < torrents.size()) description = torrents.get(row).name + ". Download details";
        else if (focusArea == 0) description = nav[navIndex] + ". Navigation";
        else if (navIndex == 6) description = "System option " + (settingIndex + 1) + " of 7";
        else if (navIndex == 5 && row < torrents.size()) description = torrents.get(row).name + ". " + torrents.get(row).progress + " percent";
        else if (row < shelves.size() && col < shelves.get(row).items.size()) description = shelves.get(row).title + ". " + shelves.get(row).items.get(col).title;
        else description = nav[navIndex];
        setContentDescription(description);
        if (announce && !description.equals(lastA11y)) announceForAccessibility(description);
        lastA11y = description;
    }

    private void drawMultilineTitle(Canvas c, String value, float x, float y, float size, float maxWidth, int maxLines) {
        List<String> lines = wrap(value == null ? "" : value, maxWidth, size);
        for (int i = 0; i < Math.min(maxLines, lines.size()); i++) {
            String line = lines.get(i);
            if (i == maxLines - 1 && lines.size() > maxLines) line = ellipsize(line + "...", maxWidth);
            text(c, line, x, y + i * (size + 7), size, TEXT, true, Paint.Align.LEFT);
        }
    }

    private void text(Canvas c, String value, float x, float y, float size, int color, boolean bold, Paint.Align align) {
        text(c, value, x, y, size, color, bold, align, Float.MAX_VALUE);
    }

    private void text(Canvas c, String value, float x, float y, float size, int color, boolean bold, Paint.Align align, float max) {
        p.setShader(null); p.setStyle(Paint.Style.FILL); p.setColor(color); p.setTextSize(size);
        p.setTypeface(bold ? Typeface.create("sans", Typeface.BOLD) : Typeface.create("sans", Typeface.NORMAL));
        p.setTextAlign(align);
        c.drawText(ellipsize(value == null ? "" : value, max), x, y, p);
    }

    private String ellipsize(String value, float max) {
        if (value == null) return "";
        if (p.measureText(value) <= max) return value;
        String suffix = "...";
        int n = value.length();
        while (n > 1 && p.measureText(value.substring(0, n) + suffix) > max) n--;
        return value.substring(0, n) + suffix;
    }

    private List<String> wrap(String value, float max, float size) {
        p.setTextSize(size);
        List<String> out = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (String word : (value == null ? "" : value).split("\\s+")) {
            String next = line.length() == 0 ? word : line + " " + word;
            if (p.measureText(next) > max && line.length() > 0) { out.add(line.toString()); line = new StringBuilder(word); }
            else line = new StringBuilder(next);
        }
        if (line.length() > 0) out.add(line.toString());
        return out;
    }

    private static String first(JSONObject object, String... keys) {
        if (object == null) return "";
        for (String key : keys) {
            String value = object.optString(key);
            if (!value.isEmpty()) return value;
        }
        return "";
    }

    private static String initials(String title) {
        String[] parts = (title == null ? "" : title.trim()).split("\\s+");
        StringBuilder out = new StringBuilder();
        for (String part : parts) if (!part.isEmpty() && out.length() < 3) out.append(Character.toUpperCase(part.charAt(0)));
        return out.toString();
    }

    private static String bytes(long n) {
        if (n < 1024) return n + " B";
        double value = n;
        String[] units = {"KB", "MB", "GB", "TB"};
        int unit = -1;
        while (value >= 1024 && unit + 1 < units.length) { value /= 1024; unit++; }
        return String.format(Locale.US, value >= 10 ? "%.1f %s" : "%.2f %s", value, units[Math.max(0, unit)]);
    }

    private static String eta(long seconds) {
        if (seconds <= 0 || seconds > 365L * 86400L) return "ETA unknown";
        if (seconds < 60) return "ETA <1 min";
        if (seconds < 3600) return "ETA " + seconds / 60 + " min";
        if (seconds < 86400) return "ETA " + seconds / 3600 + " hr " + (seconds % 3600) / 60 + " min";
        return "ETA " + seconds / 86400 + " days";
    }

    private static String imdbUrl(MediaItem item) {
        String id = first(item.raw, "imdbId", "imdb_id", "imdbID");
        if (id.matches("tt\\d+")) return "https://www.imdb.com/title/" + id + "/";
        return "https://www.imdb.com/find/?q=" + urlEncode(item.title);
    }

    private static int clamp(int value, int min, int max) { return Math.max(min, Math.min(max, value)); }
    private static int value(Map<String, Integer> map, String key) { Integer result = map.get(key); return result == null ? 0 : result; }
    private static String urlEncode(String value) { try { return java.net.URLEncoder.encode(value, "UTF-8"); } catch (Exception ignored) { return value; } }
}
