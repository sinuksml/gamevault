package `in`.sinu.gamevault.nativetv

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.tv.material3.darkColorScheme
import coil3.compose.AsyncImage

internal object Palette {
    val Background = Color(0xFF000000)
    val Panel = Color(0xFF1C1C1E)
    val PanelRaised = Color(0xFF2C2C2E)
    val Text = Color(0xFFFFFFFF)
    val Muted = Color(0xFF98989F)
    /** The focus colour: white. Kept under the old name so every focus state follows it. */
    val Accent = Color(0xFFFFFFFF)
    val Blue = Color(0xFFFFFFFF)
    val Amber = Color(0xFFFFD60A)
    val Red = Color(0xFFFF453A)
}

/** Type scale for a ten-foot screen. Sizes are in sp on a 540dp-high canvas. */
internal object Type {
    val Display = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold, color = Palette.Text, letterSpacing = (-0.6).sp)
    val Hero = TextStyle(fontSize = 46.sp, fontWeight = FontWeight.Bold, color = Palette.Text, letterSpacing = (-1).sp, lineHeight = 48.sp)
    val Title = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Palette.Text)
    val Body = TextStyle(fontSize = 13.sp, color = Palette.Text, lineHeight = 19.sp)
    val Muted = TextStyle(fontSize = 12.sp, color = Palette.Muted, lineHeight = 17.sp)
    val Label = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Palette.Muted, letterSpacing = 1.6.sp)
}

@Composable
internal fun TvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Palette.Accent, onPrimary = Palette.Background, background = Palette.Background,
            surface = Palette.Panel, onSurface = Palette.Text, onBackground = Palette.Text,
        ),
        content = content,
    )
}

/** Wikipedia scraping leaves "edit" and "edit source" link text in front of a plot; hide it. */
internal fun cleanStory(text: String): String =
    text.replace(Regex("^(?:\\s*(?:\\[?edit(?: source)?\\]?)\\b)+\\s*", RegexOption.IGNORE_CASE), "")
        .replace(Regex("\\[(?:edit|\\d+)]", RegexOption.IGNORE_CASE), "")
        .trim()

/** A stable muted colour per title, so a card without artwork is still recognisable. */
internal fun tint(name: String): Color {
    var hash = 0
    for (ch in name) hash = (hash * 31 + ch.code) and 0x7FFFFFFF
    val palette = listOf(0xFF26262B, 0xFF2B2630, 0xFF30262B, 0xFF222A28, 0xFF2D2A22, 0xFF232A33)
    return Color(palette[hash % palette.size])
}

internal fun initials(name: String): String =
    name.split(Regex("[\\s\\-:.]+")).filter { it.isNotEmpty() && it[0].isLetterOrDigit() }.take(2).joinToString("") { it.take(1).uppercase() }.ifEmpty { "?" }

/** Full-bleed artwork that cross-fades when the focused title changes. */
@Composable
internal fun Backdrop(url: String, modifier: Modifier = Modifier.fillMaxSize()) {
    Box(modifier) {
        Crossfade(targetState = url, animationSpec = tween(450), label = "backdrop") { current ->
            if (current.isNotEmpty()) AsyncImage(model = current, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        // Scrims keep text readable over any picture: left for the text, top for the bar, bottom to fade into the shelves.
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Color.Black.copy(alpha = 0.85f), 0.5f to Color.Black.copy(alpha = 0.35f), 0.8f to Color.Transparent)))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.55f), 0.2f to Color.Transparent, 0.5f to Color.Transparent, 0.92f to Color.Black)))
    }
}

/** The shape every focusable thing shares: it lifts and gains a white outline when it has focus. */
@Composable
internal fun Modifier.focusLift(
    focused: Boolean, shape: RoundedCornerShape = RoundedCornerShape(14.dp), lift: Float = 1.06f,
): Modifier {
    val scale by animateFloatAsState(if (focused) lift else 1f, tween(140), label = "lift")
    return this
        .zIndex(if (focused) 1f else 0f)
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .clip(shape)
        .then(if (focused) Modifier.border(2.5.dp, Color.White, shape) else Modifier)
}

/** Badges worth showing on a card: they say something about the title, unlike "Watchlist" on every poster. */
private fun badgeWorthy(label: String): Boolean {
    val l = label.lowercase()
    return l.isNotEmpty() && listOf("day", "left", "expire", "hold", "rent", "new").any { it in l }
}

/** Artwork on its own, with the title appearing underneath only while the card has focus. */
@Composable
internal fun TitleCard(
    item: MediaItem,
    wide: Boolean,
    onFocus: () -> Unit,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    requester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val width = if (wide) 200.dp else 116.dp
    val height = if (wide) 112.dp else 174.dp
    val shape = RoundedCornerShape(14.dp)
    val image = item.image(wide)
    Column(modifier.width(width)) {
        Box(
            Modifier
                .then(if (requester != null) Modifier.focusRequester(requester) else Modifier)
                .padding(top = 8.dp)
                .size(width, height)
                .onFocusChanged { focused = it.isFocused; if (it.isFocused) onFocus() }
                .focusLift(focused, shape, lift = 1.08f)
                .background(tint(item.title))
                .clickable(onClick = onOpen),
        ) {
            if (image.isEmpty()) {
                // Without artwork the title is the only way to tell cards apart, so it stays visible.
                Text(item.title, style = Type.Body.copy(fontWeight = FontWeight.SemiBold), maxLines = 3, modifier = Modifier.align(Alignment.Center).padding(10.dp))
            } else {
                AsyncImage(model = image, contentDescription = item.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
            if (badgeWorthy(item.eyebrow)) {
                Text(
                    item.eyebrow, style = Type.Body.copy(fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Color.White), maxLines = 1,
                    modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).clip(RoundedCornerShape(6.dp)).background(Color.Black.copy(alpha = 0.62f)).padding(horizontal = 7.dp, vertical = 2.dp),
                )
            }
            if (item.progress in 1..99) {
                Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(4.dp).background(Color.Black.copy(alpha = 0.55f))) {
                    Box(Modifier.fillMaxHeight().fillMaxWidth(fraction = item.progress / 100f).background(Color.White))
                }
            }
        }
        Text(
            if (focused) item.title else "", style = Type.Body.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold), maxLines = 1,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.height(22.dp).padding(top = 5.dp, start = 2.dp),
        )
    }
}

/** A pill button for a ten-foot screen. White with dark text when focused; [primary] is a little brighter at rest. */
@Composable
internal fun TvButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    requester: FocusRequester? = null,
    onFocus: () -> Unit = {},
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(50)
    Box(
        modifier
            .then(if (requester != null) Modifier.focusRequester(requester) else Modifier)
            .onFocusChanged { focused = it.isFocused; if (it.isFocused) onFocus() }
            .focusLift(focused, shape, lift = 1.05f)
            .background(if (focused) Color.White else if (primary) Color.White.copy(alpha = 0.24f) else Color.White.copy(alpha = 0.13f))
            .clickable(onClick = onClick)
            .padding(horizontal = 22.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = Type.Body.copy(fontWeight = FontWeight.SemiBold, color = if (focused) Palette.Background else Palette.Text), maxLines = 1)
    }
}

internal val ContentPadding = PaddingValues(horizontal = 24.dp)
/** Left edge of page content, matching the hero text. */
internal val PageStart = 40.dp
/** Height of the top navigation bar area that pages leave clear. */
internal val BarHeight = 64.dp
