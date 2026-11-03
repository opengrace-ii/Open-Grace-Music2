/**
 * Unit tests for the web this-tab Record policy (no Render without cookies).
 * Run: npx tsx scripts/test-browser-tab-record.ts
 */
import assert from 'node:assert/strict';
import {
  formatTapeClock,
  hasPastedYoutubeCookies,
  honestBrowserCaptureFormat,
  isTabShareCancelError,
  shouldCallRenderConvert,
  tabShareConstraintAttempts,
  TabShareCancelledError,
} from '../src/services/browserTabCapture.ts';
import { recordFailureSentence } from '../src/services/recordFailureSentence.ts';

function pass(name: string) {
  console.log(`ok  ${name}`);
}

assert.equal(hasPastedYoutubeCookies(''), false);
assert.equal(hasPastedYoutubeCookies('   '), false);
assert.equal(hasPastedYoutubeCookies(null), false);
assert.equal(hasPastedYoutubeCookies('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc'), true);
assert.equal(hasPastedYoutubeCookies('SID=abc; HSID=def'), true);
pass('pasted cookies are key-icon text only');

assert.equal(
  shouldCallRenderConvert({ isWebTabSurface: true, hasCookies: false }),
  false
);
assert.equal(
  shouldCallRenderConvert({ isWebTabSurface: true, hasCookies: true, tabShareCancelled: true }),
  false
);
assert.equal(
  shouldCallRenderConvert({ isWebTabSurface: true, hasCookies: true, tabShareCancelled: false }),
  true
);
assert.equal(
  shouldCallRenderConvert({ isWebTabSurface: false, hasCookies: false }),
  true
);
pass('Render convert is cookies-only fallback on web; cancel never calls it');

assert.equal(formatTapeClock(0), '0:00');
assert.equal(formatTapeClock(83), '1:23');
assert.equal(formatTapeClock(3723), '1:02:03');
pass('recording clock is elapsed time');

const mp3 = honestBrowserCaptureFormat('MP3', 'audio/webm;codecs=opus', true);
assert.equal(mp3.format, 'MP3');
assert.equal(mp3.extension, 'mp3');
assert.equal(mp3.mime, 'audio/mpeg');
pass('asked MP3 + lamejs → labelled MP3');

const flac = honestBrowserCaptureFormat('FLAC', 'audio/webm;codecs=opus', false);
assert.equal(flac.format, 'WEBM');
assert.equal(flac.extension, 'webm');
assert.doesNotMatch(flac.format, /FLAC/i);
assert.match(flac.note, /not FLAC/i);
pass('asked FLAC without encoder → honest WEBM, not fake FLAC');

const m4a = honestBrowserCaptureFormat('WAV', 'audio/mp4', false);
assert.equal(m4a.format, 'M4A');
assert.equal(m4a.extension, 'm4a');
assert.match(m4a.note, /not WAV/i);
pass('asked WAV from mp4 capture → honest M4A');

const attempts = tabShareConstraintAttempts();
assert.ok(attempts[0].preferCurrentTab === true);
assert.ok(attempts[0].audio);
assert.ok(attempts[0].selfBrowserSurface === 'include');
pass('getDisplayMedia prefers current tab + audio');

const cancel = new TabShareCancelledError();
assert.equal(isTabShareCancelError(cancel), true);
assert.equal(isTabShareCancelError({ name: 'NotAllowedError', message: 'Permission denied' }), true);
assert.equal(isTabShareCancelError(new Error('no audio track')), false);
pass('user cancel is a one-shot failure');

const webLogin = recordFailureSentence(
  'MP3',
  'YouTube asked for a login (LOGIN_REQUIRED).',
  'YOUTUBE_BOT_CHECK',
  null,
  true
);
assert.match(webLogin, /share this tab/i);
assert.doesNotMatch(webLogin, /APK/i);
assert.doesNotMatch(webLogin, /reconnect/i);
pass('web LOGIN_REQUIRED copy does not say use APK');

console.log('all browser-tab record tests passed');
