/**
 * Web-native Record: capture THIS TAB’s audio in Chrome/Edge via getDisplayMedia
 * + MediaRecorder. Render yt-dlp is not used here — datacenter IPs get LOGIN_REQUIRED.
 *
 * Never call this inside the Android APK (window.OgmAndroid / OpenGraceMusicAPK UA).
 * That path uses on-device googlevideo intercept, not screen share / MediaProjection.
 */

import { isInsideApk } from './onDeviceDownload';
import { sanitizeCookieHeader } from './youtubeCookies';

export const TAB_SHARE_HINT =
  'Chrome will ask to share this tab — tick Also share tab audio, choose this Open Grace Music tab.';

export const TAB_RECORD_ROUTE = 'browser-tab';

export class TabShareCancelledError extends Error {
  constructor() {
    super('Tab share cancelled. Nothing saved.');
    this.name = 'TabShareCancelledError';
  }
}

export class TabShareNoAudioError extends Error {
  constructor() {
    super('No tab audio. Tick Also share tab audio, choose this Open Grace Music tab, and retry Record.');
    this.name = 'TabShareNoAudioError';
  }
}

export class TabShareUnsupportedError extends Error {
  constructor() {
    super('This browser cannot capture tab audio. Use desktop Chrome or Edge.');
    this.name = 'TabShareUnsupportedError';
  }
}

export class TabRecordEmptyError extends Error {
  constructor() {
    super('Recording was empty. Tick Also share tab audio, let the video play, and retry Record.');
    this.name = 'TabRecordEmptyError';
  }
}

/** True on desktop PWA / Chrome — not the APK WebView shell. */
export function isWebTabRecordSurface(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.OgmAndroid) return false;
  if (isInsideApk()) return false;
  return true;
}

export function isTabAudioCaptureSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

/** Key-icon paste only. TV Connected / oauth is not cookies. */
export function hasPastedYoutubeCookies(raw?: string | null): boolean {
  return sanitizeCookieHeader(raw || '').length > 0;
}

/**
 * Render convert is a fallback, and only when Netscape/header cookies were pasted.
 * Cancelled tab-share fails once — do not then hit Render.
 */
export function shouldCallRenderConvert(opts: {
  isWebTabSurface: boolean;
  hasCookies: boolean;
  tabShareCancelled?: boolean;
  tabShareUnsupported?: boolean;
}): boolean {
  if (opts.tabShareCancelled) return false;
  if (!opts.isWebTabSurface) return true;
  if (!opts.hasCookies) return false;
  return true;
}

export function isTabShareCancelError(err: unknown): boolean {
  if (err instanceof TabShareCancelledError) return true;
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name: string }).name) : '';
  const message = 'message' in err ? String((err as { message: string }).message) : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return true;
  if (/not allowed|permission denied|denied by user|abort/i.test(message) && /display|share|capture|getDisplayMedia/i.test(message)) {
    return true;
  }
  if (name === 'NotAllowedError') return true;
  return false;
}

type DisplayShareOptions = {
  video?: boolean | Record<string, unknown>;
  audio?: boolean | Record<string, unknown>;
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
};

/** Constraint sets from most-specific (this tab + audio) to plain getDisplayMedia. */
export function tabShareConstraintAttempts(): DisplayShareOptions[] {
  return [
    {
      video: { displaySurface: 'browser' },
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      systemAudio: 'include',
      monitorTypeSurfaces: 'exclude',
    },
    {
      video: true,
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      systemAudio: 'include',
    },
    {
      video: true,
      audio: true,
      preferCurrentTab: true,
    },
    { video: true, audio: true },
  ];
}

export function pickMediaRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore
    }
  }
  return '';
}

export function formatTapeClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function honestBrowserCaptureFormat(
  requested: string,
  blobMime: string,
  convertedToMp3: boolean
): { format: string; mime: string; extension: string; note: string } {
  if (convertedToMp3) {
    return {
      format: 'MP3',
      mime: 'audio/mpeg',
      extension: 'mp3',
      note: ' · MP3 from this-tab audio (lossy)',
    };
  }
  const mime = (blobMime || '').toLowerCase().split(';')[0].trim();
  const asked = (requested || '').toUpperCase();
  const losslessAsk = asked === 'FLAC' || asked === 'ALAC' || asked === 'DSD' || asked === 'WAV';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) {
    return {
      format: 'M4A',
      mime: mime || 'audio/mp4',
      extension: 'm4a',
      note: losslessAsk
        ? ` · this-tab AAC/M4A, not ${asked} (no lossless encoder in the browser)`
        : ' · this-tab AAC/M4A',
    };
  }
  return {
    format: 'WEBM',
    mime: mime || 'audio/webm',
    extension: 'webm',
    note: losslessAsk
      ? ` · this-tab audio saved as WEBM, not ${asked} (no lossless encoder in the browser)`
      : asked === 'MP3'
        ? ' · this-tab WEBM/Opus (MP3 encode failed; file is still offline)'
        : ' · this-tab audio (WEBM/Opus)',
  };
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
}

