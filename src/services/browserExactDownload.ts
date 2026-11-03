/**
 * Web Record fallback: fetch THIS exact YouTube video’s audio in the browser
 * via public Invidious / Piped instances (user IP, not Render).
 *
 * Never uses getDisplayMedia / tab capture / screen share.
 * Never substitutes a different video id.
 */

export const BROWSER_EXACT_ROUTE = 'browser-exact';

export const INVIDIOUS_FALLBACK_ORIGINS = [
  'https://yt.chocolatemoo53.com',
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://invidious.materialio.us',
  'https://iv.ggtyler.dev',
  'https://invidious.privacyredirect.com',
  'https://inv.citw.lgbt',
  'https://yt.oelrichsgarcia.de',
  'https://invidious.perennialte.ch',
  'https://invidious.darkness.services',
  'https://invidious.private.coffee',
  'https://invidious.protokolla.fi',
  'https://invidious.projectsegfau.lt',
  'https://yt.artemislena.eu',
  'https://invidious.jing.rocks',
  'https://invidious.tiekoetter.com',
  'https://invidious.fdn.fr',
];

export const PIPED_FALLBACK_ORIGINS = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.me.projectsegfau.lt',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.privacydev.net',
  'https://pipedapi.darkness.services',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.reallyaweso.me',
];

const AUDIO_ITAGS = new Set(['139', '140', '141', '249', '250', '251', '256', '258', '327', '338']);

export class ExactVideoMismatchError extends Error {
  constructor(reported: string, expected: string) {
    super(`Mirror returned video ${reported}, not ${expected}.`);
    this.name = 'ExactVideoMismatchError';
  }
}

export class ExactVideoUnavailableError extends Error {
  constructor() {
    super('Couldn’t fetch this exact video.');
    this.name = 'ExactVideoUnavailableError';
  }
}

export interface ExactAudioCandidate {
  url: string;
  itag: string;
  mimeType: string;
  bitrate: number;
  container: 'm4a' | 'webm' | 'mp3' | 'other';
}

export interface ParsedExactVideo {
  videoId: string;
  title: string;
  artist: string;
  durationSec: number;
  audio: ExactAudioCandidate[];
}

export interface ExactAudioResult {
  blob: Blob;
  mimeType: string;
  format: string;
  extension: string;
  videoId: string;
  title: string;
  artist: string;
  durationSec: number;
  source: string;
  bitrateKbps: number;
}

export type ExactDownloadFetch = (input: string, init?: RequestInit) => Promise<Response>;

export function youtubeIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

export function videoIdFromThumbnail(url: string | null | undefined): string | null {
  const raw = String(url || '');
  const match = raw.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
  return match?.[1] || null;
}

