/**
 * Version label formatting.
 * Run: npx tsx scripts/test-version.ts
 */
import assert from 'node:assert/strict';
import { formatOgmVersionLabel } from '../src/version.ts';

assert.equal(formatOgmVersionLabel('1.4.0', 'abc1234def'), 'v1.4.0 · abc1234');
assert.equal(
  formatOgmVersionLabel('1.4.0', 'abc1234', { versionName: '1.4.0', versionCode: 12 }),
  'v1.4.0 · abc1234 · APK 1.4.0 (12)'
);
assert.equal(
  formatOgmVersionLabel('1.4.0', 'abc1234', { versionName: '1.4.0', versionCode: null }),
  'v1.4.0 · abc1234 · APK 1.4.0'
);
console.log('ok  version labels');
