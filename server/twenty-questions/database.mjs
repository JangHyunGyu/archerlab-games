import { SCHEMA } from './schema.mjs';
import { SEED_CATALOG } from './seed-catalog.mjs';
import { normalize, fault } from './core.mjs';

const ready = new WeakMap();

export async function initialize(db) {
    if (!db) throw fault('service_unavailable', 503);
    if (!ready.has(db)) {
        const pending = (async () => {
            await db.batch(SCHEMA.map(sql => db.prepare(sql)));
            const seed = await db.prepare("SELECT value FROM tq_meta WHERE key = 'seed_version'").first();
            if (seed?.value === '20261028-v1') return;
            const now = Date.now();
            for (let offset = 0; offset < SEED_CATALOG.length; offset += 40) {
                await db.batch(SEED_CATALOG.slice(offset, offset + 40).map(answer => db.prepare(
                    'INSERT OR IGNORE INTO tq_catalog(id, ko_key, en_key, data, created_at) VALUES (?, ?, ?, ?, ?)'
                ).bind(answer.id, normalize(answer.ko), normalize(answer.en), JSON.stringify(answer), now)));
            }
            await db.prepare("INSERT INTO tq_meta(key, value) VALUES ('seed_version', '20261028-v1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
        })().catch(error => { ready.delete(db); throw error; });
        ready.set(db, pending);
    }
    return ready.get(db);
}

export async function limit(db, key, maximum, expiresAt) {
    const row = await db.prepare(`INSERT INTO tq_limits(key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`)
        .bind(key, expiresAt, maximum).first();
    if (!row) throw fault('rate_limited', 429, Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)));
}

export async function reserveBudget(db, env) {
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const maximum = Math.max(1, Math.min(1000000, Number(env.TQ_DAILY_CALL_LIMIT) || 20000));
    const row = await db.prepare(`INSERT INTO tq_budget(day, calls) VALUES (?, 1)
        ON CONFLICT(day) DO UPDATE SET calls = calls + 1 WHERE calls < ? RETURNING calls`)
        .bind(day, maximum).first();
    if (!row) throw fault('daily_limit', 503);
    return day;
}

export async function recordCost(db, day, cost) {
    if (Number.isFinite(cost) && cost > 0) await db.prepare('UPDATE tq_budget SET cost = cost + ? WHERE day = ?').bind(cost, day).run();
}
