/**
 * Unit tests for the yt-dlp video-id matcher.
 * Run: npx tsx scripts/test-youtube-id-match.ts
 */
import assert from 'node:assert/strict';
import { classifyPipelineError } from '../server/convertPipeline.ts';
import {
  describeYoutubeIdMatch,
  inspectInfoJson,
  matchExtractedYoutubeId,
  youtubeIdsEqual,
} from '../server/youtubeIdMatch.ts';

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
assert.match(login.error, /LOGIN_REQUIRED/i);
assert.doesNotMatch(login.error, /did not match/i);
pass('LOGIN_REQUIRED is not labelled mismatch');

const timed = classifyPipelineError({ message: 'Command failed', killed: true }, 'extract');
assert.equal(timed.code, 'TIMEOUT');
assert.doesNotMatch(timed.error, /did not match/i);
pass('timeout is not labelled mismatch');

const noFmt = classifyPipelineError(new Error('Requested format is not available'), 'extract');
assert.equal(noFmt.code, 'EXTRACTION_FAILED');
assert.match(noFmt.error, /No playable audio stream/);
assert.doesNotMatch(noFmt.error, /did not match/i);
pass('no format is not labelled mismatch');

console.log('all youtube id-match tests passed');
