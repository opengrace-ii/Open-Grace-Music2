package com.example.ondevice

import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

/**
 * Side-effect capture of the googlevideo `videoplayback` request the in-app YouTube
 * WebView/IFrame already makes. Hand-rolled InnerTube cannot mint a PO token / n-sig
 * session in 2026; the embed can, so we reuse that URL + headers.
 *
 * [observe] must never consume the request — WebView continues loading the player.
 */
object WebViewStreamCapture {

    const val CLIENT_NAME = "WEBVIEW_CAPTURE"

    /** Audio-only itags commonly used by the HTML5 / IFrame player. */
    val AUDIO_ITAGS: Set<Int> = setOf(
        139, 140, 141, 171, 249, 250, 251, 256, 258, 327, 338, 599, 600,
    )

    private const val MAX_AGE_MS = 90_000L
    private val WATCH_ID_RE = Regex("^[A-Za-z0-9_-]{11}$")

    data class CapturedStream(
        val url: String,
        val headers: Map<String, String>,
        val itag: Int?,
        val mime: String?,
        val googlevideoId: String?,
        val watchIdInQuery: String?,
        val contentLength: Long,
        val capturedAt: Long,
        val playingWatchId: String?,
    )

    @Volatile
    var currentlyPlayingWatchId: String? = null
        private set

    @Volatile
    var requestedWatchId: String? = null
        private set

    private val byWatchId = ConcurrentHashMap<String, CapturedStream>()
    private val latestAudio = AtomicReference<CapturedStream?>(null)

    fun setCurrentlyPlaying(videoId: String?) {
        currentlyPlayingWatchId = videoId?.trim()?.takeIf { WATCH_ID_RE.matches(it) }
    }

    fun setRequested(videoId: String?) {
        requestedWatchId = videoId?.trim()?.takeIf { WATCH_ID_RE.matches(it) }
    }

    fun associatedWatchId(): String? = currentlyPlayingWatchId ?: requestedWatchId

    fun observe(request: WebResourceRequest?) {
        if (request == null) return
        observeUrl(request.url?.toString(), request.requestHeaders)
    }

    fun observeUrl(rawUrl: String?, requestHeaders: Map<String, String>?) {
        val parsed = parseVideoPlayback(rawUrl ?: return, requestHeaders.orEmpty(), associatedWatchId())
            ?: return
        remember(parsed)
    }

    fun remember(stream: CapturedStream) {
        if (!isAudioCandidate(stream.itag, stream.mime)) return
        latestAudio.set(stream)
        val keys = linkedSetOf<String>()
        stream.watchIdInQuery?.let { keys.add(it) }
        stream.playingWatchId?.let { keys.add(it) }
        requestedWatchId?.let { keys.add(it) }
        currentlyPlayingWatchId?.let { keys.add(it) }
        for (k in keys) {
            if (WATCH_ID_RE.matches(k)) byWatchId[k] = stream
        }
    }

    fun findFor(watchId: String, now: Long = System.currentTimeMillis()): CapturedStream? {
        if (!WATCH_ID_RE.matches(watchId)) return null
        val fresh = { s: CapturedStream -> now - s.capturedAt in 0..MAX_AGE_MS }

        byWatchId[watchId]?.takeIf(fresh)?.let { return it }

        val latest = latestAudio.get()
        if (latest != null && fresh(latest)) {
            if (latest.watchIdInQuery == watchId) return latest
            if (latest.playingWatchId == watchId) return latest
            val playing = currentlyPlayingWatchId
            val requested = requestedWatchId
            if (playing == watchId || (playing == null && requested == watchId)) {
                // googlevideo `id` is often an sCPN-style identifier, not the watch id.
                return latest
            }
        }
        return null
    }

    fun clear() {
        byWatchId.clear()
        latestAudio.set(null)
    }

    /**
     * Parse a googlevideo videoplayback URL. Returns null when the URL is not a
     * playback stream (wrong host/path). Audio preference is applied by [remember].
     */
    fun parseVideoPlayback(
        rawUrl: String,
        requestHeaders: Map<String, String>,
        playingWatchId: String?,
        capturedAt: Long = System.currentTimeMillis(),
    ): CapturedStream? {
        val uri = runCatching { Uri.parse(rawUrl) }.getOrNull() ?: return null
        val host = uri.host?.lowercase(Locale.US) ?: return null
        if (!host.endsWith("googlevideo.com")) return null
        val path = uri.path.orEmpty()
        if (!path.contains("videoplayback")) return null

        val itag = uri.getQueryParameter("itag")?.toIntOrNull()
        val mimeRaw = uri.getQueryParameter("mime")
        val gvId = uri.getQueryParameter("id")
        val vParam = uri.getQueryParameter("v")
        val watchInQuery = listOf(gvId, vParam).firstOrNull { it != null && WATCH_ID_RE.matches(it) }
        val contentLength = uri.getQueryParameter("clen")?.toLongOrNull() ?: 0L

        return CapturedStream(
            url = stripRangeParam(rawUrl),
            headers = copyRequestHeaders(requestHeaders),
            itag = itag,
            mime = mimeRaw,
            googlevideoId = gvId,
            watchIdInQuery = watchInQuery,
            contentLength = contentLength,
            capturedAt = capturedAt,
            playingWatchId = playingWatchId?.takeIf { WATCH_ID_RE.matches(it) },
        )
    }

