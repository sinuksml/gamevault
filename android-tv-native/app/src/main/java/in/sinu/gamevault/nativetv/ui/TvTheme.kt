package `in`.sinu.gamevault.nativetv

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.tv.material3.darkColorScheme
import coil3.compose.AsyncImage

internal object Palette {
    val Background = Color(0xFF03060A)
    val Panel = Color(0xFF0D1723)
    val PanelRaised = Color(0xFF16283B)
    val Text = Color(0xFFF2F7FC)
    val Muted = Color(0xFF9EAEC2)
    val Accent = Color(0xFF54F2D2)
    val Blue = Color(0xFF3F87F4)
    val Amber = Color(0xFFFFBE4A)
    val Red = Color(0xFFFF636C)
}

/** Type scale for a ten-foot screen. Sizes are in sp on a 540dp-high canvas. */
internal object Type {
    val Display = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold, color = Palette.Text, letterSpacing = (-0.5).sp)
    val Title = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Palette.Text)
    val Body = TextStyle(fontSize = 13.sp, color = Palette.Text, lineHeight = 19.sp)
    val Muted = TextStyle(fontSize = 12.sp, color = Palette.Muted, lineHeight = 17.sp)
    val Label = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Palette.Accent, letterSpacing = 1.2.sp)
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

/** A stable colour per title, so a card without artwork is still recognisable. */
internal fun tint(name: String): Color {
    var hash = 0
    for (ch in name) hash = (hash * 31 + ch.code) and 0x7FFFFFFF
    val palette = listOf(0xFF1E3A52, 0xFF3A2E5C, 0xFF4F2A3C, 0xFF21493F, 0xFF4B3F23, 0xFF2B3F5C)
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
        // Left and bottom scrims keep text readable over any picture.
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Palette.Background.copy(alpha = 0.92f), 0.55f to Palette.Background.copy(alpha = 0.55f), 1f to Color.Transparent)))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.35f to Color.Transparent, 1f to Palette.Background)))
    }
}

/** The shape every focusable thing shares: lifts and gains an accent ring when it has focus. */
@Composable
internal fun Modifier.focusLift(
    focused: Boolean, shape: RoundedCornerShape = RoundedCornerShape(14.dp), lift: Float = 1.06f,
): Modifier {
    val scale by animateFloatAsState(if (focused) lift else 1f, tween(140), label = "lift")
    return this
        .zIndex(if (focused) 1f else 0f)
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .clip(shape)
        .then(if (focused) Modifier.border(3.dp, Palette.Accent, shape) else Modifier)
}

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
    val width = if (wide) 208.dp else 116.dp
    val height = if (wide) 117.dp else 174.dp
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier
            .then(if (requester != null) Modifier.focusRequester(requester) else Modifier)
            .padding(vertical = 10.dp)
            .size(width, height)
            .onFocusChanged { focused = it.isFocused; if (it.isFocused) onFocus() }
            .focusLift(focused, shape)
            .background(tint(item.title))
            .clickable(onClick = onOpen),
    ) {
        Text(initials(item.title), style = Type.Display.copy(color = Color.White.copy(alpha = 0.7f)), modifier = Modifier.align(Alignment.Center))
        val image = item.image(wide)
        if (image.isNotEmpty()) AsyncImage(model = image, contentDescription = item.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.45f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.85f))))
        if (item.eyebrow.isNotEmpty()) {
            Text(
                item.eyebrow, style = Type.Label.copy(fontSize = 9.sp, color = Color.White), maxLines = 1,
                modifier = Modifier.align(Alignment.TopStart).padding(6.dp).clip(RoundedCornerShape(6.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        Text(
            item.title, style = Type.Body.copy(fontSize = 12.sp, fontWeight = FontWeight.SemiBold, lineHeight = 15.sp), maxLines = 2,
            modifier = Modifier.align(Alignment.BottomStart).padding(horizontal = 8.dp, vertical = 8.dp),
        )
        if (item.progress in 1..99) {
            Box(Modifier.align(Alignment.BottomStart).fillMaxSize().padding(top = height - 4.dp)) {
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)))
                Box(Modifier.fillMaxSize(fraction = item.progress / 100f).background(Palette.Accent))
            }
        }
    }
}

/** A text button for a ten-foot screen. [primary] fills it with the accent colour. */
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
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier
            .then(if (requester != null) Modifier.focusRequester(requester) else Modifier)
            .onFocusChanged { focused = it.isFocused; if (it.isFocused) onFocus() }
            .focusLift(focused, shape, lift = 1.05f)
            .background(if (focused) Palette.Accent else if (primary) Palette.PanelRaised else Palette.Panel)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = Type.Body.copy(fontWeight = FontWeight.SemiBold, color = if (focused) Palette.Background else Palette.Text), maxLines = 1)
    }
}

internal val ContentPadding = PaddingValues(horizontal = 24.dp)
internal val RailCollapsed: Dp = 72.dp
internal val RailExpanded: Dp = 232.dp
