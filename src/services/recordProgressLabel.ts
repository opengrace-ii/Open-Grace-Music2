/** Compact Record button copy: Queued → Recording 42% → Saved to Library */
export function compactRecordLabel(
  isDownloading: boolean,
  saved: boolean,
  percent: number,
  status: string
): string {
  if (saved && !isDownloading) return 'Saved to Library';
  if (!isDownloading) return 'RECORD';
  const p = Math.max(0, Math.min(99, Math.round(percent * 100)));
  if (/queued/i.test(status) || p < 12) return 'Queued';
  return `Recording ${p}%`;
}
