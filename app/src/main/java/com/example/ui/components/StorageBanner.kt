package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.StorageInfo
import com.example.ui.theme.DarkCard
import com.example.ui.theme.DarkCardBorder
import com.example.ui.theme.SageGreen
import com.example.ui.theme.TextLight
import com.example.ui.theme.TextMuted

@Composable
fun StorageBanner(
    storageInfo: StorageInfo,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(DarkCard)
            .border(1.dp, DarkCardBorder, RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 9.dp)
            .testTag("storage_banner")
    ) {
        val text = buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = TextLight)) {
                append("Protected offline storage")
            }
            append(" granted · ")
            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = SageGreen)) {
                append("${storageInfo.formattedUsed} of ${storageInfo.formattedTotal} used")
            }
            append(" · library stays on this device")
        }

        Text(
            text = text,
            fontSize = 12.sp,
            color = TextMuted,
            lineHeight = 17.sp
        )
    }
}
