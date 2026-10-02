"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
const constant = name => vm.runInNewContext("(" + source.match(
  new RegExp("const " + name + " = ([\\s\\S]*?);")
)[1] + ")");
const sandbox = Object.fromEntries([
  "CHARACTER_READY_SOURCE_FRAMES", "CHARACTER_ATTACK_ACTIONS",
  "CHARACTER_ATTACK_RELEASE_FRAMES", "CHARACTER_ATTACK_FRAME_DURATIONS",
  "CHARACTER_RECOVERY_BLEND_DURATIONS", "CHARACTER_FRAME_BLEND_DURATIONS", "CHARACTER_TURN_BLEND_SCALE",
  "CHARACTER_FRAME_MUZZLE_OFFSETS", "CHARACTER_MUZZLE_OFFSETS", "CHARACTER_MUZZLE_EFFECT_ANGLE_OVERRIDES",
  "DIRECTIONAL_MUZZLE_EFFECT_DEFENDERS", "MUZZLE_CORE", "THROW_ANIMATION_FRAMES",
  "THROW_ANIMATION_FRAME_DURATION", "WEAPON_SFX_INTENSITY", "MUZZLE_EFFECTS",
  "SHOCK_EFFECT_OUTER_COLOR"
].map(name => [name, constant(name)]));
sandbox.Phaser = { BlendModes: { ADD: 1 } };

function method(name, next) {
  const start = source.indexOf("    " + name + "(");
  const end = source.indexOf("\n    " + next + "(", start);
  assert.ok(start >= 0 && end > start, name);
  return vm.runInNewContext("({" + source.slice(start, end) + "})." + name, sandbox);
}

// Check which actual source/cell is used for every ready pose, including aliases.
const poseKeys = ["10", "1030", "11", "1130", "12", "1230", "13", "1330", "14"].map(p => "aim-" + p);
sandbox.AIM_POSE_KEYS = poseKeys;
sandbox.AIM_ALIASES = { idle: "aim-12", left: "aim-1030", up: "aim-12", right: "aim-1330" };
sandbox.DEFENDER_ROSTER = Array.from("abcdefgh", id => ({ id }));
const slices = new Map();
sandbox.makeImageSliceTexture = (scene, key, output, x, y, width, height) => slices.set(output, { key, x, y, width, height });
const factoryStart = source.indexOf("  function createCharacterSpriteTextures(");
const factoryEnd = source.indexOf("  function createCharacterAttackTextures(", factoryStart);
const makeReady = vm.runInNewContext("(" + source.slice(factoryStart, factoryEnd).trim() + ")", sandbox);
const assets = new Map(Array.from("abcdefgh", id => ["character-" + id, { width: 900, height: 500 }]));
for (const [id, frame] of Object.entries(sandbox.CHARACTER_READY_SOURCE_FRAMES)) {
  assets.set(`character-${id}-${id === "f" ? "throw" : "attack"}-${frame}`, { width: 1800, height: 640 });
}
const sceneTextures = { textures: { exists: key => assets.has(key), get: key => ({ getSourceImage: () => assets.get(key) }) } };
makeReady(sceneTextures);
for (const id of "cfgh") {
  const frame = { c: 0, f: 0, g: 1, h: 0 }[id];
  const key = `character-${id}-${id === "f" ? "throw" : "attack"}-${frame}`;
  poseKeys.forEach((pose, index) => {
    const slice = slices.get(`character-${id}-${pose}`);
    assert.equal(slice.key, key, `${id} must retain the attack drawing's hand, body and equipment`);
    assert.equal(slice.x, index * 200, "ready pose must keep the requested direction");
  });
  assert.equal(slices.get(`character-${id}-idle`).key, key);
}
assets.delete("character-f-throw-0");
makeReady(sceneTextures);
assert.equal(slices.get("character-f-aim-1030").key, "character-f", "missing optional action source must preserve fallback");

