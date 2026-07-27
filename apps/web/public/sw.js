/* Armada service worker — installable PWA + offline directory shell.
 *
 * Bump these when the caching rules change: `activate` deletes every cache
 * whose name isn't current, which is what evicts a stale app bundle.
 */
const SHELL = 'armada-shell-v2';
const DATA = 'armada-data-v2';
const SHELL_URLS = ['/icon.svg', '/manifest.webmanifest'];

/** The API is proxied under this path, so it is same-origin — but it must
 *  never be served from cache like a static asset. */
const API_PREFIX = '/backend/';
/** The one API read worth keeping offline: the directory. */
const OFFLINE_READ = '/backend/people';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Directory data: stale-while-revalidate so the list works offline.
  if (sameOrigin && (url.pathname === OFFLINE_READ || url.pathname.startsWith(OFFLINE_READ + '?'))) {
    event.respondWith(
      caches.open(DATA).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Everything else under the API prefix goes straight to the network. Caching
  // it would serve a stale session or stale records — a cached `get-session`
  // returning null logs you out and never recovers.
  if (sameOrigin && url.pathname.startsWith(API_PREFIX)) return;

  // Navigations: network-first, falling back to a cached page when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('/home').then((r) => r || caches.match('/directory')),
      ),
    );
    return;
  }

  if (!sameOrigin) return;

  // Next's build output is content-hashed, so it's safe to cache immutably.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Remaining same-origin assets: network-first, cache only as a fallback, so a
  // new deploy is never shadowed by an old copy.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
