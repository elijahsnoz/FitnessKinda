/* Offline shell.
 *
 * The record itself lives in localStorage and never leaves the device; this only
 * caches the files needed to open the app, so a patchy connection — or none —
 * still gets you to your data. No sync, no network calls of any kind.
 *
 * Bump CACHE when any shell file changes, or browsers will keep serving the old one.
 */

const CACHE = 'fitnesskinda-shell-v8';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.json',
  'icon.svg',
  'icon-tile.svg',
  'admin.html',
  'terms.html',
  'privacy.html',
  'verify.html',
  'js/verify.js',
  'js/app.js',
  'js/insights.js',
  'js/views/parts.js',
  'js/views/home.js',
  'js/views/timeline.js',
  'js/views/move.js',
  'js/views/health.js',
  'js/views/profile.js',
  'js/views/summary.js',
  'js/domains/kit.js',
  'js/domains/health-event.js',
  'js/domains/movement.js',
  'js/domains/sleep.js',
  'js/domains/measurement.js',
  'js/domains/medication.js',
  'js/domains/note.js',
  'js/api.js',
  'js/account.js',
  'js/admin.js',
  'js/store.js',
  'js/registry.js',
  'js/form.js',
  'js/analytics.js',
  'js/charts.js',
  'js/summary.js',
  'js/util.js',
  'js/domains/malaria.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  /* Never cache the API. Health records would end up in Cache Storage, outliving
   * a sign-out and surviving on a shared device; and a stale cached response is
   * worse than an honest failure. The app keeps its own offline copy in
   * localStorage, which is where offline reads come from. */
  if (url.pathname.startsWith('/api/')) return;

  /* Navigations go to the network first, so a deploy lands on the next load
   * rather than after two. The cached page is still there when there is no
   * connection, which is the whole point of this file. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          // Keep the cache current for anything served from this origin.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          // A navigation with no network falls back to the cached shell.
          request.mode === 'navigate' ? caches.match('index.html') : Response.error()
        );
    })
  );
});
