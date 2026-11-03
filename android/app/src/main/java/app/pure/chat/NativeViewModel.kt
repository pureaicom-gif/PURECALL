package app.pure.chat

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.pure.ui.model.*
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.*
import org.json.JSONObject
import java.util.UUID

sealed interface Phase { data class Connecting(val status: String, val failed: Boolean = false) : Phase; data object Login : Phase; data object Main : Phase }
sealed interface Overlay { data class Room(val peer: UiUser) : Overlay; data class Profile(val user: UiUser) : Overlay; data object Settings : Overlay; data class Story(val reel: UiStoryReel) : Overlay }
data class IncomingCall(val id: String, val from: UiUser, val fromJson: String, val video: Boolean)

/** All native app state + server I/O. Screens in :ui are stateless and read from here. */
class NativeViewModel(app: Application) : AndroidViewModel(app) {
    private val ctx get() = getApplication<Application>()
    var phase by mutableStateOf<Phase>(Phase.Connecting("กำลังค้นหาเซิร์ฟเวอร์…")); private set
    var origin by mutableStateOf(""); private set
    var api: NativeApi? = null; private set
    var e2e: NativeE2E? = null; private set
    private var socket: Socket? = null

    var me by mutableStateOf<UiUser?>(null); private set
    var tab by mutableStateOf(Tab.Chats)
    val overlays = mutableStateListOf<Overlay>()
    var online by mutableStateOf(false); private set
    var chats by mutableStateOf<List<UiChat>>(emptyList()); private set
    var typing by mutableStateOf<Set<String>>(emptySet()); private set
    val messages = mutableStateMapOf<String, List<UiMessage>>()
    var loadingOlder by mutableStateOf(false); private set
    var e2eWith by mutableStateOf<Map<String, Boolean>>(emptyMap()); private set
    var posts by mutableStateOf<List<UiPost>>(emptyList()); private set
    var reels by mutableStateOf<List<UiStoryReel>>(emptyList()); private set
    var feedLoading by mutableStateOf(false); private set
    var searchResults by mutableStateOf<List<UiUser>>(emptyList()); private set
    var suggestions by mutableStateOf<List<UiUser>>(emptyList()); private set
    val profiles = mutableStateMapOf<String, UiProfile>()
    val profilePosts = mutableStateMapOf<String, List<UiPost>>()
    var incoming by mutableStateOf<IncomingCall?>(null); private set
    var authBusy by mutableStateOf(false); private set
    var authError by mutableStateOf<String?>(null); private set
    var registering by mutableStateOf(false)
    var toast by mutableStateOf<String?>(null)
    var openChatId: String? = null
    var onNewMessage: ((UiUser, String) -> Unit)? = null

    private val prefs = ctx.getSharedPreferences("pure_native", 0)
    val remember get() = prefs.getBoolean("remember", true)

    fun start() = viewModelScope.launch {
        phase = Phase.Connecting("กำลังค้นหาเซิร์ฟเวอร์…")
        val manual = prefs.getString("manual_server", "").orEmpty()
        val cached = ServerDiscovery.cached(ctx)
        val found = withContext(Dispatchers.IO) {
            when {
                manual.isNotEmpty() && ServerDiscovery.alive(manual) -> manual
                cached.isNotEmpty() && ServerDiscovery.alive(cached) -> cached
                else -> ServerDiscovery.refresh(ctx)
            }
        }
        if (found.isNullOrEmpty()) { phase = Phase.Connecting("ยังติดต่อเซิร์ฟเวอร์ไม่ได้", failed = true); return@launch }
        connectTo(found)
    }

    fun setManualServer(url: String) { val o = ServerDiscovery.originOf(url) ?: url.trimEnd('/'); prefs.edit().putString("manual_server", o).apply(); start() }

    private suspend fun connectTo(o: String) {
        origin = o; val a = NativeApi(o); api = a; e2e = NativeE2E(ctx, a)
        phase = Phase.Connecting("กำลังเข้าสู่ระบบ…")
        a.token = SessionVault.load(ctx).orEmpty()
        val u = if (a.token.isNotEmpty()) runCatching { a.get("/me").optJSONObject("user") }.getOrNull() else null
        if (u != null) onAuthed(a.user(u)) else { a.token = ""; phase = Phase.Login }
    }

    fun submitAuth(handle: String, name: String, password: String, rememberMe: Boolean) = viewModelScope.launch {
        val a = api ?: return@launch; authBusy = true; authError = null
        try {
            val body = JSONObject().put("handle", handle).put("password", password)
            val r = if (registering) a.post("/register", body.put("name", name)) else a.post("/login", body.put("remember", rememberMe))
            prefs.edit().putBoolean("remember", rememberMe).apply()
            if (rememberMe && a.token.isNotEmpty()) SessionVault.save(ctx, a.token) else SessionVault.clear(ctx)
            onAuthed(a.user(r.getJSONObject("user")))
        } catch (e: Exception) { authError = e.message ?: "เข้าสู่ระบบไม่สำเร็จ" } finally { authBusy = false }
    }

