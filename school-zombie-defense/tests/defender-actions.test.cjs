"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
assert.doesNotMatch(
  gameSource,
  /활|화살/,
  "game-facing Korean copy must not regress from crossbow/bolt terminology to bow/arrow"
);
assert.match(gameSource, /석궁/, "game-facing Korean copy must identify the crossbow");
assert.match(gameSource, /볼트/, "game-facing Korean copy must identify crossbow bolts");
const finalizeDirectionsSource = fs.readFileSync(
  path.join(root, "tools", "finalize-defender-action-directions.py"),
  "utf8"
);
const prepareCrossbowSourcePath = path.join(
  root,
  "tools",
  "prepare-crossbow-source-cells.py"
);
const prepareCrossbowSource = fs.readFileSync(prepareCrossbowSourcePath, "utf8");
const imageRoot = path.join(root, "assets", "images");
const hashFixturePath = path.join(__dirname, "defender-action-assets.sha256.json");
const updateHashes = process.argv.includes("--update-hashes");

const expectedAimPoses = [
  { key: "aim-10", degrees: -150 },
  { key: "aim-1030", degrees: -135 },
  { key: "aim-11", degrees: -120 },
  { key: "aim-1130", degrees: -105 },
  { key: "aim-12", degrees: -90 },
  { key: "aim-1230", degrees: -75 },
  { key: "aim-13", degrees: -60 },
  { key: "aim-1330", degrees: -45 },
  { key: "aim-14", degrees: -30 }
];

const aimPosesSource = gameSource.match(
  /const\s+AIM_POSES\s*=\s*\[([\s\S]*?)\];/
)?.[1];
assert.ok(aimPosesSource, "AIM_POSES must remain discoverable");
const parsedAimPoses = [...aimPosesSource.matchAll(
  /\{\s*key:\s*["']([^"']+)["']\s*,\s*angle:\s*([^}]+?)\s*\}/g
)].map(([, key, angleSource]) => ({
  key,
  degrees: Function("Math", '"use strict"; return (' + angleSource + ');')(Math) * 180 / Math.PI
}));
assert.deepEqual(
  parsedAimPoses.map(({ key }) => key),
  expectedAimPoses.map(({ key }) => key),
  "AIM_POSES order must remain identical to the nine sprite-sheet columns"
);
parsedAimPoses.forEach((pose, index) => {
  assert.ok(
    Math.abs(pose.degrees - expectedAimPoses[index].degrees) <= 1e-9,
    pose.key + " runtime angle must remain " + expectedAimPoses[index].degrees
      + " degrees; got " + pose.degrees
  );
});
assert.match(
  gameSource,
  /const\s+AIM_POSE_KEYS\s*=\s*AIM_POSES\.map\(\(pose\)\s*=>\s*pose\.key\)/,
  "runtime pose keys must preserve AIM_POSES column order"
);

