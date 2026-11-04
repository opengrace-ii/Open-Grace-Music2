/**
 * Bridge to the Android APK shell's on-device YouTube audio downloader.
 *
 * Native side prefers the googlevideo URL the WebView IFrame already loaded (real YouTube
 * session), downloads it ranged to app cache, and serves it at https://ogm.local/dl/<token>
 * so we can fetch() it as a Blob without base64-ing huge strings through the JS bridge.
 */

export interface OnDeviceDone {
  url: string;
  token: string;
  videoId: string;
  /** Real container: M4A (AAC) or OPUS (WebM). Never MP3/FLAC. */
  container: 'M4A' | 'OPUS' | 'MP4';
  codec: string;
  mime: string;
  bitrateKbps: number;
  bytes: number;
  title: string;
  author: string;
  durationSec: number;
  client: string;
}

export type OnDeviceRoute = 'on-device-capture' | 'on-device-innertube';

export function onDeviceRoute(client: string | undefined): OnDeviceRoute {
  return client === 'WEBVIEW_CAPTURE' ? 'on-device-capture' : 'on-device-innertube';
}

export interface OnDeviceProgress {
  stage: string;
  percent: number;
  message: string;
}

export interface OnDeviceResult {
  blob: Blob;
  info: OnDeviceDone;
}

export class OnDeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnDeviceError';
  }
}

type Pending = {
  onProgress: (p: OnDeviceProgress) => void;
  resolve: (d: OnDeviceDone) => void;
  reject: (e: Error) => void;
};

const pending = new Map<string, Pending>();

function installReceiver() {
  if (typeof window === 'undefined' || window.__ogmNativeDownload) return;
  window.__ogmNativeDownload = (callbackId, event, payloadJson) => {
    const p = pending.get(callbackId);
    if (!p) return;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadJson || '{}');
    } catch {
      // keep empty
    }
    if (event === 'progress') {
      p.onProgress(payload as unknown as OnDeviceProgress);
    } else if (event === 'done') {
      pending.delete(callbackId);
      p.resolve(payload as unknown as OnDeviceDone);
    } else if (event === 'error') {
      pending.delete(callbackId);
      p.reject(new OnDeviceError(String(payload.message || 'On-device download failed')));
    }
  };
}

/** True only inside the APK shell version that ships the downloader (1.3.1+ capture). */
export function isOnDeviceDownloadAvailable(): boolean {
  try {
    const b = typeof window !== 'undefined' ? window.OgmAndroid : undefined;
    return !!b && typeof b.downloadYouTubeAudio === 'function' && b.supportsOnDeviceDownload?.() === true;
  } catch {
    return false;
  }
}

/** Inside any build of the APK shell (even an old one without the downloader). */
export function isInsideApk(): boolean {
  return typeof navigator !== 'undefined' && /OpenGraceMusicAPK\//i.test(navigator.userAgent);
}

export function downloadYouTubeAudioOnDevice(
  videoId: string,
  format: string,
  onProgress: (p: OnDeviceProgress) => void,
  isCancelled?: () => boolean
): Promise<OnDeviceResult> {
  installReceiver();
  const bridge = window.OgmAndroid;
  if (!bridge?.downloadYouTubeAudio) {
    return Promise.reject(new OnDeviceError('This APK has no on-device downloader — reinstall the latest APK.'));
  }
  const callbackId = `dl_${videoId}_${Date.now().toString(36)}`;

  const nativePart = new Promise<OnDeviceDone>((resolve, reject) => {
    pending.set(callbackId, { onProgress, resolve, reject });
    try {
      bridge.downloadYouTubeAudio!(videoId, format, callbackId);
    } catch (e) {
      pending.delete(callbackId);
      reject(new OnDeviceError(e instanceof Error ? e.message : 'Could not start on-device download'));
    }
  });

  const CAPTURE_TIMEOUT_MS = 45_000;
  const STALL_TIMEOUT_MS = 90_000;
  const MAX_DOWNLOAD_MS = 2 * 60 * 60_000;
  const watchdog = new Promise<never>((_, reject) => {
    const started = Date.now();
    let lastProgressAt = Date.now();
    let stage = 'capture';
    const orig = pending.get(callbackId);
    if (orig) {
      const innerOnProgress = orig.onProgress;
      orig.onProgress = (p) => {
        lastProgressAt = Date.now();
        stage = p.stage || stage;
        innerOnProgress(p);
      };
    }
    const t = setInterval(() => {
      if (isCancelled?.()) {
        clearInterval(t);
        bridge.cancelDownload?.(callbackId);
        pending.delete(callbackId);
        reject(new OnDeviceError('Cancelled'));
        return;
      }
      if (!pending.has(callbackId)) {
        clearInterval(t);
        return;
      }
      const now = Date.now();
      const captureWait = stage === 'capture' || stage === 'refresh' || stage === 'resolve';
      if (captureWait && now - started > CAPTURE_TIMEOUT_MS && now - lastProgressAt > 8_000) {
        clearInterval(t);
        bridge.cancelDownload?.(callbackId);
        pending.delete(callbackId);
        reject(new OnDeviceError('On-device capture timed out.'));
        return;
      }
      if (!captureWait && now - lastProgressAt > STALL_TIMEOUT_MS) {
        clearInterval(t);
        bridge.cancelDownload?.(callbackId);
        pending.delete(callbackId);
        reject(new OnDeviceError('On-device download stalled.'));
        return;
      }
      if (now - started > MAX_DOWNLOAD_MS) {
        clearInterval(t);
        bridge.cancelDownload?.(callbackId);
        pending.delete(callbackId);
        reject(new OnDeviceError('On-device download timed out.'));
      }
    }, 400);
  });

  return Promise.race([nativePart, watchdog]).then(async (info) => {
    try {
      if (info.videoId !== videoId) {
        throw new OnDeviceError(`Phone returned video ${info.videoId}, not ${videoId} — discarded.`);
      }
      const res = await fetch(info.url);
      if (!res.ok) throw new OnDeviceError(`Could not read the downloaded file (HTTP ${res.status}).`);
      const blob = await res.blob();
      if (blob.size < 50_000) throw new OnDeviceError('Downloaded audio was too small to be a real song.');
      if (info.bytes && blob.size !== info.bytes) {
        throw new OnDeviceError(`Downloaded file is incomplete (${blob.size} of ${info.bytes} bytes).`);
      }
      return { blob: new Blob([blob], { type: info.mime }), info };
    } finally {
      bridge.releaseDownload?.(info.token);
    }
  });
}

/** Ask the server to transcode bytes we already hold (no YouTube access involved). */
export async function transcodeOnServer(
  blob: Blob,
  format: 'FLAC' | 'ALAC' | 'WAV' | 'MP3',
  apiUrl: (p: string) => string
): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12 * 60_000);
  try {
    const res = await fetch(apiUrl(`/api/transcode?format=${format}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Server transcode failed (HTTP ${res.status})`);
    const out = await res.blob();
    if (out.size < 1000) throw new Error('Server transcode returned an empty file');
    return out;
  } finally {
    clearTimeout(timer);
  }
}
