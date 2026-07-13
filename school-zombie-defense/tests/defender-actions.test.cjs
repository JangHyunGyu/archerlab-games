"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
const imageRoot = path.join(root, "assets", "images");
const hashFixturePath = path.join(__dirname, "defender-action-assets.sha256.json");
const updateHashes = process.argv.includes("--update-hashes");

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
assert.notEqual(
  assetVersion,
  "20260713-defender-actions-v6",
  "character asset cache version must be bumped for the direction-safe sheets"
);

const sheets = [
  { name: "character-a", width: 4608, height: 800 },
  ...[1, 2, 3].map(frame => ({ name: `character-a-attack-${frame}`, width: 4608, height: 800 })),
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
  return { alpha, width: header.width, height: header.height };
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
    `F release separation, G recovery continuity, asset version ${assetVersion}`
);
