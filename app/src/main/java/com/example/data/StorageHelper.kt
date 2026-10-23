package com.example.data

import android.content.Context
import android.os.Environment
import android.os.StatFs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

data class StorageInfo(
    val usedAppBytes: Long = 0L,
    val freeDeviceBytes: Long = 0L,
    val totalDeviceBytes: Long = 0L,
    val trackCount: Int = 0
) {
    val formattedUsed: String
        get() = formatSize(usedAppBytes)

    val formattedFree: String
        get() = formatSize(freeDeviceBytes)

    val formattedTotal: String
        get() = formatSize(totalDeviceBytes)

    private fun formatSize(bytes: Long): String {
        return when {
            bytes >= 1_000_000_000 -> String.format("%.1f GB", bytes / 1_000_000_000.0)
            bytes >= 1_000_000 -> String.format("%.1f MB", bytes / 1_000_000.0)
            bytes >= 1_000 -> String.format("%d KB", bytes / 1_000)
            else -> "$bytes B"
        }
    }
}

object StorageHelper {
    suspend fun calculateStorage(context: Context, trackCount: Int): StorageInfo = withContext(Dispatchers.IO) {
        var usedBytes = 0L
        val musicDir = context.getExternalFilesDir(Environment.DIRECTORY_MUSIC) ?: context.filesDir

        musicDir.listFiles()?.forEach { file ->
            if (file.isFile) {
                usedBytes += file.length()
            }
        }

        var freeBytes = 0L
        var totalBytes = 0L
        try {
            val stat = StatFs(Environment.getDataDirectory().path)
            freeBytes = stat.availableBlocksLong * stat.blockSizeLong
            totalBytes = stat.blockCountLong * stat.blockSizeLong
        } catch (_: Exception) {}

        StorageInfo(
            usedAppBytes = usedBytes,
            freeDeviceBytes = freeBytes,
            totalDeviceBytes = totalBytes,
            trackCount = trackCount
        )
    }
}
