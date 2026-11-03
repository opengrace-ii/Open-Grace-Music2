import { saveYoutubeCookies } from './youtubeCookies';

export type YoutubeSessionStatus = 'connected' | 'not_connected' | 'expired';

declare global {
  interface Window {
    __ogmYouTubeSession?: (payload: { status?: string }) => void;
  }
}

export function isYouTubeLoginAvailable(): boolean {
  try {
    const b = typeof window !== 'undefined' ? window.OgmAndroid : undefined;
    return !!b && typeof b.startYouTubeLogin === 'function';
  } catch {
    return false;
  }
}

export function youtubeSessionStatus(): YoutubeSessionStatus {
  try {
    const b = typeof window !== 'undefined' ? window.OgmAndroid : undefined;
    const raw = b?.youtubeSessionStatus?.();
    if (raw === 'connected' || raw === 'expired' || raw === 'not_connected') return raw;
    if (b?.hasYouTubeSession?.() === true) return 'connected';
  } catch {
    // older APK / PWA
  }
  return 'not_connected';
}

/** Pull HttpOnly cookies the APK harvested; never logs the value. */
export function pullNativeYoutubeCookies(): string {
  try {
    const h = window.OgmAndroid?.getYouTubeCookieHeader?.() || '';
    if (h.trim()) saveYoutubeCookies(h);
    return h.trim();
  } catch {
    return '';
  }
}

export function startYouTubeLogin(): boolean {
  try {
    if (!isYouTubeLoginAvailable()) return false;
    window.OgmAndroid!.startYouTubeLogin!();
    return true;
  } catch {
    return false;
  }
}

export function clearYouTubeSession(): void {
  try {
    window.OgmAndroid?.clearYouTubeSession?.();
  } catch {
    // PWA
  }
  saveYoutubeCookies('');
}

const sessionListeners = new Set<(status: YoutubeSessionStatus) => void>();

export function subscribeYouTubeSession(onChange: (status: YoutubeSessionStatus) => void): () => void {
  sessionListeners.add(onChange);
  window.__ogmYouTubeSession = (payload) => {
    const raw = payload?.status;
    const status: YoutubeSessionStatus =
      raw === 'connected' || raw === 'expired' || raw === 'not_connected' ? raw : youtubeSessionStatus();
    if (status === 'connected') pullNativeYoutubeCookies();
    sessionListeners.forEach((fn) => fn(status));
  };
  return () => {
    sessionListeners.delete(onChange);
  };
}

export function statusLabel(status: YoutubeSessionStatus): string {
  if (status === 'connected') return 'Connected';
  if (status === 'expired') return 'Expired';
  return 'Not connected';
}
