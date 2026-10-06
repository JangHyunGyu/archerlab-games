import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { challengeApi } from '../worker/challenge-api.ts';
import { invalidateLeaderboard, leaderboard } from '../worker/leaderboard-cache.ts';
import { cleanupStaleRuns, STALE_RUN_AGE_MS } from '../worker/cleanup.ts';
import { clientKey } from '../worker/rate-limit.ts';
import { checkNickname } from '../lib/nickname.ts';
import { recordPour, pourVerdict, MAX_FAST_STREAK, REGULARITY_SAMPLE, FAST_GAP_MS } from '../lib/pour-timing.ts';
import { pourDuration, POUR_PACE } from '../lib/challenge-rules.ts';
import { solve } from '../lib/game.ts';

const MIGRATIONS = ['water-sort-0001-schema.sql', 'water-sort-0002-start-rate-limit.sql'].map(name => readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
class TestDatabase {
  database = new DatabaseSync(':memory:');
  queries = [];
  constructor() { for (const sql of MIGRATIONS) this.database.exec(sql); invalidateLeaderboard(); }
  prepare(sql) {
    const db = this.database, log = this.queries;
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { log.push(sql); return db.prepare(sql).get(...args) ?? null; },
      async all() { log.push(sql); return { results: db.prepare(sql).all(...args) }; },
      async run() { log.push(sql); const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  }
}
const harness = (env = {}) => {
  const db = new TestDatabase();
  const send = async (body, headers = {}) => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }), db, [], env);
    return { status: response.status, headers: response.headers, ...await response.json() };
  };
  return { db, send };
};
// An ended, zero-clear run that is eligible to register.
async function endedRun(h) {
  const start = await h.send({ type: 'start' });
  const auth = { id: start.run.id, token: start.token };
  return { start, auth, expiredAt: start.run.deadline + 1 };
}

test('the Worker never creates or alters tables on a request', async () => {
  const h = harness();
  await h.send({ type: 'start' });
  await challengeApi(new Request('https://game.test/api/challenge'), h.db);
  assert.ok(h.db.queries.length > 0);
  assert.ok(h.db.queries.every(sql => !/\b(CREATE|ALTER|DROP)\b/i.test(sql)), 'no DDL on the request path');
  const source = readFileSync(new URL('./../worker/challenge-api.ts', import.meta.url), 'utf8');
  assert.equal(/CREATE (TABLE|INDEX)|ALTER TABLE/i.test(source), false);
});

