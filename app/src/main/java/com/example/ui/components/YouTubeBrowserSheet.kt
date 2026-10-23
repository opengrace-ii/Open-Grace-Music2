package com.example.ui.components

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.downloader.YouTubeStreamResolver
import com.example.ui.theme.DarkBg
import com.example.ui.theme.DarkCard
import com.example.ui.theme.DarkCardBorder
import com.example.ui.theme.OnSageGreen
import com.example.ui.theme.SageGreen
import com.example.ui.theme.SageGreenDeep
import com.example.ui.theme.TextLight
import com.example.ui.theme.TextMuted

class WebAppBridge(
    private val onUrlChanged: (url: String, title: String) -> Unit
) {
    @JavascriptInterface
    fun reportUrl(url: String, title: String) {
        onUrlChanged(url, title)
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun YouTubeBrowserSheet(
    initialUrl: String? = null,
    onClose: () -> Unit,
    onConvertVideo: (url: String, capturedStreamUrl: String?, capturedHeaders: Map<String, String>?) -> Unit
) {
    val context = LocalContext.current
    val startingUrl = remember(initialUrl) {
        if (!initialUrl.isNullOrBlank()) {
            val id = YouTubeStreamResolver.extractYouTubeId(initialUrl)
            if (id != null) "https://m.youtube.com/watch?v=$id" else initialUrl
        } else {
            "https://m.youtube.com"
        }
    }

    var currentUrl by remember { mutableStateOf(startingUrl) }
    var currentTitle by remember { mutableStateOf("YouTube Music & Videos") }
    var detectedVideoId by remember { mutableStateOf(YouTubeStreamResolver.extractYouTubeId(startingUrl)) }
    var pageProgress by remember { mutableFloatStateOf(0f) }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }
    var capturedStreamUrl by remember { mutableStateOf<String?>(null) }
    var capturedHeaders by remember { mutableStateOf<Map<String, String>?>(null) }

    fun processUrl(url: String) {
        currentUrl = url
        val id = YouTubeStreamResolver.extractYouTubeId(url)
        if (id != null) {
            if (id != detectedVideoId) {
                detectedVideoId = id
                capturedStreamUrl = null
                capturedHeaders = null
            }
        } else if (url.contains("/results") || url.endsWith("youtube.com/") || url.contains("m.youtube.com/?")) {
            detectedVideoId = null
            capturedStreamUrl = null
            capturedHeaders = null
        }
    }

    fun copyCurrentVideoUrl() {
        if (detectedVideoId != null) {
            val cleanUrl = YouTubeStreamResolver.canonicalWatchUrl(detectedVideoId!!)
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("YouTube Video URL", cleanUrl)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(context, "✓ Copied YouTube link:\n$cleanUrl", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(context, "Please open and play a video first to copy its link", Toast.LENGTH_SHORT).show()
        }
    }

    BackHandler {
        if (webViewInstance?.canGoBack() == true) {
            webViewInstance?.goBack()
        } else {
            onClose()
        }
    }

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
            ) {
                // Top Navigation Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(DarkCard)
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onClose) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close Browser",
                            tint = TextLight
                        )
                    }

                    IconButton(
                        onClick = { webViewInstance?.goBack() },
                        enabled = webViewInstance?.canGoBack() == true
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = if (webViewInstance?.canGoBack() == true) TextLight else TextMuted
                        )
                    }

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 6.dp)
                    ) {
                        Text(
                            text = currentTitle,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextLight,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (detectedVideoId != null) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(SageGreenDeep)
                                        .padding(horizontal = 5.dp, vertical = 1.dp)
                                ) {
                                    Text(
                                        text = "VIDEO DETECTED",
                                        fontSize = 8.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = SageGreen
                                    )
                                }
                                Spacer(modifier = Modifier.width(6.dp))
                            }
                            Text(
                                text = if (detectedVideoId != null) {
                                    "youtube.com/watch?v=$detectedVideoId"
                                } else {
                                    currentUrl.take(45)
                                },
                                fontSize = 10.sp,
                                color = if (detectedVideoId != null) SageGreen else TextMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }

                    // Direct Copy Button
                    IconButton(
                        onClick = { copyCurrentVideoUrl() },
                        modifier = Modifier.testTag("copy_yt_url_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.ContentCopy,
                            contentDescription = "Copy YouTube URL",
                            tint = SageGreen
                        )
                    }

                    IconButton(onClick = { webViewInstance?.reload() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = TextLight
                        )
                    }

                    // Header Save Button if video detected
                    if (detectedVideoId != null) {
                        val videoUrl = YouTubeStreamResolver.canonicalWatchUrl(detectedVideoId!!)
                        Button(
                            onClick = { onConvertVideo(videoUrl, capturedStreamUrl, capturedHeaders) },
                            colors = ButtonDefaults.buttonColors(containerColor = SageGreen),
                            shape = RoundedCornerShape(999.dp),
                            modifier = Modifier
                                .padding(start = 4.dp)
                                .testTag("header_convert_btn")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Download,
                                contentDescription = null,
                                tint = OnSageGreen,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Record to Library", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = OnSageGreen)
                        }
                    }
                }

                // Loading bar
                if (pageProgress in 0.01f..0.99f) {
                    LinearProgressIndicator(
                        progress = { pageProgress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(2.dp),
                        color = SageGreen
                    )
                }

                // Main Webview
                Box(modifier = Modifier.weight(1f)) {
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

                                addJavascriptInterface(
                                    WebAppBridge { url, title ->
                                        post {
                                            if (url.isNotBlank()) {
                                                processUrl(url)
                                            }
                                            if (title.isNotBlank() && !title.equals("YouTube", ignoreCase = true)) {
                                                currentTitle = title
                                            }
                                        }
                                    },
                                    "AndroidBridge"
                                )

                                webViewClient = object : WebViewClient() {
                                    override fun doUpdateVisitedHistory(view: WebView?, url: String?, isReload: Boolean) {
                                        super.doUpdateVisitedHistory(view, url, isReload)
                                        url?.let { processUrl(it) }
                                    }

                                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                        url?.let { processUrl(it) }
                                    }

                                    override fun onPageFinished(view: WebView?, url: String?) {
                                        url?.let { processUrl(it) }
                                        view?.title?.let {
                                            if (it.isNotBlank() && !it.equals("YouTube", ignoreCase = true)) {
                                                currentTitle = it
                                            }
                                        }

                                        // Inject SPA navigation and player observer
                                        view?.evaluateJavascript(
                                            """
                                            (function() {
                                                if (window._ogmBridgeAttached) return;
                                                window._ogmBridgeAttached = true;

                                                function checkAndUpdate() {
                                                    var href = window.location.href;
                                                    var t = document.title;

                                                    try {
                                                        var pr = window.ytInitialPlayerResponse;
                                                        if (pr && pr.videoDetails && pr.videoDetails.videoId) {
                                                            href = 'https://www.youtube.com/watch?v=' + pr.videoDetails.videoId;
                                                            if (pr.videoDetails.title) t = pr.videoDetails.title;
                                                        }
                                                    } catch(e) {}

                                                    if (window.AndroidBridge) {
                                                        window.AndroidBridge.reportUrl(href, t);
                                                    }
                                                }

                                                window.addEventListener('yt-navigate-finish', checkAndUpdate);
                                                window.addEventListener('yt-page-data-updated', checkAndUpdate);
                                                window.addEventListener('popstate', checkAndUpdate);

                                                var origPush = history.pushState;
                                                history.pushState = function() {
                                                    origPush.apply(this, arguments);
                                                    setTimeout(checkAndUpdate, 150);
                                                };

                                                var origRepl = history.replaceState;
                                                history.replaceState = function() {
                                                    origRepl.apply(this, arguments);
                                                    setTimeout(checkAndUpdate, 150);
                                                };

                                                setInterval(checkAndUpdate, 800);
                                            })();
                                            """.trimIndent(),
                                            null
                                        )
                                    }

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

                                webChromeClient = object : WebChromeClient() {
                                    override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                        pageProgress = newProgress / 100f
                                    }

                                    override fun onReceivedTitle(view: WebView?, title: String?) {
                                        title?.let {
                                            if (it.isNotBlank() && !it.equals("YouTube", ignoreCase = true)) {
                                                currentTitle = it
                                            }
                                        }
                                    }
                                }

                                loadUrl(startingUrl)
                                webViewInstance = this
                            }
                        },
                        modifier = Modifier.fillMaxSize()
                    )

                    // Bottom action bar — always visible while browsing
                    val videoUrl = detectedVideoId?.let { YouTubeStreamResolver.canonicalWatchUrl(it) }
                    Card(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(14.dp)
                            .testTag("convert_current_video_card"),
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = DarkCard),
                        border = androidx.compose.foundation.BorderStroke(1.dp, DarkCardBorder),
                        elevation = CardDefaults.cardElevation(defaultElevation = 10.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp)
                        ) {
                            if (detectedVideoId != null && videoUrl != null) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.PlayArrow,
                                        contentDescription = null,
                                        tint = SageGreen,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = currentTitle,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextLight,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                                Text(
                                    text = videoUrl,
                                    fontSize = 11.sp,
                                    color = SageGreen,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.padding(vertical = 4.dp)
                                )
                            } else {
                                Text(
                                    text = "Browse YouTube — open a video to copy or record it",
                                    fontSize = 12.sp,
                                    color = TextMuted,
                                    modifier = Modifier.padding(bottom = 4.dp)
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { copyCurrentVideoUrl() },
                                    enabled = detectedVideoId != null,
                                    shape = RoundedCornerShape(999.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TextLight),
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("copy_detected_url_btn")
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.ContentCopy,
                                        contentDescription = null,
                                        tint = SageGreen,
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Copy URL", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                }

                                Button(
                                    onClick = {
                                        if (videoUrl != null) {
                                            onConvertVideo(videoUrl, capturedStreamUrl, capturedHeaders)
                                        }
                                    },
                                    enabled = detectedVideoId != null,
                                    colors = ButtonDefaults.buttonColors(containerColor = SageGreen),
                                    shape = RoundedCornerShape(999.dp),
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("convert_current_video_button")
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Download,
                                        contentDescription = null,
                                        tint = OnSageGreen,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        "Record to Library",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = OnSageGreen
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
