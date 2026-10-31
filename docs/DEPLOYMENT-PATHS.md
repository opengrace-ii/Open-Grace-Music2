# Deployment paths (AppDeploy, self-host, Docker)

Open Grace Music needs a **long-running Node.js Express** process (`server.ts`) with **ffmpeg** and **yt-dlp** on the same machine, plus a built Vite PWA in `dist/`. Static-only hosting of `dist/` is not enough: `/api/*` must hit Express.

**Legacy AppDeploy URL (do not rely on for production):** `https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai` — AppDeploy does **not** meet OGM acceptance criteria (long-lived `npm start`, **ffmpeg**, **yt-dlp**). Use **Docker on a capable host** instead.

Related docs: [RENDER-FIX.md](./RENDER-FIX.md) (failed deploy in ~11s / wrong repo / missing Dockerfile on GitHub), [DOCKER-ACCEPTANCE-TESTS.md](./DOCKER-ACCEPTANCE-TESTS.md), [CHATGPT-HANDOFF.md](./CHATGPT-HANDOFF.md), [APPDEPLOY.md](./APPDEPLOY.md), [APPDEPLOY-CHATGPT-PROMPT.md](./APPDEPLOY-CHATGPT-PROMPT.md), [APPDEPLOY-SOURCE-MISMATCH.md](./APPDEPLOY-SOURCE-MISMATCH.md), [APPDEPLOY-VERIFY.md](./APPDEPLOY-VERIFY.md).

---

## Recommended path — Render.com Web Service (Docker)

**Use this when AppDeploy cannot run the GitHub stack.** Render runs the repo’s **Dockerfile** (Node 22 + ffmpeg + yt-dlp + Vite build + Express). No server admin experience required beyond clicking through the dashboard.

### Before you start

