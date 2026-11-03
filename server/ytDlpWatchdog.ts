import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';

/** Kill yt-dlp if stdout/stderr has no useful progress for this long during extract. */
export const EXTRACT_STALL_MS = 25_000;

export type SpawnImpl = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface YtDlpWatchdogOptions {
  timeoutMs: number;
  stallMs?: number;
  cwd?: string;
  onLine?: (line: string) => void;
  spawnImpl?: SpawnImpl;
  command?: string;
}

export class YtDlpWatchdogError extends Error {
  stderr: string;
  stdout: string;
  killed: boolean;
  stalled: boolean;
  timedOut: boolean;
  lastUsefulLine: string;

  constructor(init: {
    message: string;
    stderr?: string;
    stdout?: string;
    killed?: boolean;
    stalled?: boolean;
    timedOut?: boolean;
    lastUsefulLine?: string;
  }) {
    super(init.message);
    this.name = 'YtDlpWatchdogError';
    this.stderr = init.stderr || '';
    this.stdout = init.stdout || '';
    this.killed = !!init.killed;
    this.stalled = !!init.stalled;
    this.timedOut = !!init.timedOut;
    this.lastUsefulLine = init.lastUsefulLine || '';
  }
}

export function isUsefulYtDlpLine(line: string): boolean {
  const t = line.replace(/\s+/g, ' ').trim();
  if (!t) return false;
  return /\[download\]|\[youtube\]|\[info\]|\[debug\]|ERROR:|WARNING:|Destination:|Merging|Extracting|Downloading|LOGIN_REQUIRED|%\s*of/i.test(
    t
  );
}

export function parseYtDlpDownloadPercent(line: string): number | null {
  const m = line.match(/\[download\]\s+([\d.]+)%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function attachLineReader(
  stream: NodeJS.ReadableStream | null | undefined,
  onLine: (line: string) => void
): void {
  if (!stream) return;
  stream.setEncoding('utf8');
  let buf = '';
  const flushParts = (chunk: string) => {
    buf += chunk;
    const parts = buf.split(/\r?\n|\r/);
    buf = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (line) onLine(line);
    }
  };
  stream.on('data', (chunk: string) => flushParts(chunk));
  stream.on('end', () => {
    const line = buf.trim();
    buf = '';
    if (line) onLine(line);
  });
}

/**
 * Run yt-dlp with streaming output. If no useful line arrives for stallMs, kill the process.
 */
export function runYtDlpWatched(
  args: string[],
  options: YtDlpWatchdogOptions
): Promise<void> {
  const stallMs = options.stallMs ?? EXTRACT_STALL_MS;
  const timeoutMs = options.timeoutMs;
  const spawnImpl = options.spawnImpl || spawn;
  const command = options.command || 'yt-dlp';

  return new Promise((resolve, reject) => {
    let settled = false;
    let stalled = false;
    let timedOut = false;
    let killed = false;
    let lastUsefulLine = '';
    let stdout = '';
    let stderr = '';

    let child: ChildProcess;
    try {
      child = spawnImpl(command, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(
        new YtDlpWatchdogError({
          message: err instanceof Error ? err.message : String(err),
          lastUsefulLine: '',
        })
      );
      return;
    }

    const finish = (err: YtDlpWatchdogError | null) => {
      if (settled) return;
      settled = true;
      clearInterval(stallTimer);
      clearTimeout(timeoutTimer);
      if (err) reject(err);
      else resolve();
    };

    const killChild = (reason: 'stall' | 'timeout') => {
      if (settled) return;
      if (reason === 'stall') stalled = true;
      if (reason === 'timeout') timedOut = true;
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // already exited
      }
    };

    const noteLine = (line: string, from: 'stdout' | 'stderr') => {
      if (from === 'stdout') stdout += `${line}\n`;
      else stderr += `${line}\n`;
      if (!isUsefulYtDlpLine(line)) return;
      lastUsefulLine = line.slice(0, 400);
      lastUsefulAt = Date.now();
      options.onLine?.(line);
      if (/LOGIN_REQUIRED|sign in to confirm you.re not a bot/i.test(line)) {
        killed = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // already exiting
        }
      }
    };

    let lastUsefulAt = Date.now();

    attachLineReader(child.stdout, (line) => noteLine(line, 'stdout'));
    attachLineReader(child.stderr, (line) => noteLine(line, 'stderr'));

    const stallTimer = setInterval(() => {
      if (settled) return;
      if (Date.now() - lastUsefulAt >= stallMs) {
        killChild('stall');
      }
    }, Math.min(1000, Math.max(20, Math.floor(stallMs / 2))));

    const timeoutTimer = setTimeout(() => killChild('timeout'), timeoutMs);

    child.on('error', (err) => {
      finish(
        new YtDlpWatchdogError({
          message: err.message || 'yt-dlp failed to start',
          stderr,
          stdout,
          lastUsefulLine,
          killed,
          stalled,
          timedOut,
        })
      );
    });

    child.on('close', (code, signal) => {
      if (code === 0 && !stalled && !timedOut) {
        finish(null);
        return;
      }
      const last = lastUsefulLine || (code == null ? String(signal || '') : `yt-dlp exit ${code}`);
      finish(
        new YtDlpWatchdogError({
          message: last,
          stderr,
          stdout,
          lastUsefulLine,
          killed: killed || signal === 'SIGKILL' || signal === 'SIGTERM',
          stalled,
          timedOut,
        })
      );
    });
  });
}
