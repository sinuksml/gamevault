package `in`.sinu.gamevault.nativetv

import android.os.SystemClock
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Tv
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.foundation.focusGroup
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val RAIL_ICONS: List<ImageVector> = listOf(
    Icons.Filled.Home, Icons.Filled.SportsEsports, Icons.Filled.Movie, Icons.Filled.Tv,
    Icons.Filled.PlayCircle, Icons.Filled.Download, Icons.Filled.Settings,
)

/** The whole layout: navigation rail, the current page, and whatever is open on top of it. */
@Composable
internal fun TvApp(state: TvState, actions: VaultTvView.Actions) {
    TvTheme {
        val railRequester = remember { FocusRequester() }
        var idle by remember { mutableIntStateOf(0) }

        DisposableEffect(state) {
            state.focusRail = { runCatching { railRequester.requestFocus() } }
            onDispose { state.focusRail = {} }
        }
        // The first drawn frame proves the layout can start; until then a crash falls back to the classic one.
        LaunchedEffect(Unit) {
            androidx.compose.runtime.withFrameNanos { }
            actions.layoutReady()
        }
        // Dim after three idle minutes and go to an OLED-safe screen after six.
        LaunchedEffect(Unit) {
            while (true) {
                delay(10_000)
                val seconds = (SystemClock.uptimeMillis() - state.idleSince) / 1000
                idle = if (seconds > 360) 2 else if (seconds > 180) 1 else 0
            }
        }

        Box(
            Modifier.fillMaxSize().background(Palette.Background).onPreviewKeyEvent {
                // The first key after ambient mode only wakes the screen.
                val wasAmbient = idle == 2
                state.userNavigated = true
                state.touch()
                idle = 0
                wasAmbient
            },
        ) {
            val episodes = state.episodes
            val detail = state.detail
            when {
                episodes != null -> EpisodesScreen(state, episodes, actions)
                detail != null -> DetailScreen(state, detail, actions)
                else -> Row(Modifier.fillMaxSize()) {
                    Box(Modifier.width(RailCollapsed))
                    Box(Modifier.weight(1f).fillMaxHeight()) {
                        when (state.section) {
                            0 -> HomePage(state)
                            1, 2, 3 -> LibraryPage(state)
                            4 -> PlexPage(state, actions)
                            5 -> BiglyPage(state, actions)
                            else -> SettingsPage(state, actions)
                        }
                    }
                }
            }
            if (episodes == null && detail == null) NavRail(state, railRequester)
            state.qr?.let { QrDialog(state, it) }
            StatusToast(state)
            IdleOverlay(idle)
        }
    }
}

/** A collapsed icon rail that opens over the page when it has focus. */
@Composable
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
private fun NavRail(state: TvState, requester: FocusRequester) {
    var expanded by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { state.railFocused = false } }
    val width by animateDpAsState(if (expanded) RailExpanded else RailCollapsed, tween(180), label = "rail")
    val counts = remember(state.version, state.torrents.size) {
        intArrayOf(
            0,
            state.data.shelves("games").sumOf { it.items.size },
            state.data.shelves("movies").sumOf { it.items.size },
            state.data.shelves("series").sumOf { it.items.size },
            0, state.torrents.size, 0,
        )
    }
    Column(
        Modifier
            .fillMaxHeight()
            .width(width)
            .background(Brush.horizontalGradient(0f to Palette.Background, (if (expanded) 0.88f else 0.7f) to Palette.Background.copy(alpha = 0.97f), 1f to Color.Transparent))
            .onFocusChanged { expanded = it.hasFocus; state.railFocused = it.hasFocus }
            // Entering the rail from a card lands on the current section, not whichever icon is nearest.
            .focusProperties { enter = { requester } }
            .focusGroup()
            .padding(start = 10.dp, top = 24.dp, bottom = 16.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.padding(start = 8.dp, bottom = 18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(Palette.Accent), contentAlignment = Alignment.Center) {
                Text("GV", style = Type.Body.copy(color = Palette.Background, fontWeight = FontWeight.Black))
            }
            if (expanded) Column(Modifier.padding(start = 10.dp)) {
                Text("SINU", style = Type.Label.copy(fontSize = 9.sp))
                Text("GAME VAULT", style = Type.Body.copy(fontWeight = FontWeight.Bold))
            }
        }
        SECTION_TITLES.forEachIndexed { index, name ->
            RailItem(
                icon = RAIL_ICONS[index], label = name, count = counts[index], expanded = expanded,
                selected = state.section == index,
                requester = if (state.section == index) requester else null,
                onFocus = { state.section = index },
            )
        }
    }
}

@Composable
private fun RailItem(icon: ImageVector, label: String, count: Int, expanded: Boolean, selected: Boolean, requester: FocusRequester?, onFocus: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(12.dp)
    Row(
        Modifier
            .then(if (requester != null) Modifier.focusRequester(requester) else Modifier)
            .onFocusChanged { focused = it.isFocused; if (it.isFocused) onFocus() }
            .clip(shape)
            .background(if (focused) Palette.Accent else if (selected) Palette.PanelRaised else Color.Transparent)
            .clickable(onClick = onFocus)
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val ink = if (focused) Palette.Background else if (selected) Palette.Accent else Palette.Muted
        Icon(icon, contentDescription = label, tint = ink, modifier = Modifier.size(22.dp))
        if (expanded) {
            Text(label, style = Type.Body.copy(color = if (focused) Palette.Background else Palette.Text, fontWeight = FontWeight.SemiBold), modifier = Modifier.padding(start = 14.dp).weight(1f))
            if (count > 0) Text(count.toString(), style = Type.Muted.copy(color = if (focused) Palette.Background else Palette.Muted), modifier = Modifier.padding(end = 6.dp))
        }
    }
}

/** The latest status message, shown for a few seconds. */
@Composable
private fun StatusToast(state: TvState) {
    var shown by remember { mutableStateOf("") }
    LaunchedEffect(state.statusId) {
        if (state.status.isEmpty()) return@LaunchedEffect
        shown = state.status
        delay(4200)
        shown = ""
    }
    Box(Modifier.fillMaxSize().padding(bottom = 22.dp), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(visible = shown.isNotEmpty(), enter = fadeIn(tween(200)), exit = fadeOut(tween(300))) {
            Text(
                shown, style = Type.Body.copy(fontWeight = FontWeight.SemiBold), maxLines = 2,
                modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(Palette.PanelRaised.copy(alpha = 0.96f)).padding(horizontal = 20.dp, vertical = 11.dp),
            )
        }
    }
}

@Composable
private fun IdleOverlay(level: Int) {
    if (level == 0) return
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = if (level == 1) 0.6f else 1f))) {
        if (level == 2) {
            // A small clock that drifts, so no pixel stays lit on an OLED panel.
            var minute by remember { mutableIntStateOf(0) }
            LaunchedEffect(Unit) { while (true) { delay(60_000); minute++ } }
            val dx = ((minute * 37) % 300).dp
            val dy = ((minute * 53) % 200).dp
            Text(
                SimpleDateFormat("h:mm", Locale.US).format(Date()),
                style = Type.Display.copy(fontSize = 40.sp, color = Color(0xFF3A4654)),
                modifier = Modifier.padding(start = 120.dp + dx, top = 80.dp + dy),
            )
        }
    }
}
