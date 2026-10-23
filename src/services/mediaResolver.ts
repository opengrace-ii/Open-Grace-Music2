export interface ResolvedMedia {
  id: string;
  title: string;
  artist: string;
  album: string;
  thumbnailUrl: string;
  source: 'YOUTUBE' | 'DIRECT_URL';
  originalUrl: string;
  probableFormat: string;
  directAudioUrl?: string;
  ytVideoId?: string;
}

const YT_REGEX = /(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|[\?&]v=)([^#&?]{11})|^([^#&?]{11})$/i;

export function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.trim().match(YT_REGEX);
  return match ? (match[1] || match[2]) : null;
}

export async function resolveMediaUrl(rawUrl: string): Promise<ResolvedMedia> {
  const trimmed = rawUrl.trim();
  const normalized = !trimmed.startsWith('http://') && !trimmed.startsWith('https://')
    ? `https://${trimmed}`
    : trimmed;

  const ytId = extractYouTubeId(normalized);

  if (ytId) {
    let title = `YouTube Track (${ytId})`;
    let artist = 'Open Grace Music';
    const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

    // Try YouTube oEmbed
    try {
      const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`;
      const res = await fetch(oEmbedUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.title) title = json.title;
        if (json.author_name) artist = json.author_name;
      }
    } catch {
      // Fallback
    }

    return {
      id: `yt_${ytId}_${Date.now().toString(36)}`,
      title,
      artist,
      album: 'YouTube Audio Library',
      thumbnailUrl,
      source: 'YOUTUBE',
      originalUrl: normalized,
      probableFormat: 'MP3',
      ytVideoId: ytId,
      directAudioUrl: '',
    };
  }

  // Direct Audio URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error('Please enter a valid HTTP or HTTPS URL.');
  }

  const pathname = parsedUrl.pathname;
  const filename = decodeURIComponent(pathname.split('/').pop() || 'Imported Audio');
  const ext = (filename.split('.').pop() || 'mp3').toUpperCase();
  const cleanTitle = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') || 'Direct Stream';

  return {
    id: `dir_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    title: cleanTitle,
    artist: parsedUrl.hostname,
    album: 'Web Imports',
    thumbnailUrl: '',
    source: 'DIRECT_URL',
    originalUrl: normalized,
    probableFormat: ext,
    directAudioUrl: `/api/proxy-audio?url=${encodeURIComponent(normalized)}`,
  };
}
