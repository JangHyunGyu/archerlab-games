"use strict";

// Runs the real job runner from game.js and the real icon jobs from
// ui-surfaces.js (no browser): continuations, pacing and upload order.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");
const start = gameSource.indexOf("  function runTimeSlicedJobs(");
const end = gameSource.indexOf("\n  // Sheets that are only cut into slices", start);
assert.ok(start > 0 && end > start, "runTimeSlicedJobs must exist in game.js");

let tasks = 0;
const sandbox = {
  performance,
  window: { setTimeout: (fn, ms) => { tasks += 1; return setTimeout(fn, ms); } }
};
vm.createContext(sandbox);
const runTimeSlicedJobs = vm.runInContext("(" + gameSource.slice(start, end).trim() + ")", sandbox);

async function testContinuations() {
  const log = [];
  let outstanding = 0;
  let maxOutstanding = 0;
  const preparedAt = new Map();
  const lateness = [];
  const jobs = [];
  for (let i = 0; i < 12; i += 1) {
    if (i % 4 === 3) {
      jobs.push(() => { log.push(`plain-${i}`); });
      continue;
    }
    jobs.push(() => {
      log.push(`draw-${i}`);
      outstanding += 1;
      maxOutstanding = Math.max(maxOutstanding, outstanding);
      preparedAt.set(i, performance.now());
      const upload = () => { outstanding -= 1; log.push(`upload-${i}`); };
      // Every third job has two steps (grade, then upload), like crossbow slices.
      if (i % 3 === 0) {
        return () => { lateness.push(performance.now() - preparedAt.get(i)); log.push(`grade-${i}`); return upload; };
      }
      return () => { lateness.push(performance.now() - preparedAt.get(i)); return upload(); };
    });
  }
  const progress = [];
  await runTimeSlicedJobs(jobs, () => ({ budget: 4, settleMs: 15, depth: 3 }), (value) => progress.push(value));
  for (let i = 0; i < 12; i += 1) {
    if (i % 4 === 3) {
      assert.equal(log.filter((entry) => entry === `plain-${i}`).length, 1);
      continue;
    }
    assert.equal(log.filter((entry) => entry === `draw-${i}`).length, 1, `job ${i} drawn once`);
    assert.equal(log.filter((entry) => entry === `upload-${i}`).length, 1, `job ${i} uploaded once`);
    assert.ok(log.indexOf(`draw-${i}`) < log.indexOf(`upload-${i}`));
    if (i % 3 === 0) assert.ok(log.indexOf(`grade-${i}`) < log.indexOf(`upload-${i}`));
  }
  assert.equal(outstanding, 0);
  assert.ok(maxOutstanding <= 3, `no more than depth continuations may be outstanding (saw ${maxOutstanding})`);
  assert.ok(lateness.every((ms) => ms >= 14), "continuations must wait settleMs after the draw");
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]), "progress must not go backwards");
  // Single-step uploads keep their job order (later uploads may replace a key).
  const singleStep = log.filter((entry) => /^upload-\d+$/.test(entry)).map((entry) => Number(entry.slice(7))).filter((i) => i % 3 !== 0);
  assert.deepEqual(singleStep, [...singleStep].sort((a, b) => a - b));
}

async function testBudgetSplitsTasks() {
  tasks = 0;
  const jobs = Array.from({ length: 6 }, () => () => {
    const until = performance.now() + 3;
    while (performance.now() < until) { /* simulated work */ }
  });
  await runTimeSlicedJobs(jobs, () => ({ budget: 1, settleMs: 0, depth: 1 }), () => {});
  assert.ok(tasks >= 6, `a job longer than the budget must end its task (tasks: ${tasks})`);
  tasks = 0;
  await runTimeSlicedJobs(jobs.map(() => () => {}), () => ({ budget: 1000, settleMs: 0, depth: 8 }), () => {});
  assert.ok(tasks <= 2, "a large budget runs short jobs in one task");
}

async function testErrorsReject() {
  await assert.rejects(
    runTimeSlicedJobs([() => () => { throw new Error("upload failed"); }], () => ({ budget: 10, settleMs: 0, depth: 2 }), () => {}),
    /upload failed/
  );
  await runTimeSlicedJobs([], () => ({ budget: 10, settleMs: 0, depth: 2 }), (value) => assert.equal(value, 1));
}

function testIconJobsReplaceGeneratedSkillTextures() {
  const uiSandbox = {
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) }
  };
  vm.createContext(uiSandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/ui-surfaces.js"), "utf8"), uiSandbox);
  const ui = uiSandbox.SchoolZombieUI;
  const cache = new Map();
  const scene = { textures: {
    exists: (key) => cache.has(key),
    get: () => ({ getSourceImage: () => ({ width: 1024, height: 1024 }) }),
    remove: (key) => cache.delete(key),
    addImage: (key, source) => {
      // Phaser refuses a key that is still in use.
      if (cache.has(key)) throw new Error(`Texture key already in use: ${key}`);
      cache.set(key, source);
    }
  } };
  const drawn = [];
  const jobs = ui.iconJobs(scene, (canvas) => drawn.push(canvas));
  assert.equal(jobs.length, Object.keys(ui.ICONS).length + 16);
  const uploads = jobs.map((job) => job());
  assert.equal(drawn.length, jobs.length, "every icon is drawn once");
  // A generated skill texture with the same key is uploaded after the icon was
  // drawn but before the icon upload, as happens in the paced builder.
  const generated = { generated: true };
  cache.set("skill-pierce", generated);
  uploads.forEach((upload) => upload());
  assert.notEqual(cache.get("skill-pierce"), generated, "the icon must replace the generated skill texture");
  assert.equal(cache.get("skill-pierce").width, 256);
  assert.ok(cache.has("equipment-wrench"));
  // The synchronous wrapper still installs everything.
  cache.clear();
  ui.installIcons(scene);
  assert.equal(cache.size, jobs.length);
}

(async () => {
  await testContinuations();
  await testBudgetSplitsTasks();
  await testErrorsReject();
  testIconJobsReplaceGeneratedSkillTextures();
  console.log("Combat asset jobs verified: continuations, pacing, depth, order, errors and icon replacement");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
