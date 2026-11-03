package com.example

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.example.ondevice.YouTubeSessionStore

/**
 * One-time YouTube sign-in on **real Google / YouTube pages** inside a WebView.
 * We never show our own email/password form and never send credentials to our server.
 */
class YouTubeLoginActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var statusView: TextView
    private var finishedOk = false

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            max = 100
        }
        statusView = TextView(this).apply {
            text = "Sign in on Google’s page. Open Grace Music never asks for your password."
            setTextColor(0xFFEEEAE2.toInt())
            textSize = 12f
            setPadding(dp(12), dp(6), dp(12), dp(6))
        }
        val close = Button(this).apply {
            text = "Cancel"
            setOnClickListener { finishCancelled() }
        }
        val done = Button(this).apply {
            text = "Done"
            setOnClickListener { tryFinish(fromUser = true) }
        }
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(0xFF171814.toInt())
            setPadding(dp(8), dp(8), dp(8), dp(8))
            addView(close, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(
                TextView(this@YouTubeLoginActivity).apply {
                    text = "Sign in to YouTube"
                    setTextColor(0xFFB8D99E.toInt())
                    textSize = 16f
                    gravity = Gravity.CENTER
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 2f)
            )
            addView(done, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }

        webView = WebView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.javaScriptCanOpenWindowsAutomatically = true
            settings.setSupportMultipleWindows(true)
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.userAgentString = LOGIN_UA
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    progress.isIndeterminate = newProgress in 1..99
                    progress.progress = newProgress
                    progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                }

                override fun onCreateWindow(
                    view: WebView?,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: android.os.Message?
                ): Boolean {
                    val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                    transport.webView = webView
                    resultMsg.sendToTarget()
                    return true
                }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val url = request?.url?.toString().orEmpty()
                    if (url.isBlank()) return true
                    if (!url.startsWith("https://") && !url.startsWith("http://")) return true
                    if (isAllowedLoginHost(url)) return false
                    return true
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    statusView.text = "Loading Google / YouTube…"
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    CookieManager.getInstance().flush()
                    val header = YouTubeSessionStore.collectFromCookieManager()
                    if (YouTubeSessionStore.hasAuthCookies(header)) {
                        statusView.text = "Signed-in cookies found. Tap Done, then retry Record."
                        if (urlLooksLikeYoutubeHome(url)) {
                            tryFinish(fromUser = false)
                        }
                    } else {
                        statusView.text =
                            "Finish sign-in on this Google page. We never collect your password."
                    }
                }
            }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF11120F.toInt())
            addView(toolbar)
            addView(progress, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(3)
            ))
            addView(statusView)
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
                    if (webView.canGoBack()) webView.goBack() else finishCancelled()
                }
            }
        )

        webView.loadUrl(START_URL)
    }

    private fun tryFinish(fromUser: Boolean) {
        if (finishedOk) return
        val header = YouTubeSessionStore.harvestAndPersist(this)
        if (!YouTubeSessionStore.hasAuthCookies(header)) {
            if (fromUser) {
                statusView.text =
                    "YouTube did not show a signed-in session yet. Stay on Google’s page until you see your account, then tap Done."
            }
            return
        }
        finishedOk = true
        android.util.Log.i("OgmYtLogin", "YouTube session stored (cookie names only, no values)")
        setResult(RESULT_OK, Intent().putExtra(EXTRA_CONNECTED, true))
        finish()
    }

    private fun finishCancelled() {
        setResult(RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        runCatching { webView.destroy() }
        super.onDestroy()
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_CONNECTED = "connected"
        const val START_URL =
            "https://accounts.google.com/ServiceLogin?service=youtube&passive=true" +
                "&continue=https%3A%2F%2Fm.youtube.com%2F&uilel=3&hl=en"

        const val LOGIN_UA =
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0.6367.82 Mobile Safari/537.36"

        fun isAllowedLoginHost(url: String): Boolean {
            val host = runCatching { Uri.parse(url).host?.lowercase() }.getOrNull() ?: return false
            return host == "google.com" || host.endsWith(".google.com") ||
                host == "youtube.com" || host.endsWith(".youtube.com") ||
                host == "youtu.be" || host.endsWith(".youtu.be") ||
                host == "gstatic.com" || host.endsWith(".gstatic.com") ||
                host == "googleusercontent.com" || host.endsWith(".googleusercontent.com") ||
                host == "googleapis.com" || host.endsWith(".googleapis.com") ||
                host == "ggpht.com" || host.endsWith(".ggpht.com") ||
                host == "googlevideo.com" || host.endsWith(".googlevideo.com") ||
                host == "ytimg.com" || host.endsWith(".ytimg.com")
        }

        fun urlLooksLikeYoutubeHome(url: String?): Boolean {
            val u = url.orEmpty().lowercase()
            if (u.contains("accounts.google.") || u.contains("accounts.youtube.")) return false
            val host = runCatching { Uri.parse(url).host?.lowercase() }.getOrNull() ?: return false
            return host.contains("youtube.com")
        }
    }
}
