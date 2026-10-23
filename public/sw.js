/* Open Grace Music — versioned service worker (BUILD_ID injected at build time) */
const BUILD_ID = '__OGM_BUILD_ID__';
const CACHE_PREFIX = 'ogm-v2-gramophone-';
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${BUILD_ID}`;
const SHELL_CACHE = `${CACHE_PREFIX}shell-${BUILD_ID}`;

const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/logo.svg',
  '/logo.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

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
        Promise.all(
          keys
            .filter((key) => {
              if (key.startsWith(CACHE_PREFIX)) {
                return key !== RUNTIME_CACHE && key !== SHELL_CACHE;
              }
              // Purge legacy caches (ogm-shell-v1, etc.)
              return true;
            })
            .map((key) => caches.delete(key))
        )
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
    url.pathname === '/index.html'
  );
}

function isScriptOrStyle(url) {
  return /\.(js|css|mjs)(\?|$)/.test(url.pathname) || url.pathname.startsWith('/assets/');
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw new Error('Offline and no cached document');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;
  return caches.match('/index.html');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // Never cache the service worker script itself
  if (url.pathname === '/sw.js') return;

  if (isNavigationRequest(event.request, url)) {
    event.respondWith(networkFirst(event.request, '/index.html'));
    return;
  }

  if (isScriptOrStyle(url)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
