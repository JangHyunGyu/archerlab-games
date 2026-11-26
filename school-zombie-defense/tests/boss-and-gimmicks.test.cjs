const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
const i18nSource = fs.readFileSync(path.join(root, "js", "i18n.js"), "utf8");

// 1. Validate gimmick fields in ZOMBIE_TYPE_CONFIGS
const configsMatch = gameSource.match(/const ZOMBIE_TYPE_CONFIGS = (\{[^]*?\n  \});/);
assert.ok(configsMatch, "ZOMBIE_TYPE_CONFIGS must remain discoverable");
const configs = vm.runInNewContext(`(${configsMatch[1]})`);

assert.ok(configs.nurse.healAuraInterval > 0 && configs.nurse.healAuraRadius > 0 && configs.nurse.healAuraRatio > 0, "nurse must configure heal aura");
assert.ok(configs.screamer.hasteRoarInterval > 0 && configs.screamer.hasteSpeedScale > 1, "screamer must configure haste roar");
assert.ok(configs.cheer.hasteRoarInterval > 0 && configs.cheer.hasteSpeedScale > 1, "cheer must configure cheer haste");
assert.ok(configs.guard.armorReduction > 0 && configs.guard.armorReduction < 1, "guard must configure armor reduction");
assert.ok(configs.kendo.parryCharges >= 1 && configs.kendo.parryCooldown > 0, "kendo must configure parry charges");
assert.equal(configs.diva.tauntAura, true, "diva must configure taunt aura");
assert.ok(configs.diva.tauntRadius > 0, "diva must configure positive taunt radius");
assert.ok(configs.volleyball.surgeSpeedScale > 1, "volleyball must configure spike surge");
assert.equal(configs.plump.tauntAura, true, "plump must configure taunt aura");
assert.ok(configs.swimmer.slowResist > 0 && configs.swimmer.slowResist < 1, "swimmer must configure slow resistance");
assert.ok(configs.ballet.parryCharges >= 1, "ballet must configure parry charges");
assert.ok(configs.librarian.veilAuraInterval > 0 && configs.librarian.veilReduction > 0, "librarian must configure veil aura");

for (const cfg of Object.values(configs)) {
  assert.ok(cfg.reward >= 1 && cfg.reward <= 4, `${cfg.id} reward must remain clamped in 1..4`);
}

// 2. Validate Stage Boss Wave configuration and progression helpers
const bossCfgMatch = gameSource.match(/const STAGE_BOSS_CONFIGS = (\{[^]*?\n  \});/);
assert.ok(bossCfgMatch, "STAGE_BOSS_CONFIGS must exist");
const bossConfigs = vm.runInNewContext(`(${bossCfgMatch[1]})`);
assert.deepEqual(Object.keys(bossConfigs).sort(), ["1", "2", "3", "4"]);
for (const [stage, cfg] of Object.entries(bossConfigs)) {
  assert.ok(configs[cfg.type], `stage ${stage} boss type ${cfg.type} must exist`);
  assert.ok(cfg.hpMultiplier >= 4, `stage ${stage} boss hpMultiplier must scale cleanly`);
  assert.ok(Array.isArray(cfg.escorts) && cfg.escorts.length >= 2, `stage ${stage} boss must declare escorts`);
}

const isBossWaveMatch = gameSource.match(/const isBossWave = ([^;]+);/);
assert.ok(isBossWaveMatch, "isBossWave helper must exist");
const isBossWave = vm.runInNewContext(`(${isBossWaveMatch[1]})`);
assert.equal(isBossWave(1), false);
assert.equal(isBossWave(3), false);
assert.equal(isBossWave(4), true);
assert.equal(isBossWave(8), true);
assert.equal(isBossWave(12), true);

// 3. Validate runtime integration in GameScene
assert.match(gameSource, /updateZombieGimmicks\s*\(zombie,\s*dt\)/, "updateZombies must update zombie gimmicks");
assert.match(gameSource, /zombie\.parryCharges\s*>\s*0/, "damageZombie must enforce kendo parry");
assert.match(gameSource, /zombie\.armorReduction\s*>\s*0/, "damageZombie must enforce guard armor reduction");
assert.match(gameSource, /zombie\.tauntAura/, "findTarget must prioritize diva taunt aura");
assert.match(gameSource, /spawnStageBoss\s*\(\)/, "GameScene must implement spawnStageBoss");
assert.match(gameSource, /spawnBossEscorts\s*\(boss\)/, "GameScene must implement spawnBossEscorts");
assert.match(gameSource, /createBossHud\s*\(\)/, "GameScene must implement createBossHud");
assert.match(gameSource, /updateBossHud\s*\(\)/, "GameScene must implement updateBossHud");
assert.match(gameSource, /this\.bossDefeatedForLevel !== this\.level/, "boss waves must gate wave clear on boss defeat");

// 4. Validate bilingual i18n keys for bosses and parry
for (const key of [
  "boss.warning",
  "boss.defeated",
  "boss.escort",
  "boss.brute",
  "boss.diva",
  "boss.guard",
  "boss.elite",
  "boss.hudTag",
  "gimmick.parry"
]) {
  assert.ok(i18nSource.includes(`"${key}"`), `i18n.js missing key ${key}`);
}

console.log("boss and gimmicks verified: 6 archetype gimmicks, 4 stage bosses, boss HUD, clear gate, and bilingual keys");
