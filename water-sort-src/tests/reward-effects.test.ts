import assert from 'node:assert/strict';
import test from 'node:test';
import { RewardChain, RewardPainter } from '../lib/reward-effects.ts';
import { ReactionSpectacle } from '../lib/reaction-spectacle.ts';

test('only new confirmed bottles earn chains; duplicate, stage and time boundaries are explicit', () => {
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

test('the finale survives a board handoff, expires independently, and is cancelled by reset', () => {
  const spectacle = new ReactionSpectacle();
  const bottle = { x: 100, y: 240, width: 45, height: 125, color: 0 };
  for (let i = 0; i < 100; i++) spectacle.bottle(bottle, 6, 0);
  assert.ok(spectacle.count <= 4);
  spectacle.finishStage(); assert.equal(spectacle.active, false);
  spectacle.clear(195, 400, 0); spectacle.finishStage();
  assert.equal(spectacle.active, true);
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get: (_target, key) => key === 'createRadialGradient' || key === 'createLinearGradient' ? () => gradient : () => {},
    set: () => true,
  }) as CanvasRenderingContext2D;
  spectacle.draw(context, 450, 390, 844); assert.equal(spectacle.active, true);
  spectacle.draw(context, 1899, 390, 844); assert.equal(spectacle.active, true);
  spectacle.draw(context, 1900, 390, 844); assert.equal(spectacle.active, false);
  spectacle.clear(195, 400, 2000); spectacle.reset(); assert.equal(spectacle.active, false);
});

test('pour impacts expire without confirmation; quiet confirmation cannot replay particles or prolong an idle painter', () => {
  const painter = new RewardPainter();
  const bottle = { x: 100, y: 240, width: 45, height: 125, color: 0 };
  for (let i = 0; i < 100; i++) {
    for (const phase of ['launch', 'contact', 'filled'] as const) painter.pour(bottle, { x: 100, y: 280 }, phase, 0, true);
  }
  assert.ok(painter.particles <= 280); assert.equal(painter.active, true);
  const context = { clearRect() {}, globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
  painter.draw(context, 3000, 390, 844);
  assert.equal(painter.active, false); assert.equal(painter.particles, 0);
  painter.bottle(bottle, 1, 3100, false, false);
  assert.equal(painter.active, false); assert.equal(painter.particles, 0);
  painter.pour(bottle, { x: 100, y: 280 }, 'contact', 3200);
  painter.reset(); assert.equal(painter.active, false);
});
