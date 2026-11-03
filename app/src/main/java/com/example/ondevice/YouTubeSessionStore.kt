package com.example.ondevice

import android.content.Context
import android.webkit.CookieManager

/**
 * Holds the user's own YouTube/Google cookies collected after they sign in on a real
 * Google page. Values are never written to logcat. Storage is private SharedPreferences
 * (MODE_PRIVATE) — EncryptedSharedPreferences is not on the current Gradle graph.
 *
 * CookieManager is process-wide, so the PWA WebView and the login WebView share the
 * same jar; the prefs copy survives a CookieManager wipe.
 */
object YouTubeSessionStore {

    const val STATUS_CONNECTED = "connected"
    const val STATUS_NOT_CONNECTED = "not_connected"
    const val STATUS_EXPIRED = "expired"

    private const val PREFS = "ogm_yt_session"
    private const val KEY_HEADER = "cookie_header"
    private const val KEY_HAD_SESSION = "had_session"

    /** Names that mean a real signed-in Google/YouTube account, not a visitor id. */
    val AUTH_COOKIE_NAMES: Set<String> = setOf(
        "LOGIN_INFO",
        "SID",
        "HSID",
        "SSID",
        "APISID",
        "SAPISID",
        "__Secure-1PSID",
        "__Secure-3PSID",
        "__Secure-1PAPISID",
        "__Secure-3PAPISID",
        "__Secure-1PSIDTS",
        "__Secure-3PSIDTS",
        "SIDCC",
        "__Secure-1PSIDCC",
        "__Secure-3PSIDCC",
    )

    val COOKIE_URLS: List<String> = listOf(
        "https://www.youtube.com",
        "https://youtube.com",
        "https://m.youtube.com",
        "https://music.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://accounts.youtube.com",
        "https://www.google.com",
        "https://google.com",
        "https://accounts.google.com",
        "https://www.googlevideo.com",
        "https://googlevideo.com",
    )

    fun cookieNames(header: String): Set<String> {
        if (header.isBlank()) return emptySet()
        val names = LinkedHashSet<String>()
        for (piece in header.split(';')) {
            val name = piece.trim().substringBefore('=').trim()
            if (name.isNotEmpty()) names.add(name)
        }
        return names
    }

    fun hasAuthCookies(header: String): Boolean {
        val names = cookieNames(header)
        return names.any { AUTH_COOKIE_NAMES.contains(it) }
    }

    fun statusOf(currentHeader: String, previouslyHadSession: Boolean): String {
        return when {
            hasAuthCookies(currentHeader) -> STATUS_CONNECTED
            previouslyHadSession -> STATUS_EXPIRED
            else -> STATUS_NOT_CONNECTED
        }
    }

    fun collectFromCookieManager(): String {
        val parts = mutableListOf<String>()
        runCatching {
            val cm = CookieManager.getInstance()
            for (url in COOKIE_URLS) {
                cm.getCookie(url)?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
            }
        }
        return WebViewStreamCapture.mergeCookieHeader(parts)
    }

    fun persist(context: Context, header: String) {
        val trimmed = header.trim()
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val had = hasAuthCookies(trimmed) || prefs.getBoolean(KEY_HAD_SESSION, false)
        prefs.edit()
            .putString(KEY_HEADER, trimmed)
            .putBoolean(KEY_HAD_SESSION, had && trimmed.isNotEmpty())
            .apply()
    }

    fun loadPersisted(context: Context): String {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_HEADER, "")
            .orEmpty()
    }

    fun previouslyHadSession(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_HAD_SESSION, false)
    }

    fun applyHeaderToCookieManager(header: String) {
        if (header.isBlank()) return
        val cm = CookieManager.getInstance()
        cm.setAcceptCookie(true)
        val pairs = header.split(';').map { it.trim() }.filter { it.contains('=') }
        for (url in COOKIE_URLS) {
            for (nv in pairs) {
                if (!WebViewStreamCapture.isSafeHeaderValue(nv)) continue
                cm.setCookie(url, "$nv; Path=/")
            }
        }
        cm.flush()
    }

    /** CookieManager first, then the persisted copy for names CookieManager dropped. */
    fun mergedCookieHeader(context: Context? = null): String {
        val parts = mutableListOf<String>()
        val live = collectFromCookieManager()
        if (live.isNotBlank()) parts.add(live)
        if (context != null) {
            val stored = loadPersisted(context)
            if (stored.isNotBlank()) parts.add(stored)
        }
        return WebViewStreamCapture.mergeCookieHeader(parts)
    }

    fun status(context: Context): String {
        val header = mergedCookieHeader(context)
        return statusOf(header, previouslyHadSession(context))
    }

    fun harvestAndPersist(context: Context): String {
        val live = collectFromCookieManager()
        val stored = loadPersisted(context)
        val merged = WebViewStreamCapture.mergeCookieHeader(listOf(live, stored).filter { it.isNotBlank() })
        if (merged.isNotBlank()) {
            persist(context, merged)
            applyHeaderToCookieManager(merged)
        }
        return merged
    }

    fun clearSession(context: Context) {
        expireCookieManagerYouTubeGoogle()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    fun expireCookieManagerYouTubeGoogle() {
        val cm = CookieManager.getInstance()
        for (url in COOKIE_URLS) {
            val existing = cm.getCookie(url) ?: continue
            for (piece in existing.split(';')) {
                val name = piece.trim().substringBefore('=').trim()
                if (name.isEmpty()) continue
                cm.setCookie(url, "$name=; Max-Age=0; Path=/")
            }
        }
        cm.flush()
    }
}
