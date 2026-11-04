#!/usr/bin/env node
/**
 * Open Grace Music recorder worker — Node 18+, no npm install.
 * Polls the site, runs yt-dlp + ffmpeg on this machine, uploads the file.
 *
 *   export OGM_HUB_URL=https://open-grace-music2.onrender.com
 *   export OGM_WORKER_SECRET="$(openssl rand -hex 32)"   # same value on Render
 *   node recorder/worker.mjs
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_HUB_UPLOAD_BYTES,
  RESULT_CHUNK_BYTES,
  extractTimeoutMs,
  ffmpegTimeoutMs,
  tooLargeMessage,
} from './limits.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..');
const DEFAULT_HUB = 'https://open-grace-music2.onrender.com';
const PLACEHOLDERS = new Set([
  '',
  'changeme',
  'secret',
  'password',
  'placeholder',
  'your-secret',
  'your_secret',
  'ogm_secret',
  'same-as-render',
  'the-same-secret-on-every-worker',
  'replace-me',
  'xxx',
  '123456',
]);

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
function configDir() {
  const override = (process.env.OGM_RECORDER_HOME || '').trim();
  if (override) return override;
  return path.join(os.homedir(), '.config', 'open-grace-music');
}
function ensureConfigDir() {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
}
function isPlaceholderSecret(secret) {
  const s = secret.trim();
  if (s.length < 16) return true;
  if (PLACEHOLDERS.has(s.toLowerCase())) return true;
  if (/^(your|example|todo|fixme|changeme)/i.test(s)) return true;
  return false;
}
function loadHub() {
  const fromCli = argValue('--hub');
  const fromEnv = (process.env.OGM_HUB_URL || '').trim();
  const file = path.join(configDir(), 'hub-url');
  const fromFile = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
  const hub = (fromCli || fromEnv || fromFile || '').replace(/\/$/, '');
  if (!hub) {
    fail(
      'Missing OGM_HUB_URL. Example: export OGM_HUB_URL=https://open-grace-music2.onrender.com'
    );
  }
  if (!/^https?:\/\//i.test(hub)) {
    fail(`OGM_HUB_URL must be an http(s) URL, got: ${hub}`);
  }
  return hub;
}
function loadSecret() {
  const fromCli = argValue('--secret');
  const fromEnv = (process.env.OGM_WORKER_SECRET || '').replace(/[\r\n]/g, '').trim();
  const file = path.join(configDir(), 'worker-secret');
  const fromFile = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/[\r\n]/g, '').trim() : '';
  const secret = fromCli || fromEnv || fromFile;
  if (!secret || isPlaceholderSecret(secret)) {
    fail(
      [
        'Missing or placeholder OGM_WORKER_SECRET.',
        'Generate one:  openssl rand -hex 32',
        'Set that same value on Render (Environment → OGM_WORKER_SECRET) and here:',
        '  export OGM_WORKER_SECRET=\'<paste>\'',
      ].join('\n')
    );
  }
  return secret;
}
function loadWorkerId() {
  ensureConfigDir();
  const file = path.join(configDir(), 'worker-id');
  if (fs.existsSync(file)) {
    const id = fs.readFileSync(file, 'utf8').replace(/[^\w.-]/g, '').slice(0, 64);
    if (id) return id;
  }
  const id = `w_${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(file, `${id}\n`, { mode: 0o600 });
  return id;
}
function cookiesFile() {
  const fromCli = argValue('--cookies');
  const fromEnv = (process.env.OGM_YT_COOKIES_FILE || '').trim();
  const defaultFile = path.join(configDir(), 'youtube-cookies.txt');
  const file = fromCli || fromEnv || (fs.existsSync(defaultFile) ? defaultFile : '');
  return file && fs.existsSync(file) ? file : '';
}
function authHeaders(secret, workerId) {
  return { Authorization: `Bearer ${secret}`, 'X-Ogm-Worker-Id': workerId };
}
function extractYouTubeId(url) {
  if (!url) return null;
  const match = url
    .trim()
    .match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|[?&]v=)([^#&?]{11})|^([^#&?]{11})$/i);
  return match ? match[1] || match[2] : null;
}
function formatSpec(rawFormat, rawBitrate) {
  const fmt = String(rawFormat || 'MP3').toUpperCase();
  const mp3Bitrate = [128, 192, 256, 320].includes(Number(rawBitrate)) ? Number(rawBitrate) : 320;
  if (fmt === 'FLAC') {
    return {
      format: 'FLAC',
      extension: 'flac',
      mimeType: 'audio/flac',
      ffmpegArgs: ['-vn', '-c:a', 'flac', '-sample_fmt', 's32', '-ar', '96000', '-compression_level', '8'],
      bitDepth: '24-bit',
      sampleRate: 96000,
      bitrateLabel: '24-bit / 96 kHz Lossless',
    };
  }
  if (fmt === 'ALAC') {
    return {
      format: 'ALAC',
      extension: 'm4a',
      mimeType: 'audio/mp4',
      ffmpegArgs: ['-vn', '-c:a', 'alac', '-sample_fmt', 's32p', '-ar', '96000'],
      bitDepth: '24-bit',
      sampleRate: 96000,
      bitrateLabel: '24-bit / 96 kHz Apple Lossless',
    };
  }
  if (fmt === 'DSD' || fmt === 'DSF') {
    return {
      format: 'DSD',
      extension: 'wav',
      mimeType: 'audio/wav',
      ffmpegArgs: ['-vn', '-c:a', 'pcm_s24le', '-ar', '192000'],
      bitDepth: '24-bit',
      sampleRate: 192000,
      bitrateLabel: '24-bit / 192 kHz PCM',
    };
  }
  if (fmt === 'WAV') {
    return {
      format: 'WAV',
      extension: 'wav',
      mimeType: 'audio/wav',
      ffmpegArgs: ['-vn', '-c:a', 'pcm_s24le', '-ar', '48000'],
      bitDepth: '24-bit',
      sampleRate: 48000,
      bitrateLabel: '24-bit / 48 kHz PCM',
    };
  }
  return {
    format: 'MP3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    ffmpegArgs: ['-vn', '-c:a', 'libmp3lame', '-b:a', `${mp3Bitrate}k`, '-ar', '48000'],
    bitDepth: '16-bit',
    sampleRate: 48000,
    bitrateLabel: `${mp3Bitrate} kbps CBR`,
  };
}

function runCmd(command, args, opts = {}) {
  const stallMs = opts.stallMs || 120_000;
  const maxMs = opts.maxMs || opts.timeoutMs || 45 * 60_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const started = Date.now();
    let lastData = Date.now();
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearInterval(watch);
      if (err) reject(err);
      else resolve(value);
    };
    const watch = setInterval(() => {
      const now = Date.now();
      if (now - lastData > stallMs) {
        child.kill('SIGKILL');
        finish(new Error(`${command} stalled`));
      } else if (now - started > maxMs) {
        child.kill('SIGKILL');
        finish(new Error(`${command} timed out`));
      }
    }, 2000);
    child.stdout.on('data', (d) => {
      lastData = Date.now();
      const text = d.toString();
      stdout += text;
      if (stdout.length > 400_000) stdout = stdout.slice(-200_000);
      if (opts.onOut) opts.onOut(text);
    });
    child.stderr.on('data', (d) => {
      lastData = Date.now();
      const text = d.toString();
      stderr += text;
      if (stderr.length > 400_000) stderr = stderr.slice(-200_000);
      if (opts.onOut) opts.onOut(text);
    });
    child.on('error', (err) => finish(err));
    child.on('close', (code) => {
      if (code === 0) finish(null, { stdout, stderr });
      else finish(new Error(`${command} exit ${code}: ${(stderr || stdout).slice(-400)}`));
    });
  });
}

function pickRaw(workDir) {
  const files = fs.readdirSync(workDir).filter((f) => f.startsWith('raw_source.'));
  for (const f of files) {
    if (f.endsWith('.info.json')) continue;
    const p = path.join(workDir, f);
    try {
      if (fs.statSync(p).size > 1000) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function reportedId(workDir) {
  for (const f of fs.readdirSync(workDir).filter((n) => n.endsWith('.info.json'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(workDir, f), 'utf8'));
      if (j && j.id) return String(j.id);
    } catch {
      // ignore
    }
  }
  return '';
}

function ytdlpBin() {
  return (process.env.OGM_YTDLP || 'yt-dlp').trim();
}
function ffmpegBin() {
  return (process.env.OGM_FFMPEG || 'ffmpeg').trim();
}

function parseYtdlpPercent(text) {
  const m = String(text).match(/\[download\]\s+([0-9.]+)%/);
  return m ? Number(m[1]) : null;
}

function parseFfmpegOutTimeSec(text) {
  const m = String(text).match(/out_time_ms=(\d+)/);
  if (!m) return null;
  return Number(m[1]) / 1_000_000;
}

function infoDurationSec(workDir) {
  for (const f of fs.readdirSync(workDir).filter((n) => n.endsWith('.info.json'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(workDir, f), 'utf8'));
      const d = Number(j.duration);
      if (Number.isFinite(d) && d > 0) return d;
    } catch {
      // ignore
    }
  }
  return 0;
}

async function recordJob(job, cookies, onProgress) {
  const spec = formatSpec(job.format, job.bitrate);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-home-'));
  const ytId = extractYouTubeId(job.url);
  let title = job.title || 'Open Grace Track';
  let artist = job.artist || 'Open Grace Music';
  try {
    let inputPath;
    let durationSec = 0;
    if (ytId) {
      const out = path.join(workDir, 'raw_source.%(ext)s');
      const args = [
        '--no-playlist',
        '--no-warnings',
        '-f',
        'bestaudio/best',
        '--newline',
        '--write-info-json',
        '-o',
        out,
      ];
      if (cookies) args.push('--cookies', cookies);
      args.push(`https://www.youtube.com/watch?v=${ytId}`);
      await runCmd(ytdlpBin(), args, {
        stallMs: 120_000,
        maxMs: extractTimeoutMs(3600),
        onOut: (chunk) => {
          const pct = parseYtdlpPercent(chunk);
          if (pct != null && onProgress) {
            onProgress({
              stage: 'extract',
              percent: Math.min(54, 12 + Math.round(pct * 0.4)),
              message: `Fetching audio ${Math.round(pct)}%…`,
            });
          }
        },
      });
      const got = reportedId(workDir);
      if (got && got.toLowerCase() !== ytId.toLowerCase()) {
        throw new Error(`Stream did not match this video (yt-dlp id ${got}, requested ${ytId}).`);
      }
      durationSec = infoDurationSec(workDir);
      inputPath = pickRaw(workDir);
      if (!inputPath) throw new Error('Could not fetch an audio stream for this video.');
    } else {
      const normalized = /^https?:\/\//i.test(job.url) ? job.url : `https://${job.url}`;
      const res = await fetch(normalized);
      if (!res.ok) throw new Error(`Failed to fetch audio URL: HTTP ${res.status}`);
      inputPath = path.join(workDir, 'raw_direct_input');
      fs.writeFileSync(inputPath, Buffer.from(await res.arrayBuffer()));
    }
    if (onProgress) {
      onProgress({ stage: 'ffmpeg', percent: 58, message: `Converting to ${spec.format}…` });
    }
    const outputFilePath = path.join(workDir, `master_output.${spec.extension}`);
    await runCmd(
      ffmpegBin(),
      [
        '-y',
        '-i',
        inputPath,
        '-progress',
        'pipe:1',
        ...spec.ffmpegArgs,
        '-metadata',
        `title=${title}`,
        '-metadata',
        `artist=${artist}`,
        '-metadata',
        'album=Open Grace Music',
        outputFilePath,
      ],
      {
        stallMs: 120_000,
        maxMs: ffmpegTimeoutMs(durationSec || 600),
        onOut: (chunk) => {
          const t = parseFfmpegOutTimeSec(chunk);
          if (t != null && onProgress) {
            const den = durationSec > 0 ? durationSec : Math.max(t, 1);
            const frac = Math.max(0, Math.min(1, t / den));
            onProgress({
              stage: 'ffmpeg',
              percent: Math.min(90, 58 + Math.round(frac * 32)),
              message: `Converting ${spec.format} ${Math.round(frac * 100)}%…`,
            });
          }
        },
      }
    );
    if (!fs.existsSync(outputFilePath) || fs.statSync(outputFilePath).size < 1000) {
      throw new Error('FFmpeg transcoding produced an invalid output file.');
    }
    const outBytes = fs.statSync(outputFilePath).size;
    if (outBytes > MAX_HUB_UPLOAD_BYTES) {
      const err = new Error(tooLargeMessage(spec.format, durationSec || 0));
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }
    return {
      workDir,
      outputFilePath,
      spec,
      title,
      artist,
      ytId,
    };
  } catch (err) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    throw err;
  }
}

function installService(hub) {
  const nodeBin = process.execPath;
  const worker = path.join(REPO_DIR, 'recorder', 'worker.mjs');
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  fs.mkdirSync(unitDir, { recursive: true });
  const envFile = path.join(configDir(), 'worker.env');
  ensureConfigDir();
  const secret = loadSecret();
  fs.writeFileSync(
    envFile,
    `OGM_HUB_URL=${hub}\nOGM_WORKER_SECRET=${secret}\n`,
    { mode: 0o600 }
  );
  const unit = `[Unit]
Description=Open Grace Music recorder worker
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
EnvironmentFile=${envFile}
ExecStart=${nodeBin} ${worker}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
  const unitPath = path.join(unitDir, 'open-grace-recorder.service');
  fs.writeFileSync(unitPath, unit, { mode: 0o644 });
  console.log(`Wrote ${unitPath}`);
  console.log('Enable at login with:');
  console.log('  systemctl --user daemon-reload');
  console.log('  systemctl --user enable --now open-grace-recorder.service');
}

function workerAuthError(status) {
  if (status === 401) {
    const err = new Error(
      'Worker secret does not match the hub (HTTP 401). Set the same OGM_WORKER_SECRET on Render and this PC.'
    );
    err.status = 401;
    return err;
  }
  if (status === 503) {
    const err = new Error(
      'Hub is missing OGM_WORKER_SECRET (HTTP 503). Set it on Render, then use that same value here.'
    );
    err.status = 503;
    return err;
  }
  return null;
}

async function assertWorkerOk(res, action) {
  if (res.ok || res.status === 204) return;
  const auth = workerAuthError(res.status);
  if (auth) throw auth;
  throw new Error(`${action} failed HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);
}

async function postJson(hub, secret, workerId, urlPath, body) {
  const res = await fetch(`${hub}${urlPath}`, {
    method: 'POST',
    headers: { ...authHeaders(secret, workerId), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await assertWorkerOk(res, urlPath);
}

async function claim(hub, secret, workerId) {
  const res = await fetch(`${hub}/api/recorder/claim?wait=20000`, {
    headers: authHeaders(secret, workerId),
  });
  if (res.status === 204) return null;
  await assertWorkerOk(res, 'claim');
  const data = await res.json();
  return data.job || null;
}

function audioMetaHeaders(spec, title, artist, ytId) {
  const headers = {
    'Content-Type': spec.mimeType,
    'X-Audio-Format': spec.format,
    'X-Audio-Extension': spec.extension,
    'X-Audio-Title': encodeURIComponent(title),
    'X-Audio-Artist': encodeURIComponent(artist),
    'X-Audio-Bit-Depth': spec.bitDepth,
    'X-Audio-Sample-Rate': String(spec.sampleRate),
    'X-Audio-Bitrate-Label': encodeURIComponent(spec.bitrateLabel),
    'X-Audio-Source': 'pc-recorder',
  };
  if (ytId) headers['X-Audio-Id'] = ytId;
  return headers;
}

async function uploadResult(hub, secret, workerId, jobId, filePath, spec, title, artist, ytId) {
  const size = fs.statSync(filePath).size;
  if (size > MAX_HUB_UPLOAD_BYTES) {
    const err = new Error(tooLargeMessage(spec.format, 0));
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }
  const base = `${hub}/api/recorder/jobs/${encodeURIComponent(jobId)}`;
  const meta = { ...authHeaders(secret, workerId), ...audioMetaHeaders(spec, title, artist, ytId) };
  const begin = await fetch(`${base}/result-begin`, { method: 'POST', headers: meta });
  await assertWorkerOk(begin, 'result-begin');
  const fd = fs.openSync(filePath, 'r');
  try {
    let offset = 0;
    const buf = Buffer.alloc(RESULT_CHUNK_BYTES);
    while (offset < size) {
      const n = fs.readSync(fd, buf, 0, Math.min(RESULT_CHUNK_BYTES, size - offset), offset);
      if (n <= 0) break;
      const chunk = buf.subarray(0, n);
      const res = await fetch(`${base}/result-chunk`, {
        method: 'POST',
        headers: { ...authHeaders(secret, workerId), 'Content-Type': 'application/octet-stream' },
        body: chunk,
      });
      await assertWorkerOk(res, 'result-chunk');
      offset += n;
    }
  } finally {
    fs.closeSync(fd);
  }
  const end = await fetch(`${base}/result-end`, { method: 'POST', headers: authHeaders(secret, workerId) });
  await assertWorkerOk(end, 'result-end');
}

async function heartbeat(hub, secret, workerId) {
  const res = await fetch(`${hub}/api/recorder/heartbeat`, {
    method: 'POST',
    headers: authHeaders(secret, workerId),
  });
  await assertWorkerOk(res, 'heartbeat');
  return true;
}

async function main() {
  const hub = loadHub();
  ensureConfigDir();
  fs.writeFileSync(path.join(configDir(), 'hub-url'), `${hub}\n`, { mode: 0o600 });
  const secret = loadSecret();
  if (!argValue('--secret') && !(process.env.OGM_WORKER_SECRET || '').trim()) {
    // persist file copy so systemd/env-file installs keep working
    fs.writeFileSync(path.join(configDir(), 'worker-secret'), `${secret}\n`, { mode: 0o600 });
  }
  const workerId = loadWorkerId();
  const cookies = cookiesFile();

  if (hasFlag('--install-service')) {
    installService(hub);
    return;
  }

  let ok = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 20_000) {
    try {
      ok = await heartbeat(hub, secret, workerId);
      if (ok) break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err && typeof err === 'object' ? Number(err.status) || 0 : 0;
      if (status === 401 || status === 503 || /HTTP 401|HTTP 503/.test(message)) fail(message);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ok) {
    fail(`Could not connect to ${hub}. Check OGM_HUB_URL and that OGM_WORKER_SECRET matches Render.`);
  }
  console.log(`Recorder online, connected to ${hub}`);

  for (;;) {
    try {
      const job = await claim(hub, secret, workerId);
      if (!job) continue;
      console.log(`[recorder] job ${job.id} ${job.format} ${job.url}`);
      await postJson(hub, secret, workerId, `/api/recorder/jobs/${job.id}/progress`, {
        stage: 'extract',
        percent: 12,
        message: 'Fetching on this machine…',
      });
      let recorded;
      try {
        recorded = await recordJob(job, cookies, async (p) => {
          try {
            await postJson(hub, secret, workerId, `/api/recorder/jobs/${job.id}/progress`, p);
          } catch {
            // keep converting even if a progress ping fails
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          err && typeof err === 'object' && err.code === 'FILE_TOO_LARGE'
            ? 'FILE_TOO_LARGE'
            : /too long for|too large/i.test(message)
              ? 'FILE_TOO_LARGE'
              : /LOGIN_REQUIRED|sign in/i.test(message)
                ? 'YOUTUBE_BOT_CHECK'
                : 'EXTRACTION_FAILED';
        console.error(`[recorder] fail: ${message}`);
        await postJson(hub, secret, workerId, `/api/recorder/jobs/${job.id}/fail`, {
          error: message,
          code,
        });
        continue;
      }
      try {
        await postJson(hub, secret, workerId, `/api/recorder/jobs/${job.id}/progress`, {
          stage: 'save',
          percent: 92,
          message: 'Uploading…',
        });
        await uploadResult(
          hub,
          secret,
          workerId,
          job.id,
          recorded.outputFilePath,
          recorded.spec,
          recorded.title,
          recorded.artist,
          recorded.ytId
        );
        console.log(`[recorder] uploaded ${recorded.title}.${recorded.spec.extension}`);
      } finally {
        try {
          fs.rmSync(recorded.workDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err && typeof err === 'object' ? Number(err.status) || 0 : 0;
      if (status === 401 || status === 503 || /HTTP 401|HTTP 503/.test(message)) fail(message);
      console.error(`[recorder] ${message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
