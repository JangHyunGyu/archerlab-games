const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixture, server } = require('../helpers/ranking-delivery.cjs');

const shadow = 'shadow-survival-character-v1-shadowMonarch';
async function started(game, age = 3600000) {
  const f = fixture(game);
  await f.accept([f.command('/score-sessions', { seed: 12345 })]);
  f.db.sql.prepare('UPDATE ranking_sessions SET started_at = started_at - ?').run(age);
  return f;
}

for (const [level, seconds, kills] of [[31, 100, 1000], [200, 7201, 100001]]) {
  test(`shadow: legitimate unlimited progression (${level}/${seconds}/${kills}) reaches ranking`, async () => {
    const f = await started(shadow, 86400000);
    const results = await f.accept([f.command('/score-events', { events: [
      { type: 'progress', survived_seconds: seconds, level, kills, shadow_count: 5 },
    ] }), f.ranking(seconds)]);
    assert.ok(results.every(r => r.state === 'done'), JSON.stringify(results));
    assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get().score, seconds);
  });
}

for (const [game, oldLimit, event] of [
  ['cat-tower', 500000, { type: 'merge', created_tier: 1, combo: 1, delta: 25, seq: 1 }],
  ['jewelria', 600000, { type: 'match', removed: 3, longest: 3, lines: 1, special: 0, combo: 1, delta: 30 }],
  ['lumen-shift', 3000000, { type: 'clear', lines: 1, level: 81, combo: 1, delta: 8100 }],
]) {
  test(`${game}: another legal scoring event can cross the former score ceiling`, async () => {
    const f = await started(game);
    // Model the already verified prefix of a long run; exercise the next event
    // and final submission against the actual database/receipt transaction.
    f.db.sql.prepare('UPDATE ranking_sessions SET score = ?').run(oldLimit - 1);
    const score = oldLimit - 1 + event.delta;
    const results = await f.accept([f.command('/score-events', { events: [event] }), f.ranking(score)]);
    assert.ok(results.every(r => r.state === 'done'), JSON.stringify(results));
    assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get().score, score);
  });
}

test('blockpang: authoritative placement can cross the former score ceiling', async () => {
  const f = await started('blockpang');
  const state = JSON.parse(f.db.sql.prepare('SELECT state_json FROM ranking_sessions').get().state_json);
  state.score = 499999;
  f.db.sql.prepare('UPDATE ranking_sessions SET score = ?, state_json = ?').run(state.score, JSON.stringify(state));
  const results = await f.accept([f.command('/score-events', { events: [
    { type: 'move', seq: 1, slot_index: 0, grid_x: 0, grid_y: 0 },
  ] })]);
  assert.equal(results[0].state, 'done', JSON.stringify(results));
  const score = f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score;
  assert.ok(score > 500000);
  assert.equal((await f.accept([f.ranking(score)]))[0].state, 'done');
});

test('jelly-pang: authoritative merge beyond rank 20 and the former score ceiling is valid', async () => {
  const f = await started('jelly-pang-2048', 86400000);
  const state = JSON.parse(f.db.sql.prepare('SELECT state_json FROM ranking_sessions').get().state_json);
  state.grid = [[20, 20, null, null], ...Array.from({ length: 3 }, () => Array(4).fill(null))];
  state.score = 4999999; state.max_rank = 20;
  f.db.sql.prepare('UPDATE ranking_sessions SET score = ?, state_json = ?').run(state.score, JSON.stringify(state));
  const result = await f.accept([f.command('/score-events', { events: [{ type: 'move', move_seq: 1, dir: 'left' }] })]);
  assert.equal(result[0].state, 'done', JSON.stringify(result));
  const row = f.db.sql.prepare('SELECT score, state_json FROM ranking_sessions').get();
  assert.equal(JSON.parse(row.state_json).grid[0][0], 21);
  assert.equal((await f.accept([f.ranking(row.score)]))[0].state, 'done');
});

test('server alarm revalidates a retained level-31 rejection and its dependent ranking', async () => {
  const f = await started(shadow);
  f.db.offline = true;
  const event = f.command('/score-events', { events: [{ type: 'progress', survived_seconds: 20, level: 31, kills: 500, shadow_count: 5 }] });
  const rank = f.ranking(20);
  await f.accept([event, rank]);
  f.durable.sql.exec("UPDATE jobs SET state = 'review', last_error = 'invalid shadow survival level', response = '{}', http_status = 400 WHERE id = ?", event.id);
  f.db.offline = false; f.expireRetry();
  const restarted = new server.RankingDelivery({ storage: f.durable }, { DB: f.db });
  await restarted.alarm();
  assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get()?.score, 20);
  assert.equal(f.durable.alarmAt, null);
});

