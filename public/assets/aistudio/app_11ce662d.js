/* ============================================================
   OGM — Open Grace Music v2.0.0
   Offline music library + MP3 converter PWA.
   Integrity rules:
   - Storage status is never assumed; every save is verified.
   - YouTube pages are not media files and are refused with guidance.
   - Import requires ownership/license confirmation for URLs.
   ============================================================ */
'use strict';

const DB_NAME = 'ogm-db';
const STORE = 'tracks';
const APP_VERSION = '2.0.0';

/* ---------------- IndexedDB wrapper ---------------- */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror = e => rej(e.target.error);
  });
}
function tx(db, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result);
    t.onerror = e => rej(e.target.error);
  });
}
const idbPut    = t => openDB().then(db => tx(db, 'readwrite', s => s.put(t)));
const idbDelete = id => openDB().then(db => tx(db, 'readwrite', s => s.delete(id)));
const idbAll    = () => openDB().then(db => tx(db, 'readonly', s => s.getAll()));

/* ---------------- State ---------------- */
let tracks = [];            // {id,title,duration,size,mime,status,converted,source,addedAt,blob}
const objectURLs = new Map();
let queue = [], qi = -1, shuffle = false, seeking = false;
let deferredInstallPrompt = null;
let ffmpeg = null, ffmpegLoading = null;

const $ = id => document.getElementById(id);
const audio = new Audio();
audio.preload = 'auto';

/* ---------------- Toasts ---------------- */
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ---------------- Formatting ---------------- */
const fmtTime = s => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
};
const fmtSize = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';
const initials = t => (t || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');

function getURL(track) {
  if (!objectURLs.has(track.id)) objectURLs.set(track.id, URL.createObjectURL(track.blob));
  return objectURLs.get(track.id);
}
function dropURL(id) {
  if (objectURLs.has(id)) { URL.revokeObjectURL(objectURLs.get(id)); objectURLs.delete(id); }
}

/* ---------------- Honest persistence ----------------
   Never claims "offline-ready" without a verified read-back
   and a granted persistent-storage request. */
async function requestPersistent() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch (_) { /* unsupported */ }
  return false;
}
async function updateStorageBanner() {
  try {
    const est = await navigator.storage?.estimate?.();
    const p = await requestPersistent();
    const used = est?.usage ? fmtSize(est.usage) : '—';
    const quota = est?.quota ? (est.quota / 1e6 > 1e3 ? (est.quota / 1e9).toFixed(1) + ' GB' : fmtSize(est.quota)) : '—';
    $('storageText').innerHTML = p
      ? `<b>Protected offline storage</b> granted · ${used} of ${quota} used · library stays on this device`
      : `<b>Device storage</b> (not protected) · ${used} of ${quota} used · OS may clear it if space runs low`;
  } catch (_) {
    $('storageText').textContent = 'Storage status unavailable on this browser.';
  }
}

/* ---------------- Import: files ---------------- */
function probeDuration(blob) {
  return new Promise(res => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    const done = d => { URL.revokeObjectURL(url); res(d); };
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    a.src = url;
  });
}

async function storeTrack({ blob, title, source }) {
  const id = 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const duration = await probeDuration(blob);
  const track = { id, title, duration, size: blob.size, mime: blob.type || 'audio/*', source, addedAt: Date.now(), converted: false };

  let status;
  try {
    await idbPut({ ...track, blob });
    const back = await idbAll();          // verify: read-back must match
    const mine = back.find(t => t.id === id);
    status = (mine && mine.blob && mine.blob.size === blob.size) ? 'saved' : 'failed';
  } catch (_) { status = 'failed'; }

  if (status === 'saved') {
    const persisted = await requestPersistent();
    track.status = persisted ? 'persistent' : 'device-local';
    await idbPut({ ...track, blob });     // persist the final status label too
  } else {
    track.status = 'failed';
    toast(`⚠️ Could not verify storage for "${title}". It may not survive closing the app.`);
  }
  tracks.push(track);
  renderLibrary();
  updateStorageBanner();
  return track;
}

function handleFiles(fileList) {
  const files = [...fileList].filter(f => f.size > 0);
  if (!files.length) return toast('No usable files selected.');
  files.forEach(f => {
    const title = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    storeTrack({ blob: f, title, source: 'file' })
      .then(t => { if (t) toast(`✓ Saved "${t.title}"`); })
      .catch(() => toast(`⚠️ Failed to import "${f.name}".`));
  });
}

/* ---------------- Import: URL ---------------- */
const MEDIA_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|mp4|mov)$/i;
const BLOCKED_HOSTS = /(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)music\.youtube\.com$|(^|\.)youtube-nocookie\.com$/i;

