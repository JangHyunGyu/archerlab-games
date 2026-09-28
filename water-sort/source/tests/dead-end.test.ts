import assert from 'node:assert/strict';
import test from 'node:test';
import { boardOutcome } from '../lib/dead-end.ts';
import { advance, expire, inspectStage, leaveStage, newStage, resumeStage } from '../lib/challenge.ts';
import { hasMove, pour, won, type Board } from '../lib/game.ts';
import catalog from '../lib/challenge-levels.json' with { type: 'json' };

const beforeTrap = [[0, 0, 1, 3], [1, 1, 2, 3], [2, 2, 3], [0, 0, 3], [1], [2]];
const noMoves = pour(beforeTrap, 3, 2)!;
const trappedWithMoves = [[3], [2, 3, 2, 2], [3, 0, 1], [1, 0, 1, 1], [0], [0, 3, 2]];

test('dead-end analysis distinguishes a proof, a solution, and an unfinished search', () => {
  assert.equal(hasMove(noMoves), false); assert.equal(boardOutcome(noMoves), 'blocked');
  assert.equal(hasMove(trappedWithMoves), true); assert.equal(boardOutcome(trappedWithMoves), 'blocked');
  assert.equal(boardOutcome(beforeTrap), 'solvable');
  assert.equal(boardOutcome(beforeTrap, 1), 'unknown', 'budget exhaustion is never a loss');
  assert.equal(boardOutcome([[0, 0, 0, 0], []]), 'solvable');
  assert.equal(boardOutcome([[0, 1], [], []]), 'unknown', 'unsupported partial fixtures are not proofs');
});

test('all 300 catalog starts remain playable or unknown, never falsely blocked', () => {
  for (const level of catalog) for (const variant of level.variants) assert.notEqual(boardOutcome(variant.board), 'blocked');
});

test('proof search agrees with an unpruned labeled-state oracle on small complete puzzles', () => {
  function oracle(initial: Board) {
    const pending = [initial], seen = new Set<string>();
    while (pending.length) {
      const b = pending.pop()!, hash = JSON.stringify(b);
      if (seen.has(hash)) continue;
      seen.add(hash);
      if (won(b)) return 'solvable';
      for (let a = 0; a < b.length; a++) for (let c = 0; c < b.length; c++) { const next = pour(b, a, c); if (next) pending.push(next); }
    }
    return 'blocked';
  }
  let seed = 419;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 24; i++) {
    const b: Board = [[], [], [], []];
    for (const color of [0, 1, 0, 1, 0, 1, 0, 1]) { let slot; do { slot = Math.floor(random() * b.length); } while (b[slot].length === 4); b[slot].push(color); }
    const actual = boardOutcome(b, 20000);
    assert.notEqual(actual, 'unknown'); assert.equal(actual, oracle(b));
  }
});

test('the trapping pour ends immediately without resetting time, awarding points, or permitting resume', () => {
  const original = { ...newStage(1, 1000), board: beforeTrap, initialBoard: beforeTrap, bottleAvailableAt: beforeTrap.map(() => 1000) };
  const ended = advance(original, { type: 'pour', from: 3, to: 2 }, 2000);
  assert.equal(ended.status, 'ended'); assert.equal(ended.endReason, 'blocked'); assert.equal(ended.endedAt, 2000);
  assert.equal(ended.moves, 1); assert.equal(ended.score, 0); assert.equal(ended.cleared, 0);
  assert.equal(ended.deadline, original.deadline); assert.ok(ended.availableAt > 2000);
  assert.equal(resumeStage(ended, 3000), ended); assert.equal(leaveStage(ended, 3000), ended);
  assert.equal(expire(ended, ended.deadline + 1000), ended);
  assert.equal(advance(ended, { type: 'pour', from: 0, to: 4 }, 3000), ended);
});

test('deep proof is separate from ordinary sync, and Home cannot reset a proven trapped board', () => {
  const state = { ...newStage(1, 1000), board: trappedWithMoves, bottleAvailableAt: trappedWithMoves.map(() => 9000) };
  assert.equal(expire(state, 2000), state, 'ordinary sync does not run the deep solver or use bottle locks as a no-move test');
  for (const action of [inspectStage, leaveStage, resumeStage]) {
    const ended = action(state, 2000);
    assert.equal(ended.status, 'ended'); assert.equal(ended.endReason, 'blocked');
    assert.deepEqual(ended.board, trappedWithMoves); assert.equal(ended.deadline, state.deadline);
  }
  const timedOut = expire(state, state.deadline);
  assert.equal(timedOut.endReason, 'timeout');
});
