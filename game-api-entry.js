import { waterSortRoute } from './water-sort-src/worker/route.ts';
import { cleanupStaleRuns } from './water-sort-src/worker/cleanup.ts';
import { DurableObject } from 'cloudflare:workers';
import api, { initDB, createScoreSession, recordScoreEvents, submitRanking, getProtectedGameKind, jsonResponse, bankSchoolZombieRunCoins } from './game-api-worker.js';

const BANK_RUN_PATH = '/school-zombie/profile/bank-run';
const PATHS = new Set(['/score-sessions', '/score-events', '/rankings', BANK_RUN_PATH]);
const ID = /^[a-zA-Z0-9_-]{16,100}$/;
const MAX_BODY_BYTES = 256 * 1024;

async function fingerprint(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
}

async function rankingPosition(db, body) {
    const kills = body.game_id === 'school-zombie-defense'
        ? ", CAST(COALESCE(CASE WHEN json_valid(extra_data) THEN json_extract(extra_data, '$.kills') END, 0) AS INTEGER) DESC" : '';
    return db.prepare(`WITH per_name AS (
        SELECT player_name, score, extra_data, created_at, id,
            ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(player_name)) ORDER BY score DESC${kills}, created_at, id) AS name_rank
        FROM rankings WHERE game_id = ?
    ), ordered AS (
        SELECT player_name, score, ROW_NUMBER() OVER (ORDER BY score DESC${kills}, created_at, id) AS rank
        FROM per_name WHERE name_rank = 1
    ) SELECT rank, score AS best_score FROM ordered WHERE LOWER(TRIM(player_name)) = LOWER(TRIM(?))`)
        .bind(body.game_id, body.player_name).first();
}

// D1 commits the game mutation and its receipt together. A crash after commit
// but before the Durable Object/browser receives the response cannot add points twice.
export async function executeRankingCommand(db, command, sessionId, requestMeta = {}) {
    if (command.path === BANK_RUN_PATH) {
        // The session claim ledger and additive balance write share their own D1
        // transaction. It also deduplicates legacy requests with different IDs.
        const response = await bankSchoolZombieRunCoins(db, { ...command.body, session_id: sessionId });
        return { status: response.status, data: await response.json() };
    }
    const existing = await db.prepare('SELECT payload_hash, response_json FROM ranking_delivery_receipts WHERE request_id = ?')
        .bind(command.id).first();
    if (existing) {
        if (existing.payload_hash !== command.hash) return { status: 409, data: { error: 'delivery id reused with different data' } };
        return { status: 200, data: JSON.parse(existing.response_json) };
    }
    const writes = [];
    const transaction = {
        prepare(sql) {
            function statement(values = []) {
                const real = values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
                return {
                    bind: (...next) => statement(next),
                    first: (...args) => real.first(...args),
                    all: (...args) => real.all(...args),
                    run: async () => { writes.push(real); return { success: true, meta: { changes: 1 } }; },
                };
            }
            return statement();
        },
    };
    const body = { ...command.body, session_id: sessionId };
    let response;
    if (command.path === '/score-sessions') {
        body.delivery_session_id = sessionId;
        const request = new Request('https://game-api.internal/score-sessions', { headers: requestMeta });
        response = await createScoreSession(transaction, body.game_id, request, body);
    } else if (command.path === '/score-events') {
        response = await recordScoreEvents(transaction, body);
    } else {
        response = await submitRanking(transaction, body);
    }
    const data = await response.json();
    if (!response.ok) return { status: response.status, data };
    writes.push(db.prepare(`INSERT INTO ranking_delivery_receipts (request_id, session_id, payload_hash, response_json)
        VALUES (?, ?, ?, ?)`)
        .bind(command.id, sessionId, command.hash, JSON.stringify(data)));
    await db.batch(writes);
    return { status: 200, data };
}