    fun isAudioCandidate(itag: Int?, mime: String?): Boolean {
        val m = mime.orEmpty().lowercase(Locale.US)
        if (m.contains("audio")) return true
        if (itag != null && itag in AUDIO_ITAGS) return true
        return false
    }

    /** Higher is better. Non-audio scores negative. */
    fun audioPreferenceScore(itag: Int?, mime: String?): Int {
        if (!isAudioCandidate(itag, mime)) return -1
        val m = mime.orEmpty().lowercase(Locale.US)
        val mimeBonus = when {
            m.contains("mp4") || m.contains("mp4a") || m.contains("aac") -> 1_000_000
            m.contains("webm") || m.contains("opus") -> 500_000
            else -> 100_000
        }
        val itagRank = when (itag) {
            141 -> 90_000
            140 -> 80_000
            251 -> 70_000
            250 -> 60_000
            249 -> 50_000
            171 -> 40_000
            139 -> 30_000
            599, 600 -> 20_000
            else -> 10_000
        }
        return mimeBonus + itagRank
    }

    fun stripRangeParam(url: String): String {
        var out = url.replace(Regex("([?&])range=[^&]*"), "$1")
        out = out.replace("?&", "?").replace("&&", "&")
        if (out.endsWith("?") || out.endsWith("&")) out = out.dropLast(1)
        return out
    }

    fun copyRequestHeaders(raw: Map<String, String>): Map<String, String> {
        val keep = setOf(
            "cookie", "user-agent", "origin", "referer", "accept", "accept-language",
            "x-youtube-client-name", "x-youtube-client-version", "x-youtube-identity-token",
        )
        val out = LinkedHashMap<String, String>()
        for ((k, v) in raw) {
            val key = k.trim()
            if (key.isEmpty() || v.isBlank()) continue
            if (key.equals("Range", true) || key.equals("Host", true) ||
                key.equals("Content-Length", true)
            ) {
                continue
            }
            if (keep.any { it.equals(key, true) }) {
                out[canonicalHeaderName(key)] = v
            }
        }
        return out
    }

    private fun canonicalHeaderName(key: String): String {
        return when {
            key.equals("user-agent", true) -> "User-Agent"
            key.equals("cookie", true) -> "Cookie"
            key.equals("origin", true) -> "Origin"
            key.equals("referer", true) -> "Referer"
            key.equals("accept", true) -> "Accept"
            key.equals("accept-language", true) -> "Accept-Language"
            else -> key
        }
    }

    /**
     * youtube.com + googlevideo.com cookies from [CookieManager], merged with any
     * Cookie header captured on the playback request.
     */
    fun cookieHeaderFor(captured: CapturedStream): String {
        val parts = mutableListOf<String>()
        captured.headers.entries.firstOrNull { it.key.equals("Cookie", true) }?.value?.let {
            parts.add(it)
        }
        runCatching {
            val session = YouTubeSessionStore.collectFromCookieManager()
            if (session.isNotBlank()) parts.add(session)
            val cm = CookieManager.getInstance()
            cm.getCookie(captured.url)?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
        }
        return mergeCookieHeader(parts)
    }

    fun mergeCookieHeader(parts: List<String>): String {
        val seen = LinkedHashMap<String, String>()
        for (part in parts) {
            for (piece in part.split(';')) {
                val nv = piece.trim()
                if (nv.isEmpty()) continue
                val name = nv.substringBefore('=').trim()
                val value = nv.substringAfter('=', "")
                if (name.isNotEmpty()) seen[name] = value
            }
        }
        return seen.entries.joinToString("; ") { "${it.key}=${it.value}" }
    }

    fun mimeTypeOf(stream: CapturedStream): String {
        val m = stream.mime.orEmpty().lowercase(Locale.US).replace("%2f", "/")
        return when {
            m.contains("mp4") -> "audio/mp4"
            m.contains("webm") -> "audio/webm"
            stream.itag in setOf(139, 140, 141) -> "audio/mp4"
            stream.itag in setOf(249, 250, 251) -> "audio/webm"
            else -> "audio/mp4"
        }
    }

    fun toResolvedAudio(
        stream: CapturedStream,
        watchId: String,
        extraHeaders: Map<String, String>,
        contentLength: Long,
        title: String = "",
        author: String = "",
    ): ResolvedAudio {
        val mime = mimeTypeOf(stream)
        val isMp4 = mime.startsWith("audio/mp4")
        val ua = extraHeaders["User-Agent"]
            ?: stream.headers["User-Agent"]
            ?: DEFAULT_UA
        return ResolvedAudio(
            videoId = watchId,
            url = stream.url,
            mimeType = mime,
            container = if (isMp4) "M4A" else "OPUS",
            codecLabel = if (isMp4) "AAC" else "Opus",
            bitrateKbps = 0,
            contentLength = contentLength,
            title = title,
            author = author,
            durationSec = 0,
            clientName = CLIENT_NAME,
            userAgent = ua,
            extraHeaders = extraHeaders,
        )
    }

    const val DEFAULT_UA =
        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

    const val WAIT_FOR_STREAM_MS = 14_000L
}