test('shadow still rejects forged time, invalid levels and unsafe integers', async () => {
  for (const changes of [{ level: 0 }, { level: Number.MAX_SAFE_INTEGER + 1 }, { kills: -1 }]) {
    const f = await started(shadow);
    const result = await f.accept([f.command('/score-events', { events: [
      { type: 'progress', survived_seconds: 5, level: 1, kills: 0, shadow_count: 0, ...changes },
    ] })]);
    assert.equal(result[0].state, 'review');
    assert.equal(f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score, 0);
  }
  const f = await started(shadow, 0);
  const result = await f.accept([f.command('/score-events', { events: [
    { type: 'progress', survived_seconds: 100, level: 31, kills: 1000, shadow_count: 5 },
  ] })]);
  assert.equal(result[0].state, 'pending');
  assert.equal(f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score, 0);
});

test('unsafe cumulative scores roll back; raising game limits does not bypass event validation', async () => {
  const f = await started('lumen-shift');
  f.db.sql.prepare('UPDATE ranking_sessions SET score = ?').run(Number.MAX_SAFE_INTEGER - 10);
  const result = await f.accept([f.event()]);
  assert.equal(result[0].state, 'review');
  assert.equal(f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score, Number.MAX_SAFE_INTEGER - 10);
});

for (const game of ['cat-tower', 'blockpang', 'jewelria', 'jelly-pang-2048', 'lumen-shift', 'parking_escape', shadow]) {
  test(`${game}: lost score response followed by database outage still registers exactly once`, async () => {
    const f = await started(game);
    let event;
    if (game === 'blockpang') event = { type: 'move', seq: 1, slot_index: 0, grid_x: 0, grid_y: 0 };
    else if (game === 'jelly-pang-2048') {
      const state = JSON.parse(f.db.sql.prepare('SELECT state_json FROM ranking_sessions').get().state_json);
      state.grid = [[0, 0, null, null], ...Array.from({ length: 3 }, () => Array(4).fill(null))];
      f.db.sql.prepare('UPDATE ranking_sessions SET state_json = ?').run(JSON.stringify(state));
      event = { type: 'move', move_seq: 1, dir: 'left' };
    } else if (game === 'cat-tower') event = { type: 'merge', created_tier: 1, combo: 1, delta: 25, seq: 1 };
    else if (game === 'jewelria') event = { type: 'match', removed: 3, longest: 3, lines: 1, special: 0, combo: 1, delta: 30 };
    else if (game === 'parking_escape') event = { type: 'level_clear', moves: 1, level_moves: 1, vehicles: 2, seed: 123 };
    else if (game === shadow) event = { type: 'progress', survived_seconds: 20, level: 31, kills: 500, shadow_count: 5 };
    else event = { type: 'clear', lines: 1, level: 1, combo: 1, delta: 100 };
    const command = f.command('/score-events', { events: [event] });
    f.db.loseResponse = true;
    assert.equal((await f.accept([command]))[0].state, 'pending');
    const score = f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score;
    assert.ok(score > 0);
    const rank = f.ranking(score);
    f.db.offline = true; await f.accept([rank]);
    f.db.offline = false; f.expireRetry();
    const restarted = new server.RankingDelivery({ storage: f.durable }, { DB: f.db });
    await restarted.alarm();
    await f.accept([command, rank]);
    assert.equal(f.db.sql.prepare('SELECT score, event_count FROM ranking_sessions').get().score, score);
    assert.equal(f.db.sql.prepare('SELECT event_count FROM ranking_sessions').get().event_count, 1);
    assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM ranking_submissions').get().n, 1);
    assert.equal(f.db.sql.prepare('SELECT score FROM ranking_submissions').get().score, score);
  });
}

test('retained malformed payloads are rechecked once and cannot hot-loop or publish', async () => {
  const f = await started(shadow);
  const invalid = f.command('/score-events', { events: [{ type: 'progress', survived_seconds: 20, level: 0, kills: 0, shadow_count: 0 }] });
  const rank = f.ranking(20);
  await f.accept([invalid, rank]);
  await f.mailbox.alarm();
  const attempts = f.durable.sql.exec('SELECT attempts FROM jobs WHERE id = ?', invalid.id).toArray()[0].attempts;
  await f.mailbox.alarm();
  assert.equal(f.durable.sql.exec('SELECT attempts FROM jobs WHERE id = ?', invalid.id).toArray()[0].attempts, attempts);
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 0);
});
