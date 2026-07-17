"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");
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

const frameDurationsBlock = gameSource.match(
  /const\s+CHARACTER_ATTACK_FRAME_DURATIONS\s*=\s*\{([\s\S]*?)\};/
)?.[1];
assert.ok(frameDurationsBlock, "CHARACTER_ATTACK_FRAME_DURATIONS must be declared");
const bowDurations = frameDurationsBlock.match(/\ba\s*:\s*\[([^\]]+)\]/)?.[1]
  .split(",")
  .map(value => Number(value.trim()));
assert.deepEqual(
  bowDurations,
  [0.045, 0.11, 0.045, 0.09],
  "bow timing must preserve the readable draw and crisp release rhythm"
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
  "bow recovery must blend back to its ready pose instead of popping"
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
  { name: "character-c", width: 2565, height: 724 },
  ...[0, 1, 2, 3].map(frame => ({ name: `character-c-attack-${frame}`, width: 1440, height: 362 })),
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
    a: { name: "character-a-attack-2", height: 222 },
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
  let bestSize = 0;
  let bestTop = null;
  for (let start = 0; start < active.length; start += 1) {
    if (!active[start]) continue;
    active[start] = 0;
    let head = 0;
    let tail = 1;
    let size = 0;
    let top = image.height;
    queue[0] = start;
    while (head < tail) {
      const current = queue[head];
      head += 1;
      size += 1;
      const x = current % cellWidth;
      const y = Math.floor(current / cellWidth);
      top = Math.min(top, y);
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
    if (size > bestSize) {
      bestSize = size;
      bestTop = top;
    }
  }
  assert.ok(
    bestTop !== null && bestSize >= 80,
    `direction ${directionKeys[cellIndex]} must retain a stable ${hair} hair scale reference`
  );
  return bestTop;
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
    const displayScale = sheetIndex === 0 ? 1 : actionHeightScale;
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
    `G recovery continuity, asset version ${assetVersion}`
);
