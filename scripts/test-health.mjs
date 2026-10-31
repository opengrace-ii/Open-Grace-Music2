#!/usr/bin/env node
/**
 * Health-only smoke test for deployed or local server.
 * Usage: node scripts/test-health.mjs [baseUrl]
 *   npm run test:health -- "https://ogm-open-grace-music-w3bpvx.v2.appdeploy.ai"
 */
const BASE = (process.argv[2] || process.env.OGM_BASE_URL || 'http://127.0.0.1:43123').replace(
  /\/$/,
  ''
);

const res = await fetch(`${BASE}/api/health`);
const text = await res.text();
const contentType = res.headers.get('content-type') || '';

if (!res.ok) {
  console.error(`HTTP ${res.status}\n${text.slice(0, 500)}`);
  process.exit(1);
}
if (!contentType.includes('application/json')) {
  console.error(`Expected application/json, got ${contentType}\n${text.slice(0, 500)}`);
  process.exit(1);
}

let body;
try {
  body = JSON.parse(text);
} catch {
  console.error(`Invalid JSON:\n${text.slice(0, 500)}`);
  process.exit(1);
}

if (body?.ok !== true || body?.service !== 'ogm-converter') {
  console.error('Unexpected body:', body);
  process.exit(1);
}

console.log(JSON.stringify(body));
