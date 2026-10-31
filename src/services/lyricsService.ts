import { LyricOrChord } from '../types';
import { apiUrl, fetchWithTimeout } from './converterApi';

export const LYRICS_UNAVAILABLE_MESSAGE = `Lyrics not available offline yet.

Open Grace Music does not ship placeholder lyrics. Verified lyrics may appear when:
• A match is found on lrclib.net (community lyrics database), or
• GEMINI_API_KEY / NVIDIA_API_KEY is configured for Studio AI (verify accuracy).

Tip: Search the song title in your browser or a lyrics app you trust.`;

export async function fetchVerifiedLyricsFromLrclib(
  title: string,
  artist: string
): Promise<LyricOrChord | null> {
  try {
    const params = new URLSearchParams({ track: title });
    if (artist) params.set('artist', artist);
    const res = await fetchWithTimeout(apiUrl(`/api/lyrics/search?${params.toString()}`), {
      timeoutMs: 20_000,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      found?: boolean;
      title?: string;
      artist?: string;
      content?: string;
      instrumental?: boolean;
      source?: string;
    };
    if (!data.found || !data.content) return null;
    return {
      title: data.title || title,
      artist: data.artist || artist || 'Unknown Artist',
      isInstrumental: !!data.instrumental,
      content: `${data.content}\n\n— Source: ${data.source || 'lrclib.net'} (community submitted; verify accuracy)`,
    };
  } catch {
    return null;
  }
}

/** lrclib.net lookup only — no fabricated placeholder lyrics. */
export async function fetchAiLyricsOrChord(title: string, artist: string): Promise<LyricOrChord> {
  const verified = await fetchVerifiedLyricsFromLrclib(title, artist);
  if (verified) return verified;
  return unavailableLyrics(title, artist);
}

export async function fetchYoutubeTranscript(videoId: string): Promise<string | null> {
  if (!videoId || videoId.length !== 11) return null;
  try {
    const res = await fetchWithTimeout(
      apiUrl(`/api/transcript?videoId=${encodeURIComponent(videoId)}`),
      { timeoutMs: 20_000 }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { found?: boolean; content?: string };
    if (!data.found || !data.content) return null;
    return data.content;
  } catch {
    return null;
  }
}

export function unavailableTranscript(title: string, artist: string): string {
  return `Transcript not available for this tape yet.

Open Grace Music transcribes with Gemini or NVIDIA from a short audio clip of this exact video — not YouTube captions as the primary source. Add GEMINI_API_KEY or NVIDIA_API_KEY in Settings / .env. We never invent sermon text.

Track: ${title}
Artist: ${artist || 'Unknown'}`;
}

export function unavailableLyrics(title: string, artist: string): LyricOrChord {
  return {
    title,
    artist: artist || 'Open Grace Music',
    isInstrumental: false,
    content: `${LYRICS_UNAVAILABLE_MESSAGE}\n\nTrack: ${title}\nArtist: ${artist || 'Unknown'}`,
  };
}

/** @deprecated Removed fake template lyrics — use fetchAiLyricsOrChord */
export function generateLocalLyricsOrChord(title: string, artist: string): LyricOrChord {
  return unavailableLyrics(title, artist);
}
