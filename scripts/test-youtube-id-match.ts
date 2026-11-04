/**
 * Unit tests for the yt-dlp video-id matcher + extract watchdog.
 * Run: npx tsx scripts/test-youtube-id-match.ts
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import {
  classifyPipelineError,
  runYtDlpWatched,
  YtDlpWatchdogError,
  YOUTUBE_LOGIN_REQUIRED_ERROR,
} from '../server/homeRecord.ts';
import {
  describeYoutubeIdMatch,
  inspectInfoJson,
  matchExtractedYoutubeId,
  youtubeIdsEqual,
} from '../server/youtubeIdMatch.ts';
import { recordFailureSentence } from '../src/services/recordFailureSentence.ts';

const TARGET = 'yYk7skapjFA';

function pass(name: string) {
  console.log(`ok  ${name}`);
}

assert.equal(youtubeIdsEqual(TARGET, TARGET), true);
assert.equal(matchExtractedYoutubeId(TARGET, TARGET).kind, 'match');
pass('equal ids match');

assert.equal(youtubeIdsEqual(`  ${TARGET}  `, TARGET.toLowerCase()), true);
assert.equal(matchExtractedYoutubeId(` ${TARGET.toLowerCase()} `, TARGET).kind, 'match');
pass('case/whitespace-insensitive match');

const other = 'dQw4w9WgXcQ';
assert.equal(youtubeIdsEqual(TARGET, other), false);
const mismatch = matchExtractedYoutubeId(other, TARGET);
assert.equal(mismatch.kind, 'mismatch');
assert.equal(mismatch.reportedId, other);
pass('different nonempty id is mismatch');

assert.equal(matchExtractedYoutubeId('', TARGET).kind, 'empty');
assert.equal(matchExtractedYoutubeId(null, TARGET).kind, 'empty');
pass('empty reported id is empty, not mismatch');

const sidecar = inspectInfoJson({
  id: TARGET,
  extractor_key: 'Youtube',
  extractor: 'youtube',
});
const fromSidecar = matchExtractedYoutubeId(sidecar.reportedId, TARGET, sidecar);
assert.equal(fromSidecar.kind, 'match');
pass('Youtube extractor_key still matches');

const desc = describeYoutubeIdMatch(TARGET, fromSidecar);
assert.match(desc, /requested=yYk7skapjFA/);
assert.doesNotMatch(desc, /Bearer|cookie|SID=/i);
pass('log line has ids, no secrets');

const login = classifyPipelineError(new Error('ERROR: [youtube] yYk7skapjFA: LOGIN_REQUIRED Sign in to confirm'), 'extract');
assert.equal(login.code, 'YOUTUBE_BOT_CHECK');
assert.equal(login.error, YOUTUBE_LOGIN_REQUIRED_ERROR);
assert.doesNotMatch(login.error, /Reconnect|APK|share this tab|converter host is blocked/i);
pass('LOGIN_REQUIRED maps to a short login error');

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
pass('LOGIN_REQUIRED wins over watchdog kill');

const timed = classifyPipelineError({ message: 'Command failed', killed: true }, 'extract');
assert.equal(timed.code, 'TIMEOUT');
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
pass('stalled extract uses last yt-dlp line');

const webOffline = recordFailureSentence('MP3', 'No recorder is online.', 'RECORDER_OFFLINE', null, false);
assert.equal(webOffline, 'No recorder is online. Open the APK to record on this phone.');
assert.doesNotMatch(webOffline, /share this tab|getDisplayMedia|Connect YouTube and retry/i);
pass('web offline offers APK, not tab share');

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
  assert.ok(Date.now() - stallStarted < 1500);
}
pass('stalled extract trips watchdog (mock)');

console.log('all youtube id-match tests passed');
