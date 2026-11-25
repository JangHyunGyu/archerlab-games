import { SCHEMA_TABLES, SCHEMA_INDEXES } from './schema.mjs';
import { fault } from './core.mjs';

export const SCHEMA_VERSION = 'semantle-20261125-v7';

const ready = new WeakMap();
const rateBucketsByDb = new WeakMap();
const fallbackBuckets = new Map();

function bucketsFor(db) {
    if (!db || typeof db !== 'object') return fallbackBuckets;
    let map = rateBucketsByDb.get(db);
    if (!map) {
        map = new Map();
        rateBucketsByDb.set(db, map);
    }
    return map;
}

async function ensureColumns(db, table, additions) {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all();
    const existing = new Set((info?.results || []).map(row => row.name));
    for (const [column, definition] of additions) {
        if (existing.has(column)) continue;
        try {
            await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
        } catch (error) {
            // 배포 직후 여러 아이솔레이트가 동시에 마이그레이션하면 다른 쪽이 컬럼을 먼저 추가했을 수 있다
            if (!/duplicate column/i.test(String(error?.message || error))) throw error;
        }
    }
}

// D1 시맨틀 테이블·컬럼·인덱스를 안전하게 초기화 및 마이그레이션 (이미 최신 버전이면 1회 조회로 즉시 통과)
export async function initialize(db) {
    if (!db) throw fault('service_unavailable', 503);
    if (!ready.has(db)) {
        const pending = (async () => {
            const meta = await db.prepare("SELECT value FROM sm_meta WHERE key = 'schema_version'").first().catch(() => null);
            if (meta?.value === SCHEMA_VERSION) return;
            await db.batch(SCHEMA_TABLES.map(sql => db.prepare(sql)));
            await ensureColumns(db, 'sm_rounds', [
                ['lang', "TEXT NOT NULL DEFAULT 'ko'"],
                ['data_pack', 'TEXT'],
            ]);
            await ensureColumns(db, 'sm_players', [
                ['lang', "TEXT NOT NULL DEFAULT 'ko'"],
                ['name_key', 'TEXT'],
                ['best_time_ms', 'INTEGER'],
                ['best_time_guesses', 'INTEGER'],
                ['sync_wins', 'INTEGER NOT NULL DEFAULT 0'],
                ['sync_streak', 'INTEGER NOT NULL DEFAULT 0'],
                ['sync_best_streak', 'INTEGER NOT NULL DEFAULT 0'],
                ['sync_best_time_ms', 'INTEGER'],
                ['sync_best_time_guesses', 'INTEGER'],
                ['sync_best_at', 'INTEGER NOT NULL DEFAULT 0'],
                ['last_won_round_no', 'INTEGER'],
            ]);
            await ensureColumns(db, 'sm_games', [
                ['lang', "TEXT NOT NULL DEFAULT 'ko'"],
                ['round_id', 'TEXT'],
                ['sim_scale', 'INTEGER NOT NULL DEFAULT 10000'],
                ['solved_at', 'INTEGER'],
                ['ranked', 'INTEGER NOT NULL DEFAULT 0'],
                ['unranked_reason', 'TEXT'],
            ]);
            await db.batch([
                db.prepare('DROP INDEX IF EXISTS sm_player_name_unique'),
                db.prepare('DROP INDEX IF EXISTS sm_player_lang_name_unique'),
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

// DO/워커 메모리 슬라이딩 버킷으로 레이트 리미트를 즉시 판정해 추측당 D1 왕복 제거
export async function limit(db, key, maximum, expiresAt, now = Date.now()) {
    const map = bucketsFor(db);
    if (map.size > 5000) {
        for (const [k, entry] of map) {
            if (entry.expiresAt <= now) map.delete(k);
        }
    }
    const existing = map.get(key);
    if (!existing || existing.expiresAt <= now) {
        map.set(key, { count: 1, expiresAt });
        return;
    }
    if (existing.count >= maximum) {
        throw fault('rate_limited', 429, Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)));
    }
    existing.count += 1;
}

export async function cleanExpiredRecords(db, now = Date.now()) {
    const cutoff = now - 30 * 86400000;
    const logCutoff = now - 60 * 86400000;
    await db.batch([
        db.prepare('DELETE FROM sm_limits WHERE expires_at <= ?').bind(now),
        db.prepare("DELETE FROM sm_guesses WHERE game_id IN (SELECT id FROM sm_games WHERE status != 'active' AND NOT (status = 'won' AND ranked = 1) AND updated_at < ?)").bind(cutoff),
        db.prepare('DELETE FROM sm_requests WHERE created_at < ?').bind(cutoff),
        db.prepare("DELETE FROM sm_games WHERE status != 'active' AND NOT (status = 'won' AND ranked = 1) AND updated_at < ?").bind(cutoff),
        db.prepare('DELETE FROM sm_logs WHERE created_at < ?').bind(logCutoff),
    ]);
}
