package com.example.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.data.model.AudiophileFormat
import com.example.ui.components.DownloadDialog
import com.example.ui.components.FullPlayerDialog
import com.example.ui.components.LyricsDialog
import com.example.ui.components.NowPlayingBar
import com.example.ui.components.TrackCard
import com.example.ui.components.YouTubeBrowserSheet
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
import kotlin.math.sin

@Composable
fun OgmApp(
    viewModel: MainViewModel,
    modifier: Modifier = Modifier
) {
    val tracks by viewModel.tracks.collectAsState()
    val playerState by viewModel.playerState.collectAsState()
    val isDownloading by viewModel.isDownloading.collectAsState()
    val downloadProgress by viewModel.downloadProgress.collectAsState()
    val downloadStatus by viewModel.downloadStatus.collectAsState()
    val showDownloadDialog by viewModel.showDownloadDialog.collectAsState()
    val showYouTubeBrowser by viewModel.showYouTubeBrowser.collectAsState()
    val showFullPlayer by viewModel.showFullPlayer.collectAsState()
    val selectedTrackForLyrics by viewModel.selectedTrackForLyrics.collectAsState()
    val userMessage by viewModel.userMessage.collectAsState()
    val prefilledUrl by viewModel.prefilledUrl.collectAsState()

    val snackbarHostState = remember { SnackbarHostState() }

    val infiniteTransition = rememberInfiniteTransition(label = "gramophone_vibes")
    val discRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 14000, easing = LinearEasing)
        ),
        label = "discRotation"
    )
    val vuPhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 6.28318f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 950, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "vuPhase"
    )

    LaunchedEffect(userMessage) {
        userMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearUserMessage()
        }
    }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris: List<Uri> ->
        uris.forEach { uri ->
            viewModel.importLocalAudio(uri, null)
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = DarkBg,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            AnimatedVisibility(
                visible = playerState.currentTrack != null,
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut()
            ) {
                NowPlayingBar(
                    playerState = playerState,
                    onTogglePlayPause = { viewModel.player.togglePlayPause() },
                    onNext = { viewModel.player.next() },
                    onPrevious = { viewModel.player.previous() },
                    onToggleShuffle = { viewModel.player.toggleShuffle() },
                    onSeek = { viewModel.player.seekTo(it) },
                    onBarClick = { viewModel.openFullPlayer() }
                )
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .statusBarsPadding()
        ) {
            // Gramophone Header & Cassette Tuner Key
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .shadow(8.dp, RoundedCornerShape(13.dp), ambientColor = SageGreen, spotColor = Color.Black)
                            .clip(RoundedCornerShape(13.dp))
                            .background(Color(0xFF141813))
                            .border(1.dp, Color(0x55B8D99E), RoundedCornerShape(13.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.ic_ogm_logo),
                            contentDescription = "Open Grace Music Gramophone",
                            modifier = Modifier
                                .size(48.dp)
                                .rotate(if (playerState.isPlaying) discRotation else 0f)
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(if (playerState.isPlaying) SageGreen else Color(0xFFE2C986))
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Open Grace Music",
                                fontSize = 21.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = com.example.ui.theme.ItalianaFontFamily,
                                color = TextLight,
                                letterSpacing = 0.75.sp
                            )
                        }
                        Text(
                            text = "GRAMOPHONE & MASTER CASSETTE DECK",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFE2C986),
                            letterSpacing = 0.8.sp
                        )
                    }
                }

                // Tactile Cassette Deck YouTube Tuner Key
                Box(
                    modifier = Modifier
                        .shadow(4.dp, RoundedCornerShape(10.dp))
                        .clip(RoundedCornerShape(10.dp))
                        .background(DarkCardHover)
                        .border(1.dp, Color(0xFF4A583F), RoundedCornerShape(10.dp))
                        .clickable { viewModel.openYouTubeBrowser() }
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .testTag("youtube_browser_btn"),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(SageGreen)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "▶ TUNER",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = SageGreen
                        )
                    }
                }
            }

            // Gramophone Turntable & Analog VU Sanctuary Hero Card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp)
                    .shadow(10.dp, RoundedCornerShape(22.dp))
                    .clip(RoundedCornerShape(22.dp))
                    .background(DarkCard)
                    .border(1.dp, DarkCardBorder, RoundedCornerShape(22.dp))
                    .padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "“Your music. Your quiet place.”",
                            fontSize = 18.sp,
                            fontStyle = FontStyle.Italic,
                            fontWeight = FontWeight.Bold,
                            fontFamily = PlayfairDisplayFontFamily,
                            color = TextLight
                        )

                        Spacer(modifier = Modifier.height(6.dp))

                        Text(
                            text = playerState.currentTrack?.let { "♪ ${it.title}" }
                                ?: "♪ FLAC 24-BIT · ALAC · DSD · MP3",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFE2C986),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        // Live Analog VU Spectrum Ribbon
                        Row(
                            modifier = Modifier
                                .fillMaxWidth(0.92f)
                                .height(26.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFF0A0C09))
                                .border(1.dp, Color(0xFF283022), RoundedCornerShape(8.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            verticalAlignment = Alignment.Bottom
                        ) {
                            for (i in 0 until 18) {
                                val h = if (playerState.isPlaying) {
                                    val w1 = sin(vuPhase + i * 0.45f)
                                    val w2 = sin(vuPhase * 1.5f - i * 0.3f)
                                    ((w1 + w2 + 2f) / 4f).coerceIn(0.22f, 1.0f)
                                } else {
                                    0.22f + (i % 3) * 0.08f
                                }
                                Box(
                                    modifier = Modifier
                                        .width(4.dp)
                                        .height((18f * h).dp)
                                        .clip(RoundedCornerShape(2.dp))
                                        .background(
                                            if (h > 0.74f) Color(0xFFE2C986) else SageGreen
                                        )
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    // Rotating Gramophone Disc Centerpiece
                    Box(
                        modifier = Modifier
                            .size(84.dp)
                            .shadow(12.dp, CircleShape, ambientColor = SageGreen, spotColor = Color.Black)
                            .clip(CircleShape)
                            .background(Color(0xFF121611))
                            .border(2.dp, SageGreen.copy(alpha = 0.65f), CircleShape)
                            .clickable {
                                if (playerState.currentTrack != null) {
                                    viewModel.openFullPlayer()
                                } else if (tracks.isNotEmpty()) {
                                    viewModel.playTrack(tracks.first())
                                }
                            }
                            .rotate(if (playerState.isPlaying) discRotation else 0f),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.ic_ogm_logo),
                            contentDescription = "Gramophone Vinyl Disc",
                            modifier = Modifier.size(84.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Tactile Cassette Deck Transport Key Bank
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF0B0D0A))
                        .border(1.dp, Color(0xFF262C22), RoundedCornerShape(14.dp))
                        .padding(6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Cassette Key 1: EJECT / IMPORT AUDIO
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .shadow(4.dp, RoundedCornerShape(9.dp))
                            .clip(RoundedCornerShape(9.dp))
                            .background(SageGreen)
                            .border(1.dp, Color(0xFFE8F7DC), RoundedCornerShape(9.dp))
                            .clickable { filePickerLauncher.launch("audio/*") }
                            .padding(vertical = 11.dp)
                            .testTag("importBtn"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "⏏ IMPORT AUDIO",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = OnSageGreen
                        )
                    }

                    // Cassette Key 2: RECORD FROM URL
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .shadow(4.dp, RoundedCornerShape(9.dp))
                            .clip(RoundedCornerShape(9.dp))
                            .background(DarkCardHover)
                            .border(1.dp, Color(0xFF515E47), RoundedCornerShape(9.dp))
                            .clickable { viewModel.openDownloadDialog() }
                            .padding(vertical = 11.dp)
                            .testTag("urlBtn"),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFFF59E0B))
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "⏺ RECORD URL",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextLight
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (tracks.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 20.dp, vertical = 20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(22.dp))
                            .background(DarkCard)
                            .border(1.dp, DarkCardBorder, RoundedCornerShape(22.dp))
                            .padding(28.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(76.dp)
                                .clip(CircleShape)
                                .background(SageGreenDeep)
                                .border(1.5.dp, SageGreen.copy(alpha = 0.5f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "♪",
                                fontSize = 36.sp,
                                color = SageGreen
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        Text(
                            text = "Insert Your First Master Tape",
                            fontSize = 18.sp,
                            fontFamily = PlayfairDisplayFontFamily,
                            fontWeight = FontWeight.Bold,
                            color = TextLight
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        Box(
                            modifier = Modifier
                                .shadow(4.dp, RoundedCornerShape(10.dp))
                                .clip(RoundedCornerShape(10.dp))
                                .background(SageGreen)
                                .border(1.dp, Color(0xFFE8F7DC), RoundedCornerShape(10.dp))
                                .clickable { viewModel.scanDeviceMusic() }
                                .padding(horizontal = 20.dp, vertical = 11.dp)
                                .testTag("scan_phone_btn"),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "⏏ SCAN PHONE MUSIC",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = OnSageGreen
                            )
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("trackGrid"),
                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(tracks, key = { it.id }) { track ->
                        val isPlayingThis = playerState.currentTrack?.id == track.id && playerState.isPlaying
                        TrackCard(
                            track = track,
                            isPlayingThis = isPlayingThis,
                            onPlayClick = { viewModel.playTrack(track) },
                            onConvertToMp3 = {
                                viewModel.startDownload(
                                    url = track.uriString,
                                    saveToMusicFolder = true,
                                    targetFormat = AudiophileFormat.FLAC_24
                                )
                            },
                            onSaveToMusicClick = { viewModel.saveTrackToDeviceMusic(track) },
                            onLyricsClick = { viewModel.openLyrics(track) },
                            onDeleteClick = { viewModel.deleteTrack(track) }
                        )
                    }

                    item {
                        Spacer(modifier = Modifier.height(96.dp))
                    }
                }
            }
        }
    }

    if (showDownloadDialog) {
        DownloadDialog(
            isDownloading = isDownloading,
            downloadProgress = downloadProgress,
            downloadStatus = downloadStatus,
            initialUrl = prefilledUrl,
            onDismiss = { viewModel.closeDownloadDialog() },
            onStartDownload = { url, saveToMusic, format, capturedStream, capturedHeaders ->
                viewModel.startDownload(
                    url = url,
                    saveToMusicFolder = saveToMusic,
                    targetFormat = format,
                    bitrateKbps = format.bitrateKbps,
                    capturedStreamUrl = capturedStream,
                    streamHeaders = capturedHeaders
                )
            },
            onOpenYouTubeBrowser = { targetUrl ->
                viewModel.closeDownloadDialog()
                viewModel.openYouTubeBrowser(targetUrl)
            }
        )
    }

    if (showYouTubeBrowser) {
        YouTubeBrowserSheet(
            initialUrl = prefilledUrl,
            onClose = { viewModel.closeYouTubeBrowser() },
            onConvertVideo = { videoUrl, capturedStream, capturedHeaders ->
                viewModel.startDownload(
                    url = videoUrl,
                    saveToMusicFolder = true,
                    targetFormat = AudiophileFormat.FLAC_24,
                    capturedStreamUrl = capturedStream,
                    streamHeaders = capturedHeaders
                )
            }
        )
    }

    if (showFullPlayer && playerState.currentTrack != null) {
        FullPlayerDialog(
            playerState = playerState,
            onClose = { viewModel.closeFullPlayer() },
            onTogglePlayPause = { viewModel.player.togglePlayPause() },
            onNext = { viewModel.player.next() },
            onPrevious = { viewModel.player.previous() },
            onSeek = { viewModel.player.seekTo(it) },
            onToggleShuffle = { viewModel.player.toggleShuffle() },
            onCycleLoop = { viewModel.player.cycleLoopMode() },
            onSetSpeed = { viewModel.player.setSpeed(it) },
            onSaveToDeviceMusic = { viewModel.saveTrackToDeviceMusic(it) },
            onSelectQueueItem = { viewModel.player.setQueueAndPlay(playerState.queue, it) }
        )
    }

    if (selectedTrackForLyrics != null) {
        LyricsDialog(
            track = selectedTrackForLyrics!!,
            onDismiss = { viewModel.closeLyrics() }
        )
    }
}
