"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../js/game.js"), "utf8");
const constants = [
  "GAME_HEIGHT", "ZOMBIE_CORPSE_EFFECTS", "BLOOD_STAIN_SIZE_MULTIPLIER", "BLOOD_STAIN_TEXTURES",
  "BLOOD_STAIN_TEXTURES_BY_HIT", "BLOOD_STAIN_ALPHA_ORIGINS", "ZOMBIE_DEATH_ANIMATION_FRAMES",
  "NORMAL_ZOMBIE_DEATH_ANIMATION_FRAMES", "ZOMBIE_DEATH_VERTICAL_KNOCKBACK_SCALE",
  "ZOMBIE_DEATH_VERTICAL_KNOCKBACK_LIMIT_RATIO", "ZOMBIE_DEATH_LANDING_RISE_LIMIT_RATIO",
  "ZOMBIE_DEATH_TYPES", "ZOMBIE_DEATH_TEXTURES", "ZOMBIE_DEATH_FINAL_FRAME_BOUNDS",
  "ZOMBIE_DEATH_RENDER_SCALES", "ZOMBIE_BODY_DEPTH_BASE", "ZOMBIE_CORPSE_GROUND_DEPTH_BASE",
  "ZOMBIE_CORPSE_GROUND_DEPTH_RANGE", "ZOMBIE_CORPSE_DEPTH_BASE", "ZOMBIE_CORPSE_DEPTH_RANGE",
  "ACTIVE_CORPSE_LIMIT", "CORPSE_TRIM_FADE_DURATION"
].map(name => {
  const match = source.match(new RegExp(`^  const ${name} = [^]*?;\\r?$`, "m"));
  assert.ok(match, name);
  return match[0];
}).join("\n");
const methods = source.slice(source.indexOf("    registerCorpseRecord("), source.indexOf("    getZombieSurgeCooldown("));
const Harness = vm.runInNewContext(`${constants}\n(class {${methods}})`, {
  zombieMotion: require("../js/zombie-motion.js"),
  zombieMotionData: require("../js/zombie-motion-data.js"),
  rand: (min, max) => (min + max) / 2,
  choose: items => items[0],
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  COLORS: { blood: 0x990000 }
});
class Sprite {
  constructor(x = 270, y = 480, texture = "walk") {
    Object.assign(this, { x, y, texture, scaleX: 1, scaleY: 1, frame: { width: 512, height: 512 }, destroyed: false });
  }
  setDepth(depth) { this.depth = depth; return this; }
  setPosition(x, y) { Object.assign(this, { x, y }); return this; }
  setDisplaySize(w, h) { Object.assign(this, { displayWidth: w, displayHeight: h }); return this; }
  setScale(x, y = x) { Object.assign(this, { scaleX: x, scaleY: y }); return this; }
  setFlipX(value) { this.flipX = value; return this; }
  setFrame(value) { this.frameIndex = value; return this; }
}
for (const method of ["setOrigin", "setRotation", "setAngle", "setAlpha", "setTint", "clearTint", "setActive"])
  Sprite.prototype[method] = function () { return this; };
