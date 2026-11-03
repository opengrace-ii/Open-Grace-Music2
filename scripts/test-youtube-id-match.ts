/**
 * Unit tests for the yt-dlp video-id matcher + extract watchdog / LOGIN_REQUIRED copy.
 * Run: npx tsx scripts/test-youtube-id-match.ts
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  classifyPipelineError,
  runYtDlpWatched,
  YtDlpWatchdogError,
  YOUTUBE_LOGIN_REQUIRED_ERROR,
} from '../server/convertPipeline.ts';
import {
  describeYoutubeIdMatch,
  inspectInfoJson,
  matchExtractedYoutubeId,
  youtubeIdsEqual,
} from '../server/youtubeIdMatch.ts';
import { youtubeYtdlpAuthArgs } from '../server/youtubeYtdlpAuth.ts';
import { recordFailureSentence } from '../src/services/recordFailureSentence.ts';

const TARGET = 'yYk7skapjFA';

function pass(name: string) {
  console.log(`ok  ${name}`);
}

// equal
assert.equal(youtubeIdsEqual(TARGET, TARGET), true);
assert.equal(matchExtractedYoutubeId(TARGET, TARGET).kind, 'match');
pass('equal ids match');

// case + whitespace
assert.equal(youtubeIdsEqual(`  ${TARGET}  `, TARGET.toLowerCase()), true);
assert.equal(matchExtractedYoutubeId(` ${TARGET.toLowerCase()} `, TARGET).kind, 'match');
pass('case/whitespace-insensitive match');

// unequal nonempty
const other = 'dQw4w9WgXcQ';
assert.equal(youtubeIdsEqual(TARGET, other), false);
const mismatch = matchExtractedYoutubeId(other, TARGET);
assert.equal(mismatch.kind, 'mismatch');
assert.equal(mismatch.reportedId, other);
pass('different nonempty id is mismatch');

// empty / missing reported id is NOT a mismatch
assert.equal(youtubeIdsEqual('', TARGET), false);
assert.equal(youtubeIdsEqual(null, TARGET), false);
assert.equal(matchExtractedYoutubeId('', TARGET).kind, 'empty');
assert.equal(matchExtractedYoutubeId(null, TARGET).kind, 'empty');
assert.equal(matchExtractedYoutubeId(undefined, TARGET).kind, 'empty');
assert.equal(matchExtractedYoutubeId('   ', TARGET).kind, 'empty');
pass('empty reported id is empty, not mismatch');

// yt-dlp sidecar: extractor_key is "Youtube" (capital Y) — must not be treated as foreign
const sidecar = inspectInfoJson({
  id: TARGET,
  extractor_key: 'Youtube',
  extractor: 'youtube',
});
const fromSidecar = matchExtractedYoutubeId(sidecar.reportedId, TARGET, sidecar);
assert.equal(fromSidecar.kind, 'match');
assert.equal(fromSidecar.extractorKey, 'Youtube');
pass('Youtube extractor_key still matches');

// empty metadata sidecar
const emptySidecar = inspectInfoJson({ extractor_key: 'Youtube' });
assert.equal(matchExtractedYoutubeId(emptySidecar.reportedId, TARGET, emptySidecar).kind, 'empty');
pass('empty metadata is not a mismatch');

const desc = describeYoutubeIdMatch(TARGET, fromSidecar);
assert.match(desc, /requested=yYk7skapjFA/);
assert.match(desc, /reported=yYk7skapjFA/);
assert.doesNotMatch(desc, /Bearer|cookie|SID=/i);
pass('log line has ids, no secrets');

const login = classifyPipelineError(new Error('ERROR: [youtube] yYk7skapjFA: LOGIN_REQUIRED Sign in to confirm'), 'extract');
assert.equal(login.code, 'YOUTUBE_BOT_CHECK');
assert.equal(login.error, YOUTUBE_LOGIN_REQUIRED_ERROR);
assert.match(login.error, /LOGIN_REQUIRED/i);
assert.match(login.error, /converter host is blocked/i);
assert.doesNotMatch(login.error, /Reconnect|Connect YouTube and retry/i);
assert.doesNotMatch(login.error, /did not match/i);
pass('LOGIN_REQUIRED maps to short converter-host error');

const loginKilled = classifyPipelineError(
  new YtDlpWatchdogError({
    message: 'ERROR: [youtube] Oxm3iJG57M: LOGIN_REQUIRED',
    lastUsefulLine: 'ERROR: [youtube] Oxm3iJG57M: LOGIN_REQUIRED',
    stderr: 'ERROR: [youtube] Oxm3iJG57M: LOGIN_REQUIRED\n',
    killed: true,
    stalled: true,
  }),
  'extract'
);
assert.equal(loginKilled.code, 'YOUTUBE_BOT_CHECK');
assert.equal(loginKilled.error, YOUTUBE_LOGIN_REQUIRED_ERROR);
pass('LOGIN_REQUIRED wins over watchdog kill');

const timed = classifyPipelineError({ message: 'Command failed', killed: true }, 'extract');
assert.equal(timed.code, 'TIMEOUT');
assert.doesNotMatch(timed.error, /did not match/i);
pass('timeout is not labelled mismatch');

const stalledErr = classifyPipelineError(
  new YtDlpWatchdogError({
    message: '[youtube] Oxm3iJG57M: Downloading webpage',
    lastUsefulLine: '[youtube] Oxm3iJG57M: Downloading webpage',
    stalled: true,
    killed: true,
  }),
  'extract'
);
assert.equal(stalledErr.code, 'TIMEOUT');
assert.match(stalledErr.error, /stalled/i);
assert.match(stalledErr.error, /Downloading webpage/);
pass('stalled extract uses last yt-dlp line');

const noFmt = classifyPipelineError(new Error('Requested format is not available'), 'extract');
assert.equal(noFmt.code, 'EXTRACTION_FAILED');
assert.match(noFmt.error, /No playable audio stream/);
assert.doesNotMatch(noFmt.error, /did not match/i);
pass('no format is not labelled mismatch');

const connectedLogin = recordFailureSentence(
  'MP3',
  YOUTUBE_LOGIN_REQUIRED_ERROR,
  'YOUTUBE_BOT_CHECK',
  null,
  true
);
assert.match(connectedLogin, /TV Connected is not a download session/i);
assert.match(connectedLogin, /share this tab/i);
assert.doesNotMatch(connectedLogin, /reconnect/i);
assert.doesNotMatch(connectedLogin, /Connect YouTube and retry/i);
assert.doesNotMatch(connectedLogin, /APK 1\.3\.5/);
pass('Connected + LOGIN_REQUIRED does not say reconnect');

const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-auth-'));
const bearerOnly = youtubeYtdlpAuthArgs(authDir, '', 'ya29.a0AfB_byExampleToken-123');
assert.equal(bearerOnly.includes('--add-header'), false);
assert.equal(bearerOnly.includes('--cookies'), false);
assert.equal(bearerOnly.includes('--username'), false);
const cookieArgs = youtubeYtdlpAuthArgs(authDir, 'SID=abc; HSID=def', 'ya29.ignored');
assert.ok(cookieArgs.includes('--cookies'));
assert.equal(cookieArgs.includes('--add-header'), false);
fs.rmSync(authDir, { recursive: true, force: true });
pass('TV bearer is not passed as yt-dlp auth; cookies still are');

function mockSpawnStall(): (cmd: string, args: string[]) => EventEmitter {
  return () => {
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    const proc = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      killed: boolean;
      kill: (signal?: string) => boolean;
    };
    proc.stdout = stdout;
    proc.stderr = stderr;
    proc.killed = false;
    proc.kill = () => {
      proc.killed = true;
      queueMicrotask(() => proc.emit('close', null, 'SIGKILL'));
      return true;
    };
    queueMicrotask(() => {
      stderr.push('[youtube] Oxm3iJG57M: Downloading webpage\n');
    });
    return proc;
  };
}

const stallStarted = Date.now();
try {
  await runYtDlpWatched(['-f', 'bestaudio', 'https://www.youtube.com/watch?v=Oxm3iJG57M'], {
    timeoutMs: 5_000,
    stallMs: 80,
    spawnImpl: mockSpawnStall() as unknown as Parameters<typeof runYtDlpWatched>[1]['spawnImpl'],
  });
  assert.fail('stalled extract should reject');
} catch (err) {
  assert.ok(err instanceof YtDlpWatchdogError);
  assert.equal(err.stalled, true);
  assert.equal(err.killed, true);
  assert.match(err.lastUsefulLine, /Downloading webpage/);
  assert.ok(Date.now() - stallStarted < 1500, 'watchdog should trip in well under the job timeout');
  const mapped = classifyPipelineError(err, 'extract');
  assert.equal(mapped.code, 'TIMEOUT');
  assert.match(mapped.error, /stalled/i);
}
pass('stalled extract trips watchdog (mock)');

console.log('all youtube id-match tests passed');
