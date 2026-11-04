package com.example.data.downloader

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import com.example.data.model.StorageStatus
import com.example.data.model.Track
import com.example.data.model.TrackSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

object DeviceMusicHelper {
    private const val TAG = "DeviceMusicHelper"

    /** Public Music subfolder. Trailing slash is for MediaStore RELATIVE_PATH. */
    const val MUSIC_SUBDIR = "Open Grace Music"

    fun relativePath(): String = "${Environment.DIRECTORY_MUSIC}/$MUSIC_SUBDIR/"

    fun sanitizeFileBase(title: String): String {
        val cleaned = title
            .replace(Regex("[\\\\/:*?\"<>|]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .trimEnd('.')
            .take(80)
        return cleaned.ifEmpty { "Open Grace Music" }
    }

    fun resolveMimeType(formatOrExtOrMime: String): String {
        val lower = formatOrExtOrMime.trim().lowercase()
        return when {
            lower == "flac" || lower.endsWith(".flac") || lower.contains("audio/flac") -> "audio/flac"
            lower == "alac" || lower == "m4a" || lower.endsWith(".m4a") || lower.contains("audio/mp4") || lower.contains("alac") -> "audio/mp4"
            lower == "dsd" || lower == "dsf" || lower == "dff" || lower.endsWith(".dsf") || lower.endsWith(".dff") || lower.contains("dsf") || lower.contains("dsd") -> "audio/x-dsf"
            lower == "wav" || lower.endsWith(".wav") || lower.contains("audio/wav") || lower.contains("audio/x-wav") -> "audio/wav"
            lower.contains("webm") || lower.contains("opus") -> "audio/webm"
            lower.contains("ogg") -> "audio/ogg"
            else -> "audio/mpeg"
        }
    }

    fun resolveExtension(formatOrMime: String): String {
        val lower = formatOrMime.trim().lowercase()
        return when {
            lower.contains("flac") -> "flac"
            lower.contains("alac") || lower.contains("mp4") || lower.contains("m4a") -> "m4a"
            lower.contains("dsd") || lower.contains("dsf") || lower.contains("dff") -> "dsf"
            lower.contains("wav") -> "wav"
            lower.contains("webm") || lower.contains("opus") -> "webm"
            lower.contains("ogg") -> "ogg"
            else -> "mp3"
        }
    }

    /**
     * Saves an audio file to shared storage at Music/Open Grace Music so other players can see it.
     * Android 10+: MediaStore Audio + RELATIVE_PATH. Older: public Music directory + media scanner.
     */
    suspend fun saveToSystemMusicFolder(
        context: Context,
        sourceFile: File,
        title: String,
        artist: String,
        album: String = "Open Grace Music",
        mimeType: String = "audio/flac",
        durationMs: Long = 0L,
    ): Uri? = withContext(Dispatchers.IO) {
        saveToSystemMusicFolderSync(context, sourceFile, title, artist, album, mimeType, durationMs)
    }

    fun saveToSystemMusicFolderSync(
        context: Context,
        sourceFile: File,
        title: String,
        artist: String,
        album: String = "Open Grace Music",
        mimeType: String = "audio/flac",
        durationMs: Long = 0L,
    ): Uri? {
        return try {
            val normalizedMime = resolveMimeType(mimeType.ifBlank { sourceFile.extension })
            val ext = resolveExtension(normalizedMime.ifBlank { sourceFile.extension })
            val cleanBase = sanitizeFileBase(title.replace(Regex("\\.[a-zA-Z0-9]{1,5}$"), ""))
            val displayName = "$cleanBase.$ext"
            val safeArtist = artist.trim().ifEmpty { "Open Grace Music" }
            val safeAlbum = album.trim().ifEmpty { "Open Grace Music" }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                insertViaMediaStore(
                    context,
                    sourceFile,
                    displayName,
                    cleanBase,
                    safeArtist,
                    safeAlbum,
                    normalizedMime,
                    durationMs,
                )
            } else {
                writeLegacyPublicMusic(
                    context,
                    sourceFile,
                    displayName,
                    normalizedMime,
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error saving to Music/$MUSIC_SUBDIR", e)
            null
        }
    }

    private fun insertViaMediaStore(
        context: Context,
        sourceFile: File,
        displayName: String,
        title: String,
        artist: String,
        album: String,
        mime: String,
        durationMs: Long,
    ): Uri? {
        val resolver = context.contentResolver
        val contentValues = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Audio.Media.TITLE, title)
            put(MediaStore.Audio.Media.ARTIST, artist)
            put(MediaStore.Audio.Media.ALBUM, album)
            put(MediaStore.Audio.Media.MIME_TYPE, mime)
            put(MediaStore.Audio.Media.IS_MUSIC, 1)
            put(MediaStore.Audio.Media.RELATIVE_PATH, relativePath())
            put(MediaStore.Audio.Media.IS_PENDING, 1)
            if (durationMs > 0) put(MediaStore.Audio.Media.DURATION, durationMs)
        }
        val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, contentValues) ?: return null
        resolver.openOutputStream(uri)?.use { out ->
            FileInputStream(sourceFile).use { input -> input.copyTo(out) }
        } ?: return null
        val done = ContentValues().apply {
            put(MediaStore.Audio.Media.IS_PENDING, 0)
        }
        resolver.update(uri, done, null, null)
        Log.i(TAG, "Exported to MediaStore $uri")
        return uri
    }