export function isAudioItag(itag: string | number | null | undefined): boolean {
  return AUDIO_ITAGS.has(String(itag || ''));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function containerFromMime(mime: string, fallbackUrl = ''): ExactAudioCandidate['container'] {
  const blob = `${mime} ${fallbackUrl}`.toLowerCase();
  if (blob.includes('webm') || blob.includes('opus')) return 'webm';
  if (blob.includes('mpeg') || blob.includes('mp3')) return 'mp3';
  if (blob.includes('mp4') || blob.includes('m4a') || blob.includes('aac') || blob.includes('mp4a')) return 'm4a';
  return 'other';
}

export function pickBestAudio(audio: ExactAudioCandidate[]): ExactAudioCandidate | null {
  if (!audio.length) return null;
  const ranked = [...audio].sort((a, b) => {
    const pref = (c: ExactAudioCandidate) => (c.container === 'm4a' ? 2 : c.container === 'webm' ? 1 : 0);
    const byPref = pref(b) - pref(a);
    if (byPref) return byPref;
    return b.bitrate - a.bitrate;
  });
  return ranked[0] || null;
}

export function parseInvidiousVideo(data: unknown, expectedId: string): ParsedExactVideo | null {
  const d = asRecord(data);
  if (!d) return null;
  if (typeof d.error === 'string' && d.error.trim()) return null;
  const videoId = String(d.videoId || d.videoID || '');
  if (!youtubeIdsEqual(videoId, expectedId)) return null;
  const formats = Array.isArray(d.adaptiveFormats) ? d.adaptiveFormats : [];
  const audio: ExactAudioCandidate[] = [];
  for (const raw of formats) {
    const f = asRecord(raw);
    if (!f) continue;
    const type = String(f.type || f.mimeType || '');
    const encoding = String(f.encoding || f.audioQuality || '');
    const itag = String(f.itag || '');
    const url = String(f.url || '');
    const isAudio =
      /^audio\//i.test(type) ||
      /aac|opus|mp4a/i.test(`${type} ${encoding}`) ||
      isAudioItag(itag);
    if (!isAudio || !url) continue;
    audio.push({
      url,
      itag,
      mimeType: type || 'audio/mp4',
      bitrate: Number(f.bitrate || f.audioBitrate || 0) || 0,
      container: containerFromMime(type, url),
    });
  }
  if (!audio.length) return null;
  return {
    videoId,
    title: String(d.title || `YouTube ${expectedId}`),
    artist: String(d.author || d.authorName || 'Open Grace Music'),
    durationSec: Number(d.lengthSeconds || d.length || 0) || 0,
    audio,
  };
}

export function parsePipedStreams(data: unknown, expectedId: string): ParsedExactVideo | null {
  const d = asRecord(data);
  if (!d) return null;
  if (typeof d.error === 'string' && d.error.trim()) return null;
  const reported =
    (typeof d.id === 'string' && d.id.length === 11 ? d.id : null) ||
    videoIdFromThumbnail(String(d.thumbnailUrl || d.thumbnail || '')) ||
    videoIdFromUrlList([
      String(d.dash || ''),
      String(d.hls || ''),
      ...((Array.isArray(d.audioStreams) ? d.audioStreams : []) as unknown[]).map((s) =>
        String(asRecord(s)?.url || '')
      ),
    ]);
  if (!reported || !youtubeIdsEqual(reported, expectedId)) return null;
  const streams = Array.isArray(d.audioStreams) ? d.audioStreams : [];
  const audio: ExactAudioCandidate[] = [];
  for (const raw of streams) {
    const f = asRecord(raw);
    if (!f) continue;
    const url = String(f.url || '');
    if (!url) continue;
    const mime = String(f.mimeType || f.codec || f.format || '');
    audio.push({
      url,
      itag: String(f.itag || ''),
      mimeType: mime || 'audio/mp4',
      bitrate: Number(f.bitrate || 0) || parseBitrateLabel(String(f.quality || '')),
      container: containerFromMime(mime, url),
    });
  }
  if (!audio.length) return null;
  return {
    videoId: reported,
    title: String(d.title || `YouTube ${expectedId}`),
    artist: String(d.uploader || d.uploaderName || 'Open Grace Music'),
    durationSec: Number(d.duration || 0) || 0,
    audio,
  };
}

function parseBitrateLabel(label: string): number {
  const match = label.match(/(\d+)\s*kbps/i);
  return match ? Number(match[1]) * 1000 : 0;
}

function videoIdFromUrlList(urls: string[]): string | null {
  for (const url of urls) {
    const fromThumb = videoIdFromThumbnail(url);
    if (fromThumb) return fromThumb;
    const fromQuery = url.match(/[?&](?:v|id)=([a-zA-Z0-9_-]{11})(?:&|$)/);
    if (fromQuery?.[1]) return fromQuery[1];
  }
  return null;
}

export function invidiousAudioUrls(
  origin: string,
  videoId: string,
  candidate: ExactAudioCandidate
): string[] {
  const base = origin.replace(/\/+$/, '');
  const urls = [
    `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=${encodeURIComponent(candidate.itag || '140')}&local=true`,
    `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=${encodeURIComponent(candidate.itag || '140')}`,
    candidate.url,
  ];
  return [...new Set(urls.filter(Boolean))];
}

export function isLikelyAudioMagic(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes);
  if (b.length < 4) return false;
  if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true;
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return true;
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return true;
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return true;
  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) return true;
  return false;
}

