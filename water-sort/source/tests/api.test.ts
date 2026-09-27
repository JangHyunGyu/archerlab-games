import assert from 'node:assert/strict';
import test from 'node:test';
import { solve, pour } from '../lib/game.ts';
import type { RunView } from '../lib/challenge.ts';
const base = process.env.TEST_URL || 'http://127.0.0.1:8787/';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(base)) throw new Error('API writes are local-test only');
async function request(body: object) {
  const response = await fetch(new URL('/water-sort/challenge', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json() as { run: RunView; token: string } };
}
test('D1 persists moves, serializes concurrent updates, and rejects premature or forged rankings', async () => {
  const start = await request({ type: 'start' }); assert.equal(start.response.status, 200);
  let run = start.data.run;
  const auth = { id: run.id, token: start.data.token };
  assert.equal(run.level, 1); assert.equal(run.score, 0);
  const bad = await request({ type: 'pour', ...auth, version: run.version, from: 0, to: 0 });
  assert.equal(bad.data.run.moves, 0);
  const [from, to] = solve(run.board)![0], expected = pour(run.board, from, to);
  const [a, b] = await Promise.all([request({ type: 'pour', ...auth, version: run.version, from, to }), request({ type: 'pour', ...auth, version: run.version, from, to })]);
  assert.deepEqual([a.response.status, b.response.status].sort(), [200, 409]);
  run = (await request({ type: 'sync', ...auth })).data.run;
  assert.equal(run.moves, 1); assert.deepEqual(run.board, expected); assert.equal(run.deadline, start.data.run.deadline);
  const forbidden = await request({ type: 'sync', id: run.id, token: 'wrong' }); assert.equal(forbidden.response.status, 400);
  const forged = await request({ type: 'end', ...auth, version: run.version, score: 99999999, cleared: 100 });
  assert.equal(forged.response.status, 400);
  const early = await request({ type: 'register', ...auth, version: run.version, nickname: 'QA_LOCAL' });
  assert.equal(early.response.status, 409);
  const ranks = await (await fetch(new URL('/water-sort/challenge', base))).json() as { rows: {id: string; score: number}[] };
  assert.equal(ranks.rows.filter(r => r.id === run.id).length, 0);
});
test('stage completion is verified server-side and opens only the next stage', async () => {
  const start = await request({ type: 'start' }); let run = start.data.run;
  const auth = { id: run.id, token: start.data.token };
  const solution = solve(run.board)!;
  for (const [from, to] of solution) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, run.availableAt - run.serverNow + 15)));
    const result = await request({ type: 'pour', ...auth, version: run.version, from, to }); assert.equal(result.response.status, 200); run = result.data.run;
  }
  assert.equal(run.status, 'cleared'); assert.equal(run.cleared, 1); assert.ok(run.score >= 1000 && run.score <= 1300);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, run.availableAt - run.serverNow + 470)));
  const next = await request({ type: 'sync', ...auth, version: run.version });
  assert.equal(next.data.run.level, 2); assert.equal(next.data.run.cleared, 1); assert.equal(next.data.run.score, run.score);
  assert.ok(next.data.run.deadline > run.deadline);
});
