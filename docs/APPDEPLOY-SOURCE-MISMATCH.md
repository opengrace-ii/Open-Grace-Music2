# AppDeploy saved source vs GitHub (`Open-Grace-Music2` main)

ChatGPT and AppDeploy’s **saved in-platform snapshot** for app `ogm-open-grace-music-w3bpvx` do **not** match the code in this repository. Verification curls (Oct 2026) show the live platform still exposes an older backend shape while the public hostname serves static PWA assets without the GitHub Express server.

## What GitHub `main` actually is

| Area | This repo (`/workspace`, `opengrace-ii/Open-Grace-Music2`) |
|------|-------------------------------------------------------------|
| **Entry** | Root `server.ts` via `npm start` → `tsx server.ts` |
| **package.json** | `express` dependency; `dev` / `start` run `server.ts`; `build` runs Vite only |
| **No** `backend/index.ts` | That path does not exist in this repo |
| **Health** | `GET /api/health` → `{"ok":true,"service":"ogm-converter"}` |
| **YouTube convert** | Server-side **yt-dlp** + **ffmpeg** (`server/convertPipeline.ts`) |
| **Convert API** | `/api/convert-audio`, `/api/convert-audio/start`, `/api/convert-mp3`, job routes, etc. |

There is **no** `/api/_healthcheck` route in GitHub. The string `browser-ffmpeg` does not appear anywhere in this repo (browser lamejs exists only for optional client-side blob encoding, not as the deployed backend).

## What AppDeploy’s old backend snapshot exposes

Direct probe of the AppDeploy API gateway (bypasses S3 static routing):

```bash
curl -sS "https://api-v2.appdeploy.ai/app/ogm-open-grace-music-w3bpvx/api/_healthcheck"
```

Observed (live): **HTTP 200**, JSON including `"mp3Conversion":"browser-ffmpeg"`, `"version":"1.6.0"`, route name **`_healthcheck`** (not `health`).

On the same gateway, GitHub routes return **404**:

- `/api/health`
- `/api/validate-url`
- `/api/convert-audio/start`

## What the public hostname does today

`https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai`:

- `/` — PWA **HTML from AmazonS3** (static `dist/`), `x-amz-meta-appdeploy-has-backend: 1` but Node is not answering API paths correctly.
- `GET /api/health` — **200 `text/html`** (SPA `index.html`), **not** JSON.
- `POST /api/convert-audio/start` — **403** “Access restricted” HTML (not Express `{"error":"url is required"}`).

So: **static front-end is deployed; the GitHub Express + yt-dlp + ffmpeg stack is not what AppDeploy is running on that URL.**

## What to do

1. **Redeploy from GitHub**, not from an stale AppDeploy editor snapshot:
   - Repo: `https://github.com/opengrace-ii/Open-Grace-Music2`
   - Branch: `main`
   - Install: `npm ci`
   - Build: `npm run build`
   - Start: `NODE_ENV=production npm start`
   - Runtime: Node.js 22+ long-running process (not static-only upload).
   - Install **ffmpeg** and **yt-dlp** on the same machine as Node.

2. **Verify with GitHub’s health path** (after redeploy):

   ```bash
   curl -sS -i "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/api/health"
   ```

   Expect: **200**, `Content-Type: application/json`, body `{"ok":true,"service":"ogm-converter"}`.

3. **Do not use** `/api/_healthcheck` or `api-v2.appdeploy.ai/.../api/_healthcheck` as proof of the GitHub server — that confirms the **old** AppDeploy backend only.

See also: [APPDEPLOY-CHATGPT-PROMPT.md](./APPDEPLOY-CHATGPT-PROMPT.md), [APPDEPLOY-VERIFY.md](./APPDEPLOY-VERIFY.md), [APPDEPLOY-REDEPLOY-SIMPLE.md](./APPDEPLOY-REDEPLOY-SIMPLE.md).
