package in.sinu.gamevault.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.inputmethod.InputMethodManager;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String GAMEVAULT_URL = "https://sinuksml.github.io/gamevault/?tv=1&appv=nav4";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(10, 13, 19));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

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

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new GameVaultClient());
        setContentView(webView);

        webView.loadUrl(GAMEVAULT_URL);
        webView.requestFocus();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            String key = jsKey(event.getKeyCode());
            if (key != null) {
                sendKeyToPage(key);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
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
        String js = "document.dispatchEvent(new KeyboardEvent('keydown',{key:'" + key + "',bubbles:true,cancelable:true}));";
        webView.evaluateJavascript(js, null);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
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

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) {
            imm.hideSoftInputFromWindow(webView.getWindowToken(), 0);
        }
        webView.requestFocus();
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

        private boolean handleExternalUrl(Uri uri) {
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            if (host.contains("youtube.com") || host.contains("youtu.be")) {
                openYouTube(uri);
                return true;
            }
            if (!host.endsWith("sinuksml.github.io") && !host.contains("google.com") && !host.contains("googleapis.com") && !host.contains("quickchart.io")) {
                openTemporarySearch(uri);
                return true;
            }
            return false;
        }
    }

    private void openYouTube(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage("com.google.android.youtube.tv");
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Intent phoneIntent = new Intent(Intent.ACTION_VIEW, uri);
            phoneIntent.setPackage("com.google.android.youtube");
            try {
                startActivity(phoneIntent);
            } catch (ActivityNotFoundException ex) {
                openTemporarySearch(uri);
            }
        }
    }

    private void openTemporarySearch(Uri uri) {
        String searchUrl = "https://www.google.com/search?q=" + Uri.encode(uri.toString());
        Toast.makeText(this, "Opening a temporary search page. Press Back to return.", Toast.LENGTH_SHORT).show();
        webView.loadUrl(searchUrl);
    }
}
