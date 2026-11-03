package app.pure.chat;

import android.app.*;
import android.content.*;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.*;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;

/** In-app update: manifest check (version.json → GitHub Releases fallback), notification, DownloadManager download, sha256 verify, install. */
public final class Updater {
    public static final String DEFAULT_MANIFEST = "https://call.purefxai.store/version.json";
    public static final String DEFAULT_GITHUB = "https://api.github.com/repos/purefxaidev/purecall-web/releases/latest";
    public static final String CHANNEL = "updates";

    public static final class Manifest {
        public int versionCode, minSupported; public String versionName, apkUrl, sha256, changelogTh, changelogEn;
    }

    private Updater() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pure", Context.MODE_PRIVATE); }

    public static int currentCode(Context c) {
        try { PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0); return Build.VERSION.SDK_INT >= 28 ? (int) p.getLongVersionCode() : p.versionCode; }
        catch (Exception e) { return 0; }
    }

    static String get(String url, int timeoutMs) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(timeoutMs); h.setReadTimeout(timeoutMs);
        h.setRequestProperty("Accept", "application/json"); h.setRequestProperty("User-Agent", "PURE-Android");
        try {
            if (h.getResponseCode() != 200) throw new IOException("HTTP " + h.getResponseCode());
            try (InputStream in = h.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] b = new byte[8192]; int n, total = 0;
                while ((n = in.read(b)) > 0) { total += n; if (total > 512 * 1024) throw new IOException("too large"); out.write(b, 0, n); }
                return out.toString("UTF-8");
            }
        } finally { h.disconnect(); }
    }

    public static Manifest parse(String json) throws JSONException {
        JSONObject o = new JSONObject(json);
        Manifest m = new Manifest();
        m.versionCode = o.getInt("versionCode"); m.versionName = o.getString("versionName");
        m.apkUrl = o.getString("apkUrl"); m.sha256 = o.getString("sha256").toLowerCase();
        m.minSupported = o.optInt("minSupportedVersionCode", 0);
        Object cl = o.opt("changelog");
        if (cl instanceof JSONObject) { m.changelogTh = ((JSONObject) cl).optString("th", ""); m.changelogEn = ((JSONObject) cl).optString("en", m.changelogTh); }
        else { m.changelogTh = m.changelogEn = cl == null ? "" : String.valueOf(cl); }
        if (!VersionUtil.isHttpsUrl(m.apkUrl) || !VersionUtil.isSha256Hex(m.sha256) || m.minSupported > m.versionCode) throw new JSONException("invalid manifest");
        return m;
    }

    static Manifest fromGithub(String json) throws Exception {
        JSONObject r = new JSONObject(json);
        if (r.optBoolean("draft") || r.optBoolean("prerelease")) throw new JSONException("no release");
        String body = r.optString("body", ""), apk = null, shaAsset = null;
        JSONArray a = r.optJSONArray("assets");
        for (int i = 0; a != null && i < a.length(); i++) {
            String name = a.getJSONObject(i).optString("name"), url = a.getJSONObject(i).optString("browser_download_url");
            if (name.endsWith(".apk")) apk = url; else if (name.endsWith(".sha256")) shaAsset = url;
        }
        String sha = field(body, "sha256");
        if (shaAsset != null) { java.util.regex.Matcher mm = java.util.regex.Pattern.compile("[0-9a-fA-F]{64}").matcher(get(shaAsset, 10000)); if (mm.find()) sha = mm.group(); }
        JSONObject o = new JSONObject();
        o.put("versionCode", Integer.parseInt(field(body, "versionCode")));
        o.put("versionName", r.optString("tag_name").replaceFirst("^[vV]", ""));
        o.put("apkUrl", apk); o.put("sha256", sha);
        String min = field(body, "minSupportedVersionCode"); o.put("minSupportedVersionCode", min == null ? 0 : Integer.parseInt(min));
        o.put("changelog", body.replaceAll("(?im)^\\s*(sha256|versionCode|minSupportedVersionCode)\\s*[:=].*$", "").trim());
        return parse(o.toString());
    }

    private static String field(String body, String k) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?im)^\\s*" + k + "\\s*[:=]\\s*(\\S+)").matcher(body);
        return m.find() ? m.group(1) : null;
    }

    /** Blocking. Primary manifest URL (server-configurable via /api/app-config, cached), then GitHub Releases. */
    public static Manifest fetch(Context c) {
        String url = prefs(c).getString("update_manifest_url", DEFAULT_MANIFEST);
        try { return parse(get(url, 10000)); } catch (Exception ignored) {}
        try { return fromGithub(get(prefs(c).getString("update_github_api", DEFAULT_GITHUB), 10000)); } catch (Exception ignored) {}
        return null;
    }

    public static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "PURE Updates", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("New PURE versions");
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }

    /** Notify once per versionCode. */
    public static void notifyUpdate(Context c, Manifest m) {
        if (prefs(c).getInt("notified_update", 0) >= m.versionCode) return;
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("showUpdate", true);
        PendingIntent pi = PendingIntent.getActivity(c, 7101, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle("PURE " + m.versionName + " พร้อมอัปเดต")
         .setContentText(m.changelogTh == null || m.changelogTh.isEmpty() ? "แตะเพื่ออัปเดต" : m.changelogTh)
         .setStyle(new Notification.BigTextStyle().bigText(m.changelogTh)).setAutoCancel(true).setContentIntent(pi).setColor(0xFF00E676);
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(7101, b.build());
        prefs(c).edit().putInt("notified_update", m.versionCode).apply();
    }

    public interface Progress { void onProgress(int percent); void onDone(File apk); void onError(String msg); }

    /** Download via DownloadManager into app-specific storage, report progress, verify sha256. Call from a background thread. */
    public static void download(Context c, Manifest m, Progress p) {
        try {
            File dir = new File(c.getExternalFilesDir(null), "updates"); dir.mkdirs();
            for (File old : dir.listFiles() == null ? new File[0] : dir.listFiles()) old.delete();
            File dest = new File(dir, "PURE-" + m.versionName + ".apk");
            DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request rq = new DownloadManager.Request(Uri.parse(m.apkUrl))
                .setTitle("PURE " + m.versionName).setDescription("กำลังดาวน์โหลดอัปเดต")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationUri(Uri.fromFile(dest)).setMimeType("application/vnd.android.package-archive");
            long id = dm.enqueue(rq);
            while (true) {
                Thread.sleep(400);
                try (Cursor q = dm.query(new DownloadManager.Query().setFilterById(id))) {
                    if (q == null || !q.moveToFirst()) { p.onError("ยกเลิกการดาวน์โหลด"); return; }
                    int st = q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long done = q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    if (total > 0) p.onProgress((int) (done * 100 / total));
                    if (st == DownloadManager.STATUS_FAILED) { p.onError("ดาวน์โหลดไม่สำเร็จ"); return; }
                    if (st == DownloadManager.STATUS_SUCCESSFUL) break;
                }
            }
            String got = sha256(dest);
            if (!got.equalsIgnoreCase(m.sha256)) { dest.delete(); p.onError("ไฟล์ไม่ตรง sha256 — ยกเลิกเพื่อความปลอดภัย"); return; }
            p.onDone(dest);
        } catch (Exception e) { p.onError("อัปเดตผิดพลาด: " + e.getMessage()); }
    }

    public static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) { byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) md.update(b, 0, n); }
        StringBuilder sb = new StringBuilder(); for (byte x : md.digest()) sb.append(String.format("%02x", x)); return sb.toString();
    }

    /** Returns false if the user must first allow "install unknown apps" (settings screen opened). */
    public static boolean install(Activity a, File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            a.startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            return false;
        }
        Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".updates", apk);
        Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        a.startActivity(i);
        return true;
    }
}
