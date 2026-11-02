export interface LastNotifiedListen {
  title: string;
  ytVideoId?: string;
  query?: string;
  scheduleName: string;
  freshMode?: 'latest' | 'shuffle_recent';
  playlistId?: string;
  trackId?: string;
  at: number;
}

const STORAGE_KEY = 'ogm-last-notified-listen';

export function loadLastNotifiedListen(): LastNotifiedListen | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastNotifiedListen;
    if (!parsed || typeof parsed !== 'object') return null;
    const scheduleName = (parsed.scheduleName || '').trim();
    const title = (parsed.title || scheduleName).trim();
    if (!title && !scheduleName && !parsed.query && !parsed.ytVideoId) return null;
    return {
      title: title || scheduleName || 'Listen reminder',
      ytVideoId: parsed.ytVideoId || undefined,
      query: (parsed.query || '').trim() || undefined,
      scheduleName: scheduleName || title || 'Listen reminder',
      freshMode: parsed.freshMode === 'shuffle_recent' ? 'shuffle_recent' : 'latest',
      playlistId: parsed.playlistId || undefined,
      trackId: parsed.trackId || undefined,
      at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveLastNotifiedListen(item: LastNotifiedListen): LastNotifiedListen {
  const next: LastNotifiedListen = {
    ...item,
    title: (item.title || item.scheduleName || 'Listen reminder').trim(),
    scheduleName: (item.scheduleName || item.title || 'Listen reminder').trim(),
    query: (item.query || '').trim() || undefined,
    ytVideoId: item.ytVideoId || undefined,
    at: item.at || Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota / private mode
  }
  return next;
}
