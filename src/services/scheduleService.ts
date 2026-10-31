import {
  DEFAULT_SCHEDULE_TZ,
  FreshListenMode,
  ListenSchedule,
  TimePreset,
  Track,
  UserPlaylist,
} from '../types';
import { getAllPlaylists, getAllSchedules, getAllTracksFromDB, saveSchedule } from './storage';

export const PENDING_PLAY_KEY = 'ogm-pending-play';
export const TIME_PRESETS_KEY = 'ogm-time-presets';

/** Editable placeholders — not locked slots. Users change these in the Schedule panel. */
export const DEFAULT_TIME_PRESETS: TimePreset[] = [
  { id: 'morning', label: 'Morning', hour: 7, minute: 0 },
  { id: 'noon', label: 'Noon', hour: 12, minute: 0 },
  { id: 'evening', label: 'Evening', hour: 18, minute: 0 },
];

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface PendingPlay {
  playlistId?: string;
  trackId?: string;
  scheduleName?: string;
  freshQuery?: string;
  freshMode?: FreshListenMode;
  timeZone?: string;
  scheduleId?: string;
}

export interface ZonedClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  timeZone: string;
}

const WEEKDAY_FROM_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function scheduleTimeZone(schedule?: Pick<ListenSchedule, 'timeZone'> | string): string {
  if (typeof schedule === 'string') return schedule || DEFAULT_SCHEDULE_TZ;
  return (schedule?.timeZone || DEFAULT_SCHEDULE_TZ).trim() || DEFAULT_SCHEDULE_TZ;
}

export function zonedClock(at: Date, timeZone: string): ZonedClock {
  const tz = timeZone || DEFAULT_SCHEDULE_TZ;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return {
    year: parseInt(get('year'), 10) || at.getFullYear(),
    month: parseInt(get('month'), 10) || at.getMonth() + 1,
    day: parseInt(get('day'), 10) || at.getDate(),
    hour: parseInt(get('hour'), 10) || 0,
    minute: parseInt(get('minute'), 10) || 0,
    weekday: WEEKDAY_FROM_SHORT[get('weekday')] ?? 0,
    timeZone: tz,
  };
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedWallTimeToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string
): Date {
  let utc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  for (let i = 0; i < 4; i++) {
    const z = zonedClock(new Date(utc), timeZone);
    const actual = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, 0, 0);
    const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    utc += desired - actual;
  }
  return new Date(utc);
}

