import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { refreshYoutubeAccessToken } from './youtubeTvOauth.ts';
import {
  describeYoutubeIdMatch,
  inspectInfoJson,
  matchExtractedYoutubeId,
  type YoutubeIdMatchResult,
} from './youtubeIdMatch.ts';
import { YOUTUBE_PLAYER_CLIENTS_OAUTH, youtubeYtdlpAuthArgs } from './youtubeYtdlpAuth.ts';
export interface AudioFormatSpec {
  format: 'FLAC' | 'ALAC' | 'DSD' | 'WAV' | 'MP3';
  extension: string;
  mimeType: string;
  sampleRate: number;
  bitDepth: string;
  bitrateLabel: string;
  ffmpegArgs: string[];
}

const execFileAsync = promisify(execFile);

/** yt-dlp player clients — same video ID only (phone-style clients first). */
const YOUTUBE_PLAYER_CLIENTS: (string | null)[] = [
  'android,ios,tv_embedded,mweb',
  'android,ios,web',
  'android_vr,web_safari',
  'web_embedded,tv_embedded',
  'mweb,tv',
];

function ytDlpJsRuntimeArgs(): string[] {
  const nodeBin = process.execPath || 'node';
  return ['--js-runtimes', `node:${nodeBin}`, '--remote-components', 'ejs:github'];
}

function mergedYoutubeCookies(userCookies: string): string {
  const fromUser = userCookies.trim();
  if (fromUser) return fromUser;
  return (process.env.OGM_YT_COOKIES || '').trim();
}

