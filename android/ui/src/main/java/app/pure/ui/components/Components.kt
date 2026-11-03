package app.pure.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pure.ui.model.Tab
import app.pure.ui.model.UiUser
import app.pure.ui.theme.Pure
import coil.compose.AsyncImage

@Composable
fun Avatar(user: UiUser, size: Dp = 48.dp, ring: Boolean = false, showOnline: Boolean = true) {
    Box(Modifier.size(size)) {
        val m = Modifier.fillMaxSize().clip(CircleShape).background(Pure.Surface3)
            .then(if (ring) Modifier.border(2.dp, Pure.Accent, CircleShape) else Modifier)
        Box(m, contentAlignment = Alignment.Center) {
            Text(user.initial, color = Pure.Accent2, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.4f).sp)
            if (user.avatarUrl != null) AsyncImage(user.avatarUrl, null, Modifier.fillMaxSize().clip(CircleShape), contentScale = ContentScale.Crop)
        }
        if (user.ai) Text("AI", color = Pure.Bg, fontWeight = FontWeight.Bold, fontSize = 9.sp, modifier = Modifier.align(Alignment.TopEnd).clip(CircleShape).background(Pure.Accent).padding(horizontal = 4.dp))
        if (showOnline && user.online) Box(Modifier.align(Alignment.BottomEnd).size(size * 0.27f).clip(CircleShape).background(Pure.Bg).padding(2.dp).clip(CircleShape).background(Pure.Accent))
    }
}

@Composable
fun ScreenHeader(title: String, subtitle: String? = null, actions: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = Pure.s4, end = Pure.s3, top = Pure.s2, bottom = Pure.s2).heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineSmall, color = Pure.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Pure.Text2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Pure.s2), content = actions)
    }
}

@Composable
fun RoundIcon(icon: ImageVector, label: String, onClick: () -> Unit, tint: androidx.compose.ui.graphics.Color = Pure.Text, filled: Boolean = false) {
    Box(Modifier.size(40.dp).clip(CircleShape).background(if (filled) Pure.Accent else Pure.Surface2).border(1.dp, if (filled) Pure.Accent else Pure.Line, CircleShape)
        .clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, label, tint = if (filled) Pure.AccentInk else tint, modifier = Modifier.size(20.dp))
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false) {
    Button(onClick, modifier.heightIn(min = 48.dp), enabled = enabled && !busy, shape = Pure.rMd,
        colors = ButtonDefaults.buttonColors(containerColor = Pure.Accent, contentColor = Pure.AccentInk, disabledContainerColor = Pure.AccentSoft, disabledContentColor = Pure.Text3)) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = Pure.AccentInk, strokeWidth = 2.dp) else Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null) {
    OutlinedButton(onClick, modifier.heightIn(min = 44.dp), shape = Pure.rMd, border = androidx.compose.foundation.BorderStroke(1.dp, Pure.Line),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = Pure.Surface2, contentColor = Pure.Text)) {
        if (icon != null) { Icon(icon, null, Modifier.size(18.dp), tint = Pure.Accent2); Spacer(Modifier.width(Pure.s2)) }
        Text(text, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
    }
}

@Composable
fun PureField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, placeholder: String = "", password: Boolean = false,
              keyboard: KeyboardType = KeyboardType.Text, singleLine: Boolean = true, leading: ImageVector? = null) {
    OutlinedTextField(value, onChange, modifier.fillMaxWidth(), label = if (label.isNotEmpty()) ({ Text(label) }) else null,
        placeholder = { Text(placeholder, color = Pure.Text3) }, singleLine = singleLine, shape = Pure.rMd,
        leadingIcon = leading?.let { { Icon(it, null, tint = Pure.Text3) } },
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboard, autoCorrectEnabled = false),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Pure.Accent, unfocusedBorderColor = Pure.Line, focusedContainerColor = Pure.Surface2,
            unfocusedContainerColor = Pure.Surface2, focusedLabelColor = Pure.Accent2, unfocusedLabelColor = Pure.Text2, cursorColor = Pure.Accent))
}

