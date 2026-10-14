package cz.aoe2wiki.reader;

import android.webkit.JavascriptInterface;

/** Methods the web UI can call as window.Android.*. Called on a background thread. */
final class Bridge {
    private final MainActivity activity;
    private final WikiNet net;

    Bridge(MainActivity activity, WikiNet net) {
        this.activity = activity;
        this.net = net;
    }

    @JavascriptInterface
    public boolean isSystemDark() {
        return activity.isSystemDark();
    }

    @JavascriptInterface
    public void setThemeColors(boolean dark, String color) {
        activity.runOnUiThread(() -> activity.applyTheme(dark, color));
    }

    @JavascriptInterface
    public void openExternal(String url) {
        if (url == null) return;
        final String u = url.trim();
        if (!u.startsWith("https://") && !u.startsWith("http://")) return;
        activity.runOnUiThread(() -> activity.openExternal(u));
    }

    @JavascriptInterface
    public void share(String title, String url) {
        activity.runOnUiThread(() -> activity.share(title, url));
    }

    @JavascriptInterface
    public void keepScreenOn(boolean on) {
        activity.runOnUiThread(() -> activity.keepScreenOn(on));
    }

    @JavascriptInterface
    public int prefetch(String json) {
        return net.prefetch(json);
    }

    @JavascriptInterface
    public String prefetchStatus() {
        return net.status();
    }

    @JavascriptInterface
    public void cancelPrefetch() {
        net.cancel();
    }

    @JavascriptInterface
    public String mediaCacheInfo() {
        return net.cacheInfo();
    }

    @JavascriptInterface
    public void clearMediaCache() {
        net.clearCache();
    }

    @JavascriptInterface
    public boolean isOnline() {
        return net.isOnline();
    }

    @JavascriptInterface
    public String appVersion() {
        return BuildConfig.VERSION_NAME;
    }
}
