import assert from 'node:assert/strict';
import { safeDownloadFilename } from '../src/utils/downloadFilename.ts';

assert.equal(safeDownloadFilename('Hallelujah', 'mp3'), 'Hallelujah.mp3');
assert.equal(safeDownloadFilename('a/b:c', 'FLAC'), 'a b c.flac');
assert.equal(safeDownloadFilename('   ', 'mp3'), 'Open Grace Music.mp3');
assert.equal(safeDownloadFilename('song?', 'mp3'), 'song.mp3');
assert.match(safeDownloadFilename('x'.repeat(200), 'm4a'), /^x{80}\.m4a$/);
console.log('ok  download filenames');
