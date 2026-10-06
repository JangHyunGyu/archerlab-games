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
function indexedStorage(delayReads = false) {
  const values = new Map();
  const reads = [];
  const db = { createObjectStore() {}, transaction() {
    const transaction = { objectStore() { return {
      put(entry) { values.set(entry.id, structuredClone(entry)); queueMicrotask(() => transaction.oncomplete?.()); },
      delete(id) { values.delete(id); queueMicrotask(() => transaction.oncomplete?.()); },
      getAll() { const request = {}; const finish = () => { request.result = [...values.values()].map(value => structuredClone(value)); request.onsuccess?.(); }; if (delayReads) reads.push(finish); else queueMicrotask(finish); return request; },
    }; } };
    return transaction;
  } };
  return { values, releaseReads() { delayReads=false;reads.splice(0).forEach(finish=>finish()); }, open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess?.(); }); return request; } };
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
function client(network, local = browserStorage(), indexedDB, sessionStorage) {
  const timers = new Map(); let next = 0;
  const listeners = {};
  const context = { fetch: network.fetch.bind(network), localStorage: local, indexedDB, sessionStorage,
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

test('online submission drains more than one envelope without returning a queued result', async () => {
  const e=environment(); const c=client(e.network); const session=await start(c);
  e.db.sql.exec('UPDATE ranking_sessions SET started_at = started_at - 600000');
  for(let i=0;i<45;i++) c.ranking.track('lumen-shift', event(), session);
  const result=await c.ranking.submit({game_id:'lumen-shift',session_id:session,player_name:'Long run',score:4500});
  assert.equal(result.success,true); assert.equal(result.pending,undefined);
  assert.equal(c.ranking.pending().length,0);
  assert.equal(e.db.sql.prepare('SELECT score FROM rankings').get().score,4500);
});

test('submission arriving during an in-flight score batch is confirmed in the same wait', async () => {
  const e=environment();const c=client(e.network);const session=await start(c);
  c.ranking.track('lumen-shift',event(),session);
  const flushing=c.ranking.flush();
  const result=await c.ranking.submit({game_id:'lumen-shift',session_id:session,player_name:'Concurrent submit',score:100});
  await flushing; assert.equal(result.success,true); assert.equal(c.ranking.pending().length,0);
});

async function zombieWallet(e,c) {
  const profile=await (await e.network.fetch(API+'/school-zombie/profile',{method:'POST',body:'{}'})).json();
  const auth={profile_id:profile.profile_id,profile_secret:profile.profile_secret};
  const waiting=c.window.fetch(API+'/score-sessions',{method:'POST',body:JSON.stringify({game_id:'school-zombie-defense',...auth})});
  await c.ranking.flush();const session_id=(await (await waiting).json()).session_id;
  e.db.sql.exec('UPDATE school_zombie_profiles SET coins=100');
  return {game_id:'school-zombie-defense',session_id,...auth,event:{type:'run_progress',run_coins:0,reward_counts:{1:5,2:0,3:0,4:0},reroll_levels:[2],kills:5,level:2,reached_stage:1,survived_seconds:300}};
}

test('reward client: offline final net snapshot survives reset, reload and missing ranking submission',async()=>{
  const e=environment();const c=client(e.network);const body=await zombieWallet(e,c);
  body.event.run_coins=4;body.event.reward_counts[1]=9;body.event.kills=9;
  e.network.offline=true;const result=await c.ranking.bankRun(body);
  assert.equal(result.pending,true);assert.equal(c.local.length,1);
  body.event.run_coins=0;body.event.kills=0; // A new run cannot overwrite the stored final snapshot.
  const reopened=client(e.network,c.local);await turn();e.network.offline=false;await reopened.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,104);
  assert.equal(c.local.length,0);assert.equal(e.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n,0);
});

test('reward client: server retains an outage claim and completes it after browser closure',async()=>{
  const e=environment();const c=client(e.network);const body=await zombieWallet(e,c);
  body.event.run_coins=4;body.event.reward_counts[1]=9;body.event.kills=9;
  e.db.offline=true;assert.equal((await c.ranking.bankRun(body)).accepted,true);
  e.db.offline=false;
  for(const box of e.mailboxes.values()){box.ctx.storage.sql.exec("UPDATE jobs SET next_at=0 WHERE state='pending'");await box.alarm();}
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,104);
});

test('reward client: lost acknowledgement retries one net credit; zero remaining coins still settle',async()=>{
  for(const remainder of [0,4]) {
    const e=environment();const c=client(e.network);const body=await zombieWallet(e,c);
    body.event.run_coins=remainder;body.event.reward_counts[1]=5+remainder;body.event.kills=5+remainder;
    e.network.loseResponse=true;assert.equal((await c.ranking.bankRun(body)).pending,true);
    await c.ranking.flush();assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,100+remainder);
    assert.equal(c.ranking.pending().length,0);
  }
});

test('reward client: IndexedDB retains coins when localStorage is full',async()=>{
  const e=environment();const indexed=indexedStorage();const c=client(e.network,browserStorage(true),indexed);const body=await zombieWallet(e,c);
  body.event.run_coins=4;body.event.reward_counts[1]=9;body.event.kills=9;
  e.network.offline=true;assert.equal((await c.ranking.bankRun(body)).pending,true);
  const reopened=client(e.network,browserStorage(true),indexed);await turn();e.network.offline=false;await reopened.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,104);
});

test('reward client: no network and no storage cannot report a safely retained reward',async()=>{
  const e=environment();const c=client(e.network,browserStorage(true));const body=await zombieWallet(e,c);
  e.network.offline=true;await assert.rejects(c.ranking.bankRun(body));
  assert.equal(e.db.sql.prepare('SELECT COUNT(*) AS n FROM school_zombie_coin_claims').get().n,0);
});

