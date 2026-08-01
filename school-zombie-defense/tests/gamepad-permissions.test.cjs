"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js", "game.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");

const pollGamepadInput = gameSource.match(
  /pollGamepadInput\s*\(time\s*=\s*0\)\s*\{([\s\S]*?)\n\s*scheduleSceneDelay\s*\(/
)?.[1];

assert.ok(pollGamepadInput, "pollGamepadInput must remain discoverable");
assert.match(gameSource, /this\.gamepadAccessDenied\s*=\s*false/);
assert.match(
  pollGamepadInput,
  /if \(this\.gamepadAccessDenied\)[\s\S]*?return/,
  "denied documents must stop polling the restricted API"
);
assert.match(
  pollGamepadInput,
  /try\s*\{[\s\S]*?navigator\.getGamepads\(\)[\s\S]*?catch \(error\)/,
  "getGamepads must stay inside the permissions-policy error boundary"
);
assert.match(
  pollGamepadInput,
  /error\?\.name === "SecurityError"[\s\S]*?this\.gamepadAccessDenied = true[\s\S]*?this\.gamepadButtons\.clear\(\)[\s\S]*?return/,
  "SecurityError must disable later polls without affecting keyboard or touch input"
);
assert.match(indexSource, /js\/game\.js\?v=20260719-freesound-crossbow-v1/);

console.log("gamepad permissions policy handling verified");
