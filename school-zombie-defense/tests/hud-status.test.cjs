const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const gamePath = path.join(__dirname, "..", "js", "game.js");
const gameSource = fs.readFileSync(gamePath, "utf8");

const statusPanel = gameSource.match(
  /createStatusPanel\s*\(\)\s*\{([\s\S]*?)\n\s*bindInput\s*\(/
)?.[1];
assert.ok(statusPanel, "createStatusPanel must remain discoverable");

const hudChips = [...statusPanel.matchAll(/this\.addHudChip\s*\(/g)];
assert.equal(hudChips.length, 1, "the combat HUD must only keep the supply chip");
assert.match(
  statusPanel,
  /this\.addHudChip\s*\(270, 91, 176, "보급", "\$0", COLORS\.gold\)/,
  "the supply chip must remain centered after removing side chips"
);
assert.doesNotMatch(statusPanel, /"사기"|"보호막"/, "morale and persistent shield chips must not return");
assert.match(statusPanel, /this\.ui\.statusChips\s*=\s*\{ coins \}/, "status chip tracking must only contain supply");
assert.match(
  statusPanel,
  /this\.ui\.shield\s*=\s*this\.add\.text\(270, 913, "SHIELD \+0"[\s\S]*?\.setVisible\(false\)/,
  "the shield value must start hidden inside the barricade panel"
);
assert.match(
  statusPanel,
  /this\.shieldBar\s*=\s*this\.add\.rectangle\(80, 927, 380, 3, COLORS\.blue, 1\)[\s\S]*?\.setVisible\(false\)/,
  "the shield bar must start hidden above the barricade health bar"
);

assert.doesNotMatch(gameSource, /this\.morale/, "morale must not duplicate barricade health state");
assert.match(
  gameSource,
  /if \(this\.shield > 0\)[\s\S]*?blocked = Math\.min\(this\.shield, amount\)[\s\S]*?this\.shield -= blocked/,
  "removing the persistent HUD chip must preserve shield damage absorption"
);
assert.match(gameSource, /this\.shield \+= barricadeShield/, "the engineer barricade skill must still grant shield");

const updateHud = gameSource.match(
  /updateHud\s*\(\)\s*\{([\s\S]*?)\r?\n\s{4}\}\r?\n\s{2}\}\r?\n\r?\n\s{2}if \(!window\.Phaser\)/
)?.[1];
assert.ok(updateHud, "updateHud must remain discoverable");
assert.match(updateHud, /const hasShield = shieldValue > 0/, "shield visibility must follow its current value");
assert.match(
  updateHud,
  /this\.ui\.shield\.setText\(`SHIELD \+\$\{shieldValue\}`\)\.setVisible\(hasShield\)/,
  "the shield badge must only appear while shield is active"
);
assert.match(
  updateHud,
  /this\.shieldBar\.setSize\(380 \* shieldRate, 3\)\.setVisible\(hasShield\)/,
  "the conditional shield bar must reflect shield strength"
);
assert.doesNotMatch(updateHud, /morale/, "threat messaging must rely on barricade health alone");

console.log("HUD status verified: centered supply chip, no morale duplicate, conditional shield badge and bar");
