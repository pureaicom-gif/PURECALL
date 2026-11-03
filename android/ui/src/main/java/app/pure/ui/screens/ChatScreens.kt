package app.pure.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pure.ui.components.*
import app.pure.ui.model.UiChat
import app.pure.ui.model.UiMessage
import app.pure.ui.model.UiUser
import app.pure.ui.theme.Pure

@Composable
fun ChatsScreen(chats: List<UiChat>, online: Boolean, onOpen: (UiChat) -> Unit, onNewChat: () -> Unit, onScan: () -> Unit, typing: Set<String> = emptySet()) {
    var q by remember { mutableStateOf("") }
    val shown = remember(chats, q) { chats.filter { it.status == "accepted" && (q.isBlank() || it.user.name.contains(q, true) || it.user.handle.contains(q, true)) } }
    Column(Modifier.fillMaxSize().background(Pure.Bg)) {
        ScreenHeader("แชต", if (online) "เชื่อมต่อแล้ว · เข้ารหัสปลายทาง" else "กำลังเชื่อมต่อ…") {
            RoundIcon(Icons.Rounded.QrCodeScanner, "สแกน", onScan); RoundIcon(Icons.Rounded.Edit, "แชตใหม่", onNewChat, filled = true)
        }
        SearchPill(q, { q = it }, "ค้นหาแชต", Modifier.padding(horizontal = Pure.s4)); Spacer(Modifier.height(Pure.s2))
        if (shown.isEmpty()) EmptyState(Icons.Rounded.ChatBubbleOutline, if (q.isBlank()) "ยังไม่มีแชต" else "ไม่พบแชต", "เพิ่มเพื่อนเพื่อเริ่มคุย") { PrimaryButton("หาเพื่อน", onNewChat) }
        else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Pure.s4)) {
            items(shown, key = { it.user.id }) { c -> ChatRow(c, c.user.id in typing) { onOpen(c) } }
        }
    }
}

@Composable
private fun ChatRow(c: UiChat, typing: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Pure.s4, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(c.user, 52.dp); Spacer(Modifier.width(Pure.s3))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.user.name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, color = Pure.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (c.lastAt > 0) Text(relTime(c.lastAt), color = if (c.unread > 0) Pure.Accent2 else Pure.Text3, style = MaterialTheme.typography.labelMedium)
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (typing) "กำลังพิมพ์…" else c.lastText.ifBlank { "@${c.user.handle}" }, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = if (typing) Pure.Accent2 else if (c.unread > 0) Pure.Text else Pure.Text2, style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (c.unread > 0) FontWeight.SemiBold else FontWeight.Normal)
                if (c.unread > 0) Box(Modifier.padding(start = Pure.s2).heightIn(min = 20.dp).widthIn(min = 20.dp).clip(Pure.rPill).background(Pure.Accent).padding(horizontal = 6.dp),
                    contentAlignment = Alignment.Center) { Text(if (c.unread > 99) "99+" else "${c.unread}", color = Pure.AccentInk, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold) }
            }
        }
    }
}

@Composable
fun ChatRoomScreen(peer: UiUser, messages: List<UiMessage>, e2e: Boolean, peerTyping: Boolean, loadingOlder: Boolean,
                   onBack: () -> Unit, onSend: (String) -> Unit, onTyping: () -> Unit, onCall: (video: Boolean) -> Unit,
                   onLoadOlder: () -> Unit, onDelete: (UiMessage) -> Unit = {}) {
    var text by remember { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(messages.lastOrNull()?.clientId) { if (messages.isNotEmpty()) list.animateScrollToItem(0) }
    val nearTop by remember { derivedStateOf { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index == list.layoutInfo.totalItemsCount - 1 } }
    LaunchedEffect(nearTop) { if (nearTop && messages.size >= 30) onLoadOlder() }
    var menuFor by remember { mutableStateOf<UiMessage?>(null) }
    Column(Modifier.fillMaxSize().background(Pure.Bg).imePadding()) {
        Row(Modifier.fillMaxWidth().background(Pure.Surface).statusBarsPadding().padding(horizontal = Pure.s2, vertical = Pure.s2), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "กลับ", tint = Pure.Text) }
            Avatar(peer, 40.dp); Spacer(Modifier.width(Pure.s3))
            Column(Modifier.weight(1f)) {
                Text(peer.name, style = MaterialTheme.typography.titleMedium, color = Pure.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (peerTyping) "กำลังพิมพ์…" else if (peer.online) "ออนไลน์" else "@${peer.handle}", color = if (peerTyping || peer.online) Pure.Accent2 else Pure.Text3, style = MaterialTheme.typography.bodySmall)
            }
            IconButton({ onCall(false) }) { Icon(Icons.Rounded.Call, "โทร", tint = Pure.Accent2) }
            IconButton({ onCall(true) }) { Icon(Icons.Rounded.Videocam, "วิดีโอคอล", tint = Pure.Accent2) }
        }
        HorizontalDivider(color = Pure.Line)
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, reverseLayout = true, contentPadding = PaddingValues(Pure.s3)) {
            val rev = messages.asReversed()
            items(rev.size, key = { rev[it].clientId }) { i ->
                val m = rev[i]; val prev = rev.getOrNull(i + 1)
                Bubble(m, grouped = prev != null && prev.mine == m.mine && m.at - prev.at < 120_000) { if (m.mine) menuFor = m }
            }
            item("e2e") { E2eBanner(e2e) }
            if (loadingOlder) item("older") { Box(Modifier.fillMaxWidth().padding(Pure.s3), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(20.dp), color = Pure.Accent, strokeWidth = 2.dp) } }
        }
        Row(Modifier.fillMaxWidth().background(Pure.Surface).navigationBarsPadding().padding(Pure.s2), verticalAlignment = Alignment.Bottom) {
            Row(Modifier.weight(1f).heightIn(min = 44.dp).clip(RoundedCornerShape(22.dp)).background(Pure.Surface2).border(1.dp, Pure.Line, RoundedCornerShape(22.dp))
                .padding(horizontal = Pure.s4, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) {
                    if (text.isEmpty()) Text("ข้อความ", color = Pure.Text3)
                    BasicTextField(text, { text = it; onTyping() }, textStyle = MaterialTheme.typography.bodyLarge.copy(color = Pure.Text), maxLines = 5,
                        cursorBrush = SolidColor(Pure.Accent), modifier = Modifier.fillMaxWidth())
                }
            }
            Spacer(Modifier.width(Pure.s2))
            val can = text.isNotBlank()
            Box(Modifier.size(44.dp).clip(CircleShape).background(if (can) Pure.Accent else Pure.Surface3).clickable(enabled = can) { onSend(text.trim()); text = "" },
                contentAlignment = Alignment.Center) { Icon(Icons.AutoMirrored.Rounded.Send, "ส่ง", tint = if (can) Pure.AccentInk else Pure.Text3, modifier = Modifier.size(20.dp)) }
        }
    }
    menuFor?.let { m ->
        AlertDialog({ menuFor = null }, containerColor = Pure.Surface2, title = { Text("ลบข้อความนี้?") }, text = { Text(m.text, maxLines = 3, color = Pure.Text2) },
            confirmButton = { TextButton({ onDelete(m); menuFor = null }) { Text("ลบ", color = Pure.Danger) } },
            dismissButton = { TextButton({ menuFor = null }) { Text("ยกเลิก", color = Pure.Text2) } })
    }
}

