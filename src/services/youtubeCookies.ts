const STORAGE_KEY = 'ogm_yt_cookies';

/** Strip CR/LF/NUL so a pasted cookie cannot inject HTTP headers. */
export function sanitizeCookieHeader(value: string): string {
  return value.replace(/[\r\n\0]/g, '').trim();
}

export function loadSavedYoutubeCookies(): string {
  try {
    return sanitizeCookieHeader(localStorage.getItem(STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

export function saveYoutubeCookies(value: string): void {
  try {
    const trimmed = sanitizeCookieHeader(value);
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode
  }
}
