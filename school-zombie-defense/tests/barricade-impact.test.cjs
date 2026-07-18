"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");

function readNumberConstant(name) {
  const match = gameSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  assert.ok(match, `${name} must remain declared`);
  return Number(match[1]);
}

const displayWidth = readNumberConstant("BARRICADE_IMPACT_DISPLAY_WIDTH");
const duration = readNumberConstant("BARRICADE_IMPACT_DURATION");
const fragmentLimit = readNumberConstant("BARRICADE_FRAGMENT_LIMIT");
const woodMin = readNumberConstant("BARRICADE_WOOD_FRAGMENT_MIN");
const woodMax = readNumberConstant("BARRICADE_WOOD_FRAGMENT_MAX");
const metalMin = readNumberConstant("BARRICADE_METAL_FRAGMENT_MIN");
const metalMax = readNumberConstant("BARRICADE_METAL_FRAGMENT_MAX");

assert.equal(displayWidth, 240, "the contact burst must remain readable on a 390px mobile viewport");
assert.equal(duration, 320, "the enlarged impact must remain visible long enough to register");
assert.equal(fragmentLimit, 30, "simultaneous barricade debris must stay mobile-safe");
assert.deepEqual([woodMin, woodMax], [3, 5], "each full hit needs a restrained wood fragment range");
assert.deepEqual([metalMin, metalMax], [1, 2], "each full hit needs only a small metal spark range");

assert.match(gameSource, /this\.activeBarricadeFragments\s*=\s*new Set\(\)/);
assert.match(
  gameSource,
  /if \(object\?\.barricadeFragment\)[\s\S]*?this\.activeBarricadeFragments\.delete\(object\)/,
  "destroyed debris must leave the active fragment budget"
);
assert.match(
  gameSource,
  /createBarricadeDebris\(x, y\)\s*\{[\s\S]*?if \(this\.reducedMotion\)[\s\S]*?BARRICADE_FRAGMENT_LIMIT - this\.activeBarricadeFragments\.size[\s\S]*?createBarricadeFragment/,
  "debris spawning must respect reduced motion and the global fragment cap"
);
assert.match(
  gameSource,
  /createBarricadeFragment\(x, y, kind\)\s*\{[\s\S]*?kind === "metal"[\s\S]*?setStrokeStyle[\s\S]*?y: y - rise[\s\S]*?y: landingY[\s\S]*?destroyTransientObject\(fragment, false\)/,
  "wood and metal fragments must arc upward, fall, and clean themselves up"
);
assert.match(
  gameSource,
  /createHitAtBarricade\(x\)\s*\{[\s\S]*?BARRICADE_IMPACT_DISPLAY_WIDTH[\s\S]*?0xffa45f, 0\.28[\s\S]*?createBarricadeDebris\(effectX, effectY\)[\s\S]*?BARRICADE_IMPACT_DURATION/,
  "barricade hits must combine the enlarged burst, stronger flash, and procedural debris"
);
assert.match(indexSource, /js\/game\.js\?v=20260718-bow-assets-v6/);

console.log(
  `barricade impact verified: ${displayWidth}px burst, ${duration}ms hold, ` +
    `${woodMin}-${woodMax} wood + ${metalMin}-${metalMax} metal fragments, ${fragmentLimit} active cap`
);
