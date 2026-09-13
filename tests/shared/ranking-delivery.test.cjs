const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { server, d1, storage } = require('../helpers/ranking-delivery.cjs');
const source = fs.readFileSync(path.join(__dirname, '../../shared/ranking-delivery.js'), 'utf8');
const API = 'https://game-api.yama5993.workers.dev';
const turn = () => new Promise(resolve => setImmediate(resolve));

function browserStorage(fail = false) {
  const values = new Map();
  return {
    get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (fail) throw new Error('quota'); values.set(key, String(value)); },
    removeItem: key => values.delete(key),
  };
}
function indexedStorage() {
  const values = new Map();
  const db = { createObjectStore() {}, transaction() {
    const transaction = { objectStore() { return {
      put(entry) { values.set(entry.id, structuredClone(entry)); queueMicrotask(() => transaction.oncomplete?.()); },
      delete(id) { values.delete(id); queueMicrotask(() => transaction.oncomplete?.()); },
      getAll() { const request = {}; queueMicrotask(() => { request.result = [...values.values()].map(value => structuredClone(value)); request.onsuccess?.(); }); return request; },
    }; } };
    return transaction;
  } };
  return { values, open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess?.(); }); return request; } };
}
function environment() {
  const db = d1(); const mailboxes = new Map();
  const env = { DB: db, RANKING_DELIVERY: { getByName(id) {
    if (!mailboxes.has(id)) mailboxes.set(id, new server.RankingDelivery({ storage: storage() }, { DB: db }));
    return mailboxes.get(id);
  } } };
  const network = { offline: false, loseResponse: false, requests: [], async fetch(url, options) {
    if (network.offline) throw new TypeError('offline');
    network.requests.push({ url, options });
    const response = await server.deliveryWorker.fetch(new Request(url, options), env);
    if (network.loseResponse) { network.loseResponse = false; throw new TypeError('response lost'); }
    return response;
  } };
  return { db, mailboxes, network };
}
function client(network, local = browserStorage(), indexedDB) {
  const timers = new Map(); let next = 0;
  const listeners = {};
  const context = { fetch: network.fetch.bind(network), localStorage: local, indexedDB,
    crypto, Request, Response, URL, AbortController, DOMException, console,
    navigator: { onLine: true }, location: { href: 'https://game.archerlab.dev/lumen-shift/' },
    setTimeout(callback, delay) { const id = ++next; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { listeners[name] = callback; },
  };
  context.window = context; context.globalThis = context;
  vm.runInNewContext(source, context);
  return { window: context, ranking: context.ArcherRanking, local, listeners };
}
async function start(c) {
  const promise = c.window.fetch(API + '/score-sessions', {
    method: 'POST', body: JSON.stringify({ game_id: 'lumen-shift' }),
  });
  await c.ranking.flush();
  return (await (await promise).json()).session_id;
}
const event = () => ({ type: 'clear', lines: 1, level: 1, combo: 1, delta: 100 });

test('client persists an event before flush; reload replays the full run and final nickname', async () => {
  const e = environment(); const c = client(e.network); const session = await start(c);
  e.network.offline = true;
  c.ranking.track('lumen-shift', event(), session);
  const result = await c.ranking.submit({ game_id: 'lumen-shift', session_id: session, player_name: 'Offline run', score: 100 });
  assert.equal(result.pending, true); assert.equal(result.accepted, false);
  assert.equal(c.local.length, 2);
  const reopened = client(e.network, c.local); await turn();
  e.network.offline = false; await reopened.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT score FROM rankings').get().score, 100);
  assert.equal(e.db.sql.prepare('SELECT player_name FROM rankings').get().player_name, 'Offline run');
  assert.equal(c.local.length, 0);
});

test('IndexedDB preserves an offline run when localStorage is full', async () => {
  const e = environment(); const indexed = indexedStorage(); const local = browserStorage(true);
  const c = client(e.network, local, indexed); const session = await start(c);
  e.network.offline = true;
  c.ranking.track('lumen-shift', event(), session);
  const result = await c.ranking.submit({ game_id: 'lumen-shift', session_id: session, player_name: 'IndexedDB run', score: 100 });
  assert.equal(result.pending, true); assert.equal(indexed.values.size, 2);
  const reopened = client(e.network, local, indexed); await turn();
  e.network.offline = false; await reopened.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT score FROM rankings').get().score, 100);
  assert.equal(indexed.values.size, 0);
});

test('no storage plus no network must not claim a record was saved', async () => {
  const e = environment(); const c = client(e.network, browserStorage(true)); const session = await start(c);
  e.network.offline = true;
  c.ranking.track('lumen-shift', event(), session);
  await assert.rejects(c.ranking.submit({ game_id: 'lumen-shift', session_id: session, player_name: 'Unsaved', score: 100 }), /보관하지 못했습니다/);
  assert.equal(c.ranking.pending().length, 2, 'memory retains the run for another attempt');
});

test('response lost after server commit: client retry does not double additive events', async () => {
  const e = environment(); const c = client(e.network); const session = await start(c);
  c.ranking.track('lumen-shift', event(), session);
  e.network.loseResponse = true; await c.ranking.flush();
  assert.equal(c.ranking.pending().length, 1);
  await c.ranking.flush();
  assert.equal(c.ranking.pending().length, 0);
  assert.equal(e.db.sql.prepare('SELECT score, event_count FROM ranking_sessions').get().event_count, 1);
});

test('two tabs keep separate journals and both offline submissions survive', async () => {
  const e = environment(); const local = browserStorage(); const a = client(e.network, local); const b = client(e.network, local);
  const first = await start(a); const second = await start(b); e.network.offline = true;
  for (const [c, session, name] of [[a, first, 'Tab A'], [b, second, 'Tab B']]) {
    c.ranking.track('lumen-shift', event(), session);
    await c.ranking.submit({ game_id: 'lumen-shift', session_id: session, player_name: name, score: 100 });
  }
  assert.equal(local.length, 4);
  const reopened = client(e.network, local); await turn(); e.network.offline = false; await reopened.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 2);
});

test('aborting the UI wait does not cancel or remove delivery of a recorded event', async () => {
  const e = environment(); const c = client(e.network); const session = await start(c); e.network.offline = true;
  const controller = new AbortController();
  const waiting = c.window.fetch(API + '/score-events', { method: 'POST', signal: controller.signal,
    body: JSON.stringify({ game_id: 'lumen-shift', session_id: session, event: event() }) });
  controller.abort(); await assert.rejects(waiting, { name: 'AbortError' });
  assert.equal(c.local.length, 1); e.network.offline = false; await c.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT score FROM ranking_sessions').get().score, 100);
});

test('all game entry points load recovery before their game code', () => {
  const root = path.resolve(__dirname, '../..');
  const { games } = JSON.parse(fs.readFileSync(path.join(root, 'config/games.json')));
  for (const game of games) {
    const html = fs.readFileSync(path.join(root, game.entry), 'utf8');
    assert.ok(html.indexOf('shared/ranking-delivery.js') > 0, game.id);
    assert.ok(html.indexOf('shared/ranking-delivery.js') < html.indexOf('</head>'), game.id);
  }
});
