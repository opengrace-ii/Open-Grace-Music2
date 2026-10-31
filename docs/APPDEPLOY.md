# AppDeploy hosting (primary)

Open Grace Music’s **production PWA + converter API** is hosted on AppDeploy:

**Default URL:** `https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai`

Override for builds or docs with environment variable **`OGM_PUBLIC_BASE_URL`** (server) or **`VITE_OGM_PUBLIC_BASE_URL`** / **`OGM_PUBLIC_BASE_URL`** (Vite client bundle).

## What runs on AppDeploy

This repo is a **Node.js Express app**, not a static-only site:

- `npm run build` → Vite output in `dist/`
- `NODE_ENV=production npm start` → `server.ts` serves `dist/` and **`/api/*`** (YouTube convert jobs, health, lyrics proxy, APK download)

AppDeploy must run the **start command** for the Node server (or an equivalent serverless bundle that includes `server.ts`, `dist/`, and native tools **yt-dlp** / **ffmpeg** if conversion is required on that host).

## Redeploy checklist

1. **Build the web app**
   ```bash
   npm ci
   npm run build
   ```

2. **Build / refresh the APK** (optional but recommended for `/OpenGraceMusic.apk`)
   ```bash
   ./gradlew :app:assembleDebug
   cp app/build/outputs/apk/debug/app-debug.apk public/OpenGraceMusic.apk
   ```

3. **Configure AppDeploy**
   - **Start command:** `NODE_ENV=production npm start` (or `node`/`tsx` equivalent)
   - **Port:** AppDeploy sets `PORT`; server listens on `0.0.0.0:$PORT` (local default **43123**)
   - **Env (optional):**
     - `OGM_PUBLIC_BASE_URL` — public site URL (for docs/links)
     - `GEMINI_API_KEY` — only if you enable AI lyrics on the server (web player uses lrclib by default)

4. **Upload / deploy** the project (or CI artifact) so AppDeploy runs the Node process with `dist/` present.

5. **Smoke test**
   ```bash
   curl -sS "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/api/health"
   npm run test:health -- "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai"
   npm run test:convert -- "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai"
   ```

If GitHub import or Node/ffmpeg setup is blocked in AppDeploy, see [DEPLOYMENT-PATHS.md](./DEPLOYMENT-PATHS.md).

## Routes family users care about

| Path | Purpose |
|------|---------|
| `/` | PWA (gramophone UI) |
| `/api/health` | Converter online check |
| `/api/convert-audio/start` + `/job/...` | YouTube → MP3/FLAC jobs |
| `/download` | Mobile APK landing page |
| `/OpenGraceMusic.apk` | Direct APK download |

## Android APK defaults

Debug/release APKs bake **`BuildConfig.CONVERTER_BASE_URL`** to the AppDeploy URL above. Users can leave **Settings → Converter server URL** empty unless they self-host.

## Local production parity

```bash
npm run build
PORT=43123 NODE_ENV=production npm start
```

Open `http://127.0.0.1:43123` — same-origin converter, no Settings override needed.
