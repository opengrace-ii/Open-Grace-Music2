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
import java.util.concurrent.atomic.AtomicInteger

/**
 * Short-lived foreground service (dataSync) so an on-device download is not killed when the
 * app is minimized. Reference counted: stops when the last active download ends.
 */
class OgmDownloadService : Service() {

    companion object {
        private const val CHANNEL_ID = "ogm_download_channel"
        private const val NOTIFICATION_ID = 1002
        private val active = AtomicInteger(0)

        fun begin(context: Context) {
            if (active.getAndIncrement() > 0) return
            try {
                val i = Intent(context, OgmDownloadService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i)
                else context.startService(i)
            } catch (_: Exception) {
                // Download still proceeds while the app is in the foreground.
            }
        }

        fun end(context: Context) {
            if (active.decrementAndGet() > 0) return
            active.set(0)
            try {
                context.stopService(Intent(context, OgmDownloadService::class.java))
            } catch (_: Exception) {
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val n: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_ogm_logo)
            .setContentTitle("Open Grace Music")
            .setContentText("Recording audio on this phone…")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
            ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type)
        } catch (_: Exception) {
            stopSelf()
        }
        return START_NOT_STICKY
    }
}
