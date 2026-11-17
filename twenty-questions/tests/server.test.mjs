import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness } from './helpers.mjs';
import { twentyQuestionsRoute, handleRoomRequest } from '../../server/twenty-questions/service.mjs';
import { calibrateSim, sanitizePlayerName } from '../../server/twenty-questions/core.mjs';
import { submitRanking } from '../../game-api-worker.js';

test('start, resume, idempotent start, active timer immutability, and secret isolation work end to end', async () => {
    const h = harness();
    const id = crypto.randomUUID();
    const a = await h.call('games', { requestId: id, locale: 'ko' });
    const b = await h.call('games', { requestId: id, locale: 'ko' });
    const c = await h.start();
    assert.equal(a.status, 200);
    assert.equal(a.data.game.id, b.data.game.id);
    assert.equal(c.game.id, a.data.game.id);
    assert.equal(c.game.createdAt, a.data.game.createdAt);
    assert.ok(Number.isFinite(a.data.serverNow));
    assert.equal(a.data.game.answer, undefined);
    assert.ok(a.data.game.benchmarks.top1 > a.data.game.benchmarks.top10);
    assert.ok(a.data.game.benchmarks.top10 >= a.data.game.benchmarks.top1000);
    assert.doesNotMatch(JSON.stringify(a.data), /answer_word|secret_id|sim_scale/);
    const foreign = await h.call(`games/${a.data.game.id}`, null, 'GET', 'b'.repeat(64));
    assert.equal(foreign.status, 404);
    h.db.sqlite.close();
});

test('parallel starts are serialized and consume only one secret', async () => {
    const h = harness();
    const results = await Promise.all([h.start(), h.start(), h.start()]);
    assert.equal(new Set(results.map(r => r.game.id)).size, 1);
    assert.equal(h.row('SELECT COUNT(*) n FROM sm_seen').n, 1);
    h.db.sqlite.close();
});

test('guesses charge count cleanly while OOV and duplicates do not alter version or guessCount', async () => {
    const h = harness({ secretWords: ['행복'] });
    let { game } = await h.start();

    let res = await h.guess(game, '기쁨');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.code, 'guess');
    assert.equal(res.data.event.rank, 1);
    assert.equal(res.data.game.guessCount, 1);
    game = res.data.game;

    // Outside Top-1,000 valid word still scores similarity and increments guessCount.
    res = await h.guess(game, '물');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.rank, null);
    assert.equal(res.data.game.guessCount, 2);
    game = res.data.game;

    // Duplicate word does not increment guessCount or version.
    res = await h.guess(game, '기쁨');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.code, 'duplicate');
    assert.equal(res.data.game.guessCount, 2);
    assert.equal(res.data.game.version, game.version);

    // Unknown or non-Hangul word does not increment guessCount or version.
    res = await h.guess(game, '뷁뷁뷁');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.code, 'unknown_word');
    assert.equal(res.data.game.guessCount, 2);

    res = await h.guess(game, 'hello');
    assert.equal(res.status, 200);
    assert.equal(res.data.event.code, 'unknown_word');
    assert.equal(res.data.game.guessCount, 2);

    // Idempotent replay with same requestId returns exact replay without double increment.
    const reqId = crypto.randomUUID();
    const g1 = await h.guess(game, '사랑', reqId);
    const g2 = await h.guess(game, '사랑', reqId);
    assert.equal(g1.data.game.guessCount, 3);
    assert.equal(g2.data.game.guessCount, 3);
    assert.equal(g2.data.event.replayed, true);
    assert.equal((await h.guess(game, '사람', reqId)).status, 409);

    h.db.sqlite.close();
});

