/**
 * Activity log plain-text copy dump.
 * Run: npx tsx scripts/test-activity-log.ts
 */
import assert from 'node:assert/strict';
import {
  formatActivityEntryText,
  formatActivityLogDump,
  type ActivityEntry,
} from '../src/services/activityLog.ts';

const older: ActivityEntry = {
  id: 'al_old',
  ts: Date.UTC(2026, 10, 4, 6, 0, 0),
  action: 'import',
  label: 'Import hymn.mp3',
  result: 'saved',
  format: 'MP3',
  sizeBytes: 2048,
  source: 'hymn.mp3',
};

const newer: ActivityEntry = {
  id: 'al_new',
  ts: Date.UTC(2026, 10, 4, 7, 0, 0),
  action: 'record',
  label: 'Record YouTube',
  result: 'failed',
  format: 'MP3',
  detail: 'route=recorder-worker · No recorder is online.',
  source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

const one = formatActivityEntryText(newer);
assert.match(one, /FAILED · record · MP3/);
assert.match(one, /Record YouTube/);
assert.match(one, /route=recorder-worker/);
assert.match(one, /URL: https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
assert.match(one, /^IST:/m);
assert.match(one, /^Device:/m);
assert.doesNotMatch(one, /dQw4w9WgXcQ…/);
console.log('ok  one entry includes action, format, status, route, full URL, clocks');

const dump = formatActivityLogDump([older, newer], 'v1.4.2 · abc1234');
assert.match(dump, /^v1\.4\.2 · abc1234/);
assert.match(dump, /Activity log · 2 events · newest first/);
assert.ok(dump.indexOf('FAILED · record') < dump.indexOf('SAVED · import'), 'newest first');
assert.match(dump, /Size: 2\.0 KB|Size: 2 KB/);
console.log('ok  copy-all dump is newest-first with version line');

const empty = formatActivityLogDump([], 'v1.4.2 · abc1234');
assert.match(empty, /v1\.4\.2 · abc1234/);
assert.match(empty, /\(empty\)/);
console.log('ok  empty dump still has version line');

console.log('all activity-log tests passed');
