const CACHE_NAME = 'store-app-v3';

// Files to cache for offline use:
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png?v=20260308',
  '/icons/icon-512x512.png?v=20260308',
];

const cacheAppShell = async (cache) => {
  // Avoid install failure when one URL is unavailable (404/network).
  await Promise.all(
    urlsToCache.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (error) {
        console.warn('PWA: failed to pre-cache', url, error);
      }
    })
  );
};

// Install - cache files:
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('PWA: caching app shell');
      await cacheAppShell(cache);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches:
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache:
self.addEventListener('fetch', (event) => {
  // Skip API requests - always fetch from network:
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses:
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline:
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Return offline page for navigation requests:
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});
