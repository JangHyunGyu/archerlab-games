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
    assert.deepEqual(resumed.run.board, board); assert.equal(resumed.run.deadline - now, 60000);
    assert.ok(resumed.run.bottleAvailableAt.every(time => time === now));
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

test('leave and resume reset the board and timer together without replay, partial-progress or score exploits', async () => {
  const db = new TestDatabase(), originalNow = Date.now;
  let now = 1800000000000; Date.now = () => now;
  const send = async body => {
    const response = await challengeApi(new Request('https://game.test/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), db);
    return { status: response.status, ...await response.json() };
  };
  try {
    const start = await send({ type: 'start' }); let run = start.run;
    const auth = { id: run.id, token: start.token }, initial = run.board;
    const command = (type, extra = {}) => ({ type, ...auth, version: run.version, ...extra });
    assert.equal('initialBoard' in run, false, 'checkpoint stays server-side');
    for (const type of ['resume', 'leave']) {
      assert.equal((await send({ type, ...auth })).status, 400);
      for (const key of ['score', 'level', 'cleared', 'deadline', 'now', 'board', 'initialBoard', 'moves', 'suspended']) assert.equal((await send(command(type, { [key]: 999999 }))).status, 400);
    }
    now += 1000;
    const [from, to] = solve(run.board)[0];
    run = (await send(command('pour', { from, to }))).run;
    assert.notDeepEqual(run.board, initial); assert.equal(run.moves, 1);
    const stalePour = command('pour', { from, to }), originalDeadline = run.deadline;
    run = (await send(command('leave'))).run;
    assert.equal(run.suspended, true);
    assert.equal((await send(stalePour)).status, 409);
    const suspendedVersion = run.version;
    const blocked = await send(command('pour', { from, to }));
    assert.equal(blocked.run.version, suspendedVersion); assert.equal(blocked.run.moves, 1);
    now += 86400000;
    run = (await send(command('sync'))).run;
    assert.equal(run.suspended, true); assert.equal(run.deadline, originalDeadline);
    assert.equal((await send(command('register', { nickname: 'Early' }))).status, 409);
    const resumeRequest = command('resume');
    run = (await send(resumeRequest)).run;
    assert.equal(run.suspended, false); assert.deepEqual(run.board, initial);
    assert.equal(run.deadline, now + 60000); assert.equal(run.moves, 1); assert.equal(run.score, 0);
    assert.equal((await send(resumeRequest)).status, 409);
    for (let attempt = 0; attempt < 3; attempt++) {
      now += 4000;
      run = (await send(command('resume'))).run;
      assert.deepEqual(run.board, initial); assert.equal(run.deadline, now + 60000);
      assert.equal(run.moves, 1); assert.equal(run.score, 0); assert.equal(run.cleared, 0);
    }
    // A reset cannot race with a move to preserve the advanced board and refreshed time.
    const version = run.version;
    const races = await Promise.all([send(command('resume')), send(command('pour', { from, to }))]);
    assert.deepEqual(races.map(r => r.status).sort(), [200, 409]);
    run = (await send({ type: 'sync', ...auth })).run;
    assert.equal(run.version, version + 1);
    run = (await send(command('resume'))).run;
    assert.deepEqual(run.board, initial);
    const resetMoves = run.moves;
    const solution = solve(run.board);
    for (const [f, t] of solution) { now = run.availableAt; run = (await send(command('pour', { from: f, to: t }))).run; }
    assert.equal(run.status, 'cleared'); assert.equal(run.cleared, 1);
    assert.equal(run.moves, resetMoves + solution.length);
    const score = run.score;
    assert.equal(score, 1000 + Math.floor(200 * (run.deadline - run.availableAt) / 60000) + Math.max(0, 100 - run.moves * 2));
    run = (await send(command('leave'))).run;
    now += 86400000;
    run = (await send(command('resume'))).run;
    assert.equal(run.level, 2); assert.equal(run.cleared, 1); assert.equal(run.score, score);
    assert.equal(run.deadline, now + 60000);
    const secondBoard = run.board;
    run = (await send(command('resume'))).run;
    assert.deepEqual(run.board, secondBoard); assert.equal(run.score, score);
    now = run.deadline;
    run = (await send(command('leave'))).run;
    assert.equal(run.status, 'ended');
    const deadline = run.deadline;
    run = (await send(command('resume'))).run;
    assert.equal(run.status, 'ended'); assert.equal(run.deadline, deadline);
    run = (await send(command('register', { nickname: 'ResumeTest' }))).run;
    assert.equal(run.registered, true);
    assert.equal((await send(command('resume'))).status, 409);
    const ranks = await challengeApi(new Request('https://game.test/api/challenge'), db);
    const rows = (await ranks.json()).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].score, score); assert.equal(rows[0].cleared, 1);
  } finally { Date.now = originalNow; db.database.close(); }
});

test('legacy runs receive one solvable restart checkpoint without changing score or moves', async () => {
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
    assert.equal(resumed.status, 200); assert.ok(solve(resumed.run.board));
    assert.equal(resumed.run.moves, 3); assert.equal(resumed.run.score, 0);
    const again = await send({ type: 'resume', ...auth, version: resumed.run.version });
    assert.deepEqual(again.run.board, resumed.run.board);
    assert.equal('initialBoard' in again.run, false);
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
