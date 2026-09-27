import { advance, expire, newStage, resumeStage, leaveStage, type Challenge, type RunView } from '../lib/challenge.ts';
type Row = { id: string; token: string; data: string; version: number; nickname: string | null; created_at: number };
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const fields: Record<string, string[]> = { start: ['type', 'id', 'token', 'version'], sync: ['type', 'id', 'token', 'version'], leave: ['type', 'id', 'token', 'version'], resume: ['type', 'id', 'token', 'version'], pour: ['type', 'id', 'token', 'version', 'from', 'to'], register: ['type', 'id', 'token', 'version', 'nickname'] };
function validPayload(body: unknown): body is Record<string, unknown> & { type: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  if (typeof value.type !== 'string' || !Object.hasOwn(fields, value.type)) return false;
  if (Object.keys(value).some(key => !fields[value.type as string].includes(key))) return false;
  if (value.type !== 'start' && (typeof value.id !== 'string' || !UUID.test(value.id) || typeof value.token !== 'string' || !UUID.test(value.token))) return false;
  if ((['pour', 'leave', 'resume', 'register'].includes(value.type) || value.version !== undefined) && (!Number.isSafeInteger(value.version) || Number(value.version) < 0)) return false;
  return value.type !== 'pour' || [value.from, value.to].every(n => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 10);
}
function validResult(state: Challenge, createdAt: number, now: number) {
  return state.status === 'ended' && Number.isInteger(state.level) && state.level >= 1 && state.level <= 100
    && Number.isInteger(state.cleared) && (state.cleared === state.level - 1 || state.level === 100 && state.cleared === 100)
    && Number.isSafeInteger(state.score) && state.score >= state.cleared * 1000 && state.score <= state.cleared * 1300
    && now >= state.availableAt && (state.cleared === 100 || now >= state.deadline)
    && now - createdAt >= state.cleared * 1150;
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function database(db: D1Database) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS water_sort_runs (id TEXT PRIMARY KEY, token TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, nickname TEXT, cleared INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS water_sort_ranking ON water_sort_runs(cleared, score)'),
  ]);
  return db;
}
function view(row: Row, now: number): RunView {
  const { history, initialBoard: _initialBoard, ...state } = JSON.parse(row.data) as Challenge;
  return { ...state, id: row.id, version: row.version, historyDepth: history.length, registered: row.nickname !== null, nickname: row.nickname, serverNow: now };
}
export async function challengeApi(request: Request, binding: D1Database, allowedOrigins: readonly string[] = []): Promise<Response> {
  try {
    const db = await database(binding);
    if (request.method === 'GET') {
      const result = await db.prepare("SELECT id, nickname, cleared, score, created_at FROM water_sort_runs WHERE nickname IS NOT NULL AND json_extract(data, '$.rules') = 2 ORDER BY cleared DESC, score DESC, created_at ASC, id ASC LIMIT 50").all();
      return json({ rows: result.results });
    }
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin && !allowedOrigins.includes(origin)) return json({ error: 'origin' }, 403);
    if (request.headers.get('sec-fetch-site') === 'cross-site' && (!origin || !allowedOrigins.includes(origin))) return json({ error: 'origin' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'type' }, 415);
    // Bound input even when Content-Length is absent or inaccurate.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'body' }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 1024) { await reader.cancel(); return json({ error: 'size' }, 413); } chunks.push(part.value); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'body' }, 400); }
    if (!validPayload(parsed)) return json({ error: 'body' }, 400);
    const body = parsed;
    if (body.type === 'start') {
      const now = Date.now();
      const id = crypto.randomUUID(), token = crypto.randomUUID();
      const data = JSON.stringify(newStage(1, now));
      await db.prepare('INSERT INTO water_sort_runs (id, token, data, created_at) VALUES (?, ?, ?, ?)').bind(id, token, data, now).run();
      return json({ run: view({ id, token, data, version: 0, nickname: null, created_at: now }, now), token });
    }
    if (typeof body.id !== 'string' || typeof body.token !== 'string') return json({ error: 'credentials' }, 400);
    let row = await db.prepare('SELECT * FROM water_sort_runs WHERE id = ? AND token = ?').bind(body.id, body.token).first<Row>();
    if (!row) return json({ error: 'missing' }, 404);
    const now = Date.now(); // Read time after database I/O, never from the client.
    const before = JSON.parse(row.data) as Challenge;
    if (before.rules !== 2) return json({ error: 'legacy' }, 409);
    let state = expire(before, now), nickname = row.nickname;
    const matches = body.version === row.version;
    if (body.type === 'register') {
      if (state.status !== 'ended') return json({ error: 'unfinished' }, 409);
      if (typeof body.nickname !== 'string' || !/^[\p{L}\p{N} _.-]{1,16}$/u.test(body.nickname.trim())) return json({ error: 'nickname' }, 400);
      if (row.nickname !== null) return row.nickname === body.nickname.trim() ? json({ run: view(row, now) }) : json({ error: 'registered', run: view(row, now) }, 409);
      if (!matches) return json({ error: 'conflict', run: view(row, now) }, 409);
      if (!validResult(state, row.created_at, now)) return json({ error: 'integrity' }, 409);
      nickname ??= body.nickname.trim();
    } else if (body.type === 'sync') {
      // Expiration is evaluated against the server clock on reload and retry.
    } else if (body.type === 'resume' || body.type === 'leave') {
      if (!matches) return json({ error: 'conflict', run: view(row, now) }, 409);
      if (row.nickname !== null) return json({ error: 'registered', run: view(row, now) }, 409);
      state = body.type === 'resume' ? resumeStage(before, now) : leaveStage(before, now);
    } else if (body.type === 'pour') {
      if (!matches) return json({ error: 'conflict', run: view(row, now) }, 409);
      if (row.nickname !== null) return json({ error: 'registered', run: view(row, now) }, 409);
      state = advance(before, { type: 'pour', from: Number(body.from), to: Number(body.to) }, now);
    } else return json({ error: 'action' }, 400);
    if (state !== before || nickname !== row.nickname) {
      const update = await db.prepare('UPDATE water_sort_runs SET data = ?, version = version + 1, nickname = ?, cleared = ?, score = ? WHERE id = ? AND version = ? AND nickname IS NULL')
        .bind(JSON.stringify(state), nickname, state.cleared, state.score, row.id, row.version).run();
      row = (await db.prepare('SELECT * FROM water_sort_runs WHERE id = ? AND token = ?').bind(body.id, body.token).first<Row>())!;
      if (!update.meta.changes) return json({ error: 'conflict', run: view(row, Date.now()) }, 409);
    }
    return json({ run: view(row, Date.now()) });
  } catch (error) {
    console.error('challenge_api_failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'unavailable' }, 503);
  }
}
