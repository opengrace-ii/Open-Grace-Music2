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
  const timeoutMs = opts.timeoutMs || 300_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
      if (opts.onOut) opts.onOut(d.toString());
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (opts.onOut) opts.onOut(d.toString());
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exit ${code}: ${(stderr || stdout).slice(-400)}`));
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

async function recordJob(job, cookies) {
  const spec = formatSpec(job.format, job.bitrate);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-home-'));
  const ytId = extractYouTubeId(job.url);
  let title = job.title || 'Open Grace Track';
  let artist = job.artist || 'Open Grace Music';
  try {
    let inputPath;
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
      await runCmd(ytdlpBin(), args, { timeoutMs: 300_000 });
      const got = reportedId(workDir);
      if (got && got.toLowerCase() !== ytId.toLowerCase()) {
        throw new Error(`Stream did not match this video (yt-dlp id ${got}, requested ${ytId}).`);
      }
      inputPath = pickRaw(workDir);
      if (!inputPath) throw new Error('Could not fetch an audio stream for this video.');
    } else {
      const normalized = /^https?:\/\//i.test(job.url) ? job.url : `https://${job.url}`;
      const res = await fetch(normalized);
      if (!res.ok) throw new Error(`Failed to fetch audio URL: HTTP ${res.status}`);
      inputPath = path.join(workDir, 'raw_direct_input');
      fs.writeFileSync(inputPath, Buffer.from(await res.arrayBuffer()));
    }
    const outputFilePath = path.join(workDir, `master_output.${spec.extension}`);
    await runCmd(
      ffmpegBin(),
      [
        '-y',
        '-i',
        inputPath,
        ...spec.ffmpegArgs,
        '-metadata',
        `title=${title}`,
        '-metadata',
        `artist=${artist}`,
        '-metadata',
        'album=Open Grace Music',
        outputFilePath,
      ],
      { timeoutMs: 240_000 }
    );
    if (!fs.existsSync(outputFilePath) || fs.statSync(outputFilePath).size < 1000) {
      throw new Error('FFmpeg transcoding produced an invalid output file.');
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

async function postJson(hub, secret, workerId, urlPath, body) {
  await fetch(`${hub}${urlPath}`, {
    method: 'POST',
    headers: { ...authHeaders(secret, workerId), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function claim(hub, secret, workerId) {
  const res = await fetch(`${hub}/api/recorder/claim?wait=20000`, {
    headers: authHeaders(secret, workerId),
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`claim failed HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const data = await res.json();
  return data.job || null;
}

async function uploadResult(hub, secret, workerId, jobId, filePath, spec, title, artist, ytId) {
  const bytes = fs.readFileSync(filePath);
  const headers = {
    ...authHeaders(secret, workerId),
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
  const res = await fetch(`${hub}/api/recorder/jobs/${encodeURIComponent(jobId)}/result`, {
    method: 'POST',
    headers,
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload failed HTTP ${res.status}`);
}

async function heartbeat(hub, secret, workerId) {
  const res = await fetch(`${hub}/api/recorder/heartbeat`, {
    method: 'POST',
    headers: authHeaders(secret, workerId),
  });
  return res.ok;
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
    ok = await heartbeat(hub, secret, workerId).catch(() => false);
    if (ok) break;
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
        percent: 20,
        message: 'Fetching on this machine…',
      });
      let recorded;
      try {
        recorded = await recordJob(job, cookies);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[recorder] fail: ${message}`);
        await postJson(hub, secret, workerId, `/api/recorder/jobs/${job.id}/fail`, {
          error: message,
          code: /LOGIN_REQUIRED|sign in/i.test(message) ? 'YOUTUBE_BOT_CHECK' : 'EXTRACTION_FAILED',
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
      console.error(`[recorder] ${message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
