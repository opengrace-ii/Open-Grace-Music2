import fs from 'fs';
import path from 'path';

/** Cookie + TV oauth files for yt-dlp. Tokens stay on disk in the job temp dir — never log them. */
export function youtubeYtdlpAuthArgs(
  workDir: string,
  userCookies: string,
  accessToken: string
): string[] {
  const args: string[] = [];
  const cookies = userCookies.trim();
  if (cookies) {
    const cookieFilePath = path.join(workDir, 'cookies.txt');
    if (cookies.includes('# Netscape HTTP Cookie File') || cookies.includes('\t')) {
      fs.writeFileSync(cookieFilePath, cookies, { encoding: 'utf8', mode: 0o600 });
    } else {
      const netscapeLines = ['# Netscape HTTP Cookie File'];
      for (const pair of cookies.split(';')) {
        const [k, ...vParts] = pair.trim().split('=');
        const v = vParts.join('=');
        if (k && v) {
          netscapeLines.push(`.youtube.com\tTRUE\t/\tTRUE\t2147483647\t${k.trim()}\t${v.trim()}`);
        }
      }
      fs.writeFileSync(cookieFilePath, netscapeLines.join('\n') + '\n', {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
    args.push('--cookies', cookieFilePath);
  }

  const bearer = accessToken.trim();
  if (bearer) {
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
