import { MAX_TURNS, SESSION_MS, RULESET, normalize, isCorrect, publicAnswer, publicProfile, nextRecord, fingerprint, fault } from './core.mjs';
import { initialize, limit, reserveBudget, recordCost } from './database.mjs';
import { judge, modelReady } from './decision.mjs';

const ID = /^[a-zA-Z0-9_-]{16,100}$/;
const TOKEN = /^[a-f0-9]{64}$/;

export async function identity(request) {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
    if (!TOKEN.test(token)) throw fault('unauthorized', 401);
    return fingerprint(token);
}

export function response(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
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
    const pieces = []; let total = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 4096) { await reader.cancel(); throw fault('input_too_long', 413); }
        pieces.push(value);
    }
    const bytes = new Uint8Array(total); let position = 0;
    for (const piece of pieces) { bytes.set(piece, position); position += piece.length; }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw fault('invalid_request'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fault('invalid_request');
    return body;
}

async function playerFor(db, id, request) {
    let player = await db.prepare('SELECT * FROM tq_players WHERE id = ?').bind(id).first();
    if (!player) {
        const day = new Date().toISOString().slice(0, 10);
        const ip = request.headers.get('CF-Connecting-IP') || 'local';
        await limit(db, `register:${day}:${await fingerprint(ip)}`, 20, Date.now() + SESSION_MS);
        await db.prepare('INSERT OR IGNORE INTO tq_players(id, name, last_seen) VALUES (?, ?, ?)')
            .bind(id, `Detective ${id.slice(0, 5).toUpperCase()}`, Date.now()).run();
        player = await db.prepare('SELECT * FROM tq_players WHERE id = ?').bind(id).first();
    }
    await db.prepare('UPDATE tq_players SET last_seen = ? WHERE id = ?').bind(Date.now(), id).run();
    return player;
}

async function expireGame(db, player, game, now = Date.now()) {
    if (game && game.status === 'active' && game.expires_at <= now && !game.fault_since) {
        await db.batch([
            db.prepare("UPDATE tq_games SET status = 'expired', version = version + 1, updated_at = ? WHERE id = ? AND status = 'active'").bind(now, game.id),
            db.prepare('UPDATE tq_players SET active_game = NULL, streak = 0, streak_turns = 0 WHERE id = ? AND active_game = ?').bind(player.id, game.id),
        ]);
        game = await db.prepare('SELECT * FROM tq_games WHERE id = ?').bind(game.id).first();
    }
    return game;
}

async function ownedGame(db, player, id) {
    if (!ID.test(id)) throw fault('not_found', 404);
    const game = await db.prepare('SELECT * FROM tq_games WHERE id = ? AND player_id = ?').bind(id, player.id).first();
    if (!game) throw fault('not_found', 404);
    return expireGame(db, player, game);
}

async function stateFor(db, playerId, game, event = null) {
    const player = await db.prepare('SELECT * FROM tq_players WHERE id = ?').bind(playerId).first();
    const history = game ? await db.prepare(`SELECT request_id, mode, input, code, decision, charged, ordinal, version
        FROM tq_turns WHERE game_id = ? ORDER BY version ASC`).bind(game.id).all() : { results: [] };
    return {
        profile: publicProfile(player), ruleset: RULESET, event,
        game: game ? {
            id: game.id, status: game.status, turnsUsed: game.used, remaining: MAX_TURNS - game.used,
            version: game.version, expiresAt: game.expires_at, history: history.results,
            recordImproved: Boolean(game.record_improved),
            ...(game.status !== 'active' ? { answer: publicAnswer(JSON.parse(game.answer_json)) } : {}),
        } : null,
    };
}

