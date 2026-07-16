"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
const workerSource = fs.readFileSync(path.join(root, "..", "game-api-worker.js"), "utf8");

assert.match(gameSource, /this\.rankStageSyncQueue = Promise\.resolve\(true\)/);
assert.match(gameSource, /this\.rankPendingStageEvents = new Map\(\)/);
assert.match(gameSource, /syncRankStageWithRetry\(stage, event, syncToken, 3\)/);
assert.match(
  gameSource,
  /for \(let stage = Math\.max\(1, \(this\.rankVerifiedStage \|\| 0\) \+ 1\); stage <= highestStage; stage \+= 1\)/,
  "final ranking submission must reconcile every missing cleared stage"
);
assert.match(gameSource, /data\?\.error \|\| `rank event \$\{response\.status\}`/);

assert.match(
  workerSource,
  /if \(clearedStage > expectedStage\)/,
  "the Worker must reject future stages while accepting already-recorded retries"
);
assert.match(workerSource, /projectedScore = Math\.max\(projectedScore, clearedStage\)/);
assert.doesNotMatch(workerSource, /clearedStage !== expectedStage/);

console.log("school zombie ranking retry and reconciliation contract verified");
