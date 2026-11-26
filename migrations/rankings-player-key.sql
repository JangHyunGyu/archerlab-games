-- Adds hashed device identity key to rankings so same-device nickname changes rename prior records while keeping the highest score.
-- Run once before deploying the Worker:
--   npx wrangler d1 execute archerlab_db --remote --file migrations/rankings-player-key.sql --config wrangler.game-api.toml
ALTER TABLE rankings ADD COLUMN player_key TEXT;
CREATE INDEX IF NOT EXISTS idx_rankings_game_player_key ON rankings(game_id, player_key) WHERE player_key IS NOT NULL;
