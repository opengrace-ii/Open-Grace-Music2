/**
 * Unit tests for exact-ID Invidious/Piped parsing (no screen share).
 * Run: npx tsx scripts/test-browser-exact-download.ts
 */
import assert from 'node:assert/strict';
import {
  downloadExactYoutubeAudioInBrowser,
  formatFromAudioBlob,
  invidiousAudioUrls,
  isLikelyAudioMagic,
  parseInvidiousInstanceDirectory,
  parseInvidiousVideo,
  originFromUri,
  parsePipedInstanceDirectory,
  parsePipedStreams,
  pickBestAudio,
  videoIdFromThumbnail,
  youtubeIdsEqual,
} from '../src/services/browserExactDownload.ts';
import { hasPastedYoutubeCookies } from '../src/services/youtubeCookies.ts';
import { recordFailureSentence } from '../src/services/recordFailureSentence.ts';

const TARGET = 'dQw4w9WgXcQ';
const OTHER = 'yYk7skapjFA';

function pass(name: string) {
  console.log(`ok  ${name}`);
}

assert.equal(youtubeIdsEqual(TARGET, TARGET), true);
assert.equal(youtubeIdsEqual(` ${TARGET} `, TARGET.toLowerCase()), true);
assert.equal(youtubeIdsEqual(TARGET, OTHER), false);
pass('youtube id equality');

assert.equal(videoIdFromThumbnail(`https://i.ytimg.com/vi/${TARGET}/hqdefault.jpg`), TARGET);
assert.equal(videoIdFromThumbnail('https://example.com/cat.jpg'), null);
pass('thumbnail video id');

const inv = parseInvidiousVideo(
  {
    videoId: TARGET,
    title: 'Never Gonna Give You Up',
    author: 'Rick Astley',
    lengthSeconds: 213,
    adaptiveFormats: [
      { itag: '18', type: 'video/mp4', url: 'https://googlevideo.example/v', bitrate: 400000 },
      { itag: '140', type: 'audio/mp4; codecs="mp4a.40.2"', url: 'https://googlevideo.example/a140', bitrate: 128000 },
      { itag: '251', type: 'audio/webm; codecs="opus"', url: 'https://googlevideo.example/a251', bitrate: 160000 },
    ],
  },
  TARGET
);
assert.ok(inv);
assert.equal(inv?.videoId, TARGET);
assert.equal(inv?.audio.length, 2);
assert.equal(pickBestAudio(inv!.audio)?.itag, '140');
pass('invidious exact id + prefer m4a');

assert.equal(parseInvidiousVideo({ videoId: OTHER, adaptiveFormats: [] }, TARGET), null);
assert.equal(
  parseInvidiousVideo(
    {
      videoId: OTHER,
      title: 'Wrong song',
      adaptiveFormats: [{ itag: '140', type: 'audio/mp4', url: 'https://x', bitrate: 1 }],
    },
    TARGET
  ),
  null
);
pass('invidious rejects a different video id');

const piped = parsePipedStreams(
  {
    title: 'Never Gonna Give You Up',
    uploader: 'Rick Astley',
    duration: 213,
    thumbnailUrl: `https://i.ytimg.com/vi/${TARGET}/maxresdefault.jpg`,
    audioStreams: [
      { url: 'https://pipedproxy.example/a251', mimeType: 'audio/webm', bitrate: 160000, quality: '160 kbps' },
      { url: 'https://pipedproxy.example/a140', mimeType: 'audio/mp4', bitrate: 128000, quality: '128 kbps' },
    ],
  },
  TARGET
);
assert.ok(piped);
assert.equal(piped?.videoId, TARGET);
assert.equal(pickBestAudio(piped!.audio)?.container, 'm4a');
pass('piped exact id from thumbnail');

assert.equal(
  parsePipedStreams(
    {
      thumbnailUrl: `https://i.ytimg.com/vi/${OTHER}/hqdefault.jpg`,
      audioStreams: [{ url: 'https://pipedproxy.example/a', mimeType: 'audio/mp4', bitrate: 128000 }],
    },
    TARGET
  ),
  null
);
assert.equal(
  parsePipedStreams(
    {
      title: 'No id anywhere',
      audioStreams: [{ url: 'https://pipedproxy.example/a', mimeType: 'audio/mp4', bitrate: 128000 }],
    },
    TARGET
  ),
  null
);
pass('piped refuses unverified or mismatched ids');