    private fun onAuthed(u: UiUser) {
        me = u; phase = Phase.Main
        viewModelScope.launch { runCatching { e2e?.setup(u.id) } }
        connectSocket(); refreshFriends(); refreshFeed(); loadSuggestions()
    }

    fun logout() = viewModelScope.launch {
        runCatching { api?.post("/logout") }; socket?.disconnect(); socket = null
        SessionVault.forget(ctx, origin); api?.token = ""; me = null; chats = emptyList(); messages.clear(); overlays.clear(); posts = emptyList(); phase = Phase.Login
    }

    // ---- realtime ----
    private fun connectSocket() {
        val a = api ?: return; socket?.disconnect()
        val opts = IO.Options().apply { extraHeaders = mapOf("Cookie" to listOf("pure_session=${a.token}")); reconnection = true; transports = arrayOf("websocket", "polling") }
        val s = IO.socket(a.origin, opts); socket = s
        fun on(ev: String, f: (JSONObject?) -> Unit) = s.on(ev) { args -> val j = args.firstOrNull() as? JSONObject; viewModelScope.launch(Dispatchers.Main) { f(j) } }
        on(Socket.EVENT_CONNECT) { online = true }
        on(Socket.EVENT_DISCONNECT) { online = false }
        on("friends") { refreshFriends() }
        on("presence") { j -> j ?: return@on; val id = j.optString("id"); val on = j.optBoolean("online")
            chats = chats.map { if (it.user.id == id) it.copy(user = it.user.copy(online = on)) else it }
            overlays.replaceAll { if (it is Overlay.Room && it.peer.id == id) Overlay.Room(it.peer.copy(online = on)) else it } }
        on("typing") { j -> j ?: return@on; if (j.has("groupId")) return@on; val p = j.optString("peer")
            typing = if (j.optBoolean("active", true)) typing + p else typing - p
            if (j.optBoolean("active", true)) viewModelScope.launch { delay(4000); typing = typing - p } }
        on("message") { j -> j ?: return@on; viewModelScope.launch { ingest(j) } }
        on("message:deleted") { j -> j ?: return@on; val id = j.optLong("id"); messages.keys.toList().forEach { k -> messages[k] = messages[k]!!.filterNot { it.id == id } } }
        on("read") { j -> val peer = j?.optString("peer").orEmpty().ifEmpty { j?.optString("by").orEmpty() }; if (peer.isNotEmpty()) messages[peer]?.let { l -> messages[peer] = l.map { if (it.mine) it.copy(seen = true) else it } } }
        on("call:incoming") { j -> j ?: return@on; val f = j.optJSONObject("from") ?: return@on
            incoming = IncomingCall(j.optString("id"), a.user(f), f.toString(), j.optBoolean("video")) }
        on("call:end") { j -> if (incoming?.id == j?.optString("id")) incoming = null }
        s.connect()
    }
    fun sendTyping(peer: String) { socket?.emit("typing", JSONObject().put("peer", peer).put("active", true)) }
    fun declineCall() { incoming?.let { socket?.emit("call:end", JSONObject().put("id", it.id)) }; incoming = null }
    fun clearIncoming() { incoming = null }

    private suspend fun toUi(j: JSONObject, peer: String): UiMessage {
        val meId = me?.id.orEmpty(); val raw = j.str("text"); val enc = raw.startsWith("e2e1:")
        val text = if (enc) e2e?.decrypt(meId, peer, raw) ?: "🔒 ถอดรหัสไม่ได้ (กุญแจของอุปกรณ์เปลี่ยน)" else raw
        val file = j.optJSONObject("file")
        return UiMessage(j.optLong("id"), j.str("client_id").ifEmpty { "s" + j.optLong("id") }, j.optString("sender") == meId, if (j.optBoolean("deleted")) "ข้อความถูกลบ" else text,
            j.optLong("created"), enc, !j.isNull("seen") && j.opt("seen") != false, file?.optString("name")?.ifEmpty { "ไฟล์แนบ" }, j.optBoolean("isAi"))
    }

    private suspend fun ingest(j: JSONObject) {
        if (!j.isNull("group_id") && j.has("group_id")) return
        val meId = me?.id ?: return
        val peer = if (j.optString("sender") == meId) j.optString("receiver") else j.optString("sender")
        val m = toUi(j, peer)
        val cur = messages[peer].orEmpty()
        messages[peer] = (cur.filterNot { it.clientId == m.clientId || (it.id == m.id && m.id != 0L) } + m).sortedBy { it.at }
        val idx = chats.indexOfFirst { it.user.id == peer }
        if (idx >= 0) {
            val c = chats[idx]; val unread = if (!m.mine && openChatId != peer) c.unread + 1 else c.unread
            chats = (listOf(c.copy(lastText = m.text, lastAt = m.at, unread = unread)) + chats.filterIndexed { i, _ -> i != idx })
            if (!m.mine && openChatId != peer) onNewMessage?.invoke(c.user, m.text)
        } else refreshFriends()
        if (!m.mine && openChatId == peer) markRead(peer)
    }

