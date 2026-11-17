import {
    RULESET, SESSION_MS, normalizeWord, isValidHangulWord, sanitizePlayerName,
    deriveSimScale, calibrateSim, nextRecord, fault, fingerprint, publicProfile,
} from './core.mjs';
import { initialize, limit, cleanExpiredRecords } from './database.mjs';
import { dataReady, loadVocab, loadSecretTop1k, scoreGuessWord, preloadVectors, formatSimilarity } from './vectors.mjs';

const ID = /^[a-zA-Z0-9_-]{16,100}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export async function identity(request) {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    if (!TOKEN.test(token)) throw fault('unauthorized', 401);
    return fingerprint(`semantle-player-v1:${token}`);
}

async function ipFingerprint(request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    return fingerprint(`semantle-ip-v1:${ip}`);
}

async function enforceDualLimit(db, action, playerId, ipHash, windowMs, playerMax, ipMax) {
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const expiresAt = (bucket + 1) * windowMs;
    await limit(db, `${action}:p:${playerId}:${bucket}`, playerMax, expiresAt);
    await limit(db, `${action}:ip:${ipHash}:${bucket}`, ipMax, expiresAt);
}

export function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...SECURITY_HEADERS,
        },
    });
}

export function failure(error) {
    const status = error.status || 503;
    const result = response({ error: error.code || 'service_unavailable', retryAfter: error.retryAfter || 0 }, status);
    if (error.retryAfter) result.headers.set('Retry-After', String(error.retryAfter));
    return result;
}

async function readBody(request) {
    if (!request.headers.get('Content-Type')?.includes('application/json')) throw fault('invalid_request');
    const reader = request.body?.getReader();
    if (!reader) throw fault('invalid_request');
    const pieces = [];
    let total = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 4096) {
            await reader.cancel();
            throw fault('input_too_long', 413);
        }
        pieces.push(value);
    }
    const bytes = new Uint8Array(total);
    let position = 0;
    for (const piece of pieces) {
        bytes.set(piece, position);
        position += piece.length;
    }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw fault('invalid_request'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fault('invalid_request');
    if (Object.hasOwn(body, '__proto__') || Object.hasOwn(body, 'constructor') || Object.hasOwn(body, 'prototype')) {
        throw fault('invalid_request');
    }
    return body;
}

async function hydratePlayer(db, id, ipHash, runtime) {
    const cache = runtime?.roomCache;
    if (cache?.player && cache.player.id === id) {
        return cache.player;
    }
    await runtime?.flushBatch?.();
    let player = await db.prepare('SELECT * FROM sm_players WHERE id = ?').bind(id).first();
    if (!player) {
        const day = new Date().toISOString().slice(0, 10);
        await limit(db, `register:${day}:${ipHash}`, 20, Date.now() + SESSION_MS);
        const now = Date.now();
        await db.prepare('INSERT OR IGNORE INTO sm_players(id, name, name_key, last_seen) VALUES (?, ?, NULL, ?)')
            .bind(id, `Explorer ${id.slice(0, 5).toUpperCase()}`, now).run();
        player = await db.prepare('SELECT * FROM sm_players WHERE id = ?').bind(id).first();
    } else if (!runtime) {
        await db.prepare('UPDATE sm_players SET last_seen = ? WHERE id = ?').bind(Date.now(), id).run();
    }
    if (cache) cache.player = { ...player };
    return cache ? cache.player : player;
}

async function hydrateGame(db, player, id, runtime) {
    if (!ID.test(id)) throw fault('not_found', 404);
    const cache = runtime?.roomCache;
    if (cache?.game && cache.game.id === id && cache.game.player_id === player.id) {
        return cache.game;
    }
    await runtime?.flushBatch?.();
    const game = await db.prepare('SELECT * FROM sm_games WHERE id = ? AND player_id = ?').bind(id, player.id).first();
    if (!game) throw fault('not_found', 404);
    if (cache) {
        const gRows = await db.prepare('SELECT request_id, guess_no, word, similarity, rank, version FROM sm_guesses WHERE game_id = ? ORDER BY guess_no ASC')
            .bind(game.id).all();
        cache.game = { ...game };
        cache.guesses = (gRows.results || []).map(row => ({ ...row }));
    }
    return cache ? cache.game : game;
}

