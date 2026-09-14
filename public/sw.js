// Minimal, hand-rolled service worker -- just enough to serve map tiles
// from cache when offline (item i4). Deliberately doesn't precache the app
// shell or attempt full offline-first behavior for the whole app; that's a
// much bigger project than "cache a city's tiles before traveling" asks for.
const TILE_CACHE = 'map-tiles-v1';
const TILE_HOSTS = ['basemaps.cartocdn.com'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!TILE_HOSTS.includes(url.hostname)) return;

  event.respondWith(
    caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      // Offline and not cached -- this naturally rejects, same as an
      // uncached fetch would without a service worker at all.
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })
  );
});
