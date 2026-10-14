package cz.aoe2wiki.reader;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Network layer:
 *  - proxies the web UI's API calls to the wiki's MediaWiki API (same-origin, no CORS issues);
 *  - serves wiki images from a permanent on-disk cache, downloading them on first use;
 *  - prefetches images in the background for offline reading.
 */
final class WikiNet {
    static final String API = "https://ageofempires.fandom.com/api.php";
    private static final String UA = "AoE2WikiReader/" + BuildConfig.VERSION_NAME + " (Android; personal ad-free reader)";

    private static volatile WikiNet instance;

    static WikiNet get(Context context) {
        if (instance == null) {
            synchronized (WikiNet.class) {
                if (instance == null) instance = new WikiNet(context.getApplicationContext());
            }
        }
        return instance;
    }

    static boolean isMediaHost(String host) {
        return host != null && (host.equals("static.wikia.nocookie.net") || host.endsWith(".nocookie.net"));
    }

    private final File dir;
    private final ConnectivityManager cm;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private final Set<String> inFlight = ConcurrentHashMap.newKeySet();
    private final AtomicInteger queued = new AtomicInteger();
    private final AtomicInteger done = new AtomicInteger();
    private final AtomicInteger failed = new AtomicInteger();
    private volatile int generation = 0;

    private WikiNet(Context context) {
        dir = new File(context.getFilesDir(), "media");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
    }

    boolean isOnline() {
        try {
            Network n = cm.getActiveNetwork();
            if (n == null) return false;
            NetworkCapabilities nc = cm.getNetworkCapabilities(n);
            return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return true;
        }
    }

    private static HttpURLConnection open(String url, int readTimeoutMs) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(readTimeoutMs);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", UA);
        return c;
    }

    // ---------------------------------------------------------------- API proxy

    WebResourceResponse proxy(Uri url) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        String q = url.getEncodedQuery();
        try {
            HttpURLConnection c = open(API + "?" + (q == null ? "" : q), 45000);
            int code = c.getResponseCode();
            InputStream body = code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);
            int status = (code >= 300 && code < 400) || code < 100 || code > 599 ? 502 : code;
            return new WebResourceResponse("application/json", "utf-8", status, reason(status), headers, body);
        } catch (Exception e) {
            String json = "{\"error\":{\"code\":\"network\",\"info\":"
                    + JSONObject.quote(String.valueOf(e.getMessage())) + "}}";
            return new WebResourceResponse("application/json", "utf-8", 503, "Network unavailable", headers,
                    new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        }
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 404: return "Not Found";
            case 429: return "Too Many Requests";
            case 502: return "Bad Gateway";
            case 503: return "Service Unavailable";
            default: return "Status " + status;
        }
    }

    // ---------------------------------------------------------------- media cache

    WebResourceResponse media(WebResourceRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod())) return null;
        Map<String, String> rh = request.getRequestHeaders();
        if (rh != null) {
            for (String k : rh.keySet()) {
                if ("range".equalsIgnoreCase(k)) return null; // let the WebView stream audio itself
            }
        }
        String url = request.getUrl().toString();
        File f = fileFor(url);
        if (!f.exists() && !download(url, f)) return null;
        try {
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "max-age=31536000");
            h.put("Access-Control-Allow-Origin", "*");
            return new WebResourceResponse(sniff(f), null, 200, "OK", h, new FileInputStream(f));
        } catch (IOException e) {
            return null;
        }
    }

    private boolean download(String url, File f) {
        File tmp = new File(dir, f.getName() + "." + UUID.randomUUID() + ".part");
        HttpURLConnection c = null;
        try {
            c = open(url, 30000);
            c.setRequestProperty("Accept", "image/webp,image/apng,image/*,*/*;q=0.8");
            if (c.getResponseCode() != 200) return false;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return tmp.renameTo(f) || f.exists();
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
            if (tmp.exists()) //noinspection ResultOfMethodCallIgnored
                tmp.delete();
        }
    }

    /** Queues image URLs (JSON array) for background download. Returns how many were queued. */
    int prefetch(String json) {
        JSONArray arr;
        try {
            arr = new JSONArray(json);
        } catch (JSONException e) {
            return 0;
        }
        final int gen = generation;
        int n = 0;
        for (int i = 0; i < arr.length(); i++) {
            final String u = arr.optString(i, "");
            if (!u.startsWith("https://")) continue;
            try {
                if (!isMediaHost(Uri.parse(u).getHost())) continue;
            } catch (Exception e) {
                continue;
            }
            final File f = fileFor(u);
            if (f.exists() || !inFlight.add(u)) continue;
            n++;
            queued.incrementAndGet();
            pool.execute(() -> {
                try {
                    if (gen != generation) return;
                    if (f.exists() || download(u, f)) done.incrementAndGet();
                    else failed.incrementAndGet();
                } finally {
                    inFlight.remove(u);
                }
            });
        }
        return n;
    }

    String status() {
        try {
            return new JSONObject()
                    .put("queued", queued.get())
                    .put("done", done.get())
                    .put("failed", failed.get())
                    .put("pending", inFlight.size())
                    .toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    void cancel() {
        generation++;
    }

    String cacheInfo() {
        File[] files = dir.listFiles();
        long bytes = 0;
        int count = 0;
        if (files != null) {
            for (File x : files) {
                if (x.getName().endsWith(".part")) continue;
                bytes += x.length();
                count++;
            }
        }
        return "{\"files\":" + count + ",\"bytes\":" + bytes + "}";
    }

    void clearCache() {
        cancel();
        File[] files = dir.listFiles();
        if (files != null) {
            for (File x : files) //noinspection ResultOfMethodCallIgnored
                x.delete();
        }
        queued.set(0);
        done.set(0);
        failed.set(0);
    }

    private File fileFor(String url) {
        return new File(dir, sha1(url));
    }

    private static String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }

    private static String sniff(File f) {
        byte[] h = new byte[16];
        int n = 0;
        try (InputStream in = new FileInputStream(f)) {
            n = in.read(h);
        } catch (IOException ignored) {
            // fall through
        }
        if (n >= 4 && (h[0] & 0xff) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return "image/png";
        if (n >= 3 && (h[0] & 0xff) == 0xFF && (h[1] & 0xff) == 0xD8 && (h[2] & 0xff) == 0xFF) return "image/jpeg";
        if (n >= 4 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') return "image/gif";
        if (n >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return "image/webp";
        if (n >= 4 && h[0] == 'O' && h[1] == 'g' && h[2] == 'g' && h[3] == 'S') return "audio/ogg";
        if (n >= 3 && h[0] == 'I' && h[1] == 'D' && h[2] == '3') return "audio/mpeg";
        String head = n > 0 ? new String(h, 0, n, StandardCharsets.ISO_8859_1).trim() : "";
        if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
        return "application/octet-stream";
    }
}
