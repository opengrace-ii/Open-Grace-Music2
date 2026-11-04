/** One short line for the recorder. Never mentions tab/screen share, cookies paste, or TV OAuth. */
export function recordFailureSentence(
  format: string,
  serverMessage: string,
  code: string,
  onDeviceFailure: string | null,
  insideApk = false
): string {
  const blob = `${serverMessage} ${onDeviceFailure || ''} ${code}`.toLowerCase();
  if (insideApk && onDeviceFailure) {
    const short = onDeviceFailure.replace(/\s+/g, ' ').trim().slice(0, 160);
    return `Couldn’t save this as ${format}. ${short}`;
  }
  if (code === 'WORKER_SECRET_MISSING' || /hub secret isn’t set|worker_secret_missing/.test(blob)) {
    return 'Hub secret isn’t set (OGM_WORKER_SECRET).';
  }
  if (code === 'RECORDER_OFFLINE' || /no recorder is online|pc recorder is offline/.test(blob)) {
    return 'No recorder is online. Open the APK to record on this phone.';
  }
  if (code === 'TIMEOUT' || /timed out|timeout/.test(blob)) {
    return `Couldn’t save this as ${format}. Recording timed out — try MP3 320.`;
  }
  if (/did not match|different video/.test(blob)) {
    return `Couldn’t save this as ${format}. YouTube resolved a different video — retry this exact URL.`;
  }
  const short = (serverMessage || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return short ? `Couldn’t save this as ${format}. ${short}` : `Couldn’t save this as ${format}.`;
}
