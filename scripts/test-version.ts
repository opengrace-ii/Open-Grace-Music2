/**
 * Version label formatting.
 * Run: npx tsx scripts/test-version.ts
 */
import assert from 'node:assert/strict';
import { formatOgmVersionLabel } from '../src/version.ts';

assert.equal(formatOgmVersionLabel('1.5.1', 'abc1234def'), 'v1.5.1 · abc1234');
assert.equal(
  formatOgmVersionLabel('1.5.1', 'abc1234', { versionName: '1.5.1', versionCode: 14 }),
  'v1.5.1 · abc1234 · APK 1.5.1 (14)'
);
assert.equal(
  formatOgmVersionLabel('1.5.1', 'abc1234', { versionName: '1.5.1', versionCode: null }),
  'v1.5.1 · abc1234 · APK 1.5.1'
);
console.log('ok  version labels');
