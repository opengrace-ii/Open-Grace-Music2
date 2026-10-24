const STORAGE_KEY = 'ogm_converter_server_url';

/** User override for API base (APK/PWA opened off-server). Empty = use current page origin. */
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

/** Effective API origin: saved server URL, else same tab origin. */
export function resolveConverterApiBaseUrl(): string {
  const saved = getSavedConverterServerUrl();
  if (saved) {
    return saved.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  return '';
}

export const CONVERTER_SERVER_URL_HELPER =
  'Paste your Open Grace Music server URL (the same address you use to open the app in Chrome). Example: https://your-agent-host:43123';
