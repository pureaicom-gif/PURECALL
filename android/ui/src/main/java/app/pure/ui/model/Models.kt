package app.pure.ui.model

import androidx.compose.runtime.Immutable

@Immutable data class UiUser(val id: String, val handle: String, val name: String, val online: Boolean = false, val avatarUrl: String? = null, val role: String = "user", val ai: Boolean = false, val statusText: String = "") {
    val initial: String get() = (name.ifBlank { handle }).trim().take(1).uppercase()
    val isAdmin: Boolean get() = role == "admin"
}
@Immutable data class UiChat(val user: UiUser, val lastText: String, val lastAt: Long, val unread: Int, val status: String = "accepted", val incoming: Boolean = false)
@Immutable data class UiMessage(val id: Long, val clientId: String, val mine: Boolean, val text: String, val at: Long, val encrypted: Boolean = false,
                                val seen: Boolean = false, val fileName: String? = null, val isAi: Boolean = false, val pending: Boolean = false, val failed: Boolean = false)
@Immutable data class UiPost(val id: Long, val author: UiUser, val text: String, val at: Long, val likes: Int, val comments: Int, val liked: Boolean,
                             val mediaUrl: String? = null, val mediaKind: String = "text")
@Immutable data class UiStory(val id: String, val text: String, val bg: String, val at: Long)
@Immutable data class UiStoryReel(val user: UiUser, val items: List<UiStory>, val unseen: Boolean)
@Immutable data class UiProfile(val user: UiUser, val bio: String = "", val posts: Int = 0, val friends: Int = 0, val followers: Int = 0, val following: Int = 0, val coverUrl: String? = null)

enum class Tab(val label: String) { Chats("แชต"), Friends("เพื่อน"), Timeline("ไทม์ไลน์"), Profile("โปรไฟล์"), More("เพิ่มเติม") }

/** Screens that still run in the WebView (opened from native nav). `web` is the web app tab name. */
enum class WebScreen(val label: String, val web: String, val adminOnly: Boolean = false) {
    Pet("สัตว์เลี้ยง", "pet"), Market("ตลาด", "market"), Studio("AI Studio", "studio"), Voice("คุยด้วยเสียง", "voice"), Personas("เพื่อน AI", "personas"), Admin("แอดมิน", "admin", adminOnly = true), FullWeb("เปิดเว็บเต็ม", "chats")
}
