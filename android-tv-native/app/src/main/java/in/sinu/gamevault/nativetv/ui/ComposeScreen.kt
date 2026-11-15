package `in`.sinu.gamevault.nativetv

import android.content.Context
import android.view.View
import androidx.compose.ui.platform.ComposeView
import coil3.SingletonImageLoader
import coil3.annotation.ExperimentalCoilApi

/**
 * The Compose layout, adapted to the shared screen interface that MainActivity drives.
 *
 * MainActivity still owns Drive, the vault and saving; this only displays what it is
 * given and sends the user's choices back through [VaultTvView.Actions].
 */
internal class ComposeScreen(
    private val context: Context,
    private val actions: VaultTvView.Actions,
) : TvScreen {
    private val state = TvState()
    private val host = ComposeView(context).apply {
        setContent { TvApp(state, actions) }
    }

    override fun view(): View = host
    override fun setData(data: VaultData?) = state.updateData(data)
    override fun setPlex(items: List<MediaItem>?) = state.updatePlex(items)
    override fun setTorrents(items: List<ServiceRepository.TorrentItem>?) = state.updateTorrents(items)
    override fun setStatus(message: String?) = state.updateStatus(message)
    override fun setDriveConnected(connected: Boolean) = state.updateDriveConnected(connected)
    override fun showQr(url: String, code: String, expiresAt: Long) = state.showQr(url, code, expiresAt)
    override fun hideQr() = state.hideQr()

    @OptIn(ExperimentalCoilApi::class)
    override fun clearArtwork() {
        val loader = SingletonImageLoader.get(context)
        loader.memoryCache?.clear()
        loader.diskCache?.clear()
    }

    override fun setDetailStory(item: MediaItem?, story: String?) = state.setDetailStory(item, story)
    override fun setEpisodes(item: MediaItem?, season: Int, episodes: List<ServiceRepository.EpisodeItem>?) = state.setEpisodes(item, season, episodes)
    override fun handleBack(): Boolean = state.back()
}
