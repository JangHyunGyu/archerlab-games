import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { challengeApi } from '../worker/challenge-api.ts';
import { solve, pour } from '../lib/game.ts';
import { pourDuration, POUR_PACE } from '../lib/challenge-rules.ts';
import { pourVerdict } from '../lib/pour-timing.ts';
import { readFileSync } from 'node:fs';
import { invalidateLeaderboard } from '../worker/leaderboard-cache.ts';

// Production applies these files once with `wrangler d1 execute`; the Worker itself never runs DDL.
const MIGRATIONS = ['water-sort-0001-schema.sql', 'water-sort-0002-start-rate-limit.sql'].map(name => readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));

// Actual SQLite executes the production SQL, including compare-and-swap writes.
class TestDatabase {
  database = new DatabaseSync(':memory:');
  constructor() { for (const sql of MIGRATIONS) this.database.exec(sql); invalidateLeaderboard(); }
  prepare(sql) {
    const db = this.database;
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  }
  async batch(statements) { return Promise.all(statements.map(s => s.run())); }
}

test('D1 accepts disjoint pours during animation but rejects shared-bottle bypasses and forged lock times', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000;
  Date.now = () => now;
  const send = async body => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    const started = await send({ type: 'start' });
    const auth = { id: started.run.id, token: started.token };
    const board = [[0, 1, 0, 1], [1, 0, 1, 0], [], [], []];
    const state = { ...started.run, board, initialBoard: board, history: [], bottleAvailableAt: board.map(() => now) };
    db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify(state), auth.id);
    const first = await send({ type: 'pour', ...auth, version: 0, from: 0, to: 2 });
    assert.equal(first.run.moves, 1);
    now += 100;
    const independent = await send({ type: 'pour', ...auth, version: first.run.version, from: 1, to: 3 });
    assert.equal(independent.status, 200); assert.equal(independent.run.moves, 2);
    assert.equal(independent.run.deadline, started.run.deadline);
    const reused = await send({ type: 'pour', ...auth, version: independent.run.version, from: 0, to: 4 });
    assert.equal(reused.run.moves, 2); assert.equal(reused.run.version, independent.run.version);
    const forged = await send({ type: 'pour', ...auth, version: independent.run.version, from: 0, to: 4, bottleAvailableAt: [0, 0, 0, 0, 0] });
    assert.equal(forged.status, 400);
    const replay = await send({ type: 'pour', ...auth, version: first.run.version, from: 1, to: 3 });
    assert.equal(replay.status, 409);
    now = first.run.bottleAvailableAt[0];
    const dependent = await send({ type: 'pour', ...auth, version: independent.run.version, from: 0, to: 4 });
    assert.equal(dependent.run.moves, 3, 'first pair unlocks without waiting for the independent pair');
    const resumed = await send({ type: 'resume', ...auth, version: dependent.run.version });
    // Continuing keeps the live board and the original deadline; nothing is reset or refunded.
    assert.deepEqual(resumed.run.board, dependent.run.board); assert.equal(resumed.run.deadline, started.run.deadline);
    assert.deepEqual(resumed.run.bottleAvailableAt, dependent.run.bottleAvailableAt);
    assert.equal(resumed.run.moves, 3); assert.equal(resumed.run.score, 0);
  } finally { Date.now = originalNow; db.database.close(); }
});

