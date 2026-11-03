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
 * 3. Android 10+ AudioPlaybackCapture of THIS app's playing audio → M4A.
 * JS then tries the server with cookies/oauth. InnerTube clients are not added here.
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

        const val CAPTURE_HINT =
            "Play the video, then retry Record."

        fun friendlyFailure(videoId: String, hadCapture: Boolean, innerTubeHint: String?): String {
            return if (hadCapture) {
                "Captured stream expired. $CAPTURE_HINT"
            } else {
                "Capture missed googlevideo audio for $videoId. $CAPTURE_HINT"
            }
        }
    }

    /** Optional: record THIS app's playing audio (Android 10+ AudioPlaybackCapture). */
    var playbackCapture: AppPlaybackCapture? = null

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
                .put("message", "Waiting for this phone to load the YouTube audio stream… tap Play on the video if it is paused")
        )
        val captured = waitForCapture(videoId, cancelled, events, callbackId)
        if (captured != null) {
            try {
                if (downloadCaptured(videoId, captured, callbackId, cancelled, events, downloader)) return
            } catch (e: Exception) {
                if (cancelled.get()) throw OnDeviceException("Cancelled")
                // Fall through to in-app playback capture, then the JS server route.
            }
        }

        val cap = playbackCapture
        if (cap != null && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            events.onProgress(
                callbackId,
                JSONObject().put("stage", "playback").put("percent", 12)
                    .put("message", "Recording this app’s playing audio… allow capture if Android asks")
            )
            try {
                val rec = cap.recordPlayingAppAudio(videoId, cancelled) { pct, msg ->
                    events.onProgress(
                        callbackId,
                        JSONObject().put("stage", "playback").put("percent", pct).put("message", msg)
                    )
                }
                if (rec != null && rec.file.exists() && rec.file.length() >= 50_000L) {
                    val token = "${videoId}-${System.currentTimeMillis().toString(36)}.m4a"
                    val dest = File(dir, token)
                    rec.file.copyTo(dest, overwrite = true)
                    rec.file.delete()
                    files[token] = dest to "audio/mp4"
                    val done = JSONObject()
                        .put("url", "https://$LOCAL_HOST/dl/$token")
                        .put("token", token)
                        .put("videoId", videoId)
                        .put("container", "M4A")
                        .put("codec", "AAC")
                        .put("mime", "audio/mp4")
                        .put("bitrateKbps", 128)
                        .put("bytes", dest.length())
                        .put("title", "")
                        .put("author", "")
                        .put("durationSec", rec.durationSec)
                        .put("client", AppPlaybackCapture.CLIENT_NAME)
                    events.onDone(callbackId, done)
                    return
                }
            } catch (e: Exception) {
                if (cancelled.get()) throw OnDeviceException("Cancelled")
            }
        }

        throw OnDeviceException(friendlyFailure(videoId, captured != null, null))
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
                        .put(
                            "message",
                            "Waiting for this phone to load the YouTube audio stream… tap Play on the video if it is paused"
                        )
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
                    .put("message", "Measuring captured YouTube audio stream…")
            )
            val len = downloader.probeContentLength(audio)
            audio = audio.copy(contentLength = len)
        }
        events.onProgress(
            callbackId,
            JSONObject().put("stage", "download").put("percent", 10)
                .put("message", "Downloading captured ${audio.container} from this phone’s YouTube stream…")
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
