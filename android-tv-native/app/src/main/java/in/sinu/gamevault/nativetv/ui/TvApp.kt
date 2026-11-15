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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
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
                else -> Box(Modifier.fillMaxSize()) {
                    when (state.section) {
                        0 -> HomePage(state)
                        1, 2, 3 -> LibraryPage(state)
                        4 -> PlexPage(state, actions)
                        5 -> BiglyPage(state, actions)
                        else -> SettingsPage(state, actions)
                    }
                }
            }
            if (episodes == null && detail == null) TopBar(state, railRequester)
            state.qr?.let { QrDialog(state, it) }
            StatusToast(state)
            IdleOverlay(idle)
        }
    }
}

/** The top navigation bar: a pill of section names, centred, with the logo at the left. Focusing a name switches page. */
@Composable
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
private fun TopBar(state: TvState, requester: FocusRequester) {
    DisposableEffect(Unit) { onDispose { state.railFocused = false } }
    Box(Modifier.fillMaxWidth().height(BarHeight)) {
        Icon(
            painter = androidx.compose.ui.res.painterResource(R.drawable.gv_mark), contentDescription = "Sinu Game Vault",
            tint = Color.White, modifier = Modifier.align(Alignment.CenterStart).padding(start = PageStart).size(26.dp),
        )
        Row(
            Modifier
                .align(Alignment.Center)
                .padding(top = 6.dp)
                .clip(RoundedCornerShape(50))
                .background(Color(0xFF1C1C1E).copy(alpha = 0.72f))
                .onFocusChanged { state.railFocused = it.hasFocus }
                // Moving up from a card lands on the current section, not whichever name is nearest.
                .focusProperties { enter = { requester } }
                .focusGroup()
                .padding(4.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(2.dp),
        ) {
            SECTION_TITLES.forEachIndexed { index, name ->
                BarItem(
                    label = name, selected = state.section == index,
                    requester = if (state.section == index) requester else null,
                    onFocus = { state.section = index },
                )
            }
        }
    }
}

@Composable
private fun BarItem(label: String, selected: Boolean, requester: FocusRequester?, onFocus: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Box(
        Modifier
            .then(if (requester != null) Modifier.focusRequester(requester) else Modifier)
            .onFocusChanged { focused = it.isFocused; if (it.isFocused) onFocus() }
            .clip(RoundedCornerShape(50))
            .background(if (focused) Color.White else if (selected) Color.White.copy(alpha = 0.2f) else Color.Transparent)
            .clickable(onClick = onFocus)
            .padding(horizontal = 16.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = Type.Body.copy(fontWeight = FontWeight.SemiBold, color = if (focused) Color.Black else if (selected) Color.White else Color(0xFFB4B4BA)), maxLines = 1)
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
