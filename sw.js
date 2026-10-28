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

// Injected only when the user deliberately activates enhanced diagnostics.
// Normal SCORM content is served byte-for-byte unchanged.
const MONITOR_SCRIPT = `<script>
(function(){
  var sent = 0, limit = 40;
  function send(kind, message) {
    if (sent >= limit) return;
    sent++;
    try { window.parent.postMessage({source:'scorm-studio-content-debug',kind:kind,
      message:String(message || '').slice(0,1500),url:location.href},location.origin); } catch (_) {}
  }
  window.addEventListener('error',function(e) {
    var resource=e.target && (e.target.src || e.target.href);
    if (resource && e.target !== window) send('resource-error',resource);
    else send('js-error',(e.error && e.error.stack || e.message || 'Script error')+' @ '+(e.filename||'')+':'+(e.lineno||''));
  },true);
  window.addEventListener('unhandledrejection',function(e) {
    send('promise-error', e.reason && (e.reason.stack || e.reason.message) || String(e.reason));
  });
  function check() {
    try {
      var b=document.body;
      if (!b) { send('visual-check','body absent'); return; }
      var nodes=b.querySelectorAll('h1,h2,h3,p,main,section,article,div,canvas,iframe,svg,video,img,button,input,[role="application"]');
      var visible=0;
      for (var i=0;i<Math.min(nodes.length,800);i++) {
        var e=nodes[i],r=e.getBoundingClientRect(),s=getComputedStyle(e);
        if (r.width>1 && r.height>1 && s.display!=='none' && s.visibility!=='hidden' && s.opacity!=='0') visible++;
      }
      send('visual-check','visible='+visible+' nodes='+nodes.length+' text='+(b.innerText||'').trim().length+
        ' viewport='+window.innerWidth+'x'+window.innerHeight+' body='+b.getBoundingClientRect().width+'x'+b.getBoundingClientRect().height);
    } catch (err) { send('visual-check','inspection impossible : '+String(err)); }
  }
  document.addEventListener('DOMContentLoaded',function(){send('dom-ready','Document HTML analysé');setTimeout(check,1000);});
  window.addEventListener('load',function(){send('loaded','Événement load du document');setTimeout(check,4000);});
  send('boot','Capteur installé avant les scripts de la page');
})();
</script>`;

async function instrumentDocument(cached) {
  const html = await cached.text();
  // Inject the early error monitor as the very first executable script.
  const output = /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, match => match + MONITOR_SCRIPT)
    : html.replace(/<!doctype[^>]*>/i, match => match + MONITOR_SCRIPT);
  const headers = new Headers(cached.headers);
  headers.set('Cache-Control','no-store');
  headers.delete('Content-Length');
  return new Response(output === html ? MONITOR_SCRIPT + html : output,
    {status:200,headers});
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

    if (request.method === 'GET' && url.searchParams.get('__scorm_debug') === '1' &&
        /\.html?$/i.test(url.pathname) && (cached.headers.get('content-type') || '').includes('html')) {
      return instrumentDocument(cached);
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
