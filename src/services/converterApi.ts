import { resolveConverterApiBaseUrl } from './converterServerUrl';

export type ConverterErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'YOUTUBE_BOT_CHECK'
  | 'EXTRACTION_FAILED'
  | 'FFMPEG_FAILED'
  | 'INVALID_RESPONSE'
  | 'API_UNAVAILABLE'
  | 'RECORDER_OFFLINE'
  | 'RECORDER_REQUIRED'
  | 'WORKER_SECRET_MISSING'
  | 'FILE_TOO_LARGE';

export class ConverterApiError extends Error {
  code: ConverterErrorCode;

  constructor(message: string, code: ConverterErrorCode = 'EXTRACTION_FAILED') {
    super(message);
    this.name = 'ConverterApiError';
    this.code = code;
  }
}

/** API base: Settings override, else same tab origin (PWA on your server). */
export function getApiBaseUrl(): string {
  return resolveConverterApiBaseUrl();
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 60_000, ...fetchInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...fetchInit, signal: controller.signal });
  } catch (err: unknown) {
    const isAbort =
      err instanceof DOMException
        ? err.name === 'AbortError'
        : typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (err as { name: string }).name === 'AbortError';

    if (isAbort) {
      throw new ConverterApiError(
        'Conversion timed out. Studio formats can take several minutes — retry or try MP3 320.',
        'TIMEOUT'
      );
    }
    throw new ConverterApiError(
      'Cannot reach Open Grace. Check your network, or set the site URL in Settings.',
      'NETWORK'
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function readConverterError(response: Response): Promise<ConverterApiError> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = (await response.json()) as { error?: string; code?: ConverterErrorCode };
      const code = data.code || (response.status === 410 ? 'RECORDER_REQUIRED' : 'EXTRACTION_FAILED');
      return new ConverterApiError(data.error || `Server error (${response.status})`, code);
    } catch {
      // fall through
    }
  }
  try {
    const text = (await response.text()).trim();
    if (text) {
      return new ConverterApiError(text.slice(0, 240), 'EXTRACTION_FAILED');
    }
  } catch {
    // ignore
  }
  return new ConverterApiError(`Conversion failed (HTTP ${response.status})`, 'EXTRACTION_FAILED');
}

export function humanizeConverterError(err: unknown): { message: string; code: ConverterErrorCode } {
  if (err instanceof ConverterApiError) {
    return { message: err.message, code: err.code };
  }
  if (err instanceof TypeError && /fetch|network|failed/i.test(String(err.message))) {
    return {
      message: 'Cannot reach Open Grace. The site may be down, or set a URL in Settings.',
      code: 'NETWORK',
    };
  }
  const message = err instanceof Error ? err.message : 'Failed to process audio';
  return { message, code: 'EXTRACTION_FAILED' };
}

export { recordFailureSentence } from './recordFailureSentence';
export { compactRecordLabel } from './recordProgressLabel';

