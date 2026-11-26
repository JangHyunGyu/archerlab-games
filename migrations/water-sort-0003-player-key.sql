-- Adds hashed device identity key to water_sort_runs so same-device nickname changes rename prior records while keeping the best clear/score.
-- Run once before deploying the Worker:
--   npx wrangler d1 execute archerlab_db --remote --file migrations/water-sort-0003-player-key.sql --config wrangler.game-api.toml
ALTER TABLE water_sort_runs ADD COLUMN player_key TEXT;
CREATE INDEX IF NOT EXISTS water_sort_player_key ON water_sort_runs(player_key) WHERE player_key IS NOT NULL;
