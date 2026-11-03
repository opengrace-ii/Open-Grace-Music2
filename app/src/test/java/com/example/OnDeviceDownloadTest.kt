package com.example

import com.example.ondevice.InnerTubeResolver
import com.example.ondevice.OnDeviceDownloadManager
import com.example.ondevice.OnDeviceException
import com.example.ondevice.RangedDownloader
import com.example.ondevice.WebViewStreamCapture
import com.sun.net.httpserver.HttpServer
import okhttp3.OkHttpClient
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.net.InetSocketAddress

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OnDeviceDownloadTest {

    private val client = InnerTubeResolver.CLIENTS.first()

    private fun playerJson(videoId: String, status: String = "OK") = """
    {"playabilityStatus":{"status":"$status","reason":"Sign in to confirm you're not a bot"},
     "videoDetails":{"videoId":"$videoId","title":"T","author":"A","lengthSeconds":"200"},
     "streamingData":{"adaptiveFormats":[
       {"itag":251,"mimeType":"audio/webm; codecs=\"opus\"","bitrate":140000,"averageBitrate":130000,"contentLength":"3000000","url":"https://x/opus"},
       {"itag":140,"mimeType":"audio/mp4; codecs=\"mp4a.40.2\"","bitrate":130000,"averageBitrate":129000,"contentLength":"3200000","url":"https://x/m4a"},
       {"itag":137,"mimeType":"video/mp4; codecs=\"avc1\"","bitrate":4000000,"contentLength":"9000000","url":"https://x/video"},
       {"itag":141,"mimeType":"audio/mp4; codecs=\"mp4a.40.2\"","bitrate":260000,"contentLength":"5000000","signatureCipher":"s=abc"}
     ]}}
    """.trimIndent()

    @Test
    fun `parser picks AAC m4a with a direct url and labels it honestly`() {
        val a = InnerTubeResolver.parsePlayerResponse(playerJson("dQw4w9WgXcQ"), "dQw4w9WgXcQ", client)!!
        assertEquals("M4A", a.container)
        assertEquals("AAC", a.codecLabel)
        assertEquals("https://x/m4a", a.url)
        assertEquals(129, a.bitrateKbps)
    }

    @Test
    fun `parser refuses a different video id`() {
        try {
            InnerTubeResolver.parsePlayerResponse(playerJson("AAAAAAAAAAA"), "dQw4w9WgXcQ", client)
            fail("expected refusal")
        } catch (e: OnDeviceException) {
            assertTrue(e.message!!.contains("different video"))
        }
    }

    @Test
    fun `parser surfaces the real playability reason`() {
        try {
            InnerTubeResolver.parsePlayerResponse(playerJson("dQw4w9WgXcQ", "LOGIN_REQUIRED"), "dQw4w9WgXcQ", client)
            fail("expected failure")
        } catch (e: OnDeviceException) {
            assertTrue(e.message!!.startsWith("LOGIN_REQUIRED"))
        }
    }

    @Test
    fun `parser returns null when no direct audio url exists`() {
        val json = """{"playabilityStatus":{"status":"OK"},"videoDetails":{"videoId":"dQw4w9WgXcQ"},
            "streamingData":{"adaptiveFormats":[{"mimeType":"audio/mp4","contentLength":"100000","signatureCipher":"x"}]}}"""
        assertNull(InnerTubeResolver.parsePlayerResponse(json, "dQw4w9WgXcQ", client))
    }

    private fun serve(payload: ByteArray, contentType: String, honorRange: Boolean = true): HttpServer {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/a") { ex ->
            val range = ex.requestHeaders.getFirst("Range")
            var start = 0
            var end = payload.size - 1
            var code = 200
            if (honorRange && range != null) {
                val m = Regex("bytes=(\\d+)-(\\d+)").find(range)!!
                start = m.groupValues[1].toInt()
                end = minOf(m.groupValues[2].toInt(), payload.size - 1)
                code = 206
            }
            val slice = payload.copyOfRange(start, end + 1)
            ex.responseHeaders.add("Content-Type", contentType)
            ex.sendResponseHeaders(code, slice.size.toLong())
            ex.responseBody.use { it.write(slice) }
        }
        server.start()
        return server
    }

    private fun fakeM4a(size: Int): ByteArray {
        val b = ByteArray(size) { (it * 31).toByte() }
        "\u0000\u0000\u0000\u0020ftypM4A ".toByteArray(Charsets.ISO_8859_1).copyInto(b)
        return b
    }

    private fun audioFor(server: HttpServer, len: Int) = InnerTubeResolver.parsePlayerResponse(
        playerJson("dQw4w9WgXcQ").replace("https://x/m4a", "http://127.0.0.1:${server.address.port}/a")
            .replace("3200000", len.toString()),
        "dQw4w9WgXcQ", client
    )!!

    @Test
    fun `ranged downloader fetches all bytes in chunks and verifies container`() {
        val payload = fakeM4a(2_500_000)
        val server = serve(payload, "audio/mp4")
        try {
            val dest = File.createTempFile("ogm", ".m4a")
            var last = 0L
            val n = RangedDownloader(OkHttpClient()).download(audioFor(server, payload.size), dest, { false }) { d, _ -> last = d }
            assertEquals(payload.size.toLong(), n)
            assertEquals(payload.size.toLong(), last)
            assertArrayEquals(payload, dest.readBytes())
        } finally { server.stop(0) }
    }

    @Test
    fun `downloader rejects non audio content`() {
        val server = serve(ByteArray(200_000) { 'x'.code.toByte() }, "text/html")
        try {
            RangedDownloader(OkHttpClient()).download(audioFor(server, 200_000), File.createTempFile("ogm", ".m4a"), { false }) { _, _ -> }
            fail("expected rejection")
        } catch (e: OnDeviceException) {
            assertTrue(e.message!!.contains("not audio"))
        } finally { server.stop(0) }
    }

    @Test
    fun `downloader rejects audio-typed bytes that are not an mp4 container`() {
        val server = serve(ByteArray(200_000) { 7 }, "audio/mp4")
        try {
            RangedDownloader(OkHttpClient()).download(audioFor(server, 200_000), File.createTempFile("ogm", ".m4a"), { false }) { _, _ -> }
            fail("expected rejection")
        } catch (e: OnDeviceException) {
            assertTrue(e.message!!.contains("not a valid"))
        } finally { server.stop(0) }
    }

    private val samplePlayback =
        "https://rr5---sn-q4fl6nsl.googlevideo.com/videoplayback?expire=1730000000" +
            "&ei=abc&id=o-sCPNstyleIdentifierNotWatch&itag=140&source=youtube" +
            "&mime=audio%2Fmp4&clen=3200000&range=0-1023&sig=ABC%3D&lsig=XYZ"

    @Test
    fun `parses videoplayback url itag mime clen and strips range`() {
        val s = WebViewStreamCapture.parseVideoPlayback(
            samplePlayback,
            mapOf(
                "Cookie" to "VISITOR_INFO1_LIVE=x; YSC=y",
                "User-Agent" to "Mozilla/5.0 TestUA",
                "Range" to "bytes=0-1023",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/",
                "Host" to "rr5---sn-q4fl6nsl.googlevideo.com",
            ),
            "Xc6Jlstj8GY",
        )!!
        assertEquals(140, s.itag)
        assertEquals("audio/mp4", s.mime)
        assertEquals(3_200_000L, s.contentLength)
        assertEquals("o-sCPNstyleIdentifierNotWatch", s.googlevideoId)
        assertNull(s.watchIdInQuery)
        assertEquals("Xc6Jlstj8GY", s.playingWatchId)
        assertTrue(!s.url.contains("range="))
        assertTrue(s.url.contains("itag=140"))
        assertEquals("Mozilla/5.0 TestUA", s.headers["User-Agent"])
        assertEquals("VISITOR_INFO1_LIVE=x; YSC=y", s.headers["Cookie"])
        assertEquals("https://www.youtube.com", s.headers["Origin"])
        assertTrue(!s.headers.containsKey("Range"))
        assertTrue(!s.headers.containsKey("Host"))
    }

    @Test
    fun `header copy keeps cookie ua origin referer and drops range`() {
        val copied = WebViewStreamCapture.copyRequestHeaders(
            mapOf(
                "cookie" to "a=1",
                "USER-AGENT" to "UA",
                "origin" to "https://www.youtube.com",
                "referer" to "https://www.youtube.com/watch?v=Xc6Jlstj8GY",
                "Range" to "bytes=0-1",
                "Host" to "googlevideo.com",
            )
        )
        assertEquals("a=1", copied["Cookie"])
        assertEquals("UA", copied["User-Agent"])
        assertEquals("https://www.youtube.com", copied["Origin"])
        assertEquals("https://www.youtube.com/watch?v=Xc6Jlstj8GY", copied["Referer"])
        assertNull(copied["Range"])
        assertNull(copied["Host"])
    }

    @Test
    fun `audio itags preferred over video`() {
        assertTrue(WebViewStreamCapture.isAudioCandidate(140, "audio/mp4"))
        assertTrue(WebViewStreamCapture.isAudioCandidate(251, "audio/webm"))
        assertTrue(WebViewStreamCapture.isAudioCandidate(null, "audio%2Fwebm"))
        assertTrue(!WebViewStreamCapture.isAudioCandidate(137, "video/mp4"))
        assertTrue(
            WebViewStreamCapture.audioPreferenceScore(140, "audio/mp4") >
                WebViewStreamCapture.audioPreferenceScore(251, "audio/webm")
        )
    }

    @Test
    fun `findFor binds sCPN googlevideo id to currently playing watch id`() {
        WebViewStreamCapture.clear()
        WebViewStreamCapture.setCurrentlyPlaying("Xc6Jlstj8GY")
        val parsed = WebViewStreamCapture.parseVideoPlayback(samplePlayback, emptyMap(), "Xc6Jlstj8GY")!!
        WebViewStreamCapture.remember(parsed)
        val found = WebViewStreamCapture.findFor("Xc6Jlstj8GY")
        assertEquals(parsed.url, found!!.url)
        assertNull(WebViewStreamCapture.findFor("dQw4w9WgXcQ"))
        WebViewStreamCapture.clear()
    }

    @Test
    fun `remember ignores video-only itags`() {
        WebViewStreamCapture.clear()
        val video = samplePlayback.replace("itag=140", "itag=137").replace("mime=audio%2Fmp4", "mime=video%2Fmp4")
        val parsed = WebViewStreamCapture.parseVideoPlayback(video, emptyMap(), "Xc6Jlstj8GY")!!
        WebViewStreamCapture.remember(parsed)
        assertNull(WebViewStreamCapture.findFor("Xc6Jlstj8GY"))
        WebViewStreamCapture.clear()
    }

    @Test
    fun `mergeCookieHeader last value wins per name`() {
        val merged = WebViewStreamCapture.mergeCookieHeader(
            listOf("VISITOR_INFO1_LIVE=old; YSC=1", "VISITOR_INFO1_LIVE=new")
        )
        assertTrue(merged.contains("VISITOR_INFO1_LIVE=new"))
        assertTrue(merged.contains("YSC=1"))
        assertTrue(!merged.contains("VISITOR_INFO1_LIVE=old"))
    }

    @Test
    fun `friendly failure does not dump InnerTube client walls`() {
        val msg = OnDeviceDownloadManager.friendlyFailure(
            "Xc6Jlstj8GY",
            false,
            "session"
        )
        assertTrue(msg.contains("capture did not see"))
        assertTrue(msg.contains("Play the video"))
        assertTrue(!msg.contains("ANDROID_VR"))
        assertTrue(!msg.contains("LOGIN_REQUIRED"))
        val expired = OnDeviceDownloadManager.friendlyFailure("Xc6Jlstj8GY", true, null)
        assertTrue(expired.contains("expired") || expired.contains("refused"))
    }

    @Test
    fun `ranged downloader sends captured cookie and user-agent`() {
        val payload = fakeM4a(200_000)
        var seenUa = ""
        var seenCookie = ""
        val server = HttpServer.create(java.net.InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/a") { ex ->
            seenUa = ex.requestHeaders.getFirst("User-Agent") ?: ""
            seenCookie = ex.requestHeaders.getFirst("Cookie") ?: ""
            val range = ex.requestHeaders.getFirst("Range")
            var start = 0
            var end = payload.size - 1
            var code = 200
            if (range != null) {
                val m = Regex("bytes=(\\d+)-(\\d+)").find(range)!!
                start = m.groupValues[1].toInt()
                end = minOf(m.groupValues[2].toInt(), payload.size - 1)
                code = 206
            }
            val slice = payload.copyOfRange(start, end + 1)
            ex.responseHeaders.add("Content-Type", "audio/mp4")
            ex.sendResponseHeaders(code, slice.size.toLong())
            ex.responseBody.use { it.write(slice) }
        }
        server.start()
        try {
            val audio = audioFor(server, payload.size).copy(
                extraHeaders = mapOf(
                    "Cookie" to "VISITOR_INFO1_LIVE=cap",
                    "User-Agent" to "Captured-UA",
                    "Origin" to "https://www.youtube.com",
                )
            )
            RangedDownloader(OkHttpClient()).download(audio, File.createTempFile("ogm", ".m4a"), { false }) { _, _ -> }
            assertEquals("Captured-UA", seenUa)
            assertEquals("VISITOR_INFO1_LIVE=cap", seenCookie)
        } finally {
            server.stop(0)
        }
    }

    /** Opt-in live check: OGM_LIVE_YT=<videoId> ./gradlew testDebugUnitTest. Needs a non-datacenter IP. */
    @Test
    fun `live resolve and fetch first bytes`() {
        val id = System.getenv("OGM_LIVE_YT")
        assumeTrue(!id.isNullOrBlank())
        val failures = mutableListOf<String>()
        val resolver = InnerTubeResolver(OkHttpClient())
        val audio = resolver.resolveCandidates(id!!, failures).firstOrNull()
        println("LIVE failures=$failures audio=${audio?.container} ${audio?.bitrateKbps}kbps len=${audio?.contentLength}")
        assertTrue("no audio resolved: $failures", audio != null)
        val dest = File.createTempFile("ogm-live", ".bin")
        val limited = audio!!.copy(contentLength = minOf(audio.contentLength, 2_000_000L))
        val n = RangedDownloader(OkHttpClient()).download(limited, dest, { false }) { _, _ -> }
        println("LIVE downloaded $n bytes")
        assertTrue(n >= 50_000)
    }
}
