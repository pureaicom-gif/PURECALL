package app.pure.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** PURE green-black design tokens (same values as public/ds.css). */
object Pure {
    val Bg = Color(0xFF000000)
    val Surface = Color(0xFF0A0F0C)
    val Surface2 = Color(0xFF101813)
    val Surface3 = Color(0xFF16211B)
    val Line = Color(0xFF1C2A22)
    val LineStrong = Color(0xFF27402F)
    val Text = Color(0xFFEEF5F0)
    val Text2 = Color(0xFFA7B8AD)
    val Text3 = Color(0xFF6F8277)
    val Accent = Color(0xFF19E08A)
    val Accent2 = Color(0xFF5DFFA8)
    val AccentInk = Color(0xFF00170B)
    val AccentSoft = Color(0xFF0D2A1B)
    val Danger = Color(0xFFFF5D5D)

    val s1 = 4.dp; val s2 = 8.dp; val s3 = 12.dp; val s4 = 16.dp; val s5 = 20.dp; val s6 = 24.dp; val s8 = 32.dp
    val rSm = RoundedCornerShape(10.dp); val rMd = RoundedCornerShape(14.dp); val rLg = RoundedCornerShape(20.dp); val rPill = RoundedCornerShape(999.dp)
}

private val scheme = darkColorScheme(
    primary = Pure.Accent, onPrimary = Pure.AccentInk, primaryContainer = Pure.AccentSoft, onPrimaryContainer = Pure.Accent2,
    secondary = Pure.Accent2, onSecondary = Pure.AccentInk,
    background = Pure.Bg, onBackground = Pure.Text, surface = Pure.Surface, onSurface = Pure.Text,
    surfaceVariant = Pure.Surface2, onSurfaceVariant = Pure.Text2, surfaceContainer = Pure.Surface, surfaceContainerHigh = Pure.Surface2,
    surfaceContainerHighest = Pure.Surface3, surfaceContainerLow = Pure.Surface, surfaceContainerLowest = Pure.Bg,
    outline = Pure.Line, outlineVariant = Pure.Line, error = Pure.Danger,
)

private val type = Typography(
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp, letterSpacing = (-0.4).sp),
    headlineSmall = TextStyle(fontSize = 23.sp, fontWeight = FontWeight.Bold, lineHeight = 28.sp, letterSpacing = (-0.3).sp),
    titleLarge = TextStyle(fontSize = 19.sp, fontWeight = FontWeight.SemiBold, lineHeight = 24.sp),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.5.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Bold),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 10.5.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.4.sp),
)

@Composable
fun PureTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = scheme, typography = type, shapes = Shapes(small = Pure.rSm, medium = Pure.rMd, large = Pure.rLg), content = content)
