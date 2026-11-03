import {
  DEFAULT_OGM_PUBLIC_BASE_URL,
  isAppDeployHost,
  normalizeBaseUrl,
} from '../constants/ogmPublicBase';

const STORAGE_KEY = 'ogm_converter_server_url';

export { DEFAULT_OGM_PUBLIC_BASE_URL, isAppDeployHost };

/** User override for API base (APK/PWA). Empty = tab origin or Render default. */
export function getSavedConverterServerUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setSavedConverterServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = url.trim();
    if (trimmed) {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
      localStorage.setItem(STORAGE_KEY, parsed.origin);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore quota / private mode / invalid URL
  }
}

/**
 * Effective API origin: saved override → current tab origin (Render / self-hosted PWA) → default Render host.
 */
export function resolveConverterApiBaseUrl(): string {
  const saved = getSavedConverterServerUrl();
  if (saved) {
    return normalizeBaseUrl(saved);
  }
  if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null') {
    return normalizeBaseUrl(window.location.origin);
  }
  return normalizeBaseUrl(DEFAULT_OGM_PUBLIC_BASE_URL);
}

export const CONVERTER_SERVER_URL_HELPER =
  `Leave blank to use this page (Render: ${DEFAULT_OGM_PUBLIC_BASE_URL}) or your self-hosted URL. Override only if you run npm start elsewhere.`;
