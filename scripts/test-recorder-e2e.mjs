#!/usr/bin/env node
/**
 * End-to-end Record job: mock yt-dlp (no YouTube) + real ffmpeg + worker + hub.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.OGM_E2E_PORT || '43129';
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'e2e-worker-secret';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-e2e-'));
const mockYt = path.join(work, 'mock-ytdlp');
const recorderHome = path.join(work, 'recorder-home');
fs.mkdirSync(recorderHome, { recursive: true });

fs.writeFileSync(
  mockYt,
  `#!/usr/bin/env bash
set -euo pipefail
out=""
prev=""
for a in "$@"; do
  if [[ "$prev" == "-o" ]]; then out="$a"; fi
  prev="$a"
done
if [[ -z "$out" ]]; then echo "no -o" >&2; exit 1; fi
file="\${out//%(ext)s/m4a}"
dir="$(dirname "$file")"
mkdir -p "$dir"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i sine=frequency=440:duration=3 -c:a aac -b:a 128k "$file"
id="dQw4w9WgXcQ"
python3 - "$dir/raw_source.info.json" "$id" <<'PY'
import json,sys
path, vid = sys.argv[1], sys.argv[2]
json.dump({"id": vid, "extractor_key": "Youtube", "extractor": "youtube", "title": "E2E Sine", "uploader": "Open Grace"}, open(path,"w"))
PY
echo "[download] 100% of 12.00KiB"
`,
  { mode: 0o755 }
);

function spawnLogged(cmd, args, env) {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => process.stdout.write(`[${path.basename(cmd)}:out] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${path.basename(cmd)}:err] ${d}`));
  return child;
}

async function waitForHealth(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('server did not become healthy');
}

const server = spawnLogged('npx', ['tsx', 'server.ts'], {
  PORT,
  NODE_ENV: 'production',
  OGM_WORKER_SECRET: SECRET,
});

const worker = spawnLogged('npx', ['tsx', 'recorder/cli.ts', '--hub', BASE], {
  OGM_HUB_URL: BASE,
  OGM_WORKER_SECRET: SECRET,
  OGM_RECORDER_HOME: recorderHome,
  OGM_YTDLP: mockYt,
  OGM_FFMPEG: 'ffmpeg',
});

let failed = false;
try {
  await waitForHealth();
  const gone = await fetch(`${BASE}/api/convert-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format: 'MP3' }),
  });
  if (gone.status !== 410) throw new Error(`convert-audio expected 410, got ${gone.status}`);

  const t0 = Date.now();
  let online = false;
  while (Date.now() - t0 < 15000) {
    const p = await fetch(`${BASE}/api/recorder/presence`).then((r) => r.json());
    if (p.online) {
      online = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!online) throw new Error('worker never came online');

  const start = await fetch(`${BASE}/api/recorder/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      format: 'MP3',
      bitrate: 192,
      title: 'E2E Sine',
    }),
  });
  if (!start.ok) throw new Error(`enqueue ${start.status} ${await start.text()}`);
  const { jobId } = await start.json();

  let status;
  const t1 = Date.now();
  while (Date.now() - t1 < 60000) {
    const res = await fetch(`${BASE}/api/recorder/jobs/${jobId}`);
    status = await res.json();
    if (status.stage === 'error') throw new Error(`job error: ${status.error}`);
    if (status.done) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!status?.done) throw new Error(`job not done: ${JSON.stringify(status)}`);

  const file = await fetch(`${BASE}/api/recorder/jobs/${jobId}/file`);
  if (!file.ok) throw new Error(`file HTTP ${file.status}`);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length < 1000) throw new Error(`file too small ${buf.length}`);
  const fmt = file.headers.get('x-audio-format');
  if (fmt && fmt.toUpperCase() !== 'MP3') throw new Error(`format ${fmt}`);
  console.log(`e2e OK ${buf.length} bytes format=${fmt} (mocked yt-dlp, real ffmpeg)`);
} catch (err) {
  failed = true;
  console.error(err instanceof Error ? err.message : err);
} finally {
  worker.kill('SIGTERM');
  server.kill('SIGTERM');
  setTimeout(() => {
    worker.kill('SIGKILL');
    server.kill('SIGKILL');
  }, 2000);
}

process.exit(failed ? 1 : 0);
