const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../shared/client-error-reporter.js'), 'utf8');

function loadReporter(userAgent) {
  const values = new Map();
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
    addEventListener() {},
    setTimeout: () => 1,
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
  window.window = window;
  window.document = document;
  vm.runInNewContext(source, window, { filename: 'client-error-reporter.js' });
  return { window, values };
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
