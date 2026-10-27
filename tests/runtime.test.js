'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require('node:path').join(__dirname, '../scorm-runtime.js'),'utf8');
function create(standard='SCORM 1.2') {
  const mem = new Map();
  const localStorage = {getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
  const context = {window:{},localStorage,setTimeout,Date};
  vm.runInNewContext(code,context);
  const entries=[];
  let lastState;
  const opts={standard,packageKey:'test:a',learnerId:'u1',learnerName:'Test',onLog:e=>entries.push(e),onChange:(_,state)=>lastState=state};
  return {runtime:new context.window.ScormRuntime(opts), entries, localStorage, mem, state:()=>lastState, opts, Runtime:context.window.ScormRuntime};
}
test('SetValue n’est pas persisté avant Commit et son appel est journalisé',()=>{
  const {runtime,entries,localStorage,state} = create();
  assert.equal(runtime.api.LMSInitialize(''),'true');
  assert.equal(runtime.api.LMSSetValue('cmi.core.score.raw','81'),'true');
  assert.equal(localStorage.getItem(runtime.storageKey),null);
  assert.equal(state().dirtyKeys.includes('cmi.core.score.raw'),true);
  assert.equal(entries.some(e=>e.method==='LMSSetValue'),true);
  assert.equal(runtime.api.LMSCommit(''),'true');
  assert.equal(JSON.parse(localStorage.getItem(runtime.storageKey)).data['cmi.core.score.raw'],'81');
  assert.equal(state().dirtyKeys.length,0);
});
test('Finish persiste le dernier changement et ferme la session',()=>{
  const {runtime,localStorage}=create();
  runtime.api.LMSInitialize('');runtime.api.LMSSetValue('cmi.core.lesson_status','completed');
  assert.equal(runtime.api.LMSFinish(''),'true');
  assert.equal(runtime.terminated,true);
  assert.equal(JSON.parse(localStorage.getItem(runtime.storageKey)).data['cmi.core.lesson_status'],'completed');
});
test('SCORM 2004 renvoie des erreurs et valide les écritures',()=>{
  const {runtime,state} = create('SCORM 2004');
  assert.equal(runtime.api.SetValue('cmi.score.raw','70'),'false');
  assert.equal(runtime.api.GetLastError(),'132');
  assert.equal(runtime.api.Initialize(''),'true');
  assert.equal(runtime.api.SetValue('cmi.score.raw','70'),'true');
  assert.equal(state().dirtyKeys.length,1);
  assert.equal(runtime.api.Commit(''),'true');
  assert.equal(state().dirtyKeys.length,0);
});
test('forceSet marque une injection manuelle sans validation implicite',()=>{
  const {runtime,entries,localStorage}=create();
  runtime.forceSet('cmi.core.lesson_status','passed');
  assert.equal(localStorage.getItem(runtime.storageKey),null);
  assert.equal(entries.at(-1).method,'SIM:modifier');
});
test('SCORM 1.2 : entrée resume uniquement si la précédente sortie demande suspend',()=>{
  const {runtime,mem,opts,Runtime}=create();
  runtime.api.LMSInitialize('');
  runtime.api.LMSSetValue('cmi.core.lesson_status','incomplete');
  runtime.api.LMSSetValue('cmi.suspend_data','question-4');
  runtime.api.LMSSetValue('cmi.core.lesson_location','page-4');
  runtime.api.LMSSetValue('cmi.core.exit','suspend');
  runtime.api.LMSFinish('');
  const resumed=new Runtime(opts);
  assert.equal(resumed.data['cmi.core.entry'],'resume');
  assert.equal(resumed.data['cmi.suspend_data'],'question-4');
  assert.equal(resumed.data['cmi.core.lesson_location'],'page-4');
  resumed.api.LMSInitialize('');
  resumed.api.LMSSetValue('cmi.core.exit','');
  resumed.api.LMSFinish('');
  const later=new Runtime(opts);
  assert.equal(later.data['cmi.core.entry'],'ab-initio');
});
test('SCORM 2004 : l’indicateur de reprise dépend de cmi.exit suspend',()=>{
  const {runtime,opts,Runtime}=create('SCORM 2004');
  runtime.api.Initialize('');
  runtime.api.SetValue('cmi.exit','suspend');
  runtime.api.SetValue('cmi.location','step-8');
  runtime.api.Terminate('');
  const resumed=new Runtime(opts);
  assert.equal(resumed.data['cmi.entry'],'resume');
  assert.equal(resumed.data['cmi.location'],'step-8');
});
