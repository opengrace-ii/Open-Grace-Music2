import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import { fetchYoutubeTranscript } from './youtubeTranscript.ts';

const execFileAsync = promisify(execFile);

export const AI_KEYS_HINT =
  'Add GEMINI_API_KEY or NVIDIA_API_KEY in Settings / .env to transcribe here.';

export function aiKeyStatus(): { gemini: boolean; nvidia: boolean } {
  return {
    gemini: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    nvidia: Boolean((process.env.NVIDIA_API_KEY || '').trim()),
  };
}

function geminiKey(): string {
  return (process.env.GEMINI_API_KEY || '').trim();
}

function nvidiaKey(): string {
  return (process.env.NVIDIA_API_KEY || '').trim();
}

function isLoginRequired(text: string): boolean {
  return /login_required|sign in to confirm|not a bot|cookies are needed|http error 403/i.test(
    text
  );
}

function ytDlpJsRuntimeArgs(): string[] {
  const nodeBin = process.execPath || 'node';
  return ['--js-runtimes', `node:${nodeBin}`, '--remote-components', 'ejs:github'];
}

async function extractShortMp3(videoId: string): Promise<
  | { ok: true; buffer: Buffer; mimeType: string }
  | { ok: false; loginRequired: boolean; error: string }
> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-ai-'));
  const outTemplate = path.join(workDir, 'clip.%(ext)s');
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    try {
      await execFileAsync(
        'yt-dlp',
        [
          '--no-playlist',
          '--no-warnings',
          '--socket-timeout',
          '15',
          '--retries',
          '1',
          '--download-sections',
          '*0:00-1:30',
          '-f',
          'bestaudio[ext=m4a]/bestaudio/best',
          '-x',
          '--audio-format',
          'mp3',
          '--audio-quality',
          '7',
          ...ytDlpJsRuntimeArgs(),
          '-o',
          outTemplate,
          watchUrl,
        ],
        { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 }
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const stderr =
        err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
      const combined = `${raw} ${stderr}`;
      if (isLoginRequired(combined)) {
        return {
          ok: false,
          loginRequired: true,
          error:
            'YouTube asked for a login to fetch audio. Title and description are not a transcript — we need the audio clip. Paste youtube.com cookies in Settings / the recorder key, or try again on Wi‑Fi.',
        };
      }
      return {
        ok: false,
        loginRequired: false,
        error: 'Could not extract a short audio clip for this video.',
      };
    }

    const files = fs.readdirSync(workDir).filter((f) => f.startsWith('clip.'));
    const mp3 = files.find((f) => f.endsWith('.mp3')) || files[0];
    if (!mp3) {
      return { ok: false, loginRequired: false, error: 'No audio file after extract.' };
    }
    const full = path.join(workDir, mp3);
    const buffer = fs.readFileSync(full);
    if (buffer.length < 2000) {
      return { ok: false, loginRequired: false, error: 'Audio clip was empty.' };
    }
    return { ok: true, buffer, mimeType: 'audio/mp3' };
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function geminiTranscribeAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
  const apiKey = geminiKey();
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Transcribe this audio faithfully for Open Grace Music. Use the spoken words. Do not invent a sermon, lyrics, or summary. If the clip is music without words, say so briefly. Plain text only.',
          },
          {
            inlineData: {
              mimeType,
              data: buffer.toString('base64'),
            },
          },
        ],
      },
    ],
  });
  const text = (response.text || '').trim();
  return text || null;
}

async function nvidiaTranscribeAudio(buffer: Buffer): Promise<string | null> {
  const apiKey = nvidiaKey();
  if (!apiKey) return null;
  try {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' }), 'clip.mp3');
    form.append('model', 'openai/whisper-large-v3');
    const res = await fetch('https://integrate.api.nvidia.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    const text = (data.text || '').trim();
    return text || null;
  } catch {
    return null;
  }
}

async function geminiText(prompt: string): Promise<string | null> {
  const apiKey = geminiKey();
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  const text = (response.text || '').trim();
  return text || null;
}

async function nvidiaChat(prompt: string): Promise<string | null> {
  const apiKey = nvidiaKey();
  if (!apiKey) return null;
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content || '').trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function transcribeForOgm(input: {
  videoId?: string;
  audioUrl?: string;
  title?: string;
}): Promise<{
  ok: boolean;
  source?: 'ogm-gemini' | 'ogm-nvidia' | 'youtube-captions';
  content?: string;
  needAudio?: boolean;
  keysMissing?: boolean;
  error?: string;
}> {
  const videoId = (input.videoId || '').trim();
  const keys = aiKeyStatus();

  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    if (!keys.gemini && !keys.nvidia) {
      const captions = await safeYoutubeCaptions(videoId);
      if (captions) return captions;
      return { ok: false, keysMissing: true, needAudio: false, error: AI_KEYS_HINT };
    }
    const clip = await extractShortMp3(videoId);
    if (clip.ok) {
      if (keys.gemini) {
        try {
          const text = await geminiTranscribeAudio(clip.buffer, clip.mimeType);
          if (text) {
            return {
              ok: true,
              source: 'ogm-gemini',
              content: `${text}\n\n— Source: Open Grace Music AI (Gemini). Verify accuracy.`,
            };
          }
        } catch {
          // try NVIDIA
        }
      }
      if (keys.nvidia) {
        const text = await nvidiaTranscribeAudio(clip.buffer);
        if (text) {
          return {
            ok: true,
            source: 'ogm-nvidia',
            content: `${text}\n\n— Source: Open Grace Music AI (NVIDIA). Verify accuracy.`,
          };
        }
      }
      if (!keys.gemini && !keys.nvidia) {
        const captions = await safeYoutubeCaptions(videoId);
        if (captions) return captions;
        return { ok: false, keysMissing: true, needAudio: false, error: AI_KEYS_HINT };
      }
    } else if (clip.loginRequired) {
      const captions = await safeYoutubeCaptions(videoId);
      if (captions) return captions;
      return { ok: false, needAudio: true, error: clip.error };
    } else {
      const captions = await safeYoutubeCaptions(videoId);
      if (captions) return captions;
      if (!keys.gemini && !keys.nvidia) {
        return { ok: false, keysMissing: true, needAudio: true, error: AI_KEYS_HINT };
      }
      return {
        ok: false,
        needAudio: true,
        error: clip.error || 'Need audio to transcribe. Title/description is not a transcript.',
      };
    }
  }

  if (!keys.gemini && !keys.nvidia) {
    return { ok: false, keysMissing: true, error: AI_KEYS_HINT };
  }

  return {
    ok: false,
    needAudio: true,
    error: 'Need audio (or a resolved YouTube id) to transcribe. Title and description are not a transcript.',
  };
}