const urls = invidiousAudioUrls('https://yewtu.be', TARGET, {
  url: 'https://googlevideo.example/direct',
  itag: '140',
  mimeType: 'audio/mp4',
  bitrate: 128000,
  container: 'm4a',
});
assert.ok(urls[0].includes('local=true'));
assert.ok(urls[0].includes(TARGET));
assert.ok(urls.includes('https://googlevideo.example/direct'));
pass('invidious local proxy urls come first');

const ftyp = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]).buffer;
assert.equal(isLikelyAudioMagic(ftyp), true);
assert.equal(isLikelyAudioMagic(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]).buffer), false);
pass('audio magic rejects html');

const fmt = formatFromAudioBlob(new Blob([], { type: 'audio/mp4' }), 'audio/mp4');
assert.equal(fmt.format, 'M4A');
assert.equal(fmt.extension, 'm4a');
pass('downloaded m4a is labelled m4a, not flac');

assert.deepEqual(
  parseInvidiousInstanceDirectory([
    ['blocked.example', { api: false, uri: 'https://blocked.example', cors: false }],
    ['plain.example', { api: true, uri: 'https://plain.example', cors: false }],
    ['yewtu.be', { api: true, uri: 'https://yewtu.be', cors: true }],
  ]),
  ['https://yewtu.be', 'https://plain.example']
);
assert.equal(originFromUri('http://invidious.example'), null);
assert.ok(
  parsePipedInstanceDirectory([{ api_url: 'https://pipedapi.kavin.rocks' }]).includes(
    'https://pipedapi.kavin.rocks'
  )
);
pass('instance directories parse https origins');

assert.equal(hasPastedYoutubeCookies(''), false);
assert.equal(hasPastedYoutubeCookies('SID=abc; HSID=def'), true);
pass('pasted cookies are key-icon text only');

const webLogin = recordFailureSentence('MP3', 'YouTube asked for a login (LOGIN_REQUIRED).', 'YOUTUBE_BOT_CHECK', null, true);
assert.match(webLogin, /Couldn’t save this as MP3/);
assert.doesNotMatch(webLogin, /share this tab|getDisplayMedia|APK|screen share/i);
assert.doesNotMatch(webLogin, /reconnect/i);
pass('web LOGIN_REQUIRED copy is short and has no share/APK');

const exactFail = recordFailureSentence('MP3', 'Couldn’t fetch this exact video.', 'EXTRACTION_FAILED', null, false);
assert.match(exactFail, /Couldn’t fetch this exact video/);
assert.doesNotMatch(exactFail, /share this tab/i);
pass('exact-id failure is one short sentence');

const m4aBytes = new Uint8Array(50_000);
m4aBytes[4] = 0x66;
m4aBytes[5] = 0x74;
m4aBytes[6] = 0x79;
m4aBytes[7] = 0x70;

const mockFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes('api.invidious.io') || url.includes('piped-instances')) {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes(`/api/v1/videos/${TARGET}`)) {
    return new Response(
      JSON.stringify({
        videoId: TARGET,
        title: 'Never Gonna Give You Up',
        author: 'Rick Astley',
        lengthSeconds: 213,
        adaptiveFormats: [
          { itag: '140', type: 'audio/mp4', url: 'https://mirror.example/a140', bitrate: 128000 },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }
  if (url.includes(`/api/v1/videos/${OTHER}`)) {
    return new Response(
      JSON.stringify({
        videoId: TARGET,
        title: 'Wrong',
        adaptiveFormats: [{ itag: '140', type: 'audio/mp4', url: 'https://mirror.example/wrong', bitrate: 128000 }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }
  if (url.includes('/latest_version') || url.includes('mirror.example/a140')) {
    return new Response(m4aBytes, { status: 200, headers: { 'content-type': 'audio/mp4' } });
  }
  return new Response('nope', { status: 404 });
};

const downloaded = await downloadExactYoutubeAudioInBrowser(TARGET, undefined, { fetchImpl: mockFetch });
assert.equal(downloaded.videoId, TARGET);
assert.equal(downloaded.title, 'Never Gonna Give You Up');
assert.ok(downloaded.blob.size >= 40_000);
assert.equal(downloaded.format, 'M4A');
pass('mocked invidious download keeps the exact video id');

await assert.rejects(
  () => downloadExactYoutubeAudioInBrowser(OTHER, undefined, { fetchImpl: mockFetch }),
  /Couldn’t fetch this exact video|Mirror returned video/
);
pass('mocked download refuses a mismatched video id');

console.log('all browser-exact download tests passed');
