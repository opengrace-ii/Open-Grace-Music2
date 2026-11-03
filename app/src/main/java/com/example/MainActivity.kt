package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.example.data.ConverterServerPrefs
import com.example.data.OgmPublicBase
import com.example.ondevice.AppPlaybackCapture
import com.example.ondevice.DownloadEvents
import com.example.ondevice.OnDeviceDownloadManager
import com.example.ondevice.PlaybackAudioRecorder
import com.example.ondevice.PlaybackCaptureService
import com.example.ondevice.WebViewStreamCapture
import com.example.ondevice.YouTubeSessionStore
import com.example.player.OgmPlaybackService
import org.json.JSONObject
import android.webkit.WebResourceResponse
import java.io.FileInputStream

/**
 * Thin WebView shell that loads the live Open Grace Music PWA (Render by default).
 *
 * Background audio: do **not** call [WebView.onPause] while media is active — that pauses
 * HTML5 / iframe playback. A sticky [OgmPlaybackService] foreground notification keeps the
 * process eligible for media playback when the Activity is minimized.
 *
 * UI / music features come from the live site after Render redeploys — no APK reinstall needed
 * once this WebView shell is installed. On [BuildConfig.VERSION_CODE] change we clear the
 * WebView HTTP cache once so a single shell upgrade is enough for subsequent site deploys.
 */
class MainActivity : ComponentActivity(), OgmPlaybackService.WebPlaybackBridge {

    private lateinit var webView: WebView
    @Volatile
    private var mediaPlaying: Boolean = false
    private var clearedCacheForShellUpgrade = false

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val downloadManager by lazy { OnDeviceDownloadManager(applicationContext) }
    private val projectionResults = java.util.concurrent.LinkedBlockingQueue<Intent?>(1)

    private val downloadEvents = object : DownloadEvents {
        override fun onProgress(callbackId: String, json: JSONObject) = emitDownloadEvent(callbackId, "progress", json.toString())
        override fun onDone(callbackId: String, json: JSONObject) = emitDownloadEvent(callbackId, "done", json.toString())
        override fun onError(callbackId: String, message: String) =
            emitDownloadEvent(callbackId, "error", JSONObject().put("message", message).toString())
    }

    private fun emitDownloadEvent(callbackId: String, event: String, payloadJson: String) {
        val js = "window.__ogmNativeDownload && window.__ogmNativeDownload(" +
            JSONObject.quote(callbackId) + "," + JSONObject.quote(event) + "," + JSONObject.quote(payloadJson) + ");"
        runOnUiThread { runCatching { webView.evaluateJavascript(js, null) } }
    }

    private fun serveLocalDownload(request: WebResourceRequest?): WebResourceResponse? {
        val uri = request?.url ?: return null
        if (!uri.host.equals(OnDeviceDownloadManager.LOCAL_HOST, ignoreCase = true)) return null
        val cors = mapOf(
            "Access-Control-Allow-Origin" to "*",
            "Access-Control-Allow-Methods" to "GET, OPTIONS",
            "Access-Control-Allow-Headers" to "*",
            "Cache-Control" to "no-store",
        )
        if (request.method.equals("OPTIONS", ignoreCase = true)) {
            return WebResourceResponse("text/plain", "utf-8", 204, "No Content", cors, java.io.ByteArrayInputStream(ByteArray(0)))
        }
        val segs = uri.pathSegments
        val found = if (segs.size == 2 && segs[0] == "dl") downloadManager.lookup(segs[1]) else null
        if (found == null) {
            return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", cors, java.io.ByteArrayInputStream(ByteArray(0)))
        }
        val (file, mime) = found
        return WebResourceResponse(
            mime, null, 200, "OK",
            cors + ("Content-Length" to file.length().toString()),
            FileInputStream(file),
        )
    }

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val cb = filePathCallback
            filePathCallback = null
            if (cb == null) return@registerForActivityResult
            val data = result.data
            val uris: Array<Uri>? = if (result.resultCode != RESULT_OK || data == null) {
                null
            } else {
                val list = mutableListOf<Uri>()
                data.clipData?.let { clip ->
                    for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { list.add(it) }
                }
                data.data?.let { if (!list.contains(it)) list.add(it) }
                list.toTypedArray().takeIf { it.isNotEmpty() }
            }
            uris?.forEach { uri ->
                runCatching {
                    contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
            cb.onReceiveValue(uris)
        }

    private val youtubeLoginLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            runCatching { YouTubeSessionStore.harvestAndPersist(this) }
            emitYouTubeSessionToWeb()
        }