async function hydrateGuesses(db, game, runtime) {
    const cache = runtime?.roomCache;
    if (cache?.game?.id === game.id && Array.isArray(cache.guesses)) {
        return cache.guesses;
    }
    const rows = await db.prepare('SELECT request_id, guess_no, word, similarity, rank, version FROM sm_guesses WHERE game_id = ? ORDER BY guess_no ASC')
        .bind(game.id).all();
    return rows.results || [];
}

function serializeGuess(row) {
    return {
        requestId: row.request_id,
        guessNo: row.guess_no,
        word: row.word,
        similarity: formatSimilarity(row.similarity),
        rank: row.rank,
        version: row.version,
    };
}

function formatStatePayload(player, game, guessRows, event = null) {
    return {
        profile: publicProfile(player),
        ruleset: RULESET,
        serverNow: Date.now(),
        event,
        game: game ? {
            id: game.id,
            caseNo: game.case_no,
            status: game.status,
            guessCount: game.guess_count,
            bestSimilarity: game.guess_count > 0 ? formatSimilarity(game.best_sim) : null,
            bestRank: game.best_rank,
            version: game.version,
            createdAt: game.created_at,
            updatedAt: game.updated_at,
            solvedMs: game.solved_ms ?? null,
            ranked: Boolean(game.ranked),
            unrankedReason: game.unranked_reason || null,
            recordImproved: Boolean(game.record_improved),
            benchmarks: {
                top1: formatSimilarity(game.top1),
                top10: formatSimilarity(game.top10),
                top1000: formatSimilarity(game.top1000),
            },
            guesses: guessRows.map(serializeGuess),
            ...(game.status !== 'active' ? { answer: game.answer_word } : {}),
        } : null,
    };
}

async function stateFor(db, player, game, runtime, event = null) {
    if (runtime?.roomCache) {
        const p = runtime.roomCache.player || player;
        const guessRows = game ? await hydrateGuesses(db, game, runtime) : [];
        return formatStatePayload(p, game, guessRows, event);
    }
    const freshPlayer = await db.prepare('SELECT * FROM sm_players WHERE id = ?').bind(player.id).first();
    const guesses = game ? await hydrateGuesses(db, game, null) : [];
    return formatStatePayload(freshPlayer, game, guesses, event);
}

function randomIndex(length) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % length;
}

