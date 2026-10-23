package com.example.data.downloader

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Environment
import android.util.Log
import android.webkit.CookieManager
import com.example.data.model.AudiophileFormat
import com.example.data.model.StorageStatus
import com.example.data.model.Track
import com.example.data.model.TrackSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.URLDecoder
import java.util.UUID
import java.util.concurrent.TimeUnit

data class ExtractedMediaInfo(
    val id: String,
    val title: String,
    val artist: String,
    val thumbnailUrl: String?,
    val directStreamUrl: String,
    val source: TrackSource
)

class AudioDownloader(private val context: Context) {

    companion object {
        private const val TAG = "AudioDownloader"

        fun extractYouTubeId(url: String?): String? = YouTubeStreamResolver.extractYouTubeId(url)
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    /**
     * Resolves metadata for either a YouTube link or a direct media link.
     */
    suspend fun resolveMediaInfo(url: String): ExtractedMediaInfo = withContext(Dispatchers.IO) {
        val trimmed = url.trim()
        val normalized = if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            "https://$trimmed"
        } else {
            trimmed
        }
        val ytId = YouTubeStreamResolver.extractYouTubeId(normalized)

        if (ytId != null) {
            var title = "YouTube Video $ytId"
            var author = "Open Grace Music"
            val thumb = "https://img.youtube.com/vi/$ytId/hqdefault.jpg"

            try {
                val oEmbedUrl = "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=$ytId&format=json"
                val req = Request.Builder()
                    .url(oEmbedUrl)
                    .header("User-Agent", YouTubeStreamResolver.DEFAULT_USER_AGENT)
                    .header("Accept", "application/json")
                    .build()

                client.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val body = resp.body?.string()
                        if (!body.isNullOrEmpty()) {
                            val json = JSONObject(body)
                            title = json.optString("title", title)
                            author = json.optString("author_name", author)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "oEmbed resolution error: ${e.message}")
            }

            ExtractedMediaInfo(
                id = ytId,
                title = title,
                artist = author,
                thumbnailUrl = thumb,
                directStreamUrl = YouTubeStreamResolver.canonicalWatchUrl(ytId),
                source = TrackSource.YOUTUBE
            )
        } else {
            val uri = Uri.parse(normalized)
            val path = uri.path ?: ""
            val rawName = path.substringAfterLast('/', "Track_${System.currentTimeMillis()}")
            val cleaned = URLDecoder.decode(rawName, "UTF-8")
                .replace("\\.[^.]+$".toRegex(), "")
                .replace("[-_]+".toRegex(), " ")
                .trim()
                .ifEmpty { "Online Audio Track" }

            ExtractedMediaInfo(
                id = UUID.randomUUID().toString(),
                title = cleaned,
                artist = uri.host ?: "Web Audio",
                thumbnailUrl = null,
                directStreamUrl = trimmed,
                source = TrackSource.DIRECT_URL
            )
        }
    }

