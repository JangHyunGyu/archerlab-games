const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
const motionSource = fs.readFileSync(path.join(root, "js", "zombie-motion.js"), "utf8");

function extractConst(name, terminator = ";") {
  const regex = new RegExp(`const\\s+${name}\\s*=([\\s\\S]*?)${terminator}`);
  const match = gameSource.match(regex);
  assert.ok(match, `${name} must exist in js/game.js`);
  return match[1].trim();
}

// 1. Walk texture deduplication & new zombie wiring ("kendo", "cheer")
assert.match(
  gameSource,
  /const\s+ZOMBIE_MULTI_VARIANT_WALK_TYPES\s*=\s*new\s+Set\(\["normal"\]\)/,
  "Only multi-variant walk types should allocate 4 walk rows"
);
assert.match(
  gameSource,
  /const\s+variantCount\s*=\s*ZOMBIE_MULTI_VARIANT_WALK_TYPES\.has\(type\)\s*\?\s*4\s*:\s*1/,
  "createZombieSpriteTextures must slice 1 row for single-identity zombie types"
);
assert.match(
  gameSource,
  /const\s+variant\s*=\s*ZOMBIE_MULTI_VARIANT_WALK_TYPES\.has\(typeConfig\.id\)\s*\?\s*Math\.floor\(rand\(0,\s*4\)\)\s*:\s*0/,
  "spawnZombie must select variant 0 for single-identity zombie types"
);
for (const type of ["kendo", "cheer"]) {
  assert.match(gameSource, new RegExp(`\\b${type}:\\s*\\{\\s*id:\\s*"${type}"`), `${type} missing from ZOMBIE_TYPE_CONFIGS`);
  assert.match(gameSource, new RegExp(`ZOMBIE_TYPE_CONFIGS\\.${type}`), `${type} missing from pickZombieType`);
  assert.match(gameSource, new RegExp(`\\b${type}:\\s*\\{\\s*deathSize:`), `${type} missing from ZOMBIE_DEATH_RENDER_SCALES`);
  assert.match(gameSource, new RegExp(`"${type}"`), `${type} missing from atlas lists`);
  assert.match(motionSource, new RegExp(`\\b${type}:\\s*\\[`), `${type} missing from frameScales`);
}

// 2. HUD dirty memoization preserving exact hud-status.test.cjs contracts
assert.match(gameSource, /this\._hudCache\s*=\s*null/, "HUD cache must be initialized/reset");
assert.match(
  gameSource,
  /if\s*\(\s*cache\.timer\s*!==\s*timerText\s*\)/,
  "updateHud must memoize timer text updates"
);
assert.match(
  gameSource,
  /if\s*\(\s*cache\.progressWidth\s*!==\s*progressWidth\s*\)/,
  "updateHud must memoize progress bar geometry"
);
assert.match(gameSource, /const\s+hasShield\s*=\s*shieldValue\s*>\s*0/);
assert.match(gameSource, /this\.ui\.shield\.setText\(`SHIELD \+\$\{shieldValue\}`\)\.setVisible\(hasShield\)/);
assert.match(gameSource, /this\.shieldBar\.setSize\(380 \* shieldRate, 3\)\.setVisible\(hasShield\)/);

