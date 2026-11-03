package com.example.ondevice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.example.R
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Foreground service typed as mediaProjection so Android 10+ AudioPlaybackCapture is legal.
 */
class PlaybackCaptureService : Service() {

    companion object {
        private const val CHANNEL_ID = "ogm_playback_capture"
        private const val NOTIFICATION_ID = 1003
        private val ready = AtomicReference(CountDownLatch(1))

        fun startAndAwait(context: Context, timeoutMs: Long = 8_000L): Boolean {
            ready.set(CountDownLatch(1))
            val app = context.applicationContext
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                try {
                    val i = Intent(app, PlaybackCaptureService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.startForegroundService(i)
                    else app.startService(i)
                } catch (_: Exception) {
                    markReady()
                }
            }
            return try {
                ready.get().await(timeoutMs, TimeUnit.MILLISECONDS)
            } catch (_: Exception) {
                false
            }
        }

        fun markReady() {
            ready.get().countDown()
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, PlaybackCaptureService::class.java))
            } catch (_: Exception) {
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Recording", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val n: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_ogm_logo)
            .setContentTitle("Open Grace Music")
            .setContentText("Recording this app’s playing audio…")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0
            ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type)
            markReady()
        } catch (_: Exception) {
            stopSelf()
        }
        return START_NOT_STICKY
    }
}
