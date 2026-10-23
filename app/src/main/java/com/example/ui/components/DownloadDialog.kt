package com.example.ui.components

import android.annotation.SuppressLint
import android.content.ClipboardManager
import android.content.Context
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.example.data.downloader.YouTubeStreamResolver
import com.example.data.model.AudiophileFormat
import com.example.ui.theme.DarkCard
import com.example.ui.theme.DarkCardBorder
import com.example.ui.theme.DarkCardHover
import com.example.ui.theme.OnSageGreen
import com.example.ui.theme.SageGreen
import com.example.ui.theme.SageGreenDeep
import com.example.ui.theme.TextLight
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextSubtle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

sealed interface LinkValidationResult {
    data object Empty : LinkValidationResult
    data object Invalid : LinkValidationResult
    data class ValidYouTube(
        val videoId: String,
        val canonicalUrl: String,
        val title: String? = null,
        val author: String? = null,
        val thumbnailUrl: String? = null,
        val isLoadingMetadata: Boolean = false
    ) : LinkValidationResult
    data class ValidDirectAudio(val url: String) : LinkValidationResult
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DownloadDialog(
    isDownloading: Boolean,
    downloadProgress: Float,
    downloadStatus: String,
    initialUrl: String? = null,
    onDismiss: () -> Unit,
    onStartDownload: (url: String, saveToMusic: Boolean, format: AudiophileFormat, capturedStreamUrl: String?, capturedHeaders: Map<String, String>?) -> Unit,
    onOpenYouTubeBrowser: (targetUrl: String?) -> Unit
) {
    val context = LocalContext.current
    var urlInput by remember(initialUrl) { mutableStateOf(initialUrl ?: "") }
    var selectedFormat by remember { mutableStateOf(AudiophileFormat.FLAC_24) }
    var rightsChecked by remember { mutableStateOf(true) }
    var saveToMusicFolder by remember { mutableStateOf(true) }
    var clipboardSuggestion by remember { mutableStateOf<String?>(null) }
    var showPreviewPlayer by remember { mutableStateOf(true) }

    var validationResult by remember { mutableStateOf<LinkValidationResult>(LinkValidationResult.Empty) }
    var capturedStreamUrl by remember { mutableStateOf<String?>(null) }
    var capturedHeaders by remember { mutableStateOf<Map<String, String>?>(null) }
    var previewWebView by remember { mutableStateOf<WebView?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            try {
                previewWebView?.stopLoading()
                previewWebView?.destroy()
            } catch (_: Exception) {}
            previewWebView = null
        }
    }

    LaunchedEffect(Unit) {
        try {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val item = clipboard.primaryClip?.getItemAt(0)?.text?.toString()?.trim()
            if (!item.isNullOrEmpty() && (item.contains("youtube.com") || item.contains("youtu.be") || item.startsWith("http"))) {
                clipboardSuggestion = item
            }
        } catch (_: Exception) {}
    }

