import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { resolveFormatSpec } from './server/audioFormats.ts';
import {
  claimRecorderJob,
  configuredWorkerSecret,
  enqueueRecorderJob,
  failRecorderJob,
  getRecorderJob,
  noteWorkerHeartbeat,
  normalizeSecret,
  publicJobStatus,
  recorderPresence,
  storeRecorderResult,
  takeRecorderResult,
  updateRecorderProgress,
  workerSecretMatches,
} from './server/recorderJobs.ts';
import { browseYoutubeHome, searchYoutubeVideos } from './server/youtubeSearch.ts';
import { fetchYoutubeTranscript } from './server/youtubeTranscript.ts';
import {
  aiKeyStatus,
  listenNotesFromTranscript,
  parseRequestAiKeys,
  relatedNextQueries,
  transcribeForOgm,
  withRequestAiKeys,
} from './server/aiStudio.ts';

dotenv.config();

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 43123;

app.use(express.json({ limit: '10mb' }));

function ogmPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function ogmGitSha(): string {
  const env = (process.env.RENDER_GIT_COMMIT || process.env.OGM_GIT_SHA || process.env.SOURCE_VERSION || '').trim();
  if (env) return env.replace(/^v/, '').slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

app.get('/api/health', (_req, res) => {
  const ai = aiKeyStatus();
  const rec = recorderPresence();
  res.json({
    ok: true,
    service: 'ogm-converter',
    version: ogmPackageVersion(),
    git: ogmGitSha(),
    ai: { gemini: ai.gemini, nvidia: ai.nvidia },
    recorder: {
      online: rec.online,
      workers: rec.workers,
      secretConfigured: rec.secretConfigured,
    },
  });
});

app.get('/api/youtube/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const sort = String(req.query.sort || '').trim() === 'date' ? 'date' : 'relevance';
  try {
    const videos = q
      ? await searchYoutubeVideos(q, 24, { sort })
      : await browseYoutubeHome(24);
    res.json({ ok: true, query: q, sort: q ? sort : 'home', videos });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'YouTube catalog unavailable';
    res.status(502).json({ ok: false, error: message, videos: [] });
  }
});

/** Prevent cached index.html / SW; allow long cache on Vite content-hashed assets. */
app.use((req, res, next) => {
  const reqPath = req.path;
  if (reqPath === '/' || reqPath === '/index.html') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  } else if (reqPath === '/sw.js' || reqPath === '/manifest.webmanifest') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (/^\/assets\/[^/]+\.[a-zA-Z0-9_-]{8,}\.(js|css|mjs)$/i.test(reqPath)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
});

/** Let the PWA (same-origin or Settings override) read real container/codec headers. */
const AUDIO_EXPOSE_HEADERS = [
  'Content-Type',
  'Content-Disposition',
  'Content-Length',
  'X-Audio-Id',
  'X-Audio-Title',
  'X-Audio-Artist',
  'X-Audio-Duration',
  'X-Audio-Format',
  'X-Audio-Extension',
  'X-Audio-Sample-Rate',
  'X-Audio-Bit-Depth',
  'X-Audio-Bitrate-Label',
  'X-Audio-Codec',
  'X-Audio-Container',
  'X-Audio-Source',
  'X-Audio-Thumbnail',
].join(', ');

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Ogm-Worker-Secret, X-Ogm-Worker-Id'
  );
  res.setHeader('Access-Control-Expose-Headers', AUDIO_EXPOSE_HEADERS);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Extract clean 11-character YouTube Video ID from any URL variant
export function extractYouTubeId(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();

  try {
    const normalized =
      !trimmed.startsWith('http://') && !trimmed.startsWith('https://')
        ? `https://${trimmed}`
        : trimmed;
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0]?.split('?')[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const vParam = parsed.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;

      for (const prefix of ['/shorts/', '/embed/', '/v/', '/live/']) {
        if (parsed.pathname.includes(prefix)) {
          const id = parsed.pathname.split(prefix)[1]?.split('/')[0]?.split('?')[0];
          if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
        }
      }
    }
  } catch {
    // Fallback regex below
  }

  const ytRegex =
    /(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|[?&]v=)([a-zA-Z0-9_-]{11})|^([a-zA-Z0-9_-]{11})$/i;
  const match = trimmed.match(ytRegex);
  return match ? match[1] || match[2] : null;
}

