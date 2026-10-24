package com.example.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object LyricsGenerator {

    data class SongContent(
        val title: String,
        val artist: String,
        val isInstrumental: Boolean,
        val keySignature: String? = null,
        val tempoBpm: Int? = null,
        val timeSignature: String? = null,
        val content: String,
        val sourceLabel: String = "unavailable"
    )

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    fun isInstrumentalTrack(title: String, artist: String = ""): Boolean {
        val lower = "$title $artist".lowercase()
        return lower.contains("instrumental") ||
                lower.contains("karaoke") ||
                lower.contains("backing track")
    }

    fun unavailableContent(title: String, artist: String): SongContent {
        val body = """
            Lyrics not available offline yet.

            Open Grace Music does not show placeholder lyrics that are unrelated to your song.

            • Verified lyrics may appear when lrclib.net has a title/artist match
            • AI lyrics require GEMINI_API_KEY on the server (verify accuracy)

            Track: $title
            Artist: ${artist.ifBlank { "Unknown" }}

            Search this title in a lyrics app or browser you trust.
        """.trimIndent()

        return SongContent(
            title = title,
            artist = artist.ifBlank { "Open Grace Music" },
            isInstrumental = false,
            content = body,
            sourceLabel = "unavailable"
        )
    }

    suspend fun loadLyrics(title: String, artist: String): SongContent = withContext(Dispatchers.IO) {
        fetchFromLrclib(title, artist) ?: unavailableContent(title, artist)
    }

    private fun fetchFromLrclib(title: String, artist: String): SongContent? {
        return try {
            val params = buildString {
                append("track_name=").append(URLEncoder.encode(title, "UTF-8"))
                if (artist.isNotBlank()) {
                    append("&artist_name=").append(URLEncoder.encode(artist, "UTF-8"))
                }
            }
            val req = Request.Builder()
                .url("https://lrclib.net/api/search?$params")
                .header("User-Agent", "OpenGraceMusic/1.0 (Android lyrics lookup)")
                .build()
            val resp = client.newCall(req).execute()
            if (!resp.isSuccessful) return null
            val body = resp.body?.string() ?: return null
            val arr = JSONArray(body)
            if (arr.length() == 0) return null

            var match: JSONObject? = null
            for (i in 0 until arr.length()) {
                val item = arr.getJSONObject(i)
                if (!item.optString("plainLyrics").isNullOrBlank()) {
                    match = item
                    break
                }
            }
            val chosen = match ?: return null
            val lyrics = chosen.optString("plainLyrics")
            if (lyrics.isBlank()) return null

            SongContent(
                title = chosen.optString("trackName", title),
                artist = chosen.optString("artistName", artist.ifBlank { "Unknown Artist" }),
                isInstrumental = chosen.optBoolean("instrumental", false),
                content = "$lyrics\n\n— Source: lrclib.net (community submitted; verify accuracy)",
                sourceLabel = "lrclib"
            )
        } catch (_: Exception) {
            null
        }
    }

    /** @deprecated Placeholder generator removed — use [loadLyrics] */
    fun generate(
        title: String,
        artist: String,
        forceInstrumental: Boolean? = null
    ): SongContent {
        if (forceInstrumental == true) {
            return SongContent(
                title = title,
                artist = artist,
                isInstrumental = true,
                content = "Chord sheet hidden until verified chart data exists.\n\nMark instrumental tracks in your library notes, or import a PDF chart from your files app.",
                sourceLabel = "instrumental"
            )
        }
        return unavailableContent(title, artist)
    }
}
