import fs from 'fs';
import path from 'path';

/** Optional Netscape cookies.txt for yt-dlp. Never logs the contents. */
export function youtubeCookiesArgs(workDir: string, raw?: string): string[] {
  const text = (raw || '').replace(/[\r\n\0]/g, '\n').trim();
  if (!text) return [];
  const file = path.join(workDir, 'youtube.cookies');
  if (text.includes('# Netscape HTTP Cookie File') || /\t/.test(text)) {
    fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`, { mode: 0o600 });
  } else {
    const lines = ['# Netscape HTTP Cookie File'];
    for (const pair of text.split(';')) {
      const [k, ...vParts] = pair.trim().split('=');
      const name = k?.trim() || '';
      const value = vParts.join('=').trim();
      if (name && value && /^[\w.*$-]+$/.test(name)) {
        lines.push(`.youtube.com\tTRUE\t/\tTRUE\t2147483647\t${name}\t${value}`);
      }
    }
    if (lines.length < 2) return [];
    fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  }
  return ['--cookies', file];
}
