'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the production SCO-transition functions in a browser-like harness.
// The simulated iframe fires its unload handler whenever it navigates to about:blank.
const application = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const lifecycle = application.slice(application.indexOf('  function setTransitionBusy(value) {'), application.indexOf('  function launchUrl(href) {'));
const runtimeSource = fs.readFileSync(path.join(__dirname, '../scorm-runtime.js'), 'utf8');

function setup() {
  const events = [];
  const store = new Map();
  const localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key,value) => store.set(key, value),
    removeItem: key => store.delete(key),
    key: index => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; }
  };
  const itemA = { identifier: 'a', href: 'a.html', title: 'SCO A' };
  const itemB = { identifier: 'b', href: 'b.html', title: 'SCO B' };
  let activeUrl = 'fixture://a.html';
  const listeners = new Set();
  const frame = {
    hidden: false,
    getAttribute: name => name === 'src' ? activeUrl : null,
    addEventListener: (name, fn) => { if (name === 'load') listeners.add(fn); },
    removeEventListener: (name, fn) => { if (name === 'load') listeners.delete(fn); },
    get src() { return activeUrl; },
    set src(url) {
      activeUrl = url;
      if (url === 'about:blank') {
        events.push('iframe:unload');
        // H5P-like handler: status read, final exit/time, Finish.
        events.push(['get', context.window.API.LMSGetValue('cmi.core.lesson_status'), context.window.API.LMSGetLastError()]);
        events.push(['exit', context.window.API.LMSSetValue('cmi.core.exit', 'suspend'), context.window.API.LMSGetLastError()]);
        events.push(['time', context.window.API.LMSSetValue('cmi.core.session_time', '0000:00:08.34'), context.window.API.LMSGetLastError()]);
        events.push(['finish', context.window.API.LMSFinish(''), context.window.API.LMSGetLastError()]);
        setTimeout(() => { for (const fn of [...listeners]) fn(); }, 0);
      } else events.push(['iframe:launch', url]);
    }
  };
  const els = {
    scoFrame: frame, emptyState: {hidden:true}, currentItemTitle: {textContent:''},
    prevBtn:{disabled:false}, nextBtn:{disabled:false}, reloadBtn:{disabled:false},
    resetSessionBtn:{disabled:false}, openWindowBtn:{disabled:false}, closeSessionBtn:{disabled:false}, resumeSessionBtn:{disabled:false,hidden:true}, pausedState:{hidden:true}, newAttemptBtn:{disabled:false},
    learnerId: {value:'user-test'}, learnerName:{value:'Test'}
  };
  const context = vm.createContext({
    window: {}, localStorage, Date, Promise, setTimeout, clearTimeout,
    packageState: {hash:'test',manifest: {standard:'SCORM 1.2',launchableItems:[itemA,itemB],metadata:{}},virtualRoot:'fixture://'},
    currentItem: itemA, currentIndex:0, els, attemptNumber:1, attemptCount:1,
    transitionQueue:Promise.resolve(), transitionSequence:0, scoClosing:false, sessionPaused:false, resumeAudit:null, activeLearnerId:'user-test', transitionBusy:false, packageLoading:false,
    latestData:{}, storageState:{}, logs:[], learnerViewed:false,
    runtimePackageKey: (id,attempt)=>`test:${id}:${attempt}`,
    renderLogs:()=>{}, renderMoodle:()=>{}, renderData:()=>{}, updateRuntimeLabel:()=>{}, updateOutlineActive:()=>{}, updateNavButtons:()=>{}, updateAttemptsControl:()=>{},
    launchObservation:0, resetContentDiagnostics:()=>{}, inspectCachedLaunch:()=>Promise.resolve(),
    getStoredSco: (id,n) => { const key=`scorm-reader:v1:test:${id}:${n}:SCORM 1.2:user-test`; const v=localStorage.getItem(key); return v?JSON.parse(v):null; },
    learnerKey:()=> 'user-test', confirm:()=>true,
    uninstallGlobalApi:()=>{ delete context.window.API; },
    installGlobalApi:instance=>{ context.window.API=instance.api; },
    launchUrl:href=>`fixture://${href}`,
    appendCacheBuster: url=>`${url}?force=1`,
    addSystemLog: message=> events.push(['system',message]),
    showToast:()=>{}, console
  });
  vm.runInContext(runtimeSource, context);
  context.ScormRuntime = context.window.ScormRuntime;
  const old = new context.ScormRuntime({standard:'SCORM 1.2',packageKey:'test:a:1',learnerId:'user-test',learnerName:'Test'});
  context.runtime = old;
  context.window.API = old.api;
  assert.equal(old.api.LMSInitialize(''), 'true');
  assert.equal(old.api.LMSSetValue('cmi.core.lesson_status','incomplete'), 'true');
  vm.runInContext(lifecycle, context);
  return {context,events,frame,old,localStorage,items:[itemA,itemB]};
}