test('server-confirmed dead ends end early, remain rankable, and cannot be revived or forged', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  const send = async body => { const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db); return { status: response.status, ...await response.json() }; };
  try {
    const started = await send({ type: 'start' }), auth = { id: started.run.id, token: started.token };
    const board = [[0, 0, 1, 3], [1, 1, 2, 3], [2, 2, 3], [0, 0, 3], [1], [2]];
    const state = { ...started.run, board, initialBoard: board, history: [], bottleAvailableAt: board.map(() => now) };
    db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify(state), auth.id);
    const checked = await send({ type: 'inspect', ...auth, version: 0 });
    assert.equal(checked.run.version, 0, 'a nonterminal inspection must not race the next pour version');
    assert.equal(checked.run.status, 'playing');
    const ended = await send({ type: 'pour', ...auth, version: 0, from: 3, to: 2 });
    assert.equal(ended.run.endReason, 'blocked'); assert.equal(ended.run.status, 'ended');
    assert.ok(now < ended.run.deadline); assert.ok(now < ended.run.availableAt);
    for (const type of ['leave', 'resume']) {
      const result = await send({ type, ...auth, version: ended.run.version });
      assert.equal(result.run.status, 'ended'); assert.deepEqual(result.run.board, ended.run.board);
    }
    for (const key of ['board', 'endReason', 'endedAt', 'score']) {
      assert.equal((await send({ type: 'inspect', ...auth, version: ended.run.version, [key]: 'blocked' })).status, 400);
    }
    assert.equal((await send({ type: 'inspect', ...auth, version: 0 })).status, 409);
    const registered = await send({ type: 'register', ...auth, version: ended.run.version, nickname: 'Blocked Test' });
    assert.equal(registered.status, 200); assert.equal(registered.run.registered, true); assert.equal(registered.run.score, 0);
    const fake = await send({ type: 'start' }), fakeAuth = { id: fake.run.id, token: fake.token };
    db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify({ ...fake.run, history: [], status: 'ended', endReason: 'blocked', endedAt: now }), fakeAuth.id);
    assert.equal((await send({ type: 'register', ...fakeAuth, version: 0, nickname: 'Forged' })).status, 409, 'even a stored blocked marker requires a real unsolvability proof');
  } finally { Date.now = originalNow; db.database.close(); }
});

test('separate inspection proves a trapped board with legal moves without trusting the client board', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  const send = async body => { const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db); return { status: response.status, ...await response.json() }; };
  try {
    const started = await send({ type: 'start' }), auth = { id: started.run.id, token: started.token };
    const board = [[3], [2, 3, 2, 2], [3, 0, 1], [1, 0, 1, 1], [0], [0, 3, 2]];
    db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify({ ...started.run, board, history: [], moves: 3 }), auth.id);
    assert.equal((await send({ type: 'sync', ...auth })).run.status, 'playing');
    assert.equal((await send({ type: 'inspect', ...auth })).status, 400);
    const checked = await send({ type: 'inspect', ...auth, version: 0 });
    assert.equal(checked.run.status, 'ended'); assert.equal(checked.run.endReason, 'blocked');
    assert.equal(checked.run.version, 1); assert.equal(checked.run.moves, 3); assert.equal(checked.run.score, 0);
    const registered = await send({ type: 'register', ...auth, version: 1, nickname: 'Proof Test' });
    assert.equal(registered.status, 200);
  } finally { Date.now = originalNow; db.database.close(); }
});

