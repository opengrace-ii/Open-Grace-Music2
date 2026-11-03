#!/usr/bin/env node
/**
 * Prove YouTube TV device-code start + pending poll (no user approval, no token log).
 * Usage: node scripts/test-youtube-oauth-start.mjs
 */
const CLIENT_ID = '861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com';
const CLIENT_SECRET = 'SboVhoG9s0rNafixCSGGKXAT';
const SCOPE = 'http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content';

async function postForm(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(data),
  });
  const json = await res.json();
  return { httpStatus: res.status, json };
}

async function main() {
  const started = await postForm('https://oauth2.googleapis.com/device/code', {
    client_id: CLIENT_ID,
    scope: SCOPE,
  });
  const userCode = started.json.user_code;
  const verificationUrl = started.json.verification_url || started.json.verification_uri;
  const deviceCode = started.json.device_code;
  if (!userCode || !deviceCode || !verificationUrl) {
    throw new Error(`device-code start failed HTTP ${started.httpStatus} (no user_code)`);
  }
  console.log('start: ok');
  console.log('user_code_present:', userCode.length > 4 ? 'yes' : 'no');
  console.log('verification_url_host:', new URL(String(verificationUrl)).host);

  const poll = await postForm('https://oauth2.googleapis.com/token', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });
  const err = poll.json.error;
  if (err !== 'authorization_pending' && err !== 'slow_down') {
    throw new Error(`expected authorization_pending, got ${err || 'no error'} HTTP ${poll.httpStatus}`);
  }
  console.log('poll: pending (flow is live; approval happens in the user’s Google tab)');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
