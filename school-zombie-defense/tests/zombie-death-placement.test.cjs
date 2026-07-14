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

assert.doesNotMatch(
  gameSource,
  /ZOMBIE_CORPSE_TEXTURES|zombie-corpse-/,
  "standalone corpse assets must not be registered or preloaded"
);

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
  /const deathFrameEvent = this\.playTransientSpriteFrames\s*\(deathSprite, deathFrameCount, effect\.fall \+ 260\)/,
  "the death sheet must play through its configured frames"
);
assert.match(
  corpseFunction,
  /cancelTimerEvent\s*\(deathFrameEvent\)[\s\S]*?\.setFrame\s*\(deathFrameCount - 1\)/,
  "settling must stop the animation timer before locking the final frame"
);
assert.match(
  corpseFunction,
  /\.setFrame\s*\(deathFrameCount - 1\)/,
  "the settled corpse must explicitly hold the final death frame"
);
assert.match(
  corpseFunction,
  /\.setPosition\s*\(landingX, landingY\)/,
  "the final death frame must retain the animation landing position"
);
assert.match(
  corpseFunction,
  /settleCorpseObjectDepth\s*\(deathSprite, corpseDepth \+ 0\.45\)/,
  "the final death frame must move into the persistent corpse depth band"
);
assert.match(
  corpseFunction,
  /depthEntry\.depth\s*=\s*depth/,
  "settling must update the stored depth used by later corpse ordering"
);
assert.match(
  corpseFunction,
  /\{ object: deathSprite, depth: bodyDepth \+ 0\.9 \}/,
  "the death animation must retain live-body depth until it settles"
);
assert.match(
  corpseFunction,
  /const corpseTarget = deathSprite && !deathSprite\.destroyed[\s\S]*?\? deathSprite/,
  "the final death frame must remain the corpse fade target"
);
assert.doesNotMatch(
  corpseFunction,
  /corpseImage|corpseTexture|revealCorpseImage/,
  "death completion must not swap to a separately positioned corpse image"
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
  `zombie death placement verified: final-frame corpse reuse, ` +
    `${Math.round(verticalKnockbackLimitRatio * 100)}% recoil cap, ${Math.round(landingRiseLimitRatio * 100)}% landing rise limit`
);