test('ranking API rejects forged state, hidden actions, replay and concurrent writes; sync keeps server time', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000;
  Date.now = () => now;
  const send = async (body, extraHeaders = {}) => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://game.test', ...extraHeaders }, body: typeof body === 'string' ? body : JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    assert.equal((await send('{')).status, 400);
    assert.equal((await send([])).status, 400);
    assert.equal((await send({ type: 'start' }, { Origin: 'https://other.test' })).status, 403);
    assert.equal((await send({ type: 'start' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await send(' '.repeat(4097))).status, 413);
    for (const key of ['score', 'level', 'cleared', 'deadline', 'now', 'board', 'moves']) {
      assert.equal((await send({ type: 'start', [key]: 999999 })).status, 400);
    }
    const started = await send({ type: 'start' }); assert.equal(started.status, 200);
    let run = started.run;
    const auth = { id: run.id, token: started.token };
    assert.equal((await send({ type: 'sync', ...auth })).status, 200); // Reload only retains credentials, not a trusted version.
    const command = (type, extra = {}) => ({ type, ...auth, version: run.version, ...extra });
    const initialDeadline = run.deadline, initialBoard = run.board;
    now += 9000; // Reading the run never resets its clock.
    run = (await send(command('sync'))).run;
    assert.equal(run.deadline, initialDeadline); assert.deepEqual(run.board, initialBoard); assert.equal(run.score, 0);
    assert.equal(run.deadline - now, 51000);
    for (const type of ['undo', 'end', 'next', 'pause', 'level_clear']) assert.equal((await send(command(type))).status, 400);
    assert.equal((await send(command('sync', { token: crypto.randomUUID() }))).status, 404);
    assert.equal((await send(command('pour', { from: -1, to: 0 }))).status, 400);
    assert.equal((await send(command('pour', { from: .5, to: 0 }))).status, 400);
    assert.equal((await send(command('pour', { from: 0, to: 10 }))).status, 400);
    assert.equal((await send(command('register', { nickname: 'Test' }))).status, 409);

    const [from, to] = solve(run.board)[0];
    const firstRequest = command('pour', { from, to });
    run = (await send(firstRequest)).run; assert.equal(run.moves, 1);
    assert.equal((await send(firstRequest)).status, 409); // Same version cannot be replayed.
    const early = await send(command('pour', { from: to, to: from }));
    assert.equal(early.run.moves, 1); assert.equal(early.run.deadline, initialDeadline);
    now = run.availableAt;
    const [nextFrom, nextTo] = solve(run.board)[0];
    const concurrentRequest = command('pour', { from: nextFrom, to: nextTo });
    const concurrent = await Promise.all([send(concurrentRequest), send(concurrentRequest)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    run = concurrent.find(r => r.status === 200).run; assert.equal(run.moves, 2);

    for (const [f, t] of solve(run.board)) {
      now = run.availableAt;
      const result = await send(command('pour', { from: f, to: t }));
      assert.equal(result.status, 200); run = result.run;
    }
    assert.equal(run.status, 'cleared'); assert.equal(run.cleared, 1);
    assert.ok(run.score >= 1000 && run.score <= 1300);
    assert.equal((await send(command('register', { nickname: 'Test' }))).status, 409);
    const score = run.score, nextStart = run.availableAt + 450;
    now = nextStart + 9000;
    run = (await send(command('sync'))).run;
    assert.equal(run.level, 2); assert.equal(run.deadline, nextStart + 60000); assert.equal(run.score, score);
    const secondBoard = run.board;
    run = (await send(command('sync'))).run; assert.deepEqual(run.board, secondBoard);
    now = run.deadline + 1;
    run = (await send(command('sync'))).run; assert.equal(run.status, 'ended');
    for (const key of ['score', 'level', 'cleared', 'deadline', 'now', 'board', 'moves']) {
      assert.equal((await send(command('register', { nickname: 'Test', [key]: 999999 }))).status, 400);
    }
    const registerRequest = command('register', { nickname: 'Test' });
    const registrations = await Promise.all([send(registerRequest), send(registerRequest)]);
    assert.ok(registrations.some(r => r.status === 200));
    const retry = await send(registerRequest); assert.equal(retry.status, 200); assert.equal(retry.run.registered, true);
    run = retry.run;
    assert.equal((await send(command('register', { nickname: 'Different' }))).status, 409);
    assert.equal((await send(command('pour', { from: 0, to: 1 }))).status, 409);
    const ranking = await challengeApi(new Request('https://game.test/api/challenge'), db);
    const rows = (await ranking.json()).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].score, score); assert.equal(rows[0].cleared, 1);
    assert.equal(rows[0].nickname, 'Test');
  } finally { Date.now = originalNow; db.database.close(); }
});

