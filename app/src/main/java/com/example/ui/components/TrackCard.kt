package com.example.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.data.model.Track
import com.example.ui.theme.DarkCard
import com.example.ui.theme.DarkCardBorder
import com.example.ui.theme.DarkCardHover
import com.example.ui.theme.OnSageGreen
import com.example.ui.theme.PlayfairDisplayFontFamily
import com.example.ui.theme.SageGreen
import com.example.ui.theme.SageGreenDeep
import com.example.ui.theme.TextLight
import com.example.ui.theme.TextMuted

@Composable
fun TrackCard(
    track: Track,
    isPlayingThis: Boolean,
    onPlayClick: () -> Unit,
    onConvertToMp3: () -> Unit,
    onSaveToMusicClick: () -> Unit,
    onLyricsClick: () -> Unit,
    onDeleteClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isLossless = track.format.uppercase() in listOf("FLAC", "ALAC", "DSD", "DSF", "WAV")
    val infiniteTransition = rememberInfiniteTransition(label = "cassette_spool")
    val spoolRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4500, easing = LinearEasing)
        ),
        label = "spoolRotation"
    )

    Card(
        modifier = modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = if (isPlayingThis) SageGreen else DarkCardBorder,
                shape = RoundedCornerShape(16.dp)
            )
            .shadow(6.dp, RoundedCornerShape(16.dp))
            .testTag("track_card_${track.id}"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = if (isPlayingThis) DarkCardHover else DarkCard),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Cassette Reel Window (54x54)
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF0A0C09))
                    .border(1.dp, Color(0xFF333D2C), RoundedCornerShape(12.dp))
                    .clickable { onPlayClick() },
                contentAlignment = Alignment.Center
            ) {
                if (!track.thumbnailUrl.isNullOrEmpty()) {
                    AsyncImage(
                        model = track.thumbnailUrl,
                        contentDescription = "Cover for ${track.title}",
                        modifier = Modifier.fillMaxWidth(),
                        contentScale = ContentScale.Crop,
                        alpha = 0.45f
                    )
                }

                // Rotating Cassette Spool
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(Color(0xCC11140E))
                        .border(2.dp, SageGreen, CircleShape)
                        .rotate(if (isPlayingThis) spoolRotation else 0f),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "✦",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFE2C986)
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Cassette Tape Label Metadata
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 6.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(if (isPlayingThis) SageGreen else Color(0xFF3B4335))
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = track.title,
                        fontSize = 15.sp,
                        fontFamily = PlayfairDisplayFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = if (isPlayingThis) SageGreen else TextLight,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "${track.artist} · ${track.formattedDuration}",
                    fontSize = 11.sp,
                    color = TextMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(5.dp))

                // Single Clean Tape Type Badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isLossless) SageGreenDeep else Color(0xFF141712))
                        .border(
                            1.dp,
                            if (isLossless) Color(0xFF3A4832) else DarkCardBorder,
                            RoundedCornerShape(6.dp)
                        )
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = track.audiophileBadge,
                        fontSize = 9.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isLossless) SageGreen else Color(0xFFE2C986)
                    )
                }
            }

            // Tactile Cassette Deck Transport Keys
            Column(
                verticalArrangement = Arrangement.spacedBy(6.dp),
                horizontalAlignment = Alignment.End
            ) {
                // Play / Pause Cassette Key
                Box(
                    modifier = Modifier
                        .shadow(3.dp, RoundedCornerShape(8.dp))
                        .clip(RoundedCornerShape(8.dp))
                        .background(SageGreen)
                        .border(1.dp, Color(0xFFE8F7DC), RoundedCornerShape(8.dp))
                        .clickable { onPlayClick() }
                        .padding(horizontal = 12.dp, vertical = 5.dp)
                        .testTag("play_button_${track.id}"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isPlayingThis) "❚❚ PAUSE" else "▶ PLAY",
                        color = OnSageGreen,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }

                // Secondary Cassette Keys Bank (Lyrics, Save, Eject)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .shadow(2.dp, RoundedCornerShape(7.dp))
                            .clip(RoundedCornerShape(7.dp))
                            .background(DarkCardHover)
                            .border(1.dp, Color(0xFF47543D), RoundedCornerShape(7.dp))
                            .clickable { onLyricsClick() }
                            .padding(horizontal = 7.dp, vertical = 4.dp)
                            .testTag("lyrics_button_${track.id}"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "♪",
                            color = SageGreen,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Box(
                        modifier = Modifier
                            .shadow(2.dp, RoundedCornerShape(7.dp))
                            .clip(RoundedCornerShape(7.dp))
                            .background(DarkCardHover)
                            .border(1.dp, Color(0xFF47543D), RoundedCornerShape(7.dp))
                            .clickable { onSaveToMusicClick() }
                            .padding(horizontal = 7.dp, vertical = 4.dp)
                            .testTag("save_button_${track.id}"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "⤓",
                            color = Color(0xFFE2C986),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Box(
                        modifier = Modifier
                            .shadow(2.dp, RoundedCornerShape(7.dp))
                            .clip(RoundedCornerShape(7.dp))
                            .background(DarkCardHover)
                            .border(1.dp, DarkCardBorder, RoundedCornerShape(7.dp))
                            .clickable { onDeleteClick() }
                            .padding(horizontal = 7.dp, vertical = 4.dp)
                            .testTag("delete_button_${track.id}"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "✕",
                            color = TextMuted,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}