test('fastest-time ranking, anti-cheat unranked filters, calibration consistency, and post-game explore hold', async () => {
    const h = harness({ secretWords: ['행복', '학교', '사과'] });

    // Round 1: Single-guess solve wins locally but stays unranked on leaderboard.
    const s1 = await h.start();
    const a1 = h.answer(s1.game.id);
    const w1 = await h.guess(s1.game, a1);
    assert.equal(w1.status, 200);
    assert.equal(w1.data.game.status, 'won');
    assert.equal(w1.data.game.ranked, false);
    assert.equal(w1.data.game.unrankedReason, 'single_guess');
    assert.equal(w1.data.profile.bestTimeMs, null);

    // Round 2: Sub-1.5s multi-guess solve also stays unranked to block bot sniping.
    const s2 = await h.start();
    const a2 = h.answer(s2.game.id);
    const g2a = (await h.guess(s2.game, '사람')).data;
    const w2 = await h.guess(g2a.game, a2);
    assert.equal(w2.data.game.status, 'won');
    assert.equal(w2.data.game.ranked, false);
    assert.equal(w2.data.game.unrankedReason, 'too_fast');
    assert.equal(w2.data.profile.bestTimeMs, null);

    // Round 3: Valid >=2 guesses and >=1.5s elapsed -> ranked on Hall of Fame!
    const s3 = await h.start();
    const a3 = h.answer(s3.game.id);
    assert.equal((await h.call(`games/${s3.game.id}/nearest`, null, 'GET')).status, 403);
    assert.equal((await h.call(`games/${s3.game.id}/explore`, { text: '사랑' })).status, 403);

    const g3a = (await h.guess(s3.game, '사람')).data;
    h.db.sqlite.prepare('UPDATE sm_games SET created_at = ? WHERE id = ?').run(Date.now() - 8500, s3.game.id);
    const w3 = await h.guess(g3a.game, a3);
    assert.equal(w3.status, 200);
    assert.equal(w3.data.game.status, 'won');
    assert.equal(w3.data.game.ranked, true);
    assert.equal(w3.data.game.unrankedReason, null);
    assert.ok(w3.data.game.solvedMs >= 8000);
    assert.equal(w3.data.profile.bestTimeMs, w3.data.game.solvedMs);
    assert.equal(w3.data.profile.bestTimeGuesses, 2);
    assert.equal(w3.data.game.recordImproved, true);

    // Calibrated nearest-1k and post-game explore share identical similarity scores.
    const nearest = await h.call(`games/${s3.game.id}/nearest`, null, 'GET');
    assert.equal(nearest.status, 200);
    assert.equal(nearest.data.words.length, 1000);
    const probeWord = nearest.data.words[0].word;
    const explored = await h.call(`games/${s3.game.id}/explore`, { text: probeWord });
    assert.equal(explored.status, 200);
    assert.equal(explored.data.similarity, nearest.data.words[0].similarity);
    assert.equal(h.row('SELECT guess_count FROM sm_games WHERE id = ?', s3.game.id).guess_count, 2);

    // Pool wraps cleanly on 4th round with streak intact.
    const s4 = await h.start();
    assert.equal(s4.profile.streak, 3);
    assert.equal(s4.game.caseNo, 4);

    // Leaderboard orders fastest bestTimeMs ASC, breaking ties by guesses ASC.
    h.db.sqlite.prepare('INSERT INTO sm_players(id, name, name_key, best_time_ms, best_time_guesses, wins, best_streak, best_at, last_seen) VALUES (?, ?, ?, ?, ?, 1, 1, 999, 0)')
        .run('p-faster', 'SpeedRunner', 'speedrunner', 4200, 5);
    h.db.sqlite.prepare('INSERT INTO sm_players(id, name, name_key, best_time_ms, best_time_guesses, wins, best_streak, best_at, last_seen) VALUES (?, ?, ?, ?, ?, 1, 1, 999, 0)')
        .run('p-tie-fewer', 'PreciseRunner', 'preciserunner', 4200, 3);
    const lb = await h.call('leaderboard');
    assert.equal(lb.data.entries[0].name, 'PreciseRunner');
    assert.equal(lb.data.entries[0].bestTimeMs, 4200);
    assert.equal(lb.data.entries[1].name, 'SpeedRunner');
    assert.ok(lb.data.entries.every(row => !Object.hasOwn(row, 'id')));

    h.db.sqlite.close();
});

test('anti-cheat blocks give-up reroll farming, duplicate nicknames, CSRF, prototype pollution, and leaks', async () => {
    const h = harness({ secretWords: ['행복', '학교', '사과'] });

    // Zero-guess give-up spam is throttled after 4 attempts in 10 minutes.
    for (let i = 0; i < 4; i++) {
        const s = await h.start();
        const gu = await h.call(`games/${s.game.id}/give-up`, { requestId: crypto.randomUUID(), expectedVersion: s.game.version });
        assert.equal(gu.status, 200);
    }
    const s5 = await h.start();
    const blockedGu = await h.call(`games/${s5.game.id}/give-up`, { requestId: crypto.randomUUID(), expectedVersion: s5.game.version });
    assert.equal(blockedGu.status, 429);
    assert.equal(blockedGu.data.error, 'rate_limited');

    // Name sanitization & uniqueness.
    assert.equal(sanitizePlayerName('\u202EStar\u200BGazer'), 'StarGazer');
    assert.equal(sanitizePlayerName('..'), null);
    const inv = await h.call('profile', { name: '..' }, 'PATCH');
    assert.equal(inv.status, 400);

    const tokenB = 'b'.repeat(64);
    assert.equal((await h.call('profile', { name: 'AlphaUser' }, 'PATCH')).status, 200);
    const taken = await h.call('profile', { name: 'alphauser' }, 'PATCH', tokenB);
    assert.equal(taken.status, 409);
    assert.equal(taken.data.error, 'name_taken');

    // Monotone calibration check.
    assert.equal(calibrateSim(10000, 9812, true), 10000);
    assert.ok(calibrateSim(6000, 9812, false) > calibrateSim(5000, 9812, false));

    // Security headers, Origin/Sec-Fetch-Site blocks, prototype pollution, and score-event isolation.
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
    assert.equal(statusJson.ruleset, 'semantle-ko-v1');

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
    }
    h.db.sqlite.close();
});

test('DO room cache + deferred batch flushes cleanly before solve and give-up', async () => {
    const h = harness({ secretWords: ['행복'] });
    const pendingFlushes = [];
    const queued = [];
    const runtime = {
        roomCache: { player: null, game: null, guesses: null },
        clearCache: () => {
            runtime.roomCache.player = null;
            runtime.roomCache.game = null;
            runtime.roomCache.guesses = null;
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
    assert.equal(g1.data.event.code, 'guess');
    assert.equal(queued.length, 1);
    game = g1.data.game;

    const g2 = await callRoom(`games/${game.id}/guesses`, { text: '에어프라이어', expectedVersion: game.version, requestId: crypto.randomUUID() });
    assert.equal(g2.status, 200);
    assert.equal(g2.data.event.code, 'guess');
    assert.equal(queued.length, 2);
    game = g2.data.game;

    const gu = await callRoom(`games/${game.id}/give-up`, { expectedVersion: game.version, requestId: crypto.randomUUID() });
    assert.equal(gu.status, 200);
    assert.equal(gu.data.game.status, 'given_up');
    assert.equal(h.row('SELECT COUNT(*) n FROM sm_guesses WHERE game_id = ?', game.id).n, 2);
    await runtime.flushBatch();
    h.db.sqlite.close();
});
