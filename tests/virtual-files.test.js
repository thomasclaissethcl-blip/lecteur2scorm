'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../sw.js'),'utf8');

function harness() {
  const handlers = {};
  const messages = [];
  const db = new Map();
  const cache = {
    match: async key => db.get(typeof key === 'string' ? key : key.url)?.clone(),
    put: async (key, response) => db.set(key, response)
  };
  const scope = {
    self: {location: {origin:'https://example.github.io'}, addEventListener: (name,fn) => handlers[name]=fn,
      skipWaiting:()=>{},clients:{claim:()=>Promise.resolve(),matchAll:async()=>[{postMessage:msg=>messages.push(msg)}]}},
    caches: {open:async()=>cache}, URL, Headers, Response, Promise, console
  };
  vm.runInNewContext(code,scope);
  const fetch = async (url, opts={}) => {
    let result;
    const request = new Request(url, opts);
    handlers.fetch({request,respondWith:value=>result=Promise.resolve(value)});
    if (!result) return null;
    return result;
  };
  return {db,cache,fetch,messages};
}
const base='https://example.github.io/reader/__scorm__/hash/';

test('Le Service Worker livre un fichier virtuel, même avec query string',async()=>{
  const {cache,fetch}=harness();
  await cache.put(base+'script.js',new Response('console.log("yes")',{headers:{'Content-Type':'text/javascript'}}));
  const result=await fetch(base+'script.js?cacheBust=333');
  assert.equal(result.status,200);
  assert.equal(await result.text(),'console.log("yes")');
});

test('Une ressource manquante génère un diagnostic sans brouiller les erreurs LMS',async()=>{
  const {fetch,messages}=harness();
  const result=await fetch(base+'missing.css');
  assert.equal(result.status,404);
  assert.equal(messages.length,1);
  assert.equal(messages[0].kind,'missing');
  assert.equal(messages[0].source,'scorm-studio-virtual-files');
  assert.match(messages[0].url,/missing\.css/);
});

test('Réponses HTTP partielles pour les contenus multimédias, y compris Range suffixe',async()=>{
  const {cache,fetch}=harness();
  await cache.put(base+'video.mp4',new Response(new TextEncoder().encode('abcdefghij'),{headers:{'Content-Type':'video/mp4'}}));
  const part=await fetch(base+'video.mp4',{headers:{Range:'bytes=3-6'}});
  assert.equal(part.status,206);
  assert.equal(part.headers.get('content-range'),'bytes 3-6/10');
  assert.equal(part.headers.get('content-length'),'4');
  assert.equal(await part.text(),'defg');
  const suffix=await fetch(base+'video.mp4',{headers:{Range:'bytes=-3'}});
  assert.equal(suffix.status,206);
  assert.equal(await suffix.text(),'hij');
  const invalid=await fetch(base+'video.mp4',{headers:{Range:'bytes=33-'}});
  assert.equal(invalid.status,416);
});

test('Un HEAD virtuel renvoie les en-têtes sans contenu',async()=>{
  const {cache,fetch}=harness();
  await cache.put(base+'index.html',new Response('<h1>Hi</h1>',{headers:{'Content-Type':'text/html'}}));
  const result=await fetch(base+'index.html',{method:'HEAD'});
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'text/html');
  assert.equal(await result.text(),'');
});
