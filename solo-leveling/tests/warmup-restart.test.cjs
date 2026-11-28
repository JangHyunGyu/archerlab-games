"use strict";
// error_logs 7051-7054: a menu restart (resize/language) during an idle warmup
// batch re-requested in-flight portraits, so Phaser added each texture twice
// ("Texture key already in use"). The restart must wait for that batch.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "scenes", "MenuScene.js"), "utf8");
const match = source.match(/\n    _restartMenuScene\(\) \{\n([\s\S]*?)\n    \}\n/);
assert.ok(match, "MenuScene must define _restartMenuScene()");
const restartMenuScene = new Function(match[1]);

assert.doesNotMatch(source, /_resizeRefreshTimer = null;\s*this\.scene\.restart\(\);/, "resize must use the guarded restart");
assert.match(source, /setLang\(lang\.code\); this\._restartMenuScene\(\);/, "language change must use the guarded restart");

function makeScene({ warmupActive, loading }) {
  const listeners = [];
  const scene = {
    restarts: 0,
    _idleWarmupActive: warmupActive,
    _idleWarmupStopped: false,
    _startingGame: false,
    sys: { isActive: () => true },
    load: { isLoading: () => loading, once: (event, fn) => listeners.push({ event, fn }) },
    scene: { restart: () => { scene.restarts += 1; } },
  };
  return { scene, listeners };
}

{
  const { scene, listeners } = makeScene({ warmupActive: false, loading: false });
  restartMenuScene.call(scene);
  assert.equal(scene.restarts, 1, "idle menu restarts immediately");
  assert.equal(listeners.length, 0);
}
{
  const { scene, listeners } = makeScene({ warmupActive: true, loading: true });
  restartMenuScene.call(scene);
  restartMenuScene.call(scene);
  assert.equal(scene.restarts, 0, "restart waits while a warmup batch is in flight");
  assert.equal(listeners.length, 1, "repeated resize events wait on one listener");
  assert.equal(listeners[0].event, "complete");
  assert.equal(scene._idleWarmupStopped, true, "no further warmup batch starts before the restart");
  listeners[0].fn();
  assert.equal(scene.restarts, 1, "restart runs once the in-flight batch completes");
}
{
  const { scene, listeners } = makeScene({ warmupActive: true, loading: true });
  restartMenuScene.call(scene);
  scene._startingGame = true;
  listeners[0].fn();
  assert.equal(scene.restarts, 0, "a game start during the wait is not interrupted by a menu restart");
}
console.log("solo-leveling menu restart waits for in-flight warmup");
