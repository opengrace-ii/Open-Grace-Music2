/**
 * Exact-video-id checks for yt-dlp sidecars. Never substitute a different
 * nonempty YouTube id. Empty / missing metadata is not a mismatch.
 */

export function normalizeYoutubeId(raw: string | null | undefined): string {
  return String(raw ?? '').trim();
}

export function youtubeIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeYoutubeId(a);
  const right = normalizeYoutubeId(b);
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

export type YoutubeIdInspect = {
  reportedId: string | null;
  extractorKey: string | null;
  extractor: string | null;
};

export type YoutubeIdMatchKind = 'match' | 'empty' | 'mismatch';

export type YoutubeIdMatchResult = {
  kind: YoutubeIdMatchKind;
  reportedId: string | null;
  extractorKey: string | null;
  extractor: string | null;
};

export function inspectInfoJson(raw: unknown): YoutubeIdInspect {
  const info = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = typeof info.id === 'string' ? info.id : null;
  const extractorKey = typeof info.extractor_key === 'string' ? info.extractor_key : null;
  const extractor = typeof info.extractor === 'string' ? info.extractor : null;
  return { reportedId: id, extractorKey, extractor };
}

/**
 * Match yt-dlp's reported id against the requested watch id.
 * - equal ignoring case/whitespace → match
 * - missing/blank reported id → empty (caller may accept the canonical-URL download)
 * - different nonempty id → mismatch (never substitute)
 */
export function matchExtractedYoutubeId(
  reportedId: string | null | undefined,
  expectedId: string,
  meta?: { extractorKey?: string | null; extractor?: string | null }
): YoutubeIdMatchResult {
  const reported = normalizeYoutubeId(reportedId);
  const extractorKey = meta?.extractorKey ?? null;
  const extractor = meta?.extractor ?? null;
  if (!reported) {
    return { kind: 'empty', reportedId: null, extractorKey, extractor };
  }
  if (youtubeIdsEqual(reported, expectedId)) {
    return { kind: 'match', reportedId: reported, extractorKey, extractor };
  }
  return { kind: 'mismatch', reportedId: reported, extractorKey, extractor };
}

export function describeYoutubeIdMatch(
  expectedId: string,
  result: YoutubeIdMatchResult
): string {
  const reported = result.reportedId || '(empty)';
  const extractor = result.extractorKey || result.extractor || '(none)';
  return `requested=${normalizeYoutubeId(expectedId) || '(empty)'} reported=${reported} extractor=${extractor} result=${result.kind}`;
}
