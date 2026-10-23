package com.example.ui.theme

import androidx.compose.ui.graphics.Color

// Exact Dark Sage & Charcoal Palette from https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/
val DarkBg = Color(0xFF111411)            // Deep dark background
val DarkCard = Color(0xFF181C18)          // Card container
val DarkCardBorder = Color(0xFF282E27)    // Subtle borders
val DarkCardHover = Color(0xFF212720)     // Active card surface

// Sage Green Brand Accents
val SageGreen = Color(0xFFB8D99E)         // Primary sage green
val SageGreenDark = Color(0xFF8AA874)     // Secondary sage
val SageGreenDeep = Color(0xFF2B3626)     // Sage badge/container background
val SageGreenMuted = Color(0xFF43543B)    // Disc groove border
val OnSageGreen = Color(0xFF0F150C)       // Dark text on sage green

// Text Tokens
val TextLight = Color(0xFFF1F5EC)         // Main white/cream text
val TextMuted = Color(0xFFA2ACA0)         // Secondary muted text
val TextSubtle = Color(0xFF6F796E)        // Tertiary timestamps/sizes

// Status Badges
val BadgeGreen = Color(0xFF86EFAC)
val BadgeGreenBg = Color(0xFF1B2B1E)
val BadgeAmber = Color(0xFFFBBF24)
val BadgeAmberBg = Color(0xFF2E2713)

// Backward-compatibility aliases
val CreamBackground = DarkBg
val CreamSurface = DarkCard
val CreamSurfaceVariant = DarkCardHover
val PeachPrimary = SageGreen
val PeachSoft = SageGreenDeep
val PeachDark = SageGreenDark
val InkDark = TextLight
val InkMedium = TextMuted
val InkSoft = TextSubtle
val StatusGreen = BadgeGreen
val StatusGreenBg = BadgeGreenBg
val StatusAmber = BadgeAmber
val StatusAmberBg = BadgeAmberBg
