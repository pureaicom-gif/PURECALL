package app.pure.chat

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.math.BigInteger
import java.security.*
import java.security.spec.*
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Wire-compatible port of public/v09.js E2E: ECDH P-256 → raw 32-byte shared secret used as AES-GCM-256 key,
 * payload `e2e1:<b64u iv>:<b64u ct>`, AAD `pure-e2e1|<sorted ids joined by |>`.
 * The device private key (PKCS#8) is wrapped with an Android Keystore AES key.
 */
class NativeE2E(private val ctx: Context, private val api: NativeApi) {
    private val prefs = ctx.getSharedPreferences("pure_e2e_native", 0)
    private var pair: KeyPair? = null
    private val shared = HashMap<String, SecretKey?>()
    private val fps = HashMap<String, String?>()
    var myFingerprint: String? = null; private set

    companion object {
        private const val WRAP = "pure_e2e_wrap"
        fun b64u(b: ByteArray): String = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(b)
        fun unb64u(s: String): ByteArray = java.util.Base64.getUrlDecoder().decode(s)
        fun aad(a: String, b: String) = ("pure-e2e1|" + listOf(a, b).sorted().joinToString("|")).toByteArray(Charsets.UTF_8)
        fun isPlainOnly(text: String) = Regex("^\\s*@pure\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)
        fun fixed32(n: BigInteger): ByteArray { val b = n.toByteArray(); return when { b.size == 32 -> b; b.size > 32 -> b.copyOfRange(b.size - 32, b.size); else -> ByteArray(32 - b.size) + b } }
        fun params(): ECParameterSpec { val g = KeyPairGenerator.getInstance("EC"); g.initialize(ECGenParameterSpec("secp256r1")); return (g.generateKeyPair().public as java.security.interfaces.ECPublicKey).params }
        fun encryptWith(key: SecretKey, aad: ByteArray, text: String): String {
            val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
            val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv)); c.updateAAD(aad)
            return "e2e1:" + b64u(iv) + ":" + b64u(c.doFinal(text.toByteArray(Charsets.UTF_8)))
        }
        fun decryptWith(key: SecretKey, aad: ByteArray, payload: String): String {
            val p = payload.split(":"); require(p.size == 3 && p[0] == "e2e1")
            val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, unb64u(p[1]))); c.updateAAD(aad)
            return String(c.doFinal(unb64u(p[2])), Charsets.UTF_8)
        }
        fun agree(priv: PrivateKey, pub: PublicKey): SecretKey { val ka = KeyAgreement.getInstance("ECDH"); ka.init(priv); ka.doPhase(pub, true); return SecretKeySpec(ka.generateSecret(), "AES") }
        fun pubFromJwk(j: JSONObject, ps: ECParameterSpec): PublicKey =
            KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(BigInteger(1, unb64u(j.getString("x"))), BigInteger(1, unb64u(j.getString("y")))), ps))
        fun jwkOf(pub: PublicKey): JSONObject { val w = (pub as java.security.interfaces.ECPublicKey).w
            return JSONObject().put("kty", "EC").put("crv", "P-256").put("x", b64u(fixed32(w.affineX))).put("y", b64u(fixed32(w.affineY))) }
    }

    private fun wrapKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(WRAP, null) as? SecretKey)?.let { return it }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(KeyGenParameterSpec.Builder(WRAP, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return g.generateKey()
    }

    private fun loadOrCreate(): KeyPair {
        pair?.let { return it }
        val kf = KeyFactory.getInstance("EC")
        runCatching {
            val wrapped = prefs.getString("priv", null) ?: error("none"); val pub = prefs.getString("pub", null) ?: error("none")
            val (iv, ct) = wrapped.split(":").map { Base64.decode(it, Base64.NO_WRAP) }
            val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, wrapKey(), GCMParameterSpec(128, iv))
            return KeyPair(kf.generatePublic(X509EncodedKeySpec(Base64.decode(pub, Base64.NO_WRAP))), kf.generatePrivate(PKCS8EncodedKeySpec(c.doFinal(ct)))).also { pair = it }
        }
        val g = KeyPairGenerator.getInstance("EC"); g.initialize(ECGenParameterSpec("secp256r1")); val kp = g.generateKeyPair()
        val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, wrapKey())
        prefs.edit().putString("priv", Base64.encodeToString(c.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(c.doFinal(kp.private.encoded), Base64.NO_WRAP))
            .putString("pub", Base64.encodeToString(kp.public.encoded, Base64.NO_WRAP)).apply()
        return kp.also { pair = it }
    }

    /** Ensure the server has this device's public key (same logic as web e2eSetup). */
    suspend fun setup(meId: String) {
        val kp = loadOrCreate(); val jwk = jwkOf(kp.public)
        val server = runCatching { api.get("/e2e/key/$meId") }.getOrNull()
        val sj = server?.optJSONObject("jwk")
        myFingerprint = if (sj == null || sj.optString("x") != jwk.getString("x") || sj.optString("y") != jwk.getString("y"))
            api.send("PUT", "/e2e/key", JSONObject().put("jwk", jwk)).optString("fingerprint") else server.optString("fingerprint")
    }

    private suspend fun keyFor(peer: String): SecretKey? {
        if (shared.containsKey(peer)) return shared[peer]
        val kp = pair ?: return null
        val k = runCatching { api.get("/e2e/key/$peer") }.getOrNull()
        val key = k?.optJSONObject("jwk")?.let { runCatching { agree(kp.private, pubFromJwk(it, (kp.public as java.security.interfaces.ECPublicKey).params)) }.getOrNull() }
        fps[peer] = k?.optString("fingerprint"); shared[peer] = key; return key
    }
    fun forgetPeer(peer: String) { shared.remove(peer) }
    suspend fun available(peer: String) = keyFor(peer) != null
    suspend fun encrypt(me: String, peer: String, text: String): String {
        if (text.isBlank() || isPlainOnly(text)) return text
        val k = keyFor(peer) ?: return text
        return runCatching { encryptWith(k, aad(me, peer), text) }.getOrDefault(text)
    }
    suspend fun decrypt(me: String, peer: String, payload: String): String? {
        if (!payload.startsWith("e2e1:")) return payload
        val k = keyFor(peer) ?: return null
        return runCatching { decryptWith(k, aad(me, peer), payload) }.getOrNull()
    }
}
