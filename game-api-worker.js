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
const BLOCKPANG_PROTOCOL_VERSION = 2;
const BLOCKPANG_GRID_SIZE = 10;
const BLOCKPANG_FREE_MOVE_BURST = 30;
const BLOCKPANG_MIN_MS_PER_MOVE = 90;
const BLOCKPANG_LEVEL_THRESHOLDS = [0, 5, 12, 22, 35, 52, 73, 100, 133, 172, 220, 275, 340, 415, 500, 600, 720, 860, 1020, 1200];
const BLOCKPANG_LEVEL_MAX_TIER = [2, 2, 3, 4, 5];
const BLOCKPANG_COLOR_COUNT = 8;
const BLOCKPANG_PIECE_SHAPES = [
    { shape: [[1]], weight: 4, tier: 1 },
    { shape: [[1, 1]], weight: 7, tier: 1 },
    { shape: [[1], [1]], weight: 7, tier: 1 },
    { shape: [[1, 1, 1]], weight: 10, tier: 2 },
    { shape: [[1], [1], [1]], weight: 10, tier: 2 },
    { shape: [[1, 1], [1, 1]], weight: 8, tier: 2 },
    { shape: [[1, 0], [1, 1]], weight: 7, tier: 2 },
    { shape: [[0, 1], [1, 1]], weight: 7, tier: 2 },
    { shape: [[1, 1], [1, 0]], weight: 7, tier: 2 },
    { shape: [[1, 1], [0, 1]], weight: 7, tier: 2 },
    { shape: [[1, 1, 1, 1]], weight: 5, tier: 3 },
    { shape: [[1], [1], [1], [1]], weight: 5, tier: 3 },
    { shape: [[1, 1, 1], [1, 0, 0]], weight: 4, tier: 3 },
    { shape: [[1, 1, 1], [0, 0, 1]], weight: 4, tier: 3 },
    { shape: [[1, 0, 0], [1, 1, 1]], weight: 4, tier: 3 },
    { shape: [[0, 0, 1], [1, 1, 1]], weight: 4, tier: 3 },
    { shape: [[1, 1], [1, 0], [1, 0]], weight: 4, tier: 3 },
    { shape: [[1, 1], [0, 1], [0, 1]], weight: 4, tier: 3 },
    { shape: [[1, 0], [1, 0], [1, 1]], weight: 4, tier: 3 },
    { shape: [[0, 1], [0, 1], [1, 1]], weight: 4, tier: 3 },
    { shape: [[1, 1, 1], [0, 1, 0]], weight: 4, tier: 3 },
    { shape: [[0, 1, 0], [1, 1, 1]], weight: 4, tier: 3 },
    { shape: [[1, 0], [1, 1], [1, 0]], weight: 4, tier: 3 },
    { shape: [[0, 1], [1, 1], [0, 1]], weight: 4, tier: 3 },
    { shape: [[1, 1, 0], [0, 1, 1]], weight: 4, tier: 3 },
    { shape: [[0, 1, 1], [1, 1, 0]], weight: 4, tier: 3 },
    { shape: [[1, 0], [1, 1], [0, 1]], weight: 4, tier: 3 },
    { shape: [[0, 1], [1, 1], [1, 0]], weight: 4, tier: 3 },
    { shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], weight: 3, tier: 4 },
    { shape: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], weight: 3, tier: 4 },
    { shape: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], weight: 3, tier: 4 },
    { shape: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], weight: 3, tier: 4 },
    { shape: [[1, 1, 1, 1, 1]], weight: 2, tier: 4 },
    { shape: [[1], [1], [1], [1], [1]], weight: 2, tier: 4 },
    { shape: [[1, 1, 1], [1, 1, 1]], weight: 3, tier: 4 },
    { shape: [[1, 1], [1, 1], [1, 1]], weight: 3, tier: 4 },
    { shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], weight: 1, tier: 5 },
    { shape: [[0, 1, 0], [1, 1, 1], [0, 1, 0]], weight: 2, tier: 5 },
];
const JEWELRIA_GAME_ID = 'jewelria';
const JEWELRIA_MAX_SCORE = 600000;
const JEWELRIA_MAX_STAGE = 8;
const JEWELRIA_FREE_SCORE_BURST = 2500;
const JEWELRIA_MAX_SCORE_PER_SECOND = 4500;
const JEWELRIA_COMBO_MULTIPLIER = 0.5;
const JELLY_PANG_GAME_ID = 'jelly-pang-2048';
const JELLY_PANG_PROTOCOL_VERSION = 1;
const JELLY_PANG_GRID_SIZE = 4;
const JELLY_PANG_MAX_SCORE = 5000000;
const JELLY_PANG_MAX_RANK = 20;
const JELLY_PANG_FREE_SCORE_BURST = 8192;
const JELLY_PANG_MAX_SCORE_PER_SECOND = 20000;
const LUMEN_SHIFT_GAME_ID = 'lumen-shift';
const LUMEN_SHIFT_MAX_SCORE = 3000000;
const LUMEN_SHIFT_FREE_SCORE_BURST = 2500;
const LUMEN_SHIFT_MAX_SCORE_PER_SECOND = 18000;
const LUMEN_SHIFT_SCORE_TABLE = [0, 100, 300, 500, 800];
const PARKING_GAME_ID = 'parking_escape';
const PARKING_FREE_LEVEL_BURST = 3;
const PARKING_MIN_MS_PER_LEVEL = 1800;
const PARKING_MAX_LEVEL_SCORE = 100000;
const SCHOOL_ZOMBIE_GAME_ID = 'school-zombie-defense';
const SCHOOL_ZOMBIE_MAX_CLEAR_STAGE = 1000;
const SCHOOL_ZOMBIE_MIN_MS_PER_STAGE = 12000;
const SCHOOL_ZOMBIE_RUN_COIN_LIMIT = 100000;
const SCHOOL_ZOMBIE_RUN_PROGRESS_KILL_GRACE = 30;
const SCHOOL_ZOMBIE_RUN_PROGRESS_MAX_KILLS_PER_SECOND = 8;
const SCHOOL_ZOMBIE_RUN_PROGRESS_COIN_GRACE = 60;
const SCHOOL_ZOMBIE_RUN_PROGRESS_MAX_COINS_PER_SECOND = 32;
const SCHOOL_ZOMBIE_KILLS_SQL = "CAST(COALESCE(CASE WHEN json_valid(extra_data) THEN json_extract(extra_data, '$.kills') END, 0) AS INTEGER)";
const SCHOOL_ZOMBIE_PROFILE_PREFIX = 'szp_';
const SCHOOL_ZOMBIE_PROFILE_SECRET_BYTES = 32;
const SCHOOL_ZOMBIE_SHOP_MAX_LEVEL = 30;
const SCHOOL_ZOMBIE_SHOP_COST_GROWTH = 1.16;
const SCHOOL_ZOMBIE_SHOP_COST_ROUNDING = 10;
const SCHOOL_ZOMBIE_SHOP_UPGRADE_IDS = [
    'c_power', 'c_speed', 'c_crit',
    'a_power', 'a_mark', 'a_crit',
    'b_power', 'b_control', 'b_grenade',
    'd_charge', 'd_radius', 'd_slow',
    'e_power', 'e_focus', 'e_pierce',
    'f_burn', 'f_area', 'f_throw',
    'g_voltage', 'g_chain', 'g_control',
    'h_turret', 'h_wire', 'h_barricade',
];
const SHADOW_GAME_PREFIX = 'shadow-survival-character-v1-';
const SHADOW_MAX_SCORE = 7200;
const SHADOW_SCORE_GRACE_SECONDS = 15;
const SHADOW_FIRST_EVENT_MAX_SCORE = 30;
const SHADOW_PROGRESS_SYNC_GRACE_SECONDS = 8;
const SHADOW_PROGRESS_EVENT_INTERVAL_SECONDS = 5;
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