test('leave and resume never pause or refresh the clock: time away counts toward the limit', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  const send = async body => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    const start = await send({ type: 'start' }); let run = start.run;
    const auth = { id: run.id, token: start.token }, initial = run.board, originalDeadline = run.deadline;
    const command = (type, extra = {}) => ({ type, ...auth, version: run.version, ...extra });
    assert.equal('initialBoard' in run, false, 'checkpoint stays server-side');
    assert.equal('pours' in run, false, 'pour timing stays server-side');
    for (const type of ['resume', 'leave']) {
      assert.equal((await send({ type, ...auth })).status, 400);
      for (const key of ['score', 'level', 'cleared', 'deadline', 'now', 'board', 'initialBoard', 'moves', 'suspended', 'pours']) assert.equal((await send(command(type, { [key]: 999999 }))).status, 400);
    }
    now += 1000;
    const [from, to] = solve(run.board)[0];
    run = (await send(command('pour', { from, to }))).run;
    const played = run.board;
    assert.notDeepEqual(played, initial); assert.equal(run.moves, 1);
    const stalePour = command('pour', { from, to });
    run = (await send(command('leave'))).run;
    assert.equal(run.suspended, true);
    assert.equal((await send(stalePour)).status, 409);
    const suspendedVersion = run.version;
    const blocked = await send(command('pour', { from, to }));
    assert.equal(blocked.run.version, suspendedVersion); assert.equal(blocked.run.moves, 1);
    now += 20000; // Twenty seconds away.
    run = (await send(command('sync'))).run;
    assert.equal(run.suspended, true); assert.equal(run.deadline, originalDeadline); assert.equal(run.status, 'playing');
    assert.equal((await send(command('register', { nickname: 'Early' }))).status, 409);
    const resumeRequest = command('resume');
    run = (await send(resumeRequest)).run;
    assert.equal(run.suspended, false); assert.deepEqual(run.board, played, 'same board as when the player left');
    assert.equal(run.deadline, originalDeadline, 'no fresh 60 seconds'); assert.equal(run.moves, 1); assert.equal(run.score, 0);
    assert.equal((await send(resumeRequest)).status, 409);
    // Repeated leave/resume cycles never add time.
    for (let attempt = 0; attempt < 3; attempt++) {
      run = (await send(command('leave'))).run; now += 4000;
      run = (await send(command('resume'))).run;
      assert.equal(run.deadline, originalDeadline); assert.deepEqual(run.board, played);
    }
    // A resume cannot race with a move to keep both.
    const version = run.version;
    const races = await Promise.all([send(command('leave')), send(command('pour', { from: 1, to: 2 }))]);
    assert.ok(races.some(r => r.status === 200));
    run = (await send({ type: 'sync', ...auth })).run;
    assert.ok(run.version >= version + 1);
    // Leave, then stay away past the limit: the stage times out on the server clock.
    if (!run.suspended) run = (await send(command('leave'))).run;
    now = originalDeadline + 1;
    run = (await send({ type: 'sync', ...auth })).run;
    assert.equal(run.status, 'ended'); assert.equal(run.endReason, 'timeout');
    const ended = (await send(command('resume'))).run;
    assert.equal(ended.status, 'ended'); assert.equal(ended.deadline, originalDeadline);
    run = (await send({ type: 'register', ...auth, version: ended.version, nickname: 'AwayTooLong' })).run;
    assert.equal(run.registered, true); assert.equal(run.cleared, 0);
  } finally { Date.now = originalNow; db.database.close(); }
});

test('a cleared stage keeps its fixed hand-off time while the player is away', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  const send = async body => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    for (const away of [100, 86400000]) {
      const start = await send({ type: 'start' }); let run = start.run;
      const auth = { id: run.id, token: start.token };
      const command = (type, extra = {}) => ({ type, ...auth, version: run.version, ...extra });
      for (const [f, t] of solve(run.board)) { now = run.availableAt; run = (await send(command('pour', { from: f, to: t }))).run; }
      assert.equal(run.status, 'cleared');
      const score = run.score, handoff = run.availableAt + 450;
      run = (await send(command('leave'))).run;
      now = run.availableAt + away;
      run = (await send(command('resume'))).run;
      if (away === 100) { assert.equal(run.level, 2); assert.equal(run.deadline, handoff + 60000); assert.equal(run.score, score); }
      else { assert.equal(run.status, 'ended'); assert.equal(run.cleared, 1); assert.equal(run.score, score); }
    }
  } finally { Date.now = originalNow; db.database.close(); }
});

test('runs saved before the checkpoint existed resume on their live board without a new layout', async () => {
  const db = new TestDatabase();
  const send = async body => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    const start = await send({ type: 'start' });
    const auth = { id: start.run.id, token: start.token };
    const row = db.database.prepare('SELECT data FROM water_sort_runs WHERE id = ?').get(auth.id);
    const old = JSON.parse(row.data); delete old.initialBoard; old.moves = 3;
    db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify(old), auth.id);
    const resumed = await send({ type: 'resume', ...auth, version: start.run.version });
    assert.equal(resumed.status, 200); assert.deepEqual(resumed.run.board, start.run.board);
    assert.equal(resumed.run.moves, 3); assert.equal(resumed.run.score, 0); assert.equal(resumed.run.deadline, start.run.deadline);
    assert.equal('initialBoard' in resumed.run, false);
  } finally { db.database.close(); }
});

