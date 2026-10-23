package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = SageGreen,
    onPrimary = OnSageGreen,
    primaryContainer = SageGreenDeep,
    onPrimaryContainer = SageGreen,
    secondary = SageGreenDark,
    onSecondary = Color.White,
    background = DarkBg,
    onBackground = TextLight,
    surface = DarkCard,
    onSurface = TextLight,
    surfaceVariant = DarkCardHover,
    onSurfaceVariant = TextMuted,
    outline = DarkCardBorder
)

@Composable
fun OGMTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
