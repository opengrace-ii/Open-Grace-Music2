# YouTube: exact video only

OGM records **the audio from the URL you paste** — never a “similar” track from another site.

## How it works now

**Android APK 1.3.5+:** tap **Connect YouTube** once — Google’s real pages inside the app WebView. Record intercepts `googlevideo.com` audio for that video ID.

**PWA / Chrome / desktop:** tap **Record**. The browser fetches that exact video ID from public Invidious/Piped mirrors (your IP). If mirrors fail, the Render converter tries yt-dlp with several player clients, JS runtime, and cookies from the key icon plus `OGM_YT_COOKIES`. Optional TV **Connect YouTube** is not a download session.

**Optional:** recorder **key icon** — paste Netscape `cookies.txt` or a Cookie header. Optional env `OGM_YT_PO_TOKEN` / `OGM_YT_VISITOR_DATA` if you already have them.

Google may still block datacenter IPs or public mirrors. Exact video only — no wrong-song fallback, no tab share.

## What went wrong before

When YouTube blocked the server (datacenter IP), an old **SoundCloud search fallback** could download **the wrong song**. A later workaround asked Chrome to **share this tab**. Both are **removed**.