@Composable
private fun E2eBanner(on: Boolean) {
    Row(Modifier.fillMaxWidth().padding(vertical = Pure.s3), horizontalArrangement = Arrangement.Center) {
        Row(Modifier.clip(Pure.rPill).background(Pure.Surface).border(1.dp, Pure.Line, Pure.rPill).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (on) Icons.Rounded.Lock else Icons.Rounded.LockOpen, null, tint = if (on) Pure.Accent else Pure.Text3, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(6.dp))
            Text(if (on) "ข้อความเข้ารหัสปลายทาง (E2E)" else "อีกฝ่ายยังไม่เปิด E2E — ข้อความไม่เข้ารหัส", color = Pure.Text2, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun Bubble(m: UiMessage, grouped: Boolean, onLong: () -> Unit) {
    val shape = if (m.mine) RoundedCornerShape(18.dp, 18.dp, if (grouped) 18.dp else 6.dp, 18.dp) else RoundedCornerShape(18.dp, 18.dp, 18.dp, if (grouped) 18.dp else 6.dp)
    Row(Modifier.fillMaxWidth().padding(top = if (grouped) 2.dp else 8.dp), horizontalArrangement = if (m.mine) Arrangement.End else Arrangement.Start) {
        Column(Modifier.widthIn(max = 300.dp).clip(shape).background(if (m.mine) Pure.Accent else Pure.Surface2)
            .then(if (!m.mine) Modifier.border(1.dp, Pure.Line, shape) else Modifier).clickable(onClick = onLong).padding(horizontal = 13.dp, vertical = 8.dp)) {
            if (m.isAi) Text("PURE AI", color = Pure.Accent2, style = MaterialTheme.typography.labelSmall)
            if (m.fileName != null) Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.AttachFile, null, tint = if (m.mine) Pure.AccentInk else Pure.Accent2, modifier = Modifier.size(16.dp))
                Text(m.fileName, color = if (m.mine) Pure.AccentInk else Pure.Text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            }
            if (m.text.isNotEmpty()) Text(m.text, color = if (m.mine) Pure.AccentInk else Pure.Text, style = MaterialTheme.typography.bodyLarge)
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                if (m.encrypted) Icon(Icons.Rounded.Lock, null, tint = if (m.mine) Pure.AccentInk.copy(alpha = .6f) else Pure.Text3, modifier = Modifier.size(10.dp).padding(end = 2.dp))
                Text(if (m.failed) "ส่งไม่สำเร็จ" else clockTime(m.at), color = if (m.failed) Pure.Danger else if (m.mine) Pure.AccentInk.copy(alpha = .65f) else Pure.Text3, style = MaterialTheme.typography.labelSmall)
                if (m.mine && !m.failed) Icon(if (m.pending) Icons.Rounded.Schedule else if (m.seen) Icons.Rounded.DoneAll else Icons.Rounded.Done, null,
                    tint = Pure.AccentInk.copy(alpha = .7f), modifier = Modifier.padding(start = 3.dp).size(13.dp))
            }
        }
    }
}
