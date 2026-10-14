package cz.aoe2wiki.reader;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * Hosts the reader UI (assets/www) in a WebView. Wiki content is fetched through
 * {@link WikiNet}, which talks only to the wiki's API and image server, so no
 * Fandom page scripts or ads are ever loaded.
 */
public class MainActivity extends ComponentActivity {

    static final String APP_HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + APP_HOST + "/assets/www/index.html";
    private static final int LIGHT_BG = 0xFFF4EFE5;
    private static final int DARK_BG = 0xFF14110D;

    private FrameLayout root;
    private WebView webView;
    private WikiNet net;
    private WebViewAssetLoader assetLoader;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this,
                SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
                SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT));
        super.onCreate(savedInstanceState);

        net = WikiNet.get(this);
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        boolean dark = isSystemDark();
        root = new FrameLayout(this);
        root.setBackgroundColor(dark ? DARK_BG : LIGHT_BG);
        webView = new WebView(this);
        webView.setBackgroundColor(dark ? DARK_BG : LIGHT_BG);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Keep content clear of the status bar, navigation bar, notch and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        applyBars(dark);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " AoE2WikiReader/" + BuildConfig.VERSION_NAME);

        webView.addJavascriptInterface(new Bridge(this, net), "Android");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String host = url.getHost();
                String path = url.getPath();
                if (APP_HOST.equals(host) && path != null && path.startsWith("/proxy/")) {
                    return net.proxy(url);
                }
                if (WikiNet.isMediaHost(host)) {
                    return net.media(request);
                }
                return assetLoader.shouldInterceptRequest(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (APP_HOST.equals(url.getHost())) return false;
                openExternal(url.toString());
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                webView.evaluateJavascript("(window.appBack && window.appBack()) ? 'y' : 'n'", result -> {
                    if (result != null && result.contains("y")) return;
                    if (webView.canGoBack()) webView.goBack();
                    else finish();
                });
            }
        });

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }
    }

    boolean isSystemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Called from the web UI whenever the light/dark theme changes. */
    void applyTheme(boolean dark, String color) {
        int c = dark ? DARK_BG : LIGHT_BG;
        try {
            if (color != null && !color.trim().isEmpty()) c = Color.parseColor(color.trim());
        } catch (IllegalArgumentException ignored) {
            // keep default
        }
        root.setBackgroundColor(c);
        webView.setBackgroundColor(c);
        applyBars(dark);
    }

    private void applyBars(boolean dark) {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), root);
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }

    void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
    }

    void share(String title, String url) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_SUBJECT, title);
        i.putExtra(Intent.EXTRA_TEXT, title + "\n" + url);
        try {
            startActivity(Intent.createChooser(i, null));
        } catch (ActivityNotFoundException ignored) {
            // nothing to share with
        }
    }

    void keepScreenOn(boolean on) {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        boolean dark = (newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        webView.evaluateJavascript("window.onSystemTheme && window.onSystemTheme(" + dark + ")", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        root.removeView(webView);
        webView.destroy();
        super.onDestroy();
    }
}
