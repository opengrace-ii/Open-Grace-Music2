package com.example.data.downloader

import android.content.Context
import android.util.Log
import com.example.data.ConverterServerPrefs
import com.example.data.model.AudiophileFormat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.net.URLDecoder
import java.util.concurrent.TimeUnit

object ServerConverter {
    private const val TAG = "ServerConverter"
    private const val POLL_MS = 2000L
    private const val JOB_TIMEOUT_MS = 180_000L

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    data class ServerConvertResult(
        val file: File,
        val title: String,
        val artist: String,
        val durationSec: Int,
        val thumbnailUrl: String?,
        val ytId: String?
    )

    suspend fun convertViaServerJob(
        context: Context,
        watchUrl: String,
        targetFormat: AudiophileFormat,
        bitrateKbps: Int,
        titleHint: String?,
        artistHint: String?,
        onProgress: (Float, String) -> Unit
    ): ServerConvertResult = withContext(Dispatchers.IO) {
        val base = ConverterServerPrefs.resolveBaseUrl(context)
        if (base.isBlank()) {
            throw IllegalStateException(
                "No converter server configured. Clear Settings to use AppDeploy, or paste a self-hosted npm start URL."
            )
        }
        onProgress(0.12f, "Connecting to studio converter (${targetFormat.code})…")

        val startBody = JSONObject()
            .put("url", watchUrl)
            .put("format", targetFormat.code)
            .put("bitrate", bitrateKbps)
        if (!titleHint.isNullOrBlank()) startBody.put("title", titleHint)
        if (!artistHint.isNullOrBlank()) startBody.put("artist", artistHint)

        val startReq = Request.Builder()
            .url("$base/api/convert-audio/start")
            .post(startBody.toString().toRequestBody("application/json".toMediaType()))
            .header("Accept", "application/json")
            .build()

        val startResp = client.newCall(startReq).execute()
        if (!startResp.isSuccessful) {
            val err = startResp.body?.string().orEmpty()
            throw IllegalStateException(parseServerError(err) ?: "Studio converter unavailable (HTTP ${startResp.code})")
        }

        val startJson = JSONObject(startResp.body?.string().orEmpty())
        val jobId = startJson.optString("jobId")
        if (jobId.isBlank()) {
            throw IllegalStateException("Studio converter did not return a job id")
        }

        val started = System.currentTimeMillis()
        var lastPercent = 15

        while (System.currentTimeMillis() - started < JOB_TIMEOUT_MS) {
            val statusReq = Request.Builder()
                .url("$base/api/convert-audio/job/$jobId")
                .get()
                .build()
            val statusResp = client.newCall(statusReq).execute()
            if (!statusResp.isSuccessful) {
                throw IllegalStateException("Lost connection to conversion job (HTTP ${statusResp.code})")
            }

            val statusJson = JSONObject(statusResp.body?.string().orEmpty())
            val stage = statusJson.optString("stage", "validate")
            val percent = statusJson.optInt("percent", lastPercent).coerceIn(5, 99)
            val message = statusJson.optString("message", "Processing…")
            lastPercent = percent

            val stageLabel = when (stage) {
                "validate" -> "Validating"
                "extract" -> "Extracting"
                "ffmpeg" -> "FFmpeg"
                "save" -> "Saving"
                "done" -> "Complete"
                "error" -> "Error"
                else -> "Processing"
            }
            onProgress(percent / 100f, "$stageLabel: $message")

            if (stage == "error") {
                val err = statusJson.optString("error", "Conversion failed")
                throw IllegalStateException(err)
            }
            if (statusJson.optBoolean("done", false) || stage == "done") {
                break
            }
            delay(POLL_MS)
        }

        if (System.currentTimeMillis() - started >= JOB_TIMEOUT_MS) {
            throw IllegalStateException("Conversion timed out after 3 minutes. Try MP3 320 on Wi‑Fi.")
        }

        onProgress(0.94f, "Downloading mastered ${targetFormat.code} file…")

        val downloadReq = Request.Builder()
            .url("$base/api/convert-audio/job/$jobId/download")
            .get()
            .build()
        val downloadResp = client.newCall(downloadReq).execute()
        if (!downloadResp.isSuccessful || downloadResp.body == null) {
            throw IllegalStateException("Could not download converted audio (HTTP ${downloadResp.code})")
        }

        val title = downloadResp.header("X-Audio-Title")?.let { URLDecoder.decode(it, "UTF-8") }
            ?: titleHint
            ?: "Open Grace Track"
        val artist = downloadResp.header("X-Audio-Artist")?.let { URLDecoder.decode(it, "UTF-8") }
            ?: artistHint
            ?: "Open Grace Music"
        val durationSec = downloadResp.header("X-Audio-Duration")?.toIntOrNull() ?: 0
        val ytId = downloadResp.header("X-Audio-Id")
        val thumb = downloadResp.header("X-Audio-Thumbnail")?.let { URLDecoder.decode(it, "UTF-8") }

        val ext = downloadResp.header("X-Audio-Extension") ?: targetFormat.extension
        val cleanTitle = title.replace("[^a-zA-Z0-9._ -]".toRegex(), "").trim().ifEmpty { "track" }
        val outFile = File.createTempFile("${cleanTitle}_", ".$ext")

        downloadResp.body!!.byteStream().use { input ->
            outFile.outputStream().use { output -> input.copyTo(output) }
        }

        if (outFile.length() < 20_000) {
            outFile.delete()
            throw IllegalStateException("Downloaded audio file was empty")
        }

        onProgress(0.98f, "Studio ${targetFormat.code} master received ✓")
        Log.d(TAG, "Server conversion OK: ${outFile.length()} bytes")

        ServerConvertResult(
            file = outFile,
            title = title,
            artist = artist,
            durationSec = durationSec,
            thumbnailUrl = thumb,
            ytId = ytId
        )
    }

    private fun parseServerError(raw: String): String? {
        return try {
            JSONObject(raw).optString("error").takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            raw.takeIf { it.isNotBlank() }?.take(200)
        }
    }
}
