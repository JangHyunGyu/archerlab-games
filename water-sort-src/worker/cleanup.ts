// Stale-run cleanup. Only runs that were started but never registered to the ranking are removed;
// registered rows (the leaderboard) and every other table are never touched.
export const STALE_RUN_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const STALE_CLEANUP_BATCH = 500;
export const STALE_WHERE = 'nickname IS NULL AND created_at < ?';

export async function cleanupStaleRuns(db: D1Database, now = Date.now(), maxAgeMs = STALE_RUN_AGE_MS, limit = STALE_CLEANUP_BATCH): Promise<number> {
  const result = await db.prepare(`DELETE FROM water_sort_runs WHERE id IN (SELECT id FROM water_sort_runs WHERE ${STALE_WHERE} LIMIT ?)`)
    .bind(now - maxAgeMs, limit).run();
  return Number(result.meta.changes ?? 0);
}
