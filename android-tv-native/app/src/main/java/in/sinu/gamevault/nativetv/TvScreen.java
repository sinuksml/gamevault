package in.sinu.gamevault.nativetv;

import android.view.View;

import java.util.List;

/**
 * What MainActivity needs from a screen. Two layouts implement it: the classic
 * hand-drawn canvas (ClassicScreen) and the Compose one (ComposeScreen). Everything
 * else — Drive, the vault, saving, dialogs — stays in MainActivity and is shared.
 */
interface TvScreen {
    View view();
    void setData(VaultData data);
    void setPlex(List<MediaItem> items);
    void setTorrents(List<ServiceRepository.TorrentItem> items);
    void setStatus(String message);
    void setDriveConnected(boolean connected);
    void showQr(String url, String code, long expiresAt);
    void hideQr();
    void clearArtwork();
    void setDetailStory(MediaItem item, String story);
    void setEpisodes(MediaItem item, int season, List<ServiceRepository.EpisodeItem> episodes);
    /** Handles the Back button; false means nothing was left to close and the app may exit. */
    boolean handleBack();
}
