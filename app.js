(function () {
  'use strict';

  const CACHE_NAME = 'scorm-reader-packages-v1';
  const APP_BASE = new URL('./', document.baseURI);
  const SW_RELOAD_KEY = 'scorm-reader-sw-reload';
  const els = {};
  let swReady = false;
  let packageState = null;
  let runtime = null;
  let currentItem = null;
  let currentIndex = -1;
  let latestData = {};
  let logs = [];
  let toastTimer = null;

  const mimeTypes = {
    html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', xhtml: 'application/xhtml+xml',
    css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
    vtt: 'text/vtt; charset=utf-8', srt: 'application/x-subrip', pdf: 'application/pdf',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
    wasm: 'application/wasm', swf: 'application/x-shockwave-flash', bin: 'application/octet-stream'
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    ['statusBadge','zipInput','resetSessionBtn','packageTitle','packageStandard','packageId','fileCount','learnerId','learnerName',
      'applyLearnerBtn','itemCount','courseOutline','prevBtn','nextBtn','reloadBtn','currentItemTitle','openWindowBtn','dropZone',
      'emptyState','scoFrame','runtimeLabel','clearLogBtn','dataFilter','dataBody','logList','manifestView','toast'].forEach(id => els[id] = document.getElementById(id));

    bindEvents();
    swReady = await ensureServiceWorker();
    if (!swReady) {
      setBadge('Service Worker indisponible', 'error');
      showToast('Le navigateur ne permet pas d’activer le système de fichiers virtuel nécessaire au lecteur. Vérifiez que la page est ouverte en HTTPS.', true, 7000);
    }
  }

  function bindEvents() {
    els.zipInput.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file) loadPackage(file);
      event.target.value = '';
    });

    ['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      els.dropZone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, event => {
      event.preventDefault();
      els.dropZone.classList.remove('dragging');
    }));
    els.dropZone.addEventListener('drop', event => {
      const file = Array.from(event.dataTransfer.files || []).find(f => f.name.toLowerCase().endsWith('.zip'));
      if (file) loadPackage(file);
      else showToast('Déposez un fichier .zip.', true);
    });

    els.prevBtn.addEventListener('click', () => navigateBy(-1));
    els.nextBtn.addEventListener('click', () => navigateBy(1));
    els.reloadBtn.addEventListener('click', () => currentItem && launchItem(currentItem, true));
    els.openWindowBtn.addEventListener('click', () => {
      if (!currentItem) return;
      const url = launchUrl(currentItem.href);
      const popup = window.open(url, '_blank');
      if (!popup) showToast('La nouvelle fenêtre a été bloquée par le navigateur.', true);
    });

    els.applyLearnerBtn.addEventListener('click', () => {
      if (currentItem) launchItem(currentItem, true);
      else showToast('Identité de l’apprenant prête pour le prochain SCO.');
    });

    els.resetSessionBtn.addEventListener('click', () => {
      if (!runtime || !currentItem) return;
      runtime.reset();
      logs = [];
      renderLogs();
      launchItem(currentItem, true);
      showToast('Session du SCO réinitialisée.');
    });

    els.clearLogBtn.addEventListener('click', () => { logs = []; renderLogs(); });
    els.dataFilter.addEventListener('input', renderData);

    document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${tab.dataset.tab}`));
    }));
  }

  async function ensureServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
    try {
      await navigator.serviceWorker.register(new URL('sw.js', APP_BASE).href, {
        scope: APP_BASE.href,
        updateViaCache: 'none'
      });
      await navigator.serviceWorker.ready;

      if (!navigator.serviceWorker.controller) {
        await waitForServiceWorkerControl(2500);
      }

      if (!navigator.serviceWorker.controller) {
        if (!sessionStorage.getItem(SW_RELOAD_KEY)) {
          sessionStorage.setItem(SW_RELOAD_KEY, '1');
          location.reload();
          return new Promise(() => {});
        }
        return false;
      }

      sessionStorage.removeItem(SW_RELOAD_KEY);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function waitForServiceWorkerControl(timeoutMs) {
    if (navigator.serviceWorker.controller) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      navigator.serviceWorker.addEventListener('controllerchange', finish);
    });
  }

  async function loadPackage(file) {
    try {
      if (!swReady) throw new Error('Le système de fichiers virtuel du lecteur n’est pas disponible dans ce navigateur.');
      setBadge('Analyse du ZIP…');
      showToast('Analyse du package…');

      const zip = await BrowserZip.fromFile(file);
      const manifestEntry = zip.findManifest();
      if (!manifestEntry) throw new Error('Aucun fichier imsmanifest.xml n’a été trouvé dans le ZIP.');

      const manifestXml = await zip.text(manifestEntry.name);
      const manifest = ScormManifest.parse(manifestXml, manifestEntry.name);
      if (!manifest.launchableItems.length) throw new Error('Le manifeste ne contient aucun élément lançable (resource href).');

      const digest = await crypto.subtle.digest('SHA-256', zip.buffer);
      const hash = Array.from(new Uint8Array(digest)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
      const virtualRoot = new URL(`__scorm__/${hash}/`, APP_BASE).href;

      setBadge('Installation des fichiers…');
      await installZipIntoCache(zip, virtualRoot);

      packageState = {
        fileName: file.name,
        zip,
        manifest,
        hash,
        virtualRoot,
        fileCount: zip.listFiles().length
      };

      runtime = null;
      currentItem = null;
      currentIndex = -1;
      logs = [];
      latestData = {};
      uninstallGlobalApi();
      renderPackage();
      renderLogs();
      renderData();
      els.manifestView.textContent = manifest.rawXml;
      setBadge(manifest.standard, 'success');

      const first = manifest.launchableItems[0];
      await launchItem(first);
      showToast(`Package chargé : ${manifest.title}`);
    } catch (error) {
      console.error(error);
      setBadge('Erreur', 'error');
      showToast(error.message || String(error), true, 7000);
    }
  }

  async function installZipIntoCache(zip, virtualRoot) {
    const cache = await caches.open(CACHE_NAME);
    const files = zip.listFiles();
    let cursor = 0;
    const workerCount = Math.min(6, Math.max(1, files.length));

    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= files.length) return;
        const entry = files[index];
        const bytes = await zip.read(entry.name);
        const url = new URL(entry.name, virtualRoot).href;
        const headers = new Headers({ 'Content-Type': mimeFor(entry.name), 'Cache-Control': 'no-store' });
        await cache.put(url, new Response(bytes, { status: 200, headers }));
      }
    }

    await Promise.all(Array.from({ length: workerCount }, worker));
  }

  function mimeFor(path) {
    const clean = path.split(/[?#]/)[0];
    const ext = clean.includes('.') ? clean.split('.').pop().toLowerCase() : '';
    return mimeTypes[ext] || 'application/octet-stream';
  }

  function renderPackage() {
    const { manifest, hash, fileCount } = packageState;
    els.packageTitle.textContent = manifest.title;
    els.packageStandard.textContent = manifest.standard;
    els.packageId.textContent = manifest.manifestIdentifier || hash;
    els.fileCount.textContent = String(fileCount);
    els.itemCount.textContent = `${manifest.launchableItems.length} lançable${manifest.launchableItems.length > 1 ? 's' : ''}`;
    els.courseOutline.innerHTML = '';
    els.courseOutline.appendChild(renderItemList(manifest.items));
  }

  function renderItemList(items) {
    const ul = document.createElement('ul');
    ul.className = 'outline-list';
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'outline-item';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.itemId = item.identifier;
      btn.disabled = !item.launchable;
      const marker = document.createElement('span');
      marker.className = 'item-marker';
      marker.textContent = item.launchable ? '›' : '·';
      const title = document.createElement('span');
      title.textContent = item.title;
      btn.append(marker, title);
      if (item.launchable) btn.addEventListener('click', () => launchItem(item));
      li.appendChild(btn);
      if (item.children.length) li.appendChild(renderItemList(item.children));
      ul.appendChild(li);
    }
    return ul;
  }

  async function launchItem(item, forceReload = false) {
    if (!packageState || !item?.href) return;

    if (runtime && currentItem && currentItem.identifier !== item.identifier) {
      runtime.persist();
    }

    currentItem = item;
    currentIndex = packageState.manifest.launchableItems.findIndex(candidate => candidate.identifier === item.identifier);
    logs = [];
    renderLogs();

    const learnerId = els.learnerId.value.trim() || 'learner-001';
    const learnerName = els.learnerName.value.trim() || 'Apprenant Test';
    runtime = new ScormRuntime({
      standard: packageState.manifest.standard,
      packageKey: `${packageState.hash}:${item.identifier}`,
      learnerId,
      learnerName,
      metadata: packageState.manifest.metadata,
      onLog: entry => { logs.push(entry); if (logs.length > 600) logs.shift(); renderLogs(); },
      onChange: data => { latestData = data; renderData(); updateRuntimeLabel(); },
      onNavigate: request => handleNavigationRequest(request)
    });
    installGlobalApi(runtime);

    const url = launchUrl(item.href);
    els.emptyState.hidden = true;
    els.scoFrame.hidden = false;
    els.scoFrame.src = forceReload ? appendCacheBuster(url) : url;
    els.currentItemTitle.textContent = item.title;
    els.reloadBtn.disabled = false;
    els.openWindowBtn.disabled = false;
    els.resetSessionBtn.disabled = false;
    updateNavButtons();
    updateOutlineActive();
    updateRuntimeLabel();
  }

  function launchUrl(href) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return href;
    return new URL(href, packageState.virtualRoot).href;
  }

  function appendCacheBuster(url) {
    const u = new URL(url, location.href);
    u.searchParams.set('__scorm_reload', Date.now().toString());
    return u.href;
  }

  function installGlobalApi(instance) {
    uninstallGlobalApi();
    if (instance.standard === 'SCORM 2004') window.API_1484_11 = instance.api;
    else window.API = instance.api;
  }

  function uninstallGlobalApi() {
    try { delete window.API; } catch { window.API = undefined; }
    try { delete window.API_1484_11; } catch { window.API_1484_11 = undefined; }
  }

  function navigateBy(delta) {
    if (!packageState) return;
    const index = currentIndex + delta;
    const item = packageState.manifest.launchableItems[index];
    if (item) launchItem(item);
  }

  function handleNavigationRequest(request) {
    if (!request || request === '_none') return;
    if (request === 'continue') return navigateBy(1);
    if (request === 'previous') return navigateBy(-1);
    const choice = String(request).match(/^\{target=([^}]+)\}choice$/);
    if (choice) {
      const target = packageState.manifest.launchableItems.find(item => item.identifier === choice[1]);
      if (target) return launchItem(target);
    }
    showToast(`Requête de navigation SCORM 2004 reçue : ${request}`);
  }

  function updateNavButtons() {
    const total = packageState?.manifest.launchableItems.length || 0;
    els.prevBtn.disabled = currentIndex <= 0;
    els.nextBtn.disabled = currentIndex < 0 || currentIndex >= total - 1;
  }

  function updateOutlineActive() {
    els.courseOutline.querySelectorAll('button[data-item-id]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.itemId === currentItem?.identifier);
    });
  }

  function updateRuntimeLabel() {
    if (!runtime) { els.runtimeLabel.textContent = 'Runtime inactif'; return; }
    const state = runtime.terminated ? 'terminé' : runtime.initialized ? 'initialisé' : 'en attente de Initialize';
    els.runtimeLabel.textContent = `${runtime.standard} · ${state}`;
  }

  function renderData() {
    if (!els.dataBody) return;
    const filter = (els.dataFilter?.value || '').trim().toLowerCase();
    const entries = Object.entries(latestData || {})
      .filter(([key, value]) => !filter || key.toLowerCase().includes(filter) || String(value).toLowerCase().includes(filter))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

    els.dataBody.innerHTML = '';
    if (!entries.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td'); td.colSpan = 2; td.className = 'empty-cell'; td.textContent = 'Aucune donnée correspondant au filtre.';
      tr.appendChild(td); els.dataBody.appendChild(tr); return;
    }

    for (const [key, value] of entries) {
      const tr = document.createElement('tr');
      const keyCell = document.createElement('td'); keyCell.textContent = key;
      const valueCell = document.createElement('td');
      const input = document.createElement('input'); input.className = 'value-input'; input.value = value; input.title = 'Modifier la valeur simulée';
      input.addEventListener('change', () => runtime?.forceSet(key, input.value));
      valueCell.appendChild(input); tr.append(keyCell, valueCell); els.dataBody.appendChild(tr);
    }
  }

  function renderLogs() {
    if (!els.logList) return;
    els.logList.innerHTML = '';
    if (!logs.length) {
      const p = document.createElement('p'); p.className = 'empty-hint'; p.textContent = 'Les appels SCORM apparaîtront ici.'; els.logList.appendChild(p); return;
    }

    const fragment = document.createDocumentFragment();
    logs.slice().reverse().forEach(entry => {
      const div = document.createElement('div'); div.className = 'log-entry' + (entry.errorCode ? ' log-error' : '');
      const head = document.createElement('div'); head.className = 'log-head';
      const time = document.createElement('span'); time.className = 'log-time'; time.textContent = entry.time.toLocaleTimeString('fr-FR', { hour12: false });
      const method = document.createElement('span'); method.className = 'log-method'; method.textContent = entry.method;
      head.append(time, method); div.appendChild(head);
      if (entry.args.length) {
        const args = document.createElement('div'); args.className = 'log-args'; args.textContent = entry.args.map(v => JSON.stringify(v)).join(', '); div.appendChild(args);
      }
      const result = document.createElement('div'); result.className = 'log-result';
      result.textContent = `→ ${JSON.stringify(entry.result)}${entry.errorCode ? ` · erreur ${entry.errorCode}` : ''}`;
      div.appendChild(result); fragment.appendChild(div);
    });
    els.logList.appendChild(fragment);
  }

  function setBadge(text, type) {
    els.statusBadge.textContent = text;
    els.statusBadge.className = 'badge' + (type ? ` ${type}` : '');
  }

  function showToast(message, error = false, duration = 3500) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.className = 'toast show' + (error ? ' error' : '');
    toastTimer = setTimeout(() => els.toast.className = 'toast', duration);
  }
})();