async function safeYoutubeCaptions(videoId: string): Promise<{
  ok: true;
  source: 'youtube-captions';
  content: string;
} | null> {
  try {
    const result = await fetchYoutubeTranscript(videoId);
    if (result.found && result.content) {
      return {
        ok: true,
        source: 'youtube-captions',
        content: `${result.content.replace(/\n\n— Source:.*$/s, '').trim()}\n\n— Source: YouTube captions (last resort; not OGM AI).`,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function listenNotesFromTranscript(transcript: string, title?: string): Promise<{
  ok: boolean;
  content?: string;
  keysMissing?: boolean;
  error?: string;
}> {
  const text = transcript.trim();
  if (!text) {
    return { ok: false, error: 'Transcribe first so listen notes come from our own text.' };
  }
  const keys = aiKeyStatus();
  if (!keys.gemini && !keys.nvidia) {
    return { ok: false, keysMissing: true, error: AI_KEYS_HINT };
  }
  const prompt = `You write short listen notes for Open Grace Music (cassette player).
Summarize this talk or song in 4–6 short sentences for someone about to press play.
Use only the transcript. Do not invent speakers, scripture, or claims that are not in the text.
Title (may be empty): ${title || '(none)'}

Transcript:
${text.slice(0, 12000)}`;
  const out = (await geminiText(prompt)) || (await nvidiaChat(prompt));
  if (!out) {
    return { ok: false, error: 'AI notes failed. Try again, or check the API key.' };
  }
  return { ok: true, content: `${out}\n\n— Source: Open Grace Music AI listen notes. Verify accuracy.` };
}

export function heuristicRelatedQueries(seed: string): string[] {
  const q = seed.replace(/\s+/g, ' ').trim();
  if (!q) return [];
  return [`${q} latest`, `${q} today`, `${q} message`].slice(0, 3);
}

export async function relatedNextQueries(input: {
  query?: string;
  title?: string;
  transcript?: string;
}): Promise<{ ok: boolean; queries: string[]; keysMissing?: boolean; error?: string }> {
  const seed = (input.query || input.title || '').replace(/\s+/g, ' ').trim();
  const fallback = heuristicRelatedQueries(seed);
  const keys = aiKeyStatus();
  if (!keys.gemini && !keys.nvidia) {
    return {
      ok: fallback.length > 0,
      queries: fallback,
      keysMissing: true,
      error: fallback.length ? undefined : AI_KEYS_HINT,
    };
  }
  const prompt = `Suggest exactly 3 YouTube search queries to find a related next listen.
Stay in the same query family as this seed. Do not invent famous names that are not implied by the seed.
Return JSON only: {"queries":["...","...","..."]}
Seed: ${seed || '(none)'}
Transcript snippet: ${(input.transcript || '').slice(0, 1500)}`;
  const raw = (await geminiText(prompt)) || (await nvidiaChat(prompt));
  const parsed = parseQueryList(raw || '');
  const queries = parsed.length ? parsed.slice(0, 3) : fallback;
  return { ok: queries.length > 0, queries };
}

function parseQueryList(raw: string): string[] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]) as { queries?: unknown };
      if (Array.isArray(data.queries)) {
        return data.queries.map((q) => String(q).trim()).filter(Boolean);
      }
    } catch {
      // fall through
    }
  }
  return raw
    .split('\n')
    .map((l) => l.replace(/^\s*[\d\-*.]+[\.)]\s*/, '').replace(/^["']|["']$/g, '').trim())
    .filter((l) => l && !l.startsWith('{') && l.length < 80)
    .slice(0, 3);
}
