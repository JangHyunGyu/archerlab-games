"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
const imageRoot = path.join(root, "assets", "images");

function readNumberConstant(name) {
  const match = gameSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  assert.ok(match, `${name} must remain declared`);
  return Number(match[1]);
}

function readPngHeader(filePath) {
  const contents = fs.readFileSync(filePath);
  assert.ok(contents.length >= 33, `${path.basename(filePath)} must contain a complete PNG header`);
  assert.ok(
    contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    `${path.basename(filePath)} must have the PNG signature`
  );
  assert.equal(contents.subarray(12, 16).toString("ascii"), "IHDR", `${path.basename(filePath)} must start with IHDR`);
  return {
    contents,
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
    bitDepth: contents[24],
    colorType: contents[25],
    compression: contents[26],
    filter: contents[27],
    interlace: contents[28]
  };
}

function paethPredictor(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodePngAlpha(filePath) {
  const header = readPngHeader(filePath);
  assert.deepEqual(
    { bitDepth: header.bitDepth, colorType: header.colorType, compression: header.compression, filter: header.filter, interlace: header.interlace },
    { bitDepth: 8, colorType: 6, compression: 0, filter: 0, interlace: 0 },
    `${path.basename(filePath)} must remain a non-interlaced 8-bit RGBA asset`
  );
  const idat = [];
  let offset = 8;
  while (offset + 12 <= header.contents.length) {
    const length = header.contents.readUInt32BE(offset);
    const type = header.contents.subarray(offset + 4, offset + 8).toString("ascii");
    const dataOffset = offset + 8;
    assert.ok(dataOffset + length + 4 <= header.contents.length, `${path.basename(filePath)} has a truncated ${type} chunk`);
    if (type === "IDAT") idat.push(header.contents.subarray(dataOffset, dataOffset + length));
    offset = dataOffset + length + 4;
    if (type === "IEND") break;
  }
  assert.ok(idat.length, `${path.basename(filePath)} must contain image data`);

  const bytesPerPixel = 4;
  const stride = header.width * bytesPerPixel;
  const filtered = zlib.inflateSync(Buffer.concat(idat));
  assert.equal(filtered.length, (stride + 1) * header.height, `${path.basename(filePath)} has incomplete scanlines`);
  const pixels = Buffer.allocUnsafe(stride * header.height);
  let sourceOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filterType = filtered[sourceOffset];
    sourceOffset += 1;
    assert.ok(filterType <= 4, `${path.basename(filePath)} uses unsupported PNG filter ${filterType}`);
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const encoded = filtered[sourceOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[rowOffset - stride + x - bytesPerPixel] : 0;
      let prediction = 0;
      if (filterType === 1) prediction = left;
      else if (filterType === 2) prediction = up;
      else if (filterType === 3) prediction = Math.floor((left + up) / 2);
      else if (filterType === 4) prediction = paethPredictor(left, up, upperLeft);
      pixels[rowOffset + x] = (encoded + prediction) & 0xff;
    }
    sourceOffset += stride;
  }

  const alpha = new Uint8Array(header.width * header.height);
  for (let pixel = 0, source = 3; pixel < alpha.length; pixel += 1, source += bytesPerPixel) {
    alpha[pixel] = pixels[source];
  }
  return { alpha, width: header.width, height: header.height };
}

