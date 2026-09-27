import assert from 'node:assert/strict';
import test from 'node:test';
import catalog from '../lib/challenge-levels.json' with { type: 'json' };
import { advance, newStage, timeLimit, colorsFor, randomBoard, expire, pourDuration, type Challenge } from '../lib/challenge.ts';
import { pour, won, solve } from '../lib/game.ts';
import { shortestSolution } from '../scripts/difficulty.ts';
test('all 300 variants solve legally; difficulty bands increase through level100', () => {
  assert.equal(catalog.length, 100);
  let previous = 0;
  let previousMoves = 0;
  const layouts = new Set<string>();
  catalog.forEach((stage, index) => {
    assert.equal(stage.colors, colorsFor(index + 1));
    assert.equal(stage.variants.length, 3);
    assert.ok(stage.variants[0].difficulty >= previous);
    previous = stage.variants.at(-1)!.difficulty;
    assert.ok(stage.variants[0].minimumMoves >= previousMoves);
    previousMoves = stage.variants.at(-1)!.minimumMoves;
    for (const variant of stage.variants) {
      const key = variant.board.map(tube => tube.join('')).sort().join('|');
      assert.ok(!layouts.has(key), `repeated layout at stage ${index + 1}`); layouts.add(key);
      assert.equal(variant.minimumMoves, variant.solution.length);
      assert.equal(shortestSolution(variant.board, 20000)?.solution.length, variant.minimumMoves, `minimum pours at stage ${index + 1}`);
      let board = variant.board;
      let animationMs = 0;
      for (const [from, to] of variant.solution) {
        const next = pour(board, from, to); assert.ok(next);
        animationMs += pourDuration(next[to].length - board[to].length); board = next;
      }
      assert.ok(won(board));
      assert.equal(animationMs, variant.animationMs);
      assert.ok(animationMs <= 40000, 'leave at least 20 seconds for decisions');
    }
  });
});

test('early stages increase visibly and do not retain the old 17-stage three-color plateau', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => colorsFor(i + 1)), [3, 3, 4, 4, 4, 5]);
  for (let i = 1; i < 6; i++) assert.ok(catalog[i].variants[0].minimumMoves > catalog[i - 1].variants.at(-1)!.minimumMoves);
  assert.ok(catalog[0].variants.at(-1)!.minimumMoves <= 5);
  assert.ok(catalog[5].variants[0].minimumMoves >= 13);
  assert.ok(catalog[99].variants[0].minimumMoves >= 25);
});

test('offline minimum-pour solver agrees with exhaustive BFS on small boards', () => {
  const key = (board: number[][]) => board.map(t => t.join('')).sort().join('|');
  for (const initial of [[[0, 1, 0, 1], [1, 0, 1, 0], [], []], [[0, 0, 0, 0], [1, 1, 1, 1], [], []], ...catalog.slice(0, 2).flatMap(stage => stage.variants.map(v => v.board))]) {
    const queue = [{ board: initial, depth: 0 }], seen = new Set([key(initial)]);
    let minimum: number | undefined;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const { board, depth } = queue[cursor];
      if (won(board)) { minimum = depth; break; }
      for (let from = 0; from < board.length; from++) for (let to = 0; to < board.length; to++) {
        const next = pour(board, from, to);
        if (!next || seen.has(key(next))) continue;
        seen.add(key(next)); queue.push({ board: next, depth: depth + 1 });
      }
    }
    assert.equal(shortestSolution(initial)?.solution.length, minimum);
  }
  assert.equal(shortestSolution([[0, 1, 0, 1], [1, 0, 1, 0], [], []], 0), null);
});
test('every stage has60 seconds and randomization preserves solvable boards', () => {
  for (let level = 1; level <= 100; level++) assert.equal(timeLimit(level), 60);
  const layouts = new Set();
  for (let i = 0; i < 15; i++) { const board = randomBoard(1); layouts.add(JSON.stringify(board)); assert.ok(solve(board)); }
  assert.ok(layouts.size > 1);
});
test('pouring never extends deadline, removed undo is blocked, and cooldown prevents overlaps', () => {
  const initial: Challenge = { ...newStage(1, 1000), board: [[0, 1], [1], [], []] };
  const moved = advance(initial, { type: 'pour', from: 0, to: 1 }, 2000);
  assert.equal(moved.deadline, initial.deadline); assert.equal(moved.moves, 1);
  assert.equal(advance(moved, { type: 'pour', from: 1, to: 2 }, 2100), moved);
  const undone = advance(moved, { type: 'undo' }, moved.availableAt);
  assert.equal(undone, moved); assert.equal(undone.deadline, initial.deadline); assert.equal(undone.moves, 1);
  assert.equal(expire(undone, initial.deadline).status, 'ended');
});
test('last pour must finish before deadline; late completion earns no points', () => {
  const initial: Challenge = { ...newStage(1, 0), board: [[0, 0, 0], [0], [], []] };
  const onTime = advance(initial, { type: 'pour', from: 1, to: 0 }, 58000);
  assert.equal(onTime.status, 'cleared'); assert.equal(onTime.cleared, 1); assert.ok(onTime.score >= 1000);
  const late = advance(initial, { type: 'pour', from: 1, to: 0 }, 59500);
  assert.equal(late.status, 'playing'); assert.equal(late.cleared, 0); assert.equal(late.score, 0);
  assert.equal(expire(late, 60000).status, 'ended');
  assert.equal(advance(initial, { type: 'pour', from: 1, to: 0 }, 60000).status, 'ended');
});
test('all levels can finish within their clocks using verified solution playback', () => {
  catalog.forEach((stage, i) => stage.variants.forEach(variant => {
    let state = { ...newStage(i + 1, 0), board: variant.board }, now = 0;
    for (const [from, to] of variant.solution) {
      const next = advance(state, { type: 'pour', from, to }, now);
      assert.equal(next.moves, state.moves + 1);
      now = next.availableAt + 100; state = next;
    }
    assert.equal(state.status, 'cleared', `stage ${i + 1} needs more than ${timeLimit(i + 1)}s even with near-instant decisions`);
  }));
});
test('zero-clear runs can end; next stages require clear; 100 is final', () => {
  const initial = newStage(1, 0);
  assert.equal(advance(initial, { type: 'next' }, 100), initial);
  assert.equal(advance(initial, { type: 'end' }, 100), initial);
  const ended = expire(initial, 60000);
  assert.equal(ended.status, 'ended'); assert.equal(ended.cleared, 0);
  assert.equal(advance(ended, { type: 'next' }, 100), ended);
  assert.equal(expire({ ...initial, status: 'cleared', level: 100, cleared: 100 }, 500).status, 'ended');
  assert.equal(pourDuration(1), 1150);
});
test('next stage starts automatically at a fixed time even with delayed polling', () => {
  const cleared: Challenge = { ...newStage(1, 0), status: 'cleared', cleared: 1, score: 1200, availableAt: 5000 };
  assert.equal(expire(cleared, 5449).level, 1);
  const next = expire(cleared, 5500);
  assert.equal(next.level, 2); assert.equal(next.deadline, 65450); assert.equal(next.score, 1200);
  assert.equal(expire(cleared, 70000).status, 'ended');
  const staleMove = advance(cleared, { type: 'pour', from: 0, to: 3 }, 5500);
  assert.equal(staleMove.level, 2); assert.equal(staleMove.moves, 0);
});
