import assert from 'node:assert/strict';
import test from 'node:test';
import { waterSortRoute } from '../worker/route.ts';

test('shared API CORS accepts only the game origins, including errors and preflight', async () => {
  const target = 'https://game-api.yama5993.workers.dev/water-sort/challenge';
  const db = { batch: async () => [], prepare: () => ({ all: async () => ({ results: [] }) }) };
  for (const origin of ['https://game.archerlab.dev', 'https://archerlab.dev']) {
    const preflight = await waterSortRoute(new Request(target, { method: 'OPTIONS', headers: { Origin: origin } }), db);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    const response = await waterSortRoute(new Request(target, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{' }), db);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  for (const origin of ['https://attacker.example', 'https://game.archerlab.dev.attacker.example', 'null', 'http://127.0.0.1:3010']) {
    const response = await waterSortRoute(new Request(target, { method: 'OPTIONS', headers: { Origin: origin } }), db);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  const local = await waterSortRoute(new Request('http://127.0.0.1:8787/water-sort/challenge', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:3010' } }), db);
  assert.equal(local.status, 204);
});
