/** Hard cap so a runaway encode cannot fill the hub disk. Confirmed jobs stream in chunks. */
export const MAX_HUB_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;
export const RESULT_CHUNK_BYTES = 4 * 1024 * 1024;

/** FLAC 24/96 PCM is ~1.65 MB/s before compression; FLAC ~0.55. */
export function estimateLosslessBytes(format, durationSec) {
  const dur = Math.max(0, Number(durationSec) || 0);
  const fmt = String(format || '').toUpperCase();
  if (fmt === 'MP3') return Math.round(dur * (320_000 / 8));
  if (fmt === 'WAV') return Math.round(dur * 48000 * 3 * 2);
  if (fmt === 'DSD') return Math.round(dur * 192000 * 3 * 2);
  if (fmt === 'ALAC') return Math.round(dur * 96000 * 3 * 2 * 0.7);
  // FLAC 24-bit / 96 kHz stereo
  return Math.round(dur * 96000 * 3 * 2 * 0.55);
}

export function tooLargeForHub(format, durationSec, fileBytes = 0) {
  const est = estimateLosslessBytes(format, durationSec);
  const n = Math.max(est, Number(fileBytes) || 0);
  return n > MAX_HUB_UPLOAD_BYTES;
}

export function tooLargeMessage(format, durationSec) {
  const mb = Math.max(1, Math.round(estimateLosslessBytes(format, durationSec) / (1024 * 1024)));
  return `This video is too long for ${format} through the recorder (~${mb} MB). Try MP3 320.`;
}

export function extractTimeoutMs(durationSec) {
  const dur = Math.max(60, Number(durationSec) || 600);
  return Math.min(90 * 60_000, Math.max(12 * 60_000, dur * 2500));
}

export function ffmpegTimeoutMs(durationSec) {
  const dur = Math.max(60, Number(durationSec) || 600);
  return Math.min(90 * 60_000, Math.max(10 * 60_000, dur * 4000));
}
