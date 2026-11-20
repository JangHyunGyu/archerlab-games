import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness } from './helpers.mjs';
import { twentyQuestionsRoute, handleRoomRequest } from '../../server/twenty-questions/service.mjs';
import {
    RULESET, roundSlotAt, previousRoundSlot, selectRoundSecretIndex,
    calibrateSim, sanitizePlayerName,
} from '../../server/twenty-questions/core.mjs';
import { submitRanking } from '../../game-api-worker.js';

test('6-hour KST round schedule aligns to 00:00, 06:00, 12:00, 18:00 and rotates secrets cleanly', async () => {
    const s00 = roundSlotAt(Date.parse('2026-11-20T00:00:00+09:00'));
    const s0559 = roundSlotAt(Date.parse('2026-11-20T05:59:59+09:00'));
    const s06 = roundSlotAt(Date.parse('2026-11-20T06:00:00+09:00'));
    const s12 = roundSlotAt(Date.parse('2026-11-20T12:00:00+09:00'));
    const s18 = roundSlotAt(Date.parse('2026-11-20T18:00:00+09:00'));
    const s2359 = roundSlotAt(Date.parse('2026-11-20T23:59:59+09:00'));
    const sNext00 = roundSlotAt(Date.parse('2026-11-21T00:00:00+09:00'));

    assert.equal(s00.roundId, '2026-11-20T00');
    assert.equal(s00.roundNo, 1);
    assert.equal(s0559.roundId, s00.roundId);
    assert.equal(s06.roundId, '2026-11-20T06');
    assert.equal(s06.roundNo, 2);
    assert.equal(s12.roundId, '2026-11-20T12');
    assert.equal(s12.roundNo, 3);
    assert.equal(s18.roundId, '2026-11-20T18');
    assert.equal(s18.roundNo, 4);
    assert.equal(s2359.roundId, s18.roundId);
    assert.equal(sNext00.roundId, '2026-11-21T00');
    assert.equal(sNext00.roundNo, 5);
    assert.equal(s12.endsAt - s12.startedAt, 6 * 3600 * 1000);
    assert.equal(previousRoundSlot(s12).roundId, '2026-11-20T06');

    const picked = new Set();
    for (let i = 0; i < 4; i++) {
        picked.add(await selectRoundSecretIndex(s00.slotIndex + i, 4));
    }
    assert.equal(picked.size, 4);
});

test('all players share identical round secret and scores while give-up and secret leaks stay blocked', async () => {
    const h = harness({ secretWords: ['행복', '학교', '사과'] });
    const id = crypto.randomUUID();
    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);

    const a = await h.call('games', { requestId: id, locale: 'ko' }, 'POST', tokenA);
    const aDup = await h.call('games', { requestId: id, locale: 'ko' }, 'POST', tokenA);
    const b = await h.start(tokenB);

    assert.equal(a.status, 200);
    assert.equal(a.data.game.id, aDup.data.game.id);
    assert.equal(a.data.round.id, b.round.id);
    assert.equal(a.data.round.roundNo, 3);
    assert.equal(a.data.game.answer, undefined);
    assert.deepEqual(a.data.game.benchmarks, b.game.benchmarks);
    assert.equal(h.answer(a.data.game.id), h.answer(b.game.id));
    assert.doesNotMatch(JSON.stringify(a.data), /answer_word|secret_id|sim_scale/);

    // Same guess scores identically for both players.
    const ga = await h.guess(a.data.game, '사람', crypto.randomUUID(), tokenA);
    const gb = await h.guess(b.game, '사람', crypto.randomUUID(), tokenB);
    assert.equal(ga.data.event.similarity, gb.data.event.similarity);

    // Give-up endpoint is permanently removed (404), foreign game is 404, nearest/explore are 403 while active.
    assert.equal((await h.call(`games/${a.data.game.id}/give-up`, { requestId: crypto.randomUUID(), expectedVersion: 1 }, 'POST', tokenA)).status, 404);
    assert.equal((await h.call(`games/${a.data.game.id}`, null, 'GET', tokenB)).status, 404);
    assert.equal((await h.call(`games/${a.data.game.id}/nearest`, null, 'GET', tokenA)).status, 403);
    assert.equal((await h.call(`games/${a.data.game.id}/explore`, { text: '사랑' }, 'POST', tokenA)).status, 403);
    h.db.sqlite.close();
});

