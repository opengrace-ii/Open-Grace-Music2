export interface YoutubeSearchHit {
  id: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  publishedText?: string;
}

export type YoutubeSearchSort = 'relevance' | 'date';

function collectRuns(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { simpleText?: string; runs?: { text?: string }[] };
  if (typeof n.simpleText === 'string') return n.simpleText;
  if (Array.isArray(n.runs)) return n.runs.map((r) => r.text || '').join('');
  return '';
}

function walkVideoRenderers(node: unknown, out: YoutubeSearchHit[]) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walkVideoRenderers(child, out);
    return;
  }
  if (typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  const renderer = (rec.videoRenderer || rec.compactVideoRenderer || rec.gridVideoRenderer) as
    | Record<string, unknown>
    | undefined;
  if (renderer && typeof renderer.videoId === 'string' && renderer.videoId.length === 11) {
    const id = renderer.videoId;
    const title = collectRuns(renderer.title) || 'YouTube video';
    const author =
      collectRuns(renderer.ownerText) ||
      collectRuns(renderer.shortBylineText) ||
      collectRuns(renderer.longBylineText) ||
      'YouTube';
    const publishedText =
      collectRuns(renderer.publishedTimeText) || collectRuns(renderer.publishedTime) || '';
    out.push({
      id,
      title,
      author,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedText: publishedText || undefined,
    });
    return;
  }
  for (const value of Object.values(rec)) walkVideoRenderers(value, out);
}

async function innertubePost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      Accept: '*/*',
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20241001.00.00',
          hl: 'en',
          gl: 'US',
        },
      },
      ...body,
    }),
  });
  if (!res.ok) {
    throw new Error(`YouTube search unavailable (${res.status})`);
  }
  return res.json();
}

function uniqueHits(hits: YoutubeSearchHit[], limit: number): YoutubeSearchHit[] {
  const seen = new Set<string>();
  const out: YoutubeSearchHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchYoutubeVideos(
  query: string,
  limit = 24,
  opts?: { sort?: YoutubeSearchSort }
): Promise<YoutubeSearchHit[]> {
  const q = query.trim();
  if (!q) return browseYoutubeHome(limit);
  const body: Record<string, unknown> = { query: q };
  // Innertube search filter: sort by upload date (newest first).
  if (opts?.sort === 'date') {
    body.params = 'CAI=';
  }
  const data = await innertubePost('search', body);
  const hits: YoutubeSearchHit[] = [];
  walkVideoRenderers(data, hits);
  const unique = uniqueHits(hits, limit);
  if (unique.length === 0 && opts?.sort === 'date') {
    return searchYoutubeVideos(q, limit, { sort: 'relevance' });
  }
  return unique;
}

export async function browseYoutubeHome(limit = 24): Promise<YoutubeSearchHit[]> {
  try {
    const data = await innertubePost('browse', { browseId: 'FEtrending' });
    const hits: YoutubeSearchHit[] = [];
    walkVideoRenderers(data, hits);
    const unique = uniqueHits(hits, limit);
    if (unique.length > 0) return unique;
  } catch {
    // fall through to music search
  }
  return searchYoutubeVideos('music', limit);
}
