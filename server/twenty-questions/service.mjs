import {
    RULESET, SESSION_MS, roundSlotAt, previousRoundSlot, selectRoundSecretIndex,
    parseLang, rulesetFor, dbRoundIdFor,
    normalizeWord, isValidWord, sanitizePlayerName,
    deriveSimScale, calibrateSim, nextRecord, fault, fingerprint, publicProfile,
} from './core.mjs';
import { initialize, limit, cleanExpiredRecords } from './database.mjs';
import { dataReady, loadVocab, loadSecretTop1k, scoreGuessWord, preloadVectors, formatSimilarity } from './vectors.mjs';

const ID = /^[a-zA-Z0-9_-]{16,100}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const ROUND_SUMMARY_TTL_MS = 5000;
const roundCacheByDb = new WeakMap();
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function getRoundCache(db) {
    if (!db || typeof db !== 'object') return null;
    let map = roundCacheByDb.get(db);
    if (!map) {
        map = new Map();
        roundCacheByDb.set(db, map);
    }
    return map;
}

function cacheRound(db, roundId, round) {
    const cache = getRoundCache(db);
    if (!cache || !round) return;
    if (cache.has(roundId)) cache.delete(roundId);
    else if (cache.size >= 32) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(roundId, round);
}

const nowMs = env => (typeof env?.NOW_FN === 'function' ? env.NOW_FN() : Date.now());

export async function identity(request, lang = 'ko') {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    if (!TOKEN.test(token)) throw fault('unauthorized', 401);
    const prefix = lang === 'en' ? 'semantle-player-v1:en:' : 'semantle-player-v1:';
    return fingerprint(`${prefix}${token}`);
}

async function ipFingerprint(request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    return fingerprint(`semantle-ip-v1:${ip}`);
}

