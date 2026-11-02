package com.example.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.example.MainActivity
import com.example.R

/**
 * Sticky foreground media-playback service.
 *
 * Used by:
 * - Native [OgmPlayer] (MediaPlayer) via [updateNotification]
 * - WebView PWA shell via [WebPlaybackBridge] so HTML5 / YouTube audio keeps a
 *   FOREGROUND_SERVICE_MEDIA_PLAYBACK notification while the Activity is minimized
 */
class OgmPlaybackService : Service() {

    companion object {
        const val CHANNEL_ID = "ogm_playback_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_PREV = "com.example.ogm.ACTION_PREV"
        const val ACTION_TOGGLE = "com.example.ogm.ACTION_TOGGLE"
        const val ACTION_NEXT = "com.example.ogm.ACTION_NEXT"
        const val ACTION_STOP = "com.example.ogm.ACTION_STOP"
        const val ACTION_ENSURE = "com.example.ogm.ACTION_ENSURE"

        @Volatile
        var webBridge: WebPlaybackBridge? = null

        fun updateNotification(context: Context, title: String, artist: String, isPlaying: Boolean) {
            val intent = Intent(context, OgmPlaybackService::class.java).apply {
                putExtra("title", title)
                putExtra("artist", artist)
                putExtra("isPlaying", isPlaying)
            }
            startServiceSafe(context, intent)
        }

        fun ensureRunning(context: Context, title: String = "Open Grace Music", artist: String = "Playing") {
            val intent = Intent(context, OgmPlaybackService::class.java).apply {
                action = ACTION_ENSURE
                putExtra("title", title)
                putExtra("artist", artist)
                putExtra("isPlaying", true)
            }
            startServiceSafe(context, intent)
        }

        fun stopService(context: Context) {
            try {
                context.stopService(Intent(context, OgmPlaybackService::class.java))
            } catch (_: Exception) {
            }
        }

        private fun startServiceSafe(context: Context, intent: Intent) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (_: Exception) {
                // Background start may be restricted; Activity should retry while resumed.
            }
        }
    }

    /** Callbacks from notification / MediaSession into the WebView host. */
    interface WebPlaybackBridge {
        fun onTransportToggle()
        fun onTransportNext()
        fun onTransportPrev()
        fun onTransportStop()
    }

    private val binder = LocalBinder()
    private var mediaSession: MediaSessionCompat? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var lastTitle: String = "Open Grace Music"
    private var lastArtist: String = "Open Grace Music"
    private var lastPlaying: Boolean = false

    inner class LocalBinder : Binder() {
        fun getService(): OgmPlaybackService = this@OgmPlaybackService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        initMediaSession()
        acquireWakeLock()
        requestAudioFocus()
    }

    private fun initMediaSession() {
        mediaSession = MediaSessionCompat(this, "OgmPlayback").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    dispatchToggle()
                }

                override fun onPause() {
                    dispatchToggle()
                }

                override fun onSkipToNext() {
                    dispatchNext()
                }

                override fun onSkipToPrevious() {
                    dispatchPrev()
                }

                override fun onStop() {
                    dispatchStop()
                }
            })
            isActive = true
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ogm:playback").apply {
            setReferenceCounted(false)
            acquire(6 * 60 * 60 * 1000L) // cap at 6h; refreshed while playing
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {
        }
        wakeLock = null
    }

    private fun requestAudioFocus() {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setOnAudioFocusChangeListener { /* WebView / HTML5 handles ducking */ }
                .build()
            audioFocusRequest = req
            am.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            am.requestAudioFocus(
                null,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            )
        }
    }

    private fun abandonAudioFocus() {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            am.abandonAudioFocus(null)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Open Grace Music Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background music playback controls"
                setShowBadge(false)
                setSound(null, null)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun showNotification(title: String, artist: String, isPlaying: Boolean) {
        lastTitle = title.ifBlank { "Open Grace Music" }
        lastArtist = artist.ifBlank { "Open Grace Music" }
        lastPlaying = isPlaying

        updateMediaSession(lastTitle, lastArtist, isPlaying)
        if (isPlaying) acquireWakeLock()

        val appIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val appPendingIntent = PendingIntent.getActivity(
            this, 0, appIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val prevPending = PendingIntent.getService(
            this, 1,
            Intent(this, OgmPlaybackService::class.java).apply { action = ACTION_PREV },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val togglePending = PendingIntent.getService(
            this, 2,
            Intent(this, OgmPlaybackService::class.java).apply { action = ACTION_TOGGLE },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val nextPending = PendingIntent.getService(
            this, 3,
            Intent(this, OgmPlaybackService::class.java).apply { action = ACTION_NEXT },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopPending = PendingIntent.getService(
            this, 4,
            Intent(this, OgmPlaybackService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val sessionToken = mediaSession?.sessionToken
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(lastTitle)
            .setContentText(lastArtist)
            .setSubText("Open Grace Music")
            .setSmallIcon(R.drawable.ic_ogm_logo)
            .setContentIntent(appPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOngoing(isPlaying)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_media_previous, "Previous", prevPending)
            .addAction(
                if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlaying) "Pause" else "Play",
                togglePending
            )
            .addAction(android.R.drawable.ic_media_next, "Next", nextPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPending)

        if (sessionToken != null) {
            builder.setStyle(
                MediaStyle()
                    .setMediaSession(sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
        }

        val notification = builder.build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateMediaSession(title: String, artist: String, isPlaying: Boolean) {
        val session = mediaSession ?: return
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Open Grace Music")
                .build()
        )
        val state = if (isPlaying) {
            PlaybackStateCompat.STATE_PLAYING
        } else {
            PlaybackStateCompat.STATE_PAUSED
        }
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or
                        PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackStateCompat.ACTION_STOP
                )
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build()
        )
        session.isActive = true
    }

    private fun dispatchToggle() {
        webBridge?.onTransportToggle()
            ?: OgmPlayer.activeInstance?.togglePlayPause()
    }

    private fun dispatchNext() {
        webBridge?.onTransportNext()
            ?: OgmPlayer.activeInstance?.next()
    }

    private fun dispatchPrev() {
        webBridge?.onTransportPrev()
            ?: OgmPlayer.activeInstance?.previous()
    }

    private fun dispatchStop() {
        webBridge?.onTransportStop()
        OgmPlayer.activeInstance?.let { player ->
            if (player.playerState.value.isPlaying) player.togglePlayPause()
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PREV -> dispatchPrev()
            ACTION_TOGGLE -> dispatchToggle()
            ACTION_NEXT -> dispatchNext()
            ACTION_STOP -> {
                dispatchStop()
                return START_NOT_STICKY
            }
            ACTION_ENSURE, null -> {
                val title = intent?.getStringExtra("title") ?: lastTitle
                val artist = intent?.getStringExtra("artist") ?: lastArtist
                val isPlaying = intent?.getBooleanExtra("isPlaying", true) ?: true
                showNotification(title, artist, isPlaying)
            }
            else -> {
                val title = intent.getStringExtra("title") ?: lastTitle
                val artist = intent.getStringExtra("artist") ?: lastArtist
                val isPlaying = intent.getBooleanExtra("isPlaying", true)
                showNotification(title, artist, isPlaying)
            }
        }
        // Sticky so OEM process reclaim is less likely while music is expected to continue.
        return START_STICKY
    }

    override fun onDestroy() {
        mediaSession?.isActive = false
        mediaSession?.release()
        mediaSession = null
        abandonAudioFocus()
        releaseWakeLock()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
