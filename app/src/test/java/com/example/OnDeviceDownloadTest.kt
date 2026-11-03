package com.example

import com.example.ondevice.InnerTubeResolver
import com.example.ondevice.OnDeviceException
import com.example.ondevice.RangedDownloader
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
