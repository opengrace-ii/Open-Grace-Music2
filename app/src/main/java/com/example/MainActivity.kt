package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
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
import com.example.player.OgmPlaybackService

/**
 * Thin WebView shell that loads the live Open Grace Music PWA (Render by default).
 *
 * Background audio: do **not** call [WebView.onPause] while media is active — that pauses
 * HTML5 / iframe playback. A sticky [OgmPlaybackService] foreground notification keeps the
 * process eligible for media playback when the Activity is minimized.
 */
class MainActivity : ComponentActivity(), OgmPlaybackService.WebPlaybackBridge {

    private lateinit var webView: WebView
    @Volatile
    private var mediaPlaying: Boolean = false

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* optional */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        OgmPlaybackService.webBridge = this
        maybeRequestNotificationPermission()

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

            webChromeClient = WebChromeClient()
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

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    injectBackgroundAudioBridge()
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

        val startUrl = resolveStartUrl(intent)
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

    private fun resolveStartUrl(intent: Intent?): String {
        val shared = extractSharedText(intent)
        if (!shared.isNullOrBlank()) {
            return buildShareDeepLink(shared)
        }
        return publicBaseUrl()
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
