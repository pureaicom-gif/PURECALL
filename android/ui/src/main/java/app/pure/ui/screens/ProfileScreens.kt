package app.pure.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pure.ui.components.*
import app.pure.ui.model.*
import app.pure.ui.theme.Pure
import coil.compose.AsyncImage

@Composable
fun ProfileScreen(p: UiProfile?, isMe: Boolean, posts: List<UiPost>, onBack: (() -> Unit)?, onEditBio: (String) -> Unit,
                  onMessage: () -> Unit, onSettings: () -> Unit, onLike: (UiPost) -> Unit) {
    var editing by remember { mutableStateOf(false) }
    if (p == null) { Box(Modifier.fillMaxSize().background(Pure.Bg), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Pure.Accent) }; return }
    LazyColumn(Modifier.fillMaxSize().background(Pure.Bg), contentPadding = PaddingValues(bottom = Pure.s6)) {
        item {
            Box(Modifier.fillMaxWidth().height(190.dp)) {
                Box(Modifier.fillMaxWidth().height(150.dp).background(Brush.linearGradient(listOf(Pure.AccentSoft, Pure.Bg, Pure.AccentSoft))))
                if (p.coverUrl != null) AsyncImage(p.coverUrl, null, Modifier.fillMaxWidth().height(150.dp), contentScale = ContentScale.Crop)
                Row(Modifier.statusBarsPadding().padding(Pure.s2).fillMaxWidth()) {
                    if (onBack != null) RoundIcon(Icons.AutoMirrored.Rounded.ArrowBack, "กลับ", onBack)
                    Spacer(Modifier.weight(1f)); if (isMe) RoundIcon(Icons.Rounded.Settings, "ตั้งค่า", onSettings)
                }
                Box(Modifier.align(Alignment.BottomStart).padding(start = Pure.s4).clip(CircleShape).background(Pure.Bg).padding(4.dp)) { Avatar(p.user, 92.dp, showOnline = false) }
            }
        }
        item {
            Column(Modifier.padding(horizontal = Pure.s4)) {
                Spacer(Modifier.height(Pure.s2))
                Text(p.user.name, style = MaterialTheme.typography.headlineSmall, color = Pure.Text)
                Text("@${p.user.handle}" + if (p.user.isAdmin) " · แอดมิน" else "", color = Pure.Text3, style = MaterialTheme.typography.bodyMedium)
                if (p.bio.isNotBlank()) { Spacer(Modifier.height(Pure.s2)); Text(p.bio, color = Pure.Text2, style = MaterialTheme.typography.bodyMedium) }
                Spacer(Modifier.height(Pure.s4))
                Row(Modifier.fillMaxWidth().clip(Pure.rLg).background(Pure.Surface).border(1.dp, Pure.Line, Pure.rLg).padding(vertical = Pure.s3)) {
                    Stat("โพสต์", p.posts); Stat("เพื่อน", p.friends); Stat("ผู้ติดตาม", p.followers); Stat("กำลังติดตาม", p.following)
                }
                Spacer(Modifier.height(Pure.s3))
                if (isMe) SecondaryButton("แก้ไขโปรไฟล์", { editing = true }, Modifier.fillMaxWidth(), Icons.Rounded.Edit)
                else PrimaryButton("ส่งข้อความ", onMessage, Modifier.fillMaxWidth())
            }
        }
        item { SectionLabel("โพสต์") }
        if (posts.isEmpty()) item { Text("ยังไม่มีโพสต์", color = Pure.Text3, modifier = Modifier.padding(horizontal = Pure.s4)) }
        items(posts, key = { it.id }) { PostCard(it, { onLike(it) }, {}) }
    }
    if (editing) {
        var b by remember { mutableStateOf(p.bio) }
        AlertDialog({ editing = false }, containerColor = Pure.Surface2, title = { Text("แก้ไขแนะนำตัว") }, text = {
            PureField(b, { if (it.length <= 240) b = it }, "เกี่ยวกับฉัน (ไม่เกิน 240 ตัว)", singleLine = false) },
            confirmButton = { TextButton({ onEditBio(b.trim()); editing = false }) { Text("บันทึก", color = Pure.Accent2) } },
            dismissButton = { TextButton({ editing = false }) { Text("ยกเลิก", color = Pure.Text2) } })
    }
}