@Composable
fun SearchPill(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().height(44.dp).clip(Pure.rPill).background(Pure.Surface2).border(1.dp, Pure.Line, Pure.rPill).padding(horizontal = Pure.s4),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Rounded.Search, null, tint = Pure.Text3, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(Pure.s2))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(placeholder, color = Pure.Text3, style = MaterialTheme.typography.bodyMedium)
            androidx.compose.foundation.text.BasicTextField(value, onChange, singleLine = true, textStyle = MaterialTheme.typography.bodyMedium.copy(color = Pure.Text),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(Pure.Accent), modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(Modifier.clip(Pure.rPill).background(if (selected) Pure.AccentSoft else Pure.Surface2).border(1.dp, if (selected) Pure.Accent else Pure.Line, Pure.rPill)
        .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 7.dp)) {
        Text(text, color = if (selected) Pure.Accent2 else Pure.Text2, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
fun SectionLabel(text: String) = Text(text.uppercase(), color = Pure.Accent, style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.6.sp),
    modifier = Modifier.padding(start = Pure.s4, end = Pure.s4, top = Pure.s4, bottom = Pure.s2))

@Composable
fun EmptyState(icon: ImageVector, title: String, body: String, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(horizontal = Pure.s8, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(Pure.AccentSoft), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Pure.Accent2, modifier = Modifier.size(30.dp)) }
        Spacer(Modifier.height(Pure.s4)); Text(title, style = MaterialTheme.typography.titleMedium, color = Pure.Text)
        Spacer(Modifier.height(Pure.s1)); Text(body, style = MaterialTheme.typography.bodySmall, color = Pure.Text2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        if (action != null) { Spacer(Modifier.height(Pure.s4)); action() }
    }
}

@Composable
fun Card(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().clip(Pure.rLg).background(Pure.Surface).border(1.dp, Pure.Line, Pure.rLg)
        .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(Pure.s4), content = content)
}

fun tabIcon(t: Tab): ImageVector = when (t) {
    Tab.Chats -> Icons.Rounded.ChatBubble; Tab.Friends -> Icons.Rounded.Group; Tab.Timeline -> Icons.Rounded.DynamicFeed
    Tab.Profile -> Icons.Rounded.Person; Tab.More -> Icons.Rounded.GridView
}

@Composable
fun BottomNav(current: Tab, onTab: (Tab) -> Unit, badges: Map<Tab, Int> = emptyMap()) {
    Column(Modifier.fillMaxWidth().background(Pure.Bg)) {
        HorizontalDivider(color = Pure.Line, thickness = 1.dp)
        Row(Modifier.fillMaxWidth().navigationBarsPadding().height(60.dp)) {
            Tab.entries.forEach { t ->
                val on = t == current
                Column(Modifier.weight(1f).fillMaxHeight().clickable { onTab(t) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Box(Modifier.width(28.dp).height(2.dp).clip(Pure.rPill).background(if (on) Pure.Accent else Pure.Bg))
                    Spacer(Modifier.height(7.dp))
                    BadgedBox(badge = { val n = badges[t] ?: 0; if (n > 0) Badge(containerColor = Pure.Accent, contentColor = Pure.AccentInk) { Text(if (n > 99) "99+" else "$n") } }) {
                        Icon(tabIcon(t), t.label, tint = if (on) Pure.Accent2 else Pure.Text3, modifier = Modifier.size(23.dp))
                    }
                    Spacer(Modifier.height(3.dp))
                    Text(t.label, color = if (on) Pure.Accent2 else Pure.Text3, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
        }
    }
}

fun relTime(at: Long, now: Long = System.currentTimeMillis()): String {
    val d = (now - at) / 1000
    return when { d < 60 -> "เมื่อสักครู่"; d < 3600 -> "${d / 60} นาที"; d < 86400 -> "${d / 3600} ชม."; d < 7 * 86400 -> "${d / 86400} วัน"
        else -> java.text.SimpleDateFormat("d MMM", java.util.Locale("th")).format(java.util.Date(at)) }
}
fun clockTime(at: Long): String = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(at))
