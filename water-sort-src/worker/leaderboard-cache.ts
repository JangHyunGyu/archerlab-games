import type { RankRow } from '../lib/challenge-rules.ts';

// The board query scans every run's JSON, and every open ranking dialog repeats it. A short TTL
// answers repeat views from memory (per Worker isolate) and, where the Cache API is available
// (custom domains; it is a no-op on *.workers.dev), from the colo cache. Registration invalidates
// this isolate immediately; other isolates catch up within the TTL.
export const LEADERBOARD_TTL_MS = 15_000;
const LEADERBOARD_STALE_MAX_MS = 10 * 60_000;
const CACHE_URL = 'https://water-sort.cache.internal/leaderboard';
let memory: { at: number; rows: RankRow[] } | null = null;
export function invalidateLeaderboard() { memory = null; }

function isTransientD1Error(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || '');
  return /D1_ERROR|overloaded|CPU time limit|reset|temporarily unavailable|internal error|network|timeout|SQLITE_BUSY|DB offline/i.test(msg);
}

async function readEdge(): Promise<RankRow[] | null> {
  try {
    const hit = await (globalThis as { caches?: { default?: Cache } }).caches?.default?.match(CACHE_URL);
    return hit ? (await hit.json() as { rows: RankRow[] }).rows : null;
  } catch { return null; }
}
async function writeEdge(rows: RankRow[], ttlMs: number) {
  try {
    await (globalThis as { caches?: { default?: Cache } }).caches?.default?.put(CACHE_URL, new Response(JSON.stringify({ rows }), { headers: { 'Cache-Control': `public, max-age=${Math.max(1, Math.round(ttlMs / 1000))}` } }));
  } catch { /* Cache is an optimization only. */ }
}
export async function clearEdgeLeaderboard() {
  try { await (globalThis as { caches?: { default?: Cache } }).caches?.default?.delete(CACHE_URL); } catch { /* Same. */ }
}

async function queryBoard(db: D1Database): Promise<RankRow[]> {
  // One device (player_key) and one nickname each keep a single best record; same-device renames carry the prior highest score to the latest nickname.
  const result = await db.prepare(`WITH per_player AS (
    SELECT id, nickname, cleared, score, created_at,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(player_key, 'n:' || LOWER(TRIM(nickname))) ORDER BY cleared DESC, score DESC, created_at ASC, id ASC) AS player_rank
    FROM water_sort_runs WHERE nickname IS NOT NULL AND json_extract(data, '$.rules') = 2
  ),
  per_name AS (
    SELECT id, nickname, cleared, score, created_at,
      ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(nickname)) ORDER BY cleared DESC, score DESC, created_at ASC, id ASC) AS name_rank
    FROM per_player WHERE player_rank = 1
  )
  SELECT id, nickname, cleared, score, created_at FROM per_name WHERE name_rank = 1 ORDER BY cleared DESC, score DESC, created_at ASC, id ASC LIMIT 50`).all<RankRow>();
  return result.results;
}

export async function leaderboard(db: D1Database, now = Date.now(), ttlMs = LEADERBOARD_TTL_MS): Promise<RankRow[]> {
  if (memory && now - memory.at < ttlMs && now >= memory.at) return memory.rows;
  if (ttlMs > 0) {
    const edge = await readEdge();
    if (edge) { memory = { at: now, rows: edge }; return edge; }
  }
  try {
    let rows: RankRow[];
    try {
      rows = await queryBoard(db);
    } catch (err) {
      if (!isTransientD1Error(err)) throw err;
      await new Promise(resolve => setTimeout(resolve, 200));
      rows = await queryBoard(db);
    }
    memory = { at: now, rows };
    await writeEdge(rows, ttlMs);
    return rows;
  } catch (err) {
    if (memory && now >= memory.at && (now - memory.at) <= LEADERBOARD_STALE_MAX_MS) {
      console.warn(JSON.stringify({ event: 'water_sort_leaderboard_stale_fallback', error: String(err instanceof Error ? err.message : err).slice(0, 200) }));
      return memory.rows;
    }
    throw err;
  }
}
