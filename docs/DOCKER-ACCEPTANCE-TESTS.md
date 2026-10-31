# Docker host acceptance tests

Run these **from the public internet** (laptop off home Wi‑Fi, or phone on cellular) after deploying the repo **Dockerfile** to Render, Railway, Fly, or another host.

Replace **`BASE`** with your HTTPS origin **without a trailing slash** (e.g. `https://open-grace-music.onrender.com`).

```bash
export BASE="https://YOUR-HOST.example.com"
```

---

## Test 1 — Health (required)

Confirms Express is serving JSON, not static HTML or a paused CDN page.

```bash
curl -sS -i "$BASE/api/health"
```

**Pass criteria:**

- HTTP **200**
- Header **`Content-Type`** includes **`application/json`**
- Body: **`{"ok":true,"service":"ogm-converter"}`** (field order may vary)

Same check via npm (exits non-zero on failure):

```bash
npm run test:health -- "$BASE"
```

---

## Test 2 — Validate URL (required)

Confirms the server can reach YouTube metadata (yt-dlp path) without running a full convert.

```bash
curl -sS "$BASE/api/validate-url?url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('https://www.youtube.com/watch?v=UXdt9mmDiz0'))")"
```

Or with a fixed encoded URL:

```bash
curl -sS "$BASE/api/validate-url?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DUXdt9mmDiz0"
```

**Pass criteria:**

- HTTP **200**
- JSON with **`valid": true`** and non-empty **`title`** (and usually **`author`**)

---

## Test 3 — Full convert smoke (optional, slow)

Downloads and transcodes a short test video; needs **ffmpeg** + **yt-dlp** on the server. Can take 1–2 minutes and may fail if YouTube rate-limits the host.

```bash
npm run test:convert -- "$BASE"
```

**Pass criteria:** script exits **0** and prints convert OK with output size **≥ 30 000** bytes.

---

## Quick reference

| Test | Command | What it proves |
|------|---------|----------------|
| 1 | `curl -sS -i "$BASE/api/health"` | Express + correct route |
| 2 | `curl -sS "$BASE/api/validate-url?url=…"` | yt-dlp / network |
| 3 | `npm run test:convert -- "$BASE"` | ffmpeg + end-to-end convert |

See also: [DEPLOYMENT-PATHS.md](./DEPLOYMENT-PATHS.md), [APPDEPLOY-VERIFY.md](./APPDEPLOY-VERIFY.md).
