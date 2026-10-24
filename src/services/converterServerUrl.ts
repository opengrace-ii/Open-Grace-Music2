import {
  DEFAULT_OGM_PUBLIC_BASE_URL,
  isAppDeployHost,
  normalizeBaseUrl,
} from '../constants/ogmPublicBase';

const STORAGE_KEY = 'ogm_converter_server_url';

export { DEFAULT_OGM_PUBLIC_BASE_URL, isAppDeployHost };

/** User override for API base (APK/PWA). Empty = AppDeploy tab origin or same-origin. */
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
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Effective API origin: saved override → current tab origin (AppDeploy or self-hosted PWA) → default AppDeploy.
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
  `Leave blank to use this page (AppDeploy: ${DEFAULT_OGM_PUBLIC_BASE_URL}) or your self-hosted URL. Override only if you run npm start elsewhere.`;
