package app.pure.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pure.ui.components.*
import app.pure.ui.theme.Pure

@Composable
fun Logo(size: Int = 72) {
    Box(Modifier.size(size.dp).clip(Pure.rLg).background(Brush.linearGradient(listOf(Pure.Accent, Pure.Accent2))), contentAlignment = Alignment.Center) {
        Text("P", color = Pure.AccentInk, fontWeight = FontWeight.Black, fontSize = (size * 0.5).sp)
    }
}

/** Splash / connecting. [failed] shows retry + manual server entry. */
@Composable
fun SplashScreen(status: String, failed: Boolean, onRetry: () -> Unit = {}, onManual: () -> Unit = {}, animate: Boolean = true) {
    val pulse = if (animate) rememberInfiniteTransition(label = "p").animateFloat(0.35f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a").value else 1f
    Column(Modifier.fillMaxSize().background(Pure.Bg).padding(Pure.s8), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Logo(84); Spacer(Modifier.height(Pure.s5))
        Text("PURE", style = MaterialTheme.typography.headlineMedium.copy(letterSpacing = 6.sp), color = Pure.Text)
        Spacer(Modifier.height(Pure.s2))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (!failed) Box(Modifier.size(8.dp).alpha(pulse).clip(CircleShape).background(Pure.Accent)) else Icon(Icons.Rounded.CloudOff, null, tint = Pure.Danger, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(Pure.s2)); Text(status, color = Pure.Text2, style = MaterialTheme.typography.bodyMedium)
        }
        if (failed) {
            Spacer(Modifier.height(Pure.s6)); PrimaryButton("ลองใหม่", onRetry, Modifier.fillMaxWidth())
            Spacer(Modifier.height(Pure.s2)); SecondaryButton("ใส่ที่อยู่เซิร์ฟเวอร์เอง", onManual, Modifier.fillMaxWidth(), Icons.Rounded.Link)
        }
    }
}

@Composable
fun ManualServerDialog(initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var v by remember { mutableStateOf(initial) }
    AlertDialog(onDismiss, containerColor = Pure.Surface2, title = { Text("ที่อยู่เซิร์ฟเวอร์") },
        text = { PureField(v, { v = it }, "URL", placeholder = "https://…") },
        confirmButton = { TextButton({ onSave(v.trim()) }) { Text("เชื่อมต่อ", color = Pure.Accent2) } },
        dismissButton = { TextButton(onDismiss) { Text("ยกเลิก", color = Pure.Text2) } })
}

@Composable
fun LoginScreen(registering: Boolean, busy: Boolean, error: String?, server: String, onToggle: () -> Unit,
                onSubmit: (handle: String, name: String, password: String, remember: Boolean) -> Unit) {
    var handle by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var pw by rememberSaveable { mutableStateOf("") }
    var remember by rememberSaveable { mutableStateOf(true) }
    Column(Modifier.fillMaxSize().background(Pure.Bg).statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = Pure.s6)) {
        Spacer(Modifier.height(56.dp)); Logo(60); Spacer(Modifier.height(Pure.s6))
        Text(if (registering) "สร้างบัญชี PURE" else "ยินดีต้อนรับกลับ", style = MaterialTheme.typography.headlineMedium, color = Pure.Text)
        Spacer(Modifier.height(Pure.s1))
        Text(if (registering) "แชตส่วนตัว เข้ารหัสปลายทาง" else "เข้าสู่ระบบเพื่อคุยกับเพื่อนต่อ", color = Pure.Text2, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(Pure.s6))
        PureField(handle, { handle = it.trim() }, "ชื่อผู้ใช้", leading = Icons.Rounded.AlternateEmail); Spacer(Modifier.height(Pure.s3))
        if (registering) { PureField(name, { name = it }, "ชื่อที่แสดง", leading = Icons.Rounded.Badge); Spacer(Modifier.height(Pure.s3)) }
        PureField(pw, { pw = it }, "รหัสผ่าน", password = true, leading = Icons.Rounded.Lock)
        Spacer(Modifier.height(Pure.s3))
        Row(Modifier.fillMaxWidth().clip(Pure.rSm).clickable { remember = !remember }.padding(vertical = Pure.s1), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(remember, { remember = it }, colors = CheckboxDefaults.colors(checkedColor = Pure.Accent, checkmarkColor = Pure.AccentInk, uncheckedColor = Pure.Text3))
            Column { Text("จดจำฉันไว้", color = Pure.Text); Text("ไม่ต้องล็อกอินใหม่ 90 วัน (เก็บใน Android Keystore)", color = Pure.Text3, style = MaterialTheme.typography.bodySmall) }
        }
        if (error != null) { Spacer(Modifier.height(Pure.s2)); Text(error, color = Pure.Danger, style = MaterialTheme.typography.bodyMedium) }
        Spacer(Modifier.height(Pure.s5))
        PrimaryButton(if (registering) "สมัครสมาชิก" else "เข้าสู่ระบบ", { onSubmit(handle, name, pw, remember) }, Modifier.fillMaxWidth(),
            enabled = handle.length >= 3 && pw.length >= 6 && (!registering || name.isNotBlank()), busy = busy)
        Spacer(Modifier.height(Pure.s3))
        TextButton(onToggle, Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (registering) "มีบัญชีแล้ว? เข้าสู่ระบบ" else "ยังไม่มีบัญชี? สมัครเลย", color = Pure.Accent2)
        }
        Spacer(Modifier.weight(1f, fill = false)); Spacer(Modifier.height(Pure.s8))
        Row(Modifier.align(Alignment.CenterHorizontally).clip(Pure.rPill).border(1.dp, Pure.Line, Pure.rPill).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(Pure.Accent)); Spacer(Modifier.width(6.dp))
            Text(server, color = Pure.Text3, style = MaterialTheme.typography.labelSmall, maxLines = 1)
        }
        Spacer(Modifier.height(Pure.s6))
    }
}
