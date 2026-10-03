-- 보글보글 실험실(Bubbly Lab) ranking runs. One-time DDL: the Worker never creates or alters tables.
-- Idempotent; safe on the production database, where this table already exists.
--   npx wrangler d1 execute archerlab_db --remote --file migrations/water-sort-0001-schema.sql --config wrangler.game-api.toml
CREATE TABLE IF NOT EXISTS water_sort_runs (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    nickname TEXT,
    cleared INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS water_sort_ranking ON water_sort_runs(cleared, score);