// 3. Pre-styled damage text pools (no per-hit setStyle)
assert.match(gameSource, /const\s+DAMAGE_TEXT_STYLES\s*=\s*\{/, "Pre-styled damage text presets missing");
assert.match(gameSource, /this\.damageTextPools\s*=\s*\{\s*normal:\s*\[\],\s*marked:\s*\[\],\s*crit:\s*\[\]\s*\}/);
const showDamageTextBlock = gameSource.match(/showDamageText\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || "";
assert.ok(showDamageTextBlock.length > 0, "showDamageText method must exist");
assert.ok(!showDamageTextBlock.includes(".setStyle("), "showDamageText must never call .setStyle() on pooled texts");

// 4. HitStop real-time cooldown
const requestHitStopMatch = gameSource.match(/requestHitStop\s*\([^)]*\)\s*(\{[\s\S]*?\n\s*\})\s*\n\s*restoreZombieTint/);
assert.ok(requestHitStopMatch, "requestHitStop method must remain inspectable");
const cooldownCalls = { hitStopTimer: 0, lastHitStopAt: 0, clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
let fakeNow = 1000;
const hitStopFn = vm.runInNewContext(
  `(function(duration = 0.025, options = {}) ${requestHitStopMatch[1]})`,
  { performance: { now: () => fakeNow }, Date, Math, clamp: cooldownCalls.clamp }
);
hitStopFn.call(cooldownCalls, 0.055);
assert.equal(cooldownCalls.hitStopTimer, 0.055);
cooldownCalls.hitStopTimer = 0;
fakeNow += 50;
hitStopFn.call(cooldownCalls, 0.055);
assert.equal(cooldownCalls.hitStopTimer, 0, "Normal hitStop must respect 300ms cooldown");
fakeNow += 120; // +170ms since trigger: blocked for normal, allowed for priority (150ms)
hitStopFn.call(cooldownCalls, 0.055, { priority: true });
assert.equal(cooldownCalls.hitStopTimer, 0.055, "Priority hitStop should fire after 150ms");

// 5. Flat spatial grid rebuild & bounded query behavior (including negative spawn y)
assert.match(gameSource, /const\s+ZOMBIE_GRID_CELL\s*=\s*96/);
assert.ok(!/getBulletHitCandidates|getNearbyZombies|updateFireZones|findShockChainTarget|createExplosion/.test("") && !gameSource.includes("zombieHitBuckets"), "Map-based zombieHitBuckets must be removed");
assert.ok(!/updateFireZones[\s\S]*?this\.zombies\.slice\(\)/.test(gameSource), "updateFireZones must query flat grid instead of scanning all zombies");
assert.ok(!/createExplosion[\s\S]*?this\.zombies\.slice\(\)/.test(gameSource), "createExplosion must query flat grid instead of scanning all zombies");

const rebuildMatch = gameSource.match(/\n\s+(rebuildZombieHitGrid\s*\(\)\s*\{[\s\S]*?\n\s{4}\})/);
const queryMatch = gameSource.match(/\n\s+(getZombiesInBounds\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\})/);
assert.ok(rebuildMatch && queryMatch, "Flat spatial grid methods must exist");
const gridHarness = {
  zombies: [
    { active: true, hp: 50, x: 45, y: -60, _gridQueryStamp: 0 },
    { active: true, hp: 50, x: 48, y: -55, _gridQueryStamp: 0 },
    { active: true, hp: 50, x: 450, y: 620, _gridQueryStamp: 0 },
    { active: false, hp: 0, x: 48, y: -50, _gridQueryStamp: 0 }
  ],
  zombieGridCells: Array.from({ length: 9 * 14 }, () => []),
  zombieGridActiveCells: [],
  zombieGridStamp: 0
};
vm.runInNewContext(
  `const ZOMBIE_GRID_CELL = 96; const ZOMBIE_GRID_COLS = 9; const ZOMBIE_GRID_ROWS = 14; const ZOMBIE_GRID_OFFSET_Y = 1;
   const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
   function ${rebuildMatch[1]}
   function ${queryMatch[1]}
   this.rebuild = rebuildZombieHitGrid; this.query = getZombiesInBounds;`,
  gridHarness
);
gridHarness.rebuild.call(gridHarness);
const topMatches = gridHarness.query.call(gridHarness, 0, 100, -80, 0, []);
assert.equal(topMatches.length, 2, "Flat grid must index negative spawn y and exclude inactive/distant zombies");
assert.equal(gridHarness.query.call(gridHarness, 400, 500, 580, 680, []).length, 1);

// 6, 7, 8: followingHitEffects, hitFlashTimer, killZombie in-place splice, _lastDepth, MAX_ACTIVE_FIRE_ZONES, crowd spark scaling
assert.match(gameSource, /this\.followingHitEffects\.forEach/);
assert.ok(!/updateFollowingHitEffects\s*\(\)\s*\{[\s\S]*?Array\.from\(this\.transientObjects/.test(gameSource), "updateFollowingHitEffects must not copy transientObjects every frame");
assert.match(gameSource, /zombie\.hitFlashTimer\s*=\s*0\.07/);
assert.ok(!/damageZombie[\s\S]*?this\.scheduleSceneDelay\(70,/.test(gameSource), "damageZombie must not allocate per-hit delayed timers");
assert.ok(!/killZombie[\s\S]*?this\.zombies\.filter/.test(gameSource), "killZombie must remove zombies in place without array filter allocation");
assert.match(gameSource, /zombie\._lastDepth\s*!==\s*nextDepth/);
assert.match(gameSource, /const\s+MAX_ACTIVE_FIRE_ZONES\s*=\s*8/);
assert.match(gameSource, /crowded\s*=\s*\(this\.zombies\s*&&\s*this\.zombies\.length\s*>=\s*25\)/);

console.log("horde performance optimizations verified: single-variant dedup, HUD cache, pre-styled damage pools, hitStop cooldown, flat spatial grid, following set, hit flash timer, in-place kill splice, and kendo/cheer wiring");
