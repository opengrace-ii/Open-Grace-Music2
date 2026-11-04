#!/usr/bin/env node
/**
 * Standalone worker.mjs must fail clearly without a hub/secret, and run on Node 18+.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = path.join(root, 'recorder', 'worker.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function run(env, extraArgs = []) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-w-'));
  const result = spawnSync(process.execPath, [worker, ...extraArgs], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      OGM_RECORDER_HOME: path.join(home, 'cfg'),
      ...env,
    },
    encoding: 'utf8',
    timeout: 8000,
  });
  return { ...result, home };
}

function assert(cond, msg) {
  if (!cond) {
    console.error(msg);
    process.exit(1);
  }
  console.log(`ok  ${msg}`);
}

assert(pkg.scripts.recorder === 'node recorder/worker.mjs', 'npm run recorder uses worker.mjs');
assert(pkg.version === '1.4.1', 'package version is 1.4.1');

const missing = run({});
assert(missing.status !== 0, 'exits non-zero with no hub/secret');
assert(/Missing OGM_HUB_URL/i.test(missing.stderr || ''), `hub missing message: ${missing.stderr}`);

const noSecret = run({ OGM_HUB_URL: 'https://open-grace-music2.onrender.com' });
assert(noSecret.status !== 0, 'exits non-zero with no secret');
assert(/OGM_WORKER_SECRET/i.test(noSecret.stderr || ''), 'secret missing names OGM_WORKER_SECRET');
assert(/openssl rand -hex 32/i.test(noSecret.stderr || ''), 'tells how to generate a secret');

const placeholder = run({
  OGM_HUB_URL: 'https://open-grace-music2.onrender.com',
  OGM_WORKER_SECRET: 'the-same-secret-on-every-worker',
});
assert(placeholder.status !== 0, 'rejects README placeholder secret');
assert(/placeholder/i.test(placeholder.stderr || ''), 'placeholder is called out');

const short = run({
  OGM_HUB_URL: 'https://open-grace-music2.onrender.com',
  OGM_WORKER_SECRET: 'short',
});
assert(short.status !== 0, 'rejects short secret');

{
  const { createServer } = await import('node:http');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ogm-w-'));
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/api/recorder/heartbeat')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid worker secret.', code: 'WORKER_UNAUTHORIZED' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const hub = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [worker, '--hub', hub], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      OGM_RECORDER_HOME: path.join(home, 'cfg'),
      OGM_HUB_URL: hub,
      OGM_WORKER_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => {
    out += d.toString();
  });
  child.stderr.on('data', (d) => {
    out += d.toString();
  });
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(-1);
    }, 5000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code == null ? -1 : code);
    });
  });
  server.close();
  assert(status !== 0, 'exits non-zero on HTTP 401');
  assert(/HTTP 401/i.test(out), `401 message: ${out}`);
  assert(/does not match/i.test(out), '401 says secret does not match');
}

console.log('all recorder-worker tests passed');
