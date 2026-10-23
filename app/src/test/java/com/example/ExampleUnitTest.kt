package com.example

import com.example.data.model.StorageStatus
import com.example.data.model.Track
import com.example.data.model.TrackSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class ExampleUnitTest {
    @Test
    fun addition_isCorrect() {
        assertEquals(4, 2 + 2)
    }

    @Test
    fun track_formattedDuration_formatsCorrectly() {
        val track = Track(
            id = "test_1",
            title = "Graceful Horizon",
            artist = "Open Grace Music",
            durationMs = 215000L // 3 minutes 35 seconds
        )
        assertEquals("3:35", track.formattedDuration)
    }

    @Test
    fun track_initials_generatesCorrectMonogram() {
        val track = Track(
            id = "test_2",
            title = "Open Grace Music",
            artist = "OGM"
        )
        assertEquals("OG", track.initials)
    }

    @Test
    fun track_formattedSize_handlesVariousRanges() {
        val trackMb = Track(id = "1", title = "T1", sizeBytes = 5_400_000L)
        assertEquals("5.4 MB", trackMb.formattedSize)

        val trackKb = Track(id = "2", title = "T2", sizeBytes = 850_000L)
        assertEquals("850 KB", trackKb.formattedSize)
    }

    @Test
    fun audiophileFormats_and_mimeMapping_areAccurate() {
        assertEquals("audio/flac", com.example.data.downloader.DeviceMusicHelper.resolveMimeType("FLAC"))
        assertEquals("audio/mp4", com.example.data.downloader.DeviceMusicHelper.resolveMimeType("ALAC"))
        assertEquals("audio/x-dsf", com.example.data.downloader.DeviceMusicHelper.resolveMimeType("DSD"))
        assertEquals("audio/wav", com.example.data.downloader.DeviceMusicHelper.resolveMimeType("WAV"))
        assertEquals("audio/mpeg", com.example.data.downloader.DeviceMusicHelper.resolveMimeType("MP3"))

        val dsdTrack = Track(
            id = "dsd_1",
            title = "Nocturne Piano Instrumental",
            format = "DSD",
            bitDepth = 1,
            sampleRateHz = 2822400,
            bitrateKbps = 5644,
            isInstrumental = true
        )
        assertEquals("1-bit DSD", dsdTrack.bitDepthLabel)
        assertEquals("2.8 MHz", dsdTrack.sampleRateLabel)
        assertEquals("DSD · 1-bit DSD/2.8 MHz", dsdTrack.audiophileBadge)

        val chordSheet = com.example.data.LyricsGenerator.generate(dsdTrack.title, dsdTrack.artist)
        org.junit.Assert.assertTrue(chordSheet.isInstrumental)
        org.junit.Assert.assertTrue(chordSheet.content.contains("INSTRUMENT CHORD SHEET"))
        org.junit.Assert.assertTrue(chordSheet.content.contains("BPM"))

        val vocalLyrics = com.example.data.LyricsGenerator.generate("Amazing Grace", "Open Grace Choir")
        org.junit.Assert.assertFalse(vocalLyrics.isInstrumental)
        org.junit.Assert.assertTrue(vocalLyrics.content.contains("VOCAL LYRICS"))
    }
}
