"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const motion = require("../js/zombie-motion.js");
const data = require("../js/zombie-motion-data.js");
const source = fs.readFileSync(require.resolve("../js/game.js"), "utf8");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

for (const type of Object.keys(data.walk)) {
  const key = Object.keys(data.death).find(key => key.startsWith(`zombie-death-${type}-`));
  for (const flipX of [false, true]) for (const size of [116, 170, 220]) {
    const sign = flipX ? -1 : 1;
    for (const walk of data.walk[type]) {
      const zombie = { x: 260, y: 400, displayH: size, displayW: size, flipX };
      const start = motion.deathStart(zombie, walk, data.death[key][0], size * 1.2);
      near(start.x + data.death[key][0][0] * size * 1.2 * sign, zombie.x + walk[0] * size * sign);
      near(start.y + data.death[key][0][1] * size * 1.2, zombie.y + (walk[1] - 0.06) * size);
    }
    data.death[key].forEach((center, frame) => {
      const t = motion.frameTransform(size, motion.frameScale(type, frame), center, flipX);
      near((center[0] * sign + 0.5 - t.originX) * t.size, center[0] * size * sign);
      near((center[1] + 0.5 - t.originY) * t.size, center[1] * size);
      assert.ok(t.size > 0 && t.originX > 0 && t.originX < 1 && t.originY > 0 && t.originY < 1);
    });
  }
}

// Run the game's actual timer helper, including disposal and final-frame hold.
const body = source.match(/    playTransientSpriteFrames\(([^]*?)\n    createFirebombHitEffect/)[1].trim();
const play = vm.runInNewContext(`({playTransientSpriteFrames(${body}}).playTransientSpriteFrames`);
for (const count of [4, 8, 12]) {
  let timer;
  const seen = [];
  const scene = {
    disposed: false, sceneTimers: new Set(),
    time: { addEvent(config) { timer = { ...config }; return timer; } },
    cancelTimerEvent(event) { event.cancelled = true; }
  };
  const sprite = { frame: 0, setFrame(frame) { this.frame = frame; } };
  const event = play.call(scene, sprite, count, 560, frame => {
    assert.equal(sprite.frame, frame, "the size correction must match the currently displayed frame");
    seen.push(frame);
  });
  for (let i = 0; i <= timer.repeat; i++) timer.callback();
  assert.deepEqual(seen, Array.from({ length: count }, (_, i) => i));
  assert.equal(sprite.frame, count - 1);
  assert.ok(!scene.sceneTimers.has(event));
  sprite.destroyed = true;
  timer.callback();
  assert.ok(timer.cancelled);
}
for (const type of ["crawler", "spider", "runner", "athlete", "charger", "nurse", "diva"]) {
  assert.equal(data.death[`zombie-death-${type}-sheet`].length, 8);
}
for (const type of ["teacher", "guard", "janitor"]) {
  assert.equal(data.death[`zombie-death-${type}-sheet`].length, 4);
}
for (let variant = 1; variant <= 4; variant++) {
  assert.equal(data.death[`zombie-death-normal-variant-${variant}-sheet`].length, 12);
}
assert.match(source, /const corpseFlipX = Boolean\(zombie.flipX\)/);
assert.match(source, /applyDeathFrameSize\(deathFrameCount - 1\)/);
console.log("zombie motion verified: transition centers, mirrored scaling, every timer frame, disposal and final-frame hold");
