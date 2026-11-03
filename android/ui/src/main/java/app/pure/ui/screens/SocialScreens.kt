package app.pure.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pure.ui.components.*
import app.pure.ui.model.*
import app.pure.ui.theme.Pure
import coil.compose.AsyncImage

@Composable
fun FriendsScreen(friends: List<UiChat>, results: List<UiUser>, suggestions: List<UiUser>, onSearch: (String) -> Unit, onAdd: (UiUser) -> Unit,
                  onRespond: (UiUser, Boolean) -> Unit, onOpenChat: (UiUser) -> Unit, onShowQr: () -> Unit) {
    var q by remember { mutableStateOf("") }
    val incoming = friends.filter { it.status == "pending" && it.incoming }
    val outgoing = friends.filter { it.status == "pending" && !it.incoming }
    val accepted = friends.filter { it.status == "accepted" }
    Column(Modifier.fillMaxSize().background(Pure.Bg)) {
        ScreenHeader("เพื่อน", "${accepted.size} คน · ออนไลน์ ${accepted.count { it.user.online }}") { RoundIcon(Icons.Rounded.QrCode2, "QR ของฉัน", onShowQr) }
        SearchPill(q, { q = it; onSearch(it) }, "ค้นหาด้วยชื่อผู้ใช้", Modifier.padding(horizontal = Pure.s4))
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Pure.s6)) {
            if (q.length >= 2) {
                item { SectionLabel("ผลการค้นหา") }
                if (results.isEmpty()) item { Text("ไม่พบผู้ใช้", color = Pure.Text3, modifier = Modifier.padding(horizontal = Pure.s4)) }
                items(results, key = { "r" + it.id }) { u -> PersonRow(u, "@${u.handle}") { AddButton(friends, u, onAdd, onOpenChat) } }
            }
            if (incoming.isNotEmpty()) {
                item { SectionLabel("คำขอเป็นเพื่อน · ${incoming.size}") }
                items(incoming, key = { "i" + it.user.id }) { c -> PersonRow(c.user, "อยากเป็นเพื่อนกับคุณ") {
                    SmallBtn("ตอบรับ", true) { onRespond(c.user, true) }; Spacer(Modifier.width(6.dp)); SmallBtn("ลบ", false) { onRespond(c.user, false) } } }
            }
            if (outgoing.isNotEmpty()) {
                item { SectionLabel("ส่งคำขอแล้ว") }
                items(outgoing, key = { "o" + it.user.id }) { c -> PersonRow(c.user, "รอการตอบรับ") {} }
            }
            item { SectionLabel("เพื่อนทั้งหมด") }
            if (accepted.isEmpty()) item { EmptyState(Icons.Rounded.GroupAdd, "ยังไม่มีเพื่อน", "ค้นหาชื่อผู้ใช้ หรือสแกน QR เพื่อเพิ่มเพื่อน") }
            items(accepted.sortedByDescending { it.user.online }, key = { "a" + it.user.id }) { c ->
                PersonRow(c.user, if (c.user.online) "ออนไลน์" else "@${c.user.handle}", onClick = { onOpenChat(c.user) }) {
                    IconButton({ onOpenChat(c.user) }) { Icon(Icons.Rounded.ChatBubbleOutline, "แชต", tint = Pure.Accent2) } }
            }
            if (suggestions.isNotEmpty() && q.length < 2) {
                item { SectionLabel("คนที่คุณอาจรู้จัก") }
                items(suggestions, key = { "s" + it.id }) { u -> PersonRow(u, "@${u.handle}") { AddButton(friends, u, onAdd, onOpenChat) } }
            }
        }
    }
}

@Composable private fun AddButton(friends: List<UiChat>, u: UiUser, onAdd: (UiUser) -> Unit, onOpenChat: (UiUser) -> Unit) {
    val rel = friends.firstOrNull { it.user.id == u.id }
    when { rel == null -> SmallBtn("เพิ่ม", true) { onAdd(u) }; rel.status == "accepted" -> SmallBtn("แชต", false) { onOpenChat(u) }; else -> Text("รอตอบรับ", color = Pure.Text3, style = MaterialTheme.typography.labelMedium) }
}