// Fetch official YouTube oEmbed metadata
async function fetchYouTubeOEmbed(ytId: string): Promise<{
  title: string;
  author: string;
  thumbnailUrl: string;
}> {
  const canonicalUrl = `https://www.youtube.com/watch?v=${ytId}`;
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
  let title = `YouTube Audio (${ytId})`;
  let author = 'Open Grace Music';
  let thumbnailUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;

  try {
    const resp = await fetch(oEmbedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.title) title = data.title;
      if (data.author_name) author = data.author_name;
      if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
    }
  } catch {
    // Use fallback title & thumbnail
  }

  return { title, author, thumbnailUrl };
}

export { resolveFormatSpec };

// API: Validate URL & Resolve Metadata (/api/validate-url and /api/media-info)
async function handleValidateUrl(req: express.Request, res: express.Response) {
  const url = ((req.query.url as string) || (req.body && req.body.url) || '').trim();
  if (!url) {
    return res.status(400).json({ valid: false, error: 'url parameter is required' });
  }

  try {
    const ytId = extractYouTubeId(url);
    if (ytId) {
      const { title, author, thumbnailUrl } = await fetchYouTubeOEmbed(ytId);
      return res.json({
        valid: true,
        id: ytId,
        videoId: ytId,
        isYouTube: true,
        canonicalUrl: `https://www.youtube.com/watch?v=${ytId}`,
        embedUrl: `https://www.youtube.com/embed/${ytId}`,
        title,
        author,
        thumbnailUrl,
        supportedFormats: [
          { id: 'FLAC', label: 'FLAC (24-bit / 96kHz Lossless)', ext: 'flac', badge: 'LOSSLESS STUDIO' },
          { id: 'ALAC', label: 'ALAC (24-bit Apple Lossless .m4a)', ext: 'm4a', badge: 'APPLE MASTER' },
          { id: 'DSD', label: 'DSD / Hi-Res (24-bit / 192kHz Master)', ext: 'wav', badge: 'AUDIOPHILE 192kHz' },
          { id: 'WAV', label: 'WAV (24-bit Uncompressed PCM)', ext: 'wav', badge: 'UNCOMPRESSED' },
          { id: 'MP3', label: 'MP3 (320 kbps CBR Master)', ext: 'mp3', badge: 'UNIVERSAL 320K' },
        ],
      });
    }

    // Validate Direct Audio URL
    const normalized = !url.startsWith('http://') && !url.startsWith('https://') ? `https://${url}` : url;
    const parsedUrl = new URL(normalized);
    let contentType = 'audio/mpeg';
    let contentLength = 0;

    try {
      const headResp = await fetch(normalized, { method: 'HEAD' });
      contentType = headResp.headers.get('content-type') || 'audio/mpeg';
      contentLength = parseInt(headResp.headers.get('content-length') || '0', 10);
    } catch {
      // Allow URL even if HEAD is not supported
    }

    const baseTitle =
      decodeURIComponent(path.basename(parsedUrl.pathname))
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim() || 'Direct Audio Stream';

    return res.json({
      valid: true,
      id: `direct_${Date.now()}`,
      isYouTube: false,
      canonicalUrl: normalized,
      contentType,
      contentLength,
      title: baseTitle,
      author: parsedUrl.hostname,
      thumbnailUrl: '',
      supportedFormats: [
        { id: 'FLAC', label: 'FLAC (24-bit / 96kHz Lossless)', ext: 'flac', badge: 'LOSSLESS STUDIO' },
        { id: 'ALAC', label: 'ALAC (24-bit Apple Lossless .m4a)', ext: 'm4a', badge: 'APPLE MASTER' },
        { id: 'DSD', label: 'DSD / Hi-Res (24-bit / 192kHz Master)', ext: 'wav', badge: 'AUDIOPHILE 192kHz' },
        { id: 'WAV', label: 'WAV (24-bit Uncompressed PCM)', ext: 'wav', badge: 'UNCOMPRESSED' },
        { id: 'MP3', label: 'MP3 (320 kbps CBR Master)', ext: 'mp3', badge: 'UNIVERSAL 320K' },
      ],
    });
  } catch (error: any) {
    return res.status(400).json({
      valid: false,
      error: error.message || 'Invalid URL provided',
    });
  }
}

app.get('/api/validate-url', handleValidateUrl);
app.post('/api/validate-url', handleValidateUrl);
app.get('/api/media-info', handleValidateUrl);

