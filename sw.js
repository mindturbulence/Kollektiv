const CACHE_NAME = 'kollektiv-cache-v3';
const FFMPEG_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

const urlsToCache = [
  // Core App
  '/',
  '/index.html',
  '/index.tsx',
  '/index.css',
  // Fonts
  'https://fonts.bunny.net/css?family=urbanist:100,200,300,400,500,600,700,800,900,100i,200i,300i,400i,500i,600i,700i,800i,900i&display=swap',
  // Main Libs (esm.sh)
  'https://esm.sh/react@^19.1.1?corp',
  'https://esm.sh/react@^19.1.1/jsx-runtime?corp',
  'https://esm.sh/react-dom@^19.1.1/client?corp',
  'https://esm.sh/@google/genai@^1.12.0?corp',
  'https://esm.sh/uuid@^11.1.0?corp',
  'https://esm.sh/jszip@^3.10.1?corp',
  'https://esm.sh/idb@^8.0.3?corp',
  'https://esm.sh/daisyui@^5.0.50',
  // FFmpeg Libs (esm.sh)
  'https://esm.sh/@ffmpeg/ffmpeg@^0.12.6?corp',
  'https://esm.sh/@ffmpeg/util@^0.12.1?corp',
  // FFmpeg Core files (unpkg)
  `${FFMPEG_BASE_URL}/ffmpeg-core.js`,
  `${FFMPEG_BASE_URL}/ffmpeg-core.wasm`,
  `${FFMPEG_BASE_URL}/ffmpeg-core.worker.js`
];


self.addEventListener('install', (event) => {
  // Forces the waiting service worker to become the active service worker.
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache and caching files for offline use.');
        const requests = urlsToCache.map(url => new Request(url, { cache: 'reload' }));
        return cache.addAll(requests);
      })
  );
});

self.addEventListener('activate', (event) => {
  // Allows an active service worker to set itself as the controller for all clients within its scope.
  event.waitUntil(clients.claim());

  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Identify core app files that should always be fresh.
  const isCoreAppFile = requestUrl.origin === self.location.origin &&
    (requestUrl.pathname === '/' ||
      requestUrl.pathname === '/index.html' ||
      requestUrl.pathname === '/index.css' ||
      requestUrl.pathname === '/index.tsx');

  const isFontCss = requestUrl.hostname === 'fonts.bunny.net';

  if (isCoreAppFile || isFontCss) {
    // Network-first strategy for core files and styles.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // If the fetch is successful, update the cache.
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If the network fails, fall back to the cache.
          return caches.match(event.request);
        })
    );
  } else {
    // Cache-first strategy for all other assets (libraries, etc.).
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Return from cache if found.
        if (response) {
          return response;
        }
        // Otherwise, fetch from network, cache, and return.
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (event.request.method === 'GET') {
                cache.put(event.request, responseToCache);
              }
            });
          }
          return networkResponse;
        });
      })
    );
  }
});