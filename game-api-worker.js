/**
 * Game API Worker - 게임 랭킹 (명예의 전당) API
 * Cloudflare Worker + D1 Database
 *
 * D1 바인딩 이름: DB (archerlab_db)
 *
 * === D1 테이블 생성 SQL ===
 * CREATE TABLE IF NOT EXISTS rankings (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   game_id TEXT NOT NULL,
 *   player_name TEXT NOT NULL,
 *   score INTEGER NOT NULL,
 *   extra_data TEXT,
 *   created_at TEXT DEFAULT (datetime('now')),
 *   UNIQUE(game_id, player_name, score)
 * );
 * CREATE INDEX IF NOT EXISTS idx_rankings_game_score ON rankings(game_id, score DESC);
 * ===========================
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const CAT_TOWER_GAME_ID = 'cat-tower';
const CAT_TOWER_SCORES = [10, 25, 55, 110, 220, 440, 880, 1700, 3500, 10000];
const CAT_TOWER_MAX_SCORE = 500000;
const CAT_TOWER_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const CAT_TOWER_FREE_EVENT_BURST = 30;
const CAT_TOWER_MIN_MS_PER_EVENT = 150;
const CAT_TOWER_FREE_SCORE_BURST = 2000;
const CAT_TOWER_MAX_SCORE_PER_SECOND = 2000;
const CAT_TOWER_FINAL_MERGE_MIN_MS = 60 * 1000;
const SCORE_EVENT_BATCH_LIMIT = 50;
const BLOCKPANG_GAME_ID = 'blockpang';
const BLOCKPANG_SCORE_PER_CELL = 1;
const BLOCKPANG_SCORE_PER_LINE = 100;
const BLOCKPANG_COMBO_MULTIPLIER = 0.5;
const BLOCKPANG_PERFECT_CLEAR_BONUS = 500;
const BLOCKPANG_MAX_SCORE = 500000;
const BLOCKPANG_FREE_SCORE_BURST = 2000;
const BLOCKPANG_MAX_SCORE_PER_SECOND = 3000;
const PARKING_GAME_ID = 'parking_escape';
const PARKING_MIN_MS_PER_LEVEL = 10000;
const PARKING_MAX_LEVEL_SCORE = 100000;
const SHADOW_GAME_PREFIX = 'shadow-survival-character-v1-';
const SHADOW_MAX_SCORE = 7200;
const SHADOW_SCORE_GRACE_SECONDS = 15;

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}

function clampLimit(rawLimit) {
    const parsed = parseInt(rawLimit || '20', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.min(parsed, 100);
}

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function parseInteger(value) {
    if (typeof value === 'number') {
        return Number.isInteger(value) ? value : NaN;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        return parseInt(value, 10);
    }
    return NaN;
}

function makeSessionId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getProtectedGameKind(gameId) {
    if (gameId === CAT_TOWER_GAME_ID) return 'cat-tower';
    if (gameId === BLOCKPANG_GAME_ID) return 'blockpang';
    if (gameId === PARKING_GAME_ID) return 'parking';
    if (typeof gameId === 'string' && gameId.startsWith(SHADOW_GAME_PREFIX)) return 'shadow';
    return null;
}

function validateCatTowerScoreEvent(event) {
    if (!isPlainObject(event)) {
        throw new Error('score event must be an object');
    }

    const type = String(event.type || 'merge');
    const delta = parseInteger(event.delta);
    if (!Number.isFinite(delta) || delta <= 0) {
        throw new Error('score event delta must be positive');
    }

    if (type === 'merge') {
        const createdTier = parseInteger(event.created_tier ?? event.tier_created ?? event.tier);
        const combo = Math.max(1, parseInteger(event.combo ?? 1));
        if (!Number.isFinite(createdTier) || createdTier < 1 || createdTier >= CAT_TOWER_SCORES.length) {
            throw new Error('invalid cat-tower merge tier');
        }
        if (!Number.isFinite(combo) || combo < 1 || combo > 30) {
            throw new Error('invalid cat-tower combo count');
        }

        const base = CAT_TOWER_SCORES[createdTier];
        const bonus = combo >= 2 ? Math.floor(base * 0.25 * (combo - 1)) : 0;
        const expected = base + bonus;
        if (delta !== expected) {
            throw new Error('cat-tower score event delta mismatch');
        }
        return delta;
    }

    if (type === 'final_merge') {
        const tier = parseInteger(event.tier ?? CAT_TOWER_SCORES.length - 1);
        const expected = CAT_TOWER_SCORES[CAT_TOWER_SCORES.length - 1] * 2;
        if (tier !== CAT_TOWER_SCORES.length - 1 || delta !== expected) {
            throw new Error('cat-tower final merge delta mismatch');
        }
        return delta;
    }

    throw new Error('unsupported cat-tower score event');
}

async function createScoreSession(db, gameId) {
    if (!getProtectedGameKind(gameId)) {
        return jsonResponse({ error: 'unsupported game_id for score sessions' }, 400);
    }

    const now = Date.now();
    const sessionId = makeSessionId();
    await db.prepare(
        'INSERT INTO ranking_sessions (session_id, game_id, score, event_count, started_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)'
    ).bind(sessionId, gameId, now, now).run();

    await db.prepare('DELETE FROM ranking_sessions WHERE updated_at < ?')
        .bind(now - CAT_TOWER_SESSION_TTL_MS)
        .run();

    return jsonResponse({
        success: true,
        game_id: gameId,
        session_id: sessionId,
    });
}

async function recordCatTowerScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);

    if (gameId !== CAT_TOWER_GAME_ID) {
        return jsonResponse({ error: 'unsupported game_id for score events' }, 400);
    }
    if (!sessionId) {
        return jsonResponse({ error: 'session_id is required' }, 400);
    }
    if (events.length === 0 || events.length > SCORE_EVENT_BATCH_LIMIT) {
        return jsonResponse({ error: 'events must contain 1-50 items' }, 400);
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, event_count, started_at, submitted_at FROM ranking_sessions WHERE session_id = ?'
    ).bind(sessionId).first();
    if (!session || session.game_id !== gameId) {
        return jsonResponse({ error: 'score session not found' }, 404);
    }
    if (session.submitted_at) {
        return jsonResponse({ error: 'score session already submitted' }, 409);
    }

    const now = Date.now();
    if (now - Number(session.started_at) > CAT_TOWER_SESSION_TTL_MS) {
        return jsonResponse({ error: 'score session expired' }, 410);
    }

    let deltaTotal = 0;
    let hasFinalMerge = false;
    try {
        for (const event of events) {
            if (String(event?.type || 'merge') === 'final_merge') hasFinalMerge = true;
            deltaTotal += validateCatTowerScoreEvent(event);
        }
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedScore = Number(session.score) + deltaTotal;
    const projectedEventCount = Number(session.event_count) + events.length;
    if (projectedScore > CAT_TOWER_MAX_SCORE) {
        return jsonResponse({ error: 'cat-tower score exceeds allowed maximum' }, 400);
    }

    const elapsedMs = now - Number(session.started_at);
    if (hasFinalMerge && elapsedMs < CAT_TOWER_FINAL_MERGE_MIN_MS) {
        return jsonResponse({ error: 'cat-tower final merge is too early' }, 429);
    }
    const minElapsedMs = Math.max(0, projectedEventCount - CAT_TOWER_FREE_EVENT_BURST) * CAT_TOWER_MIN_MS_PER_EVENT;
    const minScoreElapsedMs = (Math.max(0, projectedScore - CAT_TOWER_FREE_SCORE_BURST) / CAT_TOWER_MAX_SCORE_PER_SECOND) * 1000;
    if (elapsedMs < Math.max(minElapsedMs, minScoreElapsedMs)) {
        return jsonResponse({ error: 'cat-tower score events are too fast' }, 429);
    }

    await db.prepare(
        'UPDATE ranking_sessions SET score = ?, event_count = ?, updated_at = ? WHERE session_id = ?'
    ).bind(projectedScore, projectedEventCount, now, sessionId).run();

    return jsonResponse({
        success: true,
        game_id: gameId,
        session_id: sessionId,
        score: projectedScore,
        event_count: projectedEventCount,
    });
}

function validateBlockpangScoreEvent(event) {
    if (!isPlainObject(event)) {
        throw new Error('score event must be an object');
    }

    const type = String(event.type || '');
    const delta = parseInteger(event.delta);
    if (!Number.isFinite(delta) || delta < 0) {
        throw new Error('score event delta must be non-negative');
    }

    if (type === 'placement') {
        const cells = parseInteger(event.cells);
        if (!Number.isFinite(cells) || cells < 1 || cells > 9) {
            throw new Error('invalid blockpang placement cell count');
        }
        const expected = cells * BLOCKPANG_SCORE_PER_CELL;
        if (delta !== expected) {
            throw new Error('blockpang placement delta mismatch');
        }
        return delta;
    }

    if (type === 'clear') {
        const lines = parseInteger(event.lines);
        const combo = parseInteger(event.combo);
        if (!Number.isFinite(lines) || lines < 1 || lines > 4) {
            throw new Error('invalid blockpang line count');
        }
        if (!Number.isFinite(combo) || combo < 1 || combo > 100) {
            throw new Error('invalid blockpang combo count');
        }

        const multiBonus = lines >= 4 ? 100 : lines === 3 ? 50 : lines === 2 ? 20 : 0;
        let expected = lines * BLOCKPANG_SCORE_PER_LINE + multiBonus;
        if (combo > 1) {
            expected = Math.floor(expected * (1 + (combo - 1) * BLOCKPANG_COMBO_MULTIPLIER));
        }
        if (delta !== expected) {
            throw new Error('blockpang clear delta mismatch');
        }
        return delta;
    }

    if (type === 'perfect_clear') {
        const level = parseInteger(event.level);
        if (!Number.isFinite(level) || level < 1 || level > 100) {
            throw new Error('invalid blockpang perfect clear level');
        }
        const expected = BLOCKPANG_PERFECT_CLEAR_BONUS * level;
        if (delta !== expected) {
            throw new Error('blockpang perfect clear delta mismatch');
        }
        return delta;
    }

    throw new Error('unsupported blockpang score event');
}

async function recordBlockpangScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);

    if (gameId !== BLOCKPANG_GAME_ID) {
        return jsonResponse({ error: 'unsupported game_id for score events' }, 400);
    }
    if (!sessionId) {
        return jsonResponse({ error: 'session_id is required' }, 400);
    }
    if (events.length === 0 || events.length > SCORE_EVENT_BATCH_LIMIT) {
        return jsonResponse({ error: 'events must contain 1-50 items' }, 400);
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, event_count, started_at, submitted_at FROM ranking_sessions WHERE session_id = ?'
    ).bind(sessionId).first();
    if (!session || session.game_id !== gameId) {
        return jsonResponse({ error: 'score session not found' }, 404);
    }
    if (session.submitted_at) {
        return jsonResponse({ error: 'score session already submitted' }, 409);
    }

    const now = Date.now();
    if (now - Number(session.started_at) > CAT_TOWER_SESSION_TTL_MS) {
        return jsonResponse({ error: 'score session expired' }, 410);
    }

    let deltaTotal = 0;
    try {
        for (const event of events) {
            deltaTotal += validateBlockpangScoreEvent(event);
        }
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedScore = Number(session.score) + deltaTotal;
    const projectedEventCount = Number(session.event_count) + events.length;
    if (projectedScore > BLOCKPANG_MAX_SCORE) {
        return jsonResponse({ error: 'blockpang score exceeds allowed maximum' }, 400);
    }

    const elapsedMs = now - Number(session.started_at);
    const minScoreElapsedMs = (Math.max(0, projectedScore - BLOCKPANG_FREE_SCORE_BURST) / BLOCKPANG_MAX_SCORE_PER_SECOND) * 1000;
    if (elapsedMs < minScoreElapsedMs) {
        return jsonResponse({ error: 'blockpang score events are too fast' }, 429);
    }

    await db.prepare(
        'UPDATE ranking_sessions SET score = ?, event_count = ?, updated_at = ? WHERE session_id = ?'
    ).bind(projectedScore, projectedEventCount, now, sessionId).run();

    return jsonResponse({
        success: true,
        game_id: gameId,
        session_id: sessionId,
        score: projectedScore,
        event_count: projectedEventCount,
    });
}

async function recordParkingScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const event = Array.isArray(body?.events) ? body.events[0] : body?.event;

    if (gameId !== PARKING_GAME_ID) {
        return jsonResponse({ error: 'unsupported game_id for score events' }, 400);
    }
    if (!sessionId) {
        return jsonResponse({ error: 'session_id is required' }, 400);
    }
    if (!isPlainObject(event) || String(event.type || '') !== 'level_clear') {
        return jsonResponse({ error: 'parking score event must be level_clear' }, 400);
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, event_count, started_at, submitted_at FROM ranking_sessions WHERE session_id = ?'
    ).bind(sessionId).first();
    if (!session || session.game_id !== gameId) {
        return jsonResponse({ error: 'score session not found' }, 404);
    }
    if (session.submitted_at) {
        return jsonResponse({ error: 'score session already submitted' }, 409);
    }

    const score = parseInteger(event.score ?? event.cleared_level ?? event.level);
    const moves = parseInteger(event.moves);
    const vehicles = parseInteger(event.vehicles);
    if (!Number.isFinite(score) || score < 1 || score > PARKING_MAX_LEVEL_SCORE) {
        return jsonResponse({ error: 'invalid parking level score' }, 400);
    }
    if (!Number.isFinite(moves) || moves < 1 || moves > 10000) {
        return jsonResponse({ error: 'invalid parking move count' }, 400);
    }
    if (!Number.isFinite(vehicles) || vehicles < 1 || vehicles > 200) {
        return jsonResponse({ error: 'invalid parking vehicle count' }, 400);
    }
    if (score < Number(session.score)) {
        return jsonResponse({ error: 'parking score cannot go backwards' }, 400);
    }

    const now = Date.now();
    const elapsedMs = now - Number(session.started_at);
    const maxLevelByElapsed = 1 + Math.floor(elapsedMs / PARKING_MIN_MS_PER_LEVEL);
    if (score > maxLevelByElapsed) {
        return jsonResponse({ error: 'parking level clears are too fast' }, 429);
    }

    await db.prepare(
        'UPDATE ranking_sessions SET score = ?, event_count = ?, updated_at = ? WHERE session_id = ?'
    ).bind(score, Number(session.event_count) + 1, now, sessionId).run();

    return jsonResponse({
        success: true,
        game_id: gameId,
        session_id: sessionId,
        score,
        event_count: Number(session.event_count) + 1,
    });
}

async function recordScoreEvents(db, body) {
    const kind = getProtectedGameKind(body?.game_id);
    if (kind === 'cat-tower') return recordCatTowerScoreEvents(db, body);
    if (kind === 'blockpang') return recordBlockpangScoreEvents(db, body);
    if (kind === 'parking') return recordParkingScoreEvents(db, body);
    return jsonResponse({ error: 'unsupported game_id for score events' }, 400);
}

async function verifyCatTowerRankingSession(db, body, clientScore) {
    const extraData = isPlainObject(body.extra_data) ? body.extra_data : {};
    const sessionId = String(body.session_id || extraData.session_id || '').trim();
    if (!sessionId) {
        return { error: 'cat-tower ranking requires a score session', status: 400 };
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, started_at, updated_at, submitted_at FROM ranking_sessions WHERE session_id = ?'
    ).bind(sessionId).first();
    if (!session || session.game_id !== CAT_TOWER_GAME_ID) {
        return { error: 'score session not found', status: 404 };
    }
    if (session.submitted_at) {
        return { error: 'score session already submitted', status: 409 };
    }

    const now = Date.now();
    if (now - Number(session.started_at) > CAT_TOWER_SESSION_TTL_MS) {
        return { error: 'score session expired', status: 410 };
    }

    const verifiedScore = Number(session.score);
    if (!Number.isFinite(verifiedScore) || verifiedScore <= 0) {
        return { error: 'verified score must be positive', status: 400 };
    }
    if (verifiedScore > CAT_TOWER_MAX_SCORE) {
        return { error: 'verified score exceeds allowed maximum', status: 400 };
    }
    if (verifiedScore !== clientScore) {
        return { error: 'client score does not match verified score', status: 400 };
    }

    return { sessionId, score: verifiedScore };
}

async function verifyStoredScoreRankingSession(db, body, clientScore, options) {
    const extraData = isPlainObject(body.extra_data) ? body.extra_data : (isPlainObject(body.extra) ? body.extra : {});
    const sessionId = String(body.session_id || extraData.session_id || '').trim();
    if (!sessionId) {
        return { error: `${options.label} ranking requires a score session`, status: 400 };
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, started_at, updated_at, submitted_at FROM ranking_sessions WHERE session_id = ?'
    ).bind(sessionId).first();
    if (!session || session.game_id !== body.game_id) {
        return { error: 'score session not found', status: 404 };
    }
    if (session.submitted_at) {
        return { error: 'score session already submitted', status: 409 };
    }

    const now = Date.now();
    if (now - Number(session.started_at) > CAT_TOWER_SESSION_TTL_MS) {
        return { error: 'score session expired', status: 410 };
    }

    const verifiedScore = Number(session.score);
    if (!Number.isFinite(verifiedScore) || verifiedScore <= 0) {
        return { error: 'verified score must be positive', status: 400 };
    }
    if (options.maxScore && verifiedScore > options.maxScore) {
        return { error: 'verified score exceeds allowed maximum', status: 400 };
    }
    if (verifiedScore !== clientScore) {
        return { error: 'client score does not match verified score', status: 400 };
    }

    return { sessionId, score: verifiedScore };
}

async function verifyShadowRankingSession(db, body, clientScore) {
    const extraData = isPlainObject(body.extra_data) ? body.extra_data : {};
    const sessionId = String(body.session_id || extraData.session_id || '').trim();
    if (!sessionId) {
        return { error: 'shadow survival ranking requires a score session', status: 400 };
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, started_at, submitted_at FROM ranking_sessions WHERE session_id = ?'
    ).bind(sessionId).first();
    if (!session || session.game_id !== body.game_id) {
        return { error: 'score session not found', status: 404 };
    }
    if (session.submitted_at) {
        return { error: 'score session already submitted', status: 409 };
    }

    const now = Date.now();
    if (now - Number(session.started_at) > CAT_TOWER_SESSION_TTL_MS) {
        return { error: 'score session expired', status: 410 };
    }

    if (!Number.isFinite(clientScore) || clientScore <= 0 || clientScore > SHADOW_MAX_SCORE) {
        return { error: 'invalid shadow survival score', status: 400 };
    }
    const elapsedSeconds = Math.floor((now - Number(session.started_at)) / 1000) + SHADOW_SCORE_GRACE_SECONDS;
    if (clientScore > elapsedSeconds) {
        return { error: 'shadow survival score exceeds session time', status: 400 };
    }

    return { sessionId, score: clientScore };
}

async function verifyRankingSession(db, body, clientScore) {
    const kind = getProtectedGameKind(body.game_id);
    if (kind === 'cat-tower') return verifyCatTowerRankingSession(db, body, clientScore);
    if (kind === 'blockpang') return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'blockpang',
        maxScore: BLOCKPANG_MAX_SCORE,
    });
    if (kind === 'parking') return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'parking escape',
        maxScore: PARKING_MAX_LEVEL_SCORE,
    });
    if (kind === 'shadow') return verifyShadowRankingSession(db, body, clientScore);
    return null;
}

async function initDB(db) {
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS rankings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            player_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            extra_data TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `).run();
    await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_rankings_game_score ON rankings(game_id, score DESC)
    `).run();
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS ranking_sessions (
            session_id TEXT PRIMARY KEY,
            game_id TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            event_count INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            submitted_at INTEGER
        )
    `).run();
    await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_ranking_sessions_game_updated ON ranking_sessions(game_id, updated_at)
    `).run();
}

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // Health check
        if (path === '/' && request.method === 'GET') {
            return jsonResponse({
                service: 'game-api',
                version: '1.0.0',
                status: 'ok',
            });
        }

        try {
            // Auto-init DB table
            await initDB(env.DB);

            // GET /rankings?game_id=blockpang&limit=20
            if (path === '/rankings' && request.method === 'GET') {
                const gameId = url.searchParams.get('game_id');
                if (!gameId) {
                    return jsonResponse({ error: 'game_id is required' }, 400);
                }
                const limit = clampLimit(url.searchParams.get('limit'));

                const result = await env.DB.prepare(`
                    SELECT player_name, score, extra_data, created_at
                    FROM (
                        SELECT
                            player_name,
                            score,
                            extra_data,
                            created_at,
                            ROW_NUMBER() OVER (
                                PARTITION BY LOWER(TRIM(player_name))
                                ORDER BY score DESC, created_at ASC, id ASC
                            ) AS name_rank
                        FROM rankings
                        WHERE game_id = ?
                    )
                    WHERE name_rank = 1
                    ORDER BY score DESC, created_at ASC
                    LIMIT ?
                `).bind(gameId, limit).all();

                return jsonResponse({
                    game_id: gameId,
                    rankings: result.results.map((row, i) => ({
                        rank: i + 1,
                        player_name: row.player_name,
                        score: row.score,
                        extra_data: row.extra_data ? JSON.parse(row.extra_data) : null,
                        created_at: row.created_at,
                    })),
                });
            }

            // POST /rankings  { game_id, player_name, score, extra_data? }
            if (path === '/score-sessions' && request.method === 'POST') {
                const body = await request.json();
                return createScoreSession(env.DB, body?.game_id);
            }

            if (path === '/score-events' && request.method === 'POST') {
                const body = await request.json();
                return recordScoreEvents(env.DB, body);
            }

            if (path === '/rankings' && request.method === 'POST') {
                const body = await request.json();
                const { game_id, player_name, score } = body;
                let { extra_data } = body;

                if (!game_id || !player_name || score === undefined || score === null) {
                    return jsonResponse({ error: 'game_id, player_name, score are required' }, 400);
                }

                // Validate player_name: max 20 chars
                const name = String(player_name).trim().slice(0, 20);
                if (name.length === 0) {
                    return jsonResponse({ error: 'player_name cannot be empty' }, 400);
                }

                const numScore = parseInt(score, 10);
                if (isNaN(numScore) || numScore < 0) {
                    return jsonResponse({ error: 'score must be a non-negative number' }, 400);
                }

                let scoreForInsert = numScore;
                const protectedKind = getProtectedGameKind(game_id);
                if (protectedKind) {
                    const verified = await verifyRankingSession(env.DB, body, numScore);
                    if (verified.error) {
                        return jsonResponse({ error: verified.error }, verified.status || 400);
                    }
                    scoreForInsert = verified.score;
                    const baseExtra = isPlainObject(extra_data) ? extra_data : (isPlainObject(body.extra) ? body.extra : {});
                    extra_data = {
                        ...baseExtra,
                        session_id: verified.sessionId,
                        client_score: numScore,
                        verified_score: scoreForInsert,
                        verification_kind: protectedKind,
                        verified_at: new Date().toISOString(),
                    };
                    await env.DB.prepare(
                        'UPDATE ranking_sessions SET submitted_at = ?, updated_at = ? WHERE session_id = ? AND submitted_at IS NULL'
                    ).bind(Date.now(), Date.now(), verified.sessionId).run();
                }

                const extraStr = extra_data ? JSON.stringify(extra_data) : null;

                // Insert the score. Exact duplicate records may be ignored when the DB has a uniqueness constraint.
                await env.DB.prepare(
                    'INSERT OR IGNORE INTO rankings (game_id, player_name, score, extra_data) VALUES (?, ?, ?, ?)'
                ).bind(game_id, name, scoreForInsert, extraStr).run();

                // Get the displayed rank for this name after deduping by player name.
                const rankResult = await env.DB.prepare(`
                    WITH ranked_by_name AS (
                        SELECT
                            LOWER(TRIM(player_name)) AS name_key,
                            score,
                            ROW_NUMBER() OVER (
                                PARTITION BY LOWER(TRIM(player_name))
                                ORDER BY score DESC, created_at ASC, id ASC
                            ) AS name_rank
                        FROM rankings
                        WHERE game_id = ?
                    ),
                    best_scores AS (
                        SELECT name_key, score
                        FROM ranked_by_name
                        WHERE name_rank = 1
                    ),
                    current_player AS (
                        SELECT score
                        FROM best_scores
                        WHERE name_key = LOWER(TRIM(?))
                        LIMIT 1
                    )
                    SELECT
                        (SELECT score FROM current_player) AS best_score,
                        (
                            SELECT COUNT(*) + 1
                            FROM best_scores
                            WHERE score > (SELECT score FROM current_player)
                        ) AS rank
                `).bind(game_id, name).first();

                const currentRank = rankResult?.rank || 1;
                const bestScore = rankResult?.best_score ?? scoreForInsert;

                // Cleanup: keep only the top 100 unique names per game to prevent table bloat.
                await env.DB.prepare(`
                    DELETE FROM rankings WHERE game_id = ? AND id NOT IN (
                        SELECT id
                        FROM (
                            SELECT
                                id,
                                score,
                                created_at,
                                ROW_NUMBER() OVER (
                                    PARTITION BY LOWER(TRIM(player_name))
                                    ORDER BY score DESC, created_at ASC, id ASC
                                ) AS name_rank
                            FROM rankings
                            WHERE game_id = ?
                        )
                        WHERE name_rank = 1
                        ORDER BY score DESC, created_at ASC, id ASC
                        LIMIT 100
                    )
                `).bind(game_id, game_id).run();

                return jsonResponse({
                    success: true,
                    rank: currentRank,
                    player_name: name,
                    score: scoreForInsert,
                    best_score: bestScore,
                    in_top_20: currentRank <= 20,
                });
            }

            return jsonResponse({ error: 'Not Found' }, 404);

        } catch (err) {
            return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
        }
    },
};