function workerSecretFromRequest(req: express.Request): string {
  const header = String(req.headers.authorization || '');
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1];
  const alt = String(req.headers['x-ogm-worker-secret'] || '');
  return normalizeSecret(bearer || alt);
}

function requireWorkerAuth(req: express.Request, res: express.Response): boolean {
  if (!configuredWorkerSecret()) {
    res.status(503).json({
      error: 'Recorder worker secret is not set on this host (OGM_WORKER_SECRET).',
      code: 'WORKER_SECRET_MISSING',
    });
    return false;
  }
  if (!workerSecretMatches(workerSecretFromRequest(req))) {
    res.status(401).json({ error: 'Invalid worker secret.', code: 'WORKER_UNAUTHORIZED' });
    return false;
  }
  return true;
}

function workerIdFromRequest(req: express.Request): string {
  const q = String(req.query.workerId || '');
  const bodyId =
    req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? String(req.body.workerId || '') : '';
  const header = String(req.headers['x-ogm-worker-id'] || '');
  return (header || bodyId || q || 'worker').replace(/[^\w.-]/g, '').slice(0, 64) || 'worker';
}

app.get('/api/recorder/presence', (_req, res) => {
  return res.json({ ok: true, ...recorderPresence() });
});

app.post('/api/recorder/heartbeat', (req, res) => {
  if (!requireWorkerAuth(req, res)) return;
  noteWorkerHeartbeat(workerIdFromRequest(req));
  return res.json({ ok: true, ...recorderPresence() });
});

app.post('/api/recorder/jobs', (req, res) => {
  if (!configuredWorkerSecret()) {
    return res.status(503).json({
      error: 'Hub secret isn’t set (OGM_WORKER_SECRET).',
      code: 'WORKER_SECRET_MISSING',
    });
  }
  const created = enqueueRecorderJob({
    url: String(req.body?.url || ''),
    format: String(req.body?.format || 'MP3'),
    bitrate: Number(req.body?.bitrate) || 320,
    title: String(req.body?.title || ''),
    artist: String(req.body?.artist || ''),
  });
  if (!created.ok) {
    return res.status(created.code === 'BUSY' ? 429 : 400).json({ error: created.error, code: created.code });
  }
  return res.json({ jobId: created.job.id, format: created.job.format });
});

app.get('/api/recorder/claim', async (req, res) => {
  if (!requireWorkerAuth(req, res)) return;
  const waitMs = Math.min(25_000, Math.max(0, parseInt(String(req.query.wait || '0'), 10) || 0));
  const job = await claimRecorderJob(workerIdFromRequest(req), waitMs);
  if (!job) return res.status(204).end();
  return res.json({
    job: {
      id: job.id,
      url: job.url,
      format: job.format,
      bitrate: job.bitrate,
      title: job.title,
      artist: job.artist,
    },
  });
});

app.post('/api/recorder/jobs/:jobId/progress', (req, res) => {
  if (!requireWorkerAuth(req, res)) return;
  const job = getRecorderJob(String(req.params.jobId || ''));
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  updateRecorderProgress(job, {
    stage: req.body?.stage,
    percent: req.body?.percent,
    message: req.body?.message,
  });
  return res.json({ ok: true, ...publicJobStatus(job) });
});

app.post('/api/recorder/jobs/:jobId/fail', (req, res) => {
  if (!requireWorkerAuth(req, res)) return;
  const job = getRecorderJob(String(req.params.jobId || ''));
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  failRecorderJob(job, String(req.body?.error || 'Recording failed'), String(req.body?.code || 'EXTRACTION_FAILED'));
  return res.json({ ok: true });
});

app.post(
  '/api/recorder/jobs/:jobId/result',
  express.raw({ type: () => true, limit: '80mb' }),
  (req, res) => {
    if (!requireWorkerAuth(req, res)) return;
    const job = getRecorderJob(String(req.params.jobId || ''));
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    const meta: Record<string, string> = {};
    for (const key of [
      'content-type',
      'x-audio-id',
      'x-audio-title',
      'x-audio-artist',
      'x-audio-duration',
      'x-audio-format',
      'x-audio-extension',
      'x-audio-sample-rate',
      'x-audio-bit-depth',
      'x-audio-bitrate-label',
      'x-audio-codec',
      'x-audio-container',
      'x-audio-source',
      'x-audio-thumbnail',
    ]) {
      const value = req.headers[key];
      if (typeof value === 'string' && value) {
        meta[key === 'content-type' ? 'Content-Type' : headerCanonical(key)] = value;
      }
    }
    if (!meta['Content-Type']) meta['Content-Type'] = 'application/octet-stream';
    const stored = storeRecorderResult(job, bytes, meta);
    if (!stored.ok) return res.status(400).json({ error: stored.error });
    return res.json({ ok: true });
  }
);

