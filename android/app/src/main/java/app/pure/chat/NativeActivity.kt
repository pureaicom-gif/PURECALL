package app.pure.chat

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import app.pure.ui.components.BottomNav
import app.pure.ui.model.*
import app.pure.ui.screens.*
import app.pure.ui.theme.Pure
import app.pure.ui.theme.PureTheme
import coil.Coil
import coil.ImageLoader
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.net.URLEncoder

/** v0.10 launcher: native Jetpack Compose shell. Screens not yet ported open in MainActivity's WebView. */
class NativeActivity : ComponentActivity() {
    private val vm: NativeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 21)
        runCatching { UpdateWorker.schedule(this) }
        vm.onNewMessage = { u, text -> notifyMessage(u, text) }
        if (savedInstanceState == null && vm.me == null) vm.start()
        setContent { PureTheme { App() } }
    }

    @Composable
    private fun App() {
        LaunchedEffect(vm.api) { vm.api?.let { a -> Coil.setImageLoader(ImageLoader.Builder(this@NativeActivity).okHttpClient(a.http).crossfade(true).build()) } }
        LaunchedEffect(vm.toast) { vm.toast?.let { Toast.makeText(this@NativeActivity, it, Toast.LENGTH_SHORT).show(); vm.toast = null } }
        var manual by remember { mutableStateOf(false) }
        Box(Modifier.fillMaxSize().background(Pure.Bg)) {
            when (val p = vm.phase) {
                is Phase.Connecting -> SplashScreen(p.status, p.failed, onRetry = { vm.start() }, onManual = { manual = true })
                Phase.Login -> LoginScreen(vm.registering, vm.authBusy, vm.authError, vm.origin.removePrefix("https://"), { vm.registering = !vm.registering }) { h, n, pw, r -> vm.submitAuth(h, n, pw, r) }
                Phase.Main -> MainShell()
            }
            vm.incoming?.let { c -> IncomingCallOverlay(c.from, c.video, onAccept = { vm.clearIncoming()
                openWeb("/?answer=" + enc(c.id) + "&from=" + enc(c.fromJson) + "&video=" + (if (c.video) "1" else "0")) }, onDecline = { vm.declineCall() }) }
        }
        if (manual) ManualServerDialog(vm.origin, { manual = false }) { manual = false; vm.setManualServer(it) }
    }

    @Composable
    private fun MainShell() {
        val me = vm.me ?: return
        var showStoryComposer by remember { mutableStateOf(false) }
        var manual by remember { mutableStateOf(false) }
        BackHandler(vm.overlays.isNotEmpty()) { vm.closeOverlay() }
        BackHandler(vm.overlays.isEmpty() && vm.tab != Tab.Chats) { vm.tab = Tab.Chats }
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                when (vm.tab) {
                    Tab.Chats -> ChatsScreen(vm.chats, vm.online, { vm.openChat(it.user) }, { vm.tab = Tab.Friends }, { scan() }, vm.typing)
                    Tab.Friends -> FriendsScreen(vm.chats, vm.searchResults, vm.suggestions, vm::search, { vm.addFriend(it) }, { u, a -> vm.respond(u, a) }, { vm.openChat(it) }, { openWeb("/?tab=friends") })
                    Tab.Timeline -> TimelineScreen(me, vm.reels, vm.posts, vm.feedLoading, { vm.createPost(it) }, { vm.like(it) }, { showStoryComposer = true }, { vm.openStory(it) }, { vm.openProfile(it) }, { openWeb("/?tab=reels") })
                    Tab.Profile -> { LaunchedEffect(me.id) { vm.loadProfile(me.id) }
                        ProfileScreen(vm.profiles[me.id] ?: UiProfile(me), true, vm.profilePosts[me.id].orEmpty(), null, { vm.saveBio(it) }, {}, { vm.overlays.add(Overlay.Settings) }, { vm.like(it) }, { vm.saveStatus(it) },
                            { pickPhoto.launch(androidx.activity.result.PickVisualMediaRequest(androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly)) }, { takePhoto.launch(null) }) }
                    Tab.More -> MoreScreen(me, { openWebScreen(it) }, { vm.overlays.add(Overlay.Settings) })
                }
            }
            BottomNav(vm.tab, { vm.overlays.clear(); vm.openChatId = null; vm.tab = it }, mapOf(Tab.Chats to vm.chats.sumOf { it.unread }, Tab.Friends to vm.chats.count { it.status == "pending" && it.incoming }))
        }
        vm.overlays.lastOrNull()?.let { o ->
            Box(Modifier.fillMaxSize().background(Pure.Bg)) {
                when (o) {
                    is Overlay.Room -> ChatRoomScreen(o.peer, vm.messages[o.peer.id].orEmpty(), vm.e2eWith[o.peer.id] == true, o.peer.id in vm.typing, vm.loadingOlder,
                        { vm.closeOverlay() }, { vm.send(o.peer.id, it) }, { vm.sendTyping(o.peer.id) },
                        { video -> openWeb("/?chat=" + enc(o.peer.id) + "&dial=" + if (video) "video" else "voice") }, { vm.loadOlder(o.peer.id) }, { vm.deleteMessage(o.peer.id, it) })
                    is Overlay.Profile -> ProfileScreen(vm.profiles[o.user.id] ?: UiProfile(o.user), false, vm.profilePosts[o.user.id].orEmpty(), { vm.closeOverlay() }, {},
                        { vm.openChat(o.user) }, {}, { vm.like(it) })
                    Overlay.Settings -> SettingsScreen(me, vm.origin, BuildConfig.VERSION_NAME, notificationsOn(), vm.e2e?.myFingerprint, { vm.closeOverlay() },
                        { openNotificationSettings() }, { manual = true }, { startActivity(Intent(this@NativeActivity, MainActivity::class.java).putExtra(MainActivity.EXTRA_NATIVE_URL, vm.origin + "/").putExtra("showUpdate", true)) },
                        { openWebScreen(it) }, { vm.logout() })
                    is Overlay.Story -> StoryViewer(o.reel) { vm.closeOverlay() }
                }
            }
        }
        if (showStoryComposer) StoryComposer({ showStoryComposer = false }) { t, d -> showStoryComposer = false; vm.createStory(t, d) }
        if (manual) ManualServerDialog(vm.origin, { manual = false }) { manual = false; vm.setManualServer(it) }
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    private fun openWebScreen(w: WebScreen) = openWeb(when (w) { WebScreen.Admin -> "/admin"; WebScreen.FullWeb -> "/"; WebScreen.Voice -> "/?voice=1"; WebScreen.Personas -> "/?personas=1"; else -> "/?tab=" + w.web })
    private val pickPhoto = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) runCatching { contentResolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it) } }.getOrNull()?.let { vm.uploadAvatar(AvatarCrop.squareJpeg(it)) } }
    private val takePhoto = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.TakePicturePreview()) { bmp -> if (bmp != null) vm.uploadAvatar(AvatarCrop.squareJpeg(bmp)) }

    /** Hand the session to the WebView (cookie) and open a not-yet-native screen. */
    private fun openWeb(path: String) {
        val a = vm.api ?: return
        if (a.token.isNotEmpty()) { CookieManager.getInstance().setCookie(a.origin, "pure_session=${a.token}; Path=/; HttpOnly; SameSite=Lax" + if (a.origin.startsWith("https")) "; Secure" else ""); CookieManager.getInstance().flush() }
        startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_NATIVE_URL, a.origin + path).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP))
    }

    private fun scan() {
        GmsBarcodeScanning.getClient(this).startScan().addOnSuccessListener { b ->
            val raw = b.rawValue.orEmpty(); val u = runCatching { Uri.parse(raw) }.getOrNull()
            when {
                u?.scheme == "https" && u.getQueryParameter("add") != null -> openWeb("/?" + u.encodedQuery)
                u?.scheme == "https" -> vm.setManualServer(raw)
                else -> vm.toast = "QR นี้ไม่ใช่ลิงก์ PURE"
            }
        }.addOnFailureListener { vm.toast = "สแกนไม่สำเร็จ" }
    }

    private fun notificationsOn() = (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()
    private fun openNotificationSettings() = startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName))

    private fun notifyMessage(u: UiUser, text: String) {
        if (ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("pure_messages", "PURE Messages", NotificationManager.IMPORTANCE_DEFAULT))
        val pi = PendingIntent.getActivity(this, u.id.hashCode(), Intent(this, NativeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(this, "pure_messages").setSmallIcon(applicationInfo.icon).setContentTitle(u.name).setContentText(text.take(120)).setAutoCancel(true).setContentIntent(pi).build()
        runCatching { nm.notify(u.id.hashCode(), n) }
    }
}
