import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const DEFAULT_HUB = 'https://open-grace-music2.onrender.com';

export function configDir(): string {
  const override = (process.env.OGM_RECORDER_HOME || '').trim();
  if (override) return override;
  return path.join(os.homedir(), '.config', 'open-grace-music');
}

export function secretPath(): string {
  return path.join(configDir(), 'worker-secret');
}

export function hubPath(): string {
  return path.join(configDir(), 'hub-url');
}

export function workerIdPath(): string {
  return path.join(configDir(), 'worker-id');
}

export function ensureConfigDir() {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
}

export function generateWorkerSecret(): string {
  return `ogm_${crypto.randomBytes(24).toString('base64url')}`;
}

export function loadOrCreateWorkerSecret(): { secret: string; created: boolean } {
  ensureConfigDir();
  const file = secretPath();
  const fromEnv = (process.env.OGM_WORKER_SECRET || '').replace(/[\r\n\0]/g, '').trim();
  if (fromEnv) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, `${fromEnv}\n`, { mode: 0o600 });
    return { secret: fromEnv, created: false };
  }
  if (fs.existsSync(file)) {
    const secret = fs.readFileSync(file, 'utf8').replace(/[\r\n\0]/g, '').trim();
    if (secret) return { secret, created: false };
  }
  const secret = generateWorkerSecret();
  fs.writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  return { secret, created: true };
}

export function loadOrCreateWorkerId(): string {
  ensureConfigDir();
  const file = workerIdPath();
  if (fs.existsSync(file)) {
    const id = fs.readFileSync(file, 'utf8').replace(/[^\w.-]/g, '').slice(0, 64);
    if (id) return id;
  }
  const id = `w_${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(file, `${id}\n`, { mode: 0o600 });
  return id;
}

export function loadHubUrl(cliHub?: string): string {
  const fromCli = (cliHub || '').trim();
  if (fromCli) return fromCli.replace(/\/$/, '');
  const fromEnv = (process.env.OGM_HUB_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const file = hubPath();
  if (fs.existsSync(file)) {
    const stored = fs.readFileSync(file, 'utf8').trim();
    if (stored) return stored.replace(/\/$/, '');
  }
  return DEFAULT_HUB.replace(/\/$/, '');
}

export function saveHubUrl(hub: string) {
  ensureConfigDir();
  fs.writeFileSync(hubPath(), `${hub.replace(/\/$/, '')}\n`, { mode: 0o600 });
}

export function cookiesFilePath(cliPath?: string): string | undefined {
  const fromCli = (cliPath || '').trim();
  if (fromCli) return fromCli;
  const fromEnv = (process.env.OGM_YT_COOKIES_FILE || '').trim();
  if (fromEnv) return fromEnv;
  const defaultFile = path.join(configDir(), 'youtube-cookies.txt');
  if (fs.existsSync(defaultFile)) return defaultFile;
  return undefined;
}

export function systemdUnit(opts: { repoDir: string; nodeBin: string; tsxBin: string; hub: string }): string {
  return `[Unit]
Description=Open Grace Music recorder worker
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${opts.repoDir}
ExecStart=${opts.nodeBin} ${opts.tsxBin} recorder/cli.ts --hub ${opts.hub}
Restart=on-failure
RestartSec=5
Environment=OGM_HUB_URL=${opts.hub}

[Install]
WantedBy=default.target
`;
}
