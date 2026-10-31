import { apiUrl, fetchWithTimeout } from './converterApi';

export const AI_KEYS_HINT =
  'Add GEMINI_API_KEY or NVIDIA_API_KEY in Settings / .env to transcribe here.';

export interface AiStatus {
  gemini: boolean;
  nvidia: boolean;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetchWithTimeout(apiUrl('/api/ai/status'), { timeoutMs: 8_000 });
    const data = (await res.json()) as Partial<AiStatus>;
    return { gemini: !!data.gemini, nvidia: !!data.nvidia };
  } catch {
    return { gemini: false, nvidia: false };
  }
}

export async function saveAiKeys(keys: { geminiApiKey?: string; nvidiaApiKey?: string }): Promise<AiStatus> {
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
  return { gemini: !!data.gemini, nvidia: !!data.nvidia };
}

export async function fetchOgmTranscript(input: {
  videoId?: string;
  title?: string;
}): Promise<{ ok: boolean; content: string; source?: string }> {
  const res = await fetchWithTimeout(apiUrl('/api/ai/transcribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId: input.videoId || '',
      title: input.title || '',
    }),
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
    body: JSON.stringify({ transcript, title: title || '' }),
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
    body: JSON.stringify(input),
    timeoutMs: 45_000,
  });
  const data = (await res.json()) as { queries?: string[] };
  return Array.isArray(data.queries) ? data.queries.filter(Boolean).slice(0, 3) : [];
}