export class RankingDelivery extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.work = Promise.resolve();
        this.dbReady = false;
        ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL, game_id TEXT NOT NULL,
            path TEXT NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL, predecessor TEXT,
            state TEXT NOT NULL DEFAULT 'pending', response TEXT, http_status INTEGER,
            attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL, last_error TEXT
        )`);
        ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS pending_jobs ON jobs(state, next_at, created_at)');
        if (!ctx.storage.sql.exec('PRAGMA table_info(jobs)').toArray().some(column => column.name === 'progression_rechecked')) {
            ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN progression_rechecked INTEGER NOT NULL DEFAULT 0');
        }
    }

    // Serialize D1 read/modify/write cycles for this run, without holding a
    // blockConcurrencyWhile input gate across network I/O.
    exclusive(callback) {
        const result = this.work.then(callback);
        this.work = result.catch(() => {});
        return result;
    }

    async accept(sessionId, gameId, commands, requestMeta) {
        const prepared = [];
        for (const item of commands) {
            const payload = JSON.stringify(item.body);
            const hash = await fingerprint(JSON.stringify([item.path, canonical(item.body)]));
            prepared.push({ ...item, payload, hash });
        }
        // Arm recovery before acknowledging any new durable jobs. Storage's
        // output gate ensures no response escapes before writes are durable.
        await this.ctx.storage.setAlarm(Date.now() + 10000);
        this.ctx.storage.transactionSync(() => {
            for (const command of prepared) {
                const existing = this.ctx.storage.sql.exec('SELECT hash FROM jobs WHERE id = ?', command.id).toArray()[0];
                if (existing && existing.hash !== command.hash) throw new Error('delivery id reused with different data');
                this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO jobs
                    (id, session_id, game_id, path, payload, hash, predecessor, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                command.id, sessionId, gameId, command.path, command.payload, command.hash, command.after || null, Date.now());
            }
        });
        await this.exclusive(() => this.drain(requestMeta));
        return commands.map(command => {
            const row = this.ctx.storage.sql.exec('SELECT state, response, http_status FROM jobs WHERE id = ?', command.id).toArray()[0];
            return {
                id: command.id,
                state: row.state,
                status: row.http_status || 202,
                data: row.response ? JSON.parse(row.response) : { pending: true, accepted: true, request_id: command.id },
            };
        });
    }

    async drain(requestMeta = {}) {
        // Re-arm first, including when D1 initialization itself fails. There is
        // no retry limit or age-based deletion for pending/review records.
        await this.ctx.storage.setAlarm(Date.now() + 60000);
        try {
            if (!this.dbReady) { await initDB(this.env.DB); this.dbReady = true; }
            // Replay retained payloads rejected by former clock/gross-coin checks,
            // including from alarms when the browser no longer resends the job.
            // Execute the normal verifier again; other review reasons stay blocked.
            this.ctx.storage.sql.exec(`UPDATE jobs SET state = 'pending', next_at = 0,
                response = NULL, http_status = NULL
                WHERE game_id = 'school-zombie-defense' AND state = 'review'
                AND last_error IN ('invalid school zombie survived time',
                    'school zombie run coins must match reward counts',
                    'school zombie run progress cannot decrease')`);
            // Older clients/alarms may retain valid endless-game payloads rejected
            // by limits absent from gameplay. Recheck each job once, through the
            // same verifier/atomic receipt, without bypassing an invalid ledger.
            this.ctx.storage.sql.exec(`UPDATE jobs SET state = 'pending', next_at = 0,
                response = NULL, http_status = NULL, progression_rechecked = 1
                WHERE state = 'review' AND progression_rechecked = 0 AND (
                    (game_id LIKE 'shadow-survival-character-v1-%' AND last_error IN
                        ('invalid shadow survival level', 'invalid shadow survival kill count',
                         'invalid shadow survival progress time', 'verified score exceeds allowed maximum'))
                    OR (game_id = 'cat-tower' AND last_error IN
                        ('invalid cat-tower combo count', 'cat-tower score exceeds allowed maximum', 'verified score exceeds allowed maximum'))
                    OR (game_id = 'blockpang' AND last_error IN
                        ('blockpang score exceeds allowed maximum', 'verified score exceeds allowed maximum'))
                    OR (game_id = 'jewelria' AND last_error IN
                        ('invalid jewelria combo count', 'jewelria score exceeds allowed maximum', 'verified score exceeds allowed maximum'))
                    OR (game_id = 'jelly-pang-2048' AND last_error IN
                        ('jelly-pang merge rank exceeds allowed maximum', 'jelly-pang score exceeds allowed maximum', 'verified score exceeds allowed maximum'))
                    OR (game_id = 'lumen-shift' AND last_error IN
                        ('invalid lumen shift level', 'invalid lumen shift combo count', 'invalid lumen shift zone line count',
                         'lumen shift score exceeds allowed maximum', 'verified score exceeds allowed maximum'))
                )`);
            for (let count = 0; count < 40; count += 1) {
                const row = this.ctx.storage.sql.exec(`SELECT j.* FROM jobs j
                    WHERE j.state = 'pending' AND j.next_at <= ?
                    AND (j.predecessor IS NULL OR EXISTS
                        (SELECT 1 FROM jobs p WHERE p.id = j.predecessor AND (p.state = 'done'
                            OR (j.path IN ('/rankings', '/school-zombie/profile/bank-run', '/score-events') AND j.game_id = 'school-zombie-defense'
                                AND p.state = 'review' AND ((j.path = '/rankings' AND p.path = '/school-zombie/profile/bank-run')
                                OR (p.path = '/score-events'
                                AND json_array_length(COALESCE(json_extract(p.payload, '$.events'), json_array(json_extract(p.payload, '$.event')))) > 0
                                AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(json_extract(p.payload, '$.events'), json_array(json_extract(p.payload, '$.event'))))
                                    WHERE COALESCE(json_extract(value, '$.type'), '') != 'run_progress')))))))
                    ORDER BY j.created_at, j.rowid LIMIT 1`, Date.now()).toArray()[0];
                if (!row) break;
                let result;
                try {
                    result = await executeRankingCommand(this.env.DB, {
                        id: row.id, path: row.path, body: JSON.parse(row.payload), hash: row.hash,
                    }, row.session_id, requestMeta);
                } catch (error) {
                    result = { status: 503, data: { error: 'ranking database temporarily unavailable' } };
                    console.error(JSON.stringify({ event: 'ranking_delivery_retry', request_id: row.id,
                        game_id: row.game_id, attempt: row.attempts + 1, error: String(error.message).slice(0, 200) }));
                }
                if (result.status === 200) {
                    if (row.path === '/rankings') {
                        try {
                            const position = await rankingPosition(this.env.DB, JSON.parse(row.payload));
                            if (position) Object.assign(result.data, position, { in_top_20: position.rank <= 20 });
                        } catch (_) {
                            // Rank display is optional; a read failure cannot undo a saved run.
                        }
                    }
                    this.ctx.storage.sql.exec(`UPDATE jobs SET state = 'done', response = ?, http_status = 200,
                        last_error = NULL WHERE id = ?`, JSON.stringify(result.data), row.id);
                } else {
                    const retryable = result.status >= 500 || [404, 408, 425, 429].includes(result.status)
                        || (row.path === BANK_RUN_PATH && result.data.error === 'verified run rewards unavailable')
                        || /sequence|does not match verified score/.test(result.data.error || '');
                    const delay = Math.min(300000, 1000 * 2 ** Math.min(row.attempts, 8));
                    this.ctx.storage.sql.exec(`UPDATE jobs SET state = ?, attempts = attempts + 1,
                        next_at = ?, last_error = ?, response = ?, http_status = ? WHERE id = ?`,
                    retryable ? 'pending' : 'review', Date.now() + delay,
                    result.data.error || '', retryable ? null : JSON.stringify(result.data),
                    retryable ? 202 : result.status, row.id);
                    if (!retryable) console.error(JSON.stringify({ event: 'ranking_delivery_review',
                        request_id: row.id, game_id: row.game_id, reason: result.data.error }));
                }
            }
        } catch (error) {
            console.error(JSON.stringify({ event: 'ranking_delivery_database_unavailable', error: String(error.message).slice(0, 200) }));
        }
        const pending = this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM jobs WHERE state = 'pending'").toArray()[0];
        const ready = this.ctx.storage.sql.exec(`SELECT MIN(j.next_at) AS next_at FROM jobs j WHERE j.state = 'pending'
            AND (j.predecessor IS NULL OR EXISTS (SELECT 1 FROM jobs p WHERE p.id = j.predecessor AND p.state = 'done'))`).toArray()[0];
        if (pending.count) await this.ctx.storage.setAlarm(ready.next_at === null ? Date.now() + 60000 : Math.max(Date.now() + 1000, Number(ready.next_at)));
        else await this.ctx.storage.deleteAlarm();
    }

    async alarm() {
        await this.exclusive(() => this.drain());
    }
}

export default {
    // Daily: delete water-sort runs that were started but never registered and are older than the grace period.
    async scheduled(_controller, env, ctx) {
        ctx.waitUntil(cleanupStaleRuns(env.DB).then(
            deleted => console.log(JSON.stringify({ event: 'water_sort_stale_cleanup', deleted })),
            error => console.error(JSON.stringify({ event: 'water_sort_stale_cleanup_failed', error: String(error?.message).slice(0, 200) }))));
    },

    async fetch(request, env, ctx) {
        const path = new URL(request.url).pathname;
        if (path === '/water-sort/challenge') return waterSortRoute(request, env.DB, env);
        if (request.method !== 'POST' || (!PATHS.has(path) && path !== '/ranking-delivery')) {
            return api.fetch(request, env, ctx);
        }
        try {
            const reader = request.body?.getReader();
            let size = 0;
            const chunks = [];
            if (!reader) return jsonResponse({ error: 'JSON body required' }, 400);
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_BODY_BYTES) { await reader.cancel(); return jsonResponse({ error: 'request too large' }, 413); }
                chunks.push(value);
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            const body = JSON.parse(new TextDecoder().decode(bytes));
            if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonResponse({ error: 'JSON object required' }, 400);
            const legacy = path !== '/ranking-delivery';
            const sessionId = legacy
                ? (path === '/score-sessions' ? crypto.randomUUID() : String(body.session_id || body.extra_data?.session_id || body.extra?.session_id || ''))
                : body.session_id;
            const gameId = body.game_id || (path === BANK_RUN_PATH ? 'school-zombie-defense' : null);
            const commands = legacy ? [{ id: crypto.randomUUID(), path, body: { ...body, game_id: gameId } }] : body.commands;
            if (typeof sessionId !== 'string' || !ID.test(sessionId) || !getProtectedGameKind(gameId) || !Array.isArray(commands)
                || !commands.length || commands.length > 20) return jsonResponse({ error: 'invalid delivery envelope' }, 400);
            for (const command of commands) {
                if (!command || typeof command !== 'object' || Array.isArray(command)
                    || typeof command.id !== 'string' || !ID.test(command.id) || !PATHS.has(command.path)
                    || !command.body || typeof command.body !== 'object' || Array.isArray(command.body) || command.body.game_id !== gameId
                    || (command.path === BANK_RUN_PATH && gameId !== 'school-zombie-defense')
                    || (command.after != null && (typeof command.after !== 'string' || !ID.test(command.after) || command.after === command.id))
                    || (command.body.session_id && command.body.session_id !== sessionId)) {
                    return jsonResponse({ error: 'invalid delivery command' }, 400);
                }
            }
            const requestMeta = {};
            for (const name of ['User-Agent', 'CF-Connecting-IP', 'Origin', 'Referer']) {
                const value = request.headers.get(name);
                if (value) requestMeta[name] = value;
            }
            const results = await env.RANKING_DELIVERY.getByName(sessionId).accept(sessionId, gameId, commands, requestMeta);
            if (legacy) return jsonResponse(results[0].data, results[0].status);
            return jsonResponse({ results });
        } catch (error) {
            if (error instanceof SyntaxError) return jsonResponse({ error: 'invalid JSON' }, 400);
            console.error(JSON.stringify({ event: 'ranking_delivery_unavailable', path, error: String(error.message).slice(0, 200) }));
            return jsonResponse({ error: 'ranking delivery temporarily unavailable', retryable: true }, 503);
        }
    },
};
