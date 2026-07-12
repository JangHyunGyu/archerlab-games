import assert from "node:assert/strict";
import test from "node:test";

import { gravityIntervalMs } from "../js/gravity.mjs";

const stageState = (stageOrdinal) => ({
  stageOrdinal,
  level: Math.floor((stageOrdinal * 14) / 10) + 1,
});

test("gravity becomes meaningfully faster at every stage", () => {
  const intervals = Array.from({ length: 12 }, (_, stageOrdinal) => (
    gravityIntervalMs(stageState(stageOrdinal))
  ));

  for (let stage = 1; stage < intervals.length; stage += 1) {
    assert.ok(
      intervals[stage] < intervals[stage - 1],
      `stage ${stage + 1} should be faster than stage ${stage}`,
    );
  }

  assert.equal(intervals[0], 900);
  assert.ok(intervals[1] <= 750, "stage 2 should be visibly faster than stage 1");
  assert.ok(intervals[4] <= 500, "stage 5 should take roughly half as long per row");
});

test("relax gravity is slower instead of faster", () => {
  const journey = gravityIntervalMs(stageState(3));
  const relax = gravityIntervalMs({ ...stageState(3), gravityScale: 0.78 });

  assert.ok(relax > journey);
});

test("zone pauses gravity and extreme stages keep a playable floor", () => {
  assert.equal(gravityIntervalMs({ zoneActive: true }), Infinity);
  assert.ok(gravityIntervalMs({ stageOrdinal: 500, level: 500, combo: 99 }) >= 50);
});
