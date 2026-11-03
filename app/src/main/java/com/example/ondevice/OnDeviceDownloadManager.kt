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
 * Orchestrates an on-device YouTube audio download: resolve (InnerTube) -> ranged download
 * to app cache -> hand off a local file served at https://ogm.local/dl/<token>.
 * All work runs on a background executor.
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
                OgmDownloadService.end(context)
            }
        }
    }

    private fun run(videoId: String, callbackId: String, cancelled: AtomicBoolean, events: DownloadEvents) {
        events.onProgress(callbackId, JSONObject().put("stage", "resolve").put("percent", 3).put("message", "Resolving audio on this phone…"))
        val failures = mutableListOf<String>()
        val downloader = RangedDownloader(http)
        val resolver = InnerTubeResolver(http)
        for (audio in resolver.resolveCandidates(videoId, failures)) {
            if (cancelled.get()) throw OnDeviceException("Cancelled")
            val token = "$videoId-${System.currentTimeMillis().toString(36)}.${if (audio.container == "M4A") "m4a" else "webm"}"
            val dest = File(dir, token)
            events.onProgress(
                callbackId,
                JSONObject().put("stage", "download").put("percent", 5)
                    .put("message", "Downloading ${audio.container} (${audio.codecLabel}) via ${audio.clientName}…")
            )
            try {
                var lastPct = -1
                val bytes = downloader.download(audio, dest, { cancelled.get() }) { done, total ->
                    val pct = 5 + (done * 90 / total).toInt()
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
                return
            } catch (e: Exception) {
                dest.delete()
                if (cancelled.get()) throw OnDeviceException("Cancelled")
                failures.add("${audio.clientName} download: ${e.message}")
            }
        }
        throw OnDeviceException(
            "On-device resolve/download failed for $videoId — " + failures.joinToString("; ").ifBlank { "no clients responded" }
        )
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
