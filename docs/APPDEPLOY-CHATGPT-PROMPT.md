# AppDeploy — copy-paste ChatGPT prompt

Use this in a ChatGPT chat with **@AppDeploy** to redeploy or fix **Open Grace Music** without switching to static-only hosting.

**Keep this URL:** `https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai`

**Source of truth:** Deploy from **GitHub `opengrace-ii/Open-Grace-Music2` `main`**, not an old AppDeploy saved snapshot. If `curl …/api/_healthcheck` on `api-v2.appdeploy.ai` returns `"mp3Conversion":"browser-ffmpeg"` but `curl …/api/health` on the public hostname returns HTML, you are still on legacy platform code — see [APPDEPLOY-SOURCE-MISMATCH.md](./APPDEPLOY-SOURCE-MISMATCH.md).

---

## Copy from the line below through the end of the prompt block

```
Redeploy my existing AppDeploy app "Open Grace Music" (URL: https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai). Do NOT create a new app ID unless redeploy to the same URL is impossible.

GitHub repository: https://github.com/opengrace-ii/Open-Grace-Music2
Branch: main

CRITICAL — this is a Node.js Express server, NOT static hosting:
- Use AppDeploy Node.js 22+ RUNTIME with a long-running process (not "static site" / S3-only upload of dist/).
- Install command: npm ci
- Build command: npm run build
- Start command: NODE_ENV=production npm start
- AppDeploy sets PORT; the server listens on 0.0.0.0:$PORT automatically.

CRITICAL — YouTube conversion requires native binaries on the SAME machine as Node during BUILD and at RUNTIME:
- ffmpeg must be on PATH (verify with `ffmpeg -version` in build logs and runtime shell if available)
- yt-dlp must be on PATH (verify with `yt-dlp --version`)
If AppDeploy cannot install these, say so clearly — conversion will fail without them.

Environment variables:
- OGM_PUBLIC_BASE_URL=https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai
- PORT: leave to AppDeploy
- GEMINI_API_KEY: optional (only for server-side AI lyrics)

After deploy finishes, run these verification commands against the live URL and paste status codes, Content-Type, Server header, and first ~200 chars of body:

1) Health (must be JSON from Express, NOT HTML pause page):
curl -sS -i "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/api/health"
Expected: HTTP 200, Content-Type application/json, body like {"ok":true,"service":"ogm-converter"}
FAIL if: HTML title "This app is paused", Server AmazonS3 with text/html for this path, or SPA index.html instead of JSON.

2) Converter API route (must hit Node — empty body should return JSON 400, NOT 403 pause HTML):
curl -sS -i -X POST "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/api/convert-audio/start" -H "Content-Type: application/json" -d '{}'
Expected: HTTP 400, Content-Type application/json, body like {"error":"url is required"}
FAIL if: HTTP 403 HTML "This app is paused" (AppDeploy credits exhausted — fix billing first) or any non-JSON response.

3) Validate URL (proves /api/* routing):
curl -sS -i "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/api/validate-url?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ"
Expected: HTTP 200 JSON with "valid":true and a YouTube video id.

4) Optional full conversion smoke (needs ffmpeg + yt-dlp):
npm ci && npm run test:convert -- "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai"
Expected: health + validate + successful MP3 bytes from POST /api/convert-audio.

Also confirm in browser: PWA at / and APK page at /download load on the same hostname.

If /api/health returns HTML from AmazonS3/CloudFront while / still loads the PWA, the backend Node process is not wired — fix start command and runtime type, then redeploy.
```

---

## When AppDeploy cannot import GitHub

ChatGPT **@AppDeploy** often updates a **saved in-platform snapshot**, not a live GitHub branch. If the assistant cannot “deploy from `opengrace-ii/Open-Grace-Music2` `main`” or `/api/health` still returns **HTML** after redeploy, read **[DEPLOYMENT-PATHS.md](./DEPLOYMENT-PATHS.md)** for full options (self-host, Docker, client URL overrides).

**Workaround to try before leaving AppDeploy:**

1. Download the full repo: `https://github.com/opengrace-ii/Open-Grace-Music2/archive/refs/heads/main.zip`
2. Ask AppDeploy to **replace the entire project tree** with that zip (not a static-only `dist/` upload).
3. Re-state: **Node.js 22+**, install `npm ci`, build `npm run build`, start `NODE_ENV=production npm start`, plus **ffmpeg** and **yt-dlp** on PATH.
4. Verify: `npm run test:health -- "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai"`

If native tools or the Node backend still cannot be enabled, use **Option B or C** in [DEPLOYMENT-PATHS.md](./DEPLOYMENT-PATHS.md) and point PWA/Android Settings (or `OGM_CONVERTER_BASE_URL` at APK build time) at the new public URL.

---

## After AppDeploy responds

Compare results with [APPDEPLOY-VERIFY.md](./APPDEPLOY-VERIFY.md). Simple redeploy steps: [APPDEPLOY-REDEPLOY-SIMPLE.md](./APPDEPLOY-REDEPLOY-SIMPLE.md).
