package app.pure.chat;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * On-device language model (llama.cpp + Qwen2.5 Instruct GGUF Q4_K_M).
 * The model is never bundled: it is downloaded on explicit opt-in (resumable, sha256 verified) into app files.
 * Exposed to the WebView as window.PureLocalAI; results are delivered as 'pure-local-ai' CustomEvents.
 */
public final class LocalAi {
    public static final class Model {
        final String id, name, file, url, sha256, license; final long size; final double minRamGb;
        Model(String id, String name, String file, String url, String sha256, long size, double minRamGb, String license) {
            this.id = id; this.name = name; this.file = file; this.url = url; this.sha256 = sha256; this.size = size; this.minRamGb = minRamGb; this.license = license;
        }
    }
    static final Model[] MODELS = {
        new Model("qwen2.5-1.5b", "Qwen2.5 1.5B Instruct (Q4_K_M)", "qwen2.5-1.5b-instruct-q4_k_m.gguf",
            "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
            "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e", 1117320736L, 3.6, "Apache-2.0"),
        new Model("qwen2.5-0.5b", "Qwen2.5 0.5B Instruct (Q4_K_M, lite)", "qwen2.5-0.5b-instruct-q4_k_m.gguf",
            "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
            "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db", 491400032L, 2.5, "Apache-2.0"),
    };

    private final Activity act; private final WebView web;
    private final ExecutorService infer = Executors.newSingleThreadExecutor();
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile long handle; private volatile String loadedId;
    private volatile boolean downloading, cancelDl; private volatile long dlDone, dlTotal; private volatile String dlError, dlId;

    public LocalAi(Activity act, WebView web) { this.act = act; this.web = web; }

