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
  let attemptNumber = 1;
  let attemptCount = 1;
  let learnerViewed = false;
  let storageState = { savedData: null, dirtyKeys: [], writtenKeys: [], lastPersistOk: null };
  const simSettingsKey = 'scorm-reader:moodle45:settings:v1';
  const simOptionIds = ['gradeMethod','attemptMethod','maxGrade','statusRequired','allScos','minScoreEnabled','minScore','requireGrade','passGradeEnabled','passGrade','requireView'];

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
      'emptyState','scoFrame','runtimeLabel','clearLogBtn','downloadLogBtn','logFilter','logCount',
      'dataFilter','dataBody','saveIndicator','forceCommitBtn','logList','manifestView','toast',
      'attemptSelect','newAttemptBtn','moodleScope','moodleScopeNote','moodleStatus','moodleScore',
      'moodleGrade','moodleCompletion','completionCount','completionRules','scoStates','diagnosticList',
      ...simOptionIds].forEach(id => els[id] = document.getElementById(id));

    restoreSimulationOptions();
    bindEvents();
    renderMoodle();
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
      if (runtime?.dirtyKeys.size && !confirm('Des écritures SCORM non validées seront perdues. Continuer ?')) return;
      restoreAttempts();
      if (currentItem) launchItem(currentItem, true);
      else showToast('Identité de l’apprenant prête pour le prochain SCO.');
    });

    els.resetSessionBtn.addEventListener('click', () => {
      if (!runtime || !currentItem) return;
      runtime.reset();
      addSystemLog('Réinitialisation du SCO actif');
      launchItem(currentItem, true);
      showToast('Session du SCO réinitialisée.');
    });

    els.clearLogBtn.addEventListener('click', () => { logs = []; renderLogs(); });
    els.downloadLogBtn.addEventListener('click', exportLogs);
    els.logFilter.addEventListener('change', renderLogs);
    els.dataFilter.addEventListener('input', renderData);
    els.forceCommitBtn.addEventListener('click', () => {
      if (!runtime || !runtime.initialized || runtime.terminated) return;
      const result = runtime.standard === 'SCORM 2004' ? runtime.api.Commit('') : runtime.api.LMSCommit('');
      showToast(result === 'true' ? 'Validation manuelle simulée.' : 'Échec de la validation.', result !== 'true');
    });
    els.moodleScope.addEventListener('change', renderMoodle);
    els.newAttemptBtn.addEventListener('click', startNewAttempt);
    els.attemptSelect.addEventListener('change', () => {
      if (runtime?.dirtyKeys.size && !confirm('Des écritures non validées seront perdues. Changer de tentative ?')) {
        els.attemptSelect.value = String(attemptNumber); return;
      }
      attemptNumber = Number(els.attemptSelect.value) || 1;
      if (currentItem) launchItem(currentItem, true);
      renderMoodle();
    });
    simOptionIds.forEach(id => els[id].addEventListener('change', () => {
      els.minScore.disabled = !els.minScoreEnabled.checked;
      els.passGrade.disabled = !els.passGradeEnabled.checked;
      els.maxGrade.disabled = els.gradeMethod.value === 'objects';
      saveSimulationOptions();
      renderMoodle();
    }));

    document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
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
      storageState = { savedData: null, dirtyKeys: [], writtenKeys: [], lastPersistOk: null };
      learnerViewed = false;
      uninstallGlobalApi();
      restoreAttempts();
      renderPackage();
      renderLogs();
      renderData();
      renderMoodle();
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

    if (runtime && runtime.dirtyKeys.size) {
      addSystemLog('Changement/rechargement du SCO : écritures non validées potentiellement perdues');
      showToast('Écritures non validées : elles ne seront pas reprises dans ce SCO.', true, 5000);
    }

    currentItem = item;
    const launchedAttempt = attemptNumber;
    const launchedRuntimeKey = runtimePackageKey(item.identifier, launchedAttempt);
    currentIndex = packageState.manifest.launchableItems.findIndex(candidate => candidate.identifier === item.identifier);
    const learnerId = els.learnerId.value.trim() || 'learner-001';
    const learnerName = els.learnerName.value.trim() || 'Apprenant Test';
    runtime = new ScormRuntime({
      standard: packageState.manifest.standard,
      packageKey: launchedRuntimeKey,
      learnerId,
      learnerName,
      metadata: packageState.manifest.metadata,
      onLog: entry => {
        entry.scoId = item.identifier;
        entry.scoTitle = item.title;
        entry.attempt = launchedAttempt;
        logs.push(entry);
        if (logs.length > 5000) logs.shift();
        renderLogs();
        renderMoodle();
      },
      onChange: (data, state) => {
        if (runtime && runtime.packageKey !== launchedRuntimeKey) return;
        latestData = data;
        storageState = state;
        renderData(); updateRuntimeLabel(); renderMoodle();
      },
      onNavigate: request => handleNavigationRequest(request)
    });
    installGlobalApi(runtime);
    latestData = { ...runtime.data };
    storageState = runtime.getStorageState();
    learnerViewed = true;
    renderData();
    renderMoodle();

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
    renderMoodle();
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

  function learnerKey() { return (els.learnerId.value || '').trim() || 'learner-001'; }
  function runtimePackageKey(itemId, attempt) {
    // Attempt 1 keeps the old v1 storage key for backward compatibility.
    return `${packageState.hash}:${itemId}${attempt > 1 ? ':attempt=' + attempt : ''}`;
  }
  function attemptsStorageKey() { return `scorm-reader:attempts:v1:${packageState.hash}:${learnerKey()}`; }
  function restoreAttempts() {
    attemptCount = 1;
    try { attemptCount = Math.max(1, Math.min(100, Number(localStorage.getItem(attemptsStorageKey())) || 1)); } catch {}
    attemptNumber = attemptCount;
    updateAttemptsControl();
  }
  function updateAttemptsControl() {
    els.attemptSelect.replaceChildren();
    for (let n = 1; n <= attemptCount; n++) {
      const opt = new Option(`N° ${n}`, String(n));
      els.attemptSelect.appendChild(opt);
    }
    els.attemptSelect.value = String(attemptNumber);
    els.newAttemptBtn.disabled = !packageState || attemptCount >= 100;
  }
  function startNewAttempt() {
    if (!packageState) return;
    if (runtime?.dirtyKeys.size && !confirm('Les écritures SCORM non validées seront perdues. Commencer une nouvelle tentative ?')) return;
    if (attemptCount >= 100) return showToast('Limite de 100 tentatives locales atteinte.', true);
    attemptNumber = ++attemptCount;
    try { localStorage.setItem(attemptsStorageKey(), String(attemptCount)); }
    catch { showToast('Impossible de mémoriser le compteur de tentatives.', true); }
    updateAttemptsControl();
    addSystemLog(`Nouvelle tentative n° ${attemptNumber}`);
    if (currentItem) launchItem(currentItem, true);
    renderMoodle();
  }
  function restoreSimulationOptions() {
    let opts = {};
    try { opts = JSON.parse(localStorage.getItem(simSettingsKey)) || {}; } catch {}
    simOptionIds.forEach(id => {
      if (!(id in opts)) return;
      if (els[id].type === 'checkbox') els[id].checked = Boolean(opts[id]);
      else if (Array.from(els[id].options || []).length) {
        if (Array.from(els[id].options).some(option => option.value === String(opts[id]))) els[id].value = String(opts[id]);
      } else els[id].value = String(opts[id]);
    });
    els.minScore.disabled = !els.minScoreEnabled.checked;
    els.passGrade.disabled = !els.passGradeEnabled.checked;
    els.maxGrade.disabled = els.gradeMethod.value === 'objects';
  }
  function getSimulationOptions() {
    const opts = {};
    simOptionIds.forEach(id => opts[id] = els[id].type === 'checkbox' ? els[id].checked : els[id].value);
    return opts;
  }
  function saveSimulationOptions() {
    try { localStorage.setItem(simSettingsKey, JSON.stringify(getSimulationOptions())); } catch {}
  }
  function getStoredSco(itemId, n) {
    const storageKey = `scorm-reader:v1:${runtimePackageKey(itemId, n)}:${packageState.manifest.standard}:${learnerKey()}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.data !== 'object' || !parsed.data) return null;
      return { data: parsed.data, writtenKeys: parsed.writtenKeys || [] };
    } catch { return null; }
  }
  function collectAttempts(scope) {
    const attempts = [];
    for (let n = 1; n <= attemptCount; n++) {
      const scos = {};
      for (const item of packageState.manifest.launchableItems) {
        const stored = getStoredSco(item.identifier, n);
        if (stored) scos[item.identifier] = stored;
        if (scope === 'live' && n === attemptNumber && item.identifier === currentItem?.identifier && runtime) {
          // Live override is projection only. It never mutates the stored snapshot.
          scos[item.identifier] = { data: { ...runtime.data }, writtenKeys: Array.from(runtime.writtenKeys) };
        }
      }
      attempts.push({ number: n, scos });
    }
    return attempts;
  }
  function getMoodleResult(scope) {
    if (!packageState) return null;
    return MoodleSimulator.evaluate({
      standard: packageState.manifest.standard,
      items: packageState.manifest.launchableItems,
      attempts: collectAttempts(scope),
      options: getSimulationOptions(),
      viewed: learnerViewed,
      pending: scope === 'live' && Boolean(runtime?.dirtyKeys.size),
      commitError: storageState.lastPersistOk === false,
      initialized: runtime?.initialized,
      ended: runtime?.terminated
    });
  }
  function displayNumber(value) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
  }
  function renderMoodle() {
    if (!els.moodleStatus) return;
    if (!packageState) {
      els.moodleStatus.textContent = 'Aucun';
      els.moodleScore.textContent = 'Non envoyé';
      els.moodleGrade.textContent = 'Non calculable';
      els.moodleCompletion.textContent = 'Non configuré';
      els.completionCount.textContent = '';
      els.completionRules.replaceChildren();
      els.scoStates.replaceChildren();
      els.diagnosticList.replaceChildren();
      els.moodleScopeNote.textContent = 'Chargez un package SCORM pour débuter.';
      return;
    }
    const scope = els.moodleScope.value;
    const result = getMoodleResult(scope);
    const active = result.attempts.find(a => a.number === attemptNumber)?.rows.find(r => r.id === currentItem?.identifier);
    const saved = scope === 'saved';
    els.moodleStatus.textContent = active?.status || 'Aucun';
    els.moodleScore.textContent = active?.score === null || !active ? 'Non envoyé' : displayNumber(active.score);
    els.moodleGrade.textContent = result.gradebookGrade === null ? 'Aucune note' :
      `${displayNumber(result.gradebookGrade)} / ${displayNumber(result.maxGrade)}`;
    els.moodleCompletion.textContent = {complete:'Achevé', incomplete:'Non achevé', 'not-configured':'Non configuré'}[result.completion];
    els.moodleCompletion.className = result.completion === 'complete' ? 'state-good' : result.completion === 'incomplete' ? 'state-bad' : 'state-neutral';
    els.completionCount.textContent = result.conditions.length ? `${result.conditions.filter(c => c.ok).length}/${result.conditions.length}` : '';
    els.moodleScopeNote.textContent = saved
      ? 'Données enregistrées localement lors d’un Commit/Finish réussi. Ce stockage représente un substitut de LMS, pas la base de données Moodle.'
      : 'Projection en direct depuis les valeurs CMI en mémoire, y compris les écritures qui attendent Commit/Finish. Les règles de Moodle sont appliquées aux tentatives locales.';
    els.completionRules.replaceChildren();
    if (!result.conditions.length) addParagraph(els.completionRules, 'Aucune condition activée. Paramétrez la simulation ci-dessous.');
    result.conditions.forEach(c => {
      const line = document.createElement('div'); line.className = 'condition';
      const mark = document.createElement('span'); mark.className = 'mark ' + (c.ok ? 'state-good':'state-bad'); mark.textContent = c.ok ? '✓' : '×';
      const label = document.createElement('span'); label.textContent = c.label;
      line.append(mark,label); els.completionRules.appendChild(line);
    });
    els.scoStates.replaceChildren();
    for (const item of packageState.manifest.launchableItems) {
      const row = result.attempts.find(a => a.number === attemptNumber)?.rows.find(r => r.id === item.identifier);
      if (!row) continue;
      const div = document.createElement('div'); div.className = 'sco-state';
      const name = document.createElement('strong'); name.textContent = item.title;
      const description = document.createElement('span'); description.className = 'sco-meta';
      description.textContent = `${row.status} · score ${row.score === null ? 'non transmis' : displayNumber(row.score)}`;
      div.append(name, description); els.scoStates.appendChild(div);
    }
    els.diagnosticList.replaceChildren();
    const diagnostics = result.diagnostics.slice();
    if (runtime?.initialized && !runtime.terminated && !saved && !runtime.writtenKeys.size) {
      diagnostics.push({ kind:'info', text:'Aucune donnée de progression écrite par le SCO actif pour le moment.' });
    }
    if (logs.some(e => e.errorCode)) diagnostics.push({ kind:'warning', text:'Des appels API SCORM ont renvoyé une erreur : consultez le journal.' });
    if (packageState.manifest.metadata.passingScore && packageState.manifest.standard === 'SCORM 1.2') {
      diagnostics.push({ kind:'info', text:`Le manifeste comporte un seuil de maîtrise (${packageState.manifest.metadata.passingScore}). Une conversion automatique score/statut liée à ce seuil n’est pas reproduite ici.` });
    }
    if (packageState.manifest.manifestPath.includes('/')) {
      diagnostics.push({ kind:'warning', text:'Le manifeste est dans un sous-dossier : Moodle peut refuser le ZIP, même si ce lecteur parvient à le lancer.' });
    }
    if (!diagnostics.length) addParagraph(els.diagnosticList, 'Aucune anomalie détectée par les vérifications disponibles.');
    diagnostics.forEach(d => {
      const node = document.createElement('div'); node.className = 'diagnostic ' + d.kind;
      node.textContent = d.text; els.diagnosticList.appendChild(node);
    });
  }
  function addParagraph(container, text) {
    const p = document.createElement('p'); p.className = 'empty-hint'; p.textContent = text; container.appendChild(p);
  }
  function renderData() {
    if (!els.dataBody) return;
    const filter = (els.dataFilter.value || '').trim().toLowerCase();
    const saved = storageState.savedData || {};
    const entries = Array.from(new Set([...Object.keys(latestData || {}), ...Object.keys(saved)]))
      .filter(key => !filter || key.toLowerCase().includes(filter) || String(latestData[key] ?? '').toLowerCase().includes(filter))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    els.dataBody.replaceChildren();
    els.saveIndicator.textContent = !runtime ? 'Aucune session' : storageState.dirtyKeys.length ?
      `${storageState.dirtyKeys.length} écriture(s) en attente` : storageState.savedData ? 'Données validées' : 'Aucun Commit/Finish';
    els.saveIndicator.classList.toggle('pending', Boolean(storageState.dirtyKeys.length));
    els.forceCommitBtn.disabled = !runtime || !runtime.initialized || runtime.terminated;
    if (!entries.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td');
      td.colSpan = 3; td.className = 'empty-cell'; td.textContent = 'Aucune donnée correspondant au filtre.';
      tr.appendChild(td); els.dataBody.appendChild(tr); return;
    }
    for (const key of entries) {
      const tr = document.createElement('tr');
      if (storageState.dirtyKeys.includes(key)) tr.className = 'changed';
      const keyCell = document.createElement('td'); keyCell.textContent = key;
      const valueCell = document.createElement('td');
      const input = document.createElement('input'); input.className = 'value-input';
      input.value = latestData[key] ?? ''; input.title = 'Injection manuelle de test (hors API SCORM)';
      input.disabled = !runtime;
      input.addEventListener('change', () => runtime?.forceSet(key, input.value));
      valueCell.appendChild(input);
      const savedCell = document.createElement('td');
      savedCell.textContent = Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : 'Non enregistré';
      if (!Object.prototype.hasOwnProperty.call(saved,key)) savedCell.className = 'saved-missing';
      tr.append(keyCell, valueCell, savedCell); els.dataBody.appendChild(tr);
    }
  }
  function describeLog(entry) {
    const method = entry.method;
    const key = String(entry.args[0] || '');
    const val = String(entry.args[1] ?? '');
    if (entry.errorCode) return `Appel refusé par l’API (code ${entry.errorCode}).`;
    if (/^(LMSSetValue|SetValue|SIM:modifier)$/.test(method)) {
      if (/lesson_status|completion_status|success_status/.test(key)) return `Statut déclaré : ${val}.`;
      if (/score\.(raw|scaled)/.test(key)) return `Score transmis : ${val}.`;
      if (method === 'SIM:modifier') return 'Valeur modifiée manuellement pour tester le résultat.';
      return `Écriture de ${key}.`;
    }
    if (/^(LMSCommit|Commit)$/.test(method)) return entry.result === 'true' ? 'Validation demandée et enregistrée localement.' : 'Validation non effectuée.';
    if (/^(LMSFinish|Terminate)$/.test(method)) return 'Fin de session : tentative de validation des données.';
    if (/^(LMSInitialize|Initialize)$/.test(method)) return 'Ouverture de la communication avec le LMS simulé.';
    if (/^(LMSGetValue|GetValue)$/.test(method)) return 'Lecture de la variable CMI.';
    return '';
  }
  function addSystemLog(message) {
    logs.push({time:new Date(), method:'SIM:événement', args:[message], result:'', errorCode:0,
      scoTitle:currentItem?.title || '', attempt:attemptNumber});
    renderLogs();
  }
  function renderLogs() {
    if (!els.logList) return;
    const filter = els.logFilter.value;
    const shown = logs.filter(e => filter === 'all' ||
      (filter === 'errors' && Boolean(e.errorCode)) ||
      (filter === 'writes' && /^(LMSSetValue|SetValue|SIM:modifier)$/.test(e.method)) ||
      (filter === 'lifecycle' && /^(LMSInitialize|Initialize|LMSCommit|Commit|LMSFinish|Terminate)$/.test(e.method)));
    els.logCount.textContent = `${shown.length} / ${logs.length}` + (shown.length > 250 ? ' · 250 récents' : '');
    els.downloadLogBtn.disabled = logs.length === 0;
    els.logList.replaceChildren();
    if (!shown.length) { addParagraph(els.logList, 'Aucun événement correspondant au filtre.'); return; }
    const fragment = document.createDocumentFragment();
    // Keep the complete log for export, but cap DOM nodes for responsive large packages.
    shown.slice(-250).reverse().forEach(entry => {
      const div = document.createElement('div'); div.className = 'log-entry' + (entry.errorCode ? ' log-error' : '');
      const head = document.createElement('div'); head.className = 'log-head';
      const time = document.createElement('span'); time.className = 'log-time';
      time.textContent = entry.time.toLocaleTimeString('fr-FR', { hour12: false });
      const method = document.createElement('span'); method.className = 'log-method'; method.textContent = entry.method;
      head.append(time, method); div.appendChild(head);
      const context = document.createElement('div'); context.className = 'log-context';
      context.textContent = `Tentative ${entry.attempt || 1} · ${entry.scoTitle || ''}`; div.appendChild(context);
      if (entry.args.length) {
        const args = document.createElement('div'); args.className = 'log-args';
        args.textContent = entry.args.map(v => JSON.stringify(v)).join(', '); div.appendChild(args);
      }
      const result = document.createElement('div'); result.className = 'log-result';
      result.textContent = `→ ${JSON.stringify(entry.result)}${entry.errorCode ? ` · erreur ${entry.errorCode}` : ''}`;
      div.appendChild(result);
      const description = describeLog(entry);
      if (description) { const desc = document.createElement('p'); desc.className = 'log-description'; desc.textContent = description; div.appendChild(desc); }
      fragment.appendChild(div);
    });
    els.logList.appendChild(fragment);
  }
  function exportLogs() {
    const payload = {
      exportedAt: new Date().toISOString(), application:'Lecteur SCORM et simulateur Moodle 4.5',
      package: packageState ? { title:packageState.manifest.title, hash:packageState.hash, standard:packageState.manifest.standard } : null,
      learner: learnerKey(), settings:getSimulationOptions(), attempts:packageState ? collectAttempts('saved') : [],
      projection: getMoodleResult('live'), savedPrediction: getMoodleResult('saved'),
      events: logs.map(({time, ...rest}) => ({time:time.toISOString(), ...rest}))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `journal-scorm-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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
