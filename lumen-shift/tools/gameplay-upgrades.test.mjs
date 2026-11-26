import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { gravityIntervalMs } from "../js/gravity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
const rankingSource = fs.readFileSync(path.join(root, "js", "ranking.mjs"), "utf8");
const imageUiCss = fs.readFileSync(path.join(root, "css", "image-ui.css"), "utf8");

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing section ${startMarker} .. ${endMarker}`);
  return source.slice(start, end);
}

function loadCoreAndInput(overrides = {}) {
  const constantsSource = sliceBetween(mainSource, "const COLS = 10;", "const AUDIO_ASSET_VERSION");
  const stagesSource = sliceBetween(mainSource, "const STAGES = [", "function stageCountForMode");
  const helpersSource = sliceBetween(mainSource, "function stageCountForMode", "let cachedSafeAreaInsets");
  const coreSource = sliceBetween(mainSource, "class FallingBlockCore", "class PixiView");
  const inputSource = sliceBetween(mainSource, "class InputController", "class LumenShiftApp");

  const context = vm.createContext({
    gravityIntervalMs,
    Math,
    Number,
    Array,
    Object,
    String,
    JSON,
    Map,
    Set,
    performance: { now: () => 0 },
    window: { innerWidth: 1024, innerHeight: 768 },
    document: { hidden: false, documentElement: { lang: "ko" } },
    safeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
    readStorage: () => "",
    writeStorage: () => {},
    removeStorage: () => {},
    ...overrides,
  });

  vm.runInContext(
    `${constantsSource}\n${stagesSource}\n${helpersSource}\n${coreSource}\n${inputSource}\n`
      + "globalThis.FallingBlockCore = FallingBlockCore;\n"
      + "globalThis.InputController = InputController;\n"
      + "globalThis.ROWS = ROWS;\n"
      + "globalThis.COLS = COLS;\n",
    context,
  );

  return context;
}

test("SRS wall kicks allow bottom-row I piece CW and CCW rotation without going out of bounds", () => {
  const ctx = loadCoreAndInput();
  const core = new ctx.FallingBlockCore({});

  for (const dir of [1, -1]) {
    core.reset("journey");
    core.active = core.makePiece("I");
    core.active.y = 18; // Horizontal row-1 cells occupy bottom row 19.
    const rotated = core.rotate(dir);
    assert.equal(rotated, true, `I piece should kick up off floor for dir=${dir}`);
    assert.equal(core.collides(core.active, 0, 0), false);
    let maxRow = -1;
    for (let y = 0; y < core.active.matrix.length; y += 1) {
      for (let x = 0; x < core.active.matrix[y].length; x += 1) {
        if (core.active.matrix[y][x]) maxRow = Math.max(maxRow, core.active.y + y);
      }
    }
    assert.equal(maxRow, 19, "kicked vertical I piece rests flush on row 19");
  }
});

test("Hold swaps piece, locks until next spawn, and resets lock/drop timers", () => {
  const ctx = loadCoreAndInput();
  const events = [];
  const core = new ctx.FallingBlockCore({
    onHold: () => events.push("hold"),
  });

  const firstType = core.active.type;
  const nextType = core.queue[0];
  core.lockTimer = 400;
  core.dropTimer = 300;
  assert.equal(core.hold(), true);
  assert.equal(core.holdType, firstType);
  assert.equal(core.active.type, nextType);
  assert.equal(core.canHold, false);
  assert.equal(core.lockTimer, 0);
  assert.equal(core.dropTimer, 0);
  assert.equal(core.hold(), false, "second hold before locking must be ignored");
  assert.equal(events.length, 1);

  core.hardDrop();
  assert.equal(core.canHold, true, "locking spawns a new piece and re-enables hold");
  const thirdType = core.active.type;
  assert.equal(core.hold(), true);
  assert.equal(core.active.type, firstType);
  assert.equal(core.holdType, thirdType);
});

test("Lumen Zone activates at >= 30% charge, pauses gravity, banks lines, and emits server-exact zone_bonus", () => {
  const ctx = loadCoreAndInput();
  let zoneEndPayload = null;
  const core = new ctx.FallingBlockCore({
    onZoneEnd: (info) => { zoneEndPayload = info; },
  });

  assert.equal(core.activateZone(), false, "cannot activate zone below 30% lumen");
  core.lumen = 0.5;
  assert.equal(core.activateZone(), true);
  assert.equal(core.zoneActive, true);
  assert.equal(core.lumen, 0);
  assert.equal(core.dropInterval(), Infinity, "gravity pauses while zone is active");
  const zoneSnap = core.snapshot();
  assert.equal(Number.isFinite(zoneSnap.arrangement.progress), true, "arrangement progress stays finite during zone");
  assert.ok(zoneSnap.arrangement.progress >= 0 && zoneSnap.arrangement.progress <= 1);

  // Fill bottom 2 rows completely to test banking inside zone.
  for (let row = 18; row < 20; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      core.grid[row][col] = { type: "I", color: 0x68e9ff };
    }
  }
  const cleared = core.clearLines(false);
  assert.equal(cleared, 2);
  assert.equal(core.zoneLines, 2);

  core.tick(core.zoneDuration + 50);
  assert.equal(core.zoneActive, false);
  assert.ok(zoneEndPayload);
  const expectedBonus = 2 * 2 * 42 * core.level + 2 * 120;
  assert.equal(zoneEndPayload.lines, 2);
  assert.equal(zoneEndPayload.delta, expectedBonus);
});

test("Lock-delay reset cap prevents infinite stalling on the floor", () => {
  const ctx = loadCoreAndInput();
  const core = new ctx.FallingBlockCore({});
  core.active = core.makePiece("O");
  core.active.x = 4;
  core.active.y = 18; // Resting on floor (row 19).

  for (let i = 0; i < 20; i += 1) {
    core.lockTimer = 450;
    core.move(i % 2 === 0 ? -1 : 1);
  }
  assert.equal(core.lockResets, 15, "resets stop counting at MAX_LOCK_RESETS=15");
  assert.ok(core.lockTimer > 0, "16th+ move no longer clears lockTimer");

  core.tick(100);
  assert.notEqual(core.grid[19][4], null, "piece locks once lockDelay expires after cap");
});

test("InputController ignores editable targets and modifier shortcuts so nickname typing is never swallowed", () => {
  const listeners = {};
  const dispatched = [];
  const fakeWindow = {
    addEventListener(type, fn) { (listeners[`win:${type}`] ||= []).push(fn); },
    removeEventListener() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 2,
    clearInterval() {},
    innerWidth: 1024,
    innerHeight: 768,
  };
  const fakeDoc = {
    hidden: false,
    documentElement: { lang: "ko" },
    addEventListener(type, fn) { (listeners[`doc:${type}`] ||= []).push(fn); },
    removeEventListener() {},
  };
  const rootEl = { addEventListener() {}, removeEventListener() {} };

  const ctx = loadCoreAndInput({ window: fakeWindow, document: fakeDoc });
  const input = vm.runInContext(
    "new InputController(rootEl, null, (a) => dispatched.push(a))",
    Object.assign(ctx, { rootEl, dispatched }),
  );
  assert.ok(input);

  for (const key of ["a", "d", "s", "w", "x", "z", "p", " ", "Enter"]) {
    let prevented = false;
    listeners["win:keydown"].forEach((fn) => fn({
      key,
      target: { tagName: "INPUT", isContentEditable: false },
      preventDefault() { prevented = true; },
    }));
    assert.equal(prevented, false, `key "${key}" inside INPUT must not call preventDefault`);
  }

  let ctrlPrevented = false;
  listeners["win:keydown"].forEach((fn) => fn({
    key: "r",
    ctrlKey: true,
    target: { tagName: "BODY" },
    preventDefault() { ctrlPrevented = true; },
  }));
  assert.equal(ctrlPrevented, false);

  let holdPrevented = false;
  listeners["win:keydown"].forEach((fn) => fn({
    key: "c",
    target: { tagName: "BODY" },
    preventDefault() { holdPrevented = true; },
  }));
  assert.equal(holdPrevented, true);
  assert.deepEqual(dispatched, ["hold"]);
});

test("Secondary buttons keep dark optical-glass specificity and JS keeps iOS 12+ compatible syntax", () => {
  assert.doesNotMatch(
    imageUiCss,
    /\.secondary-button,\.submit-row button\)::before[^\{]*\{[^}]*background:/,
    "shared primary/secondary ::before rule must not set background",
  );
  assert.match(imageUiCss, /:is\(\.secondary-button,\.menu-screen \.secondary-button\)::before/);
  assert.equal(mainSource.match(/\?\./g), null, "main.js must not contain optional chaining");
  assert.equal(mainSource.match(/\?\?/g), null, "main.js must not contain nullish coalescing");
  assert.equal(rankingSource.match(/\?\./g), null, "ranking.mjs must not contain optional chaining");
  assert.equal(rankingSource.match(/\?\?/g), null, "ranking.mjs must not contain nullish coalescing");
});
