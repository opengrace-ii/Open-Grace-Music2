/** Same-origin absolute URL so mobile WebViews (e.g. Cursor preview) can still copy/open in Chrome. */
export function apkDownloadUrl(): string {
  if (typeof window === 'undefined') return '/OpenGraceMusic.apk';
  return `${window.location.origin}/OpenGraceMusic.apk`;
}

export function apkDownloadLandingUrl(): string {
  if (typeof window === 'undefined') return '/download';
  return `${window.location.origin}/download`;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** True when the page is likely inside an in-app browser that blocks file downloads. */
export function isLikelyInAppWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Cursor|FBAN|FBAV|Instagram|Line\//i.test(ua);
}

export function mobileApkDownloadHint(): string {
  const landing = apkDownloadLandingUrl();
  return `If the download does not start, open this page in Chrome: ${landing} — Cursor’s in-app preview cannot download APK files.`;
}
