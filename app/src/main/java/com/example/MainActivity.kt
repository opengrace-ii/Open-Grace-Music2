package com.example

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
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
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.example.data.ConverterServerPrefs
import com.example.data.OgmPublicBase

/**
 * Thin WebView shell that loads the live Open Grace Music PWA (Render by default).
 * Native Compose UI remains in the tree for optional offline tooling, but the shipped
 * APK must track the web product (Listen / Library / Tuner / Schedule / More).
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

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
            settings.userAgentString = settings.userAgentString + " OpenGraceMusicAPK/" +
                BuildConfig.VERSION_NAME

            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

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
                    // External links (Play Protect docs, GitHub, etc.) open in the system browser.
                    runCatching {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    }
                    return true
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                }
            }

            setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                // Prefer Chrome / Downloads for APK and large files from the install guide.
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse(url)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                if (URLUtil.isNetworkUrl(url)) {
                    runCatching { startActivity(intent) }
                } else {
                    // Fallback no-op; contentDisposition kept for debugging.
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
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
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
        // PWA opens Tuner/download flows from query; harmless if ignored by an older deploy.
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
