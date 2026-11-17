import { SCHEMA_TABLES, SCHEMA_INDEXES } from './schema.mjs';
import { fault } from './core.mjs';

export const SCHEMA_VERSION = 'semantle-20261117-v2';

const ready = new WeakMap();

async function ensureColumns(db, table, additions) {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all();
    const existing = new Set((info?.results || []).map(row => row.name));
    const statements = [];
    for (const [column, definition] of additions) {
        if (!existing.has(column)) {
            statements.push(db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`));
        }
    }
    if (statements.length) await db.batch(statements);
}

// D1 시맨틀 테이블·컬럼·인덱스를 안전하게 초기화 및 마이그레이션
export async function initialize(db) {
    if (!db) throw fault('service_unavailable', 503);
    if (!ready.has(db)) {
        const pending = (async () => {
            await db.batch(SCHEMA_TABLES.map(sql => db.prepare(sql)));
            await ensureColumns(db, 'sm_players', [
                ['name_key', 'TEXT'],
                ['best_time_ms', 'INTEGER'],
                ['best_time_guesses', 'INTEGER'],
            ]);
            await ensureColumns(db, 'sm_games', [
                ['sim_scale', 'INTEGER NOT NULL DEFAULT 10000'],
                ['ranked', 'INTEGER NOT NULL DEFAULT 0'],
                ['unranked_reason', 'TEXT'],
            ]);
            await db.batch([
                ...SCHEMA_INDEXES.map(sql => db.prepare(sql)),
                db.prepare("INSERT INTO sm_meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
                    .bind(SCHEMA_VERSION),
            ]);
        })().catch(error => {
            ready.delete(db);
            throw error;
        });
        ready.set(db, pending);
    }
    return ready.get(db);
}

export async function limit(db, key, maximum, expiresAt) {
    const now = Date.now();
    const row = await db.prepare(`INSERT INTO sm_limits(key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN sm_limits.expires_at <= ? THEN 1 ELSE sm_limits.count + 1 END,
            expires_at = CASE WHEN sm_limits.expires_at <= ? THEN excluded.expires_at ELSE sm_limits.expires_at END
        WHERE sm_limits.expires_at <= ? OR sm_limits.count < ?
        RETURNING count`)
        .bind(key, expiresAt, now, now, now, maximum).first();
    if (!row) throw fault('rate_limited', 429, Math.max(1, Math.ceil((expiresAt - now) / 1000)));
}

export async function cleanExpiredRecords(db, now = Date.now()) {
    const cutoff = now - 30 * 86400000;
    const logCutoff = now - 60 * 86400000;
    await db.batch([
        db.prepare('DELETE FROM sm_limits WHERE expires_at <= ?').bind(now),
        db.prepare("DELETE FROM sm_guesses WHERE game_id IN (SELECT id FROM sm_games WHERE status != 'active' AND updated_at < ?)").bind(cutoff),
        db.prepare('DELETE FROM sm_requests WHERE created_at < ?').bind(cutoff),
        db.prepare("DELETE FROM sm_games WHERE status != 'active' AND updated_at < ?").bind(cutoff),
        db.prepare('DELETE FROM sm_logs WHERE created_at < ?').bind(logCutoff),
    ]);
}
