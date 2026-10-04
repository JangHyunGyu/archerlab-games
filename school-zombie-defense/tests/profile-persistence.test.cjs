'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const persistence = require('../js/persistence.js');
const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');

function localStorage(fail = false) {
  const values = new Map();
  return { values, getItem: key => values.get(key), removeItem: key => values.delete(key),
    setItem(key, value) { if (fail) throw Error('quota'); values.set(key, value); } };
}
function indexedStorage() {
  const values = new Map();
  const db = { transaction() {
    const transaction = { objectStore() { return {
      put(value, key) { values.set(key, structuredClone(value)); queueMicrotask(() => transaction.oncomplete()); },
      delete(key) { values.delete(key); queueMicrotask(() => transaction.oncomplete()); },
      get(key) { const request = {}; queueMicrotask(() => { request.result = structuredClone(values.get(key)); request.onsuccess(); }); return request; }
    }; } }; return transaction;
  } };
  return { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } };
}
function store(storage, databaseFactory) {
  return persistence.create({ getUpgradeIds: () => ['a_power'], maxLevel: 30,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    cacheKey: 'meta', legacySaveKey: 'old', profileAuthKey: 'auth', storage, databaseFactory });
}
function method(name, globals) {
  const start = source.search(new RegExp(`^    (?:async )?${name}\\(`, 'm'));
  const end = source.indexOf('\n    }', start) + 6;
  return vm.runInNewContext(`({${source.slice(start, end)}}).${name}`, globals);
}
function scene(store, fetch, extra = {}) {
  const s = { profileReady: false, profileSyncFailed: false, profileAuth: store.loadProfileAuth(),
    profilePromise: null, meta: { coins: 100, upgrades: {} }, ui: {}, fetchWithAbort: fetch,
    playSfx() {}, showToast() {} };
  const globals = { ...store, RANK_API_BASE: 'https://api', COLORS: { gold: 1, red: 2 }, SchoolI18n: { t: key => key }, ...extra };
  s.applyServerProfile = method('applyServerProfile', globals);
  s.ensureServerProfile = method('ensureServerProfile', globals);
  return s;
}
const auth = { profile_id: 'existing', profile_secret: 'secret' };
const response = revision => ({ success: true, profile_id: auth.profile_id, profile_revision: revision,
  profile: { coins: revision, upgrades: { a_power: 1 } } });

test('profile credentials survive quota failure and reload using IndexedDB', async () => {
  const local = localStorage(true), indexed = indexedStorage();
  assert.equal(await store(local, indexed).saveProfileAuth(auth), true);
  assert.deepEqual(await store(local, indexed).restoreProfileAuth(), auth);
});
test('profile backup restores the same wallet identity when its localStorage key is lost', async () => {
  const local = localStorage(), indexed = indexedStorage();
  await store(local, indexed).saveProfileAuth(auth); local.values.clear();
  const restored = store(local, indexed);
  assert.deepEqual(await restored.restoreProfileAuth(), auth);
  assert.deepEqual(restored.loadProfileAuth(), auth);
});
test('a damaged local secret cannot overwrite the valid backup; authenticated backup restores the same account', async () => {
  const local=localStorage(), indexed=indexedStorage(), p=store(local,indexed);
  await p.saveProfileAuth(auth);
  local.values.set('auth',JSON.stringify({...auth,profile_secret:'damaged'}));
  const requests=[];
  const s=scene(store(local,indexed),async (_,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    return body.profile_secret===auth.profile_secret ? new Response(JSON.stringify(response(155)))
      : new Response('{"error":"bad secret"}',{status:401});
  });
  await s.ensureServerProfile({force:true,allowOffline:false});
  assert.equal(s.meta.coins,155);assert.equal(requests.length,2);
  assert.deepEqual(p.loadProfileAuth(),auth);assert.deepEqual(await p.readProfileAuthBackup(),auth);
});
test('401 and 404 never erase credentials or create a replacement account', async () => {
  for (const status of [401, 404]) {
    const local = localStorage(), p = store(local); await p.saveProfileAuth(auth);
    const requests = [];
    const s = scene(p, async (_, options) => {
      requests.push(JSON.parse(options.body)); return new Response('{"error":"failed"}', { status });
    });
    await assert.rejects(s.ensureServerProfile({ force: true, allowOffline: false }), /failed/);
    await assert.rejects(s.ensureServerProfile({ force: true }), /failed/);
    assert.deepEqual(requests, [auth, auth]); assert.deepEqual(p.loadProfileAuth(), auth);
    assert.equal(s.meta.coins, 100);
  }
});
test('simultaneous forced profile loads share one request and account creation', async () => {
  const p = store(localStorage()); let release, requests = 0;
  const s = scene(p, async () => { requests++; return new Promise(resolve => { release = resolve; }); });
  const a = s.ensureServerProfile({ force: true }); const b = s.ensureServerProfile({ force: true });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  release(new Response(JSON.stringify({ ...response(100), profile_secret: 'secret' })));
  await Promise.all([a, b]); assert.equal(requests, 1); assert.equal(s.meta.coins, 100);
});
test('first-time tabs use a shared creation lock and keep one wallet identity', async () => {
  const local = localStorage(); let tail = Promise.resolve(), created = 0;
  const navigator = { locks: { request(_key, callback) { const result = tail.then(callback); tail = result.catch(() => {}); return result; } } };
  const fetch = async (_, options) => {
    if (!JSON.parse(options.body).profile_id) created++;
    return new Response(JSON.stringify({ ...response(100), profile_secret: auth.profile_secret }));
  };
  const a = scene(store(local), fetch, { navigator });
  const b = scene(store(local), fetch, { navigator });
  await Promise.all([a.ensureServerProfile({ force: true }), b.ensureServerProfile({ force: true })]);
  assert.equal(created, 1); assert.equal(JSON.stringify(a.profileAuth), JSON.stringify(b.profileAuth));
});
test('late profile receipts cannot overwrite newer earned or spent balances or change account', async () => {
  const p = store(localStorage()); await p.saveProfileAuth(auth);
  const s = scene(p); s.applyServerProfile(response(155)); s.applyServerProfile(response(100));
  assert.equal(s.meta.coins, 155);
  s.applyServerProfile(response(156)); assert.equal(s.meta.coins, 156);
  assert.throws(() => s.applyServerProfile({ ...response(999), profile_id: 'other' }), /another account/);
  assert.equal(s.meta.coins, 156);
});
test('first run cannot proceed offline without credentials or when no credential storage works', async () => {
  const offline = scene(store(localStorage()), async () => { throw Error('offline'); });
  await assert.rejects(offline.ensureServerProfile(), /offline/);
  const unsafe = scene(store(localStorage(true)), async () => new Response(JSON.stringify({ ...response(100), profile_secret: 'secret' })));
  await assert.rejects(unsafe.ensureServerProfile(), /could not be stored/);
  assert.notEqual(unsafe.profileReady, true);
});
test('failed final banking keeps run money and a retry screen; a finalized ledger cannot resume earning', async () => {
  const s = { mode: 'paused', coins: 55, ui: {}, unlockAudio() {}, playSfx() {}, setGameSpeed() {}, clearOverlay() {},
    bankRunCoins: async () => 0, resetRun: () => assert.fail('must retain final ledger'),
    showRewardRetryOverlay() { this.mode='gameover';this.retryVisible=true; } };
  const fn = method('returnToMenuFromRun', { DEFAULT_GAME_SPEED: 1, COLORS: {}, SchoolI18n: {} });
  await fn.call(s); assert.equal(s.coins, 55); assert.equal(s.mode, 'gameover'); assert.equal(s.retryVisible, true);
});
