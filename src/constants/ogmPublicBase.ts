/** Default public PWA + converter host (AppDeploy). Override at build with VITE_OGM_PUBLIC_BASE_URL / OGM_PUBLIC_BASE_URL. */
export const DEFAULT_OGM_PUBLIC_BASE_URL =
  (import.meta.env.VITE_OGM_PUBLIC_BASE_URL as string | undefined)?.trim() ||
  'https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai';

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function isAppDeployHost(originOrUrl: string): boolean {
  try {
    const host = new URL(originOrUrl.includes('://') ? originOrUrl : `https://${originOrUrl}`).hostname
      .toLowerCase();
    return host.endsWith('.appdeploy.ai') || host === 'appdeploy.ai';
  } catch {
    return false;
  }
}
