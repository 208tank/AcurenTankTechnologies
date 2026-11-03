/*
 * Offline support for TankScope (booth displays lose wifi).
 *
 * - Pages: fetched from the network first so new releases show up; the saved
 *   copy is used when the network is down or too slow.
 * - Build files (/_next/static/, hashed and never change) and images: served
 *   from the saved copy, fetched once.
 *
 * Paths are relative to this file, so it works under any base path.
 * Bump VERSION to discard everything saved by an older version.
 */
const VERSION = 'v2';
const CACHE = `tankscope-${VERSION}`;
const PAGES = ['./', './booth/', './present/', './manage/', './manage/equipment/'];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PAGES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('tankscope-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Pages send the files they loaded before this worker took control, so the
// first visit is enough to make the site work offline.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls') return;
  const scope = self.registration.scope;
  const urls = (event.data.urls || []).filter(
    (u) => typeof u === 'string' && u.startsWith(scope) && !u.includes('/sw.js'),
  );
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      let saved = 0;
      for (const url of urls) {
        try {
          if (!(await cache.match(url))) {
            const res = await fetch(url, { cache: 'reload' });
            if (res.ok) await cache.put(url, res);
          }
          saved++;
        } catch {
          // Offline or blocked: skip it; it will be saved the next time it loads.
        }
      }
      const total = (await cache.keys()).length;
      event.source?.postMessage({ type: 'cache-status', saved, total });
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, true));
  } else if (url.pathname.includes('/_next/static/') || /\.(png|svg|jpg|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req, false));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req, isPage) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (isPage) {
      const home = await cache.match('./');
      if (home) return home;
    }
    return Response.error();
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