function parseExtraData(extraStr) {
    if (!extraStr || typeof extraStr !== 'string') return {};
    try {
        const parsed = JSON.parse(extraStr);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function limitText(value, maxLength) {
    if (value === undefined || value === null) return '';
    const text = String(value);
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function safeJsonText(value) {
    if (value === undefined || value === null) return null;
    try {
        return JSON.stringify(value);
    } catch {
        return JSON.stringify({ serialization_failed: true });
    }
}

function isLocalDevelopmentUrl(value) {
    if (!value) return false;
    try {
        const hostname = new URL(String(value)).hostname.toLowerCase();
        return /^(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[?::1\]?)$/.test(hostname)
            || hostname.endsWith('.localhost');
    } catch {
        return false;
    }
}

async function insertErrorLog(db, request, payload) {
    if (!db) throw new Error('D1 DB binding is unavailable');
    await db.prepare(`
        INSERT OR IGNORE INTO error_logs (
            app_id, user_id, message, stack, url, user_agent,
            source, error_type, error_class, session_id, context_json, extra_json, report_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        limitText(payload.appId || 'game-api', 100),
        limitText(payload.userId || '', 100),
        limitText(payload.message || 'Unknown error', 500),
        limitText(payload.stack || '', 4000),
        limitText(payload.url || request?.url || '', 500),
        limitText(request?.headers?.get('User-Agent') || '', 500),
        limitText(payload.source || '', 500),
        limitText(payload.errorType || 'error', 100),
        limitText(payload.errorClass || '', 50),
        limitText(payload.sessionId || '', 100),
        safeJsonText(payload.context),
        safeJsonText(payload.extra),
        limitText(payload.reportId || payload.context?.clientReportId || payload.extra?.eventId || '', 128) || null
    ).run();
}

async function storeClientError(db, request, body) {
    if (!isPlainObject(body)) {
        return jsonResponse({ error: 'invalid client error payload' }, 400);
    }

    if ([body.url, body.source, request.headers.get('Referer')].some(isLocalDevelopmentUrl)) {
        return jsonResponse({ ok: true, ignored: true, reason: 'local_development_session' });
    }

    const gameId = limitText(body.game_id || body.gameId || body.appId || 'archerlab-games', 100)
        .replace(/[^a-z0-9_.:-]/gi, '') || 'archerlab-games';
    const errorType = limitText(body.error_type || body.errorType || body.type || 'error', 100) || 'error';
    const message = limitText(body.message || body.stack || 'Unknown client error', 500);
    if (!message) {
        return jsonResponse({ ok: true });
    }

    const normalizedMessage = message.startsWith('[' + errorType + ']')
        ? message
        : '[' + errorType + '] ' + message;

    await insertErrorLog(db, request, {
        appId: gameId,
        userId: '',
        message: limitText(normalizedMessage, 500),
        stack: limitText(body.stack || '', 4000),
        url: limitText(body.url || request.headers.get('Referer') || '', 500),
        source: limitText(body.source || body.filename || '', 500),
        errorType: errorType,
        errorClass: limitText(body.error_class || body.errorClass || '', 50),
        context: body.context || null,
        reportId: body.report_id || body.reportId || body.context?.clientReportId || body.extra?.eventId || '',
        extra: {
            lineno: body.lineno ?? body.line ?? 0,
            colno: body.colno ?? body.column ?? 0,
            appVersion: body.app_version || body.version || '',
            userAgent: request.headers.get('User-Agent') || '',
        },
    });

    return jsonResponse({ ok: true });
}

function getSchoolZombieKillsFromExtra(extraStr) {
    const kills = parseInteger(parseExtraData(extraStr).kills);
    return Number.isFinite(kills) && kills > 0 ? kills : 0;
}

function makeSessionId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeRandomHex(byteLength) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeJsonStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

function getMutationChangeCount(result) {
    return Number(result?.meta?.changes ?? result?.changes ?? 0) || 0;
}

function parseJsonObject(value) {
    if (!value || typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

async function getRequestMeta(request) {
    const ua = limitText(request?.headers?.get('User-Agent') || '', 300);
    const ip = request?.headers?.get('CF-Connecting-IP') || '';
    const ipHash = ip ? await sha256Hex(ip) : '';
    return {
        ip_hash: ipHash,
        user_agent: ua,
        origin: limitText(request?.headers?.get('Origin') || '', 300),
        referer: limitText(request?.headers?.get('Referer') || '', 500),
        country: limitText(request?.cf?.country || '', 16),
        colo: limitText(request?.cf?.colo || '', 16),
        asn: request?.cf?.asn || '',
    };
}

function normalizeUint32(value) {
    const parsed = parseInteger(value);
    if (Number.isFinite(parsed)) return parsed >>> 0;
    const text = String(value || '').trim();
    if (/^[0-9a-f]{1,8}$/i.test(text)) return parseInt(text, 16) >>> 0;
    return 0;
}

function makeBlockpangSeed(rawSeed) {
    const normalized = normalizeUint32(rawSeed);
    if (normalized) return normalized >>> 0;
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return (bytes[0] || 1) >>> 0;
}

function blockpangNextRandom(state) {
    const nextState = (normalizeUint32(state) + 0x6D2B79F5) >>> 0;
    let t = nextState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return {
        state: nextState,
        value: ((t ^ (t >>> 14)) >>> 0) / 4294967296,
    };
}

function blockpangCellCount(shape) {
    let count = 0;
    for (const row of shape) {
        for (const cell of row) {
            if (cell) count += 1;
        }
    }
    return count;
}

function cloneBlockpangShape(shape) {
    return shape.map((row) => row.slice());
}

function blockpangGeneratePiece(state, level) {
    const maxTier = BLOCKPANG_LEVEL_MAX_TIER[Math.min(Math.max(0, parseInteger(level) || 1), BLOCKPANG_LEVEL_MAX_TIER.length - 1)] || 2;
    const available = BLOCKPANG_PIECE_SHAPES.filter((piece) => (piece.tier || 1) <= maxTier);
    const totalWeight = available.reduce((sum, piece) => sum + piece.weight, 0);
    let rollResult = blockpangNextRandom(state.rng_state);
    state.rng_state = rollResult.state;
    let roll = rollResult.value * totalWeight;
    let chosen = available[0];
    for (const piece of available) {
        roll -= piece.weight;
        if (roll <= 0) {
            chosen = piece;
            break;
        }
    }

    rollResult = blockpangNextRandom(state.rng_state);
    state.rng_state = rollResult.state;
    const colorIndex = Math.floor(rollResult.value * BLOCKPANG_COLOR_COUNT);
    const shape = cloneBlockpangShape(chosen.shape);
    return {
        shape,
        colorIndex,
        rows: shape.length,
        cols: shape[0].length,
        cellCount: blockpangCellCount(shape),
    };
}

function blockpangGenerateTray(state) {
    state.slots = [
        blockpangGeneratePiece(state, state.level),
        blockpangGeneratePiece(state, state.level),
        blockpangGeneratePiece(state, state.level),
    ];
}

function createEmptyBlockpangGrid() {
    return Array.from({ length: BLOCKPANG_GRID_SIZE }, () => Array(BLOCKPANG_GRID_SIZE).fill(-1));
}

function createBlockpangSessionState(seed, requestMeta) {
    const safeSeed = makeBlockpangSeed(seed);
    const state = {
        version: BLOCKPANG_PROTOCOL_VERSION,
        game_id: BLOCKPANG_GAME_ID,
        seed: safeSeed,
        rng_state: safeSeed,
        grid: createEmptyBlockpangGrid(),
        slots: [null, null, null],
        score: 0,
        combo: 0,
        level: 1,
        linesCleared: 0,
        totalLinesForLevel: 0,
        move_seq: 0,
        request_meta: requestMeta || {},
    };
    blockpangGenerateTray(state);
    return state;
}

function normalizeBlockpangState(rawState) {
    const state = isPlainObject(rawState) ? rawState : {};
    if (state.version !== BLOCKPANG_PROTOCOL_VERSION || state.game_id !== BLOCKPANG_GAME_ID) return null;
    if (!Array.isArray(state.grid) || state.grid.length !== BLOCKPANG_GRID_SIZE) return null;
    if (!Array.isArray(state.slots) || state.slots.length !== 3) return null;
    state.rng_state = normalizeUint32(state.rng_state || state.seed);
    state.score = Math.max(0, parseInteger(state.score) || 0);
    state.combo = Math.max(0, parseInteger(state.combo) || 0);
    state.level = Math.max(1, parseInteger(state.level) || 1);
    state.linesCleared = Math.max(0, parseInteger(state.linesCleared) || 0);
    state.totalLinesForLevel = Math.max(0, parseInteger(state.totalLinesForLevel) || 0);
    state.move_seq = Math.max(0, parseInteger(state.move_seq) || 0);
    return state;
}

function createEmptyJellyPangGrid() {
    return Array.from({ length: JELLY_PANG_GRID_SIZE }, () => Array(JELLY_PANG_GRID_SIZE).fill(null));
}

function jellyPangTileValue(rank) {
    return 2 ** (rank + 1);
}

function jellyPangTilesFromGrid(grid) {
    const tiles = [];
    for (let row = 0; row < JELLY_PANG_GRID_SIZE; row += 1) {
        for (let col = 0; col < JELLY_PANG_GRID_SIZE; col += 1) {
            const rank = grid?.[row]?.[col];
            if (Number.isInteger(rank) && rank >= 0) {
                tiles.push({ row, col, rank });
            }
        }
    }
    return tiles;
}

function jellyPangEmptyCells(grid) {
    const cells = [];
    for (let row = 0; row < JELLY_PANG_GRID_SIZE; row += 1) {
        for (let col = 0; col < JELLY_PANG_GRID_SIZE; col += 1) {
            if (!Number.isInteger(grid[row][col])) cells.push({ row, col });
        }
    }
    return cells;
}

function jellyPangSpawnTile(state) {
    const cells = jellyPangEmptyCells(state.grid);
    if (!cells.length) return null;

    let roll = blockpangNextRandom(state.rng_state);
    state.rng_state = roll.state;
    const spot = cells[Math.floor(roll.value * cells.length)] || cells[cells.length - 1];

    roll = blockpangNextRandom(state.rng_state);
    state.rng_state = roll.state;
    const rank = roll.value < 0.9 ? 0 : 1;
    state.grid[spot.row][spot.col] = rank;
    state.max_rank = Math.max(state.max_rank || 0, rank);
    return { row: spot.row, col: spot.col, rank };
}

function createJellyPangSessionState(requestMeta) {
    const seed = makeBlockpangSeed();
    const state = {
        version: JELLY_PANG_PROTOCOL_VERSION,
        game_id: JELLY_PANG_GAME_ID,
        rng_state: seed,
        grid: createEmptyJellyPangGrid(),
        score: 0,
        max_rank: 0,
        move_seq: 0,
        game_over: false,
        request_meta: requestMeta || {},
    };
    jellyPangSpawnTile(state);
    jellyPangSpawnTile(state);
    return state;
}

function normalizeJellyPangState(rawState) {
    const state = isPlainObject(rawState) ? rawState : {};
    if (state.version !== JELLY_PANG_PROTOCOL_VERSION || state.game_id !== JELLY_PANG_GAME_ID) return null;
    if (!Array.isArray(state.grid) || state.grid.length !== JELLY_PANG_GRID_SIZE) return null;
    const grid = createEmptyJellyPangGrid();
    for (let row = 0; row < JELLY_PANG_GRID_SIZE; row += 1) {
        if (!Array.isArray(state.grid[row]) || state.grid[row].length !== JELLY_PANG_GRID_SIZE) return null;
        for (let col = 0; col < JELLY_PANG_GRID_SIZE; col += 1) {
            const value = state.grid[row][col];
            if (value === null || value === undefined) {
                grid[row][col] = null;
                continue;
            }
            const rank = parseInteger(value);
            if (!Number.isFinite(rank) || rank < 0 || rank > JELLY_PANG_MAX_RANK) return null;
            grid[row][col] = rank;
        }
    }
    state.grid = grid;
    state.rng_state = normalizeUint32(state.rng_state);
    state.score = Math.max(0, parseInteger(state.score) || 0);
    state.max_rank = Math.max(0, parseInteger(state.max_rank) || 0);
    state.move_seq = Math.max(0, parseInteger(state.move_seq) || 0);
    state.game_over = !!state.game_over;
    return state;
}

function jellyPangLines(dir) {
    const lines = [];
    if (dir === 'left' || dir === 'right') {
        for (let row = 0; row < JELLY_PANG_GRID_SIZE; row += 1) {
            const line = [];
            for (let i = 0; i < JELLY_PANG_GRID_SIZE; i += 1) {
                const col = dir === 'left' ? i : JELLY_PANG_GRID_SIZE - 1 - i;
                line.push({ row, col });
            }
            lines.push(line);
        }
    } else {
        for (let col = 0; col < JELLY_PANG_GRID_SIZE; col += 1) {
            const line = [];
            for (let i = 0; i < JELLY_PANG_GRID_SIZE; i += 1) {
                const row = dir === 'up' ? i : JELLY_PANG_GRID_SIZE - 1 - i;
                line.push({ row, col });
            }
            lines.push(line);
        }
    }
    return lines;
}

function jellyPangCanMove(grid) {
    if (jellyPangEmptyCells(grid).length) return true;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (let row = 0; row < JELLY_PANG_GRID_SIZE; row += 1) {
        for (let col = 0; col < JELLY_PANG_GRID_SIZE; col += 1) {
            for (const [dr, dc] of dirs) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= JELLY_PANG_GRID_SIZE || nc < 0 || nc >= JELLY_PANG_GRID_SIZE) continue;
                if (grid[nr][nc] === grid[row][col]) return true;
            }
        }
    }
    return false;
}

function applyJellyPangMove(state, event) {
    if (!isPlainObject(event) || String(event.type || '') !== 'move') {
        throw new Error('jelly-pang score event must be an authoritative move');
    }
    if (state.game_over) {
        throw new Error('jelly-pang session already reached game over');
    }

    const dir = String(event.dir || event.direction || '');
    if (!['left', 'right', 'up', 'down'].includes(dir)) {
        throw new Error('invalid jelly-pang move direction');
    }

    const moveSeq = parseInteger(event.move_seq ?? event.moveSeq);
    if (!Number.isFinite(moveSeq) || moveSeq !== state.move_seq + 1) {
        throw new Error('invalid jelly-pang move sequence');
    }

    const newGrid = createEmptyJellyPangGrid();
    let scoreGain = 0;
    let changed = false;
    let maxRank = state.max_rank || 0;

    for (const line of jellyPangLines(dir)) {
        const tiles = line
            .map(({ row, col }) => ({ row, col, rank: state.grid[row][col] }))
            .filter((tile) => Number.isInteger(tile.rank));
        let targetIndex = 0;

        for (let index = 0; index < tiles.length; index += 1) {
            const tile = tiles[index];
            const next = tiles[index + 1];
            const target = line[targetIndex];
            if (next && next.rank === tile.rank) {
                const mergedRank = tile.rank + 1;
                if (mergedRank > JELLY_PANG_MAX_RANK) {
                    throw new Error('jelly-pang merge rank exceeds allowed maximum');
                }
                newGrid[target.row][target.col] = mergedRank;
                scoreGain += jellyPangTileValue(mergedRank);
                maxRank = Math.max(maxRank, mergedRank);
                changed = true;
                index += 1;
                targetIndex += 1;
                continue;
            }

            newGrid[target.row][target.col] = tile.rank;
            if (tile.row !== target.row || tile.col !== target.col) changed = true;
            targetIndex += 1;
        }
    }

    if (!changed) {
        throw new Error('jelly-pang move does not change board');
    }

    state.grid = newGrid;
    state.score += scoreGain;
    state.max_rank = maxRank;
    state.move_seq = moveSeq;
    const spawned = jellyPangSpawnTile(state);
    state.game_over = !jellyPangCanMove(state.grid);

    return {
        dir,
        move_seq: state.move_seq,
        score: state.score,
        score_gain: scoreGain,
        max_rank: state.max_rank,
        spawned,
        game_over: state.game_over,
        grid: state.grid,
    };
}

function blockpangCanPlace(grid, shape, gridX, gridY) {
    for (let r = 0; r < shape.length; r += 1) {
        for (let c = 0; c < shape[r].length; c += 1) {
            if (!shape[r][c]) continue;
            const gr = gridY + r;
            const gc = gridX + c;
            if (gr < 0 || gr >= BLOCKPANG_GRID_SIZE || gc < 0 || gc >= BLOCKPANG_GRID_SIZE) return false;
            if (grid[gr][gc] !== -1) return false;
        }
    }
    return true;
}

function blockpangCalcLevel(totalLines) {
    for (let i = BLOCKPANG_LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
        if (totalLines >= BLOCKPANG_LEVEL_THRESHOLDS[i]) return i + 1;
    }
    return 1;
}

function blockpangClearFullLines(grid) {
    const rows = [];
    const cols = [];
    for (let r = 0; r < BLOCKPANG_GRID_SIZE; r += 1) {
        if (grid[r].every((value) => value !== -1)) rows.push(r);
    }
    for (let c = 0; c < BLOCKPANG_GRID_SIZE; c += 1) {
        let full = true;
        for (let r = 0; r < BLOCKPANG_GRID_SIZE; r += 1) {
            if (grid[r][c] === -1) {
                full = false;
                break;
            }
        }
        if (full) cols.push(c);
    }
    if (rows.length === 0 && cols.length === 0) return 0;

    const keys = new Set();
    for (const r of rows) {
        for (let c = 0; c < BLOCKPANG_GRID_SIZE; c += 1) keys.add(`${r},${c}`);
    }
    for (const c of cols) {
        for (let r = 0; r < BLOCKPANG_GRID_SIZE; r += 1) keys.add(`${r},${c}`);
    }
    for (const key of keys) {
        const [r, c] = key.split(',').map(Number);
        grid[r][c] = -1;
    }
    return rows.length + cols.length;
}

function blockpangIsGridEmpty(grid) {
    for (let r = 0; r < BLOCKPANG_GRID_SIZE; r += 1) {
        for (let c = 0; c < BLOCKPANG_GRID_SIZE; c += 1) {
            if (grid[r][c] !== -1) return false;
        }
    }
    return true;
}

function blockpangAddClearScore(state, lineCount) {
    if (lineCount <= 0) {
        state.combo = 0;
        return;
    }
    state.combo += 1;
    state.linesCleared += lineCount;
    state.totalLinesForLevel += lineCount;
    const multiBonus = lineCount >= 4 ? 100 : lineCount === 3 ? 50 : lineCount === 2 ? 20 : 0;
    let points = lineCount * BLOCKPANG_SCORE_PER_LINE + multiBonus;
    if (state.combo > 1) {
        points = Math.floor(points * (1 + (state.combo - 1) * BLOCKPANG_COMBO_MULTIPLIER));
    }
    state.score += points;
    state.level = blockpangCalcLevel(state.totalLinesForLevel);
}

function applyBlockpangMove(state, event) {
    if (!isPlainObject(event) || String(event.type || '') !== 'move') {
        throw new Error('blockpang score events must be authoritative moves');
    }
    const seq = parseInteger(event.seq);
    if (!Number.isFinite(seq) || seq !== state.move_seq + 1) {
        throw new Error('invalid blockpang move sequence');
    }
    const slotIndex = parseInteger(event.slot_index ?? event.slotIndex);
    const gridX = parseInteger(event.grid_x ?? event.gridX ?? event.x);
    const gridY = parseInteger(event.grid_y ?? event.gridY ?? event.y);
    if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex > 2) {
        throw new Error('invalid blockpang slot index');
    }
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) {
        throw new Error('invalid blockpang move position');
    }

    const piece = state.slots[slotIndex];
    if (!piece || !Array.isArray(piece.shape)) {
        throw new Error('blockpang slot is empty');
    }
    if (!blockpangCanPlace(state.grid, piece.shape, gridX, gridY)) {
        throw new Error('invalid blockpang placement');
    }

    for (let r = 0; r < piece.shape.length; r += 1) {
        for (let c = 0; c < piece.shape[r].length; c += 1) {
            if (!piece.shape[r][c]) continue;
            state.grid[gridY + r][gridX + c] = piece.colorIndex;
        }
    }
    state.score += piece.cellCount * BLOCKPANG_SCORE_PER_CELL;
    state.slots[slotIndex] = null;

    const clearedLines = blockpangClearFullLines(state.grid);
    blockpangAddClearScore(state, clearedLines);
    let perfectClear = false;
    if (clearedLines > 0 && blockpangIsGridEmpty(state.grid)) {
        state.score += BLOCKPANG_PERFECT_CLEAR_BONUS * state.level;
        perfectClear = true;
    }
    if (state.slots.every((slot) => slot === null)) {
        blockpangGenerateTray(state);
    }
    state.move_seq = seq;
    return { cleared_lines: clearedLines, perfect_clear: perfectClear };
}

function getSchoolZombieShopUpgradeCost(level) {
    if (level >= SCHOOL_ZOMBIE_SHOP_MAX_LEVEL) return 0;
    return Math.round((200 * Math.pow(SCHOOL_ZOMBIE_SHOP_COST_GROWTH, level)) / SCHOOL_ZOMBIE_SHOP_COST_ROUNDING) * SCHOOL_ZOMBIE_SHOP_COST_ROUNDING;
}

function getSchoolZombieShopUpgradeRefund(level) {
    const safeLevel = Math.max(0, Math.min(SCHOOL_ZOMBIE_SHOP_MAX_LEVEL, parseInteger(level)));
    let refund = 0;
    for (let i = 0; i < safeLevel; i += 1) {
        refund += getSchoolZombieShopUpgradeCost(i);
    }
    return refund;
}

function getSchoolZombieUpgradeJsonPath(upgradeId) {
    if (!SCHOOL_ZOMBIE_SHOP_UPGRADE_IDS.includes(upgradeId)) {
        throw new Error('invalid upgrade_id');
    }
    return `$.${upgradeId}`;
}

function createDefaultSchoolZombieProfileMeta() {
    const upgrades = {};
    SCHOOL_ZOMBIE_SHOP_UPGRADE_IDS.forEach((id) => {
        upgrades[id] = 0;
    });
    return { coins: 0, upgrades };
}

function normalizeSchoolZombieProfileMeta(meta) {
    const defaults = createDefaultSchoolZombieProfileMeta();
    const upgrades = { ...defaults.upgrades };
    const rawUpgrades = isPlainObject(meta?.upgrades) ? meta.upgrades : {};
    SCHOOL_ZOMBIE_SHOP_UPGRADE_IDS.forEach((id) => {
        const level = parseInteger(rawUpgrades[id]);
        upgrades[id] = Number.isFinite(level)
            ? Math.max(0, Math.min(SCHOOL_ZOMBIE_SHOP_MAX_LEVEL, level))
            : 0;
    });
    const coins = parseInteger(meta?.coins);
    return {
        coins: Number.isFinite(coins) ? Math.max(0, coins) : 0,
        upgrades,
    };
}

function parseSchoolZombieProfileMeta(row) {
    return normalizeSchoolZombieProfileMeta({
        coins: row?.coins,
        upgrades: parseExtraData(row?.upgrades || '{}'),
    });
}

function getSchoolZombieStageCoinReward(clearedStage) {
    const safeStage = Math.max(0, Math.min(SCHOOL_ZOMBIE_MAX_CLEAR_STAGE, parseInteger(clearedStage)));
    if (!Number.isFinite(safeStage) || safeStage <= 0) return 0;
    return getSchoolZombieMinKillsForClearedStage(safeStage);
}

function normalizeSchoolZombieRewardCounts(event, kills, level) {
    const rawCounts = isPlainObject(event.reward_counts) ? event.reward_counts
        : isPlainObject(event.rewardCounts) ? event.rewardCounts
            : null;
    if (!rawCounts) {
        return {
            counts: { '1': kills, '2': 0, '3': 0, '4': 0 },
            coins: kills,
        };
    }
    const counts = {};
    [1, 2, 3, 4].forEach((reward) => {
        const value = parseInteger(rawCounts[String(reward)] ?? rawCounts[reward]);
        counts[String(reward)] = Number.isFinite(value) ? value : 0;
    });
    if (Object.values(counts).some((value) => value < 0)) {
        throw new Error('invalid school zombie reward counts');
    }
    const countedKills = counts['1'] + counts['2'] + counts['3'] + counts['4'];
    if (countedKills !== kills) {
        throw new Error('school zombie reward counts must match kill count');
    }
    if (level < 4 && (counts['2'] > 0 || counts['3'] > 0 || counts['4'] > 0)) {
        throw new Error('school zombie reward counts exceed level rewards');
    }
    if (level < 6 && counts['4'] > 0) {
        throw new Error('school zombie elite rewards are not available yet');
    }
    if (level < 8 && counts['3'] > 0) {
        throw new Error('school zombie guard rewards are not available yet');
    }

    const eliteCap = level >= 6 ? Math.ceil(kills * 0.22 + 4) : 0;
    const guardCap = level >= 8 ? Math.ceil(kills * 0.35 + 4) : 0;
    const premiumCap = level >= 4 ? Math.ceil(kills * 0.85 + 5) : 0;
    if (counts['4'] > eliteCap || counts['3'] > guardCap || (counts['2'] + counts['3'] + counts['4']) > premiumCap) {
        throw new Error('school zombie reward counts exceed allowed distribution');
    }

    return {
        counts,
        coins: counts['1'] + counts['2'] * 2 + counts['3'] * 3 + counts['4'] * 4,
    };
}

function normalizeSchoolZombieRunProgress(event, session, previousState, now) {
    if (!isPlainObject(event)) {
        throw new Error('school zombie progress event must be an object');
    }
    const clientRunCoins = parseInteger(event.run_coins ?? event.runCoins ?? event.coins);
    const kills = parseInteger(event.kills);
    const reachedStage = parseInteger(event.reached_stage ?? event.reachedStage ?? event.stage);
    const level = parseInteger(event.level);
    const survivedSeconds = parseInteger(event.survived_seconds ?? event.survivedSeconds ?? event.time);
    if (Number.isFinite(clientRunCoins) && (clientRunCoins < 0 || clientRunCoins > SCHOOL_ZOMBIE_RUN_COIN_LIMIT)) {
        throw new Error('invalid school zombie run coins');
    }
    if (!Number.isFinite(kills) || kills < 0) {
        throw new Error('invalid school zombie kill count');
    }
    if (!Number.isFinite(reachedStage) || reachedStage < 1 || reachedStage > SCHOOL_ZOMBIE_MAX_CLEAR_STAGE + 1) {
        throw new Error('invalid school zombie reached stage');
    }
    if (!Number.isFinite(level) || level < 1) {
        throw new Error('invalid school zombie level');
    }
    const expectedStage = Math.floor((level - 1) / 4) + 1;
    if (reachedStage !== expectedStage) {
        throw new Error('invalid school zombie stage for level');
    }
    const elapsedSeconds = Math.max(0, Math.floor((now - Number(session.started_at)) / 1000));
    if (Number.isFinite(survivedSeconds) && survivedSeconds > elapsedSeconds + 10) {
        throw new Error('invalid school zombie survived time');
    }
    const maxKills = SCHOOL_ZOMBIE_RUN_PROGRESS_KILL_GRACE + elapsedSeconds * SCHOOL_ZOMBIE_RUN_PROGRESS_MAX_KILLS_PER_SECOND;
    let verifiedRunCoins = Math.max(0, Math.min(SCHOOL_ZOMBIE_RUN_COIN_LIMIT, kills));
    const maxCoinsByTime = SCHOOL_ZOMBIE_RUN_PROGRESS_COIN_GRACE + elapsedSeconds * SCHOOL_ZOMBIE_RUN_PROGRESS_MAX_COINS_PER_SECOND;
    if (kills > maxKills || verifiedRunCoins > maxCoinsByTime) {
        throw new Error('school zombie run progress exceeds allowed pace');
    }
    const rewards = normalizeSchoolZombieRewardCounts(event, kills, level);
    if (Number.isFinite(clientRunCoins) && clientRunCoins !== rewards.coins) {
        throw new Error('school zombie run coins must match reward counts');
    }
    verifiedRunCoins = Math.max(0, Math.min(SCHOOL_ZOMBIE_RUN_COIN_LIMIT, rewards.coins));
    if (verifiedRunCoins > maxCoinsByTime) {
        throw new Error('school zombie run rewards exceed allowed pace');
    }
    const previousCoins = Math.max(0, parseInteger(previousState.run_coins) || 0);
    const previousKills = Math.max(0, parseInteger(previousState.kills) || 0);
    if (verifiedRunCoins < previousCoins || kills < previousKills) {
        throw new Error('school zombie run progress cannot decrease');
    }
    return {
        run_coins: verifiedRunCoins,
        reward_counts: rewards.counts,
        kills,
        reached_stage: reachedStage,
        level,
        survived_seconds: Number.isFinite(survivedSeconds) ? Math.max(0, survivedSeconds) : elapsedSeconds,
        updated_at: now,
    };
}

function getProtectedGameKind(gameId) {
    if (gameId === CAT_TOWER_GAME_ID) return 'cat-tower';
    if (gameId === BLOCKPANG_GAME_ID) return 'blockpang';
    if (gameId === JEWELRIA_GAME_ID) return 'jewelria';
    if (gameId === JELLY_PANG_GAME_ID) return 'jelly-pang';
    if (gameId === LUMEN_SHIFT_GAME_ID) return 'lumen-shift';
    if (gameId === PARKING_GAME_ID) return 'parking';
    if (gameId === SCHOOL_ZOMBIE_GAME_ID) return 'school-zombie';
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

async function createScoreSession(db, gameId, request, body = {}) {
    if (!getProtectedGameKind(gameId)) {
        return jsonResponse({ error: 'unsupported game_id for score sessions' }, 400);
    }

    const now = Date.now();
    const sessionId = makeSessionId();
    const requestMeta = await getRequestMeta(request);
    let initialScore = gameId === PARKING_GAME_ID ? 1 : 0;
    let state = {
        version: 1,
        game_id: gameId,
        request_meta: requestMeta,
    };
    if (gameId === SCHOOL_ZOMBIE_GAME_ID) {
        const auth = await readSchoolZombieProfileAuth(db, body);
        if (auth.error) {
            return jsonResponse({ error: auth.error }, auth.status || 400);
        }
        state.profile_id = auth.row.profile_id;
    }
    if (gameId === BLOCKPANG_GAME_ID) {
        state = createBlockpangSessionState(body?.seed, requestMeta);
        initialScore = state.score;
    }
    if (gameId === JELLY_PANG_GAME_ID) {
        state = createJellyPangSessionState(requestMeta);
        initialScore = state.score;
    }
    await db.prepare(
        'INSERT INTO ranking_sessions (session_id, game_id, score, event_count, started_at, updated_at, state_json) VALUES (?, ?, ?, 0, ?, ?, ?)'
    ).bind(sessionId, gameId, initialScore, now, now, safeJsonStringify(state)).run();

    await db.prepare('DELETE FROM ranking_sessions WHERE updated_at < ?')
        .bind(now - CAT_TOWER_SESSION_TTL_MS)
        .run();

    const response = {
        success: true,
        game_id: gameId,
        session_id: sessionId,
    };
    if (gameId === BLOCKPANG_GAME_ID) {
        response.protocol = BLOCKPANG_PROTOCOL_VERSION;
        response.seed = state.seed;
        response.rng_state = state.rng_state;
        response.pieces = state.slots;
    }
    if (gameId === JELLY_PANG_GAME_ID) {
        response.protocol = JELLY_PANG_PROTOCOL_VERSION;
        response.rng_state = state.rng_state;
        response.tiles = jellyPangTilesFromGrid(state.grid);
        response.grid = state.grid;
        response.score = state.score;
        response.move_seq = state.move_seq;
    }
    return jsonResponse(response);
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

    const currentEventCount = Math.max(0, parseInteger(session.event_count) || 0);
    let deltaTotal = 0;
    let appliedEventCount = 0;
    let hasFinalMerge = false;
    try {
        events.forEach((event) => {
            const seq = parseInteger(event?.seq ?? event?.event_seq ?? event?.eventSeq);
            if (Number.isFinite(seq)) {
                if (seq <= currentEventCount) return;
                if (seq !== currentEventCount + appliedEventCount + 1) {
                    throw new Error('cat-tower score event sequence mismatch');
                }
            }

            const eventNumber = currentEventCount + appliedEventCount + 1;
            const type = String(event?.type || 'merge');
            if (type === 'final_merge') hasFinalMerge = true;
            const combo = parseInteger(event?.combo ?? 1);
            if (type === 'merge'
                && Number.isFinite(combo)
                && combo > eventNumber) {
                throw new Error('cat-tower combo exceeds session sequence');
            }
            deltaTotal += validateCatTowerScoreEvent(event);
            appliedEventCount += 1;
        });
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedScore = Number(session.score) + deltaTotal;
    const projectedEventCount = currentEventCount + appliedEventCount;
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
        'SELECT session_id, game_id, score, event_count, started_at, submitted_at, state_json FROM ranking_sessions WHERE session_id = ?'
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

    const state = normalizeBlockpangState(parseJsonObject(session.state_json));
    if (!state) {
        return jsonResponse({ error: 'blockpang session requires authoritative move protocol' }, 409);
    }

    const moveResults = [];
    try {
        for (const event of events) {
            moveResults.push(applyBlockpangMove(state, event));
        }
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedScore = Number(state.score);
    const projectedEventCount = Number(session.event_count) + events.length;
    if (projectedScore > BLOCKPANG_MAX_SCORE) {
        return jsonResponse({ error: 'blockpang score exceeds allowed maximum' }, 400);
    }

    const elapsedMs = now - Number(session.started_at);
    const minMoveElapsedMs = Math.max(0, Number(state.move_seq) - BLOCKPANG_FREE_MOVE_BURST) * BLOCKPANG_MIN_MS_PER_MOVE;
    const minScoreElapsedMs = (Math.max(0, projectedScore - BLOCKPANG_FREE_SCORE_BURST) / BLOCKPANG_MAX_SCORE_PER_SECOND) * 1000;
    if (elapsedMs < Math.max(minMoveElapsedMs, minScoreElapsedMs)) {
        return jsonResponse({ error: 'blockpang score events are too fast' }, 429);
    }

    await db.prepare(
        'UPDATE ranking_sessions SET score = ?, event_count = ?, updated_at = ?, state_json = ? WHERE session_id = ?'
    ).bind(projectedScore, projectedEventCount, now, safeJsonStringify(state), sessionId).run();

    return jsonResponse({
        success: true,
        game_id: gameId,
        session_id: sessionId,
        score: projectedScore,
        event_count: projectedEventCount,
        move_seq: state.move_seq,
        level: state.level,
        lines: state.linesCleared,
        slots: state.slots,
        moves: moveResults,
    });
}

function normalizeJewelriaExtraData(extraData, score) {
    const base = isPlainObject(extraData) ? extraData : {};
    const rawStage = parseInteger(base.highest_stage ?? base.stage ?? 1);
    const highestStage = Math.max(1, Math.min(JEWELRIA_MAX_STAGE, Number.isFinite(rawStage) ? rawStage : 1));
    const rawStageScore = parseInteger(base.stage_score);
    return {
        ...base,
        highest_stage: highestStage,
        stage: highestStage,
        run_score: Math.max(0, Math.floor(score || 0)),
        stage_score: Number.isFinite(rawStageScore) ? Math.max(0, rawStageScore) : undefined,
    };
}

function validateJewelriaScoreEvent(event) {
    if (!isPlainObject(event)) {
        throw new Error('score event must be an object');
    }

    const type = String(event.type || '');
    const delta = parseInteger(event.delta);
    if (type !== 'match') {
        throw new Error('unsupported jewelria score event');
    }
    if (!Number.isFinite(delta) || delta < 0) {
        throw new Error('score event delta must be non-negative');
    }

    const removed = parseInteger(event.removed);
    const longest = parseInteger(event.longest);
    const lines = parseInteger(event.lines);
    const special = parseInteger(event.special ?? 0);
    const combo = parseInteger(event.combo);
    if (!Number.isFinite(removed) || removed < 3 || removed > 64) {
        throw new Error('invalid jewelria removed count');
    }
    if (!Number.isFinite(longest) || longest < 3 || longest > 8) {
        throw new Error('invalid jewelria longest match');
    }
    if (!Number.isFinite(lines) || lines < 1 || lines > 16) {
        throw new Error('invalid jewelria line count');
    }
    if (!Number.isFinite(special) || special < 0 || special > 16) {
        throw new Error('invalid jewelria special count');
    }
    if (!Number.isFinite(combo) || combo < 1 || combo > 100) {
        throw new Error('invalid jewelria combo count');
    }

    const lengthBonus = longest >= 5 ? 50 : longest >= 4 ? 20 : 0;
    const multiLineBonus = Math.max(0, lines - 1) * 20;
    const specialBonus = special * 50;
    const base = removed * 10 + lengthBonus + multiLineBonus + specialBonus;
    const expected = Math.floor(base * (1 + Math.max(0, combo - 1) * JEWELRIA_COMBO_MULTIPLIER));
    if (delta !== expected) {
        throw new Error('jewelria score event delta mismatch');
    }
    return delta;
}

async function recordJewelriaScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);

    if (gameId !== JEWELRIA_GAME_ID) {
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
        events.forEach((event, index) => {
            const combo = parseInteger(event?.combo);
            if (Number.isFinite(combo) && combo > Number(session.event_count) + index + 1) {
                throw new Error('jewelria combo exceeds session sequence');
            }
            deltaTotal += validateJewelriaScoreEvent(event);
        });
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedScore = Number(session.score) + deltaTotal;
    const projectedEventCount = Number(session.event_count) + events.length;
    if (projectedScore > JEWELRIA_MAX_SCORE) {
        return jsonResponse({ error: 'jewelria score exceeds allowed maximum' }, 400);
    }

    const elapsedMs = now - Number(session.started_at);
    const minScoreElapsedMs = (Math.max(0, projectedScore - JEWELRIA_FREE_SCORE_BURST) / JEWELRIA_MAX_SCORE_PER_SECOND) * 1000;
    if (elapsedMs < minScoreElapsedMs) {
        return jsonResponse({ error: 'jewelria score events are too fast' }, 429);
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

function normalizeJellyPangExtraData(extraData, score) {
    const base = isPlainObject(extraData) ? extraData : {};
    const rawMaxTile = parseInteger(base.max_tile ?? base.maxTile);
    const maxTile = Number.isFinite(rawMaxTile) ? Math.max(2, Math.min(2 ** (JELLY_PANG_MAX_RANK + 1), rawMaxTile)) : undefined;
    return {
        ...base,
        run_score: Math.max(0, Math.floor(score || 0)),
        max_tile: maxTile,
        target_reached: !!base.target_reached,
    };
}

async function recordJellyPangScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);

    if (gameId !== JELLY_PANG_GAME_ID) {
        return jsonResponse({ error: 'unsupported game_id for score events' }, 400);
    }
    if (!sessionId) {
        return jsonResponse({ error: 'session_id is required' }, 400);
    }
    if (events.length === 0 || events.length > SCORE_EVENT_BATCH_LIMIT) {
        return jsonResponse({ error: 'events must contain 1-50 items' }, 400);
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, event_count, started_at, submitted_at, state_json FROM ranking_sessions WHERE session_id = ?'
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

    const state = normalizeJellyPangState(parseJsonObject(session.state_json));
    if (!state) {
        return jsonResponse({ error: 'jelly-pang session requires authoritative state' }, 409);
    }

    const moveResults = [];
    try {
        for (const event of events) {
            moveResults.push(applyJellyPangMove(state, event));
        }
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedScore = Number(state.score);
    const projectedEventCount = Number(session.event_count) + events.length;
    if (projectedScore > JELLY_PANG_MAX_SCORE) {
        return jsonResponse({ error: 'jelly-pang score exceeds allowed maximum' }, 400);
    }

    const elapsedMs = now - Number(session.started_at);
    const minScoreElapsedMs = (Math.max(0, projectedScore - JELLY_PANG_FREE_SCORE_BURST) / JELLY_PANG_MAX_SCORE_PER_SECOND) * 1000;
    if (elapsedMs < minScoreElapsedMs) {
        return jsonResponse({ error: 'jelly-pang score events are too fast' }, 429);
    }

    await db.prepare(
        'UPDATE ranking_sessions SET score = ?, event_count = ?, updated_at = ?, state_json = ? WHERE session_id = ?'
    ).bind(projectedScore, projectedEventCount, now, safeJsonStringify(state), sessionId).run();

    const latest = moveResults[moveResults.length - 1] || {
        move_seq: state.move_seq,
        score: state.score,
        score_gain: 0,
        max_rank: state.max_rank,
        spawned: null,
        game_over: state.game_over,
        grid: state.grid,
    };

    return jsonResponse({
        success: true,
        game_id: gameId,
        session_id: sessionId,
        score: projectedScore,
        event_count: projectedEventCount,
        move_seq: latest.move_seq,
        score_gain: latest.score_gain,
        max_rank: latest.max_rank,
        spawned: latest.spawned,
        game_over: latest.game_over,
        rng_state: state.rng_state,
        grid: latest.grid,
        moves: moveResults,
    });
}

async function recordParkingScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);

    if (gameId !== PARKING_GAME_ID) {
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

    try {
        for (const event of events) {
            if (!isPlainObject(event) || String(event.type || '') !== 'level_clear') {
                throw new Error('parking score event must be level_clear');
            }
            if (event.score !== undefined || event.level !== undefined || event.cleared_level !== undefined) {
                throw new Error('parking score event cannot set score');
            }
            const moves = parseInteger(event.moves);
            const levelMoves = parseInteger(event.level_moves ?? event.levelMoves ?? event.moves);
            const vehicles = parseInteger(event.vehicles);
            if (!Number.isFinite(moves) || moves < 1 || moves > 10000) {
                throw new Error('invalid parking move count');
            }
            if (!Number.isFinite(levelMoves) || levelMoves < 1 || levelMoves > 10000) {
                throw new Error('invalid parking level move count');
            }
            if (!Number.isFinite(vehicles) || vehicles < 1 || vehicles > 200) {
                throw new Error('invalid parking vehicle count');
            }
        }
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedScore = Number(session.score) + events.length;
    const projectedEventCount = Number(session.event_count) + events.length;
    if (projectedScore > PARKING_MAX_LEVEL_SCORE) {
        return jsonResponse({ error: 'parking score exceeds allowed maximum' }, 400);
    }

    const now = Date.now();
    const elapsedMs = now - Number(session.started_at);
    const clearedLevels = Math.max(0, projectedScore - 1);
    const minElapsedMs = Math.max(0, clearedLevels - PARKING_FREE_LEVEL_BURST) * PARKING_MIN_MS_PER_LEVEL;
    if (elapsedMs < minElapsedMs) {
        return jsonResponse({ error: 'parking level clears are too fast' }, 429);
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

function getSchoolZombieMinKillsForClearedStage(stage) {
    let total = 0;
    const maxLevel = stage * 4;
    for (let level = 1; level <= maxLevel; level += 1) {
        const rawNeed = level === 1 ? 12 : 15 + level * 4.4;
        total += Math.max(4, Math.round(rawNeed / 2.4));
    }
    return total;
}

async function recordSchoolZombieScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);

    if (gameId !== SCHOOL_ZOMBIE_GAME_ID) {
        return jsonResponse({ error: 'unsupported game_id for score events' }, 400);
    }
    if (!sessionId) {
        return jsonResponse({ error: 'session_id is required' }, 400);
    }
    if (events.length === 0 || events.length > SCORE_EVENT_BATCH_LIMIT) {
        return jsonResponse({ error: 'events must contain 1-50 items' }, 400);
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, event_count, started_at, submitted_at, state_json FROM ranking_sessions WHERE session_id = ?'
    ).bind(sessionId).first();
    if (!session || session.game_id !== gameId) {
        return jsonResponse({ error: 'score session not found' }, 404);
    }
    if (session.submitted_at) {
        return jsonResponse({ error: 'score session already submitted' }, 409);
    }
    const sessionState = parseExtraData(session.state_json);
    const sessionProfileId = String(sessionState.profile_id || '').trim();
    if (!sessionProfileId) {
        return jsonResponse({ error: 'school zombie score session requires profile binding' }, 409);
    }
    const auth = await readSchoolZombieProfileAuth(db, body);
    if (auth.error) {
        return jsonResponse({ error: auth.error }, auth.status || 400);
    }
    if (auth.row.profile_id !== sessionProfileId) {
        return jsonResponse({ error: 'score session belongs to another profile' }, 403);
    }

    const currentScore = Number(session.score);
    const now = Date.now();
    let projectedScore = Number.isFinite(currentScore) ? currentScore : 0;
    let nextState = {
        ...sessionState,
        version: 1,
        game_id: gameId,
    };
    try {
        events.forEach((event) => {
            const type = String(event?.type || '');
            if (type === 'run_progress') {
                nextState = {
                    ...nextState,
                    ...normalizeSchoolZombieRunProgress(event, session, nextState, now),
                };
                return;
            }
            if (!isPlainObject(event) || type !== 'stage_clear') {
                throw new Error('school zombie score event must be stage_clear or run_progress');
            }
            if (event.score !== undefined || event.delta !== undefined || event.highest_stage !== undefined) {
                throw new Error('school zombie score event cannot set score');
            }
            const clearedStage = parseInteger(event.cleared_stage ?? event.clearedStage);
            const reachedStage = parseInteger(event.reached_stage ?? event.reachedStage);
            const level = parseInteger(event.level);
            const kills = parseInteger(event.kills);
            const expectedStage = projectedScore + 1;
            if (!Number.isFinite(clearedStage) || clearedStage < 1 || clearedStage > SCHOOL_ZOMBIE_MAX_CLEAR_STAGE) {
                throw new Error('invalid school zombie cleared stage sequence');
            }
            if (clearedStage > expectedStage) {
                throw new Error('invalid school zombie cleared stage sequence');
            }
            if (!Number.isFinite(reachedStage) || reachedStage !== clearedStage + 1) {
                throw new Error('invalid school zombie reached stage');
            }
            if (!Number.isFinite(level) || level < clearedStage * 4 + 1) {
                throw new Error('invalid school zombie level for stage clear');
            }
            if (!Number.isFinite(kills) || kills < getSchoolZombieMinKillsForClearedStage(clearedStage)) {
                throw new Error('invalid school zombie kill count for stage clear');
            }
            // Stage events are idempotent so the client can safely retry when the
            // original response is lost after D1 has already committed the event.
            projectedScore = Math.max(projectedScore, clearedStage);
            nextState.highest_cleared_stage = Math.max(parseInteger(nextState.highest_cleared_stage) || 0, clearedStage);
            nextState.kills = Math.max(parseInteger(nextState.kills) || 0, kills);
            nextState.reached_stage = Math.max(parseInteger(nextState.reached_stage) || 1, reachedStage);
            nextState.level = Math.max(parseInteger(nextState.level) || 1, level);
        });
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedEventCount = Number(session.event_count) + events.length;
    if (projectedScore > SCHOOL_ZOMBIE_MAX_CLEAR_STAGE) {
        return jsonResponse({ error: 'school zombie score exceeds allowed maximum' }, 400);
    }

    const elapsedMs = now - Number(session.started_at);
    const minElapsedMs = projectedScore * SCHOOL_ZOMBIE_MIN_MS_PER_STAGE;
    if (elapsedMs < minElapsedMs) {
        return jsonResponse({ error: 'school zombie stage clears are too fast' }, 429);
    }

    await db.prepare(
        'UPDATE ranking_sessions SET score = ?, event_count = ?, updated_at = ?, state_json = ? WHERE session_id = ?'
    ).bind(projectedScore, projectedEventCount, now, safeJsonStringify(nextState), sessionId).run();

    return jsonResponse({
        success: true,
        game_id: gameId,
        session_id: sessionId,
        score: projectedScore,
        event_count: projectedEventCount,
        run_coins: Math.max(0, parseInteger(nextState.run_coins) || 0),
    });
}

function validateShadowScoreEvent(event) {
    if (!isPlainObject(event)) {
        throw new Error('score event must be an object');
    }

    const type = String(event.type || '');
    if (type !== 'progress') {
        throw new Error('shadow survival score event must be progress');
    }
    if (event.score !== undefined || event.delta !== undefined) {
        throw new Error('shadow survival score event cannot set score');
    }

    const survivedSeconds = parseInteger(event.survived_seconds ?? event.survivedSeconds ?? event.time);
    const level = parseInteger(event.level);
    const kills = parseInteger(event.kills);
    const shadowCount = parseInteger(event.shadow_count ?? event.shadowCount ?? 0);

    if (!Number.isFinite(survivedSeconds) || survivedSeconds <= 0 || survivedSeconds > SHADOW_MAX_SCORE) {
        throw new Error('invalid shadow survival progress time');
    }
    if (!Number.isFinite(level) || level < 1 || level > 30) {
        throw new Error('invalid shadow survival level');
    }
    if (!Number.isFinite(kills) || kills < 0 || kills > 100000) {
        throw new Error('invalid shadow survival kill count');
    }
    if (!Number.isFinite(shadowCount) || shadowCount < 0 || shadowCount > 1000) {
        throw new Error('invalid shadow survival shadow count');
    }

    return survivedSeconds;
}

async function recordShadowScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);

    if (getProtectedGameKind(gameId) !== 'shadow') {
        return jsonResponse({ error: 'unsupported game_id for score events' }, 400);
    }
    if (!sessionId) {
        return jsonResponse({ error: 'session_id is required' }, 400);
    }
    if (events.length === 0 || events.length > SCORE_EVENT_BATCH_LIMIT) {
        return jsonResponse({ error: 'events must contain 1-50 items' }, 400);
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, event_count, started_at, updated_at, submitted_at FROM ranking_sessions WHERE session_id = ?'
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

    const currentScore = Math.max(0, Number(session.score) || 0);
    let projectedScore = currentScore;
    try {
        for (const event of events) {
            projectedScore = Math.max(projectedScore, validateShadowScoreEvent(event));
        }
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const currentEventCount = Math.max(0, Number(session.event_count) || 0);
    const projectedEventCount = currentEventCount + events.length;
    if (projectedScore <= currentScore) {
        return jsonResponse({
            success: true,
            game_id: gameId,
            session_id: sessionId,
            score: currentScore,
            event_count: currentEventCount,
        });
    }

    const elapsedSinceStartSeconds = Math.floor((now - Number(session.started_at)) / 1000) + SHADOW_SCORE_GRACE_SECONDS;
    if (projectedScore > elapsedSinceStartSeconds) {
        return jsonResponse({ error: 'shadow survival progress exceeds session time' }, 429);
    }
    if (currentEventCount === 0 && projectedScore > SHADOW_FIRST_EVENT_MAX_SCORE) {
        return jsonResponse({ error: 'shadow survival first progress event is too late' }, 429);
    }

    const elapsedSinceUpdateSeconds = Math.floor((now - Number(session.updated_at)) / 1000) + SHADOW_PROGRESS_SYNC_GRACE_SECONDS;
    if (projectedScore - currentScore > elapsedSinceUpdateSeconds) {
        return jsonResponse({ error: 'shadow survival progress jump is too large' }, 429);
    }

    const minEventCount = Math.max(1, Math.floor(projectedScore / SHADOW_PROGRESS_EVENT_INTERVAL_SECONDS) - 6);
    if (projectedEventCount < minEventCount) {
        return jsonResponse({ error: 'shadow survival progress events are too sparse' }, 429);
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

async function recordScoreEvents(db, body) {
    const kind = getProtectedGameKind(body?.game_id);
    if (kind === 'cat-tower') return recordCatTowerScoreEvents(db, body);
    if (kind === 'blockpang') return recordBlockpangScoreEvents(db, body);
    if (kind === 'jewelria') return recordJewelriaScoreEvents(db, body);
    if (kind === 'jelly-pang') return recordJellyPangScoreEvents(db, body);
    if (kind === 'lumen-shift') return recordLumenShiftScoreEvents(db, body);
    if (kind === 'parking') return recordParkingScoreEvents(db, body);
    if (kind === 'school-zombie') return recordSchoolZombieScoreEvents(db, body);
    if (kind === 'shadow') return recordShadowScoreEvents(db, body);
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

function validateLumenShiftScoreEvent(event) {
    if (!isPlainObject(event)) {
        throw new Error('score event must be an object');
    }

    const type = String(event.type || '');
    const delta = parseInteger(event.delta);
    const level = parseInteger(event.level);
    if (!Number.isFinite(delta) || delta <= 0) {
        throw new Error('score event delta must be positive');
    }
    if (!Number.isFinite(level) || level < 1 || level > 80) {
        throw new Error('invalid lumen shift level');
    }

    if (type === 'clear') {
        const lines = parseInteger(event.lines);
        const combo = parseInteger(event.combo);
        if (!Number.isFinite(lines) || lines < 1 || lines > 4) {
            throw new Error('invalid lumen shift line count');
        }
        if (!Number.isFinite(combo) || combo < 1 || combo > 300) {
            throw new Error('invalid lumen shift combo count');
        }
        const expected = (LUMEN_SHIFT_SCORE_TABLE[lines] * level) + (Math.max(0, combo - 1) * 50 * level);
        if (delta !== expected) {
            throw new Error('lumen shift clear delta mismatch');
        }
        return delta;
    }

    if (type === 'zone_bonus') {
        const zoneLines = parseInteger(event.zone_lines);
        if (!Number.isFinite(zoneLines) || zoneLines < 1 || zoneLines > 120) {
            throw new Error('invalid lumen shift zone line count');
        }
        const expected = zoneLines * zoneLines * 42 * level + zoneLines * 120;
        if (delta !== expected) {
            throw new Error('lumen shift zone bonus delta mismatch');
        }
        return delta;
    }

    throw new Error('unsupported lumen shift score event');
}

async function recordLumenShiftScoreEvents(db, body) {
    const gameId = body?.game_id;
    const sessionId = String(body?.session_id || '').trim();
    const events = Array.isArray(body?.events) ? body.events : (body?.event ? [body.event] : []);

    if (gameId !== LUMEN_SHIFT_GAME_ID) {
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
            deltaTotal += validateLumenShiftScoreEvent(event);
        }
    } catch (err) {
        return jsonResponse({ error: err.message }, 400);
    }

    const projectedScore = Number(session.score) + deltaTotal;
    const projectedEventCount = Number(session.event_count) + events.length;
    if (projectedScore > LUMEN_SHIFT_MAX_SCORE) {
        return jsonResponse({ error: 'lumen shift score exceeds allowed maximum' }, 400);
    }

    const elapsedMs = now - Number(session.started_at);
    const minScoreElapsedMs = (Math.max(0, projectedScore - LUMEN_SHIFT_FREE_SCORE_BURST) / LUMEN_SHIFT_MAX_SCORE_PER_SECOND) * 1000;
    if (elapsedMs < minScoreElapsedMs) {
        return jsonResponse({ error: 'lumen shift score events are too fast' }, 429);
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

async function verifyStoredScoreRankingSession(db, body, clientScore, options) {
    const extraData = isPlainObject(body.extra_data) ? body.extra_data : (isPlainObject(body.extra) ? body.extra : {});
    const sessionId = String(body.session_id || extraData.session_id || '').trim();
    if (!sessionId) {
        return { error: `${options.label} ranking requires a score session`, status: 400 };
    }

    const session = await db.prepare(
        'SELECT session_id, game_id, score, started_at, updated_at, submitted_at, state_json FROM ranking_sessions WHERE session_id = ?'
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

    const state = parseJsonObject(session.state_json);
    if (options.requiredStateVersion && state.version !== options.requiredStateVersion) {
        return { error: `${options.label} ranking requires authoritative session state`, status: 409 };
    }
    const authoritativeState = options.requiredStateVersion === BLOCKPANG_PROTOCOL_VERSION
        ? normalizeBlockpangState(state)
        : null;
    if (options.requiredStateVersion === BLOCKPANG_PROTOCOL_VERSION && !authoritativeState) {
        return { error: `${options.label} ranking session state is invalid`, status: 409 };
    }

    const verifiedScore = authoritativeState ? Number(authoritativeState.score) : Number(session.score);
    if (!Number.isFinite(verifiedScore) || verifiedScore <= 0) {
        return { error: 'verified score must be positive', status: 400 };
    }
    if (options.maxScore && verifiedScore > options.maxScore) {
        return { error: 'verified score exceeds allowed maximum', status: 400 };
    }
    if (verifiedScore !== clientScore) {
        return { error: 'client score does not match verified score', status: 400 };
    }

    return { sessionId, score: verifiedScore, state: authoritativeState || state };
}

async function verifyShadowRankingSession(db, body, clientScore) {
    return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'shadow survival',
        maxScore: SHADOW_MAX_SCORE,
    });
}

async function verifyRankingSession(db, body, clientScore) {
    const kind = getProtectedGameKind(body.game_id);
    if (kind === 'cat-tower') return verifyCatTowerRankingSession(db, body, clientScore);
    if (kind === 'blockpang') return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'blockpang',
        maxScore: BLOCKPANG_MAX_SCORE,
        requiredStateVersion: BLOCKPANG_PROTOCOL_VERSION,
    });
    if (kind === 'jewelria') return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'jewelria',
        maxScore: JEWELRIA_MAX_SCORE,
    });
    if (kind === 'jelly-pang') return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'jelly pang',
        maxScore: JELLY_PANG_MAX_SCORE,
        requiredStateVersion: JELLY_PANG_PROTOCOL_VERSION,
    });
    if (kind === 'lumen-shift') return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'lumen shift',
        maxScore: LUMEN_SHIFT_MAX_SCORE,
    });
    if (kind === 'parking') return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'parking escape',
        maxScore: PARKING_MAX_LEVEL_SCORE,
    });
    if (kind === 'school-zombie') return verifyStoredScoreRankingSession(db, body, clientScore, {
        label: 'school zombie defense',
        maxScore: SCHOOL_ZOMBIE_MAX_CLEAR_STAGE,
    });
    if (kind === 'shadow') return verifyShadowRankingSession(db, body, clientScore);
    return null;
}

function schoolZombieProfileResponse(row, extra = {}) {
    const meta = parseSchoolZombieProfileMeta(row);
    return {
        success: true,
        profile_id: row.profile_id,
        profile: meta,
        coins: meta.coins,
        upgrades: meta.upgrades,
        ...extra,
    };
}

async function createSchoolZombieProfile(db) {
    const profileId = `${SCHOOL_ZOMBIE_PROFILE_PREFIX}${makeRandomHex(16)}`;
    const profileSecret = makeRandomHex(SCHOOL_ZOMBIE_PROFILE_SECRET_BYTES);
    const secretHash = await sha256Hex(profileSecret);
    const meta = createDefaultSchoolZombieProfileMeta();
    const now = Date.now();
    await db.prepare(`
        INSERT INTO school_zombie_profiles (profile_id, secret_hash, coins, upgrades, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(profileId, secretHash, meta.coins, JSON.stringify(meta.upgrades), now, now).run();
    const row = await db.prepare('SELECT * FROM school_zombie_profiles WHERE profile_id = ?')
        .bind(profileId)
        .first();
    return jsonResponse(schoolZombieProfileResponse(row, {
        profile_secret: profileSecret,
        created: true,
    }));
}

async function readSchoolZombieProfileAuth(db, body) {
    const profileId = String(body?.profile_id || '').trim();
    const profileSecret = String(body?.profile_secret || '').trim();
    if (!profileId || !profileSecret) {
        return { error: 'profile credentials are required', status: 400 };
    }
    const row = await db.prepare('SELECT * FROM school_zombie_profiles WHERE profile_id = ?')
        .bind(profileId)
        .first();
    if (!row) {
        return { error: 'profile not found', status: 404 };
    }
    const secretHash = await sha256Hex(profileSecret);
    if (secretHash !== row.secret_hash) {
        return { error: 'profile authorization failed', status: 401 };
    }
    return { row };
}

async function getOrCreateSchoolZombieProfile(db, body) {
    if (!body?.profile_id && !body?.profile_secret) {
        return createSchoolZombieProfile(db);
    }
    const auth = await readSchoolZombieProfileAuth(db, body);
    if (auth.error) {
        return jsonResponse({ error: auth.error }, auth.status || 400);
    }
    return jsonResponse(schoolZombieProfileResponse(auth.row));
}

async function updateSchoolZombieProfile(db, row, meta) {
    const next = normalizeSchoolZombieProfileMeta(meta);
    const now = Date.now();
    await db.prepare(`
        UPDATE school_zombie_profiles
        SET coins = ?, upgrades = ?, updated_at = ?
        WHERE profile_id = ?
    `).bind(next.coins, JSON.stringify(next.upgrades), now, row.profile_id).run();
    const updated = await db.prepare('SELECT * FROM school_zombie_profiles WHERE profile_id = ?')
        .bind(row.profile_id)
        .first();
    return updated;
}

async function buySchoolZombieUpgrade(db, body) {
    const auth = await readSchoolZombieProfileAuth(db, body);
    if (auth.error) {
        return jsonResponse({ error: auth.error }, auth.status || 400);
    }
    const upgradeId = String(body?.upgrade_id || '').trim();
    if (!SCHOOL_ZOMBIE_SHOP_UPGRADE_IDS.includes(upgradeId)) {
        return jsonResponse({ error: 'invalid upgrade_id' }, 400);
    }
    const meta = parseSchoolZombieProfileMeta(auth.row);
    const level = meta.upgrades[upgradeId] || 0;
    if (level >= SCHOOL_ZOMBIE_SHOP_MAX_LEVEL) {
        return jsonResponse({ error: 'upgrade already maxed' }, 400);
    }
    const cost = getSchoolZombieShopUpgradeCost(level);
    if (meta.coins < cost) {
        return jsonResponse({ error: 'not enough coins' }, 400);
    }
    const now = Date.now();
    const upgradePath = getSchoolZombieUpgradeJsonPath(upgradeId);
    const mutation = await db.prepare(`
        UPDATE school_zombie_profiles
        SET coins = coins - ?,
            upgrades = json_set(CASE WHEN json_valid(upgrades) THEN upgrades ELSE '{}' END, ?, ?),
            updated_at = ?
        WHERE profile_id = ?
          AND coins >= ?
          AND CAST(COALESCE(CASE WHEN json_valid(upgrades) THEN json_extract(upgrades, ?) END, 0) AS INTEGER) = ?
    `).bind(cost, upgradePath, level + 1, now, auth.row.profile_id, cost, upgradePath, level).run();
    const updated = await db.prepare('SELECT * FROM school_zombie_profiles WHERE profile_id = ?')
        .bind(auth.row.profile_id)
        .first();
    if (getMutationChangeCount(mutation) <= 0) {
        const latestMeta = parseSchoolZombieProfileMeta(updated);
        const latestLevel = latestMeta.upgrades[upgradeId] || 0;
        if (latestLevel >= SCHOOL_ZOMBIE_SHOP_MAX_LEVEL) {
            return jsonResponse({ error: 'upgrade already maxed' }, 400);
        }
        if (latestMeta.coins < getSchoolZombieShopUpgradeCost(latestLevel)) {
            return jsonResponse({ error: 'not enough coins' }, 400);
        }
        return jsonResponse({ error: 'profile changed; retry upgrade' }, 409);
    }
    return jsonResponse(schoolZombieProfileResponse(updated, {
        upgrade_id: upgradeId,
        level: level + 1,
        cost,
    }));
}

async function resetSchoolZombieUpgrades(db, body) {
    const auth = await readSchoolZombieProfileAuth(db, body);
    if (auth.error) {
        return jsonResponse({ error: auth.error }, auth.status || 400);
    }
    const meta = parseSchoolZombieProfileMeta(auth.row);
    const refund = SCHOOL_ZOMBIE_SHOP_UPGRADE_IDS
        .reduce((sum, id) => sum + getSchoolZombieShopUpgradeRefund(meta.upgrades[id]), 0);
    if (refund <= 0) {
        return jsonResponse({ error: 'no upgrades to reset' }, 400);
    }
    SCHOOL_ZOMBIE_SHOP_UPGRADE_IDS.forEach((id) => {
        meta.upgrades[id] = 0;
    });
    const now = Date.now();
    const resetUpgrades = JSON.stringify(meta.upgrades);
    const mutation = await db.prepare(`
        UPDATE school_zombie_profiles
        SET coins = coins + ?,
            upgrades = ?,
            updated_at = ?
        WHERE profile_id = ?
          AND upgrades = ?
    `).bind(refund, resetUpgrades, now, auth.row.profile_id, auth.row.upgrades).run();
    const updated = await db.prepare('SELECT * FROM school_zombie_profiles WHERE profile_id = ?')
        .bind(auth.row.profile_id)
        .first();
    if (getMutationChangeCount(mutation) <= 0) {
        return jsonResponse({ error: 'profile changed; retry reset' }, 409);
    }
    return jsonResponse(schoolZombieProfileResponse(updated, { refund }));
}

async function bankSchoolZombieRunCoins(db, body) {
    const auth = await readSchoolZombieProfileAuth(db, body);
    if (auth.error) {
        return jsonResponse({ error: auth.error }, auth.status || 400);
    }
    const sessionId = String(body?.session_id || '').trim();
    if (!sessionId) {
        return jsonResponse({ error: 'session_id is required' }, 400);
    }
    const session = await db.prepare(
        'SELECT session_id, game_id, score, event_count, started_at, state_json FROM ranking_sessions WHERE session_id = ?'
    ).bind(sessionId).first();
    if (!session || session.game_id !== SCHOOL_ZOMBIE_GAME_ID) {
        return jsonResponse({ error: 'score session not found' }, 404);
    }
    const parsedStage = parseInteger(session.score);
    const clearedStage = Number.isFinite(parsedStage) ? Math.max(0, parsedStage) : 0;
    const sessionState = parseExtraData(session.state_json);
    const sessionProfileId = String(sessionState.profile_id || '').trim();
    if (sessionProfileId && sessionProfileId !== auth.row.profile_id) {
        return jsonResponse({ error: 'score session belongs to another profile' }, 403);
    }
    const storedRunCoins = parseInteger(sessionState.run_coins);
    const earnedCoins = Number.isFinite(storedRunCoins)
        ? Math.max(0, Math.min(SCHOOL_ZOMBIE_RUN_COIN_LIMIT, storedRunCoins))
        : getSchoolZombieStageCoinReward(clearedStage);
    const existingClaim = await db.prepare(
        'SELECT profile_id, coins, cleared_stage FROM school_zombie_coin_claims WHERE session_id = ?'
    ).bind(sessionId).first();
    if (existingClaim) {
        if (existingClaim.profile_id !== auth.row.profile_id) {
            return jsonResponse({ error: 'score session already claimed by another profile' }, 403);
        }
        const latest = await db.prepare('SELECT * FROM school_zombie_profiles WHERE profile_id = ?')
            .bind(auth.row.profile_id)
            .first();
        return jsonResponse(schoolZombieProfileResponse(latest, {
            earned_coins: 0,
            cleared_stage: Number(existingClaim.cleared_stage || 0),
            run_coins: Number(existingClaim.coins || 0),
            duplicate_claim: true,
        }));
    }
    const now = Date.now();
    const claim = await db.prepare(`
        INSERT OR IGNORE INTO school_zombie_coin_claims (session_id, profile_id, coins, cleared_stage, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).bind(sessionId, auth.row.profile_id, earnedCoins, clearedStage, now).run();
    if (getMutationChangeCount(claim) <= 0) {
        const latestClaim = await db.prepare(
            'SELECT profile_id, coins, cleared_stage FROM school_zombie_coin_claims WHERE session_id = ?'
        ).bind(sessionId).first();
        if (latestClaim && latestClaim.profile_id !== auth.row.profile_id) {
            return jsonResponse({ error: 'score session already claimed by another profile' }, 403);
        }
        const latest = await db.prepare('SELECT * FROM school_zombie_profiles WHERE profile_id = ?')
            .bind(auth.row.profile_id)
            .first();
        return jsonResponse(schoolZombieProfileResponse(latest, {
            earned_coins: 0,
            cleared_stage: Number(latestClaim?.cleared_stage || 0),
            run_coins: Number(latestClaim?.coins || 0),
            duplicate_claim: true,
        }));
    }

    if (!sessionProfileId) {
        const nextSessionState = {
            ...sessionState,
            profile_id: auth.row.profile_id,
        };
        await db.prepare(
            'UPDATE ranking_sessions SET state_json = ? WHERE session_id = ?'
        ).bind(safeJsonStringify(nextSessionState), sessionId).run();
    }
    await db.prepare(`
        UPDATE school_zombie_profiles
        SET coins = coins + ?,
            updated_at = ?
        WHERE profile_id = ?
    `).bind(earnedCoins, now, auth.row.profile_id).run();
    const updated = await db.prepare('SELECT * FROM school_zombie_profiles WHERE profile_id = ?')
        .bind(auth.row.profile_id)
        .first();
    return jsonResponse(schoolZombieProfileResponse(updated, {
        earned_coins: earnedCoins,
        cleared_stage: clearedStage,
        run_coins: earnedCoins,
    }));
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
    const rankingSessionColumns = await db.prepare('PRAGMA table_info(ranking_sessions)').all().catch(() => null);
    const hasStateJson = rankingSessionColumns?.results?.some((column) => column.name === 'state_json');
    if (!hasStateJson) {
        await db.prepare('ALTER TABLE ranking_sessions ADD COLUMN state_json TEXT').run().catch(() => null);
    }
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS school_zombie_profiles (
            profile_id TEXT PRIMARY KEY,
            secret_hash TEXT NOT NULL,
            coins INTEGER NOT NULL DEFAULT 0,
            upgrades TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `).run();
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS school_zombie_coin_claims (
            session_id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            coins INTEGER NOT NULL DEFAULT 0,
            cleared_stage INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    `).run();
    await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_school_zombie_coin_claims_profile ON school_zombie_coin_claims(profile_id, created_at)
    `).run();
}

async function saveParkingRankingRecord(db, gameId, name, score, extraStr) {
    const existing = await db.prepare(`
        SELECT id, score
        FROM rankings
        WHERE game_id = ?
          AND LOWER(TRIM(player_name)) = LOWER(TRIM(?))
        ORDER BY score DESC, created_at ASC, id ASC
        LIMIT 1
    `).bind(gameId, name).first();

    if (existing) {
        const existingScore = Number(existing.score);
        if (Number.isFinite(existingScore) && score > existingScore) {
            await db.prepare(`
                UPDATE rankings
                SET player_name = ?, score = ?, extra_data = ?, created_at = datetime('now')
                WHERE id = ?
            `).bind(name, score, extraStr, existing.id).run();
            return { saved_score: score, updated: true };
        }
        return { saved_score: Number.isFinite(existingScore) ? existingScore : score, duplicate_name: true };
    }

    const insertResult = await db.prepare(
        'INSERT OR IGNORE INTO rankings (game_id, player_name, score, extra_data) VALUES (?, ?, ?, ?)'
    ).bind(gameId, name, score, extraStr).run();

    const changes = Number(insertResult?.meta?.changes ?? insertResult?.changes ?? 0);
    if (changes > 0) {
        return { saved_score: score, inserted: true };
    }

    const fallback = await db.prepare(`
        SELECT score
        FROM rankings
        WHERE game_id = ?
          AND LOWER(TRIM(player_name)) = LOWER(TRIM(?))
        ORDER BY score DESC, created_at ASC, id ASC
        LIMIT 1
    `).bind(gameId, name).first();

    return { saved_score: Number(fallback?.score ?? score), duplicate_name: !!fallback };
}

async function saveRankingRecord(db, gameId, name, score, extraStr) {
    if (gameId === PARKING_GAME_ID) {
        return saveParkingRankingRecord(db, gameId, name, score, extraStr);
    }
    if (gameId === SCHOOL_ZOMBIE_GAME_ID) {
        return saveSchoolZombieRankingRecord(db, gameId, name, score, extraStr);
    }

    await db.prepare(
        'INSERT OR IGNORE INTO rankings (game_id, player_name, score, extra_data) VALUES (?, ?, ?, ?)'
    ).bind(gameId, name, score, extraStr).run();
    return { saved_score: score };
}

async function saveSchoolZombieRankingRecord(db, gameId, name, score, extraStr) {
    const kills = getSchoolZombieKillsFromExtra(extraStr);
    const existing = await db.prepare(`
        SELECT id, score, ${SCHOOL_ZOMBIE_KILLS_SQL} AS kills
        FROM rankings
        WHERE game_id = ?
          AND LOWER(TRIM(player_name)) = LOWER(TRIM(?))
        ORDER BY score DESC, kills DESC, created_at ASC, id ASC
        LIMIT 1
    `).bind(gameId, name).first();

    if (existing) {
        const existingScore = Number(existing.score);
        const existingKills = Number(existing.kills || 0);
        if (score > existingScore || (score === existingScore && kills > existingKills)) {
            await db.prepare(`
                UPDATE rankings
                SET player_name = ?, score = ?, extra_data = ?, created_at = datetime('now')
                WHERE id = ?
            `).bind(name, score, extraStr, existing.id).run();
            return { saved_score: score, saved_kills: kills, updated: true };
        }
        return {
            saved_score: Number.isFinite(existingScore) ? existingScore : score,
            saved_kills: Number.isFinite(existingKills) ? existingKills : kills,
            duplicate_name: true,
        };
    }

    await db.prepare(
        'INSERT OR IGNORE INTO rankings (game_id, player_name, score, extra_data) VALUES (?, ?, ?, ?)'
    ).bind(gameId, name, score, extraStr).run();
    return { saved_score: score, saved_kills: kills };
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
            if (path === '/client-errors' && request.method === 'POST') {
                const body = await request.json().catch(() => null);
                return storeClientError(env.DB, request, body);
            }

            // Auto-init DB table
            await initDB(env.DB);

            // GET /rankings?game_id=blockpang&limit=20
            if (path === '/rankings' && request.method === 'GET') {
                const gameId = url.searchParams.get('game_id');
                if (!gameId) {
                    return jsonResponse({ error: 'game_id is required' }, 400);
                }
                const limit = clampLimit(url.searchParams.get('limit'));

                const result = gameId === SCHOOL_ZOMBIE_GAME_ID
                    ? await env.DB.prepare(`
                        SELECT player_name, score, extra_data, created_at
                        FROM (
                            SELECT
                                player_name,
                                score,
                                extra_data,
                                created_at,
                                ${SCHOOL_ZOMBIE_KILLS_SQL} AS sort_kills,
                                ROW_NUMBER() OVER (
                                    PARTITION BY LOWER(TRIM(player_name))
                                    ORDER BY score DESC, ${SCHOOL_ZOMBIE_KILLS_SQL} DESC, created_at ASC, id ASC
                                ) AS name_rank
                            FROM rankings
                            WHERE game_id = ?
                        )
                        WHERE name_rank = 1
                        ORDER BY score DESC, sort_kills DESC, created_at ASC
                        LIMIT ?
                    `).bind(gameId, limit).all()
                    : await env.DB.prepare(`
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
                        extra_data: row.extra_data ? parseExtraData(row.extra_data) : null,
                        created_at: row.created_at,
                    })),
                });
            }

            // POST /rankings  { game_id, player_name, score, extra_data? }
            if (path === '/score-sessions' && request.method === 'POST') {
                const body = await request.json();
                return createScoreSession(env.DB, body?.game_id, request, body);
            }

            if (path === '/score-events' && request.method === 'POST') {
                const body = await request.json();
                return recordScoreEvents(env.DB, body);
            }

            if (path === '/school-zombie/profile' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                return getOrCreateSchoolZombieProfile(env.DB, body);
            }

            if (path === '/school-zombie/profile/buy-upgrade' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                return buySchoolZombieUpgrade(env.DB, body);
            }

            if (path === '/school-zombie/profile/reset-upgrades' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                return resetSchoolZombieUpgrades(env.DB, body);
            }

            if (path === '/school-zombie/profile/bank-run' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                return bankSchoolZombieRunCoins(env.DB, body);
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
                let verifiedSessionId = null;
                const protectedKind = getProtectedGameKind(game_id);
                if (!protectedKind) {
                    return jsonResponse({ error: 'unsupported game_id for rankings' }, 400);
                }
                const verified = await verifyRankingSession(env.DB, body, numScore);
                if (verified.error) {
                    return jsonResponse({ error: verified.error }, verified.status || 400);
                }
                scoreForInsert = verified.score;
                verifiedSessionId = verified.sessionId;
                const baseExtra = isPlainObject(extra_data) ? extra_data : (isPlainObject(body.extra) ? body.extra : {});
                extra_data = {
                    ...baseExtra,
                    session_id: verified.sessionId,
                    client_score: numScore,
                    verified_score: scoreForInsert,
                    verification_kind: protectedKind,
                    verified_at: new Date().toISOString(),
                };

                if (game_id === BLOCKPANG_GAME_ID && verified.state) {
                    extra_data = {
                        ...extra_data,
                        level: verified.state.level,
                        lines: verified.state.linesCleared,
                        move_seq: verified.state.move_seq,
                        verification_protocol: verified.state.version,
                    };
                }

                if (game_id === JEWELRIA_GAME_ID) {
                    extra_data = normalizeJewelriaExtraData(extra_data, scoreForInsert);
                }
                if (game_id === JELLY_PANG_GAME_ID) {
                    extra_data = normalizeJellyPangExtraData(extra_data, scoreForInsert);
                }

                const extraStr = extra_data ? JSON.stringify(extra_data) : null;

                // Store the score. Parking Escape keeps one best record per visible name, so the
                // same nickname can submit again without tripping older uniqueness constraints.
                const saveResult = await saveRankingRecord(env.DB, game_id, name, scoreForInsert, extraStr);
                const savedScore = Number(saveResult?.saved_score ?? scoreForInsert);
                if (verifiedSessionId) {
                    const now = Date.now();
                    await env.DB.prepare(
                        'UPDATE ranking_sessions SET submitted_at = ?, updated_at = ? WHERE session_id = ? AND submitted_at IS NULL'
                    ).bind(now, now, verifiedSessionId).run();
                }
                if (game_id === JEWELRIA_GAME_ID) {
                    await env.DB.prepare(`
                        UPDATE rankings
                        SET extra_data = ?
                        WHERE game_id = ?
                          AND LOWER(TRIM(player_name)) = LOWER(TRIM(?))
                          AND score = ?
                          AND CAST(COALESCE(json_extract(extra_data, '$.highest_stage'), json_extract(extra_data, '$.stage'), 1) AS INTEGER) < ?
                    `).bind(extraStr, game_id, name, scoreForInsert, extra_data.highest_stage).run();
                }

                // Get the displayed rank for this name after deduping by player name.
                const rankResult = game_id === SCHOOL_ZOMBIE_GAME_ID
                    ? await env.DB.prepare(`
                        WITH ranked_by_name AS (
                            SELECT
                                LOWER(TRIM(player_name)) AS name_key,
                                score,
                                ${SCHOOL_ZOMBIE_KILLS_SQL} AS kills,
                                ROW_NUMBER() OVER (
                                    PARTITION BY LOWER(TRIM(player_name))
                                    ORDER BY score DESC, ${SCHOOL_ZOMBIE_KILLS_SQL} DESC, created_at ASC, id ASC
                                ) AS name_rank
                            FROM rankings
                            WHERE game_id = ?
                        ),
                        best_scores AS (
                            SELECT name_key, score, kills
                            FROM ranked_by_name
                            WHERE name_rank = 1
                        ),
                        current_player AS (
                            SELECT score, kills
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
                                   OR (
                                     score = (SELECT score FROM current_player)
                                     AND kills > (SELECT kills FROM current_player)
                                   )
                            ) AS rank
                    `).bind(game_id, name).first()
                    : await env.DB.prepare(`
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
                const bestScore = rankResult?.best_score ?? savedScore;

                // Cleanup: keep only the top 100 unique names per game to prevent table bloat.
                if (game_id === SCHOOL_ZOMBIE_GAME_ID) {
                    await env.DB.prepare(`
                        DELETE FROM rankings WHERE game_id = ? AND id NOT IN (
                            SELECT id
                            FROM (
                                SELECT
                                    id,
                                    score,
                                    ${SCHOOL_ZOMBIE_KILLS_SQL} AS sort_kills,
                                    created_at,
                                    ROW_NUMBER() OVER (
                                        PARTITION BY LOWER(TRIM(player_name))
                                        ORDER BY score DESC, ${SCHOOL_ZOMBIE_KILLS_SQL} DESC, created_at ASC, id ASC
                                    ) AS name_rank
                                FROM rankings
                                WHERE game_id = ?
                            )
                            WHERE name_rank = 1
                            ORDER BY score DESC, sort_kills DESC, created_at ASC, id ASC
                            LIMIT 100
                        )
                    `).bind(game_id, game_id).run();
                } else {
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
                }

                return jsonResponse({
                    success: true,
                    rank: currentRank,
                    player_name: name,
                    score: savedScore,
                    best_score: bestScore,
                    best_stage: game_id === JEWELRIA_GAME_ID ? extra_data?.highest_stage : undefined,
                    in_top_20: currentRank <= 20,
                });
            }

            return jsonResponse({ error: 'Not Found' }, 404);

        } catch (err) {
            try {
                await insertErrorLog(env.DB, request, {
                    appId: 'game-api',
                    message: err?.message || String(err),
                    stack: err?.stack || '',
                    url: request.url,
                    source: 'game-api.fetch',
                    errorType: 'WORKER_ERROR',
                    errorClass: 'server',
                    context: {
                        method: request.method,
                        path,
                    },
                    extra: {
                        colo: request.cf?.colo || '',
                    },
                });
            } catch (logErr) {
                console.error('[D1] Failed to persist game-api error:', logErr?.message || logErr);
            }
            return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
        }
    },
};
