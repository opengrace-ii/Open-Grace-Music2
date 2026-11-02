import { AUDIOPHILE_FORMATS, AudiophileFormatId } from '../types';

const LOSSLESS = new Set(['FLAC', 'ALAC', 'DSD', 'WAV']);

/** True for FLAC/ALAC/DSD/WAV only — not live YouTube or unknown. */
export function isLosslessFormat(format: string | undefined | null): boolean {
  return LOSSLESS.has((format || '').toUpperCase());
}

/** Map response Content-Type / extension to a library format id when headers are incomplete. */
export function formatFromMimeOrExt(
  mimeType: string | undefined | null,
  extension: string | undefined | null
): AudiophileFormatId | null {
  const mime = (mimeType || '').toLowerCase().split(';')[0].trim();
  const ext = (extension || '').toLowerCase().replace(/^\./, '');
  if (mime === 'audio/flac' || ext === 'flac') return 'FLAC';
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a' || ext === 'm4a') return 'ALAC';
  if (mime === 'audio/wav' || mime === 'audio/x-wav' || ext === 'wav') return 'WAV';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3' || ext === 'mp3') return 'MP3';
  if (ext === 'dsf' || ext === 'dff') return 'DSD';
  return null;
}

export function mimeForFormat(format: string): string {
  const upper = format.toUpperCase();
  const opt = AUDIOPHILE_FORMATS.find((f) => f.id === upper);
  if (opt) return opt.mimeType;
  if (upper === 'YOUTUBE') return 'video/youtube';
  return 'application/octet-stream';
}

export function extensionForFormat(format: string): string {
  const id = format.toUpperCase() as AudiophileFormatId;
  const opt = AUDIOPHILE_FORMATS.find((f) => f.id === id);
  if (opt) return opt.extension;
  return format.toLowerCase() || 'bin';
}

export function bitrateKbpsForFormat(format: string, requested?: number): number {
  const id = format.toUpperCase() as AudiophileFormatId;
  if (id === 'MP3') {
    if (requested && [128, 192, 256, 320].includes(requested)) return requested;
    return 320;
  }
  const opt = AUDIOPHILE_FORMATS.find((f) => f.id === id);
  if (opt) return opt.bitrateKbps;
  return 0;
}

/**
 * Cassette-library badge from persisted track metadata.
 * Never invents "MP3 320" for live YouTube or unknown formats.
 */
export function tapeTypeBadge(track: {
  format: string;
  bitrateKbps?: number;
  mimeType?: string;
}): string {
  const fmt = (track.format || '').toUpperCase();
  const mime = (track.mimeType || '').toLowerCase();

  if (fmt === 'YOUTUBE' || mime.includes('youtube') || mime === 'video/youtube') {
    return 'LIVE STREAM · YOUTUBE';
  }
  if (fmt === 'FLAC') return 'TYPE IV METAL · FLAC 24-BIT';
  if (fmt === 'ALAC') return 'TYPE II CrO₂ · ALAC 24-BIT';
  if (fmt === 'DSD') return 'MASTER REEL · DSD 192KHZ';
  if (fmt === 'WAV') return 'STUDIO MASTER · WAV 24-BIT';
  if (fmt === 'MP3' || mime.includes('mpeg') || mime === 'audio/mp3') {
    const kbps = track.bitrateKbps && track.bitrateKbps > 0 ? track.bitrateKbps : 320;
    return `TYPE I NORMAL · MP3 ${kbps}K`;
  }
  if (fmt) return `TAPE · ${fmt}`;
  return 'TAPE · UNKNOWN';
}
