/* Service worker: fresh when the network allows, instant when it does not.
 *
 * Plain network-first stalls the whole game behind a slow request, and plain
 * cache-first serves stale code forever. This does both: a cached response is
 * returned as soon as the network looks slow, while the request continues in the
 * background and refreshes the cache for next time. So a bad connection costs you
 * at most one launch on the previous build, not permanent staleness.
 *
 * The version tag on the title screen tells you which build actually loaded.
 */
try {
  importScripts('./js/version.js');
} catch (e) {
  /* Falling back to an unversioned cache is survivable; failing to install is not. */
}

const VERSION = self.WOW_VERSION || 'dev';
const CACHE = 'wow-v' + VERSION;

/* How long to wait for the network before answering from cache. */
const SLOW_NETWORK_MS = 3000;

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/version.js',
  './js/dmath.js',
  './js/util.js',
  './js/units.js',
  './js/roster-earth.js',
  './js/roster-animals.js',
  './js/roster-space.js',
  './js/terrain.js',
  './js/editions.js',
  './js/sim.js',
  './js/ai.js',
  './js/share.js',
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

/* Lets the page ask which build the worker is serving. */
self.addEventListener('message', function (e) {
  if (e.data === 'version' && e.source) {
    e.source.postMessage({ type: 'sw-version', version: VERSION, cache: CACHE });
  }
});

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(respond(e.request));
});

async function respond(request) {
  /* Always start the network request: even when we answer from cache below, this
   * keeps running and updates the cache, so the next launch is current. */
  const fromNetwork = fetch(request).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(request, copy); });
    }
    return res;
  }).catch(function () { return null; });

  const cached = await caches.match(request);

  if (!cached) {
    const res = await fromNetwork;
    if (res) return res;
    /* Offline with nothing cached: for a navigation, the shell is better than an error. */
    const shell = await caches.match('./index.html');
    return shell || Response.error();
  }

  /* Prefer a fresh response, but never wait longer than SLOW_NETWORK_MS for it. */
  const res = await Promise.race([fromNetwork, delay(SLOW_NETWORK_MS).then(function () { return null; })]);
  return res || cached;
}