async function importFromURL(url) {
  let u;
  try { u = new URL(url); } catch { return toast('That is not a valid URL.'); }
  if (u.protocol !== 'https:') return toast('Only https:// links are accepted.');
  if (BLOCKED_HOSTS.test(u.hostname)) {
    return toast('YouTube watch/share pages are not media files. For videos you uploaded, download them from YouTube Studio first, then import the file here.');
  }
  if (!MEDIA_EXT.test(u.pathname)) {
    return toast('That does not look like a direct media file link (expected an extension like .mp3 or .ogg).');
  }
  toast('Fetching file…');
  let blob;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    blob = await r.blob();
  } catch (e) {
    return toast('Could not fetch that file. The server may block cross-origin access, or the link may have expired.');
  }
  if (!blob || blob.size === 0) return toast('The file came back empty.');
  const title = decodeURIComponent(u.pathname.split('/').pop()).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') || 'Imported track';
  const track = await storeTrack({ blob, title, source: 'url' });
  if (track) toast(`✓ Saved "${track.title}"`);
}

/* ---------------- Render library ---------------- */
const STATUS_CHIP = {
  'persistent':   ['chip-good', '● PERSISTENT'],
  'device-local': ['chip-warn', '◐ DEVICE — may clear'],
  'failed':       ['chip-bad',  '✕ SAVE FAILED'],
};

function renderLibrary() {
  const grid = $('trackGrid');
  const empty = $('emptyState');
  grid.innerHTML = '';
  empty.classList.toggle('hidden', tracks.length > 0);

  tracks.forEach(t => {
    const card = document.createElement('div');
    card.className = 'track-card';
    const [chipClass, chipText] = STATUS_CHIP[t.status] || ['chip-neutral', t.status || ''];
    const isMp3 = t.mime.includes('mpeg') || t.mime.includes('mp3') || /\.mp3$/i.test(t.title);
    card.innerHTML = `
      <div class="track-cover">${initials(t.title)}</div>
      <div class="track-body">
        <div class="track-title" title="${t.title}">${t.title}</div>
        <div class="track-meta">
          <span>${fmtTime(t.duration)}</span><span>·</span><span>${fmtSize(t.size)}</span>
          ${t.converted ? '<span class="chip chip-neutral">MP3</span>' : ''}
          <span class="chip ${chipClass}">${chipText}</span>
        </div>
        <div class="progress-line hidden" id="prog-${t.id}"><div></div></div>
      </div>
      <div class="track-actions">
        <button class="mini-btn accent act-play">▶ Play</button>
        ${!isMp3 ? '<button class="mini-btn act-convert">⇄ To MP3</button>' : ''}
        <button class="mini-btn act-save">⤓ Save</button>
        <button class="mini-btn act-del">✕</button>
      </div>`;
    card.querySelector('.act-play').onclick = () => playTrack(t.id);
    card.querySelector('.act-save').onclick = () => exportTrack(t.id);
    card.querySelector('.act-del').onclick = () => deleteTrack(t.id);
    const conv = card.querySelector('.act-convert');
    if (conv) conv.onclick = () => convertToMp3(t.id, conv);
    grid.appendChild(card);
  });
}

/* ---------------- Playback ---------------- */
function rebuildQueue(startId) {
  queue = tracks.map(t => t.id);
  if (shuffle) {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }
  qi = Math.max(0, queue.indexOf(startId));
}

function playTrack(id) {
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  if (queue[qi] !== id) rebuildQueue(id);
  audio.src = getURL(t);
  audio.play().catch(() => toast('Tap play again — the browser blocked autoplay.'));
  $('playerBar').classList.remove('hidden');
  $('npTitle').textContent = t.title;
  $('npSub').textContent = `${fmtTime(t.duration)} · ${t.status === 'persistent' ? 'offline ✓' : 'on device'}`;
  $('npThumb').textContent = initials(t.title);
  updatePlayBtn();
}

function playAt(i) {
  if (!queue.length) return;
  qi = (i + queue.length) % queue.length;
  playTrack(queue[qi]);
}
function updatePlayBtn() { $('playBtn').textContent = audio.paused ? '▶' : '❚❚'; }

audio.addEventListener('play', updatePlayBtn);
audio.addEventListener('pause', updatePlayBtn);
audio.addEventListener('ended', () => playAt(qi + 1));
audio.addEventListener('timeupdate', () => {
  if (seeking || !audio.duration) return;
  $('curTime').textContent = fmtTime(audio.currentTime);
  $('durTime').textContent = fmtTime(audio.duration);
  $('seek').value = Math.round((audio.currentTime / audio.duration) * 1000);
});
audio.addEventListener('loadedmetadata', () => { $('durTime').textContent = fmtTime(audio.duration); });

$('playBtn').onclick = () => { if (!audio.src) { if (tracks.length) playTrack(tracks[0].id); return; } audio.paused ? audio.play() : audio.pause(); };
$('nextBtn').onclick = () => playAt(qi + 1);
$('prevBtn').onclick = () => { if (audio.currentTime > 3) { audio.currentTime = 0; } else playAt(qi - 1); };
$('shuffleBtn').onclick = () => {
  shuffle = !shuffle;
  $('shuffleBtn').classList.toggle('on', shuffle);
  if (audio.src) rebuildQueue(queue[qi]);
};
$('seek').addEventListener('input', e => {
  seeking = true;
  if (audio.duration) {
    audio.currentTime = (e.target.value / 1000) * audio.duration;
    $('curTime').textContent = fmtTime(audio.currentTime);
  }
});
$('seek').addEventListener('change', () => seeking = false);

