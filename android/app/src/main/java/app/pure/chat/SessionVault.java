package app.pure.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.CookieManager;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * 0.9.2 remembered login. The server issues a revocable 90-day session (pure_session, httpOnly).
 * Quick-tunnel origins change on every server restart, and WebView cookies are per origin, so the
 * session token is kept encrypted with an Android Keystore AES-GCM key and re-attached to whichever
 * origin discovery finds. The password is never stored. Logout / a 401 on /api/me clears it.
 */
public final class SessionVault {
    private static final String ALIAS = "pure_session_key", PREFS = "pure_session_vault", KEY = "s", COOKIE = "pure_session";
    private SessionVault() {}

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, 0); }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return g.generateKey();
    }

    static void save(Context c, String token) {
        if (token == null || token.isEmpty()) return;
        try {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding"); ci.init(Cipher.ENCRYPT_MODE, key());
            byte[] ct = ci.doFinal(token.getBytes(StandardCharsets.UTF_8));
            prefs(c).edit().putString(KEY, Base64.encodeToString(ci.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)).apply();
        } catch (Exception ignored) {}
    }

    static String load(Context c) {
        String v = prefs(c).getString(KEY, "");
        int i = v.indexOf(':'); if (i < 0) return "";
        try {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(v.substring(0, i), Base64.NO_WRAP)));
            return new String(ci.doFinal(Base64.decode(v.substring(i + 1), Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) { clear(c); return ""; }
    }

    static void clear(Context c) { prefs(c).edit().remove(KEY).apply(); }

    /** Token currently held by the WebView cookie jar for origin (httpOnly cookies are visible natively). */
    static String cookieToken(String origin) {
        String all = CookieManager.getInstance().getCookie(origin);
        if (all == null) return "";
        for (String part : all.split(";")) { String p = part.trim(); if (p.startsWith(COOKIE + "=")) return p.substring(COOKIE.length() + 1); }
        return "";
    }

    /** Capture after a successful login (remember=true) or keep in sync on page loads. */
    static void capture(Context c, String origin) { String t = cookieToken(origin); if (!t.isEmpty()) save(c, t); }

    /** Before opening origin: if it has no session yet, attach the remembered one (https only). */
    static void attach(Context c, String origin) {
        if (origin == null || !origin.startsWith("https://") || !cookieToken(origin).isEmpty()) return;
        String t = load(c); if (t.isEmpty() || !t.matches("[0-9a-f]{64}")) return;
        CookieManager cm = CookieManager.getInstance();
        cm.setCookie(origin, COOKIE + "=" + t + "; Path=/; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict");
        cm.flush();
    }

    static void forget(Context c, String origin) {
        clear(c);
        if (origin != null) { CookieManager.getInstance().setCookie(origin, COOKIE + "=; Path=/; Max-Age=0"); CookieManager.getInstance().flush(); }
    }
}
