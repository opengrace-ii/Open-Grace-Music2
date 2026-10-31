import { FreshListenMode, Track } from '../types';
import { apiUrl, fetchWithTimeout } from './converterApi';

export interface FreshListenHit {
  id: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  publishedText?: string;
}

export async function searchFreshYoutube(
  query: string,
  mode: FreshListenMode = 'latest'
): Promise<FreshListenHit[]> {
  const q = query.trim();
  if (!q) return [];
  const sort = mode === 'latest' || mode === 'shuffle_recent' ? 'date' : 'relevance';
  const path = `/api/youtube/search?q=${encodeURIComponent(q)}&sort=${sort}`;
  const res = await fetchWithTimeout(apiUrl(path), { timeoutMs: 25_000 });
  const json = (await res.json()) as { videos?: FreshListenHit[]; error?: string; ok?: boolean };
  return json.videos || [];
}

export function pickFreshHit(hits: FreshListenHit[], mode: FreshListenMode): FreshListenHit | null {
  if (!hits.length) return null;
  if (mode === 'shuffle_recent') {
    const pool = hits.slice(0, Math.min(8, hits.length));
    return pool[Math.floor(Math.random() * pool.length)] || pool[0];
  }
  return hits[0];
}

export function trackFromFreshHit(hit: FreshListenHit, query: string): Track {
  return {
    id: `yt_live_${hit.id}`,
    title: hit.title || query,
    artist: hit.author || 'YouTube',
    album: `Fresh listen · ${query}`,
    duration: 0,
    sizeBytes: 0,
    format: 'YouTube',
    mimeType: 'video/youtube',
    source: 'YOUTUBE',
    storageStatus: 'DEVICE_LOCAL',
    addedAt: Date.now(),
    thumbnailUrl: hit.thumbnailUrl || `https://i.ytimg.com/vi/${hit.id}/hqdefault.jpg`,
    bitrateKbps: 0,
    isFavorite: false,
    originalUrl: `https://www.youtube.com/watch?v=${hit.id}`,
    ytVideoId: hit.id,
  };
}

export async function resolveFreshListen(
  query: string,
  mode: FreshListenMode = 'latest'
): Promise<Track | null> {
  const hits = await searchFreshYoutube(query, mode);
  const hit = pickFreshHit(hits, mode);
  if (!hit) return null;
  return trackFromFreshHit(hit, query);
}