function headerCanonical(key: string): string {
  return key
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

app.get('/api/recorder/jobs/:jobId', (req, res) => {
  const job = getRecorderJob(String(req.params.jobId || ''));
  if (!job) {
    return res.status(404).json({ error: 'Recording job not found or expired', code: 'NOT_FOUND' });
  }
  return res.json(publicJobStatus(job));
});

app.get('/api/recorder/jobs/:jobId/file', (req, res) => {
  const job = getRecorderJob(String(req.params.jobId || ''));
  if (!job) {
    return res.status(404).json({ error: 'Recording job not found or expired' });
  }
  const taken = takeRecorderResult(job);
  if (!taken) {
    return res.status(404).json({ error: 'Recorded file not ready yet' });
  }
  const stat = fs.statSync(taken.path);
  for (const [key, value] of Object.entries(taken.meta)) {
    if (key !== 'Content-Type') res.setHeader(key, value);
  }
  const ext = taken.meta['X-Audio-Extension'] || 'bin';
  const titleHeader = taken.meta['X-Audio-Title'];
  const safeName = titleHeader ? decodeURIComponent(titleHeader) : 'OpenGraceMusic_Track';
  res.setHeader('Content-Type', taken.meta['Content-Type'] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size.toString());
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(safeName.replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'track')}.${ext}"`
  );
  const stream = fs.createReadStream(taken.path);
  const cleanup = () => {
    try {
      fs.rmSync(path.dirname(taken.path), { recursive: true, force: true });
    } catch {
      // ignore
    }
  };
  stream.on('close', cleanup);
  stream.on('error', cleanup);
  return stream.pipe(res);
});

const CONVERT_GONE = {
  error: 'This host does not download YouTube. Use the APK on a phone, or a recorder worker.',
  code: 'RECORDER_REQUIRED',
};

app.post('/api/convert-audio/start', (_req, res) => res.status(410).json(CONVERT_GONE));
app.get('/api/convert-audio/job/:jobId', (_req, res) => res.status(410).json(CONVERT_GONE));
app.get('/api/convert-audio/job/:jobId/download', (_req, res) => res.status(410).json(CONVERT_GONE));
app.get('/api/convert-audio/job/:jobId/events', (_req, res) => res.status(410).json(CONVERT_GONE));
app.post('/api/convert-audio', (_req, res) => res.status(410).json(CONVERT_GONE));
app.get('/api/convert-audio', (_req, res) => res.status(410).json(CONVERT_GONE));
app.post('/api/convert-mp3', (_req, res) => res.status(410).json(CONVERT_GONE));
app.get('/api/convert-mp3', (_req, res) => res.status(410).json(CONVERT_GONE));

// API: Transcode already-downloaded audio bytes (no YouTube access, so no bot-check).
// Used by the Android APK after its on-device download to produce FLAC/ALAC/WAV/MP3.
const TRANSCODE_SPECS: Record<string, { ext: string; mime: string; args: string[] }> = {
  FLAC: { ext: 'flac', mime: 'audio/flac', args: ['-vn', '-c:a', 'flac', '-compression_level', '8'] },
  ALAC: { ext: 'm4a', mime: 'audio/mp4', args: ['-vn', '-c:a', 'alac'] },
  WAV: { ext: 'wav', mime: 'audio/wav', args: ['-vn', '-c:a', 'pcm_s16le'] },
  MP3: { ext: 'mp3', mime: 'audio/mpeg', args: ['-vn', '-c:a', 'libmp3lame', '-b:a', '320k'] },
};

