import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

dotenv.config();

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

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
    .replace(
      /\((?:official|music|video|audio|lyric|lyrics|4k|hd|hq|visualizer|full|long\s*version)[^)]*\)/gi,
      ' '
    )
    .replace(
      /\b(?:official\s+music\s+video|official\s+video|official\s+audio|lyric\s+video|4k|hd|hq|long\s+version)\b/gi,
      ' '
    )
    .replace(/[()]/g, ' ')
    .replace(/[-–—|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanAuthor = rawAuthor
    .replace(/\b(?:official|vevo|music|media|records|channel|tv|topic)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const queries: string[] = [];
  if (cleanTitle) {
    queries.push(cleanTitle);
    if (cleanAuthor && !cleanTitle.toLowerCase().includes(cleanAuthor.toLowerCase())) {
      queries.push(`${cleanTitle} ${cleanAuthor}`);
    }
    // Also add first part before hyphen in original title if present
    const firstSegment = rawTitle.split(/[-–—|]/)[0]?.replace(/\[[^\]]*\]/g, '').trim();
    if (firstSegment && firstSegment.length >= 3 && !queries.includes(firstSegment)) {
      queries.push(firstSegment);
    }
  }
  return queries.length > 0 ? queries : [rawTitle];
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
  const fmt = (rawFormat || 'FLAC').toUpperCase().trim();
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

// API: Audiophile Lossless & Hi-Res Audio Extractor & Transcoder (/api/convert-audio and /api/convert-mp3)
async function handleConvertAudio(req: express.Request, res: express.Response) {
  const url = ((req.body && req.body.url) || (req.query.url as string) || '').trim();
  const requestedFormat =
    (req.body && req.body.format) ||
    (req.query.format as string) ||
    (req.path.includes('convert-mp3') ? 'MP3' : 'FLAC');
  const requestedBitrate = Number((req.body && req.body.bitrate) || req.query.bitrate || 320);
  const userCookies = ((req.body && req.body.cookies) || (req.query.cookies as string) || '').trim();
  const customTitle = ((req.body && req.body.title) || (req.query.title as string) || '').trim();
  const customArtist = ((req.body && req.body.artist) || (req.query.artist as string) || '').trim();

  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  const formatSpec = resolveFormatSpec(requestedFormat, requestedBitrate);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-audio-'));
  const rawInputTemplate = path.join(workDir, 'raw_source.%(ext)s');
  const cookieFilePath = path.join(workDir, 'cookies.txt');

  const cleanup = () => {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  };

  try {
    const ytId = extractYouTubeId(url);
    let title = customTitle || 'Open Grace Track';
    let artist = customArtist || 'Open Grace Music';
    let thumbnailUrl = '';
    let extractionMethod = 'direct';

    if (ytId) {
      const oembed = await fetchYouTubeOEmbed(ytId);
      if (!customTitle && oembed.title) title = oembed.title;
      if (!customArtist && oembed.author) artist = oembed.author;
      thumbnailUrl = oembed.thumbnailUrl;

      const canonicalWatchUrl = `https://www.youtube.com/watch?v=${ytId}`;
      let downloadedRawPath: string | null = null;

      // Write user-supplied cookies if provided
      const cookieArgs: string[] = [];
      if (userCookies) {
        if (userCookies.includes('# Netscape HTTP Cookie File') || userCookies.includes('\t')) {
          fs.writeFileSync(cookieFilePath, userCookies, 'utf8');
          cookieArgs.push('--cookies', cookieFilePath);
        } else {
          // Convert key=value; pairs into Netscape cookie format for youtube.com
          const netscapeLines = ['# Netscape HTTP Cookie File'];
          for (const pair of userCookies.split(';')) {
            const [k, ...vParts] = pair.trim().split('=');
            const v = vParts.join('=');
            if (k && v) {
              netscapeLines.push(`.youtube.com\tTRUE\t/\tTRUE\t2147483647\t${k.trim()}\t${v.trim()}`);
            }
          }
          fs.writeFileSync(cookieFilePath, netscapeLines.join('\n') + '\n', 'utf8');
          cookieArgs.push('--cookies', cookieFilePath);
        }
      }

      // Step 1: Attempt direct yt-dlp extraction from YouTube first
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
            canonicalWatchUrl,
          ],
          { timeout: 35000 }
        );

        const files = fs.readdirSync(workDir).filter((f) => f.startsWith('raw_source.'));
        if (files.length > 0) {
          const candidate = path.join(workDir, files[0]);
          if (fs.statSync(candidate).size > 25000) {
            downloadedRawPath = candidate;
            extractionMethod = 'youtube-direct';
          }
        }
      } catch {
        // Direct YouTube failed (e.g. datacenter bot check without cookies) — proceed to exact-song resolver
      }

      // Step 2: Automatic fallback to SoundCloud exact-track search via yt-dlp scsearch1:
      if (!downloadedRawPath) {
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
                '-o',
                rawInputTemplate,
                `scsearch1:${query}`,
              ],
              { timeout: 45000 }
            );

            const files = fs.readdirSync(workDir).filter((f) => f.startsWith('raw_source.'));
            if (files.length > 0) {
              const candidate = path.join(workDir, files[0]);
              if (fs.statSync(candidate).size > 25000) {
                downloadedRawPath = candidate;
                extractionMethod = `audiophile-mirror (${query})`;
                break;
              }
            }
          } catch {
            // Try next query variant
          }
        }
      }

      if (!downloadedRawPath) {
        cleanup();
        return res.status(502).json({
          error: `Could not extract audio stream for "${title}". Please verify the link or provide YouTube cookies.`,
        });
      }

      // Step 3: Transcode through FFmpeg into requested Audiophile format (FLAC 24-bit, ALAC, DSD 192kHz, WAV 24-bit, or MP3 320kbps)
      const outputFilePath = path.join(workDir, `master_output.${formatSpec.extension}`);
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
        { timeout: 90000 }
      );

      if (!fs.existsSync(outputFilePath) || fs.statSync(outputFilePath).size < 30000) {
        cleanup();
        return res.status(500).json({ error: 'FFmpeg transcoding produced an invalid output file.' });
      }

      // Step 4: Probe real duration and stream properties with ffprobe
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

      const stat = fs.statSync(outputFilePath);
      const safeFilename =
        title
          .replace(/[^a-zA-Z0-9._ -]/g, '')
          .replace(/\s+/g, ' ')
          .trim() || `OpenGraceMusic_${ytId}`;

      res.setHeader('Content-Type', formatSpec.mimeType);
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(safeFilename)}.${formatSpec.extension}"`
      );
      res.setHeader('X-Audio-Id', ytId);
      res.setHeader('X-Audio-Title', encodeURIComponent(title));
      res.setHeader('X-Audio-Artist', encodeURIComponent(artist));
      res.setHeader('X-Audio-Duration', durationSec.toString());
      res.setHeader('X-Audio-Format', formatSpec.format);
      res.setHeader('X-Audio-Extension', formatSpec.extension);
      res.setHeader('X-Audio-Sample-Rate', formatSpec.sampleRate.toString());
      res.setHeader('X-Audio-Bit-Depth', formatSpec.bitDepth);
      res.setHeader('X-Audio-Bitrate-Label', encodeURIComponent(formatSpec.bitrateLabel));
      res.setHeader('X-Audio-Source', extractionMethod);
      if (thumbnailUrl) {
        res.setHeader('X-Audio-Thumbnail', encodeURIComponent(thumbnailUrl));
      }

      const readStream = fs.createReadStream(outputFilePath);
      readStream.on('close', cleanup);
      readStream.on('error', cleanup);
      return readStream.pipe(res);
    } else {
      // Direct URL download & FFmpeg audiophile transcode
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

      const rawDirectPath = path.join(workDir, 'raw_direct_input');
      const upstream = await fetch(normalized, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        },
      });
      if (!upstream.ok) {
        cleanup();
        return res.status(502).json({ error: `Failed to fetch direct audio URL: HTTP ${upstream.status}` });
      }

      const arrayBuf = await upstream.arrayBuffer();
      fs.writeFileSync(rawDirectPath, Buffer.from(arrayBuf));

      const outputFilePath = path.join(workDir, `master_output.${formatSpec.extension}`);
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
        { timeout: 90000 }
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

      const stat = fs.statSync(outputFilePath);
      const safeFilename =
        title
          .replace(/[^a-zA-Z0-9._ -]/g, '')
          .replace(/\s+/g, ' ')
          .trim() || 'OpenGraceMusic_Track';

      res.setHeader('Content-Type', formatSpec.mimeType);
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(safeFilename)}.${formatSpec.extension}"`
      );
      res.setHeader('X-Audio-Title', encodeURIComponent(title));
      res.setHeader('X-Audio-Artist', encodeURIComponent(artist));
      res.setHeader('X-Audio-Duration', durationSec.toString());
      res.setHeader('X-Audio-Format', formatSpec.format);
      res.setHeader('X-Audio-Extension', formatSpec.extension);
      res.setHeader('X-Audio-Sample-Rate', formatSpec.sampleRate.toString());
      res.setHeader('X-Audio-Bit-Depth', formatSpec.bitDepth);
      res.setHeader('X-Audio-Bitrate-Label', encodeURIComponent(formatSpec.bitrateLabel));
      res.setHeader('X-Audio-Source', 'direct-url');

      const readStream = fs.createReadStream(outputFilePath);
      readStream.on('close', cleanup);
      readStream.on('error', cleanup);
      return readStream.pipe(res);
    }
  } catch (error: any) {
    cleanup();
    return res.status(500).json({
      error: error.message || 'Audio conversion failed',
    });
  }
}

app.post('/api/convert-audio', handleConvertAudio);
app.get('/api/convert-audio', handleConvertAudio);
app.post('/api/convert-mp3', handleConvertAudio);
app.get('/api/convert-mp3', handleConvertAudio);

// Direct Android APK & Android Studio ZIP routes
app.get('/OpenGraceMusic.apk', (_req, res) => {
  const apkCandidates = [
    path.join(__dirname, 'public', 'OpenGraceMusic.apk'),
    path.join(__dirname, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  ];
  for (const candidate of apkCandidates) {
    if (fs.existsSync(candidate)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="OpenGraceMusic.apk"');
      return res.sendFile(candidate);
    }
  }
  return res.status(404).json({ error: 'APK file not found. Run ./gradlew assembleDebug.' });
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