/* ---------------- Export / delete ---------------- */
function exportTrack(id) {
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  const ext = (t.mime.includes('mpeg') || t.converted) ? 'mp3' : (t.mime.split('/')[1] || 'audio').split(';')[0];
  const a = document.createElement('a');
  a.href = getURL(t);
  a.download = `${t.title}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Download started — check your Downloads folder.');
}

async function deleteTrack(id) {
  const t = tracks.find(x => x.id === id);
  try { await idbDelete(id); } catch (_) { /* already gone */ }
  dropURL(id);
  tracks = tracks.filter(x => x.id !== id);
  if (queue[qi] === id) { audio.pause(); audio.removeAttribute('src'); $('playerBar').classList.add('hidden'); }
  queue = queue.filter(q => q !== id);
  renderLibrary();
  updateStorageBanner();
  if (t) toast(`Removed "${t.title}".`);
}

/* ---------------- MP3 conversion (FFmpeg WASM) ---------------- */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('CDN unreachable'));
    document.head.appendChild(s);
  });
}

async function ensureFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (!ffmpegLoading) {
    ffmpegLoading = (async () => {
      toast('Loading audio encoder (first time only)…');
      await loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js');
      const { createFFmpeg, fetchFile } = window.FFmpeg;
      const inst = createFFmpeg({
        log: false,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
      });
      await inst.load();
      inst.fetchFileHelper = fetchFile;
      ffmpeg = inst;
      return inst;
    })();
    ffmpegLoading.catch(() => { ffmpegLoading = null; });
  }
  return ffmpegLoading;
}

async function convertToMp3(id, btn) {
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  btn.disabled = true;
  const prog = $('prog-' + id);
  const bar = prog?.firstElementChild;
  try {
    const ff = await ensureFFmpeg();
    const inName = 'in_' + id, outName = 'out_' + id + '.mp3';
    ff.FS('writeFile', inName, await ff.fetchFileHelper(t.blob));
    prog?.classList.remove('hidden');
    ff.setProgress(({ ratio }) => { if (bar && ratio >= 0) bar.style.width = Math.round(ratio * 100) + '%'; });
    await ff.run('-i', inName, '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', outName);
    const data = ff.FS('readFile', outName);
    const mp3 = new Blob([data.buffer], { type: 'audio/mpeg' });
    ff.FS('unlink', inName); ff.FS('unlink', outName);
    if (!mp3.size) throw new Error('empty output');

    // Replace stored blob; re-verify persistence honestly
    t.blob = mp3; t.size = mp3.size; t.mime = 'audio/mpeg'; t.converted = true;
    const persisted = await requestPersistent();
    t.status = persisted ? 'persistent' : 'device-local';
    await idbPut({ ...t });
    const back = await idbAll();
    if (!back.find(x => x.id === id && x.blob.size === mp3.size)) throw new Error('verify failed');
    dropURL(id);
    renderLibrary();
    toast(`✓ Converted "${t.title}" to MP3.`);
  } catch (e) {
    console.error(e);
    prog?.classList.add('hidden');
    btn.disabled = false;
    toast('Conversion failed. Check your connection (the encoder loads from a CDN) and try again.');
  }
}

/* ---------------- PWA: install + service worker ---------------- */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $('installBtn').classList.remove('hidden');
});
$('installBtn').onclick = async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('installBtn').classList.add('hidden');
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell unavailable */ });
}

/* ---------------- UI wiring ---------------- */
$('importBtn').onclick = () => $('fileInput').click();
$('fileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });

$('urlBtn').onclick = () => { $('urlDialog').showModal(); };
$('urlCancel').onclick = () => $('urlDialog').close();
$('rightsCheck').addEventListener('change', e => { $('urlOk').disabled = !e.target.checked; });
$('urlOk').onclick = () => {
  const v = $('urlInput').value.trim();
  $('urlDialog').close();
  if (v) importFromURL(v);
  $('urlInput').value = ''; $('rightsCheck').checked = false; $('urlOk').disabled = true;
};

$('iosClose').onclick = () => $('iosDialog').close();
if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
  $('installBtn').classList.remove('hidden');
  $('installBtn').textContent = '⤓ Install (iOS help)';
  $('installBtn').onclick = () => $('iosDialog').showModal();
}

/* ---------------- Boot ---------------- */
(async function boot() {
  renderLibrary();
  updateStorageBanner();
  try {
    const all = await idbAll();
    tracks = (all || []).map(({ blob, ...meta }) => ({ ...meta, blob }))
      .sort((a, b) => a.addedAt - b.addedAt);
    renderLibrary();
  } catch (_) {
    toast('Could not open the local library database.');
  }
  console.log(`OGM ${APP_VERSION} — Open Grace Music`);
})();
