package com.example.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.example.R

// Fancy fonts for Open Grace Music
val PlayfairDisplayFontFamily = FontFamily(
    Font(R.font.playfair_display, FontWeight.Normal)
)

val CinzelFontFamily = FontFamily(
    Font(R.font.cinzel, FontWeight.Normal)
)

val ItalianaFontFamily = FontFamily(
    Font(R.font.italiana, FontWeight.Normal)
)

// Set of Material typography styles to start with
val Typography =
  Typography(
    displayLarge = TextStyle(
      fontFamily = PlayfairDisplayFontFamily,
      fontWeight = FontWeight.Bold,
      fontSize = 32.sp,
      lineHeight = 38.sp,
      letterSpacing = 0.5.sp
    ),
    headlineMedium = TextStyle(
      fontFamily = PlayfairDisplayFontFamily,
      fontWeight = FontWeight.SemiBold,
      fontSize = 24.sp,
      lineHeight = 30.sp,
      letterSpacing = 0.5.sp
    ),
    titleLarge = TextStyle(
      fontFamily = PlayfairDisplayFontFamily,
      fontWeight = FontWeight.Bold,
      fontSize = 20.sp,
      lineHeight = 26.sp,
      letterSpacing = 0.25.sp
    ),
    bodyLarge =
      TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp,
      )
  )