    File dir() { File d = new File(act.getFilesDir(), "models"); d.mkdirs(); return d; }
    static Model find(String id) { for (Model m : MODELS) if (m.id.equals(id)) return m; return MODELS[0]; }
    double ramGb() { ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo(); ((ActivityManager) act.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(mi); return mi.totalMem / 1073741824.0; }
    boolean unmetered() {
        ConnectivityManager cm = (ConnectivityManager) act.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities c = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
    }
    String selected() { return act.getSharedPreferences("pure_local_ai", 0).getString("model", MODELS[0].id); }

    private void emit(JSONObject o) {
        final String js = "window.dispatchEvent(new CustomEvent('pure-local-ai',{detail:" + o + "}));";
        ui.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignored) { } });
    }
    private static JSONObject obj(Object... kv) { JSONObject o = new JSONObject(); try { for (int i = 0; i < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception ignored) { } return o; }

    @JavascriptInterface public String status() {
        try {
            JSONArray models = new JSONArray();
            for (Model m : MODELS) models.put(obj("id", m.id, "name", m.name, "size", m.size, "minRamGb", m.minRamGb, "license", m.license, "downloaded", new File(dir(), m.file).isFile()));
            Model m = find(selected()); double ram = ramGb(); boolean have = new File(dir(), m.file).isFile();
            return obj("engine", LocalLlm.available(), "engineError", LocalLlm.loadError() == null ? JSONObject.NULL : LocalLlm.loadError(),
                "model", m.id, "downloaded", have, "ramGb", Math.round(ram * 10) / 10.0, "eligible", LocalLlm.available() && ram >= m.minRamGb,
                "ready", LocalLlm.available() && have && ram >= m.minRamGb, "loaded", loadedId != null,
                "downloading", downloading, "done", dlDone, "total", dlTotal, "error", dlError == null ? JSONObject.NULL : dlError,
                "wifi", unmetered(), "models", models).toString();
        } catch (Exception e) { return "{\"engine\":false}"; }
    }

    @JavascriptInterface public void select(String id) { act.getSharedPreferences("pure_local_ai", 0).edit().putString("model", find(id).id).apply(); }

    /** Asks the user natively (cannot be triggered silently by page script), warns on mobile data. */
    @JavascriptInterface public void download(String id) {
        final Model m = find(id == null || id.isEmpty() ? selected() : id);
        ui.post(() -> {
            String msg = "ดาวน์โหลดโมเดลภาษา " + m.name + " ขนาด " + Math.round(m.size / 1048576.0) + " MB เก็บไว้ในเครื่อง (ไม่ส่งข้อความออกไปไหน)\nสัญญาอนุญาต: " + m.license
                + (unmetered() ? "" : "\n\n⚠️ ตอนนี้ไม่ได้ใช้ Wi‑Fi อาจเสียค่าเน็ตมือถือ แนะนำให้ต่อ Wi‑Fi ก่อน");
            new AlertDialog.Builder(act).setTitle("โมเดล AI ในเครื่อง").setMessage(msg)
                .setPositiveButton("ดาวน์โหลด", (d, w) -> { select(m.id); startDownload(m); })
                .setNegativeButton("ยกเลิก", null).show();
        });
    }
    @JavascriptInterface public void cancelDownload() { cancelDl = true; }

    @JavascriptInterface public void deleteModel(String id) {
        final Model m = find(id == null || id.isEmpty() ? selected() : id);
        infer.execute(() -> {
            if (m.id.equals(loadedId)) { LocalLlm.nativeFree(handle); handle = 0; loadedId = null; }
            new File(dir(), m.file).delete(); new File(dir(), m.file + ".part").delete();
            emit(obj("type", "deleted", "model", m.id));
        });
    }

    private void startDownload(Model m) {
        if (downloading) return;
        downloading = true; cancelDl = false; dlError = null; dlId = m.id; dlTotal = m.size;
        io.execute(() -> {
            File part = new File(dir(), m.file + ".part"), out = new File(dir(), m.file);
            try {
                if (dir().getUsableSpace() < m.size - part.length() + 200L * 1048576) throw new Exception("พื้นที่ในเครื่องไม่พอ");
                long have = part.length(); dlDone = have;
                HttpURLConnection c = (HttpURLConnection) new URL(m.url).openConnection();
                c.setInstanceFollowRedirects(true); c.setConnectTimeout(20000); c.setReadTimeout(30000);
                if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
                int code = c.getResponseCode();
                if (code == 200 && have > 0) { have = 0; dlDone = 0; } // server ignored Range: restart
                else if (code != 200 && code != 206) throw new Exception("HTTP " + code);
                long lastEmit = 0;
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(part, have > 0)) {
                    byte[] b = new byte[1 << 16]; int r;
                    while ((r = in.read(b)) > 0) {
                        if (cancelDl) throw new Exception("cancelled");
                        fo.write(b, 0, r); dlDone += r;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 700) { lastEmit = now; emit(obj("type", "progress", "model", m.id, "done", dlDone, "total", dlTotal)); }
                    }
                }
                emit(obj("type", "verifying", "model", m.id));
                if (!sha256(part).equalsIgnoreCase(m.sha256)) { part.delete(); throw new Exception("ไฟล์เสีย (sha256 ไม่ตรง) ลองดาวน์โหลดใหม่"); }
                if (!part.renameTo(out)) throw new Exception("บันทึกไฟล์ไม่ได้");
                emit(obj("type", "downloaded", "model", m.id));
            } catch (Exception e) {
                dlError = "cancelled".equals(e.getMessage()) ? null : String.valueOf(e.getMessage());
                emit(obj("type", cancelDl ? "cancelled" : "error", "model", m.id, "error", dlError == null ? "" : dlError));
            } finally { downloading = false; }
        });
    }

    static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) { byte[] b = new byte[1 << 16]; int r; while ((r = in.read(b)) > 0) md.update(b, 0, r); }
        StringBuilder sb = new StringBuilder(); for (byte x : md.digest()) sb.append(String.format("%02x", x)); return sb.toString();
    }

    /** req JSON: {messages:[{role,content}], maxTokens, temperature}. Streams 'token' events then 'done' | 'error'. */
    @JavascriptInterface public void generate(final String reqId, final String reqJson) {
        infer.execute(() -> {
            try {
                Model m = find(selected()); File f = new File(dir(), m.file);
                if (!LocalLlm.available() || !f.isFile()) throw new Exception("local model not available");
                if (ramGb() < m.minRamGb) throw new Exception("not enough RAM");
                if (!m.id.equals(loadedId)) {
                    if (handle != 0) LocalLlm.nativeFree(handle);
                    emit(obj("type", "loading", "id", reqId));
                    int threads = Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors() - 2));
                    handle = LocalLlm.nativeLoad(f.getAbsolutePath(), 2048, threads);
                    if (handle == 0) { loadedId = null; throw new Exception("load failed"); }
                    loadedId = m.id;
                }
                JSONObject req = new JSONObject(reqJson); JSONArray msgs = req.getJSONArray("messages");
                byte[][] roles = new byte[msgs.length()][], contents = new byte[msgs.length()][];
                for (int i = 0; i < msgs.length(); i++) {
                    JSONObject x = msgs.getJSONObject(i); String role = x.optString("role", "user");
                    if (!role.equals("system") && !role.equals("assistant")) role = "user";
                    roles[i] = role.getBytes(StandardCharsets.UTF_8); contents[i] = x.optString("content", "").getBytes(StandardCharsets.UTF_8);
                }
                final StringBuilder full = new StringBuilder();
                String err = LocalLlm.nativeGenerate(handle, roles, contents, Math.min(1024, req.optInt("maxTokens", 384)), (float) req.optDouble("temperature", 0.6), utf8 -> {
                    String t = new String(utf8, StandardCharsets.UTF_8); full.append(t); emit(obj("type", "token", "id", reqId, "text", t)); return true;
                });
                if (err != null) throw new Exception(err);
                emit(obj("type", "done", "id", reqId, "text", full.toString(), "model", m.id));
            } catch (Exception e) { emit(obj("type", "error", "id", reqId, "error", String.valueOf(e.getMessage()))); }
        });
    }
    @JavascriptInterface public void stop() { long h = handle; if (h != 0) LocalLlm.nativeStop(h); }

    /** Free the model when the system is low on memory; it reloads lazily. */
    public void trim() { infer.execute(() -> { if (handle != 0) { LocalLlm.nativeFree(handle); handle = 0; loadedId = null; } }); }

    /** Debug-only self test: adb shell am start -n app.pure.chat/.MainActivity --es pure_llm_selftest "prompt" ; output goes to logcat tag PureLLM. */
    public void selfTest(final String prompt) {
        infer.execute(() -> {
            try {
                Model m = find(selected()); File f = new File(dir(), m.file);
                if (!f.isFile()) for (Model x : MODELS) if (new File(dir(), x.file).isFile()) { m = x; f = new File(dir(), x.file); }
                long t0 = System.currentTimeMillis();
                long h = LocalLlm.nativeLoad(f.getAbsolutePath(), 2048, Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors() - 1)));
                android.util.Log.i("PureLLM", "selftest load " + m.id + " handle=" + (h != 0) + " in " + (System.currentTimeMillis() - t0) + "ms ram=" + ramGb());
                if (h == 0) return;
                final StringBuilder out = new StringBuilder(); final int[] n = {0}; long t1 = System.currentTimeMillis();
                String err = LocalLlm.nativeGenerate(h, new byte[][]{"system".getBytes(StandardCharsets.UTF_8), "user".getBytes(StandardCharsets.UTF_8)},
                    new byte[][]{"คุณคือผู้ช่วย PURE AI ตอบภาษาไทยสั้นๆ".getBytes(StandardCharsets.UTF_8), prompt.getBytes(StandardCharsets.UTF_8)}, 96, 0f,
                    b -> { out.append(new String(b, StandardCharsets.UTF_8)); n[0]++; return true; });
                long ms = System.currentTimeMillis() - t1;
                android.util.Log.i("PureLLM", "selftest err=" + err + " chunks=" + n[0] + " ms=" + ms + " sha_ok=" + sha256(f).equals(m.sha256) + " OUT=" + out);
                LocalLlm.nativeFree(h);
            } catch (Throwable e) { android.util.Log.e("PureLLM", "selftest failed", e); }
        });
    }
}
