export const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS tq_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tq_catalog (
        id TEXT PRIMARY KEY, ko_key TEXT NOT NULL UNIQUE, en_key TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tq_players (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0,
        streak_turns INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0,
        best_turns INTEGER NOT NULL DEFAULT 0, best_at INTEGER NOT NULL DEFAULT 0,
        active_game TEXT, last_seen INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tq_games (
        id TEXT PRIMARY KEY, player_id TEXT NOT NULL, concept_id TEXT NOT NULL,
        answer_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', used INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, requests_count INTEGER NOT NULL DEFAULT 0,
        rate_bucket INTEGER NOT NULL DEFAULT 0, rate_count INTEGER NOT NULL DEFAULT 0,
        fault_since INTEGER, record_improved INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS tq_one_active ON tq_games(player_id) WHERE status = 'active'`,
    `CREATE TABLE IF NOT EXISTS tq_seen (
        player_id TEXT NOT NULL, concept_id TEXT NOT NULL, first_game TEXT NOT NULL,
        created_at INTEGER NOT NULL, PRIMARY KEY(player_id, concept_id)
    )`,
    `CREATE TABLE IF NOT EXISTS tq_turns (
        game_id TEXT NOT NULL, request_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
        mode TEXT NOT NULL, input TEXT NOT NULL, normalized TEXT NOT NULL,
        code TEXT NOT NULL, decision TEXT, charged INTEGER NOT NULL, ordinal INTEGER NOT NULL,
        version INTEGER NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY(game_id, request_id)
    )`,
    `CREATE TABLE IF NOT EXISTS tq_requests (
        player_id TEXT NOT NULL, request_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
        game_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(player_id, request_id)
    )`,
    `CREATE TABLE IF NOT EXISTS tq_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tq_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS tq_generation (
        day TEXT PRIMARY KEY, status TEXT NOT NULL, owner TEXT, expires_at INTEGER,
        added INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS tq_leaderboard ON tq_players(best_streak DESC, best_turns ASC, best_at ASC, id ASC)`,
    `CREATE INDEX IF NOT EXISTS tq_player_games ON tq_games(player_id, created_at DESC)`,
];
