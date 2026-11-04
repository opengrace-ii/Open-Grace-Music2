import { isInsideApk } from './onDeviceDownload';
import { safeDownloadFilename } from '../utils/downloadFilename';

export type DeviceSaveResult = 'music' | 'download' | 'none';

function blobPartToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : '');
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function browserDownload(blob: Blob, title: string, ext: string) {
  const filename = safeDownloadFilename(title, ext);
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

/** APK → Music/Open Grace Music via MediaStore. Web → browser download with a clean name. */
export async function saveAudioToDevice(opts: {
  blob: Blob;
  title: string;
  artist?: string;
  album?: string;
  ext: string;
  mime?: string;
  durationSec?: number;
}): Promise<DeviceSaveResult> {
  const bridge = typeof window !== 'undefined' ? window.OgmAndroid : undefined;
  if (isInsideApk() && bridge?.beginSaveToMusic && bridge.appendSaveToMusic && bridge.finishSaveToMusic) {
    try {
      bridge.requestMediaPermission?.();
      const id = bridge.beginSaveToMusic(
        JSON.stringify({
          title: opts.title || 'Open Grace Music',
          artist: opts.artist || 'Open Grace Music',
          album: opts.album || 'Open Grace Music',
          mime: opts.mime || 'audio/mpeg',
          ext: opts.ext,
          durationMs: Math.round((opts.durationSec || 0) * 1000),
        })
      );
      const chunk = 24 * 1024;
      try {
        for (let i = 0; i < opts.blob.size; i += chunk) {
          const part = opts.blob.slice(i, Math.min(i + chunk, opts.blob.size));
          const b64 = await blobPartToBase64(part);
          if (b64) bridge.appendSaveToMusic(id, b64);
        }
        const raw = bridge.finishSaveToMusic(id);
        const parsed = JSON.parse(raw || '{}') as { ok?: boolean };
        return parsed.ok ? 'music' : 'none';
      } catch (err) {
        bridge.cancelSaveToMusic?.(id);
        throw err;
      }
    } catch {
      return 'none';
    }
  }
  browserDownload(opts.blob, opts.title, opts.ext);
  return 'download';
}
