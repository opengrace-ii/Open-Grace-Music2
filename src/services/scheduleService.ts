import { ListenSchedule, TimePreset, Track, UserPlaylist } from '../types';
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
  const y = at.getFullYear();
  const mo = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}T${formatClock(schedule.hour, schedule.minute)}`;
}

export function scheduleMatchesDate(schedule: ListenSchedule, at: Date): boolean {
  if (!schedule.enabled) return false;
  if (schedule.repeatKind === 'daily') return true;
  if (schedule.repeatKind === 'weekdays') {
    return (schedule.weekdays || []).includes(at.getDay());
  }
  if (schedule.repeatKind === 'monthly') {
    const dom = at.getDate();
    const last = lastDateOfMonth(at.getFullYear(), at.getMonth());
    return (schedule.monthDays || []).some((day) => (day === 0 ? dom === last : day === dom));
  }
  return false;
}

export function isScheduleDue(schedule: ListenSchedule, at: Date, windowMs = CATCHUP_MS): boolean {
  if (!scheduleMatchesDate(schedule, at)) return false;
  const slotted = new Date(at);
  slotted.setHours(clampHour(schedule.hour), clampMinute(schedule.minute), 0, 0);
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
    if (parsed?.playlistId || parsed?.trackId) return parsed;
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
  if (play.startsWith('pl_')) return { playlistId: play };
  if (play.startsWith('track:')) return { trackId: play.slice('track:'.length) };
  if (track) return { trackId: track };
  if (play) return { playlistId: play };
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
  if (pending.playlistId) return `${origin}${path}#play=${encodeURIComponent(pending.playlistId)}`;
  if (pending.trackId) return `${origin}${path}#play=track:${encodeURIComponent(pending.trackId)}`;
  return `${origin}${path}`;
}

export async function resolvePlayTarget(
  pending: PendingPlay,
  tracks?: Track[],
  playlists?: UserPlaylist[]
): Promise<{ track: Track | null; playlistId: string | null; emptyMix: boolean; missing: boolean }> {
  const listSource = playlists ?? (await getAllPlaylists());
  const trackSource = tracks ?? (await getAllTracksFromDB());
  if (pending.playlistId) {
    const pl = listSource.find((p) => p.id === pending.playlistId);
    if (!pl) return { track: null, playlistId: pending.playlistId, emptyMix: false, missing: true };
    const firstId = pl.trackIds[0];
    if (!firstId) return { track: null, playlistId: pl.id, emptyMix: true, missing: false };
    const track = trackSource.find((t) => t.id === firstId) ?? null;
    return { track, playlistId: pl.id, emptyMix: !track, missing: false };
  }
  if (pending.trackId) {
    const track = trackSource.find((t) => t.id === pending.trackId) ?? null;
    return { track, playlistId: null, emptyMix: false, missing: !track };
  }
  return { track: null, playlistId: null, emptyMix: false, missing: true };
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

  const pending: PendingPlay = {
    playlistId: schedule.playlistId,
    trackId: schedule.trackId,
    scheduleName: schedule.name,
  };

  const title = schedule.name || 'Listen reminder';
  const body = mixLabel
    ? `Tap to play ${mixLabel}.`
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
