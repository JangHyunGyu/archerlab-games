const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixture, server } = require('../helpers/ranking-delivery.cjs');

test('D1 outage: server keeps the run and submits it from an alarm after the browser is gone', async () => {
  const f = fixture(); f.db.offline = true;
  const commands = [f.command('/score-sessions'), f.event(), f.ranking()];
  const pending = await f.accept(commands);
  assert.ok(pending.every(result => result.state === 'pending'));
  assert.ok(f.durable.alarmAt > Date.now());
  assert.equal(f.durable.sql.exec('SELECT COUNT(*) AS n FROM jobs').toArray()[0].n, 3);
  f.db.offline = false;
  const restarted = new server.RankingDelivery({ storage: f.durable }, { DB: f.db });
  await restarted.alarm();
  assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get().score, 100);
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM ranking_submissions').get().n, 1);
  assert.equal(f.durable.alarmAt, null);
});

test('lost commit response and concurrent retries apply additive score only once', async () => {
  const f = fixture(); await f.accept([f.command('/score-sessions')]);
  const event = f.event(); f.db.loseResponse = true;
  assert.equal((await f.accept([event]))[0].state, 'pending');
  assert.equal(f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score, 100);
  f.expireRetry();
  await Promise.all([f.accept([event]), f.accept([event]), f.mailbox.alarm()]);
  assert.equal(f.db.sql.prepare('SELECT score, event_count FROM ranking_sessions').get().event_count, 1);
  assert.equal(f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score, 100);
  assert.equal((await f.accept([f.ranking()]))[0].state, 'done');
});

test('ranking insert, session consumption and receipt roll back together', async () => {
  const f = fixture(); await f.accept([f.command('/score-sessions'), f.event()]);
  const rank = f.ranking(); f.db.failStatement = 2;
  await f.accept([rank]);
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 0);
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM ranking_submissions').get().n, 0);
  assert.equal(f.db.sql.prepare('SELECT submitted_at FROM ranking_sessions').get().submitted_at, null);
  f.db.failStatement = -1; f.expireRetry(); await f.mailbox.alarm();
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 1);
  await f.accept([rank]);
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 1);
});

test('late/missing dependencies wait durably, then save the complete score', async () => {
  const f = fixture(); const start = f.command('/score-sessions'); const event = f.event(); const rank = f.ranking();
  await f.accept([rank]);
  assert.ok(f.durable.alarmAt - Date.now() > 50000, 'missing dependency does not hot-loop alarms');
  await f.accept([event, start]);
  assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get().score, 100);
});

test('same session resubmission is idempotent and cannot switch player identity', async () => {
  const f = fixture(); await f.accept([f.command('/score-sessions'), f.event(), f.ranking()]);
  const retry = f.ranking(); retry.after = null;
  assert.equal((await f.accept([retry]))[0].state, 'done');
  const changed = f.ranking(100, 'Different player'); changed.after = null;
  assert.equal((await f.accept([changed]))[0].state, 'review');
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 1);
});

test('saved sessions survive six hours and records outside top 100 are retained', async () => {
  const f = fixture(); await f.accept([f.command('/score-sessions')]);
  f.db.sql.exec('UPDATE ranking_sessions SET started_at = started_at - 864000000, updated_at = updated_at - 864000000');
  const insert = f.db.sql.prepare('INSERT INTO rankings (game_id, player_name, score) VALUES (?, ?, ?)');
  for (let i = 0; i < 105; i++) insert.run('lumen-shift', `Existing ${i}`, 1000 + i);
  await f.accept([f.event(), f.ranking()]);
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 106);
  const response = await server.api.fetch(new Request('https://api/rankings?game_id=lumen-shift&limit=20'), { DB: f.db });
  assert.equal((await response.json()).rankings.length, 20);
});

test('invalid score is retained for review without being published or called successful', async () => {
  const f = fixture(); await f.accept([f.command('/score-sessions')]);
  const invalid = f.command('/score-events', { events: [{ type: 'clear', lines: 1, level: 1, combo: 1, delta: 999999 }] });
  const result = (await f.accept([invalid]))[0];
  assert.equal(result.state, 'review'); assert.equal(result.status, 400);
  assert.equal(f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score, 0);
  assert.ok(f.durable.sql.exec('SELECT payload FROM jobs WHERE id = ?', invalid.id).toArray()[0].payload);
});

test('reused event id with a different payload cannot alter a committed score', async () => {
  const f = fixture(); await f.accept([f.command('/score-sessions')]);
  const event = f.event(); await f.accept([event]);
  const changed = structuredClone(event); changed.body.events[0].delta = 200;
  await assert.rejects(f.accept([changed]), /reused/);
  assert.equal(f.db.sql.prepare('SELECT score FROM ranking_sessions').get().score, 100);
});

for (const [game, event, score] of [
  ['cat-tower', { type: 'merge', created_tier: 1, combo: 1, delta: 25, seq: 1 }, 25],
  ['jewelria', { type: 'match', removed: 3, longest: 3, lines: 1, special: 0, combo: 1, delta: 30 }, 30],
  ['parking_escape', { type: 'level_clear', moves: 1, level_moves: 1, vehicles: 2, seed: 123 }, 2],
  ['shadow-survival-character-v1-shadowMonarch', { type: 'progress', survived_seconds: 5, level: 1, rank: 'E', kills: 0, shadow_count: 0 }, 5],
]) {
  test(`${game}: existing score validation works through durable delivery`, async () => {
    const f = fixture(game);
    const results = await f.accept([f.command('/score-sessions'), f.command('/score-events', { events: [event] }), f.ranking(score)]);
    assert.ok(results.every(result => result.state === 'done'), JSON.stringify(results));
    assert.equal(f.db.sql.prepare('SELECT score FROM ranking_submissions').get().score, score);
    assert.equal(results.at(-1).data.rank, 1);
  });
}

test('blockpang: server-generated pieces, authoritative move and final score are preserved', async () => {
  const f = fixture('blockpang'); const start = (await f.accept([f.command('/score-sessions', { seed: 12345 })]))[0];
  const score = start.data.pieces[0].cellCount;
  const results = await f.accept([f.command('/score-events', { events: [{ type: 'move', seq: 1, slot_index: 0, grid_x: 0, grid_y: 0 }] }), f.ranking(score)]);
  assert.ok(results.every(result => result.state === 'done'), JSON.stringify(results));
  assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get().score, score);
});

test('school zombie: profile-bound stage clears retain authentication and ranking tie-break data', async () => {
  const f = fixture('school-zombie-defense');
  const response = await server.api.fetch(new Request('https://api/school-zombie/profile', { method: 'POST', body: '{}' }), { DB: f.db });
  const profile = await response.json();
  const auth = { profile_id: profile.profile_id, profile_secret: profile.profile_secret };
  await f.accept([f.command('/score-sessions', auth)]);
  f.db.sql.exec('UPDATE ranking_sessions SET started_at = started_at - 60000');
  const result = await f.accept([f.command('/score-events', { ...auth, events: [{ type: 'stage_clear', cleared_stage: 1, reached_stage: 2, level: 5, kills: 60 }] }),
    f.command('/rankings', { player_name: 'Stage test', score: 1, extra_data: { kills: 60 } })]);
  assert.ok(result.every(row => row.state === 'done'), JSON.stringify(result));
  assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get().score, 1);
});
