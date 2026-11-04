#!/usr/bin/env tsx
/**
 * Open Grace Music recorder worker.
 * Polls the site for Record jobs, runs yt-dlp + ffmpeg on this machine, uploads the file.
 * Any number of workers may share the same OGM_WORKER_SECRET.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  cookiesFilePath,
  loadHubUrl,
  loadOrCreateWorkerId,
  loadOrCreateWorkerSecret,
  saveHubUrl,
  systemdUnit,
} from './config.ts';
import { resolveFormatSpec } from '../server/audioFormats.ts';
import { runHomeRecord } from '../server/homeRecord.ts';
import { extractYouTubeId } from '../src/services/mediaResolver.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_DIR = path.resolve(__dirname, '..');

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function authHeaders(secret: string, workerId: string): Record<string, string> {
  return { Authorization: `Bearer ${secret}`, 'X-Ogm-Worker-Id': workerId };
}

async function fetchYouTubeOEmbed(ytId: string): Promise<{ title?: string; author?: string; thumbnailUrl?: string }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}&format=json`
    );
    if (!res.ok) return { thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` };
    const json = (await res.json()) as { title?: string; author_name?: string };
    return {
      title: json.title,
      author: json.author_name,
      thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
    };
  } catch {
    return { thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` };
  }
}

async function installUserService(hub: string) {
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  fs.mkdirSync(unitDir, { recursive: true });
  const nodeBin = process.execPath;
  const tsxBin = path.join(REPO_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(tsxBin)) {
    console.error('Run npm install in the Open Grace Music folder first.');
    process.exit(1);
  }
  const unitPath = path.join(unitDir, 'open-grace-recorder.service');
  fs.writeFileSync(unitPath, systemdUnit({ repoDir: REPO_DIR, nodeBin, tsxBin, hub }), { mode: 0o644 });
  console.log(`Wrote ${unitPath}`);
  console.log('Enable at login with:');
  console.log('  systemctl --user daemon-reload');
  console.log('  systemctl --user enable --now open-grace-recorder.service');
  console.log('  loginctl enable-linger "$USER"   # optional: keep running after logout');
}

type ClaimedJob = {
  id: string;
  url: string;
  format: string;
  bitrate: number;
  title?: string;
  artist?: string;
};

async function claimJob(hub: string, secret: string, workerId: string): Promise<ClaimedJob | null> {
  const res = await fetch(`${hub}/api/recorder/claim?wait=20000`, {
    headers: authHeaders(secret, workerId),
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`claim failed HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  const data = (await res.json()) as { job?: ClaimedJob };
  return data.job || null;
}

async function postProgress(
  hub: string,
  secret: string,
  workerId: string,
  jobId: string,
  body: { stage: string; percent: number; message: string }
) {
  await fetch(`${hub}/api/recorder/jobs/${encodeURIComponent(jobId)}/progress`, {
    method: 'POST',
    headers: { ...authHeaders(secret, workerId), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postFail(hub: string, secret: string, workerId: string, jobId: string, error: string, code?: string) {
  await fetch(`${hub}/api/recorder/jobs/${encodeURIComponent(jobId)}/fail`, {
    method: 'POST',
    headers: { ...authHeaders(secret, workerId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ error, code }),
  });
}

async function postResult(
  hub: string,
  secret: string,
  workerId: string,
  jobId: string,
  filePath: string,
  meta: Record<string, string>
) {
  const bytes = fs.readFileSync(filePath);
  const headers: Record<string, string> = {
    ...authHeaders(secret, workerId),
    'Content-Type': meta['Content-Type'] || 'application/octet-stream',
  };
  for (const [k, v] of Object.entries(meta)) {
    if (k === 'Content-Type') continue;
    headers[k] = v;
  }
  const res = await fetch(`${hub}/api/recorder/jobs/${encodeURIComponent(jobId)}/result`, {
    method: 'POST',
    headers,
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`upload failed HTTP ${res.status}`);
  }
}

async function runOnce(hub: string, secret: string, workerId: string, cookiesFile?: string) {
  const job = await claimJob(hub, secret, workerId);
  if (!job) return false;
  console.log(`[recorder] job ${job.id} ${job.format} ${job.url}`);
  const formatSpec = resolveFormatSpec(job.format, job.bitrate);
  const result = await runHomeRecord(
    {
      url: job.url,
      formatSpec,
      customTitle: job.title,
      customArtist: job.artist,
      cookiesFile,
      extractYouTubeId,
      fetchYouTubeOEmbed,
    },
    (stage, percent, message) => {
      void postProgress(hub, secret, workerId, job.id, { stage, percent, message });
    }
  );
  if (!result.ok) {
    console.error(`[recorder] fail ${result.code}: ${result.error}`);
    await postFail(hub, secret, workerId, job.id, result.error, result.code);
    try {
      fs.rmSync(result.workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    return true;
  }
  try {
    await postResult(hub, secret, workerId, job.id, result.outputFilePath, result.responseMeta);
    console.log(`[recorder] uploaded ${result.safeFilename}.${formatSpec.extension}`);
  } finally {
    try {
      fs.rmSync(result.workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  return true;
}

async function main() {
  const hub = loadHubUrl(argValue('--hub'));
  saveHubUrl(hub);
  const { secret, created } = loadOrCreateWorkerSecret();
  const workerId = loadOrCreateWorkerId();
  const cookiesFile = cookiesFilePath(argValue('--cookies'));

  if (hasFlag('--print-secret')) {
    process.stdout.write(`${secret}\n`);
    return;
  }

  if (hasFlag('--install-service')) {
    await installUserService(hub);
    return;
  }

  console.log('Open Grace Music recorder worker');
  console.log(`Hub: ${hub}`);
  console.log(`Worker: ${workerId}`);
  if (created) {
    console.log('New worker secret (set the same value as OGM_WORKER_SECRET on Render and every worker):');
    console.log(`  ${secret}`);
  } else {
    console.log('Worker secret is loaded from env or ~/.config/open-grace-music/worker-secret (not printed).');
  }
  if (cookiesFile) console.log(`Cookies: ${cookiesFile}`);
  console.log('Waiting for Record jobs…');

  try {
    await fetch(`${hub}/api/recorder/heartbeat`, {
      method: 'POST',
      headers: authHeaders(secret, workerId),
    });
  } catch {
    console.error('[recorder] hub not reachable yet — retrying');
  }

  for (;;) {
    try {
      const worked = await runOnce(hub, secret, workerId, cookiesFile);
      if (!worked) await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[recorder] ${message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
