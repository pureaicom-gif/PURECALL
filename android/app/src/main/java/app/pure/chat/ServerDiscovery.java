package app.pure.chat;

import android.content.Context;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * 0.9.2: finds the live PURE server. All sources are queried in parallel with short timeouts; every
 * candidate origin is verified with GET /healthz before it is returned. Priority (first alive wins):
 * raw.githubusercontent server.json, github.io server.json, call.purefxai.store server.json,
 * the permanent primary origin, the last saved/discovered origin.
 */
public final class ServerDiscovery {
    public static final String RAW_URL = "https://raw.githubusercontent.com/purefxaidev/purecall-web/main/server.json";
    public static final String PAGES_URL = "https://purefxaidev.github.io/purecall-web/server.json";
    public static final String DEFAULT_URL = "https://call.purefxai.store/server.json";
    /** Permanent named-tunnel origin. */
    public static final String PRIMARY_ORIGIN = "https://api.purefxai.store";
    private static final int TIMEOUT_MS = 4000;
    private ServerDiscovery() {}

    /** Blocking (≤ ~9 s); returns a verified-alive origin, or "" when none is alive. */
    public static String refresh(Context c) {
        android.content.SharedPreferences p = Updater.prefs(c);
        List<String[]> src = new ArrayList<>(); // {kind, value}: "json" = server.json URL, "origin" = direct origin
        String custom = p.getString("server_json_url", "");
        if (VersionUtil.isHttpsUrl(custom) && !custom.equals(DEFAULT_URL)) src.add(new String[]{"json", custom});
        src.add(new String[]{"json", RAW_URL + "?t=" + (System.currentTimeMillis() / 60000)});
        src.add(new String[]{"json", PAGES_URL});
        src.add(new String[]{"json", DEFAULT_URL});
        src.add(new String[]{"origin", p.getString("primary_origin", PRIMARY_ORIGIN)});
        src.add(new String[]{"origin", p.getString("discovered_server", "")});
        try { src.add(new String[]{"origin", c.getSharedPreferences("MainActivity", 0).getString("server", "")}); } catch (Exception ignored) {}

        ExecutorService ex = Executors.newFixedThreadPool(src.size());
        List<Future<String>> fs = new ArrayList<>();
        for (String[] s : src) fs.add(ex.submit(() -> {
            String origin = "origin".equals(s[0]) ? originOf(s[1]) : originOf(new JSONObject(Updater.get(s[1], TIMEOUT_MS)).optString("url", ""));
            return origin != null && alive(origin) ? origin : null;
        }));
        String found = "";
        long deadline = System.currentTimeMillis() + 9000;
        for (Future<String> f : fs) { // priority order; parallel execution
            try {
                String r = f.get(Math.max(1, deadline - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
                if (r != null) { found = r; break; }
            } catch (Exception ignored) {}
        }
        ex.shutdownNow();
        if (!found.isEmpty()) p.edit().putString("discovered_server", found).putLong("discovered_at_ms", System.currentTimeMillis()).apply();
        return found;
    }

    static String originOf(String url) {
        try {
            if (url == null || !VersionUtil.isHttpsUrl(url.trim())) return null;
            java.net.URL u = new java.net.URL(url.trim());
            return "https://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
        } catch (Exception e) { return null; }
    }

    static boolean alive(String origin) {
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL(origin + "/healthz").openConnection();
            h.setConnectTimeout(TIMEOUT_MS); h.setReadTimeout(TIMEOUT_MS); h.setRequestProperty("User-Agent", "PURE-Android");
            int code = h.getResponseCode(); h.disconnect();
            return code == 200;
        } catch (Exception e) { return false; }
    }

    public static String cached(Context c) { return Updater.prefs(c).getString("discovered_server", ""); }
}