test('parallel starts are serialized and create only one game per player per round', async () => {
    const h = harness();
    const results = await Promise.all([h.start(), h.start(), h.start()]);
    assert.equal(new Set(results.map(r => r.game.id)).size, 1);
    assert.equal(h.row('SELECT COUNT(*) n FROM sm_games').n, 1);
    h.db.sqlite.close();
});

test('guesses charge count cleanly while OOV and duplicates do not alter version or guessCount', async () => {
    const h = harness({ secretWords: ['행복', '학교', '사과'] });
    let { game } = await h.start();

    let res = await h.guess(game, '기쁨');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.code, 'guess');
    assert.equal(res.data.game.guessCount, 1);
    game = res.data.game;

    res = await h.guess(game, '물');
    assert.equal(res.status, 200);
    assert.equal(res.data.game.guessCount, 2);
    game = res.data.game;

    res = await h.guess(game, '기쁨');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.code, 'duplicate');
    assert.equal(res.data.game.guessCount, 2);
    assert.equal(res.data.game.version, game.version);

    res = await h.guess(game, '뷁뷁뷁');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.code, 'unknown_word');
    assert.equal(res.data.game.guessCount, 2);

    res = await h.guess(game, 'hello');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.code, 'unknown_word');
    assert.equal(res.data.game.guessCount, 2);

    const reqId = crypto.randomUUID();
    const g1 = await h.guess(game, '사랑', reqId);
    const g2 = await h.guess(game, '사랑', reqId);
    assert.equal(g1.data.game.guessCount, 3);
    assert.equal(g2.data.game.guessCount, 3);
    assert.equal(g2.data.event.replayed, true);
    assert.equal((await h.guess(game, '사람', reqId)).status, 409);

    h.db.sqlite.close();
});

