import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import test from 'node:test';

test('the shipped worker runs off-thread, preserves versions and classifies real boards', async t => {
  const assets = new URL('../../water-sort/assets/', import.meta.url);
  const files = await readdir(assets);
  const filename = files.find(name => /^dead-end\.worker-.*\.js$/.test(name));
  assert.ok(filename, 'build must publish the standalone worker');
  const code = await readFile(new URL(filename, assets), 'utf8');
  const main = await readFile(new URL(files.find(name => /^index-.*\.js$/.test(name)), assets), 'utf8');
  assert.ok(main.includes(filename), 'app must load the hashed worker');
  const worker = new Worker(`
    const { parentPort, threadId } = require('node:worker_threads');
    globalThis.self = { postMessage: data => parentPort.postMessage({ ...data, threadId }) };
    ${code}
    parentPort.on('message', data => self.onmessage({ data }));
  `, { eval: true });
  try {
    const send = async (board, version) => {
      const reply = once(worker, 'message');
      worker.postMessage({ id: 'worker-test', version, board });
      const [data] = await reply;
      assert.equal(data.id, 'worker-test'); assert.equal(data.version, version);
      assert.ok(data.threadId > 0);
      return data.outcome;
    };
    assert.equal(await send([[3], [2, 3, 2, 2], [3, 0, 1], [1, 0, 1, 1], [0], [0, 3, 2]], 1), 'blocked');
    assert.equal(await send([[0, 0, 1, 3], [1, 1, 2, 3], [2, 2, 3], [0, 0, 3], [1], [2]], 2), 'solvable');
    assert.equal(await send([[0, 1], [], []], 3), 'unknown');
    const catalog = JSON.parse(await readFile(new URL('../lib/challenge-levels.json', import.meta.url), 'utf8'));
    const times = [];
    for (const level of catalog) for (const variant of level.variants) {
      const start = performance.now();
      assert.notEqual(await send(variant.board, times.length + 4), 'blocked');
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    t.diagnostic(`300 warmed-worker round trips: median ${times[150].toFixed(2)} ms, p95 ${times[284].toFixed(2)} ms (local Node worker; device-dependent)`);
  } finally { await worker.terminate(); }
});
