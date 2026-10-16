import assert from 'node:assert/strict';
import test from 'node:test';
import { RewardChain, RewardPainter } from '../lib/reward-effects.ts';

test('only new settled bottles earn chains; duplicate, stage and time boundaries are explicit', () => {
  const chain = new RewardChain();
  assert.equal(chain.bottle('run:1', '0', 0), 1);
  assert.equal(chain.bottle('run:1', '0', 100), 0);
  assert.equal(chain.bottle('run:1', '1', 1000), 2);
  assert.equal(chain.bottle('run:1', '2', 6000), 1);
  assert.equal(chain.clear('run:1'), true); assert.equal(chain.clear('run:1'), false);
  assert.equal(chain.bottle('run:2', '0', 6200), 1);
  assert.equal(chain.clear('run:2'), true);
  assert.equal(chain.bottle('new-run:2', '0', 6300), 1);
});

test('overlapping rewards have a hard particle budget and leave no idle animation work', () => {
  const painter = new RewardPainter();
  const bottle = { x: 100, y: 240, width: 45, height: 125, color: 0 };
  for (let i = 0; i < 100; i++) painter.bottle(bottle, 6, 0);
  assert.ok(painter.particles <= 280); assert.equal(painter.active, true);
  const context = { clearRect() {}, globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
  painter.draw(context, 3000, 390, 844);
  assert.equal(painter.particles, 0); assert.equal(painter.active, false);
  painter.clear([bottle], { x: 340, y: 50 }, 1200, 4000);
  painter.draw(context, 7000, 390, 844); assert.equal(painter.active, false);
  painter.bottle(bottle, 1, 8000); painter.reset(); assert.equal(painter.active, false);
});

test('the next board keeps score flights but drops bursts from the previous board', () => {
  const painter = new RewardPainter();
  painter.clear([{ x: 100, y: 240, width: 45, height: 125, color: 0 }], { x: 340, y: 50 }, 1200, 0);
  painter.finishStage(); assert.equal(painter.particles, 0); assert.equal(painter.active, true);
  painter.reset(); assert.equal(painter.active, false);
});

test('chain ribbons connect recent completions, stay bounded, and cannot connect across stages', () => {
  const painter = new RewardPainter();
  const bottle = { x: 100, y: 240, width: 45, height: 125, color: 0 };
  painter.bottle(bottle, 1, 0); assert.equal(painter.connections, 0);
  painter.bottle({ ...bottle, x: 220 }, 2, 500); assert.equal(painter.connections, 1);
  painter.finishStage(); assert.equal(painter.connections, 0);
  painter.bottle(bottle, 2, 600); assert.equal(painter.connections, 0);
  painter.bottle({ ...bottle, x: 220 }, 2, 6000); assert.equal(painter.connections, 0);
  for (let i = 0; i < 50; i++) painter.bottle({ ...bottle, x: 100 + i }, 6, 6100 + i);
  assert.equal(painter.connections, 8); assert.ok(painter.particles <= 280);
  painter.reset(); assert.equal(painter.connections, 0); assert.equal(painter.active, false);
});