@Composable private fun RowScope.Stat(label: String, n: Int) {
    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$n", color = Pure.Text, style = MaterialTheme.typography.titleLarge); Text(label, color = Pure.Text3, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

@Composable
fun SettingRow(icon: ImageVector, title: String, sub: String? = null, danger: Boolean = false, trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = Pure.s4, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(36.dp).clip(Pure.rSm).background(if (danger) Pure.Danger.copy(alpha = .12f) else Pure.AccentSoft), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = if (danger) Pure.Danger else Pure.Accent2, modifier = Modifier.size(19.dp)) }
        Spacer(Modifier.width(Pure.s3))
        Column(Modifier.weight(1f)) {
            Text(title, color = if (danger) Pure.Danger else Pure.Text, style = MaterialTheme.typography.bodyLarge)
            if (sub != null) Text(sub, color = Pure.Text3, style = MaterialTheme.typography.bodySmall, maxLines = 2)
        }
        if (trailing != null) trailing() else if (onClick != null) Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Pure.Text3)
    }
}

@Composable
private fun Group(content: @Composable ColumnScope.() -> Unit) =
    Column(Modifier.padding(horizontal = Pure.s4).fillMaxWidth().clip(Pure.rLg).background(Pure.Surface).border(1.dp, Pure.Line, Pure.rLg), content = content)

@Composable
fun SettingsScreen(me: UiUser, server: String, version: String, notifications: Boolean, e2eFingerprint: String?, onBack: () -> Unit,
                   onNotifications: (Boolean) -> Unit, onChangeServer: () -> Unit, onCheckUpdate: () -> Unit, onOpenWeb: (WebScreen) -> Unit, onLogout: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize().background(Pure.Bg), contentPadding = PaddingValues(bottom = Pure.s8)) {
        item { Row(Modifier.statusBarsPadding().padding(Pure.s2), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "กลับ", tint = Pure.Text) }; Text("ตั้งค่า", style = MaterialTheme.typography.headlineSmall, color = Pure.Text) } }
        item { Group { Row(Modifier.padding(Pure.s4), verticalAlignment = Alignment.CenterVertically) { Avatar(me, 54.dp, showOnline = false); Spacer(Modifier.width(Pure.s3))
            Column { Text(me.name, color = Pure.Text, style = MaterialTheme.typography.titleMedium); Text("@${me.handle}", color = Pure.Text3) } } } }
        item { SectionLabel("ความเป็นส่วนตัว") }
        item { Group {
            SettingRow(Icons.Rounded.Lock, "การเข้ารหัสปลายทาง", e2eFingerprint?.let { "ลายนิ้วมือกุญแจ ${it.take(24)}…" } ?: "กำลังสร้างกุญแจ…")
            HorizontalDivider(color = Pure.Line)
            SettingRow(Icons.Rounded.Notifications, "การแจ้งเตือน", "ข้อความและสายเรียกเข้า", trailing = {
                Switch(notifications, onNotifications, colors = SwitchDefaults.colors(checkedThumbColor = Pure.AccentInk, checkedTrackColor = Pure.Accent, uncheckedTrackColor = Pure.Surface3)) })
        } }
        item { SectionLabel("ระบบ") }
        item { Group {
            SettingRow(Icons.Rounded.Dns, "เซิร์ฟเวอร์", server, onClick = onChangeServer); HorizontalDivider(color = Pure.Line)
            SettingRow(Icons.Rounded.SystemUpdate, "ตรวจหาอัปเดต", "เวอร์ชัน $version", onClick = onCheckUpdate); HorizontalDivider(color = Pure.Line)
            SettingRow(Icons.Rounded.Language, "เปิดเวอร์ชันเว็บเต็ม", "ฟีเจอร์ที่ยังไม่ย้ายมาเป็น native", onClick = { onOpenWeb(WebScreen.FullWeb) })
        } }
        item { Spacer(Modifier.height(Pure.s4)) }
        item { Group { SettingRow(Icons.AutoMirrored.Rounded.Logout, "ออกจากระบบ", danger = true, onClick = onLogout) } }
    }
}

