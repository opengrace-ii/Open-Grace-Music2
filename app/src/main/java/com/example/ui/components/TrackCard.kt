package com.example.ui.components

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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.data.LyricsGenerator
import com.example.data.model.StorageStatus
import com.example.data.model.Track
import com.example.ui.theme.BadgeAmber
import com.example.ui.theme.BadgeAmberBg
import com.example.ui.theme.BadgeGreen
import com.example.ui.theme.BadgeGreenBg
import com.example.ui.theme.DarkCard
import com.example.ui.theme.DarkCardBorder
import com.example.ui.theme.DarkCardHover
import com.example.ui.theme.OnSageGreen
import com.example.ui.theme.SageGreen
import com.example.ui.theme.SageGreenDeep
import com.example.ui.theme.TextLight
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextSubtle

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
    val songContent = LyricsGenerator.generate(track.title, track.artist)
    val isLossless = track.format.uppercase() in listOf("FLAC", "ALAC", "DSD", "DSF", "WAV")

    Card(
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, if (isPlayingThis) SageGreen.copy(alpha = 0.5f) else DarkCardBorder, RoundedCornerShape(18.dp))
            .shadow(4.dp, RoundedCornerShape(18.dp))
            .testTag("track_card_${track.id}"),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = if (isPlayingThis) DarkCardHover else DarkCard),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Track Cover (54x54)
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(SageGreenDeep),
                contentAlignment = Alignment.Center
            ) {
                if (!track.thumbnailUrl.isNullOrEmpty()) {
                    AsyncImage(
                        model = track.thumbnailUrl,
                        contentDescription = "Cover for ${track.title}",
                        modifier = Modifier.fillMaxWidth(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Text(
                        text = track.initials,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        color = SageGreen
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Track Body
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 6.dp)
            ) {
                Text(
                    text = track.title,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextLight,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = track.formattedDuration,
                        fontSize = 11.5.sp,
                        color = TextMuted
                    )
                    Text(
                        text = "·",
                        fontSize = 11.5.sp,
                        color = TextSubtle
                    )
                    Text(
                        text = track.formattedSize,
                        fontSize = 11.5.sp,
                        color = TextMuted
                    )

                    // Audiophile Format Chip (FLAC 24-bit, ALAC, DSD, MP3)
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (isLossless) SageGreenDeep else DarkCardBorder)
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = track.audiophileBadge,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isLossless) SageGreen else TextMuted
                        )
                    }

                    // Status Chip
                    val isPersistent = track.storageStatus == StorageStatus.PERSISTENT || track.savedToDeviceMusic
                    val chipBg = if (isPersistent) BadgeGreenBg else BadgeAmberBg
                    val chipColor = if (isPersistent) BadgeGreen else BadgeAmber
                    val chipText = if (isPersistent) "● PERSISTENT" else "◐ DEVICE"

                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(chipBg)
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = chipText,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = chipColor
                        )
                    }
                }
            }

            // Track Actions
            Column(
                verticalArrangement = Arrangement.spacedBy(5.dp),
                horizontalAlignment = Alignment.End
            ) {
                // Play Button
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(SageGreen)
                        .clickable { onPlayClick() }
                        .padding(horizontal = 11.dp, vertical = 5.dp)
                        .testTag("play_button_${track.id}"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isPlayingThis) "❚❚ Pause" else "▶ Play",
                        color = OnSageGreen,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Lyrics / Chords Button
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(DarkCardHover)
                        .border(1.dp, DarkCardBorder, RoundedCornerShape(10.dp))
                        .clickable { onLyricsClick() }
                        .padding(horizontal = 8.dp, vertical = 5.dp)
                        .testTag("lyrics_button_${track.id}"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (songContent.isInstrumental) "🎸 Chords" else "🎤 Lyrics",
                        color = SageGreen,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                // Save & Delete Row
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(DarkCardHover)
                            .border(1.dp, DarkCardBorder, RoundedCornerShape(10.dp))
                            .clickable { onSaveToMusicClick() }
                            .padding(horizontal = 8.dp, vertical = 5.dp)
                            .testTag("save_button_${track.id}"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "⤓ Save",
                            color = TextLight,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(DarkCardHover)
                            .border(1.dp, DarkCardBorder, RoundedCornerShape(10.dp))
                            .clickable { onDeleteClick() }
                            .padding(horizontal = 7.dp, vertical = 5.dp)
                            .testTag("delete_button_${track.id}"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "✕",
                            color = TextMuted,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}