const attackFactoryEnd = source.indexOf("  function releaseCharacterSourceTextures(", factoryEnd);
const makeAttacks = vm.runInNewContext("(" + source.slice(factoryEnd, attackFactoryEnd).trim() + ")", sandbox);
sandbox.CHARACTER_ATTACK_FRAME_ZERO_ALIASES = constant("CHARACTER_ATTACK_FRAME_ZERO_ALIASES");
assets.set("character-f-throw-4", { width: 4608, height: 640 });
sceneTextures.textures.remove = key => assets.delete(key);
makeAttacks(sceneTextures);
poseKeys.forEach((pose, index) => {
  const slice = slices.get(`character-f-throw-${pose}-4`);
  assert.deepEqual({ ...slice }, { key: "character-f-throw-4", x: index * 512, y: 0, width: 512, height: 640 });
});

function sprite(key = "ready") {
  const item = { texture: { key }, x: 270, y: 925, originX: 0.5, originY: 1, displayWidth: 100, displayHeight: 200, rotation: 0, alpha: 1, depth: 200 };
  for (const name of ["setOrigin", "setDisplaySize", "setRotation", "setFlip", "setAlpha", "setDepth"]) item[name] = () => item;
  item.setTexture = key => { item.texture.key = key; return item; };
  return item;
}
const startAttack = method("startDefenderAttackAnimation", "getAttackPose");
const update = method("updateDefenderAnimations", "updateSpawning");
sandbox.getAimPose = key => ({ key, angle: 0 });
const blendFrame = method("blendDefenderFrame", "setDefenderPose");
const getMuzzle = method("getDefenderMuzzle", "syncDefenderMuzzleFlash");
const syncMuzzleFlash = method("syncDefenderMuzzleFlash", "createHud");
for (const id of "abcdefgh") for (const dt of [1 / 60, 0.1, 0.5]) {
  const defender = { id, sprite: sprite(), recruited: true, pose: "aim-1030" };
  let releases = 0;
  const scene = {
    defenders: [defender], textures: { exists: () => true },
    fitDefenderActionHeight() {}, trackTransient: x => x,
    add: { image: () => sprite() }, tweens: { add() {} },
    blendDefenderFrame: blendFrame, syncDefenderMuzzleFlash: syncMuzzleFlash,
    setDefenderPose(d, pose) { d.attackAnimation = null; d.pose = pose; d.sprite.setTexture("ready-" + pose); }
  };
  startAttack.call(scene, defender, "aim-1030", () => releases++);
  assert.equal(defender.attackAnimation.frames, id === "f" ? 5 : 4,
    "only the firebomb thrower gets an extra recovery frame");
  const duration = (sandbox.CHARACTER_ATTACK_FRAME_DURATIONS[id] || [0.075, 0.075, 0.075, 0.075]).reduce((a, b) => a + b, 0);
  const ticks = Math.ceil((duration + 1e-8) / dt);
  for (let tick = 0; tick < ticks; tick++) update.call(scene, dt);
  assert.equal(releases, 1, `${id}: fire exactly once, including frame catch-up`);
  assert.equal(defender.attackAnimation, null, `${id}: recovery cannot stretch at low FPS / 2x speed`);
  assert.equal(defender.pose, "aim-1030", "recovery must preserve aim");
  assert.equal(defender.sprite.y, 925, "feet must remain planted");
}

// Exercise the extra pose at every aim, without delaying or repeating the throw.
for (const pose of poseKeys) {
  const defender = { id: "f", sprite: sprite(), recruited: true };
  let releases = 0;
  const scene = {
    defenders: [defender], textures: { exists: () => true },
    fitDefenderActionHeight() {}, trackTransient: x => x,
    add: { image: () => sprite() }, tweens: { add() {} },
    blendDefenderFrame: blendFrame, syncDefenderMuzzleFlash: syncMuzzleFlash,
    setDefenderPose(d, p) { d.attackAnimation = null; d.pose = p; d.sprite.setTexture("ready-" + p); }
  };
  startAttack.call(scene, defender, pose, () => releases++);
  update.call(scene, 0.149);
  assert.equal(releases, 0, "firebomb cannot be released early");
  update.call(scene, 0.002);
  assert.equal(releases, 1, "firebomb still releases at 150 ms");
  update.call(scene, 0.15);
  assert.equal(defender.sprite.texture.key, `character-f-throw-${pose}-4`);
  update.call(scene, 0.12);
  assert.equal(defender.sprite.texture.key, "ready-" + pose);
  assert.equal(releases, 1);
}

