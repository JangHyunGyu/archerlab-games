/**
 * Game API Worker - 게임 랭킹 (명예의 전당) API
 * Cloudflare Worker + D1 Database
 *
 * D1 바인딩 이름: DB (archerlab_db)
 *
 * === D1 테이블 생성 SQL ===
 * CREATE TABLE IF NOT EXISTS rankings (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   game_id TEXT NOT NULL,
 *   player_name TEXT NOT NULL,
 *   score INTEGER NOT NULL,
 *   extra_data TEXT,
 *   created_at TEXT DEFAULT (datetime('now')),
 *   UNIQUE(game_id, player_name, score)
 * );
 * CREATE INDEX IF NOT EXISTS idx_rankings_game_score ON rankings(game_id, score DESC);
 * ===========================
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}

function clampLimit(rawLimit) {
    const parsed = parseInt(rawLimit || '20', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.min(parsed, 100);
}

async function initDB(db) {
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS rankings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            player_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            extra_data TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `).run();
    await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_rankings_game_score ON rankings(game_id, score DESC)
    `).run();
}

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // Health check
        if (path === '/' && request.method === 'GET') {
            return jsonResponse({
                service: 'game-api',
                version: '1.0.0',
                status: 'ok',
            });
        }

        try {
            // Auto-init DB table
            await initDB(env.DB);

            // GET /rankings?game_id=blockpang&limit=20
            if (path === '/rankings' && request.method === 'GET') {
                const gameId = url.searchParams.get('game_id');
                if (!gameId) {
                    return jsonResponse({ error: 'game_id is required' }, 400);
                }
                const limit = clampLimit(url.searchParams.get('limit'));

                const result = await env.DB.prepare(`
                    SELECT player_name, score, extra_data, created_at
                    FROM (
                        SELECT
                            player_name,
                            score,
                            extra_data,
                            created_at,
                            ROW_NUMBER() OVER (
                                PARTITION BY LOWER(TRIM(player_name))
                                ORDER BY score DESC, created_at ASC, id ASC
                            ) AS name_rank
                        FROM rankings
                        WHERE game_id = ?
                    )
                    WHERE name_rank = 1
                    ORDER BY score DESC, created_at ASC
                    LIMIT ?
                `).bind(gameId, limit).all();

                return jsonResponse({
                    game_id: gameId,
                    rankings: result.results.map((row, i) => ({
                        rank: i + 1,
                        player_name: row.player_name,
                        score: row.score,
                        extra_data: row.extra_data ? JSON.parse(row.extra_data) : null,
                        created_at: row.created_at,
                    })),
                });
            }

            // POST /rankings  { game_id, player_name, score, extra_data? }
            if (path === '/rankings' && request.method === 'POST') {
                const body = await request.json();
                const { game_id, player_name, score, extra_data } = body;

                if (!game_id || !player_name || score === undefined || score === null) {
                    return jsonResponse({ error: 'game_id, player_name, score are required' }, 400);
                }

                // Validate player_name: max 20 chars
                const name = String(player_name).trim().slice(0, 20);
                if (name.length === 0) {
                    return jsonResponse({ error: 'player_name cannot be empty' }, 400);
                }

                const numScore = parseInt(score, 10);
                if (isNaN(numScore) || numScore < 0) {
                    return jsonResponse({ error: 'score must be a non-negative number' }, 400);
                }

                const extraStr = extra_data ? JSON.stringify(extra_data) : null;

                // Insert the score. Exact duplicate records may be ignored when the DB has a uniqueness constraint.
                await env.DB.prepare(
                    'INSERT OR IGNORE INTO rankings (game_id, player_name, score, extra_data) VALUES (?, ?, ?, ?)'
                ).bind(game_id, name, numScore, extraStr).run();

                // Get the displayed rank for this name after deduping by player name.
                const rankResult = await env.DB.prepare(`
                    WITH ranked_by_name AS (
                        SELECT
                            LOWER(TRIM(player_name)) AS name_key,
                            score,
                            ROW_NUMBER() OVER (
                                PARTITION BY LOWER(TRIM(player_name))
                                ORDER BY score DESC, created_at ASC, id ASC
                            ) AS name_rank
                        FROM rankings
                        WHERE game_id = ?
                    ),
                    best_scores AS (
                        SELECT name_key, score
                        FROM ranked_by_name
                        WHERE name_rank = 1
                    ),
                    current_player AS (
                        SELECT score
                        FROM best_scores
                        WHERE name_key = LOWER(TRIM(?))
                        LIMIT 1
                    )
                    SELECT
                        (SELECT score FROM current_player) AS best_score,
                        (
                            SELECT COUNT(*) + 1
                            FROM best_scores
                            WHERE score > (SELECT score FROM current_player)
                        ) AS rank
                `).bind(game_id, name).first();

                const currentRank = rankResult?.rank || 1;
                const bestScore = rankResult?.best_score ?? numScore;

                // Cleanup: keep only the top 100 unique names per game to prevent table bloat.
                await env.DB.prepare(`
                    DELETE FROM rankings WHERE game_id = ? AND id NOT IN (
                        SELECT id
                        FROM (
                            SELECT
                                id,
                                score,
                                created_at,
                                ROW_NUMBER() OVER (
                                    PARTITION BY LOWER(TRIM(player_name))
                                    ORDER BY score DESC, created_at ASC, id ASC
                                ) AS name_rank
                            FROM rankings
                            WHERE game_id = ?
                        )
                        WHERE name_rank = 1
                        ORDER BY score DESC, created_at ASC, id ASC
                        LIMIT 100
                    )
                `).bind(game_id, game_id).run();

                return jsonResponse({
                    success: true,
                    rank: currentRank,
                    player_name: name,
                    score: numScore,
                    best_score: bestScore,
                    in_top_20: currentRank <= 20,
                });
            }

            return jsonResponse({ error: 'Not Found' }, 404);

        } catch (err) {
            return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
        }
    },
};
