# Open Grace Music — Audiophile Lossless Music Player & Converter

**Open Grace Music (OGM)** is a dual-platform Audiophile Lossless Music Player, YouTube/Audio Stream Converter, and Offline Music Sanctuary built with a **Native Android (Kotlin + Jetpack Compose + Media3 ExoPlayer)** application alongside a companion Web application.

> *"Your music. Your quiet place."*

---

## Key Features

### 1. Studio-Grade Audiophile Formats & Resolutions
Open Grace Music supports true high-resolution and lossless audio workflows with full metadata and resolution badges:

| Format | Display Name | Bit Depth | Sample Rate | Bitrate | Container / Extension | Android MediaStore MIME |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLAC** | `FLAC 24-bit/192kHz Lossless` | `24-bit` | `192 kHz` | `4608 kbps` | `.flac` | `audio/flac` |
| **ALAC** | `ALAC Studio Lossless` | `24-bit` | `96 kHz` | `2304 kbps` | `.m4a` | `audio/mp4` |
| **DSD** | `DSD 64 High-Res` | `1-bit DSD` | `2.8 MHz` | `5644 kbps` | `.dsf` | `audio/x-dsf` |
| **WAV** | `WAV 24-bit Uncompressed` | `24-bit` | `96 kHz` | `4608 kbps` | `.wav` | `audio/wav` |
| **MP3** | `MP3 320kbps Master` | `16-bit` | `44.1 kHz` | `320 kbps` | `.mp3` | `audio/mpeg` |

### 2. Live URL Link Validator & Simultaneous Video Preview
- Supports `youtube.com/watch?v=...`, `youtu.be/...`, `m.youtube.com`, YouTube Shorts, Radio/Playlist links, and direct audio stream URLs.
- Resolves real-time video title, channel/author, and artwork via YouTube oEmbed while simultaneously rendering an interactive in-modal video preview (`WebView`) that intercepts the underlying `googlevideo.com/videoplayback` audio stream and cookies.
- Includes an integrated **In-App YouTube Browser Sheet** (`YouTubeBrowserSheet.kt`) with 1-tap URL copy and 1-tap audio conversion.

### 3. Direct Export to Phone Music Folder (`Music/OpenGraceMusic`)
- Uses Android's `MediaStore.Audio.Media` API (`DeviceMusicHelper.kt`) with scoped storage (`IS_PENDING` on Android 10+ / API 29+) to write audio files directly into the device's public `Music/OpenGraceMusic` directory.
- Automatically maps audiophile MIME types (`audio/flac`, `audio/mp4`, `audio/x-dsf`, `audio/wav`, `audio/mpeg`) so saved tracks are immediately playable offline inside Open Grace Music and visible to any system music player.
- Supports scanning existing local audio files on the phone (`scanDeviceMusic`) and importing files via Android's Storage Access Framework (`ActivityResultContracts.GetMultipleContents`).

### 4. Background Playback, Lock-Screen Controls & Live Visual Frequency Equalizer
- Powered by **AndroidX Media3 ExoPlayer** (`OgmPlayer.kt`) and a foreground **`MediaSessionService`** (`OgmPlaybackService.kt`).
- Continues playing seamlessly when the screen is off, locked, or when switching apps, complete with system notification and lock-screen transport controls.
- Full-screen **Audiophile Master Turntable (`FullPlayerDialog.kt`)** features:
  - Rotating vinyl LP artwork disc
  - **Live Visual Frequency Equalizer** (28-bar real-time animated spectrum analyzer across `32Hz` – `96kHz` with live sample rate, bit depth, and bitrate readout)
  - Variable playback speed selector (`0.75x`, `1.0x`, `1.25x`, `1.5x`)
  - Shuffle, Repeat (`OFF`, `ALL`, `ONE`), interactive seek bar, and Playing Queue bottom sheet

### 5. Vocal Lyrics & Instrument Chord Sheets with 1-Tap Android Share
- Every track in the library includes an intelligent **Vocal Lyrics & Instrument Chord Sheet Generator** (`LyricsGenerator.kt` & `LyricsDialog.kt`):
  - **Vocal Tracks**: Structured performance lyrics (`[Verse 1]`, `[Chorus]`, `[Verse 2]`, `[Bridge]`, `[Outro]`) with musical Key, Tempo (BPM), and Time Signature.
  - **Instrumental Tracks**: Studio **Instrument Chord Sheet** (`[Intro — Arpeggiated Motif]`, `[Section A — Main Theme]`, `[Section B — Harmonic Lift]`, `[Bridge — Solo Changes]`, `[Outro]`) with Key Signature, BPM, Time Signature (`4/4`, `3/4`, `6/8`), and standard tuning notes.
