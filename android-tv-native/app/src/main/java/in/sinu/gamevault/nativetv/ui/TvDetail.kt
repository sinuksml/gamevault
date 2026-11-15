package `in`.sinu.gamevault.nativetv

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** One title: artwork, facts, the story, and every action available for it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun DetailScreen(state: TvState, item: MediaItem, actions: VaultTvView.Actions) {
    val labels = remember(item.id, item.source, item.kind) { DetailActions.labels(item).toList() }
    val first = remember(item.id) { FocusRequester() }
    LaunchedEffect(item.id) { delay(80); runCatching { first.requestFocus() } }

    Box(Modifier.fillMaxSize()) {
        Backdrop(item.image(true))
        Row(Modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 32.dp)) {
            if (item.poster.isNotEmpty() && item.kind != "game") {
                AsyncImage(
                    model = item.poster, contentDescription = null, contentScale = ContentScale.Crop,
                    modifier = Modifier.size(150.dp, 225.dp).clip(RoundedCornerShape(14.dp)),
                )
            }
            Column(Modifier.weight(1f).padding(start = if (item.poster.isNotEmpty() && item.kind != "game") 28.dp else 0.dp)) {
                if (item.eyebrow.isNotEmpty()) Text(item.eyebrow.uppercase(), style = Type.Label)
                Text(item.title, style = Type.Display.copy(fontSize = 34.sp), maxLines = 3, overflow = TextOverflow.Ellipsis)
                if (item.meta.isNotEmpty()) Text(item.meta, style = Type.Body.copy(color = Palette.Muted), modifier = Modifier.padding(top = 4.dp))
                val story = cleanStory(item.overview)
                Text(
                    story.ifEmpty { "No story summary is available in the synced library yet. Choose Load Story to fetch one." },
                    style = Type.Body.copy(color = if (story.isEmpty()) Palette.Muted else Palette.Text),
                    maxLines = 8, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 14.dp).fillMaxWidth(0.85f),
                )
                FlowRow(
                    Modifier.padding(top = 22.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    labels.forEachIndexed { index, label ->
                        TvButton(
                            label = label,
                            primary = index == 0,
                            requester = if (index == 0) first else null,
                            onClick = {
                                when (label) {
                                    "Close" -> state.closeDetail()
                                    "Episodes" -> { state.beginEpisodes(item, 1); actions.loadEpisodes(item, 1) }
                                    else -> DetailActions.perform(label, item, actions)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

/** The episode list for a season, with season stepping. Choosing an episode opens its own page. */
@Composable
internal fun EpisodesScreen(state: TvState, episodes: EpisodesState, actions: VaultTvView.Actions) {
    val parent = episodes.parent
    val seasons = (parent.raw?.optInt("seasons", parent.raw.optInt("numberOfSeasons", 1)) ?: 1).coerceAtLeast(1)
    val first = remember(episodes.season, episodes.episodes?.size) { FocusRequester() }
    LaunchedEffect(episodes.season, episodes.episodes?.size) { delay(80); runCatching { first.requestFocus() } }

    fun goTo(season: Int) {
        state.beginEpisodes(parent, season)
        actions.loadEpisodes(parent, season)
    }

    Box(Modifier.fillMaxSize()) {
        Backdrop(parent.image(true))
        Column(Modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 28.dp)) {
            Text("EPISODES", style = Type.Label)
            Text(parent.title, style = Type.Display, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(Modifier.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (episodes.season > 1) TvButton("‹  Season ${episodes.season - 1}", { goTo(episodes.season - 1) })
                Text("Season ${episodes.season} of $seasons", style = Type.Title, modifier = Modifier.padding(horizontal = 8.dp))
                if (episodes.season < seasons) TvButton("Season ${episodes.season + 1}  ›", { goTo(episodes.season + 1) })
            }
            val list = episodes.episodes
            when {
                list == null -> Text("Loading season ${episodes.season}…", style = Type.Muted)
                list.isEmpty() -> Text("No episodes were found for this season.", style = Type.Muted)
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth(0.8f)) {
                    itemsIndexed(list, key = { index, _ -> index }) { index, episode ->
                        EpisodeRow(episode, if (index == 0) first else null) { state.openEpisode(parent, episodes.season, episode.number, episode) }
                    }
                }
            }
        }
    }
}

@Composable
private fun EpisodeRow(episode: ServiceRepository.EpisodeItem, requester: FocusRequester?, onOpen: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(10.dp)
    Row(
        Modifier.fillMaxWidth()
            .then(if (requester != null) Modifier.focusRequester(requester) else Modifier)
            .onFocusChanged { focused = it.isFocused }
            .clip(shape)
            .background(if (focused) Palette.Accent else Palette.Panel.copy(alpha = 0.9f))
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val ink = if (focused) Palette.Background else Palette.Text
        Text(String.format(Locale.US, "E%02d", episode.number), style = Type.Body.copy(color = ink, fontWeight = FontWeight.Bold), modifier = Modifier.padding(end = 14.dp))
        Text(episode.name, style = Type.Body.copy(color = ink), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        val extra = listOfNotNull(episode.airDate.takeIf { it.isNotEmpty() }, episode.rating.takeIf { it > 0 }?.let { String.format(Locale.US, "IMDb %.1f", it) }).joinToString("  ·  ")
        if (extra.isNotEmpty()) Text(extra, style = Type.Muted.copy(color = if (focused) Palette.Background else Palette.Muted))
    }
}

/** The Google sign-in code: scan it with a phone signed in to the same account. */
@Composable
internal fun QrDialog(state: TvState, info: QrInfo) {
    val close = remember { FocusRequester() }
    LaunchedEffect(info.code) { delay(80); runCatching { close.requestFocus() } }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.82f)), contentAlignment = Alignment.Center) {
        Row(
            Modifier.clip(RoundedCornerShape(20.dp)).background(Palette.Panel).padding(32.dp),
            horizontalArrangement = Arrangement.spacedBy(32.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(220.dp).clip(RoundedCornerShape(12.dp)).background(Color.White)) {
                AsyncImage(
                    model = "https://quickchart.io/qr?size=420&text=" + java.net.URLEncoder.encode(info.url, "UTF-8"),
                    contentDescription = "Sign-in QR code", modifier = Modifier.fillMaxSize().padding(8.dp),
                )
            }
            Column(Modifier.size(width = 300.dp, height = 220.dp), verticalArrangement = Arrangement.Center) {
                Text("CONNECT GOOGLE DRIVE", style = Type.Label)
                Text("Scan with your phone", style = Type.Display.copy(fontSize = 24.sp))
                Text("Use the Google account that holds your GameVault library.", style = Type.Muted, modifier = Modifier.padding(top = 6.dp))
                Text("Code  ${info.code}", style = Type.Title, modifier = Modifier.padding(top = 14.dp))
                Text(info.url, style = Type.Muted.copy(fontSize = 10.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("Expires " + SimpleDateFormat("h:mm a", Locale.US).format(Date(info.expiresAt)), style = Type.Muted, modifier = Modifier.padding(top = 4.dp))
                TvButton("Close", { state.hideQr() }, requester = close, modifier = Modifier.padding(top = 14.dp))
            }
        }
    }
}
