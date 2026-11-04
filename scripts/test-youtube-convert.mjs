#!/usr/bin/env node
/**
 * HTTP smoke: health, convert-audio is gone, recorder job bus with a mock worker.
 * Usage: node scripts/test-youtube-convert.mjs [baseUrl]
 */
const BASE = (process.argv[2] || process.env.OGM_BASE_URL || 'http://127.0.0.1:43123').replace(/\/$/, '');
const SECRET = process.env.OGM_WORKER_SECRET || '';

async function main() {
  console.log(`Testing Open Grace at ${BASE}`);

  const health = await fetch(`${BASE}/api/health`);
  if (!health.ok) throw new Error(`/api/health failed: HTTP ${health.status}`);
  const healthJson = await health.json();
  if (healthJson.ok !== true || healthJson.service !== 'ogm-converter') {
    throw new Error(`unexpected health: ${JSON.stringify(healthJson)}`);
  }
  console.log('health:', healthJson);

  const gone = await fetch(`${BASE}/api/convert-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format: 'MP3' }),
  });
  if (gone.status !== 410) {
    throw new Error(`convert-audio should be 410, got ${gone.status}`);
  }
  console.log('convert-audio: gone (410)');

  const presence = await fetch(`${BASE}/api/recorder/presence`);
  const presenceJson = await presence.json();
  console.log('presence:', presenceJson);

  if (!SECRET) {
    console.log('skip job round-trip (set OGM_WORKER_SECRET to exercise a worker)');
    return;
  }

  const hb = await fetch(`${BASE}/api/recorder/heartbeat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'X-Ogm-Worker-Id': 'test-worker', 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId: 'test-worker' }),
  });
  if (!hb.ok) throw new Error(`heartbeat failed HTTP ${hb.status}: ${await hb.text()}`);

  const start = await fetch(`${BASE}/api/recorder/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format: 'MP3', bitrate: 192 }),
  });
  if (!start.ok) throw new Error(`enqueue failed HTTP ${start.status}: ${await start.text()}`);
  const { jobId } = await start.json();

  const claim = await fetch(`${BASE}/api/recorder/claim?wait=1000`, {
    headers: { Authorization: `Bearer ${SECRET}`, 'X-Ogm-Worker-Id': 'test-worker' },
  });
  if (!claim.ok) throw new Error(`claim failed HTTP ${claim.status}`);
  const claimed = await claim.json();
  if (claimed.job?.id !== jobId) throw new Error('claimed unexpected job');

  const payload = Buffer.alloc(4096, 7);
  const upload = await fetch(`${BASE}/api/recorder/jobs/${jobId}/result`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'X-Ogm-Worker-Id': 'test-worker',
      'Content-Type': 'audio/mpeg',
      'X-Audio-Format': 'MP3',
      'X-Audio-Extension': 'mp3',
      'X-Audio-Title': encodeURIComponent('Test Track'),
    },
    body: payload,
  });
  if (!upload.ok) throw new Error(`result upload failed HTTP ${upload.status}: ${await upload.text()}`);

  const file = await fetch(`${BASE}/api/recorder/jobs/${jobId}/file`);
  if (!file.ok) throw new Error(`download failed HTTP ${file.status}`);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length !== payload.length) throw new Error(`size mismatch ${buf.length}`);
  console.log('recorder job round-trip: OK', buf.length, 'bytes');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
