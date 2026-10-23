/* Open Grace Music — v3 gramophone force cache bust (BUILD_ID injected at build time) */
const BUILD_ID = '__OGM_BUILD_ID__';
const CACHE_PREFIX = `ogm-v3-gramophone-force-${BUILD_ID}-`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime`;
const SHELL_CACHE = `${CACHE_PREFIX}shell`;

const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/logo.svg',
  '/logo.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

function isCurrentCacheKey(key) {
  return key === RUNTIME_CACHE || key === SHELL_CACHE;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !isCurrentCacheKey(key)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'OGM_SW_ACTIVATED', buildId: BUILD_ID });
          });
        })
      )
  );
});

function isNavigationRequest(request, url) {
  return (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.endsWith('.html')
  );
}

function isHashedAsset(url) {
  return /\/assets\/[^/]+\.[a-f0-9]{8,}\.(js|css|mjs)$/i.test(url.pathname);
}

function isScriptOrStyle(url) {
  return (
    isHashedAsset(url) ||
    /\.(js|css|mjs)(\?|$)/.test(url.pathname) ||
    url.pathname.startsWith('/assets/')
  );
}

/** HTML/navigation: always network — never read or write document cache. */
async function networkOnlyNavigation(request) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch {
    return new Response('Offline — connect to the internet to load Open Grace Music.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Assets: network-first so stale JS/CSS cannot flash the legacy UI. */
async function networkFirstAsset(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('Offline and asset not cached');
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  // Legacy AI Studio bundle removed — purge any cached requests to it
  if (url.pathname.includes('/assets/aistudio/')) {
    event.respondWith(new Response('Legacy bundle removed', { status: 410 }));
    return;
  }

  if (isNavigationRequest(event.request, url)) {
    event.respondWith(networkOnlyNavigation(event.request));
    return;
  }

  if (isScriptOrStyle(url)) {
    event.respondWith(networkFirstAsset(event.request));
    return;
  }

  event.respondWith(networkFirstAsset(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
