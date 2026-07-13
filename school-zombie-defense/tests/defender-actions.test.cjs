"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
const imageRoot = path.join(root, "assets", "images");

const releaseFramesBlock = gameSource.match(
  /const\s+CHARACTER_ATTACK_RELEASE_FRAMES\s*=\s*\{([\s\S]*?)\};/
)?.[1];
assert.ok(releaseFramesBlock, "CHARACTER_ATTACK_RELEASE_FRAMES must be declared");

for (const [defenderId, expectedFrame] of Object.entries({ a: 2, d: 1, f: 2, g: 1 })) {
  const frameMatch = releaseFramesBlock.match(new RegExp(`\\b${defenderId}\\s*:\\s*(\\d+)\\b`));
  assert.ok(frameMatch, `release frame for defender ${defenderId.toUpperCase()} must be declared`);
  assert.equal(Number(frameMatch[1]), expectedFrame, `defender ${defenderId.toUpperCase()} release frame drifted`);
}

assert.match(
  gameSource,
  /startDefenderAttackAnimation\s*\(\s*defender\s*,\s*pose\s*,\s*onRelease(?:\s*=\s*null)?\s*\)/,
  "attack animation must accept an onRelease callback"
);

const animationUpdate = gameSource.match(
  /updateDefenderAnimations\s*\(dt\)\s*\{([\s\S]*?)\n\s*updateSpawning\s*\(dt\)\s*\{/
)?.[1];
assert.ok(animationUpdate, "updateDefenderAnimations must remain discoverable");
assert.doesNotMatch(
  animationUpdate,
  /setDefenderPose\s*\(\s*defender\s*,\s*["']aim-12["']\s*\)/,
  "attack completion must preserve the defender's last aim instead of forcing aim-12"
);

const assetVersion = gameSource.match(
  /const\s+CHARACTER_ASSET_VERSION\s*=\s*["']([^"']+)["']/
)?.[1];
assert.ok(assetVersion, "CHARACTER_ASSET_VERSION must be declared");
assert.ok(!assetVersion.startsWith("20260712"), "character asset cache version must be bumped for the new sheets");

function readPngDimensions(filePath) {
  const contents = fs.readFileSync(filePath);
  assert.ok(contents.length >= 24, `${path.basename(filePath)} must contain a complete PNG header`);
  assert.ok(
    contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    `${path.basename(filePath)} must have the PNG signature`
  );
  assert.equal(contents.subarray(12, 16).toString("ascii"), "IHDR", `${path.basename(filePath)} must start with IHDR`);
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20)
  };
}

const sheets = [
  ...[1, 2, 3].map(frame => ({ name: `character-d-attack-${frame}`, width: 2016, height: 362 })),
  ...[0, 1, 2, 3].map(frame => ({ name: `character-g-attack-${frame}`, width: 1584, height: 256 }))
];

for (const sheet of sheets) {
  const pngPath = path.join(imageRoot, `${sheet.name}.png`);
  const webpPath = path.join(imageRoot, `${sheet.name}.webp`);
  assert.ok(fs.existsSync(pngPath), `${sheet.name}.png must exist`);
  assert.ok(fs.existsSync(webpPath), `${sheet.name}.webp must exist`);
  assert.deepEqual(
    readPngDimensions(pngPath),
    { width: sheet.width, height: sheet.height },
    `${sheet.name}.png must keep its nine-direction sheet dimensions`
  );
}

console.log(`defender actions verified: ${sheets.length} PNG/WebP sheet pairs, asset version ${assetVersion}`);