const createMuzzle = method("createMuzzle", "createWeaponDischarge");
const createDischarge = method("createWeaponDischarge", "createAimFlash");
for (const projectile of ["projectile-shock", "projectile-firebomb", "projectile-nail"]) {
  const calls = [];
  const graphic = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return graphic; } });
  let cleanup;
  let removed = false;
  const scene = {
    add: { graphics: () => graphic }, trackTransient: object => object,
    tweens: { add: options => { cleanup = options.onComplete; } },
    destroyTransientObject: object => { assert.equal(object, graphic); removed = true; },
    createWeaponDischarge: createDischarge
  };
  createMuzzle.call(scene, 31, 47, -0.7, projectile);
  assert.ok(calls.some(([name, x, y]) => name === "setPosition" && x === 31 && y === 47));
  assert.ok(calls.some(([name, angle]) => name === "setRotation" && angle === -0.7));
  cleanup();
  assert.ok(removed, "weapon discharge must release its transient object");
}

const minimumFlashWidth = {
  "projectile-arrow": 50, "projectile-pistol": 50, "projectile-rifle": 60, "projectile-sniper": 74, "projectile-rocket": 84
};
for (const [projectile, effect] of Object.entries(sandbox.MUZZLE_EFFECTS)) {
  let origin;
  const flash = sprite();
  flash.setOrigin = (x, y) => { origin = [x, y]; return flash; };
  flash.setBlendMode = () => flash;
  const core = sprite();
  core.setBlendMode = () => core;
  const coreArgs = [];
  const tweenTargets = [];
  const returned = createMuzzle.call({
    textures: { get: () => ({ getSourceImage: () => ({ width: 200, height: 100 }) }) },
    add: { image: () => flash, circle: (...args) => { coreArgs.push(args); return core; } },
    trackTransient: x => x, tweens: { add: options => tweenTargets.push(options.targets) }
  }, 40, 60, -1, projectile);
  assert.deepEqual(origin, [effect.originX, 0.5], "hotspot must stay anchored during flash scaling");
  assert.ok(origin[0] > 0.08 && origin[0] < 0.5);
  assert.ok(effect.width >= minimumFlashWidth[projectile], `${projectile} flash must stay large enough to read on the dark field`);
  assert.ok(effect.alpha >= 0.9, `${projectile} flash must stay bright`);
  assert.equal(coreArgs.length, 1, `${projectile} flash needs a white-hot core`);
  assert.deepEqual(coreArgs[0].slice(0, 2), [40, 60], "core must sit on the muzzle hotspot");
  assert.equal(returned, flash, "createMuzzle must hand back the live flash so it can follow recoil frames");
  assert.equal(returned.muzzleCore, core);
  assert.ok(tweenTargets.includes(core) && tweenTargets.includes(flash), "both flash layers must fade out");
}

// Frame blending: aim -> fire and frame -> frame are dissolved for gun carriers only.
for (const id of "abcdefgh") {
  const defender = { id, sprite: sprite("ready-aim-12"), recruited: true, pose: "aim-12" };
  const ghosts = [];
  const tweens = [];
  const scene = {
    defenders: [defender], textures: { exists: () => true },
    fitDefenderActionHeight() {}, trackTransient: x => x,
    add: { image: () => { const ghost = sprite(); ghosts.push(ghost); return ghost; } },
    tweens: { add: options => tweens.push(options) },
    destroyTransientObject() {},
    blendDefenderFrame: blendFrame, syncDefenderMuzzleFlash: syncMuzzleFlash,
    setDefenderPose(d, p) { d.attackAnimation = null; d.pose = p; d.sprite.setTexture("ready-" + p); }
  };
  const baseBlend = sandbox.CHARACTER_FRAME_BLEND_DURATIONS[id] || 0;
  startAttack.call(scene, defender, "aim-1030");
  if (baseBlend) {
    assert.equal(ghosts.length, 1, `${id}: turning toward a new target must dissolve from the previous drawing`);
    assert.equal(tweens[0].duration, baseBlend * sandbox.CHARACTER_TURN_BLEND_SCALE, `${id}: turn blend is stretched`);
    assert.equal(tweens[0].alpha, 0);
    update.call(scene, 0.08);
    assert.ok(ghosts.length >= 2, `${id}: frame-to-frame transitions must be interpolated`);
    scene.reducedMotion = true;
    const before = ghosts.length;
    update.call(scene, 0.08);
    assert.equal(ghosts.length, before, `${id}: reduced motion must skip dissolves`);
  } else {
    assert.equal(ghosts.length, 0, `${id}: curated sheets keep their reviewed timing`);
  }
}

