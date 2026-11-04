export const OGM_WEB_VERSION =
  typeof __OGM_VERSION__ === 'string' && __OGM_VERSION__ ? __OGM_VERSION__ : '0.0.0';
export const OGM_GIT_SHA =
  typeof __OGM_GIT_SHA__ === 'string' && __OGM_GIT_SHA__ ? __OGM_GIT_SHA__ : 'unknown';

export interface ApkShellVersion {
  versionName: string;
  versionCode: number | null;
}

export function readApkShellVersion(): ApkShellVersion | null {
  try {
    const b = typeof window !== 'undefined' ? window.OgmAndroid : undefined;
    if (!b?.shellVersion) return null;
    const versionName = String(b.shellVersion() || '').trim();
    if (!versionName) return null;
    const rawCode = b.appVersionCode?.();
    const versionCode = typeof rawCode === 'number' && Number.isFinite(rawCode) ? rawCode : null;
    return { versionName, versionCode };
  } catch {
    return null;
  }
}

/** e.g. `v1.4.0 · a1b2c3d` or `v1.4.0 · a1b2c3d · APK 1.4.0 (12)` */
export function formatOgmVersionLabel(
  version = OGM_WEB_VERSION,
  sha = OGM_GIT_SHA,
  apk: ApkShellVersion | null = null
): string {
  const short = (sha || 'unknown').replace(/^v/, '').slice(0, 7);
  const web = `v${version} · ${short}`;
  if (!apk?.versionName) return web;
  const code = apk.versionCode != null ? ` (${apk.versionCode})` : '';
  return `${web} · APK ${apk.versionName}${code}`;
}