    private val playbackCaptureLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            projectionResults.offer(if (result.resultCode == Activity.RESULT_OK) result.data else null)
        }

    private val mediaPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* picker works without it */ }

    private fun launchFileChooser(params: WebChromeClient.FileChooserParams?, cb: ValueCallback<Array<Uri>>): Boolean {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = cb
        val multiple = params?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
        val wantsAudio = params?.acceptTypes.orEmpty().any { it.isBlank() || it.startsWith("audio") || it.startsWith(".") } ||
            params?.acceptTypes.isNullOrEmpty()
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (wantsAudio) "audio/*" else "*/*"
            if (wantsAudio) {
                putExtra(
                    Intent.EXTRA_MIME_TYPES,
                    arrayOf("audio/*", "application/ogg", "application/octet-stream")
                )
                type = "*/*"
            }
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
        }
        return try {
            fileChooserLauncher.launch(Intent.createChooser(intent, "Select music"))
            true
        } catch (e: Exception) {
            filePathCallback = null
            cb.onReceiveValue(null)
            false
        }
    }

    private fun maybeRequestMediaPermission() {
        val perm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
        if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
            mediaPermissionLauncher.launch(perm)
        }
    }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* optional */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        OgmPlaybackService.webBridge = this
        maybeRequestNotificationPermission()
        runCatching {
            val stored = YouTubeSessionStore.loadPersisted(this)
            if (stored.isNotBlank()) YouTubeSessionStore.applyHeaderToCookieManager(stored)
        }
        Thread { runCatching { downloadManager.purgeStale() } }.start()
        downloadManager.playbackCapture = ShellPlaybackCapture()

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.setSupportMultipleWindows(false)
            // Keep media eligible while Activity is backgrounded.
            settings.userAgentString = settings.userAgentString + " OpenGraceMusicAPK/" +
                BuildConfig.VERSION_NAME

            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            addJavascriptInterface(OgmJsBridge(), "OgmAndroid")

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    if (filePathCallback == null) return false
                    return launchFileChooser(fileChooserParams, filePathCallback)
                }

                override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                    // Never let YouTube take over the WebView with a second fullscreen surface.
                    runCatching { callback?.onCustomViewHidden() }
                }

                override fun onHideCustomView() {}
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val url = request?.url?.toString().orEmpty()
                    if (url.isBlank()) return false
                    if (isAppHostedUrl(url) || isYouTubeUrl(url)) {
                        return false
                    }
                    runCatching {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    }
                    return true
                }

                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): android.webkit.WebResourceResponse? {
                    // Side-effect only: remember googlevideo audio URLs the IFrame already loaded.
                    runCatching { WebViewStreamCapture.observe(request) }
                    return serveLocalDownload(request) ?: super.shouldInterceptRequest(view, request)
                }

                override fun onLoadResource(view: WebView?, url: String?) {
                    super.onLoadResource(view, url)
                    runCatching { WebViewStreamCapture.observeUrl(url, emptyMap()) }
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    injectBackgroundAudioBridge()
                    injectServiceWorkerRefresh()
                    emitYouTubeSessionToWeb()
                }
            }

            setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse(url)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                if (URLUtil.isNetworkUrl(url)) {
                    runCatching { startActivity(intent) }
                } else {
                    android.util.Log.d("OgmWebShell", "download $mimeType $contentDisposition $userAgent")
                }
            }
        }

        val root = FrameLayout(this).apply {
            addView(webView)
            ViewCompat.setOnApplyWindowInsetsListener(this) { v, insets ->
                val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                v.updatePadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        }
        setContentView(root)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        )

        clearedCacheForShellUpgrade = maybeClearWebViewCacheForShellUpgrade()
        val startUrl = resolveStartUrl(intent, bustCache = clearedCacheForShellUpgrade)
        webView.loadUrl(startUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val shared = extractSharedText(intent)
        if (!shared.isNullOrBlank()) {
            webView.loadUrl(buildShareDeepLink(shared))
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
        // Soft SW refresh on every open so Render redeploys appear without APK reinstall.
        if (::webView.isInitialized) {
            injectServiceWorkerRefresh()
        }
    }

    /**
     * Critical: [WebView.onPause] pauses HTML5 media. While audio is playing we only pause
     * non-media timers via leaving timers running ([resumeTimers]) and skip [WebView.onPause].
     */
    override fun onPause() {
        if (mediaPlaying) {
            webView.resumeTimers()
            OgmPlaybackService.ensureRunning(this)
        } else {
            // Still avoid killing media that started after last bridge tick.
            webView.resumeTimers()
        }
        // Intentionally do NOT call webView.onPause() — that stops PWA audio.
        super.onPause()
    }

    override fun onStop() {
        if (mediaPlaying) {
            OgmPlaybackService.ensureRunning(this)
            webView.resumeTimers()
        }
        super.onStop()
    }

    override fun onDestroy() {
        OgmPlaybackService.webBridge = null
        if (!mediaPlaying) {
            OgmPlaybackService.stopService(this)
        }
        webView.removeJavascriptInterface("OgmAndroid")
        webView.destroy()
        super.onDestroy()
    }

    override fun onTransportToggle() {
        runOnUiThread {
            webView.evaluateJavascript(
                "(function(){try{if(window.__ogmNativeCommand)window.__ogmNativeCommand('toggle');" +
                    "else if(window.__ogmPlayerEngine)window.__ogmPlayerEngine.togglePlayPause();}" +
                    "catch(e){}})();",
                null
            )
        }
    }

    override fun onTransportNext() {
        runOnUiThread {
            webView.evaluateJavascript(
                "(function(){try{if(window.__ogmNativeCommand)window.__ogmNativeCommand('next');}" +
                    "catch(e){}})();",
                null
            )
        }
    }

    override fun onTransportPrev() {
        runOnUiThread {
            webView.evaluateJavascript(
                "(function(){try{if(window.__ogmNativeCommand)window.__ogmNativeCommand('prev');}" +
                    "catch(e){}})();",
                null
            )
        }
    }

    override fun onTransportStop() {
        runOnUiThread {
            mediaPlaying = false
            webView.evaluateJavascript(
                "(function(){try{if(window.__ogmNativeCommand)window.__ogmNativeCommand('pause');}" +
                    "catch(e){}})();",
                null
            )
        }
    }

    private fun maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /**
     * When the native shell versionCode changes (one reinstall), wipe WebView HTTP cache
     * once so a stuck SW / disk cache cannot keep an old JS bundle. Subsequent site-only
     * deploys rely on SW network-first + [injectServiceWorkerRefresh] instead.
     */
    private fun maybeClearWebViewCacheForShellUpgrade(): Boolean {
        val prefs = getSharedPreferences(PREFS_SHELL, Context.MODE_PRIVATE)
        val lastCode = prefs.getInt(KEY_LAST_VERSION_CODE, -1)
        val current = BuildConfig.VERSION_CODE
        if (lastCode == current) return false
        runCatching {
            webView.clearCache(false)
            android.util.Log.i(
                "OgmWebShell",
                "cleared WebView cache after shell upgrade $lastCode → $current"
            )
        }
        prefs.edit().putInt(KEY_LAST_VERSION_CODE, current).apply()
        return true
    }

    /** Ask the PWA service worker to update and activate; reload once if a waiting worker takes over. */
    private fun injectServiceWorkerRefresh() {
        val script = """
            (function(){
              if (!('serviceWorker' in navigator)) return;
              try {
                if (!window.__ogmSwControllerHooked) {
                  window.__ogmSwControllerHooked = true;
                  navigator.serviceWorker.addEventListener('controllerchange', function(){
                    if (window.__ogmSwReloading) return;
                    window.__ogmSwReloading = true;
                    window.location.reload();
                  });
                }
                navigator.serviceWorker.getRegistration().then(function(reg){
                  if (!reg) return;
                  try { reg.update(); } catch (e) {}
                  if (reg.waiting) {
                    try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
                  }
                  if (reg.installing) {
                    reg.installing.addEventListener('statechange', function(){
                      if (reg.waiting) {
                        try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
                      }
                    });
                  }
                });
              } catch (e) {}
            })();
        """.trimIndent()
        runCatching { webView.evaluateJavascript(script, null) }
    }

    /** Notify the PWA of session status only — cookie values stay on the JS bridge getter. */
    private fun emitYouTubeSessionToWeb() {
        if (!::webView.isInitialized) return
        val status = YouTubeSessionStore.status(this)
        val js = "window.__ogmYouTubeSession && window.__ogmYouTubeSession(" +
            JSONObject().put("status", status).toString() + ");"
        runOnUiThread { runCatching { webView.evaluateJavascript(js, null) } }
    }

    private fun injectBackgroundAudioBridge() {
        val script = """
            (function(){
              if (window.__ogmBgBridgeInstalled) return;
              window.__ogmBgBridgeInstalled = true;
              function report(playing, title, artist) {
                try {
                  if (window.OgmAndroid && window.OgmAndroid.onPlaybackState) {
                    window.OgmAndroid.onPlaybackState(!!playing, title || '', artist || '');
                  }
                } catch (e) {}
              }
              function hookEl(el) {
                if (!el || el.__ogmHooked) return;
                el.__ogmHooked = true;
                el.addEventListener('play', function(){
                  report(true, document.title || 'Open Grace Music', '');
                });
                el.addEventListener('playing', function(){
                  report(true, document.title || 'Open Grace Music', '');
                });
                el.addEventListener('pause', function(){
                  report(false, document.title || 'Open Grace Music', '');
                });
                el.addEventListener('ended', function(){
                  report(false, document.title || 'Open Grace Music', '');
                });
              }
              function scan() {
                try {
                  document.querySelectorAll('audio,video').forEach(hookEl);
                } catch (e) {}
              }
              scan();
              try {
                new MutationObserver(scan).observe(document.documentElement, {childList:true, subtree:true});
              } catch (e) {}
              setInterval(function(){
                try {
                  var list = Array.prototype.slice.call(document.querySelectorAll('audio,video'));
                  var playing = list.some(function(m){ return !m.paused && !m.ended; });
                  if (playing) report(true, document.title || 'Open Grace Music', '');
                } catch (e) {}
              }, 2500);
              if (!window.__ogmNativeCommand) {
                window.__ogmNativeCommand = function(cmd) {
                  try {
                    var eng = window.__ogmPlayerEngine;
                    if (eng) {
                      if (cmd === 'toggle') eng.togglePlayPause();
                      else if (cmd === 'pause') {
                        if (eng.htmlAudio && !eng.htmlAudio.paused) eng.htmlAudio.pause();
                        else eng.togglePlayPause();
                      }
                      return;
                    }
                    var medias = Array.prototype.slice.call(document.querySelectorAll('audio,video'));
                    if (cmd === 'toggle' || cmd === 'pause') {
                      var active = medias.find(function(m){ return !m.paused; });
                      if (active) active.pause();
                      else {
                        var ready = medias.find(function(m){ return m.readyState >= 2; }) || medias[0];
                        if (ready && ready.play) ready.play();
                      }
                    }
                  } catch (e) {}
                };
              }
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private inner class OgmJsBridge {
        @JavascriptInterface
        fun requestMediaPermission() {
            runOnUiThread { maybeRequestMediaPermission() }
        }

        @JavascriptInterface
        fun supportsFilePicker(): Boolean = true

        /** Web layer feature-detects this; true means downloadYouTubeAudio is usable. */
        @JavascriptInterface
        fun supportsOnDeviceDownload(): Boolean = true

        @JavascriptInterface
        fun shellVersion(): String = BuildConfig.VERSION_NAME

        /**
         * Opens real Google / YouTube pages in a WebView. We never collect passwords
         * on our own form.
         */
        @JavascriptInterface
        fun startYouTubeLogin() {
            runOnUiThread {
                youtubeLoginLauncher.launch(Intent(this@MainActivity, YouTubeLoginActivity::class.java))
            }
        }

        @JavascriptInterface
        fun hasYouTubeSession(): Boolean =
            YouTubeSessionStore.status(this@MainActivity) == YouTubeSessionStore.STATUS_CONNECTED

        @JavascriptInterface
        fun youtubeSessionStatus(): String = YouTubeSessionStore.status(this@MainActivity)

        @JavascriptInterface
        fun getYouTubeCookieHeader(): String = YouTubeSessionStore.mergedCookieHeader(this@MainActivity)

        @JavascriptInterface
        fun clearYouTubeSession() {
            YouTubeSessionStore.clearSession(this@MainActivity)
            runOnUiThread { emitYouTubeSessionToWeb() }
        }

        /** Watch id currently playing in the PWA IFrame — used to bind googlevideo intercepts. */
        @JavascriptInterface
        fun setPlayingYouTubeId(videoId: String?) {
            WebViewStreamCapture.setCurrentlyPlaying(videoId)
        }

        /**
         * Capture + download the exact video's audio on this phone. Prefers the googlevideo
         * URL the WebView already loaded. Results arrive via
         * window.__ogmNativeDownload(callbackId, 'progress'|'done'|'error', jsonString).
         */
        @JavascriptInterface
        fun downloadYouTubeAudio(videoId: String?, format: String?, callbackId: String?) {
            val cb = callbackId?.takeIf { it.isNotBlank() } ?: return
            val id = videoId.orEmpty().trim()
            WebViewStreamCapture.setRequested(id)
            downloadManager.start(id, cb, downloadEvents)
        }

        @JavascriptInterface
        fun cancelDownload(callbackId: String?) {
            callbackId?.let { downloadManager.cancel(it) }
        }

        /** Delete the cached file once the web layer has stored its blob. */
        @JavascriptInterface
        fun releaseDownload(token: String?) {
            token?.let { downloadManager.release(it) }
        }

        @JavascriptInterface
        fun onPlaybackState(playing: Boolean, title: String?, artist: String?) {
            runOnUiThread {
                mediaPlaying = playing
                val t = title?.takeIf { it.isNotBlank() } ?: "Open Grace Music"
                val a = artist?.takeIf { it.isNotBlank() } ?: "Open Grace Music"
                if (playing) {
                    OgmPlaybackService.updateNotification(this@MainActivity, t, a, true)
                } else {
                    OgmPlaybackService.updateNotification(this@MainActivity, t, a, false)
                }
            }
        }
    }

    private inner class ShellPlaybackCapture : AppPlaybackCapture {
        override fun recordPlayingAppAudio(
            videoId: String,
            cancelled: java.util.concurrent.atomic.AtomicBoolean,
            onProgress: (percent: Int, message: String) -> Unit,
        ): AppPlaybackCapture.Result? {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
            projectionResults.clear()
            val mpm = getSystemService(MediaProjectionManager::class.java) ?: return null
            runOnUiThread {
                runCatching { playbackCaptureLauncher.launch(mpm.createScreenCaptureIntent()) }
            }
            val data = try {
                projectionResults.poll(60, java.util.concurrent.TimeUnit.SECONDS)
            } catch (_: InterruptedException) {
                null
            } ?: return null
            if (cancelled.get()) return null
            if (!PlaybackCaptureService.startAndAwait(this@MainActivity)) return null
            val projection = runCatching { mpm.getMediaProjection(Activity.RESULT_OK, data) }.getOrNull()
                ?: return null
            val dest = java.io.File(downloadManager.dir, "cap-${System.currentTimeMillis().toString(36)}.m4a")
            val durationHint = queryPlayerDurationMs().coerceAtLeast(0L)
            val started = System.currentTimeMillis()
            return try {
                onProgress(14, "Recording this app’s playing audio…")
                PlaybackAudioRecorder.recordToM4a(
                    projection,
                    dest,
                    cancelled,
                    {
                        cancelled.get() ||
                            (durationHint > 8_000L && System.currentTimeMillis() - started > durationHint + 2_000L)
                    },
                ) { elapsed ->
                    val pct = if (durationHint > 0) {
                        (14 + (elapsed * 70 / durationHint)).toInt().coerceIn(14, 86)
                    } else {
                        20
                    }
                    onProgress(pct, "Recording this app’s audio… ${elapsed / 1000}s")
                }
                if (!dest.exists() || dest.length() < 50_000L) return null
                AppPlaybackCapture.Result(dest, ((System.currentTimeMillis() - started) / 1000).toInt())
            } catch (_: Exception) {
                dest.delete()
                null
            } finally {
                runCatching { projection.stop() }
                PlaybackCaptureService.stop(this@MainActivity)
            }
        }

        private fun queryPlayerDurationMs(): Long {
            val latch = java.util.concurrent.CountDownLatch(1)
            val box = java.util.concurrent.atomic.AtomicLong(0)
            runOnUiThread {
                if (!::webView.isInitialized) {
                    latch.countDown()
                    return@runOnUiThread
                }
                webView.evaluateJavascript(
                    "(function(){try{var e=window.__ogmPlayerEngine;var d=e&&e.getDuration?e.getDuration():0;return Math.round(d||0);}catch(e){return 0;}})()",
                ) { raw ->
                    val sec = raw?.trim()?.removeSurrounding("\"")?.toDoubleOrNull() ?: 0.0
                    box.set((sec * 1000.0).toLong())
                    latch.countDown()
                }
            }
            latch.await(3, java.util.concurrent.TimeUnit.SECONDS)
            return box.get()
        }
    }

    private fun resolveStartUrl(intent: Intent?, bustCache: Boolean = false): String {
        val shared = extractSharedText(intent)
        if (!shared.isNullOrBlank()) {
            return buildShareDeepLink(shared)
        }
        val base = publicBaseUrl()
        if (!bustCache) return base
        val sep = if (base.contains('?')) '&' else '?'
        return base + sep + "_ogmShell=" + BuildConfig.VERSION_CODE
    }

    private fun publicBaseUrl(): String {
        val fromPrefs = runCatching {
            ConverterServerPrefs.resolveBaseUrl(this)
        }.getOrNull().orEmpty()
        val raw = fromPrefs.ifBlank {
            BuildConfig.CONVERTER_BASE_URL.trim().ifBlank {
                OgmPublicBase.DEFAULT_PUBLIC_BASE_URL
            }
        }
        return raw.trimEnd('/')
    }

    private fun buildShareDeepLink(sharedText: String): String {
        val base = publicBaseUrl()
        val encoded = Uri.encode(sharedText.trim())
        return "$base/?sharedUrl=$encoded"
    }

    companion object {
        private const val PREFS_SHELL = "ogm_webview_shell"
        private const val KEY_LAST_VERSION_CODE = "last_version_code"
    }

    private fun extractSharedText(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_SEND) return null
        if (intent.type?.startsWith("text/") != true) return null
        return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun isAppHostedUrl(url: String): Boolean {
        val host = runCatching { Uri.parse(url).host?.lowercase() }.getOrNull() ?: return false
        val baseHost = runCatching { Uri.parse(publicBaseUrl()).host?.lowercase() }.getOrNull()
        if (baseHost != null && host == baseHost) return true
        if (host.endsWith(".onrender.com")) return true
        if (host.endsWith(".appdeploy.ai")) return true
        if (host == "localhost" || host == "127.0.0.1" || host.startsWith("192.168.")) return true
        if (host == "10.0.2.2") return true
        return false
    }

    private fun isYouTubeUrl(url: String): Boolean {
        val host = runCatching { Uri.parse(url).host?.lowercase() }.getOrNull() ?: return false
        return host.contains("youtube.com") || host.contains("youtu.be") ||
            host.contains("googlevideo.com") || host.contains("ytimg.com")
    }
}