export async function checkConverterApiAvailable(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(apiUrl('/api/health'), { timeoutMs: 8000 });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export type ConvertJobStage = 'queued' | 'validate' | 'extract' | 'ffmpeg' | 'save' | 'done' | 'error';

export interface ConvertJobStatus {
  jobId: string;
  stage: ConvertJobStage;
  percent: number;
  message: string;
  done: boolean;
  error?: string;
  code?: ConverterErrorCode;
  sizeBytes?: number;
}

export interface StartConvertJobBody {
  url: string;
  format: string;
  bitrate?: number;
  title?: string;
  artist?: string;
}

export async function fetchRecorderPresence(): Promise<{
  online: boolean;
  workers: number;
  lastSeenAt: number | null;
  secretConfigured: boolean | null;
}> {
  try {
    const res = await fetchWithTimeout(apiUrl('/api/recorder/presence'), { timeoutMs: 8_000 });
    if (!res.ok) return { online: false, workers: 0, lastSeenAt: null, secretConfigured: null };
    const data = (await res.json()) as {
      online?: boolean;
      workers?: number;
      lastSeenAt?: number | null;
      secretConfigured?: boolean;
    };
    return {
      online: !!data.online,
      workers: Number(data.workers) || 0,
      lastSeenAt: data.lastSeenAt ?? null,
      secretConfigured: typeof data.secretConfigured === 'boolean' ? data.secretConfigured : null,
    };
  } catch {
    return { online: false, workers: 0, lastSeenAt: null, secretConfigured: null };
  }
}

export async function startConvertJob(body: StartConvertJobBody): Promise<{ jobId: string }> {
  const presence = await fetchRecorderPresence();
  if (presence.secretConfigured === false) {
    throw new ConverterApiError('Hub secret isn’t set (OGM_WORKER_SECRET).', 'WORKER_SECRET_MISSING');
  }
  if (!presence.online) {
    throw new ConverterApiError('No recorder is online. Open the APK to record on this phone.', 'RECORDER_OFFLINE');
  }
  const res = await fetchWithTimeout(apiUrl('/api/recorder/jobs'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 30_000,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await readConverterError(res);
  }
  return (await res.json()) as { jobId: string };
}

export async function fetchConvertJobStatus(jobId: string): Promise<ConvertJobStatus> {
  const res = await fetchWithTimeout(apiUrl(`/api/recorder/jobs/${encodeURIComponent(jobId)}`), {
    timeoutMs: 15_000,
  });
  if (!res.ok) {
    throw await readConverterError(res);
  }
  return (await res.json()) as ConvertJobStatus;
}

export async function downloadConvertJobResult(
  jobId: string,
  sizeBytes = 0
): Promise<Response> {
  const CHUNK = 4 * 1024 * 1024;
  if (sizeBytes > CHUNK) {
    const parts: Blob[] = [];
    let offset = 0;
    let mime = 'application/octet-stream';
    const headers = new Headers();
    while (offset < sizeBytes) {
      const res = await fetchWithTimeout(
        apiUrl(
          `/api/recorder/jobs/${encodeURIComponent(jobId)}/file?offset=${offset}&limit=${CHUNK}`
        ),
        { timeoutMs: 180_000 }
      );
      if (!res.ok) throw await readConverterError(res);
      mime = res.headers.get('content-type') || mime;
      res.headers.forEach((v, k) => headers.set(k, v));
      parts.push(await res.blob());
      offset += CHUNK;
    }
    return new Response(new Blob(parts, { type: mime }), { headers, status: 200 });
  }
  return fetchWithTimeout(apiUrl(`/api/recorder/jobs/${encodeURIComponent(jobId)}/file`), {
    timeoutMs: 12 * 60_000,
  });
}

const STUDIO_LOSSLESS = new Set(['FLAC', 'ALAC', 'DSD', 'WAV']);

export function isStudioLosslessFormat(format: string): boolean {
  return STUDIO_LOSSLESS.has(format.toUpperCase());
}

export function studioFormatWarning(format: string): string | null {
  if (!isStudioLosslessFormat(format)) return null;
  return `${format} is a lossless wrap of YouTube’s lossy audio — not a studio master.`;
}

/** Poll until done/error. Hard cap is hours; a stall with no progress is the real timeout. */
export async function waitForConvertJob(
  jobId: string,
  onProgress?: (status: ConvertJobStatus) => void,
  stallMs = 5 * 60_000,
  maxMs = 6 * 60 * 60_000
): Promise<ConvertJobStatus> {
  const started = Date.now();
  let lastSig = '';
  let lastChange = Date.now();
  while (Date.now() - started < maxMs) {
    const status = await fetchConvertJobStatus(jobId);
    onProgress?.(status);
    const sig = `${status.stage}|${status.percent}|${status.message}|${status.done}`;
    if (sig !== lastSig) {
      lastSig = sig;
      lastChange = Date.now();
    }
    if (status.stage === 'error') {
      throw new ConverterApiError(status.error || 'Conversion failed', status.code || 'EXTRACTION_FAILED');
    }
    if (status.done) {
      return status;
    }
    if (Date.now() - lastChange > stallMs) {
      throw new ConverterApiError(
        'Conversion stalled. Try MP3 320 for long videos.',
        'TIMEOUT'
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new ConverterApiError(
    'Conversion stalled. Try MP3 320 for long videos.',
    'TIMEOUT'
  );
}