function makeScene() {
  const scene = new Harness();
  Object.assign(scene, {
    activeCorpses: [], pendingTweens: [], delays: [], sceneTimers: new Set(), bounds: { barricade: 800 },
    textures: { exists: () => true },
    add: Object.fromEntries(["image", "sprite", "ellipse"].map(key => [key, (...args) => new Sprite(...args)])),
    getZombieEffectScale: z => z.displayH / 170,
    clampZombieLaneX: x => Math.max(40, Math.min(500, x)),
    trackTransient: object => object,
    destroyTransientObject: object => { object.destroyed = true; },
    scheduleSceneDelay(delay, callback) { this.delays.push({ delay, callback }); },
    playTransientSpriteFrames: () => ({}), cancelTimerEvent() {}, shakeCamera() {}
  });
  scene.tweens = {
    add(config) { scene.pendingTweens.push(config); return config; },
    killTweensOf(target) { scene.pendingTweens.forEach(t => { if ([t.targets].flat().includes(target)) t.cancelled = true; }); }
  };
  return scene;
}
function kill(scene, { y = 480, type = "normal", size = 170, flipX = false, fallback = false } = {}) {
  const zombie = new Sprite(270, y);
  Object.assign(zombie, { type, variant: 0, animFrame: 0, displayW: size, displayH: size, flipX });
  scene.textures.exists = key => !(fallback && key.startsWith("zombie-death-"));
  scene.createZombieCorpse(zombie.x, y, zombie, { dx: -10, dy: -30, duration: 110 });
  return scene.activeCorpses.at(-1);
}
function bodies(record) {
  return record.objects.filter(o => !o.destroyed && (o.texture === "walk" || String(o.texture).startsWith("zombie-death-")));
}
function assertOrder(scene) {
  let previous = -Infinity;
  const allBodies = scene.activeCorpses.flatMap(bodies);
  for (const record of scene.activeCorpses) {
    const visible = bodies(record);
    if (!visible.length) continue;
    const depths = visible.map(o => o.depth);
    assert.ok(Math.min(...depths) > previous, "later deaths must cover every visible body from earlier deaths");
    previous = Math.max(...depths);
    assert.ok(Math.min(...depths) >= 34 && previous < 52, "all corpse phases stay in the corpse band below living zombies");
    for (const object of record.objects.filter(o => !o.destroyed && !visible.includes(o))) {
      assert.ok(allBodies.every(body => object.depth < body.depth), "blood and shadows must remain below every corpse");
    }
  }
}
function finishFalls(scene, record) {
  for (;;) {
    const tween = scene.pendingTweens.find(t => !t.done && !t.cancelled && !Array.isArray(t.targets) && record.objects.includes(t.targets) && t.onComplete);
    if (!tween) break;
    tween.done = true; tween.onComplete(); assertOrder(scene);
  }
}
function finishFade(scene, record) {
  const tween = scene.pendingTweens.find(t => !t.done && !t.cancelled && Array.isArray(t.targets) && t.targets.some(o => record.objects.includes(o)));
  assert.ok(tween, "record must have a fade tween");
  tween.done = true; tween.onComplete(); assertOrder(scene);
}

// Different Y, frame counts, sizes, flips and fall durations must not win over time of death.
for (const reverse of [false, true]) {
  const scene = makeScene();
  const records = [
    kill(scene, { y: reverse ? 390 : 520, type: "brute", size: 220 }),
    kill(scene, { y: 450, type: "athlete", size: 146, flipX: true }),
    kill(scene, { y: reverse ? 520 : 390, type: "normal", fallback: true })
  ];
  assertOrder(scene);
  [...records].reverse().forEach(record => finishFalls(scene, record));
  scene.delays[1].callback(); // A middle record starts fading before its neighbors.
  assert.ok(scene.activeCorpses.includes(records[1]), "fading bodies retain their ordered slot while visible");
  const newest = kill(scene, { y: 350 }); assertOrder(scene);
  finishFade(scene, records[1]);
  finishFalls(scene, newest);
  assert.ok(!scene.activeCorpses.includes(records[1]));
}

// Crowded explosions may temporarily exceed the retained-body cap while old bodies fade.
const crowded = makeScene();
for (let i = 0; i < 400; i++) kill(crowded, { y: i % 2 ? 370 : 510, fallback: i % 3 === 0 });
assert.equal(crowded.activeCorpses.filter(r => !r.fading).length, 34);
assertOrder(crowded);
for (const record of [...crowded.activeCorpses].filter(r => r.fading).reverse()) finishFade(crowded, record);
assert.equal(crowded.activeCorpses.length, 34);
assertOrder(crowded);
const empty = crowded.activeCorpses[0]; empty.objects.forEach(o => { o.destroyed = true; });
crowded.fadeCorpseRecord(empty); assert.ok(!crowded.activeCorpses.includes(empty));
console.log("corpse order verified: death chronology, mixed collapse durations, fallback sprites, fading/removal and 400-death burst");