app.post(
  '/api/transcode',
  express.raw({ type: () => true, limit: '80mb' }),
  async (req, res) => {
    const fmt = String(req.query.format || '').toUpperCase();
    const spec = TRANSCODE_SPECS[fmt];
    if (!spec) {
      return res.status(400).json({ error: `Unsupported transcode format: ${fmt || '(none)'}` });
    }
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 20_000) {
      return res.status(400).json({ error: 'Audio upload was empty or too small.' });
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-transcode-'));
    const inPath = path.join(dir, 'input.bin');
    const outPath = path.join(dir, `output.${spec.ext}`);
    const cleanup = () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    };
    try {
      fs.writeFileSync(inPath, body);
      await execFileAsync('/usr/bin/ffmpeg', ['-y', '-i', inPath, ...spec.args, outPath], {
        timeout: 4 * 60_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const stat = fs.statSync(outPath);
      if (stat.size < 1000) throw new Error('FFmpeg produced an empty file.');
      res.setHeader('Content-Type', spec.mime);
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader('X-Audio-Format', fmt);
      res.setHeader('X-Audio-Extension', spec.ext);
      const stream = fs.createReadStream(outPath);
      stream.on('close', cleanup);
      stream.on('error', cleanup);
      return stream.pipe(res);
    } catch (err) {
      cleanup();
      console.error('[transcode] failed:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Server could not transcode the uploaded audio.' });
    }
  }
);

app.get('/api/ai/status', (_req, res) => {
  res.json({ ok: true, ...aiKeyStatus() });
});

app.post('/api/ai/config', (req, res) => {
  const parsed = parseRequestAiKeys(req.body);
  res.json({ ok: true, ...aiKeyStatus(parsed) });
});

app.post('/api/ai/transcribe', async (req, res) => {
  return withRequestAiKeys(req.body, async () => {
    const videoId = String(req.body?.videoId || req.body?.ytVideoId || '').trim();
    const audioUrl = String(req.body?.audioUrl || '').trim();
    const title = String(req.body?.title || '').trim();
    const cookies = String(req.body?.cookies || '').replace(/[\r\n\0]/g, '').trim();
    const youtubeOauthRefresh = String(req.body?.youtubeOauth || req.body?.youtubeOauthRefresh || '').trim();
    try {
      const result = await transcribeForOgm({ videoId, audioUrl, title, cookies, youtubeOauthRefresh });
      const status = result.ok ? 200 : result.keysMissing ? 503 : 422;
      return res.status(status).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transcription failed';
      return res.status(500).json({ ok: false, error: message });
    }
  });
});

app.post('/api/ai/listen-notes', async (req, res) => {
  return withRequestAiKeys(req.body, async () => {
    const transcript = String(req.body?.transcript || '').trim();
    const title = String(req.body?.title || '').trim();
    try {
      const result = await listenNotesFromTranscript(transcript, title);
      const status = result.ok ? 200 : result.keysMissing ? 503 : 422;
      return res.status(status).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Listen notes failed';
      return res.status(500).json({ ok: false, error: message });
    }
  });
});

app.post('/api/ai/related-next', async (req, res) => {
  return withRequestAiKeys(req.body, async () => {
    const query = String(req.body?.query || '').trim();
    const title = String(req.body?.title || '').trim();
    const transcript = String(req.body?.transcript || '').trim();
    try {
      const result = await relatedNextQueries({ query, title, transcript });
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Related next failed';
      return res.status(500).json({ ok: false, queries: [], error: message });
    }
  });
});

app.get('/api/transcript', async (req, res) => {
  const videoId = String(req.query.videoId || req.query.v || '').trim();
  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required', found: false });
  }
  try {
    const result = await fetchYoutubeTranscript(videoId);
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Transcript lookup failed';
    return res.status(500).json({ found: false, error: message });
  }
});

app.get('/api/lyrics/search', async (req, res) => {
  const track = String(req.query.track || req.query.track_name || '').trim();
  const artist = String(req.query.artist || req.query.artist_name || '').trim();
  if (!track) {
    return res.status(400).json({ error: 'track is required' });
  }
  try {
    const params = new URLSearchParams({ track_name: track });
    if (artist) params.set('artist_name', artist);
    const lrclibRes = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      headers: { 'User-Agent': 'OpenGraceMusic/1.0 (lyrics lookup)' },
    });
    if (!lrclibRes.ok) {
      return res.status(502).json({ error: 'Lyrics provider unavailable', results: [] });
    }
    const results = (await lrclibRes.json()) as Array<{
      trackName?: string;
      artistName?: string;
      plainLyrics?: string;
      syncedLyrics?: string;
      instrumental?: boolean;
    }>;
    const match =
      results.find(
        (r) =>
          r.plainLyrics &&
          r.trackName &&
          r.trackName.toLowerCase().includes(track.toLowerCase().slice(0, 12))
      ) || results.find((r) => r.plainLyrics);

    if (!match?.plainLyrics) {
      return res.json({ found: false, results: [] });
    }

    return res.json({
      found: true,
      title: match.trackName || track,
      artist: match.artistName || artist || 'Unknown Artist',
      content: match.plainLyrics,
      syncedLyrics: match.syncedLyrics || null,
      instrumental: !!match.instrumental,
      source: 'lrclib.net',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lyrics search failed';
    return res.status(500).json({ error: message, found: false });
  }
});

