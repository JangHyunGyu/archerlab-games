const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../shared/client-error-reporter.js'), 'utf8');

function loadReporter(userAgent, options = {}) {
  const values = new Map();
  const listeners = {};
  const script = {
    src: '',
    getAttribute: (key) => key === 'data-game-id' ? 'blockpang' : null
  };
  const document = {
    currentScript: script,
    documentElement: { lang: 'ko' },
    title: 'Block Pang',
    visibilityState: 'visible',
    addEventListener() {},
    head: { appendChild() {} },
    createElement: () => ({ setAttribute() {} })
  };
  const window = {
    location: { href: 'https://game.archerlab.dev/blockpang/', pathname: '/blockpang/' },
    navigator: { userAgent, language: 'ko' },
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value)
    },
    addEventListener(name, listener) { listeners[name] = listener; },
    setTimeout: () => 1,
    clearTimeout() {},
    fetch: async () => ({ ok: true }),
    console: { error() {} },
    crypto: global.crypto,
    innerWidth: 400,
    innerHeight: 400,
    devicePixelRatio: 1,
    Promise,
    Date,
    Math,
    URL,
    Uint32Array
  };
  window.Image = class {
    set src(value) {
      this.currentSrc = value;
      Promise.resolve().then(() => {
        if (options.imageReachable === false) this.onerror?.();
        else this.onload?.();
      });
    }
  };
  window.window = window;
  window.document = document;
  vm.runInNewContext(source, window, { filename: 'client-error-reporter.js' });
  return { window, values, listeners };
}

const crawler = loadReporter('Mozilla/5.0 (compatible; Google-Read-Aloud)');
crawler.window.ArcherLabClientErrorReporter.report(new Error('Rejected'), {
  source: 'shared-service-worker',
  url: 'sw.js'
});
assert.equal(crawler.values.has('archerlab-client-error-queue:v2'), false);

const browser = loadReporter('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36');
browser.window.ArcherLabClientErrorReporter.report(new Error('Real player failure'), {
  source: 'gameplay'
});
const queued = JSON.parse(browser.values.get('archerlab-client-error-queue:v2'));
assert.equal(queued.length, 1);
assert.match(queued[0].body.message, /Real player failure/);

console.log('✓ client error reporter automation filtering verified');

(async () => {
  const transient = loadReporter('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36', { imageReachable: true });
  transient.listeners.error({
    target: { tagName: 'IMG', currentSrc: 'https://game.archerlab.dev/assets/healthy.png', id: '', className: '' }
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(
    transient.values.has('archerlab-client-error-queue:v2'),
    false,
    'a resource that succeeds on the immediate probe must not be persisted as an error'
  );

  const missing = loadReporter('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36', { imageReachable: false });
  missing.listeners.error({
    target: { tagName: 'IMG', currentSrc: 'https://game.archerlab.dev/assets/missing.png', id: '', className: '' }
  });
  await Promise.resolve();
  await Promise.resolve();
  const missingQueue = JSON.parse(missing.values.get('archerlab-client-error-queue:v2'));
  assert.equal(missingQueue.length, 1);
  assert.equal(missingQueue[0].body.errorType, 'resource_error');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