export function formatFromAudioBlob(
  blob: Blob,
  mimeHint = ''
): { format: string; mime: string; extension: string } {
  const mime = (blob.type || mimeHint || '').toLowerCase().split(';')[0].trim();
  if (mime.includes('mpeg') || mime.includes('mp3')) {
    return { format: 'MP3', mime: mime || 'audio/mpeg', extension: 'mp3' };
  }
  if (mime.includes('webm') || mime.includes('opus')) {
    return { format: 'WEBM', mime: mime || 'audio/webm', extension: 'webm' };
  }
  return { format: 'M4A', mime: mime || 'audio/mp4', extension: 'm4a' };
}

export function originFromUri(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseInvidiousInstanceDirectory(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const corsFirst: string[] = [];
  const rest: string[] = [];
  const push = (origin: string | null, cors: unknown) => {
    if (!origin) return;
    (cors === true ? corsFirst : rest).push(origin);
  };
  for (const row of data) {
    if (Array.isArray(row) && row.length >= 2) {
      const meta = asRecord(row[1]);
      if (!meta) continue;
      if (meta.api === false) continue;
      const uri = String(meta.uri || '');
      const origin = originFromUri(uri) || originFromUri(`https://${row[0]}`);
      push(origin, meta.cors);
      continue;
    }
    const meta = asRecord(row);
    if (!meta) continue;
    const uri = String(meta.uri || meta.url || '');
    push(originFromUri(uri), meta.cors);
  }
  return uniqueOrigins([...corsFirst, ...rest]);
}

export function parsePipedInstanceDirectory(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const origins: string[] = [];
  for (const row of data) {
    const meta = asRecord(row);
    if (!meta) continue;
    const origin = originFromUri(String(meta.api_url || meta.apiUrl || meta.uri || ''));
    if (origin) origins.push(origin);
  }
  return uniqueOrigins(origins);
}

function uniqueOrigins(origins: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const origin of origins) {
    const key = origin.replace(/\/+$/, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function fetchJson(
  fetchImpl: ExactDownloadFetch,
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function fetchAudioBlob(
  fetchImpl: ExactDownloadFetch,
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  onBytes?: (received: number, total: number) => void
): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      throw new Error('not audio');
    }
    const total = Number(res.headers.get('content-length') || 0) || 0;
    const buffer = await res.arrayBuffer();
    onBytes?.(buffer.byteLength, total || buffer.byteLength);
    if (buffer.byteLength < 40_000) throw new Error('too small');
    if (!isLikelyAudioMagic(buffer.slice(0, 16))) throw new Error('not audio');
    return new Blob([buffer], { type: contentType.split(';')[0].trim() || 'audio/mp4' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function listInvidiousOrigins(
  fetchImpl: ExactDownloadFetch,
  signal?: AbortSignal
): Promise<string[]> {
  try {
    const data = await fetchJson(fetchImpl, 'https://api.invidious.io/instances.json', 2500, signal);
    const live = parseInvidiousInstanceDirectory(data);
    if (live.length) return uniqueOrigins([...live, ...INVIDIOUS_FALLBACK_ORIGINS]);
  } catch {
    // use fallbacks
  }
  return INVIDIOUS_FALLBACK_ORIGINS.slice();
}

async function downloadFromInvidious(
  origin: string,
  videoId: string,
  fetchImpl: ExactDownloadFetch,
  signal: AbortSignal | undefined,
  onProgress?: (percent: number, message: string) => void
): Promise<ExactAudioResult> {
  const data = await fetchJson(fetchImpl, `${origin}/api/v1/videos/${encodeURIComponent(videoId)}`, 10000, signal);
  const parsed = parseInvidiousVideo(data, videoId);
  if (!parsed) {
    const reported = asRecord(data)?.videoId;
    if (typeof reported === 'string' && reported && !youtubeIdsEqual(reported, videoId)) {
      throw new ExactVideoMismatchError(reported, videoId);
    }
    throw new Error('no audio');
  }
  const best = pickBestAudio(parsed.audio);
  if (!best) throw new Error('no audio');
  let lastErr: unknown;
  for (const url of invidiousAudioUrls(origin, videoId, best)) {
    try {
      const blob = await fetchAudioBlob(fetchImpl, url, 45000, signal, (received, total) => {
        const pct = total > 0 ? Math.min(0.9, received / total) : 0.4;
        onProgress?.(pct, `Downloading this video…`);
      });
      const fmt = formatFromAudioBlob(blob, best.mimeType);
      return {
        blob,
        mimeType: fmt.mime,
        format: fmt.format,
        extension: fmt.extension,
        videoId: parsed.videoId,
        title: parsed.title,
        artist: parsed.artist,
        durationSec: parsed.durationSec,
        source: `invidious:${origin.replace(/^https?:\/\//, '')}`,
        bitrateKbps: Math.round((best.bitrate || 0) / 1000) || 0,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('invidious download failed');
}

async function downloadFromPiped(
  origin: string,
  videoId: string,
  fetchImpl: ExactDownloadFetch,
  signal: AbortSignal | undefined,
  onProgress?: (percent: number, message: string) => void
): Promise<ExactAudioResult> {
  const data = await fetchJson(fetchImpl, `${origin}/streams/${encodeURIComponent(videoId)}`, 10000, signal);
  const parsed = parsePipedStreams(data, videoId);
  if (!parsed) {
    throw new Error('no audio');
  }
  const best = pickBestAudio(parsed.audio);
  if (!best) throw new Error('no audio');
  const blob = await fetchAudioBlob(fetchImpl, best.url, 45000, signal, (received, total) => {
    const pct = total > 0 ? Math.min(0.9, received / total) : 0.4;
    onProgress?.(pct, `Downloading this video…`);
  });
  const fmt = formatFromAudioBlob(blob, best.mimeType);
  return {
    blob,
    mimeType: fmt.mime,
    format: fmt.format,
    extension: fmt.extension,
    videoId: parsed.videoId,
    title: parsed.title,
    artist: parsed.artist,
    durationSec: parsed.durationSec,
    source: `piped:${origin.replace(/^https?:\/\//, '')}`,
    bitrateKbps: Math.round((best.bitrate || 0) / 1000) || 0,
  };
}

async function firstSuccess<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<ExactAudioResult>
): Promise<ExactAudioResult> {
  if (!items.length) throw new ExactVideoUnavailableError();
  let next = 0;
  let settled = false;
  let lastErr: unknown;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!settled) {
      const index = next++;
      if (index >= items.length) return;
      try {
        const result = await worker(items[index]);
        settled = true;
        return result;
      } catch (err) {
        lastErr = err;
      }
    }
    return undefined;
  });
  const results = await Promise.all(workers);
  const won = results.find((r): r is ExactAudioResult => Boolean(r));
  if (won) return won;
  if (lastErr instanceof ExactVideoMismatchError) throw lastErr;
  throw new ExactVideoUnavailableError();
}

export async function downloadExactYoutubeAudioInBrowser(
  videoId: string,
  onProgress?: (percent: number, message: string) => void,
  opts?: { fetchImpl?: ExactDownloadFetch; signal?: AbortSignal }
): Promise<ExactAudioResult> {
  const id = videoId.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    throw new ExactVideoUnavailableError();
  }
  const fetchImpl = opts?.fetchImpl || fetch.bind(globalThis);
  const signal = opts?.signal;
  onProgress?.(0.08, 'Looking up this video…');

  const invidious = await listInvidiousOrigins(fetchImpl, signal);
  const piped = PIPED_FALLBACK_ORIGINS.slice();

  type Job =
    | { kind: 'invidious'; origin: string }
    | { kind: 'piped'; origin: string };
  // CORS Invidious instances stay first (directory order). Do not shuffle them behind dead hosts.
  const jobs: Job[] = [
    ...invidious.map((origin) => ({ kind: 'invidious' as const, origin })),
    ...shuffled(piped).map((origin) => ({ kind: 'piped' as const, origin })),
  ];

  onProgress?.(0.16, 'Fetching this video…');
  return firstSuccess(jobs, 3, async (job) => {
    if (signal?.aborted) throw new ExactVideoUnavailableError();
    if (job.kind === 'invidious') {
      return downloadFromInvidious(job.origin, id, fetchImpl, signal, onProgress);
    }
    return downloadFromPiped(job.origin, id, fetchImpl, signal, onProgress);
  });
}
