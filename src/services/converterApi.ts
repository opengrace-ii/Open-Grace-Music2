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
        'Conversion timed out (over 2 minutes). Try MP3 on Wi‑Fi or retry in a moment.',
        'TIMEOUT'
      );
    }
    throw new ConverterApiError(
      'Cannot reach converter. Check AppDeploy / your network, or set a self-hosted server URL in Settings.',
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
        'Cannot reach converter. AppDeploy may be down, or set a self-hosted URL in Settings.',
      code: 'NETWORK',
    };
  }
  const message = err instanceof Error ? err.message : 'Failed to process audio';
  return { message, code: 'EXTRACTION_FAILED' };
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
    timeoutMs: 180_000,
  });
}

const STUDIO_LOSSLESS = new Set(['FLAC', 'ALAC', 'DSD', 'WAV']);

export function isStudioLosslessFormat(format: string): boolean {
  return STUDIO_LOSSLESS.has(format.toUpperCase());
}

export function studioFormatWarning(format: string): string | null {
  if (!isStudioLosslessFormat(format)) return null;
  return 'Studio master (FLAC/ALAC/DSD/WAV) — may take 2–5 min. MP3 320 is fastest (~20–60s).';
}

/** Poll job progress until done/error or timeout (default 3 min). */
export async function waitForConvertJob(
  jobId: string,
  onProgress?: (status: ConvertJobStatus) => void,
  timeoutMs = 180_000
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
    'Conversion timed out after 3 minutes. Try MP3 320 on Wi‑Fi or retry shortly.',
    'TIMEOUT'
  );
}
