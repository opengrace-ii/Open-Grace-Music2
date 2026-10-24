# AppDeploy post-deploy verification

**Live URL:** `https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai`

Use this after every redeploy or when conversion “works in the browser UI” but jobs fail silently.

---

## Pause page vs real Express backend

| Signal | App paused (credits) | Static CDN only (no Node) | Healthy Node backend |
|--------|----------------------|---------------------------|----------------------|
| **Typical `Server` header** | `AmazonS3` | `AmazonS3` | Often not S3; responses are dynamic |
| **`POST /api/convert-audio/start`** | **403** HTML, title *This app is paused* | May 403/404/HTML or SPA fallback | **400** JSON if body missing `url` |
| **`GET /api/health`** | May be **200 HTML** (cached SPA) or 403 on some routes | **200 `text/html`** (index.html), not JSON | **200 `application/json`** |
| **Body snippet** | `credit limit` / `Manage credits` | `<!doctype html>` AppDeploy overlay | `{"ok":true,"service":"ogm-converter"}` |

Credits must be active **and** the deploy must use **Node runtime + `npm start`**, not static-only `dist/` upload.

---

## Verification table (four checks)

Replace `BASE` with your public URL if different.

| # | Check | Command | Pass criteria |
|---|--------|---------|----------------|
| 1 | Health | `curl -sS -i "$BASE/api/health"` | Status **200**, `Content-Type: application/json`, body matches sample below |
| 2 | API POST routing | `curl -sS -i -X POST "$BASE/api/convert-audio/start" -H "Content-Type: application/json" -d '{}'` | Status **400**, JSON `{"error":"url is required"}` — **not** 403 pause HTML |
| 3 | Validate URL | `curl -sS -i "$BASE/api/validate-url?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ"` | Status **200**, JSON with `"valid":true` and `"videoId"` or `"id"` (11-char YouTube id) |
| 4 | Full converter smoke | `npm run test:convert -- "$BASE"` | Script exits 0; prints health, validate title, and MP3 byte size ≥ 30 000 |

**Example `BASE`:**

```bash
export BASE="https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai"
```

---

## Expected JSON samples (from `server.ts`)

### `GET /api/health`

```json
{"ok":true,"service":"ogm-converter"}
```

### `POST /api/convert-audio/start` — missing url

Request: `{}`

Response: **400**

```json
{"error":"url is required"}
```

### `POST /api/convert-audio/start` — job queued

Request (minimal):

```json
{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"MP3"}
```

Response: **200**

```json
{"jobId":"<uuid-or-id>","format":"MP3"}
```

(`format` reflects the resolved format spec; default pipeline accepts `format` in the body.)

### `GET /api/convert-audio/job/:jobId` (in progress or done)

```json
{
  "jobId": "...",
  "stage": "validate",
  "percent": 5,
  "message": "Queued for studio conversion…",
  "done": false
}
```

On success, `"stage":"done"`, `"done":true`, `"percent":100`. On failure, `"stage":"error"` with `"error"` and optional `"code"`.

### `GET /api/validate-url?url=...` (YouTube)

Truncated example shape:

```json
{
  "valid": true,
  "id": "dQw4w9WgXcQ",
  "videoId": "dQw4w9WgXcQ",
  "isYouTube": true,
  "title": "...",
  "author": "...",
  "supportedFormats": [{ "id": "MP3", "label": "...", "ext": "mp3" }]
}
```

---

## Browser checks (family links)

| Path | Expect |
|------|--------|
| `/` | PWA loads (gramophone UI) |
| `/download` | APK landing page |
| `/OpenGraceMusic.apk` | APK file download |

These can be served from CDN static assets even when `x-amz-meta-appdeploy-has-backend: 1` is set; **always** confirm `/api/health` JSON separately.

---

## If AppDeploy cannot provide ffmpeg / yt-dlp

AppDeploy may not allow arbitrary system packages. If build or runtime logs show `ffmpeg` / `yt-dlp` missing, use a host with a Dockerfile or full VM:

- **Render / Railway / Fly.io** — deploy this repo with a image that installs Node 22+, `ffmpeg`, and `yt-dlp`, then `npm ci && npm run build && NODE_ENV=production npm start`.
- **Home LAN server** — run `npm run build && PORT=43123 NODE_ENV=production npm start` on a PC (e.g. `http://192.168.0.165:43123` on your Wi‑Fi), expose via **Cloudflare Tunnel**, **Tailscale Funnel**, or similar; set Android **Settings → Converter server URL** and `OGM_PUBLIC_BASE_URL` to that public URL.

See also [APPDEPLOY.md](./APPDEPLOY.md) and [APPDEPLOY-REDEPLOY-SIMPLE.md](./APPDEPLOY-REDEPLOY-SIMPLE.md).