// The sniper's recoil frames swing the barrel, so a live flash must follow it.
{
  const defender = { id: "e", x: 488, y: 878, aim: { pivot: [2, -132], reach: 64 }, pose: "aim-12" };
  const moves = [];
  const flash = sprite();
  flash.setPosition = (x, y) => { moves.push([x, y]); return flash; };
  const core = sprite();
  core.setPosition = (x, y) => { moves.push(["core", x, y]); return core; };
  flash.muzzleCore = core;
  defender.muzzleFlash = { flash, pose: "aim-12", shotOffset: 0 };
  const scene = { getDefenderMuzzle: getMuzzle };
  syncMuzzleFlash.call(scene, defender, 3);
  assert.equal(moves.length, 0, "frames without their own barrel position must not move the flash");
  const ready = getMuzzle.call(scene, defender, "aim-12");
  syncMuzzleFlash.call(scene, defender, 1);
  assert.deepEqual(moves[0], [488 - 15, 878 - 180], "recoil frame 1 moves the flash onto the swung barrel");
  assert.notEqual(moves[0][0], ready.x);
  assert.deepEqual(moves[1], ["core", 488 - 15, 878 - 180]);
  flash.destroyed = true;
  syncMuzzleFlash.call(scene, defender, 2);
  assert.equal(defender.muzzleFlash, null, "a destroyed flash must be released");
}

let played;
method("playWeaponSfx", "shakeCamera").call({ playSfx: (name, intensity) => { played = { name, intensity }; } }, "projectile-sniper");
assert.equal(played.name, "sniper");
assert.equal(played.intensity, 1.3);
assert.ok(played.intensity / 1.18 < 1.11, "sniper lift must remain modest");

const alphaCheck = spawnSync("python", ["-c", [
  "from pathlib import Path",
  "from PIL import Image",
  "import sys",
  "root=Path(sys.argv[1])/'assets/images'",
  "recovery_png=Image.open(root/'character-f-throw-4.png').convert('RGBA')",
  "recovery_webp=Image.open(root/'character-f-throw-4.webp').convert('RGBA')",
  "assert recovery_png.size==(4608,640) and recovery_png.tobytes()==recovery_webp.tobytes(), 'recovery must retain lossless RGBA'",
  "for i in range(9):",
  " cell=recovery_png.crop((i*512,0,(i+1)*512,640))",
  " box=cell.getchannel('A').point(lambda a: 255 if a>32 else 0).getbbox()",
  " assert box and min(box[:2])>=6 and box[2]<=506 and box[3]<=634, f'recovery direction {i} clips'",
  "for kind in ['pistol','rifle','sniper','shock']:",
  " a=Image.open(root/f'projectile-{kind}.png').convert('RGBA')",
  " b=Image.open(root/f'projectile-{kind}.webp').convert('RGBA')",
  " assert a.size==b.size and a.getchannel('A').tobytes()==b.getchannel('A').tobytes(), kind",
  " assert a.getchannel('A').getextrema()[0]==0, kind",
  " bounds=a.getchannel('A').getbbox()",
  " assert bounds and min(bounds[:2])>0 and bounds[2]<a.width and bounds[3]<a.height, kind",
  " assert bounds[3]-bounds[1] > a.height*.6, f'{kind}: transparent source padding shrank the projectile'"
].join("\n"), root], { encoding: "utf8" });
assert.equal(alphaCheck.status, 0, alphaCheck.stderr);
console.log("allied polish verified: 36 ready/attack directions, low-FPS releases, planted feet, weapon-specific flashes, projectile alpha, modest sniper gain");
