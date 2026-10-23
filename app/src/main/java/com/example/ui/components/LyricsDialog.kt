package com.example.ui.components

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.LyricsGenerator
import com.example.data.model.Track
import com.example.ui.theme.DarkCard
import com.example.ui.theme.DarkCardBorder
import com.example.ui.theme.DarkCardHover
import com.example.ui.theme.SageGreen
import com.example.ui.theme.SageGreenDeep
import com.example.ui.theme.TextLight
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextSubtle

@Composable
fun LyricsDialog(
    track: Track,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val songContent = LyricsGenerator.generate(track.title, track.artist)
    val scrollState = rememberScrollState()

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = DarkCard),
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .fillMaxHeight(0.84f)
                .border(1.dp, DarkCardBorder, RoundedCornerShape(22.dp))
                .testTag("lyrics_dialog")
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                // Header row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (songContent.isInstrumental) "🎸 Instrument Cord Sheet" else "🎵 Vocal Lyrics",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = SageGreen
                        )
                        Text(
                            text = songContent.title,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextLight,
                            maxLines = 1
                        )
                    }

                    // Share button
                    IconButton(
                        onClick = {
                            val sendIntent = Intent().apply {
                                action = Intent.ACTION_SEND
                                putExtra(Intent.EXTRA_SUBJECT, "${songContent.title} - ${songContent.artist}")
                                putExtra(Intent.EXTRA_TEXT, songContent.content)
                                type = "text/plain"
                            }
                            val shareIntent = Intent.createChooser(sendIntent, "Share via")
                            context.startActivity(shareIntent)
                        },
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(SageGreenDeep)
                            .testTag("share_lyrics_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Share,
                            contentDescription = "Share",
                            tint = SageGreen,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Spacer(modifier = Modifier.size(4.dp))

                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = TextLight
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Scrollable text content
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        .background(DarkCardHover)
                        .border(1.dp, DarkCardBorder, RoundedCornerShape(14.dp))
                        .padding(16.dp)
                        .verticalScroll(scrollState)
                ) {
                    Text(
                        text = songContent.content,
                        fontSize = 13.5.sp,
                        fontFamily = FontFamily.Monospace,
                        color = TextLight,
                        lineHeight = 21.sp
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Footer note
                Text(
                    text = if (songContent.isInstrumental)
                        "Instrument chord sheet ready for practice & jamming · Shareable via any app"
                    else
                        "Vocal lyrics ready for singing along · Shareable via any app",
                    fontSize = 11.sp,
                    color = TextSubtle,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )
            }
        }
    }
}