test('rechargement : le SCO ferme la session sur son API valide avant création de la nouvelle API', async () => {
  const {context,events,old,items,localStorage} = setup();
  await context.launchItem(items[0], true);
  assert.deepEqual(events.filter(e=>Array.isArray(e)&&['get','exit','time','finish'].includes(e[0])), [
    ['get','incomplete','0'], ['exit','true','0'], ['time','true','0'], ['finish','true','0']
  ]);
  assert.equal(old.terminated,true);
  assert.ok(events.some(e=>Array.isArray(e)&&e[0]==='iframe:launch'), 'The next SCO must actually be launched');
  assert.notEqual(context.runtime,old);
  assert.equal(context.runtime.initialized,false);
  assert.equal(JSON.parse(localStorage.getItem(old.storageKey)).data['cmi.core.exit'],'suspend');
});

test('réinitialisation complète : l’effacement intervient après le LMSFinish et concerne tous les SCO et tentatives', async () => {
  const {context,events,old,items,localStorage} = setup();
  const key = (item, attempt) => `scorm-reader:v1:test:${item}:${attempt}:SCORM 1.2:user-test`;
  localStorage.setItem(key('a',2), JSON.stringify({data:{'cmi.core.lesson_status':'passed'},writtenKeys:['cmi.core.lesson_status']}));
  localStorage.setItem(key('b',1), JSON.stringify({data:{'cmi.core.lesson_status':'completed'},writtenKeys:['cmi.core.lesson_status']}));
  localStorage.setItem('scorm-reader:attempts:v1:test:user-test','3');
  localStorage.setItem('scorm-reader:v1:test:a:3:SCORM 1.2:another-user','keep');
  localStorage.setItem('scorm-studio:theme:v1','light');
  await context.resetAllProgress();
  assert.equal(events.find(e=>Array.isArray(e)&&e[0]==='finish')[1],'true');
  assert.equal(localStorage.getItem(key('a',2)),null);
  assert.equal(localStorage.getItem(key('b',1)),null);
  assert.equal(localStorage.getItem('scorm-reader:attempts:v1:test:user-test'),null);
  assert.equal(localStorage.getItem('scorm-reader:v1:test:a:3:SCORM 1.2:another-user'),'keep');
  assert.equal(localStorage.getItem('scorm-studio:theme:v1'),'light');
  assert.equal(context.attemptNumber,1);
  assert.equal(context.attemptCount,1);
  assert.equal(context.runtime.persisted,null);
  assert.equal(context.runtime.data['cmi.core.entry'],'ab-initio');
  assert.equal(context.runtime.data['cmi.core.lesson_status'],'not attempted');
  assert.ok(events.includes('iframe:unload'));
});

test('fermeture puis reprise : les valeurs validées sont retrouvées dans la même tentative', async () => {
  const {context,events,old,items,localStorage} = setup();
  assert.equal(old.api.LMSSetValue('cmi.suspend_data','stage-7'),'true');
  await context.closeActiveSession();
  assert.equal(context.sessionPaused,true);
  assert.equal(context.runtime,null);
  assert.equal(context.els.pausedState.hidden,false);
  assert.equal(old.terminated,true);
  assert.equal(JSON.parse(localStorage.getItem(old.storageKey)).data['cmi.suspend_data'],'stage-7');
  await context.resumeActiveSession();
  assert.equal(context.sessionPaused,false);
  assert.equal(context.els.pausedState.hidden,true);
  assert.notEqual(context.runtime,old);
  assert.equal(context.runtime.api.LMSInitialize(''),'true');
  assert.equal(context.runtime.api.LMSGetValue('cmi.suspend_data'),'stage-7');
  assert.equal(context.runtime.api.LMSGetValue('cmi.core.entry'),'resume');
  assert.equal(context.attemptNumber,1);
});

test('navigation multi-SCO : les dernières données du SCO sortant sont sauvegardées', async () => {
  const {context,old,items,localStorage} = setup();
  await context.launchItem(items[1]);
  assert.equal(context.currentItem.identifier,'b');
  assert.equal(context.runtime.packageKey,'test:b:1');
  assert.equal(JSON.parse(localStorage.getItem(old.storageKey)).data['cmi.core.session_time'],'0000:00:00.00');
  assert.equal(old.terminated,true);
});
