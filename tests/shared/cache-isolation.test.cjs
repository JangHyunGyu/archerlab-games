const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(kind) {
  const origin = 'https://game.archerlab.dev';
  const base = `${origin}/${kind}/sw.js`;
  const stores = new Map(), listeners = {}, deleted = [];
  let offline = false, brokenCache = false;
  const key = request => new URL(typeof request === 'string' ? request : request.url, base).href;
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    return {
      async put(request, response) { stores.get(name).set(key(request), response.clone()); },
      async match(request) { return stores.get(name).get(key(request))?.clone(); },
      async add() {}, async addAll() {},
    };
  };
  const scope = {
    URL, Response, Promise, location: { origin, href:base },
    registration: { scope:`${origin}/${kind}/` },
    clients:{ claim:async()=>{} }, skipWaiting:async()=>{}, importScripts(){},
    addEventListener(name, listener) { listeners[name] = listener; },
    fetch:async request => {
      if (offline) throw new TypeError('Failed to fetch');
      const url = key(request);
      return new Response(url.includes('index-en') ? 'English' : url.includes('index-ja') ? 'Japanese' : 'Korean');
    },
    caches:{
      keys:async()=>[...stores.keys()],
      delete:async name=>{ deleted.push(name); return stores.delete(name); },
      open:async name=>cache(name),
      match:async(request, options={})=>{
        if (brokenCache) throw new Error('Cache storage unavailable');
        for (const [name, store] of stores) {
          if (options.cacheName && options.cacheName !== name) continue;
          if (store.has(key(request))) return store.get(key(request)).clone();
        }
      },
    },
  };
  scope.self=scope;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../..',kind==='jewelria'?'jewelria/service-worker.js':'shared/service-worker-runtime.js'),'utf8'),scope);
  if (kind!=='jewelria') scope.ArcherGameServiceWorker.install({gameId:kind,version:'test'});
  async function dispatch(name, request) {
    const pending=[]; let response;
    listeners[name]({request,waitUntil:p=>pending.push(p),respondWith:p=>{response=p;}});
    const result=await response; await Promise.all(pending); return result;
  }
  return {cache,deleted,stores,offline:()=>{offline=true;},broken:()=>{brokenCache=true;},
    activate:()=>dispatch('activate'),
    request:(url, mode='navigate')=>dispatch('fetch',{method:'GET',mode,url:new URL(url,base).href}),
  };
}

for (const game of ['cat-tower','jewelria']) {
  test(`${game}: activation preserves every other game's offline cache`,async()=>{
    const w=worker(game);
    for (const name of ['archer-game-cat-tower-old','archer-game-water-sort-current','jewelria-old','unrelated-app']) w.cache(name);
    await w.activate();
    assert.deepEqual(w.deleted,[game==='jewelria'?'jewelria-old':'archer-game-cat-tower-old']);
  });
  test(`${game}: offline navigation preserves each visited language and clean URL alias`,async()=>{
    const w=worker(game);
    await w.request('./'); await w.request('./index-en'); await w.request('./index-ja.html');
    w.offline();
    assert.equal(await (await w.request('./index.html')).text(),'Korean');
    assert.equal(await (await w.request('./index-en.html?source=home')).text(),'English');
    assert.equal(await (await w.request('./index-ja')).text(),'Japanese');
  });
  test(`${game}: a different game's old shared asset never shadows the active cache`,async()=>{
    const w=worker(game);
    await w.cache('unrelated-old-cache').put('/shared/game-runtime.js',new Response('obsolete-runtime'));
    assert.notEqual(await (await w.request('/shared/game-runtime.js','cors')).text(),'obsolete-runtime');
  });
  test(`${game}: a cache read failure still allows a successful network asset`,async()=>{
    const w=worker(game); w.broken();
    assert.equal((await w.request('./main.js','cors')).status,200);
  });
}
