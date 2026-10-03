import { hasBannedWord } from '../lib/nickname.ts';
import type { RankRow } from '../lib/challenge-rules.ts';

// The board query scans every run's JSON, and every open ranking dialog repeats it. A short TTL
// answers repeat views from memory (per Worker isolate) and, where the Cache API is available
// (custom domains; it is a no-op on *.workers.dev), from the colo cache. Registration invalidates
// this isolate immediately; other isolates catch up within the TTL.
export const LEADERBOARD_TTL_MS = 15_000;
const CACHE_URL = 'https://water-sort.cache.internal/leaderboard';
let memory: { at: number; rows: RankRow[] } | null = null;
export function invalidateLeaderboard() { memory = null; }

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
  // One name keeps a single record: more clears, then higher score, then the earlier start.
  // Letter case and surrounding spaces are the same name. Lower scores stay stored, but the board shows only the best.
  // Extra rows are read so that hiding a name that no longer passes the nickname filter still leaves 50.
  const result = await db.prepare(`SELECT id, nickname, cleared, score, created_at FROM (
    SELECT id, nickname, cleared, score, created_at,
      ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(nickname)) ORDER BY cleared DESC, score DESC, created_at ASC, id ASC) AS name_rank
    FROM water_sort_runs WHERE nickname IS NOT NULL AND json_extract(data, '$.rules') = 2
  ) WHERE name_rank = 1 ORDER BY cleared DESC, score DESC, created_at ASC, id ASC LIMIT 80`).all<RankRow>();
  return result.results.filter(row => !hasBannedWord(row.nickname)).slice(0, 50);
}

export async function leaderboard(db: D1Database, now = Date.now(), ttlMs = LEADERBOARD_TTL_MS): Promise<RankRow[]> {
  if (memory && now - memory.at < ttlMs && now >= memory.at) return memory.rows;
  const edge = await readEdge();
  if (edge) { memory = { at: now, rows: edge }; return edge; }
  const rows = await queryBoard(db);
  memory = { at: now, rows };
  await writeEdge(rows, ttlMs);
  return rows;
}
