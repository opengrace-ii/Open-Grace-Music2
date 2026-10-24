# AppDeploy redeploy — simple steps (Open Grace Music)

Use this if you already deployed with the **ChatGPT AppDeploy** plugin and want to **refresh the live site** after pushing code to GitHub.

**Live site (keep this URL):**  
https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai

**GitHub repo:** `opengrace-ii/Open-Grace-Music2` · branch **`main`**

---

## Before you redeploy on your PC (Grace)

1. Open a terminal in your project folder.
2. Run: `git pull` (so your PC has the latest `main` from GitHub).
3. If you changed code on the PC, commit and **push to GitHub** (`main`) first — AppDeploy should deploy from GitHub, not only from your laptop folder.

---

## In ChatGPT with AppDeploy

1. Open the same ChatGPT chat where **AppDeploy** is connected (or start a new chat and tag **@AppDeploy**).
2. Ask AppDeploy to **redeploy** or **update** your existing app **Open Grace Music** (or the app whose URL ends with `ogm-open-grace-music-w3bpvx.v2.appdeploy.ai`).
3. Tell it to use this repository:
   - **GitHub:** `https://github.com/opengrace-ii/Open-Grace-Music2`
   - **Branch:** `main`
4. Confirm these **build settings** (this project is **not** a static-only website — it needs **Node.js** running):

   | Step | Command |
   |------|---------|
   | **Install** | `npm ci` |
   | **Build** | `npm run build` |
   | **Start** | `NODE_ENV=production npm start` |

   AppDeploy usually sets **PORT** for you. The app listens on that port automatically.

5. Set **environment variables** (in AppDeploy secrets / env panel if shown):

   | Variable | Required? | Value |
   |----------|-----------|--------|
   | `PORT` | Auto | Leave to AppDeploy |
   | `OGM_PUBLIC_BASE_URL` | Recommended | `https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai` |
   | `GEMINI_API_KEY` | Optional | Only if you want server-side AI lyrics (web player uses lrclib by default) |

6. **Important — runtime requirements**

   This app serves the PWA **and** YouTube → MP3/FLAC conversion on the server. The host must support:

   - **Node.js 20 or newer**
   - **`ffmpeg`** and **`yt-dlp`** installed on the same machine as the Node process

   If AppDeploy only offers **static hosting** (HTML/CSS/JS upload with no long-running Node server), conversion **will not work**. You need an AppDeploy (or equivalent) **Node / full-stack** deployment, not static-only.

7. Wait until AppDeploy says the deployment is **ready**, then run the smoke test below.

---

## Smoke test (do this every redeploy)

1. In a browser or terminal, open:

   **https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/api/health**

2. You should see **JSON** like:

   ```json
   {"ok":true,"service":"ogm-converter"}
   ```

3. If you see an **HTML error page**, a **login overlay**, or **404**, the Node server is not running correctly — ask AppDeploy to fix the **start command** and redeploy.

4. Optional: open the **PWA home page** (same hostname, path `/`) and try a short YouTube convert test on Wi‑Fi.

---

## Links your family uses

| What | URL |
|------|-----|
| **PWA (music player in browser)** | https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/ |
| **APK download page** | https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/download |
| **Direct APK file** | https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai/OpenGraceMusic.apk |

The Android app can leave **Settings → Converter server URL** **empty** — it defaults to AppDeploy.

---

## Optional: refresh the APK in the repo

Only if you changed the Android app and want the website APK link to update:

```bash
./gradlew :app:assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk public/OpenGraceMusic.apk
```

Commit, push to `main`, then redeploy on AppDeploy again.

---

## More detail

See [APPDEPLOY.md](./APPDEPLOY.md) for technical notes and local production testing.
