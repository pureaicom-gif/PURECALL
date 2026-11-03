package app.pure.chat;

import android.content.Context;
import org.json.JSONObject;

/** Reads https://call.purefxai.store/server.json ({"url","updatedAt"}) and caches the last good https origin. */
public final class ServerDiscovery {
    public static final String DEFAULT_URL = "https://call.purefxai.store/server.json";
    private ServerDiscovery() {}

    /** Blocking; returns the discovered origin or the cached last-good one (may be ""). */
    public static String refresh(Context c) {
        android.content.SharedPreferences p = Updater.prefs(c);
        try {
            JSONObject o = new JSONObject(Updater.get(p.getString("server_json_url", DEFAULT_URL), 8000));
            String url = o.optString("url", "").trim();
            if (VersionUtil.isHttpsUrl(url)) {
                java.net.URL u = new java.net.URL(url);
                String origin = "https://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
                p.edit().putString("discovered_server", origin).putString("discovered_at", o.optString("updatedAt", "")).apply();
                return origin;
            }
        } catch (Exception ignored) {}
        return p.getString("discovered_server", "");
    }

    public static String cached(Context c) { return Updater.prefs(c).getString("discovered_server", ""); }
}
