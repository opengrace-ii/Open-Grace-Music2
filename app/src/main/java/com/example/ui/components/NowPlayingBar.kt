package com.example.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.example.player.PlayerState
import com.example.ui.OgmBrandEmblem
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
fun NowPlayingBar(
    playerState: PlayerState,
    onTogglePlayPause: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    onToggleShuffle: () -> Unit,
    onSeek: (Long) -> Unit,
    onBarClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val track = playerState.currentTrack ?: return
    var isSeeking by remember { mutableStateOf(false) }
    var seekFraction by remember { mutableFloatStateOf(0f) }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .testTag("now_playing_bar"),
        color = DarkCard,
        border = BorderStroke(1.dp, DarkCardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Row 1: Track Info (Thumbnail, Title, Status)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onBarClick() },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp),
                    contentAlignment = Alignment.Center
                ) {
                    OgmBrandEmblem(
                        isPlaying = playerState.isPlaying,
                        size = 44.dp
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = track.title,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextLight,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "${playerState.formattedDuration} · ${if (track.savedToDeviceMusic) "saved in music ✓" else "offline ✓"}",
                        fontSize = 11.5.sp,
                        color = TextMuted,
                        maxLines = 1
                    )
                }
            }

            // Row 2: Controls (Shuffle, Prev, Play 52dp circle, Next)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Shuffle Button
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .clickable { onToggleShuffle() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "🔀",
                        fontSize = 17.sp,
                        color = if (playerState.isShuffle) SageGreen else TextMuted
                    )
                }

                Spacer(modifier = Modifier.width(20.dp))

                // Previous Button
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .clickable { onPrevious() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "⏮",
                        fontSize = 18.sp,
                        color = TextLight
                    )
                }

                Spacer(modifier = Modifier.width(20.dp))

                // Big Circular Play Button (52dp, Sage Green, Dark OnSageGreen icon)
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .shadow(8.dp, CircleShape, ambientColor = SageGreen, spotColor = SageGreen)
                        .clip(CircleShape)
                        .background(SageGreen)
                        .clickable { onTogglePlayPause() }
                        .testTag("now_playing_play_pause"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (playerState.isPlaying) "❚❚" else "▶",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = OnSageGreen
                    )
                }

                Spacer(modifier = Modifier.width(20.dp))

                // Next Button
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .clickable { onNext() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "⏭",
                        fontSize = 18.sp,
                        color = TextLight
                    )
                }
            }

            // Row 3: Seekbar (currentTime, slider, durationTime)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = playerState.formattedCurrentTime,
                    fontSize = 11.sp,
                    color = TextSubtle,
                    modifier = Modifier.width(34.dp)
                )

                Slider(
                    value = if (isSeeking) seekFraction else playerState.progress,
                    onValueChange = {
                        isSeeking = true
                        seekFraction = it
                    },
                    onValueChangeFinished = {
                        isSeeking = false
                        val targetMs = (seekFraction * playerState.durationMs).toLong()
                        onSeek(targetMs)
                    },
                    colors = SliderDefaults.colors(
                        thumbColor = SageGreen,
                        activeTrackColor = SageGreen,
                        inactiveTrackColor = DarkCardHover
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .height(24.dp)
                        .padding(horizontal = 4.dp)
                )

                Text(
                    text = playerState.formattedDuration,
                    fontSize = 11.sp,
                    color = TextSubtle,
                    modifier = Modifier.width(34.dp)
                )
            }
        }
    }
}