async function getDisplayMediaWithFallback(): Promise<MediaStream> {
  if (!isTabAudioCaptureSupported()) {
    throw new TabShareUnsupportedError();
  }
  const attempts = tabShareConstraintAttempts();
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(
        attempts[i] as unknown as MediaStreamConstraints
      );
    } catch (err) {
      if (isTabShareCancelError(err)) {
        throw new TabShareCancelledError();
      }
      lastErr = err;
    }
  }
  if (isTabShareCancelError(lastErr)) throw new TabShareCancelledError();
  const message = lastErr instanceof Error ? lastErr.message : 'Could not share this tab';
  throw new Error(message);
}

/**
 * Must run in the same turn as a user gesture (Record click).
 * Prefers current-tab audio; never used on the APK.
 */
export async function requestThisTabAudioStream(): Promise<MediaStream> {
  if (!isWebTabRecordSurface()) {
    throw new Error('Tab audio capture is the web Record path — not used in the APK.');
  }
  const stream = await getDisplayMediaWithFallback();
  if (!stream.getAudioTracks().length) {
    stopMediaStream(stream);
    throw new TabShareNoAudioError();
  }
  return stream;
}

export interface TabRecordResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  stoppedBy: 'ended' | 'user' | 'share-ended';
}

export interface TabRecordControls {
  stop: () => void;
}

/**
 * Record audio tracks only. Keeps the video track alive (hidden <video>) so Chrome
 * continues producing tab audio. Stops at media end, user Stop, or share-bar Stop.
 */
export function recordTabAudioStream(
  displayStream: MediaStream,
  opts: {
    getMediaDurationSec: () => number;
    getMediaCurrentSec: () => number;
    onProgress?: (elapsedSec: number, durationSec: number) => void;
    registerStop?: (ctl: TabRecordControls) => void;
  }
): Promise<TabRecordResult> {
  return new Promise((resolve, reject) => {
    const audioTracks = displayStream.getAudioTracks();
    if (!audioTracks.length) {
      reject(new TabShareNoAudioError());
      return;
    }

    const audioStream = new MediaStream(audioTracks);
    const mimeType = pickMediaRecorderMime();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(audioStream, { mimeType })
        : new MediaRecorder(audioStream);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('MediaRecorder is not available'));
      return;
    }

    const chunks: BlobPart[] = [];
    const startedAt = Date.now();
    let stoppedBy: TabRecordResult['stoppedBy'] = 'ended';
    let settled = false;
    let preview: HTMLVideoElement | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const cleanupPreview = () => {
      if (preview) {
        try {
          preview.pause();
          preview.srcObject = null;
          preview.remove();
        } catch {
          // ignore
        }
        preview = null;
      }
    };

    const finish = (blob: Blob, durationSec: number, how: TabRecordResult['stoppedBy']) => {
      if (settled) return;
      settled = true;
      if (poll) clearInterval(poll);
      cleanupPreview();
      resolve({
        blob,
        mimeType: blob.type || recorder.mimeType || mimeType || 'audio/webm',
        durationSec,
        stoppedBy: how,
      });
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      if (poll) clearInterval(poll);
      cleanupPreview();
      reject(err instanceof Error ? err : new Error('Tab recording failed'));
    };

    const requestStop = (how: TabRecordResult['stoppedBy']) => {
      if (settled) return;
      stoppedBy = how;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
    };

    opts.registerStop?.({ stop: () => requestStop('user') });

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    recorder.onerror = () => fail(new Error('Tab recorder failed'));

    recorder.onstop = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const mediaDur = opts.getMediaDurationSec();
      const durationSec = mediaDur > 1 ? Math.min(mediaDur, elapsed + 0.5) : elapsed;
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type });
      finish(blob, durationSec, stoppedBy);
    };

    for (const track of displayStream.getTracks()) {
      track.addEventListener('ended', () => requestStop('share-ended'));
    }

    preview = document.createElement('video');
    preview.setAttribute('aria-hidden', 'true');
    preview.muted = true;
    preview.playsInline = true;
    preview.autoplay = true;
    preview.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
    preview.srcObject = displayStream;
    document.body.appendChild(preview);
    void preview.play().catch(() => {});

    poll = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const durationSec = opts.getMediaDurationSec();
      opts.onProgress?.(elapsed, durationSec);
      if (durationSec > 1) {
        const current = opts.getMediaCurrentSec();
        if (current >= durationSec - 0.35 || elapsed >= durationSec + 1.5) {
          requestStop('ended');
        }
      }
    }, 250);

    try {
      recorder.start(1000);
    } catch (err) {
      fail(err);
    }
  });
}
