package com.example.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.AudiophileFormat
import com.example.ui.components.DownloadDialog
import com.example.ui.components.FullPlayerDialog
import com.example.ui.components.LyricsDialog
import com.example.ui.components.NowPlayingBar
import com.example.ui.components.StorageBanner
import com.example.ui.components.TrackCard
import com.example.ui.components.YouTubeBrowserSheet
import com.example.ui.theme.DarkBg
import com.example.ui.theme.OnSageGreen
import com.example.ui.theme.PlayfairDisplayFontFamily
import com.example.ui.theme.SageGreen
import com.example.ui.theme.SageGreenDeep
import com.example.ui.theme.TextLight
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextSubtle

@Composable
fun OgmApp(
    viewModel: MainViewModel,
    modifier: Modifier = Modifier
) {
    val tracks by viewModel.tracks.collectAsState()
    val storageInfo by viewModel.storageInfo.collectAsState()
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
            // Header (.app-header)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    OgmBrandEmblem(
                        isPlaying = playerState.isPlaying,
                        size = 48.dp,
                        modifier = Modifier.clickable {
                            if (playerState.currentTrack != null) {
                                viewModel.openFullPlayer()
                            } else {
                                viewModel.player.togglePlayPause()
                            }
                        }
                    )

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Text(
                            text = "Open Grace Music",
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = com.example.ui.theme.ItalianaFontFamily,
                            color = TextLight,
                            letterSpacing = 0.75.sp
                        )
                        Text(
                            text = "Audiophile Lossless · FLAC · ALAC · DSD · MP3",
                            fontSize = 11.sp,
                            color = TextMuted
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(SageGreenDeep)
                        .clickable { viewModel.openYouTubeBrowser() }
                        .padding(horizontal = 12.dp, vertical = 7.dp)
                        .testTag("youtube_browser_btn"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "YouTube ➔",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = SageGreen
                    )
                }
            }

            // Headline
            Text(
                text = "Your music. Your quiet place.",
                fontSize = 15.sp,
                fontStyle = FontStyle.Italic,
                fontFamily = PlayfairDisplayFontFamily,
                color = TextLight,
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 2.dp)
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Action Buttons
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .shadow(6.dp, RoundedCornerShape(999.dp), ambientColor = SageGreen, spotColor = SageGreen)
                        .clip(RoundedCornerShape(999.dp))
                        .background(SageGreen)
                        .clickable { filePickerLauncher.launch("audio/*") }
                        .padding(vertical = 12.dp)
                        .testTag("importBtn"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "＋ Import audio files",
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = OnSageGreen
                    )
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(999.dp))
                        .border(1.5.dp, SageGreen, RoundedCornerShape(999.dp))
                        .clickable { viewModel.openDownloadDialog() }
                        .padding(vertical = 11.5.dp)
                        .testTag("urlBtn"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "🔗 Import from URL",
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = SageGreen
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            StorageBanner(
                storageInfo = storageInfo,
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 2.dp)
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Import audio you own or are licensed to use — Lossless FLAC (24-bit/96kHz), ALAC, DSD Hi-Res, WAV, or 320kbps MP3. Your library is saved offline on this Android device.",
                fontSize = 11.5.sp,
                color = TextSubtle,
                lineHeight = 16.sp,
                modifier = Modifier.padding(horizontal = 18.dp)
            )

            Spacer(modifier = Modifier.height(10.dp))

            if (tracks.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 20.dp, vertical = 28.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(92.dp)
                                .clip(CircleShape)
                                .background(SageGreenDeep),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "♪",
                                fontSize = 42.sp,
                                color = SageGreen,
                                fontWeight = FontWeight.Normal
                            )
                        }

                        Spacer(modifier = Modifier.height(18.dp))

                        Text(
                            text = "Your library awaits",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextLight
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "Convert and keep the music you own in studio-grade Lossless FLAC, ALAC, DSD, or MP3. Once saved, tracks play anytime — even offline.",
                            fontSize = 13.5.sp,
                            color = TextMuted,
                            textAlign = TextAlign.Center,
                            lineHeight = 21.sp,
                            modifier = Modifier.padding(horizontal = 20.dp)
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(SageGreenDeep)
                                .clickable { viewModel.scanDeviceMusic() }
                                .padding(horizontal = 18.dp, vertical = 9.dp)
                                .testTag("scan_phone_btn"),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Scan phone Music folder",
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = SageGreen
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
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(tracks, key = { it.id }) { track ->
                        val isPlayingThis = playerState.currentTrack?.id == track.id
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

/**
 * Reusable Audiophile Gramophone & Vinyl Disc Emblem drawn with Jetpack Compose Canvas.
 * Smoothly rotates the vinyl record grooves & golden-sage center label underneath the
 * vintage brass gramophone horn and stylus whenever `isPlaying == true`.
 */
@Composable
fun OgmBrandEmblem(
    isPlaying: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    badgeFrame: Boolean = true
) {
    val infiniteTransition = rememberInfiniteTransition(label = "gramophone_disc_spin")
    val spinDegrees by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 12000, easing = LinearEasing)
        ),
        label = "gramophone_rotation"
    )
    val currentAngle = if (isPlaying) spinDegrees else 0f

    Box(
        modifier = modifier
            .size(size)
            .then(
                if (badgeFrame) {
                    Modifier
                        .shadow(8.dp, RoundedCornerShape(13.dp), ambientColor = SageGreen, spotColor = Color.Black)
                        .clip(RoundedCornerShape(13.dp))
                        .background(Color(0xFF141813))
                        .border(1.dp, Color(0x55B8D99E), RoundedCornerShape(13.dp))
                } else {
                    Modifier
                }
            )
            .testTag("ogm_gramophone_emblem"),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = this.size.width
            val h = this.size.height
            val discCenter = Offset(w * 0.46f, h * 0.54f)
            val discRadius = w * 0.37f

            // 1. Rotating Gramophone Vinyl Disc Layer
            rotate(degrees = currentAngle, pivot = discCenter) {
                drawCircle(
                    color = Color(0xFF121611),
                    radius = discRadius,
                    center = discCenter
                )
                drawCircle(
                    color = Color(0xFFB8D99E).copy(alpha = 0.55f),
                    radius = discRadius,
                    center = discCenter,
                    style = Stroke(width = w * 0.022f)
                )

                // Concentric Golden-Sage Vinyl Grooves
                val grooveFractions = listOf(0.86f, 0.74f, 0.62f, 0.50f)
                grooveFractions.forEachIndexed { idx, frac ->
                    drawCircle(
                        color = if (idx % 2 == 0) Color(0xFFB8D99E).copy(alpha = 0.25f)
                        else Color(0xFFE8D8A0).copy(alpha = 0.22f),
                        radius = discRadius * frac,
                        center = discCenter,
                        style = Stroke(width = w * 0.012f)
                    )
                }

                // Specular Vinyl Sheen Arcs (make rotation visually unmistakable)
                val arcRadius = discRadius * 0.76f
                drawArc(
                    color = Color(0xFFF6E7B2).copy(alpha = 0.42f),
                    startAngle = 210f,
                    sweepAngle = 48f,
                    useCenter = false,
                    topLeft = Offset(discCenter.x - arcRadius, discCenter.y - arcRadius),
                    size = Size(arcRadius * 2f, arcRadius * 2f),
                    style = Stroke(width = w * 0.026f, cap = StrokeCap.Round)
                )
                drawArc(
                    color = Color(0xFFF6E7B2).copy(alpha = 0.36f),
                    startAngle = 30f,
                    sweepAngle = 48f,
                    useCenter = false,
                    topLeft = Offset(discCenter.x - arcRadius, discCenter.y - arcRadius),
                    size = Size(arcRadius * 2f, arcRadius * 2f),
                    style = Stroke(width = w * 0.026f, cap = StrokeCap.Round)
                )

                // Warm Sage-and-Gold Center Record Label
                val labelRadius = discRadius * 0.36f
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0xFFF3E3AD), Color(0xFFB8D99E), Color(0xFF4F6B3E)),
                        center = discCenter,
                        radius = labelRadius
                    ),
                    radius = labelRadius,
                    center = discCenter
                )
                // 4 Cardinal Rotation Dots on Center Label
                val dotDist = labelRadius * 0.68f
                val dotR = w * 0.018f
                drawCircle(Color(0xFF141812), radius = dotR, center = Offset(discCenter.x, discCenter.y - dotDist))
                drawCircle(Color(0xFF141812), radius = dotR, center = Offset(discCenter.x + dotDist, discCenter.y))
                drawCircle(Color(0xFF141812), radius = dotR, center = Offset(discCenter.x, discCenter.y + dotDist))
                drawCircle(Color(0xFF141812), radius = dotR, center = Offset(discCenter.x - dotDist, discCenter.y))

                // Center Spindle Hole
                drawCircle(
                    color = Color(0xFF0E110D),
                    radius = discRadius * 0.09f,
                    center = discCenter
                )
            }

            // 2. Vintage Brass & Golden-Sage Gramophone Horn & Tonearm Overlay
            val pivot = Offset(w * 0.84f, h * 0.41f)
            drawCircle(
                color = Color(0xFFD4B86A),
                radius = w * 0.055f,
                center = pivot
            )
            drawCircle(
                color = Color(0xFF141812),
                radius = w * 0.024f,
                center = pivot
            )

            // Gramophone Horn Bell Path
            val hornPath = Path().apply {
                moveTo(pivot.x, pivot.y)
                cubicTo(
                    w * 0.90f, h * 0.28f,
                    w * 0.78f, h * 0.14f,
                    w * 0.42f, h * 0.11f
                )
                lineTo(w * 0.44f, h * 0.36f)
                cubicTo(
                    w * 0.64f, h * 0.34f,
                    w * 0.78f, h * 0.32f,
                    pivot.x, pivot.y
                )
                close()
            }
            drawPath(
                path = hornPath,
                brush = Brush.linearGradient(
                    colors = listOf(Color(0xFFF6E7B2), Color(0xFFD4B86A), Color(0xFFB8D99E))
                )
            )

            // Horn Acoustic Mouth Opening
            drawOval(
                color = Color(0xFF1C2318),
                topLeft = Offset(w * 0.34f, h * 0.09f),
                size = Size(w * 0.17f, h * 0.28f)
            )
            drawOval(
                color = Color(0xFFF6E7B2),
                topLeft = Offset(w * 0.34f, h * 0.09f),
                size = Size(w * 0.17f, h * 0.28f),
                style = Stroke(width = w * 0.022f)
            )

            // Tonearm & Stylus Needle Riding on Vinyl Grooves
            val elbow = Offset(w * 0.76f, h * 0.62f)
            val stylus = Offset(w * 0.63f, h * 0.69f)
            drawLine(
                color = Color(0xFFE8D8A0),
                start = pivot,
                end = elbow,
                strokeWidth = w * 0.032f,
                cap = StrokeCap.Round
            )
            drawLine(
                color = Color(0xFFE8D8A0),
                start = elbow,
                end = stylus,
                strokeWidth = w * 0.028f,
                cap = StrokeCap.Round
            )
            drawCircle(
                color = if (isPlaying) Color(0xFFB8D99E) else Color(0xFFF6E7B2),
                radius = w * 0.034f,
                center = stylus
            )
        }
    }
}