async function startGame(db, env, player, body) {
    if (!ID.test(body.requestId || '')) throw fault('invalid_request');
    const hash = await fingerprint(JSON.stringify({ locale: body.locale || 'ko' }));
    const old = await db.prepare('SELECT * FROM tq_requests WHERE player_id = ? AND request_id = ?').bind(player.id, body.requestId).first();
    if (old) {
        if (old.payload_hash !== hash) throw fault('request_conflict', 409);
        return stateFor(db, player.id, await ownedGame(db, player, old.game_id));
    }
    if (player.active_game) {
        const active = await ownedGame(db, player, player.active_game);
        if (active.status === 'active') return stateFor(db, player.id, active);
    }
    if (!modelReady(env)) throw fault('service_unavailable', 503);
    const bucket = Math.floor(Date.now() / 60000);
    await limit(db, `start:${player.id}:${bucket}`, 10, (bucket + 1) * 60000);
    const candidate = await db.prepare(`SELECT c.id, c.data FROM tq_catalog c WHERE c.active = 1
        AND NOT EXISTS (SELECT 1 FROM tq_seen s WHERE s.player_id = ? AND s.concept_id = c.id)
        ORDER BY RANDOM() LIMIT 1`).bind(player.id).first();
    if (!candidate) throw fault('pool_exhausted', 409);
    const id = crypto.randomUUID(); const now = Date.now();
    await db.batch([
        db.prepare('INSERT INTO tq_seen(player_id, concept_id, first_game, created_at) VALUES (?, ?, ?, ?)').bind(player.id, candidate.id, id, now),
        db.prepare('INSERT INTO tq_games(id, player_id, concept_id, answer_json, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(id, player.id, candidate.id, candidate.data, now, now, now + SESSION_MS),
        db.prepare('UPDATE tq_players SET active_game = ?, last_seen = ? WHERE id = ?').bind(id, now, player.id),
        db.prepare('INSERT INTO tq_requests(player_id, request_id, payload_hash, game_id, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(player.id, body.requestId, hash, id, now),
    ]);
    return stateFor(db, player.id, await ownedGame(db, player, id), { code: 'started' });
}

async function performTurn(db, env, player, game, mode, body) {
    if (!ID.test(body.requestId || '') || !Number.isInteger(body.expectedVersion)) throw fault('invalid_request');
    const input = mode === 'give-up' ? '' : String(body.text || '').trim();
    if (mode !== 'give-up' && (!input || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(input))) throw fault('invalid_request');
    if ([...input].length > (mode === 'questions' ? 200 : 80)) throw fault('input_too_long');
    const hash = await fingerprint(JSON.stringify({ mode, input }));
    const existing = await db.prepare('SELECT * FROM tq_turns WHERE game_id = ? AND request_id = ?').bind(game.id, body.requestId).first();
    if (existing) {
        if (existing.payload_hash !== hash) throw fault('request_conflict', 409);
        return stateFor(db, player.id, game, { code: existing.code, decision: existing.decision, requestId: body.requestId, replayed: true });
    }
    if (game.status !== 'active') throw fault('game_finished', 409);
    if (game.version !== body.expectedVersion) throw fault('stale_state', 409);
    const now = Date.now(); const minute = Math.floor(now / 60000);
    await limit(db, `input:${player.id}:${minute}`, 30, (minute + 1) * 60000);
    let code; let decision = null; let charged = 0;
    const answer = JSON.parse(game.answer_json);
    if (mode === 'give-up') code = 'given_up';
    else if (mode === 'guesses') { code = isCorrect(answer, input) ? 'correct' : 'wrong_guess'; charged = 1; }
    else {
        const duplicate = await db.prepare("SELECT code FROM tq_turns WHERE game_id = ? AND mode = 'questions' AND normalized = ? AND code IN ('yes', 'no') LIMIT 1")
            .bind(game.id, normalize(input)).first();
        if (duplicate) { code = 'duplicate'; decision = duplicate.code; }
        else {
            if (game.requests_count >= 60) throw fault('question_limit', 429);
            await limit(db, `model:${player.id}:${minute}`, 20, (minute + 1) * 60000);
            let budgetDay;
            try { budgetDay = await reserveBudget(db, env); }
            catch (error) {
                if (error.code === 'daily_limit') await db.prepare('UPDATE tq_games SET fault_since = COALESCE(fault_since, ?) WHERE id = ?').bind(now, game.id).run();
                throw error;
            }
            await db.prepare('UPDATE tq_games SET requests_count = requests_count + 1 WHERE id = ?').bind(game.id).run();
            const previous = await db.prepare("SELECT input, code FROM tq_turns WHERE game_id = ? AND code IN ('yes','no') ORDER BY version").bind(game.id).all();
            try {
                const result = await judge(env, answer, input, previous.results, body.locale || 'ko');
                code = result.code; decision = ['yes', 'no'].includes(code) ? code : null;
                charged = decision ? 1 : 0;
                await recordCost(db, budgetDay, result.cost);
            } catch (error) {
                await db.prepare('UPDATE tq_games SET fault_since = COALESCE(fault_since, ?) WHERE id = ?').bind(now, game.id).run();
                throw error;
            }
        }
    }
    const used = game.used + charged;
    const status = code === 'correct' ? 'won' : code === 'given_up' ? 'given_up' : used >= MAX_TURNS ? 'lost' : 'active';
    const version = game.version + 1;
    const record = status === 'won' ? nextRecord(player, used, now) : null;
    const queries = [
        db.prepare('INSERT INTO tq_turns(game_id, request_id, payload_hash, mode, input, normalized, code, decision, charged, ordinal, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(game.id, body.requestId, hash, mode, input, normalize(input), code, decision, charged, used, version, now),
        db.prepare('UPDATE tq_games SET status = ?, used = ?, version = ?, updated_at = ?, expires_at = ?, fault_since = NULL, record_improved = ? WHERE id = ?')
            .bind(status, used, version, now, game.expires_at + (game.fault_since ? now - game.fault_since : 0), record?.improved ? 1 : 0, game.id),
    ];
    if (record) queries.push(db.prepare('UPDATE tq_players SET active_game = NULL, streak = ?, streak_turns = ?, best_streak = ?, best_turns = ?, best_at = ?, last_seen = ? WHERE id = ?')
        .bind(record.streak, record.streak_turns, record.best_streak, record.best_turns, record.best_at, now, player.id));
    else if (status !== 'active') queries.push(db.prepare('UPDATE tq_players SET active_game = NULL, streak = 0, streak_turns = 0, last_seen = ? WHERE id = ?').bind(now, player.id));
    await db.batch(queries);
    const updated = await db.prepare('SELECT * FROM tq_games WHERE id = ?').bind(game.id).first();
    return stateFor(db, player.id, updated, { code, decision, requestId: body.requestId, recordImproved: Boolean(record?.improved) });
}

export async function leaderboard(db, playerId) {
    const query = `SELECT id, name, best_streak, best_turns, best_at,
        ROW_NUMBER() OVER (ORDER BY best_streak DESC, best_turns ASC, best_at ASC, id ASC) AS rank
        FROM tq_players WHERE best_streak > 0`;
    const top = await db.prepare(`SELECT * FROM (${query}) LIMIT 50`).all();
    const mine = playerId ? await db.prepare(`SELECT * FROM (${query}) WHERE id = ?`).bind(playerId).first() : null;
    const visible = row => row ? ({ rank: row.rank, name: row.name, streak: row.best_streak, turns: row.best_turns, own: row.id === playerId }) : null;
    return { entries: top.results.map(visible), mine: visible(mine), ruleset: RULESET };
}

export async function handleRoomRequest(request, env) {
    try {
        await initialize(env.DB);
        const id = await identity(request);
        const player = await playerFor(env.DB, id, request);
        const pathname = new URL(request.url).pathname;
        const path = pathname.replace(/^\/twenty-questions\/?/, '');
        if (request.method === 'GET' && path === 'leaderboard') return response(await leaderboard(env.DB, id));
        if (request.method === 'GET' && path === 'profile') {
            const game = player.active_game ? await ownedGame(env.DB, player, player.active_game) : null;
            return response(await stateFor(env.DB, id, game));
        }
        if (request.method === 'PATCH' && path === 'profile') {
            const body = await readBody(request);
            const name = String(body.name || '').trim();
            if (!/^[\p{L}\p{N} ._-]{2,16}$/u.test(name)) throw fault('invalid_name');
            await env.DB.prepare('UPDATE tq_players SET name = ? WHERE id = ?').bind(name, id).run();
            return response(await stateFor(env.DB, id, null));
        }
        if (request.method === 'POST' && path === 'games') return response(await startGame(env.DB, env, player, await readBody(request)));
        const match = /^games\/([a-zA-Z0-9_-]+)(?:\/(questions|guesses|give-up))?$/.exec(path);
        if (!match) throw fault('not_found', 404);
        const game = await ownedGame(env.DB, player, match[1]);
        if (request.method === 'GET' && !match[2]) return response(await stateFor(env.DB, id, game));
        if (request.method === 'POST' && match[2]) return response(await performTurn(env.DB, env, player, game, match[2], await readBody(request)));
        throw fault('not_found', 404);
    } catch (error) { return failure(error); }
}

export async function twentyQuestionsRoute(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = new Set(['https://game.archerlab.dev', ...(env.TQ_ALLOWED_ORIGINS || '').split(',').filter(Boolean)]);
    const local = env.TQ_LOCAL === 'true' && origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (origin && !allowed.has(origin) && !local) return response({ error: 'forbidden' }, 403);
    let result;
    try {
        if (request.method === 'OPTIONS') result = new Response(null, { status: 204 });
        else if (new URL(request.url).pathname === '/twenty-questions/status' && request.method === 'GET') {
            await initialize(env.DB);
            result = response({ ready: modelReady(env), ruleset: RULESET });
        } else {
            const playerId = await identity(request);
            if (!env.TWENTY_GAMEPLAY) throw fault('service_unavailable', 503);
            result = await env.TWENTY_GAMEPLAY.get(env.TWENTY_GAMEPLAY.idFromName(playerId)).fetch(request);
        }
    } catch (error) { result = failure(error); }
    const headers = new Headers(result.headers);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Cache-Control', 'no-store');
    return new Response(result.body, { status: result.status, headers });
}
