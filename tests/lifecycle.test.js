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
    removeItem: key => store.delete(key)
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
    resetSessionBtn:{disabled:false}, openWindowBtn:{disabled:false}, newAttemptBtn:{disabled:false},
    learnerId: {value:'user-test'}, learnerName:{value:'Test'}
  };
  const context = vm.createContext({
    window: {}, localStorage, Date, Promise, setTimeout, clearTimeout,
    packageState: {hash:'test',manifest: {standard:'SCORM 1.2',launchableItems:[itemA,itemB],metadata:{}},virtualRoot:'fixture://'},
    currentItem: itemA, currentIndex:0, els, attemptNumber:1, attemptCount:1,
    transitionQueue:Promise.resolve(), transitionSequence:0, scoClosing:false, transitionBusy:false, packageLoading:false,
    latestData:{}, storageState:{}, logs:[], learnerViewed:false,
    runtimePackageKey: (id,attempt)=>`test:${id}:${attempt}`,
    renderLogs:()=>{}, renderMoodle:()=>{}, renderData:()=>{}, updateRuntimeLabel:()=>{}, updateOutlineActive:()=>{}, updateNavButtons:()=>{},
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
  assert.notEqual(context.runtime,old);
  assert.equal(context.runtime.initialized,false);
  assert.equal(JSON.parse(localStorage.getItem(old.storageKey)).data['cmi.core.exit'],'suspend');
});

test('réinitialisation : l’effacement a lieu après le LMSFinish émis par le SCO', async () => {
  const {context,events,old,items,localStorage} = setup();
  await context.launchItem(items[0], true, true);
  assert.equal(events.find(e=>Array.isArray(e)&&e[0]==='finish')[1],'true');
  assert.equal(localStorage.getItem(old.storageKey),null);
  assert.equal(context.runtime.savedData,null);
  const unload = events.indexOf('iframe:unload');
  const clear = events.findIndex(e=>Array.isArray(e)&&e[0]==='system'&&e[1].includes('effacées'));
  assert.ok(unload > -1 && clear > unload);
});

test('navigation multi-SCO : les dernières données du SCO sortant sont sauvegardées', async () => {
  const {context,old,items,localStorage} = setup();
  await context.launchItem(items[1]);
  assert.equal(context.currentItem.identifier,'b');
  assert.equal(context.runtime.packageKey,'test:b:1');
  assert.equal(JSON.parse(localStorage.getItem(old.storageKey)).data['cmi.core.session_time'],'0000:00:00.00');
  assert.equal(old.terminated,true);
});
