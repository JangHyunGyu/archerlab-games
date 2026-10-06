import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planPour, HOLD_START, RETURN_START, TOP_MARGIN } from '../lib/pour-path.ts';
import { glassInterior } from '../lib/glass-renderer.ts';
import { boundsOf, overlaps, type Rect } from '../lib/pour-motion.ts';

// Real resting layouts of stages 3 and 6, recorded in a browser by tests/two-row-layouts.browser.mjs.
type Layout = { rows: number[]; tubes: Rect[] };
const layouts: Record<string, Record<string, Layout>> = JSON.parse(readFileSync(new URL('./fixtures/two-row-layouts.json', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
// A selected bottle rises this much before it is picked up; the pour starts from either height.
const SELECTED = -Number(css.match(/\.selected \.tube\{transform:translateY\((-?\d+)px\)/)![1]);
const hit = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const STEPS = 150;
const times = [...Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS), HOLD_START, RETURN_START - 1e-6];

test('fixtures cover two-row boards at phone, tablet and desktop sizes', () => {
  assert.equal(SELECTED, 14);
  const rows = (screen: string, stage: number) => Math.max(...layouts[screen][stage].rows) + 1;
  for (const screen of ['390x844', '360x640']) for (const stage of [3, 6]) assert.equal(rows(screen, stage), 2, `${screen} stage ${stage}`);
  for (const screen of ['820x1180', '1280x800']) assert.equal(rows(screen, 6), 2);
  assert.equal(rows('844x390', 6), 1);
});

for (const [screen, stages] of Object.entries(layouts)) for (const [stage, { tubes, rows }] of Object.entries(stages)) {
  test(`${screen} stage ${stage}: the lifted bottle never covers its ghost and stays on screen, for every pour`, () => {
    const [width, height] = screen.split('x').map(Number);
    let pours = 0, maxLift = 0;
    const blocked: string[] = [], streamOverGhost: string[] = [];
    for (let from = 0; from < tubes.length; from++) for (let to = 0; to < tubes.length; to++) {
      if (from === to) continue;
      const source = tubes[from], destination = tubes[to];
      const others = tubes.filter((_, i) => i !== from && i !== to);
      for (const sourceLift of [0, SELECTED]) for (let units = 1; units <= 4; units++) for (let amount = 1; amount <= units; amount++) {
        if (units === 4 && amount === 4) continue; // A full bottle of one colour is finished, never poured.
        const name = `${from}→${to} (${units}/${amount}${sourceLift ? ', selected' : ''})`;
        const plan = planPour({ source, destination, sourceWater: glassInterior(source.width, source.height), sourceLift, others }, units, amount, width);
        pours++; maxLift = Math.max(maxLift, plan.lift);
        if (plan.blocked) blocked.push(name);
        const water = glassInterior(destination.width, destination.height), half = Math.min(5, water.width * .13) / 2 + 1;
        for (const t of times) {
          const pose = plan.pose(t), box = boundsOf(pose.outline);
          assert.ok(box.y0 >= 0 && box.x0 >= 0 && box.x1 <= width && box.y1 <= height, `${name} leaves the screen at t=${t.toFixed(3)}: ${JSON.stringify(box)}`);
          if (t < HOLD_START || t >= RETURN_START) continue;
          assert.ok(box.y0 >= TOP_MARGIN - 1e-6, `${name} rim above the top margin at t=${t.toFixed(3)}`);
          assert.equal(overlaps(pose.outline, plan.ghost), false, `${name} covers its ghost at t=${t.toFixed(3)}`);
          if (pose.pouring) {
            const stream = { x0: plan.end.x - half, y0: plan.end.y, x1: plan.end.x + half, y1: destination.y + destination.height };
            assert.ok(stream.x0 >= destination.x && stream.x1 <= destination.x + destination.width && stream.y0 < destination.y);
            if (hit(stream, plan.ghost) && !streamOverGhost.includes(`${from}→${to}`)) streamOverGhost.push(`${from}→${to}`);
          }
        }
      }
    }
    assert.deepEqual(blocked, [], 'pours where the room above could not clear the ghost');
    // The stream falls straight into the receiving bottle, so it can only pass over the ghost when
    // that bottle stands right under the source's slot (the bottle then pours from above its ghost).
    const stacked = streamOverGhost.filter(pair => { const [from, to] = pair.split('→').map(Number); const g = tubes[from], x = tubes[to].x + tubes[to].width / 2; return rows[to] > rows[from] && x > g.x - 4 && x < g.x + g.width + 4; });
    assert.deepEqual(streamOverGhost, stacked, 'stream passes over the ghost only for a bottle right below it');
    console.log(`${screen} stage ${stage}: ${pours} pours, highest rise ${Math.round(maxLift)} px${stacked.length ? `, stream over the ghost for ${stacked.join(', ')}` : ''}`);
  });
}
