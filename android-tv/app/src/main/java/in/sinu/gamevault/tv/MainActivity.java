package in.sinu.gamevault.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String GAMEVAULT_URL = "https://sinuksml.github.io/gamevault/?tv=1&appv=1.6.0";
    private static final int EXTERNAL_BAR_HEIGHT_DP = 64;
    private static final long REMOTE_REPEAT_INTERVAL_MS = 180;

    private WebView webView;
    private LinearLayout externalBar;
    private LinearLayout offlinePanel;
    private boolean clearHistoryOnGameVaultReturn;
    private int lastRemoteKeyCode = KeyEvent.KEYCODE_UNKNOWN;
    private long lastRemoteKeyAt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(8, 12, 19));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(8, 12, 19));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        configureWebView();
        root.addView(webView);

        externalBar = createExternalBar();
        root.addView(externalBar);

        offlinePanel = createOfflinePanel();
        root.addView(offlinePanel);

        setContentView(root);

        boolean restored = savedInstanceState != null && webView.restoreState(savedInstanceState) != null;
        if (!restored) {
            webView.loadUrl(GAMEVAULT_URL);
        }
        webView.requestFocus();
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " GameVaultTV/1.6.0");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookies.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new GameVaultClient());
    }

    private LinearLayout createExternalBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(28), dp(8), dp(28), dp(8));
        bar.setBackgroundColor(Color.rgb(15, 23, 36));
        bar.setVisibility(View.GONE);
        bar.setFocusable(false);

        Button back = new Button(this);
        back.setText(R.string.return_to_gamevault);
        back.setTextSize(18);
        back.setTextColor(Color.WHITE);
        back.setBackgroundColor(Color.rgb(22, 78, 135));
        back.setMinHeight(dp(48));
        back.setOnClickListener(v -> returnToGameVault());
        bar.addView(back, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.MATCH_PARENT
        ));

        TextView label = new TextView(this);
        label.setText("External page");
        label.setTextColor(Color.rgb(174, 187, 207));
        label.setTextSize(16);
        label.setPadding(dp(20), 0, 0, 0);
        bar.addView(label, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            dp(EXTERNAL_BAR_HEIGHT_DP),
            Gravity.TOP
        );
        bar.setLayoutParams(params);
        return bar;
    }

    private LinearLayout createOfflinePanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(48), dp(40), dp(48), dp(40));
        panel.setBackgroundColor(Color.rgb(8, 12, 19));
        panel.setVisibility(View.GONE);
        panel.setFocusable(false);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(Color.WHITE);
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER);
        panel.addView(title);

        TextView message = new TextView(this);
        message.setText(R.string.offline_message);
        message.setTextColor(Color.rgb(174, 187, 207));
        message.setTextSize(18);
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, dp(12), 0, dp(24));
        panel.addView(message);

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setTextSize(19);
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundColor(Color.rgb(22, 96, 172));
        retry.setMinWidth(dp(180));
        retry.setMinHeight(dp(54));
        retry.setOnClickListener(v -> {
            hideOfflinePanel();
            webView.loadUrl(GAMEVAULT_URL);
        });
        panel.addView(retry);

        panel.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        return panel;
    }

    private void showOfflinePanel() {
        offlinePanel.setVisibility(View.VISIBLE);
        webView.setVisibility(View.INVISIBLE);
        externalBar.setVisibility(View.GONE);
        Button retry = findFirstButton(offlinePanel);
        if (retry != null) retry.requestFocus();
    }

    private void hideOfflinePanel() {
        offlinePanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    private Button findFirstButton(LinearLayout parent) {
        for (int i = 0; i < parent.getChildCount(); i++) {
            if (parent.getChildAt(i) instanceof Button) return (Button) parent.getChildAt(i);
        }
        return null;
    }

    private void updateExternalBar(String url) {
        boolean external = url != null && !isGameVaultUrl(url);
        externalBar.setVisibility(external ? View.VISIBLE : View.GONE);
        webView.setPadding(0, external ? dp(EXTERNAL_BAR_HEIGHT_DP) : 0, 0, 0);
        if (external) {
            Button back = findFirstButton(externalBar);
            if (back != null) back.requestFocus();
        } else {
            webView.requestFocus();
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) webView.requestFocus();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String key = jsKey(event.getKeyCode());
        if (key == null || offlinePanel.getVisibility() == View.VISIBLE || !isGameVaultPage()) {
            return super.dispatchKeyEvent(event);
        }
        if (event.getAction() == KeyEvent.ACTION_UP) return true;
        if (event.getAction() != KeyEvent.ACTION_DOWN) return true;

        long now = SystemClock.uptimeMillis();
        boolean enter = "Enter".equals(key);
        boolean firstPress = event.getRepeatCount() == 0 || event.getKeyCode() != lastRemoteKeyCode;
        boolean repeatReady = !enter && now - lastRemoteKeyAt >= REMOTE_REPEAT_INTERVAL_MS;
        if (firstPress || repeatReady) {
            lastRemoteKeyCode = event.getKeyCode();
            lastRemoteKeyAt = now;
            sendKeyToPage(key);
        }
        return true;
    }

    private String jsKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
                return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN:
                return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_LEFT:
                return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                return "Enter";
            default:
                return null;
        }
    }

    private void sendKeyToPage(String key) {
        String js = "(function(){if(window.gameVaultTvKey){window.gameVaultTvKey('" + key + "');return;}" +
            "document.dispatchEvent(new KeyboardEvent('keydown',{key:'" + key + "',bubbles:true,cancelable:true}));})();";
        webView.evaluateJavascript(js, null);
    }

    private boolean isGameVaultPage() {
        return webView != null && isGameVaultUrl(webView.getUrl());
    }

    private boolean isGameVaultUrl(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        return host.endsWith("sinuksml.github.io") && uri.getPath() != null && uri.getPath().startsWith("/gamevault");
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        if (!isGameVaultPage()) {
            returnToGameVault();
            return;
        }
        webView.evaluateJavascript(
            "(function(){if(window.gameVaultTvBack){return window.gameVaultTvBack();}var e=document.activeElement;if(e&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)){e.blur();document.body.focus();return 'handled';}return 'clear';})()",
            value -> {
                if ("\"handled\"".equals(value)) {
                    hideKeyboard();
                } else if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    MainActivity.super.onBackPressed();
                }
            }
        );
    }

    private void returnToGameVault() {
        hideKeyboard();
        clearHistoryOnGameVaultReturn = true;
        webView.loadUrl(GAMEVAULT_URL);
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null && webView != null) {
            imm.hideSoftInputFromWindow(webView.getWindowToken(), 0);
        }
        if (webView != null) webView.requestFocus();
    }

    private final class GameVaultClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleExternalUrl(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleExternalUrl(Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            hideOfflinePanel();
            updateExternalBar(url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            updateExternalBar(url);
            if (isGameVaultUrl(url)) {
                if (clearHistoryOnGameVaultReturn) {
                    view.clearHistory();
                    clearHistoryOnGameVaultReturn = false;
                }
                view.requestFocus();
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOfflinePanel();
        }

        private boolean handleExternalUrl(Uri uri) {
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            if (host.contains("youtube.com") || host.contains("youtu.be")) {
                openYouTube(uri);
                return true;
            }
            if ("http".equals(scheme) || "https".equals(scheme)) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException e) {
                Toast.makeText(MainActivity.this, "No app can open this link.", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
    }

    private void openYouTube(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage("com.google.android.youtube.tv");
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Intent phoneIntent = new Intent(Intent.ACTION_VIEW, uri);
            phoneIntent.setPackage("com.google.android.youtube");
            try {
                startActivity(phoneIntent);
            } catch (ActivityNotFoundException ex) {
                webView.loadUrl(uri.toString());
            }
        }
    }
}