function assertUsesOrderedAimColumns(source, label) {
  assert.ok(source, label + " texture factory must remain discoverable");
  assert.match(
    source,
    /const\s+cellWidth\s*=\s*Math\.floor\(source\.width\s*\/\s*AIM_POSE_KEYS\.length\)/,
    label + " textures must divide their source into the AIM_POSE_KEYS column count"
  );
  assert.match(
    source,
    /AIM_POSE_KEYS\.forEach\(\(pose,\s*index\)\s*=>\s*\{/,
    label + " textures must enumerate poses in AIM_POSE_KEYS order"
  );
  assert.match(
    source,
    /index\s*\*\s*cellWidth,\s*0,\s*cellWidth,\s*cellHeight/,
    label + " textures must extract each pose from its matching source column"
  );
}

const characterSpriteTexturesSource = gameSource.match(
  /function\s+createCharacterSpriteTextures\s*\(scene\)\s*\{([\s\S]*?)\n\s*function\s+createCharacterAttackTextures/
)?.[1];
const characterAttackTexturesSource = gameSource.match(
  /function\s+createCharacterAttackTextures\s*\(scene\)\s*\{([\s\S]*?)\n\s*function\s+releaseCharacterSourceTextures/
)?.[1];
assertUsesOrderedAimColumns(characterSpriteTexturesSource, "ready-pose");
assertUsesOrderedAimColumns(characterAttackTexturesSource, "attack-frame");

const releaseFramesBlock = gameSource.match(
  /const\s+CHARACTER_ATTACK_RELEASE_FRAMES\s*=\s*\{([\s\S]*?)\};/
)?.[1];
assert.ok(releaseFramesBlock, "CHARACTER_ATTACK_RELEASE_FRAMES must be declared");

for (const [defenderId, expectedFrame] of Object.entries({ a: 2, d: 1, f: 2, g: 1 })) {
  const frameMatch = releaseFramesBlock.match(new RegExp(`\\b${defenderId}\\s*:\\s*(\\d+)\\b`));
  assert.ok(frameMatch, `release frame for defender ${defenderId.toUpperCase()} must be declared`);
  assert.equal(Number(frameMatch[1]), expectedFrame, `defender ${defenderId.toUpperCase()} release frame drifted`);
}

const frameDurationsBlock = gameSource.match(
  /const\s+CHARACTER_ATTACK_FRAME_DURATIONS\s*=\s*\{([\s\S]*?)\};/
)?.[1];
assert.ok(frameDurationsBlock, "CHARACTER_ATTACK_FRAME_DURATIONS must be declared");
const crossbowDurations = frameDurationsBlock.match(/\ba\s*:\s*\[([^\]]+)\]/)?.[1]
  .split(",")
  .map(value => Number(value.trim()));
assert.deepEqual(
  crossbowDurations,
  [0.045, 0.11, 0.045, 0.09],
  "crossbow timing must preserve a readable aim and crisp release rhythm"
);

assert.match(
  gameSource,
  /const\s+CHARACTER_ATTACK_DIRECTION_LOCKS\s*=\s*new Set\(\["a"\]\)/,
  "crossbow attacks must lock their animation to the target direction"
);
assert.match(
  gameSource,
  /const pose = CHARACTER_ATTACK_DIRECTION_LOCKS\.has\(defender\.id\)\s*\? initialPose\s*:\s*getShotAimPoseKey\(initialAngle\)/,
  "muzzle offsets must not remap the crossbow animation away from its target direction"
);
assert.match(
  finalizeDirectionsSource,
  /normalise_generated_cell\(\s*source,\s*crossbow_identity\[index\],\s*key_colour=None,\s*hair="pink",[\s\S]*?keep_largest_component=True,/,
  "alpha-ready crossbow sources must skip a second blue despill and discard detached ghosts"
);
assert.match(
  finalizeDirectionsSource,
  /key_colour:\s*str\s*\|\s*None[\s\S]*?if key_colour is not None:\s*source = despill_key_colour\(source, key_colour\)/,
  "normalization must explicitly allow reviewed alpha sources to skip key-colour cleanup"
);
assert.match(
  finalizeDirectionsSource,
  /firebomb_source[\s\S]*?key_colour="blue"[\s\S]*?rocket_targets[\s\S]*?key_colour="magenta"/,
  "legacy firebomb and rocket workflows must retain their existing key-colour despill"
);
assert.match(
  prepareCrossbowSource,
  /DEFAULT_OPAQUE_THRESHOLD\s*=\s*96/,
  "crossbow blue-key extraction must make all pixels beyond the narrow edge range opaque"
);
assert.match(
  prepareCrossbowSource,
  /distance\s*>=\s*opaque_threshold[\s\S]*?output\.append\(\(red, green, blue, alpha\)\)[\s\S]*?blue_dominance[\s\S]*?key_like/,
  "crossbow chroma extraction must preserve distant navy/cyan before applying its blue-dominance guard"
);
assert.match(
  prepareCrossbowSource,
  /result\s*=\s*keep_largest_alpha_component\(result\)\s*validate_alpha_cell\(result, label\)/,
  "crossbow source cells must drop detached alpha noise before validation and saving"
);

const chromaSmokeSource = [
  "import runpy, sys",
  "from PIL import Image",
  "tool = runpy.run_path(sys.argv[1])",
  "source = Image.new('RGBA', (4, 1))",
  "samples = [(0, 0, 255, 255), (25, 30, 220, 255), (20, 30, 70, 255), (0, 220, 255, 255)]",
  "source.putdata(samples)",
  "result = tool['remove_blue_chroma'](source, transparent_threshold=12, opaque_threshold=96)",
  "pixels = list(result.get_flattened_data())",
  "assert pixels[0][3] == 0, pixels",
  "assert 0 < pixels[1][3] < 255, pixels",
  "assert pixels[2] == samples[2], pixels",
  "assert pixels[3] == samples[3], pixels",
  "component_source = Image.new('RGBA', (6, 4), (0, 0, 0, 0))",
  "main_pixels = {(0, 0): (20, 30, 70, 255), (1, 1): (0, 220, 255, 127), (2, 2): (255, 100, 50, 9)}",
  "noise_pixels = {(5, 0): (25, 30, 220, 40), (5, 1): (25, 30, 220, 40)}",
  "for point, rgba in {**main_pixels, **noise_pixels}.items(): component_source.putpixel(point, rgba)",
  "cleaned = tool['keep_largest_alpha_component'](component_source)",
  "for point, rgba in main_pixels.items(): assert cleaned.getpixel(point) == rgba, (point, cleaned.getpixel(point), rgba)",
  "for point in noise_pixels: assert cleaned.getpixel(point) == (0, 0, 0, 0), (point, cleaned.getpixel(point))"
].join("\n");
let chromaSmoke = childProcess.spawnSync(
  "python",
  ["-c", chromaSmokeSource, prepareCrossbowSourcePath],
  { encoding: "utf8" }
);
if (chromaSmoke.error?.code === "ENOENT") {
  chromaSmoke = childProcess.spawnSync(
    "py",
    ["-3", "-c", chromaSmokeSource, prepareCrossbowSourcePath],
    { encoding: "utf8" }
  );
}
assert.ifError(chromaSmoke.error);
assert.equal(
  chromaSmoke.status,
  0,
  "crossbow navy/cyan/blue-background chroma smoke failed:\n" + chromaSmoke.stderr
);
assert.match(
  finalizeDirectionsSource,
  /for frame, \(_, cells\) in crossbow_sheets\.items\(\):[\s\S]*?for index in range\(5\):[\s\S]*?generated_dir \/ f"a-f\{frame\}-c\{index\}\.png"/,
  "the generated crossbow set must source the center and four approved left-side directions"
);
assert.match(
  finalizeDirectionsSource,
  /CROSSBOW_MIRROR_DIRECTION_PAIRS\s*=\s*\(\(3, 5\), \(2, 6\), \(1, 7\), \(0, 8\)\)/,
  "crossbow right-side directions must remain paired with their approved mirrored sources"
);
assert.match(
  finalizeDirectionsSource,
  /for source_index, mirrored_index in CROSSBOW_MIRROR_DIRECTION_PAIRS:[\s\S]*?cells\[mirrored_index\]\s*=\s*cells\[source_index\]\.transpose\(\s*Image\.Transpose\.FLIP_LEFT_RIGHT/,
  "crossbow right-side attack cells must be deterministic mirrors instead of independent generations"
);
assert.match(
  finalizeDirectionsSource,
  /crossbow_sheets\s*=\s*\{\s*0:\s*\(\s*IMAGE_DIR \/ "character-a\.png",[\s\S]*?crossbow_sheets\.update\(\{[\s\S]*?for frame in range\(1, 4\)/,
  "crossbow frame zero must update the nine-direction ready sheet alongside attack frames one through three"
);
assert.match(
  finalizeDirectionsSource,
  /verify_generated_crossbow_sheets\(crossbow_identity, crossbow_sheets\)[\s\S]*?save_strip\(cells, sheet_path, webp_quality=CROSSBOW_WEBP_QUALITY\)/,
  "all four crossbow sheets must pass in-memory geometry checks before high-quality production writes"
);
assert.match(
  finalizeDirectionsSource,
  /CROSSBOW_WEBP_QUALITY\s*=\s*96/,
  "crossbow WebP sheets must retain high-quality thin weapon detail"
);
assert.match(
  finalizeDirectionsSource,
  /if args\.crossbow_only:[\s\S]*?else CROSSBOW_SOURCE_DIR[\s\S]*?apply_generated_crossbow_repairs\(generated_dir\)/,
  "the crossbow workflow must default to reviewed sources without rewriting unrelated defender assets"
);

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
assert.match(
  animationUpdate,
  /animation\.frameDurations\?\.\[animation\.frame\]\s*\|\|\s*animation\.frameDuration/,
  "attack animation updates must honor per-frame timing"
);
assert.match(
  animationUpdate,
  /CHARACTER_RECOVERY_BLEND_DURATIONS\[defender\.id\]/,
  "crossbow recovery must blend back to its ready pose instead of popping"
);

const characterAssetVersion = gameSource.match(
  /const\s+CHARACTER_ASSET_VERSION\s*=\s*["']([^"']+)["']/
)?.[1];
assert.ok(characterAssetVersion, "CHARACTER_ASSET_VERSION must be declared");
assert.equal(
  characterAssetVersion,
  "20260718-bow-video-directions-v14",
  "the shared character cache contract must remain independent from crossbow-only changes"
);
const crossbowAssetVersion = gameSource.match(
  /const\s+CROSSBOW_ASSET_VERSION\s*=\s*["']([^"']+)["']/
)?.[1];
assert.ok(crossbowAssetVersion, "CROSSBOW_ASSET_VERSION must be declared");
assert.equal(
  crossbowAssetVersion,
  "20260719-crossbow-directions-v1",
  "crossbow asset cache version must track the reviewed direction sheets"
);
const directlyVersionedCrossbowAssets = [...gameSource.matchAll(
  /this\.load\.image\("([^"]+)",\s*versionedImageAsset\("assets\/images\/[^"]+",\s*CROSSBOW_ASSET_VERSION\)\)/g
)].map(([, key]) => key).sort();
assert.deepEqual(
  directlyVersionedCrossbowAssets,
  [
    "avatar-bow",
    "character-a",
    "muzzle-arrow",
    "projectile-arrow",
    "skill-arrow-force",
    "skill-arrow-pierce",
    "skill-arrow-pin"
  ].sort(),
  "only regenerated crossbow image assets must use the crossbow cache contract directly"
);
assert.match(
  gameSource,
  /const assetVersion = id === "a" \? CROSSBOW_ASSET_VERSION : CHARACTER_ASSET_VERSION;/,
  "only defender A attack sheets must select the crossbow cache contract"
);

const sheets = [
  { name: "character-c", width: 2565, height: 724 },
  ...[0, 1, 2, 3].map(frame => ({ name: `character-c-attack-${frame}`, width: 1440, height: 362 })),
  { name: "character-a", width: 6624, height: 960 },
  ...[1, 2, 3].map(frame => ({ name: `character-a-attack-${frame}`, width: 6624, height: 960 })),
  { name: "character-d", width: 2016, height: 362 },
  ...[1, 2, 3].map(frame => ({ name: `character-d-attack-${frame}`, width: 2016, height: 362 })),
  { name: "character-f", width: 4608, height: 512 },
  ...[0, 1, 2, 3].map(frame => ({ name: `character-f-throw-${frame}`, width: 4608, height: 640 })),
  { name: "character-g", width: 2565, height: 512 },
  ...[0, 1, 2, 3].map(frame => ({ name: `character-g-attack-${frame}`, width: 1584, height: 256 }))
];

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

function readUInt24LE(contents, offset) {
  return contents[offset] | (contents[offset + 1] << 8) | (contents[offset + 2] << 16);
}

function readWebpDimensions(filePath) {
  const contents = fs.readFileSync(filePath);
  assert.ok(contents.length >= 30, `${path.basename(filePath)} must contain a complete WebP header`);
  assert.equal(contents.subarray(0, 4).toString("ascii"), "RIFF", `${path.basename(filePath)} must be RIFF`);
  assert.equal(contents.subarray(8, 12).toString("ascii"), "WEBP", `${path.basename(filePath)} must be WebP`);

  let offset = 12;
  while (offset + 8 <= contents.length) {
    const type = contents.subarray(offset, offset + 4).toString("ascii");
    const length = contents.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    assert.ok(dataOffset + length <= contents.length, `${path.basename(filePath)} has a truncated ${type} chunk`);

    if (type === "VP8X") {
      assert.ok(length >= 10, `${path.basename(filePath)} has an incomplete VP8X chunk`);
      return {
        width: readUInt24LE(contents, dataOffset + 4) + 1,
        height: readUInt24LE(contents, dataOffset + 7) + 1
      };
    }
    if (type === "VP8 ") {
      assert.ok(length >= 10, `${path.basename(filePath)} has an incomplete VP8 chunk`);
      assert.ok(
        contents.subarray(dataOffset + 3, dataOffset + 6).equals(Buffer.from([0x9d, 0x01, 0x2a])),
        `${path.basename(filePath)} has an invalid VP8 frame header`
      );
      return {
        width: contents.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: contents.readUInt16LE(dataOffset + 8) & 0x3fff
      };
    }
    if (type === "VP8L") {
      assert.ok(length >= 5 && contents[dataOffset] === 0x2f, `${path.basename(filePath)} has an invalid VP8L header`);
      const bits = contents.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1
      };
    }

    offset = dataOffset + length + (length & 1);
  }

  assert.fail(`${path.basename(filePath)} does not contain a supported image chunk`);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertCrossbowSourceChecksums() {
  const archivedArcherRoot = path.join(root, "design", "source-assets", "archer-v14");
  assert.ok(
    fs.existsSync(path.join(archivedArcherRoot, "SHA256SUMS")),
    "the reviewed archer-v14 source record must remain preserved"
  );

  const sourceRoot = path.join(root, "design", "source-assets", "crossbow-v1");
  const sumsPath = path.join(sourceRoot, "SHA256SUMS");
  assert.ok(fs.existsSync(sumsPath), "reviewed crossbow source checksum manifest must exist");

  const entries = fs.readFileSync(sumsPath, "utf8").trim().split(/\r?\n/).map(line => {
    const match = line.match(/^([0-9a-f]{64})  (a-f[0-3]-c[0-4]\.png)$/);
    assert.ok(match, `invalid reviewed crossbow source checksum line: ${line}`);
    return { hash: match[1], fileName: match[2] };
  });
  const expectedNames = [];
  for (let frame = 0; frame <= 3; frame += 1) {
    for (let direction = 0; direction <= 4; direction += 1) {
      expectedNames.push(`a-f${frame}-c${direction}.png`);
    }
  }
  assert.deepEqual(
    entries.map(({ fileName }) => fileName),
    expectedNames,
    "reviewed crossbow source set must contain exactly frames 0..3 and directions 0..4"
  );
  for (const { hash, fileName } of entries) {
    const sourcePath = path.join(sourceRoot, fileName);
    assert.ok(fs.existsSync(sourcePath), `${fileName} reviewed crossbow source must exist`);
    assert.equal(sha256(sourcePath), hash, `${fileName} reviewed crossbow source changed unexpectedly`);
  }
  assert.match(
    finalizeDirectionsSource,
    /CROSSBOW_SOURCE_DIR\s*=\s*ROOT\s*\/\s*"design"\s*\/\s*"source-assets"\s*\/\s*"crossbow-v1"/,
    "crossbow finalization must default to the tracked reviewed source directory"
  );
}

const assetPaths = [];
for (const sheet of sheets) {
  assert.equal(sheet.width % 9, 0, `${sheet.name} must contain exactly nine equal-width direction cells`);
  for (const extension of ["png", "webp"]) {
    const filePath = path.join(imageRoot, `${sheet.name}.${extension}`);
    assert.ok(fs.existsSync(filePath), `${sheet.name}.${extension} must exist`);
    assetPaths.push(filePath);
  }

  const pngPath = path.join(imageRoot, `${sheet.name}.png`);
  const png = readPngHeader(pngPath);
  assert.deepEqual(
    { width: png.width, height: png.height },
    { width: sheet.width, height: sheet.height },
    `${sheet.name}.png must keep its nine-direction sheet dimensions`
  );
  assert.deepEqual(
    { bitDepth: png.bitDepth, colorType: png.colorType, compression: png.compression, filter: png.filter, interlace: png.interlace },
    { bitDepth: 8, colorType: 6, compression: 0, filter: 0, interlace: 0 },
    `${sheet.name}.png must remain a non-interlaced 8-bit RGBA asset`
  );

  assert.deepEqual(
    readWebpDimensions(path.join(imageRoot, `${sheet.name}.webp`)),
    { width: sheet.width, height: sheet.height },
    `${sheet.name}.webp must match its PNG sheet dimensions`
  );
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
    `${path.basename(filePath)} must be a non-interlaced 8-bit RGBA PNG for semantic checks`
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
  assert.equal(
    filtered.length,
    (stride + 1) * header.height,
    `${path.basename(filePath)} must have complete scanlines`
  );

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
  return { alpha, rgba: pixels, width: header.width, height: header.height };
}

function alphaComponentSizes(image, cellIndex, threshold = 8) {
  const cellWidth = image.width / 9;
  assert.ok(Number.isInteger(cellWidth), "semantic sprite checks require nine equal-width cells");
  const active = new Uint8Array(cellWidth * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const sourceOffset = y * image.width + cellIndex * cellWidth;
    const targetOffset = y * cellWidth;
    for (let x = 0; x < cellWidth; x += 1) {
      active[targetOffset + x] = image.alpha[sourceOffset + x] > threshold ? 1 : 0;
    }
  }

  const queue = new Int32Array(active.length);
  const sizes = [];
  for (let start = 0; start < active.length; start += 1) {
    if (!active[start]) continue;
    active[start] = 0;
    let head = 0;
    let tail = 1;
    let size = 0;
    queue[0] = start;
    while (head < tail) {
      const current = queue[head];
      head += 1;
      size += 1;
      const x = current % cellWidth;
      const y = Math.floor(current / cellWidth);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= cellWidth || nextY < 0 || nextY >= image.height) continue;
          const next = nextY * cellWidth + nextX;
          if (!active[next]) continue;
          active[next] = 0;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((left, right) => right - left);
}

const directionKeys = ["10", "1030", "11", "1130", "12", "1230", "13", "1330", "14"];
const crossbowMirrorPairs = [[3, 5], [2, 6], [1, 7], [0, 8]];

function assertCrossbowDirectionalSymmetry() {
  const sheetNames = [
    "character-a",
    "character-a-attack-1",
    "character-a-attack-2",
    "character-a-attack-3"
  ];
  for (const sheetName of sheetNames) {
    const image = decodePngAlpha(path.join(imageRoot, `${sheetName}.png`));
    const cellWidth = image.width / directionKeys.length;
    assert.ok(Number.isInteger(cellWidth), `${sheetName} must have nine equal-width cells`);
    for (const [sourceIndex, mirroredIndex] of crossbowMirrorPairs) {
      let mismatch = null;
      pixelScan:
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < cellWidth; x += 1) {
          const sourcePixel = (y * image.width + sourceIndex * cellWidth + x) * 4;
          const mirroredPixel = (
            y * image.width + mirroredIndex * cellWidth + (cellWidth - 1 - x)
          ) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            if (image.rgba[sourcePixel + channel] === image.rgba[mirroredPixel + channel]) continue;
            mismatch = { x, y, channel };
            break pixelScan;
          }
        }
      }
      assert.equal(
        mismatch,
        null,
        `${sheetName} directions ${directionKeys[sourceIndex]}/${directionKeys[mirroredIndex]} `
          + "must remain exact RGBA mirrors"
      );
    }
  }
}
assert.deepEqual(
  directionKeys,
  expectedAimPoses.map(({ key }) => key.replace("aim-", "")),
  "semantic direction keys must preserve the runtime sprite-sheet column order"
);

const muzzleOffsetsSource = gameSource.match(
  /const\s+CHARACTER_MUZZLE_OFFSETS\s*=\s*(\{[\s\S]*?\n\s*\});/
)?.[1];
assert.ok(muzzleOffsetsSource, "CHARACTER_MUZZLE_OFFSETS must remain discoverable");
const muzzleOffsets = Function(`"use strict"; return (${muzzleOffsetsSource});`)();
assert.deepEqual(
  Object.keys(muzzleOffsets).sort(),
  ["a", "b", "c", "d", "e", "f", "g", "h"],
  "every defender must declare measured muzzle offsets"
);
for (const [defenderId, offsets] of Object.entries(muzzleOffsets)) {
  assert.equal(offsets.length, directionKeys.length, `defender ${defenderId.toUpperCase()} must cover all nine muzzle directions`);
  offsets.forEach((offset, index) => {
    assert.ok(
      Array.isArray(offset)
        && offset.length === 2
        && offset.every(Number.isFinite),
      `defender ${defenderId.toUpperCase()} direction ${directionKeys[index]} must use a finite [x, y] muzzle offset`
    );
  });
}

for (let leftIndex = 0; leftIndex < 4; leftIndex += 1) {
  const rightIndex = directionKeys.length - 1 - leftIndex;
  const [leftX, leftY] = muzzleOffsets.a[leftIndex];
  const [rightX, rightY] = muzzleOffsets.a[rightIndex];
  assert.ok(
    Math.abs(leftX + rightX) <= 2 && Math.abs(leftY - rightY) <= 2,
    `crossbow mirrored directions ${directionKeys[leftIndex]}/${directionKeys[rightIndex]} `
      + "must use mirrored release points"
  );
}

function nearestAlphaDistanceFromMuzzle(image, cellIndex, displayHeight, offset, threshold = 16) {
  const cellWidth = image.width / directionKeys.length;
  assert.ok(Number.isInteger(cellWidth), "muzzle checks require nine equal-width cells");
  const displayScale = displayHeight / image.height;
  const muzzleX = cellWidth / 2 + offset[0] / displayScale;
  const muzzleY = image.height + offset[1] / displayScale;
  const searchRadius = Math.ceil(8 / displayScale);
  let nearestSquared = Number.POSITIVE_INFINITY;
  const minX = Math.max(0, Math.floor(muzzleX - searchRadius));
  const maxX = Math.min(cellWidth - 1, Math.ceil(muzzleX + searchRadius));
  const minY = Math.max(0, Math.floor(muzzleY - searchRadius));
  const maxY = Math.min(image.height - 1, Math.ceil(muzzleY + searchRadius));
  for (let y = minY; y <= maxY; y += 1) {
    const rowOffset = y * image.width + cellIndex * cellWidth;
    for (let x = minX; x <= maxX; x += 1) {
      if (image.alpha[rowOffset + x] <= threshold) continue;
      nearestSquared = Math.min(
        nearestSquared,
        (x - muzzleX) ** 2 + (y - muzzleY) ** 2
      );
    }
  }
  return Math.sqrt(nearestSquared) * displayScale;
}

function assertMeasuredMuzzlesTouchReleaseArt() {
  const releaseSheets = {
    a: { name: "character-a-attack-2", height: 266.4 },
    b: { name: "character-b", height: 230 },
    c: { name: "character-c-attack-0", height: 248 },
    d: { name: "character-d-attack-1", height: 226 },
    e: { name: "character-e", height: 205 },
    f: { name: "character-f-throw-2", height: 196 },
    g: { name: "character-g-attack-1", height: 222 },
    h: { name: "character-h-attack-0", height: 226 }
  };
  for (const [defenderId, spec] of Object.entries(releaseSheets)) {
    const image = decodePngAlpha(path.join(imageRoot, `${spec.name}.png`));
    muzzleOffsets[defenderId].forEach((offset, cellIndex) => {
      const distance = nearestAlphaDistanceFromMuzzle(image, cellIndex, spec.height, offset);
      assert.ok(
        distance <= 2,
        `${defenderId.toUpperCase()} direction ${directionKeys[cellIndex]} muzzle detached from ${spec.name} by ${distance.toFixed(2)} world pixels`
      );
    });
  }
}

function cellVisibleBounds(image, cellIndex, threshold = 8) {
  const cellWidth = image.width / directionKeys.length;
  assert.ok(Number.isInteger(cellWidth), "semantic sprite checks require nine equal-width cells");
  let left = cellWidth;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * image.width + cellIndex * cellWidth;
    for (let x = 0; x < cellWidth; x += 1) {
      if (image.alpha[rowOffset + x] <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  assert.ok(right >= left && bottom >= top, `direction ${directionKeys[cellIndex]} must not be empty`);
  return { left, top, right: right + 1, bottom: bottom + 1, cellWidth };
}

function isHairPixel(red, green, blue, alpha, hair) {
  if (alpha <= 32) return false;
  if (hair === "pink") {
    return red >= 125 && red > green * 1.22 && red > blue * 0.98 && blue >= 58;
  }
  return red >= 62 && red > green * 1.35 && red > blue * 1.18 && green < 115;
}

function largestHairComponentTop(image, cellIndex, hair) {
  const cellWidth = image.width / directionKeys.length;
  const active = new Uint8Array(cellWidth * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      const sourcePixel = (y * image.width + cellIndex * cellWidth + x) * 4;
      if (isHairPixel(
        image.rgba[sourcePixel],
        image.rgba[sourcePixel + 1],
        image.rgba[sourcePixel + 2],
        image.rgba[sourcePixel + 3],
        hair
      )) {
        active[y * cellWidth + x] = 1;
      }
    }
  }

  const queue = new Int32Array(active.length);
  const components = [];
  for (let start = 0; start < active.length; start += 1) {
    if (!active[start]) continue;
    active[start] = 0;
    let head = 0;
    let tail = 1;
    let size = 0;
    let left = cellWidth;
    let top = image.height;
    let right = 0;
    let bottom = 0;
    queue[0] = start;
    while (head < tail) {
      const current = queue[head];
      head += 1;
      size += 1;
      const x = current % cellWidth;
      const y = Math.floor(current / cellWidth);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= cellWidth || nextY < 0 || nextY >= image.height) continue;
        const next = nextY * cellWidth + nextX;
        if (!active[next]) continue;
        active[next] = 0;
        queue[tail] = next;
        tail += 1;
      }
    }
    if (size >= 80) components.push({ size, top, left, right, bottom });
  }
  assert.ok(
    components.length > 0,
    `direction ${directionKeys[cellIndex]} must retain a stable ${hair} hair scale reference`
  );
  if (hair === "pink") {
    const minimumHeadHeight = Math.max(12, Math.round(image.height * 0.045));
    const substantialSize = Math.max(
      80,
      Math.round(Math.max(...components.map(component => component.size)) * 0.25)
    );
    const headCandidates = components.filter(component => {
      const width = component.right - component.left;
      const height = component.bottom - component.top;
      const density = component.size / Math.max(1, width * height);
      return component.size >= substantialSize
        && height >= minimumHeadHeight
        && width >= height * 0.36
        && density >= 0.16;
    });
    if (headCandidates.length > 0) {
      headCandidates.sort((left, right) => left.top - right.top || right.size - left.size);
      return headCandidates[0].top;
    }
  }
  return components.reduce((best, component) => (
    component.size > best.size ? component : best
  )).top;
}

function getActionHeightScale(defenderId) {
  const block = gameSource.match(/const\s+CHARACTER_ACTION_HEIGHT_SCALE\s*=\s*\{([\s\S]*?)\};/)?.[1];
  assert.ok(block, "CHARACTER_ACTION_HEIGHT_SCALE must remain discoverable for screen-space checks");
  const match = block.match(new RegExp(`\\b${defenderId}\\s*:\\s*([0-9.]+)\\b`));
  assert.ok(match, `action height scale for defender ${defenderId.toUpperCase()} must be declared`);
  return Number(match[1]);
}

function assertCharacterBodyGeometry({ defenderId, hair, baseName, actionNames }) {
  const actionHeightScale = getActionHeightScale(defenderId);
  const entries = [baseName, ...actionNames].map((name, sheetIndex) => {
    const image = decodePngAlpha(path.join(imageRoot, `${name}.png`));
    const displayScale = actionHeightScale;
    const cells = directionKeys.map((direction, cellIndex) => {
      const bounds = cellVisibleBounds(image, cellIndex);
      const safeMargin = Math.min(
        bounds.left,
        bounds.top,
        bounds.cellWidth - bounds.right,
        image.height - bounds.bottom
      );
      assert.ok(
        safeMargin >= 8,
        `${name} direction ${direction} must keep at least 8 transparent pixels on every canvas edge; got ${safeMargin}`
      );
      const hairTop = largestHairComponentTop(image, cellIndex, hair);
      return {
        direction,
        bodyScale: ((bounds.bottom - hairTop) / image.height) * displayScale,
        footOffset: ((bounds.bottom / image.height) - 0.5) * displayScale
      };
    });
    return { name, cells };
  });

  const baseCells = entries[0].cells;
  for (const entry of entries.slice(1)) {
    entry.cells.forEach((cell, cellIndex) => {
      const base = baseCells[cellIndex];
      const ratio = cell.bodyScale / base.bodyScale;
      assert.ok(
        ratio >= 0.97 && ratio <= 1.03,
        `${entry.name} direction ${cell.direction} screen body scale must stay within +/-3% of ${baseName}; got ${ratio.toFixed(3)}`
      );
      const footDrift = Math.abs(cell.footOffset - base.footOffset);
      assert.ok(
        footDrift <= 0.01,
        `${entry.name} direction ${cell.direction} screen foot baseline drifted by ${(footDrift * 100).toFixed(2)}% of defender height`
      );
    });
  }

  const allCells = entries.flatMap(entry => entry.cells);
  const bodyScales = allCells.map(cell => cell.bodyScale);
  const bodyRangeRatio = Math.max(...bodyScales) / Math.min(...bodyScales);
  assert.ok(
    bodyRangeRatio <= 1.03,
    `character ${defenderId.toUpperCase()} screen body scales across every direction/frame must have max/min <= 1.03; got ${bodyRangeRatio.toFixed(3)}`
  );
  const footOffsets = allCells.map(cell => cell.footOffset);
  const footRange = Math.max(...footOffsets) - Math.min(...footOffsets);
  assert.ok(
    footRange <= 0.01,
    `character ${defenderId.toUpperCase()} screen foot baselines across every direction/frame drifted by ${(footRange * 100).toFixed(2)}% of defender height`
  );
}

function cannonAxisAngle(image, cellIndex) {
  const bounds = cellVisibleBounds(image, cellIndex);
  const scanBottom = bounds.top + Math.round((bounds.bottom - bounds.top) * 0.52);
  const points = [];
  for (let y = bounds.top; y < scanBottom; y += 1) {
    for (let x = 0; x < bounds.cellWidth; x += 1) {
      const sourcePixel = (y * image.width + cellIndex * bounds.cellWidth + x) * 4;
      const red = image.rgba[sourcePixel];
      const green = image.rgba[sourcePixel + 1];
      const blue = image.rgba[sourcePixel + 2];
      const alpha = image.rgba[sourcePixel + 3];
      const cannonAccent = alpha > 40
        && blue > 70
        && blue > green * 1.08
        && blue > red * 0.8
        && (blue - Math.max(red, green) > 12 || blue > red * 1.15);
      if (cannonAccent) points.push([x, y]);
    }
  }
  assert.ok(
    points.length >= Math.max(120, (bounds.right - bounds.left) * (bounds.bottom - bounds.top) * 0.005),
    `G direction ${directionKeys[cellIndex]} must retain enough blue/purple cannon pixels for axis validation; got ${points.length}`
  );
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;
  for (const [x, y] of points) {
    covarianceXX += (x - meanX) ** 2;
    covarianceYY += (y - meanY) ** 2;
    covarianceXY += (x - meanX) * (y - meanY);
  }
  const angle = 0.5 * Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY) * 180 / Math.PI;
  return angle < 0 ? angle + 180 : angle;
}

function assertShockCannonDirections() {
  const names = ["character-g", ...[0, 1, 2, 3].map(frame => `character-g-attack-${frame}`)];
  for (const name of names) {
    const image = decodePngAlpha(path.join(imageRoot, `${name}.png`));
    directionKeys.forEach((direction, cellIndex) => {
      const bounds = cellVisibleBounds(image, cellIndex);
      const safeMargin = Math.min(
        bounds.left,
        bounds.top,
        bounds.cellWidth - bounds.right,
        image.height - bounds.bottom
      );
      assert.ok(
        safeMargin >= 8,
        `${name} direction ${direction} must keep at least 8 transparent pixels on every canvas edge; got ${safeMargin}`
      );
    });
    const angles = directionKeys.map((_, cellIndex) => cannonAxisAngle(image, cellIndex));
    for (let index = 1; index < angles.length; index += 1) {
      assert.ok(
        angles[index] > angles[index - 1],
        `${name} cannon axes must progress monotonically from 10 to 14; got ${angles.map(value => value.toFixed(1)).join(", ")}`
      );
    }
    assert.ok(
      angles.slice(0, 4).every(angle => angle < 86)
        && angles[4] >= 84 && angles[4] <= 96
        && angles.slice(5).every(angle => angle > 94),
      `${name} cannon axes crossed the wrong aiming hemisphere; got ${angles.map(value => value.toFixed(1)).join(", ")}`
    );
    assert.ok(
      angles[8] - angles[0] >= 50,
      `${name} cannon directions must cover a visible aiming arc; got ${(angles[8] - angles[0]).toFixed(1)} degrees`
    );
  }
}

function assertPngWebpAlphaParity() {
  const pairs = sheets.map(sheet => [
    path.join(imageRoot, `${sheet.name}.png`),
    path.join(imageRoot, `${sheet.name}.webp`)
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
    `PNG/WebP alpha parity check requires Pillow and exact matching alpha channels: ${(result.stderr || result.stdout).trim()}`
  );
}

assertCharacterBodyGeometry({
  defenderId: "a",
  hair: "pink",
  baseName: "character-a",
  actionNames: [1, 2, 3].map(frame => `character-a-attack-${frame}`)
});

assertCharacterBodyGeometry({
  defenderId: "f",
  hair: "red",
  baseName: "character-f",
  actionNames: [0, 1, 2, 3].map(frame => `character-f-throw-${frame}`)
});

assertShockCannonDirections();
assertPngWebpAlphaParity();
assertMeasuredMuzzlesTouchReleaseArt();
assertCrossbowDirectionalSymmetry();
assertCrossbowSourceChecksums();
assert.ok(
  muzzleOffsets.f.slice(0, 4).every(([x]) => x < 0)
    && muzzleOffsets.f.slice(5).every(([x]) => x > 0),
  "F throw origins must stay in the same horizontal hemisphere as their aim direction"
);
assert.match(
  gameSource,
  /\.setOrigin\(isFirebomb\s*\?\s*0\.8\s*:\s*0\.5\s*,\s*0\.5\)/,
  "firebomb flight art must anchor its neck to the measured throw origin"
);
assert.match(
  gameSource,
  /"projectile-firebomb"\s*:\s*0\.26/,
  "firebomb flight art must stay compact enough to read as a handheld bottle"
);
assert.match(
  gameSource,
  /"projectile-arrow"\s*:\s*\{[\s\S]*?horizontal:\s*true,[\s\S]*?life:\s*ARROW_EMBED_DURATION/,
  "the crossbow bolt embed config must declare its source art as horizontal"
);
assert.match(
  gameSource,
  /const usesHorizontalProjectile = defender\.projectile === "projectile-nail"\s*\|\|\s*defender\.projectile === "projectile-arrow";/,
  "crossbow bolts and nails must fly in the direction of their horizontal source art"
);
assert.match(
  gameSource,
  /const projectileLength = \(config\.horizontal \? bullet\.sprite\.displayWidth : bullet\.sprite\.displayHeight\) \|\| 42;/,
  "embedded horizontal projectiles must measure their visible length from displayWidth"
);
assert.match(
  gameSource,
  /\.setOrigin\(config\.horizontal \? 0 : 0\.5, config\.horizontal \? 0\.5 : 1\)/,
  "embedded crossbow bolts must attach from the left-center origin"
);
assert.match(
  gameSource,
  /\.setRotation\(config\.horizontal \? bullet\.angle : bullet\.angle \+ Math\.PI \/ 2\)/,
  "embedded crossbow bolts must preserve the fired angle without a vertical-art offset"
);
assert.match(
  gameSource,
  /createMuzzle\(x,\s*y,\s*muzzle\.effectAngle\s*\?\?\s*angle,\s*defender\.projectile\)/,
  "directional weapon muzzle effects must use their measured barrel angle"
);
const rebuildSource = fs.readFileSync(path.join(root, "tools", "rebuild-character-actions.py"), "utf8");
assert.match(
  rebuildSource,
  /source_cells\[pose\]\s*=\s*source_cells\[opposite\]\.transpose\(Image\.Transpose\.FLIP_LEFT_RIGHT\)/,
  "F left-side throw frames must be rebuilt from their approved opposite-direction art"
);

const firebombRelease = decodePngAlpha(path.join(imageRoot, "character-f-throw-2.png"));
for (let cellIndex = 0; cellIndex < 9; cellIndex += 1) {
  const components = alphaComponentSizes(firebombRelease, cellIndex);
  assert.ok(components[0] >= 10000, `F release cell ${cellIndex} must contain its defender silhouette`);
  assert.ok(
    !components.slice(1).some(size => size >= 128),
    `F release cell ${cellIndex} contains a detached opaque component large enough to be a baked firebomb`
  );
}

assert.equal(
  sha256(path.join(imageRoot, "character-g-attack-3.png")),
  sha256(path.join(imageRoot, "character-g-attack-2.png")),
  "G recovery frame must reuse the direction-safe settled pose instead of the old hemisphere-flipped sheet"
);

const currentHashes = Object.fromEntries(
  assetPaths
    .map(filePath => [path.basename(filePath), sha256(filePath)])
    .sort(([left], [right]) => left.localeCompare(right))
);

if (updateHashes) {
  fs.writeFileSync(
    hashFixturePath,
    `${JSON.stringify({ algorithm: "sha256", assets: currentHashes }, null, 2)}\n`,
    "utf8"
  );
  console.log(`updated approved defender action hashes: ${path.relative(process.cwd(), hashFixturePath)}`);
} else {
  assert.ok(fs.existsSync(hashFixturePath), "approved defender action hash fixture must exist");
  const fixture = JSON.parse(fs.readFileSync(hashFixturePath, "utf8"));
  assert.equal(fixture.algorithm, "sha256", "defender action fixture must use SHA-256");
  assert.deepEqual(
    Object.keys(fixture.assets).sort(),
    Object.keys(currentHashes).sort(),
    "defender action hash fixture must cover every A/D/F/G PNG/WebP sheet"
  );
  for (const [fileName, hash] of Object.entries(currentHashes)) {
    assert.equal(hash, fixture.assets[fileName], `${fileName} changed without approving its new SHA-256 fixture`);
  }
}

console.log(
  `defender actions verified: ${sheets.length} nine-direction PNG/WebP pairs, ` +
    `72 measured release origins, A/F screen-space scale and footing, ` +
    `G cannon directions, alpha parity, F release separation, ` +
    `G recovery continuity, asset version ${crossbowAssetVersion}`
);
