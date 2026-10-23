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
