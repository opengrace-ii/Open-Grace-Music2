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
}