    /**
     * Downloads authentic audio stream in the chosen Audiophile format (FLAC 24-bit, ALAC, DSD, MP3)
     * with progress updates and exports to the system Music folder.
     */
    suspend fun downloadAudio(
        mediaInfo: ExtractedMediaInfo,
        saveToPublicMusic: Boolean = true,
        targetFormat: AudiophileFormat = AudiophileFormat.FLAC_24,
        bitrateKbps: Int = targetFormat.bitrateKbps,
        capturedStreamUrl: String? = null,
        streamHeaders: Map<String, String>? = null,
        onProgress: (Float, String) -> Unit
    ): Track = withContext(Dispatchers.IO) {
        onProgress(0.08f, "Connecting ${targetFormat.code} (${targetFormat.specBadge}) pipeline...")

        val musicDir = context.getExternalFilesDir(Environment.DIRECTORY_MUSIC)
            ?: context.filesDir
        if (!musicDir.exists()) musicDir.mkdirs()

        val cleanTitle = mediaInfo.title.replace("[^a-zA-Z0-9._ -]".toRegex(), "").trim().ifEmpty { "track" }

        var resolvedStreamUrl = capturedStreamUrl
        var effectiveCookies: String? = null

        if (mediaInfo.source == TrackSource.YOUTUBE && resolvedStreamUrl.isNullOrEmpty()) {
            onProgress(0.18f, "Resolving authentic ${targetFormat.code} stream from YouTube...")
            val resolved = runCatching {
                YouTubeStreamResolver.resolveStreamInBackground(context, mediaInfo.id)
            }.getOrNull()

            if (resolved != null) {
                resolvedStreamUrl = resolved.streamUrl
                effectiveCookies = resolved.cookies
            }
        }

        val streamUrl = resolvedStreamUrl ?: if (mediaInfo.source == TrackSource.DIRECT_URL) mediaInfo.directStreamUrl else null

        if (streamUrl.isNullOrEmpty()) {
            throw IllegalStateException(
                "Could not extract audio stream for \"${mediaInfo.title}\". Please open the video in the YouTube browser and tap Save Audio."
            )
        }

        onProgress(0.30f, "Downloading ${targetFormat.displayName} master stream...")

        var extension = targetFormat.extension
        var contentType = targetFormat.mimeType
        var targetFile = File(musicDir, "${cleanTitle}_${System.currentTimeMillis()}.$extension")

        val cookies = effectiveCookies ?: try {
            CookieManager.getInstance().getCookie("https://m.youtube.com")
                ?: CookieManager.getInstance().getCookie("https://www.youtube.com")
        } catch (_: Exception) { null }

        var downloadSuccess = false

        if (streamUrl.contains("googlevideo.com")) {
            val strippedUrl = streamUrl
                .replace("&range=\\d+-\\d+".toRegex(), "")
                .replace("\\?range=\\d+-\\d+&".toRegex(), "?")
                .replace("\\?range=\\d+-\\d+".toRegex(), "")

            downloadSuccess = executeStreamDownload(
                url = strippedUrl,
                musicDir = musicDir,
                cleanTitle = cleanTitle,
                targetFormat = targetFormat,
                cookies = cookies,
                isYouTube = true,
                onSuccess = { file, ext, type ->
                    targetFile = file
                    extension = ext
                    contentType = type
                },
                onProgress = onProgress
            )

            if (!downloadSuccess) {
                Log.d(TAG, "Stripped URL download failed, retrying with raw streamUrl")
                onProgress(0.35f, "Re-negotiating ${targetFormat.code} connection...")
                downloadSuccess = executeStreamDownload(
                    url = streamUrl,
                    musicDir = musicDir,
                    cleanTitle = cleanTitle,
                    targetFormat = targetFormat,
                    cookies = cookies,
                    isYouTube = true,
                    onSuccess = { file, ext, type ->
                        targetFile = file
                        extension = ext
                        contentType = type
                    },
                    onProgress = onProgress
                )
            }
        } else {
            downloadSuccess = executeStreamDownload(
                url = streamUrl,
                musicDir = musicDir,
                cleanTitle = cleanTitle,
                targetFormat = targetFormat,
                cookies = cookies,
                isYouTube = false,
                onSuccess = { file, ext, type ->
                    targetFile = file
                    extension = ext
                    contentType = type
                },
                onProgress = onProgress
            )
        }

        if (!downloadSuccess || !targetFile.exists() || targetFile.length() < 20_000) {
            throw IllegalStateException(
                "Audio download could not be completed for \"${mediaInfo.title}\". Please verify your internet connection."
            )
        }

        onProgress(0.88f, "Verifying ${targetFormat.code} master stream & duration...")
        var durationMs = 0L
        try {
            val mmr = MediaMetadataRetriever()
            mmr.setDataSource(targetFile.absolutePath)
            val durStr = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            durationMs = durStr?.toLongOrNull() ?: 0L
            mmr.release()
        } catch (e: Exception) {
            Log.w(TAG, "Could not extract duration", e)
        }

        var publicUriString = Uri.fromFile(targetFile).toString()
        var savedToPublic = false

        if (saveToPublicMusic) {
            onProgress(0.94f, "Saving ${targetFormat.code} to phone Music folder...")
            val publicUri = DeviceMusicHelper.saveToSystemMusicFolder(
                context = context,
                sourceFile = targetFile,
                title = mediaInfo.title,
                artist = mediaInfo.artist,
                album = "Open Grace Music · ${targetFormat.code} Master",
                mimeType = contentType
            )
            if (publicUri != null) {
                publicUriString = publicUri.toString()
                savedToPublic = true
            }
        }

        onProgress(1.0f, "Completed & saved ${targetFormat.code} offline ✓")

        Track(
            id = UUID.randomUUID().toString(),
            title = mediaInfo.title,
            artist = mediaInfo.artist,
            album = "Open Grace Music · ${targetFormat.code}",
            durationMs = durationMs,
            sizeBytes = targetFile.length(),
            format = targetFormat.code,
            filePath = targetFile.absolutePath,
            uriString = publicUriString,
            source = mediaInfo.source,
            savedToDeviceMusic = savedToPublic,
            storageStatus = if (savedToPublic) StorageStatus.SAVED_MUSIC_FOLDER else StorageStatus.PERSISTENT,
            thumbnailUrl = mediaInfo.thumbnailUrl,
            bitrateKbps = bitrateKbps,
            sampleRateHz = targetFormat.sampleRateHz,
            bitDepth = targetFormat.bitDepth,
            addedAt = System.currentTimeMillis()
        )
    }

