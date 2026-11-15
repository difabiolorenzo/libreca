/* Service worker: every file of the app is checked against the server on
 * each load (`cache: 'no-cache'`, a cheap 304 when unchanged), whatever the
 * server's own cache rules (GitHub Pages keeps files 10 minutes). So the
 * page and its Web Worker always run the same version of the code. Every
 * file received is also kept, so the app still opens offline.
 *
 * Nothing leaves the device: only same-origin GET requests are handled. */

const CACHE = 'libreca-files';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fresh(request));
});

/**
 * Latest version from the server, kept for offline use; the kept copy when
 * the network is down.
 * @param {Request} request
 */
async function fresh(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const kept = await cache.match(request, { ignoreSearch: true });
    if (kept) return kept;
    throw error;
  }
}