    // ---- friends / chats ----
    fun refreshFriends() = viewModelScope.launch {
        val a = api ?: return@launch
        runCatching { a.get("/friends").optJSONArray("friends") }.getOrNull()?.let { arr ->
            val list = (0 until arr.length()).map { i -> val f = arr.getJSONObject(i); val last = f.optJSONObject("last")
                val lastText = last?.str("text").orEmpty().let { if (it.startsWith("e2e1:")) "🔒 ข้อความเข้ารหัส" else it.ifEmpty { if (last?.isNull("file_id") == false) "📎 ไฟล์" else "" } }
                UiChat(a.user(f), lastText, last?.optLong("created") ?: 0L, f.optInt("unread"), f.optString("status", "accepted"), f.optBoolean("incoming")) }
            chats = list.sortedByDescending { it.lastAt }
        }
    }
    fun search(q: String) = viewModelScope.launch {
        val a = api ?: return@launch; if (q.length < 2) { searchResults = emptyList(); return@launch }
        searchResults = runCatching { a.users(a.get("/users?q=" + java.net.URLEncoder.encode(q, "UTF-8")).optJSONArray("users")) }.getOrDefault(emptyList()).filter { it.id != me?.id }
    }
    private fun loadSuggestions() = viewModelScope.launch {
        val a = api ?: return@launch
        suggestions = runCatching { val j = a.get("/friend-suggestions"); a.users(j.optJSONArray("suggestions") ?: j.optJSONArray("users")) }.getOrDefault(emptyList())
    }
    fun addFriend(u: UiUser) = viewModelScope.launch { act { api!!.post("/friends", JSONObject().put("id", u.id)) }; toast = "ส่งคำขอถึง ${u.name} แล้ว"; refreshFriends() }
    fun respond(u: UiUser, accept: Boolean) = viewModelScope.launch { act { api!!.post("/friends/${u.id}/respond", JSONObject().put("accept", accept)) }; refreshFriends() }
    private suspend fun act(f: suspend () -> Unit) { try { f() } catch (e: Exception) { toast = e.message } }

    // ---- chat room ----
    fun openChat(u: UiUser) {
        overlays.add(Overlay.Room(u)); openChatId = u.id
        chats = chats.map { if (it.user.id == u.id) it.copy(unread = 0) else it }
        viewModelScope.launch {
            val a = api ?: return@launch
            e2eWith = e2eWith + (u.id to (e2e?.available(u.id) == true))
            runCatching { a.get("/messages/${u.id}").optJSONArray("messages") }.getOrNull()?.let { arr ->
                messages[u.id] = (0 until arr.length()).map { toUi(arr.getJSONObject(it), u.id) }.sortedBy { it.at }; markRead(u.id) }
        }
    }
    fun loadOlder(peer: String) = viewModelScope.launch {
        val a = api ?: return@launch; val first = messages[peer]?.firstOrNull() ?: return@launch; if (loadingOlder) return@launch
        loadingOlder = true
        try { val arr = a.get("/messages/$peer?before=${first.id}").optJSONArray("messages") ?: return@launch
            val older = (0 until arr.length()).map { toUi(arr.getJSONObject(it), peer) }
            if (older.isNotEmpty()) messages[peer] = (older + messages[peer].orEmpty()).distinctBy { it.clientId }.sortedBy { it.at } } catch (_: Exception) {} finally { loadingOlder = false }
    }
    private fun markRead(peer: String) = viewModelScope.launch {
        val last = messages[peer]?.lastOrNull { !it.mine && it.id > 0 } ?: return@launch
        runCatching { api?.post("/messages/$peer/read", JSONObject().put("through", last.id)) }
    }
    fun send(peer: String, text: String) = viewModelScope.launch {
        val a = api ?: return@launch; val meId = me?.id ?: return@launch; val cid = "n" + UUID.randomUUID().toString().take(18)
        val wire = e2e?.encrypt(meId, peer, text) ?: text
        val tmp = UiMessage(0, cid, true, text, System.currentTimeMillis(), wire.startsWith("e2e1:"), pending = true)
        messages[peer] = messages[peer].orEmpty() + tmp
        try { val r = a.post("/messages/$peer", JSONObject().put("text", wire).put("clientId", cid)); ingest(r.getJSONObject("message")) }
        catch (e: Exception) { messages[peer] = messages[peer].orEmpty().map { if (it.clientId == cid) it.copy(pending = false, failed = true) else it }; toast = e.message }
    }
    fun deleteMessage(peer: String, m: UiMessage) = viewModelScope.launch {
        if (m.id <= 0) { messages[peer] = messages[peer].orEmpty().filterNot { it.clientId == m.clientId }; return@launch }
        act { api!!.send("DELETE", "/messages/${m.id}") }; messages[peer] = messages[peer].orEmpty().filterNot { it.id == m.id }
    }
    fun closeOverlay() { val o = overlays.removeLastOrNull(); if (o is Overlay.Room) openChatId = (overlays.lastOrNull { it is Overlay.Room } as? Overlay.Room)?.peer?.id }

