package com.example.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
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
            animation = tween(durationMillis = 16000, easing = LinearEasing)
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
                    .padding(horizontal = 24.dp, vertical = 14.dp),
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
                            text = "AUDIOPHILE MASTER TURNTABLE",
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = CinzelFontFamily,
                            color = SageGreen,
                            letterSpacing = 1.2.sp
                        )
                        Text(
                            text = "${track.audiophileBadge} · ${if (track.savedToDeviceMusic) "Saved in Music" else "Offline Ready"}",
                            fontSize = 10.sp,
                            color = TextMuted
                        )
                    }

                    IconButton(onClick = { showQueueSheet = true }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.QueueMusic,
                            contentDescription = "View Queue",
                            tint = TextLight
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Vinyl Record / Album Disc
                Box(
                    modifier = Modifier
                        .size(236.dp)
                        .shadow(20.dp, CircleShape, ambientColor = SageGreen, spotColor = Color.Black)
                        .clip(CircleShape)
                        .background(Color(0xFF151915))
                        .border(4.dp, Color(0xFF263024), CircleShape)
                        .rotate(if (playerState.isPlaying) rotation else 0f),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(190.dp)
                            .border(1.dp, Color(0xFF1E251D), CircleShape)
                    )
                    Box(
                        modifier = Modifier
                            .size(145.dp)
                            .border(1.dp, Color(0xFF1E251D), CircleShape)
                    )

                    Box(
                        modifier = Modifier
                            .size(96.dp)
                            .clip(CircleShape)
                            .background(SageGreenDeep),
                        contentAlignment = Alignment.Center
                    ) {
                        if (!track.thumbnailUrl.isNullOrEmpty()) {
                            AsyncImage(
                                model = track.thumbnailUrl,
                                contentDescription = "Album Art",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        } else {
                            Text(
                                text = track.initials,
                                fontSize = 26.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = SageGreen
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .background(DarkBg)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Real-Time Visual Frequency Equalizer Bars
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(DarkCard)
                        .border(1.dp, DarkCardBorder, RoundedCornerShape(14.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                        .testTag("visual_frequency_equalizer")
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "LIVE VISUAL FREQUENCY EQUALIZER",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = SageGreen,
                            letterSpacing = 1.sp
                        )
                        Text(
                            text = "${track.sampleRateLabel} / ${track.bitDepthLabel} · ${track.bitrateKbps} kbps",
                            fontSize = 9.sp,
                            color = TextSubtle
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(38.dp),
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
                                0.15f
                            }
                            Box(
                                modifier = Modifier
                                    .width(5.5.dp)
                                    .height((38f * normalizedHeight).dp)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(
                                        when {
                                            normalizedHeight > 0.78f -> SageGreen
                                            normalizedHeight > 0.48f -> SageGreen.copy(alpha = 0.75f)
                                            else -> SageGreen.copy(alpha = 0.45f)
                                        }
                                    )
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        listOf("32Hz", "125Hz", "500Hz", "2kHz", "8kHz", "24kHz", "96kHz").forEach { band ->
                            Text(
                                text = band,
                                fontSize = 8.sp,
                                color = TextSubtle
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
                        fontSize = 19.sp,
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
                        fontSize = 13.5.sp,
                        color = TextMuted,
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
                                label = { Text("Save to Music Folder", fontSize = 11.sp, color = TextLight) },
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
                            label = { Text("${playerState.playbackSpeed}x", fontSize = 11.sp) },
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
                            fontSize = 12.sp,
                            color = TextSubtle
                        )
                        Text(
                            text = playerState.formattedDuration,
                            fontSize = 12.sp,
                            color = TextSubtle
                        )
                    }
                }

                // Main Playback Controls
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onToggleShuffle,
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Shuffle,
                            contentDescription = "Shuffle",
                            tint = if (playerState.isShuffle) SageGreen else TextSubtle,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    IconButton(
                        onClick = onPrevious,
                        modifier = Modifier.size(52.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.SkipPrevious,
                            contentDescription = "Previous Track",
                            tint = TextLight,
                            modifier = Modifier.size(32.dp)
                        )
                    }

                    IconButton(
                        onClick = onTogglePlayPause,
                        modifier = Modifier
                            .size(72.dp)
                            .shadow(12.dp, CircleShape, ambientColor = SageGreen, spotColor = SageGreen)
                            .clip(CircleShape)
                            .background(SageGreen)
                            .testTag("full_player_play_pause")
                    ) {
                        Icon(
                            imageVector = if (playerState.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (playerState.isPlaying) "Pause" else "Play",
                            tint = OnSageGreen,
                            modifier = Modifier.size(38.dp)
                        )
                    }

                    IconButton(
                        onClick = onNext,
                        modifier = Modifier.size(52.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.SkipNext,
                            contentDescription = "Next Track",
                            tint = TextLight,
                            modifier = Modifier.size(32.dp)
                        )
                    }

                    IconButton(
                        onClick = onCycleLoop,
                        modifier = Modifier.size(44.dp)
                    ) {
                        val (icon, tint) = when (playerState.loopMode) {
                            LoopMode.OFF -> Icons.Default.Repeat to TextSubtle
                            LoopMode.ALL -> Icons.Default.Repeat to SageGreen
                            LoopMode.ONE -> Icons.Default.RepeatOne to SageGreen
                        }
                        Icon(
                            imageVector = icon,
                            contentDescription = "Repeat Mode",
                            tint = tint,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
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
                    text = "Playing Queue (${playerState.queue.size} songs)",
                    fontSize = 18.sp,
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
