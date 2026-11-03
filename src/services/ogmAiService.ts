import { apiUrl, fetchWithTimeout } from './converterApi';
import { loadSavedYoutubeCookies } from './youtubeCookies';
import { loadYoutubeOauthRefreshToken } from './youtubeOauth';

export const AI_KEYS_HINT =
  'Add GEMINI_API_KEY or NVIDIA_API_KEY in Settings / .env to transcribe here.';

const GEMINI_LS_KEY = 'ogm_gemini_api_key';
const NVIDIA_LS_KEY = 'ogm_nvidia_api_key';

export interface AiStatus {
  gemini: boolean;
  nvidia: boolean;
}

/** Client-held keys so Settings → AI routes still work after a server restart. Never logged. */
export function loadLocalAiKeys(): { geminiApiKey: string; nvidiaApiKey: string } {
  if (typeof window === 'undefined') return { geminiApiKey: '', nvidiaApiKey: '' };
  try {
    return {
      geminiApiKey: (localStorage.getItem(GEMINI_LS_KEY) || '').trim(),
      nvidiaApiKey: (localStorage.getItem(NVIDIA_LS_KEY) || '').trim(),
    };
  } catch {
    return { geminiApiKey: '', nvidiaApiKey: '' };
  }
}

export function saveLocalAiKeys(keys: { geminiApiKey?: string; nvidiaApiKey?: string }): void {
  if (typeof window === 'undefined') return;
  try {
    if (keys.geminiApiKey?.trim()) localStorage.setItem(GEMINI_LS_KEY, keys.geminiApiKey.trim());
    if (keys.nvidiaApiKey?.trim()) localStorage.setItem(NVIDIA_LS_KEY, keys.nvidiaApiKey.trim());
  } catch {
    // ignore quota / private mode
  }
}

export function hasLocalAiKeys(): boolean {
  const k = loadLocalAiKeys();
  return Boolean(k.geminiApiKey || k.nvidiaApiKey);
}

/** Merge client keys into AI POST bodies so server routes receive them every call. */
function withClientAiKeys(body: Record<string, unknown>): Record<string, unknown> {
  const local = loadLocalAiKeys();
  const cookies = loadSavedYoutubeCookies();
  const youtubeOauth = loadYoutubeOauthRefreshToken();
  return {
    ...body,
    ...(local.geminiApiKey ? { geminiApiKey: local.geminiApiKey } : {}),
    ...(local.nvidiaApiKey ? { nvidiaApiKey: local.nvidiaApiKey } : {}),
    ...(cookies ? { cookies } : {}),
    ...(youtubeOauth ? { youtubeOauth } : {}),
  };
}

export async function fetchAiStatus(): Promise<AiStatus> {
  const local = loadLocalAiKeys();
  try {
    const res = await fetchWithTimeout(apiUrl('/api/ai/status'), { timeoutMs: 8_000 });
    const data = (await res.json()) as Partial<AiStatus>;
    return {
      gemini: !!data.gemini || Boolean(local.geminiApiKey),
      nvidia: !!data.nvidia || Boolean(local.nvidiaApiKey),
    };
  } catch {
    return {
      gemini: Boolean(local.geminiApiKey),
      nvidia: Boolean(local.nvidiaApiKey),
    };
  }
}

export async function saveAiKeys(keys: { geminiApiKey?: string; nvidiaApiKey?: string }): Promise<AiStatus> {
  saveLocalAiKeys(keys);
  const local = loadLocalAiKeys();
  try {
    const res = await fetchWithTimeout(apiUrl('/api/ai/config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geminiApiKey: keys.geminiApiKey || undefined,
        nvidiaApiKey: keys.nvidiaApiKey || undefined,
      }),
      timeoutMs: 10_000,
    });
    const data = (await res.json()) as Partial<AiStatus>;
    return {
      gemini: !!data.gemini || Boolean(local.geminiApiKey),
      nvidia: !!data.nvidia || Boolean(local.nvidiaApiKey),
    };
  } catch {
    // Local keys remain; each AI request still sends them to the server.
    return {
      gemini: Boolean(local.geminiApiKey),
      nvidia: Boolean(local.nvidiaApiKey),
    };
  }
}

export async function fetchOgmTranscript(input: {
  videoId?: string;
  title?: string;
}): Promise<{ ok: boolean; content: string; source?: string }> {
  const res = await fetchWithTimeout(apiUrl('/api/ai/transcribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      withClientAiKeys({
        videoId: input.videoId || '',
        title: input.title || '',
      })
    ),
    timeoutMs: 120_000,
  });
  const data = (await res.json()) as {
    ok?: boolean;
    content?: string;
    error?: string;
    keysMissing?: boolean;
    needAudio?: boolean;
    source?: string;
  };
  if (data.ok && data.content) {
    return { ok: true, content: data.content, source: data.source };
  }
  return {
    ok: false,
    content: data.error || (data.keysMissing ? AI_KEYS_HINT : 'Transcript not available for this tape yet.'),
    source: data.source,
  };
}

export async function fetchListenNotes(transcript: string, title?: string): Promise<string> {
  const res = await fetchWithTimeout(apiUrl('/api/ai/listen-notes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withClientAiKeys({ transcript, title: title || '' })),
    timeoutMs: 60_000,
  });
  const data = (await res.json()) as { ok?: boolean; content?: string; error?: string };
  if (data.ok && data.content) return data.content;
  return data.error || AI_KEYS_HINT;
}

export async function fetchRelatedNext(input: {
  query?: string;
  title?: string;
  transcript?: string;
}): Promise<string[]> {
  const res = await fetchWithTimeout(apiUrl('/api/ai/related-next'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withClientAiKeys(input as Record<string, unknown>)),
    timeoutMs: 45_000,
  });
  const data = (await res.json()) as { queries?: string[] };
  return Array.isArray(data.queries) ? data.queries.filter(Boolean).slice(0, 3) : [];
}
