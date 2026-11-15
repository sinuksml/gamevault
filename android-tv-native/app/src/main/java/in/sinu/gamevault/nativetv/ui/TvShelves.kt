package `in`.sinu.gamevault.nativetv

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import kotlinx.coroutines.delay

/**
 * A page of horizontal shelves under a hero that follows focus: move across the cards
 * and the backdrop, title and summary change to match. Home, Games, Movies, TV Shows
 * and Plex all use it.
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
        if (shelves.isNotEmpty()) {
            delay(80)
            runCatching { requester.requestFocus() }
        }
    }

    Box(modifier.fillMaxSize()) {
        Backdrop(hero?.image(true).orEmpty())
        Column(Modifier.fillMaxSize().padding(start = 20.dp, top = 20.dp)) {
            Row(Modifier.fillMaxWidth().padding(end = 28.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(title.uppercase(), style = Type.Label)
                    Text(subtitle, style = Type.Muted, maxLines = 1)
                }
                headerExtras()
            }
            if (hero != null) HeroText(hero)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (shelves.isEmpty()) empty()
                else LazyColumn(state = listState, contentPadding = PaddingValues(bottom = 24.dp)) {
                    itemsIndexed(shelves, key = { index, shelf -> "$index:${shelf.id}" }) { rowIndex, shelf ->
                        ShelfRow(
                            shelf = shelf,
                            rowIndex = rowIndex,
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
    }
}

@Composable
private fun HeroText(item: MediaItem) {
    Column(Modifier.padding(top = 14.dp, end = 120.dp).height(132.dp).widthIn(max = 520.dp)) {
        if (item.eyebrow.isNotEmpty()) Text(item.eyebrow.uppercase(), style = Type.Label)
        Text(item.title, style = Type.Display, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (item.meta.isNotEmpty()) Text(item.meta, style = Type.Body, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
        val story = cleanStory(item.overview)
        if (story.isNotEmpty()) Text(story, style = Type.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun ShelfRow(
    shelf: Shelf,
    rowIndex: Int,
    savedCol: Int,
    requester: FocusRequester?,
    onFocus: (Int) -> Unit,
    onOpen: (MediaItem) -> Unit,
) {
    Column(Modifier.padding(top = 6.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(shelf.title, style = Type.Title)
            Text("  ${shelf.items.size}", style = Type.Muted, modifier = Modifier.padding(bottom = 2.dp))
        }
        val rowState = rememberLazyListState(initialFirstVisibleItemIndex = (savedCol - 1).coerceAtLeast(0))
        LazyRow(state = rowState, horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(end = 40.dp)) {
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
internal fun EmptyState(heading: String, text: String, action: String? = null, onAction: () -> Unit = {}) {
    Column(Modifier.fillMaxSize().padding(end = 60.dp, bottom = 60.dp), verticalArrangement = Arrangement.Center) {
        Text(heading, style = Type.Display)
        Text(text, style = Type.Muted, modifier = Modifier.padding(top = 6.dp).widthIn(max = 460.dp))
        if (action != null) {
            val requester = remember { FocusRequester() }
            LaunchedEffect(Unit) { delay(80); runCatching { requester.requestFocus() } }
            TvButton(action, onAction, primary = true, requester = requester, modifier = Modifier.padding(top = 16.dp))
        }
    }
}

@Composable
internal fun StatChip(label: String, value: String) {
    Column(
        Modifier.padding(start = 10.dp).clip(RoundedCornerShape(12.dp)).background(Palette.Panel.copy(alpha = 0.85f)).padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(value, style = Type.Title)
        Text(label, style = Type.Muted.copy(fontSize = 10.sp))
    }
}