async function enforceDualLimit(db, env, action, playerId, ipHash, windowMs, playerMax, ipMax) {
    const now = nowMs(env);
    const bucket = Math.floor(now / windowMs);
    const expiresAt = (bucket + 1) * windowMs;
    await limit(db, `${action}:p:${playerId}:${bucket}`, playerMax, expiresAt, now);
    await limit(db, `${action}:ip:${ipHash}:${bucket}`, ipMax, expiresAt, now);
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

async function hydratePlayer(db, env, id, lang, ipHash, runtime) {
    const cache = runtime?.roomCache;
    if (cache?.player && cache.player.id === id && (cache.player.lang || 'ko') === lang) {
        return cache.player;
    }
    await runtime?.flushBatch?.();
    const now = nowMs(env);
    let player = await db.prepare('SELECT * FROM sm_players WHERE id = ?').bind(id).first();
    if (!player) {
        const day = new Date(now).toISOString().slice(0, 10);
        await limit(db, `register:${day}:${ipHash}`, 20, now + SESSION_MS, now);
        await db.prepare('INSERT OR IGNORE INTO sm_players(id, lang, name, name_key, last_seen) VALUES (?, ?, ?, NULL, ?)')
            .bind(id, lang, `Explorer ${id.slice(0, 5).toUpperCase()}`, now).run();
        player = await db.prepare('SELECT * FROM sm_players WHERE id = ?').bind(id).first();
    } else if (!runtime) {
        await db.prepare('UPDATE sm_players SET last_seen = ? WHERE id = ?').bind(now, id).run();
    }
    if (cache) cache.player = { ...player };
    return cache ? cache.player : player;
}

async function hydrateGame(db, player, id, lang, runtime) {
    if (!ID.test(id)) throw fault('not_found', 404);
    const cache = runtime?.roomCache;
    if (cache?.game && cache.game.id === id && cache.game.player_id === player.id && (cache.game.lang || 'ko') === lang) {
        return cache.game;
    }
    await runtime?.flushBatch?.();
    const game = await db.prepare('SELECT * FROM sm_games WHERE id = ? AND player_id = ?').bind(id, player.id).first();
    if (!game || (game.lang || 'ko') !== lang) throw fault('not_found', 404);
    if (cache) {
        const gRows = await db.prepare('SELECT request_id, guess_no, word, similarity, rank, version FROM sm_guesses WHERE game_id = ? ORDER BY guess_no ASC')
            .bind(game.id).all();
        cache.game = { ...game };
        cache.guesses = (gRows.results || []).map(row => ({ ...row }));
    }
    return cache ? cache.game : game;
}

async function hydratePlayerRoundGame(db, player, roundId, runtime) {
    const cache = runtime?.roomCache;
    if (cache?.game && cache.game.player_id === player.id && cache.game.round_id === roundId) {
        return cache.game;
    }
    await runtime?.flushBatch?.();
    const game = await db.prepare('SELECT * FROM sm_games WHERE player_id = ? AND round_id = ?').bind(player.id, roundId).first();
    if (!game) {
        if (cache) {
            cache.game = null;
            cache.guesses = null;
        }
        return null;
    }
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

async function ensureRoundForSlot(db, env, slot, vocab, lang = 'ko') {
    const roundId = dbRoundIdFor(lang, slot.roundId);
    const cachedRound = getRoundCache(db)?.get(roundId);
    if (cachedRound) return cachedRound;
    let round = await db.prepare('SELECT * FROM sm_rounds WHERE round_id = ?').bind(roundId).first();
    if (round) {
        cacheRound(db, roundId, round);
        return round;
    }

    const baseSalt = env?.SEMANTLE_ROUND_SALT || 'archerlab-semantle-sync-k9v1';
    const salt = lang === 'en' ? `${baseSalt}:en` : baseSalt;
    const secretId = await selectRoundSecretIndex(slot.slotIndex, vocab.secrets.length, salt);
    const [answerWord, rawTop1, rawTop10, rawTop1000] = vocab.secrets[secretId];
    const simScale = await deriveSimScale(roundId, secretId);
    const top1 = calibrateSim(rawTop1, simScale, false);
    const top10 = calibrateSim(rawTop10, simScale, false);
    const top1000 = calibrateSim(rawTop1000, simScale, false);
    const now = nowMs(env);

    await db.prepare(`INSERT OR IGNORE INTO sm_rounds(
        round_id, lang, round_no, secret_id, answer_word, sim_scale, top1, top10, top1000, started_at, ends_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(roundId, lang, slot.roundNo, secretId, answerWord, simScale, top1, top10, top1000, slot.startedAt, slot.endsAt, now)
        .run();

    round = await db.prepare('SELECT * FROM sm_rounds WHERE round_id = ?').bind(roundId).first();
    if (!round) throw fault('service_unavailable', 503);
    cacheRound(db, roundId, round);
    return round;
}

async function loadRoundSummary(db, env, currentRound, vocab, lang, runtime, { forceFresh = false } = {}) {
    const now = nowMs(env);
    const cached = runtime?.roomCache?.roundSummary;
    if (!forceFresh && cached && cached.roundId === currentRound.round_id && cached.lang === lang && now >= cached.fetchedAt && (now - cached.fetchedAt) < ROUND_SUMMARY_TTL_MS) {
        return cached.summary;
    }

    const solverCte = `WITH current_solvers AS (
        SELECT g.player_id, p.name, p.name_key, g.solved_ms, g.solved_at,
            CASE WHEN p.name_key IS NOT NULL THEN 'n:' || p.name_key ELSE 'p:' || g.player_id END AS dedup_key
        FROM sm_games g
        JOIN sm_players p ON p.id = g.player_id
        WHERE g.round_id = ? AND g.status = 'won' AND g.ranked = 1
    ),
    per_name AS (
        SELECT player_id, name, name_key, solved_ms, solved_at,
            ROW_NUMBER() OVER (
                PARTITION BY dedup_key
                ORDER BY solved_ms ASC, solved_at ASC, player_id ASC
            ) AS name_rank
        FROM current_solvers
    )`;
    const [countRes, solverRes] = await db.batch([
        db.prepare(`${solverCte} SELECT COUNT(*) AS count FROM per_name WHERE name_rank = 1`).bind(currentRound.round_id),
        db.prepare(`${solverCte} SELECT name, name_key, solved_ms, solved_at FROM per_name WHERE name_rank = 1 ORDER BY solved_ms ASC, solved_at ASC, player_id ASC LIMIT 10`).bind(currentRound.round_id),
    ]);
    const countRow = countRes?.results?.[0] || null;
    const solvers = (solverRes?.results || []).map(row => ({
        name: row.name,
        hasCustomName: Boolean(row.name_key),
        solvedMs: row.solved_ms,
    }));

    let previous = null;
    if (currentRound.round_no > 1) {
        const prevSlot = previousRoundSlot({ startedAt: currentRound.started_at });
        const prevRoundId = dbRoundIdFor(lang, prevSlot.roundId);
        let prevRound = getRoundCache(db)?.get(prevRoundId) || null;
        if (!prevRound) {
            prevRound = await db.prepare('SELECT * FROM sm_rounds WHERE round_id = ?').bind(prevRoundId).first();
            if (prevRound) cacheRound(db, prevRoundId, prevRound);
        }
        if (!prevRound && vocab.secrets.length > 1) {
            prevRound = await ensureRoundForSlot(db, env, prevSlot, vocab, lang);
        }
        if (prevRound && prevRound.ends_at <= now) {
            previous = {
                id: prevRound.round_id.replace(/^en:/, ''),
                roundNo: prevRound.round_no,
                answer: prevRound.answer_word,
            };
        }
    }

    const summary = {
        id: currentRound.round_id.replace(/^en:/, ''),
        lang,
        roundNo: currentRound.round_no,
        startedAt: currentRound.started_at,
        endsAt: currentRound.ends_at,
        solverCount: Number(countRow?.count || 0),
        firstSolver: solvers[0] || null,
        solvers,
        previous,
    };

    if (runtime?.roomCache) {
        runtime.roomCache.roundSummary = {
            roundId: currentRound.round_id,
            lang,
            fetchedAt: now,
            summary,
        };
    }
    return summary;
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

function formatStatePayload(player, game, guessRows, roundSummary, now, event = null, lang = 'ko') {
    const profile = publicProfile(player);
    profile.activeGame = (game && game.status === 'active') ? game.id : null;
    return {
        profile,
        lang,
        ruleset: rulesetFor(lang),
        serverNow: now,
        round: roundSummary,
        event,
        game: game ? {
            id: game.id,
            roundId: (game.round_id || '').replace(/^en:/, ''),
            roundNo: game.case_no,
            caseNo: game.case_no,
            status: game.status,
            guessCount: game.guess_count,
            bestSimilarity: game.guess_count > 0 ? formatSimilarity(game.best_sim) : null,
            bestRank: game.best_rank,
            version: game.version,
            createdAt: game.created_at,
            updatedAt: game.updated_at,
            solvedMs: game.solved_ms ?? null,
            solvedAt: game.solved_at ?? null,
            ranked: Boolean(game.ranked),
            unrankedReason: game.unranked_reason || null,
            recordImproved: Boolean(game.record_improved),
            benchmarks: {
                top1: formatSimilarity(game.top1),
                top10: formatSimilarity(game.top10),
                top1000: formatSimilarity(game.top1000),
            },
            guesses: guessRows.map(serializeGuess),
            ...(game.status === 'won' ? { answer: game.answer_word } : {}),
        } : null,
    };
}

async function stateFor(db, env, player, game, currentRound, vocab, lang, runtime, event = null, { forceFresh = false } = {}) {
    const now = nowMs(env);
    const roundSummary = await loadRoundSummary(db, env, currentRound, vocab, lang, runtime, { forceFresh });
    if (runtime?.roomCache) {
        const p = runtime.roomCache.player || player;
        const guessRows = game ? await hydrateGuesses(db, game, runtime) : [];
        return formatStatePayload(p, game, guessRows, roundSummary, now, event, lang);
    }
    const freshPlayer = await db.prepare('SELECT * FROM sm_players WHERE id = ?').bind(player.id).first();
    const guesses = game ? await hydrateGuesses(db, game, null) : [];
    return formatStatePayload(freshPlayer, game, guesses, roundSummary, now, event, lang);
}

// 이전 라운드의 활성 게임을 만료 처리한 뒤 현재 동기화 라운드에 플레이어를 참여 또는 복원
async function joinCurrentRound(db, env, player, currentRound, lang, runtime, requestId = null, payloadHash = null) {
    await runtime?.flushBatch?.();
    const existing = await db.prepare('SELECT * FROM sm_games WHERE player_id = ? AND round_id = ?')
        .bind(player.id, currentRound.round_id).first();

    if (existing) {
        const guesses = await hydrateGuesses(db, existing, null);
        if (requestId) {
            await db.prepare('INSERT OR IGNORE INTO sm_requests(player_id, request_id, payload_hash, game_id, created_at) VALUES (?, ?, ?, ?, ?)')
                .bind(player.id, requestId, payloadHash, existing.id, nowMs(env)).run();
        }
        if (runtime?.roomCache) {
            runtime.roomCache.game = { ...existing };
            runtime.roomCache.guesses = guesses.map(row => ({ ...row }));
            runtime.roomCache.player = {
                ...player,
                active_game: existing.status === 'active' ? existing.id : null,
            };
        }
        runtime?.waitUntil?.(preloadVectors(env, existing.secret_id, existing.answer_word, lang));
        return existing;
    }

    const now = nowMs(env);
    const id = crypto.randomUUID();
    const nextGamesPlayed = (player.games_played || 0) + 1;
    const queries = [
        db.prepare("UPDATE sm_games SET status = 'expired', updated_at = ? WHERE player_id = ? AND status = 'active' AND (round_id IS NULL OR round_id != ?)")
            .bind(now, player.id, currentRound.round_id),
        db.prepare(`INSERT INTO sm_games(
            id, player_id, lang, round_id, case_no, secret_id, answer_word, sim_scale, top1, top10, top1000, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(id, player.id, lang, currentRound.round_id, currentRound.round_no, currentRound.secret_id, currentRound.answer_word, currentRound.sim_scale, currentRound.top1, currentRound.top10, currentRound.top1000, now, now),
        db.prepare('UPDATE sm_players SET active_game = ?, games_played = games_played + 1, last_seen = ? WHERE id = ?')
            .bind(id, now, player.id),
    ];
    if (requestId) {
        queries.push(
            db.prepare('INSERT INTO sm_requests(player_id, request_id, payload_hash, game_id, created_at) VALUES (?, ?, ?, ?, ?)')
                .bind(player.id, requestId, payloadHash, id, now),
        );
    }
    await db.batch(queries);

    if (runtime?.roomCache) {
        runtime.roomCache.player = { ...player, active_game: id, games_played: nextGamesPlayed, last_seen: now };
        runtime.roomCache.game = {
            id,
            player_id: player.id,
            lang,
            round_id: currentRound.round_id,
            case_no: currentRound.round_no,
            secret_id: currentRound.secret_id,
            answer_word: currentRound.answer_word,
            sim_scale: currentRound.sim_scale,
            top1: currentRound.top1,
            top10: currentRound.top10,
            top1000: currentRound.top1000,
            status: 'active',
            guess_count: 0,
            best_sim: -10000,
            best_rank: null,
            version: 0,
            created_at: now,
            updated_at: now,
            solved_ms: null,
            solved_at: null,
            ranked: 0,
            unranked_reason: null,
            record_improved: 0,
        };
        runtime.roomCache.guesses = [];
    }

    runtime?.waitUntil?.(preloadVectors(env, currentRound.secret_id, currentRound.answer_word, lang));
    if (nextGamesPlayed % 15 === 0) {
        const prune = cleanExpiredRecords(db, now).catch(() => {});
        runtime?.waitUntil ? runtime.waitUntil(prune) : void prune;
    }
    return runtime?.roomCache ? runtime.roomCache.game : await hydrateGame(db, player, id, lang, null);
}

async function expireStalePlayerGame(db, env, player, gameId, currentRoundId, runtime) {
    const now = nowMs(env);
    await runtime?.flushBatch?.();
    await db.batch([
        db.prepare("UPDATE sm_games SET status = 'expired', updated_at = ? WHERE id = ? AND player_id = ? AND status = 'active' AND (round_id IS NULL OR round_id != ?)")
            .bind(now, gameId, player.id, currentRoundId),
        db.prepare('UPDATE sm_players SET active_game = NULL WHERE id = ? AND active_game = ?')
            .bind(player.id, gameId),
    ]);
    if (runtime?.roomCache) {
        runtime.roomCache.game = null;
        runtime.roomCache.guesses = null;
        runtime.roomCache.roundSummary = null;
        if (runtime.roomCache.player?.active_game === gameId) {
            runtime.roomCache.player = { ...runtime.roomCache.player, active_game: null };
        }
    }
}

async function startGame(db, env, player, ipHash, body, currentRound, vocab, lang, runtime) {
    if (!ID.test(body.requestId || '')) throw fault('invalid_request');
    await runtime?.flushBatch?.();
    const hash = await fingerprint(JSON.stringify({ locale: body.locale || lang }));
    const old = await db.prepare('SELECT * FROM sm_requests WHERE player_id = ? AND request_id = ?')
        .bind(player.id, body.requestId).first();
    if (old) {
        if (old.payload_hash !== hash) throw fault('request_conflict', 409);
        const existing = await hydrateGame(db, player, old.game_id, lang, runtime);
        if (existing.round_id === currentRound.round_id) {
            return stateFor(db, env, player, existing, currentRound, vocab, lang, runtime, null, { forceFresh: true });
        }
        await enforceDualLimit(db, env, 'start', player.id, ipHash, 60000, 12, 20);
        const resetGame = await joinCurrentRound(db, env, player, currentRound, lang, runtime);
        const roundSummary = await loadRoundSummary(db, env, currentRound, vocab, lang, runtime, { forceFresh: true });
        return stateFor(db, env, player, resetGame, currentRound, vocab, lang, runtime, {
            code: 'round_reset',
            previousRoundNo: roundSummary.previous?.roundNo ?? null,
            previousAnswer: roundSummary.previous?.answer ?? null,
        }, { forceFresh: true });
    }

    await enforceDualLimit(db, env, 'start', player.id, ipHash, 60000, 12, 20);
    const createdGame = await joinCurrentRound(db, env, player, currentRound, lang, runtime, body.requestId, hash);
    return stateFor(db, env, player, createdGame, currentRound, vocab, lang, runtime, { code: 'started' }, { forceFresh: true });
}

async function performGuess(db, env, player, ipHash, game, body, currentRound, vocab, lang, runtime) {
    if (!ID.test(body.requestId || '') || !Number.isInteger(body.expectedVersion)) throw fault('invalid_request');
    const word = normalizeWord(body.text, lang);
    if (!word || /[\u0000-\u001F]/u.test(word)) throw fault('invalid_request');
    if ([...word].length > 32) throw fault('input_too_long');

    if (game.round_id !== currentRound.round_id) {
        await expireStalePlayerGame(db, env, player, game.id, currentRound.round_id, runtime);
        throw fault('round_expired', 409);
    }

    const guessRows = await hydrateGuesses(db, game, runtime);
    const existingReq = runtime?.roomCache
        ? guessRows.find(row => row.request_id === body.requestId)
        : await db.prepare('SELECT * FROM sm_guesses WHERE game_id = ? AND request_id = ?')
            .bind(game.id, body.requestId).first();
    if (existingReq) {
        if (existingReq.word !== word) throw fault('request_conflict', 409);
        return stateFor(db, env, player, game, currentRound, vocab, lang, runtime, {
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

    const now = nowMs(env);
    await enforceDualLimit(db, env, 'guess10s', player.id, ipHash, 10000, 18, 25);
    await enforceDualLimit(db, env, 'guess1m', player.id, ipHash, 60000, 45, 65);

    if (!isValidWord(word, lang)) {
        return stateFor(db, env, player, game, currentRound, vocab, lang, runtime, { code: 'unknown_word', word, requestId: body.requestId });
    }

    const scored = await scoreGuessWord(env, vocab, game.secret_id, word, game.answer_word, lang);
    if (!scored) {
        return stateFor(db, env, player, game, currentRound, vocab, lang, runtime, { code: 'unknown_word', word, requestId: body.requestId });
    }

    const existingWord = runtime?.roomCache
        ? guessRows.find(row => row.word === word)
        : await db.prepare('SELECT * FROM sm_guesses WHERE game_id = ? AND word = ?')
            .bind(game.id, word).first();
    if (existingWord) {
        return stateFor(db, env, player, game, currentRound, vocab, lang, runtime, {
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
    // 라운드 시작 시각(00·06·12·18 KST) 기준으로 클리어 시간을 산정해 스포일러 후발 주자의 순위 탈취 차단
    const solvedMs = scored.exact ? Math.max(1, now - currentRound.started_at) : null;
    const solvedAt = scored.exact ? now : null;
    const bestSim = Math.max(game.best_sim, simCenti);
    const bestRank = scored.exact
        ? 0
        : scored.rank !== null
            ? (game.best_rank === null ? scored.rank : Math.min(game.best_rank, scored.rank))
            : game.best_rank;
    const record = scored.exact ? nextRecord(player, solvedMs, guessNo, currentRound.round_no, now) : null;
    const similarity = formatSimilarity(simCenti);

    const guessSql = `INSERT INTO sm_guesses(
        game_id, word, request_id, guess_no, similarity, rank, version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const guessParams = [game.id, word, body.requestId, guessNo, simCenti, scored.rank, version, now];

    const logSql = `INSERT OR IGNORE INTO sm_logs(
        game_id, request_id, player_id, secret_id, answer_word, action, guess_word, similarity, rank, guess_no, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const logParams = [game.id, body.requestId, player.id, game.secret_id, game.answer_word, scored.exact ? 'won' : 'guess', word, similarity, scored.rank, guessNo, now];

    const gameSql = `UPDATE sm_games SET status = ?, guess_count = ?, best_sim = ?, best_rank = ?, version = ?, updated_at = ?, solved_ms = ?, solved_at = ?, ranked = ?, unranked_reason = ?, record_improved = ? WHERE id = ?`;
    const gameParams = [status, guessNo, bestSim, bestRank, version, now, solvedMs, solvedAt, record?.ranked ? 1 : 0, record?.unrankedReason || null, record?.improved ? 1 : 0, game.id];

    const reqSql = 'INSERT OR IGNORE INTO sm_requests(player_id, request_id, payload_hash, game_id, created_at) VALUES (?, ?, ?, ?, ?)';
    const reqParams = [player.id, body.requestId, hash, game.id, now];

    const playerSql = record
        ? `UPDATE sm_players SET
            active_game = NULL,
            wins = wins + 1,
            sync_wins = sync_wins + 1,
            total_guesses = total_guesses + 1,
            streak = ?,
            sync_streak = ?,
            best_streak = MAX(best_streak, ?),
            sync_best_streak = ?,
            sync_best_time_ms = ?,
            sync_best_time_guesses = ?,
            sync_best_at = ?,
            last_won_round_no = ?,
            last_seen = ?
            WHERE id = ?`
        : 'UPDATE sm_players SET total_guesses = total_guesses + 1, last_seen = ? WHERE id = ?';
    const playerParams = record
        ? [record.streak, record.streak, record.best_streak, record.best_streak,
            record.best_time_ms, record.best_time_guesses, record.best_at, record.last_won_round_no, now, player.id]
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
            solved_at: solvedAt,
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
        const roundSummary = await loadRoundSummary(db, env, currentRound, vocab, lang, runtime);
        return formatStatePayload(runtime.roomCache.player, runtime.roomCache.game, runtime.roomCache.guesses, roundSummary, now, {
            code: 'guess',
            word,
            guessNo,
            similarity,
            rank: scored.rank,
            requestId: body.requestId,
            ranked: false,
            unrankedReason: null,
            recordImproved: false,
        }, lang);
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
            solved_at: solvedAt,
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
            sync_wins: (player.sync_wins || 0) + 1,
            total_guesses: (player.total_guesses || 0) + 1,
            streak: record.streak,
            sync_streak: record.streak,
            best_streak: Math.max(player.best_streak || 0, record.best_streak),
            sync_best_streak: record.best_streak,
            sync_best_time_ms: record.best_time_ms,
            sync_best_time_guesses: record.best_time_guesses,
            sync_best_at: record.best_at,
            last_won_round_no: record.last_won_round_no,
            last_seen: now,
        };
        runtime.roomCache.roundSummary = null;
    }

    const updatedGame = runtime?.roomCache
        ? runtime.roomCache.game
        : await db.prepare('SELECT * FROM sm_games WHERE id = ?').bind(game.id).first();
    return stateFor(db, env, player, updatedGame, currentRound, vocab, lang, runtime, {
        code: scored.exact ? 'won' : 'guess',
        word,
        guessNo,
        similarity,
        rank: scored.rank,
        requestId: body.requestId,
        ranked: Boolean(record?.ranked),
        unrankedReason: record?.unrankedReason || null,
        recordImproved: Boolean(record?.improved),
    }, { forceFresh: scored.exact });
}

async function performExplore(db, env, player, ipHash, game, body, currentRound, lang, runtime) {
    if (game.status !== 'won') throw fault('forbidden', 403);
    if (game.round_id !== currentRound.round_id) {
        await expireStalePlayerGame(db, env, player, game.id, currentRound.round_id, runtime);
        throw fault('round_expired', 409);
    }
    const word = normalizeWord(body.text, lang);
    if (!word || /[\u0000-\u001F]/u.test(word)) throw fault('invalid_request');
    if ([...word].length > 32) throw fault('input_too_long');
    await enforceDualLimit(db, env, 'explore', player.id, ipHash, 60000, 120, 180);

    if (!isValidWord(word, lang)) return { code: 'unknown_word', word };
    const vocab = await loadVocab(env, lang);
    const scored = await scoreGuessWord(env, vocab, game.secret_id, word, game.answer_word, lang);
    if (!scored) return { code: 'unknown_word', word };
    const simCenti = calibrateSim(scored.simCenti, game.sim_scale, scored.exact);
    return {
        code: scored.exact ? 'exact' : 'explored',
        word,
        similarity: formatSimilarity(simCenti),
        rank: scored.rank,
    };
}

// 단일 통합 랭킹 조회 (회차 시작 기준 최단 경과 시간 순, 동일 이름은 최고 순위만 유지)
export async function leaderboard(db, playerId, lang = 'ko') {
    const cte = `WITH ranked_players AS (
        SELECT id, name, name_key, sync_best_time_ms, sync_best_at,
            CASE WHEN name_key IS NOT NULL THEN 'n:' || name_key ELSE 'p:' || id END AS dedup_key
        FROM sm_players
        WHERE lang = ? AND sync_best_time_ms IS NOT NULL
    ),
    per_name AS (
        SELECT id, name, name_key, sync_best_time_ms, sync_best_at, dedup_key,
            ROW_NUMBER() OVER (
                PARTITION BY dedup_key
                ORDER BY sync_best_time_ms ASC, sync_best_at ASC, id ASC
            ) AS name_rank,
            MAX(CASE WHEN id = ? THEN 1 ELSE 0 END) OVER (PARTITION BY dedup_key) AS is_own
        FROM ranked_players
    ),
    ordered AS (
        SELECT id, name, name_key, sync_best_time_ms, sync_best_at, is_own,
            ROW_NUMBER() OVER (ORDER BY sync_best_time_ms ASC, sync_best_at ASC, id ASC) AS rank
        FROM per_name
        WHERE name_rank = 1
    )`;
    const queries = [
        db.prepare(`${cte} SELECT * FROM ordered LIMIT 50`).bind(lang, playerId || ''),
    ];
    if (playerId) {
        queries.push(db.prepare(`${cte} SELECT * FROM ordered WHERE is_own = 1 LIMIT 1`).bind(lang, playerId));
    }
    const [topRes, mineRes] = await db.batch(queries);
    const mine = playerId ? (mineRes?.results?.[0] || null) : null;
    const visible = row => row ? ({
        rank: row.rank,
        name: row.name,
        hasCustomName: Boolean(row.name_key),
        solvedMs: row.sync_best_time_ms,
        bestTimeMs: row.sync_best_time_ms,
        own: Boolean(row.is_own),
    }) : null;
    return {
        entries: (topRes?.results || []).map(visible),
        mine: visible(mine),
        lang,
        ruleset: rulesetFor(lang),
    };
}

export async function handleRoomRequest(request, env, runtime = null) {
    try {
        await initialize(env.DB);
        const url = new URL(request.url);
        const lang = parseLang(url.searchParams.get('lang'));
        const id = await identity(request, lang);
        const ipHash = await ipFingerprint(request);
        const player = await hydratePlayer(env.DB, env, id, lang, ipHash, runtime);
        const path = url.pathname.replace(/^\/twenty-questions\/?/, '');

        if (request.method === 'GET' && path === 'leaderboard') {
            await runtime?.flushBatch?.();
            return response(await leaderboard(env.DB, id, lang));
        }

        if (!dataReady(env)) throw fault('service_unavailable', 503);
        const vocab = await loadVocab(env, lang);
        const now = nowMs(env);
        const currentSlot = roundSlotAt(now);
        const currentRound = await ensureRoundForSlot(env.DB, env, currentSlot, vocab, lang);

        if (request.method === 'GET' && path === 'rounds/previous/nearest') {
            if (currentSlot.roundNo <= 1) throw fault('not_found', 404);
            const prevSlot = previousRoundSlot(currentSlot);
            if (prevSlot.endsAt > now) throw fault('forbidden', 403);
            const prevRoundId = dbRoundIdFor(lang, prevSlot.roundId);
            let prevRound = getRoundCache(env.DB)?.get(prevRoundId) || null;
            if (!prevRound) {
                prevRound = await env.DB.prepare('SELECT * FROM sm_rounds WHERE round_id = ?').bind(prevRoundId).first();
                if (prevRound) cacheRound(env.DB, prevRoundId, prevRound);
            }
            if (!prevRound) {
                if (currentSlot.roundNo <= 1 || vocab.secrets.length <= 1) throw fault('not_found', 404);
                prevRound = await ensureRoundForSlot(env.DB, env, prevSlot, vocab, lang);
            }
            if (!prevRound || prevRound.ends_at > now) throw fault('forbidden', 403);
            const effectiveSecretId = (prevRound.answer_word && vocab.secretWordToId?.has(prevRound.answer_word))
                ? vocab.secretWordToId.get(prevRound.answer_word)
                : prevRound.secret_id;
            const top1k = await loadSecretTop1k(env, effectiveSecretId, vocab, lang);
            return response({
                roundId: prevRound.round_id.replace(/^en:/, ''),
                roundNo: prevRound.round_no,
                answer: prevRound.answer_word,
                benchmarks: {
                    top1: formatSimilarity(prevRound.top1),
                    top10: formatSimilarity(prevRound.top10),
                    top1000: formatSimilarity(prevRound.top1000),
                },
                words: top1k.list.map(item => ({
                    rank: item.rank,
                    word: item.word,
                    similarity: formatSimilarity(calibrateSim(Math.round(item.similarity * 100), prevRound.sim_scale, false)),
                })),
            });
        }

        if (request.method === 'GET' && path === 'profile') {
            const game = await hydratePlayerRoundGame(env.DB, player, currentRound.round_id, runtime);
            if (!game && player.active_game) {
                await expireStalePlayerGame(env.DB, env, player, player.active_game, currentRound.round_id, runtime);
            }
            runtime?.waitUntil?.(preloadVectors(env, currentRound.secret_id, currentRound.answer_word, lang));
            return response(await stateFor(env.DB, env, player, game, currentRound, vocab, lang, runtime, null, { forceFresh: true }));
        }

        if (request.method === 'PATCH' && path === 'profile') {
            await enforceDualLimit(env.DB, env, 'rename', id, ipHash, 60000, 8, 12);
            const body = await readBody(request);
            const name = sanitizePlayerName(body.name);
            if (!name) throw fault('invalid_name');
            await runtime?.flushBatch?.();
            const nameKey = name.toLowerCase();
            await env.DB.prepare('UPDATE sm_players SET name = ?, name_key = ? WHERE id = ?').bind(name, nameKey, id).run();
            if (runtime?.roomCache) {
                if (runtime.roomCache.player) {
                    runtime.roomCache.player = { ...runtime.roomCache.player, name, name_key: nameKey };
                }
                runtime.roomCache.roundSummary = null;
            }
            const game = await hydratePlayerRoundGame(env.DB, player, currentRound.round_id, runtime);
            return response(await stateFor(env.DB, env, player, game, currentRound, vocab, lang, runtime, null, { forceFresh: true }));
        }

        if (request.method === 'POST' && path === 'games') {
            return response(await startGame(env.DB, env, player, ipHash, await readBody(request), currentRound, vocab, lang, runtime));
        }

        const match = /^games\/([a-zA-Z0-9_-]+)(?:\/(guesses|nearest|explore))?$/.exec(path);
        if (!match) throw fault('not_found', 404);
        const game = await hydrateGame(env.DB, player, match[1], lang, runtime);

        if (request.method === 'GET' && !match[2]) {
            if (game.round_id !== currentRound.round_id) {
                await expireStalePlayerGame(env.DB, env, player, game.id, currentRound.round_id, runtime);
                const freshGame = await joinCurrentRound(env.DB, env, player, currentRound, lang, runtime);
                const roundSummary = await loadRoundSummary(env.DB, env, currentRound, vocab, lang, runtime, { forceFresh: true });
                return response(await stateFor(env.DB, env, player, freshGame, currentRound, vocab, lang, runtime, {
                    code: 'round_reset',
                    previousRoundNo: roundSummary.previous?.roundNo ?? null,
                    previousAnswer: roundSummary.previous?.answer ?? null,
                }, { forceFresh: true }));
            }
            runtime?.waitUntil?.(preloadVectors(env, game.secret_id, game.answer_word, lang));
            return response(await stateFor(env.DB, env, player, game, currentRound, vocab, lang, runtime, null, { forceFresh: true }));
        }

        if (request.method === 'GET' && match[2] === 'nearest') {
            if (game.status !== 'won') throw fault('forbidden', 403);
            const effectiveSecretId = (game.answer_word && vocab.secretWordToId?.has(game.answer_word))
                ? vocab.secretWordToId.get(game.answer_word)
                : game.secret_id;
            const top1k = await loadSecretTop1k(env, effectiveSecretId, vocab, lang);
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
            return response(await performGuess(env.DB, env, player, ipHash, game, await readBody(request), currentRound, vocab, lang, runtime));
        }

        if (request.method === 'POST' && match[2] === 'explore') {
            return response(await performExplore(env.DB, env, player, ipHash, game, await readBody(request), currentRound, lang, runtime));
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
        } else {
            const url = new URL(request.url);
            const lang = parseLang(url.searchParams.get('lang'));
            if (url.pathname === '/twenty-questions/status' && request.method === 'GET') {
                await initialize(env.DB);
                const ready = dataReady(env);
                const now = nowMs(env);
                const slot = roundSlotAt(now);
                if (!ready) {
                    result = response({
                        ready: false,
                        lang,
                        ruleset: rulesetFor(lang),
                        serverNow: now,
                        round: {
                            id: slot.roundId,
                            roundNo: slot.roundNo,
                            startedAt: slot.startedAt,
                            endsAt: slot.endsAt,
                        },
                    });
                } else {
                    const vocab = await loadVocab(env, lang);
                    ctx?.waitUntil?.(preloadVectors(env, null, null, lang));
                    result = response({
                        ready: true,
                        lang,
                        ruleset: rulesetFor(lang),
                        vocabCount: vocab.totalVocab,
                        secretCount: vocab.secrets.length,
                        serverNow: now,
                        round: {
                            id: slot.roundId,
                            roundNo: slot.roundNo,
                            startedAt: slot.startedAt,
                            endsAt: slot.endsAt,
                        },
                    });
                }
            } else {
                const playerId = await identity(request, lang);
                if (!env.TWENTY_GAMEPLAY) throw fault('service_unavailable', 503);
                result = await env.TWENTY_GAMEPLAY.get(env.TWENTY_GAMEPLAY.idFromName(playerId)).fetch(request);
            }
        }
    } catch (error) {
        result = failure(error);
    }
    const headers = new Headers(result.headers);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Max-Age', '86400');
    headers.set('Cache-Control', 'no-store');
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(result.body, { status: result.status, headers });
}
