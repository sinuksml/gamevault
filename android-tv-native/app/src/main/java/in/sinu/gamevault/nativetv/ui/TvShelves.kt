package `in`.sinu.gamevault.nativetv

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Text
import kotlinx.coroutines.delay

/**
 * A page of horizontal shelves under a large hero that follows focus: move across the
 * cards and the backdrop, title and summary change to match. Home, Games, Movies,
 * TV Shows and Plex all use it.
 */
@Composable
internal fun ShelvesScreen(
    state: TvState,
    title: String,
    subtitle: String,
    shelves: List<Shelf>,
    modifier: Modifier = Modifier,
    headerExtras: @Composable RowScope.() -> Unit = {},
    empty: @Composable () -> Unit,
) {
    val key = SECTIONS[state.section]
    val saved = remember(key) { state.lastFocus[key] ?: intArrayOf(0, 0) }
    var focusRow by remember(key) { mutableIntStateOf(saved[0]) }
    var focusCol by remember(key) { mutableIntStateOf(saved[1]) }
    val hero: MediaItem? = shelves.getOrNull(focusRow)?.items?.getOrNull(focusCol)
        ?: shelves.firstOrNull { it.items.isNotEmpty() }?.items?.first()
    val requester = remember(key) { FocusRequester() }
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = saved[0].coerceIn(0, maxOf(0, shelves.size - 1)))

    // Land on the card that had focus, so coming back from a title does not lose the place.
    LaunchedEffect(key, shelves.isEmpty()) {
        if (shelves.isNotEmpty() && state.autoFocusAllowed()) {
            delay(80)
            state.requestContentFocus(requester)
        }
    }

    Box(modifier.fillMaxSize()) {
        Backdrop(hero?.image(true).orEmpty())
        Column(Modifier.fillMaxSize().padding(top = BarHeight)) {
            if (hero != null) HeroText(hero, title, subtitle)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (shelves.isEmpty()) empty()
                else LazyColumn(state = listState, contentPadding = PaddingValues(bottom = 24.dp)) {
                    itemsIndexed(shelves, key = { index, shelf -> "$index:${shelf.id}" }) { rowIndex, shelf ->
                        ShelfRow(
                            shelf = shelf,
                            savedCol = if (rowIndex == saved[0]) saved[1] else 0,
                            requester = if (rowIndex == saved[0]) requester else null,
                            onFocus = { col ->
                                focusRow = rowIndex; focusCol = col
                                state.lastFocus[key] = intArrayOf(rowIndex, col)
                            },
                            onOpen = state::openDetail,
                        )
                    }
                }
            }
        }
        Row(Modifier.align(Alignment.TopEnd).padding(top = BarHeight, end = 40.dp), verticalAlignment = Alignment.CenterVertically) { headerExtras() }
    }
}

/** Big title, one line of facts, a short summary. Its height is fixed so the shelves below never jump as focus moves. */
@Composable
private fun HeroText(item: MediaItem, page: String, subtitle: String) {
    Column(Modifier.padding(start = PageStart, top = 14.dp, end = 120.dp).height(196.dp).widthIn(max = 540.dp)) {
        Text(
            (item.eyebrow.ifEmpty { page }).uppercase(), style = Type.Label, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Text(item.title, style = Type.Hero, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
        val facts = item.meta.ifEmpty { subtitle }
        if (facts.isNotEmpty()) Text(facts, style = Type.Body.copy(color = Palette.Muted), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
        val story = cleanStory(item.overview)
        if (story.isNotEmpty()) Text(story, style = Type.Body.copy(color = Palette.Text.copy(alpha = 0.82f)), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun ShelfRow(
    shelf: Shelf,
    savedCol: Int,
    requester: FocusRequester?,
    onFocus: (Int) -> Unit,
    onOpen: (MediaItem) -> Unit,
) {
    Column(Modifier.padding(top = 4.dp)) {
        Text(shelf.title, style = Type.Title, modifier = Modifier.padding(start = PageStart))
        val rowState = rememberLazyListState(initialFirstVisibleItemIndex = (savedCol - 1).coerceAtLeast(0))
        LazyRow(
            state = rowState, horizontalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(start = PageStart, end = 60.dp),
        ) {
            itemsIndexed(shelf.items, key = { index, _ -> index }) { col, item ->
                TitleCard(
                    item = item,
                    wide = shelf.wide,
                    requester = if (requester != null && col == savedCol) requester else null,
                    onFocus = { onFocus(col) },
                    onOpen = { onOpen(item) },
                )
            }
        }
    }
}

/** What a page says when it has nothing to show, with the way to fix it. */
@Composable
internal fun EmptyState(heading: String, text: String, action: String? = null, railFocused: Boolean = false, onAction: () -> Unit = {}) {
    Column(Modifier.fillMaxSize().padding(start = PageStart, end = 60.dp, bottom = 60.dp), verticalArrangement = Arrangement.Center) {
        Text(heading, style = Type.Display)
        Text(text, style = Type.Muted, modifier = Modifier.padding(top = 6.dp).widthIn(max = 460.dp))
        if (action != null) {
            val requester = remember { FocusRequester() }
            LaunchedEffect(Unit) { delay(80); if (!railFocused) runCatching { requester.requestFocus() } }
            TvButton(action, onAction, primary = true, requester = requester, modifier = Modifier.padding(top = 16.dp))
        }
    }
}
