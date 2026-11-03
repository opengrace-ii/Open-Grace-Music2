package com.example.ondevice

import android.content.Context
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Receives events for one download; the activity forwards them to the web layer. */
interface DownloadEvents {
    fun onProgress(callbackId: String, json: JSONObject)
    fun onDone(callbackId: String, json: JSONObject)
    fun onError(callbackId: String, message: String)
}

/**
 * Orchestrates an on-device YouTube audio download:
 * 1. Wait for a googlevideo URL the WebView already loaded (real YouTube session).
 * 2. Ranged download of that captured URL with Cookie + UA from CookieManager / intercept.
 * JS then tries the server with cookies/oauth. No MediaProjection / screen share.
 */
class OnDeviceDownloadManager(private val context: Context) {

    companion object {
        const val LOCAL_HOST = "ogm.local"
        private val ID_RE = Regex("^[A-Za-z0-9_-]{11}$")
        private val TOKEN_RE = Regex("^[A-Za-z0-9_.-]{1,80}$")

        val http: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(45, TimeUnit.SECONDS)
                .followRedirects(true)
                .build()
        }

        const val CAPTURE_HINT = "Play the video, then retry Record."

        fun friendlyFailure(
            videoId: String,
            hadCapture: Boolean,
            innerTubeHint: String?,
            sessionConnected: Boolean = false,
        ): String {
            val hint = innerTubeHint.orEmpty()
            val lower = hint.lowercase()
            return when {
                "login_required" in lower || "sign in" in lower ->
                    if (sessionConnected) {
                        "YouTube asked for a login again. Reconnect, then retry Record."
                    } else {
                        "YouTube asked for a login. Connect YouTube, then retry Record."
                    }
                "http 403" in lower || "http 401" in lower ->
                    if (sessionConnected) {
                        "YouTube blocked this stream (HTTP 403). $CAPTURE_HINT"
                    } else {
                        "YouTube blocked this stream. Connect YouTube, then retry Record."
                    }
                "different video" in lower || "did not match" in lower ->
                    "YouTube answered for a different video. Retry this exact URL."
                hadCapture -> "Stream expired. $CAPTURE_HINT"
                else -> "Missed this video’s audio. $CAPTURE_HINT"
            }
        }
    }

    private val executor = Executors.newCachedThreadPool()
    private val cancelFlags = ConcurrentHashMap<String, AtomicBoolean>()
    private val files = ConcurrentHashMap<String, Pair<File, String>>() // token -> file,mime

    val dir: File get() = File(context.cacheDir, "ogm_dl").apply { mkdirs() }

    fun start(videoId: String, callbackId: String, events: DownloadEvents) {
        if (!ID_RE.matches(videoId)) {
            events.onError(callbackId, "Invalid YouTube video id")
            return
        }
        val cancelled = AtomicBoolean(false)
        cancelFlags[callbackId] = cancelled
        OgmDownloadService.begin(context)
        executor.execute {
            try {
                run(videoId, callbackId, cancelled, events)
            } catch (e: Exception) {
                events.onError(callbackId, e.message ?: e.javaClass.simpleName)
            } finally {
                cancelFlags.remove(callbackId)
                WebViewStreamCapture.setRequested(null)
                OgmDownloadService.end(context)
            }
        }
    }

    private fun run(videoId: String, callbackId: String, cancelled: AtomicBoolean, events: DownloadEvents) {
        WebViewStreamCapture.setRequested(videoId)
        runCatching {
            val stored = YouTubeSessionStore.loadPersisted(context)
            if (stored.isNotBlank()) YouTubeSessionStore.applyHeaderToCookieManager(stored)
        }
        val downloader = RangedDownloader(http)

        events.onProgress(
            callbackId,
            JSONObject().put("stage", "capture").put("percent", 4)
                .put("message", "Waiting for YouTube audio…")
        )
        val captured = waitForCapture(videoId, cancelled, events, callbackId)
        if (captured != null) {
            try {
                if (downloadCaptured(videoId, captured, callbackId, cancelled, events, downloader)) return
            } catch (e: Exception) {
                if (cancelled.get()) throw OnDeviceException("Cancelled")
                // Fall through: signed-in InnerTube, then JS server route.
            }
        }

        val cookies = YouTubeSessionStore.mergedCookieHeader(context)
        val sessionConnected = YouTubeSessionStore.hasAuthCookies(cookies)
        val innerFailures = mutableListOf<String>()
        if (tryInnerTube(videoId, cookies, callbackId, cancelled, events, downloader, innerFailures)) return

        throw OnDeviceException(
            friendlyFailure(videoId, captured != null, innerFailures.joinToString("; "), sessionConnected)
        )
    }

    private fun tryInnerTube(
        videoId: String,
        cookies: String,
        callbackId: String,
        cancelled: AtomicBoolean,
        events: DownloadEvents,
        downloader: RangedDownloader,
        failures: MutableList<String>,
    ): Boolean {
        events.onProgress(
            callbackId,
            JSONObject().put("stage", "resolve").put("percent", 8)
                .put("message", "Trying signed-in YouTube session…")
        )
        val resolver = InnerTubeResolver(http, cookies)
        for (audio in resolver.resolveCandidates(videoId, failures)) {
            if (cancelled.get()) throw OnDeviceException("Cancelled")
            try {
                finishDownload(audio, callbackId, cancelled, events, downloader)
                return true
            } catch (e: Exception) {
                if (cancelled.get()) throw OnDeviceException("Cancelled")
                val why = e.message.orEmpty()
                failures.add("${audio.clientName}: $why")
                // 403 is a block, not a different-video mismatch.
                if (why.contains("403") || why.contains("401") || why.contains("LOGIN_REQUIRED", true)) {
                    break
                }
            }
        }
        return false
    }

    private fun waitForCapture(
        videoId: String,
        cancelled: AtomicBoolean,
        events: DownloadEvents,
        callbackId: String,
    ): WebViewStreamCapture.CapturedStream? {
        val deadline = System.currentTimeMillis() + WebViewStreamCapture.WAIT_FOR_STREAM_MS
        var lastEmit = 0L
        while (true) {
            if (cancelled.get()) throw OnDeviceException("Cancelled")
            WebViewStreamCapture.findFor(videoId)?.let { return it }
            val now = System.currentTimeMillis()
            if (now >= deadline) return null
            if (now - lastEmit > 1500) {
                lastEmit = now
                events.onProgress(
                    callbackId,
                    JSONObject().put("stage", "capture").put("percent", 6)
                        .put("message", "Waiting for YouTube audio…")
                )
            }
            try {
                Thread.sleep(400)
            } catch (_: InterruptedException) {
                throw OnDeviceException("Cancelled")
            }
        }
    }

    private fun downloadCaptured(
        videoId: String,
        captured: WebViewStreamCapture.CapturedStream,
        callbackId: String,
        cancelled: AtomicBoolean,
        events: DownloadEvents,
        downloader: RangedDownloader,
    ): Boolean {
        val headers = captured.headers.toMutableMap()
        val cookies = WebViewStreamCapture.cookieHeaderFor(captured)
        if (cookies.isNotBlank()) headers["Cookie"] = cookies
        if (!headers.containsKey("User-Agent")) {
            headers["User-Agent"] = WebViewStreamCapture.DEFAULT_UA
        }
        if (!headers.containsKey("Origin")) headers["Origin"] = "https://www.youtube.com"
        if (!headers.containsKey("Referer")) headers["Referer"] = "https://www.youtube.com/"

        var audio = WebViewStreamCapture.toResolvedAudio(
            captured, videoId, headers, captured.contentLength,
        )
        if (audio.contentLength <= 0L) {
            events.onProgress(
                callbackId,
                JSONObject().put("stage", "download").put("percent", 8)
                    .put("message", "Measuring stream…")
            )
            val len = downloader.probeContentLength(audio)
            audio = audio.copy(contentLength = len)
        }
        events.onProgress(
            callbackId,
            JSONObject().put("stage", "download").put("percent", 10)
                .put("message", "Downloading ${audio.container}…")
        )
        finishDownload(audio, callbackId, cancelled, events, downloader)
        return true
    }

    private fun finishDownload(
        audio: ResolvedAudio,
        callbackId: String,
        cancelled: AtomicBoolean,
        events: DownloadEvents,
        downloader: RangedDownloader,
    ) {
        val token = "${audio.videoId}-${System.currentTimeMillis().toString(36)}.${if (audio.container == "M4A") "m4a" else "webm"}"
        val dest = File(dir, token)
        try {
            var lastPct = -1
            val bytes = downloader.download(audio, dest, { cancelled.get() }) { done, total ->
                val pct = 10 + (done * 85 / total).toInt()
                if (pct != lastPct) {
                    lastPct = pct
                    events.onProgress(
                        callbackId,
                        JSONObject().put("stage", "download").put("percent", pct)
                            .put("bytes", done).put("total", total)
                            .put("message", "Downloading ${audio.container} · ${done / 1024 / 1024} / ${total / 1024 / 1024} MB")
                    )
                }
            }
            files[token] = dest to audio.mimeType
            val done = JSONObject()
                .put("url", "https://$LOCAL_HOST/dl/$token")
                .put("token", token)
                .put("videoId", audio.videoId)
                .put("container", audio.container)
                .put("codec", audio.codecLabel)
                .put("mime", audio.mimeType)
                .put("bitrateKbps", audio.bitrateKbps)
                .put("bytes", bytes)
                .put("title", audio.title)
                .put("author", audio.author)
                .put("durationSec", audio.durationSec)
                .put("client", audio.clientName)
            events.onDone(callbackId, done)
        } catch (e: Exception) {
            dest.delete()
            throw e
        }
    }

    fun cancel(callbackId: String) {
        cancelFlags[callbackId]?.set(true)
    }

    fun release(token: String) {
        files.remove(token)?.first?.delete()
    }

    /** Looks up a finished file for the local fetch URL. Token is validated; no path traversal. */
    fun lookup(token: String): Pair<File, String>? {
        if (!TOKEN_RE.matches(token)) return null
        return files[token]?.takeIf { it.first.exists() }
    }

    fun purgeStale() {
        val cutoff = System.currentTimeMillis() - TimeUnit.HOURS.toMillis(2)
        dir.listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
    }
}