const APK_FILENAME = 'OpenGraceMusic.apk';

function resolveApkPath(): string | null {
  const publicApk = path.join(__dirname, 'public', APK_FILENAME);
  if (fs.existsSync(publicApk)) return publicApk;
  const debugApk = path.join(__dirname, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (fs.existsSync(debugApk)) return debugApk;
  return null;
}

function resolvePublicAsset(name: string): string | null {
  const publicPath = path.join(__dirname, 'public', name);
  if (fs.existsSync(publicPath)) return publicPath;
  const distPath = path.join(__dirname, 'dist', name);
  if (fs.existsSync(distPath)) return distPath;
  return null;
}

function sendApkDownload(_req: express.Request, res: express.Response) {
  const apkPath = resolveApkPath();
  if (!apkPath) {
    return res.status(404).json({ error: 'APK file not found. Run ./gradlew assembleDebug.' });
  }
  const stat = fs.statSync(apkPath);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${APK_FILENAME}"`);
  res.setHeader('Content-Length', String(stat.size));
  return res.sendFile(apkPath);
}

app.get('/OpenGraceMusic.apk', sendApkDownload);
app.get('/download/apk', sendApkDownload);

app.get('/download', (_req, res) => {
  const htmlPath = resolvePublicAsset('download.html');
  if (!htmlPath) {
    return res.status(404).send('Download page not found.');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(htmlPath);
});

app.get('/OpenGraceMusic-Android.zip', (_req, res) => {
  const zipPath = path.join(__dirname, 'public', 'OpenGraceMusic-Android.zip');
  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="OpenGraceMusic-Android.zip"');
    return res.sendFile(zipPath);
  }
  return res.status(404).json({ error: 'Android project ZIP not found.' });
});

// API: Audio proxy for external direct audio streams
app.get('/api/proxy-audio', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send('url parameter is required');
  }

  try {
    const fetchHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const upstream = await fetch(targetUrl, { headers: fetchHeaders });

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    const contentRange = upstream.headers.get('content-range');
    const contentLength = upstream.headers.get('content-length');
    const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    if (upstream.body) {
      const reader = upstream.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch {
          res.end();
        }
      };
      pump();
    } else {
      res.end();
    }
  } catch (error: any) {
    res.status(502).send(`Proxy error: ${error.message}`);
  }
});

// API: Generate Lyrics & Chord Sheet with Gemini API
app.post('/api/generate-lyrics', async (req, res) => {
  return withRequestAiKeys(req.body, async () => {
  const { title, artist } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const apiKey = parseRequestAiKeys(req.body).gemini || (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are the lead musical transcriber for Open Grace Music.
Generate a structured musical guide for the track: "${title}" by artist: "${artist || 'Open Grace Music'}".

Determine whether the piece is vocal or instrumental.
Provide output in plain text formatted exactly with:
- Title, Artist, Key, BPM, Time signature
- Either [Intro], [Verse], [Chorus], [Bridge], [Outro] with song lyrics OR Instrument Chord Sheet with chord chart notation (| C - G - Am - F |).
Make it warm, uplifting, poetic, and musically authentic.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const content = response.text || '';
    const isInstrumental =
      /instrumental|chord sheet|chords/i.test(content) ||
      /instrumental|ambient|lofi|piano/i.test(title);

    res.json({
      title,
      artist: artist || 'Open Grace Music',
      isInstrumental,
      content,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gemini lyric generation failed' });
  }
  });
});

// Dev server with Vite middleware or static production serve
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(path.join(__dirname, 'dist'), {
        setHeaders(res, filePath) {
          const base = path.basename(filePath);
          if (base === 'index.html') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
          } else if (/\.[a-zA-Z0-9_-]{8,}\.(js|css|mjs)$/i.test(base)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (base === 'sw.js' || base === 'manifest.webmanifest') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Open Grace Music server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