test('reward checkpoint: draft never pays an active run, and a different tab cannot finalize it', async () => {
  const e=environment(), local=browserStorage(), indexed=indexedStorage(), tab=browserStorage();
  const c=client(e.network,local,indexed,tab), body=await zombieWallet(e,c);
  body.event.run_coins=4;body.event.kills=9;body.event.reward_counts[1]=9;
  await c.ranking.checkpointRun(body);await c.ranking.flush();
  assert.equal(c.ranking.pending().length,0);
  const other=client(e.network,local,indexed,browserStorage());await turn();await other.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,100);
  const reloaded=client(e.network,local,indexed,tab);await turn();await reloaded.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,104);
});

test('reward checkpoint: the latest net ledger survives abrupt reload with full localStorage', async () => {
  const e=environment(), indexed=indexedStorage(), tab=browserStorage(), local=browserStorage(true);
  const c=client(e.network,local,indexed,tab), body=await zombieWallet(e,c);
  await c.ranking.checkpointRun(body);
  body.event.run_coins=4;body.event.kills=9;body.event.reward_counts[1]=9;
  await c.ranking.checkpointRun(body);
  e.network.offline=true;
  const reloaded=client(e.network,local,indexed,tab);await turn();
  assert.equal(reloaded.ranking.pending().find(entry=>entry.path.endsWith('/bank-run')).body.event.run_coins,4);
  e.network.offline=false;await reloaded.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,104);
  await reloaded.ranking.bankRun(body);
  assert.equal(e.db.sql.prepare('SELECT COUNT(*) AS n FROM school_zombie_coin_claims').get().n,1);
});

test('reward checkpoint: promotion cannot create a self dependency or hold up later stage events', async () => {
  const e=environment(), c=client(e.network,browserStorage(),indexedStorage(),browserStorage());
  const body=await zombieWallet(e,c);
  body.event={type:'run_progress',run_coins:55,reward_counts:{1:50,2:10,3:0,4:0},reroll_levels:[2,3],kills:60,level:5,reached_stage:2};
  await c.ranking.checkpointRun(body);
  c.ranking.track('school-zombie-defense',{type:'stage_clear',cleared_stage:1,reached_stage:2,level:5,kills:60},body.session_id,body);
  await c.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT score FROM ranking_sessions').get().score,1);
  await c.ranking.bankRun(body);
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,155);
});

test('reward checkpoint: delayed startup restore cannot finalize this page newly started active run', async () => {
  const e=environment(), indexed=indexedStorage(true), local=browserStorage(), tab=browserStorage();
  const c=client(e.network,local,indexed,tab), body=await zombieWallet(e,c);
  body.event.run_coins=4;body.event.kills=9;body.event.reward_counts[1]=9;
  await c.ranking.checkpointRun(body);indexed.releaseReads();await turn();await c.ranking.flush();
  assert.equal(c.ranking.pending().length,0);
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,100);
  const reloaded=client(e.network,local,indexed,tab);await turn();await reloaded.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,104);
});

test('reward checkpoint: draft is exposed only after lease acquisition; copied tabs cannot claim a live draft', async () => {
  const e=environment(), local=browserStorage(), indexed=indexedStorage(), tab=browserStorage();
  const c=client(e.network,local,indexed,tab), body=await zombieWallet(e,c);
  body.event.run_coins=4;body.event.kills=9;body.event.reward_counts[1]=9;
  let grant, held=false;
  const locks={request(name,options,callback) {
    if(typeof options==='function') return new Promise(resolve=>{grant=()=>{held=true;Promise.resolve(options({name})).then(()=>{held=false;resolve();});};});
    return Promise.resolve(callback(held?null:{name}));
  }};
  c.window.navigator.locks=locks;
  const checkpoint=c.ranking.checkpointRun(body);await turn();
  assert.equal(indexed.values.has('bank_'+body.session_id),false);
  assert.equal(Array.from({length:local.length},(_,index)=>local.key(index)).some(key=>key.endsWith('bank_'+body.session_id)),false);
  grant();await checkpoint;
  const copied=client(e.network,local,indexed,tab);copied.window.navigator.locks=locks;
  await turn();await copied.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,100);
  await c.ranking.bankRun(body);assert.equal(held,false);
  assert.equal(e.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,104);
});

test('delivery reports code exceptions to D1 but keeps network failures silent; the record stays queued', async () => {
  const e = environment();
  const net = { fail: null, fetch: async (url, options) => { if (net.fail) throw net.fail; return e.network.fetch(url, options); } };
  const c = client(net); const session = await start(c);
  const reports = [];
  c.window.ArcherLabClientErrorReporter = { reportPayload: payload => reports.push(payload) };
  net.fail = new TypeError('Failed to fetch');
  c.ranking.track('lumen-shift', event(), session);
  const pending = await c.ranking.submit({ game_id: 'lumen-shift', session_id: session, player_name: 'Bug run', score: 100 });
  assert.equal(pending.pending, true);
  assert.equal(reports.length, 0, 'network failure must not be logged');
  net.fail = new TypeError('Assignment to constant variable.');
  await c.ranking.flush();
  assert.equal(reports.length >= 1, true);
  assert.equal(reports[0].error_type, 'ranking_client_exception');
  assert.match(reports[0].message, /^TypeError: Assignment to constant variable\./);
  assert.equal(reports[0].error_class, 'TypeError');
  net.fail = null;
  await c.ranking.flush();
  assert.equal(e.db.sql.prepare('SELECT score FROM rankings').get().score, 100, 'queued record still delivers');
});
