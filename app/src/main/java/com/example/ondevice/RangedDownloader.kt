package com.example.ondevice

import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * Downloads a googlevideo stream with ranged requests (googlevideo throttles/403s long
 * un-ranged reads). Streams straight to disk; never holds the file in memory.
 */
class RangedDownloader(private val http: OkHttpClient) {

    companion object {
        const val CHUNK = 1_048_576L // 1 MiB ranged requests
        /** Anything smaller than this is not a real song (errors/redirect stubs). */
        const val MIN_AUDIO_BYTES = 50_000L
    }

    /** Returns bytes written. Throws [OnDeviceException] / [IOException] with a real reason. */
    fun download(
        audio: ResolvedAudio,
        dest: File,
        isCancelled: () -> Boolean,
        onProgress: (done: Long, total: Long) -> Unit,
    ): Long {
        val total = audio.contentLength
        var offset = 0L
        dest.parentFile?.mkdirs()
        FileOutputStream(dest).use { out ->
            val buf = ByteArray(64 * 1024)
            while (offset < total) {
                if (isCancelled()) throw OnDeviceException("Cancelled")
                val startOffset = offset
                val end = minOf(offset + CHUNK, total) - 1
                val req = applyCapturedHeaders(
                    Request.Builder().url(audio.url),
                    audio,
                )
                    .header("Range", "bytes=$offset-$end")
                    .build()
                http.newCall(req).execute().use { resp ->
                    if (resp.code != 206 && resp.code != 200) {
                        throw OnDeviceException("googlevideo returned HTTP ${resp.code}")
                    }
                    val ctype = resp.header("Content-Type").orEmpty()
                    if (!ctype.startsWith("audio/") &&
                        !ctype.startsWith("video/mp4") &&
                        !ctype.startsWith("application/octet-stream") &&
                        ctype.isNotBlank()
                    ) {
                        throw OnDeviceException("Stream was not audio (content-type '$ctype')")
                    }
                    val body = resp.body ?: throw IOException("Empty body")
                    var chunkRead = 0L
                    body.byteStream().use { input ->
                        while (true) {
                            if (isCancelled()) throw OnDeviceException("Cancelled")
                            val n = input.read(buf)
                            if (n < 0) break
                            // A 200 (server ignored Range) would restart at 0; guard against that.
                            if (resp.code == 200 && startOffset > 0) throw OnDeviceException("Server ignored Range request")
                            out.write(buf, 0, n)
                            chunkRead += n
                            offset += n
                            onProgress(offset, total)
                            if (resp.code == 200 && offset >= total) break
                        }
                    }
                    if (chunkRead == 0L) throw OnDeviceException("Stream ended early at $offset of $total bytes")
                }
            }
            out.flush()
        }
        if (!looksLikeAudioContainer(dest, audio.container)) {
            throw OnDeviceException("Downloaded bytes are not a valid ${audio.container} audio container")
        }
        if (offset < MIN_AUDIO_BYTES) {
            throw OnDeviceException("Downloaded only $offset bytes — not a real audio file")
        }
        return offset
    }

    fun probeContentLength(audio: ResolvedAudio): Long {
        val req = applyCapturedHeaders(
            Request.Builder().url(audio.url),
            audio,
        )
            .header("Range", "bytes=0-0")
            .build()
        http.newCall(req).execute().use { resp ->
            val range = resp.header("Content-Range").orEmpty()
            val m = Regex("bytes \\d+-\\d+/(\\d+)").find(range)
            if (m != null) return m.groupValues[1].toLong()
            val cl = resp.header("Content-Length")?.toLongOrNull()
            if (resp.code == 206 && cl != null && cl > 1L) return cl
            if (resp.code == 200 && cl != null && cl > MIN_AUDIO_BYTES) return cl
            throw OnDeviceException("Could not determine googlevideo length (HTTP ${resp.code})")
        }
    }

    private fun applyCapturedHeaders(builder: Request.Builder, audio: ResolvedAudio): Request.Builder {
        for ((k, v) in audio.extraHeaders) {
            if (k.equals("Range", true) || k.equals("Host", true) || k.equals("Content-Length", true)) continue
            if (!WebViewStreamCapture.isSafeHeaderValue(k) || !WebViewStreamCapture.isSafeHeaderValue(v)) continue
            builder.header(k, v)
        }
        val ua = audio.extraHeaders.entries.firstOrNull { it.key.equals("User-Agent", true) }?.value
            ?: audio.userAgent
        if (WebViewStreamCapture.isSafeHeaderValue(ua)) builder.header("User-Agent", ua)
        return builder
    }

    private fun looksLikeAudioContainer(f: File, container: String): Boolean {
        val head = ByteArray(12)
        val n = f.inputStream().use { it.read(head) }
        if (n < 12) return false
        return if (container == "M4A") {
            String(head, 4, 4, Charsets.ISO_8859_1) == "ftyp"
        } else {
            head[0] == 0x1A.toByte() && head[1] == 0x45.toByte() &&
                head[2] == 0xDF.toByte() && head[3] == 0xA3.toByte()
        }
    }
}
