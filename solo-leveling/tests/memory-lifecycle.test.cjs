"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "weapons", "ShadowDagger.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(
  source,
  /const TRAIL_INTERVAL_MS = 50;/,
  "the projectile trail cadence must remain explicit"
);
assert.match(
  source,
  /const trailRepeatCount = Math\.max\(0, Math\.floor\(duration \/ TRAIL_INTERVAL_MS\) - 1\);/,
  "Phaser timer repeat counts must be normalized to a non-negative integer"
);
assert.match(
  source,
  /delay: TRAIL_INTERVAL_MS,\s*repeat: trailRepeatCount,/,
  "the trail timer must use the normalized repeat count"
);
assert.doesNotMatch(
  source,
  /repeat:\s*duration \/ 50/,
  "fractional repeat counts retain completed Phaser timer events"
);

const removals = source.match(/trailInterval\.remove\(false\)/g) || [];
assert.equal(
  removals.length,
  2,
  "normal projectile completion and weapon teardown must both remove the trail timer"
);
assert.match(
  indexSource,
    /js\/main\.js\?v=20260716-combat-vfx-direction-v6/,
  "the deployed entry point must invalidate cached game modules"
);

console.log("shadow dagger timer lifecycle verified: integer repeats and explicit removal");
