"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const vm = require("node:vm");
const catalog = require("../js/PuzzleCatalog.js");

function cellsFor(vehicle) {
  const cells = [];
  for (let y = 0; y < vehicle.h; y += 1) {
    for (let x = 0; x < vehicle.w; x += 1) {
      cells.push({ x: vehicle.x + x, y: vehicle.y + y });
    }
  }
  return cells;
}

function validateBoard(entry) {
  assert.equal(entry.size, 6);
  assert.equal(entry.exitRow, 3);
  assert.equal(entry.exitSide, "left");
  assert.equal(entry.sourceBoard.length, 36);
  assert.match(entry.sourceBoard, /^[A-Z.o]{36}$/);
  assert.ok(!entry.sourceBoard.includes("x"), `level ${entry.level} contains a wall`);
  assert.equal(entry.board, Array.from(entry.sourceBoard).reverse().join(""));

  const ids = new Set();
  const occupied = new Map();
  const targets = entry.vehicles.filter(vehicle => vehicle.target);
  assert.equal(targets.length, 1, `level ${entry.level} must have one target`);

  for (const vehicle of entry.vehicles) {
    assert.ok(!ids.has(vehicle.id), `level ${entry.level} repeats ${vehicle.id}`);
    ids.add(vehicle.id);
    assert.ok(vehicle.axis === "H" || vehicle.axis === "V");
    assert.ok(Number.isInteger(vehicle.x) && Number.isInteger(vehicle.y));
    assert.ok(vehicle.w === 1 || vehicle.h === 1);
    assert.ok(Math.max(vehicle.w, vehicle.h) === 2 || Math.max(vehicle.w, vehicle.h) === 3);
    assert.ok(vehicle.x >= 0 && vehicle.y >= 0);
    assert.ok(vehicle.x + vehicle.w <= entry.size && vehicle.y + vehicle.h <= entry.size);
    if (!vehicle.target && vehicle.axis === "H") {
      assert.notEqual(vehicle.y, entry.exitRow, `level ${entry.level} has a second exit-lane car`);
    }

    for (const cell of cellsFor(vehicle)) {
      const key = `${cell.x},${cell.y}`;
      assert.ok(!occupied.has(key), `level ${entry.level} overlaps ${occupied.get(key)} and ${vehicle.id}`);
      occupied.set(key, vehicle.id);
    }
  }

  const target = targets[0];
  assert.equal(target.axis, "H");
  assert.equal(target.w, 2);
  assert.equal(target.h, 1);
  assert.equal(target.y, entry.exitRow);
  assert.ok(target.x > 0, `level ${entry.level} starts solved`);
}

function encode(vehicles) {
  return vehicles.map(vehicle => `${vehicle.x},${vehicle.y}`).join("|");
}

function occupancy(vehicles, exceptIndex) {
  const result = new Set();
  for (let index = 0; index < vehicles.length; index += 1) {
    if (index === exceptIndex) continue;
    for (const cell of cellsFor(vehicles[index])) result.add(`${cell.x},${cell.y}`);
  }
  return result;
}

function moveRange(vehicles, index, size) {
  const vehicle = vehicles[index];
  const used = occupancy(vehicles, index);
  if (vehicle.axis === "H") {
    let min = vehicle.x;
    let max = vehicle.x;
    while (min > 0 && !used.has(`${min - 1},${vehicle.y}`)) min -= 1;
    while (max + vehicle.w < size && !used.has(`${max + vehicle.w},${vehicle.y}`)) max += 1;
    return { min, max };
  }

  let min = vehicle.y;
  let max = vehicle.y;
  while (min > 0 && !used.has(`${vehicle.x},${min - 1}`)) min -= 1;
  while (max + vehicle.h < size && !used.has(`${vehicle.x},${max + vehicle.h}`)) max += 1;
  return { min, max };
}

function solveMinimumMoves(sourceVehicles, size) {
  const start = sourceVehicles.map(vehicle => ({ ...vehicle }));
  const targetIndex = start.findIndex(vehicle => vehicle.target);
  assert.notEqual(targetIndex, -1);
  const queue = [{ vehicles: start, depth: 0 }];
  const seen = new Set([encode(start)]);

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current.vehicles[targetIndex].x === 0) {
      return { depth: current.depth, states: seen.size };
    }

    for (let index = 0; index < current.vehicles.length; index += 1) {
      const vehicle = current.vehicles[index];
      const range = moveRange(current.vehicles, index, size);
      const currentPosition = vehicle.axis === "H" ? vehicle.x : vehicle.y;
      for (let position = range.min; position <= range.max; position += 1) {
        if (position === currentPosition) continue;
        const next = current.vehicles.map(item => ({ ...item }));
        if (vehicle.axis === "H") next[index].x = position;
        else next[index].y = position;
        const key = encode(next);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ vehicles: next, depth: current.depth + 1 });
      }
    }
  }

  return { depth: Number.POSITIVE_INFINITY, states: seen.size };
}

function run() {
  assert.equal(catalog.MAX_LEVEL, 50);
  assert.equal(catalog.LEVEL_COUNT, catalog.MAX_LEVEL);
  assert.equal(catalog.getLevel(0), null);
  assert.equal(catalog.getLevel(51), null);
  assert.equal(catalog.getLevel(1.5), null);
  assert.throws(() => catalog.parseBoard(`${"o".repeat(35)}x`), /Wall cells/);

  const browserContext = {};
  const catalogSource = fs.readFileSync(path.join(__dirname, "../js/PuzzleCatalog.js"), "utf8");
  vm.runInNewContext(catalogSource, browserContext, { filename: "PuzzleCatalog.js" });
  assert.equal(browserContext.ParkingPuzzleCatalog.MAX_LEVEL, catalog.MAX_LEVEL);

  const mutableCopy = catalog.getLevel(1);
  mutableCopy.vehicles[0].x = 99;
  assert.notEqual(catalog.getLevel(1).vehicles[0].x, 99, "getLevel must return fresh vehicle state");

  const startedAt = performance.now();
  let previousPar = 1;
  let totalStates = 0;
  for (let level = 1; level <= catalog.MAX_LEVEL; level += 1) {
    const entry = catalog.getLevel(level);
    assert.ok(entry, `missing level ${level}`);
    assert.equal(entry.level, level);
    assert.equal(entry.parMoves, level + 1);
    assert.equal(entry.parMoves, previousPar + 1, `level ${level} par is not strictly increasing`);
    assert.deepEqual(entry.metrics, {
      depth: entry.parMoves,
      states: entry.clusterSize,
      vehicles: entry.vehicles.length,
    });
    validateBoard(entry);

    const solution = solveMinimumMoves(entry.vehicles, entry.size);
    assert.equal(
      solution.depth,
      entry.parMoves,
      `level ${level} expected par ${entry.parMoves}, got ${solution.depth}`,
    );
    totalStates += solution.states;
    previousPar = entry.parMoves;
  }

  const elapsedMs = performance.now() - startedAt;
  console.log(
    `difficulty catalog verified: ${catalog.MAX_LEVEL} levels, par 2-51, `
      + `${totalStates.toLocaleString()} BFS states, ${elapsedMs.toFixed(1)}ms`,
  );
}

run();
