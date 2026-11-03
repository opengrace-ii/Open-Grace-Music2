# YouTube: exact video only

OGM records **the audio from the URL you paste** — never a “similar” track from another site.

## How it works now

**Android APK 1.3.2+ (TubeMate-style):** tap **Connect YouTube** once — Google’s real pages inside the app WebView (`CookieManager`). Then OGM loads **that** watch page, intercepts `googlevideo.com` audio for that video ID, and can send the phone’s session to the studio server. No APK bump is required for the web login path.

**PWA / Chrome / desktop:** Chrome cannot read YouTube’s HttpOnly cookies from this origin, so a Google login iframe here would not work. Tap **Connect YouTube** for a **YouTube TV device-code** flow:

1. OGM shows a short code and opens **Open YouTube** (Google’s `google.com/device` / YouTube activate pages) in a **new tab**.
2. Sign in and enter the code on Google’s pages. We never collect your password.
3. OGM polls until the TV session is linked, stores the tokens in **this browser’s localStorage** (never logged), and sends them with `/api/convert-audio`.
4. The server refreshes the access token and passes it to yt-dlp (plus any pasted cookies / `OGM_YT_COOKIES`).

**Optional fallback:** recorder **key icon** — paste Netscape `cookies.txt` or a Cookie header.

Google may still block datacenter IPs, expire the session, or ask for extra checks. This is **not** an unlimited bypass. Exact video only.

## What went wrong before

When YouTube blocked the server (datacenter IP), an old **SoundCloud search fallback** could download **the wrong song** while the UI still showed the correct YouTube title. That fallback is **removed**.

## If the PWA still cannot record

1. Tap **Connect YouTube** (Settings, More, or the recorder) and finish the TV code in the new tab until status is **Connected**.
2. Retry **Record**.
3. If Google still blocks: paste **youtube.com** cookies via the key icon, or use the **1.3.2 APK** (native WebView login + on-device capture).
