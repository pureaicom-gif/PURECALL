package app.pure.chat

import android.content.Context
import app.pure.ui.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiError(val code: Int, message: String) : Exception(message)

/** Thin client for the PURE server REST API. Auth = `pure_session` cookie (token kept in SessionVault when "remember me"). */
class NativeApi(val origin: String) {
    @Volatile var token: String = ""
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val r = chain.request()
            val b = r.newBuilder()
            if (token.isNotEmpty() && r.url.toString().startsWith(origin)) b.header("Cookie", "pure_session=$token")
            val resp = chain.proceed(b.build())
            for (h in resp.headers("Set-Cookie")) {
                val kv = h.substringBefore(';').trim()
                if (kv.startsWith("pure_session=")) token = kv.removePrefix("pure_session=")
            }
            resp
        }.build()

    private val JSON = "application/json; charset=utf-8".toMediaType()

    private suspend fun call(req: Request): JSONObject = withContext(Dispatchers.IO) {
        http.newCall(req).execute().use { r ->
            val body = r.body?.string().orEmpty()
            val j = runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (!r.isSuccessful) throw ApiError(r.code, j.optString("error").ifEmpty { "HTTP ${r.code}" })
            j
        }
    }
    suspend fun get(path: String) = call(Request.Builder().url(origin + "/api" + path).build())
    suspend fun send(method: String, path: String, body: JSONObject = JSONObject()) =
        call(Request.Builder().url(origin + "/api" + path).method(method, body.toString().toRequestBody(JSON)).build())
    suspend fun post(path: String, body: JSONObject = JSONObject()) = send("POST", path, body)
    suspend fun multipart(path: String, fields: Map<String, String>) = call(Request.Builder().url(origin + "/api" + path)
        .post(MultipartBody.Builder().setType(MultipartBody.FORM).apply { fields.forEach { (k, v) -> addFormDataPart(k, v) } }.build()).build())

    suspend fun uploadImage(path: String, jpeg: ByteArray) = call(Request.Builder().url(origin + "/api" + path)
        .post(MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("image", "avatar.jpg", jpeg.toRequestBody("image/jpeg".toMediaType())).build()).build())

    // ---- mapping ----
    fun avatarOf(id: String, j: JSONObject?): String? {
        val a = j?.opt("avatar")
        return when { a is String && a.isNotEmpty() -> if (a.startsWith("/")) origin + a else a; a is JSONObject -> "$origin/api/profiles/$id/media/avatar"; else -> null }
    }
    fun user(j: JSONObject): UiUser { val id = j.optString("id"); return UiUser(id, j.optString("handle"), j.optString("name").ifEmpty { j.optString("handle") },
        j.optBoolean("online"), avatarOf(id, j), if (j.optBoolean("isAdmin")) "admin" else j.optString("role", "user"), j.optBoolean("ai") || j.optString("role") == "bot", j.str("statusText")) }
    fun users(a: JSONArray?) = (0 until (a?.length() ?: 0)).map { user(a!!.getJSONObject(it)) }
    fun post(j: JSONObject): UiPost {
        val media = j.opt("media"); val kind = j.optString("kind", "text")
        val mediaUrl = when (media) { is String -> if (media.startsWith("/")) origin + media else media; is JSONObject -> media.optString("url").let { if (it.startsWith("/")) origin + it else it.ifEmpty { null } }; else -> null }
        return UiPost(j.optLong("id"), user(j.optJSONObject("author") ?: JSONObject().put("id", j.optString("owner"))), j.optString("text"), j.optLong("created"),
            j.optInt("likes"), j.optInt("comments"), j.optBoolean("liked") || !j.isNull("myReaction"), mediaUrl, if (kind.startsWith("image")) "image" else kind)
    }
}

/** JSON → string helpers that avoid org.json's "null" strings. */
fun JSONObject.str(k: String): String = if (isNull(k)) "" else optString(k)
