'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const swSource = fs.readFileSync(path.join(__dirname,'../sw-v6.js'),'utf8');
function setup(){
  const callbacks={};
  const entries=new Map();
  const cache={match:async key=>entries.get(typeof key==='string'?key:key.url)?.clone()||undefined,
    put:async (key,value)=>entries.set(key,value.clone())};
  const messages=[];
  const context={self:{location:{origin:'https://example.github.io'},addEventListener:(n,fn)=>callbacks[n]=fn,
    skipWaiting:()=>{},clients:{claim:async()=>{},matchAll:async()=>[{postMessage:m=>messages.push(m)}]}},
    caches:{open:async()=>cache},URL,Headers,Response,console,Promise};
  vm.runInNewContext(swSource,context);
  const base='https://example.github.io/lecteur2scorm/__scorm__/example/';
  const fetch=async(p,options={})=>{
    let response;
    callbacks.fetch({request:new Request(base+p,options),respondWith:x=>response=Promise.resolve(x)});
    return response;
  };
  return {base,cache,fetch,context,messages};
}
test('Le bridge H5PStandalone est servi en mode div sans modifier le cache',async()=>{
  const {base,cache,fetch}=setup();
  const original="async function boot(){const options={frame:false}; await new H5PStandalone.H5P(container,options);}";
  await cache.put(base+'scorm/h5p-scorm-bridge.js',new Response(original,{headers:{'Content-Type':'text/javascript'}}));
  const response=await fetch('scorm/h5p-scorm-bridge.js');
  const text=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-scorm-studio-compat'),'h5p-inline');
  assert.match(text,/embedType:"div"/);
  assert.ok(!text.includes('H5P(container,options)'));
  assert.doesNotThrow(()=>new Function('var container; var H5PStandalone; '+text));
  assert.equal(await (await cache.match(base+'scorm/h5p-scorm-bridge.js')).text(),original);
});
test('Les autres scripts et ressources H5P sont fournis sans changement',async()=>{
  const {base,cache,fetch}=setup();
  const script='window.loaded = true;';
  await cache.put(base+'player/frame.bundle.js',new Response(script,{headers:{'Content-Type':'text/javascript'}}));
  await cache.put(base+'h5p/H5P.GameMap-1.9/dist/h5p-game-map.js',new Response(script,{headers:{'Content-Type':'text/javascript'}}));
  await cache.put(base+'normal.js',new Response(script,{headers:{'Content-Type':'text/javascript'}}));
  assert.equal(await (await fetch('player/frame.bundle.js')).text(),script);
  assert.equal(await (await fetch('h5p/H5P.GameMap-1.9/dist/h5p-game-map.js')).text(),script);
  assert.equal(await (await fetch('normal.js')).text(),script);
});
test('Le mode déjà spécifié est respecté, aucun remaniement inutile',async()=>{
  const {base,cache,fetch}=setup();
  const original="const options={embedType:'div'};new H5PStandalone.H5P(container,options);";
  await cache.put(base+'scorm/h5p-scorm-bridge.js',new Response(original,{headers:{'Content-Type':'text/javascript'}}));
  const response=await fetch('scorm/h5p-scorm-bridge.js');
  assert.equal(await response.text(),original);
  assert.equal(response.headers.get('x-scorm-studio-compat'),null);
});
test('Les ressources H5P manquantes déclenchent une erreur explicite',async()=>{
  const {fetch,messages}=setup();
  const response=await fetch('h5p/unknown.css');
  assert.equal(response.status,404);
  assert.equal(messages.length,1);
  assert.equal(messages[0].kind,'missing');
});
test('La nouvelle version enregistre bien sw-v6.js et maintient le diagnostic',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  assert.match(app,/new URL\('sw-v6\.js'/);
  assert.match(app,/h5pInlineCompat/);
  assert.match(app,/Iframe interne about:blank/);
});
