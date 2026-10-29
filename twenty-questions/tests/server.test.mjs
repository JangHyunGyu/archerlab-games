import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, modelResult } from './helpers.mjs';
import { parseDecision } from '../../server/twenty-questions/decision.mjs';
import { twentyQuestionsRoute } from '../../server/twenty-questions/service.mjs';
import { validateCandidate, replenish, conceptChunks, cleanOldRecords } from '../../server/twenty-questions/generation.mjs';
import { isCorrect } from '../../server/twenty-questions/core.mjs';
import { messages } from '../js/i18n.mjs';
import { submitRanking } from '../../game-api-worker.js';

test('start, resume and repeated start request retain one private answer', async () => {
    const h = harness(); const id = crypto.randomUUID();
    const a = await h.call('games', { requestId: id, locale: 'ko' });
    const b = await h.call('games', { requestId: id, locale: 'ko' });
    const c = await h.start();
    assert.equal(a.status, 200); assert.equal(a.data.game.id, b.data.game.id); assert.equal(c.game.id, a.data.game.id);
    assert.equal(h.row('SELECT COUNT(*) n FROM tq_seen').n, 1);
    assert.equal(a.data.game.remaining, 20);
    assert.equal(a.data.game.answer, undefined);
    assert.doesNotMatch(JSON.stringify(a.data), /answer_json|facts|aliasesKo|concept_id/);
    const foreign = await h.call(`games/${a.data.game.id}`, null, 'GET', 'b'.repeat(64));
    assert.equal(foreign.status, 404);
});

test('parallel starts are serialized and do not consume two words', async () => {
    const h = harness(); const results = await Promise.all([h.start(), h.start(), h.start()]);
    assert.equal(new Set(results.map(r => r.game.id)).size, 1);
    assert.equal(h.row('SELECT COUNT(*) n FROM tq_seen').n, 1);
});

test('yes/no charge once; repeats, unknown and multiple preserve turns', async () => {
    const h = harness(); let { game } = await h.start();
    let r = await h.turn(game, 'a clear question'); game = r.data.game;
    assert.equal(game.remaining, 19); assert.equal(h.calls, 1);
    r = await h.turn(game, '  A clear question  '); game = r.data.game;
    assert.equal(r.data.event.code, 'duplicate'); assert.equal(game.remaining, 19); assert.equal(h.calls, 1);
    r = await h.turn(game, 'unknown'); game = r.data.game;
    assert.equal(game.remaining, 19); assert.equal(r.data.event.code, 'unknown');
    r = await h.turn(game, 'multiple'); game = r.data.game;
    assert.equal(game.remaining, 19); assert.equal(r.data.event.code, 'multiple');
    r = await h.turn(game, 'no'); assert.equal(r.data.game.remaining, 18);
});

test('idempotent answers and conflicting reuse cannot change the score twice', async () => {
    const h = harness(); const { game } = await h.start(); const id = crypto.randomUUID();
    const a = await h.turn(game, 'yes question', 'questions', id);
    const b = await h.turn(game, 'yes question', 'questions', id);
    assert.equal(a.data.game.remaining, 19); assert.equal(b.data.game.remaining, 19); assert.equal(h.calls, 1);
    assert.equal((await h.turn(game, 'different question', 'questions', id)).status, 409);
    assert.equal((await h.turn(game, 'stale question')).data.error, 'stale_state');
});

test('twentieth action may win; twentieth question ends the game without extra guess', async () => {
    for (const win of [true, false]) {
        const h = harness(); let { game } = await h.start();
        for (let i = 0; i < 19; i++) game = (await h.turn(game, 'incorrect guess ' + i, 'guesses')).data.game;
        const r = await h.turn(game, win ? h.answer(game.id).en : 'final question', win ? 'guesses' : 'questions');
        assert.equal(r.data.game.status, win ? 'won' : 'lost');
        assert.equal(r.data.game.remaining, 0); assert.ok(r.data.game.answer);
        assert.equal(r.data.profile.streak, win ? 1 : 0);
        assert.equal((await h.turn(r.data.game, 'again', 'guesses')).data.error, 'game_finished');
    }
});

