import { DatabaseSync } from 'node:sqlite';
import { handleRoomRequest } from '../../server/twenty-questions/service.mjs';

export function database() {
    const sqlite = new DatabaseSync(':memory:');
    const db = {
        sqlite,
        prepare(sql) {
            function bound(values = []) {
                const statement = () => sqlite.prepare(sql);
                return {
                    bind: (...args) => bound(args),
                    first: async () => statement().get(...values) || null,
                    all: async () => ({ results: statement().all(...values) }),
                    run: async () => ({ meta: { changes: Number(statement().run(...values).changes) }, success: true }),
                };
            }
            return bound();
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
            catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        },
    };
    return db;
}

export function modelResult(code = 'yes') {
    const kind = code === 'multiple' ? 'multiple' : 'single';
    return { answers: {
        question_kind: { type: 'choice', choice: kind, probabilities: { [kind]: 0.99 } },
        supported_by_facts: { type: 'noul', noul: code === 'unknown' ? 0.2 : 0.99 },
        answer_yes: { type: 'noul', noul: code === 'no' ? 0.01 : 0.99 },
    }, usage: { cost: 0.00002 } };
}

export function harness() {
    const db = database(); let calls = 0;
    const env = { DB: db, TQ_AI: { async decide({ state }) {
        calls++;
        const input = state.player_question || '';
        if (input.includes('outage')) throw new Error('Provider error');
        return modelResult(input.includes('multiple') ? 'multiple' : input.includes('unknown') ? 'unknown' : input.includes('no') ? 'no' : 'yes');
    } } };
    const queues = new Map();
    async function fetch(request) {
        const key = request.headers.get('Authorization') || '';
        const next = (queues.get(key) || Promise.resolve()).then(() => handleRoomRequest(request, env));
        queues.set(key, next.catch(() => {}));
        return next;
    }
    const token = 'a'.repeat(64);
    async function call(path, body, method = body ? 'POST' : 'GET', secret = token) {
        const result = await fetch(new Request('https://api/twenty-questions/' + path, {
            method, headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }));
        return { status: result.status, data: await result.json() };
    }
    async function start(secret = token) { return (await call('games', { locale: 'ko', requestId: crypto.randomUUID() }, 'POST', secret)).data; }
    function answer(gameId) { return JSON.parse(sqliteRow('SELECT answer_json FROM tq_games WHERE id = ?', gameId).answer_json); }
    function sqliteRow(query, ...values) { return db.sqlite.prepare(query).get(...values); }
    async function turn(game, text, mode = 'questions', requestId = crypto.randomUUID(), secret = token) {
        return call(`games/${game.id}/${mode}`, { text, expectedVersion: game.version, requestId }, 'POST', secret);
    }
    return { db, env, fetch, call, start, turn, answer, row: sqliteRow, get calls() { return calls; } };
}
