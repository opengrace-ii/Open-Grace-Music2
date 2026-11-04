import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  describeYoutubeIdMatch,
  inspectInfoJson,
  matchExtractedYoutubeId,
  type YoutubeIdMatchResult,
} from './youtubeIdMatch.ts';
import { resolveFormatSpec, type AudioFormatSpec } from './audioFormats.ts';
import {
  parseYtDlpDownloadPercent,
  runYtDlpWatched,
  YtDlpWatchdogError,
} from './ytDlpWatchdog.ts';

const execFileAsync = promisify(execFile);

export type ConvertErrorCode = 'YOUTUBE_BOT_CHECK' | 'TIMEOUT' | 'FFMPEG_FAILED' | 'EXTRACTION_FAILED';
export type ConvertStage = 'validate' | 'extract' | 'ffmpeg' | 'save' | 'done' | 'error';
export type ProgressEmitter = (stage: ConvertStage, percent: number, message: string) => void;

export const YOUTUBE_LOGIN_REQUIRED_ERROR = 'YouTube asked for a login (LOGIN_REQUIRED).';

export { resolveFormatSpec, type AudioFormatSpec };

function whichBin(envName: string, fallbacks: string[]): string {
  const fromEnv = (process.env[envName] || '').trim();
  if (fromEnv) return fromEnv;
  return fallbacks[0];
}

export function ffmpegBin(): string {
  return whichBin('OGM_FFMPEG', ['ffmpeg', '/usr/bin/ffmpeg']);
}

export function ytDlpBin(): string {
  return whichBin('OGM_YTDLP', ['yt-dlp', '/usr/local/bin/yt-dlp']);
}