test('server keeps best streak and never repeats a consumed concept', async () => {
    const h = harness(); let state = await h.start(); const first = h.answer(state.game.id);
    state = (await h.turn(state.game, first.ko, 'guesses')).data;
    assert.equal(state.profile.streak, 1); assert.equal(state.profile.bestStreak, 1);
    state = await h.start(); assert.notEqual(h.answer(state.game.id).id, first.id);
    state = (await h.turn(state.game, h.answer(state.game.id).en.toUpperCase(), 'guesses')).data;
    assert.equal(state.profile.streak, 2); assert.equal(state.profile.bestTurns, 2);
    state = await h.start();
    state = (await h.turn(state.game, '', 'give-up')).data;
    assert.equal(state.profile.streak, 0); assert.equal(state.profile.bestStreak, 2);
    assert.equal(h.row('SELECT COUNT(*) n FROM tq_seen').n, 3);
    const rank = await h.call('leaderboard'); assert.equal(rank.data.entries[0].streak, 2);
});

test('winning automatically persists the ranked record before opening rankings or saving a name', async () => {
    const h = harness();
    const { game } = await h.start();
    const requestId = crypto.randomUUID();
    const won = await h.turn(game, h.answer(game.id).en, 'guesses', requestId);
    assert.equal(won.data.game.status, 'won');
    const stored = h.row('SELECT best_streak, best_turns, name FROM tq_players');
    assert.equal(stored.best_streak, 1);
    assert.equal(stored.best_turns, 1);
    assert.ok(stored.name);
    const replay = await h.turn(game, h.answer(game.id).en, 'guesses', requestId);
    assert.equal(replay.data.profile.bestStreak, 1);
    const resumed = await h.call('profile');
    assert.equal(resumed.data.profile.bestStreak, 1);
    const ranked = await h.call('leaderboard');
    assert.equal(ranked.data.entries.length, 1);
    assert.equal(ranked.data.mine.streak, 1);
    assert.equal(ranked.data.mine.name, stored.name);
    h.db.sqlite.close();
});

test('pool exhaustion retains streak; an appended concept becomes playable', async () => {
    const h = harness(); let state = await h.start();
    state = (await h.turn(state.game, h.answer(state.game.id).ko, 'guesses')).data;
    const player = h.row('SELECT id FROM tq_players').id;
    h.db.sqlite.prepare('INSERT OR IGNORE INTO tq_seen SELECT ?, id, ?, ? FROM tq_catalog').run(player, 'exhausted', Date.now());
    const r = await h.call('games', { requestId: crypto.randomUUID() });
    assert.equal(r.data.error, 'pool_exhausted'); assert.equal(h.row('SELECT streak FROM tq_players').streak, 1);
    const answer = { id: 'test.new', ko: '새로운 개념', en: 'new concept', aliasesKo: [], aliasesEn: [], category: 'test', facts: 'A test-only card.' };
    h.db.sqlite.prepare('INSERT INTO tq_catalog(id, ko_key, en_key, data, created_at) VALUES (?, ?, ?, ?, ?)').run(answer.id, answer.ko, answer.en, JSON.stringify(answer), Date.now());
    const next = await h.start(); assert.equal(h.answer(next.game.id).id, answer.id);
});

test('model outage preserves turns and pauses session expiration', async () => {
    const h = harness(); let { game } = await h.start();
    const r = await h.turn(game, 'outage'); assert.equal(r.status, 503);
    let snapshot = h.row('SELECT * FROM tq_games WHERE id = ?', game.id);
    assert.equal(snapshot.used, 0); assert.ok(snapshot.fault_since);
    h.db.sqlite.prepare('UPDATE tq_games SET expires_at = ?, fault_since = ? WHERE id = ?').run(Date.now() - 1000, Date.now() - 10000, game.id);
    game = (await h.call(`games/${game.id}`)).data.game; assert.equal(game.status, 'active');
    const ok = await h.turn(game, 'a valid question'); assert.equal(ok.status, 200); assert.equal(ok.data.game.remaining, 19);
    snapshot = h.row('SELECT * FROM tq_games WHERE id = ?', game.id); assert.equal(snapshot.fault_since, null); assert.ok(snapshot.expires_at > Date.now());
});

