const STORAGE_KEY = 'ogm-tuner-search-chips';

function normalizeList(chips: unknown): string[] {
  if (!Array.isArray(chips)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of chips) {
    const label = typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : '';
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(label);
    if (next.length >= 24) break;
  }
  return next;
}

/** User-saved Studio Tuner searches. Never seeded with moods, genres, or speakers. */
export function loadTunerSearchChips(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveTunerSearchChips(chips: string[]): string[] {
  const next = normalizeList(chips);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function addTunerSearchChip(label: string, existing?: string[]): string[] {
  return saveTunerSearchChips([...(existing ?? loadTunerSearchChips()), label]);
}

export function removeTunerSearchChip(label: string, existing?: string[]): string[] {
  const key = label.replace(/\s+/g, ' ').trim().toLowerCase();
  return saveTunerSearchChips((existing ?? loadTunerSearchChips()).filter((c) => c.toLowerCase() !== key));
}
