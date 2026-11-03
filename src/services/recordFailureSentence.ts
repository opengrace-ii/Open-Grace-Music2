/** One or two short sentences for the recorder. Never mentions tab/screen share. Never tells a web user to use the APK. */
export function recordFailureSentence(
  format: string,
  serverMessage: string,
  code: string,
  onDeviceFailure: string | null,
  youtubeConnected: boolean
): string {
  const blob = `${serverMessage} ${onDeviceFailure || ''} ${code}`.toLowerCase();
  if (code === 'TIMEOUT' || /timed out|timeout/.test(blob)) {
    return `Couldn’t save this as ${format}. Conversion timed out — try MP3 320.`;
  }
  if (
    code === 'YOUTUBE_BOT_CHECK' ||
    /login_required|asked for a login|sign in|not a bot|cookies are needed|converter host is (still )?blocked/.test(blob)
  ) {
    if (onDeviceFailure) {
      return `Couldn’t save this as ${format}. Phone capture failed. Paste youtube.com cookies (key) and retry.`;
    }
    return youtubeConnected
      ? `Couldn’t save this as ${format}. Couldn’t fetch this exact video. Paste youtube.com cookies (key) and retry.`
      : `Couldn’t save this as ${format}. Couldn’t fetch this exact video. Paste youtube.com cookies (key) and retry.`;
  }
  if (/did not match|different video/.test(blob)) {
    return `Couldn’t save this as ${format}. YouTube resolved a different video — retry this exact URL.`;
  }
  if (/http 403|blocked this stream/.test(blob)) {
    return `Couldn’t save this as ${format}. Couldn’t fetch this exact video. Paste youtube.com cookies (key) and retry.`;
  }
  if (
    code === 'EXTRACTION_FAILED' ||
    /missed this video|no audio|no stream|could not fetch|no playable|couldn’t fetch this exact video/.test(blob)
  ) {
    if (onDeviceFailure) {
      return `Couldn’t save this as ${format}. No playable audio stream for this video.`;
    }
    return `Couldn’t save this as ${format}. Couldn’t fetch this exact video.`;
  }
  const short = (serverMessage || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return short ? `Couldn’t save this as ${format}. ${short}` : `Couldn’t save this as ${format}.`;
}
