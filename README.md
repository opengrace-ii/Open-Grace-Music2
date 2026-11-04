# Open Grace Music — Audiophile Lossless Music Player & Converter

**Open Grace Music (OGM)** is a dual-platform Audiophile Lossless Music Player, YouTube/Audio Stream Converter, and Offline Music Sanctuary built with a **Native Android (Kotlin + Jetpack Compose + Media3 ExoPlayer)** application alongside a companion Web application.

> *"Your music. Your quiet place."*

**Terms (short):** Connect YouTube signs in on Google’s pages. Open Grace Music never collects your password. Downloads may still be blocked by Google and may conflict with YouTube’s terms. We do not promise a bypass.

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
- **APK 1.2.1+:** WebView PWA audio is kept alive by a sticky foreground **`OgmPlaybackService`** (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`) with MediaSession notification controls. The shell skips `WebView.onPause()` so HTML5 / YouTube playback is not frozen when minimized. Native `OgmPlayer` remains available for in-tree Compose tooling.
- Continues playing when the screen is off, locked, or when switching apps (subject to OEM battery killers — see install notes).
- Full-screen **Audiophile Master Turntable (`FullPlayerDialog.kt`)** features:
  - Rotating vinyl LP artwork disc
  - **Live Visual Frequency Equalizer** (28-bar real-time animated spectrum analyzer across `32Hz` – `96kHz` with live sample rate, bit depth, and bitrate readout)
  - Variable playback speed selector (`0.75x`, `1.0x`, `1.25x`, `1.5x`)
  - Shuffle, Repeat (`OFF`, `ALL`, `ONE`), interactive seek bar, and Playing Queue bottom sheet

### 5. User mixes (playlists)
Name your own mixes in the library — instrumental, messages, Hindi Christian, or anything else. Nothing is pre-loaded. Tap **NEW MIX**, or the list button on a tape, then type the mix name. Mixes live in your browser (IndexedDB) and stay empty until you add tapes.

### 6. Listen schedule (fresh IST reminders)

Name a reminder yourself (for example “Daily devotion”), pick a clock time, and say **what to find fresh each morning**. Morning / noon / evening are **editable shortcuts**, not locked slots.

The clock is **Asia/Kolkata (IST)** by default (IANA timezone stored on the reminder; you can change it). Example: Daily 07:00 IST on **Sun 1 Nov 2026** fires at that IST instant and searches YouTube **at fire time** for the query you typed (speaker, artist, or topic). **Latest upload** (default) plays the newest matching video in the in-app YouTube deck — exact video id, no SoundCloud / wrong-song fallback. **Shuffle recent** picks among the newest hits. Downloaded library tapes are **not** used for this path, so you do not hear last month’s cassette.

You can save a reminder with **zero mixes** if the fresh query is filled. An optional mix still wins when it has tapes. User playlists can stay empty.

- **Cassette Library → SCHEDULE**.
- Repeat: every day, selected weekdays, or days of the month. The panel shows **Next play (IST)** and **what will play** (“Newest match for “{query}”” or the mix name).
- When a reminder fires, tap the notification (or in-app **Play**) to resolve today’s match and play it.
- Empty search / errors show honest copy — no fake audio.
- **Honest PWA alarm limit:** browsers cannot wake a fully closed tab like a native alarm. Reminders run while the PWA/tab is open; an installed Chrome PWA may also check via Periodic Background Sync when the OS allows it. On iPhone, if the app is fully killed, the reminder will not fire. Web Push is not used. Allow notifications in-app.

### 7. Studio AI (own transcript, notes, related next)

Open the player **STUDIO AI** sheet (lyrics / chords / transcript / notes / related):

- **Transcript** is **Open Grace Music AI** — Gemini (`GEMINI_API_KEY`) first, else NVIDIA (`NVIDIA_API_KEY`) on a short audio extract of the same YouTube id. We do **not** use YouTube captions as the primary source. If AI has no key or cannot get audio (e.g. LOGIN_REQUIRED), you see a clear message; title/description is **not** a transcript. YouTube captions may appear only as a last resort, labeled as such. No invented sermon text.
- **Listen notes** summarize the transcript (not a guessed talk).
- **Related next** suggests 3 search queries from the same query family (not hardcoded artists). Tap one to open the in-app YouTube tuner.

Keys: set `GEMINI_API_KEY` and/or `NVIDIA_API_KEY` in `.env`, or paste them in **Settings → Studio AI keys** (stored on the running server process only; never logged or echoed). Missing keys never block the rest of the app.

### 8. Lyrics (honest offline UX)
- Open Grace Music **does not fabricate** generic placeholder lyrics or C–G–Am–F chord sheets.
- The player tries **[lrclib.net](https://lrclib.net)** for a title/artist match; if none is found, you see **“Lyrics not available offline yet.”**
- Instrumental tracks can show a short note instead of a fake chart until real chart data exists.

### YouTube conversion speed vs TubeMate
Apps like **TubeMate** grab audio on the phone. **Open Grace Music** does the same on the **Android APK** (googlevideo capture on the phone’s own IP). On the website, Record is queued to a **recorder worker** (yt-dlp + FFmpeg on a residential IP). MP3 320 is usually fastest; FLAC/ALAC/WAV are a lossless wrap of YouTube’s already-lossy audio. OGM does not bundle TubeMate.

### Record (APK first, then workers)

**Android APK 1.5.1+:** Record prefers **on the phone** (googlevideo capture for that exact video id). If that fails, the APK uses the same **PC recorder** as the website when a worker is online. The Cassette Library (IndexedDB, plays offline) is unchanged. Extra copies on the phone go to shared **Music/Open Grace Music** (MediaStore), not Downloads. Connect YouTube on the phone if YouTube asks for a login. There is no screen share. The UI shows `v1.5.1 · <short commit> · APK 1.5.1 (14)` in **More** and the footer.

**Website / PWA:** a browser cannot fetch YouTube audio. Record sends a job to any online **recorder worker**. Workers poll Render over an outbound connection (home PC, office PC, extra machines — same `OGM_WORKER_SECRET`). If no worker is online, the recorder shows one line: **No recorder is online. Open the APK to record on this phone.**

Public Invidious/Piped mirrors, Render-side yt-dlp downloads, TV OAuth-to-yt-dlp, and tab capture are removed.

### What “download” means (offline file vs online-only live tape)

OGM is honest about the difference between a **real offline file** and a **live YouTube stream**. There are only two possible outcomes when you record a link, and the app never blurs them:

| Outcome | What is stored | Badge / album | Plays with internet OFF? | Background play? |
| --- | --- | --- | --- | --- |
| **Saved (offline)** | A real audio **blob** in IndexedDB (`Track.blob`) with the probed format/MIME | `TYPE … · FLAC/MP3 …` | **Yes** (object URL → HTML5 `<audio>`) | **Yes** (foreground media service + MediaSession on the audio element) |
| **Online-only (live)** | **No blob** — only the YouTube video id | `LIVE STREAM · YOUTUBE`, album `Online only · Live YouTube (not downloaded)` | **No** (plays via the YouTube IFrame; needs a connection) | **No** (an iframe pauses when minimized/offline) |

- **A successful record is a genuine offline file.** The APK writes the captured/transcoded blob into IndexedDB. A worker job streams the same kind of blob back (`Content-Type`, `X-Audio-Format`, probed codec) and the client saves it with `saveTrackToDB(track, blob)`. `playerService` plays that blob from an object URL — pause / seek / next and background playback work offline.
- **OGM never fakes a download.** If the phone capture and (on web) the worker queue cannot produce bytes for that video ID, **nothing is saved**. Import a file, or open the APK. A live tape is **never** silently saved and relabeled as MP3/FLAC.
- **Listening live is a separate, explicit choice.** Open the YouTube **Tuner** and tap **Listen** to play a video as a live stream. That tape is labeled `LIVE STREAM · YOUTUBE` / `Online only · Live YouTube (not downloaded)` and is honest that it streams only while online and will not play in the background. The “stuck, cannot pause/forward” symptom is exactly a live tape with no connection — recording it as MP3/FLAC (a real offline file) fixes it.
- **FFmpeg does emit real `.flac`** (ffprobe `codec_name=flac`) when a FLAC job succeeds. Library badges and IndexedDB `format` / `mimeType` / extension come from the job response (`Content-Type`, `X-Audio-Format`, `X-Audio-Extension`, probed codec) — not a hardcoded “MP3 320”.
- **YouTube audio is already lossy** (AAC/Opus). A FLAC of that stream is a **lossless container of a lossy source**, not a studio master of the original recording. The recorder UI states this when you pick FLAC/ALAC/WAV.
- **Verify a real FLAC tape:** export from the library (`.flac`), then `ffprobe -show_entries stream=codec_name -of csv=p=0 yourfile.flac` → `flac`. Or check the cassette badge reads **TYPE IV METAL · FLAC 24-BIT** and album notes mention the YouTube lossy-source caveat.

### Activity log (every record / import / conversion)

Every recording, device-file import, conversion, and live listen is written to a persisted **Activity log** so you can tell, after the fact, exactly what happened.

- **Where:** **More → Activity log** (cassette-styled panel; the row shows the event count).
- **What each event records:** timestamp (shown in **IST** plus your device clock), the action (Record / Import / Convert / Listen live), the chosen format (MP3 / FLAC / …), and the result:
  - **SAVED** — a real offline file landed in the Library (with its final size).
  - **FAILED** — nothing was saved, with the short reason (login required / network / codec mismatch / empty stream / timeout).
  - **ONLINE-ONLY** — kept as a live YouTube tape (plays only while online, no background).
  - **STARTED / PROGRESS** — the job kicked off and its server stages (validate → extract → ffmpeg → save).
- **Storage & cap:** persisted in `localStorage` (`ogm_activity_log_v1`), newest first, capped at the most recent **200** events (metadata only — never audio bytes). Tap **Clear log** to wipe it.

---

## Native Android Architecture (`/workspace/app`)

The downloadable **`public/OpenGraceMusic.apk`** is a **WebView shell** (`MainActivity`) that loads the live PWA at
**`https://open-grace-music2.onrender.com`** (Listen / Library / Tuner / Schedule / More). Baked default:
`BuildConfig.CONVERTER_BASE_URL` / `OGM_CONVERTER_BASE_URL`. Current ship version: **versionCode 14 / versionName 1.5.1** (Connect YouTube + googlevideo intercept, PC-recorder fallback, shared **Music/Open Grace Music** export; **no MediaProjection / screen share** — **reinstall once**). 1.3.0’s InnerTube-only path 403s in 2026. 1.2.2 added the native file picker so LOAD DEVICE FILES works. Background playback + media notification; clears WebView cache once per shell upgrade so Render redeploys show without reinstalling for every UI change.

Compose screens under `ui/` remain in-tree for optional native tooling, but they are **not** the launcher UI in
shipped APKs — that is why an old binary looked “stuck” on the gramophone-only layout.

The root workspace is a standard single-module **Android Studio Gradle project** (`:app`):

```text
app/src/main/java/com/example/
├── MainActivity.kt                  # WebView PWA shell + YouTube SEND intent → live Render URL
├── data/
│   ├── LyricsGenerator.kt           # Vocal Lyrics & Instrument Chord Sheet engine (Key, BPM, Time Sig)
│   ├── StorageHelper.kt             # Device & library storage telemetry
│   ├── downloader/
│   │   ├── AudioDownloader.kt       # YouTube → server FFmpeg jobs + direct URL importer
│   │   ├── ServerConverter.kt       # Polls /api/convert-audio (URL from Settings or Gradle)
│   │   ├── DeviceMusicHelper.kt     # Android MediaStore exporter (Music/Open Grace Music) & scanner
│   │   └── YouTubeStreamResolver.kt # In-app YouTube browser stream capture helpers
│   ├── local/
│   │   ├── OgmDatabase.kt           # Room SQLite database (v3)
│   │   ├── TrackDao.kt              # Reactive Flow queries & persistence operations
│   │   └── TrackEntity.kt           # Room entity mapping audiophile metadata & instrumental flag
│   └── model/
│       └── Track.kt                 # AudiophileFormat enum (FLAC, ALAC, DSD, WAV, MP3) & Track model
├── player/
│   ├── OgmPlaybackService.kt        # Foreground mediaPlayback service + MediaSession (WebView + native)
│   └── OgmPlayer.kt                 # Native MediaPlayer controller (queue, shuffle, loop, speed)
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

### On-device YouTube recording (APK 1.5.1+ — reinstall once)

Render's datacenter IP is bot-checked by YouTube, so server-side downloads often fail with "Sign in to confirm you're not a bot". **1.3.0** tried a hand-rolled InnerTube `player` call on the phone; in 2026 those clients return googlevideo URLs that **HTTP 403** without a real YouTube session (PO token / n-sig). The in-app YouTube embed already talks to YouTube as a real client — **1.3.1 captures that stream**. **1.3.2** adds a one-time **Connect YouTube** flow so the phone can show YouTube a real signed-in person (your own account, on Google’s pages).

**You must reinstall the APK once** (versionCode 14 / 1.5.1). Then:

1. Optional but recommended if you hit LOGIN_REQUIRED / googlevideo 403: tap **Connect YouTube**. Sign in on **real Google/YouTube pages** inside the app. Open Grace Music never collects your password. Cookies stay on the phone.
2. Play the video (tap **Play** if it is paused) so YouTube issues a real `googlevideo.com/videoplayback` request.
3. Tap **Record**. The app briefly shows the video, captures googlevideo for this watch id, then ranged-downloads the audio.
4. The file is served to the PWA at `https://ogm.local/dl/<token>` and stored in IndexedDB.
5. If capture never saw a stream, InnerTube is a last resort with WEB / WEB_EMBEDDED / TVHTML5. A 403 or LOGIN_REQUIRED is reported as a login/block, not a video-id mismatch.
6. **Website / PWA:** there is no Connect YouTube for downloads. Record uses a recorder worker, or you open the APK.
7. **Everything failed:** nothing is saved. Google can still block. Downloading may still be against YouTube’s terms. OGM never substitutes another song.

### Connect YouTube — APK only

| Surface | What Connect YouTube does | Where the session lives |
| --- | --- | --- |
| **APK 1.5.1+** | Native WebView on **real Google/YouTube pages**. Password never hits OGM. | Android `CookieManager` + private prefs. |
| **Website / PWA** | Not used for Record. | — |
| **Old APK (no bridge)** | Reinstall 1.5.1 for on-device Record + PC-recorder fallback. | — |

**What file you get:** YouTube audio is already lossy, so the real container is kept and labelled honestly — **M4A (AAC)** (or **OPUS/WebM** if no AAC stream exists). If you picked **MP3**, the downloaded audio is converted on the phone (lamejs) from the lossy source. If you picked **FLAC / ALAC / WAV**, the already-downloaded bytes are POSTed to `POST /api/transcode?format=…` (server FFmpeg, no YouTube access, so no bot-check); if that is unreachable the real M4A is saved instead and the toast says so. DSD is not produced on-device. FLAC/WAV from YouTube is a lossless container around a lossy source — no quality is gained.

Each attempt is written to the **Activity log** (`started` / `progress` / `saved` / `failed`, with `route=on-device-capture`, `route=on-device-innertube`, or `route=recorder-worker`).

OGM never substitutes another song. googlevideo’s `id=` query is often not the watch id; capture binds to the **currently playing** watch id plus recency.

## Primary host: Render

**Production PWA + converter:** [https://open-grace-music2.onrender.com](https://open-grace-music2.onrender.com)

- **PWA in Chrome:** open that URL → Add to Home screen. Converter uses same origin automatically. **This is the latest UI path.**
- **APK:** WebView shell loads the same Render URL by default (`CONVERTER_BASE_URL`) — **Settings → Converter server URL** can stay **empty** for most family users. **Uninstall older APKs** before installing **1.2.1 / versionCode 4** so background playback, the media notification, and one-time WebView cache clear on shell upgrade ship correctly. **UI updates do not require reinstalling** after that — reopen the app after a Render redeploy.
- **Offline library / local import:** no server required.

Legacy AppDeploy notes: [`docs/APPDEPLOY.md`](docs/APPDEPLOY.md). Deployment options: [`docs/DEPLOYMENT-PATHS.md`](docs/DEPLOYMENT-PATHS.md).

### Self-hosting (optional)

Run the full stack locally or on your own machine:

```bash
npm run build
PORT=43123 NODE_ENV=production npm start
```

Keep the Render service awake (paid instance or a health ping) to avoid the “APPLICATION LOADING / WELCOME TO RENDER” splash on every visit — that HTML is Render waking a sleeping free instance and cannot be removed from our PWA.

| Goal | What to do |
| :--- | :--- |
| **YouTube → MP3 / FLAC** | Use Render (default) or paste your `npm start` URL in **Settings** |
| **Same Wi‑Fi (PC + phone)** | `http://192.168.1.42:43123` (your LAN IP) |
| **Android emulator** | `http://10.0.2.2:43123` |

**Gradle override (developers):** `./gradlew :app:assembleDebug -POGM_CONVERTER_BASE_URL=http://10.0.2.2:43123`

Set **`OGM_PUBLIC_BASE_URL`** / **`VITE_OGM_PUBLIC_BASE_URL`** when building if your public hostname changes.

### Recorder worker (website Record; optional extra machines)

Render never downloads YouTube. Phone users should use the **APK**. To also let the website Record, run one or more workers on a home/office IP.

The recorder is **`recorder/worker.mjs`**: Node **18+**, **no `npm install`**, no Node 22. Ubuntu 24.04’s apt Node (`v18.19.1`) is enough.

**1. Generate one secret** (once). Use the same value on Render and on every worker:

```bash
openssl rand -hex 32
```

On Render: Dashboard → your service → **Environment** → add `OGM_WORKER_SECRET` = that hex string → **Save** (redeploy). Never commit it. `changeme` / `the-same-secret-on-every-worker` are rejected at startup.

**2. Ubuntu 24.04 PC (copy-paste).** From a clone of this repo:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main

sudo apt-get update
sudo apt-get install -y ffmpeg nodejs ca-certificates curl
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

export OGM_HUB_URL=https://open-grace-music2.onrender.com
export OGM_WORKER_SECRET='paste-the-openssl-hex-here'

node recorder/worker.mjs
```

Success prints one line: `Recorder online, connected to https://open-grace-music2.onrender.com`.

Missing hub/secret (or a placeholder) prints a clear error and exits. You do **not** need `npm install` or `npm run recorder` — those are optional aliases (`npm run recorder` also runs `node recorder/worker.mjs` after a full web install).

Start at login:

```bash
node recorder/worker.mjs --install-service
systemctl --user daemon-reload
systemctl --user enable --now open-grace-recorder.service
loginctl enable-linger "$USER"   # optional: keep running after logout
```

Optional cookies if YouTube still bot-checks the home IP: `~/.config/open-grace-music/youtube-cookies.txt`.

---

## Installing on Android (Samsung S25 Ultra and others)

### Recommended: Install as a PWA (works with Advanced Protection)

Google **Advanced Protection** blocks sideloaded APKs that are not from Google Play or pre-installed app stores. **Add to Home screen** avoids that entirely:

1. Open the site in **Chrome** on your phone.
2. Menu (⋮) → **Install app** or **Add to Home screen**.
3. Launch from your home screen — same gramophone UI, offline library, and converter (when the backend is available).

Use the in-app **INSTALL / Samsung Install** button for step-by-step help.

### Load device files / import folder

- **APK 1.5.1 (versionCode 14) is required for Connect YouTube + on-device recording + PC-recorder fallback + Music/Open Grace Music export** (WebView login + googlevideo intercept; no screen-share capture; 1.3.0 InnerTube-only 403s). 1.2.2 / versionCode 5 is required for LOAD DEVICE FILES. These are native shell changes: **reinstall the APK once** (ordinary UI updates still come from the site). The PWA / Chrome works after a normal reload. Capture needs the video to **actually start playing in the app once** so YouTube issues a real stream. If capture fails, Record uses the PC recorder when online. Recorded/exported audio on the APK is written to shared **Music/Open Grace Music** (other players can see it); the Cassette Library is still IndexedDB. The website cannot pick a folder, so browser saves keep Downloads with a clean filename. The footer and **More** show `v1.5.1 · <commit>` (web) and `APK 1.5.1 (14)` in the shell.
- LOAD DEVICE FILES opens the system picker (multi-select audio). Imports run one at a time with an `Importing 12/80` counter, skip non-audio, skip duplicates (same name + size), store real blobs in IndexedDB (offline / background playback), and log each file as SAVED/FAILED in the Activity log.
- **IMPORT FOLDER** (`webkitdirectory`) appears only in browsers that support it (desktop Chrome/Edge, some Android Chrome). The APK WebView cannot pick folders, and there is no native MediaStore scan: use multi-select there.

### Download APK on your phone

You **can** download APK files on Android in general. What often fails is tapping a link **inside Cursor on mobile**: chat links and in-app preview use embedded webviews, `localhost`, or relative paths that do not trigger a real file download.

**Do this instead:**

1. Copy your Cloud Agent’s **public HTTPS URL** (the same host where the app is deployed — not `localhost` and not the Cursor preview iframe).
2. Open **Chrome** on your phone and paste one of:
   - **`https://YOUR-PUBLIC-HOST/download`** — mobile-friendly landing page with a large download button and Samsung S25 install notes
   - **`https://YOUR-PUBLIC-HOST/OpenGraceMusic.apk`** — direct APK (~25 MB)
   - Alternate direct route: **`https://YOUR-PUBLIC-HOST/download/apk`**
3. After the file downloads, install from **My Files → Downloads** (see steps below).

The in-app **APK / INSTALL** button uses `window.location.origin + '/OpenGraceMusic.apk'` so it works when you are already on the public site in Chrome; if nothing happens, use the `/download` page in Chrome as above.

### Optional: APK sideload (WebView → live PWA)

When Advanced Protection is **off** and **Auto Blocker** allows your install source:

1. **Uninstall** any older Open Grace Music APK first (versionCode 1–2 lack reliable background play; 1 was native Compose UI with no live PWA bottom nav).
2. Download `OpenGraceMusic.apk` (version **1.2.1+** / versionCode **4+**) from `/download`, `/OpenGraceMusic.apk`, or the in-app install guide — **one** shell install; later UI/music changes come from Render without reinstalling.
3. **Settings → Security → Install unknown apps** — allow **My Files** or **Chrome**.
4. **Samsung Auto Blocker**: Settings → Security and privacy → Auto Blocker — allow installation from your chosen source for this install.
5. Open the APK and tap Install. Play Protect may warn on sideload builds not from Play; only proceed if you trust this repository.
6. On **Android 13+**, allow **Notifications** when prompted (needed for the persistent playback controls while music runs in the background).
7. If the UI still looks old: confirm Render redeployed latest `main`, force-stop + reopen (or clear app cache). If you still see native Compose without bottom nav, uninstall and install the latest APK. Or use the **PWA** until then.

The APK loads **`https://open-grace-music2.onrender.com`** inside a WebView. **1.2.1+** keeps HTML5 / YouTube audio playing when you minimize the app (foreground `mediaPlayback` service + media notification) and clears WebView cache once when the shell versionCode changes. A **Render redeploy** updates the PWA UI inside the shell — **no APK reinstall for ordinary UI/music features**. Rebuild the APK when changing shell/background-audio code, permissions, the baked start URL, or signing.

**OEM battery limits:** aggressive “battery optimization”, “sleeping apps”, or manufacturer killers (Samsung, Xiaomi, Oppo, etc.) can still stop background audio after a while. Exempt Open Grace Music from battery optimization if playback dies only after long idle.

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

# Build the installable Debug APK (WebView shell → Render)
./gradlew :app:assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk public/OpenGraceMusic.apk
```
The compiled APK will be generated at:
`app/build/outputs/apk/debug/app-debug.apk`

Override the baked PWA URL:
`./gradlew :app:assembleDebug -POGM_CONVERTER_BASE_URL=https://your-host`

### Pre-packaged Android Studio Project Archive
A complete, self-contained zip archive of the Android Studio project is also available at:
`public/OpenGraceMusic-Android.zip`

Refresh the zip after Android source changes:
`zip -r public/OpenGraceMusic-Android.zip app build.gradle.kts settings.gradle.kts gradle.properties gradlew gradle -x '*/build/*' -x '**/.gradle/*'`

### Sync Origin `main` to the GitHub mirror

Render deploys from GitHub `opengrace-ii/Open-Grace-Music2` `main`. After Origin `main` moves, avoid `git pull origin main && git push github main` if the histories have diverged.

```bash
git fetch origin
git fetch github
git checkout main
git pull --ff-only origin main
git push github main
```

If GitHub `main` still refuses (non-fast-forward), update the mirror to match Origin — this **replaces** GitHub `main`:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
git push --force-with-lease github main
```

## License & Terms of Use
Copyright (c) 2026 Your Name / Your Project Name

This project is licensed under the Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0) License.

You are free to download, listen, and share this music player. However:
1. You must give appropriate credit to the original creator.
2. You may NOT use this software or its code for commercial purposes or financial gain.
3. If you modify the code, you may NOT distribute the modified version.
