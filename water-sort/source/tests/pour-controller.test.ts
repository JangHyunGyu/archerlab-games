import assert from 'node:assert/strict';
import test from 'node:test';
import { PourController } from '../lib/pour-controller.ts';
import { advance, newStage } from '../lib/challenge.ts';
import type { RunView } from '../lib/challenge-rules.ts';

function harness() {
  let now = 1000;
  let run: RunView = { ...newStage(1, now), board: [[0, 1], [1, 0], [], [], []], bottleAvailableAt: [0, 0, 0, 0, 0], id: 'run', version: 1, historyDepth: 0, registered: false, nickname: null, serverNow: now };
  const requests: { from: number; to: number; version: number; resolve: (run: RunView) => void; reject: (e: Error) => void }[] = [];
  const starts: number[] = [], errors: unknown[] = [];
  const controller = new PourController({
    getRun: () => run, clock: () => now,
    send: (from, to) => new Promise((resolve, reject) => requests.push({ from, to, version: run.version, resolve, reject })),
    accept: next => { run = next; }, start: e => { starts.push(e.id); }, change() {}, reset() {}, error: e => { errors.push(e); }, invalid() {},
  });
  controller.enabled = true;
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  return { controller, requests, starts, errors, flush, get run() { return run; }, set run(next) { run = next; }, setTime: (time: number) => { now = time; },
    confirm: async (index: number) => {
      const request = requests[index];
      const next = advance({ ...run, history: [] }, { type: 'pour', from: request.from, to: request.to }, now);
      request.resolve({ ...run, ...next, version: run.version + Number(next.moves > run.moves), serverNow: now }); await flush();
    },
  };
}

test('disjoint pours animate immediately, preserve both projections, and serialize versioned writes', async () => {
  const h = harness(), p = h.controller;
  p.request(0, 2); p.request(1, 3);
  assert.equal(h.starts.length, 2); assert.equal(h.requests.length, 1);
  assert.deepEqual(p.board, [[0], [1], [1], [0], []]);
  await h.confirm(0);
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].version, 2);
  assert.deepEqual(p.board, [[0], [1], [1], [0], []]);
  await h.confirm(1);
  assert.equal(h.run.moves, 2); assert.equal(h.run.score, 0);
  for (const id of h.starts) p.finish(id);
  assert.equal(p.entries.length, 2, 'shortened visuals must not bypass server bottle locks');
  h.setTime(h.run.availableAt); p.tick();
  assert.equal(p.entries.length, 0);
});

test('one dependent pour waits for both visual completion and authoritative bottle readiness', async () => {
  const h = harness(), p = h.controller;
  p.request(0, 2); assert.equal(p.request(2, 4), 'queued');
  assert.equal(h.requests.length, 1); assert.equal(h.starts.length, 1);
  await h.confirm(0);
  h.setTime(h.run.availableAt); p.tick();
  assert.equal(h.starts.length, 1, 'server readiness alone cannot overlap the same animated bottle');
  p.finish(h.starts[0]);
  assert.equal(h.starts.length, 2); assert.equal(p.queued, null);
  assert.equal(h.requests[1].from, 2); assert.equal(h.requests[1].to, 4);
  await h.confirm(1); assert.equal(h.run.moves, 2);
});

test('latency longer than animation retains intent until confirmation, then waits only for its bottles', async () => {
  const h = harness(), p = h.controller;
  p.request(0, 2); p.request(2, 4); p.finish(h.starts[0]);
  h.setTime(9000); p.tick(); assert.equal(h.requests.length, 1);
  await h.confirm(0); assert.equal(h.requests.length, 1);
  h.setTime(h.run.availableAt); p.tick();
  assert.equal(h.requests.length, 2);
});

test('latest reservation replaces one intent; repeating the same pair or explicit cancel clears it', () => {
  const h = harness(), p = h.controller;
  p.request(0, 2); p.request(2, 3); p.request(2, 4);
  assert.deepEqual(p.queued, { from: 2, to: 4 }); assert.equal(h.starts.length, 1);
  assert.equal(p.request(2, 4), 'cancelled'); assert.equal(p.queued, null);
  p.request(2, 3); p.cancelQueued(); assert.equal(p.queued, null);
});

test('Home clears every preview and reservation and ignores late successful responses', async () => {
  const h = harness(), p = h.controller;
  p.request(0, 2); p.request(1, 3); p.request(2, 4);
  p.clear(); p.enabled = false;
  await h.confirm(0);
  assert.equal(h.run.moves, 0); assert.equal(p.entries.length, 0); assert.equal(p.queued, null);
  assert.equal(h.requests.length, 1);
});

test('network failure discards all unconfirmed moves instead of replaying them', async () => {
  const h = harness(), p = h.controller;
  p.request(0, 2); p.request(1, 3); p.request(2, 4);
  h.requests[0].reject(new Error('offline')); await h.flush();
  assert.equal(h.errors.length, 1); assert.equal(h.requests.length, 1);
  assert.deepEqual(p.board, h.run.board); assert.equal(p.entries.length, 0); assert.equal(p.queued, null);
});

test('deadline cancels waiting actions and a late response cannot award speculative points', async () => {
  const h = harness(), p = h.controller;
  p.request(0, 2); p.request(1, 3); p.request(2, 4);
  h.setTime(h.run.deadline); p.tick(); await h.confirm(0);
  assert.equal(h.run.score, 0); assert.equal(h.requests.length, 1);
  assert.equal(p.entries.length, 0); assert.equal(p.queued, null);
});

test('a confirmed clear cancels reservations even before the UI has rendered its disabled state', async () => {
  const h = harness(), p = h.controller;
  h.run = { ...h.run, board: [[0, 0, 0], [0], [], []], bottleAvailableAt: [0, 0, 0, 0] };
  p.request(1, 0); p.request(0, 2);
  assert.ok(p.queued);
  await h.confirm(0);
  assert.equal(h.run.status, 'cleared'); assert.equal(p.queued, null);
  assert.equal(p.request(0, 2), 'invalid');
  p.finish(h.starts[0]); h.setTime(h.run.availableAt); p.tick();
  assert.equal(p.entries.length, 0); assert.equal(h.requests.length, 1);
});
