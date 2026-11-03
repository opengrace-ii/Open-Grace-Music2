/** One accurate sentence for the recorder. Never says Connect YouTube when already connected. */
export function recordFailureSentence(
  format: string,
  serverMessage: string,
  code: string,
  onDeviceFailure: string | null,
  youtubeConnected: boolean
): string {
  const blob = `${serverMessage} ${onDeviceFailure || ''} ${code}`.toLowerCase();
  if (code === 'TIMEOUT' || /timed out|timeout/.test(blob)) {
    return `Couldn’t save this as ${format}. Conversion timed out — try MP3 320 or retry on Wi‑Fi.`;
  }
  if (
    code === 'YOUTUBE_BOT_CHECK' ||
    /login_required|asked for a login|sign in|not a bot|cookies are needed|converter host is (still )?blocked/.test(blob)
  ) {
    return youtubeConnected
      ? `Couldn’t save this as ${format}. Session is valid in the browser; the converter host is still blocked — Chrome cookies (key) or APK 1.3.5 Record.`
      : `Couldn’t save this as ${format}. Converter host is blocked — Chrome cookies (key) or APK 1.3.5 Record.`;
  }
  if (/did not match|different video/.test(blob)) {
    return `Couldn’t save this as ${format}. YouTube resolved a different video — retry this exact URL.`;
  }
  if (/http 403|blocked this stream/.test(blob)) {
    return `Couldn’t save this as ${format}. Converter host is blocked — Chrome cookies (key) or APK 1.3.5 Record.`;
  }
  if (
    code === 'EXTRACTION_FAILED' ||
    /missed this video|no audio|no stream|could not fetch|no playable/.test(blob)
  ) {
    return youtubeConnected
      ? `Couldn’t save this as ${format}. No playable audio stream for this video. Play it, then retry Record.`
      : `Couldn’t save this as ${format}. Converter host is blocked — Chrome cookies (key) or APK 1.3.5 Record.`;
  }
  return `Couldn’t save this as ${format}. ${serverMessage}`;
}
