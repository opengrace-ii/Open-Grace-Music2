# YouTube: exact video only

OGM records **the audio from the URL you paste** — never a “similar” track from another site.

## What went wrong before

When YouTube blocked the server (datacenter IP), an old **SoundCloud search fallback** could download **the wrong song** while the UI still showed the correct YouTube title. That fallback is **removed**.

## If recording fails now

1. Tap the **key icon** on the Studio Master Tape Recorder.
2. On a computer where you are logged into YouTube, export **youtube.com** cookies (Netscape `cookies.txt` or browser Cookie header).
3. Paste into OGM and **Record** again.

## Verify a download

In the app or download headers, `X-Audio-Source` should be `youtube-direct` (not `audiophile-mirror`).

Delete any old library files that came from the mirror era — they may be the wrong performance even if the title looked correct.