function pickRawSourceFile(workDir: string): string | null {
  const files = fs.readdirSync(workDir).filter((f) => f.startsWith('raw_source.'));
  for (const f of files) {
    const candidate = path.join(workDir, f);
    try {
      if (fs.statSync(candidate).size > 25000) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

export { matchExtractedYoutubeId, youtubeIdsEqual } from './youtubeIdMatch.ts';

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

/** Canonical-URL download: accept match or empty metadata; refuse a different nonempty id. */
function evaluateExtractedDownload(workDir: string, expectedYtId: string): ExtractAttempt {
  const match = inspectExtractedSidecars(workDir, expectedYtId);
  console.log(`[convert-audio] yt-dlp ${describeYoutubeIdMatch(expectedYtId, match)}`);
  const picked = pickRawSourceFile(workDir);
  if (match.kind === 'mismatch') {
    return { status: 'mismatch', match };
  }
  if (picked) return { status: 'ok', path: picked, match };
  return { status: 'no-file', match };
}

function mismatchError(expectedYtId: string, reportedId: string): { code: ConvertErrorCode; error: string } {
  return {
    code: 'EXTRACTION_FAILED',
    error: `Stream did not match this video (yt-dlp id ${reportedId}, requested ${expectedYtId}).`,
  };
}

function clearRawSourceArtifacts(workDir: string) {
  for (const f of fs.readdirSync(workDir)) {
    if (f.startsWith('raw_source.') || f.endsWith('.info.json')) {
      try {
        fs.unlinkSync(path.join(workDir, f));
      } catch {
        // ignore
      }
    }
  }
}

/** Probe container + audio codec so we never label MP3 as FLAC (or the reverse). */
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
    const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
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
    // fall through with empty probe
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
  return (
    `Requested ${requested} but FFmpeg wrote ${got}. ` +
    `OGM will not label this as ${requested} — retry or pick MP3 320.`
  );
}

export type ConvertErrorCode = 'YOUTUBE_BOT_CHECK' | 'TIMEOUT' | 'FFMPEG_FAILED' | 'EXTRACTION_FAILED';

export type ConvertStage = 'validate' | 'extract' | 'ffmpeg' | 'save' | 'done' | 'error';

export type ProgressEmitter = (stage: ConvertStage, percent: number, message: string) => void;

function pipelineErrorText(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { message?: string; stderr?: string | Buffer };
  const stderr = e.stderr ? String(e.stderr) : '';
  return [stderr, e.message].filter(Boolean).join(' ').trim();
}

export function classifyPipelineError(
  err: unknown,
  phase: 'extract' | 'ffmpeg'
): { code: ConvertErrorCode; error: string } {
  const raw = pipelineErrorText(err);
  const lower = raw.toLowerCase();
  const killed = !!(err && typeof err === 'object' && (err as { killed?: boolean }).killed);

  if (killed || lower.includes('timed out') || lower.includes('etimedout')) {
    return {
      code: 'TIMEOUT',
      error:
        'Conversion timed out. Studio formats can take several minutes — retry or try MP3 320.',
    };
  }
  if (
    /login_required|sign in to confirm|please sign in|not a bot|http error 429|http error 403|cookies are needed|confirm your age/i.test(
      lower
    )
  ) {
    return {
      code: 'YOUTUBE_BOT_CHECK',
      error: 'YouTube asked for a login (LOGIN_REQUIRED). Reconnect YouTube and retry.',
    };
  }
  if (phase === 'ffmpeg') {
    return {
      code: 'FFMPEG_FAILED',
      error: `Audio mastering failed: ${raw.slice(0, 200) || 'FFmpeg error'}`,
    };
  }
  const technical = raw.slice(0, 400);
  if (/requested format is not available|no video formats|no audio formats/i.test(technical)) {
    return {
      code: 'EXTRACTION_FAILED',
      error: 'No playable audio stream for this video.',
    };
  }
  if (/python3|command failed|must be suitable for the extractor/i.test(technical)) {
    console.warn('[convert-audio] extract failed:', technical);
    return {
      code: 'EXTRACTION_FAILED',
      error: 'Could not fetch an audio stream for this video.',
    };
  }
  return {
    code: 'EXTRACTION_FAILED',
    error: technical.slice(0, 220) || 'Could not extract an audio stream for this link.',
  };
}

export interface ConvertPipelineParams {
  url: string;
  formatSpec: AudioFormatSpec;
  requestedBitrate: number;
  userCookies?: string;
  /** YouTube TV oauth refresh token from Connect YouTube (web). Never log. */
  youtubeOauthRefresh?: string;
  customTitle?: string;
  customArtist?: string;
  extractYouTubeId: (rawUrl: string) => string | null;
  fetchYouTubeOEmbed: (ytId: string) => Promise<{ title?: string; author?: string; thumbnailUrl?: string }>;
  buildSearchQueries: (title: string, artist: string) => string[];
  ytDlpTimeoutMs: number;
  ytDlpMp3TimeoutMs: number;
  ffmpegTimeoutMs: number;
  ffmpegMp3TimeoutMs: number;
}

export interface ConvertPipelineSuccess {
  ok: true;
  outputFilePath: string;
  workDir: string;
  title: string;
  artist: string;
  durationSec: number;
  ytId: string | null;
  thumbnailUrl: string;
  extractionMethod: string;
  safeFilename: string;
  responseMeta: Record<string, string>;
}

export interface ConvertPipelineFailure {
  ok: false;
  error: string;
  code: ConvertErrorCode;
  workDir: string;
}

export async function runConvertPipeline(
  params: ConvertPipelineParams,
  emit?: ProgressEmitter
): Promise<ConvertPipelineSuccess | ConvertPipelineFailure> {
  const {
    url,
    formatSpec,
    userCookies: userCookiesRaw = '',
    youtubeOauthRefresh = '',
    customTitle = '',
    customArtist = '',
    extractYouTubeId,
    fetchYouTubeOEmbed,
    buildSearchQueries,
    ytDlpTimeoutMs,
    ytDlpMp3TimeoutMs,
    ffmpegTimeoutMs,
    ffmpegMp3TimeoutMs,
  } = params;

  const userCookies = mergedYoutubeCookies(userCookiesRaw);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-audio-'));
  const rawInputTemplate = path.join(workDir, 'raw_source.%(ext)s');

  const isMp3 = formatSpec.format === 'MP3';
  const extractTimeout = isMp3 ? ytDlpMp3TimeoutMs : ytDlpTimeoutMs;
  const transcodeTimeout = isMp3 ? ffmpegMp3TimeoutMs : ffmpegTimeoutMs;

  const progress = (stage: ConvertStage, percent: number, message: string) => emit?.(stage, percent, message);

  try {
    progress('validate', 10, 'Validating link & resolving metadata...');

    const ytId = extractYouTubeId(url);
    let title = customTitle || 'Open Grace Track';
    let artist = customArtist || 'Open Grace Music';
    let thumbnailUrl = '';
    let extractionMethod = 'direct';

    if (ytId) {
      const oembed = await fetchYouTubeOEmbed(ytId);
      if (!customTitle && oembed.title) title = oembed.title;
      if (!customArtist && oembed.author) artist = oembed.author;
      thumbnailUrl = oembed.thumbnailUrl || '';

      progress('validate', 18, `Validated YouTube master · ${title.slice(0, 48)}`);

      const canonicalWatchUrl = `https://www.youtube.com/watch?v=${ytId}`;
      let downloadedRawPath: string | null = null;

      let accessToken = '';
      const oauthRefresh = youtubeOauthRefresh.trim();
      if (oauthRefresh) {
        const refreshed = await refreshYoutubeAccessToken(oauthRefresh);
        if (refreshed) accessToken = refreshed.accessToken;
      }
      const cookieArgs = youtubeYtdlpAuthArgs(workDir, userCookies, accessToken);
      const playerClients = accessToken
        ? [...YOUTUBE_PLAYER_CLIENTS_OAUTH, ...YOUTUBE_PLAYER_CLIENTS.filter((c) => !YOUTUBE_PLAYER_CLIENTS_OAUTH.includes(c))]
        : YOUTUBE_PLAYER_CLIENTS;

      let lastExtractFailure: { code: ConvertErrorCode; error: string } | null = null;

      progress('extract', 28, `Extracting source audio (${formatSpec.format})…`);

      let extractPercent = 30;
      const extractHeartbeat = setInterval(() => {
        extractPercent = Math.min(58, extractPercent + 4);
        progress('extract', extractPercent, `Extracting from YouTube (yt-dlp)… ${extractPercent}%`);
      }, 3500);

      const markExtracted = (playerClient: string | null, attempt: ExtractAttempt & { status: 'ok' }) => {
        downloadedRawPath = attempt.path;
        extractionMethod = playerClient ? `youtube-direct (${playerClient})` : 'youtube-direct';
        console.log(
          `[convert-audio] yt-dlp succeeded for ${ytId} with player_client=${playerClient ?? 'default'} (${attempt.match.kind})`
        );
      };

      try {
        for (const playerClient of playerClients) {
          if (downloadedRawPath) break;
          clearRawSourceArtifacts(workDir);
          const clientArgs: string[] = [];
          if (playerClient) {
            clientArgs.push('--extractor-args', `youtube:player_client=${playerClient}`);
          }
          try {
            await execFileAsync(
              'yt-dlp',
              [
                '--no-playlist',
                '--no-warnings',
                '--socket-timeout',
                '30',
                '--retries',
                '2',
                '--write-info-json',
                ...ytDlpJsRuntimeArgs(),
                '-f',
                isMp3 ? 'bestaudio[ext=m4a]/bestaudio/best' : 'bestaudio/best',
                ...cookieArgs,
                ...clientArgs,
                '-o',
                rawInputTemplate,
                canonicalWatchUrl,
              ],
              { timeout: extractTimeout, maxBuffer: 8 * 1024 * 1024 }
            );
            const attempt = evaluateExtractedDownload(workDir, ytId);
            if (attempt.status === 'ok') {
              markExtracted(playerClient, attempt);
              break;
            }
            if (attempt.status === 'mismatch' && attempt.match.reportedId) {
              lastExtractFailure = mismatchError(ytId, attempt.match.reportedId);
              clearRawSourceArtifacts(workDir);
            } else if (!lastExtractFailure || lastExtractFailure.code !== 'TIMEOUT') {
              lastExtractFailure = {
                code: 'EXTRACTION_FAILED',
                error: 'No playable audio stream for this video.',
              };
            }
          } catch (directErr) {
            const classified = classifyPipelineError(directErr, 'extract');
            const attempt = evaluateExtractedDownload(workDir, ytId);
            if (attempt.status === 'ok') {
              markExtracted(playerClient, attempt);
              break;
            }
            if (classified.code === 'TIMEOUT' || classified.code === 'YOUTUBE_BOT_CHECK') {
              lastExtractFailure = classified;
            } else if (attempt.status === 'mismatch' && attempt.match.reportedId) {
              lastExtractFailure = mismatchError(ytId, attempt.match.reportedId);
            } else {
              lastExtractFailure = classified;
            }
            console.warn(
              `[convert-audio] YouTube direct failed (${ytId}${playerClient ? ` client=${playerClient}` : ''}):`,
              lastExtractFailure.error
            );
          }
        }
      } finally {
        clearInterval(extractHeartbeat);
      }

      if (!downloadedRawPath) {
        const failure = lastExtractFailure || {
          code: 'EXTRACTION_FAILED' as ConvertErrorCode,
          error: 'Could not fetch an audio stream for this video.',
        };
        return { ok: false, ...failure, workDir };
      }

      progress('extract', 62, 'Source stream acquired · starting FFmpeg…');

      const outputFilePath = path.join(workDir, `master_output.${formatSpec.extension}`);

      progress('ffmpeg', 68, `Mastering ${formatSpec.format} with FFmpeg…`);

      let ffmpegPercent = 70;
      const ffmpegHeartbeat = setInterval(() => {
        ffmpegPercent = Math.min(88, ffmpegPercent + 3);
        progress('ffmpeg', ffmpegPercent, `FFmpeg transcoding ${formatSpec.format}… ${ffmpegPercent}%`);
      }, 4000);

      try {
        await execFileAsync(
          '/usr/bin/ffmpeg',
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
            'album=Open Grace Music · Audiophile Master',
            outputFilePath,
          ],
          { timeout: transcodeTimeout, maxBuffer: 4 * 1024 * 1024 }
        );
      } catch (ffmpegErr) {
        const failure = classifyPipelineError(ffmpegErr, 'ffmpeg');
        return { ok: false, ...failure, workDir };
      } finally {
        clearInterval(ffmpegHeartbeat);
      }

      if (!fs.existsSync(outputFilePath) || fs.statSync(outputFilePath).size < 30000) {
        return {
          ok: false,
          error: 'FFmpeg transcoding produced an invalid output file.',
          code: 'FFMPEG_FAILED',
          workDir,
        };
      }

      progress('save', 92, 'Probing codec & packaging master file…');

      const probe = await probeMasterFile(outputFilePath);
      if (!codecMatchesRequestedFormat(formatSpec.format, probe.codecName, probe.formatName)) {
        return {
          ok: false,
          error: formatMismatchError(formatSpec.format, probe.codecName, probe.formatName),
          code: 'FFMPEG_FAILED',
          workDir,
        };
      }

      const durationSec = probe.durationSec || 210;
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
        'X-Audio-Source': extractionMethod,
      };
      if (thumbnailUrl) {
        responseMeta['X-Audio-Thumbnail'] = encodeURIComponent(thumbnailUrl);
      }

      progress('save', 98, 'Master file ready for download');

      return {
        ok: true,
        outputFilePath,
        workDir,
        title,
        artist,
        durationSec,
        ytId,
        thumbnailUrl,
        extractionMethod,
        safeFilename,
        responseMeta,
      };
    }

    // Direct URL
    const normalized = !url.startsWith('http://') && !url.startsWith('https://') ? `https://${url}` : url;
    const parsedUrl = new URL(normalized);
    if (!customTitle) {
      title =
        decodeURIComponent(path.basename(parsedUrl.pathname))
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .trim() || 'Direct Studio Audio';
    }
    if (!customArtist) {
      artist = parsedUrl.hostname;
    }

    progress('extract', 35, 'Fetching direct audio URL…');

    const rawDirectPath = path.join(workDir, 'raw_direct_input');
    const upstream = await fetch(normalized, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      },
    });
    if (!upstream.ok) {
      return {
        ok: false,
        error: `Failed to fetch direct audio URL: HTTP ${upstream.status}`,
        code: 'EXTRACTION_FAILED',
        workDir,
      };
    }

    const arrayBuf = await upstream.arrayBuffer();
    fs.writeFileSync(rawDirectPath, Buffer.from(arrayBuf));

    const outputFilePath = path.join(workDir, `master_output.${formatSpec.extension}`);
    progress('ffmpeg', 70, `Transcoding to ${formatSpec.format}…`);

    try {
      await execFileAsync(
        '/usr/bin/ffmpeg',
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
          'album=Open Grace Music · Audiophile Master',
          outputFilePath,
        ],
        { timeout: transcodeTimeout }
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
    if (!codecMatchesRequestedFormat(formatSpec.format, probe.codecName, probe.formatName)) {
      return {
        ok: false,
        error: formatMismatchError(formatSpec.format, probe.codecName, probe.formatName),
        code: 'FFMPEG_FAILED',
        workDir,
      };
    }

    const durationSec = probe.durationSec || 180;
    const actualSampleRate = probe.sampleRate || formatSpec.sampleRate;

    const safeFilename =
      title
        .replace(/[^a-zA-Z0-9._ -]/g, '')
        .replace(/\s+/g, ' ')
        .trim() || 'OpenGraceMusic_Track';

    const responseMeta: Record<string, string> = {
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
      'X-Audio-Source': 'direct-url',
    };

    progress('save', 98, 'Master file ready');

    return {
      ok: true,
      outputFilePath,
      workDir,
      title,
      artist,
      durationSec,
      ytId: null,
      thumbnailUrl: '',
      extractionMethod: 'direct-url',
      safeFilename,
      responseMeta,
    };
  } catch (error: unknown) {
    const failure = classifyPipelineError(error, 'extract');
    return { ok: false, ...failure, workDir };
  }
}