test('Option A round-open ranking, anti-cheat filters, current solver display, and name updates work end to end', async () => {
    // 500ms after 12:00 KST round open: too fast (<1.5s) to block round-start bot sniping.
    const roundStart = Date.parse('2026-11-20T12:00:00+09:00');
    const h = harness({ secretWords: ['행복', '학교', '사과'], initialNow: roundStart + 500 });
    const tokenFastBot = '1'.repeat(64);
    const tokenSingle = '2'.repeat(64);
    const tokenP1 = '3'.repeat(64);
    const tokenP2 = '4'.repeat(64);

    // Sub-1.5s multi-guess solve stays unranked and off the solver display.
    const botStart = await h.start(tokenFastBot);
    const answer = h.answer(botStart.game.id);
    const botG1 = (await h.guess(botStart.game, '사람', crypto.randomUUID(), tokenFastBot)).data;
    const botWin = await h.guess(botG1.game, answer, crypto.randomUUID(), tokenFastBot);
    assert.equal(botWin.data.game.status, 'won');
    assert.equal(botWin.data.game.ranked, false);
    assert.equal(botWin.data.game.unrankedReason, 'too_fast');
    assert.equal(botWin.data.round.solverCount, 0);

    // Advance past 1.5s: single-guess solve stays unranked (anti-spoiler).
    h.setNow(roundStart + 5000);
    const singleStart = await h.start(tokenSingle);
    const singleWin = await h.guess(singleStart.game, answer, crypto.randomUUID(), tokenSingle);
    assert.equal(singleWin.data.game.status, 'won');
    assert.equal(singleWin.data.game.ranked, false);
    assert.equal(singleWin.data.game.unrankedReason, 'single_guess');
    assert.equal(singleWin.data.round.solverCount, 0);

    // Player 1 joins late (at +10s) and solves at +15s -> Option A solvedMs = 15,000ms.
    h.setNow(roundStart + 10000);
    const p1Start = await h.start(tokenP1);
    const p1G1 = (await h.guess(p1Start.game, '사람', crypto.randomUUID(), tokenP1)).data;
    h.setNow(roundStart + 15000);
    const p1Win = await h.guess(p1G1.game, answer, crypto.randomUUID(), tokenP1);
    assert.equal(p1Win.data.game.ranked, true);
    assert.equal(p1Win.data.game.solvedMs, 15000);
    assert.equal(p1Win.data.profile.bestTimeMs, 15000);
    assert.equal(p1Win.data.profile.hasCustomName, false);
    assert.equal(p1Win.data.round.solverCount, 1);
    assert.equal(p1Win.data.round.firstSolver.hasCustomName, false);
    assert.equal(p1Win.data.round.firstSolver.solvedMs, 15000);

    // Player 2 tries to snipe after seeing P1's answer (+25s): even with 2s personal play, solvedMs is 25,000ms so P2 cannot overtake P1!
    h.setNow(roundStart + 23000);
    const p2Start = await h.start(tokenP2);
    const p2G1 = (await h.guess(p2Start.game, '사랑', crypto.randomUUID(), tokenP2)).data;
    h.setNow(roundStart + 25000);
    const p2Win = await h.guess(p2G1.game, answer, crypto.randomUUID(), tokenP2);
    assert.equal(p2Win.data.game.ranked, true);
    assert.equal(p2Win.data.game.solvedMs, 25000);
    assert.equal(p2Win.data.round.solverCount, 2);

    // Renaming P1 immediately updates round.firstSolver and leaderboard without leaking player IDs.
    const renamed = await h.call('profile', { name: 'FirstSolver' }, 'PATCH', tokenP1);
    assert.equal(renamed.data.profile.hasCustomName, true);
    assert.equal(renamed.data.round.firstSolver.name, 'FirstSolver');
    assert.equal(renamed.data.round.firstSolver.hasCustomName, true);
    await h.call('profile', { name: 'SecondSolver' }, 'PATCH', tokenP2);

    const lb = await h.call('leaderboard', null, 'GET', tokenP1);
    assert.equal(lb.data.entries.length, 2);
    assert.equal(lb.data.entries[0].name, 'FirstSolver');
    assert.equal(lb.data.entries[0].hasCustomName, true);
    assert.equal(lb.data.entries[0].bestTimeMs, 15000);
    assert.equal(lb.data.entries[1].name, 'SecondSolver');
    assert.equal(lb.data.entries[1].hasCustomName, true);
    assert.equal(lb.data.entries[1].bestTimeMs, 25000);
    assert.equal(lb.data.mine.rank, 1);
    assert.equal(lb.data.mine.hasCustomName, true);
    assert.ok(lb.data.entries.every(row => !Object.hasOwn(row, 'id')));

    // Nearest 1k & post-win explore match calibrated scores.
    const nearest = await h.call(`games/${p1Start.game.id}/nearest`, null, 'GET', tokenP1);
    assert.equal(nearest.status, 200);
    assert.equal(nearest.data.words.length, 1000);
    const probeWord = nearest.data.words[0].word;
    const explored = await h.call(`games/${p1Start.game.id}/explore`, { text: probeWord }, 'POST', tokenP1);
    assert.equal(explored.status, 200);
    assert.equal(explored.data.similarity, nearest.data.words[0].similarity);

    h.db.sqlite.close();
});