- Users can toggle between **Vocal Lyrics** and **Chord Sheet** views on any song and share via Android's native share sheet (`Intent.ACTION_SEND`) to WhatsApp, Messages, Email, Notes, or any installed app.

---

## Native Android Architecture (`/workspace/app`)

The root workspace is a standard single-module **Android Studio Gradle project** (`:app`):

```text
app/src/main/java/com/example/
├── MainActivity.kt                  # Entry point, runtime permissions & YouTube SEND intent handler
├── data/
│   ├── LyricsGenerator.kt           # Vocal Lyrics & Instrument Chord Sheet engine (Key, BPM, Time Sig)
│   ├── StorageHelper.kt             # Device & library storage telemetry
│   ├── downloader/
│   │   ├── AudioDownloader.kt       # Audiophile stream downloader, header validator & SAF importer
│   │   ├── DeviceMusicHelper.kt     # Android MediaStore exporter (Music/OpenGraceMusic) & scanner
│   │   └── YouTubeStreamResolver.kt # Background YouTube stream URL & cookie extractor
│   ├── local/
│   │   ├── OgmDatabase.kt           # Room SQLite database (v3)
│   │   ├── TrackDao.kt              # Reactive Flow queries & persistence operations
│   │   └── TrackEntity.kt           # Room entity mapping audiophile metadata & instrumental flag
│   └── model/
│       └── Track.kt                 # AudiophileFormat enum (FLAC, ALAC, DSD, WAV, MP3) & Track model
├── player/
│   ├── OgmPlaybackService.kt        # Media3 MediaSessionService for background & lock-screen audio
│   └── OgmPlayer.kt                 # ExoPlayer controller (queue, shuffle, loop, speed, progress)
└── ui/
    ├── MainViewModel.kt             # StateFlow state holder combining Room DB + MediaStore + Player
    ├── OgmApp.kt                    # Main Jetpack Compose screen & modal orchestration
    ├── components/
    │   ├── DownloadDialog.kt        # Audiophile Format Selector, Live URL Validator & Video Preview
    │   ├── FullPlayerDialog.kt      # Vinyl Turntable, 28-bar Live Visual Frequency Equalizer & Queue
    │   ├── LyricsDialog.kt          # Vocal Lyrics / Instrument Chord Sheet viewer & Android Share
    │   ├── NowPlayingBar.kt         # Persistent bottom mini-player bar
    │   ├── StorageBanner.kt         # Storage capacity & offline persistence indicator
    │   ├── TrackCard.kt             # Track item with format badge, Play, Lyrics/Chords, Save & Delete
    │   └── YouTubeBrowserSheet.kt   # In-app YouTube browser with stream capture & 1-tap conversion
    └── theme/                       # Sage Green & Dark Obsidian Material 3 theme & custom typography
```

---

## Installing on Android (Samsung S25 Ultra and others)

### Recommended: Install as a PWA (works with Advanced Protection)

Google **Advanced Protection** blocks sideloaded APKs that are not from Google Play or pre-installed app stores. **Add to Home screen** avoids that entirely:

1. Open the site in **Chrome** on your phone.
2. Menu (⋮) → **Install app** or **Add to Home screen**.
3. Launch from your home screen — same gramophone UI, offline library, and converter (when the backend is available).

Use the in-app **INSTALL / Samsung Install** button for step-by-step help.

### Optional: Native APK sideload

When Advanced Protection is **off** and **Auto Blocker** allows your install source:

1. Download `OpenGraceMusic.apk` from the app or `/OpenGraceMusic.apk`.
2. **Settings → Security → Install unknown apps** — allow **My Files** or **Chrome**.
3. **Samsung Auto Blocker**: Settings → Security and privacy → Auto Blocker — allow installation from your chosen source for this install.
4. Open the APK and tap Install. Play Protect may warn on sideload builds not from Play; only proceed if you trust this repository.

If you see **“App blocked by Advanced Protection”**, sideloading cannot be enabled by the app — use the PWA path above or publish via Google Play / Samsung Galaxy Store.

Set `VITE_GITHUB_REPO_URL` when building the web app to point the install guide at your fork’s GitHub URL.

---

## Building & Running the Native Android App

### Prerequisites
- **Android Studio Ladybug (2024.2.1)** or newer
- **JDK 17**
- **Android SDK 35** (minSdk `24`, targetSdk `35`)

### Build & Test via Gradle CLI
```bash
# Run unit and Robolectric tests
./gradlew :app:testDebugUnitTest

# Build the installable Debug APK
./gradlew :app:assembleDebug
```
The compiled APK will be generated at:
`app/build/outputs/apk/debug/app-debug.apk`

### Pre-packaged Android Studio Project Archive
A complete, self-contained zip archive of the Android Studio project is also available at:
`public/OpenGraceMusic-Android.zip`
