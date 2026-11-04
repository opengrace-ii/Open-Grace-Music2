/** Clean download filename for browsers (cannot pick a folder). */
export function safeDownloadFilename(title: string, ext: string): string {
  const base = (title || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '')
    .slice(0, 80);
  const e = (ext || 'mp3').replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'mp3';
  return `${base || 'Open Grace Music'}.${e}`;
}
