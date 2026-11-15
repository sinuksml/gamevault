package in.sinu.gamevault.nativetv;

import android.view.View;

import java.util.List;

/** The classic canvas layout, adapted to the shared screen interface. */
final class ClassicScreen implements TvScreen {
    private final VaultTvView view;

    ClassicScreen(VaultTvView view) { this.view = view; }

    @Override public View view() { return view; }
    @Override public void setData(VaultData data) { view.setData(data); }
    @Override public void setPlex(List<MediaItem> items) { view.setPlex(items); }
    @Override public void setTorrents(List<ServiceRepository.TorrentItem> items) { view.setTorrents(items); }
    @Override public void setStatus(String message) { view.setStatus(message); }
    @Override public void setDriveConnected(boolean connected) { view.setDriveConnected(connected); }
    @Override public void showQr(String url, String code, long expiresAt) { view.showQr(url, code, expiresAt); }
    @Override public void hideQr() { view.hideQr(); }
    @Override public void clearArtwork() { view.clearArtwork(); }
    @Override public void setDetailStory(MediaItem item, String story) { view.setDetailStory(item, story); }
    @Override public void setEpisodes(MediaItem item, int season, List<ServiceRepository.EpisodeItem> episodes) { view.setEpisodes(item, season, episodes); }
    @Override public boolean handleBack() { return view.handleBack(); }
}
