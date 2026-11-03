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
class InnerTubeResolver(private val http: OkHttpClient) {

    companion object {
        private const val ENDPOINT = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
        private val JSON = "application/json; charset=utf-8".toMediaType()

        val CLIENTS: List<InnerTubeClient> = listOf(
            InnerTubeClient(
                name = "ANDROID_VR",
                version = "1.60.19",
                userAgent = "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
                clientNameId = "28",
            ) {
                put("deviceMake", "Oculus")
                put("deviceModel", "Quest 3")
                put("androidSdkVersion", 32)
                put("osName", "Android")
                put("osVersion", "12L")
            },
            InnerTubeClient(
                name = "IOS",
                version = "20.10.4",
                userAgent = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
                clientNameId = "5",
            ) {
                put("deviceMake", "Apple")
                put("deviceModel", "iPhone16,2")
                put("osName", "iPhone")
                put("osVersion", "18.3.2.22D82")
            },
            InnerTubeClient(
                name = "ANDROID",
                version = "20.10.38",
                userAgent = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
                clientNameId = "3",
            ) {
                put("androidSdkVersion", 30)
                put("osName", "Android")
                put("osVersion", "11")
            },
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
            val gotId = details?.optString("videoId").orEmpty()
            if (gotId != expectedVideoId) {
                throw OnDeviceException("YouTube answered for a different video id ($gotId) — refusing to substitute")
            }
            val formats = root.optJSONObject("streamingData")?.optJSONArray("adaptiveFormats") ?: return null
            var best: JSONObject? = null
            var bestScore = -1
            for (i in 0 until formats.length()) {
                val f = formats.optJSONObject(i) ?: continue
                val mime = f.optString("mimeType")
                if (!mime.startsWith("audio/")) continue
                if (f.optString("url").isBlank()) continue
                if (f.optLong("contentLength", 0L) <= 0L) continue
                // Prefer AAC in MP4 (plays everywhere in HTML5 audio), then Opus; higher bitrate wins.
                val base = if (mime.startsWith("audio/mp4")) 1_000_000 else 0
                val score = base + f.optInt("averageBitrate", f.optInt("bitrate", 0)) / 1000
                if (score > bestScore) {
                    best = f
                    bestScore = score
                }
            }
            val f = best ?: return null
            val mime = f.getString("mimeType")
            val isMp4 = mime.startsWith("audio/mp4")
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
        val req = Request.Builder()
            .url(ENDPOINT)
            .header("User-Agent", c.userAgent)
            .header("X-YouTube-Client-Name", c.clientNameId)
            .header("X-YouTube-Client-Version", c.version)
            .header("Origin", "https://www.youtube.com")
            .post(payload.toString().toRequestBody(JSON))
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw OnDeviceException("HTTP ${resp.code} from YouTube player API")
            return parsePlayerResponse(text, videoId, c)
        }
    }
}