test('normal expiration ends current streak, preserves best and consumed history', async () => {
    const h = harness(); const state = await h.start();
    h.db.sqlite.prepare('UPDATE tq_players SET streak = 3, best_streak = 3').run();
    h.db.sqlite.prepare('UPDATE tq_games SET expires_at = 1').run();
    const expired = await h.call(`games/${state.game.id}`);
    assert.equal(expired.data.game.status, 'expired'); assert.equal(expired.data.profile.streak, 0);
    assert.equal(expired.data.profile.bestStreak, 3); assert.equal(h.row('SELECT COUNT(*) n FROM tq_seen').n, 1);
});

test('question limit still allows guesses and model budget is bounded', async () => {
    const h = harness(); let { game } = await h.start();
    h.db.sqlite.prepare('UPDATE tq_games SET requests_count = 60 WHERE id = ?').run(game.id);
    assert.equal((await h.turn(game, 'valid')).data.error, 'question_limit');
    assert.equal((await h.turn(game, h.answer(game.id).en, 'guesses')).data.game.status, 'won');
    ({ game } = await h.start()); h.env.TQ_DAILY_CALL_LIMIT = 1;
    game = (await h.turn(game, 'one question')).data.game;
    const next = await h.turn(game, 'another question'); assert.equal(next.data.error, 'daily_limit');
    assert.ok(h.row('SELECT fault_since FROM tq_games WHERE id = ?', game.id).fault_since);
});

test('leaderboard breaks ties using turns from the same best record', async () => {
    const h = harness(); await h.start();
    for (const [id, streak, turns, at] of [['b', 7, 81, 1], ['c', 7, 65, 2], ['d', 6, 40, 0]]) {
        h.db.sqlite.prepare('INSERT INTO tq_players(id, name, best_streak, best_turns, best_at, last_seen) VALUES (?, ?, ?, ?, ?, 0)').run(id, id, streak, turns, at);
    }
    const result = await h.call('leaderboard'); assert.deepEqual(result.data.entries.map(row => row.name), ['c', 'b', 'd']);
    assert.ok(result.data.entries.every(row => !Object.hasOwn(row, 'id')));
});

test('invalid model output never becomes a yes/no; known types map correctly', () => {
    assert.equal(parseDecision(modelResult('yes')).code, 'yes'); assert.equal(parseDecision(modelResult('no')).code, 'no');
    const wrong = modelResult(); wrong.answers.answer_yes.noul = 'yes'; assert.throws(() => parseDecision(wrong));
    const vague = modelResult(); vague.answers.answer_yes.noul = 0.5; assert.equal(parseDecision(vague).code, 'unknown');
    assert.throws(() => parseDecision({ answers: {} }));
});

test('guess matching is exact, normalized and bilingual', () => {
    const answer = { ko: '펭귄', en: 'penguin', aliasesEn: ['penguins'] };
    assert.ok(isCorrect(answer, ' PENGUIN ')); assert.ok(isCorrect(answer, '펭귄'));
    assert.ok(!isCorrect(answer, 'bird')); assert.ok(!isCorrect(answer, 'pen'));
});

test('CORS denies foreign origins and inputs have bounded length', async () => {
    const h = harness();
    const forbidden = await twentyQuestionsRoute(new Request('https://api/twenty-questions/status', { headers: { Origin: 'https://other.example' } }), h.env);
    assert.equal(forbidden.status, 403);
    const { game } = await h.start(); assert.equal((await h.turn(game, 'a'.repeat(201))).data.error, 'input_too_long');
});

test('replenishment skips while stock is sufficient; invalid candidates cannot be inserted', async () => {
    const h = harness(); h.env.TQ_TEXT = { complete() { throw new Error('Should not generate'); } };
    assert.equal((await replenish(h.env)).skipped, 'stock_sufficient');
    assert.ok(!validateCandidate({ id: 'bad' }));
});

