package app.pure.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.BatteryManager;
import android.os.Build;
import android.os.IBinder;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.*;
import java.util.concurrent.*;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * PURE helper mode (opt-in). While allowed (default: charging + unmetered Wi-Fi + battery >= 30%) the phone:
 *  1. caches the latest discovery info (server.json origin + signed cluster heartbeat if the server exposes it),
 *  2. holds sealed E2E relay envelopes (opaque ciphertext + sender MAC, see server/v09/relay.js) encrypted at rest
 *     with an Android Keystore AES-GCM key, and forwards them to /api/relay/deliver when the server is reachable,
 *  3. on the local Wi-Fi, advertises _purehelper._tcp (NSD) so other PURE phones can hand off envelopes / read
 *     discovery hints, and hands its own queue to a LAN peer that is online when it is not.
 * It never becomes a server and never holds plaintext. Stops itself as soon as limits are not met.
 */
public class HelperService extends Service {
    static final String TAG = "PureHelper", CH = "pure_helper", NSD_TYPE = "_purehelper._tcp.";
    static final int MAX_ITEMS = 200, MAX_BYTES = 1_000_000, NOTIF_ID = 4242;
    static final long TTL_MS = 7L * 86400000L, TICK_S = 60;

    private ScheduledExecutorService exec;
    private ServerSocket lan;
    private NsdManager nsd;
    private NsdManager.RegistrationListener reg;
    private NsdManager.DiscoveryListener disc;
    private final Map<String, String> peers = new ConcurrentHashMap<>();
    static volatile String lastState = "off";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pure_helper", MODE_PRIVATE); }

