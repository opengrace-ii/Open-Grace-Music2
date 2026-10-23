package com.example.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.example.MainActivity
import com.example.R

class OgmPlaybackService : Service() {

    companion object {
        const val CHANNEL_ID = "ogm_playback_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_PREV = "com.example.ogm.ACTION_PREV"
        const val ACTION_TOGGLE = "com.example.ogm.ACTION_TOGGLE"
        const val ACTION_NEXT = "com.example.ogm.ACTION_NEXT"
        const val ACTION_STOP = "com.example.ogm.ACTION_STOP"

        fun updateNotification(context: Context, title: String, artist: String, isPlaying: Boolean) {
            val intent = Intent(context, OgmPlaybackService::class.java).apply {
                putExtra("title", title)
                putExtra("artist", artist)
                putExtra("isPlaying", isPlaying)
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (_: Exception) {
                // Ignore if background start restricted
            }
        }

        fun stopService(context: Context) {
            try {
                val intent = Intent(context, OgmPlaybackService::class.java)
                context.stopService(intent)
            } catch (_: Exception) {}
        }
    }

    private val binder = LocalBinder()

    inner class LocalBinder : Binder() {
        fun getService(): OgmPlaybackService = this@OgmPlaybackService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Open Grace Music Playback"
            val descriptionText = "Audiophile Lossless & Background music playback controls"
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                setShowBadge(false)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun showNotification(title: String, artist: String, isPlaying: Boolean) {
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

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText("Open Grace Music · Lossless Hi-Res")
            .setSmallIcon(R.drawable.ic_ogm_logo)
            .setContentIntent(appPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(isPlaying)
            .addAction(android.R.drawable.ic_media_previous, "Previous", prevPending)
            .addAction(
                if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlaying) "Pause" else "Play",
                togglePending
            )
            .addAction(android.R.drawable.ic_media_next, "Next", nextPending)
            .addAction(android.R.drawable.ic_delete, "Stop", stopPending)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PREV -> OgmPlayer.activeInstance?.previous()
            ACTION_TOGGLE -> OgmPlayer.activeInstance?.togglePlayPause()
            ACTION_NEXT -> OgmPlayer.activeInstance?.next()
            ACTION_STOP -> {
                OgmPlayer.activeInstance?.togglePlayPause()
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                val title = intent?.getStringExtra("title") ?: "Open Grace Music"
                val artist = intent?.getStringExtra("artist") ?: "Open Grace Music"
                val isPlaying = intent?.getBooleanExtra("isPlaying", true) ?: true
                showNotification(title, artist, isPlaying)
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
