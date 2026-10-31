# Render deploy failed (~11s, logs stop after clone)

Use this if Render shows a deploy that finishes in **~10–15 seconds**, logs only **“Cloning from https://github.com/…”**, and never runs **`docker build`** / **`npm ci`**.

## Root cause (plain language)

1. **Wrong GitHub repo org** — Logs that mention **`opengrace-11/Open-Grace-Music2`** are almost certainly a typo. The project lives at **`opengrace-ii/Open-Grace-Music2`** (two letter **`i`**’s: **ii**, not **11**). A fork or mistyped connection may not have the same files as your real repo.
2. **Deploy commit too old — no `Dockerfile` on GitHub `main`** — Render was building commit **`117fec6`**, which only added docs. The root **`Dockerfile`** was added in **`53a9449`** (current `main` tip includes it: **`af216b1`** and later). If GitHub `main` was never pushed after the Dockerfile landed, Render clones an old tree, **Docker** runtime finds **no Dockerfile**, and the deploy fails almost immediately after clone.

This workspace’s `main` **does** include `Dockerfile` at **`af216b1`**. You must **`git push`** that history to **GitHub** `opengrace-ii/Open-Grace-Music2` **`main`**, then redeploy on Render.

## Fix checklist

### 1. Push the real repo to GitHub

On your machine (with GitHub remote configured):

```bash
git clone https://github.com/opengrace-ii/Open-Grace-Music2.git
cd Open-Grace-Music2
git pull origin main
# Confirm Dockerfile exists:
test -f Dockerfile && git log -1 --oneline Dockerfile
git push origin main
```

You should see **`Dockerfile`** in the GitHub web UI at repo root and **`main`** at **`53a9449`** or newer (e.g. **`af216b1`**).

### 2. Fix Render service settings (left sidebar)

Open [Render Dashboard](https://dashboard.render.com) → click your **Web Service name**. The **left sidebar** under that name includes:

| Item | What to set |
|------|-------------|
| **Events** | Expand failed deploy → **View logs** (full build output, not just the summary line). |
| **Settings** | **Repository** → `opengrace-ii/Open-Grace-Music2` (not `opengrace-11`). |
| **Settings** | **Branch** → `main`. |
| **Settings** | **Language / Runtime** → **Docker** (not Node). **Dockerfile path** → `./Dockerfile` if shown. |
| **Settings** | **Health Check Path** → `/api/health` (JSON 200, not SPA HTML). |
| **Environment** | `NODE_ENV=production`, `OGM_PUBLIC_BASE_URL=https://YOUR-SERVICE.onrender.com` — **do not** set `PORT` (Render injects it). |

Optional: import repo root **`render.yaml`** as a [Blueprint](https://render.com/docs/blueprint-spec) for the same defaults.

### 3. Manual deploy after GitHub sync

1. In GitHub, confirm **`main`** shows **`Dockerfile`** at the root.
2. In Render → your service → top **Manual Deploy** → **Deploy latest commit**.
3. Open **Events** → latest deploy → **Logs**. You should see Docker build steps (`npm ci`, `npm run build`, image start), not only “Cloning…”.

### 4. Verify live

```bash
export BASE="https://YOUR-SERVICE.onrender.com"
curl -sS -i "$BASE/api/health"
```

Expect **HTTP 200** and JSON like `{"ok":true,"service":"ogm-converter"}`.

From the repo (after `npm ci`):

```bash
npm run test:health -- "$BASE"
```

## If logs still fail after push

- **Expand** the failed deploy in **Events** — copy the **full** log (build + start).
- Confirm **Runtime = Docker** and commit on GitHub is **`53a9449+`** (`git rev-parse main` locally vs commit shown in Render deploy header).
- First Docker build can take several minutes (ffmpeg, yt-dlp, `npm ci`, Vite build); **~11s** total time means the build never started.

## Related docs

- [DEPLOYMENT-PATHS.md](./DEPLOYMENT-PATHS.md) — full Render walkthrough
- [DOCKER-ACCEPTANCE-TESTS.md](./DOCKER-ACCEPTANCE-TESTS.md) — post-deploy checks