test('ranking keeps one best record per nickname and still stores the lower runs', async () => {
  const db = new TestDatabase();
  try {
    assert.equal((await challengeApi(new Request('https://game.test/api/challenge'), db)).status, 200);
    const insert = db.database.prepare('INSERT INTO water_sort_runs (id, token, data, version, nickname, cleared, score, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)');
    const add = (id, nickname, cleared, score, created, rules = 2) => insert.run(id, crypto.randomUUID(), JSON.stringify({ rules }), nickname, cleared, score, created);
    add('wall-best', 'Wall', 100, 130000, 10);
    for (let i = 0; i < 50; i++) add(`wall-${i}`, 'wall', 100, 100000, 100 + i);
    add('visible', 'Visible', 99, 99000, 20);
    add('lab-best', 'Lab', 10, 10000, 300);
    add('lab-fast', 'lab', 8, 10400, 100);
    add('lab-late', ' Lab ', 10, 10000, 400);
    add('lab-low', 'LAB', 10, 9000, 50);
    add('solo', 'Solo', 9, 11700, 200);
    add('other-low', 'Other', 3, 3000, 10);
    add('other-high', 'Other', 3, 3900, 20);
    add('tie-late', 'Same', 4, 4000, 500);
    add('tie-early', 'same', 4, 4000, 100);
    add('legacy', 'Lab', 100, 999999, 1, 1);
    add('blank', null, 100, 999999, 1);
    const stored = db.database.prepare('SELECT COUNT(*) AS n FROM water_sort_runs').get().n;
    invalidateLeaderboard(); // Rows were inserted behind the API's back.
    const response = await challengeApi(new Request('https://game.test/api/challenge'), db);
    const rows = (await response.json()).rows;
    assert.deepEqual(rows.map(row => [row.id, row.nickname, row.cleared, row.score]), [
      ['wall-best', 'Wall', 100, 130000],
      ['visible', 'Visible', 99, 99000],
      ['lab-best', 'Lab', 10, 10000],
      ['solo', 'Solo', 9, 11700],
      ['tie-early', 'same', 4, 4000],
      ['other-high', 'Other', 3, 3900],
    ]);
    assert.equal(db.database.prepare('SELECT COUNT(*) AS n FROM water_sort_runs').get().n, stored);
    assert.ok(stored > rows.length);
  } finally { db.database.close(); }
});

test('zero-clear results remain rankable and corrupted high scores cannot be registered', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  const send = async body => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    for (const forgedScore of [null, 999999, -1]) {
      const start = await send({ type: 'start' });
      const auth = { id: start.run.id, token: start.token, version: start.run.version };
      now = start.run.deadline + 1;
      if (forgedScore !== null) {
        const stored = { ...start.run, score: forgedScore, history: [] };
        db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify(stored), auth.id);
      }
      const result = await send({ type: 'register', ...auth, nickname: 'Zero' });
      assert.equal(result.status, forgedScore === null ? 200 : 409);
      if (forgedScore === null) { assert.equal(result.run.cleared, 0); assert.equal(result.run.score, 0); }
    }
    const ranks = await challengeApi(new Request('https://game.test/api/challenge'), db);
    assert.equal((await ranks.json()).rows.length, 1);
  } finally { Date.now = originalNow; db.database.close(); }
});

