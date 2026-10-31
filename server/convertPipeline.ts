import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
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

/** yt-dlp player clients to try when YouTube serves bot-check pages to datacenter IPs. */
const YOUTUBE_PLAYER_CLIENTS: (string | null)[] = [null, 'android,web', 'ios,mweb', 'tv_embedded'];

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
      error: 'Conversion timed out after 2 minutes. Try MP3 on Wi‑Fi or retry shortly.',
    };
  }
  if (/sign in to confirm|not a bot|http error 429|http error 403|cookies are needed/i.test(lower)) {
    return {
      code: 'YOUTUBE_BOT_CHECK',
      error:
        'YouTube blocked direct download from the server. OGM will try an alternate source when possible — or tap the key icon and paste youtube.com cookies from your browser, then record again.',
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

export interface ConvertPipelineParams {
  url: string;
  formatSpec: AudioFormatSpec;
  requestedBitrate: number;
  userCookies?: string;
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
    userCookies = '',
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

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-audio-'));
  const rawInputTemplate = path.join(workDir, 'raw_source.%(ext)s');
  const cookieFilePath = path.join(workDir, 'cookies.txt');

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

      const cookieArgs: string[] = [];
      if (userCookies) {
        if (userCookies.includes('# Netscape HTTP Cookie File') || userCookies.includes('\t')) {
          fs.writeFileSync(cookieFilePath, userCookies, 'utf8');
          cookieArgs.push('--cookies', cookieFilePath);
        } else {
          const netscapeLines = ['# Netscape HTTP Cookie File'];
          for (const pair of userCookies.split(';')) {
            const [k, ...vParts] = pair.trim().split('=');
            const v = vParts.join('=');
            if (k && v) {
              netscapeLines.push(
                `.youtube.com\tTRUE\t/\tTRUE\t2147483647\t${k.trim()}\t${v.trim()}`
              );
            }
          }
          fs.writeFileSync(cookieFilePath, netscapeLines.join('\n') + '\n', 'utf8');
          cookieArgs.push('--cookies', cookieFilePath);
        }
      }

      let lastExtractFailure: { code: ConvertErrorCode; error: string } | null = null;

      progress('extract', 28, `Extracting source audio (${formatSpec.format})…`);

      let extractPercent = 30;
      const extractHeartbeat = setInterval(() => {
        extractPercent = Math.min(58, extractPercent + 4);
        progress('extract', extractPercent, `Extracting from YouTube (yt-dlp)… ${extractPercent}%`);
      }, 3500);

      try {
        for (const playerClient of YOUTUBE_PLAYER_CLIENTS) {
          if (downloadedRawPath) break;
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
                '15',
                '--retries',
                '2',
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
            const picked = pickRawSourceFile(workDir);
            if (picked) {
              downloadedRawPath = picked;
              extractionMethod = playerClient
                ? `youtube-direct (${playerClient})`
                : 'youtube-direct';
              break;
            }
          } catch (directErr) {
            lastExtractFailure = classifyPipelineError(directErr, 'extract');
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
        progress('extract', 42, 'Trying alternate audio source (mirror search)…');
        const searchQueries = buildSearchQueries(title, artist);
        for (const query of searchQueries) {
          try {
            await execFileAsync(
              'yt-dlp',
              [
                '--no-playlist',
                '--no-warnings',
                '-f',
                'bestaudio/best',
                ...cookieArgs,
                '-o',
                rawInputTemplate,
                `scsearch1:${query}`,
              ],
              { timeout: isMp3 ? ytDlpMp3TimeoutMs : ytDlpTimeoutMs, maxBuffer: 8 * 1024 * 1024 }
            );

            const picked = pickRawSourceFile(workDir);
            if (picked) {
              downloadedRawPath = picked;
              extractionMethod = `audiophile-mirror (${query})`;
              break;
            }
          } catch (fallbackErr) {
            lastExtractFailure = classifyPipelineError(fallbackErr, 'extract');
            console.warn(`[convert-audio] Mirror search failed (${query}):`, lastExtractFailure.error);
          }
        }
      }

      if (!downloadedRawPath) {
        const failure = lastExtractFailure || {
          code: 'EXTRACTION_FAILED' as ConvertErrorCode,
          error: `Could not extract audio stream for "${title}". Verify the link or add YouTube cookies.`,
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

      progress('save', 92, 'Probing duration & packaging master file…');

      let durationSec = 0;
      try {
        const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          outputFilePath,
        ]);
        durationSec = Math.round(parseFloat(stdout.trim()) || 0);
      } catch {
        durationSec = 210;
      }

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
        'X-Audio-Sample-Rate': formatSpec.sampleRate.toString(),
        'X-Audio-Bit-Depth': formatSpec.bitDepth,
        'X-Audio-Bitrate-Label': encodeURIComponent(formatSpec.bitrateLabel),
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

    let durationSec = 0;
    try {
      const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        outputFilePath,
      ]);
      durationSec = Math.round(parseFloat(stdout.trim()) || 0);
    } catch {
      durationSec = 180;
    }

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
      'X-Audio-Sample-Rate': formatSpec.sampleRate.toString(),
      'X-Audio-Bit-Depth': formatSpec.bitDepth,
      'X-Audio-Bitrate-Label': encodeURIComponent(formatSpec.bitrateLabel),
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