test('6-hour rollover expires old rounds, resets guess history, reveals previous answer, and preserves consecutive streak', async () => {
    const h = harness({ secretWords: ['행복', '학교', '사과', '도서관'] });
    const token = 'a'.repeat(64);
    const tokenIdle = 'b'.repeat(64);

    // Solve in Round #3 (12:00 KST).
    const r3Start = await h.start(token);
    const r3Answer = h.answer(r3Start.game.id);
    const r3G1 = (await h.guess(r3Start.game, '사람', crypto.randomUUID(), token)).data;
    const r3Win = await h.guess(r3G1.game, r3Answer, crypto.randomUUID(), token);
    assert.equal(r3Win.data.profile.streak, 1);

    // Second player leaves an unsolved active game in Round #3.
    const idleR3 = await h.start(tokenIdle);
    await h.guess(idleR3.game, '물', crypto.randomUUID(), tokenIdle);

    // Rollover to Round #4 (18:00 KST).
    h.advanceMs(6 * 60 * 60 * 1000);

    // Late guess & explore against Round #3 fail cleanly with 409 round_expired.
    const lateGuess = await h.guess(r3Win.data.game, '사랑', crypto.randomUUID(), token);
    assert.equal(lateGuess.status, 409);
    assert.equal(lateGuess.data.error, 'round_expired');
    const lateExplore = await h.call(`games/${r3Start.game.id}/explore`, { text: '사랑' }, 'POST', token);
    assert.equal(lateExplore.status, 409);
    assert.equal(lateExplore.data.error, 'round_expired');

    // Recovering via old game ID automatically transitions into Round #4 with empty guesses and previous answer revealed.
    const resetRes = await h.call(`games/${idleR3.game.id}`, null, 'GET', tokenIdle);
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.data.event.code, 'round_reset');
    assert.equal(resetRes.data.event.previousAnswer, r3Answer);
    assert.equal(resetRes.data.round.roundNo, 4);
    assert.equal(resetRes.data.round.previous.answer, r3Answer);
    assert.equal(resetRes.data.game.guesses.length, 0);
    assert.equal(resetRes.data.game.guessCount, 0);
    assert.notEqual(h.answer(resetRes.data.game.id), r3Answer);
    assert.equal(h.row('SELECT status FROM sm_games WHERE id = ?', idleR3.game.id).status, 'expired');

    // Previous round Top-1,000 endpoint unlocks after rollover.
    const prevNearest = await h.call('rounds/previous/nearest', null, 'GET', tokenIdle);
    assert.equal(prevNearest.status, 200);
    assert.equal(prevNearest.data.answer, r3Answer);
    assert.equal(prevNearest.data.words.length, 1000);

    // Solving Round #4 increments consecutive streak to 2; skipping Round #5 resets streak to 1.
    const r4Start = await h.start(token);
    const r4Answer = h.answer(r4Start.game.id);
    const r4G1 = (await h.guess(r4Start.game, '사람', crypto.randomUUID(), token)).data;
    const r4Win = await h.guess(r4G1.game, r4Answer, crypto.randomUUID(), token);
    assert.equal(r4Win.data.profile.streak, 2);

    h.advanceMs(12 * 60 * 60 * 1000);
    const r6Start = await h.start(token);
    const r6Answer = h.answer(r6Start.game.id);
    const r6G1 = (await h.guess(r6Start.game, '사람', crypto.randomUUID(), token)).data;
    const r6Win = await h.guess(r6G1.game, r6Answer, crypto.randomUUID(), token);
    assert.equal(r6Win.data.profile.streak, 1);
    assert.equal(r6Win.data.profile.bestStreak, 2);

    h.db.sqlite.close();
});

test('1-secret test fixture does not leak answer through rounds/previous/nearest', async () => {
    const h = harness({ secretWords: ['행복'] });
    const prev = await h.call('rounds/previous/nearest', null, 'GET');
    assert.equal(prev.status, 404);
    h.db.sqlite.close();
});