    @Suppress("DEPRECATION")
    private fun writeLegacyPublicMusic(
        context: Context,
        sourceFile: File,
        displayName: String,
        mime: String,
    ): Uri? {
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), MUSIC_SUBDIR)
        if (!dir.exists() && !dir.mkdirs()) {
            Log.e(TAG, "Could not create ${dir.absolutePath}")
            return null
        }
        var dest = File(dir, displayName)
        if (dest.exists()) {
            val base = dest.nameWithoutExtension
            val ext = dest.extension
            var n = 2
            while (dest.exists()) {
                dest = File(dir, "$base ($n).$ext")
                n += 1
            }
        }
        FileOutputStream(dest).use { out ->
            FileInputStream(sourceFile).use { input -> input.copyTo(out) }
        }
        MediaScannerConnection.scanFile(context, arrayOf(dest.absolutePath), arrayOf(mime), null)
        Log.i(TAG, "Exported to ${dest.absolutePath}")
        return Uri.fromFile(dest)
    }

    private data class SaveSession(
        val file: File,
        val title: String,
        val artist: String,
        val album: String,
        val mime: String,
        val durationMs: Long,
    )

    private val saveSessions = ConcurrentHashMap<String, SaveSession>()

    fun beginWebSave(context: Context, metaJson: String): String {
        val meta = JSONObject(metaJson)
        val id = "ms_${UUID.randomUUID().toString().replace("-", "").take(16)}"
        val dir = File(context.cacheDir, "ogm_music").apply { mkdirs() }
        val file = File(dir, "$id.bin")
        if (file.exists()) file.delete()
        file.createNewFile()
        saveSessions[id] = SaveSession(
            file = file,
            title = meta.optString("title").ifBlank { "Open Grace Music" },
            artist = meta.optString("artist").ifBlank { "Open Grace Music" },
            album = meta.optString("album").ifBlank { "Open Grace Music" },
            mime = meta.optString("mime").ifBlank { "audio/mpeg" },
            durationMs = meta.optLong("durationMs", 0L),
        )
        return id
    }

    fun appendWebSave(id: String, base64Chunk: String) {
        val session = saveSessions[id] ?: throw IllegalStateException("Unknown save session")
        val bytes = Base64.decode(base64Chunk, Base64.DEFAULT)
        FileOutputStream(session.file, true).use { it.write(bytes) }
    }

    fun finishWebSave(context: Context, id: String): String {
        val session = saveSessions.remove(id) ?: return JSONObject().put("ok", false).put("error", "Unknown save").toString()
        return try {
            val uri = saveToSystemMusicFolderSync(
                context,
                session.file,
                session.title,
                session.artist,
                session.album,
                session.mime,
                session.durationMs,
            )
            session.file.delete()
            if (uri == null) {
                JSONObject().put("ok", false).put("error", "Could not write Music/$MUSIC_SUBDIR").toString()
            } else {
                JSONObject().put("ok", true).put("uri", uri.toString()).toString()
            }
        } catch (e: Exception) {
            session.file.delete()
            JSONObject().put("ok", false).put("error", e.message ?: "save failed").toString()
        }
    }

    fun cancelWebSave(id: String) {
        saveSessions.remove(id)?.file?.delete()
    }

    /**
     * Scans music files (FLAC, ALAC, WAV, DSD, MP3) existing on the user's phone / MediaStore.
     */
    suspend fun scanDeviceMusic(context: Context): List<Track> = withContext(Dispatchers.IO) {
        val tracks = mutableListOf<Track>()
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.MIME_TYPE,
            MediaStore.Audio.Media.DATA
        )
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"

        try {
            val cursor = context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                "${MediaStore.Audio.Media.DATE_ADDED} DESC"
            )

            cursor?.use {
                val idCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val titleCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val albumCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                val durationCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                val sizeCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
                val mimeCol = it.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE)
                val dataCol = it.getColumnIndex(MediaStore.Audio.Media.DATA)

                while (it.moveToNext()) {
                    val mediaId = it.getLong(idCol)
                    val title = it.getString(titleCol) ?: "Unknown Track"
                    val artist = it.getString(artistCol) ?: "Unknown Artist"
                    val album = it.getString(albumCol) ?: "Device Music"
                    val duration = it.getLong(durationCol)
                    val size = it.getLong(sizeCol)
                    val mime = if (mimeCol >= 0) it.getString(mimeCol) ?: "" else ""
                    val path = if (dataCol >= 0) it.getString(dataCol) ?: "" else ""

                    val detectedFormat = when {
                        mime.contains("flac", ignoreCase = true) || path.endsWith(".flac", ignoreCase = true) -> "FLAC"
                        path.endsWith(".m4a", ignoreCase = true) || mime.contains("alac", ignoreCase = true) || mime.contains("mp4", ignoreCase = true) -> "ALAC"
                        path.endsWith(".dsf", ignoreCase = true) || path.endsWith(".dff", ignoreCase = true) || mime.contains("dsf", ignoreCase = true) || mime.contains("dsd", ignoreCase = true) -> "DSD"
                        mime.contains("wav", ignoreCase = true) || path.endsWith(".wav", ignoreCase = true) -> "WAV"
                        else -> "MP3"
                    }
                    val formatSpec = com.example.data.model.AudiophileFormat.fromCode(detectedFormat)
                    val isInstrumental = com.example.data.LyricsGenerator.isInstrumentalTrack(title, artist)

                    val contentUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        mediaId
                    )

                    tracks.add(
                        Track(
                            id = "device_$mediaId",
                            title = title,
                            artist = if (artist == "<unknown>") "Local Artist" else artist,
                            album = album,
                            durationMs = duration,
                            sizeBytes = size,
                            format = detectedFormat,
                            filePath = path,
                            uriString = contentUri.toString(),
                            source = TrackSource.DEVICE_MUSIC,
                            savedToDeviceMusic = true,
                            storageStatus = StorageStatus.SAVED_MUSIC_FOLDER,
                            bitrateKbps = formatSpec.bitrateKbps,
                            sampleRateHz = formatSpec.sampleRateHz,
                            bitDepth = formatSpec.bitDepth,
                            isInstrumental = isInstrumental
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error scanning device music", e)
        }
        tracks
    }
}
