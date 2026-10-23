package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.data.downloader.YouTubeStreamResolver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

  @Test
  fun `read string from context`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val appName = context.getString(R.string.app_name)
    assertEquals("Open Grace Music", appName)
  }

  @Test
  fun `extractYouTubeId correctly handles user example URLs`() {
    // User Example 1: youtu.be with tracking parameter
    val url1 = "https://youtu.be/0T8NnR21s0Q?si=z9pRnlG2tkjJ87Ci"
    val id1 = YouTubeStreamResolver.extractYouTubeId(url1)
    assertEquals("0T8NnR21s0Q", id1)
    assertEquals("https://www.youtube.com/watch?v=0T8NnR21s0Q", YouTubeStreamResolver.canonicalWatchUrl(id1!!))

    // User Example 2: youtube.com with playlist and index
    val url2 = "https://www.youtube.com/watch?v=Xc6JIstj8GY&list=RDXc6JIstj8GY&index=1"
    val id2 = YouTubeStreamResolver.extractYouTubeId(url2)
    assertEquals("Xc6JIstj8GY", id2)
    assertEquals("https://www.youtube.com/watch?v=Xc6JIstj8GY", YouTubeStreamResolver.canonicalWatchUrl(id2!!))

    // Mobile YouTube URL
    val urlMobile = "https://m.youtube.com/watch?v=0T8NnR21s0Q"
    val idMobile = YouTubeStreamResolver.extractYouTubeId(urlMobile)
    assertEquals("0T8NnR21s0Q", idMobile)

    // User Example 3: youtube.com with radio parameter (User request URL)
    val urlRadio = "https://www.youtube.com/watch?v=Xc6JIstj8GY&list=RDXc6JIstj8GY&start_radio=1"
    val idRadio = YouTubeStreamResolver.extractYouTubeId(urlRadio)
    assertEquals("Xc6JIstj8GY", idRadio)
    assertEquals("https://www.youtube.com/watch?v=Xc6JIstj8GY", YouTubeStreamResolver.canonicalWatchUrl(idRadio!!))

    // Non-video YouTube pages should not extract video IDs
    assertNull(YouTubeStreamResolver.extractYouTubeId("https://m.youtube.com/"))
    assertNull(YouTubeStreamResolver.extractYouTubeId("https://m.youtube.com/results?search_query=jaago"))
  }

  @Test
  fun `prepareFullStreamUrl strips range parameters`() {
    val chunked = "https://rr1---sn.googlevideo.com/videoplayback?expire=123&mime=audio%2Fwebm&range=0-65535&rn=1"
    val cleaned = YouTubeStreamResolver.prepareFullStreamUrl(chunked)
    assertEquals("https://rr1---sn.googlevideo.com/videoplayback?expire=123&mime=audio%2Fwebm&rn=1", cleaned)
  }

  @Test
  fun `launch MainActivity successfully`() {
    val controller = Robolectric.buildActivity(MainActivity::class.java)
    val activity = controller.setup().get()
    assertNotNull(activity)
  }

  @Test
  fun `AudioDownloader imports local audio file successfully`() = kotlinx.coroutines.runBlocking {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val downloader = com.example.data.downloader.AudioDownloader(context)
    
    // Create a temporary test file
    val testFile = java.io.File(context.cacheDir, "sample_hymn.mp3")
    testFile.writeBytes(ByteArray(1024) { 0x41 })
    val uri = android.net.Uri.fromFile(testFile)

    val track = downloader.importLocalAudio(uri, "sample_hymn.mp3")
    assertNotNull(track)
    assertEquals("sample_hymn", track.title)
    assertEquals("MP3", track.format)
    val file = java.io.File(track.filePath)
    org.junit.Assert.assertTrue(file.exists())
    org.junit.Assert.assertTrue(file.length() > 0)
  }
}
