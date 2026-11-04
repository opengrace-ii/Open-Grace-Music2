import assert from 'node:assert/strict';
import {
  BYTES_PER_HOUR,
  RECORD_WARN_BYTES,
  RECORD_WARN_MS,
  estimateRecord,
  formatOptionLabel,
  formatRecordBytes,
  mp3InsteadLine,
  needsRecordConfirm,
  recordConfirmPrompt,
  recordEstimateLine,
} from '../src/utils/recordEstimate.ts';

assert.equal(RECORD_WARN_BYTES, 300 * 1024 * 1024);
assert.equal(RECORD_WARN_MS, 10 * 60 * 1000);
assert.equal(BYTES_PER_HOUR.MP3, 140 * 1024 * 1024);

const hourFlac = estimateRecord('FLAC', 3600);
assert.ok(hourFlac.bytes >= 1.2 * 1024 * 1024 * 1024);
assert.ok(hourFlac.bytes <= 2 * 1024 * 1024 * 1024);
assert.equal(needsRecordConfirm(hourFlac), true);
assert.match(recordConfirmPrompt(hourFlac), /Record anyway\?/);
assert.match(recordEstimateLine(hourFlac), /GB/);

const shortMp3 = estimateRecord('MP3', 180, 320);
assert.equal(needsRecordConfirm(shortMp3), false);
assert.ok(shortMp3.bytes < RECORD_WARN_BYTES);

const hourMp3 = estimateRecord('MP3', 3600, 320);
assert.equal(formatRecordBytes(hourMp3.bytes), '140 MB');
assert.match(mp3InsteadLine(3600), /140 MB/);
assert.equal(formatOptionLabel('MP3', 3600, 320), 'MP3 320 · ~140 MB · ~2 min');
assert.equal(formatOptionLabel('FLAC', 3600), 'FLAC 24/96 · ~1.4 GB · ~25 min');
assert.equal(formatOptionLabel('FLAC', 0), 'FLAC 24/96');

const unknownFlac = estimateRecord('FLAC', 0);
assert.equal(needsRecordConfirm(unknownFlac), true);

console.log('ok  record estimates');