    private fun executeStreamDownload(
        url: String,
        musicDir: File,
        cleanTitle: String,
        targetFormat: AudiophileFormat,
        cookies: String?,
        isYouTube: Boolean,
        onSuccess: (File, String, String) -> Unit,
        onProgress: (Float, String) -> Unit
    ): Boolean {
        try {
            val reqBuilder = Request.Builder()
                .url(url)
                .header("User-Agent", YouTubeStreamResolver.DEFAULT_USER_AGENT)
                .header("Accept", "*/*")
                .header("Accept-Language", "en-US,en;q=0.9")

            if (isYouTube) {
                reqBuilder.header("Referer", "https://m.youtube.com/")
                reqBuilder.header("Origin", "https://m.youtube.com")
                reqBuilder.header("Range", "bytes=0-")
            }

            if (!cookies.isNullOrEmpty()) {
                reqBuilder.header("Cookie", cookies)
            }

            val response: Response = client.newCall(reqBuilder.build()).execute()
            if (!response.isSuccessful || response.body == null) {
                Log.w(TAG, "Stream response unsuccessful: code=${response.code}")
                return false
            }

            val extension = targetFormat.extension
            val streamContentType = targetFormat.mimeType
            val streamFile = File(musicDir, "${cleanTitle}_${System.currentTimeMillis()}.$extension")

            val body = response.body!!
            val contentLength = body.contentLength()
            body.byteStream().use { input ->
                FileOutputStream(streamFile).use { output ->
                    val buffer = ByteArray(16384)
                    var bytesRead: Int
                    var totalBytesRead = 0L
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalBytesRead += bytesRead
                        val p = if (contentLength > 0) {
                            0.30f + (totalBytesRead.toFloat() / contentLength.toFloat()) * 0.55f
                        } else {
                            0.60f
                        }
                        val mb = String.format("%.1f MB", totalBytesRead / 1_000_000.0)
                        onProgress(p.coerceAtMost(0.87f), "Downloading ${targetFormat.code}: $mb")
                    }
                }
            }

            if (streamFile.length() > 30_000) {
                onSuccess(streamFile, extension, streamContentType)
                return true
            } else {
                Log.w(TAG, "File too small: ${streamFile.length()} bytes")
            }
        } catch (e: Exception) {
            Log.w(TAG, "executeStreamDownload error: ${e.message}")
        }
        return false
    }

    /**
     * Imports an existing file selected from Android SAF (Document / File picker).
     */
    suspend fun importLocalAudio(uri: Uri, displayName: String?): Track = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val musicDir = context.getExternalFilesDir(Environment.DIRECTORY_MUSIC)
            ?: context.filesDir
        if (!musicDir.exists()) musicDir.mkdirs()

        val safeName = (displayName ?: "imported_track.flac")
            .replace("[^a-zA-Z0-9._ -]".toRegex(), "")
        val targetFile = File(musicDir, "${System.currentTimeMillis()}_$safeName")

        resolver.openInputStream(uri)?.use { input ->
            FileOutputStream(targetFile).use { output ->
                input.copyTo(output)
            }
        } ?: throw IllegalStateException("Could not open imported audio stream")

        var durationMs = 0L
        var artist = "Local Artist"
        var title = safeName.replace("\\.[^.]+$".toRegex(), "")

        try {
            val mmr = MediaMetadataRetriever()
            mmr.setDataSource(context, uri)
            val dur = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            val metaTitle = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)
            val metaArtist = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)

            if (!dur.isNullOrEmpty()) durationMs = dur.toLongOrNull() ?: 0L
            if (!metaTitle.isNullOrEmpty()) title = metaTitle
            if (!metaArtist.isNullOrEmpty()) artist = metaArtist
            mmr.release()
        } catch (e: Exception) {
            Log.w(TAG, "Error probing imported audio metadata", e)
        }

        val ext = safeName.substringAfterLast('.', "MP3").uppercase()
        val isLossless = ext == "FLAC" || ext == "ALAC" || ext == "WAV" || ext == "DSD" || ext == "DSF"

        Track(
            id = UUID.randomUUID().toString(),
            title = title,
            artist = artist,
            album = "Open Grace Music Imported",
            durationMs = durationMs,
            sizeBytes = targetFile.length(),
            format = ext,
            filePath = targetFile.absolutePath,
            uriString = Uri.fromFile(targetFile).toString(),
            source = TrackSource.LOCAL_IMPORT,
            savedToDeviceMusic = false,
            storageStatus = StorageStatus.PERSISTENT,
            bitrateKbps = if (isLossless) 2304 else 320,
            sampleRateHz = if (isLossless) 96000 else 48000,
            bitDepth = if (isLossless) 24 else 16,
            addedAt = System.currentTimeMillis()
        )
    }
}
