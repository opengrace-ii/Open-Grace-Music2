import fs from 'fs';
import path from 'path';

/**
 * Cookie file for yt-dlp. YouTube OAuth was removed from yt-dlp (Nov 2024);
 * TV Bearer/refresh tokens are not Netscape cookies and cannot authenticate the YouTube IE.
 * Do not use removed `--username oauth`. Do not send a global Authorization header (breaks CDN).
 *
 * PO tokens: optional `OGM_YT_PO_TOKEN` / `OGM_YT_VISITOR_DATA` (no extra token service).
 */

type NetscapeRow = {
  domain: string;
  flag: string;
  pathName: string;
  secure: string;
  expiry: string;
  name: string;
  value: string;
};

function isNetscapeCookies(raw: string): boolean {
  return raw.includes('# Netscape HTTP Cookie File') || /\t/.test(raw);
}

function parseNetscapeRows(raw: string): NetscapeRow[] {
  const rows: NetscapeRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 7) continue;
    const [domain, flag, pathName, secure, expiry, name, ...rest] = parts;
    const value = rest.join('\t');
    if (!name || !value) continue;
    rows.push({ domain, flag, pathName, secure, expiry, name, value });
  }
  return rows;
}

function parseHeaderRows(raw: string): NetscapeRow[] {
  const rows: NetscapeRow[] = [];
  for (const pair of raw.split(';')) {
    const [k, ...vParts] = pair.trim().split('=');
    const name = k?.trim() || '';
    const value = vParts.join('=').trim();
    if (name && value && /^[\w.*$-]+$/.test(name) && !/[\r\n\t]/.test(value)) {
      rows.push({
        domain: '.youtube.com',
        flag: 'TRUE',
        pathName: '/',
        secure: 'TRUE',
        expiry: '2147483647',
        name,
        value,
      });
    }
  }
  return rows;
}

function rowsFromCookieSource(raw: string): NetscapeRow[] {
  const text = raw.trim();
  if (!text) return [];
  return isNetscapeCookies(text) ? parseNetscapeRows(text) : parseHeaderRows(text);
}

function rowsToNetscape(rows: NetscapeRow[]): string {
  const lines = ['# Netscape HTTP Cookie File'];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.domain}\t${row.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(
      `${row.domain}\t${row.flag}\t${row.pathName}\t${row.secure}\t${row.expiry}\t${row.name}\t${row.value}`
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Primary (request) cookies win on name+domain; env cookies fill the rest. */
export function mergeYoutubeCookieSources(primary: string, secondary: string): string {
  const a = primary.trim();
  const b = secondary.trim();
  if (a && !b) return a;
  if (!a && b) return b;
  if (!a && !b) return '';
  const merged = new Map<string, NetscapeRow>();
  for (const row of rowsFromCookieSource(b)) merged.set(`${row.domain}\t${row.name}`, row);
  for (const row of rowsFromCookieSource(a)) merged.set(`${row.domain}\t${row.name}`, row);
  return rowsToNetscape([...merged.values()]);
}

export function mergedYoutubeCookies(userCookies: string): string {
  return mergeYoutubeCookieSources(userCookies, process.env.OGM_YT_COOKIES || '');
}

export function youtubeYtdlpAuthArgs(
  workDir: string,
  userCookies: string,
  _accessToken: string = ''
): string[] {
  const args: string[] = [];
  const cookies = mergedYoutubeCookies(userCookies).replace(/[\r\n\0]/g, '\n').trim();
  if (cookies) {
    const cookieFilePath = path.join(workDir, 'cookies.txt');
    if (cookies.includes('# Netscape HTTP Cookie File') || cookies.includes('\t')) {
      fs.writeFileSync(cookieFilePath, cookies.endsWith('\n') ? cookies : `${cookies}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    } else {
      fs.writeFileSync(cookieFilePath, rowsToNetscape(parseHeaderRows(cookies)), {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
    args.push('--cookies', cookieFilePath);
  }

  return args;
}

export function youtubePoTokenEnv(): { poToken: string; visitorData: string } {
  return {
    poToken: (process.env.OGM_YT_PO_TOKEN || '').trim(),
    visitorData: (process.env.OGM_YT_VISITOR_DATA || '').trim(),
  };
}

/** One --extractor-args youtube:… so player_client + optional PO token stay together. */
export function youtubePlayerExtractorArgs(playerClient: string): string[] {
  const parts = [`player_client=${playerClient}`];
  const { poToken, visitorData } = youtubePoTokenEnv();
  if (poToken) {
    const formatted = poToken.includes('+')
      ? poToken
      : `${playerClient.split(',')[0]}.gvs+${poToken}`;
    parts.push(`po_token=${formatted}`);
  }
  if (visitorData) parts.push(`visitor_data=${visitorData}`);
  return ['--extractor-args', `youtube:${parts.join(';')}`];
}

export function ytDlpJsRuntimeArgs(): string[] {
  const nodeBin = process.execPath || 'node';
  return ['--js-runtimes', `node:${nodeBin}`, '--remote-components', 'ejs:github'];
}

/** Exact-id clients. Try one at a time; LOGIN_REQUIRED on one must not skip the rest. */
export const YOUTUBE_PLAYER_CLIENTS: string[] = [
  'android',
  'ios',
  'web',
  'mweb',
  'tv_embedded',
  'android_vr',
  'web_safari',
  'tv',
  'web_embedded',
];

/** Prefer TV/web when a real cookie file is present. */
export const YOUTUBE_PLAYER_CLIENTS_COOKIES: string[] = [
  'tv',
  'tv_embedded',
  'web',
  'mweb',
  'android',
  'ios',
  'android_vr',
  'web_safari',
  'web_embedded',
];

/** @deprecated yt-dlp no longer accepts YouTube OAuth; alias for cookie-backed clients. */
export const YOUTUBE_PLAYER_CLIENTS_OAUTH = YOUTUBE_PLAYER_CLIENTS_COOKIES;