test('start requests are rate limited per hashed client key and recover after the window', async () => {
  const h = harness(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  try {
    const ip = { 'CF-Connecting-IP': '203.0.113.7' };
    for (let i = 0; i < 20; i++) assert.equal((await h.send({ type: 'start' }, ip)).status, 200);
    const limited = await h.send({ type: 'start' }, ip);
    assert.equal(limited.status, 429); assert.equal(limited.error, 'rate_limited');
    assert.ok(limited.retryAfter > 0 && limited.retryAfter <= 600); assert.equal(limited.headers.get('Retry-After'), String(limited.retryAfter));
    assert.equal((await h.send({ type: 'start' }, { 'CF-Connecting-IP': '203.0.113.8' })).status, 200, 'another address is unaffected');
    // IPv6 hosts in one /64 share a bucket.
    assert.equal(await clientKey(new Request('https://x.test', { headers: { 'CF-Connecting-IP': '2001:db8:1:2:aaaa::1' } })), await clientKey(new Request('https://x.test', { headers: { 'CF-Connecting-IP': '2001:db8:1:2:bbbb::9' } })));
    const stored = h.db.database.prepare('SELECT ip_hash FROM water_sort_runs WHERE ip_hash IS NOT NULL LIMIT 1').get().ip_hash;
    assert.match(stored, /^[0-9a-f]{32}$/); assert.equal(stored.includes('203'), false, 'raw address is not stored');
    now += 10 * 60 * 1000 + 1;
    assert.equal((await h.send({ type: 'start' }, ip)).status, 200);
    // The daily cap holds even when the short window keeps clearing.
    let blocked = 0;
    for (let i = 0; i < 12; i++) { now += 10 * 60 * 1000 + 1; for (let j = 0; j < 14; j++) if ((await h.send({ type: 'start' }, ip)).status === 429) blocked++; }
    assert.ok(blocked > 0);
  } finally { Date.now = originalNow; h.db.database.close(); }
});

test('Turnstile is off without keys, and on it gates start and register with a fail-open outage rule', async () => {
  const off = harness();
  assert.equal((await off.send({ type: 'start' })).status, 200);
  assert.equal((await (await challengeApi(new Request('https://game.test/api/challenge?config=1'), off.db, [], {})).json()).turnstileSiteKey, null);
  const half = harness({ TURNSTILE_SITE_KEY: 'site-only' });
  assert.equal((await half.send({ type: 'start' })).status, 200, 'one key alone never locks players out');

  const env = { TURNSTILE_SITE_KEY: '0xSITE', TURNSTILE_SECRET_KEY: 'secret' }, h = harness(env), realFetch = globalThis.fetch, originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  const calls = []; let mode = 'ok';
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), form: init.body });
    if (mode === 'down') throw new Error('network');
    if (mode === '500') return new Response('oops', { status: 500 });
    const token = init.body.get('response');
    return Response.json(token === 'good-start-token' ? { success: true, action: 'start' } : token === 'good-register-token' ? { success: true, action: 'register' } : { success: false });
  };
  try {
    assert.equal((await (await challengeApi(new Request('https://game.test/api/challenge?config=1'), h.db, [], env)).json()).turnstileSiteKey, '0xSITE');
    assert.equal((await h.send({ type: 'start' })).error, 'bot', 'missing token');
    assert.equal((await h.send({ type: 'start', turnstile: 'bad-token-value' })).error, 'bot', 'rejected token');
    assert.equal((await h.send({ type: 'start', turnstile: 'good-register-token' })).error, 'bot', 'a register token cannot start a run');
    const started = await h.send({ type: 'start', turnstile: 'good-start-token' }, { 'CF-Connecting-IP': '198.51.100.4' });
    assert.equal(started.status, 200);
    assert.equal(calls.at(-1).url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(calls.at(-1).form.get('secret'), 'secret'); assert.equal(calls.at(-1).form.get('remoteip'), '198.51.100.4');
    assert.equal((await h.send({ type: 'start', turnstile: 'x'.repeat(2049) })).status, 400);
    const auth = { id: started.run.id, token: started.token, version: started.run.version };
    now = started.run.deadline + 1;
    assert.equal((await h.send({ type: 'register', ...auth, nickname: 'Human' })).error, 'bot');
    assert.equal((await h.send({ type: 'register', ...auth, nickname: 'Human', turnstile: 'good-start-token' })).error, 'bot');
    assert.equal((await h.send({ type: 'register', ...auth, nickname: 'Human', turnstile: 'good-register-token' })).status, 200);
    // Verification outage: allow and log; the other defenses still run.
    mode = 'down'; assert.equal((await h.send({ type: 'start', turnstile: 'whatever-token' })).status, 200);
    mode = '500'; assert.equal((await h.send({ type: 'start', turnstile: 'whatever-token' })).status, 200);
  } finally { globalThis.fetch = realFetch; Date.now = originalNow; h.db.database.close(); }
});

