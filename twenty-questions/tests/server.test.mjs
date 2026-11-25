import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, database, KO_V2_ONLY, KO_V2_RANKED } from './helpers.mjs';
import { twentyQuestionsRoute, handleRoomRequest } from '../../server/twenty-questions/service.mjs';
import { CURRENT_PACK } from '../../server/twenty-questions/vectors.mjs';
import {
    RULESET, roundSlotAt, previousRoundSlot, selectRoundSecretIndex,
    calibrateSim, sanitizePlayerName, nextRecord,
} from '../../server/twenty-questions/core.mjs';
import { cleanExpiredRecords, initialize, SCHEMA_VERSION } from '../../server/twenty-questions/database.mjs';
import { submitRanking } from '../../game-api-worker.js';

test('6-hour KST round schedule aligns to 00:00, 06:00, 12:00, 18:00 and rotates secrets cleanly', async () => {
    const s12 = roundSlotAt(Date.parse('2026-11-20T12:00:00+09:00'));
    const s1759 = roundSlotAt(Date.parse('2026-11-20T17:59:59+09:00'));
    const s18 = roundSlotAt(Date.parse('2026-11-20T18:00:00+09:00'));
    const sNext00 = roundSlotAt(Date.parse('2026-11-21T00:00:00+09:00'));
    const sNext06 = roundSlotAt(Date.parse('2026-11-21T06:00:00+09:00'));
    const sNext12 = roundSlotAt(Date.parse('2026-11-21T12:00:00+09:00'));

    assert.equal(s12.roundId, '2026-11-20T12');
    assert.equal(s12.roundNo, 1);
    assert.equal(s1759.roundId, s12.roundId);
    assert.equal(s18.roundId, '2026-11-20T18');
    assert.equal(s18.roundNo, 2);
    assert.equal(sNext00.roundId, '2026-11-21T00');
    assert.equal(sNext00.roundNo, 3);
    assert.equal(sNext06.roundId, '2026-11-21T06');
    assert.equal(sNext06.roundNo, 4);
    assert.equal(sNext12.roundId, '2026-11-21T12');
    assert.equal(sNext12.roundNo, 5);
    assert.equal(s12.endsAt - s12.startedAt, 6 * 3600 * 1000);
    assert.equal(previousRoundSlot(sNext00).roundId, '2026-11-20T18');

    const picked = new Set();
    for (let i = 0; i < 4; i++) {
        picked.add(await selectRoundSecretIndex(s12.slotIndex + i, 4));
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
    // 500ms after 00:00 KST round open (Round #3): too fast (<1.5s) to block round-start bot sniping.
    const roundStart = Date.parse('2026-11-21T00:00:00+09:00');
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
    assert.equal(lb.data.sort, 'wins');
    assert.equal(lb.data.entries.length, 2);
    assert.equal(lb.data.entries[0].name, 'FirstSolver');
    assert.equal(lb.data.entries[0].hasCustomName, true);
    assert.equal(lb.data.entries[0].wins, 1);
    assert.equal(lb.data.entries[0].solvedMs, 15000);
    assert.equal(lb.data.entries[0].bestTimeMs, 15000);
    assert.equal(lb.data.entries[1].name, 'SecondSolver');
    assert.equal(lb.data.entries[1].hasCustomName, true);
    assert.equal(lb.data.entries[1].wins, 1);
    assert.equal(lb.data.entries[1].solvedMs, 25000);
    assert.equal(lb.data.entries[1].bestTimeMs, 25000);
    assert.equal(lb.data.mine.rank, 1);
    assert.equal(lb.data.mine.wins, 1);
    assert.equal(lb.data.mine.hasCustomName, true);
    assert.ok(lb.data.entries.every(row => !Object.hasOwn(row, 'id') && !Object.hasOwn(row, 'guesses') && !Object.hasOwn(row, 'turns')));
    assert.ok(!Object.hasOwn(lb.data.mine, 'guesses') && !Object.hasOwn(lb.data.mine, 'turns'));
    assert.ok(p2Win.data.round.solvers.every(row => !Object.hasOwn(row, 'guesses')));

    // Legacy ?round= and unknown ?sort= query params gracefully fall back to 'wins'
    for (const q of ['leaderboard?round=1', 'leaderboard?round=999', 'leaderboard?sort=unknown']) {
        const legacyLb = await h.call(q, null, 'GET', tokenP1);
        assert.equal(legacyLb.status, 200);
        assert.equal(legacyLb.data.sort, 'wins');
        assert.equal(legacyLb.data.entries.length, 2);
    }

    // Guess-count tie-breakers are ignored when elapsed times are equal
    const tieCheck = nextRecord({ sync_best_time_ms: 15000, sync_best_time_guesses: 10, sync_best_at: roundStart + 15000 }, 15000, 2, 4, roundStart + 50000);
    assert.equal(tieCheck.improved, false);

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
    h.advanceMs(2500);
    const r3Win = await h.guess(r3G1.game, r3Answer, crypto.randomUUID(), token);
    assert.equal(r3Win.data.profile.streak, 1);
    const lbBeforeRollover = (await h.call('leaderboard', null, 'GET', token)).data;
    assert.equal(lbBeforeRollover.entries.length, 1);

    // Second player leaves an unsolved active game in Round #3.
    const idleR3 = await h.start(tokenIdle);
    await h.guess(idleR3.game, '물', crypto.randomUUID(), tokenIdle);

    // Rollover to Round #4 (18:00 KST) retains single-page leaderboard entries across rounds.
    h.advanceMs(6 * 60 * 60 * 1000);
    const lbAfterRollover = (await h.call('leaderboard', null, 'GET', token)).data;
    assert.equal(lbAfterRollover.entries.length, 1);
    assert.equal(lbAfterRollover.mine.rank, 1);

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

test('Round #1 epoch boundary hides pre-epoch previous answer', async () => {
    const h = harness({
        secretWords: ['행복', '학교'],
        initialNow: Date.parse('2026-11-20T12:00:15+09:00'),
    });
    const prof = await h.call('profile', null, 'GET');
    assert.equal(prof.status, 200);
    assert.equal(prof.data.round.id, '2026-11-20T12');
    assert.equal(prof.data.round.roundNo, 1);
    assert.equal(prof.data.round.previous, null);

    const prevNearest = await h.call('rounds/previous/nearest', null, 'GET');
    assert.equal(prevNearest.status, 404);

    const lb = await h.call('leaderboard', null, 'GET');
    assert.equal(lb.status, 200);
    assert.deepEqual(lb.data.entries, []);
    assert.equal(lb.data.mine, null);
    h.db.sqlite.close();
});

test('same-name registration merges unique solved rounds, toggles 1-A/1-B order, and protects ranked wins from cleanup', async () => {
    const roundStart = Date.parse('2026-11-21T00:00:00+09:00');
    const h = harness({ secretWords: ['행복', '학교', '사과', '도서관'], initialNow: roundStart + 15000 });
    const tokenFast = '1'.repeat(64);
    const tokenSlow = '2'.repeat(64);
    const tokenSecondRoundSameName = '3'.repeat(64);
    const tokenUnranked = '4'.repeat(64);
    const tokenSpeedster = '5'.repeat(64);

    // Player Fast solves Round #3 in 15s, Player Slow solves same Round #3 in 30s with same name -> counts as 1 unique round
    const fastStart = await h.start(tokenFast);
    const ans = h.answer(fastStart.game.id);
    let g = (await h.guess(fastStart.game, '사람', crypto.randomUUID(), tokenFast)).data.game;
    g = (await h.guess(g, '사랑', crypto.randomUUID(), tokenFast)).data.game;
    await h.guess(g, ans, crypto.randomUUID(), tokenFast);
    await h.call('profile', { name: 'SharedHero' }, 'PATCH', tokenFast);

    h.setNow(roundStart + 30000);
    const slowStart = await h.start(tokenSlow);
    const slowG1 = (await h.guess(slowStart.game, '사람', crypto.randomUUID(), tokenSlow)).data.game;
    await h.guess(slowG1, ans, crypto.randomUUID(), tokenSlow);
    const slowRename = await h.call('profile', { name: 'sharedhero' }, 'PATCH', tokenSlow);
    assert.equal(slowRename.status, 200);

    // Same name (case-insensitive) solving the SAME round counts as 1 unique round and keeps 15s
    let lb = (await h.call('leaderboard?sort=wins', null, 'GET', tokenFast)).data;
    assert.equal(lb.entries.length, 1);
    assert.equal(lb.entries[0].wins, 1);
    assert.equal(lb.entries[0].solvedMs, 15000);
    assert.equal(lb.entries[0].name, 'SharedHero');
    // Second device sharing the name in that round also sees own === true & mine
    const slowView = (await h.call('leaderboard?sort=wins', null, 'GET', tokenSlow)).data;
    assert.equal(slowView.entries[0].own, true);
    assert.equal(slowView.mine.rank, 1);
    assert.equal(slowView.mine.wins, 1);

    // Unranked player using the same name gets mine === null and own === false
    const unrankedStart = await h.start(tokenUnranked);
    await h.guess(unrankedStart.game, ans, crypto.randomUUID(), tokenUnranked);
    assert.equal((await h.call('profile', { name: 'SharedHero' }, 'PATCH', tokenUnranked)).status, 200);
    const unrankedLb = (await h.call('leaderboard', null, 'GET', tokenUnranked)).data;
    assert.equal(unrankedLb.entries.length, 1);
    assert.equal(unrankedLb.entries[0].own, false);
    assert.equal(unrankedLb.mine, null);

    // Another device with same name solves Round #4 (at +20s -> slower than 15s) -> combines to 2 unique rounds, keeps fastest 15s
    const r4Start = roundStart + 6 * 3600 * 1000;
    h.setNow(r4Start + 20000);
    const r4SameStart = await h.start(tokenSecondRoundSameName);
    const ans4 = h.answer(r4SameStart.game.id);
    const r4SameG1 = (await h.guess(r4SameStart.game, '사람', crypto.randomUUID(), tokenSecondRoundSameName)).data.game;
    await h.guess(r4SameG1, ans4, crypto.randomUUID(), tokenSecondRoundSameName);
    assert.equal((await h.call('profile', { name: 'SharedHero' }, 'PATCH', tokenSecondRoundSameName)).status, 200);

    // Speedster solves ONLY Round #4 very fast (at +5s -> faster than 15s)
    h.setNow(r4Start + 5000);
    const speedStart = await h.start(tokenSpeedster);
    const speedG1 = (await h.guess(speedStart.game, '사람', crypto.randomUUID(), tokenSpeedster)).data.game;
    await h.guess(speedG1, ans4, crypto.randomUUID(), tokenSpeedster);
    await h.call('profile', { name: 'Speedster' }, 'PATCH', tokenSpeedster);

    // 1-A (sort=wins): SharedHero (2 unique rounds, 15s) ranks #1 ahead of Speedster (1 round, 5s)
    const lbWins = (await h.call('leaderboard?sort=wins', null, 'GET', tokenSecondRoundSameName)).data;
    assert.equal(lbWins.sort, 'wins');
    assert.equal(lbWins.entries.length, 2);
    assert.equal(lbWins.entries[0].name, 'SharedHero');
    assert.equal(lbWins.entries[0].wins, 2);
    assert.equal(lbWins.entries[0].solvedMs, 15000);
    assert.equal(lbWins.entries[0].rank, 1);
    assert.equal(lbWins.entries[1].name, 'Speedster');
    assert.equal(lbWins.entries[1].wins, 1);
    assert.equal(lbWins.entries[1].solvedMs, 5000);
    assert.equal(lbWins.entries[1].rank, 2);
    assert.equal(lbWins.mine.rank, 1);
    assert.equal(lbWins.mine.wins, 2);
    assert.ok(lbWins.entries.every(row => !Object.hasOwn(row, 'guesses') && !Object.hasOwn(row, 'turns')));

    // 1-B (sort=time): Speedster (5s, 1 round) ranks #1 ahead of SharedHero (15s, 2 rounds)
    const lbTime = (await h.call('leaderboard?sort=time', null, 'GET', tokenSecondRoundSameName)).data;
    assert.equal(lbTime.sort, 'time');
    assert.equal(lbTime.entries.length, 2);
    assert.equal(lbTime.entries[0].name, 'Speedster');
    assert.equal(lbTime.entries[0].wins, 1);
    assert.equal(lbTime.entries[0].solvedMs, 5000);
    assert.equal(lbTime.entries[0].rank, 1);
    assert.equal(lbTime.entries[1].name, 'SharedHero');
    assert.equal(lbTime.entries[1].wins, 2);
    assert.equal(lbTime.entries[1].solvedMs, 15000);
    assert.equal(lbTime.entries[1].rank, 2);
    assert.equal(lbTime.mine.rank, 2);
    assert.equal(lbTime.mine.wins, 2);

    // Cleanup older than 30 days removes expired games but retains ranked won games
    const expiredStart = await h.start('6'.repeat(64));
    h.db.sqlite.prepare("UPDATE sm_games SET status = 'expired', updated_at = ? WHERE id = ?").run(r4Start - 40 * 86400000, expiredStart.game.id);
    h.db.sqlite.prepare("UPDATE sm_games SET updated_at = ? WHERE id = ?").run(r4Start - 40 * 86400000, r4SameStart.game.id);
    await cleanExpiredRecords(h.db, r4Start + 10000);
    assert.equal(h.row('SELECT COUNT(*) n FROM sm_games WHERE id = ?', expiredStart.game.id).n, 0);
    assert.equal(h.row('SELECT COUNT(*) n FROM sm_games WHERE id = ?', r4SameStart.game.id).n, 1);

    h.db.sqlite.close();
});

test('1-secret test fixture does not leak answer through rounds/previous/nearest', async () => {
    const h = harness({ secretWords: ['행복'] });
    const prev = await h.call('rounds/previous/nearest', null, 'GET');
    assert.equal(prev.status, 404);
    h.db.sqlite.close();
});

test('anti-cheat blocks CSRF, prototype pollution, score-event leaks, and client JS modern syntax regressions while allowing same-name registration', async () => {
    const h = harness({ secretWords: ['행복', '학교', '사과'] });

    assert.equal(sanitizePlayerName('\u202EStar\u200BGazer'), 'StarGazer');
    assert.equal(sanitizePlayerName('..'), null);
    assert.equal((await h.call('profile', { name: '..' }, 'PATCH')).status, 400);

    const tokenB = 'b'.repeat(64);
    assert.equal((await h.call('profile', { name: 'AlphaUser' }, 'PATCH')).status, 200);
    const sameName = await h.call('profile', { name: 'alphauser' }, 'PATCH', tokenB);
    assert.equal(sameName.status, 200);
    assert.equal(sameName.data.profile.name, 'alphauser');

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
    assert.equal(okStatus.headers.get('Access-Control-Max-Age'), '86400');
    const statusJson = await okStatus.json();
    assert.equal(statusJson.ready, true);
    assert.equal(statusJson.ruleset, RULESET);
    assert.equal(statusJson.round.roundId || statusJson.round.id, '2026-11-21T00');

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

test('dual ko/en sessions stay strictly isolated while sharing the 6h KST schedule', async () => {
    const h = harness({
        secretWords: ['행복', '학교', '사과', '도서관'],
        enSecretWords: ['happy', 'school', 'apple', 'library'],
    });
    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);

    // Status endpoint checks both language packs independently while matching KST round timing
    const stKo = await twentyQuestionsRoute(
        new Request('https://api/twenty-questions/status', { headers: { Origin: 'https://game.archerlab.dev' } }),
        h.env,
    );
    const stEn = await twentyQuestionsRoute(
        new Request('https://api/twenty-questions/status?lang=en', { headers: { Origin: 'https://game.archerlab.dev' } }),
        h.env,
    );
    const stBad = await twentyQuestionsRoute(
        new Request('https://api/twenty-questions/status?lang=jp', { headers: { Origin: 'https://game.archerlab.dev' } }),
        h.env,
    );
    assert.equal(stKo.status, 200);
    assert.equal(stEn.status, 200);
    assert.equal(stBad.status, 400);
    const koStatus = await stKo.json();
    const enStatus = await stEn.json();
    assert.equal(koStatus.lang, 'ko');
    assert.equal(enStatus.lang, 'en');
    assert.equal(enStatus.ruleset, 'semantle-en-sync-v1');
    assert.ok(enStatus.vocabCount >= 1030 && enStatus.secretCount === 4);
    assert.deepEqual(enStatus.round, koStatus.round);

    // Same token can play Korean and English simultaneously without colliding
    const koStart = await h.start(tokenA, 'ko');
    const enStart = await h.start(tokenA, 'en');
    assert.notEqual(koStart.game.id, enStart.game.id);
    assert.equal(enStart.lang, 'en');
    assert.equal(enStart.ruleset, 'semantle-en-sync-v1');
    assert.equal(enStart.round.id, koStart.round.id);
    assert.equal(enStart.round.roundNo, koStart.round.roundNo);
    assert.equal((await h.call('profile', null, 'GET', tokenA, 'ko')).data.game.id, koStart.game.id);
    assert.equal((await h.call('profile', null, 'GET', tokenA, 'en')).data.game.id, enStart.game.id);

    // Cross-language inputs are cleanly rejected without charging guessCount
    let enGame = enStart.game;
    const koWordInEn = await h.guess(enGame, '사람', crypto.randomUUID(), tokenA, 'en');
    assert.equal(koWordInEn.data.event.code, 'unknown_word');
    assert.equal(koWordInEn.data.game.guessCount, 0);

    const enWordInKo = await h.guess(koStart.game, 'person', crypto.randomUUID(), tokenA, 'ko');
    assert.equal(enWordInKo.data.event.code, 'unknown_word');
    assert.equal(enWordInKo.data.game.guessCount, 0);

    // English guesses normalize uppercase inputs and detect duplicates case-insensitively
    const enG1 = await h.guess(enGame, 'Water', crypto.randomUUID(), tokenA, 'en');
    assert.equal(enG1.data.event.code, 'guess');
    assert.equal(enG1.data.event.word, 'water');
    assert.equal(enG1.data.game.guessCount, 1);
    enGame = enG1.data.game;

    const enDup = await h.guess(enGame, 'WATER', crypto.randomUUID(), tokenA, 'en');
    assert.equal(enDup.data.event.code, 'duplicate');
    assert.equal(enDup.data.event.word, 'water');
    assert.equal(enDup.data.game.guessCount, 1);

    // Same-name registration is allowed across accounts in both ko and en without leaking between langs
    assert.equal((await h.call('profile', { name: 'Polyglot' }, 'PATCH', tokenA, 'ko')).status, 200);
    assert.equal((await h.call('profile', { name: 'Polyglot' }, 'PATCH', tokenA, 'en')).status, 200);
    assert.equal((await h.call('profile', { name: 'polyglot' }, 'PATCH', tokenB, 'en')).status, 200);

    const bEnStart = await h.start(tokenB, 'en');
    const enAnswer = h.answer(bEnStart.game.id);
    const bEnG1 = (await h.guess(bEnStart.game, 'person', crypto.randomUUID(), tokenB, 'en')).data;
    h.advanceMs(5000);
    const bEnWin = await h.guess(bEnG1.game, enAnswer, crypto.randomUUID(), tokenB, 'en');
    assert.equal(bEnWin.data.game.status, 'won');
    assert.equal(bEnWin.data.round.solverCount, 1);
    assert.equal((await h.call('profile', null, 'GET', tokenA, 'ko')).data.round.solverCount, 0);

    await h.call('profile', { name: 'EnChamp' }, 'PATCH', tokenB, 'en');
    const enLb = (await h.call('leaderboard', null, 'GET', tokenB, 'en')).data;
    const koLb = (await h.call('leaderboard', null, 'GET', tokenA, 'ko')).data;
    assert.equal(enLb.entries.length, 1);
    assert.equal(enLb.entries[0].name, 'EnChamp');
    assert.equal(enLb.ruleset, 'semantle-en-sync-v1');
    assert.equal(koLb.entries.length, 0);

    // Rollover advances EN cleanly while keeping unified EN ranking intact and exposing previous EN answer
    h.advanceMs(6 * 60 * 60 * 1000);
    const enLbReset = (await h.call('leaderboard', null, 'GET', tokenB, 'en')).data;
    assert.equal(enLbReset.entries.length, 1);
    assert.equal(enLbReset.entries[0].name, 'EnChamp');
    const koLbAfter = (await h.call('leaderboard', null, 'GET', tokenA, 'ko')).data;
    assert.equal(koLbAfter.entries.length, 0);
    const enReset = await h.call(`games/${enGame.id}`, null, 'GET', tokenA, 'en');
    assert.equal(enReset.status, 200);
    assert.equal(enReset.data.event.code, 'round_reset');
    assert.equal(enReset.data.event.previousAnswer, enAnswer);
    assert.equal(enReset.data.round.roundNo, 4);
    assert.equal(enReset.data.game.guessCount, 0);
    assert.equal(h.row('SELECT status FROM sm_games WHERE id = ?', enGame.id).status, 'expired');

    const prevEnNearest = await h.call('rounds/previous/nearest', null, 'GET', tokenA, 'en');
    assert.equal(prevEnNearest.status, 200);
    assert.equal(prevEnNearest.data.answer, enAnswer);
    assert.equal(prevEnNearest.data.words.length, 1000);

    h.db.sqlite.close();
});

// Plants the current round the way pre-v3 code stored it (data_pack NULL), then plays across the boundary.
async function legacyToCurrentTransition(h, call) {
    assert.equal((await call('leaderboard')).status, 200); // initializes the schema without creating a round
    const slot = roundSlotAt(h.getNow());
    const [legacyAnswer, top1, top10, top1000] = h.semantleStore.legacy.secrets[0];
    h.db.sqlite.prepare(`INSERT INTO sm_rounds(round_id, lang, round_no, secret_id, answer_word, sim_scale, top1, top10, top1000, started_at, ends_at, created_at)
        VALUES (?, 'ko', ?, 0, ?, 10000, ?, ?, ?, ?, ?, ?)`)
        .run(slot.roundId, slot.roundNo, legacyAnswer, top1, top10, top1000, slot.startedAt, slot.endsAt, h.getNow());
    const guess = (game, text) => call(`games/${game.id}/guesses`, { text, expectedVersion: game.version, requestId: crypto.randomUUID() });

    // Legacy round keeps v2 behaviour, bug included: the unlisted KO_V2_ONLY beats the #1,000 cutoff but has no rank.
    let legacy = (await call('games', { locale: 'ko', requestId: crypto.randomUUID() })).data.game;
    const unlisted = await guess(legacy, KO_V2_ONLY);
    assert.equal(unlisted.data.event.code, 'guess');
    assert.equal(unlisted.data.event.rank, null);
    assert.ok(unlisted.data.event.similarity > unlisted.data.game.benchmarks.top1000);
    legacy = unlisted.data.game;
    const listed = await guess(legacy, KO_V2_RANKED);
    assert.equal(listed.data.event.rank, 1);
    h.advanceMs(11000);
    const legacyWin = await guess(listed.data.game, legacyAnswer);
    assert.equal(legacyWin.data.game.status, 'won');
    assert.equal(h.row('SELECT data_pack FROM sm_rounds WHERE round_id = ?', slot.roundId).data_pack, null);

    // The next round is created by current code: recorded with the current pack; v2-only words are rejected.
    h.advanceMs(6 * 60 * 60 * 1000);
    const nextSlot = roundSlotAt(h.getNow());
    const reset = await call(`games/${legacy.id}`);
    assert.equal(reset.data.event.code, 'round_reset');
    assert.equal(h.row('SELECT data_pack FROM sm_rounds WHERE round_id = ?', nextSlot.roundId).data_pack, CURRENT_PACK);
    let game = reset.data.game;
    for (const word of [KO_V2_ONLY, KO_V2_RANKED]) {
        const rejected = await guess(game, word);
        assert.equal(rejected.data.event.code, 'unknown_word', word);
        assert.equal(rejected.data.game.guessCount, 0);
    }
    const ranked = await guess(game, '기쁨');
    assert.equal(ranked.data.event.rank, 1);
    game = ranked.data.game;
    h.advanceMs(11000);
    const win = await guess(game, h.answer(game.id));
    assert.equal(win.data.game.status, 'won');

    // Explore after the win scores with the current round's pack.
    const exploreOff = await call(`games/${game.id}/explore`, { text: KO_V2_ONLY });
    assert.equal(exploreOff.status, 200);
    assert.equal(exploreOff.data.code, 'unknown_word');
    const exploreIn = await call(`games/${game.id}/explore`, { text: '사랑' });
    assert.equal(exploreIn.status, 200);
    assert.equal(exploreIn.data.code, 'explored');

    // Lists of the legacy round still come from v2: the previous-round reveal and the won legacy game's Top-1,000.
    const prevNearest = await call('rounds/previous/nearest');
    assert.equal(prevNearest.status, 200);
    assert.equal(prevNearest.data.words[0].word, KO_V2_RANKED);
    const legacyNearest = await call(`games/${legacy.id}/nearest`);
    assert.equal(legacyNearest.status, 200);
    assert.equal(legacyNearest.data.words[0].word, KO_V2_RANKED);
    const currentNearest = await call(`games/${game.id}/nearest`);
    assert.equal(currentNearest.data.words.some(item => item.word === KO_V2_RANKED), false);
}

test('rounds created before the rollout finish on the v2 pack; new rounds record and use the current pack', async () => {
    const h = harness({ secretWords: ['행복'] });
    const token = 'a'.repeat(64);
    await legacyToCurrentTransition(h, (path, body, method = body ? 'POST' : 'GET') => h.call(path, body, method, token));
});

test('the v2 -> current pack transition also holds through the Durable Object room cache', async () => {
    const h = harness({ secretWords: ['행복'] });
    const pending = [];
    const runtime = {
        roomCache: { player: null, game: null, guesses: null, roundSummary: null },
        clearCache: () => Object.assign(runtime.roomCache, { player: null, game: null, guesses: null, roundSummary: null }),
        deferBatch: statements => pending.push(h.db.batch(statements.map(st => h.db.prepare(st.sql).bind(...st.params)))),
        flushBatch: async () => { await Promise.all(pending.splice(0)); },
        waitUntil: promise => { pending.push(Promise.resolve(promise).catch(() => {})); },
    };
    await legacyToCurrentTransition(h, async (path, body, method = body ? 'POST' : 'GET') => {
        const res = await handleRoomRequest(new Request('https://api/twenty-questions/' + path, {
            method,
            headers: { Authorization: `Bearer ${'e'.repeat(64)}`, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }), h.env, runtime);
        return { status: res.status, data: await res.json() };
    });
    await runtime.flushBatch();
});

test('current-pack rounds keep rank monotonic in similarity, unlike the planted v2 round', async () => {
    const play = async (legacy) => {
        const h = harness({ secretWords: ['행복'] });
        const token = 'a'.repeat(64);
        if (legacy) {
            assert.equal((await h.call('leaderboard', null, 'GET', token)).status, 200);
            const slot = roundSlotAt(h.getNow());
            const [answer, top1, top10, top1000] = h.semantleStore.legacy.secrets[0];
            h.db.sqlite.prepare(`INSERT INTO sm_rounds(round_id, lang, round_no, secret_id, answer_word, sim_scale, top1, top10, top1000, started_at, ends_at, created_at)
                VALUES (?, 'ko', ?, 0, ?, 10000, ?, ?, ?, ?, ?, ?)`)
                .run(slot.roundId, slot.roundNo, answer, top1, top10, top1000, slot.startedAt, slot.endsAt, h.getNow());
        }
        let game = (await h.start(token)).game;
        const answer = h.answer(game.id);
        const words = legacy ? h.semantleStore.legacy.words : h.semantleStore.words;
        const candidates = [...new Set([KO_V2_ONLY, ...words.filter(w => w !== answer && /^[가-힣]+$/u.test(w)).slice(0, 50)])];
        const events = [];
        for (const word of candidates) {
            const res = await h.guess(game, word, crypto.randomUUID(), token);
            assert.equal(res.status, 200);
            game = res.data.game;
            if (res.data.event.code === 'guess') events.push(res.data.event);
            h.advanceMs(11000);
        }
        const ranked = events.filter(e => e.rank !== null).sort((a, b) => a.rank - b.rank);
        for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].similarity >= ranked[i].similarity);
        const lowest = ranked[ranked.length - 1].similarity;
        return events.filter(e => e.rank === null && e.similarity > lowest).map(e => e.word);
    };
    assert.deepEqual(await play(true), [KO_V2_ONLY], 'the v2 fixture reproduces the old bug');
    assert.deepEqual(await play(false), [], 'no unlisted guess out-scores a ranked one in the current pack');
});

test('a round recorded with a pack this code does not know falls back to the current pack', async () => {
    const h = harness({ secretWords: ['행복'] });
    const token = 'a'.repeat(64);
    assert.equal((await h.call('leaderboard', null, 'GET', token)).status, 200);
    const slot = roundSlotAt(h.getNow());
    const [answer, top1, top10, top1000] = h.semantleStore.secrets[0];
    h.db.sqlite.prepare(`INSERT INTO sm_rounds(round_id, lang, round_no, secret_id, answer_word, sim_scale, top1, top10, top1000, started_at, ends_at, created_at, data_pack)
        VALUES (?, 'ko', ?, 0, ?, 10000, ?, ?, ?, ?, ?, ?, 'v99')`)
        .run(slot.roundId, slot.roundNo, answer, top1, top10, top1000, slot.startedAt, slot.endsAt, h.getNow());
    const game = await h.start(token);
    assert.equal(game.game.status, 'active');
    const res = await h.guess(game.game, '기쁨', crypto.randomUUID(), token);
    assert.equal(res.status, 200);
    assert.equal(res.data.event.rank, 1);
});

test('runtime migration tolerates another isolate adding the same column first', async () => {
    const db = database();
    await initialize(db);
    db.sqlite.exec("UPDATE sm_meta SET value = 'semantle-old' WHERE key = 'schema_version'");
    // This isolate read PRAGMA table_info before the other isolate's ALTER TABLE landed.
    const lagging = {
        ...db,
        prepare(sql) {
            const statement = db.prepare(sql);
            return /^PRAGMA table_info\(sm_rounds\)/.test(sql) ? { ...statement, all: async () => ({ results: [] }) } : statement;
        },
    };
    await initialize(lagging);
    assert.equal(db.sqlite.prepare("SELECT value FROM sm_meta WHERE key = 'schema_version'").get().value, SCHEMA_VERSION);
    assert.ok(db.sqlite.prepare('PRAGMA table_info(sm_rounds)').all().some(row => row.name === 'data_pack'));
});
