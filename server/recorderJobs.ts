import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ConvertStage } from './homeRecord.ts';

export type RecorderJobStage = ConvertStage | 'queued';

export interface RecorderJobRequest {
  url: string;
  format: string;
  bitrate?: number;
  title?: string;
  artist?: string;
}

export interface RecorderJob {
  id: string;
  url: string;
  format: string;
  bitrate: number;
  title: string;
  artist: string;
  stage: RecorderJobStage;
  percent: number;
  message: string;
  error?: string;
  code?: string;
  resultPath?: string;
  resultMeta?: Record<string, string>;
  createdAt: number;
  claimedAt?: number;
  claimedBy?: string;
}

const JOB_TTL_MS = 20 * 60 * 1000;
const RESULT_TTL_MS = 12 * 60 * 1000;
const HEARTBEAT_ONLINE_MS = 25_000;
const MAX_QUEUED = 24;

const jobs = new Map<string, RecorderJob>();
const waiters: Array<(job: RecorderJob) => boolean> = [];
const lastHeartbeat = new Map<string, number>();

export function normalizeSecret(raw: string): string {
  return raw.replace(/[\r\n\0]/g, '').trim();
}

export function configuredWorkerSecret(): string {
  return normalizeSecret(process.env.OGM_WORKER_SECRET || '');
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function workerSecretMatches(presented: string): boolean {
  const expected = configuredWorkerSecret();
  if (!expected || !presented) return false;
  const a = Buffer.from(hashSecret(expected));
  const b = Buffer.from(hashSecret(presented));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function newRecorderJobId(): string {
  return `rj_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

export function pruneRecorderJobs(now = Date.now()) {
  for (const [id, job] of jobs) {
    const age = now - job.createdAt;
    const ttl = job.resultPath ? RESULT_TTL_MS : JOB_TTL_MS;
    if (age > ttl) {
      deleteJobFiles(job);
      jobs.delete(id);
    }
  }
}

function deleteJobFiles(job: RecorderJob) {
  if (!job.resultPath) return;
  try {
    fs.rmSync(path.dirname(job.resultPath), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function noteWorkerHeartbeat(workerId: string, now = Date.now()) {
  const id = workerId.replace(/[^\w.-]/g, '').slice(0, 64) || 'worker';
  lastHeartbeat.set(id, now);
}

export function recorderPresence(now = Date.now()): {
  online: boolean;
  workers: number;
  lastSeenAt: number | null;
} {
  let workers = 0;
  let lastSeenAt: number | null = null;
  for (const ts of lastHeartbeat.values()) {
    if (now - ts < HEARTBEAT_ONLINE_MS) {
      workers += 1;
      if (lastSeenAt == null || ts > lastSeenAt) lastSeenAt = ts;
    }
  }
  return { online: workers > 0, workers, lastSeenAt };
}

export function enqueueRecorderJob(
  req: RecorderJobRequest
): { ok: true; job: RecorderJob } | { ok: false; error: string; code: string } {
  pruneRecorderJobs();
  const queued = [...jobs.values()].filter((j) => j.stage === 'queued').length;
  if (queued >= MAX_QUEUED) {
    return { ok: false, error: 'Too many recordings in progress.', code: 'BUSY' };
  }
  const url = (req.url || '').trim();
  if (!url) {
    return { ok: false, error: 'url is required', code: 'INVALID' };
  }
  const job: RecorderJob = {
    id: newRecorderJobId(),
    url,
    format: (req.format || 'MP3').toUpperCase(),
    bitrate: Number(req.bitrate) || 320,
    title: (req.title || '').trim(),
    artist: (req.artist || '').trim(),
    stage: 'queued',
    percent: 4,
    message: 'Waiting for a recorder…',
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  const idx = waiters.findIndex((fn) => fn(job));
  if (idx >= 0) waiters.splice(idx, 1);
  return { ok: true, job };
}

export function getRecorderJob(jobId: string): RecorderJob | undefined {
  pruneRecorderJobs();
  return jobs.get(jobId);
}

function nextQueued(): RecorderJob | undefined {
  for (const job of jobs.values()) {
    if (job.stage === 'queued') return job;
  }
  return undefined;
}

export function claimRecorderJob(workerId: string, waitMs = 0): Promise<RecorderJob | null> {
  pruneRecorderJobs();
  noteWorkerHeartbeat(workerId);
  const ready = nextQueued();
  if (ready) {
    ready.stage = 'validate';
    ready.percent = 8;
    ready.message = 'Recorder picked up this song…';
    ready.claimedAt = Date.now();
    ready.claimedBy = workerId;
    return Promise.resolve(ready);
  }
  if (waitMs <= 0) return Promise.resolve(null);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(onJob);
      if (i >= 0) waiters.splice(i, 1);
      noteWorkerHeartbeat(workerId);
      resolve(null);
    }, waitMs);

    const onJob = (job: RecorderJob) => {
      if (job.stage !== 'queued') return false;
      clearTimeout(timer);
      job.stage = 'validate';
      job.percent = 8;
      job.message = 'Recorder picked up this song…';
      job.claimedAt = Date.now();
      job.claimedBy = workerId;
      resolve(job);
      return true;
    };
    waiters.push(onJob);
  });
}

export function updateRecorderProgress(
  job: RecorderJob,
  patch: { stage?: RecorderJobStage; percent?: number; message?: string }
) {
  if (job.stage === 'done' || job.stage === 'error') return;
  if (patch.stage) job.stage = patch.stage;
  if (typeof patch.percent === 'number') job.percent = Math.max(0, Math.min(100, patch.percent));
  if (patch.message) job.message = patch.message;
}

export function failRecorderJob(job: RecorderJob, error: string, code = 'EXTRACTION_FAILED') {
  job.stage = 'error';
  job.percent = 100;
  job.error = error;
  job.code = code;
  job.message = error;
}

export function storeRecorderResult(
  job: RecorderJob,
  bytes: Buffer,
  meta: Record<string, string>
): { ok: true } | { ok: false; error: string } {
  if (bytes.length < 1000) {
    return { ok: false, error: 'Recorded file was empty.' };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-rec-'));
  const ext = (meta['X-Audio-Extension'] || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
  const filePath = path.join(dir, `result.${ext}`);
  fs.writeFileSync(filePath, bytes);
  job.stage = 'done';
  job.percent = 100;
  job.message = 'Ready — saving to Library';
  job.resultPath = filePath;
  job.resultMeta = meta;
  return { ok: true };
}

export function takeRecorderResult(job: RecorderJob): { path: string; meta: Record<string, string> } | null {
  if (job.stage !== 'done' || !job.resultPath) return null;
  const resultPath = job.resultPath;
  const meta = job.resultMeta || {};
  jobs.delete(job.id);
  return { path: resultPath, meta };
}

export function publicJobStatus(job: RecorderJob) {
  return {
    jobId: job.id,
    stage: job.stage,
    percent: job.percent,
    message: job.message,
    done: job.stage === 'done',
    error: job.error,
    code: job.code,
    format: job.format,
  };
}

export function waitingJobCount(): number {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.stage === 'queued') n += 1;
  }
  return n;
}

export function resetRecorderJobsForTests() {
  for (const job of jobs.values()) deleteJobFiles(job);
  jobs.clear();
  waiters.length = 0;
  lastHeartbeat.clear();
}