@Composable
fun MoreScreen(me: UiUser, onOpenWeb: (WebScreen) -> Unit, onSettings: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Pure.Bg)) {
        ScreenHeader("เพิ่มเติม", "ฟีเจอร์อื่นๆ ของ PURE")
        val tiles = WebScreen.entries.filter { it != WebScreen.FullWeb && (!it.adminOnly || me.isAdmin) }
        Column(Modifier.padding(horizontal = Pure.s4), verticalArrangement = Arrangement.spacedBy(Pure.s3)) {
            tiles.chunked(2).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(Pure.s3)) {
                row.forEach { w -> Column(Modifier.weight(1f).clip(Pure.rLg).background(Pure.Surface).border(1.dp, Pure.Line, Pure.rLg).clickable { onOpenWeb(w) }.padding(Pure.s4)) {
                    Box(Modifier.size(42.dp).clip(Pure.rMd).background(Pure.AccentSoft), contentAlignment = Alignment.Center) { Icon(webIcon(w), null, tint = Pure.Accent2) }
                    Spacer(Modifier.height(Pure.s3)); Text(w.label, color = Pure.Text, style = MaterialTheme.typography.titleMedium) } }
                if (row.size == 1) Spacer(Modifier.weight(1f)) } }
        }
        Spacer(Modifier.height(Pure.s4))
        Group { SettingRow(Icons.Rounded.Settings, "ตั้งค่า", onClick = onSettings); HorizontalDivider(color = Pure.Line)
            SettingRow(Icons.Rounded.Language, "เปิดเวอร์ชันเว็บเต็ม", onClick = { onOpenWeb(WebScreen.FullWeb) }) }
    }
}

fun webIcon(w: WebScreen): ImageVector = when (w) { WebScreen.Pet -> Icons.Rounded.Pets; WebScreen.Market -> Icons.Rounded.Storefront
    WebScreen.Studio -> Icons.Rounded.AutoAwesome; WebScreen.Admin -> Icons.Rounded.AdminPanelSettings; WebScreen.FullWeb -> Icons.Rounded.Language }

@Composable
fun IncomingCallOverlay(from: UiUser, video: Boolean, onAccept: () -> Unit, onDecline: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Pure.AccentSoft, Pure.Bg))).padding(Pure.s8), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.weight(1f)); Avatar(from, 120.dp, ring = true, showOnline = false); Spacer(Modifier.height(Pure.s5))
        Text(from.name, color = Pure.Text, style = MaterialTheme.typography.headlineMedium)
        Text(if (video) "วิดีโอคอลเข้า…" else "สายเรียกเข้า…", color = Pure.Accent2)
        Spacer(Modifier.weight(1.4f))
        Row(Modifier.fillMaxWidth().navigationBarsPadding(), horizontalArrangement = Arrangement.SpaceEvenly) {
            CallBtn(Icons.Rounded.CallEnd, "ปฏิเสธ", Pure.Danger, onDecline); CallBtn(if (video) Icons.Rounded.Videocam else Icons.Rounded.Call, "รับสาย", Pure.Accent, onAccept)
        }
    }
}
@Composable private fun CallBtn(icon: ImageVector, label: String, c: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(68.dp).clip(CircleShape).background(c).clickable(onClick = onClick), contentAlignment = Alignment.Center) { Icon(icon, label, tint = Pure.Bg, modifier = Modifier.size(30.dp)) }
        Spacer(Modifier.height(Pure.s2)); Text(label, color = Pure.Text2, fontWeight = FontWeight.Medium)
    }
}