test('nicknames are format-checked only; previously banned words are accepted and shown', async () => {
  for (const name of ['시발', 'ㅅㅂ', '씨 발', 'fuck', 'BigAss', 'Fuuuck']) assert.equal(checkNickname(name).ok, true, name);
  assert.deepEqual(checkNickname('ㅅㅂ'), { ok: true, name: 'ㅅㅂ' });
  assert.deepEqual(checkNickname('  Good Name '), { ok: true, name: 'Good Name' });
  assert.deepEqual(checkNickname('a!'), { ok: false, reason: 'format' });
  assert.deepEqual(checkNickname('씨?발'), { ok: false, reason: 'format' });
  assert.deepEqual(checkNickname(''), { ok: false, reason: 'format' });
  assert.deepEqual(checkNickname('a'.repeat(17)), { ok: false, reason: 'format' });

  const h = harness(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  try {
    const { start, auth } = await endedRun(h); now = start.run.deadline + 1;
    const body = { type: 'register', ...auth, version: start.run.version };
    assert.equal((await h.send({ ...body, nickname: '' })).error, 'nickname');
    assert.equal((await h.send({ ...body, nickname: 7 })).error, 'nickname');
    assert.equal((await h.send({ ...body, nickname: 'a!' })).error, 'nickname');
    const registered = await h.send({ ...body, nickname: 'ㅅㅂ' });
    assert.equal(registered.status, 200); assert.notEqual(registered.error, 'nickname_banned');
    // Stored names are never hidden on the board.
    h.db.database.prepare("INSERT INTO water_sort_runs (id, token, data, nickname, cleared, score, created_at) VALUES ('old-bad', 't', '{\"rules\":2}', '개새끼', 99, 99999, 1)").run();
    invalidateLeaderboard();
    const rows = (await (await challengeApi(new Request('https://game.test/api/challenge'), h.db)).json()).rows;
    assert.deepEqual(rows.map(row => row.nickname), ['개새끼', 'ㅅㅂ']);
  } finally { Date.now = originalNow; h.db.database.close(); }
});

test('implausibly fast or metronome-regular pours are flagged and cannot register', () => {
  let stats; let t = 1000;
  for (let i = 0; i < 5; i++) { stats = recordPour(stats, t); t += 60; }
  assert.equal(pourVerdict(stats), 'ok', 'a five-pour queue is normal');
  let bot; t = 0;
  for (let i = 0; i < MAX_FAST_STREAK + 2; i++) { bot = recordPour(bot, t); t += 40; }
  assert.equal(pourVerdict(bot), 'too_fast');
  let metronome; t = 0;
  for (let i = 0; i < REGULARITY_SAMPLE + 2; i++) { metronome = recordPour(metronome, t); t += 1500; }
  assert.equal(pourVerdict(metronome), 'too_regular');
  let human; t = 0; const pauses = [1400, 3200, 900, 5100, 2300, 1200, 7400, 1800, 2600, 1150, 4300, 1950];
  for (let i = 0; i < 30; i++) { human = recordPour(human, t); t += pauses[i % pauses.length] + (i * 37) % 400; }
  assert.equal(pourVerdict(human), 'ok');
  assert.equal(pourVerdict(undefined), 'ok');
});

test('the API refuses to register a run whose recorded pour timing is scripted', async () => {
  const originalNow = Date.now;
  for (const [label, pours] of [['fast', { last: 0, gaps: [30, 30, 30], streak: 12, longest: 12 }], ['regular', { last: 0, gaps: Array(24).fill(1500), streak: 0, longest: 0 }], ['human', { last: 0, gaps: [900, 2400, 1100, 3000], streak: 0, longest: 0 }]]) {
    const h = harness();
    let now = 1800000000000; Date.now = () => now;
    try {
      const { start, auth } = await endedRun(h);
      const row = JSON.parse(h.db.database.prepare('SELECT data FROM water_sort_runs WHERE id = ?').get(auth.id).data);
      h.db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify({ ...row, pours }), auth.id);
      now = start.run.deadline + 1;
      const result = await h.send({ type: 'register', ...auth, version: start.run.version, nickname: 'Timing' });
      assert.equal(result.status, label === 'human' ? 200 : 403, label);
      if (label !== 'human') assert.equal(result.error, 'bot');
    } finally { Date.now = originalNow; h.db.database.close(); }
  }
});

