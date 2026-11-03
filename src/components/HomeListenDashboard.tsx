import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Disc3, FolderOpen, ListMusic, Loader2, Play, Youtube } from 'lucide-react';
import { AppPage, ListenSchedule, Track, UserPlaylist } from '../types';
import { LastNotifiedListen } from '../services/lastNotified';
import {
  describeWhatPlays,
  formatClock,
  formatPlayWhen,
  nextOccurrenceUtc,
  pendingFromSchedule,
  scheduleTimeZone,
  type PendingPlay,
} from '../services/scheduleService';
import { getAllSchedules } from '../services/storage';

interface HomeListenDashboardProps {
  libraryReady: boolean;
  playlists: UserPlaylist[];
  tracks: Track[];
  lastNotified: LastNotifiedListen | null;
  isPlaying: boolean;
  currentTrack: Track | null;
  listenQuery: string;
  onListenQueryChange: (value: string) => void;
  onListenSearch: (query: string) => void;
  onPlaySchedule: (pending: PendingPlay) => void;
  onPlayNotified: (item: LastNotifiedListen) => void;
  onOpenPage: (page: AppPage) => void;
}

export const HomeListenDashboard: React.FC<HomeListenDashboardProps> = ({
  libraryReady,
  playlists,
  tracks,
  lastNotified,
  isPlaying,
  currentTrack,
  listenQuery,
  onListenQueryChange,
  onListenSearch,
  onPlaySchedule,
  onPlayNotified,
  onOpenPage,
}) => {
  const [schedules, setSchedules] = useState<ListenSchedule[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!libraryReady) {
      setLoadState('loading');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const all = await getAllSchedules();
        if (cancelled) return;
        setSchedules(all);
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryReady, lastNotified?.at]);

  const nextUp = useMemo(() => {
    let best: { schedule: ListenSchedule; at: Date } | null = null;
    for (const schedule of schedules.filter((s) => s.enabled)) {
      const at = nextOccurrenceUtc(schedule);
      if (!at) continue;
      if (!best || at.getTime() < best.at.getTime()) best = { schedule, at };
    }
    return best;
  }, [schedules]);

  return (
    <section className="space-y-4">
      <div className="cassette-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a2116] border border-[#34402d] text-[#e2c986] text-[11px] font-mono tracking-widest uppercase">
          <span className={`cassette-led ${isPlaying ? 'cassette-led-on' : 'cassette-led-rec'}`} />
          <span>
            {isPlaying && currentTrack ? `Now spinning · ${currentTrack.format}` : 'Dual-platform audiophile lossless'}
          </span>
        </div>
        <h2 className="font-serif-display text-2xl sm:text-3xl font-bold italic text-[#f0ece1] tracking-tight">
          “Your music. Your quiet place.”
        </h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onListenSearch(listenQuery.trim());
          }}
        >
          <div className="relative flex-1 cassette-window rounded-xl flex items-center px-3 min-w-0">
            <Youtube className="w-4 h-4 text-[#f87171] shrink-0" />
            <input
              type="search"
              value={listenQuery}
              onChange={(e) => onListenQueryChange(e.target.value)}
              placeholder="Name a song, artist, or feeling…"
              className="w-full px-2.5 py-2.5 bg-transparent text-[#f0ece1] placeholder-[#686b60] text-sm focus:outline-none"
            />
          </div>
          <button type="submit" className="cassette-btn cassette-btn-primary px-4 py-2 text-xs font-mono shrink-0">
            LISTEN
          </button>
        </form>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              { id: 'library' as const, label: 'Library', Icon: Disc3 },
              { id: 'tuner' as const, label: 'Tuner', Icon: Youtube },
              { id: 'schedule' as const, label: 'Schedule', Icon: Bell },
              { id: 'library' as const, label: 'Mixes', Icon: ListMusic, mixes: true },
            ] as const
          ).map((item, idx) => (
            <button
              key={`${item.label}-${idx}`}
              type="button"
              onClick={() => onOpenPage(item.id)}
              className="cassette-btn flex-col gap-1 px-3 py-3 text-xs font-mono"
            >
              <item.Icon className="w-4 h-4 text-[#e2c986]" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpenPage('library')}
          className="cassette-btn w-full justify-center px-4 py-3 text-xs font-mono text-[#f0ece1]"
        >
          <FolderOpen className="w-4 h-4 text-[#b8d99e]" />
          <span>Library — Load Device Files lives there</span>
        </button>
        <p className="text-[11px] font-mono text-[#686b60] leading-relaxed">
          Songs already on this phone are imported from Library (⏏ LOAD DEVICE FILES), not from Listen. Studio AI is
          not a chat bot on this screen. Open a playing tape → full player STUDIO AI or NOTES → Transcript / Listen notes.
        </p>
      </div>

      <div className="cassette-card rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-serif-display text-lg font-bold text-[#f0ece1]">Next scheduled play</h3>
          <button
            type="button"
            className="text-[10px] font-mono text-[#e2c986]"
            onClick={() => onOpenPage('schedule')}
          >
            Edit
          </button>
        </div>
        {loadState === 'loading' && (
          <div className="cassette-window rounded-2xl p-4 flex items-center gap-2 text-xs font-mono text-[#b8d99e]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading reminders…
          </div>
        )}
        {loadState === 'error' && (
          <div className="p-4 rounded-2xl bg-[#2a1616] border border-[#522929] text-xs font-mono text-[#fca5a5]">
            Could not load reminders. Open Schedule and try again.
          </div>
        )}
        {loadState === 'ready' && !nextUp && (
          <div className="cassette-window rounded-2xl p-4 space-y-2">
            <p className="font-serif-display text-[#f0ece1]">Nothing on the clock yet</p>
            <p className="text-[11px] font-mono text-[#9fa396] leading-relaxed">
              Name a reminder in Schedule — devotion, messages, or a mix. It will show here with Play so you do not have
              to open that panel just to listen.
            </p>
            <button
              type="button"
              className="cassette-btn cassette-btn-primary px-4 py-2 text-xs font-mono"
              onClick={() => onOpenPage('schedule')}
            >
              Open schedule
            </button>
          </div>
        )}
        {loadState === 'ready' && nextUp && (
          <div className="cassette-window rounded-2xl p-4 space-y-3">
            <p className="font-serif-display text-lg font-bold text-[#f0ece1] break-words">{nextUp.schedule.name}</p>
            <p className="text-xs font-mono text-[#e2c986] break-words">
              {formatClock(nextUp.schedule.hour, nextUp.schedule.minute)}{' '}
              {scheduleTimeZone(nextUp.schedule) === 'Asia/Kolkata' ? 'IST' : scheduleTimeZone(nextUp.schedule)}
            </p>
            <p className="text-[11px] font-mono text-[#9fa396] break-words">
              {formatPlayWhen(nextUp.at, scheduleTimeZone(nextUp.schedule))}
            </p>
            <p className="text-xs font-mono text-[#b8d99e] break-words">
              {describeWhatPlays(nextUp.schedule, playlists, tracks)}
            </p>
            <button
              type="button"
              className="cassette-btn cassette-btn-primary w-full px-4 py-3 text-sm font-mono"
              onClick={() => onPlaySchedule(pendingFromSchedule(nextUp.schedule))}
            >
              <Play className="w-4 h-4 fill-current" />
              Play
            </button>
          </div>
        )}
      </div>

      <div className="cassette-card rounded-3xl p-5 space-y-3">
        <h3 className="font-serif-display text-lg font-bold text-[#f0ece1]">Last notified</h3>
        {!lastNotified ? (
          <div className="cassette-window rounded-2xl p-4">
            <p className="text-[11px] font-mono text-[#9fa396] leading-relaxed">
              When a reminder fires — or you tap a notification — the video, message, or mix lands here so you can play
              it from Home.
            </p>
          </div>
        ) : (
          <div className="cassette-window rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-mono text-[#e2c986] uppercase tracking-wider break-words">
              {lastNotified.scheduleName}
            </p>
            <p className="font-serif-display text-base font-bold text-[#f0ece1] break-words">{lastNotified.title}</p>
            {lastNotified.query && (
              <p className="text-[11px] font-mono text-[#9fa396] break-words">{lastNotified.query}</p>
            )}
            <button
              type="button"
              className="cassette-btn cassette-btn-primary w-full px-4 py-3 text-sm font-mono"
              onClick={() => onPlayNotified(lastNotified)}
            >
              <Play className="w-4 h-4 fill-current" />
              Play
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
