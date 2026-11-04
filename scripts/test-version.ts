/**
 * Version label formatting.
 * Run: npx tsx scripts/test-version.ts
 */
import assert from 'node:assert/strict';
import { formatOgmVersionLabel } from '../src/version.ts';

assert.equal(formatOgmVersionLabel('1.5.2', 'abc1234def'), 'v1.5.2 · abc1234');
assert.equal(
  formatOgmVersionLabel('1.5.2', 'abc1234', { versionName: '1.5.2', versionCode: 15 }),
  'v1.5.2 · abc1234 · APK 1.5.2 (15)'
);
assert.equal(
  formatOgmVersionLabel('1.5.2', 'abc1234', { versionName: '1.5.2', versionCode: null }),
  'v1.5.2 · abc1234 · APK 1.5.2'
);
console.log('ok  version labels');
