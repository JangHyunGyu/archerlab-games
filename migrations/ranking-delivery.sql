-- Additive migration only: retain existing rankings and playable sessions.
CREATE TABLE IF NOT EXISTS ranking_delivery_receipts (
    request_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ranking_submissions (
    session_id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    extra_data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO ranking_submissions (session_id, game_id, player_name, score, extra_data, created_at)
SELECT session_id, game_id, player_name, score, extra_data, created_at
FROM (
    SELECT json_extract(extra_data, '$.session_id') AS session_id,
        game_id, player_name, score, extra_data, created_at,
        ROW_NUMBER() OVER (PARTITION BY json_extract(extra_data, '$.session_id') ORDER BY created_at, id) AS session_rank
    FROM rankings
    WHERE json_valid(extra_data)
        AND json_type(extra_data, '$.session_id') = 'text'
        AND LENGTH(TRIM(json_extract(extra_data, '$.session_id'))) > 0
) WHERE session_rank = 1;
