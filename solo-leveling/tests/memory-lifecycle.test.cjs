"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "weapons", "ShadowDagger.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const gameOverSource = fs.readFileSync(path.join(root, "js", "scenes", "GameOverScene.js"), "utf8");

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
  /js\/main\.js\?v=20260831-rank-sync-retry-v1/,
  "the deployed entry point must invalidate cached game modules"
);
assert.match(
  gameOverSource,
  /typeof context\?\.drawElementImage === 'function'[\s\S]*typeof renderCanvas\.requestPaint === 'function'/,
  "HTML-in-Canvas must be enabled only after runtime feature detection"
);
assert.match(
  gameOverSource,
  /renderCanvas\.setAttribute\('layoutsubtree', 'true'\);\s*const context = renderCanvas\.getContext\('2d'\);/,
  "layoutsubtree must be enabled before creating the experimental 2D context"
);
assert.match(
  gameOverSource,
  /if \(!supportsHtmlInCanvas\) \{\s*document\.body\.appendChild\(inputShell\);\s*return;/,
  "unsupported browsers must retain the existing DOM input fallback"
);
assert.match(
  gameOverSource,
  /_requestNameInputCanvasPaint\(\)[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*requestPaint\(\)/,
  "the first experimental paint must wait for a browser layout frame"
);
assert.match(
  gameOverSource,
  /_disableNameInputCanvas\(\)[\s\S]*document\.body\.appendChild\(shell\)[\s\S]*canvas\.remove\(\)/,
  "runtime drawing failures must restore the DOM input before removing the canvas"
);
assert.match(
  gameOverSource,
  /if \(this\._nameInputCanvas\) \{[\s\S]*this\._nameInputCanvas\.onpaint = null;[\s\S]*this\._nameInputCanvas\.remove\(\);/,
  "scene cleanup must detach the experimental canvas paint handler"
);

console.log("solo-leveling lifecycle verified: timers, cache busting, and HTML-in-Canvas fallback");