    public static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("enabled", on).apply();
        Intent i = new Intent(c, HelperService.class);
        if (on) { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); }
        else c.stopService(i);
    }

    /** Pure function of the limits, also used by the settings UI. */
    public static String blockReason(Context c) {
        SharedPreferences p = prefs(c);
        Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int level = b == null ? -1 : b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) * 100 / Math.max(1, b.getIntExtra(BatteryManager.EXTRA_SCALE, 100));
        boolean charging = b != null && b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
        if (p.getBoolean("chargingOnly", true) && !charging) return "not_charging";
        if (level >= 0 && level < p.getInt("minBattery", 30)) return "battery_low";
        if (p.getBoolean("wifiOnly", true) && !onUnmetered(c)) return "not_wifi";
        return null;
    }
    static boolean onUnmetered(Context c) {
        ConnectivityManager cm = (ConnectivityManager) c.getSystemService(CONNECTIVITY_SERVICE);
        NetworkCapabilities nc = cm == null ? null : cm.getNetworkCapabilities(cm.getActiveNetwork());
        return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CH, "PURE helper", NotificationManager.IMPORTANCE_MIN));
        Notification n = notif("PURE helper กำลังช่วยเครือข่าย (กดเพื่อตั้งค่า)");
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); else startForeground(NOTIF_ID, n);
        if (!prefs(this).getBoolean("enabled", false)) { stopSelf(); return START_NOT_STICKY; }
        if (exec == null) {
            exec = Executors.newSingleThreadScheduledExecutor();
            exec.scheduleWithFixedDelay(this::tickSafe, 0, TICK_S, TimeUnit.SECONDS);
        }
        return START_STICKY;
    }

    private Notification notif(String text) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 7, open, PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("PURE helper").setContentText(text).setColor(0xFF00E676).setOngoing(true).setContentIntent(pi).build();
    }

    private void tickSafe() { try { tick(); } catch (Throwable t) { Log.w(TAG, "tick", t); } }

    private void tick() {
        String why = blockReason(this);
        if (why != null) { lastState = "paused:" + why; Log.i(TAG, "stopping: " + why); prefs(this).edit().putString("last", lastState).apply(); stopLan(); stopSelf(); return; }
        startLan();
        String origin = origin();
        boolean online = false;
        if (!origin.isEmpty()) {
            try { String hb = Updater.get(origin + "/cluster/heartbeat", 6000); prefs(this).edit().putString("heartbeat", hb).apply(); } catch (Exception ignored) {}
            online = forward(origin);
        }
        if (!online) handoffToPeer();
        lastState = online ? "active" : "waiting_server";
        prefs(this).edit().putString("last", lastState).putLong("lastTick", System.currentTimeMillis()).apply();
    }

    String origin() {
        String o = Updater.prefs(this).getString("helper_origin", "");
        if (o.isEmpty()) o = ServerDiscovery.cached(this);
        return o == null ? "" : o.replaceAll("/+$", "");
    }

    // ---------- encrypted queue ----------
    private static final Object LOCK = new Object();
    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias("pure_helper")) return ((KeyStore.SecretKeyEntry) ks.getEntry("pure_helper", null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder("pure_helper", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return g.generateKey();
    }
    static File qfile(Context c) { File d = new File(c.getFilesDir(), "helper"); d.mkdirs(); return new File(d, "queue.bin"); }
    static JSONArray load(Context c) {
        synchronized (LOCK) {
            File f = qfile(c); if (!f.exists()) return new JSONArray();
            try (DataInputStream in = new DataInputStream(new FileInputStream(f))) {
                byte[] iv = new byte[12]; in.readFully(iv); byte[] ct = new byte[(int) f.length() - 12]; in.readFully(ct);
                Cipher ci = Cipher.getInstance("AES/GCM/NoPadding"); ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
                return new JSONArray(new String(ci.doFinal(ct), StandardCharsets.UTF_8));
            } catch (Exception e) { Log.w(TAG, "queue unreadable, resetting", e); f.delete(); return new JSONArray(); }
        }
    }
    static void save(Context c, JSONArray a) throws Exception {
        synchronized (LOCK) {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding"); ci.init(Cipher.ENCRYPT_MODE, key());
            byte[] ct = ci.doFinal(a.toString().getBytes(StandardCharsets.UTF_8));
            File tmp = new File(qfile(c).getPath() + ".tmp");
            try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(ci.getIV()); o.write(ct); }
            if (!tmp.renameTo(qfile(c))) throw new IOException("rename");
        }
    }
    /** Shape-checks an envelope (the server verifies the MAC). */
    static boolean validEnvelope(JSONObject e) {
        String t = e.optString("text", "");
        return e.optString("from").length() > 0 && e.optString("from").length() <= 80 && e.optString("to").length() > 0 && e.optString("to").length() <= 80
            && e.optString("clientId").length() > 0 && e.optString("clientId").length() <= 80 && e.optString("mac").length() >= 40 && e.optString("mac").length() <= 64
            && t.startsWith("e2e1:") && t.length() < 61000 && e.optLong("ts", 0) > System.currentTimeMillis() - TTL_MS;
    }
    /** Adds envelopes (dedup by from+clientId, TTL + size caps). Returns number accepted. */
    static int enqueue(Context c, JSONArray incoming) throws Exception {
        synchronized (LOCK) {
            JSONArray q = load(c), out = new JSONArray(); Set<String> seen = new HashSet<>(); long now = System.currentTimeMillis();
            for (int i = 0; i < q.length(); i++) { JSONObject e = q.getJSONObject(i); if (e.optLong("ts") > now - TTL_MS && seen.add(e.optString("from") + "|" + e.optString("clientId"))) out.put(e); }
            int ok = 0;
            for (int i = 0; i < incoming.length(); i++) {
                JSONObject e = incoming.optJSONObject(i); if (e == null || !validEnvelope(e)) continue;
                JSONObject clean = new JSONObject(); for (String k : new String[]{"from", "to", "clientId", "text", "mac"}) clean.put(k, e.getString(k)); clean.put("ts", e.getLong("ts"));
                if (!seen.add(clean.getString("from") + "|" + clean.getString("clientId"))) continue;
                if (out.length() >= MAX_ITEMS || out.toString().length() + clean.toString().length() > MAX_BYTES) break;
                out.put(clean); ok++;
            }
            save(c, out); return ok;
        }
    }
    static int size(Context c) { return load(c).length(); }

    /** Forwards queued envelopes; returns true if the server answered. */
    private boolean forward(String origin) {
        try {
            JSONArray q = load(this);
            if (q.length() == 0) { Updater.get(origin + "/api/health", 6000); return true; }
            Set<String> done = new HashSet<>();
            for (int i = 0; i < q.length(); i += 50) {
                JSONArray batch = new JSONArray(); for (int j = i; j < Math.min(q.length(), i + 50); j++) batch.put(q.get(j));
                JSONObject r = new JSONObject(post(origin + "/api/relay/deliver", new JSONObject().put("envelopes", batch).toString()));
                JSONArray res = r.getJSONArray("results");
                for (int j = 0; j < res.length(); j++) done.add(batch.getJSONObject(j).optString("from") + "|" + res.getJSONObject(j).optString("clientId")); // every status is final
            }
            synchronized (LOCK) {
                JSONArray cur = load(this), keep = new JSONArray();
                for (int i = 0; i < cur.length(); i++) { JSONObject e = cur.getJSONObject(i); if (!done.contains(e.optString("from") + "|" + e.optString("clientId"))) keep.put(e); }
                save(this, keep);
            }
            Log.i(TAG, "forwarded " + done.size());
            return true;
        } catch (Exception e) { Log.i(TAG, "server unreachable: " + e.getMessage()); return false; }
    }
    static String post(String url, String body) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(8000); h.setReadTimeout(15000); h.setRequestMethod("POST"); h.setDoOutput(true);
        h.setRequestProperty("Content-Type", "application/json");
        try (OutputStream o = h.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        if (h.getResponseCode() / 100 != 2) throw new IOException("HTTP " + h.getResponseCode());
        try (InputStream in = h.getInputStream()) { return new String(readAll(in, 2_000_000), StandardCharsets.UTF_8); }
    }
    static byte[] readAll(InputStream in, int max) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) { b.write(buf, 0, n); if (b.size() > max) throw new IOException("too large"); }
        return b.toByteArray();
    }

    // ---------- LAN gossip ----------
    private void startLan() {
        if (lan != null) return;
        try {
            lan = new ServerSocket(0);
            Thread t = new Thread(this::serveLan, "pure-helper-lan"); t.setDaemon(true); t.start();
            nsd = (NsdManager) getSystemService(NSD_SERVICE);
            NsdServiceInfo si = new NsdServiceInfo(); si.setServiceName("PURE-" + Integer.toHexString(new Random().nextInt(0xffff))); si.setServiceType(NSD_TYPE); si.setPort(lan.getLocalPort());
            reg = new NsdManager.RegistrationListener() {
                public void onRegistrationFailed(NsdServiceInfo s, int e) { Log.w(TAG, "nsd reg " + e); }
                public void onUnregistrationFailed(NsdServiceInfo s, int e) {}
                public void onServiceRegistered(NsdServiceInfo s) { prefs(HelperService.this).edit().putString("selfName", s.getServiceName()).apply(); }
                public void onServiceUnregistered(NsdServiceInfo s) {}
            };
            nsd.registerService(si, NsdManager.PROTOCOL_DNS_SD, reg);
            disc = new NsdManager.DiscoveryListener() {
                public void onStartDiscoveryFailed(String t, int e) {}
                public void onStopDiscoveryFailed(String t, int e) {}
                public void onDiscoveryStarted(String t) {}
                public void onDiscoveryStopped(String t) {}
                public void onServiceLost(NsdServiceInfo s) { peers.remove(s.getServiceName()); }
                public void onServiceFound(NsdServiceInfo s) {
                    if (s.getServiceName().equals(prefs(HelperService.this).getString("selfName", ""))) return;
                    nsd.resolveService(s, new NsdManager.ResolveListener() {
                        public void onResolveFailed(NsdServiceInfo x, int e) {}
                        public void onServiceResolved(NsdServiceInfo x) {
                            InetAddress a = x.getHost();
                            if (a != null && (a.isSiteLocalAddress() || a.isLinkLocalAddress())) peers.put(x.getServiceName(), "http://" + a.getHostAddress() + ":" + x.getPort());
                        }
                    });
                }
            };
            nsd.discoverServices(NSD_TYPE, NsdManager.PROTOCOL_DNS_SD, disc);
        } catch (Exception e) { Log.w(TAG, "lan", e); stopLan(); }
    }
    private void stopLan() {
        try { if (nsd != null && reg != null) nsd.unregisterService(reg); } catch (Exception ignored) {}
        try { if (nsd != null && disc != null) nsd.stopServiceDiscovery(disc); } catch (Exception ignored) {}
        try { if (lan != null) lan.close(); } catch (Exception ignored) {}
        lan = null; reg = null; disc = null; peers.clear();
    }
    private void serveLan() {
        ServerSocket s = lan;
        while (s != null && !s.isClosed()) {
            try (Socket c = s.accept()) {
                c.setSoTimeout(5000);
                InetAddress a = c.getInetAddress();
                if (!(a.isSiteLocalAddress() || a.isLinkLocalAddress() || a.isLoopbackAddress())) continue;
                BufferedInputStream in = new BufferedInputStream(c.getInputStream());
                String line = readLine(in); int len = 0; String h;
                while (!(h = readLine(in)).isEmpty()) if (h.toLowerCase(Locale.ROOT).startsWith("content-length:")) len = Integer.parseInt(h.substring(15).trim());
                String out; int code = 200;
                if (line.startsWith("GET /discovery ")) {
                    out = new JSONObject().put("kind", "pure-helper").put("origin", origin()).put("online", "active".equals(lastState))
                        .put("heartbeat", prefs(this).getString("heartbeat", "")).toString();
                } else if (line.startsWith("POST /envelopes ") && len > 0 && len <= 256_000) {
                    byte[] body = new byte[len]; int r = 0; while (r < len) { int n = in.read(body, r, len - r); if (n < 0) break; r += n; }
                    int ok = enqueue(this, new JSONObject(new String(body, StandardCharsets.UTF_8)).getJSONArray("envelopes"));
                    out = new JSONObject().put("accepted", ok).toString();
                } else { code = 404; out = "{\"error\":\"not found\"}"; }
                byte[] b = out.getBytes(StandardCharsets.UTF_8);
                OutputStream o = c.getOutputStream();
                o.write(("HTTP/1.1 " + code + " OK\r\nContent-Type: application/json\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII)); o.write(b); o.flush();
            } catch (Exception e) { if (s.isClosed()) return; }
        }
    }
    private static String readLine(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder(); int ch;
        while ((ch = in.read()) >= 0 && ch != '\n') { if (ch != '\r') sb.append((char) ch); if (sb.length() > 4096) throw new IOException("line"); }
        return sb.toString();
    }
    private void handoffToPeer() {
        JSONArray q = load(this); if (q.length() == 0) return;
        for (String base : peers.values()) {
            try {
                JSONObject d = new JSONObject(Updater.get(base + "/discovery", 4000));
                if (!d.optBoolean("online")) continue;
                JSONObject r = new JSONObject(post(base + "/envelopes", new JSONObject().put("envelopes", q).toString()));
                if (r.optInt("accepted", -1) >= 0) { synchronized (LOCK) { save(this, new JSONArray()); } Log.i(TAG, "handed " + q.length() + " to " + base); return; }
            } catch (Exception ignored) {}
        }
    }

    @Override public void onDestroy() {
        stopLan();
        if (exec != null) exec.shutdownNow(); exec = null;
        if (!"off".equals(lastState) && !lastState.startsWith("paused")) lastState = "off";
        super.onDestroy();
    }
}
