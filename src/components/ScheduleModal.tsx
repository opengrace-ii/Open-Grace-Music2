import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, BellRing, CalendarDays, Clock, Play, Trash2, X } from 'lucide-react';
import { ListenSchedule, ScheduleRepeatKind, TimePreset, Track, UserPlaylist } from '../types';
import {
  DEFAULT_TIME_PRESETS,
  WEEKDAY_LABELS,
  describeRepeat,
  formatClock,
  lastDateOfMonth,
  loadTimePresets,
  notificationPermission,
  parseClock,
  requestNotificationPermission,
  saveTimePresets,
  scheduleMatchesDate,
  showListenNotification,
} from '../services/scheduleService';
import { createSchedule, deleteSchedule, getAllSchedules, saveSchedule } from '../services/storage';

interface ScheduleModalProps {
  isOpen: boolean;
  playlists: UserPlaylist[];
  tracks: Track[];
  onClose: () => void;
  onPlayNow: (playlistId?: string, trackId?: string) => void;
}

const emptyDraft = (): Omit<ListenSchedule, 'id' | 'createdAt' | 'lastFiredKey'> => ({
  name: '',
  playlistId: '',
  trackId: '',
  hour: 7,
  minute: 0,
  repeatKind: 'daily',
  weekdays: [1, 2, 3, 4, 5],
  monthDays: [1],
  enabled: true,
});

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  playlists,
  tracks,
  onClose,
  onPlayNow,
}) => {
  const [schedules, setSchedules] = useState<ListenSchedule[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('denied');
  const [presets, setPresets] = useState<TimePreset[]>(DEFAULT_TIME_PRESETS);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reload = async () => {
    setSchedules(await getAllSchedules());
  };

  useEffect(() => {
    if (!isOpen) return;
    setPermission(notificationPermission());
    setPresets(loadTimePresets());
    setDraft(emptyDraft());
    setEditingId(null);
    setFormError(null);
    void reload();
  }, [isOpen]);

  const enabledCount = schedules.filter((s) => s.enabled).length;

  const weekPreview = useMemo(() => {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    const startDay = start.getDay();
    start.setDate(start.getDate() - startDay);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const hits = schedules.filter((s) => s.enabled && scheduleMatchesDate(s, d));
      return { date: d, hits };
    });
  }, [schedules]);

  const monthCells = useMemo(() => {
    const first = new Date(viewMonth.year, viewMonth.month, 1);
    const lastNum = lastDateOfMonth(viewMonth.year, viewMonth.month);
    const pad = first.getDay();
    const cells: Array<{ date: Date | null; hits: ListenSchedule[] }> = [];
    for (let i = 0; i < pad; i++) cells.push({ date: null, hits: [] });
    for (let day = 1; day <= lastNum; day++) {
      const date = new Date(viewMonth.year, viewMonth.month, day, 12, 0, 0, 0);
      cells.push({
        date,
        hits: schedules.filter((s) => s.enabled && scheduleMatchesDate(s, date)),
      });
    }
    return cells;
  }, [schedules, viewMonth]);

  if (!isOpen) return null;

  const clockValue = formatClock(draft.hour, draft.minute);

  const handleAllow = async () => {
    const next = await requestNotificationPermission();
    setPermission(next);
  };

  const persistPresets = (next: TimePreset[]) => {
    setPresets(next);
    saveTimePresets(next);
  };

  const applyPreset = (preset: TimePreset) => {
    setDraft((d) => ({ ...d, hour: preset.hour, minute: preset.minute }));
  };

  const startEdit = (s: ListenSchedule) => {
    setEditingId(s.id);
    setDraft({
      name: s.name,
      playlistId: s.playlistId || '',
      trackId: s.trackId || '',
      hour: s.hour,
      minute: s.minute,
      repeatKind: s.repeatKind,
      weekdays: s.weekdays?.length ? [...s.weekdays] : [],
      monthDays: s.monthDays?.length ? [...s.monthDays] : [],
      enabled: s.enabled,
    });
    setFormError(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
  };

  const handleSave = async () => {
    const name = draft.name.replace(/\s+/g, ' ').trim();
    if (!name) {
      setFormError('Name this reminder yourself — for example Daily devotion.');
      return;
    }
    if (!draft.playlistId && !draft.trackId) {
      setFormError(playlists.length === 0 ? 'Make a mix first, then point this reminder at it.' : 'Pick a mix (or a single tape).');
      return;
    }
    if (draft.repeatKind === 'weekdays' && draft.weekdays.length === 0) {
      setFormError('Choose at least one weekday, or switch to daily.');
      return;
    }
    if (draft.repeatKind === 'monthly' && draft.monthDays.length === 0) {
      setFormError('Choose at least one day of the month, or Last day.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const payload = {
        name,
        playlistId: draft.playlistId || undefined,
        trackId: draft.playlistId ? undefined : draft.trackId || undefined,
        hour: draft.hour,
        minute: draft.minute,
        repeatKind: draft.repeatKind,
        weekdays: draft.repeatKind === 'weekdays' ? draft.weekdays : [],
        monthDays: draft.repeatKind === 'monthly' ? draft.monthDays : [],
        enabled: draft.enabled,
      };
      if (editingId) {
        const existing = schedules.find((s) => s.id === editingId);
        if (existing) {
          await saveSchedule({ ...existing, ...payload, lastFiredKey: existing.lastFiredKey });
        }
      } else {
        await createSchedule(payload);
      }
      await reload();
      resetForm();
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (s: ListenSchedule) => {
    await saveSchedule({ ...s, enabled: !s.enabled });
    await reload();
  };

  const handleDelete = async (id: string) => {
    await deleteSchedule(id);
    if (editingId === id) resetForm();
    await reload();
  };

  const handleTestBell = async (s: ListenSchedule) => {
    const mix = playlists.find((p) => p.id === s.playlistId);
    const shown = await showListenNotification(s, mix?.name || '');
    if (!shown) {
      setFormError(
        permission === 'denied'
          ? 'Notifications are blocked. Use Play now, or allow notifications in the browser.'
          : 'Could not show a system banner. Play now still works in this tab.'
      );
    }
  };

  const toggleWeekday = (day: number) => {
    setDraft((d) => {
      const has = d.weekdays.includes(day);
      return { ...d, weekdays: has ? d.weekdays.filter((x) => x !== day) : [...d.weekdays, day].sort((a, b) => a - b) };
    });
  };

  const toggleMonthDay = (day: number) => {
    setDraft((d) => {
      const has = d.monthDays.includes(day);
      return { ...d, monthDays: has ? d.monthDays.filter((x) => x !== day) : [...d.monthDays, day].sort((a, b) => a - b) };
    });
  };

  const mixName = (id?: string) => playlists.find((p) => p.id === id)?.name;
  const trackName = (id?: string) => tracks.find((t) => t.id === id)?.title;
  const monthTitle = new Date(viewMonth.year, viewMonth.month, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[94vh] overflow-y-auto cassette-card rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <BellRing className="w-5 h-5 text-[#e2c986] shrink-0" />
            <div className="min-w-0">
              <h3 className="font-serif-display font-bold text-[#f0ece1] text-lg">Listen schedule</h3>
              <p className="text-[11px] font-mono text-[#9fa396]">
                Name a reminder, pick your mix, set a time. Morning, noon, and evening are shortcuts you can edit.
              </p>
            </div>
          </div>
          <button type="button" className="cassette-btn p-2 text-[#9fa396]" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`mb-4 p-3 rounded-xl text-xs font-mono leading-relaxed ${
            permission === 'granted'
              ? 'cassette-window text-[#b8d99e]'
              : permission === 'denied'
                ? 'bg-[#2a1616] border border-[#522929] text-[#fca5a5]'
                : 'cassette-window text-[#e2c986]'
          }`}
        >
          {permission === 'unsupported' && (
            <p>This browser has no Notification API. Reminders can still toast in-app while this tab is open.</p>
          )}
          {permission === 'granted' && (
            <p>
              Banners are on. They fire while this tab or installed PWA can run. They are not a guaranteed alarm if the
              app is fully killed — especially on iPhone.
            </p>
          )}
          {permission === 'denied' && (
            <p>
              Notifications are blocked for this site. You will not get a system banner. Allow them in the browser site
              settings, or tap Play on the in-app toast while the app is open.
            </p>
          )}
          {permission === 'default' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="flex-1">
                Allow notifications so a tap on the banner opens the mix and plays the first tape.
              </p>
              <button type="button" className="cassette-btn cassette-btn-primary px-3 py-1.5 shrink-0" onClick={() => void handleAllow()}>
                Allow notifications
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-serif-display text-[#f0ece1] font-bold">Your reminders</h4>
              <span className="text-[10px] font-mono text-[#9fa396]">
                {enabledCount} on · {schedules.length} total
              </span>
            </div>

            {schedules.length === 0 ? (
              <div className="cassette-window rounded-2xl p-4 text-center space-y-2">
                <p className="font-serif-display text-[#f0ece1]">Nothing scheduled yet</p>
                <p className="text-[11px] font-mono text-[#9fa396] leading-relaxed">
                  You name it. Daily devotion is only an example — instrumental, messages, Hindi Christian, or any mix
                  you already made. No playlists are pre-loaded.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[32vh] lg:max-h-[40vh] overflow-y-auto pr-1">
                {schedules.map((s) => {
                  const mix = mixName(s.playlistId);
                  const tape = trackName(s.trackId);
                  return (
                    <div
                      key={s.id}
                      className={`cassette-btn w-full flex-col items-stretch px-3 py-2.5 text-left ${
                        editingId === s.id ? 'cassette-btn-engaged' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" className="min-w-0 text-left flex-1" onClick={() => startEdit(s)}>
                          <p className="font-serif-display text-sm text-[#f0ece1] truncate">{s.name}</p>
                          <p className="text-[10px] font-mono text-[#e2c986]">
                            {formatClock(s.hour, s.minute)} · {describeRepeat(s)}
                          </p>
                          <p className="text-[10px] font-mono text-[#9fa396] truncate">
                            {mix ? `Mix: ${mix}` : tape ? `Tape: ${tape}` : 'No mix linked'}
                          </p>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title={s.enabled ? 'Turn off' : 'Turn on'}
                            className="p-1 text-[#b8d99e]"
                            onClick={() => void handleToggle(s)}
                          >
                            {s.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4 text-[#686b60]" />}
                          </button>
                          <button
                            type="button"
                            title="Play mix now"
                            className="p-1 text-[#e2c986]"
                            onClick={() => onPlayNow(s.playlistId, s.trackId)}
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Test notification"
                            className="p-1 text-[#9fa396]"
                            onClick={() => void handleTestBell(s)}
                          >
                            <BellRing className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete reminder"
                            className="p-1 text-[#686b60] hover:text-[#f87171]"
                            onClick={() => void handleDelete(s.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="cassette-window rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#b8d99e]">
                <CalendarDays className="w-3.5 h-3.5" />
                <span>This week</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekPreview.map((cell) => (
                  <div key={cell.date.toISOString()} className="text-center">
                    <div className="text-[9px] font-mono text-[#9fa396]">{WEEKDAY_LABELS[cell.date.getDay()]}</div>
                    <div
                      className={`mt-0.5 rounded-lg py-1 text-[10px] font-mono ${
                        cell.hits.length ? 'bg-[#1a2116] text-[#b8d99e] border border-[#34402d]' : 'text-[#686b60]'
                      }`}
                      title={cell.hits.map((h) => h.name).join(', ')}
                    >
                      {cell.date.getDate()}
                      {cell.hits.length > 0 && <div className="text-[8px] truncate px-0.5">{cell.hits.length}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="cassette-window rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-[#b8d99e]">{monthTitle}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="cassette-btn px-2 py-0.5 text-[10px] font-mono"
                    onClick={() =>
                      setViewMonth((m) =>
                        m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }
                      )
                    }
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="cassette-btn px-2 py-0.5 text-[10px] font-mono"
                    onClick={() =>
                      setViewMonth((m) =>
                        m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }
                      )
                    }
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((d) => (
                  <div key={d} className="text-center text-[8px] font-mono text-[#686b60]">
                    {d}
                  </div>
                ))}
                {monthCells.map((cell, i) => (
                  <div
                    key={i}
                    className={`text-center rounded-md py-1 text-[10px] font-mono min-h-[1.6rem] ${
                      cell.date && cell.hits.length
                        ? 'bg-[#1a2116] text-[#b8d99e] border border-[#34402d]'
                        : 'text-[#9fa396]'
                    }`}
                    title={cell.hits.map((h) => `${h.name} ${formatClock(h.hour, h.minute)}`).join(', ')}
                  >
                    {cell.date ? cell.date.getDate() : ''}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-serif-display text-[#f0ece1] font-bold">
              {editingId ? 'Edit reminder' : 'New reminder'}
            </h4>

            {formError && (
              <p className="text-[11px] font-mono text-[#fca5a5] bg-[#2a1616] border border-[#522929] rounded-xl px-3 py-2">
                {formError}
              </p>
            )}

            <label className="block text-[11px] font-mono text-[#9fa396]">
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Daily devotion (you type this)"
                className="mt-1 w-full cassette-window rounded-xl px-3 py-2 bg-transparent text-sm text-[#f0ece1] placeholder-[#686b60] font-mono focus:outline-none"
              />
            </label>

            <label className="block text-[11px] font-mono text-[#9fa396]">
              Mix to play
              {playlists.length === 0 ? (
                <p className="mt-1 cassette-window rounded-xl px-3 py-2 text-[11px] text-[#e2c986]">
                  No mixes yet. Close this panel, tap NEW MIX, add tapes, then come back.
                </p>
              ) : (
                <select
                  value={draft.playlistId}
                  onChange={(e) => setDraft((d) => ({ ...d, playlistId: e.target.value, trackId: '' }))}
                  className="mt-1 w-full cassette-window rounded-xl px-3 py-2 bg-[#121510] text-sm text-[#f0ece1] font-mono focus:outline-none"
                >
                  <option value="">Choose a mix…</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.trackIds.length})
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="block text-[11px] font-mono text-[#9fa396]">
              Or a single tape (optional)
              <select
                value={draft.trackId}
                disabled={Boolean(draft.playlistId)}
                onChange={(e) => setDraft((d) => ({ ...d, trackId: e.target.value }))}
                className="mt-1 w-full cassette-window rounded-xl px-3 py-2 bg-[#121510] text-sm text-[#f0ece1] font-mono focus:outline-none disabled:opacity-40"
              >
                <option value="">None — prefer a mix</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#9fa396] mb-1">
                <Clock className="w-3.5 h-3.5 text-[#e2c986]" />
                Time of day
              </div>
              <input
                type="time"
                value={clockValue}
                onChange={(e) => {
                  const { hour, minute } = parseClock(e.target.value);
                  setDraft((d) => ({ ...d, hour, minute }));
                }}
                className="w-full cassette-window rounded-xl px-3 py-2 bg-transparent text-sm text-[#f0ece1] font-mono focus:outline-none"
              />
              <p className="mt-2 text-[10px] font-mono text-[#686b60]">Quick times — edit these; they are not locked slots.</p>
              <div className="mt-1 space-y-1.5">
                {presets.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="cassette-btn px-2.5 py-1 text-[11px] font-mono text-[#e2c986] shrink-0"
                      onClick={() => applyPreset(p)}
                    >
                      Use
                    </button>
                    <input
                      value={p.label}
                      onChange={(e) => {
                        const next = presets.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x));
                        persistPresets(next);
                      }}
                      className="w-24 cassette-window rounded-lg px-2 py-1 bg-transparent text-[11px] font-mono text-[#f0ece1] focus:outline-none"
                    />
                    <input
                      type="time"
                      value={formatClock(p.hour, p.minute)}
                      onChange={(e) => {
                        const { hour, minute } = parseClock(e.target.value);
                        const next = presets.map((x, i) => (i === idx ? { ...x, hour, minute } : x));
                        persistPresets(next);
                      }}
                      className="flex-1 cassette-window rounded-lg px-2 py-1 bg-transparent text-[11px] font-mono text-[#f0ece1] focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-mono text-[#9fa396] mb-1">Repeat</p>
              <div className="cassette-bank flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'daily' as ScheduleRepeatKind, label: 'Daily' },
                    { id: 'weekdays' as ScheduleRepeatKind, label: 'Week days' },
                    { id: 'monthly' as ScheduleRepeatKind, label: 'Month days' },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`cassette-btn px-3 py-1.5 text-[11px] font-mono ${
                      draft.repeatKind === opt.id ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                    }`}
                    onClick={() => setDraft((d) => ({ ...d, repeatKind: opt.id }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {draft.repeatKind === 'weekdays' && (
              <div>
                <p className="text-[11px] font-mono text-[#9fa396] mb-1">Week grid</p>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAY_LABELS.map((label, day) => {
                    const on = draft.weekdays.includes(day);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleWeekday(day)}
                        className={`cassette-btn px-0 py-2 text-[10px] font-mono justify-center ${
                          on ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {draft.repeatKind === 'monthly' && (
              <div>
                <p className="text-[11px] font-mono text-[#9fa396] mb-1">Days of the month</p>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const on = draft.monthDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleMonthDay(day)}
                        className={`cassette-btn px-0 py-1.5 text-[10px] font-mono justify-center ${
                          on ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => toggleMonthDay(0)}
                    className={`cassette-btn col-span-3 px-2 py-1.5 text-[10px] font-mono ${
                      draft.monthDays.includes(0) ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                    }`}
                  >
                    Last day
                  </button>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-[11px] font-mono text-[#f0ece1]">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
              />
              Reminder is on
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSave()}
                className="cassette-btn cassette-btn-primary px-4 py-2 text-xs font-mono"
              >
                {editingId ? 'Save changes' : 'Save reminder'}
              </button>
              {editingId && (
                <button type="button" className="cassette-btn px-4 py-2 text-xs font-mono text-[#9fa396]" onClick={resetForm}>
                  Cancel edit
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
