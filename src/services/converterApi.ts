import { resolveConverterApiBaseUrl } from './converterServerUrl';

export type ConverterErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'YOUTUBE_BOT_CHECK'
  | 'EXTRACTION_FAILED'
  | 'FFMPEG_FAILED'
  | 'INVALID_RESPONSE'
  | 'API_UNAVAILABLE';

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
      'Cannot reach converter. Check Render / your network, or set a self-hosted server URL in Settings.',
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
      const code = data.code || 'EXTRACTION_FAILED';
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
      message:
        'Cannot reach converter. Render may be down, or set a self-hosted URL in Settings.',
      code: 'NETWORK',
    };
  }
  const message = err instanceof Error ? err.message : 'Failed to process audio';
  return { message, code: 'EXTRACTION_FAILED' };
}

/** One accurate sentence for the recorder. Never says Connect YouTube when already connected. */
export function recordFailureSentence(
  format: string,
  serverMessage: string,
  code: ConverterErrorCode,
  onDeviceFailure: string | null,
  youtubeConnected: boolean
): string {
  const blob = `${serverMessage} ${onDeviceFailure || ''} ${code}`.toLowerCase();
  if (code === 'TIMEOUT' || /timed out|timeout/.test(blob)) {
    return `Couldn’t save this as ${format}. Conversion timed out — try MP3 320 or retry on Wi‑Fi.`;
  }
  if (
    code === 'YOUTUBE_BOT_CHECK' ||
    /login_required|asked for a login|sign in|not a bot|cookies are needed/.test(blob)
  ) {
    return youtubeConnected
      ? `Couldn’t save this as ${format}. YouTube asked for a login again — reconnect and retry.`
      : `Couldn’t save this as ${format}. Connect YouTube and retry.`;
  }
  if (/did not match|different video/.test(blob)) {
    return `Couldn’t save this as ${format}. YouTube resolved a different video — retry this exact URL.`;
  }
  if (/http 403|blocked this stream/.test(blob)) {
    return youtubeConnected
      ? `Couldn’t save this as ${format}. YouTube blocked the stream (403). Play the video, then retry.`
      : `Couldn’t save this as ${format}. Connect YouTube and retry.`;
  }
  if (
    code === 'EXTRACTION_FAILED' ||
    /missed this video|no audio|no stream|could not fetch|no playable/.test(blob)
  ) {
    return youtubeConnected
      ? `Couldn’t save this as ${format}. No playable audio stream for this video. Play it, then retry Record.`
      : `Couldn’t save this as ${format}. Connect YouTube and retry.`;
  }
  return `Couldn’t save this as ${format}. ${serverMessage}`;
}

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

export type ConvertJobStage = 'validate' | 'extract' | 'ffmpeg' | 'save' | 'done' | 'error';

export interface ConvertJobStatus {
  jobId: string;
  stage: ConvertJobStage;
  percent: number;
  message: string;
  done: boolean;
  error?: string;
  code?: ConverterErrorCode;
}

export interface StartConvertJobBody {
  url: string;
  format: string;
  bitrate?: number;
  cookies?: string;
  /** YouTube TV oauth refresh token from Connect YouTube (web). Never log. */
  youtubeOauth?: string;
  title?: string;
  artist?: string;
}

export async function startConvertJob(body: StartConvertJobBody): Promise<{ jobId: string }> {
  const res = await fetchWithTimeout(apiUrl('/api/convert-audio/start'), {
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
  const res = await fetchWithTimeout(apiUrl(`/api/convert-audio/job/${encodeURIComponent(jobId)}`), {
    timeoutMs: 15_000,
  });
  if (!res.ok) {
    throw await readConverterError(res);
  }
  return (await res.json()) as ConvertJobStatus;
}

export async function downloadConvertJobResult(jobId: string): Promise<Response> {
  return fetchWithTimeout(apiUrl(`/api/convert-audio/job/${encodeURIComponent(jobId)}/download`), {
    timeoutMs: 240_000,
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

/** Poll job progress until done/error or timeout (default 8 min — FLAC extract + FFmpeg). */
export async function waitForConvertJob(
  jobId: string,
  onProgress?: (status: ConvertJobStatus) => void,
  timeoutMs = 480_000
): Promise<ConvertJobStatus> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await fetchConvertJobStatus(jobId);
    onProgress?.(status);
    if (status.stage === 'error') {
      throw new ConverterApiError(status.error || 'Conversion failed', status.code || 'EXTRACTION_FAILED');
    }
    if (status.done) {
      return status;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new ConverterApiError(
    'Conversion timed out. Studio formats can take several minutes — retry or try MP3 320.',
    'TIMEOUT'
  );
}