test('anti-cheat blocks duplicate nicknames, CSRF, prototype pollution, score-event leaks, and client JS modern syntax regressions', async () => {
    const h = harness({ secretWords: ['행복', '학교', '사과'] });

    assert.equal(sanitizePlayerName('\u202EStar\u200BGazer'), 'StarGazer');
    assert.equal(sanitizePlayerName('..'), null);
    assert.equal((await h.call('profile', { name: '..' }, 'PATCH')).status, 400);

    const tokenB = 'b'.repeat(64);
    assert.equal((await h.call('profile', { name: 'AlphaUser' }, 'PATCH')).status, 200);
    const taken = await h.call('profile', { name: 'alphauser' }, 'PATCH', tokenB);
    assert.equal(taken.status, 409);
    assert.equal(taken.data.error, 'name_taken');

    assert.equal(calibrateSim(10000, 9812, true), 10000);
    assert.ok(calibrateSim(6000, 9812, false) > calibrateSim(5000, 9812, false));

    const forbiddenOrigin = await twentyQuestionsRoute(
        new Request('https://api/twenty-questions/status', { headers: { Origin: 'https://evil.example' } }),
        h.env
    );
    assert.equal(forbiddenOrigin.status, 403);

    const forbiddenFetchSite = await twentyQuestionsRoute(
        new Request('https://api/twenty-questions/status', { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
        h.env
    );
    assert.equal(forbiddenFetchSite.status, 403);

    const okStatus = await twentyQuestionsRoute(
        new Request('https://api/twenty-questions/status', { headers: { Origin: 'https://game.archerlab.dev' } }),
        h.env
    );
    assert.equal(okStatus.status, 200);
    assert.equal(okStatus.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(okStatus.headers.get('X-Frame-Options'), 'DENY');
    const statusJson = await okStatus.json();
    assert.equal(statusJson.ready, true);
    assert.equal(statusJson.ruleset, RULESET);
    assert.equal(statusJson.round.roundId || statusJson.round.id, '2026-11-20T12');

    const protoPollute = await h.fetch(new Request('https://api/twenty-questions/profile', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${'c'.repeat(64)}`, 'Content-Type': 'application/json' },
        body: '{"__proto__":{"polluted":true},"name":"SafeName"}',
    }));
    assert.equal(protoPollute.status, 400);

    const blockedScore = await submitRanking({}, { game_id: 'twenty-questions', player_name: 'Fake', score: 999 });
    assert.equal(blockedScore.status, 403);

    for (const file of ['main.mjs', 'api.mjs', 'audio.mjs', 'i18n.mjs']) {
        const src = fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8');
        assert.doesNotMatch(src, /answer_word|secrets-top1k|vectors\.f16|hot-pack|OPENROUTER_API_KEY|sim_scale/);
        assert.doesNotMatch(src, /catch\s*\{/, `${file}: bare catch breaks iOS 12`);
    }
    h.db.sqlite.close();
});

test('DO room cache + deferred batch flushes cleanly before solve', async () => {
    const h = harness({ secretWords: ['행복', '학교'] });
    const pendingFlushes = [];
    const queued = [];
    const runtime = {
        roomCache: { player: null, game: null, guesses: null, roundSummary: null },
        clearCache: () => {
            runtime.roomCache.player = null;
            runtime.roomCache.game = null;
            runtime.roomCache.guesses = null;
            runtime.roomCache.roundSummary = null;
        },
        deferBatch: statements => {
            queued.push(statements);
            pendingFlushes.push(
                h.db.batch(statements.map(s => h.db.prepare(s.sql).bind(...s.params)))
            );
        },
        flushBatch: async () => {
            await Promise.all(pendingFlushes.splice(0));
        },
        waitUntil: p => { pendingFlushes.push(Promise.resolve(p).catch(() => {})); },
    };

    const callRoom = async (path, body, method = body ? 'POST' : 'GET') => {
        const res = await handleRoomRequest(new Request('https://api/twenty-questions/' + path, {
            method,
            headers: { Authorization: `Bearer ${'d'.repeat(64)}`, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }), h.env, runtime);
        return { status: res.status, data: await res.json() };
    };

    const started = await callRoom('games', { locale: 'ko', requestId: crypto.randomUUID() });
    assert.equal(started.status, 200);
    let game = started.data.game;

    const g1 = await callRoom(`games/${game.id}/guesses`, { text: '드라이기', expectedVersion: game.version, requestId: crypto.randomUUID() });
    assert.equal(g1.status, 200);
    assert.equal(queued.length, 1);
    game = g1.data.game;

    const g2 = await callRoom(`games/${game.id}/guesses`, { text: '에어프라이어', expectedVersion: game.version, requestId: crypto.randomUUID() });
    assert.equal(g2.status, 200);
    assert.equal(queued.length, 2);
    game = g2.data.game;

    const answer = h.answer(game.id);
    const win = await callRoom(`games/${game.id}/guesses`, { text: answer, expectedVersion: game.version, requestId: crypto.randomUUID() });
    assert.equal(win.status, 200);
    assert.equal(win.data.game.status, 'won');
    assert.equal(h.row('SELECT COUNT(*) n FROM sm_guesses WHERE game_id = ?', game.id).n, 3);
    await runtime.flushBatch();
    h.db.sqlite.close();
});
