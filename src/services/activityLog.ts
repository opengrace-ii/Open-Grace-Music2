/**
 * Activity / Download log.
 *
 * A visible, persisted record of every recording, import, and conversion so the
 * user can tell, after the fact, whether a tape actually landed in the Library
 * as an OFFLINE file, FAILED, or was kept as an ONLINE-ONLY live YouTube tape.
 *
 * Persisted to localStorage (metadata only — never audio bytes), capped at the
 * most recent MAX_ENTRIES so it cannot grow without bound.
 */

const STORAGE_KEY = 'ogm_activity_log_v1';
const MAX_ENTRIES = 200;

/** IST is the user's clock; the log always shows an IST stamp. */
export const ACTIVITY_LOG_TZ = 'Asia/Kolkata';

/** What happened to the tape. */
export type ActivityResult =
  /** Recording / import / conversion kicked off. */
  | 'started'
  /** Intermediate server-job stage (validate / extract / ffmpeg / save). */
  | 'progress'
  /** A real offline file is now in the Library (Track.blob stored). */
  | 'saved'
  /** Nothing was saved — includes the reason. */
  | 'failed'
  /** Could not download; kept (or offered) as a live YouTube stream only. */
  | 'online-only'
  /** Neutral informational note. */
  | 'info';

/** Broad category of the thing the user did. */
export type ActivityAction =
  | 'record'
  | 'import'
  | 'convert'
  | 'listen-live';

export interface ActivityEntry {
  id: string;
  /** Epoch milliseconds. */
  ts: number;
  action: ActivityAction;
  /** Human label for the action, e.g. "Record YouTube". */
  label: string;
  result: ActivityResult;
  /** Chosen/target format (MP3, FLAC, …) when relevant. */
  format?: string;
  /** Final file size in bytes when saved. */
  sizeBytes?: number;
  /** Short reason / extra detail (failure cause, stage, source URL, filename). */
  detail?: string;
  /** Source URL or filename (truncated for display). */
  source?: string;
}

type Listener = (entries: ActivityEntry[]) => void;

const listeners = new Set<Listener>();

function safeParse(raw: string | null): ActivityEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ActivityEntry =>
        e && typeof e === 'object' && typeof e.id === 'string' && typeof e.ts === 'number'
    );
  } catch {
    return [];
  }
}

export function getActivityLog(): ActivityEntry[] {
  if (typeof localStorage === 'undefined') return [];
  return safeParse(localStorage.getItem(STORAGE_KEY)).sort((a, b) => b.ts - a.ts);
}

function persist(entries: ActivityEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  const capped = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // storage full / unavailable — drop silently, log is best-effort
  }
  listeners.forEach((fn) => {
    try {
      fn(capped);
    } catch {
      // ignore listener errors
    }
  });
}

/** Append one event and return it. Newest-first ordering is applied on read. */
export function logActivity(
  entry: Omit<ActivityEntry, 'id' | 'ts'> & { ts?: number }
): ActivityEntry {
  const full: ActivityEntry = {
    id: `al_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: entry.ts ?? Date.now(),
    action: entry.action,
    label: entry.label,
    result: entry.result,
    format: entry.format,
    sizeBytes: entry.sizeBytes,
    detail: entry.detail,
    source: entry.source,
  };
  const current = getActivityLog();
  persist([full, ...current]);
  return full;
}

export function clearActivityLog(): void {
  persist([]);
}

export function subscribeActivityLog(listener: Listener): () => void {
  listeners.add(listener);
  listener(getActivityLog());
  return () => {
    listeners.delete(listener);
  };
}

/** Trim a URL/filename for compact display without losing the identifying tail. */
export function shortenSource(source: string | undefined | null, max = 64): string {
  if (!source) return '';
  const s = source.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** IST clock string, e.g. "3 Nov 2026, 11:07:45 am IST". */
export function formatIst(ts: number): string {
  try {
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone: ACTIVITY_LOG_TZ,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(ts) + ' IST'
    );
  } catch {
    return new Date(ts).toISOString();
  }
}

/** Full plain-text dump of one log row (action, format, status, details, URL, clocks). */
export function formatActivityEntryText(entry: ActivityEntry): string {
  const lines: string[] = [
    `${String(entry.result || 'info').toUpperCase()} · ${entry.action}${
      entry.format ? ` · ${entry.format}` : ''
    }`,
    entry.label || '',
  ];
  if (entry.detail) lines.push(entry.detail);
  if (entry.source) lines.push(`URL: ${entry.source}`);
  if (entry.sizeBytes) lines.push(`Size: ${formatBytes(entry.sizeBytes)}`);
  lines.push(`IST: ${formatIst(entry.ts)}`);
  lines.push(`Device: ${formatLocal(entry.ts)}`);
  return lines.filter((line) => line.length > 0).join('\n');
}

/** Newest-first dump. `versionLine` is the app stamp (same idea as the footer). */
export function formatActivityLogDump(entries: ActivityEntry[], versionLine: string): string {
  const newestFirst = [...entries].sort((a, b) => b.ts - a.ts);
  const header = [
    versionLine.trim() || 'Open Grace Music',
    `Activity log · ${newestFirst.length} event${newestFirst.length === 1 ? '' : 's'} · newest first`,
  ].join('\n');
  if (newestFirst.length === 0) return `${header}\n\n(empty)\n`;
  return `${header}\n\n${newestFirst.map(formatActivityEntryText).join('\n\n---\n\n')}\n`;
}

/** The device's own local clock (whatever timezone the phone is set to). */
export function formatLocal(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(ts);
  } catch {
    return new Date(ts).toLocaleString();
  }
}
