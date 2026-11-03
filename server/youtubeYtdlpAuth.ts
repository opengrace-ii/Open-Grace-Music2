import fs from 'fs';
import path from 'path';

/** Cookie + TV oauth files for yt-dlp. Tokens stay on disk in the job temp dir — never log them. */
export function youtubeYtdlpAuthArgs(
  workDir: string,
  userCookies: string,
  accessToken: string
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

  const bearer = accessToken.replace(/[\r\n\0]/g, '').trim();
  if (bearer && /^[\w./+=-]+$/.test(bearer)) {
    const confPath = path.join(workDir, 'ytdlp-oauth.conf');
    fs.writeFileSync(confPath, `--add-header Authorization:Bearer ${bearer}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    args.push('--ignore-config', '--config-locations', confPath);
  }

  return args;
}

export const YOUTUBE_PLAYER_CLIENTS_OAUTH: (string | null)[] = [
  'tv',
  'tv_embedded',
  'web',
  'mweb,tv',
  'android,ios,tv_embedded,mweb',
];
