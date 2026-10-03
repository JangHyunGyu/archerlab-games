-- Adds the hashed client key used to rate limit run starts. Run exactly once per database:
-- SQLite has no ADD COLUMN IF NOT EXISTS, so a second run fails harmlessly on "duplicate column name".
--   npx wrangler d1 execute archerlab_db --remote --file migrations/water-sort-0002-start-rate-limit.sql --config wrangler.game-api.toml
-- Apply this BEFORE deploying the Worker that reads ip_hash.
ALTER TABLE water_sort_runs ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS water_sort_start_rate ON water_sort_runs(ip_hash, created_at);
