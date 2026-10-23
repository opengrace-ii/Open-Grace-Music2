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

/** Same-origin API base — required for PWA; relative paths break on file:// or cached shells. */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
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
      'Cannot reach converter. Open the app from the same server URL (not an offline file copy) and check your connection.',
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
        'Cannot reach converter. Open the app from the hosted server URL (not an offline copy) and check your connection.',
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
