import fs from 'fs';
import path from 'path';

/**
 * Cookie file for yt-dlp. YouTube OAuth was removed from yt-dlp (Nov 2024);
 * TV Bearer/refresh tokens are not Netscape cookies and cannot authenticate the YouTube IE.
 * Do not use removed `--username oauth`. Do not send a global Authorization header (breaks CDN).
 */
export function youtubeYtdlpAuthArgs(
  workDir: string,
  userCookies: string,
  _accessToken: string = ''
): string[] {
  const args: string[] = [];
  const cookies = userCookies.replace(/[\r\n\0]/g, '').trim();
  if (cookies) {
    const cookieFilePath = path.join(workDir, 'cookies.txt');
    if (cookies.includes('# Netscape HTTP Cookie File') || cookies.includes('\t')) {
      fs.writeFileSync(cookieFilePath, cookies, { encoding: 'utf8', mode: 0o600 });
    } else {
      const netscapeLines = ['# Netscape HTTP Cookie File'];
      for (const pair of cookies.split(';')) {
        const [k, ...vParts] = pair.trim().split('=');
        const v = vParts.join('=');
        const name = k?.trim() || '';
        const value = v?.trim() || '';
        if (name && value && /^[\w.*$-]+$/.test(name) && !/[\r\n\t]/.test(value)) {
          netscapeLines.push(`.youtube.com\tTRUE\t/\tTRUE\t2147483647\t${name}\t${value}`);
        }
      }
      fs.writeFileSync(cookieFilePath, netscapeLines.join('\n') + '\n', {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
    args.push('--cookies', cookieFilePath);
  }

  return args;
}

/** Prefer TV clients only when a real cookie file is present. */
export const YOUTUBE_PLAYER_CLIENTS_COOKIES: (string | null)[] = [
  'tv',
  'tv_embedded',
  'web',
  'mweb,tv',
  'android,ios,tv_embedded,mweb',
];

/** @deprecated yt-dlp no longer accepts YouTube OAuth; alias for cookie-backed clients. */
export const YOUTUBE_PLAYER_CLIENTS_OAUTH = YOUTUBE_PLAYER_CLIENTS_COOKIES;
