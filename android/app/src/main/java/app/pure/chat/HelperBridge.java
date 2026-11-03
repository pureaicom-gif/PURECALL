package app.pure.chat;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONObject;

/** window.PureHelper — settings + local hand-off for helper mode. */
public class HelperBridge {
    private final Activity a;
    HelperBridge(Activity a) { this.a = a; }
    void setOrigin(String origin) { Updater.prefs(a).edit().putString("helper_origin", origin).apply(); }

    @JavascriptInterface public String status() {
        try {
            android.content.SharedPreferences p = HelperService.prefs(a);
            return new JSONObject().put("enabled", p.getBoolean("enabled", false)).put("state", p.getString("last", HelperService.lastState))
                .put("blocked", String.valueOf(HelperService.blockReason(a))).put("queued", HelperService.size(a))
                .put("chargingOnly", p.getBoolean("chargingOnly", true)).put("wifiOnly", p.getBoolean("wifiOnly", true)).put("minBattery", p.getInt("minBattery", 30)).toString();
        } catch (Exception e) { return "{\"error\":\"" + e.getClass().getSimpleName() + "\"}"; }
    }
    @JavascriptInterface public String setEnabled(boolean on) {
        if (on) {
            String why = HelperService.blockReason(a);
            HelperService.prefs(a).edit().putBoolean("enabled", true).apply();
            if (why != null) return why; // will be started when allowed (next app open / toggle)
        }
        a.runOnUiThread(() -> HelperService.setEnabled(a, on));
        return "ok";
    }
    @JavascriptInterface public void setOptions(String json) {
        try {
            JSONObject o = new JSONObject(json);
            HelperService.prefs(a).edit().putBoolean("chargingOnly", o.optBoolean("chargingOnly", true)).putBoolean("wifiOnly", o.optBoolean("wifiOnly", true))
                .putInt("minBattery", Math.max(15, Math.min(90, o.optInt("minBattery", 30)))).apply();
        } catch (Exception ignored) {}
    }
    /** Queue sealed envelopes on this phone (used when the app itself can't reach the server). */
    @JavascriptInterface public int enqueue(String json) {
        try { int n = HelperService.enqueue(a, new JSONArray(json)); maybeStart(); return n; } catch (Exception e) { return -1; }
    }
    void maybeStart() { if (HelperService.prefs(a).getBoolean("enabled", false) && HelperService.blockReason(a) == null) a.runOnUiThread(() -> HelperService.setEnabled(a, true)); }
}
