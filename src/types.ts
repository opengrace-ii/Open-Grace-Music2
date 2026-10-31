export type StorageStatus = 'PERSISTENT' | 'DEVICE_LOCAL' | 'FAILED';

export type TrackSource = 'YOUTUBE' | 'DIRECT_URL' | 'LOCAL_IMPORT' | 'SAMPLE_AUDIO';

export type AudiophileFormatId = 'FLAC' | 'ALAC' | 'DSD' | 'WAV' | 'MP3';

export interface AudiophileFormatOption {
  id: AudiophileFormatId;
  name: string;
  badge: string;
  spec: string;
  extension: string;
  mimeType: string;
  bitrateKbps: number;
  sampleRateHz: number;
  bitDepth: string;
  isLossless: boolean;
}

export const AUDIOPHILE_FORMATS: AudiophileFormatOption[] = [
  {
    id: 'FLAC',
    name: 'FLAC (Free Lossless)',
    badge: '24-BIT / 96 kHz',
    spec: 'Studio Master Lossless (.flac)',
    extension: 'flac',
    mimeType: 'audio/flac',
    bitrateKbps: 2304,
    sampleRateHz: 96000,
    bitDepth: '24-bit',
    isLossless: true,
  },
  {
    id: 'ALAC',
    name: 'ALAC (Apple Lossless)',
    badge: '24-BIT / 96 kHz',
    spec: 'Apple Master Lossless (.m4a)',
    extension: 'm4a',
    mimeType: 'audio/mp4',
    bitrateKbps: 2100,
    sampleRateHz: 96000,
    bitDepth: '24-bit',
    isLossless: true,
  },
  {
    id: 'DSD',
    name: 'DSD / Hi-Res Master',
    badge: '24-BIT / 192 kHz',
    spec: 'Direct Stream Extreme Hi-Res (.wav)',
    extension: 'wav',
    mimeType: 'audio/wav',
    bitrateKbps: 4608,
    sampleRateHz: 192000,
    bitDepth: '24-bit',
    isLossless: true,
  },
  {
    id: 'WAV',
    name: 'WAV (Uncompressed PCM)',
    badge: '24-BIT / 48 kHz',
    spec: 'Linear Studio PCM (.wav)',
    extension: 'wav',
    mimeType: 'audio/wav',
    bitrateKbps: 2304,
    sampleRateHz: 48000,
    bitDepth: '24-bit',
    isLossless: true,
  },
  {
    id: 'MP3',
    name: 'MP3 (320 kbps Master)',
    badge: '320 KBPS CBR',
    spec: 'Universal High-Bitrate (.mp3)',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    bitrateKbps: 320,
    sampleRateHz: 48000,
    bitDepth: '16-bit',
    isLossless: false,
  },
];

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  sizeBytes: number;
  format: string; // 'FLAC', 'ALAC', 'DSD', 'WAV', 'MP3'
  mimeType: string;
  source: TrackSource;
  storageStatus: StorageStatus;
  addedAt: number;
  thumbnailUrl?: string;
  bitrateKbps: number;
  sampleRateHz?: number;
  bitDepth?: string;
  isFavorite: boolean;
  blob?: Blob;
  audioUrl?: string;
  originalUrl?: string;
  ytVideoId?: string;
}

export type LibraryTab = 'ALL' | 'LOSSLESS' | 'DOWNLOADS' | 'DEVICE_MUSIC' | 'MP3' | 'FAVORITES';

export interface UserPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

/** How a listen reminder repeats. All values are user-chosen — nothing is locked. */
export type ScheduleRepeatKind = 'daily' | 'weekdays' | 'monthly';

/**
 * A user-named listen reminder. Names, mixes, times, and days are never hardcoded
 * (morning / noon / evening are only editable time presets in the UI).
 */
export interface ListenSchedule {
  id: string;
  name: string;
  playlistId?: string;
  trackId?: string;
  hour: number;
  minute: number;
  repeatKind: ScheduleRepeatKind;
  /** 0 = Sunday … 6 = Saturday. Used when repeatKind is `weekdays`. */
  weekdays: number[];
  /** 1–31, or 0 for last day of the month. Used when repeatKind is `monthly`. */
  monthDays: number[];
  enabled: boolean;
  createdAt: number;
  /** Last fire stamp `YYYY-MM-DDTHH:mm` so a reminder only rings once per slot. */
  lastFiredKey?: string;
}

export interface TimePreset {
  id: string;
  label: string;
  hour: number;
  minute: number;
}

export type LoopMode = 'OFF' | 'ALL' | 'ONE';

export interface StorageInfo {
  usedBytes: number;
  quotaBytes: number;
  isPersistent: boolean;
  trackCount: number;
}

export interface LyricOrChord {
  title: string;
  artist: string;
  isInstrumental: boolean;
  content: string;
  key?: string;
  bpm?: number;
  timeSignature?: string;
}
