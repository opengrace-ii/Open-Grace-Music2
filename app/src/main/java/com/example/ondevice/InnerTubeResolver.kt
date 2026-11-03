package com.example.ondevice

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/** One playable audio-only stream for exactly [videoId]. */
data class ResolvedAudio(
    val videoId: String,
    val url: String,
    val mimeType: String,
    /** Real container label shown to the user: "M4A" (AAC) or "OPUS" (WebM/Opus). */
    val container: String,
    val codecLabel: String,
    val bitrateKbps: Int,
    val contentLength: Long,
    val title: String,
    val author: String,
    val durationSec: Int,
    val clientName: String,
    val userAgent: String,
    /** Extra headers (Cookie, Origin, Referer, …) copied from a captured WebView request. */
    val extraHeaders: Map<String, String> = emptyMap(),
)

class OnDeviceException(message: String) : Exception(message)

/** InnerTube client identities that return plain (non-ciphered) audio URLs. */
data class InnerTubeClient(
    val name: String,
    val version: String,
    val userAgent: String,
    val clientNameId: String,
    val extra: JSONObject.() -> Unit = {},
)

/**
 * Hand-rolled InnerTube `youtubei/v1/player` resolver (no third-party extractor dependency).
 * Runs on the phone, so requests come from the phone's residential/mobile IP, not a datacenter.
 * The returned videoId is verified against the requested id; a different video is never accepted.
 */
class InnerTubeResolver(
    private val http: OkHttpClient,
    private val cookieHeader: String = "",
) {

    companion object {
        private const val ENDPOINT = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
        private val JSON = "application/json; charset=utf-8".toMediaType()

        val CLIENTS: List<InnerTubeClient> = listOf(
            InnerTubeClient(
                name = "WEB",
                version = "2.20251125.01.00",
                userAgent = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
                clientNameId = "1",
            ),
            InnerTubeClient(
                name = "WEB_EMBEDDED_PLAYER",
                version = "1.20251125.01.00",
                userAgent = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
                clientNameId = "56",
            ),
            InnerTubeClient(
                name = "TVHTML5",
                version = "7.20251125.18.00",
                userAgent = "Mozilla/5.0 (ChromiumStyleTv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SmartTV",
                clientNameId = "7",
            ),
        )

        /**
         * Pure parser (unit-testable). Returns null when the response has no usable audio;
         * throws [OnDeviceException] with the real reason when playability is not OK or the
         * response is for a different video.
         */
        fun parsePlayerResponse(
            body: String,
            expectedVideoId: String,
            client: InnerTubeClient,
        ): ResolvedAudio? {
            val root = JSONObject(body)
            val playability = root.optJSONObject("playabilityStatus")
            val status = playability?.optString("status").orEmpty()
            if (status != "OK") {
                val reason = playability?.optString("reason").orEmpty().ifBlank { status.ifBlank { "no playability" } }
                throw OnDeviceException("$status: $reason")
            }
            val details = root.optJSONObject("videoDetails")
            val gotId = details?.optString("videoId").orEmpty().trim()
            if (gotId.isNotEmpty() && !gotId.equals(expectedVideoId, ignoreCase = true)) {
                throw OnDeviceException("YouTube answered for a different video id ($gotId) — refusing to substitute")
            }
            val streaming = root.optJSONObject("streamingData") ?: return null
            val groups = listOf(streaming.optJSONArray("adaptiveFormats"), streaming.optJSONArray("formats"))
            var best: JSONObject? = null
            var bestScore = -1
            for (formats in groups) {
                if (formats == null) continue
                for (i in 0 until formats.length()) {
                    val f = formats.optJSONObject(i) ?: continue
                    val mime = f.optString("mimeType")
                    val itag = f.optInt("itag", -1)
                    val audio = mime.startsWith("audio/")
                    val muxed = itag in WebViewStreamCapture.MUXED_ITAGS ||
                        (mime.startsWith("video/mp4") && itag in WebViewStreamCapture.MUXED_ITAGS)
                    if (!audio && !muxed) continue
                    if (f.optString("url").isBlank()) continue
                    if (f.optLong("contentLength", 0L) <= 0L) continue
                    val base = when {
                        mime.startsWith("audio/mp4") -> 1_000_000
                        audio -> 500_000
                        else -> 8_000
                    }
                    val score = base + f.optInt("averageBitrate", f.optInt("bitrate", 0)) / 1000
                    if (score > bestScore) {
                        best = f
                        bestScore = score
                    }
                }
            }
            val f = best ?: return null
            val mime = f.getString("mimeType")
            val isMp4 = mime.startsWith("audio/mp4") || mime.startsWith("video/mp4")
            val bitrate = f.optInt("averageBitrate", f.optInt("bitrate", 0)) / 1000
            return ResolvedAudio(
                videoId = expectedVideoId,
                url = f.getString("url"),
                mimeType = mime.substringBefore(';').trim(),
                container = if (isMp4) "M4A" else "OPUS",
                codecLabel = if (isMp4) "AAC" else "Opus",
                bitrateKbps = bitrate,
                contentLength = f.getLong("contentLength"),
                title = details?.optString("title").orEmpty(),
                author = details?.optString("author").orEmpty(),
                durationSec = details?.optString("lengthSeconds")?.toIntOrNull() ?: 0,
                clientName = client.name,
                userAgent = client.userAgent,
            )
        }
    }

    /** Every client's candidate, in order; caller validates each by actually fetching bytes. */
    fun resolveCandidates(videoId: String, failures: MutableList<String>): Sequence<ResolvedAudio> = sequence {
        for (client in CLIENTS) {
            try {
                val audio = fetchFor(videoId, client)
                if (audio != null) yield(audio)
                else failures.add("${client.name}: no audio stream with a direct URL")
            } catch (e: OnDeviceException) {
                failures.add("${client.name}: ${e.message}")
            } catch (e: Exception) {
                failures.add("${client.name}: ${e.javaClass.simpleName} ${e.message.orEmpty()}")
            }
        }
    }

    private fun fetchFor(videoId: String, c: InnerTubeClient): ResolvedAudio? {
        val clientJson = JSONObject().apply {
            put("clientName", c.name)
            put("clientVersion", c.version)
            put("hl", "en")
            put("gl", "US")
            c.extra(this)
        }
        val payload = JSONObject().apply {
            put("context", JSONObject().put("client", clientJson))
            put("videoId", videoId)
            put("contentCheckOk", true)
            put("racyCheckOk", true)
        }
        val reqBuilder = Request.Builder()
            .url(ENDPOINT)
            .header("User-Agent", c.userAgent)
            .header("X-YouTube-Client-Name", c.clientNameId)
            .header("X-YouTube-Client-Version", c.version)
            .header("Origin", "https://www.youtube.com")
            .header("Referer", "https://www.youtube.com/watch?v=$videoId")
            .post(payload.toString().toRequestBody(JSON))
        val cookie = cookieHeader.trim()
        if (cookie.isNotEmpty() && WebViewStreamCapture.isSafeHeaderValue(cookie)) {
            reqBuilder.header("Cookie", cookie)
        }
        val req = reqBuilder.build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw OnDeviceException("HTTP ${resp.code} from YouTube player API")
            val audio = parsePlayerResponse(text, videoId, c) ?: return null
            return if (cookie.isNotEmpty()) {
                audio.copy(extraHeaders = audio.extraHeaders + ("Cookie" to cookie))
            } else {
                audio
            }
        }
    }
}
