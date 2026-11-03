/**
 * YouTube TV (TVHTML5) OAuth2 device-code flow — same public client yt-dlp used.
 * User approves on Google/YouTube in a new tab (youtube.com/activate or google.com/device).
 * Never log tokens or cookies.
 */

const OAUTH_CLIENT_ID =
  '861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = 'SboVhoG9s0rNafixCSGGKXAT';
const OAUTH_SCOPE = 'http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content';
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const YOUTUBE_ACTIVATE_URL = 'https://www.youtube.com/activate';

export interface YoutubeDeviceStart {
  userCode: string;
  verificationUrl: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

export type YoutubeDevicePoll =
  | { status: 'pending'; interval?: number }
  | { status: 'slow_down'; interval?: number }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'error'; error: string }
  | {
      status: 'connected';
      refreshToken: string;
      accessToken: string;
      expiresAt: number;
    };

export interface YoutubeAccessToken {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
}

function formBody(data: Record<string, string>): string {
  return new URLSearchParams(data).toString();
}

async function postForm(url: string, data: Record<string, string>): Promise<{
  httpStatus: number;
  json: Record<string, unknown>;
}> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: formBody(data),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { httpStatus: res.status, json };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function startYoutubeDeviceLogin(): Promise<YoutubeDeviceStart> {
  const { httpStatus, json } = await postForm(DEVICE_CODE_URL, {
    client_id: OAUTH_CLIENT_ID,
    scope: OAUTH_SCOPE,
  });
  const userCode = str(json.user_code);
  const deviceCode = str(json.device_code);
  if (!userCode || !deviceCode) {
    const err = str(json.error) || str(json.error_description) || `HTTP ${httpStatus}`;
    throw new Error(`Could not start YouTube TV sign-in (${err}). Try again in a moment.`);
  }
  const verificationUrl = str(json.verification_url) || str(json.verification_uri) || YOUTUBE_ACTIVATE_URL;
  return {
    userCode,
    verificationUrl,
    deviceCode,
    interval: Math.max(3, num(json.interval, 5)),
    expiresIn: num(json.expires_in, 1800),
  };
}

export async function pollYoutubeDeviceLogin(deviceCode: string): Promise<YoutubeDevicePoll> {
  const code = deviceCode.trim();
  if (!code) return { status: 'error', error: 'Missing device code.' };

  const { json } = await postForm(TOKEN_URL, {
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    device_code: code,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });

  const err = str(json.error);
  if (err === 'authorization_pending') return { status: 'pending', interval: num(json.interval, 5) };
  if (err === 'slow_down') return { status: 'slow_down', interval: num(json.interval, 8) };
  if (err === 'expired_token' || err === 'expired_token_error') return { status: 'expired' };
  if (err === 'access_denied') return { status: 'denied' };
  if (err) {
    return { status: 'error', error: str(json.error_description) || err };
  }

  const accessToken = str(json.access_token);
  const refreshToken = str(json.refresh_token);
  const tokenType = str(json.token_type) || 'Bearer';
  if (!accessToken || !refreshToken || tokenType.toLowerCase() !== 'bearer') {
    return { status: 'error', error: 'YouTube did not return a TV session. Try Connect YouTube again.' };
  }
  const expiresAt = Date.now() + Math.max(60, num(json.expires_in, 3600) - 30) * 1000;
  return { status: 'connected', refreshToken, accessToken, expiresAt };
}

export async function refreshYoutubeAccessToken(refreshToken: string): Promise<YoutubeAccessToken | null> {
  const token = refreshToken.trim();
  if (!token) return null;
  const { json } = await postForm(TOKEN_URL, {
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    refresh_token: token,
    grant_type: 'refresh_token',
  });
  const accessToken = str(json.access_token);
  if (!accessToken) return null;
  const expiresAt = Date.now() + Math.max(60, num(json.expires_in, 3600) - 30) * 1000;
  return {
    accessToken,
    expiresAt,
    refreshToken: str(json.refresh_token) || token,
  };
}

export function publicDeviceStart(started: YoutubeDeviceStart) {
  return {
    userCode: started.userCode,
    verificationUrl: started.verificationUrl,
    deviceCode: started.deviceCode,
    interval: started.interval,
    expiresIn: started.expiresIn,
    activateUrl: YOUTUBE_ACTIVATE_URL,
  };
}