    // Live URL Link Validator
    LaunchedEffect(urlInput) {
        val trimmed = urlInput.trim()
        if (trimmed.isEmpty()) {
            validationResult = LinkValidationResult.Empty
            capturedStreamUrl = null
            capturedHeaders = null
            return@LaunchedEffect
        }

        val ytId = YouTubeStreamResolver.extractYouTubeId(trimmed)
        if (ytId != null) {
            val canonical = YouTubeStreamResolver.canonicalWatchUrl(ytId)
            val initialValidation = LinkValidationResult.ValidYouTube(
                videoId = ytId,
                canonicalUrl = canonical,
                isLoadingMetadata = true
            )
            validationResult = initialValidation

            withContext(Dispatchers.IO) {
                try {
                    val client = OkHttpClient()
                    val req = Request.Builder()
                        .url("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=$ytId&format=json")
                        .header("User-Agent", YouTubeStreamResolver.DEFAULT_USER_AGENT)
                        .build()
                    val resp = client.newCall(req).execute()
                    if (resp.isSuccessful) {
                        val body = resp.body?.string()
                        if (!body.isNullOrEmpty()) {
                            val json = JSONObject(body)
                            val title = json.optString("title", "YouTube Track $ytId")
                            val author = json.optString("author_name", "Open Grace Music")
                            val thumb = json.optString("thumbnail_url", "https://img.youtube.com/vi/$ytId/hqdefault.jpg")

                            withContext(Dispatchers.Main) {
                                validationResult = LinkValidationResult.ValidYouTube(
                                    videoId = ytId,
                                    canonicalUrl = canonical,
                                    title = title,
                                    author = author,
                                    thumbnailUrl = thumb,
                                    isLoadingMetadata = false
                                )
                            }
                        }
                    }
                } catch (_: Exception) {
                    withContext(Dispatchers.Main) {
                        validationResult = LinkValidationResult.ValidYouTube(
                            videoId = ytId,
                            canonicalUrl = canonical,
                            title = "YouTube Video ($ytId)",
                            author = "YouTube",
                            thumbnailUrl = "https://img.youtube.com/vi/$ytId/hqdefault.jpg",
                            isLoadingMetadata = false
                        )
                    }
                }
            }
        } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            validationResult = LinkValidationResult.ValidDirectAudio(trimmed)
        } else {
            validationResult = LinkValidationResult.Invalid
        }
    }

    Dialog(
        onDismissRequest = { if (!isDownloading) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = DarkCard),
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .border(1.dp, DarkCardBorder, RoundedCornerShape(22.dp))
                .shadow(28.dp, RoundedCornerShape(22.dp))
                .testTag("urlDialog")
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(9.dp))
                                .background(SageGreenDeep),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("♪", color = SageGreen, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Audiophile Lossless Converter",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextLight
                            )
                            Text(
                                text = "FLAC 24-bit · ALAC · DSD Hi-Res · MP3 320k",
                                fontSize = 11.sp,
                                color = TextMuted
                            )
                        }
                    }

                    IconButton(
                        onClick = { if (!isDownloading) onDismiss() },
                        enabled = !isDownloading
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = TextMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // URL Input Field with Paste button
                Text(
                    text = "PASTE YOUTUBE OR AUDIO LINK",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextSubtle,
                    letterSpacing = 0.5.sp
                )

                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(DarkCardHover)
                        .border(1.dp, DarkCardBorder, RoundedCornerShape(12.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        if (urlInput.isEmpty()) {
                            Text(
                                text = "https://www.youtube.com/watch?v=...",
                                fontSize = 13.sp,
                                color = TextSubtle,
                                maxLines = 1
                            )
                        }
                        BasicTextField(
                            value = urlInput,
                            onValueChange = { urlInput = it },
                            textStyle = TextStyle(fontSize = 13.5.sp, color = TextLight),
                            cursorBrush = SolidColor(SageGreen),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("urlInput"),
                            enabled = !isDownloading
                        )
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(DarkCardBorder)
                            .clickable(enabled = !isDownloading) {
                                try {
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    val text = clipboard.primaryClip?.getItemAt(0)?.text?.toString()?.trim()
                                    if (!text.isNullOrEmpty()) {
                                        urlInput = text
                                    }
                                } catch (_: Exception) {}
                            }
                            .padding(horizontal = 10.dp, vertical = 7.dp)
                            .testTag("paste_button"),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.ContentPaste,
                                contentDescription = null,
                                tint = SageGreen,
                                modifier = Modifier.size(13.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Paste",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = SageGreen
                            )
                        }
                    }
                }

                // Clipboard suggestion chip
                if (!clipboardSuggestion.isNullOrEmpty() && urlInput.isEmpty()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(SageGreenDeep)
                            .clickable {
                                urlInput = clipboardSuggestion ?: ""
                            }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "📋 Paste link from clipboard: ${clipboardSuggestion?.take(34)}...",
                            fontSize = 11.sp,
                            color = SageGreen,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // AUDIOPHILE FORMAT SELECTOR
                Text(
                    text = "AUDIOPHILE MASTER FORMAT",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextSubtle,
                    letterSpacing = 0.5.sp
                )
                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    AudiophileFormat.entries.forEach { fmt ->
                        val isSelected = selectedFormat == fmt
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (isSelected) SageGreen else DarkCardHover)
                                .border(
                                    width = 1.dp,
                                    color = if (isSelected) SageGreen else DarkCardBorder,
                                    shape = RoundedCornerShape(10.dp)
                                )
                                .clickable(enabled = !isDownloading) { selectedFormat = fmt }
                                .padding(horizontal = 11.dp, vertical = 7.dp)
                                .testTag("format_${fmt.name}")
                        ) {
                            Column {
                                Text(
                                    text = fmt.displayName,
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isSelected) OnSageGreen else TextLight
                                )
                                Text(
                                    text = fmt.specBadge,
                                    fontSize = 9.5.sp,
                                    color = if (isSelected) OnSageGreen.copy(alpha = 0.8f) else TextMuted
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // URL Link Validator Card & Simultaneous Video Preview
                when (val res = validationResult) {
                    is LinkValidationResult.ValidYouTube -> {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = SageGreenDeep),
                            border = androidx.compose.foundation.BorderStroke(1.dp, SageGreen.copy(alpha = 0.35f))
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (!res.thumbnailUrl.isNullOrEmpty()) {
                                    AsyncImage(
                                        model = res.thumbnailUrl,
                                        contentDescription = "Video Thumbnail",
                                        modifier = Modifier
                                            .size(52.dp, 40.dp)
                                            .clip(RoundedCornerShape(6.dp)),
                                        contentScale = ContentScale.Crop
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = SageGreen,
                                        modifier = Modifier.size(22.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = res.title ?: "YouTube Video ID: ${res.videoId}",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextLight,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "${res.author ?: "YouTube"} · ID: ${res.videoId}",
                                        fontSize = 10.5.sp,
                                        color = SageGreen,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                IconButton(
                                    onClick = { showPreviewPlayer = !showPreviewPlayer },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(
                                        imageVector = if (showPreviewPlayer) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                        contentDescription = "Toggle Preview",
                                        tint = SageGreen,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }

                        if (showPreviewPlayer) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(180.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.Black),
                                border = androidx.compose.foundation.BorderStroke(1.dp, DarkCardBorder)
                            ) {
                                AndroidView(
                                    factory = { ctx ->
                                        WebView(ctx).apply {
                                            layoutParams = ViewGroup.LayoutParams(
                                                ViewGroup.LayoutParams.MATCH_PARENT,
                                                ViewGroup.LayoutParams.MATCH_PARENT
                                            )

                                            val cookieManager = CookieManager.getInstance()
                                            cookieManager.setAcceptCookie(true)
                                            cookieManager.setAcceptThirdPartyCookies(this, true)

                                            settings.apply {
                                                javaScriptEnabled = true
                                                domStorageEnabled = true
                                                mediaPlaybackRequiresUserGesture = false
                                                cacheMode = WebSettings.LOAD_DEFAULT
                                                userAgentString = YouTubeStreamResolver.DEFAULT_USER_AGENT
                                            }

                                            webViewClient = object : WebViewClient() {
                                                override fun shouldInterceptRequest(
                                                    view: WebView?,
                                                    request: WebResourceRequest?
                                                ): WebResourceResponse? {
                                                    val reqUrl = request?.url?.toString() ?: ""
                                                    if (reqUrl.contains("googlevideo.com/videoplayback") &&
                                                        (reqUrl.contains("mime=audio") ||
                                                         reqUrl.contains("audio%2F") ||
                                                         reqUrl.contains("itag=140") ||
                                                         reqUrl.contains("itag=251") ||
                                                         reqUrl.contains("itag=171"))
                                                    ) {
                                                        capturedStreamUrl = reqUrl
                                                        capturedHeaders = request?.requestHeaders
                                                    }
                                                    return super.shouldInterceptRequest(view, request)
                                                }
                                            }

                                            loadUrl("https://m.youtube.com/watch?v=${res.videoId}")
                                            previewWebView = this
                                        }
                                    },
                                    update = { wv ->
                                        previewWebView = wv
                                    },
                                    modifier = Modifier.fillMaxWidth().height(180.dp)
                                )
                            }

                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(if (capturedStreamUrl != null) SageGreen else Color(0xFFE5A93C))
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = if (capturedStreamUrl != null) "✓ Master Stream Connected (${selectedFormat.code} Ready)" else "Playing preview & connecting ${selectedFormat.code} stream...",
                                        fontSize = 11.sp,
                                        color = if (capturedStreamUrl != null) SageGreen else TextMuted
                                    )
                                }
                            }
                        }
                    }
                    is LinkValidationResult.ValidDirectAudio -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(SageGreenDeep)
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = SageGreen,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "✓ Valid direct audio link (${selectedFormat.displayName})",
                                fontSize = 11.5.sp,
                                color = SageGreen,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                    is LinkValidationResult.Invalid -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0x33CF6679))
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.ErrorOutline,
                                contentDescription = null,
                                tint = Color(0xFFCF6679),
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Please enter a valid YouTube or direct audio link",
                                fontSize = 11.5.sp,
                                color = Color(0xFFFFB4AB)
                            )
                        }
                    }
                    is LinkValidationResult.Empty -> {
                        Text(
                            text = "Supports youtu.be, youtube.com/watch?v=..., and shorts links.",
                            fontSize = 11.sp,
                            color = TextSubtle
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Save to Phone's Music folder toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Save directly to phone Music folder",
                        fontSize = 12.5.sp,
                        color = TextMuted
                    )
                    Switch(
                        checked = saveToMusicFolder,
                        onCheckedChange = { saveToMusicFolder = it },
                        enabled = !isDownloading,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = OnSageGreen,
                            checkedTrackColor = SageGreen,
                            uncheckedTrackColor = DarkCardHover
                        )
                    )
                }

                // Rights confirmation checkbox
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = rightsChecked,
                        onCheckedChange = { rightsChecked = it },
                        enabled = !isDownloading,
                        colors = CheckboxDefaults.colors(
                            checkedColor = SageGreen,
                            checkmarkColor = OnSageGreen
                        )
                    )
                    Text(
                        text = "I own or have authorized access to download this media.",
                        fontSize = 11.sp,
                        color = TextMuted
                    )
                }

                // Progress Indicator during active download
                if (isDownloading) {
                    Spacer(modifier = Modifier.height(10.dp))
                    LinearProgressIndicator(
                        progress = { downloadProgress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(5.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = SageGreen,
                        trackColor = SageGreenDeep
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = downloadStatus,
                        fontSize = 11.5.sp,
                        color = SageGreen,
                        fontWeight = FontWeight.Medium
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                val isValid = validationResult is LinkValidationResult.ValidYouTube || validationResult is LinkValidationResult.ValidDirectAudio
                val isButtonEnabled = !isDownloading && isValid && rightsChecked

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isButtonEnabled) SageGreen else SageGreen.copy(alpha = 0.35f))
                        .clickable(enabled = isButtonEnabled) {
                            val targetUrl = when (val res = validationResult) {
                                is LinkValidationResult.ValidYouTube -> res.canonicalUrl
                                is LinkValidationResult.ValidDirectAudio -> res.url
                                else -> urlInput.trim()
                            }
                            onStartDownload(targetUrl, saveToMusicFolder, selectedFormat, capturedStreamUrl, capturedHeaders)
                        }
                        .padding(vertical = 13.dp)
                        .testTag("urlOk"),
                    contentAlignment = Alignment.Center
                ) {
                    if (isDownloading) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = OnSageGreen,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Converting ${selectedFormat.code} & Saving...",
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = OnSageGreen
                            )
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Download,
                                contentDescription = null,
                                tint = if (isButtonEnabled) OnSageGreen else TextMuted,
                                modifier = Modifier.size(17.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Convert to ${selectedFormat.code} & Save",
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isButtonEnabled) OnSageGreen else TextMuted
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Cancel",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = TextMuted,
                        modifier = Modifier
                            .clickable(enabled = !isDownloading) { onDismiss() }
                            .padding(vertical = 6.dp)
                            .testTag("urlCancel")
                    )

                    Row(
                        modifier = Modifier
                            .clickable(enabled = !isDownloading) {
                                onOpenYouTubeBrowser(null)
                            }
                            .padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            tint = SageGreen,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Search YouTube in app ➔",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = SageGreen
                        )
                    }
                }
            }
        }
    }
}
