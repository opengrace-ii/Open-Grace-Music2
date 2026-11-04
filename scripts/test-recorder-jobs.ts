/**
 * Job-queue + worker-secret tests (no YouTube).
 * Run: npx tsx scripts/test-recorder-jobs.ts
 */
import assert from 'node:assert/strict';
import {
  claimRecorderJob,
  enqueueRecorderJob,
  failRecorderJob,
  getRecorderJob,
  publicJobStatus,
  recorderPresence,
  resetRecorderJobsForTests,
  storeRecorderResult,
  takeRecorderResult,
  workerSecretMatches,
} from '../server/recorderJobs.ts';
import { recordFailureSentence } from '../src/services/recordFailureSentence.ts';

function pass(name: string) {
  console.log(`ok  ${name}`);
}

resetRecorderJobsForTests();
process.env.OGM_WORKER_SECRET = 'test-worker-secret';

assert.equal(workerSecretMatches('test-worker-secret'), true);
assert.equal(workerSecretMatches('wrong'), false);
assert.equal(workerSecretMatches(''), false);
pass('worker secret matches only the configured value');

const a = enqueueRecorderJob({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format: 'MP3', bitrate: 320 });
assert.equal(a.ok, true);
if (!a.ok) throw new Error('enqueue failed');
const b = enqueueRecorderJob({ url: 'https://www.youtube.com/watch?v=yYk7skapjFA', format: 'FLAC' });
assert.equal(b.ok, true);
if (!b.ok) throw new Error('enqueue 2 failed');
pass('two jobs enqueue on the shared queue');

const first = await claimRecorderJob('w_one', 0);
assert.ok(first);
assert.equal(first?.id, a.job.id);
assert.equal(first?.claimedBy, 'w_one');
const second = await claimRecorderJob('w_two', 0);
assert.ok(second);
assert.equal(second?.id, b.job.id);
assert.equal(second?.claimedBy, 'w_two');
pass('two workers claim different jobs');

const none = await claimRecorderJob('w_three', 0);
assert.equal(none, null);
pass('idle claim returns null');

failRecorderJob(first!, 'YouTube asked for a login (LOGIN_REQUIRED).', 'YOUTUBE_BOT_CHECK');
assert.equal(publicJobStatus(first!).stage, 'error');
pass('failed job is error');

const stored = storeRecorderResult(second!, Buffer.alloc(4096, 1), {
  'Content-Type': 'audio/mpeg',
  'X-Audio-Format': 'MP3',
  'X-Audio-Extension': 'mp3',
});
assert.equal(stored.ok, true);
const taken = takeRecorderResult(second!);
assert.ok(taken);
assert.equal(taken?.meta['X-Audio-Format'], 'MP3');
assert.equal(getRecorderJob(second!.id), undefined);
pass('result upload is taken once');

resetRecorderJobsForTests();
assert.equal(recorderPresence().online, false);
pass('presence starts offline');

const webOffline = recordFailureSentence('MP3', 'No recorder is online.', 'RECORDER_OFFLINE', null, false);
assert.match(webOffline, /Open the APK to record on this phone/);
assert.doesNotMatch(webOffline, /cookie|Connect YouTube|share this tab|Invidious|Piped/i);
pass('web offline copy offers APK');

const apkFail = recordFailureSentence('FLAC', 'ignored', 'RECORDER_OFFLINE', 'Missed this video’s audio. Play the video, then retry Record.', true);
assert.match(apkFail, /Missed this video/);
assert.doesNotMatch(apkFail, /Open the APK/);
pass('APK keeps on-device error, does not offer APK');

const connectedLogin = recordFailureSentence(
  'MP3',
  'YouTube asked for a login (LOGIN_REQUIRED).',
  'YOUTUBE_BOT_CHECK',
  null,
  false
);
assert.doesNotMatch(connectedLogin, /paste youtube.com cookies|share this tab|getDisplayMedia/i);
pass('failure copy has no cookie/tab-share instructions');

console.log('all recorder job tests passed');
