/**
 * Dead-path removal tests: Invidious/Piped, Render yt-dlp convert, TV oauth, tab capture.
 * Run: npx tsx scripts/test-dead-paths.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pass(name: string) {
  console.log(`ok  ${name}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const gone = [
  'src/services/browserExactDownload.ts',
  'src/services/youtubeOauth.ts',
  'server/convertPipeline.ts',
  'server/youtubeYtdlpAuth.ts',
  'server/youtubeTvOauth.ts',
  'scripts/test-browser-exact-download.ts',
];
for (const rel of gone) {
  assert.equal(fs.existsSync(path.join(root, rel)), false, `expected gone: ${rel}`);
}
pass('dead modules are deleted');

const srcBlob = [
  'src/App.tsx',
  'src/components/DownloadDialog.tsx',
  'src/components/SettingsModal.tsx',
  'server.ts',
  'src/services/converterApi.ts',
].map(read).join('\n');

assert.doesNotMatch(srcBlob, /invidious|pipedapi|PIPED_FALLBACK|INVIDIOUS_FALLBACK/i);
assert.doesNotMatch(srcBlob, /getDisplayMedia|share this tab/i);
assert.doesNotMatch(srcBlob, /youtube-oauth|player_client=android|OGM_YT_PO_TOKEN/);
assert.doesNotMatch(srcBlob, /Paste youtube.com cookies/i);
pass('src no longer references mirrors, tab capture, TV oauth, or cookie paste');

assert.match(read('server.ts'), /RECORDER_REQUIRED/);
assert.match(read('server.ts'), /\/api\/recorder\/jobs/);
assert.match(read('server.ts'), /OGM_WORKER_SECRET|workerSecretMatches/);
assert.doesNotMatch(read('server.ts'), /runConvertPipeline/);
pass('server exposes worker queue and 410s convert-audio');

assert.match(read('src/App.tsx'), /isOnDeviceDownloadAvailable/);
assert.match(read('src/App.tsx'), /startConvertJob/);
assert.doesNotMatch(read('src/App.tsx'), /browser-exact|downloadExactYoutube/);
pass('web Record is on-device then worker queue');

assert.equal(fs.existsSync(path.join(root, 'recorder/worker.mjs')), true);
assert.match(read('package.json'), /"recorder": "node recorder\/worker.mjs"/);
assert.match(read('src/App.tsx'), /VersionStamp/);
assert.match(read('src/components/MorePage.tsx'), /VersionStamp/);
assert.match(read('src/components/YouTubeBrowserModal.tsx'), /compactRecordLabel|Saved to Library/);
assert.match(read('src/App.tsx'), /RecorderStatusLine/);
pass('standalone Node 18 worker and version stamp are wired');

console.log('all dead-path tests passed');
