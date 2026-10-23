package com.example.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.example.data.model.StorageStatus
import com.example.data.model.Track
import com.example.data.model.TrackSource

@Entity(tableName = "tracks")
data class TrackEntity(
    @PrimaryKey val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val durationMs: Long,
    val sizeBytes: Long,
    val format: String,
    val filePath: String,
    val uriString: String,
    val source: String,
    val savedToDeviceMusic: Boolean,
    val storageStatus: String,
    val addedAt: Long,
    val thumbnailUrl: String?,
    val bitrateKbps: Int,
    val sampleRateHz: Int = 96000,
    val bitDepth: Int = 24,
    val isFavorite: Boolean
) {
    fun toDomain(): Track {
        return Track(
            id = id,
            title = title,
            artist = artist,
            album = album,
            durationMs = durationMs,
            sizeBytes = sizeBytes,
            format = format,
            filePath = filePath,
            uriString = uriString,
            source = runCatching { TrackSource.valueOf(source) }.getOrDefault(TrackSource.YOUTUBE),
            savedToDeviceMusic = savedToDeviceMusic,
            storageStatus = runCatching { StorageStatus.valueOf(storageStatus) }.getOrDefault(StorageStatus.PERSISTENT),
            addedAt = addedAt,
            thumbnailUrl = thumbnailUrl,
            bitrateKbps = bitrateKbps,
            sampleRateHz = sampleRateHz,
            bitDepth = bitDepth,
            isFavorite = isFavorite
        )
    }

    companion object {
        fun fromDomain(track: Track): TrackEntity {
            return TrackEntity(
                id = track.id,
                title = track.title,
                artist = track.artist,
                album = track.album,
                durationMs = track.durationMs,
                sizeBytes = track.sizeBytes,
                format = track.format,
                filePath = track.filePath,
                uriString = track.uriString,
                source = track.source.name,
                savedToDeviceMusic = track.savedToDeviceMusic,
                storageStatus = track.storageStatus.name,
                addedAt = track.addedAt,
                thumbnailUrl = track.thumbnailUrl,
                bitrateKbps = track.bitrateKbps,
                sampleRateHz = track.sampleRateHz,
                bitDepth = track.bitDepth,
                isFavorite = track.isFavorite
            )
        }
    }
}
