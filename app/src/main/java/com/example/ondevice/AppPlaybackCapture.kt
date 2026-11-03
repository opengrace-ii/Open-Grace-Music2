package com.example.ondevice

import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** Android 10+ capture of THIS app's playing audio (not the microphone). */
interface AppPlaybackCapture {
    data class Result(val file: File, val durationSec: Int)

    /**
     * Record mixed playback from this UID while [videoId] plays in the WebView.
     * Returns null if the user denies the capture prompt or the OS cannot record.
     */
    fun recordPlayingAppAudio(
        videoId: String,
        cancelled: AtomicBoolean,
        onProgress: (percent: Int, message: String) -> Unit,
    ): Result?

    companion object {
        const val CLIENT_NAME = "APP_PLAYBACK_CAPTURE"
    }
}
