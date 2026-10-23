package com.example.data.downloader

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import com.example.data.model.StorageStatus
import com.example.data.model.Track
import com.example.data.model.TrackSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream

object DeviceMusicHelper {
    private const val TAG = "DeviceMusicHelper"

    fun resolveMimeType(formatOrExtOrMime: String): String {
        val lower = formatOrExtOrMime.trim().lowercase()
        return when {
            lower == "flac" || lower.endsWith(".flac") || lower.contains("audio/flac") -> "audio/flac"
            lower == "alac" || lower == "m4a" || lower.endsWith(".m4a") || lower.contains("audio/mp4") || lower.contains("alac") -> "audio/mp4"
            lower == "dsd" || lower == "dsf" || lower == "dff" || lower.endsWith(".dsf") || lower.endsWith(".dff") || lower.contains("dsf") || lower.contains("dsd") -> "audio/x-dsf"
            lower == "wav" || lower.endsWith(".wav") || lower.contains("audio/wav") || lower.contains("audio/x-wav") -> "audio/wav"
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
     * Saves an audio file (FLAC, ALAC, DSD, WAV, MP3) to Android's public Music folder using MediaStore,
     * making it instantly accessible to both OGM and any system music player under Music/OpenGraceMusic.
     */
    suspend fun saveToSystemMusicFolder(
        context: Context,
        sourceFile: File,
        title: String,
        artist: String,
        album: String = "Open Grace Music",
        mimeType: String = "audio/flac"
    ): Uri? = withContext(Dispatchers.IO) {
        try {
            val resolver = context.contentResolver
            val normalizedMime = resolveMimeType(mimeType.ifBlank { sourceFile.extension })
            val ext = resolveExtension(normalizedMime)
            val cleanBase = title.replace("\\.[a-zA-Z0-9]+$".toRegex(), "").trim().ifEmpty { "track" }
            val displayName = "$cleanBase.$ext"

            val contentValues = ContentValues().apply {
                put(MediaStore.Audio.Media.DISPLAY_NAME, displayName)
                put(MediaStore.Audio.Media.TITLE, cleanBase)
                put(MediaStore.Audio.Media.ARTIST, artist)
                put(MediaStore.Audio.Media.ALBUM, album)
                put(MediaStore.Audio.Media.MIME_TYPE, normalizedMime)
                put(MediaStore.Audio.Media.IS_MUSIC, 1)

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Audio.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MUSIC}/OpenGraceMusic")
                    put(MediaStore.Audio.Media.IS_PENDING, 1)
                }
            }

            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            }

            val uri = resolver.insert(collection, contentValues) ?: return@withContext null

            resolver.openOutputStream(uri)?.use { out ->
                FileInputStream(sourceFile).use { input ->
                    input.copyTo(out)
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.Audio.Media.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
            }

            Log.i(TAG, "Successfully exported to MediaStore: $uri")
            return@withContext uri
        } catch (e: Exception) {
            Log.e(TAG, "Error saving to MediaStore", e)
            null
        }
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
