import assert from 'node:assert/strict';
import { RankClient } from '../js/ranking.mjs';

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const requests = [];
Date.now = () => 1700000000000;
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url, options });
  const payload = url.endsWith('/score-sessions')
    ? { session_id: 'lumen-session' }
    : url.includes('/rankings?')
      ? { rankings: [{ player_name: 'A', score: 10 }] }
      : { ok: true };
  return { ok: true, status: 200, json: async () => payload };
};

try {
  const client = new RankClient();
  await client.start();
  assert.equal(client.sessionId, 'lumen-session');
  client.record({ type: 'line', delta: 100, level: 2, combo: 1 });
  assert.equal(client.queue[0].at, 1700000000000);
  assert.equal(await client.flush(), true);
  assert.equal(client.queue.length, 0);
  assert.deepEqual(await client.fetchTop(), [{ player_name: 'A', score: 10 }]);
  assert.equal(requests.length, 3);
  assert.equal(await client.flush(), true, 'already synchronized queues must count as success');
  await client.submit('A', 100, {});
  assert.ok(requests.at(-1).url.endsWith('/rankings'), 'submission after an earlier flush must reach the server');
  console.log('✓ lumen ranking module behavior verified');
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
}
