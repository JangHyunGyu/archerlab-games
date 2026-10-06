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

test('ghost bottles mute their liquid toward gray and draw it see-through', async () => {
  const { ghostColor, GHOST_LIQUID_ALPHA, WATER_COLORS } = await import('../lib/glass-renderer.ts');
  const saturation = (hex: string) => { const v = [1, 3, 5].map(o => parseInt(hex.slice(o, o + 2), 16)); return (Math.max(...v) - Math.min(...v)) / 255; };
  for (const color of WATER_COLORS) assert.ok(saturation(ghostColor(color)) < saturation(color) * .6, color);
  assert.ok(GHOST_LIQUID_ALPHA <= .5);
});

test('the pour point rises over the ghost slot for every pour angle, but stays on screen', async () => {
  const { hoverLift, vesselOutline, placeVessel, overlaps, chooseDirection } = await import('../lib/pour-motion.ts');
  for (const [w, h, gap] of [[68, 182, 120], [55, 145, 83], [63, 148, 114]]) {
    const source = { x: 100, y: 400, width: w, height: h }, destination = { x: 100 + gap, y: 400, width: w, height: h };
    const water = glassInterior(w, h), direction = chooseDirection(source, destination, 1280);
    const pivot = { x: direction > 0 ? water.x + water.width : water.x, y: water.y };
    const polygon = roundBottom(water, water.width * .48), volume = (u: number) => liquidVolume(water, u);
    const angles = [4, 3, 2, 1, 0].map(units => spillAngle(polygon, pivot, volume(units), direction));
    const ghost = { x0: source.x - 4, y0: source.y - 6, x1: source.x + w + 4, y1: source.y + h + 10 };
    const outline = vesselOutline(w, h), base = { x: destination.x + w / 2, y: destination.y - 15 };
    assert.ok(angles.some(angle => overlaps(placeVessel(outline, angle, pivot, base), ghost)), 'the old pour point covered the ghost');
    const lift = hoverLift(outline, pivot, base, angles, ghost, 6);
    assert.ok(lift > 0);
    for (const angle of angles) {
      const poly = placeVessel(outline, angle, pivot, { x: base.x, y: base.y - lift });
      assert.equal(overlaps(poly, ghost), false);
      assert.ok(Math.min(...poly.map(p => p.y)) >= 6);
    }
    // Pouring into the row below never needs to rise: nothing of the ghost is in the way.
    const below = { x: base.x, y: source.y + h + 80 };
    assert.equal(hoverLift(outline, pivot, below, angles, ghost, 6), 0);
    // A short screen caps the rise at the top margin instead of clipping the rim.
    const capped = hoverLift(outline, pivot, { x: base.x, y: 120 }, angles, { ...ghost, y0: 135, y1: 135 + h }, 6);
    for (const angle of angles) assert.ok(Math.min(...placeVessel(outline, angle, pivot, { x: base.x, y: 120 - capped }).map(p => p.y)) >= 5.999);
  }
});

test('with room, the lifted bottle also passes above the resting bottles between it and the target', async () => {
  const { hoverLift, vesselOutline, placeVessel, overlaps } = await import('../lib/pour-motion.ts');
  const w = 68, h = 182, water = glassInterior(w, h), pivot = { x: water.x + water.width, y: water.y };
  const polygon = roundBottom(water, water.width * .48), volume = (u: number) => liquidVolume(water, u);
  const angles = [1, .5, 0].map(units => spillAngle(polygon, pivot, volume(units), 1));
  const box = (x: number) => ({ x0: x - 4, y0: 394, x1: x + w + 4, y1: 400 + h + 10 });
  const ghost = box(100), between = box(220), outline = vesselOutline(w, h), base = { x: 340 + w / 2, y: 385 };
  assert.equal(hoverLift(outline, pivot, base, angles, ghost, 6), 0, 'the far ghost alone needs no rise');
  const lift = hoverLift(outline, pivot, base, angles, ghost, 6, [between]);
  assert.ok(lift > 0);
  for (const angle of angles) assert.equal(overlaps(placeVessel(outline, angle, pivot, { x: base.x, y: base.y - lift }), between), false);
  // No room: the neighbour is given up, never the top margin.
  assert.ok(hoverLift(outline, pivot, { x: base.x, y: 40 }, angles, ghost, 6, [between]) <= 40);
});