// Plays real stages through the Worker the way the client paces them: a pour is sent only after the
// server's bottle locks and the client's own animation of those bottles end, plus jittered latency,
// with a thinking pause at least every five pours (the queue limit). `legacyRun` strips the stamped
// pace to reproduce a run saved by the previous worker; `legacyClient` plays the old, longer animation.
async function playRun({ legacyRun, legacyClient, stages = 3 }) {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  let seed = legacyRun ? 7 : 11;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const between = (low, high) => Math.round(low + random() * (high - low));
  const send = async body => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    const started = await send({ type: 'start' }); let run = started.run;
    const auth = { id: run.id, token: started.token };
    assert.equal(run.pace, POUR_PACE, 'the new worker stamps every new run');
    if (legacyRun) {
      const data = JSON.parse(db.database.prepare('SELECT data FROM water_sort_runs WHERE id = ?').get(auth.id).data);
      delete data.pace;
      db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify(data), auth.id);
      run = (await send({ type: 'sync', ...auth })).run;
      assert.equal(run.pace, undefined);
    }
    const lockPace = legacyRun ? undefined : POUR_PACE, animationPace = legacyClient ? undefined : run.pace;
    const locks = [];
    for (let stage = 1; stage <= stages; stage++) {
      assert.equal(run.level, stage); assert.equal(run.status, 'playing');
      const animationEnd = run.board.map(() => now);
      now += between(700, 1800); // Look at the new board.
      let sinceThink = 0;
      for (const [from, to] of solve(run.board)) {
        if (sinceThink === 5) { now += between(400, 1600); sinceThink = 0; }
        const ready = Math.max(run.bottleAvailableAt[from], run.bottleAvailableAt[to], animationEnd[from], animationEnd[to]);
        now = Math.max(now + between(20, 70), ready + between(25, 90));
        const amount = pour(run.board, from, to)[to].length - run.board[to].length;
        const result = await send({ type: 'pour', ...auth, version: run.version, from, to });
        assert.equal(result.status, 200); assert.equal(result.run.moves, run.moves + 1, 'every paced pour is accepted');
        run = result.run; sinceThink++;
        locks.push(run.bottleAvailableAt[from] - now);
        assert.equal(run.bottleAvailableAt[from] - now, pourDuration(amount, lockPace));
        animationEnd[from] = animationEnd[to] = now + pourDuration(amount, animationPace);
      }
      assert.equal(run.status, 'cleared'); assert.equal(run.cleared, stage);
      now = Math.max(now, run.availableAt) + 450 + between(30, 200);
      run = (await send({ type: 'sync', ...auth, version: run.version })).run;
    }
    now = run.deadline + 1;
    run = (await send({ type: 'sync', ...auth, version: run.version })).run;
    assert.equal(run.status, 'ended'); assert.equal(run.cleared, stages);
    const stored = JSON.parse(db.database.prepare('SELECT data FROM water_sort_runs WHERE id = ?').get(auth.id).data);
    const registered = await send({ type: 'register', ...auth, version: run.version, nickname: legacyRun ? 'OldPace' : 'NewPace' });
    return { registered, stored, locks };
  } finally { Date.now = originalNow; db.database.close(); }
}

test('a run on the new pour pace registers without a bot verdict', async () => {
  const { registered, stored, locks } = await playRun({ legacyRun: false, legacyClient: false });
  assert.equal(registered.status, 200); assert.equal(registered.run.registered, true);
  assert.equal(pourVerdict(stored.pours), 'ok');
  assert.ok(locks.every(ms => ms >= 680 && ms <= 920), 'locks follow 600 + 80/unit');
});

test('transition: runs started on the old worker keep the old clock and still register', async () => {
  const { registered, stored, locks } = await playRun({ legacyRun: true, legacyClient: true });
  assert.equal(registered.status, 200); assert.equal(pourVerdict(stored.pours), 'ok');
  assert.ok(locks.every(ms => ms >= 1150 && ms <= 1540), 'old runs keep 1020 + 130/unit locks');
  assert.equal('pace' in stored, false, 'later stages of an old run stay on the old pace');
  // An old (cached) client on a new run animates longer than the lock; it only waits more.
  const oldClient = await playRun({ legacyRun: false, legacyClient: true });
  assert.equal(oldClient.registered.status, 200); assert.equal(pourVerdict(oldClient.stored.pours), 'ok');
});

test('an old run never gets the shorter lock: an early pour is ignored, not flagged', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  const send = async body => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    const started = await send({ type: 'start' }), auth = { id: started.run.id, token: started.token };
    const board = [[0, 1, 0, 1], [1, 0, 1, 0], [], [], []];
    const legacy = { ...started.run, board, initialBoard: board, history: [], bottleAvailableAt: board.map(() => now) };
    delete legacy.pace;
    db.database.prepare('UPDATE water_sort_runs SET data = ? WHERE id = ?').run(JSON.stringify(legacy), auth.id);
    const first = await send({ type: 'pour', ...auth, version: 0, from: 0, to: 2 });
    assert.equal(first.run.bottleAvailableAt[0] - now, 1150);
    now += 680;
    const early = await send({ type: 'pour', ...auth, version: first.run.version, from: 0, to: 3 });
    assert.equal(early.status, 200); assert.equal(early.run.version, first.run.version);
    now += 470;
    const onTime = await send({ type: 'pour', ...auth, version: first.run.version, from: 0, to: 3 });
    assert.equal(onTime.run.moves, 2);
  } finally { Date.now = originalNow; db.database.close(); }
});
