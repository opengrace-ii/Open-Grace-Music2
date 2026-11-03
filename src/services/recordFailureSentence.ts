/** One accurate sentence for the recorder. Never says Connect YouTube when already connected. Never tells a web user to use the APK. */
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
    if (onDeviceFailure) {
      return `Couldn’t save this as ${format}. Phone capture failed (${onDeviceFailure}). Paste youtube.com cookies (key) to retry Render.`;
    }
    return youtubeConnected
      ? `Couldn’t save this as ${format}. TV Connected is not a download session. Paste youtube.com cookies (key) for Render, or Record again and share this tab’s audio.`
      : `Couldn’t save this as ${format}. Paste youtube.com cookies (key) for Render, or Record again and share this tab’s audio.`;
  }
  if (/did not match|different video/.test(blob)) {
    return `Couldn’t save this as ${format}. YouTube resolved a different video — retry this exact URL.`;
  }
  if (/http 403|blocked this stream/.test(blob)) {
    return onDeviceFailure
      ? `Couldn’t save this as ${format}. Converter host is blocked — paste youtube.com cookies (key).`
      : `Couldn’t save this as ${format}. Paste youtube.com cookies (key) for Render, or Record again and share this tab’s audio.`;
  }
  if (
    code === 'EXTRACTION_FAILED' ||
    /missed this video|no audio|no stream|could not fetch|no playable/.test(blob)
  ) {
    if (onDeviceFailure) {
      return `Couldn’t save this as ${format}. No playable audio stream for this video. Play it, then retry Record.`;
    }
    return `Couldn’t save this as ${format}. Record again and share this tab’s audio, or paste youtube.com cookies (key) for Render.`;
  }
  return `Couldn’t save this as ${format}. ${serverMessage}`;
}
