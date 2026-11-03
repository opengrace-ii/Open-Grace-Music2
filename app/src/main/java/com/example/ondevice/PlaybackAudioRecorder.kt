package com.example.ondevice

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Process
import androidx.annotation.RequiresApi
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/** PCM from AudioPlaybackCapture → AAC in an M4A (MPEG-4) file. */
object PlaybackAudioRecorder {

    private const val SAMPLE_RATE = 44100
    private const val CHANNELS = 2
    private const val BIT_RATE = 128_000
    private const val MAX_MS = 12 * 60_000L
    private const val MIN_BYTES = 50_000L

    @RequiresApi(Build.VERSION_CODES.Q)
    @SuppressLint("MissingPermission")
    fun recordToM4a(
        projection: MediaProjection,
        dest: File,
        cancelled: AtomicBoolean,
        shouldStop: () -> Boolean,
        onElapsedMs: (Long) -> Unit,
    ): Long {
        val captureConfig = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUid(Process.myUid())
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()
        val audioFormat = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
            .build()
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_STEREO,
            AudioFormat.ENCODING_PCM_16BIT,
        ).coerceAtLeast(4096)
        val recorder = AudioRecord.Builder()
            .setAudioFormat(audioFormat)
            .setBufferSizeInBytes(minBuf * 2)
            .setAudioPlaybackCaptureConfig(captureConfig)
            .build()
        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, CHANNELS)
        format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        format.setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
        format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, minBuf * 2)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        dest.parentFile?.mkdirs()
        if (dest.exists()) dest.delete()
        val muxer = MediaMuxer(dest.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        var track = -1
        var muxerStarted = false
        val info = MediaCodec.BufferInfo()
        var elapsedUs = 0L
        val bytesPerMs = (SAMPLE_RATE * CHANNELS * 2) / 1000.0
        try {
            codec.start()
            recorder.startRecording()
            val startedAt = System.currentTimeMillis()
            val pcm = ByteArray(minBuf)
            while (true) {
                if (cancelled.get() || shouldStop()) break
                val now = System.currentTimeMillis() - startedAt
                if (now >= MAX_MS) break
                onElapsedMs(now)
                val n = recorder.read(pcm, 0, pcm.size)
                if (n > 0) {
                    elapsedUs += ((n / bytesPerMs) * 1000.0).toLong()
                    feedEncoder(codec, pcm, n, elapsedUs, false)
                    drainEncoder(codec, muxer, info, { t -> track = t; muxerStarted = true }, { muxerStarted })
                } else if (n == AudioRecord.ERROR_INVALID_OPERATION || n == AudioRecord.ERROR_BAD_VALUE) {
                    break
                }
            }
            feedEncoder(codec, ByteArray(0), 0, elapsedUs, true)
            drainEncoder(codec, muxer, info, { t -> track = t; muxerStarted = true }, { muxerStarted }, end = true)
        } finally {
            runCatching { recorder.stop() }
            runCatching { recorder.release() }
            runCatching { codec.stop() }
            runCatching { codec.release() }
            runCatching { if (muxerStarted) muxer.stop() }
            runCatching { muxer.release() }
        }
        if (!dest.exists() || dest.length() < MIN_BYTES) {
            dest.delete()
            throw OnDeviceException("Playback capture produced no usable audio")
        }
        return dest.length()
    }

    private fun feedEncoder(
        codec: MediaCodec,
        pcm: ByteArray,
        size: Int,
        ptsUs: Long,
        eos: Boolean,
    ) {
        val ix = codec.dequeueInputBuffer(10_000)
        if (ix < 0) return
        val buf = codec.getInputBuffer(ix) ?: return
        buf.clear()
        if (size > 0) buf.put(pcm, 0, size.coerceAtMost(buf.remaining()))
        val flags = if (eos) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0
        codec.queueInputBuffer(ix, 0, if (eos) 0 else size.coerceAtMost(buf.capacity()), ptsUs, flags)
    }

    private fun drainEncoder(
        codec: MediaCodec,
        muxer: MediaMuxer,
        info: MediaCodec.BufferInfo,
        onFormat: (Int) -> Unit,
        muxerStarted: () -> Boolean,
        end: Boolean = false,
    ) {
        var spins = 0
        while (spins++ < 64) {
            val ox = codec.dequeueOutputBuffer(info, if (end) 8_000 else 0)
            when {
                ox == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!end) return else continue
                ox == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    val t = muxer.addTrack(codec.outputFormat)
                    muxer.start()
                    onFormat(t)
                }
                ox >= 0 -> {
                    val out: ByteBuffer? = codec.getOutputBuffer(ox)
                    if (out != null && info.size > 0 && muxerStarted() && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                        out.position(info.offset)
                        out.limit(info.offset + info.size)
                        muxer.writeSampleData(0, out, info)
                    }
                    codec.releaseOutputBuffer(ox, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
                else -> return
            }
        }
    }
}