function addCalendarDays(year: number, month: number, day: number, add: number): {
  year: number;
  month: number;
  day: number;
} {
  const utc = new Date(Date.UTC(year, month - 1, day + add));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function formatPlayWhen(at: Date, timeZone: string): string {
  const tz = timeZone || DEFAULT_SCHEDULE_TZ;
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(at);
  const isIst = tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta';
  return `${formatted} ${isIst ? 'IST' : tz}`;
}

export function nextOccurrenceUtc(schedule: ListenSchedule, from = new Date()): Date | null {
  const tz = scheduleTimeZone(schedule);
  const z = zonedClock(from, tz);
  const forMatch = { ...schedule, enabled: true };
  for (let add = 0; add < 400; add++) {
    const ymd = addCalendarDays(z.year, z.month, z.day, add);
    const probeNoon = zonedWallTimeToUtc({ ...ymd, hour: 12, minute: 0 }, tz);
    if (!scheduleMatchesDate(forMatch, probeNoon)) continue;
    const slotted = zonedWallTimeToUtc(
      { ...ymd, hour: clampHour(schedule.hour), minute: clampMinute(schedule.minute) },
      tz
    );
    if (slotted.getTime() >= from.getTime() - 500) return slotted;
  }
  return null;
}

export function describeWhatPlays(
  schedule: ListenSchedule,
  playlists: UserPlaylist[],
  tracks: Track[]
): string {
  const mix = playlists.find((p) => p.id === schedule.playlistId);
  if (mix && mix.trackIds.length > 0) return `Mix: ${mix.name}`;
  const q = (schedule.freshQuery || '').trim();
  if (q) {
    const mode = schedule.freshMode === 'shuffle_recent' ? 'A recent match' : 'Newest match';
    return `${mode} for “${q}”`;
  }
  const tape = tracks.find((t) => t.id === schedule.trackId);
  if (tape) return `Tape: ${tape.title}`;
  if (mix) return `Mix: ${mix.name} (empty — add tapes or a fresh query)`;
  return 'Nothing linked yet';
}

export function pendingFromSchedule(schedule: ListenSchedule): PendingPlay {
  return {
    playlistId: schedule.playlistId,
    trackId: schedule.trackId,
    scheduleName: schedule.name,
    freshQuery: schedule.freshQuery,
    freshMode: schedule.freshMode || 'latest',
    timeZone: scheduleTimeZone(schedule),
    scheduleId: schedule.id,
  };
}

const CATCHUP_MS = 15 * 60 * 1000;

export function loadTimePresets(): TimePreset[] {
  try {
    const raw = localStorage.getItem(TIME_PRESETS_KEY);
    if (!raw) return DEFAULT_TIME_PRESETS.map((p) => ({ ...p }));
    const parsed = JSON.parse(raw) as TimePreset[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_TIME_PRESETS.map((p) => ({ ...p }));
    }
    return parsed.map((p, i) => ({
      id: p.id || DEFAULT_TIME_PRESETS[i]?.id || `preset_${i}`,
      label: (p.label || DEFAULT_TIME_PRESETS[i]?.label || `Time ${i + 1}`).trim() || `Time ${i + 1}`,
      hour: clampHour(p.hour),
      minute: clampMinute(p.minute),
    }));
  } catch {
    return DEFAULT_TIME_PRESETS.map((p) => ({ ...p }));
  }
}

export function saveTimePresets(presets: TimePreset[]): void {
  localStorage.setItem(TIME_PRESETS_KEY, JSON.stringify(presets));
}

export function clampHour(n: number): number {
  const v = Math.round(Number(n) || 0);
  return Math.min(23, Math.max(0, v));
}

export function clampMinute(n: number): number {
  const v = Math.round(Number(n) || 0);
  return Math.min(59, Math.max(0, v));
}

export function formatClock(hour: number, minute: number): string {
  return `${String(clampHour(hour)).padStart(2, '0')}:${String(clampMinute(minute)).padStart(2, '0')}`;
}

export function parseClock(value: string): { hour: number; minute: number } {
  const [h, m] = (value || '07:00').split(':');
  return { hour: clampHour(parseInt(h, 10)), minute: clampMinute(parseInt(m, 10)) };
}

export function lastDateOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function fireKeyFor(schedule: ListenSchedule, at: Date): string {
  const z = zonedClock(at, scheduleTimeZone(schedule));
  const y = z.year;
  const mo = String(z.month).padStart(2, '0');
  const d = String(z.day).padStart(2, '0');
  return `${y}-${mo}-${d}T${formatClock(schedule.hour, schedule.minute)}`;
}

export function scheduleMatchesDate(schedule: ListenSchedule, at: Date): boolean {
  if (!schedule.enabled) return false;
  const z = zonedClock(at, scheduleTimeZone(schedule));
  if (schedule.repeatKind === 'daily') return true;
  if (schedule.repeatKind === 'weekdays') {
    return (schedule.weekdays || []).includes(z.weekday);
  }
  if (schedule.repeatKind === 'monthly') {
    const last = lastDateOfMonth(z.year, z.month - 1);
    return (schedule.monthDays || []).some((day) => (day === 0 ? z.day === last : day === z.day));
  }
  return false;
}

export function isScheduleDue(schedule: ListenSchedule, at: Date, windowMs = CATCHUP_MS): boolean {
  if (!scheduleMatchesDate(schedule, at)) return false;
  const tz = scheduleTimeZone(schedule);
  const z = zonedClock(at, tz);
  const slotted = zonedWallTimeToUtc(
    {
      year: z.year,
      month: z.month,
      day: z.day,
      hour: clampHour(schedule.hour),
      minute: clampMinute(schedule.minute),
    },
    tz
  );
  const delta = at.getTime() - slotted.getTime();
  if (delta < 0 || delta > windowMs) return false;
  return schedule.lastFiredKey !== fireKeyFor(schedule, at);
}

export function writePendingPlay(pending: PendingPlay): void {
  try {
    sessionStorage.setItem(PENDING_PLAY_KEY, JSON.stringify(pending));
  } catch {
    // ignore
  }
}

export function readPendingPlay(): PendingPlay | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PLAY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingPlay;
    if (parsed?.playlistId || parsed?.trackId || parsed?.freshQuery) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearPendingPlay(): void {
  try {
    sessionStorage.removeItem(PENDING_PLAY_KEY);
  } catch {
    // ignore
  }
}

export function parsePlayHash(hash: string): PendingPlay | null {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw.includes('=') ? raw : `play=${raw}`);
  const play = params.get('play') || '';
  const track = params.get('track') || '';
  const freshQuery = (params.get('q') || params.get('fresh') || '').trim();
  const modeRaw = (params.get('mode') || '').trim();
  const freshMode: FreshListenMode = modeRaw === 'shuffle_recent' ? 'shuffle_recent' : 'latest';
  if (play === 'fresh' || (freshQuery && !play)) {
    return { freshQuery, freshMode, scheduleName: params.get('name') || undefined };
  }
  if (play.startsWith('pl_')) return { playlistId: play, freshQuery: freshQuery || undefined, freshMode };
  if (play.startsWith('track:')) {
    return { trackId: play.slice('track:'.length), freshQuery: freshQuery || undefined, freshMode };
  }
  if (track) return { trackId: track, freshQuery: freshQuery || undefined, freshMode };
  if (play) return { playlistId: play, freshQuery: freshQuery || undefined, freshMode };
  return null;
}

export function consumeLaunchPlayTarget(): PendingPlay | null {
  const fromHash = parsePlayHash(typeof window !== 'undefined' ? window.location.hash : '');
  const fromSession = readPendingPlay();
  const pending = fromHash || fromSession;
  if (fromHash && typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', url.pathname + url.search);
  }
  clearPendingPlay();
  return pending;
}

