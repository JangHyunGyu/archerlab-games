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

async function zombieRun() {
  const f = fixture('school-zombie-defense');
  const response = await server.api.fetch(new Request('https://api/school-zombie/profile', { method: 'POST', body: '{}' }), { DB: f.db });
  const profile = await response.json();
  const auth = { profile_id: profile.profile_id, profile_secret: profile.profile_secret };
  await f.accept([f.command('/score-sessions', auth)]);
  f.db.sql.exec('UPDATE ranking_sessions SET started_at = started_at - 60000');
  const clear = f.command('/score-events', { ...auth, event: { type: 'stage_clear', cleared_stage: 1, reached_stage: 2, level: 5, kills: 60 } });
  assert.equal((await f.accept([clear]))[0].state, 'done');
  const progress = seconds => f.command('/score-events', { ...auth, event: { type: 'run_progress', run_coins: 60, reward_counts: {1:60,2:0,3:0,4:0}, kills:60, reached_stage:2, level:5, survived_seconds:seconds } });
  return {...f, auth, progress};
}

test('school zombie: 1.5x and 2x clocks register immediately after reward progress', async () => {
  for (const seconds of [90, 120]) {
    const f = await zombieRun();
    const result = await f.accept([f.progress(seconds), f.ranking(1)]);
    assert.ok(result.every(row => row.state === 'done'), JSON.stringify(result));
    assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 1);
  }
});

test('school zombie: invalid optional reward progress cannot block an already verified ranking', async () => {
  const f = await zombieRun();
  const invalid = f.progress(120); invalid.body.event.run_coins = 99999;
  const result = await f.accept([invalid, f.ranking(1)]);
  assert.equal(result[0].state, 'review', 'reward amount inconsistent with kills stays rejected');
  assert.equal(result[1].state, 'done', 'stage score remains independently verified');
  assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get().score, 1);
});

test('school zombie: invalid stage evidence cannot bypass ranking verification', async () => {
  const f = await zombieRun();
  const wrong = f.command('/score-events', {...f.auth, event:{type:'stage_clear',cleared_stage:2,reached_stage:3,level:9,kills:0}});
  const result = await f.accept([wrong, f.ranking(2)]);
  assert.equal(result[0].state, 'review');
  assert.equal(result[1].state, 'pending');
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM rankings').get().n, 0);
});

test('school zombie: retained clock-validation failures are revalidated on resend', async () => {
  const f = await zombieRun(); const command = f.progress(120);
  f.db.offline = true;
  await f.accept([command]);
  f.durable.sql.exec("UPDATE jobs SET state='review', last_error='invalid school zombie survived time' WHERE id=?",command.id);
  f.db.offline = false;
  const result=await f.accept([command,f.ranking(1)]);
  assert.ok(result.every(row=>row.state==='done'),JSON.stringify(result));
});

test('school zombie: alarm recovers an old clock rejection and its blocked stage without the browser', async () => {
  const f = await zombieRun(); const progress = f.progress(120);
  const stage = f.command('/score-events', {...f.auth, event:{type:'stage_clear',cleared_stage:2,reached_stage:3,level:9,kills:200}});
  const rank = f.ranking(2);
  f.db.offline = true;
  await f.accept([progress,stage,rank]);
  const original = f.durable.sql.exec('SELECT payload, hash FROM jobs WHERE id=?',progress.id).toArray()[0];
  f.durable.sql.exec("UPDATE jobs SET state='review', last_error='invalid school zombie survived time' WHERE id=?",progress.id);
  f.db.offline = false; f.expireRetry();
  const restarted = new server.RankingDelivery({storage:f.durable},{DB:f.db});
  await restarted.alarm();
  assert.equal(f.db.sql.prepare('SELECT score FROM rankings').get().score,2);
  assert.deepEqual(f.durable.sql.exec('SELECT payload, hash FROM jobs WHERE id=?',progress.id).toArray()[0],original);
  assert.ok(f.durable.sql.exec('SELECT state FROM jobs').toArray().every(row=>row.state==='done'));
  assert.equal(f.durable.alarmAt,null);
});

