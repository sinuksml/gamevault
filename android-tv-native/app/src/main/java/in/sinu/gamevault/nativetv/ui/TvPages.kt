package `in`.sinu.gamevault.nativetv

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import java.util.Locale

// ---- Home, Games, Movies, TV Shows ---------------------------------------------------

@Composable
internal fun HomePage(state: TvState) {
    val data = state.data
    val shelves = remember(state.version) { data.shelves("home") }
    ShelvesScreen(
        state = state,
        title = "Home",
        subtitle = if (state.driveConnected) "${data.savedCount()} saved items" else "Local library",
        shelves = shelves,
        headerExtras = {
            StatChip("Active rentals", data.count("rentals").toString())
            StatChip("Watchlist", (data.count("movieWatchlist") + data.count("seriesWatchlist")).toString())
            StatChip("Now playing", (data.count("playing") + data.count("subscriptionGames")).toString())
            StatChip("Completed", data.count("played").toString())
        },
        empty = { EmptyState("Your library is ready to connect", "Open Settings and sync Google Drive to bring your collection to this TV.", "Open Settings") { state.section = 6 } },
    )
}

@Composable
internal fun LibraryPage(state: TvState) {
    val name = SECTION_TITLES[state.section]
    val shelves = remember(state.version, state.section) { state.data.shelves(SECTIONS[state.section]) }
    val total = shelves.sumOf { it.items.size }
    ShelvesScreen(
        state = state,
        title = name,
        subtitle = "$total titles across ${shelves.size} lists",
        shelves = shelves,
        empty = { EmptyState("Nothing in $name yet", "Titles appear here after your library syncs from Google Drive.", "Open Settings") { state.section = 6 } },
    )
}

// ---- Plex ---------------------------------------------------------------------------

private fun plexShelves(items: List<MediaItem>): List<Shelf> {
    val watching = Shelf("plex-continue", "Continue Watching", true)
    val recent = Shelf("plex-recent", "Recently Added", false)
    val movies = Shelf("plex-movies", "Movies", false)
    val shows = Shelf("plex-shows", "TV Series", false)
    for (item in items) {
        if (item.progress in 1..99) watching.add(item)
        recent.add(item)
        if (item.kind == "series") shows.add(item) else movies.add(item)
    }
    return listOf(watching, recent, movies, shows).filter { it.items.isNotEmpty() }
}

@Composable
internal fun PlexPage(state: TvState, actions: VaultTvView.Actions) {
    val shelves = remember(state.plex) { plexShelves(state.plex) }
    ShelvesScreen(
        state = state,
        title = "Plex",
        subtitle = if (state.plex.isEmpty()) "Not loaded" else "${state.plex.size} titles available",
        shelves = shelves,
        headerExtras = { TvButton("Refresh", { actions.refreshPlex() }) },
        empty = { EmptyState("Connect Plex", "Add your server address and token, or leave the address blank to discover it.", "Set up Plex") { actions.configurePlex() } },
    )
}

// ---- BiglyBT ------------------------------------------------------------------------

internal fun formatBytes(n: Long): String {
    if (n < 1024) return "$n B"
    var value = n.toDouble()
    val units = arrayOf("KB", "MB", "GB", "TB")
    var unit = -1
    while (value >= 1024 && unit + 1 < units.size) { value /= 1024; unit++ }
    return String.format(Locale.US, if (value >= 10) "%.1f %s" else "%.2f %s", value, units[maxOf(0, unit)])
}

private fun formatEta(seconds: Long): String = when {
    seconds <= 0 || seconds > 365L * 86400L -> "ETA unknown"
    seconds < 60 -> "ETA <1 min"
    seconds < 3600 -> "ETA ${seconds / 60} min"
    seconds < 86400 -> "ETA ${seconds / 3600} hr ${(seconds % 3600) / 60} min"
    else -> "ETA ${seconds / 86400} days"
}

private fun statusColor(status: String?): Color {
    val s = status?.lowercase(Locale.US).orEmpty()
    return when {
        "error" in s || "stopped" in s -> Palette.Red
        "queue" in s || "pause" in s -> Palette.Amber
        else -> Palette.Accent
    }
}