test('localized keys match and browser files contain no secret catalog import', () => {
    assert.deepEqual(Object.keys(messages.ko).sort(), Object.keys(messages.en).sort());
    for (const file of ['main.mjs', 'api.mjs', 'audio.mjs', 'i18n.mjs']) {
        const source = fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /seed-catalog|answer_json|OPENROUTER_API_KEY/);
    }
    const routes = JSON.parse(fs.readFileSync(new URL('../../_routes.json', import.meta.url)));
    assert.ok(routes.include.includes('/server/*'));
});

test('verification batches stay within the RPC byte budget as the catalog grows', () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ ko_key: '긴이름'.repeat(12) + i, en_key: 'long concept name '.repeat(3) + i }));
    const chunks = conceptChunks(rows);
    assert.equal(chunks.flat().length, 2000);
    assert.ok(chunks.every(chunk => new TextEncoder().encode(JSON.stringify(chunk)).length <= 6000));
});

test('returning players refresh activity even when no words remain', async () => {
    const h = harness(); const state = await h.start(); await h.turn(state.game, '', 'give-up');
    const player = h.row('SELECT id FROM tq_players').id;
    h.db.sqlite.prepare('INSERT OR IGNORE INTO tq_seen SELECT ?, id, ?, ? FROM tq_catalog').run(player, 'done', 1);
    h.db.sqlite.prepare('UPDATE tq_players SET last_seen = 1').run();
    assert.equal((await h.call('games', { requestId: crypto.randomUUID() })).data.error, 'pool_exhausted');
    assert.ok(h.row('SELECT last_seen FROM tq_players').last_seen > Date.now() - 1000);
});

test('cleanup deletes old logs and limits but retains seen concepts and best records', async () => {
    const h = harness(); let state = await h.start(); state = (await h.turn(state.game, h.answer(state.game.id).en, 'guesses')).data;
    h.db.sqlite.prepare('UPDATE tq_games SET updated_at = 1').run();
    h.db.sqlite.prepare('INSERT INTO tq_limits(key, count, expires_at) VALUES (?, 1, 1)').run('old');
    await cleanOldRecords(h.db);
    assert.equal(h.row('SELECT COUNT(*) n FROM tq_turns').n, 0);
    assert.equal(h.row('SELECT COUNT(*) n FROM tq_games').n, 0);
    assert.equal(h.row('SELECT COUNT(*) n FROM tq_seen').n, 1);
    assert.equal(h.row('SELECT best_streak FROM tq_players').best_streak, 1);
});

test('the shared score API rejects client-provided Twenty Questions scores', async () => {
    const response = await submitRanking({}, { game_id: 'twenty-questions', player_name: 'Fake', score: 999999 });
    assert.equal(response.status, 403);
});

test('missing model verification probability cannot publish a generated answer', async () => {
    const h = harness(); await h.start();
    const player = h.row('SELECT id FROM tq_players').id;
    h.db.sqlite.prepare('INSERT OR IGNORE INTO tq_seen SELECT ?, id, ?, ? FROM tq_catalog LIMIT 175').run(player, 'seen', Date.now());
    const candidate = { id: 'object.testnew', ko: '검증시험', en: 'verification test', aliasesKo: [], aliasesEn: [], category: 'objects', wikiTitle: 'Abacus', facts: 'This is an isolated test candidate. Its long factual description exists only to exercise the validation gate and must never enter the playable catalog without a numeric confidence.' };
    h.env.TQ_TEXT = { async complete(input) { return { text: JSON.stringify(input.maxTokens === 6000 ? { items: [candidate] } : { facts: candidate.facts }) }; } };
    h.env.TQ_AI = { async decide() { return { answers: { supported: { type: 'noul' } } }; } };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ extract: 'This test excerpt is long enough to enter the verification stage, but the model response intentionally omits its probability value.' });
    try {
        const result = await replenish(h.env);
        assert.equal(result.added, 0); assert.equal(h.row('SELECT COUNT(*) n FROM tq_catalog WHERE id = ?', candidate.id).n, 0);
    } finally { globalThis.fetch = originalFetch; }
});