export function playUrlFor(pending: PendingPlay): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const q = (pending.freshQuery || '').trim();
  const mode = pending.freshMode === 'shuffle_recent' ? 'shuffle_recent' : 'latest';
  if (pending.playlistId) {
    const extra = q ? `&q=${encodeURIComponent(q)}&mode=${mode}` : '';
    return `${origin}${path}#play=${encodeURIComponent(pending.playlistId)}${extra}`;
  }
  if (pending.trackId) {
    const extra = q ? `&q=${encodeURIComponent(q)}&mode=${mode}` : '';
    return `${origin}${path}#play=track:${encodeURIComponent(pending.trackId)}${extra}`;
  }
  if (q) {
    return `${origin}${path}#play=fresh&q=${encodeURIComponent(q)}&mode=${mode}`;
  }
  return `${origin}${path}`;
}

export async function resolvePlayTarget(
  pending: PendingPlay,
  tracks?: Track[],
  playlists?: UserPlaylist[]
): Promise<{
  track: Track | null;
  playlistId: string | null;
  emptyMix: boolean;
  missing: boolean;
  useFresh: boolean;
}> {
  const listSource = playlists ?? (await getAllPlaylists());
  const trackSource = tracks ?? (await getAllTracksFromDB());
  const hasFresh = Boolean((pending.freshQuery || '').trim());
  if (pending.playlistId) {
    const pl = listSource.find((p) => p.id === pending.playlistId);
    if (!pl) {
      return {
        track: null,
        playlistId: pending.playlistId,
        emptyMix: false,
        missing: !hasFresh,
        useFresh: hasFresh,
      };
    }
    const firstId = pl.trackIds[0];
    if (!firstId) {
      return {
        track: null,
        playlistId: pl.id,
        emptyMix: !hasFresh,
        missing: false,
        useFresh: hasFresh,
      };
    }
    const track = trackSource.find((t) => t.id === firstId) ?? null;
    if (track) {
      return { track, playlistId: pl.id, emptyMix: false, missing: false, useFresh: false };
    }
    return {
      track: null,
      playlistId: pl.id,
      emptyMix: !hasFresh,
      missing: false,
      useFresh: hasFresh,
    };
  }
  if (pending.trackId) {
    const track = trackSource.find((t) => t.id === pending.trackId) ?? null;
    if (track) {
      return { track, playlistId: null, emptyMix: false, missing: false, useFresh: false };
    }
    return { track: null, playlistId: null, emptyMix: false, missing: !hasFresh, useFresh: hasFresh };
  }
  if (hasFresh) {
    return { track: null, playlistId: null, emptyMix: false, missing: false, useFresh: true };
  }
  return { track: null, playlistId: null, emptyMix: false, missing: true, useFresh: false };
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showListenNotification(
  schedule: ListenSchedule,
  mixLabel: string
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;

  const pending = pendingFromSchedule(schedule);

  const title = schedule.name || 'Listen reminder';
  const query = (schedule.freshQuery || '').trim();
  const body = mixLabel
    ? `Tap to play ${mixLabel}.`
    : query
      ? `Tap to play newest match for “${query}”.`
      : 'Tap to open Open Grace Music and play.';
  const tag = `ogm-sched-${schedule.id}-${fireKeyFor(schedule, new Date())}`;
  const options: NotificationOptions = {
    body,
    icon: '/pwa-192.png',
    badge: '/logo.png',
    tag,
    data: {
      url: playUrlFor(pending),
      playlistId: schedule.playlistId,
      trackId: schedule.trackId,
      scheduleId: schedule.id,
      freshQuery: pending.freshQuery,
      freshMode: pending.freshMode,
    },
    requireInteraction: true,
  };

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // fall through to page Notification
  }

  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      writePendingPlay(pending);
      window.focus();
      window.dispatchEvent(new CustomEvent('ogm-play-schedule', { detail: pending }));
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export async function markScheduleFired(schedule: ListenSchedule, at = new Date()): Promise<ListenSchedule> {
  const next = { ...schedule, lastFiredKey: fireKeyFor(schedule, at) };
  await saveSchedule(next);
  return next;
}

export async function collectDueSchedules(at = new Date()): Promise<ListenSchedule[]> {
  const all = await getAllSchedules();
  return all.filter((s) => isScheduleDue(s, at));
}

export async function registerPeriodicScheduleSync(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const periodic = (reg as ServiceWorkerRegistration & {
      periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
    }).periodicSync;
    if (!periodic) return false;
    await periodic.register('ogm-listen-schedule', { minInterval: 15 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

export function describeRepeat(schedule: ListenSchedule): string {
  if (schedule.repeatKind === 'daily') return 'Every day';
  if (schedule.repeatKind === 'weekdays') {
    const days = (schedule.weekdays || [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d] || String(d));
    return days.length ? days.join(' · ') : 'No weekdays selected';
  }
  const days = (schedule.monthDays || []).slice().sort((a, b) => a - b);
  if (!days.length) return 'No month days selected';
  return days.map((d) => (d === 0 ? 'Last day' : String(d))).join(', ');
}
