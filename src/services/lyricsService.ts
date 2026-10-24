import { LyricOrChord } from '../types';
import { apiUrl, fetchWithTimeout } from './converterApi';

export const LYRICS_UNAVAILABLE_MESSAGE = `Lyrics not available offline yet.

Open Grace Music does not ship placeholder lyrics. Verified lyrics may appear when:
• A match is found on lrclib.net (community lyrics database), or
• GEMINI_API_KEY is configured on the server for AI-assisted transcription (verify accuracy).

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

export async function fetchAiLyricsOrChord(title: string, artist: string): Promise<LyricOrChord> {
  const verified = await fetchVerifiedLyricsFromLrclib(title, artist);
  if (verified) return verified;

  try {
    const res = await fetch('/api/generate-lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist }),
    });
    if (res.status === 503) {
      return unavailableLyrics(title, artist);
    }
    if (res.ok) {
      const data = await res.json();
      if (data && data.content) {
        return {
          ...data,
          content: `${data.content}\n\n— AI-generated (GEMINI). Verify accuracy against the recording.`,
        };
      }
    }
  } catch {
    // fall through
  }
  return unavailableLyrics(title, artist);
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
