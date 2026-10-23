package com.example.data.model

enum class StorageStatus(val label: String) {
    SAVED_MUSIC_FOLDER("● IN MUSIC FOLDER"),
    PERSISTENT("● OFFLINE READY"),
    DEVICE_LOCAL("◐ DEVICE CACHED")
}

enum class TrackSource(val label: String) {
    YOUTUBE("YouTube"),
    DIRECT_URL("Direct URL"),
    LOCAL_IMPORT("Imported"),
    DEVICE_MUSIC("Device Music")
}

enum class AudiophileFormat(
    val code: String,
    val displayName: String,
    val specBadge: String,
    val bitrateKbps: Int,
    val sampleRateHz: Int,
    val bitDepth: Int,
    val extension: String,
    val mimeType: String
) {
    FLAC_24(
        code = "FLAC",
        displayName = "FLAC (24-bit Lossless)",
        specBadge = "24-bit / 96 kHz Studio Master",
        bitrateKbps = 2304,
        sampleRateHz = 96000,
        bitDepth = 24,
        extension = "flac",
        mimeType = "audio/flac"
    ),
    ALAC_24(
        code = "ALAC",
        displayName = "ALAC (Studio M4A)",
        specBadge = "24-bit / 96 kHz Apple Lossless",
        bitrateKbps = 2100,
        sampleRateHz = 96000,
        bitDepth = 24,
        extension = "m4a",
        mimeType = "audio/mp4"
    ),
    DSD_HIRES(
        code = "DSD",
        displayName = "DSD / Hi-Res PCM",
        specBadge = "24-bit / 192 kHz Audiophile Master",
        bitrateKbps = 4608,
        sampleRateHz = 192000,
        bitDepth = 24,
        extension = "wav",
        mimeType = "audio/wav"
    ),
    MP3_320(
        code = "MP3",
        displayName = "MP3 (320 kbps)",
        specBadge = "320 kbps CBR Master",
        bitrateKbps = 320,
        sampleRateHz = 48000,
        bitDepth = 16,
        extension = "mp3",
        mimeType = "audio/mpeg"
    ),
    MP3_192(
        code = "MP3",
        displayName = "MP3 (192 kbps)",
        specBadge = "192 kbps High Quality",
        bitrateKbps = 192,
        sampleRateHz = 48000,
        bitDepth = 16,
        extension = "mp3",
        mimeType = "audio/mpeg"
    )
}

data class Track(
    val id: String,
    val title: String,
    val artist: String = "Open Grace Music",
    val album: String = "Open Grace Music",
    val durationMs: Long = 0L,
    val sizeBytes: Long = 0L,
    val format: String = "FLAC",
    val filePath: String = "",
    val uriString: String = "",
    val source: TrackSource = TrackSource.YOUTUBE,
    val savedToDeviceMusic: Boolean = false,
    val storageStatus: StorageStatus = StorageStatus.PERSISTENT,
    val addedAt: Long = System.currentTimeMillis(),
    val thumbnailUrl: String? = null,
    val bitrateKbps: Int = 2304,
    val sampleRateHz: Int = 96000,
    val bitDepth: Int = 24,
    val isFavorite: Boolean = false
) {
    val formattedDuration: String
        get() {
            val totalSeconds = (durationMs / 1000).coerceAtLeast(0)
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            return "$minutes:${seconds.toString().padStart(2, '0')}"
        }

    val formattedSize: String
        get() {
            return when {
                sizeBytes >= 1_000_000 -> String.format("%.1f MB", sizeBytes / 1_000_000.0)
                sizeBytes >= 1_000 -> String.format("%d KB", sizeBytes / 1000)
                sizeBytes > 0 -> "$sizeBytes B"
                else -> "—"
            }
        }

    val audiophileBadge: String
        get() {
            val fmt = format.uppercase()
            return when (fmt) {
                "FLAC" -> "FLAC · ${bitDepth}-bit/${sampleRateHz / 1000}kHz"
                "ALAC" -> "ALAC · ${bitDepth}-bit/${sampleRateHz / 1000}kHz"
                "DSD", "DSF" -> "DSD · 24-bit/192kHz"
                "WAV" -> "WAV · ${bitDepth}-bit PCM"
                else -> "$fmt · $bitrateKbps kbps"
            }
        }

    val initials: String
        get() {
            val words = title.trim().split("\\s+".toRegex()).filter { it.isNotEmpty() }
            return if (words.isEmpty()) "OGM"
            else words.take(2).map { it.first().uppercaseChar() }.joinToString("")
        }
}
