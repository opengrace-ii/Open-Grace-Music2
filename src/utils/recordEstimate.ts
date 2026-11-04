import { AudiophileFormatId } from '../types';

/** Warn / confirm before Record when the estimate exceeds either of these. */
export const RECORD_WARN_BYTES = 300 * 1024 * 1024;
export const RECORD_WARN_MS = 10 * 60 * 1000;

/** Bytes produced per hour of source audio (lossy YouTube wrap). */
export const BYTES_PER_HOUR: Record<string, number> = {
  FLAC: 1.4 * 1024 * 1024 * 1024, // ~1–2 GB/hour at 24/96
  ALAC: 1.3 * 1024 * 1024 * 1024,
  WAV: 1.0 * 1024 * 1024 * 1024,
  DSD: 2.0 * 1024 * 1024 * 1024,
  MP3: 140 * 1024 * 1024, // ~144 MB/hour at 320, shown compact
};

/** Encode+fetch vs realtime. FLAC 24/96 of a long tape is slow. */
const TIME_FACTOR: Record<string, number> = {
  FLAC: 25 / 60,
  ALAC: 26 / 60,
  WAV: 12 / 60,
  DSD: 30 / 60,
  MP3: 2 / 60,
};

export type RecordEstimate = {
  format: string;
  durationSec: number;
  bytes: number;
  timeMs: number;
  knownDuration: boolean;
};

export function estimateRecord(
  format: string,
  durationSec: number,
  mp3BitrateKbps = 320
): RecordEstimate {
  const fmt = (format || 'MP3').toUpperCase();
  const dur = Math.max(0, Number(durationSec) || 0);
  let perHour = BYTES_PER_HOUR[fmt] || BYTES_PER_HOUR.MP3;
  if (fmt === 'MP3') {
    const br = [128, 192, 256, 320].includes(Number(mp3BitrateKbps)) ? Number(mp3BitrateKbps) : 320;
    perHour = BYTES_PER_HOUR.MP3 * (br / 320);
  }
  const bytes = dur > 0 ? Math.round((dur / 3600) * perHour) : 0;
  const factor = TIME_FACTOR[fmt] ?? 0.3;
  const timeMs = dur > 0 ? Math.max(45_000, Math.round(dur * 1000 * factor)) : 0;
  return { format: fmt, durationSec: dur, bytes, timeMs, knownDuration: dur > 0 };
}

export function needsRecordConfirm(est: RecordEstimate): boolean {
  if (!est.knownDuration) {
    return est.format !== 'MP3';
  }
  return est.bytes >= RECORD_WARN_BYTES || est.timeMs >= RECORD_WARN_MS;
}

export function formatRecordBytes(bytes: number): string {
  if (!bytes) return 'size unknown';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(0)} MB`;
}

export function formatRecordTime(ms: number): string {
  if (!ms) return '';
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}

export function recordEstimateLine(est: RecordEstimate): string {
  if (!est.knownDuration) {
    return est.format === 'MP3' ? '' : `${est.format} of a long video can be 1 GB+.`;
  }
  const time = formatRecordTime(est.timeMs);
  return time ? `About ${formatRecordBytes(est.bytes)} · ${time}` : `About ${formatRecordBytes(est.bytes)}`;
}

export function recordConfirmPrompt(est: RecordEstimate): string {
  const line = recordEstimateLine(est);
  return line ? `${line}. Record anyway?` : 'This recording may be large. Record anyway?';
}

export function mp3InsteadLine(durationSec: number, bitrateKbps = 320): string {
  const est = estimateRecord('MP3', durationSec, bitrateKbps);
  if (!est.knownDuration) return 'MP3 320 instead';
  return `MP3 320 instead (~${formatRecordBytes(est.bytes)})`;
}

export function shouldSkipOnDeviceLossless(format: AudiophileFormatId, est: RecordEstimate): boolean {
  if (format === 'MP3') return false;
  return needsRecordConfirm(est);
}

export function compactFormatName(format: string, mp3BitrateKbps = 320): string {
  const fmt = (format || 'MP3').toUpperCase();
  if (fmt === 'MP3') return `MP3 ${mp3BitrateKbps}`;
  if (fmt === 'FLAC') return 'FLAC 24/96';
  if (fmt === 'ALAC') return 'ALAC 24/96';
  if (fmt === 'WAV') return 'WAV 24/48';
  if (fmt === 'DSD') return 'DSD 24/192';
  return fmt;
}

/** One compact picker line, e.g. `FLAC 24/96 · ~1.4 GB · ~25 min`. */
export function formatOptionLabel(format: string, durationSec: number, mp3BitrateKbps = 320): string {
  const title = compactFormatName(format, mp3BitrateKbps);
  const est = estimateRecord(format, durationSec, mp3BitrateKbps);
  if (!est.knownDuration) return title;
  return `${title} · ~${formatRecordBytes(est.bytes)} · ${formatRecordTime(est.timeMs)}`;
}

export function formatOptionSubline(format: string, durationSec: number, mp3BitrateKbps = 320): string {
  const est = estimateRecord(format, durationSec, mp3BitrateKbps);
  if (!est.knownDuration) return '';
  return `~${formatRecordBytes(est.bytes)} · ${formatRecordTime(est.timeMs)}`;
}
