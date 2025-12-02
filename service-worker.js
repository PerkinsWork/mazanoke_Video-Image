const APP_VERSION = 'v1.1.6';
const CACHE_VERSION = APP_VERSION;
const CACHE_NAME = `mazanoke-cache-${CACHE_VERSION}`;
const urlsToCache = [
  '/',
  '/index.html',
  '/assets/css/fonts.css',
  '/assets/css/variables.css',
  '/assets/css/style.css',
  '/assets/vendor/browser-image-compression.js',
  '/assets/vendor/heic-to.js',
  '/assets/vendor/libheif.js',
  '/assets/vendor/ico.js',
  '/assets/vendor/png2ico.js',
  '/assets/vendor/jszip.js',
  '/assets/js/global.js',
  '/assets/js/utilities.js',
  '/assets/js/helpers.js',
  '/assets/js/ui.js',
  '/assets/js/compression.js',
  '/assets/js/download.js',
  '/assets/js/events.js',
  '/assets/images/android-chrome-192x192.png',
  '/assets/images/android-chrome-512x512.png',
  '/assets/images/apple-touch-icon.png',
  '/assets/images/symbol-192x192.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  if (['chrome-extension:', 'file:', 'about:'].includes(requestUrl.protocol)) {
    return;
  }

  if (event.request.url.includes('/index.html')) {
    // Network-first strategy for index.html
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache); // Only cache valid requests
          });
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      })
    );
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('mazanoke-cache-') && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});