    // ---- timeline / stories / profile ----
    fun refreshFeed() = viewModelScope.launch {
        val a = api ?: return@launch; feedLoading = true
        try {
            runCatching { a.get("/posts").optJSONArray("posts") }.getOrNull()?.let { arr -> posts = (0 until arr.length()).map { a.post(arr.getJSONObject(it)) } }
            runCatching { a.get("/stories") }.getOrNull()?.let { j ->
                val arr = j.optJSONArray("reels")
                reels = if (arr != null) (0 until arr.length()).map { i -> val r = arr.getJSONObject(i); val items = r.optJSONArray("items")
                    UiStoryReel(a.user(r.getJSONObject("user")), (0 until (items?.length() ?: 0)).map { k -> val s = items!!.getJSONObject(k)
                        UiStory(s.optString("id"), s.str("text"), s.optString("bg", "#0d2a1b"), s.optLong("created")) }, r.optBoolean("unseen")) }.filter { it.items.isNotEmpty() }
                else emptyList()
            }
        } finally { feedLoading = false }
    }
    fun createPost(text: String) = viewModelScope.launch {
        act { val r = api!!.multipart("/posts", mapOf("text" to text, "clientId" to "n" + UUID.randomUUID())); posts = listOf(api!!.post(r.getJSONObject("post"))) + posts }
    }
    fun like(p: UiPost) = viewModelScope.launch {
        val flip = { l: List<UiPost> -> l.map { if (it.id == p.id) it.copy(liked = !p.liked, likes = (p.likes + if (p.liked) -1 else 1).coerceAtLeast(0)) else it } }
        posts = flip(posts); profilePosts.keys.toList().forEach { profilePosts[it] = flip(profilePosts[it]!!) }
        runCatching { api!!.post("/posts/${p.id}/like", JSONObject().put("liked", !p.liked)) }
    }
    fun createStory(text: String, days: Int) = viewModelScope.launch {
        act { api!!.post("/stories", JSONObject().put("text", text).put("days", days).put("clientId", "n" + UUID.randomUUID())); toast = "แชร์สตอรี่แล้ว" }; refreshFeed()
    }
    fun openStory(r: UiStoryReel) { overlays.add(Overlay.Story(r)); reels = reels.map { if (it.user.id == r.user.id) it.copy(unseen = false) else it } }
    fun openProfile(u: UiUser) { if (u.id == me?.id) { overlays.clear(); tab = Tab.Profile } else overlays.add(Overlay.Profile(u)); loadProfile(u.id) }
    fun loadProfile(id: String) = viewModelScope.launch {
        val a = api ?: return@launch
        runCatching { a.get("/profiles/$id").getJSONObject("profile") }.getOrNull()?.let { p ->
            profiles[id] = UiProfile(a.user(p), p.str("bio"), p.optInt("posts"), p.optInt("friends"), p.optInt("followers"), p.optInt("following"),
                p.opt("cover").let { if (it is JSONObject || (it is String && it.isNotEmpty())) "${a.origin}/api/profiles/$id/media/cover" else null }) }
        runCatching { a.get("/posts?owner=$id").optJSONArray("posts") }.getOrNull()?.let { arr -> profilePosts[id] = (0 until arr.length()).map { a.post(arr.getJSONObject(it)) } }
    }
    fun saveStatus(s: String) = viewModelScope.launch { act { api!!.post("/account/status", JSONObject().put("status", s)); toast = "บันทึกสถานะแล้ว" }; me = me?.copy(statusText = s); me?.let { loadProfile(it.id) } }
    fun uploadAvatar(jpeg: ByteArray) = viewModelScope.launch { act { api!!.uploadImage("/profile/media/avatar", jpeg); toast = "อัปเดตรูปโปรไฟล์แล้ว" }; me?.let { loadProfile(it.id); refreshFriends() } }
    fun saveBio(bio: String) = viewModelScope.launch {
        act { api!!.post("/profile", JSONObject().put("bio", bio)) }; me?.let { loadProfile(it.id) }
    }
    override fun onCleared() { socket?.disconnect() }
}
