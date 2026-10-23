package com.example.player

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.util.Log
import com.example.data.model.Track
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

enum class LoopMode {
    OFF,
    ALL,
    ONE
}

data class PlayerState(
    val currentTrack: Track? = null,
    val isPlaying: Boolean = false,
    val currentPositionMs: Long = 0L,
    val durationMs: Long = 0L,
    val queue: List<Track> = emptyList(),
    val currentIndex: Int = -1,
    val isShuffle: Boolean = false,
    val loopMode: LoopMode = LoopMode.OFF,
    val playbackSpeed: Float = 1.0f,
    val errorMessage: String? = null
) {
    val progress: Float
        get() = if (durationMs > 0) (currentPositionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f) else 0f

    val formattedCurrentTime: String
        get() {
            val totalSeconds = (currentPositionMs / 1000).coerceAtLeast(0)
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            return "$minutes:${seconds.toString().padStart(2, '0')}"
        }

    val formattedDuration: String
        get() {
            val totalSeconds = (durationMs / 1000).coerceAtLeast(0)
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            return "$minutes:${seconds.toString().padStart(2, '0')}"
        }
}

class OgmPlayer(private val context: Context) {
    companion object {
        private const val TAG = "OgmPlayer"
        @Volatile
        var activeInstance: OgmPlayer? = null
            private set
    }

    init {
        activeInstance = this
    }

    private val scope = CoroutineScope(Dispatchers.Main + Job())
    private var mediaPlayer: MediaPlayer? = null
    private var progressJob: Job? = null

    private val _playerState = MutableStateFlow(PlayerState())
    val playerState: StateFlow<PlayerState> = _playerState.asStateFlow()

