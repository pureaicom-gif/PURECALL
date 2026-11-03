package app.pure.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import app.pure.ui.components.BottomNav
import app.pure.ui.model.*
import app.pure.ui.screens.*
import app.pure.ui.theme.PureTheme
import org.junit.Rule
import org.junit.Test

/** Renders every native screen with sample data. `gradlew :ui:recordPaparazziDebug` → ui/src/test/snapshots/images. */
class ScreenshotTest {
    @get:Rule val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5, theme = "android:Theme.Material.NoActionBar", showSystemUi = false)

    private val now = System.currentTimeMillis()
    private val me = UiUser("me", "pure_ceo", "Pure Ai", true, role = "admin")
    private val ploy = UiUser("u1", "ploy", "พลอย ศิริ", true)
    private val ton = UiUser("u2", "ton.dev", "ต้น นักพัฒนา", false)
    private val mint = UiUser("u3", "mint", "มิ้นท์", true)
    private val chats = listOf(
        UiChat(ploy, "พรุ่งนี้ประชุมกี่โมงคะ", now - 60_000, 2), UiChat(ton, "ส่งไฟล์ APK ให้แล้วครับ", now - 3_600_000, 0),
        UiChat(mint, "🔒 ข้อความเข้ารหัส", now - 86_400_000, 0), UiChat(UiUser("u4", "nat", "ณัฐ", false), "", 0, 0, "pending", incoming = true))
    private val msgs = listOf(
        UiMessage(1, "a", false, "สวัสดีค่ะ พรุ่งนี้ประชุมกี่โมงคะ", now - 600_000, encrypted = true),
        UiMessage(2, "b", true, "10 โมงครับ ที่ออฟฟิศ", now - 540_000, encrypted = true, seen = true),
        UiMessage(3, "c", true, "เดี๋ยวส่งสไลด์ให้ก่อน", now - 530_000, encrypted = true, seen = true),
        UiMessage(4, "d", false, "ได้เลยค่ะ ขอบคุณค่ะ 🙏", now - 120_000, encrypted = true),
        UiMessage(5, "e", true, "@pure สรุปวาระประชุมให้หน่อย", now - 60_000, pending = true))
    private val posts = listOf(UiPost(1, ploy, "วันนี้ทีมเปิดตัว PURE 0.10 แบบ native แล้ว เร็วขึ้นมาก 🚀", now - 1_800_000, 24, 5, true),
        UiPost(2, ton, "ลองใช้ Jetpack Compose ครั้งแรก สนุกดี", now - 7_200_000, 8, 1, false))
    private val reels = listOf(UiStoryReel(ploy, listOf(UiStory("s1", "ทริปเชียงใหม่", "#0d2a1b", now)), true), UiStoryReel(ton, listOf(UiStory("s2", "hello", "#000000", now)), false))

    private fun shot(name: String, content: @Composable () -> Unit) = paparazzi.snapshot(name) { PureTheme { Box(Modifier.fillMaxSize()) { content() } } }
    @Composable private fun withNav(t: Tab, content: @Composable () -> Unit) = Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) { content() }; BottomNav(t, {}, mapOf(Tab.Chats to 2, Tab.Friends to 1)) }

    @Test fun splash() = shot("splash") { SplashScreen("กำลังค้นหาเซิร์ฟเวอร์…", failed = false, animate = false) }
    @Test fun splashFailed() = shot("splash-failed") { SplashScreen("ยังติดต่อเซิร์ฟเวอร์ไม่ได้", failed = true, animate = false) }
    @Test fun login() = shot("login") { LoginScreen(false, false, null, "fork-mentor-heavy-increased.trycloudflare.com", {}) { _, _, _, _ -> } }
    @Test fun register() = shot("register") { LoginScreen(true, false, "ชื่อผู้ใช้นี้ถูกใช้แล้ว", "api.purefxai.store", {}) { _, _, _, _ -> } }
    @Test fun chats() = shot("chats") { withNav(Tab.Chats) { ChatsScreen(chats, true, {}, {}, {}, setOf("u2")) } }
    @Test fun chatRoom() = shot("chat-room") { ChatRoomScreen(ploy, msgs, e2e = true, peerTyping = true, loadingOlder = false, {}, {}, {}, {}, {}) }
    @Test fun friends() = shot("friends") { withNav(Tab.Friends) { FriendsScreen(chats, emptyList(), listOf(UiUser("u9", "bank", "แบงค์")), {}, {}, { _, _ -> }, {}, {}) } }
    @Test fun timeline() = shot("timeline") { withNav(Tab.Timeline) { TimelineScreen(me, reels, posts, false, {}, {}, {}, {}, {}, {}) } }
    @Test fun profile() = shot("profile") { withNav(Tab.Profile) { ProfileScreen(UiProfile(me, "CEO · PURE", 12, 48, 230, 51), true, posts.take(1), null, {}, {}, {}, {}) } }
    @Test fun settings() = shot("settings") { SettingsScreen(me, "https://api.purefxai.store", "0.10.0", true, "9f3a1c77e2b04d5a8c1e66f0b2d4a9e1", {}, {}, {}, {}, {}, {}) }
    @Test fun more() = shot("more") { withNav(Tab.More) { MoreScreen(me, {}, {}) } }
    @Test fun incomingCall() = shot("incoming-call") { IncomingCallOverlay(ploy, true, {}, {}) }
}
