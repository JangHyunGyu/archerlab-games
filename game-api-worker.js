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
                const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

                const result = await env.DB.prepare(
                    'SELECT player_name, score, extra_data, created_at FROM rankings WHERE game_id = ? ORDER BY score DESC LIMIT ?'
                ).bind(gameId, limit).all();

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

                // Insert the score
                await env.DB.prepare(
                    'INSERT INTO rankings (game_id, player_name, score, extra_data) VALUES (?, ?, ?, ?)'
                ).bind(game_id, name, numScore, extraStr).run();

                // Get current rank of this score
                const rankResult = await env.DB.prepare(
                    'SELECT COUNT(*) as rank FROM rankings WHERE game_id = ? AND score > ?'
                ).bind(game_id, numScore).first();

                const currentRank = (rankResult?.rank || 0) + 1;

                // Cleanup: keep only top 100 per game to prevent table bloat
                await env.DB.prepare(`
                    DELETE FROM rankings WHERE game_id = ? AND id NOT IN (
                        SELECT id FROM rankings WHERE game_id = ? ORDER BY score DESC LIMIT 100
                    )
                `).bind(game_id, game_id).run();

                return jsonResponse({
                    success: true,
                    rank: currentRank,
                    player_name: name,
                    score: numScore,
                    in_top_20: currentRank <= 20,
                });
            }

            return jsonResponse({ error: 'Not Found' }, 404);

        } catch (err) {
            return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
        }
    },
};
