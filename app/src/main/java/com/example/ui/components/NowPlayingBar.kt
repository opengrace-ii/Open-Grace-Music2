package com.example.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
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
import com.example.player.PlayerState
import com.example.ui.theme.DarkCard
import com.example.ui.theme.DarkCardBorder
import com.example.ui.theme.DarkCardHover
import com.example.ui.theme.OnSageGreen
import com.example.ui.theme.PlayfairDisplayFontFamily
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

    val infiniteTransition = rememberInfiniteTransition(label = "bar_disc")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 12000, easing = LinearEasing)
        ),
        label = "rotation"
    )

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
            // Row 1: Spinning Gramophone Disc + Track Title + Cassette Transport Keys
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onBarClick() },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(SageGreenDeep)
                        .border(1.5.dp, SageGreen, CircleShape)
                        .rotate(if (playerState.isPlaying) rotation else 0f),
                    contentAlignment = Alignment.Center
                ) {
                    if (!track.thumbnailUrl.isNullOrEmpty()) {
                        AsyncImage(
                            model = track.thumbnailUrl,
                            contentDescription = "Cover",
                            modifier = Modifier.fillMaxWidth(),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Text(
                            text = "♪",
                            fontSize = 19.sp,
                            fontWeight = FontWeight.Bold,
                            color = SageGreen
                        )
                    }
                }

                Spacer(modifier = Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = track.title,
                        fontSize = 14.sp,
                        fontFamily = PlayfairDisplayFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = TextLight,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "${track.artist} · ${track.format}",
                        fontSize = 11.sp,
                        color = Color(0xFFE2C986),
                        maxLines = 1
                    )
                }

                // Compact Cassette Deck Transport Bank
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(11.dp))
                        .background(Color(0xFF0B0D0A))
                        .border(1.dp, Color(0xFF262C22), RoundedCornerShape(11.dp))
                        .padding(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(7.dp))
                            .background(DarkCardHover)
                            .border(1.dp, Color(0xFF47543D), RoundedCornerShape(7.dp))
                            .clickable { onPrevious() }
                            .padding(horizontal = 9.dp, vertical = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = "⏮", fontSize = 13.sp, color = TextLight)
                    }

                    Box(
                        modifier = Modifier
                            .shadow(4.dp, RoundedCornerShape(7.dp))
                            .clip(RoundedCornerShape(7.dp))
                            .background(SageGreen)
                            .border(1.dp, Color(0xFFE8F7DC), RoundedCornerShape(7.dp))
                            .clickable { onTogglePlayPause() }
                            .padding(horizontal = 12.dp, vertical = 6.dp)
                            .testTag("now_playing_play_pause"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (playerState.isPlaying) "❚❚" else "▶",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = OnSageGreen
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(7.dp))
                            .background(DarkCardHover)
                            .border(1.dp, Color(0xFF47543D), RoundedCornerShape(7.dp))
                            .clickable { onNext() }
                            .padding(horizontal = 9.dp, vertical = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = "⏭", fontSize = 13.sp, color = TextLight)
                    }
                }
            }

            // Row 2: Analog Tape Scrubber
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = playerState.formattedCurrentTime,
                    fontSize = 10.5.sp,
                    color = TextMuted,
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
                        .height(22.dp)
                        .padding(horizontal = 4.dp)
                )

                Text(
                    text = playerState.formattedDuration,
                    fontSize = 10.5.sp,
                    color = TextSubtle,
                    modifier = Modifier.width(34.dp)
                )
            }
        }
    }
}
