const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'shared/service-worker-runtime.js'), 'utf8');
const listeners = {};
const waiters = [];
const cacheWrites = [];
let openCache;
let cloneCount = 0;

const cachedResponse = { source: 'cache' };
const responseCopy = { source: 'network-copy' };
const networkResponse = {
  ok: true,
  clone() {
    cloneCount += 1;
    return responseCopy;
  }
};

const scope = {
  location: { origin: 'https://game.archerlab.dev' },
  clients: { claim: async () => {} },
  skipWaiting: async () => {},
  addEventListener(name, listener) {
    listeners[name] = listener;
  }
};
scope.self = scope;
scope.URL = URL;
scope.Promise = Promise;
scope.Response = Response;
scope.fetch = async () => networkResponse;
scope.caches = {
  keys: async () => [],
  delete: async () => true,
  match: async () => cachedResponse,
  open: () => new Promise((resolve) => {
    openCache = () => resolve({
      put: async (request, response) => cacheWrites.push({ request, response })
    });
  })
};

vm.runInNewContext(source, scope, { filename: 'service-worker-runtime.js' });
scope.ArcherGameServiceWorker.install({ gameId: 'parking-escape', version: 'test' });

const event = {
  request: {
    method: 'GET',
    mode: 'cors',
    url: 'https://game.archerlab.dev/parking-escape/js/main.js'
  },
  respondWith(promise) {
    this.response = promise;
  },
  waitUntil(promise) {
    waiters.push(promise);
  }
};

(async () => {
  listeners.fetch(event);
  assert.equal(await event.response, cachedResponse, 'a cached response should be served immediately');
  assert.equal(cloneCount, 1, 'the network response must be cloned before caches.open resolves');
  assert.equal(waiters.length, 1, 'background cache writes must extend the fetch event lifetime');

  openCache();
  await Promise.all(waiters);
  assert.equal(cacheWrites.length, 1);
  assert.equal(cacheWrites[0].request, event.request);
  assert.equal(cacheWrites[0].response, responseCopy);

  const consumers = [
    'blockpang',
    'cat-tower',
    'jelly-pang-2048',
    'lumen-shift',
    'parking-escape',
    'school-zombie-defense',
    'slimevolley',
    'solo-leveling'
  ];
  for (const game of consumers) {
    const worker = fs.readFileSync(path.join(root, game, 'sw.js'), 'utf8');
    assert.match(worker, /service-worker-runtime\.js\?v=20261008-runtime-v4/);
  }

  const failedScope = {
    location: { origin: 'https://game.archerlab.dev' },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    URL,
    Promise,
    Response,
    fetch: async () => { throw new Error('Failed to fetch'); },
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
      open: async () => ({ put: async () => {}, addAll: async () => {} })
    },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    listeners: {}
  };
  failedScope.self = failedScope;
  vm.runInNewContext(source, failedScope, { filename: 'service-worker-runtime.js' });
  failedScope.ArcherGameServiceWorker.install({ gameId: 'jelly-pang-2048', version: 'test' });
  const failedWaiters = [];
  const failedEvent = {
    request: { method: 'GET', mode: 'cors', url: 'https://game.archerlab.dev/jelly-pang-2048/app.js' },
    respondWith(promise) { this.response = promise; },
    waitUntil(promise) { failedWaiters.push(promise); }
  };
  failedScope.listeners.fetch(failedEvent);
  const unavailable = await failedEvent.response;
  await Promise.all(failedWaiters);
  assert.equal(unavailable.status, 503, 'an uncached network failure must resolve to a response');

  const jewelriaWorker = fs.readFileSync(path.join(root, 'jewelria/service-worker.js'), 'utf8');
  assert.match(jewelriaWorker, /const copy = response\.clone\(\);\s*cacheWrite = caches\.open/);
  assert.match(jewelriaWorker, /event\.waitUntil\(\s*result/);
  assert.doesNotMatch(
    jewelriaWorker,
    /caches\.open\([^)]*\)\.then\([\s\S]{0,200}?response\.clone\(\)/,
    'Jewelria must not defer cloning until after asynchronous cache access'
  );

  const legacyAuth = {
    request: { method: 'GET', url: 'https://game.archerlab.dev/_account/widget.js' },
    respondWith() { throw new Error('Legacy auth must bypass game caches'); },
    waitUntil() { throw new Error('Legacy auth must not be cached'); }
  };
  listeners.fetch(legacyAuth);

  const jewelListeners = {};
  const freshHtml = new Response('<head><script src="../assets/js/archerlab-session.js"></script></head>');
  const staleHtml = new Response('<head><script src="/_account/widget.js"></script></head>');
  const jewelWaiters = [];
  const jewelScope = {
    location: { origin: 'https://game.archerlab.dev' }, importScripts() {}, URL, Promise, Response,
    addEventListener(name, listener) { jewelListeners[name] = listener; },
    fetch: async () => freshHtml,
    caches: { match: async () => staleHtml, open: async () => ({ put: async () => {} }) }
  };
  jewelScope.self = jewelScope;
  vm.runInNewContext(jewelriaWorker, jewelScope);
  jewelListeners.fetch(legacyAuth);
  const navigation = {
    request: { method: 'GET', mode: 'navigate', destination: 'document', url: 'https://game.archerlab.dev/jewelria/' },
    respondWith(promise) { this.response = promise; },
    waitUntil(promise) { jewelWaiters.push(promise); }
  };
  jewelListeners.fetch(navigation);
  assert.equal(await navigation.response, freshHtml, 'a previously installed game must receive the new document rather than cached account controls');
  await Promise.all(jewelWaiters);
  jewelScope.fetch = async () => { throw new Error('Offline'); };
  jewelListeners.fetch(navigation);
  assert.equal(await navigation.response, staleHtml, 'offline play retains the previous game document');

  console.log('shared service worker response cloning and cache lifetime verified');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
