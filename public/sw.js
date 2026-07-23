const CACHE = 'hotel-guest-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  // Never cache HTML or Next.js bundles — stale shells caused the old UI to stick.
  const isAppShell =
    request.mode === 'navigate' ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/sw.js';

  if (isAppShell) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Cache only static theme assets (images/fonts under /palatin/).
  if (!url.pathname.startsWith('/palatin/')) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok || response.type === 'opaque') return response;
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