test('school zombie: stage validation uses sequence and kills instead of elapsed time', async () => {
  const f=await zombieRun();
  f.db.sql.exec('UPDATE ranking_sessions SET started_at='+ Date.now());
  const stage=f.command('/score-events',{...f.auth,event:{type:'stage_clear',cleared_stage:2,reached_stage:3,level:9,kills:200}});
  assert.equal((await f.accept([stage]))[0].state,'done');
  const invalid=f.command('/score-events',{...f.auth,event:{type:'stage_clear',cleared_stage:3,reached_stage:4,level:13,kills:0}});
  assert.equal((await f.accept([invalid]))[0].state,'review','missing kill evidence is rejected regardless of time');
});

const bankPath = '/school-zombie/profile/bank-run';
const netReward = () => ({ type:'run_progress',run_coins:55,reward_counts:{1:50,2:10,3:0,4:0},
  reroll_levels:[2,3],kills:60,reached_stage:2,level:5,survived_seconds:999999 });
async function fundedRun() {
  const f=await zombieRun();
  f.db.sql.exec('UPDATE school_zombie_profiles SET coins=100');
  f.db.sql.exec('UPDATE ranking_sessions SET started_at='+Date.now());
  return f;
}

test('zombie coins: existing 100 plus 70 rewards minus 15 rerolls equals 155, exactly once', async()=>{
  const f=await fundedRun();const bank=f.command(bankPath,{...f.auth,event:netReward()});
  const result=(await f.accept([bank]))[0];assert.equal(result.state,'done');
  assert.equal(result.data.earned_coins,55);assert.equal(result.data.profile.coins,155);
  await Promise.all([f.accept([bank]),f.accept([f.command(bankPath,{...f.auth,event:netReward()})])]);
  assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,155);
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM school_zombie_coin_claims').get().n,1);
});

test('zombie coins: each mid-transaction failure rolls back wallet, claim and final ledger',async()=>{
  for(const fail of [0,1,2]) {
    const f=await fundedRun();const bank=f.command(bankPath,{...f.auth,event:netReward()});
    f.db.failStatement=fail;assert.equal((await f.accept([bank]))[0].state,'pending');
    assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,100);
    assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM school_zombie_coin_claims').get().n,0);
    assert.equal(JSON.parse(f.db.sql.prepare('SELECT state_json FROM ranking_sessions').get().state_json).run_coins,undefined);
    f.db.failStatement=-1;f.expireRetry();await f.mailbox.alarm();
    assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,155);
  }
});

test('zombie coins: lost commit response and object restart never lose or double rewards',async()=>{
  const f=await fundedRun();const bank=f.command(bankPath,{...f.auth,event:netReward()});
  f.db.loseResponse=true;assert.equal((await f.accept([bank]))[0].state,'pending');
  assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,155);
  f.expireRetry();await new server.RankingDelivery({storage:f.durable},{DB:f.db}).alarm();
  assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,155);
  assert.equal(f.durable.sql.exec('SELECT state FROM jobs WHERE id=?',bank.id).toArray()[0].state,'done');
});

test('zombie coins: simultaneous distinct runs add to the same profile rather than replacing its balance',async()=>{
  const f=await fundedRun();const b=fixture('school-zombie-defense');
  const mailbox=new server.RankingDelivery({storage:b.durable},{DB:f.db});
  const accept=commands=>mailbox.accept(b.session,'school-zombie-defense',commands,{});
  await accept([b.command('/score-sessions',f.auth)]);
  const early={type:'run_progress',run_coins:4,reward_counts:{1:4,2:0,3:0,4:0},reroll_levels:[],kills:4,level:1,reached_stage:1};
  await Promise.all([f.accept([f.command(bankPath,{...f.auth,event:netReward()})]),accept([b.command(bankPath,{...f.auth,event:early})])]);
  assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,159);
});

test('zombie coins: invalid reward/reroll/wave evidence and wrong profile cannot credit money',async()=>{
  for(const change of [e=>e.run_coins=9999,e=>e.reroll_levels=[2,2],e=>e.level=1,e=>e.reward_counts[1]=49]) {
    const f=await fundedRun();const event=netReward();change(event);
    assert.equal((await f.accept([f.command(bankPath,{...f.auth,event})]))[0].state,'review');
    assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,100);
  }
  const f=await fundedRun();const profile=await (await server.api.fetch(new Request('https://api/school-zombie/profile',{method:'POST',body:'{}'}),{DB:f.db})).json();
  const wrong={profile_id:profile.profile_id,profile_secret:profile.profile_secret};
  assert.equal((await f.accept([f.command(bankPath,{...wrong,event:netReward()})]))[0].status,403);
});

