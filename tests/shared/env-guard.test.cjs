const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const REPORTER = 'shared/client-error-reporter.js';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

// Shared env guard test (prepended to the first shared script of each page).
const reporter = read(REPORTER);
const guardEnd = reporter.indexOf("})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));");
assert.ok(reporter.startsWith('/* ArcherLab environment guard'), 'env guard must be the first thing in ' + REPORTER);
assert.ok(guardEnd > 0, 'env guard block must be closed before the reporter');
const guardSource = reporter.slice(0, guardEnd) + "})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));";

function runGuard(setup, userAgent = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36') {
  const listeners = [];
  const win = { navigator: { userAgent, maxTouchPoints: 5 }, document: { addEventListener() {}, removeEventListener() {} }, addEventListener: (type, fn) => listeners.push([type, fn]) };
  win.window = win;
  setup(win);
  vm.runInNewContext(guardSource, Object.assign(win, { Object, Promise, Proxy, Math, Number, String, Array, Error }), { filename: 'env-guard.js' });
  return { win, listeners };
}
function exerciseStorage(storage) {
  assert.equal(storage.getItem('a'), null);
  storage.setItem('a', 1);
  assert.equal(storage.getItem('a'), '1');
  assert.equal(storage.length, 1);
  assert.equal(storage.key(0), 'a');
  assert.equal(storage.key(5), null);
  storage.setItem('b', 'x');
  assert.equal(storage.length, 2);
  storage.removeItem('a');
  assert.equal(storage.getItem('a'), null);
  storage.clear();
  assert.equal(storage.length, 0);
}
function throwingGetter(win, name) {
  Object.defineProperty(win, name, { get() { throw new Error('SecurityError: The operation is insecure.'); }, configurable: true });
}
function memoryApi() {
  const data = {};
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; }, clear() {}, key: () => null, get length() { return Object.keys(data).length; } };
}

{ // access throws
  const { win } = runGuard(w => { throwingGetter(w, 'localStorage'); throwingGetter(w, 'sessionStorage'); });
  exerciseStorage(win.localStorage);
  exerciseStorage(win.sessionStorage);
  assert.equal(win.__archerEnvGuard.memoryStorage.localStorage, true);
  assert.equal(win.__archerEnvGuard.memoryStorage.sessionStorage, true);
}
{ // null storage (Samsung / iOS in-app WebView)
  const { win } = runGuard(w => { w.localStorage = null; w.sessionStorage = undefined; });
  exerciseStorage(win.localStorage);
  exerciseStorage(win.sessionStorage);
  win.localStorage.foo = 'bar';
  assert.equal(win.localStorage.getItem('foo'), 'bar');
}
{ // setItem throws SecurityError
  const { win } = runGuard(w => { const s = memoryApi(); s.setItem = () => { const e = new Error('denied'); e.name = 'SecurityError'; throw e; }; w.localStorage = s; w.sessionStorage = memoryApi(); });
  assert.equal(win.__archerEnvGuard.memoryStorage.localStorage, true);
  exerciseStorage(win.localStorage);
  assert.equal(win.__archerEnvGuard.memoryStorage.sessionStorage, undefined, 'a working sessionStorage must stay untouched');
}
{ // writes silently dropped
  const { win } = runGuard(w => { const s = memoryApi(); s.setItem = () => {}; w.localStorage = s; w.sessionStorage = memoryApi(); });
  assert.equal(win.__archerEnvGuard.memoryStorage.localStorage, true);
}
{ // healthy environment is not touched
  let original;
  const { win } = runGuard(w => { original = memoryApi(); w.localStorage = original; w.sessionStorage = memoryApi(); });
  assert.equal(win.localStorage, original);
  assert.deepEqual(JSON.parse(JSON.stringify(win.__archerEnvGuard.memoryStorage)), {});
}
{ // full-quota storage in a normal browser keeps the real object (app-level quota handling stays in charge)
  let original;
  const { win } = runGuard(w => { original = memoryApi(); original.setItem = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }; w.localStorage = original; w.sessionStorage = memoryApi(); });
  assert.equal(win.localStorage, original);
}
{ // UA hints
  const { win } = runGuard(() => {}, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 1000; 12.0)');
  assert.equal(win.__archerEnvGuard.env.inApp, 'naver');
  assert.equal(win.__archerEnvGuard.env.ios, true);
}

{ // canvas getImageData
  class Ctx { getImageData(x, y, w, h) { const e = new Error('The source width is 0'); e.name = w === 0 ? 'IndexSizeError' : 'InvalidStateError'; if (w === 99) { e.name = 'SecurityError'; } throw e; } createImageData(w, h) { return { width: w, height: h, data: [] }; } }
  class FakeImageData { constructor(w, h) { this.width = w; this.height = h; } }
  const { win } = runGuard(w => { w.CanvasRenderingContext2D = Ctx; w.ImageData = FakeImageData; });
  const image = new Ctx().getImageData(0, 0, 0, 0);
  assert.equal(image.width, 1);
  assert.equal(image.height, 1);
  const sized = new Ctx().getImageData(0, 0, 8, 4);
  assert.equal(sized.width, 8);
  assert.equal(sized.height, 4);
  assert.throws(() => new Ctx().getImageData(0, 0, 99, 1), /SecurityError|source width/, 'tainted-canvas SecurityError must still surface');
}

(async () => { // audio
  const gestures = [];
  class Audio { constructor() { this.state = 'suspended'; this.calls = 0; } resume() { this.calls += 1; if (this.calls === 1) return Promise.reject(new Error('Failed to start the audio device')); this.state = 'running'; return Promise.resolve(); } }
  const { win, listeners } = runGuard(w => {
    w.AudioContext = Audio;
    w.document.addEventListener = (type, fn) => gestures.push([type, fn]);
  });
  const ctx = new Audio();
  await ctx.resume();
  assert.equal(ctx.state, 'suspended');
  assert.ok(gestures.length > 0, 'a user-gesture retry must be registered');
  gestures.find(([type]) => type === 'pointerdown')[1]();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ctx.state, 'running');
  const handler = listeners.find(([type]) => type === 'unhandledrejection')[1];
  let prevented = false;
  handler({ reason: new Error('Failed to start the audio device'), preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  prevented = false;
  handler({ reason: new Error('boom'), preventDefault() { prevented = true; } });
  assert.equal(prevented, false);

  console.log('Environment guard (storage/canvas/audio) passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

