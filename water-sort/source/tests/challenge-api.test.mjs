import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { challengeApi } from '../worker/challenge-api.ts';
import { solve } from '../lib/game.ts';

// Actual SQLite executes the production SQL, including compare-and-swap writes.
class TestDatabase {
  database = new DatabaseSync(':memory:');
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

test('ranking API rejects forged state, hidden actions, replay and concurrent writes; resume keeps server time', async () => {
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
    assert.equal((await send(' '.repeat(1025))).status, 413);
    for (const key of ['score', 'level', 'cleared', 'deadline', 'now', 'board', 'moves']) {
      assert.equal((await send({ type: 'start', [key]: 999999 })).status, 400);
    }
    const started = await send({ type: 'start' }); assert.equal(started.status, 200);
    let run = started.run;
    const auth = { id: run.id, token: started.token };
    assert.equal((await send({ type: 'sync', ...auth })).status, 200); // Reload only retains credentials, not a trusted version.
    const command = (type, extra = {}) => ({ type, ...auth, version: run.version, ...extra });
    const initialDeadline = run.deadline, initialBoard = run.board;
    now += 9000; // Home/reload/continue only sync this same server run.
    run = (await send(command('sync'))).run;
    assert.equal(run.deadline, initialDeadline); assert.deepEqual(run.board, initialBoard); assert.equal(run.score, 0);
    assert.equal(run.deadline - now, 51000);
    for (const type of ['undo', 'end', 'next', 'pause', 'resume', 'level_clear']) assert.equal((await send(command(type))).status, 400);
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