test('zombie coins: legacy net balances accept only deductions possible under reroll prices',async()=>{
  for(const [coins,state] of [[55,'done'],[56,'review']]) {
    const f=await fundedRun();const event=netReward();delete event.reroll_levels;event.run_coins=coins;
    assert.equal((await f.accept([f.command(bankPath,{...f.auth,event})]))[0].state,state);
  }
});

test('zombie coins: invalid optional bank does not block independently verified ranking',async()=>{
  const f=await fundedRun();const event=netReward();event.run_coins=9999;
  const result=await f.accept([f.command(bankPath,{...f.auth,event}),f.ranking(1)]);
  assert.equal(result[0].state,'review');assert.equal(result[1].state,'done');
  assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,100);
});

test('zombie coins: final net may decrease after a priced reroll; new-stage surcharge is retained',async()=>{
  const f=await fundedRun();const gross=netReward();gross.reroll_levels=[];gross.run_coins=70;
  assert.equal((await f.accept([f.command('/score-events',{...f.auth,event:gross})]))[0].state,'done');
  const net=netReward();net.reroll_levels=[2,5];net.run_coins=50;
  const result=(await f.accept([f.command(bankPath,{...f.auth,event:net})]))[0];
  assert.equal(result.state,'done');assert.equal(result.data.profile.coins,150);
});

test('zombie coins: invalid intermediate rewards cannot strand valid later progress and final payment', async () => {
  const f = await fundedRun();
  const invalid = netReward(); invalid.run_coins = 9999;
  const first = f.command('/score-events', { ...f.auth, event: invalid });
  const later = f.command('/score-events', { ...f.auth, event: netReward() });
  const bank = f.command(bankPath, { ...f.auth, event: netReward() });
  const results = await f.accept([first, later, bank, f.ranking(1)]);
  assert.deepEqual(results.map(result => result.state), ['review', 'done', 'done', 'done']);
  assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins, 155);
});

test('zombie coins: alarm revalidates retained pre-fix net-reroll claims without client resending', async () => {
  const f = await fundedRun();
  const event = netReward(); delete event.reroll_levels;
  const bank = f.command(bankPath, { ...f.auth, event });
  f.db.offline = true; await f.accept([bank]); f.db.offline = false;
  f.durable.sql.exec("UPDATE jobs SET state='review', last_error='school zombie run coins must match reward counts' WHERE id=?", bank.id);
  await new server.RankingDelivery({ storage: f.durable }, { DB: f.db }).alarm();
  assert.equal(f.db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins, 155);
  assert.equal(f.durable.sql.exec('SELECT state FROM jobs WHERE id=?', bank.id).toArray()[0].state, 'done');
});

test('zombie profile: each wallet mutation has a strictly increasing revision, including purchases and refunds', async () => {
  const f = await fundedRun();
  f.db.sql.exec('UPDATE school_zombie_profiles SET coins=1000');
  const call = async (path, body) => {
    const response = await server.api.fetch(new Request('https://api' + path, { method: 'POST', body: JSON.stringify({ ...f.auth, ...body }) }), { DB: f.db });
    assert.equal(response.status, 200); return response.json();
  };
  const initial = await call('/school-zombie/profile', {});
  const bank = (await f.accept([f.command(bankPath, { ...f.auth, event: netReward() })]))[0].data;
  const purchase = await call('/school-zombie/profile/buy-upgrade', { upgrade_id: 'a_power' });
  const refund = await call('/school-zombie/profile/reset-upgrades', {});
  assert.ok(initial.profile_revision < bank.profile_revision);
  assert.ok(bank.profile_revision < purchase.profile_revision);
  assert.ok(purchase.profile_revision < refund.profile_revision);
  assert.equal(refund.coins, purchase.coins + refund.refund);
});