function pickRawSourceFile(workDir: string): string | null {
  const files = fs.readdirSync(workDir).filter((f) => f.startsWith('raw_source.'));
  for (const f of files) {
    const candidate = path.join(workDir, f);
    try {
      if (fs.statSync(candidate).size > 1000) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function inspectExtractedSidecars(workDir: string, expectedYtId: string): YoutubeIdMatchResult {
  const infoFiles = fs.readdirSync(workDir).filter((f) => f.endsWith('.info.json'));
  let last: YoutubeIdMatchResult = {
    kind: 'empty',
    reportedId: null,
    extractorKey: null,
    extractor: null,
  };
  for (const f of infoFiles) {
    try {
      const inspect = inspectInfoJson(JSON.parse(fs.readFileSync(path.join(workDir, f), 'utf8')));
      const result = matchExtractedYoutubeId(inspect.reportedId, expectedYtId, inspect);
      if (result.kind === 'match') return result;
      if (result.kind === 'mismatch') last = result;
      else if (last.kind !== 'mismatch') last = result;
    } catch {
      // ignore malformed sidecar
    }
  }
  return last;
}

type ExtractAttempt =
  | { status: 'ok'; path: string; match: YoutubeIdMatchResult }
  | { status: 'mismatch'; match: YoutubeIdMatchResult }
  | { status: 'no-file'; match: YoutubeIdMatchResult };

function evaluateExtractedDownload(workDir: string, expectedYtId: string): ExtractAttempt {
  const match = inspectExtractedSidecars(workDir, expectedYtId);
  console.log(`[pc-recorder] yt-dlp ${describeYoutubeIdMatch(expectedYtId, match)}`);
  const picked = pickRawSourceFile(workDir);
  if (match.kind === 'mismatch') {
    return { status: 'mismatch', match };
  }
  if (picked) return { status: 'ok', path: picked, match };
  return { status: 'no-file', match };
}

async function probeMasterFile(filePath: string): Promise<{
  durationSec: number;
  codecName: string;
  formatName: string;
  sampleRate: number;
}> {
  let durationSec = 0;
  let codecName = '';
  let formatName = '';
  let sampleRate = 0;
  try {
    const { stdout } = await execFileAsync(ffmpegBin().replace(/ffmpeg$/, 'ffprobe').replace(/ffmpeg.exe$/, 'ffprobe.exe'), [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name:stream=codec_name,sample_rate',
      '-select_streams',
      'a:0',
      '-of',
      'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string; format_name?: string };
      streams?: Array<{ codec_name?: string; sample_rate?: string }>;
    };
    durationSec = Math.round(parseFloat(parsed.format?.duration || '0') || 0);
    formatName = (parsed.format?.format_name || '').toLowerCase();
    const stream = parsed.streams?.[0];
    codecName = (stream?.codec_name || '').toLowerCase();
    sampleRate = parseInt(stream?.sample_rate || '0', 10) || 0;
  } catch {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration,format_name:stream=codec_name,sample_rate',
        '-select_streams',
        'a:0',
        '-of',
        'json',
        filePath,
      ]);
      const parsed = JSON.parse(stdout) as {
        format?: { duration?: string; format_name?: string };
        streams?: Array<{ codec_name?: string; sample_rate?: string }>;
      };
      durationSec = Math.round(parseFloat(parsed.format?.duration || '0') || 0);
      formatName = (parsed.format?.format_name || '').toLowerCase();
      const stream = parsed.streams?.[0];
      codecName = (stream?.codec_name || '').toLowerCase();
      sampleRate = parseInt(stream?.sample_rate || '0', 10) || 0;
    } catch {
      // empty probe
    }
  }
  return { durationSec, codecName, formatName, sampleRate };
}

function codecMatchesRequestedFormat(
  requested: AudioFormatSpec['format'],
  codecName: string,
  formatName: string
): boolean {
  const codec = codecName.toLowerCase();
  const container = formatName.toLowerCase();
  switch (requested) {
    case 'FLAC':
      return codec === 'flac' || container.split(',').includes('flac');
    case 'ALAC':
      return codec === 'alac';
    case 'WAV':
    case 'DSD':
      return codec.startsWith('pcm_') || container.split(',').includes('wav');
    case 'MP3':
      return codec === 'mp3' || container.split(',').includes('mp3');
    default:
      return false;
  }
}

function formatMismatchError(requested: string, codecName: string, formatName: string): string {
  const got = codecName || formatName || 'unknown';
  return `Requested ${requested} but FFmpeg wrote ${got}. Nothing was labeled as ${requested}.`;
}

function pipelineErrorText(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { message?: string; stderr?: string | Buffer; lastUsefulLine?: string };
  const stderr = e.stderr ? String(e.stderr) : '';
  const last = e.lastUsefulLine ? String(e.lastUsefulLine) : '';
  return [last, stderr, e.message].filter(Boolean).join(' ').trim();
}

function lastExtractLine(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const e = err as { lastUsefulLine?: string; stderr?: string | Buffer; message?: string };
  const last = (e.lastUsefulLine || '').trim();
  if (last) return last.slice(0, 180);
  const stderr = e.stderr ? String(e.stderr).trim() : '';
  if (stderr) {
    const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return (lines[lines.length - 1] || '').slice(0, 180);
  }
  return (e.message || '').slice(0, 180);
}

export function classifyPipelineError(
  err: unknown,
  phase: 'extract' | 'ffmpeg'
): { code: ConvertErrorCode; error: string } {
  const raw = pipelineErrorText(err);
  const lower = raw.toLowerCase();
  const stalled = !!(err && typeof err === 'object' && (err as { stalled?: boolean }).stalled);
  const timedOut = !!(err && typeof err === 'object' && (err as { timedOut?: boolean }).timedOut);
  const killed = !!(err && typeof err === 'object' && (err as { killed?: boolean }).killed);
  const lastLine = lastExtractLine(err);

  if (
    /login_required|sign in to confirm|please sign in|not a bot|http error 429|http error 403|cookies are needed|confirm your age/i.test(
      lower
    )
  ) {
    return {
      code: 'YOUTUBE_BOT_CHECK',
      error: YOUTUBE_LOGIN_REQUIRED_ERROR,
    };
  }
  if (stalled) {
    return {
      code: 'TIMEOUT',
      error: lastLine ? `YouTube extract stalled — ${lastLine}` : 'YouTube extract stalled (no yt-dlp progress).',
    };
  }
  if (killed || timedOut || lower.includes('timed out') || lower.includes('etimedout')) {
    if (phase === 'extract') {
      return {
        code: 'TIMEOUT',
        error: lastLine
          ? `YouTube extract timed out — ${lastLine}`
          : 'Recording timed out. Try MP3 320.',
      };
    }
    return { code: 'TIMEOUT', error: 'Recording timed out. Try MP3 320.' };
  }
  if (phase === 'ffmpeg') {
    return {
      code: 'FFMPEG_FAILED',
      error: `Audio mastering failed: ${raw.slice(0, 200) || 'FFmpeg error'}`,
    };
  }
  const technical = raw.slice(0, 400);
  if (/requested format is not available|no video formats|no audio formats/i.test(technical)) {
    return { code: 'EXTRACTION_FAILED', error: 'No playable audio stream for this video.' };
  }
  return {
    code: 'EXTRACTION_FAILED',
    error: (lastLine || technical).slice(0, 220) || 'Could not extract an audio stream for this link.',
  };
}

function cookieArgs(cookiesFile?: string): string[] {
  const file = (cookiesFile || '').trim();
  if (!file) return [];
  if (!fs.existsSync(file)) return [];
  return ['--cookies', file];
}

export interface HomeRecordParams {
  url: string;
  formatSpec: AudioFormatSpec;
  customTitle?: string;
  customArtist?: string;
  cookiesFile?: string;
  extractYouTubeId: (rawUrl: string) => string | null;
  fetchYouTubeOEmbed?: (ytId: string) => Promise<{ title?: string; author?: string; thumbnailUrl?: string }>;
  ytDlpTimeoutMs?: number;
  ffmpegTimeoutMs?: number;
}

export interface HomeRecordSuccess {
  ok: true;
  outputFilePath: string;
  workDir: string;
  title: string;
  artist: string;
  durationSec: number;
  ytId: string | null;
  thumbnailUrl: string;
  safeFilename: string;
  responseMeta: Record<string, string>;
}

export interface HomeRecordFailure {
  ok: false;
  error: string;
  code: ConvertErrorCode;
  workDir: string;
}

export async function runHomeRecord(
  params: HomeRecordParams,
  emit?: ProgressEmitter
): Promise<HomeRecordSuccess | HomeRecordFailure> {
  const {
    url,
    formatSpec,
    customTitle = '',
    customArtist = '',
    cookiesFile,
    extractYouTubeId,
    fetchYouTubeOEmbed,
    ytDlpTimeoutMs = 300_000,
    ffmpegTimeoutMs = 240_000,
  } = params;

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-home-'));
  const progress = (stage: ConvertStage, percent: number, message: string) => emit?.(stage, percent, message);

  try {
    progress('validate', 10, 'Validating link…');
    const ytId = extractYouTubeId(url);
    let title = customTitle || 'Open Grace Track';
    let artist = customArtist || 'Open Grace Music';
    let thumbnailUrl = '';

    if (ytId) {
      if (fetchYouTubeOEmbed) {
        try {
          const meta = await fetchYouTubeOEmbed(ytId);
          if (!customTitle && meta.title) title = meta.title;
          if (!customArtist && meta.author) artist = meta.author;
          thumbnailUrl = meta.thumbnailUrl || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        } catch {
          thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        }
      } else {
        thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      }

      progress('extract', 18, 'Fetching this video on the PC…');
      const rawInputTemplate = path.join(workDir, 'raw_source.%(ext)s');
      const canonical = `https://www.youtube.com/watch?v=${ytId}`;
      try {
        await runYtDlpWatched(
          [
            '--no-playlist',
            '--no-warnings',
            '-f',
            'bestaudio/best',
            '--newline',
            '--write-info-json',
            '-o',
            rawInputTemplate,
            ...cookieArgs(cookiesFile),
            canonical,
          ],
          {
            command: ytDlpBin(),
            timeoutMs: ytDlpTimeoutMs,
            onLine: (line) => {
              const dl = parseYtDlpDownloadPercent(line);
              if (dl != null) {
                progress('extract', Math.min(62, 18 + Math.round(dl * 0.4)), `Downloading… ${Math.round(dl)}%`);
              }
            },
          }
        );
      } catch (extractErr) {
        const failure = classifyPipelineError(extractErr, 'extract');
        return { ok: false, ...failure, workDir };
      }

      const attempt = evaluateExtractedDownload(workDir, ytId);
      if (attempt.status === 'mismatch') {
        return {
          ok: false,
          code: 'EXTRACTION_FAILED',
          error: `Stream did not match this video (yt-dlp id ${attempt.match.reportedId}, requested ${ytId}).`,
          workDir,
        };
      }
      if (attempt.status !== 'ok') {
        return {
          ok: false,
          code: 'EXTRACTION_FAILED',
          error: 'Could not fetch an audio stream for this video.',
          workDir,
        };
      }

      const downloadedRawPath = attempt.path;
      const outputFilePath = path.join(workDir, `master_output.${formatSpec.extension}`);
      progress('ffmpeg', 70, `Encoding ${formatSpec.format}…`);
      try {
        await execFileAsync(
          ffmpegBin(),
          [
            '-y',
            '-i',
            downloadedRawPath,
            ...formatSpec.ffmpegArgs,
            '-metadata',
            `title=${title}`,
            '-metadata',
            `artist=${artist}`,
            '-metadata',
            'album=Open Grace Music',
            outputFilePath,
          ],
          { timeout: ffmpegTimeoutMs, maxBuffer: 4 * 1024 * 1024 }
        );
      } catch (ffmpegErr) {
        const failure = classifyPipelineError(ffmpegErr, 'ffmpeg');
        return { ok: false, ...failure, workDir };
      }

      if (!fs.existsSync(outputFilePath) || fs.statSync(outputFilePath).size < 1000) {
        return {
          ok: false,
          error: 'FFmpeg transcoding produced an invalid output file.',
          code: 'FFMPEG_FAILED',
          workDir,
        };
      }

      progress('save', 92, 'Probing codec…');
      const probe = await probeMasterFile(outputFilePath);
      if (probe.codecName && !codecMatchesRequestedFormat(formatSpec.format, probe.codecName, probe.formatName)) {
        return {
          ok: false,
          error: formatMismatchError(formatSpec.format, probe.codecName, probe.formatName),
          code: 'FFMPEG_FAILED',
          workDir,
        };
      }

      const durationSec = probe.durationSec || 0;
      const actualSampleRate = probe.sampleRate || formatSpec.sampleRate;
      const safeFilename =
        title
          .replace(/[^a-zA-Z0-9._ -]/g, '')
          .replace(/\s+/g, ' ')
          .trim() || `OpenGraceMusic_${ytId}`;

      const responseMeta: Record<string, string> = {
        'Content-Type': formatSpec.mimeType,
        'X-Audio-Id': ytId,
        'X-Audio-Title': encodeURIComponent(title),
        'X-Audio-Artist': encodeURIComponent(artist),
        'X-Audio-Duration': durationSec.toString(),
        'X-Audio-Format': formatSpec.format,
        'X-Audio-Extension': formatSpec.extension,
        'X-Audio-Sample-Rate': actualSampleRate.toString(),
        'X-Audio-Bit-Depth': formatSpec.bitDepth,
        'X-Audio-Bitrate-Label': encodeURIComponent(formatSpec.bitrateLabel),
        'X-Audio-Codec': probe.codecName || formatSpec.format.toLowerCase(),
        'X-Audio-Container': probe.formatName || formatSpec.extension,
        'X-Audio-Source': 'pc-recorder',
      };
      if (thumbnailUrl) responseMeta['X-Audio-Thumbnail'] = encodeURIComponent(thumbnailUrl);

      progress('save', 98, 'Ready');
      return {
        ok: true,
        outputFilePath,
        workDir,
        title,
        artist,
        durationSec,
        ytId,
        thumbnailUrl,
        safeFilename,
        responseMeta,
      };
    }

    const normalized = !url.startsWith('http://') && !url.startsWith('https://') ? `https://${url}` : url;
    const parsedUrl = new URL(normalized);
    if (!customTitle) {
      title =
        decodeURIComponent(path.basename(parsedUrl.pathname))
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .trim() || 'Direct Studio Audio';
    }
    if (!customArtist) artist = parsedUrl.hostname;

    progress('extract', 30, 'Fetching audio URL…');
    const rawDirectPath = path.join(workDir, 'raw_direct_input');
    const upstream = await fetch(normalized);
    if (!upstream.ok) {
      return {
        ok: false,
        error: `Failed to fetch audio URL: HTTP ${upstream.status}`,
        code: 'EXTRACTION_FAILED',
        workDir,
      };
    }
    fs.writeFileSync(rawDirectPath, Buffer.from(await upstream.arrayBuffer()));

    const outputFilePath = path.join(workDir, `master_output.${formatSpec.extension}`);
    progress('ffmpeg', 70, `Encoding ${formatSpec.format}…`);
    try {
      await execFileAsync(
        ffmpegBin(),
        [
          '-y',
          '-i',
          rawDirectPath,
          ...formatSpec.ffmpegArgs,
          '-metadata',
          `title=${title}`,
          '-metadata',
          `artist=${artist}`,
          '-metadata',
          'album=Open Grace Music',
          outputFilePath,
        ],
        { timeout: ffmpegTimeoutMs }
      );
    } catch (ffmpegErr) {
      const failure = classifyPipelineError(ffmpegErr, 'ffmpeg');
      return { ok: false, ...failure, workDir };
    }

    if (!fs.existsSync(outputFilePath) || fs.statSync(outputFilePath).size < 1000) {
      return {
        ok: false,
        error: 'FFmpeg transcoding produced an invalid output file.',
        code: 'FFMPEG_FAILED',
        workDir,
      };
    }

    const probe = await probeMasterFile(outputFilePath);
    if (probe.codecName && !codecMatchesRequestedFormat(formatSpec.format, probe.codecName, probe.formatName)) {
      return {
        ok: false,
        error: formatMismatchError(formatSpec.format, probe.codecName, probe.formatName),
        code: 'FFMPEG_FAILED',
        workDir,
      };
    }

    const durationSec = probe.durationSec || 0;
    const actualSampleRate = probe.sampleRate || formatSpec.sampleRate;
    const safeFilename =
      title.replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g, ' ').trim() || 'OpenGraceMusic_Track';

    progress('save', 98, 'Ready');
    return {
      ok: true,
      outputFilePath,
      workDir,
      title,
      artist,
      durationSec,
      ytId: null,
      thumbnailUrl: '',
      safeFilename,
      responseMeta: {
        'Content-Type': formatSpec.mimeType,
        'X-Audio-Title': encodeURIComponent(title),
        'X-Audio-Artist': encodeURIComponent(artist),
        'X-Audio-Duration': durationSec.toString(),
        'X-Audio-Format': formatSpec.format,
        'X-Audio-Extension': formatSpec.extension,
        'X-Audio-Sample-Rate': actualSampleRate.toString(),
        'X-Audio-Bit-Depth': formatSpec.bitDepth,
        'X-Audio-Bitrate-Label': encodeURIComponent(formatSpec.bitrateLabel),
        'X-Audio-Codec': probe.codecName || formatSpec.format.toLowerCase(),
        'X-Audio-Container': probe.formatName || formatSpec.extension,
        'X-Audio-Source': 'pc-recorder',
      },
    };
  } catch (error: unknown) {
    const failure = classifyPipelineError(error, 'extract');
    return { ok: false, ...failure, workDir };
  }
}

export { EXTRACT_STALL_MS, runYtDlpWatched, YtDlpWatchdogError } from './ytDlpWatchdog.ts';
