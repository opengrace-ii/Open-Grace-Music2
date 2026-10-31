import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { runConvertPipeline } from './server/convertPipeline.ts';
import { browseYoutubeHome, searchYoutubeVideos } from './server/youtubeSearch.ts';
import { fetchYoutubeTranscript } from './server/youtubeTranscript.ts';

dotenv.config();

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 43123;

app.use(express.json({ limit: '10mb' }));

const YT_DLP_TIMEOUT_MS = 120_000;
const YT_DLP_MP3_TIMEOUT_MS = 90_000;
const FFMPEG_TIMEOUT_MS = 120_000;
const FFMPEG_MP3_TIMEOUT_MS = 90_000;

type ConvertStage = 'validate' | 'extract' | 'ffmpeg' | 'save' | 'done' | 'error';

interface ConvertJobRecord {
  id: string;
  stage: ConvertStage;
  percent: number;
  message: string;
  error?: string;
  code?: ConvertErrorCode;
  resultPath?: string;
  workDir?: string;
  responseMeta?: Record<string, string>;
  createdAt: number;
}

const convertJobs = new Map<string, ConvertJobRecord>();

function pruneOldConvertJobs() {
  const cutoff = Date.now() - 45 * 60 * 1000;
  for (const [id, job] of convertJobs) {
    if (job.createdAt < cutoff) {
      if (job.workDir) {
        try {
          fs.rmSync(job.workDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
      convertJobs.delete(id);
    }
  }
}

function newConvertJobId(): string {
  return `cj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

type ConvertErrorCode = 'YOUTUBE_BOT_CHECK' | 'TIMEOUT' | 'FFMPEG_FAILED' | 'EXTRACTION_FAILED';

function pipelineErrorText(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { message?: string; stderr?: string | Buffer };
  const stderr = e.stderr ? String(e.stderr) : '';
  return [stderr, e.message].filter(Boolean).join(' ').trim();
}

function classifyPipelineError(
  err: unknown,
  phase: 'extract' | 'ffmpeg'
): { code: ConvertErrorCode; error: string } {
  const raw = pipelineErrorText(err);
  const lower = raw.toLowerCase();
  const killed = !!(err && typeof err === 'object' && (err as { killed?: boolean }).killed);

  if (killed || lower.includes('timed out') || lower.includes('etimedout')) {
    return {
      code: 'TIMEOUT',
      error: 'Conversion timed out after 2 minutes. Try MP3 on Wi‑Fi or retry shortly.',
    };
  }
  if (/sign in to confirm|not a bot|http error 429|http error 403|cookies are needed/i.test(lower)) {
    return {
      code: 'YOUTUBE_BOT_CHECK',
      error:
        'YouTube blocked download for this exact video. OGM never substitutes a different song — tap the key icon, paste youtube.com cookies from your browser, and record again.',
    };
  }
  if (phase === 'ffmpeg') {
    return {
      code: 'FFMPEG_FAILED',
      error: `Audio mastering failed: ${raw.slice(0, 200) || 'FFmpeg error'}`,
    };
  }
  return {
    code: 'EXTRACTION_FAILED',
    error: raw.slice(0, 220) || 'Could not extract an audio stream for this link.',
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ogm-converter' });
});

app.get('/api/youtube/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  try {
    const videos = q ? await searchYoutubeVideos(q, 24) : await browseYoutubeHome(24);
    res.json({ ok: true, query: q, videos });
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

// Build clean search queries for SoundCloud exact-song fallback when YouTube blocks datacenter IP
function buildSearchQueries(rawTitle: string, rawAuthor: string): string[] {
  const cleanTitle = rawTitle
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\|.*$/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(
      /\b(?:official\s+music\s+video|official\s+video|official\s+audio|lyric\s+video|4k|hd|hq|long\s+version)\b/gi,
      ' '
    )
    .replace(/[-–—|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanAuthor = rawAuthor
    .replace(/\b(?:official|vevo|music|media|records|channel|tv|topic)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const songPart = rawTitle
    .split(/[-–—|]/)[1]
    ?.replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const queries: string[] = [];
  const add = (q: string) => {
    const trimmed = q.replace(/\s+/g, ' ').trim();
    if (trimmed.length >= 8 && !queries.includes(trimmed)) queries.push(trimmed);
  };

  if (cleanAuthor && songPart) add(`${cleanAuthor} ${songPart}`);
  if (cleanTitle) add(cleanTitle);
  if (cleanAuthor && cleanTitle) add(`${cleanAuthor} ${cleanTitle}`);
  if (songPart) add(songPart);

  return queries.length > 0 ? queries : [rawTitle.replace(/\s+/g, ' ').trim()];
}

export interface AudioFormatSpec {
  format: 'FLAC' | 'ALAC' | 'DSD' | 'WAV' | 'MP3';
  extension: string;
  mimeType: string;
  sampleRate: number;
  bitDepth: string;
  bitrateLabel: string;
  ffmpegArgs: string[];
}

export function resolveFormatSpec(rawFormat?: string, rawBitrate?: number): AudioFormatSpec {
  const fmt = (rawFormat || 'MP3').toUpperCase().trim();
  const mp3Bitrate =
    rawBitrate && [128, 192, 256, 320].includes(Number(rawBitrate)) ? Number(rawBitrate) : 320;

  switch (fmt) {
    case 'FLAC':
      return {
        format: 'FLAC',
        extension: 'flac',
        mimeType: 'audio/flac',
        sampleRate: 96000,
        bitDepth: '24-bit',
        bitrateLabel: '24-bit / 96 kHz Lossless (~2300 kbps)',
        ffmpegArgs: ['-vn', '-c:a', 'flac', '-sample_fmt', 's32', '-ar', '96000', '-compression_level', '8'],
      };
    case 'ALAC':
      return {
        format: 'ALAC',
        extension: 'm4a',
        mimeType: 'audio/mp4',
        sampleRate: 96000,
        bitDepth: '24-bit',
        bitrateLabel: '24-bit / 96 kHz Apple Lossless ALAC',
        ffmpegArgs: ['-vn', '-c:a', 'alac', '-sample_fmt', 's32p', '-ar', '96000'],
      };
    case 'DSD':
    case 'DSF':
      return {
        format: 'DSD',
        extension: 'wav',
        mimeType: 'audio/wav',
        sampleRate: 192000,
        bitDepth: '24-bit',
        bitrateLabel: '24-bit / 192 kHz Hi-Res Master DSD/PCM',
        ffmpegArgs: ['-vn', '-c:a', 'pcm_s24le', '-ar', '192000'],
      };
    case 'WAV':
      return {
        format: 'WAV',
        extension: 'wav',
        mimeType: 'audio/wav',
        sampleRate: 48000,
        bitDepth: '24-bit',
        bitrateLabel: '24-bit / 48 kHz Uncompressed PCM',
        ffmpegArgs: ['-vn', '-c:a', 'pcm_s24le', '-ar', '48000'],
      };
    case 'MP3':
    default:
      return {
        format: 'MP3',
        extension: 'mp3',
        mimeType: 'audio/mpeg',
        sampleRate: 48000,
        bitDepth: '16-bit',
        bitrateLabel: `${mp3Bitrate} kbps CBR Master`,
        ffmpegArgs: ['-vn', '-c:a', 'libmp3lame', '-b:a', `${mp3Bitrate}k`, '-ar', '48000'],
      };
  }
}

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

function parseConvertRequest(req: express.Request) {
  const url = ((req.body && req.body.url) || (req.query.url as string) || '').trim();
  const requestedFormat =
    (req.body && req.body.format) ||
    (req.query.format as string) ||
    (req.path.includes('convert-mp3') ? 'MP3' : 'MP3');
  const requestedBitrate = Number((req.body && req.body.bitrate) || req.query.bitrate || 320);
  const userCookies = ((req.body && req.body.cookies) || (req.query.cookies as string) || '').trim();
  const customTitle = ((req.body && req.body.title) || (req.query.title as string) || '').trim();
  const customArtist = ((req.body && req.body.artist) || (req.query.artist as string) || '').trim();
  return { url, requestedFormat, requestedBitrate, userCookies, customTitle, customArtist };
}

function pipelineParamsFromRequest(req: express.Request) {
  const parsed = parseConvertRequest(req);
  const formatSpec = resolveFormatSpec(parsed.requestedFormat, parsed.requestedBitrate);
  return {
    ...parsed,
    formatSpec,
    pipelineParams: {
      url: parsed.url,
      formatSpec,
      requestedBitrate: parsed.requestedBitrate,
      userCookies: parsed.userCookies,
      customTitle: parsed.customTitle,
      customArtist: parsed.customArtist,
      extractYouTubeId,
      fetchYouTubeOEmbed,
      buildSearchQueries,
      ytDlpTimeoutMs: YT_DLP_TIMEOUT_MS,
      ytDlpMp3TimeoutMs: YT_DLP_MP3_TIMEOUT_MS,
      ffmpegTimeoutMs: FFMPEG_TIMEOUT_MS,
      ffmpegMp3TimeoutMs: FFMPEG_MP3_TIMEOUT_MS,
    },
  };
}

function streamConvertResult(
  res: express.Response,
  result: Awaited<ReturnType<typeof runConvertPipeline>>,
  formatSpec: ReturnType<typeof resolveFormatSpec>
) {
  if (!result.ok) {
    try {
      fs.rmSync(result.workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    const status = result.code === 'EXTRACTION_FAILED' ? 502 : 500;
    return res.status(status).json({ error: result.error, code: result.code });
  }

  const stat = fs.statSync(result.outputFilePath);
  const cleanup = () => {
    try {
      fs.rmSync(result.workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  for (const [key, value] of Object.entries(result.responseMeta)) {
    if (key !== 'Content-Type') {
      res.setHeader(key, value);
    }
  }
  res.setHeader('Content-Type', formatSpec.mimeType);
  res.setHeader('Content-Length', stat.size.toString());
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(result.safeFilename)}.${formatSpec.extension}"`
  );

  const readStream = fs.createReadStream(result.outputFilePath);
  readStream.on('close', cleanup);
  readStream.on('error', cleanup);
  return readStream.pipe(res);
}

// API: Audiophile Lossless & Hi-Res Audio Extractor & Transcoder (/api/convert-audio and /api/convert-mp3)
async function handleConvertAudio(req: express.Request, res: express.Response) {
  const { url, formatSpec, pipelineParams } = pipelineParamsFromRequest(req);
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  const result = await runConvertPipeline(pipelineParams);
  if (!result.ok) {
    console.error('[convert-audio] Failed:', result.error);
  }
  return streamConvertResult(res, result, formatSpec);
}

async function handleConvertAudioStart(req: express.Request, res: express.Response) {
  pruneOldConvertJobs();
  const { url, formatSpec, pipelineParams } = pipelineParamsFromRequest(req);
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  const jobId = newConvertJobId();
  const job: ConvertJobRecord = {
    id: jobId,
    stage: 'validate',
    percent: 5,
    message: 'Queued for studio conversion…',
    createdAt: Date.now(),
  };
  convertJobs.set(jobId, job);

  res.json({ jobId, format: formatSpec.format });

  void (async () => {
    const result = await runConvertPipeline(pipelineParams, (stage, percent, message) => {
      const current = convertJobs.get(jobId);
      if (!current || current.stage === 'done' || current.stage === 'error') return;
      current.stage = stage;
      current.percent = percent;
      current.message = message;
      convertJobs.set(jobId, current);
    });

    const current = convertJobs.get(jobId);
    if (!current) return;

    if (!result.ok) {
      current.stage = 'error';
      current.percent = 100;
      current.message = result.error;
      current.error = result.error;
      current.code = result.code;
      current.workDir = result.workDir;
      convertJobs.set(jobId, current);
      try {
        fs.rmSync(result.workDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      return;
    }

    current.stage = 'done';
    current.percent = 100;
    current.message = 'Conversion complete — ready to download';
    current.resultPath = result.outputFilePath;
    current.workDir = result.workDir;
    current.responseMeta = result.responseMeta;
    convertJobs.set(jobId, current);
  })();
}

function handleConvertJobStatus(req: express.Request, res: express.Response) {
  const jobId = String(req.params.jobId || '');
  const job = convertJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Conversion job not found or expired' });
  }
  return res.json({
    jobId: job.id,
    stage: job.stage,
    percent: job.percent,
    message: job.message,
    done: job.stage === 'done',
    error: job.error,
    code: job.code,
  });
}

function handleConvertJobDownload(req: express.Request, res: express.Response) {
  const jobId = String(req.params.jobId || '');
  const job = convertJobs.get(jobId);
  if (!job || job.stage !== 'done' || !job.resultPath || !job.workDir) {
    return res.status(404).json({ error: 'Converted file not ready yet' });
  }

  const stat = fs.statSync(job.resultPath);
  const cleanup = () => {
    convertJobs.delete(jobId);
    try {
      fs.rmSync(job.workDir!, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  if (job.responseMeta) {
    for (const [key, value] of Object.entries(job.responseMeta)) {
      if (key !== 'Content-Type') {
        res.setHeader(key, value);
      }
    }
  }
  const ext = job.responseMeta?.['X-Audio-Extension'] || 'mp3';
  const titleHeader = job.responseMeta?.['X-Audio-Title'];
  const safeName = titleHeader ? decodeURIComponent(titleHeader) : 'OpenGraceMusic_Track';
  res.setHeader('Content-Type', job.responseMeta?.['Content-Type'] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size.toString());
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(safeName.replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'track')}.${ext}"`
  );

  const readStream = fs.createReadStream(job.resultPath);
  readStream.on('close', cleanup);
  readStream.on('error', cleanup);
  return readStream.pipe(res);
}

function handleConvertJobEvents(req: express.Request, res: express.Response) {
  const jobId = String(req.params.jobId || '');
  const job = convertJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Conversion job not found or expired' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = () => {
    const current = convertJobs.get(jobId);
    if (!current) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'job expired' })}\n\n`);
      res.end();
      return;
    }
    res.write(
      `event: progress\ndata: ${JSON.stringify({
        stage: current.stage,
        percent: current.percent,
        message: current.message,
        done: current.stage === 'done',
        error: current.error,
        code: current.code,
      })}\n\n`
    );
    if (current.stage === 'done' || current.stage === 'error') {
      clearInterval(timer);
      res.end();
    }
  };

  send();
  const timer = setInterval(send, 2000);
  req.on('close', () => clearInterval(timer));
}

app.post('/api/convert-audio/start', handleConvertAudioStart);
app.get('/api/convert-audio/job/:jobId', handleConvertJobStatus);
app.get('/api/convert-audio/job/:jobId/download', handleConvertJobDownload);
app.get('/api/convert-audio/job/:jobId/events', handleConvertJobEvents);

app.post('/api/convert-audio', handleConvertAudio);
app.get('/api/convert-audio', handleConvertAudio);
app.post('/api/convert-mp3', handleConvertAudio);
app.get('/api/convert-mp3', handleConvertAudio);

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
  const { title, artist } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const ai = new GoogleGenAI();
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