- GitHub repo: **`opengrace-ii/Open-Grace-Music2`**, branch **`main`** (root contains `Dockerfile`, `server.ts`, `package.json`).
- A [Render](https://render.com) account (free tier works for smoke tests; production may need a paid Web Service for always-on).

### Step-by-step (Grace)

1. **Sign in to Render** → [Dashboard](https://dashboard.render.com) → **New +** → **Web Service**.
2. **Connect GitHub** if prompted; authorize Render to read **`opengrace-ii/Open-Grace-Music2`**.
3. **Create Web Service:**
   - **Name:** e.g. `open-grace-music` (you will get a URL like `https://open-grace-music.onrender.com`).
   - **Region:** pick closest to your family.
   - **Branch:** `main`.
   - **Runtime:** choose **Docker** (Render detects the root **`Dockerfile`**).  
     *Alternative:* **Native** runtime with **Dockerfile path** = `./Dockerfile` if your UI shows “Dockerfile” instead of “Docker” — same result.
   - **Instance type:** Free or Starter (free spins down when idle; first request may be slow).
4. **Environment variables** (Render → your service → **Environment**):

   | Key | Value |
   |-----|--------|
   | `NODE_ENV` | `production` |
   | `PORT` | Leave **unset** on Render — the platform injects `PORT` automatically; the app listens on `0.0.0.0:$PORT`. |
   | `OGM_PUBLIC_BASE_URL` | Your public HTTPS origin **with no trailing slash**, e.g. `https://open-grace-music.onrender.com` (update after first deploy if the hostname differs). |
   | `GEMINI_API_KEY` | *(Optional)* Only if you use server-side AI lyrics. |

5. **Health check** (Render → **Settings** → **Health Check Path**): set to **`/api/health`**. Render expects HTTP **200** with JSON, not SPA HTML.
6. **Create Web Service** and wait for the first deploy (build runs `npm ci`, `npm run build` inside the image; start runs `npm start` → `tsx server.ts`).
7. **Copy the live URL** from the top of the service page (must be `https://…`).
8. **Acceptance tests** from your laptop or phone on cellular — see [DOCKER-ACCEPTANCE-TESTS.md](./DOCKER-ACCEPTANCE-TESTS.md):
   ```bash
   export BASE="https://YOUR-SERVICE.onrender.com"
   curl -sS -i "$BASE/api/health"
   npm run test:health -- "$BASE"
   ```
9. **Point the app at the new host** — [Client converter base URL](#client-converter-base-url-pwa--android) below (Settings → **Converter server URL** on PWA and Android).

### Deploy from a pre-built Docker image (optional)

If you build elsewhere (CI or local `docker build`), push to a registry Render can pull (Docker Hub, GHCR), then create a **Web Service** → **Existing image** and set the same env vars and health check **`/api/health`**.

### Railway (short)

- [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select **`Open-Grace-Music2`**.
- Railway auto-detects the **Dockerfile**; **`PORT`** is injected — do not hard-code.
- Set **`OGM_PUBLIC_BASE_URL`** to Railway’s generated `https://….up.railway.app` URL.
- Add a health check or rely on manual **`curl`** / **`npm run test:health`** against **`/api/health`**.

### Fly.io (short)

- Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/); in the repo root: `fly launch` (uses **`Dockerfile`**), then `fly deploy`.
- In **`fly.toml`**, set **`[http_service] internal_port`** to match the app (Fly sets **`PORT`**; the Dockerfile default is **43123** if unset — prefer letting Fly inject **`PORT`** and map HTTP to it).
- Set secrets: `fly secrets set OGM_PUBLIC_BASE_URL=https://YOUR-APP.fly.dev NODE_ENV=production`
- Verify: `curl -sS -i "https://YOUR-APP.fly.dev/api/health"`

---

## Acceptance criteria (production ready)

These are the bars that mean “GitHub `main` is actually live,” not an old AppDeploy snapshot or static CDN only:

1. **Source:** Deploy matches **GitHub `opengrace-ii/Open-Grace-Music2` branch `main`** (root `server.ts`, `GET /api/health`, server-side yt-dlp/ffmpeg — not legacy `/api/_healthcheck` / `browser-ffmpeg`).
2. **Process:** **`NODE_ENV=production npm start`** (or equivalent) runs **`tsx server.ts`** as a long-lived listener on **`0.0.0.0:$PORT`** (`PORT` from the host; local default **43123**).
3. **Build:** **`npm ci`** and **`npm run build`** so `dist/` exists before start.
4. **Public check:** From the internet, **`GET /api/health`** on the public hostname returns **HTTP 200**, **`Content-Type: application/json`**, body like **`{"ok":true,"service":"ogm-converter"}`** — not SPA HTML, not S3 “paused” HTML.

Quick verification:

```bash
export BASE="https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai"
curl -sS -i "$BASE/api/health"
npm run test:health -- "$BASE"
```

Full table: [APPDEPLOY-VERIFY.md](./APPDEPLOY-VERIFY.md).

---

## Option A — AppDeploy via ChatGPT (@AppDeploy)

### Platform limitations (honest)

AppDeploy workflows exposed in ChatGPT typically **do not**:

- Import or continuously sync an arbitrary **GitHub branch** (no “deploy from `main` on every push” in the prompt alone).
- Expose every **install/start** knob you would set on Render/Fly (you ask in natural language; what runs is whatever the platform applies to the **saved project snapshot**).
- Guarantee **ffmpeg** / **yt-dlp** on the Node runtime (required for YouTube conversion in this repo).

What you **can** try in ChatGPT with **@AppDeploy**:

1. **Replace the entire saved source** with this repo (not a partial `dist/` upload):
   - Download **`https://github.com/opengrace-ii/Open-Grace-Music2/archive/refs/heads/main.zip`**, unzip locally, and ask AppDeploy to **replace all project files** with that tree (or upload/sync the full tree if the UI offers file upload).
   - Explicitly say: **Node.js 22+ backend**, not static-only hosting.
2. **Commands to request** (same as GitHub):
   - Install: `npm ci`
   - Build: `npm run build`
   - Start: `NODE_ENV=production npm start`
3. **Native tools:** Ask to install **ffmpeg** and **yt-dlp** on PATH in **build and runtime**, and to verify with `ffmpeg -version` and `yt-dlp --version` in logs.
4. **Env:** `OGM_PUBLIC_BASE_URL=https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai` (keep the existing hostname if possible).
5. **Redeploy the same app ID** so Android/PWA defaults stay on the same URL.

Copy-paste prompt block: [APPDEPLOY-CHATGPT-PROMPT.md](./APPDEPLOY-CHATGPT-PROMPT.md).

**If AppDeploy cannot** attach a Node process with ffmpeg/yt-dlp, or `/api/health` still returns HTML after a full-tree redeploy, **stop fighting the snapshot** and use **Option B** or **Option C** below. The mismatch symptoms are documented in [APPDEPLOY-SOURCE-MISMATCH.md](./APPDEPLOY-SOURCE-MISMATCH.md).

---

## Option B — Self-host on Grace PC (`192.168.0.165`)

Good when the family PC is usually on and you want no cloud bill. You expose HTTPS with **Cloudflare Tunnel** or **Tailscale Funnel** (pick one; both work).

### Outline

1. **On the PC (LAN `192.168.0.165`):**
   - Install **Node 22+**, **ffmpeg**, **yt-dlp** (same as dev/prod).
   - Clone or pull `https://github.com/opengrace-ii/Open-Grace-Music2` → `main`.
   - `npm ci && npm run build`
   - Run: `PORT=43123 NODE_ENV=production npm start` (or use **pm2** / **systemd** for restart on boot).
   - Confirm locally: `npm run test:health -- "http://127.0.0.1:43123"`

2. **Optional APK on LAN:** `./gradlew :app:assembleDebug` and copy APK to `public/OpenGraceMusic.apk` before start if you serve `/download` from this host.

3. **Public HTTPS (family outside home):**
   - **Cloudflare Tunnel:** `cloudflared tunnel` → origin `http://127.0.0.1:43123`, hostname e.g. `ogm.yourdomain.com`.
   - **Tailscale Funnel:** `tailscale funnel 43123` (or funnel to your MagicDNS name) — share the HTTPS URL Tailscale prints.

4. **Verify from a phone on cellular (not Wi‑Fi):**
   ```bash
   curl -sS -i "https://YOUR_PUBLIC_HOST/api/health"
   npm run test:health -- "https://YOUR_PUBLIC_HOST"
   ```

5. **Point clients at the new host** (see [Client converter base URL](#client-converter-base-url-pwa--android) below).

---

## Option C — Docker elsewhere (Hetzner VPS, other clouds)

Same **Dockerfile** as Render. Full Render steps are in [Recommended path — Render.com](#recommended-path--rendercom-web-service-docker) above.

### Build and run locally (smoke test)

```bash
docker build -t open-grace-music .
docker run --rm -p 43123:43123 -e PORT=43123 -e NODE_ENV=production open-grace-music
npm run test:health -- "http://127.0.0.1:43123"
```

| Host | Typical approach |
|------|------------------|
| **Hetzner** | VM + `docker run` or Compose; **Caddy/nginx** for TLS; set **`OGM_PUBLIC_BASE_URL`**, platform **`PORT`**. |

After deploy, run checks in [DOCKER-ACCEPTANCE-TESTS.md](./DOCKER-ACCEPTANCE-TESTS.md).

There is **no** checked-in `render.yaml` / `fly.toml` yet; add them on the host you choose if you want infra-as-code.

---

## Client converter base URL (PWA + Android)

Clients talk to the converter API at **`/api/*`** on some **HTTPS origin**. Defaults assume AppDeploy; override when you self-host or use Docker elsewhere.

### PWA (browser)

- **Default:** Same origin as the page (`window.location.origin`) when Settings is blank — works for AppDeploy and self-hosted PWA on one hostname.
- **Fallback constant:** `src/constants/ogmPublicBase.ts` → `DEFAULT_OGM_PUBLIC_BASE_URL` (AppDeploy URL). Override at **build** with **`VITE_OGM_PUBLIC_BASE_URL`**.
- **Runtime override:** Settings → **Converter server URL** → stored in **`localStorage`** key `ogm_converter_server_url`. Logic: `src/services/converterServerUrl.ts` → `resolveConverterApiBaseUrl()`.

### Android APK

- **Baked default:** `BuildConfig.CONVERTER_BASE_URL` from `app/build.gradle.kts` (defaults to AppDeploy). Rebuild with Gradle property **`OGM_CONVERTER_BASE_URL=https://your-host`** to change the default in new APKs.
- **Per-device override:** Settings → **Converter server URL** → `ConverterServerPrefs` (`converter_server_url`). **Clear the field** to use the baked-in default again.
- **Helper copy:** `OgmPublicBase.DEFAULT_APPDEPLOY_BASE_URL` in UI placeholder text.

When you move off AppDeploy, either rebuild the APK with `OGM_CONVERTER_BASE_URL`, or have each family member paste the new base URL once in Settings (no trailing slash).

---

## Which path to try first?

| Priority | Path | When |
|----------|------|------|
| 1 | **Render.com Docker Web Service** | **Default for production** — AppDeploy failed acceptance; need **`/api/health` JSON**, ffmpeg, yt-dlp. |
| 2 | **B — Grace PC + tunnel** | PC is always on, minimal cost, family OK with tunnel URL or custom domain. |
| 3 | **A — AppDeploy** | Legacy hostname only; not expected to pass OGM criteria without native ffmpeg/yt-dlp + Express. |
| 4 | **Railway / Fly / Hetzner Docker** | Same stack as Render if you already use those platforms. |

---

## Health check commands (reference)

```bash
# Detailed headers (best for diagnosing HTML vs JSON)
curl -sS -i "$BASE/api/health"

# npm (expects JSON, exits non-zero on failure)
npm run test:health -- "$BASE"

# Full converter smoke (ffmpeg + yt-dlp on server)
npm run test:convert -- "$BASE"
```
