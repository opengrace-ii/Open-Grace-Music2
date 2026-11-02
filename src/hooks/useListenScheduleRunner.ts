import { useEffect, useRef } from 'react';
import { ListenSchedule } from '../types';
import {
  collectDueSchedules,
  consumeLaunchPlayTarget,
  markScheduleFired,
  parsePlayHash,
  PendingPlay,
  readPendingPlay,
  registerPeriodicScheduleSync,
  showListenNotification,
} from '../services/scheduleService';
import { getAllPlaylists } from '../services/storage';
import { LastNotifiedListen, saveLastNotifiedListen } from '../services/lastNotified';

interface UseListenScheduleRunnerOptions {
  ready: boolean;
  onPlay: (pending: PendingPlay) => void;
  onInAppReminder: (schedule: ListenSchedule, pending: PendingPlay) => void;
  onNotified?: (item: LastNotifiedListen) => void;
}

export function useListenScheduleRunner({
  ready,
  onPlay,
  onInAppReminder,
  onNotified,
}: UseListenScheduleRunnerOptions) {
  const onPlayRef = useRef(onPlay);
  const onInAppRef = useRef(onInAppReminder);
  const onNotifiedRef = useRef(onNotified);
  onPlayRef.current = onPlay;
  onInAppRef.current = onInAppReminder;
  onNotifiedRef.current = onNotified;
  const checkingRef = useRef(false);
  const launchConsumedRef = useRef(false);

  useEffect(() => {
    if (!ready || launchConsumedRef.current) return;
    const pending = consumeLaunchPlayTarget();
    if (pending) {
      launchConsumedRef.current = true;
      onPlayRef.current(pending);
    }
  }, [ready]);

  useEffect(() => {
    const applyPending = (pending: PendingPlay | null) => {
      if (!pending) return;
      onPlayRef.current(pending);
    };

    const onHash = () => {
      const pending = consumeLaunchPlayTarget();
      applyPending(pending);
    };

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'OGM_PLAY_SCHEDULE') return;
      let pending: PendingPlay | null = null;
      if (data.playlistId || data.trackId || data.freshQuery) {
        pending = {
          playlistId: data.playlistId,
          trackId: data.trackId,
          scheduleName: data.scheduleName,
          freshQuery: data.freshQuery,
          freshMode: data.freshMode,
        };
      } else if (data.url) {
        try {
          pending = parsePlayHash(new URL(data.url, window.location.origin).hash);
        } catch {
          pending = null;
        }
      }
      applyPending(pending);
    };

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<PendingPlay>).detail;
      if (detail) applyPending(detail);
    };

    window.addEventListener('hashchange', onHash);
    window.addEventListener('ogm-play-schedule', onCustom);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('ogm-play-schedule', onCustom);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);

  useEffect(() => {
    void registerPeriodicScheduleSync();

    const tick = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const due = await collectDueSchedules();
        if (!due.length) return;
        const playlists = await getAllPlaylists();
        for (const schedule of due) {
          await markScheduleFired(schedule);
          const mix = playlists.find((p) => p.id === schedule.playlistId);
          const pending: PendingPlay = {
            playlistId: schedule.playlistId,
            trackId: schedule.trackId,
            scheduleName: schedule.name,
            freshQuery: schedule.freshQuery,
            freshMode: schedule.freshMode || 'latest',
            timeZone: schedule.timeZone,
            scheduleId: schedule.id,
          };
          const shown = await showListenNotification(
            schedule,
            mix?.name || (schedule.freshQuery ? `newest match for “${schedule.freshQuery}”` : '')
          );
          const notified = saveLastNotifiedListen({
            title: schedule.name,
            query: schedule.freshQuery,
            scheduleName: schedule.name,
            freshMode: schedule.freshMode || 'latest',
            playlistId: schedule.playlistId,
            trackId: schedule.trackId,
            at: Date.now(),
          });
          onNotifiedRef.current?.(notified);
          if (!shown) {
            onInAppRef.current(schedule, pending);
          }
        }
      } catch {
        // ignore check failures
      } finally {
        checkingRef.current = false;
      }
    };

    void tick();
    const id = window.setInterval(tick, 20_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        const leftover = readPendingPlay();
        if (leftover) {
          consumeLaunchPlayTarget();
          onPlayRef.current(leftover);
        }
        void tick();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}
