/* Flashcard Quiz offline worker. Bump CACHE_VERSION whenever app files change. */
const CACHE_VERSION = 'flashcard-quiz-v1.0.0';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    // For an existing installation, wait until the learner chooses Reload.
    // A first installation activates normally because no older worker controls the page.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('flashcard-quiz-') && name !== CACHE_VERSION).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put('./index.html', networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        const cachedPage = await caches.match('./index.html');
        if (cachedPage) return cachedPage;
        return new Response('You are offline. Reconnect once to load Flashcard Quiz.', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok && networkResponse.type !== 'opaque') {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