    private fun initMediaPlayer() {
        mediaPlayer?.release()
        mediaPlayer = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build()
            )
            setOnCompletionListener {
                handleTrackCompletion()
            }
            setOnErrorListener { _, what, extra ->
                Log.e(TAG, "MediaPlayer error: what=$what, extra=$extra")
                _playerState.value = _playerState.value.copy(
                    isPlaying = false,
                    errorMessage = "Error playing audio ($what)"
                )
                true
            }
        }
    }

    fun playTrack(track: Track, newQueue: List<Track>? = null) {
        val currentQueue = newQueue ?: if (_playerState.value.queue.contains(track)) {
            _playerState.value.queue
        } else {
            listOf(track)
        }
        val targetIndex = currentQueue.indexOf(track).coerceAtLeast(0)
        setQueueAndPlay(currentQueue, targetIndex)
    }

    fun setQueueAndPlay(tracks: List<Track>, startIndex: Int) {
        if (tracks.isEmpty()) return
        val validIndex = startIndex.coerceIn(0, tracks.lastIndex)
        val track = tracks[validIndex]

        initMediaPlayer()

        try {
            val mp = mediaPlayer ?: return
            mp.reset()

            // Prepare datasource
            if (track.filePath.isNotEmpty() && File(track.filePath).exists()) {
                mp.setDataSource(track.filePath)
            } else if (track.uriString.isNotEmpty()) {
                mp.setDataSource(context, Uri.parse(track.uriString))
            } else {
                throw IllegalStateException("No valid media source for track: ${track.title}")
            }

            mp.prepare()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    val params = mp.playbackParams
                    params.speed = _playerState.value.playbackSpeed
                    mp.playbackParams = params
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to set playback speed", e)
                }
            }

            mp.start()

            val actualDuration = mp.duration.toLong().takeIf { it > 0 } ?: track.durationMs

            _playerState.value = _playerState.value.copy(
                currentTrack = track,
                isPlaying = true,
                currentPositionMs = 0L,
                durationMs = actualDuration,
                queue = tracks,
                currentIndex = validIndex,
                errorMessage = null
            )

            OgmPlaybackService.updateNotification(context, track.title, track.artist, true)

            startProgressUpdates()
        } catch (e: Exception) {
            Log.e(TAG, "Error playing track: ${track.title}", e)
            _playerState.value = _playerState.value.copy(
                errorMessage = "Could not play track: ${e.message}"
            )
        }
    }

    fun togglePlayPause() {
        val mp = mediaPlayer
        val current = _playerState.value

        if (mp == null || current.currentTrack == null) {
            if (current.queue.isNotEmpty()) {
                setQueueAndPlay(current.queue, (current.currentIndex).coerceAtLeast(0))
            }
            return
        }

        if (mp.isPlaying) {
            mp.pause()
            _playerState.value = current.copy(isPlaying = false)
            current.currentTrack?.let { OgmPlaybackService.updateNotification(context, it.title, it.artist, false) }
            stopProgressUpdates()
        } else {
            mp.start()
            _playerState.value = current.copy(isPlaying = true)
            current.currentTrack?.let { OgmPlaybackService.updateNotification(context, it.title, it.artist, true) }
            startProgressUpdates()
        }
    }

    fun seekTo(positionMs: Long) {
        val mp = mediaPlayer ?: return
        val clamped = positionMs.coerceIn(0, _playerState.value.durationMs)
        mp.seekTo(clamped.toInt())
        _playerState.value = _playerState.value.copy(currentPositionMs = clamped)
    }

    fun next() {
        val current = _playerState.value
        if (current.queue.isEmpty()) return

        val nextIndex = if (current.isShuffle) {
            (0 until current.queue.size).filter { it != current.currentIndex }.randomOrNull() ?: 0
        } else {
            (current.currentIndex + 1) % current.queue.size
        }
        setQueueAndPlay(current.queue, nextIndex)
    }

    fun previous() {
        val current = _playerState.value
        val mp = mediaPlayer

        if (mp != null && mp.currentPosition > 3000) {
            seekTo(0)
            return
        }

        if (current.queue.isEmpty()) return
        val prevIndex = if (current.currentIndex - 1 < 0) {
            current.queue.lastIndex
        } else {
            current.currentIndex - 1
        }
        setQueueAndPlay(current.queue, prevIndex)
    }

    fun toggleShuffle() {
        _playerState.value = _playerState.value.copy(
            isShuffle = !_playerState.value.isShuffle
        )
    }

    fun cycleLoopMode() {
        val nextMode = when (_playerState.value.loopMode) {
            LoopMode.OFF -> LoopMode.ALL
            LoopMode.ALL -> LoopMode.ONE
            LoopMode.ONE -> LoopMode.OFF
        }
        _playerState.value = _playerState.value.copy(loopMode = nextMode)
    }

    fun setSpeed(speed: Float) {
        _playerState.value = _playerState.value.copy(playbackSpeed = speed)
        val mp = mediaPlayer ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val params = mp.playbackParams
                params.speed = speed
                mp.playbackParams = params
            } catch (e: Exception) {
                Log.w(TAG, "Failed to apply speed", e)
            }
        }
    }

    private fun handleTrackCompletion() {
        val current = _playerState.value
        when (current.loopMode) {
            LoopMode.ONE -> {
                seekTo(0)
                mediaPlayer?.start()
                _playerState.value = current.copy(isPlaying = true)
                startProgressUpdates()
            }
            LoopMode.ALL -> {
                next()
            }
            LoopMode.OFF -> {
                if (current.currentIndex < current.queue.lastIndex) {
                    next()
                } else {
                    _playerState.value = current.copy(isPlaying = false, currentPositionMs = 0L)
                    stopProgressUpdates()
                }
            }
        }
    }

    private fun startProgressUpdates() {
        progressJob?.cancel()
        progressJob = scope.launch {
            while (isActive) {
                mediaPlayer?.let { mp ->
                    if (mp.isPlaying) {
                        _playerState.value = _playerState.value.copy(
                            currentPositionMs = mp.currentPosition.toLong()
                        )
                    }
                }
                delay(250)
            }
        }
    }

    private fun stopProgressUpdates() {
        progressJob?.cancel()
    }

    fun release() {
        stopProgressUpdates()
        mediaPlayer?.release()
        mediaPlayer = null
        if (activeInstance == this) {
            activeInstance = null
        }
        OgmPlaybackService.stopService(context)
    }
}
