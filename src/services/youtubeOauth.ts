const STORAGE_KEY = 'ogm_yt_oauth_v1';

export interface YoutubeOauthSession {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
}

export function loadSavedYoutubeOauth(): YoutubeOauthSession | null {
  try {
    const raw = (localStorage.getItem(STORAGE_KEY) || '').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as YoutubeOauthSession;
    if (!parsed?.refreshToken || typeof parsed.refreshToken !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveYoutubeOauth(session: YoutubeOauthSession | null): void {
  try {
    if (session?.refreshToken?.trim()) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          refreshToken: session.refreshToken.trim(),
          accessToken: session.accessToken?.trim() || undefined,
          expiresAt: session.expiresAt,
        })
      );
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // private mode
  }
}

export function loadYoutubeOauthRefreshToken(): string {
  return loadSavedYoutubeOauth()?.refreshToken?.trim() || '';
}