async function startGame(db, env, player, ipHash, body, runtime) {
    if (!ID.test(body.requestId || '')) throw fault('invalid_request');
    await runtime?.flushBatch?.();
    const hash = await fingerprint(JSON.stringify({ locale: body.locale || 'ko' }));
    const old = await db.prepare('SELECT * FROM sm_requests WHERE player_id = ? AND request_id = ?')
        .bind(player.id, body.requestId).first();
    if (old) {
        if (old.payload_hash !== hash) throw fault('request_conflict', 409);
        const existing = await hydrateGame(db, player, old.game_id, runtime);
        return stateFor(db, player, existing, runtime);
    }
    if (player.active_game) {
        const active = await hydrateGame(db, player, player.active_game, runtime);
        if (active.status === 'active') {
            runtime?.waitUntil?.(preloadVectors(env, active.secret_id, active.answer_word));
            return stateFor(db, player, active, runtime);
        }
    }
    if (!dataReady(env)) throw fault('service_unavailable', 503);
    const now = Date.now();
    await enforceDualLimit(db, 'start', player.id, ipHash, 60000, 12, 20);

    const vocab = await loadVocab(env);
    const totalSecrets = vocab.secrets.length;
    const seenRows = await db.prepare('SELECT secret_id FROM sm_seen WHERE player_id = ?').bind(player.id).all();
    let seenSet = new Set(seenRows.results.map(row => row.secret_id));
    const resetPool = seenSet.size >= totalSecrets;
    if (resetPool) seenSet = new Set();

    const available = [];
    for (let i = 0; i < totalSecrets; i++) {
        if (!seenSet.has(i)) available.push(i);
    }
    const secretId = available[randomIndex(available.length)];
    const [answerWord, rawTop1, rawTop10, rawTop1000] = vocab.secrets[secretId];
    const id = crypto.randomUUID();
    const simScale = await deriveSimScale(id, secretId);
    const top1 = calibrateSim(rawTop1, simScale, false);
    const top10 = calibrateSim(rawTop10, simScale, false);
    const top1000 = calibrateSim(rawTop1000, simScale, false);
    const caseNo = (player.games_played || 0) + 1;

    const queries = [];
    if (resetPool) {
        queries.push(db.prepare('DELETE FROM sm_seen WHERE player_id = ?').bind(player.id));
    }
    queries.push(
        db.prepare('INSERT INTO sm_seen(player_id, secret_id, first_game, created_at) VALUES (?, ?, ?, ?)')
            .bind(player.id, secretId, id, now),
        db.prepare(`INSERT INTO sm_games(
            id, player_id, case_no, secret_id, answer_word, sim_scale, top1, top10, top1000, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(id, player.id, caseNo, secretId, answerWord, simScale, top1, top10, top1000, now, now),
        db.prepare('UPDATE sm_players SET active_game = ?, games_played = games_played + 1, last_seen = ? WHERE id = ?')
            .bind(id, now, player.id),
        db.prepare('INSERT INTO sm_requests(player_id, request_id, payload_hash, game_id, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(player.id, body.requestId, hash, id, now),
    );
    await db.batch(queries);

    if (runtime?.roomCache) {
        runtime.roomCache.player = { ...player, active_game: id, games_played: caseNo, last_seen: now };
        runtime.roomCache.game = {
            id,
            player_id: player.id,
            case_no: caseNo,
            secret_id: secretId,
            answer_word: answerWord,
            sim_scale: simScale,
            top1,
            top10,
            top1000,
            status: 'active',
            guess_count: 0,
            best_sim: -10000,
            best_rank: null,
            version: 0,
            created_at: now,
            updated_at: now,
            solved_ms: null,
            ranked: 0,
            unranked_reason: null,
            record_improved: 0,
        };
        runtime.roomCache.guesses = [];
    }

    runtime?.waitUntil?.(preloadVectors(env, secretId, answerWord));
    if (caseNo % 15 === 0) {
        const prune = cleanExpiredRecords(db, now).catch(() => {});
        runtime?.waitUntil ? runtime.waitUntil(prune) : void prune;
    }
    const createdGame = runtime?.roomCache ? runtime.roomCache.game : await hydrateGame(db, player, id, null);
    return stateFor(db, player, createdGame, runtime, { code: 'started' });
}

async function performGuess(db, env, player, ipHash, game, body, runtime) {
    if (!ID.test(body.requestId || '') || !Number.isInteger(body.expectedVersion)) throw fault('invalid_request');
    const word = normalizeWord(body.text);
    if (!word || /[\u0000-\u001F]/u.test(word)) throw fault('invalid_request');
    if ([...word].length > 32) throw fault('input_too_long');

    const guessRows = await hydrateGuesses(db, game, runtime);
    const existingReq = runtime?.roomCache
        ? guessRows.find(row => row.request_id === body.requestId)
        : await db.prepare('SELECT * FROM sm_guesses WHERE game_id = ? AND request_id = ?')
            .bind(game.id, body.requestId).first();
    if (existingReq) {
        if (existingReq.word !== word) throw fault('request_conflict', 409);
        return stateFor(db, player, game, runtime, {
            code: existingReq.similarity === 10000 ? 'won' : 'guess',
            word: existingReq.word,
            guessNo: existingReq.guess_no,
            similarity: formatSimilarity(existingReq.similarity),
            rank: existingReq.rank,
            requestId: body.requestId,
            replayed: true,
        });
    }
    if (game.status !== 'active') throw fault('game_finished', 409);
    if (game.version !== body.expectedVersion) throw fault('stale_state', 409);

    const now = Date.now();
    await enforceDualLimit(db, 'guess10s', player.id, ipHash, 10000, 18, 25);
    await enforceDualLimit(db, 'guess1m', player.id, ipHash, 60000, 45, 65);

    if (!isValidHangulWord(word)) {
        return stateFor(db, player, game, runtime, { code: 'unknown_word', word, requestId: body.requestId });
    }

    const vocab = await loadVocab(env);
    const scored = await scoreGuessWord(env, vocab, game.secret_id, word, game.answer_word);
    if (!scored) {
        return stateFor(db, player, game, runtime, { code: 'unknown_word', word, requestId: body.requestId });
    }

    const existingWord = runtime?.roomCache
        ? guessRows.find(row => row.word === word)
        : await db.prepare('SELECT * FROM sm_guesses WHERE game_id = ? AND word = ?')
            .bind(game.id, word).first();
    if (existingWord) {
        return stateFor(db, player, game, runtime, {
            code: 'duplicate',
            word: existingWord.word,
            guessNo: existingWord.guess_no,
            similarity: formatSimilarity(existingWord.similarity),
            rank: existingWord.rank,
            requestId: body.requestId,
        });
    }

    const hash = await fingerprint(JSON.stringify({ action: 'guess', word }));
    const simCenti = calibrateSim(scored.simCenti, game.sim_scale, scored.exact);
    const guessNo = game.guess_count + 1;
    const version = game.version + 1;
    const status = scored.exact ? 'won' : 'active';
    const solvedMs = scored.exact ? Math.max(1, now - game.created_at) : null;
    const bestSim = Math.max(game.best_sim, simCenti);
    const bestRank = scored.exact
        ? 0
        : scored.rank !== null
            ? (game.best_rank === null ? scored.rank : Math.min(game.best_rank, scored.rank))
            : game.best_rank;
    const record = scored.exact ? nextRecord(player, solvedMs, guessNo, now) : null;
    const similarity = formatSimilarity(simCenti);

    const guessSql = `INSERT INTO sm_guesses(
        game_id, word, request_id, guess_no, similarity, rank, version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const guessParams = [game.id, word, body.requestId, guessNo, simCenti, scored.rank, version, now];

    const logSql = `INSERT OR IGNORE INTO sm_logs(
        game_id, request_id, player_id, secret_id, answer_word, action, guess_word, similarity, rank, guess_no, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const logParams = [game.id, body.requestId, player.id, game.secret_id, game.answer_word, scored.exact ? 'won' : 'guess', word, similarity, scored.rank, guessNo, now];

    const gameSql = `UPDATE sm_games SET status = ?, guess_count = ?, best_sim = ?, best_rank = ?, version = ?, updated_at = ?, solved_ms = ?, ranked = ?, unranked_reason = ?, record_improved = ? WHERE id = ?`;
    const gameParams = [status, guessNo, bestSim, bestRank, version, now, solvedMs, record?.ranked ? 1 : 0, record?.unrankedReason || null, record?.improved ? 1 : 0, game.id];

    const reqSql = 'INSERT OR IGNORE INTO sm_requests(player_id, request_id, payload_hash, game_id, created_at) VALUES (?, ?, ?, ?, ?)';
    const reqParams = [player.id, body.requestId, hash, game.id, now];

    const playerSql = record
        ? `UPDATE sm_players SET
            active_game = NULL, wins = wins + 1, total_guesses = total_guesses + 1,
            streak = ?, streak_guesses = ?, best_streak = ?, best_guesses = ?,
            best_time_ms = ?, best_time_guesses = ?, best_at = ?, last_seen = ?
            WHERE id = ?`
        : 'UPDATE sm_players SET total_guesses = total_guesses + 1, last_seen = ? WHERE id = ?';
    const playerParams = record
        ? [record.streak, record.streak_guesses, record.best_streak, record.best_guesses,
            record.best_time_ms, record.best_time_guesses, record.best_at, now, player.id]
        : [now, player.id];

    // 일반 추측은 DO 아웃박스로 즉시 응답(<5ms 커밋) 후 D1 비동기 반영, 정답 클리어만 D1 동기 확정
    if (runtime?.roomCache && !scored.exact) {
        runtime.deferBatch([
            { sql: guessSql, params: guessParams },
            { sql: logSql, params: logParams },
            { sql: gameSql, params: gameParams },
            { sql: reqSql, params: reqParams },
            { sql: playerSql, params: playerParams },
        ]);
        runtime.roomCache.game = {
            ...game,
            status,
            guess_count: guessNo,
            best_sim: bestSim,
            best_rank: bestRank,
            version,
            updated_at: now,
            solved_ms: solvedMs,
            ranked: 0,
            unranked_reason: null,
            record_improved: 0,
        };
        runtime.roomCache.guesses.push({
            request_id: body.requestId,
            guess_no: guessNo,
            word,
            similarity: simCenti,
            rank: scored.rank,
            version,
        });
        runtime.roomCache.player = {
            ...player,
            total_guesses: (player.total_guesses || 0) + 1,
            last_seen: now,
        };
        return formatStatePayload(runtime.roomCache.player, runtime.roomCache.game, runtime.roomCache.guesses, {
            code: 'guess',
            word,
            guessNo,
            similarity,
            rank: scored.rank,
            requestId: body.requestId,
            ranked: false,
            unrankedReason: null,
            recordImproved: false,
        });
    }

    await runtime?.flushBatch?.();
    await db.batch([
        db.prepare(guessSql).bind(...guessParams),
        db.prepare(logSql).bind(...logParams),
        db.prepare(gameSql).bind(...gameParams),
        db.prepare(reqSql).bind(...reqParams),
        db.prepare(playerSql).bind(...playerParams),
    ]);

    if (runtime?.roomCache) {
        runtime.roomCache.game = {
            ...game,
            status,
            guess_count: guessNo,
            best_sim: bestSim,
            best_rank: bestRank,
            version,
            updated_at: now,
            solved_ms: solvedMs,
            ranked: record?.ranked ? 1 : 0,
            unranked_reason: record?.unrankedReason || null,
            record_improved: record?.improved ? 1 : 0,
        };
        runtime.roomCache.guesses.push({
            request_id: body.requestId,
            guess_no: guessNo,
            word,
            similarity: simCenti,
            rank: scored.rank,
            version,
        });
        runtime.roomCache.player = {
            ...player,
            active_game: null,
            wins: (player.wins || 0) + 1,
            total_guesses: (player.total_guesses || 0) + 1,
            streak: record.streak,
            streak_guesses: record.streak_guesses,
            best_streak: record.best_streak,
            best_guesses: record.best_guesses,
            best_time_ms: record.best_time_ms,
            best_time_guesses: record.best_time_guesses,
            best_at: record.best_at,
            last_seen: now,
        };
    }

    const updatedGame = runtime?.roomCache
        ? runtime.roomCache.game
        : await db.prepare('SELECT * FROM sm_games WHERE id = ?').bind(game.id).first();
    return stateFor(db, player, updatedGame, runtime, {
        code: scored.exact ? 'won' : 'guess',
        word,
        guessNo,
        similarity,
        rank: scored.rank,
        requestId: body.requestId,
        ranked: Boolean(record?.ranked),
        unrankedReason: record?.unrankedReason || null,
        recordImproved: Boolean(record?.improved),
    });
}

async function performGiveUp(db, player, ipHash, game, body, runtime) {
    if (!ID.test(body.requestId || '') || !Number.isInteger(body.expectedVersion)) throw fault('invalid_request');
    await runtime?.flushBatch?.();
    const hash = await fingerprint(JSON.stringify({ action: 'give-up', gameId: game.id }));
    const oldReq = await db.prepare('SELECT * FROM sm_requests WHERE player_id = ? AND request_id = ?')
        .bind(player.id, body.requestId).first();
    if (oldReq) {
        if (oldReq.payload_hash !== hash) throw fault('request_conflict', 409);
        return stateFor(db, player, game, runtime, { code: 'given_up', requestId: body.requestId, replayed: true });
    }
    if (game.status !== 'active') throw fault('game_finished', 409);
    if (game.version !== body.expectedVersion) throw fault('stale_state', 409);

    if (game.guess_count === 0) {
        await enforceDualLimit(db, 'giveup0', player.id, ipHash, 600000, 4, 6);
    }
    await enforceDualLimit(db, 'giveup', player.id, ipHash, 60000, 6, 10);

    const now = Date.now();
    const version = game.version + 1;
    await db.batch([
        db.prepare("UPDATE sm_games SET status = 'given_up', version = ?, updated_at = ? WHERE id = ?")
            .bind(version, now, game.id),
        db.prepare('UPDATE sm_players SET active_game = NULL, streak = 0, streak_guesses = 0, give_ups = give_ups + 1, last_seen = ? WHERE id = ?')
            .bind(now, player.id),
        db.prepare(`INSERT OR IGNORE INTO sm_logs(
            game_id, request_id, player_id, secret_id, answer_word, action, guess_word, similarity, rank, guess_no, created_at
        ) VALUES (?, ?, ?, ?, ?, 'give_up', '', NULL, NULL, ?, ?)`)
            .bind(game.id, body.requestId, player.id, game.secret_id, game.answer_word, game.guess_count, now),
        db.prepare('INSERT INTO sm_requests(player_id, request_id, payload_hash, game_id, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(player.id, body.requestId, hash, game.id, now),
    ]);

    if (runtime?.roomCache) {
        runtime.roomCache.game = { ...game, status: 'given_up', version, updated_at: now };
        runtime.roomCache.player = {
            ...player,
            active_game: null,
            streak: 0,
            streak_guesses: 0,
            give_ups: (player.give_ups || 0) + 1,
            last_seen: now,
        };
    }

    const updated = runtime?.roomCache
        ? runtime.roomCache.game
        : await db.prepare('SELECT * FROM sm_games WHERE id = ?').bind(game.id).first();
    return stateFor(db, player, updated, runtime, { code: 'given_up', requestId: body.requestId });
}

async function performExplore(db, env, player, ipHash, game, body) {
    if (game.status === 'active') throw fault('forbidden', 403);
    const word = normalizeWord(body.text);
    if (!word || /[\u0000-\u001F]/u.test(word)) throw fault('invalid_request');
    if ([...word].length > 32) throw fault('input_too_long');
    await enforceDualLimit(db, 'explore', player.id, ipHash, 60000, 120, 180);

    if (!isValidHangulWord(word)) return { code: 'unknown_word', word };
    const vocab = await loadVocab(env);
    const scored = await scoreGuessWord(env, vocab, game.secret_id, word, game.answer_word);
    if (!scored) return { code: 'unknown_word', word };
    const simCenti = calibrateSim(scored.simCenti, game.sim_scale, scored.exact);
    return {
        code: scored.exact ? 'exact' : 'explored',
        word,
        similarity: formatSimilarity(simCenti),
        rank: scored.rank,
    };
}

export async function leaderboard(db, playerId) {
    const query = `SELECT id, name, best_time_ms, best_time_guesses, wins, best_streak, best_at,
        ROW_NUMBER() OVER (ORDER BY best_time_ms ASC, best_time_guesses ASC, best_at ASC, id ASC) AS rank
        FROM sm_players WHERE best_time_ms IS NOT NULL`;
    const top = await db.prepare(`SELECT * FROM (${query}) LIMIT 50`).all();
    const mine = playerId ? await db.prepare(`SELECT * FROM (${query}) WHERE id = ?`).bind(playerId).first() : null;
    const visible = row => row ? ({
        rank: row.rank,
        name: row.name,
        bestTimeMs: row.best_time_ms,
        guesses: row.best_time_guesses,
        wins: row.wins,
        streak: row.best_streak,
        turns: row.best_time_guesses,
        own: row.id === playerId,
    }) : null;
    return { entries: top.results.map(visible), mine: visible(mine), ruleset: RULESET };
}

export async function handleRoomRequest(request, env, runtime = null) {
    try {
        await initialize(env.DB);
        const id = await identity(request);
        const ipHash = await ipFingerprint(request);
        const player = await hydratePlayer(env.DB, id, ipHash, runtime);
        const pathname = new URL(request.url).pathname;
        const path = pathname.replace(/^\/twenty-questions\/?/, '');

        if (request.method === 'GET' && path === 'leaderboard') {
            await runtime?.flushBatch?.();
            return response(await leaderboard(env.DB, id));
        }
        if (request.method === 'GET' && path === 'profile') {
            const game = player.active_game ? await hydrateGame(env.DB, player, player.active_game, runtime) : null;
            runtime?.waitUntil?.(preloadVectors(env, game?.secret_id ?? null, game?.answer_word ?? null));
            return response(await stateFor(env.DB, player, game, runtime));
        }
        if (request.method === 'PATCH' && path === 'profile') {
            await enforceDualLimit(env.DB, 'rename', id, ipHash, 60000, 8, 12);
            const body = await readBody(request);
            const name = sanitizePlayerName(body.name);
            if (!name) throw fault('invalid_name');
            await runtime?.flushBatch?.();
            const nameKey = name.toLowerCase();
            const dup = await env.DB.prepare('SELECT id FROM sm_players WHERE name_key = ? AND id != ?').bind(nameKey, id).first();
            if (dup) throw fault('name_taken', 409);
            try {
                await env.DB.prepare('UPDATE sm_players SET name = ?, name_key = ? WHERE id = ?').bind(name, nameKey, id).run();
            } catch (err) {
                if (/UNIQUE/i.test(String(err?.message))) throw fault('name_taken', 409);
                throw err;
            }
            if (runtime?.roomCache?.player) {
                runtime.roomCache.player = { ...runtime.roomCache.player, name, name_key: nameKey };
            }
            const game = player.active_game ? await hydrateGame(env.DB, player, player.active_game, runtime) : null;
            return response(await stateFor(env.DB, player, game, runtime));
        }
        if (request.method === 'POST' && path === 'games') {
            return response(await startGame(env.DB, env, player, ipHash, await readBody(request), runtime));
        }
        const match = /^games\/([a-zA-Z0-9_-]+)(?:\/(guesses|give-up|nearest|explore))?$/.exec(path);
        if (!match) throw fault('not_found', 404);
        const game = await hydrateGame(env.DB, player, match[1], runtime);
        if (request.method === 'GET' && !match[2]) {
            runtime?.waitUntil?.(preloadVectors(env, game.secret_id, game.answer_word));
            return response(await stateFor(env.DB, player, game, runtime));
        }
        if (request.method === 'GET' && match[2] === 'nearest') {
            if (game.status === 'active') throw fault('forbidden', 403);
            const vocab = await loadVocab(env);
            const effectiveSecretId = (game.answer_word && vocab.secretWordToId?.has(game.answer_word))
                ? vocab.secretWordToId.get(game.answer_word)
                : game.secret_id;
            const top1k = await loadSecretTop1k(env, effectiveSecretId, vocab);
            return response({
                answer: game.answer_word,
                benchmarks: {
                    top1: formatSimilarity(game.top1),
                    top10: formatSimilarity(game.top10),
                    top1000: formatSimilarity(game.top1000),
                },
                words: top1k.list.map(item => ({
                    rank: item.rank,
                    word: item.word,
                    similarity: formatSimilarity(calibrateSim(Math.round(item.similarity * 100), game.sim_scale, false)),
                })),
            });
        }
        if (request.method === 'POST' && match[2] === 'guesses') {
            return response(await performGuess(env.DB, env, player, ipHash, game, await readBody(request), runtime));
        }
        if (request.method === 'POST' && match[2] === 'give-up') {
            return response(await performGiveUp(env.DB, player, ipHash, game, await readBody(request), runtime));
        }
        if (request.method === 'POST' && match[2] === 'explore') {
            return response(await performExplore(env.DB, env, player, ipHash, game, await readBody(request)));
        }
        throw fault('not_found', 404);
    } catch (error) {
        if (!error?.status || error.status >= 500) runtime?.clearCache?.();
        return failure(error);
    }
}

export async function twentyQuestionsRoute(request, env, ctx = null) {
    const origin = request.headers.get('Origin');
    const allowed = new Set(['https://game.archerlab.dev', ...(env.TQ_ALLOWED_ORIGINS || '').split(',').filter(Boolean)]);
    const local = env.TQ_LOCAL === 'true' && origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (origin && !allowed.has(origin) && !local) return response({ error: 'forbidden' }, 403);
    const fetchSite = request.headers.get('Sec-Fetch-Site');
    if (!origin && fetchSite === 'cross-site') return response({ error: 'forbidden' }, 403);

    let result;
    try {
        if (request.method === 'OPTIONS') {
            result = new Response(null, { status: 204 });
        } else if (new URL(request.url).pathname === '/twenty-questions/status' && request.method === 'GET') {
            await initialize(env.DB);
            ctx?.waitUntil?.(preloadVectors(env));
            result = response({ ready: dataReady(env), ruleset: RULESET });
        } else {
            const playerId = await identity(request);
            if (!env.TWENTY_GAMEPLAY) throw fault('service_unavailable', 503);
            result = await env.TWENTY_GAMEPLAY.get(env.TWENTY_GAMEPLAY.idFromName(playerId)).fetch(request);
        }
    } catch (error) {
        result = failure(error);
    }
    const headers = new Headers(result.headers);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Cache-Control', 'no-store');
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(result.body, { status: result.status, headers });
}
