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
    val sampleRateLabel: String,
    val bitDepth: Int,
    val bitDepthLabel: String,
    val extension: String,
    val mimeType: String
) {
    FLAC_24(
        code = "FLAC",
        displayName = "FLAC 24-bit/192kHz Lossless",
        specBadge = "24-bit / 192 kHz Studio Master · 4608 kbps",
        bitrateKbps = 4608,
        sampleRateHz = 192000,
        sampleRateLabel = "192 kHz",
        bitDepth = 24,
        bitDepthLabel = "24-bit",
        extension = "flac",
        mimeType = "audio/flac"
    ),
    ALAC_24(
        code = "ALAC",
        displayName = "ALAC Studio Lossless",
        specBadge = "24-bit / 96 kHz Apple Lossless · 2304 kbps",
        bitrateKbps = 2304,
        sampleRateHz = 96000,
        sampleRateLabel = "96 kHz",
        bitDepth = 24,
        bitDepthLabel = "24-bit",
        extension = "m4a",
        mimeType = "audio/mp4"
    ),
    DSD_HIRES(
        code = "DSD",
        displayName = "DSD 64 High-Res",
        specBadge = "1-bit DSD / 2.8 MHz SACD Master · 5644 kbps",
        bitrateKbps = 5644,
        sampleRateHz = 2822400,
        sampleRateLabel = "2.8 MHz",
        bitDepth = 1,
        bitDepthLabel = "1-bit DSD",
        extension = "dsf",
        mimeType = "audio/x-dsf"
    ),
    WAV_24(
        code = "WAV",
        displayName = "WAV 24-bit Uncompressed",
        specBadge = "24-bit / 96 kHz Linear PCM · 4608 kbps",
        bitrateKbps = 4608,
        sampleRateHz = 96000,
        sampleRateLabel = "96 kHz",
        bitDepth = 24,
        bitDepthLabel = "24-bit",
        extension = "wav",
        mimeType = "audio/wav"
    ),
    MP3_320(
        code = "MP3",
        displayName = "MP3 320kbps Master",
        specBadge = "16-bit / 44.1 kHz CBR Master · 320 kbps",
        bitrateKbps = 320,
        sampleRateHz = 44100,
        sampleRateLabel = "44.1 kHz",
        bitDepth = 16,
        bitDepthLabel = "16-bit",
        extension = "mp3",
        mimeType = "audio/mpeg"
    );

    companion object {
        fun fromCode(code: String): AudiophileFormat {
            return when (code.uppercase()) {
                "FLAC" -> FLAC_24
                "ALAC", "M4A" -> ALAC_24
                "DSD", "DSF", "DFF" -> DSD_HIRES
                "WAV", "PCM" -> WAV_24
                else -> MP3_320
            }
        }
    }
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
    val bitrateKbps: Int = 4608,
    val sampleRateHz: Int = 192000,
    val bitDepth: Int = 24,
    val isInstrumental: Boolean = false,
    val isFavorite: Boolean = false
) {
    val bitDepthLabel: String
        get() = when {
            format.equals("DSD", ignoreCase = true) || format.equals("DSF", ignoreCase = true) || bitDepth == 1 -> "1-bit DSD"
            bitDepth <= 16 -> "16-bit"
            else -> "${bitDepth}-bit"
        }

    val sampleRateLabel: String
        get() = when {
            sampleRateHz >= 2_000_000 -> String.format("%.1f MHz", sampleRateHz / 1_000_000.0)
            sampleRateHz == 44100 -> "44.1 kHz"
            sampleRateHz > 0 -> "${sampleRateHz / 1000} kHz"
            else -> "96 kHz"
        }

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
                "FLAC" -> "FLAC · $bitDepthLabel/$sampleRateLabel"
                "ALAC" -> "ALAC · $bitDepthLabel/$sampleRateLabel"
                "DSD", "DSF" -> "DSD · $bitDepthLabel/$sampleRateLabel"
                "WAV" -> "WAV · $bitDepthLabel/$sampleRateLabel"
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
