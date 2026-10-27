(function () {
  'use strict';

  const CACHE_NAME = 'scorm-reader-packages-v1';
  const APP_BASE = new URL('./', document.baseURI);
  const SW_RELOAD_KEY = 'scorm-reader-sw-reload';
  const els = {};
  let swReady = false;
  let packageState = null;
  let runtime = null;
  let transitionQueue = Promise.resolve();
  let transitionSequence = 0;
  let scoClosing = false;
  let sessionPaused = false;
  let resumeAudit = null;
  let transitionBusy = false;
  let packageLoading = false;
  let currentItem = null;
  let currentIndex = -1;
  let latestData = {};
  let logs = [];
  let toastTimer = null;
  let attemptNumber = 1;
  let attemptCount = 1;
  let activeLearnerId = 'learner-001';
  let learnerViewed = false;
  let storageState = { savedData: null, dirtyKeys: [], writtenKeys: [], lastPersistOk: null };
  const simSettingsKey = 'scorm-reader:moodle45:settings:v1';
  const themeKey = 'scorm-studio:theme:v1';
  const helpTexts = {
    learner: ['Apprenant simulé', 'L’identifiant distingue les progressions conservées dans ce navigateur. Utilisez un identifiant de test : les informations ne sont pas envoyées à Moodle.'],
    inspector: ['Inspection SCORM', 'Consultez la projection Moodle, les valeurs CMI, les appels API et le manifeste. Le lecteur enregistre localement les échanges du package.'],
    moodle: ['Simulation Moodle 4.5', 'Estimation calculée localement à partir des traces SCORM et des paramètres choisis. Elle ne lit pas les réglages de votre plateforme Moodle.'],
    attempt: ['Tentatives', 'Chaque tentative conserve ses données locales par SCO. Le calcul de la note peut retenir la meilleure tentative, la première, la dernière achevée ou leur moyenne.'],
    scope: ['En cours ou validé', 'En cours : inclut les valeurs transmises depuis la dernière initialisation. Validé : ne retient que les données sauvegardées après Commit ou Finish/Terminate réussi.'],
    status: ['Statut du SCO', 'Le statut est transmis par le contenu : cmi.core.lesson_status (SCORM 1.2), ou completion_status et success_status (SCORM 2004).'],
    score: ['Score brut', 'Note numérique transmise par le SCO, généralement via cmi.core.score.raw. Elle peut être absente même si le module est achevé.'],
    grade: ['Note de l’activité', 'Calcul local suivant les méthodes de notation et de sélection des tentatives. Cette note ne correspond pas nécessairement au carnet de notes réel de Moodle.'],
    completion: ['Achèvement simulé', 'Résultat des conditions d’achèvement configurées plus bas. Un module completed n’est pas nécessairement passed.'],
    completionRules: ['Conditions d’achèvement', 'Chaque condition correspond à une règle que vous activez dans les paramètres Moodle simulés. Le résultat est positif lorsque toutes les règles activées sont satisfaites.'],
    gradeMethod: ['Méthode de notation', 'Détermine comment Moodle agrège les résultats des SCO : objets d’apprentissage achevés, meilleure note, moyenne ou somme des notes.'],
    attemptMethod: ['Note des tentatives', 'Détermine quelle(s) tentative(s) servent à calculer la note portée au carnet de notes simulé.'],
    maxGrade: ['Note maximale', 'Barème maximal défini dans l’activité Moodle. Le score brut est ramené à ce maximum dans la simulation.'],
    statusRequired: ['Statut requis', 'Définit les statuts SCORM acceptés pour considérer la condition d’achèvement comme remplie : passed, completed ou les deux.'],
    allScos: ['Tous les SCO', 'Exige un état d’achèvement pour chaque SCO du package. Cette option est pertinente pour les contenus comportant plusieurs éléments suivis.'],
    minScoreEnabled: ['Score minimal', 'Active une condition portant sur la valeur du score brut renvoyée par un SCO, indépendamment de la note maximale Moodle.'],
    minScore: ['Seuil du score brut', 'Valeur minimale exigée dans les données SCORM, par exemple 80 si le SCO transmet une note sur 100.'],
    requireGrade: ['Recevoir une note', 'La condition nécessite une note calculable pour l’activité. Elle dépend des données reçues et du mode de notation.'],
    passGradeEnabled: ['Note de passage', 'Impose que la note Moodle simulée atteigne le seuil du carnet de notes. Cette condition diffère du statut SCORM passed.'],
    passGrade: ['Seuil Moodle', 'Note minimale sur le barème maximal de l’activité. Exemple : 12 pour une activité notée sur 20.'],
    requireView: ['Consultation', 'Dans ce lecteur, le lancement du SCO compte comme une consultation simulée. Moodle dispose de ses propres événements de consultation.'],
    data: ['Valeurs CMI', 'La colonne En cours montre la mémoire SCORM, Enregistré montre le dernier snapshot validé. Modifier manuellement une valeur produit une injection de test journalisée.'],
    log: ['Journal API', 'Les événements s’affichent du plus récent au plus ancien. Les erreurs 301 indiquent généralement un accès avant Initialisation ou après fermeture de session. Exportez le JSON pour un diagnostic complet.'],
    persistence: ['Persistance et reprise', 'Le simulateur distingue les valeurs enregistrées, les valeurs renvoyées par l’API à la réouverture et la restauration visible du contenu. Ce dernier point nécessite une vérification manuelle : les appels API ne prouvent pas que le bon écran a été restauré.']
  };
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
      'emptyState','scoFrame','pausedState','closeSessionBtn','resumeSessionBtn','resumeSessionMainBtn','themeToggle','helpPopover','runtimeLabel','clearLogBtn','downloadLogBtn','logFilter','logCount',
      'dataFilter','dataBody','saveIndicator','forceCommitBtn','logList','manifestView','toast',
      'attemptSelect','newAttemptBtn','moodleScope','moodleScopeNote','moodleStatus','moodleScore',
      'moodleGrade','moodleCompletion','completionCount','completionRules','scoStates','diagnosticList',
      'persistenceState','persistedStatus','persistedEntry','persistedLocation','persistedSuspend','resumeDiagnostic',
      ...simOptionIds].forEach(id => els[id] = document.getElementById(id));

    restoreSimulationOptions();
    restoreTheme();
    bindEvents();
    setupHelp();
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
    els.closeSessionBtn.addEventListener('click', closeActiveSession);
    els.resumeSessionBtn.addEventListener('click', resumeActiveSession);
    els.resumeSessionMainBtn.addEventListener('click', resumeActiveSession);
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

    els.resetSessionBtn.addEventListener('click', resetAllProgress);

    els.themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
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

    // Labels stay keyboard-operable while the file input itself is visually hidden.
    document.querySelectorAll('label[for="zipInput"]').forEach(label => {
      label.tabIndex = 0;
      label.setAttribute('role', 'button');
      label.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          els.zipInput.click();
        }
      });
    });
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
    if (packageLoading) return showToast('Un package est déjà en cours de préparation.', true);
    packageLoading = true;
    setTransitionBusy(true);
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

      // Keep the outgoing API operational through iframe pagehide/unload.
      ++transitionSequence;
      await transitionQueue.catch(() => {});
      scoClosing = true;
      await unloadScoFrame();
      scoClosing = false;
      uninstallGlobalApi();
      packageState = {
        fileName: file.name,
        zip,
        manifest,
        hash,
        virtualRoot,
        fileCount: zip.listFiles().length
      };

      runtime = null;
      sessionPaused = false;
      resumeAudit = null;
      els.pausedState.hidden = true;
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
      packageLoading = false;
      await launchItem(first);
      showToast(`Package chargé : ${manifest.title}`);
    } catch (error) {
      console.error(error);
      setBadge('Erreur', 'error');
      showToast(error.message || String(error), true, 7000);
    } finally {
      packageLoading = false;
      scoClosing = false;
      setTransitionBusy(false);
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

  function setTransitionBusy(value) {
    transitionBusy = value;
    const ready = Boolean(packageState && currentItem) && !value;
    els.reloadBtn.disabled = !ready || sessionPaused;
    els.resetSessionBtn.disabled = !ready;
    els.openWindowBtn.disabled = !ready && !sessionPaused;
    els.closeSessionBtn.disabled = !ready || sessionPaused;
    els.resumeSessionBtn.disabled = !ready || !sessionPaused;
    els.resumeSessionBtn.hidden = !sessionPaused;
    els.newAttemptBtn.disabled = value || !packageState || attemptCount >= 100;
    if (value) {
      els.prevBtn.disabled = true;
      els.nextBtn.disabled = true;
    } else updateNavButtons();
  }

  function unloadScoFrame() {
    const frame = els.scoFrame;
    if (frame.hidden || !frame.getAttribute('src') || frame.getAttribute('src') === 'about:blank') {
      frame.hidden = true;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      let settled = false;
      let timeout;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        frame.removeEventListener('load', onLoad);
        frame.hidden = true;
        resolve();
      };
      const onLoad = () => {
        // Preserve the old API until the iframe has finished firing pagehide/unload.
        // A short next-task delay also lets synchronous unload handlers finish.
        setTimeout(finish, 0);
      };
      frame.addEventListener('load', onLoad);
      timeout = setTimeout(() => {
        addSystemLog('Délai de déchargement dépassé : la fermeture du SCO est incertaine');
        finish();
      }, 2500);
      frame.src = 'about:blank';
    });
  }

  // A closure is a pause of the selected attempt, not a reset.
  // Keep the outgoing API live until the iframe has fired its unload callbacks.
  function closeActiveSession() {
    if (!packageState || !currentItem || sessionPaused || transitionBusy || packageLoading) return Promise.resolve();
    const packageAtRequest = packageState;
    const sequence = ++transitionSequence;
    const closing = transitionQueue.catch(() => {}).then(async () => {
      if (sequence !== transitionSequence || packageState !== packageAtRequest) return;
      setTransitionBusy(true);
      scoClosing = true;
      try {
        const outgoing = runtime;
        addSystemLog('Fermeture simulée : API maintenue durant le déchargement');
        await unloadScoFrame();
        if (sequence !== transitionSequence || packageState !== packageAtRequest) return;
        if (outgoing?.dirtyKeys.size) {
          addSystemLog(`${outgoing.dirtyKeys.size} écriture(s) non validée(s) : ces valeurs ne seront pas restaurées`);
        }
        uninstallGlobalApi();
        runtime = null;
        sessionPaused = true;
        const saved = getStoredSco(currentItem.identifier, attemptNumber);
        latestData = saved?.data ? { ...saved.data } : {};
        storageState = { savedData: saved?.data ? { ...saved.data } : null,
          dirtyKeys: [], writtenKeys: saved?.writtenKeys || [], lastPersistOk: outgoing?.lastPersistOk ?? null };
        els.pausedState.hidden = false;
        els.emptyState.hidden = true;
        els.currentItemTitle.textContent = currentItem.title;
        renderData(); updateRuntimeLabel(); renderMoodle();
        addSystemLog(saved ? 'Session fermée : état sauvegardé disponible pour la reprise' : 'Session fermée sans état sauvegardé');
      } finally {
        scoClosing = false;
        setTransitionBusy(false);
      }
    });
    transitionQueue = closing;
    return closing.catch(error => {
      console.error(error);
      showToast('Impossible de fermer le SCO.', true);
    });
  }

  function resumeActiveSession() {
    if (!sessionPaused || !currentItem || transitionBusy) return Promise.resolve();
    addSystemLog('Réouverture de la même tentative avec les données validées');
    return launchItem(currentItem, true);
  }

  function wipeLearnerProgress(packageHash, standard, learnerId) {
    const prefix = `scorm-reader:v1:${packageHash}:`;
    const suffix = `:${standard}:${learnerId}`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && key.endsWith(suffix)) keys.push(key);
    }
    // Include the counter even if it was corrupted or stale.
    keys.push(`scorm-reader:attempts:v1:${packageHash}:${learnerId}`);
    keys.forEach(key => localStorage.removeItem(key));
    return keys.length;
  }

  function resetAllProgress() {
    if (!packageState || !currentItem || transitionBusy || packageLoading) return Promise.resolve();
    const learnerId = runtime?.learnerId || activeLearnerId;
    const packageAtRequest = packageState;
    const itemToRestart = packageState.manifest.launchableItems[0] || currentItem;
    const accepted = confirm(`Effacer définitivement toute la progression de « ${learnerId} » pour ce package ?\n\nTous les SCO et toutes les tentatives seront supprimés. La note et l'historique Moodle simulés repartiront de zéro.\n\nLe package chargé et les réglages de l'interface seront conservés.`);
    if (!accepted) return Promise.resolve();
    const sequence = ++transitionSequence;
    const resetting = transitionQueue.catch(() => {}).then(async () => {
      if (sequence !== transitionSequence || packageState !== packageAtRequest) return false;
      setTransitionBusy(true);
      scoClosing = true;
      try {
        // Any LMSFinish emitted during unload must happen BEFORE the delete.
        await unloadScoFrame();
        if (sequence !== transitionSequence || packageState !== packageAtRequest) return false;
        uninstallGlobalApi();
        runtime = null;
        wipeLearnerProgress(packageAtRequest.hash, packageAtRequest.manifest.standard, learnerId);
        sessionPaused = false;
        resumeAudit = null;
        els.pausedState.hidden = true;
        latestData = {};
        storageState = { savedData: null, dirtyKeys: [], writtenKeys: [], lastPersistOk: null };
        attemptCount = 1;
        attemptNumber = 1;
        learnerViewed = false;
        logs = [];
        updateAttemptsControl();
        renderData(); renderLogs(); renderMoodle();
        return true;
      } finally {
        scoClosing = false;
        setTransitionBusy(false);
      }
    });
    transitionQueue = resetting;
    return resetting.then(async cleared => {
      if (!cleared) return;
      await launchItem(itemToRestart, true);
      addSystemLog('Toutes les données de progression ont été effacées ; tentative n° 1');
      showToast('Progression entièrement effacée pour cet apprenant et ce package.');
    }).catch(error => {
      console.error(error);
      showToast('Réinitialisation incomplète : vérifiez les permissions du stockage.', true, 7000);
    });
  }

  function launchItem(item, forceReload = false) {
    if (!packageState || !item?.href || packageLoading) return Promise.resolve();
    const packageAtRequest = packageState;
    const selectedAttempt = attemptNumber;
    const sequence = ++transitionSequence;
    const transition = transitionQueue.catch(() => {}).then(async () => {
      if (sequence !== transitionSequence || packageState !== packageAtRequest) return;
      setTransitionBusy(true);
      scoClosing = true;
      try {
        const previous = runtime;
        if (previous) addSystemLog('Fermeture du SCO sortant : API maintenue jusqu’au déchargement');
        await unloadScoFrame();
        if (sequence !== transitionSequence || packageState !== packageAtRequest) return;
        if (previous?.dirtyKeys.size) {
          addSystemLog(`${previous.dirtyKeys.size} écriture(s) non validée(s) à la fermeture du SCO`);
          showToast('Certaines données non validées par Commit/Finish risquent d’être perdues.', true, 5500);
        }
        runtime = null;
        uninstallGlobalApi();
        // Identify a resume only after a deliberate closure of this SCO/attempt.
        const priorPause = sessionPaused && item.identifier === currentItem?.identifier;
        const savedBeforeResume = priorPause ? getStoredSco(item.identifier, selectedAttempt) : null;
        resumeAudit = priorPause ? { expected: savedBeforeResume?.data || null, read: {}, mismatches: [], attempted: 0,
          entryAtOpen: savedBeforeResume?.data?.[packageState.manifest.standard === 'SCORM 2004' ? 'cmi.exit' : 'cmi.core.exit'] === 'suspend' ? 'resume' : 'ab-initio' } : null;
        sessionPaused = false;
        els.pausedState.hidden = true;
        currentItem = item;
        currentIndex = packageState.manifest.launchableItems.findIndex(candidate => candidate.identifier === item.identifier);
        const launchedRuntimeKey = runtimePackageKey(item.identifier, selectedAttempt);
        const learnerId = activeLearnerId;
        const learnerName = els.learnerName.value.trim() || 'Apprenant Test';
        let instance;
        instance = new ScormRuntime({
          standard: packageState.manifest.standard,
          packageKey: launchedRuntimeKey,
          learnerId, learnerName,
          metadata: packageState.manifest.metadata,
          onLog: entry => {
            entry.scoId = item.identifier;
            entry.scoTitle = item.title;
            entry.attempt = selectedAttempt;
            logs.push(entry);
            if (resumeAudit && /^(LMSGetValue|GetValue)$/.test(entry.method) && entry.errorCode === 0) {
              const key = String(entry.args[0] || '');
              const expected = resumeAudit.expected;
              const relevant = ['cmi.suspend_data', 'cmi.core.lesson_location', 'cmi.location',
                'cmi.core.lesson_status', 'cmi.completion_status', 'cmi.success_status',
                'cmi.core.entry', 'cmi.entry'];
              if (relevant.includes(key)) {
                resumeAudit.attempted++;
                resumeAudit.read[key] = true;
                const entryKey = key === 'cmi.core.entry' || key === 'cmi.entry';
                // Entry is derived from the previous exit and not a saved progress value.
                if (!entryKey && expected && Object.prototype.hasOwnProperty.call(expected, key) && String(expected[key]) !== entry.result) {
                  if (!resumeAudit.mismatches.includes(key)) resumeAudit.mismatches.push(key);
                }
              }
            }
            if (logs.length > 5000) logs.shift();
            renderLogs();
            renderMoodle();
          },
          onChange: (data, state) => {
            // Check the instance, not just its key: reloads reuse the same key.
            if (runtime !== instance) return;
            latestData = data;
            storageState = state;
            renderData(); updateRuntimeLabel(); renderMoodle();
          },
          onNavigate: request => {
            if (runtime === instance && !scoClosing) handleNavigationRequest(request);
          }
        });
        runtime = instance;
        installGlobalApi(instance);
        latestData = { ...runtime.data };
        storageState = runtime.getStorageState();
        learnerViewed = true;
        renderData();
        renderMoodle();
        els.emptyState.hidden = true;
        els.pausedState.hidden = true;
        els.scoFrame.hidden = false;
        const url = launchUrl(item.href);
        els.scoFrame.src = forceReload ? appendCacheBuster(url) : url;
        els.currentItemTitle.textContent = item.title;
        updateOutlineActive();
        updateRuntimeLabel();
        renderMoodle();
      } finally {
        scoClosing = false;
        setTransitionBusy(false);
      }
    });
    transitionQueue = transition;
    return transition.catch(error => {
      console.error(error);
      addSystemLog(`Transition SCO en échec : ${error.message || error}`);
      showToast('Impossible de charger le SCO.', true);
    });
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
    if (transitionBusy) { els.prevBtn.disabled = true; els.nextBtn.disabled = true; return; }
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
    if (!runtime) { els.runtimeLabel.textContent = sessionPaused ? 'SCO fermé · reprise possible' : 'Runtime inactif'; return; }
    const state = runtime.terminated ? 'terminé' : runtime.initialized ? 'initialisé' : 'en attente de Initialize';
    els.runtimeLabel.textContent = `${runtime.standard} · ${state}`;
  }

  function learnerKey() { return activeLearnerId; }
  function runtimePackageKey(itemId, attempt) {
    // Attempt 1 keeps the old v1 storage key for backward compatibility.
    return `${packageState.hash}:${itemId}${attempt > 1 ? ':attempt=' + attempt : ''}`;
  }
  function attemptsStorageKey() { return `scorm-reader:attempts:v1:${packageState.hash}:${learnerKey()}`; }
  function restoreAttempts() {
    activeLearnerId = (els.learnerId.value || '').trim() || 'learner-001';
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
      renderPersistence();
      return;
    }
    const scope = els.moodleScope.value;
    const result = getMoodleResult(scope);
    renderPersistence();
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
  function renderPersistence() {
    if (!els.persistenceState) return;
    const item = currentItem;
    const saved = packageState && item ? getStoredSco(item.identifier, attemptNumber) : null;
    const data = saved?.data || {};
    const is12 = packageState?.manifest.standard !== 'SCORM 2004';
    const statusKey = is12 ? 'cmi.core.lesson_status' : 'cmi.completion_status';
    const exitKey = is12 ? 'cmi.core.exit' : 'cmi.exit';
    const locationKey = is12 ? 'cmi.core.lesson_location' : 'cmi.location';
    const status = data[statusKey] || '';
    const exit = data[exitKey] || '';
    const location = data[locationKey] || '';
    const suspend = data['cmi.suspend_data'] || '';
    const hasAnyProgress = Boolean(saved && ((saved.writtenKeys || []).some(key =>
      /lesson_status|completion_status|success_status|lesson_location|suspend_data|score|progress_measure/.test(key))
      || status && status !== 'not attempted' && status !== 'unknown' || location || suspend));
    els.persistedStatus.textContent = saved ? status || 'Non renseigné' : 'Non enregistré';
    els.persistedLocation.textContent = location ? `${location.slice(0, 48)}${location.length > 48 ? '…' : ''}` : 'Absente';
    const bytes = new TextEncoder().encode(suspend).length;
    els.persistedSuspend.textContent = suspend ? `${new Intl.NumberFormat('fr-FR').format(bytes)} octets` : 'Absentes';
    els.persistedEntry.textContent = resumeAudit ? `${resumeAudit.entryAtOpen} (à la réouverture)` :
      !saved ? 'Non déterminée' : exit === 'suspend' ? 'resume (suspend)' : 'ab-initio (pas de suspend)';
    els.persistenceState.classList.toggle('persisted',hasAnyProgress);
    els.persistenceState.classList.toggle('unsaved',!hasAnyProgress);
    if (!packageState) els.persistenceState.textContent = 'Aucun package chargé.';
    else if (sessionPaused) els.persistenceState.textContent = hasAnyProgress ? 'Session fermée. Progression conservée localement.' : 'Session fermée. Aucune progression enregistrée détectée.';
    else if (hasAnyProgress) els.persistenceState.textContent = 'Données de progression enregistrées.';
    else els.persistenceState.textContent = 'Aucune progression enregistrée détectée.';
    if (resumeAudit) {
      const reads = Object.keys(resumeAudit.read).filter(k => k !== 'cmi.entry' && k !== 'cmi.core.entry');
      const entryRead = 'cmi.entry' in resumeAudit.read || 'cmi.core.entry' in resumeAudit.read;
      els.resumeDiagnostic.textContent = resumeAudit.mismatches.length ?
        `Attention : ${resumeAudit.mismatches.length} valeur(s) restituée(s) diffèrent du dernier enregistrement. Vérifiez le journal.` :
        resumeAudit.attempted ?
          `Réouverture observée : ${reads.length} variable(s) de progression lue(s) par le SCO${entryRead ? ', indicateur entry consulté' : ''}. Vérifiez visuellement que le contenu a repris au bon endroit.` :
          'SCO rouvert : en attente de lecture des données par le package. La restauration visuelle reste à vérifier.';
    } else if (sessionPaused) {
      els.resumeDiagnostic.textContent = suspend && exit !== 'suspend' ?
        'Attention : des données de suspension existent, mais la dernière sortie ne déclare pas « suspend ». La reprise automatique peut ne pas être demandée.' :
        'Cliquez sur « Reprendre » pour réouvrir cette tentative avec les valeurs enregistrées.';
    } else {
      els.resumeDiagnostic.textContent = 'Fermez le SCO puis reprenez-le pour vérifier ce qu’il relit au lancement.';
    }
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
    els.saveIndicator.textContent = sessionPaused ? 'Session fermée · données conservées' : !runtime ? 'Aucune session' : storageState.dirtyKeys.length ?
      `${storageState.dirtyKeys.length} écriture(s) en attente` : storageState.savedData ? 'Données validées' : 'Aucun Commit/Finish';
    els.saveIndicator.classList.toggle('pending', Boolean(storageState.dirtyKeys.length));
    els.forceCommitBtn.disabled = transitionBusy || !runtime || !runtime.initialized || runtime.terminated;
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
    if (entry.errorCode) {
      if (entry.errorCode === 301 && /^LMS/.test(method)) {
        if (entry.sessionTerminated) return 'Session déjà terminée : appel SCORM après LMSFinish.';
        if (!entry.sessionInitialized) return 'Appel avant LMSInitialize : la session SCORM n’est pas ouverte.';
      }
      return `Appel refusé par l’API (code ${entry.errorCode}).`;
    }
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

  function restoreTheme() {
    let theme = 'dark';
    try { theme = localStorage.getItem(themeKey) === 'light' ? 'light' : 'dark'; } catch {}
    setTheme(theme);
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1020' : '#eef3f7');
    els.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre');
    els.themeToggle.title = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
    els.themeToggle.querySelector('use').setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
    try { localStorage.setItem(themeKey, theme); } catch {}
  }

  function setupHelp() {
    let active = null;
    let sticky = false;
    const panel = els.helpPopover;
    function hide() {
      if (!active) return;
      active.setAttribute('aria-expanded', 'false');
      active = null;
      sticky = false;
      panel.hidden = true;
    }
    function show(button, pin = false) {
      const data = helpTexts[button.dataset.help];
      if (!data) return;
      if (active && active !== button) hide();
      active = button;
      sticky = pin;
      panel.replaceChildren();
      const heading = document.createElement('strong'); heading.textContent = data[0];
      const paragraph = document.createElement('p'); paragraph.textContent = data[1];
      panel.append(heading, paragraph);
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-describedby', 'helpPopover');
      const rect = button.getBoundingClientRect();
      const width = panel.getBoundingClientRect().width;
      const height = panel.getBoundingClientRect().height;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left - width / 2 + rect.width / 2));
      const top = rect.bottom + height + 10 < window.innerHeight
        ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }
    document.querySelectorAll('.help-trigger').forEach(button => {
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('mouseenter', () => { if (!sticky) show(button); });
      button.addEventListener('mouseleave', () => { if (!sticky) hide(); });
      button.addEventListener('focus', () => { if (!sticky) show(button); });
      button.addEventListener('blur', () => { if (!sticky) hide(); });
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        if (active === button && sticky) hide();
        else show(button, true);
      });
    });
    document.addEventListener('pointerdown', event => {
      if (active && !event.target.closest('.help-trigger')) hide();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', () => {
      if (active && sticky) show(active, true);
      else hide();
    }, true);
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
