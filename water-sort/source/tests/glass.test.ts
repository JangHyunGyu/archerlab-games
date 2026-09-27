import test from 'node:test';
import assert from 'node:assert/strict';
import { glassInterior, liquidLayers, liquidVolume, liquidSurface } from '../lib/glass-renderer.ts';
import { area, below, roundBottom, rotate, surface, spillAngle } from '../lib/pour-motion.ts';

test('contiguous colors form continuous liquid and fractional pours keep their order', () => {
  assert.deepEqual(liquidLayers([1, 1, 1, 1]), [{ color: 1, units: 4 }]);
  assert.deepEqual(liquidLayers([0, 0, 1, 1], 2.75), [{ color: 0, units: 2 }, { color: 1, units: .75 }]);
  assert.deepEqual(liquidLayers([0, 1, 0]), [{ color: 0, units: 1 }, { color: 1, units: 1 }, { color: 0, units: 1 }]);
  assert.deepEqual(liquidLayers([1], 0), []);
});

test('equal liquid units conserve volume across the round-bottom vessels at every transfer phase', () => {
  for (const [w, h] of [[39, 88], [45, 127], [63, 148], [68, 182]]) {
    const inner = glassInterior(w, h), capacity = liquidVolume(inner, 4);
    assert.ok(inner.x > 0 && inner.y > 0 && inner.y + inner.height < h);
    for (let step = 0; step <= 100; step++) {
      const transfer = step / 50;
      const source = liquidVolume(inner, 4 - transfer), target = liquidVolume(inner, transfer);
      assert.ok(Math.abs(source + target - capacity) < .00001);
    }
    const polygon = roundBottom(inner, inner.width * .48);
    for (const units of [.01, 1, 2, 3, 4]) {
      const y = liquidSurface(inner, units);
      assert.ok(Math.abs(area(below(polygon, y)) - liquidVolume(inner, units)) < .06);
    }
  }
});

test('new glass geometry meets its open lip and keeps volume under mirrored tilts', () => {
  for (const direction of [-1, 1]) {
    const inner = glassInterior(45, 127), polygon = roundBottom(inner, inner.width * .48);
    const pivot = { x: direction > 0 ? inner.x + inner.width : inner.x, y: inner.y };
    for (const units of [.01, .5, 1, 2, 3, 4]) {
      const volume = liquidVolume(inner, units), angle = spillAngle(polygon, pivot, volume, direction);
      const tilted = rotate(polygon, angle, pivot), y = surface(tilted, volume);
      assert.ok(Math.abs(y) < .02);
      assert.ok(Math.abs(area(below(tilted, y)) - volume) < .06);
    }
  }
});
