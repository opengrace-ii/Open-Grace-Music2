const STORAGE_KEY = 'ogm_yt_cookies';

export function loadSavedYoutubeCookies(): string {
  try {
    return (localStorage.getItem(STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function saveYoutubeCookies(value: string): void {
  try {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode
  }
}
