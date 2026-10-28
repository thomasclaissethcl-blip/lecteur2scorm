'use strict';

// Shared cache name with previous releases: avoids breaking an old controller
// during service worker upgrades or while another tab is still running.
const CACHE_NAME = 'scorm-reader-packages-v1';

self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

async function reportMissing(requestUrl, reason) {
  // Keep the diagnostic scoped to this GitHub Pages application and package.
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    try { client.postMessage({ source: 'scorm-studio-virtual-files', kind: 'missing', url: requestUrl, reason }); }
    catch { /* A closing tab should never break resource delivery. */ }
  }
}

async function serveVirtualFile(request, url) {
  try {
    const cache = await caches.open(CACHE_NAME);
    let cached = await cache.match(request, { ignoreSearch: false });
    if (!cached) {
      // Some SCORM packages append a query string to a static asset.
      const cleanUrl = new URL(request.url);
      cleanUrl.search = '';
      cleanUrl.hash = '';
      cached = await cache.match(cleanUrl.toString());
    }
    if (!cached) {
      await reportMissing(url.href, 'absent du cache du package');
      return new Response('SCORM virtual file not found: ' + url.pathname, {
        status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Cache API entries contain the full file. Range support is required by
    // some browsers for media assets packaged in SCORM/H5P archives.
    const range = request.headers.get('Range');
    if (range && /^bytes=/i.test(range)) {
      const bytes = await cached.arrayBuffer();
      const length = bytes.byteLength;
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
      if (!match || (match[1] === '' && match[2] === '')) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
      }
      let start;
      let end;
      if (match[1] === '') {
        const suffix = Number(match[2]);
        start = Math.max(0, length - suffix);
        end = length - 1;
      } else {
        start = Number(match[1]);
        end = match[2] === '' ? length - 1 : Math.min(length - 1, Number(match[2]));
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || end < start) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
      }
      const headers = new Headers(cached.headers);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(request.method === 'HEAD' ? null : bytes.slice(start, end + 1), { status: 206, headers });
    }
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: cached.headers });
    return cached;
  } catch (error) {
    await reportMissing(url.href, 'échec du stockage/cache : ' + String(error?.message || error));
    return new Response('SCORM virtual file storage unavailable', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.includes('/__scorm__/')) return;
  event.respondWith(serveVirtualFile(event.request, url));
});