test('real pours record server timing without leaking it to clients', async () => {
  const h = harness(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  try {
    const start = await h.send({ type: 'start' }); let run = start.run;
    const auth = { id: run.id, token: start.token };
    for (const [from, to] of solve(run.board).slice(0, 3)) { now = run.availableAt + 700; run = (await h.send({ type: 'pour', ...auth, version: run.version, from, to })).run; }
    const stored = JSON.parse(h.db.database.prepare('SELECT data FROM water_sort_runs WHERE id = ?').get(auth.id).data);
    assert.equal(stored.pours.gaps.length, 2); assert.ok(stored.pours.gaps.every(gap => gap > 1000));
    assert.equal('pours' in run, false);
  } finally { Date.now = originalNow; h.db.database.close(); }
});

test('the leaderboard is cached briefly, refreshed after a registration, and tolerant of repeat reads', async () => {
  const h = harness(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  try {
    const reads = () => h.db.queries.filter(sql => /ROW_NUMBER/.test(sql)).length;
    const read = async () => (await (await challengeApi(new Request('https://game.test/api/challenge'), h.db)).json()).rows;
    assert.deepEqual(await read(), []);
    for (let i = 0; i < 10; i++) await read();
    assert.equal(reads(), 1, 'ten views, one database read');
    now += 16000; await read(); assert.equal(reads(), 2, 'refreshes after the TTL');
    const { start, auth } = await endedRun(h); now = start.run.deadline + 1;
    assert.equal((await h.send({ type: 'register', ...auth, version: start.run.version, nickname: 'Fresh' })).status, 200);
    assert.deepEqual((await read()).map(row => row.nickname), ['Fresh'], 'registration is visible immediately');
    assert.deepEqual((await leaderboard(h.db, now, 0)).map(row => row.nickname), ['Fresh']);
  } finally { Date.now = originalNow; h.db.database.close(); }
});

test('cleanup removes only unregistered runs older than the grace period, in bounded batches', async () => {
  const h = harness(), now = 1800000000000;
  const add = h.db.database.prepare("INSERT INTO water_sort_runs (id, token, data, nickname, created_at) VALUES (?, 't', '{}', ?, ?)");
  add.run('old-unreg', null, now - STALE_RUN_AGE_MS - 1);
  add.run('old-unreg-2', null, now - STALE_RUN_AGE_MS * 3);
  add.run('old-registered', 'Keep', now - STALE_RUN_AGE_MS * 10);
  add.run('fresh-unreg', null, now - STALE_RUN_AGE_MS + 1000);
  assert.equal(await cleanupStaleRuns(h.db, now, STALE_RUN_AGE_MS, 1), 1, 'batch limit respected');
  assert.equal(await cleanupStaleRuns(h.db, now), 1);
  assert.equal(await cleanupStaleRuns(h.db, now), 0);
  assert.deepEqual(h.db.database.prepare('SELECT id FROM water_sort_runs ORDER BY id').all().map(row => row.id), ['fresh-unreg', 'old-registered']);
  h.db.database.close();
});

test('the page asks for a Turnstile token only when the server publishes a site key', async () => {
  const { turnstileToken } = await import('../app/turnstile.ts');
  const realFetch = globalThis.fetch, urls = [];
  globalThis.fetch = async url => { urls.push(String(url)); return Response.json({ turnstileSiteKey: null }); };
  try {
    assert.equal(await turnstileToken('https://api.test/water-sort/challenge', 'start'), undefined);
    assert.equal(await turnstileToken('https://api.test/water-sort/challenge', 'register'), undefined);
    assert.deepEqual(urls, ['https://api.test/water-sort/challenge?config=1'], 'the config is fetched once and no script is loaded');
  } finally { globalThis.fetch = realFetch; }
});

test('the shorter pour pace does not push a fast queued player into a bot verdict', () => {
  // Back-to-back queued pours: each gap is one new-pace animation plus network jitter.
  let seed = 5; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  let stats; let t = 0;
  for (let i = 0; i < 40; i++) {
    stats = recordPour(stats, t);
    t += pourDuration(1 + Math.floor(random() * 3), POUR_PACE) + 25 + Math.floor(random() * 65);
  }
  assert.equal(pourVerdict(stats), 'ok');
  assert.ok(stats.gaps.every(gap => gap >= FAST_GAP_MS));
});