function measureAlphaRegion(image, startX, startY, width, height, threshold = 8) {
  let weight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const rowOffset = (startY + y) * image.width + startX;
    for (let x = 0; x < width; x += 1) {
      const alpha = image.alpha[rowOffset + x];
      if (alpha <= threshold) continue;
      weight += alpha;
      weightedX += (x + 0.5) * alpha;
      weightedY += (y + 0.5) * alpha;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  assert.ok(weight > 0, "measured alpha region must contain visible pixels");
  return {
    centerX: weightedX / weight,
    centerY: weightedY / weight,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    alphaCoverage: weight / (255 * width * height)
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function assertNear(actual, expected, label, tolerance = 0.0001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

function assertPngWebpAlphaParity(assetNames) {
  const pairs = assetNames.map((name) => [
    path.join(imageRoot, `${name}.png`),
    path.join(imageRoot, `${name}.webp`)
  ]);
  const pythonSource = [
    "import json, sys",
    "from PIL import Image",
    "for png_path, webp_path in json.load(sys.stdin):",
    "    with Image.open(png_path) as png_source, Image.open(webp_path) as webp_source:",
    "        png = png_source.convert('RGBA')",
    "        webp = webp_source.convert('RGBA')",
    "        if png.size != webp.size:",
    "            raise SystemExit(f'{webp_path} dimensions differ from its PNG')",
    "        if png.getchannel('A').tobytes() != webp.getchannel('A').tobytes():",
    "            raise SystemExit(f'{webp_path} alpha channel differs from its PNG')"
  ].join("\n");
  const input = JSON.stringify(pairs);
  let result = childProcess.spawnSync("python", ["-c", pythonSource], { input, encoding: "utf8" });
  if (result.error?.code === "ENOENT") {
    result = childProcess.spawnSync("py", ["-3", "-c", pythonSource], { input, encoding: "utf8" });
  }
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `PNG/WebP alpha parity is required for corpse anchors: ${(result.stderr || result.stdout).trim()}`
  );
}

const verticalKnockbackScale = readNumberConstant("ZOMBIE_DEATH_VERTICAL_KNOCKBACK_SCALE");
const verticalKnockbackLimitRatio = readNumberConstant("ZOMBIE_DEATH_VERTICAL_KNOCKBACK_LIMIT_RATIO");
const landingRiseLimitRatio = readNumberConstant("ZOMBIE_DEATH_LANDING_RISE_LIMIT_RATIO");
const hitEffectSizeMultiplier = readNumberConstant("ZOMBIE_HIT_EFFECT_SIZE_MULTIPLIER");
const bloodStainSizeMultiplier = readNumberConstant("BLOOD_STAIN_SIZE_MULTIPLIER");
const groundDepthBase = readNumberConstant("ZOMBIE_CORPSE_GROUND_DEPTH_BASE");
const groundDepthRange = readNumberConstant("ZOMBIE_CORPSE_GROUND_DEPTH_RANGE");
const corpseDepthBase = readNumberConstant("ZOMBIE_CORPSE_DEPTH_BASE");
const recentDepthStep = readNumberConstant("ZOMBIE_CORPSE_RECENT_DEPTH_STEP");
const activeCorpseLimit = readNumberConstant("ACTIVE_CORPSE_LIMIT");

assert.equal(verticalKnockbackScale, 1, "lethal hits must carry their full knockback into the death fall");
assert.equal(verticalKnockbackLimitRatio, 0.35, "death recoil must only cap extreme lane displacement");
assert.equal(landingRiseLimitRatio, 0.28, "a corpse must be allowed to land behind its death position");
assert.equal(hitEffectSizeMultiplier, 1.35, "zombie hit effects must remain visibly enlarged");
assert.equal(bloodStainSizeMultiplier, 2, "corpse blood stains must be twice their previous visual size");
assert.equal(groundDepthBase, 25, "ground decals must stay above the arena floor art");
assert.equal(groundDepthRange, 8, "ground decals must use their isolated narrow depth band");
assert.equal(corpseDepthBase, 34, "corpse bodies must retain their established depth band");
const highestGroundDepth = groundDepthBase + groundDepthRange + (activeCorpseLimit - 1) * recentDepthStep;
const lowestCorpseDepth = corpseDepthBase + 0.4;
assert.ok(
  highestGroundDepth < lowestCorpseDepth,
  `ground decals can cover a corpse: ${highestGroundDepth} >= ${lowestCorpseDepth}`
);
assert.ok(groundDepthBase - 0.4 > 24, "corpse shadows must remain above the arena floor art");

assert.doesNotMatch(
  gameSource,
  /ZOMBIE_CORPSE_TEXTURES|zombie-corpse-/,
  "standalone corpse assets must not be registered or preloaded"
);

const expectedDeathTextures = [
  ...[1, 2, 3, 4].map((index) => `zombie-death-normal-variant-${index}-sheet`),
  ...[1, 2, 3].map((index) => `zombie-death-student-${index}-sheet`),
  ...[
    "runner", "brute", "volatile", "elite", "teacher", "nurse", "athlete",
    "janitor", "guard", "crawler", "screamer", "spider", "bloom", "charger"
  ].map((type) => `zombie-death-${type}-sheet`)
];
const deathRenderScalesBlock = gameSource.match(
  /const\s+ZOMBIE_DEATH_RENDER_SCALES\s*=\s*\{([\s\S]*?)\n\s*\};/
)?.[1];
assert.ok(deathRenderScalesBlock, "death render scales must remain discoverable");
const deathRenderScales = new Map(
  [...deathRenderScalesBlock.matchAll(
    /([a-z]+)\s*:\s*\{\s*deathSize:\s*([0-9.]+)\s*\}/g
  )].map((match) => [match[1], Number(match[2])])
);
assert.deepEqual(
  [...deathRenderScales.keys()].sort(),
  [...new Set(expectedDeathTextures.map((texture) => (
    texture.includes("normal-variant")
      ? "normal"
      : texture.includes("student-")
        ? "student"
        : texture.replace(/^zombie-death-|-sheet$/g, "")
  )))].sort(),
  "every zombie type must have an explicit death render scale"
);

const deathTexturesByType = new Map([
  ["normal", [1, 2, 3, 4].map((index) => `zombie-death-normal-variant-${index}-sheet`)],
  ["student", [1, 2, 3].map((index) => `zombie-death-student-${index}-sheet`)],
  ...[
    "runner", "brute", "volatile", "elite", "teacher", "nurse", "athlete",
    "janitor", "guard", "crawler", "screamer", "spider", "bloom", "charger"
  ].map((type) => [type, [`zombie-death-${type}-sheet`]])
]);
for (const [type, deathTextures] of deathTexturesByType) {
  const walkImage = decodePngAlpha(path.join(imageRoot, `zombie-walk-${type}.png`));
  const walkCellWidth = Math.floor(walkImage.width / 4);
  const walkCellHeight = Math.floor(walkImage.height / 4);
  const walkMeasurementsByVariant = Array.from({ length: 4 }, (_, variant) => (
    Array.from({ length: 4 }, (_, frame) => measureAlphaRegion(
      walkImage,
      frame * walkCellWidth,
      variant * walkCellHeight,
      walkCellWidth,
      walkCellHeight
    ))
  ));
  const deathSize = deathRenderScales.get(type);

  if (type === "normal") {
    deathTextures.forEach((texture, variant) => {
      const walkAlphaCoverage = median(
        walkMeasurementsByVariant[variant].map((measurement) => measurement.alphaCoverage)
      );
      const deathImage = decodePngAlpha(path.join(imageRoot, `${texture}.png`));
      const deathMeasurement = measureAlphaRegion(deathImage, 0, 0, 512, 512);
      const renderedAreaRatio = deathMeasurement.alphaCoverage * deathSize ** 2 / walkAlphaCoverage;
      assert.ok(
        renderedAreaRatio >= 0.95 && renderedAreaRatio <= 1.05,
        `${texture} visible body area differs from walk variant ${variant + 1}: ${renderedAreaRatio}`
      );
    });
    continue;
  }

  const walkVisibleHeightRatio = median(
    walkMeasurementsByVariant.flat().map((measurement) => measurement.height / walkCellHeight)
  );
  for (const texture of deathTextures) {
    const deathImage = decodePngAlpha(path.join(imageRoot, `${texture}.png`));
    const deathMeasurement = measureAlphaRegion(deathImage, 0, 0, 512, 512);
    const renderedHeightRatio = deathMeasurement.height / 512 * deathSize / walkVisibleHeightRatio;
    assert.ok(
      renderedHeightRatio >= 0.985 && renderedHeightRatio <= 1.015,
      `${texture} first-frame height differs from the walk cycle: ${renderedHeightRatio}`
    );
  }
}

const finalFrameBoundsBlock = gameSource.match(
  /const\s+ZOMBIE_DEATH_FINAL_FRAME_BOUNDS\s*=\s*\{([\s\S]*?)\n\s*\};/
)?.[1];
assert.ok(finalFrameBoundsBlock, "final-frame alpha bounds must remain discoverable");
const finalFrameBounds = new Map(
  [...finalFrameBoundsBlock.matchAll(
    /"([^"]+)"\s*:\s*\{\s*x:\s*(-?[0-9.]+),\s*y:\s*(-?[0-9.]+),\s*width:\s*([0-9.]+),\s*height:\s*([0-9.]+)\s*\}/g
  )].map((match) => [
    match[1],
    { x: Number(match[2]), y: Number(match[3]), width: Number(match[4]), height: Number(match[5]) }
  ])
);
assert.deepEqual(
  [...finalFrameBounds.keys()].sort(),
  [...expectedDeathTextures].sort(),
  "all 21 shipped final death frames must have measured alpha bounds"
);
assert.equal(finalFrameBounds.get("zombie-death-normal-variant-1-sheet").y, 0.2986);
assert.equal(finalFrameBounds.get("zombie-death-normal-variant-3-sheet").y, 0.3254);
assert.equal(finalFrameBounds.get("zombie-death-charger-sheet").x, -0.0703);
for (const [texture, bounds] of finalFrameBounds) {
  assert.ok(Math.abs(bounds.x) < 0.5 && Math.abs(bounds.y) < 0.5, `${texture} alpha center left its frame`);
  assert.ok(bounds.width > 0 && bounds.width <= 1, `${texture} alpha width is invalid`);
  assert.ok(bounds.height > 0 && bounds.height <= 1, `${texture} alpha height is invalid`);
  const image = decodePngAlpha(path.join(imageRoot, `${texture}.png`));
  assert.equal(image.width % 512, 0, `${texture} width must contain complete 512px frames`);
  assert.equal(image.height % 512, 0, `${texture} height must contain complete 512px frames`);
  const frameCount = texture.includes("normal-variant") ? 12 : 4;
  const columns = image.width / 512;
  const finalFrameIndex = frameCount - 1;
  const measured = measureAlphaRegion(
    image,
    (finalFrameIndex % columns) * 512,
    Math.floor(finalFrameIndex / columns) * 512,
    512,
    512
  );
  assertNear((measured.centerX - 256) / 512, bounds.x, `${texture} alpha center X`);
  assertNear((measured.centerY - 256) / 512, bounds.y, `${texture} alpha center Y`);
  assertNear(measured.width / 512, bounds.width, `${texture} alpha width`);
  assertNear(measured.height / 512, bounds.height, `${texture} alpha height`);
}

const bloodOriginsBlock = gameSource.match(
  /const\s+BLOOD_STAIN_ALPHA_ORIGINS\s*=\s*\{([\s\S]*?)\n\s*\};/
)?.[1];
assert.ok(bloodOriginsBlock, "blood alpha origins must remain discoverable");
const bloodOrigins = new Map(
  [...bloodOriginsBlock.matchAll(
    /"([^"]+)"\s*:\s*\{\s*x:\s*([0-9.]+),\s*y:\s*([0-9.]+)\s*\}/g
  )].map((match) => [match[1], { x: Number(match[2]), y: Number(match[3]) }])
);
assert.equal(bloodOrigins.size, 7, "all six stains and the fallback burst need measured alpha origins");
assert.equal(bloodOrigins.get("blood-stain-direction-1").x, 0.3823);
assert.equal(bloodOrigins.get("blood-stain-pool-1").y, 0.4252);
for (const [texture, origin] of bloodOrigins) {
  const image = decodePngAlpha(path.join(imageRoot, `${texture}.png`));
  const measured = measureAlphaRegion(image, 0, 0, image.width, image.height);
  assertNear(measured.centerX / image.width, origin.x, `${texture} alpha origin X`);
  assertNear(measured.centerY / image.height, origin.y, `${texture} alpha origin Y`);
}
assertPngWebpAlphaParity([...finalFrameBounds.keys(), ...bloodOrigins.keys()]);

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
  "the settled death pose must keep a bounded lane position"
);
assert.match(
  corpseFunction,
  /const deathFallTravelY = displayH \* fall\.y \* 0\.35/,
  "death fall travel must not erase the incoming hit knockback"
);
assert.match(
  corpseFunction,
  /const stumbleY = y \+ \(shoveY - y\) \* 0\.9 \+ displayH \* \(0\.006 \+ fall\.y \* 0\.05\)/,
  "the first death beat must visibly preserve the lethal shove"
);
assert.match(
  corpseFunction,
  /const corpseVisualDepthRatio = clamp\s*\(bloodY \/ GAME_HEIGHT, 0, 1\)/,
  "corpse and ground depths must follow the visible final-frame anchor"
);
assert.match(
  corpseFunction,
  /const groundDepth = ZOMBIE_CORPSE_GROUND_DEPTH_BASE[\s\S]*?ZOMBIE_CORPSE_GROUND_DEPTH_RANGE/,
  "ground decals must use their isolated depth band"
);
assert.match(
  corpseFunction,
  /bloodAnchorLocalX = deathDisplaySize \* finalFrameBounds\.x \* \(corpseFlipX \? -1 : 1\)/,
  "the corpse alpha anchor must mirror with the final death sprite"
);
assert.match(
  corpseFunction,
  /const bloodX = landingX[\s\S]*?bloodAnchorLocalX \* corpseRotationCos[\s\S]*?- bloodAnchorLocalY \* corpseRotationSin/,
  "the blood anchor X must include the corpse's final rotation"
);
assert.match(
  corpseFunction,
  /const bloodY = landingY[\s\S]*?bloodAnchorLocalX \* corpseRotationSin[\s\S]*?\+ bloodAnchorLocalY \* corpseRotationCos/,
  "the blood anchor Y must include the corpse's final rotation"
);
assert.match(
  corpseFunction,
  /\.setOrigin\s*\(alphaOrigin\.x, alphaOrigin\.y\)/,
  "blood textures must place their visible alpha center on the corpse anchor"
);
assert.match(
  corpseFunction,
  /const bloodBaseMaxSide = Math\.max\(effect\.stainWidth \* sizeScale, corpseVisibleWidth \* 0\.52\) \* rand\(0\.84, 1\)/,
  "blood sizing must retain the corpse-relative pre-scale baseline"
);
assert.match(
  corpseFunction,
  /const bloodMaxSide = bloodBaseMaxSide \* BLOOD_STAIN_SIZE_MULTIPLIER/,
  "blood stains must apply the shared two-times visual multiplier"
);
assert.match(
  corpseFunction,
  /const shadowBloodWidth = bloodWidth \/ BLOOD_STAIN_SIZE_MULTIPLIER[\s\S]*?const shadowBloodHeight = bloodHeight \/ BLOOD_STAIN_SIZE_MULTIPLIER[\s\S]*?Math\.max\(shadowBloodWidth \* 0\.78, corpseVisibleWidth \* 0\.58\)/,
  "doubling blood stains must not also double the corpse shadow"
);
assert.match(
  corpseFunction,
  /stain\.setAlpha\s*\(0\)\.setDepth\s*\(groundDepth\)/,
  "blood stains must stay in the ground depth band"
);
assert.doesNotMatch(
  corpseFunction,
  /bloodY\s*=\s*landingY\s*\+\s*deathDisplaySize\s*\*\s*0\.06|bloodY\s*\+\s*deathDisplaySize/,
  "fixed full-frame blood offsets must not return"
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
    500 + scaledKnockback + displayHeight * 0.02 * 0.35 - 4
  );
  assert.ok(
    earliestLanding >= 500 - displayHeight * landingRiseLimitRatio,
    `the ${displayHeight}px zombie corpse exceeded its bounded landing displacement`
  );

  const pistolKnockback = Math.max(
    -displayHeight * verticalKnockbackLimitRatio,
    -10 * verticalKnockbackScale
  );
  const pistolStumbleY = 500 + pistolKnockback * 0.9 + displayHeight * (0.006 + 0.06 * 0.05);
  assert.ok(
    pistolStumbleY <= 495,
    `a lethal pistol hit only moved the ${displayHeight}px zombie to ${pistolStumbleY.toFixed(2)}`
  );
}

console.log(
  `zombie death placement verified: ${deathTexturesByType.size} motion-matched types, ` +
    `${finalFrameBounds.size} alpha-aligned final frames, isolated ground depth, ` +
    `${bloodStainSizeMultiplier}x blood stains, ${Math.round(verticalKnockbackLimitRatio * 100)}% recoil cap, ` +
    `${Math.round(landingRiseLimitRatio * 100)}% landing rise limit, ${hitEffectSizeMultiplier}x hit effects`
);
