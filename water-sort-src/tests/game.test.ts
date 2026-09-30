import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pour, won, clone, type Board } from '../lib/game.ts';
import { area, below, chooseDirection, phases, rotate, roundBottom, spillAngle, surface } from '../lib/pour-motion.ts';
const levels = JSON.parse(readFileSync(new URL('../lib/levels.json', import.meta.url), 'utf8'));
test('pour only contiguous top color and stop at capacity without mutating inputs', () => {
  const board = [[0, 1, 1, 1], [0, 1, 1], []];
  assert.deepEqual(pour(board, 0, 1), [[0, 1, 1], [0, 1, 1, 1], []]);
  assert.deepEqual(pour(board, 0, 2), [[0], [0, 1, 1], [1, 1, 1]]);
  assert.deepEqual(board, [[0, 1, 1, 1], [0, 1, 1], []]);
});
test('reject self, empty, full and different-color moves', () => {
  const board = [[0,0,0,0], [1], []];
  for (const [a,b] of [[0,0],[2,1],[1,0],[0,1],[99,0]]) assert.equal(pour(board,a,b),null);
});
test('win requires every nonempty tube to be full and one color', () => {
  assert.equal(won([[0,0,0,0],[1,1,1,1],[]]),true);
  assert.equal(won([[0,0],[0,0],[]]),false);
  assert.equal(won([[0,0,1,0],[]]),false);
});
test('all 30 puzzles have valid counts and legal solutions with color conservation', () => {
  assert.equal(levels.length,30);
  for (const [i, level] of levels.entries()) {
    let board: Board = clone(level.board);
    const expected = [...board.flat()].sort();
    for(let color=0;color<board.length-2;color++) assert.equal(expected.filter(n=>n===color).length,4);
    assert.equal(won(board),false);
    for(const [from,to] of level.solution) {
      const next=pour(board,from,to);
      assert.ok(next,`Level ${i+1}: illegal move`);
      assert.deepEqual([...next.flat()].sort(),expected);
      assert.ok(next.every(t=>t.length<=4));
      board=next;
    }
    assert.ok(won(board),`Level ${i+1} must finish`);
  }
});
test('tilted water keeps a horizontal surface and conserves every layer area', () => {
  const polygon = roundBottom({ x: 6, y: 8, width: 46, height: 138 }, 16);
  for (const angle of [-1.55, -.8, 0, .65, 1.55]) {
    const tilted = rotate(polygon, angle);
    assert.ok(Math.abs(area(tilted) - area(polygon)) < .0001);
    for (const fraction of [.01, .23, .46, .69, .92]) {
      const volume = area(polygon) * fraction;
      const y = surface(tilted, volume);
      assert.ok(Math.abs(area(below(tilted, y)) - volume) < .05);
    }
  }
});
test('pouring angle meets the lip at the correct remaining volume on both sides', () => {
  const polygon = roundBottom({ x: 6, y: 8, width: 32, height: 112 }, 11);
  for (const direction of [-1, 1]) {
    const pivot = { x: direction === 1 ? 38 : 6, y: 8 };
    let previous = 0;
    for (const fraction of [.9,.7,.5,.2,.01]) {
      const volume = area(polygon) * fraction;
      const angle = spillAngle(polygon, pivot, volume, direction);
      assert.ok(Math.abs(angle) >= previous);
      assert.ok(Math.abs(area(below(rotate(polygon,angle,pivot),0)) - volume) < .15);
      previous = Math.abs(angle);
    }
  }
});
test('edge destinations tip inward at mobile and desktop sizes', () => {
  for (const width of [320,390,430,768,844,1024,1440]) {
    const source={x:width/2,y:170,width:44,height:125};
    assert.equal(chooseDirection(source,{x:20,y:170,width:44,height:125},width),-1);
    assert.equal(chooseDirection(source,{x:width-64,y:170,width:44,height:125},width),1);
  }
});
test('liquid transfer finishes before the bottle returns and never overshoots', () => {
  assert.equal(phases(.2).flow,0);
  assert.equal(phases(.5).retreat,0);
  assert.equal(phases(.77).flow,1);
  assert.equal(phases(1).flow,1);
  assert.equal(phases(1).retreat,1);
});
