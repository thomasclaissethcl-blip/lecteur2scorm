'use strict';

const CACHE_NAME = 'scorm-reader-packages-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!url.pathname.includes('/__scorm__/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: false });
    if (cached) return cached;

    // Some packages append query strings to static assets. Fall back to the same path without them.
    const cleanUrl = new URL(event.request.url);
    cleanUrl.search = '';
    cleanUrl.hash = '';
    const fallback = await cache.match(cleanUrl.toString());
    if (fallback) return fallback;

    return new Response('SCORM virtual file not found: ' + url.pathname, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});
