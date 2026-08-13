/* Service worker: network-first, falling back to cache.
 *
 * The game still works fully offline, but edits to the source always show up on
 * the next reload — a cache-first worker would happily serve stale JS forever. */
const CACHE = 'wow-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/util.js',
  './js/units.js',
  './js/terrain.js',
  './js/sim.js',
  './js/ai.js',
  './js/render.js',
  './js/ui.js',
  './js/main.js',
  './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      /* Refresh the offline copy whenever the network gives us something good. */
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
