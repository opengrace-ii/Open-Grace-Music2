import { apiUrl, fetchWithTimeout } from './converterApi';
import { loadSavedYoutubeCookies, saveYoutubeCookies, sanitizeCookieHeader } from './youtubeCookies';
import {
  loadSavedYoutubeOauth,
  loadYoutubeOauthRefreshToken,
  saveYoutubeOauth,
  type YoutubeOauthSession,
} from './youtubeOauth';

export type YoutubeSessionStatus = 'connected' | 'not_connected' | 'expired';

declare global {
  interface Window {
    __ogmYouTubeSession?: (payload: { status?: string }) => void;
    __ogmYtCookieHeader?: string;
  }
}

export function isNativeYouTubeLoginAvailable(): boolean {
  try {
    const b = typeof window !== 'undefined' ? window.OgmAndroid : undefined;
    return !!b && typeof b.startYouTubeLogin === 'function';
  } catch {
    return false;
  }
}

/** Native APK WebView login, or web TV device-code login. */
export function isYouTubeLoginAvailable(): boolean {
  return isNativeYouTubeLoginAvailable() || typeof window !== 'undefined';
}

function webSessionConnected(): boolean {
  return Boolean(loadYoutubeOauthRefreshToken() || loadSavedYoutubeCookies());
}

export function youtubeSessionStatus(): YoutubeSessionStatus {
  try {
    const b = typeof window !== 'undefined' ? window.OgmAndroid : undefined;
    if (b && typeof b.startYouTubeLogin === 'function') {
      const raw = b.youtubeSessionStatus?.();
      if (raw === 'connected' || raw === 'expired' || raw === 'not_connected') return raw;
      if (b.hasYouTubeSession?.() === true) return 'connected';
    }
  } catch {
    // older APK / PWA
  }
  if (webSessionConnected()) return 'connected';
  return 'not_connected';
}

/** Pull cookies the APK injected into the main frame only. Never logs the value. */
export function pullNativeYoutubeCookies(): string {
  try {
    const fromWindow =
      typeof window !== 'undefined' ? String((window as { __ogmYtCookieHeader?: string }).__ogmYtCookieHeader || '') : '';
    const fromBridge = window.OgmAndroid?.getYouTubeCookieHeader?.() || '';
    const h = sanitizeCookieHeader(fromWindow || fromBridge);
    return h;
  } catch {
    return '';
  }
}

export function startYouTubeLogin(): boolean {
  try {
    if (!isNativeYouTubeLoginAvailable()) return false;
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
  saveYoutubeOauth(null);
  notifyYouTubeSession('not_connected');
}

const sessionListeners = new Set<(status: YoutubeSessionStatus) => void>();

export function notifyYouTubeSession(status: YoutubeSessionStatus): void {
  sessionListeners.forEach((fn) => fn(status));
}

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

export interface YoutubeDeviceLoginStart {
  userCode: string;
  verificationUrl: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
  activateUrl: string;
}

export async function startWebYouTubeDeviceLogin(): Promise<YoutubeDeviceLoginStart> {
  const res = await fetchWithTimeout(apiUrl('/api/youtube-oauth/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    timeoutMs: 20_000,
  });
  const data = (await res.json()) as YoutubeDeviceLoginStart & { ok?: boolean; error?: string };
  if (!res.ok || !data.userCode || !data.deviceCode) {
    throw new Error(data.error || 'Could not start YouTube TV sign-in.');
  }
  return data;
}

export async function pollWebYouTubeDeviceLogin(deviceCode: string): Promise<{
  status: 'pending' | 'slow_down' | 'expired' | 'denied' | 'error' | 'connected';
  interval?: number;
  error?: string;
  session?: YoutubeOauthSession;
}> {
  const res = await fetchWithTimeout(apiUrl('/api/youtube-oauth/poll'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceCode }),
    timeoutMs: 20_000,
  });
  const data = (await res.json()) as {
    status?: string;
    error?: string;
    interval?: number;
    refreshToken?: string;
    accessToken?: string;
    expiresAt?: number;
  };
  if (data.status === 'connected' && data.refreshToken) {
    const session: YoutubeOauthSession = {
      refreshToken: data.refreshToken,
      accessToken: data.accessToken,
      expiresAt: data.expiresAt,
    };
    saveYoutubeOauth(session);
    notifyYouTubeSession('connected');
    return { status: 'connected', session };
  }
  if (
    data.status === 'pending' ||
    data.status === 'slow_down' ||
    data.status === 'expired' ||
    data.status === 'denied' ||
    data.status === 'error'
  ) {
    return { status: data.status, interval: data.interval, error: data.error };
  }
  return { status: 'error', error: data.error || 'Unexpected sign-in response.' };
}

export function openYouTubeActivateTab(verificationUrl: string, userCode?: string): void {
  let url = (verificationUrl || 'https://www.google.com/device').trim();
  if (!/^https:\/\//i.test(url)) url = 'https://www.google.com/device';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host !== 'google.com' &&
      !host.endsWith('.google.com') &&
      host !== 'youtube.com' &&
      !host.endsWith('.youtube.com')
    ) {
      url = 'https://www.google.com/device';
    }
  } catch {
    url = 'https://www.google.com/device';
  }
  const code = (userCode || '').replace(/\s/g, '');
  if (code && /google\.com\/device/i.test(url) && !/[?&]user_code=/.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}user_code=${encodeURIComponent(code)}`;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export { loadYoutubeOauthRefreshToken, loadSavedYoutubeOauth };
