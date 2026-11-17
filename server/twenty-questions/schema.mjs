export const SCHEMA_TABLES = [
    `CREATE TABLE IF NOT EXISTS sm_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sm_players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT,
        games_played INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        give_ups INTEGER NOT NULL DEFAULT 0,
        total_guesses INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        streak_guesses INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        best_guesses INTEGER NOT NULL DEFAULT 0,
        best_time_ms INTEGER,
        best_time_guesses INTEGER,
        best_at INTEGER NOT NULL DEFAULT 0,
        active_game TEXT,
        last_seen INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sm_games (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        case_no INTEGER NOT NULL,
        secret_id INTEGER NOT NULL,
        answer_word TEXT NOT NULL,
        sim_scale INTEGER NOT NULL DEFAULT 10000,
        top1 INTEGER NOT NULL,
        top10 INTEGER NOT NULL,
        top1000 INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        guess_count INTEGER NOT NULL DEFAULT 0,
        best_sim INTEGER NOT NULL DEFAULT -10000,
        best_rank INTEGER,
        version INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        solved_ms INTEGER,
        ranked INTEGER NOT NULL DEFAULT 0,
        unranked_reason TEXT,
        record_improved INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS sm_seen (
        player_id TEXT NOT NULL,
        secret_id INTEGER NOT NULL,
        first_game TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(player_id, secret_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sm_guesses (
        game_id TEXT NOT NULL,
        word TEXT NOT NULL,
        request_id TEXT NOT NULL,
        guess_no INTEGER NOT NULL,
        similarity INTEGER NOT NULL,
        rank INTEGER,
        version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(game_id, word),
        UNIQUE(game_id, request_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sm_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        secret_id INTEGER NOT NULL,
        answer_word TEXT NOT NULL,
        action TEXT NOT NULL,
        guess_word TEXT NOT NULL,
        similarity REAL,
        rank INTEGER,
        guess_no INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        UNIQUE(game_id, request_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sm_requests (
        player_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        game_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(player_id, request_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sm_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    )`,
];

export const SCHEMA_INDEXES = [
    `CREATE UNIQUE INDEX IF NOT EXISTS sm_one_active ON sm_games(player_id) WHERE status = 'active'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS sm_player_name_unique ON sm_players(name_key) WHERE name_key IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS sm_leaderboard_time ON sm_players(best_time_ms ASC, best_time_guesses ASC, best_at ASC, id ASC)`,
    `CREATE INDEX IF NOT EXISTS sm_guesses_order ON sm_guesses(game_id, guess_no ASC)`,
    `CREATE INDEX IF NOT EXISTS sm_games_player ON sm_games(player_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS sm_logs_created_at ON sm_logs(created_at DESC)`,
];

export const SCHEMA = [...SCHEMA_TABLES, ...SCHEMA_INDEXES];