@Composable fun SmallBtn(text: String, primary: Boolean, onClick: () -> Unit) {
    Box(Modifier.clip(Pure.rPill).background(if (primary) Pure.Accent else Pure.Surface3).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 7.dp)) {
        Text(text, color = if (primary) Pure.AccentInk else Pure.Text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun PersonRow(u: UiUser, sub: String, onClick: (() -> Unit)? = null, trailing: @Composable RowScope.() -> Unit) {
    Row(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = Pure.s4, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(u, 46.dp); Spacer(Modifier.width(Pure.s3))
        Column(Modifier.weight(1f)) {
            Text(u.name, color = Pure.Text, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, color = if (sub == "ออนไลน์") Pure.Accent2 else Pure.Text3, style = MaterialTheme.typography.bodySmall, maxLines = 1)
        }
        Row(verticalAlignment = Alignment.CenterVertically, content = trailing)
    }
}

private fun parseBg(s: String): Color = runCatching { Color(android.graphics.Color.parseColor(s)) }.getOrDefault(Pure.Surface3)

@Composable
fun TimelineScreen(me: UiUser, reels: List<UiStoryReel>, posts: List<UiPost>, loading: Boolean, onPost: (String) -> Unit, onLike: (UiPost) -> Unit,
                   onAddStory: () -> Unit, onOpenStory: (UiStoryReel) -> Unit, onOpenProfile: (UiUser) -> Unit, onReels: () -> Unit) {
    var compose by remember { mutableStateOf("") }
    LazyColumn(Modifier.fillMaxSize().background(Pure.Bg), contentPadding = PaddingValues(bottom = Pure.s6)) {
        item { ScreenHeader("ไทม์ไลน์", "เรื่องราวจากเพื่อนของคุณ") { RoundIcon(Icons.Rounded.SmartDisplay, "Reels", onReels) } }
        item {
            LazyRow(contentPadding = PaddingValues(horizontal = Pure.s4), horizontalArrangement = Arrangement.spacedBy(Pure.s3)) {
                item { StoryBubble(me, "สตอรี่ของคุณ", ring = false, add = true, onClick = onAddStory) }
                items(reels, key = { it.user.id }) { r -> StoryBubble(r.user, r.user.name, ring = r.unseen, add = false) { onOpenStory(r) } }
            }
        }
        item {
            Card(Modifier.padding(Pure.s4)) {
                Row(verticalAlignment = Alignment.Top) {
                    Avatar(me, 40.dp, showOnline = false); Spacer(Modifier.width(Pure.s3))
                    Box(Modifier.weight(1f).padding(top = 10.dp)) {
                        if (compose.isEmpty()) Text("คุณกำลังคิดอะไรอยู่?", color = Pure.Text3)
                        androidx.compose.foundation.text.BasicTextField(compose, { compose = it }, textStyle = MaterialTheme.typography.bodyLarge.copy(color = Pure.Text),
                            cursorBrush = androidx.compose.ui.graphics.SolidColor(Pure.Accent), modifier = Modifier.fillMaxWidth())
                    }
                }
                if (compose.isNotBlank()) { Spacer(Modifier.height(Pure.s3)); Row { Spacer(Modifier.weight(1f)); SmallBtn("โพสต์", true) { onPost(compose.trim()); compose = "" } } }
            }
        }
        if (loading && posts.isEmpty()) item { Box(Modifier.fillMaxWidth().padding(Pure.s8), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Pure.Accent) } }
        else if (posts.isEmpty()) item { EmptyState(Icons.Rounded.DynamicFeed, "ยังไม่มีโพสต์", "โพสต์แรกของคุณจะปรากฏที่นี่") }
        items(posts, key = { it.id }) { p -> PostCard(p, { onLike(p) }, { onOpenProfile(p.author) }) }
    }
}

@Composable
private fun StoryBubble(u: UiUser, label: String, ring: Boolean, add: Boolean, onClick: () -> Unit) {
    Column(Modifier.width(70.dp).clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(66.dp).clip(CircleShape).background(if (ring) Brush.linearGradient(listOf(Pure.Accent, Pure.Accent2)) else Brush.linearGradient(listOf(Pure.Line, Pure.Line))).padding(3.dp)
            .clip(CircleShape).background(Pure.Bg).padding(2.dp)) {
            Avatar(u, 56.dp, showOnline = false)
            if (add) Box(Modifier.align(Alignment.BottomEnd).size(20.dp).clip(CircleShape).background(Pure.Accent), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.Add, null, tint = Pure.AccentInk, modifier = Modifier.size(14.dp)) }
        }
        Spacer(Modifier.height(4.dp)); Text(label, color = Pure.Text2, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun PostCard(p: UiPost, onLike: () -> Unit, onAuthor: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = Pure.s4, vertical = 6.dp).clip(Pure.rLg).background(Pure.Surface).border(1.dp, Pure.Line, Pure.rLg)) {
        Row(Modifier.fillMaxWidth().clickable(onClick = onAuthor).padding(Pure.s3), verticalAlignment = Alignment.CenterVertically) {
            Avatar(p.author, 40.dp, showOnline = false); Spacer(Modifier.width(Pure.s3))
            Column(Modifier.weight(1f)) { Text(p.author.name, color = Pure.Text, style = MaterialTheme.typography.titleMedium); Text(relTime(p.at), color = Pure.Text3, style = MaterialTheme.typography.bodySmall) }
        }
        if (p.text.isNotBlank()) Text(p.text, color = Pure.Text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(horizontal = Pure.s4).padding(bottom = Pure.s3))
        if (p.mediaUrl != null && p.mediaKind == "image") AsyncImage(p.mediaUrl, null, Modifier.fillMaxWidth().heightIn(max = 420.dp).background(Pure.Surface2), contentScale = ContentScale.Crop)
        else if (p.mediaUrl != null) Box(Modifier.fillMaxWidth().height(200.dp).background(Pure.Surface2), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.PlayCircle, null, tint = Pure.Accent2, modifier = Modifier.size(52.dp)) }
        HorizontalDivider(color = Pure.Line)
        Row(Modifier.fillMaxWidth().padding(horizontal = Pure.s2, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onLike) { Icon(if (p.liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, null, tint = if (p.liked) Pure.Accent else Pure.Text2, modifier = Modifier.size(19.dp))
                Spacer(Modifier.width(6.dp)); Text(if (p.likes > 0) "${p.likes}" else "ถูกใจ", color = if (p.liked) Pure.Accent2 else Pure.Text2) }
            TextButton({}) { Icon(Icons.Rounded.ModeComment, null, tint = Pure.Text2, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(if (p.comments > 0) "${p.comments}" else "ความคิดเห็น", color = Pure.Text2) }
        }
    }
}

@Composable
fun StoryViewer(reel: UiStoryReel, onClose: () -> Unit) {
    var i by remember(reel) { mutableIntStateOf(0) }
    val s = reel.items.getOrNull(i) ?: return
    Box(Modifier.fillMaxSize().background(parseBg(s.bg)).clickable { if (i < reel.items.size - 1) i++ else onClose() }) {
        Row(Modifier.statusBarsPadding().padding(Pure.s3).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            reel.items.indices.forEach { k -> Box(Modifier.weight(1f).height(3.dp).clip(Pure.rPill).background(if (k <= i) Pure.Text else Pure.Text.copy(alpha = .3f))) }
        }
        Row(Modifier.statusBarsPadding().padding(top = 24.dp, start = Pure.s4, end = Pure.s2), verticalAlignment = Alignment.CenterVertically) {
            Avatar(reel.user, 36.dp, showOnline = false); Spacer(Modifier.width(Pure.s2))
            Column(Modifier.weight(1f)) { Text(reel.user.name, color = Pure.Text, fontWeight = FontWeight.SemiBold); Text(relTime(s.at), color = Pure.Text2, style = MaterialTheme.typography.bodySmall) }
            IconButton(onClose) { Icon(Icons.Rounded.Close, "ปิด", tint = Pure.Text) }
        }
        Text(s.text, Modifier.align(Alignment.Center).padding(Pure.s8), color = Pure.Text, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
    }
}

@Composable
fun StoryComposer(onDismiss: () -> Unit, onPost: (String, Int) -> Unit) {
    var t by remember { mutableStateOf("") }; var days by remember { mutableIntStateOf(1) }
    AlertDialog(onDismiss, containerColor = Pure.Surface2, title = { Text("สตอรี่ใหม่") }, text = {
        Column { PureField(t, { t = it }, "ข้อความ", singleLine = false); Spacer(Modifier.height(Pure.s3))
            Row(horizontalArrangement = Arrangement.spacedBy(Pure.s2)) { listOf(1, 3, 7).forEach { d -> Chip("$d วัน", d == days) { days = d } } } }
    }, confirmButton = { TextButton({ if (t.isNotBlank()) onPost(t.trim(), days) }) { Text("แชร์", color = Pure.Accent2) } },
        dismissButton = { TextButton(onDismiss) { Text("ยกเลิก", color = Pure.Text2) } })
}
