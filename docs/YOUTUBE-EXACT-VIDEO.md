# YouTube: exact video only

OGM records **the audio from the URL you paste** — never a “similar” track from another site.

## How it works now

**Android APK (TubeMate-style):** loads **that** watch page in a hidden WebView, intercepts `googlevideo.com` audio for that video ID, then if needed calls the studio server **with the phone’s YouTube cookies**.

**PWA / Render:** yt-dlp uses Node as a JS runtime (YouTube player handshake) plus cookies from:

- The **key icon** on the recorder (saved in the browser), or
- Render env **`OGM_YT_COOKIES`** (paste once in the dashboard).

## What went wrong before

When YouTube blocked the server (datacenter IP), an old **SoundCloud search fallback** could download **the wrong song** while the UI still showed the correct YouTube title. That fallback is **removed**.

## If the PWA still cannot record

1. Tap the **key icon** on the Studio Master Tape Recorder.
2. On a computer where you are logged into YouTube, export **youtube.com** cookies (Netscape `cookies.txt` or Cookie header).
3. Paste once — OGM remembers them — then **Record** again.

Phone users: install/update the APK so on-device capture can run even when Render is blocked.
