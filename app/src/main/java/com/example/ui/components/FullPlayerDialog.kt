package com.example.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FolderSpecial
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.example.R
import com.example.data.model.Track
import com.example.player.LoopMode
import com.example.player.PlayerState
import com.example.ui.theme.CinzelFontFamily
import com.example.ui.theme.DarkBg
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
import kotlin.math.sin

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FullPlayerDialog(
    playerState: PlayerState,
    onClose: () -> Unit,
    onTogglePlayPause: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    onSeek: (Long) -> Unit,
    onToggleShuffle: () -> Unit,
    onCycleLoop: () -> Unit,
    onSetSpeed: (Float) -> Unit,
    onSaveToDeviceMusic: (Track) -> Unit,
    onSelectQueueItem: (Int) -> Unit
) {
    val track = playerState.currentTrack ?: return
    var showQueueSheet by remember { mutableStateOf(false) }

    val infiniteTransition = rememberInfiniteTransition(label = "disc_and_eq")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 14000, easing = LinearEasing)
        ),
        label = "rotation"
    )

    val eqPhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 6.28318f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "eq_phase"
    )

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = DarkBg
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 22.dp, vertical = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Top Header Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onClose,
                        modifier = Modifier.testTag("full_player_close")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close Player",
                            tint = TextLight
                        )
                    }

                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "GRAMOPHONE MASTER DECK",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = CinzelFontFamily,
                            color = Color(0xFFE2C986),
                            letterSpacing = 1.4.sp
                        )
                        Text(
                            text = track.audiophileBadge,
                            fontSize = 10.sp,
                            color = SageGreen
                        )
                    }

                    IconButton(onClick = { showQueueSheet = true }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.QueueMusic,
                            contentDescription = "Cassette Rack",
                            tint = TextLight
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Rotating Gramophone Disc Platter
                Box(
                    modifier = Modifier
                        .size(232.dp)
                        .shadow(22.dp, CircleShape, ambientColor = SageGreen, spotColor = Color.Black)
                        .clip(CircleShape)
                        .background(Color(0xFF141812))
                        .border(3.dp, SageGreen.copy(alpha = 0.55f), CircleShape)
                        .rotate(if (playerState.isPlaying) rotation else 0f),
                    contentAlignment = Alignment.Center
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_ogm_logo),
                        contentDescription = "Gramophone Vinyl Disc",
                        modifier = Modifier.fillMaxSize()
                    )

                    if (!track.thumbnailUrl.isNullOrEmpty()) {
                        Box(
                            modifier = Modifier
                                .size(82.dp)
                                .clip(CircleShape)
                                .border(2.dp, Color(0xFFF6E7B2), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            AsyncImage(
                                model = track.thumbnailUrl,
                                contentDescription = "Album Art",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .background(DarkBg)
                            .border(2.dp, Color(0xFFF6E7B2), CircleShape)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Analog VU Frequency Equalizer Window
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF0A0C09))
                        .border(1.dp, Color(0xFF2E3729), RoundedCornerShape(14.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                        .testTag("visual_frequency_equalizer")
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "♪ ANALOG VU SPECTRUM",
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFE2C986),
                            letterSpacing = 1.sp
                        )
                        Text(
                            text = "${track.sampleRateLabel} · ${track.bitDepthLabel}",
                            fontSize = 9.5.sp,
                            color = SageGreen
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(36.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.Bottom
                    ) {
                        val barCount = 28
                        for (i in 0 until barCount) {
                            val normalizedHeight = if (playerState.isPlaying) {
                                val wave1 = sin(eqPhase + i * 0.45f)
                                val wave2 = sin(eqPhase * 1.7f - i * 0.3f)
                                val wave3 = sin(eqPhase * 0.85f + i * 0.7f)
                                ((wave1 + wave2 + wave3 + 3f) / 6f).coerceIn(0.18f, 1.0f)
                            } else {
                                0.16f
                            }
                            Box(
                                modifier = Modifier
                                    .width(5.5.dp)
                                    .height((36f * normalizedHeight).dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(
                                        when {
                                            normalizedHeight > 0.76f -> Color(0xFFE2C986)
                                            normalizedHeight > 0.45f -> SageGreen
                                            else -> SageGreen.copy(alpha = 0.45f)
                                        }
                                    )
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Track Title & Artist
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = track.title,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = PlayfairDisplayFontFamily,
                        color = TextLight,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = track.artist,
                        fontSize = 13.sp,
                        color = Color(0xFFE2C986),
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (!track.savedToDeviceMusic) {
                            FilterChip(
                                selected = false,
                                onClick = { onSaveToDeviceMusic(track) },
                                label = { Text("⤓ Save Master", fontSize = 11.sp, color = TextLight) },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Default.FolderSpecial,
                                        contentDescription = null,
                                        tint = SageGreen,
                                        modifier = Modifier.size(14.dp)
                                    )
                                },
                                colors = FilterChipDefaults.filterChipColors(
                                    containerColor = DarkCard,
                                    labelColor = TextLight
                                ),
                                border = FilterChipDefaults.filterChipBorder(
                                    enabled = true,
                                    selected = false,
                                    borderColor = DarkCardBorder
                                )
                            )
                        }

                        val speeds = listOf(0.75f, 1.0f, 1.25f, 1.5f)
                        val nextSpeed = speeds[(speeds.indexOf(playerState.playbackSpeed) + 1) % speeds.size]
                        FilterChip(
                            selected = playerState.playbackSpeed != 1.0f,
                            onClick = { onSetSpeed(nextSpeed) },
                            label = { Text("PITCH ${playerState.playbackSpeed}x", fontSize = 11.sp) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.FastForward,
                                    contentDescription = null,
                                    tint = SageGreen,
                                    modifier = Modifier.size(14.dp)
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                containerColor = DarkCard,
                                selectedContainerColor = SageGreenDeep,
                                labelColor = TextLight,
                                selectedLabelColor = SageGreen
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = playerState.playbackSpeed != 1.0f,
                                borderColor = DarkCardBorder
                            )
                        )
                    }
                }

                // Seekbar & Times
                Column(modifier = Modifier.fillMaxWidth()) {
                    var isUserSeeking by remember { mutableStateOf(false) }
                    var sliderPos by remember { mutableFloatStateOf(0f) }

                    Slider(
                        value = if (isUserSeeking) sliderPos else playerState.progress,
                        onValueChange = {
                            isUserSeeking = true
                            sliderPos = it
                        },
                        onValueChangeFinished = {
                            isUserSeeking = false
                            val newMs = (sliderPos * playerState.durationMs).toLong()
                            onSeek(newMs)
                        },
                        colors = SliderDefaults.colors(
                            thumbColor = SageGreen,
                            activeTrackColor = SageGreen,
                            inactiveTrackColor = DarkCardHover
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("full_player_seek_slider")
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = playerState.formattedCurrentTime,
                            fontSize = 11.5.sp,
                            color = TextMuted
                        )
                        Text(
                            text = playerState.formattedDuration,
                            fontSize = 11.5.sp,
                            color = TextSubtle
                        )
                    }
                }

                // Tactile Cassette Deck Transport Bank
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFF0B0D0A))
                        .border(1.dp, Color(0xFF262C22), RoundedCornerShape(16.dp))
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Shuffle Key
                    Box(
                        modifier = Modifier
                            .weight(0.8f)
                            .shadow(3.dp, RoundedCornerShape(9.dp))
                            .clip(RoundedCornerShape(9.dp))
                            .background(if (playerState.isShuffle) SageGreenDeep else DarkCardHover)
                            .border(1.dp, if (playerState.isShuffle) SageGreen else Color(0xFF47543D), RoundedCornerShape(9.dp))
                            .clickable { onToggleShuffle() }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "🔀",
                            fontSize = 14.sp,
                            color = if (playerState.isShuffle) SageGreen else TextMuted
                        )
                    }

                    // REW Key
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .shadow(4.dp, RoundedCornerShape(9.dp))
                            .clip(RoundedCornerShape(9.dp))
                            .background(DarkCardHover)
                            .border(1.dp, Color(0xFF47543D), RoundedCornerShape(9.dp))
                            .clickable { onPrevious() }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "⏮ REW",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextLight
                        )
                    }

                    // PLAY / PAUSE Master Key
                    Box(
                        modifier = Modifier
                            .weight(1.4f)
                            .shadow(6.dp, RoundedCornerShape(10.dp))
                            .clip(RoundedCornerShape(10.dp))
                            .background(SageGreen)
                            .border(1.dp, Color(0xFFE8F7DC), RoundedCornerShape(10.dp))
                            .clickable { onTogglePlayPause() }
                            .padding(vertical = 13.dp)
                            .testTag("full_player_play_pause"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (playerState.isPlaying) "❚❚ PAUSE" else "▶ PLAY",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = OnSageGreen
                        )
                    }

                    // FF Key
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .shadow(4.dp, RoundedCornerShape(9.dp))
                            .clip(RoundedCornerShape(9.dp))
                            .background(DarkCardHover)
                            .border(1.dp, Color(0xFF47543D), RoundedCornerShape(9.dp))
                            .clickable { onNext() }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "FF ⏭",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextLight
                        )
                    }

                    // Loop Key
                    Box(
                        modifier = Modifier
                            .weight(0.8f)
                            .shadow(3.dp, RoundedCornerShape(9.dp))
                            .clip(RoundedCornerShape(9.dp))
                            .background(if (playerState.loopMode != LoopMode.OFF) SageGreenDeep else DarkCardHover)
                            .border(1.dp, if (playerState.loopMode != LoopMode.OFF) SageGreen else Color(0xFF47543D), RoundedCornerShape(9.dp))
                            .clickable { onCycleLoop() }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (playerState.loopMode == LoopMode.ONE) "🔂" else "🔁",
                            fontSize = 14.sp,
                            color = if (playerState.loopMode != LoopMode.OFF) SageGreen else TextMuted
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))
            }
        }
    }

    if (showQueueSheet) {
        ModalBottomSheet(
            onDismissRequest = { showQueueSheet = false },
            containerColor = DarkCard
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Text(
                    text = "Cassette Rack (${playerState.queue.size})",
                    fontSize = 18.sp,
                    fontFamily = PlayfairDisplayFontFamily,
                    fontWeight = FontWeight.Bold,
                    color = TextLight
                )
                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp)
                ) {
                    itemsIndexed(playerState.queue) { idx, qTrack ->
                        val isCurrent = idx == playerState.currentIndex
                        Card(
                            onClick = {
                                onSelectQueueItem(idx)
                                showQueueSheet = false
                            },
                            colors = CardDefaults.cardColors(
                                containerColor = if (isCurrent) SageGreenDeep else Color.Transparent
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${idx + 1}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isCurrent) SageGreen else TextSubtle,
                                    modifier = Modifier.width(28.dp)
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = qTrack.title,
                                        fontSize = 13.sp,
                                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                                        color = TextLight,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "${qTrack.artist} · ${qTrack.audiophileBadge}",
                                        fontSize = 11.sp,
                                        color = TextMuted,
                                        maxLines = 1
                                    )
                                }
                                Text(
                                    text = qTrack.formattedDuration,
                                    fontSize = 11.sp,
                                    color = TextSubtle
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
