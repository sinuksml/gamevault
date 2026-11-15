package `in`.sinu.gamevault.nativetv

import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Locale

internal class QrInfo(val url: String, val code: String, val expiresAt: Long)

/** The episode list for one season. [episodes] is null while it loads. */
internal class EpisodesState(
    val parent: MediaItem,
    val season: Int,
    val episodes: List<ServiceRepository.EpisodeItem>?,
)

internal val SECTIONS = listOf("home", "games", "movies", "series", "plex", "bigly", "settings")
internal val SECTION_TITLES = listOf("Home", "Games", "Movies", "TV Shows", "Plex", "BiglyBT", "Settings")

/**
 * Everything the Compose layout shows, held in one place.
 *
 * The Java side (MainActivity) owns the library, Drive and saving, and pushes changes
 * in through the setters. The vault object is edited in place, so [version] is bumped
 * on every change to tell Compose to read it again.
 */
internal class TvState {
    var data by mutableStateOf(VaultData.empty()); private set
    var version by mutableIntStateOf(0); private set
    var plex by mutableStateOf<List<MediaItem>>(emptyList()); private set
    var torrents by mutableStateOf<List<ServiceRepository.TorrentItem>>(emptyList()); private set
    var status by mutableStateOf(""); private set
    var statusId by mutableIntStateOf(0); private set
    var driveConnected by mutableStateOf(false); private set
    var qr by mutableStateOf<QrInfo?>(null); private set

    var section by mutableIntStateOf(0)
    var detail by mutableStateOf<MediaItem?>(null); private set
    /** The series a single episode was opened from, so Back returns to it. */
    var detailParent by mutableStateOf<MediaItem?>(null); private set
    var episodes by mutableStateOf<EpisodesState?>(null); private set
    var idleSince by mutableLongStateOf(SystemClock.uptimeMillis()); private set

    /** Where focus last was in each section, as (shelf, card), so returning from a title lands on the same card. */
    val lastFocus = HashMap<String, IntArray>()

    private var lastBack = 0L
    /** Set by the screen so state can ask for focus to move to the navigation rail. */
    var focusRail: () -> Unit = {}
    var onExitHint: (String) -> Unit = {}

    fun updateData(value: VaultData?) { data = value ?: VaultData.empty(); version++ }
    fun updatePlex(items: List<MediaItem>?) { plex = items ?: emptyList() }
    fun updateTorrents(items: List<ServiceRepository.TorrentItem>?) { torrents = items ?: emptyList() }
    fun updateDriveConnected(value: Boolean) { driveConnected = value }

    fun updateStatus(message: String?) {
        status = message ?: ""
        statusId++
    }

    fun showQr(url: String, code: String, expiresAt: Long) { qr = QrInfo(url, code, expiresAt) }
    fun hideQr() { qr = null }

    fun touch() { idleSince = SystemClock.uptimeMillis() }

    fun openDetail(item: MediaItem) {
        detail = item
        detailParent = null
    }

    fun openEpisode(parent: MediaItem, season: Int, number: Int, episode: ServiceRepository.EpisodeItem) {
        val raw = org.json.JSONObject()
        try {
            raw.put("season", season); raw.put("episode", number); raw.put("airDate", episode.airDate)
            raw.put("imdb", episode.rating); raw.put("seriesTitle", parent.title)
        } catch (ignored: Exception) { }
        val label = String.format(Locale.US, "S%02dE%02d", season, number)
        val meta = if (episode.rating > 0) String.format(Locale.US, "IMDb %.1f | %s", episode.rating, episode.airDate) else episode.airDate
        detailParent = parent
        detail = MediaItem(
            "${parent.id}-s${season}e$number", "series", "episode", "${parent.title} - $label ${episode.name}",
            "Episode story", meta, parent.poster, parent.backdrop, episode.overview, -1, raw,
        )
        episodes = null
    }

    fun setDetailStory(item: MediaItem?, story: String?) {
        val current = detail ?: return
        if (item == null || current.id != item.id) return
        detail = MediaItem(
            current.id, current.kind, current.source, current.title, current.eyebrow, current.meta,
            current.poster, current.backdrop, story ?: "", current.progress, current.raw,
        )
    }

    fun setEpisodes(item: MediaItem?, season: Int, list: List<ServiceRepository.EpisodeItem>?) {
        if (item == null) return
        episodes = EpisodesState(item, maxOf(1, season), list ?: emptyList())
    }

    /** Shows the season as loading until the list arrives. */
    fun beginEpisodes(item: MediaItem, season: Int) { episodes = EpisodesState(item, season, null) }

    fun closeDetail() {
        val parent = detailParent
        if (parent != null) { detail = parent; detailParent = null } else detail = null
    }

    fun closeEpisodes() { episodes = null }

    /**
     * Back closes the top-most layer first: sign-in code, episode list, title page. With
     * nothing left it moves focus to the navigation rail, and a second Back within two
     * seconds leaves the app.
     * @return false when the app should exit.
     */
    fun back(): Boolean {
        touch()
        if (qr != null) { qr = null; return true }
        if (episodes != null) { episodes = null; return true }
        if (detail != null) { closeDetail(); return true }
        val now = SystemClock.uptimeMillis()
        if (now - lastBack < 2000) return false
        lastBack = now
        focusRail()
        onExitHint("Press Back again to exit")
        return true
    }
}
