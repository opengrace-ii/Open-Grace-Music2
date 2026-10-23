#!/usr/bin/env node
/**
 * Smoke test: validate + convert YouTube URL UXdt9mmDiz0 via local server.
 * Usage: node scripts/test-youtube-convert.mjs [baseUrl]
 */
const BASE = (process.argv[2] || process.env.OGM_BASE_URL || 'http://127.0.0.1:43123').replace(/\/$/, '');
const VIDEO_URL = 'https://www.youtube.com/watch?v=UXdt9mmDiz0';

async function main() {
  console.log(`Testing Open Grace converter at ${BASE}`);

  const health = await fetch(`${BASE}/api/health`);
  if (!health.ok) {
    throw new Error(`/api/health failed: HTTP ${health.status}`);
  }
  const healthJson = await health.json();
  console.log('health:', healthJson);

  const validateRes = await fetch(
    `${BASE}/api/validate-url?url=${encodeURIComponent(VIDEO_URL)}`
  );
  const validateJson = await validateRes.json();
  if (!validateRes.ok || !validateJson.valid) {
    throw new Error(`validate-url failed: ${JSON.stringify(validateJson)}`);
  }
  console.log('validate:', validateJson.title, '—', validateJson.author);

  const convertRes = await fetch(`${BASE}/api/convert-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: VIDEO_URL, format: 'MP3', bitrate: 320 }),
  });

  if (!convertRes.ok) {
    let errBody = '';
    try {
      errBody = JSON.stringify(await convertRes.json());
    } catch {
      errBody = await convertRes.text();
    }
    throw new Error(`convert-audio failed HTTP ${convertRes.status}: ${errBody}`);
  }

  const buf = Buffer.from(await convertRes.arrayBuffer());
  if (buf.length < 30_000) {
    throw new Error(`convert-audio output too small: ${buf.length} bytes`);
  }

  const title = convertRes.headers.get('x-audio-title');
  console.log(
    `convert: OK ${buf.length} bytes, content-type=${convertRes.headers.get('content-type')}, title=${title ? decodeURIComponent(title) : 'n/a'}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
