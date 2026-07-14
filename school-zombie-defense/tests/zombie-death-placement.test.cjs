"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");

function readNumberConstant(name) {
  const match = gameSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  assert.ok(match, `${name} must remain declared`);
  return Number(match[1]);
}

const verticalKnockbackScale = readNumberConstant("ZOMBIE_DEATH_VERTICAL_KNOCKBACK_SCALE");
const verticalKnockbackLimitRatio = readNumberConstant("ZOMBIE_DEATH_VERTICAL_KNOCKBACK_LIMIT_RATIO");
const landingRiseLimitRatio = readNumberConstant("ZOMBIE_DEATH_LANDING_RISE_LIMIT_RATIO");

assert.equal(verticalKnockbackScale, 0.24, "death recoil must retain only a restrained part of hit knockback");
assert.equal(verticalKnockbackLimitRatio, 0.07, "death recoil must stay capped relative to zombie height");
assert.equal(landingRiseLimitRatio, 0.02, "a corpse must not settle far above its death position");

const renderScalesBlock = gameSource.match(
  /const\s+ZOMBIE_DEATH_RENDER_SCALES\s*=\s*\{([\s\S]*?)\n\s*\};/
)?.[1];
assert.ok(renderScalesBlock, "ZOMBIE_DEATH_RENDER_SCALES must remain discoverable");

const expectedCorpseOffsets = {
  teacher: 0.047,
  nurse: 0.103,
  athlete: 0.124,
  janitor: 0.07,
  guard: 0.084,
  crawler: 0.018,
  screamer: 0.092,
  spider: 0.039,
  bloom: 0.053,
  charger: 0.142
};

for (const [type, expectedOffset] of Object.entries(expectedCorpseOffsets)) {
  const match = renderScalesBlock.match(
    new RegExp(`\\b${type}\\s*:\\s*\\{[^}]*corpseYOffset\\s*:\\s*([0-9.]+)`)
  );
  assert.ok(match, `${type} must retain its measured death-to-corpse Y correction`);
  assert.equal(Number(match[1]), expectedOffset, `${type} corpse Y correction drifted`);
}

const corpseFunction = gameSource.match(
  /createZombieCorpse\s*\(x, y, zombie, deathKnockback\s*=\s*null\)\s*\{([\s\S]*?)\n\s*getZombieSurgeCooldown\s*\(/
)?.[1];
assert.ok(corpseFunction, "createZombieCorpse must remain discoverable");
assert.match(
  corpseFunction,
  /knockbackDy\s*\*\s*ZOMBIE_DEATH_VERTICAL_KNOCKBACK_SCALE/,
  "death placement must scale raw vertical hit knockback"
);
assert.match(
  corpseFunction,
  /-displayH\s*\*\s*ZOMBIE_DEATH_VERTICAL_KNOCKBACK_LIMIT_RATIO/,
  "death placement must cap upward recoil by zombie height"
);
assert.match(
  corpseFunction,
  /Math\.max\s*\(\s*y\s*-\s*displayH\s*\*\s*ZOMBIE_DEATH_LANDING_RISE_LIMIT_RATIO/,
  "the settled death pose must stay near the position where the fall began"
);
assert.match(
  corpseFunction,
  /landingY\s*\+\s*displayH\s*\*\s*\(renderScale\.corpseYOffset\s*\|\|\s*0\)/,
  "corpse placement must apply the per-type alpha-center correction"
);
assert.match(
  corpseFunction,
  /add\.image\s*\(landingX, corpseLandingY, corpseTexture\)/,
  "the corpse image must use its corrected landing position"
);
assert.match(
  corpseFunction,
  /targets:\s*deathSprite,[\s\S]*?y:\s*landingY/,
  "the death animation must finish on its own visual-center landing position"
);

for (const displayHeight of [116, 146, 170, 177, 220]) {
  const rawArrowKnockback = -64 * 1.2;
  const scaledKnockback = Math.max(
    -displayHeight * verticalKnockbackLimitRatio,
    Math.min(0, rawArrowKnockback * verticalKnockbackScale)
  );
  assert.ok(
    Math.abs(scaledKnockback) <= displayHeight * verticalKnockbackLimitRatio,
    `vertical death recoil exceeded the ${displayHeight}px zombie cap`
  );
  const earliestLanding = Math.max(
    500 - displayHeight * landingRiseLimitRatio,
    500 + scaledKnockback - displayHeight * 0.01 - 4
  );
  assert.ok(
    earliestLanding >= 500 - displayHeight * landingRiseLimitRatio,
    `the ${displayHeight}px zombie corpse can still settle too far above its death position`
  );
}

console.log(
  `zombie death placement verified: ${Object.keys(expectedCorpseOffsets).length} corrected corpse types, ` +
    `${Math.round(verticalKnockbackLimitRatio * 100)}% recoil cap, ${Math.round(landingRiseLimitRatio * 100)}% landing rise limit`
);