@Composable
internal fun BiglyPage(state: TvState, actions: VaultTvView.Actions) {
    val history = remember(state.version) { state.data.biglyHistory() }
    val torrents = state.torrents
    val first = remember { FocusRequester() }
    LaunchedEffect(torrents.isEmpty()) { delay(80); runCatching { first.requestFocus() } }

    Column(Modifier.fillMaxSize().padding(start = 20.dp, top = 20.dp, end = 28.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("BIGLYBT", style = Type.Label)
                Text(if (torrents.isEmpty()) "No active downloads" else "${torrents.size} active downloads", style = Type.Muted)
            }
            TvButton("Refresh", { actions.refreshBigly() }, requester = if (torrents.isEmpty()) first else null)
        }
        if (torrents.isEmpty() && history.isEmpty()) {
            EmptyState("BiglyBT is ready", "Connect your secure gateway to see downloads here.", "Connect BiglyBT") { actions.configureBigly() }
            return@Column
        }
        LazyColumn(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            itemsIndexed(torrents, key = { index, torrent -> "$index:${torrent.id}" }) { index, torrent ->
                TorrentRow(torrent, actions, if (index == 0) first else null)
            }
            if (history.isNotEmpty()) {
                item(key = "history-title") { Text("RECENT TORRENT HISTORY", style = Type.Label, modifier = Modifier.padding(top = 18.dp)) }
                itemsIndexed(history.take(8), key = { index, _ -> "history:$index" }) { _, entry ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Text(entry.title, style = Type.Body, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Text(entry.eyebrow, style = Type.Body.copy(color = statusColor(entry.eyebrow)), modifier = Modifier.padding(horizontal = 12.dp))
                        Text(entry.meta, style = Type.Muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun TorrentRow(torrent: ServiceRepository.TorrentItem, actions: VaultTvView.Actions, requester: FocusRequester?) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Palette.Panel.copy(alpha = 0.92f)).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(torrent.name, style = Type.Title.copy(fontSize = 16.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${torrent.status}  ·  ${torrent.progress}%", style = Type.Body.copy(color = statusColor(torrent.status)))
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Down ${formatBytes(torrent.downSpeed)}/s", style = Type.Body.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold))
                Text("${formatEta(torrent.eta)}  ·  ${torrent.peers} peers  ·  ${torrent.seeds} seeds", style = Type.Muted)
            }
        }
        Box(Modifier.padding(top = 8.dp).fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(Palette.PanelRaised)) {
            Box(Modifier.fillMaxWidth(fraction = (torrent.progress / 100f).coerceIn(0f, 1f)).height(6.dp).background(Palette.Blue))
        }
        Text("${formatBytes(torrent.downloaded)} of ${formatBytes(torrent.total)}", style = Type.Muted, modifier = Modifier.padding(top = 4.dp))
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TvButton("Start", { actions.biglyAction(torrent.id, "start") }, requester = requester)
            TvButton("Pause", { actions.biglyAction(torrent.id, "pause") })
            TvButton("Remove", { actions.biglyAction(torrent.id, "remove") })
            TvButton("Remove + files", { actions.biglyAction(torrent.id, "remove_files") })
        }
    }
}

// ---- Settings -----------------------------------------------------------------------

private class SettingCard(val title: String, val description: String, val onClick: () -> Unit)

@Composable
internal fun SettingsPage(state: TvState, actions: VaultTvView.Actions) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val version = remember {
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty().replace("-native-tv", "") }.getOrDefault("")
    }
    val cards = listOf(
        SettingCard(
            if (state.driveConnected) "Sync Google Drive" else "Connect Google Drive",
            if (state.driveConnected) "Pull the newest library now" else "Use a phone QR to restore your library",
        ) { if (state.driveConnected) actions.syncDrive() else actions.connectDrive() },
        SettingCard("Google TV login", "Advanced OAuth setup") { actions.configureDrive() },
        SettingCard("Plex Library", if (state.plex.isEmpty()) "Connect or refresh your server" else "${state.plex.size} titles available") { actions.configurePlex() },
        SettingCard("BiglyBT", if (state.torrents.isEmpty()) "Connect or refresh downloads" else "${state.torrents.size} active downloads") { actions.configureBigly() },
        SettingCard("Artwork cache", "Clear downloaded posters and backdrops") { actions.clearArtwork() },
        SettingCard("Classic layout", "Switch back to the original layout") { actions.setLayout(false) },
        SettingCard("Disconnect Drive", "Remove the encrypted Google session from this TV") { actions.disconnectDrive() },
        SettingCard("About", "Native TV $version  ·  Windows-compatible Shield client") { state.updateStatus("Sinu Game Vault Native TV $version") },
    )
    val first = remember { FocusRequester() }
    LaunchedEffect(Unit) { delay(80); runCatching { first.requestFocus() } }

    Column(Modifier.fillMaxSize().padding(start = 20.dp, top = 20.dp, end = 28.dp)) {
        Text("SYSTEM", style = Type.Label)
        Text(if (state.driveConnected) "Google Drive connected" else "Local data only", style = Type.Display)
        Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            cards.chunked(2).forEachIndexed { row, pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    pair.forEachIndexed { column, card ->
                        SettingTile(card, Modifier.weight(1f), if (row == 0 && column == 0) first else null)
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingTile(card: SettingCard, modifier: Modifier, requester: FocusRequester?) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier
            .then(if (requester != null) Modifier.focusRequester(requester) else Modifier)
            .onFocusChanged { focused = it.isFocused }
            .focusLift(focused, shape, lift = 1.03f)
            .background(if (focused) Palette.PanelRaised else Palette.Panel)
            .clickable(onClick = card.onClick)
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        Text(card.title, style = Type.Title.copy(fontSize = 17.sp), maxLines = 1)
        Text(card.description, style = Type.Muted.copy(color = if (focused) Palette.Text else Palette.Muted), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
    }
}
