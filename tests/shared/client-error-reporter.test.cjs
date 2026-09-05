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
  const timers = [];
  let timerSequence = 0;
  let imageProbeCount = 0;
  const window = {
    location: { href: 'https://game.archerlab.dev/blockpang/', pathname: '/blockpang/', origin: 'https://game.archerlab.dev' },
    navigator: { userAgent, language: 'ko', onLine: options.onLine !== false },
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value)
    },
    addEventListener(name, listener) { listeners[name] = listener; },
    setTimeout: (callback, delay = 0) => {
      timerSequence += 1;
      timers.push({ id: timerSequence, callback, delay, cancelled: false });
      return timerSequence;
    },
    clearTimeout(id) {
      const timer = timers.find((item) => item.id === id);
      if (timer) timer.cancelled = true;
    },
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
      const probeIndex = imageProbeCount;
      imageProbeCount += 1;
      Promise.resolve().then(() => {
        const reachable = typeof options.imageReachable === 'function'
          ? options.imageReachable(probeIndex, value)
          : options.imageReachable !== false;
        if (!reachable) this.onerror?.();
        else this.onload?.();
      });
    }
  };
  window.window = window;
  window.document = document;
  vm.runInNewContext(source, window, { filename: 'client-error-reporter.js' });
  return {
    window,
    values,
    listeners,
    flushTimers(delay) {
      const selected = timers.filter((timer) => (
        !timer.cancelled && (delay === undefined || timer.delay === delay)
      ));
      for (const timer of selected) {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
        timer.callback();
      }
    }
  };
}

const crawler = loadReporter('Mozilla/5.0 (compatible; Google-Read-Aloud)');
crawler.window.ArcherLabClientErrorReporter.report(new Error('Rejected'), {
  source: 'shared-service-worker',
  url: 'sw.js'
});
assert.equal(crawler.values.has('archerlab-client-error-queue:v2'), false);

const yeti = loadReporter('Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd) Chrome/149.0.0.0 Safari/537.36');
yeti.window.ArcherLabClientErrorReporter.report(new Error('Rejected'), {
  source: 'shared-service-worker',
  url: 'sw.js'
});
assert.equal(yeti.values.has('archerlab-client-error-queue:v2'), false);

for (const userAgent of [
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/136.0.0.0 Safari/537.36 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  'Mozilla/5.0 (compatible; YandexRenderResourcesBot/1.0; +http://yandex.com/bots) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0'
]) {
  const automated = loadReporter(userAgent);
  automated.window.ArcherLabClientErrorReporter.report(new Error('Rejected'), {
    source: 'shared-service-worker',
    url: 'sw.js'
  });
  assert.equal(automated.values.has('archerlab-client-error-queue:v2'), false);
}

const browser = loadReporter('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36');
browser.window.ArcherLabClientErrorReporter.report(new Error('Real player failure'), {
  source: 'gameplay'
});
const queued = JSON.parse(browser.values.get('archerlab-client-error-queue:v2'));
assert.equal(queued.length, 1);
assert.match(queued[0].body.message, /Real player failure/);

const stylesheetRetry = loadReporter('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36');
const stylesheetAttributes = new Map([['rel', 'stylesheet']]);
const stylesheetTarget = {
  tagName: 'LINK',
  href: 'https://game.archerlab.dev/slimevolley/css/style.css?v=test',
  id: '',
  className: '',
  getAttribute: (name) => stylesheetAttributes.get(name) || null,
  setAttribute: (name, value) => stylesheetAttributes.set(name, value)
};
stylesheetRetry.listeners.error({ target: stylesheetTarget });
assert.equal(stylesheetAttributes.get('data-archerlab-stylesheet-retry'), '1');
assert.equal(stylesheetRetry.values.has('archerlab-client-error-queue:v2'), false);
stylesheetRetry.flushTimers(500);
assert.match(stylesheetTarget.href, /__resource_retry=/);
stylesheetRetry.listeners.error({ target: stylesheetTarget });
assert.equal(stylesheetAttributes.get('data-archerlab-stylesheet-retry'), '2');
stylesheetRetry.flushTimers(1000);
stylesheetRetry.listeners.error({ target: stylesheetTarget });
const stylesheetQueue = JSON.parse(stylesheetRetry.values.get('archerlab-client-error-queue:v2'));
assert.equal(stylesheetQueue.length, 1, 'a stylesheet must report only after both retries fail');
assert.equal(stylesheetQueue[0].body.errorType, 'resource_error');

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
  missing.flushTimers(3000);
  await Promise.resolve();
  await Promise.resolve();
  missing.flushTimers(750);
  const missingQueue = JSON.parse(missing.values.get('archerlab-client-error-queue:v2'));
  assert.equal(missingQueue.length, 1);
  assert.equal(missingQueue[0].body.errorType, 'resource_error');

  const recoveredOutage = loadReporter(
    'Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36',
    { imageReachable: (probeIndex) => probeIndex >= 9 }
  );
  for (let index = 0; index < 9; index += 1) {
    recoveredOutage.listeners.error({
      target: { tagName: 'IMG', currentSrc: `https://game.archerlab.dev/assets/recovered-${index}.png`, id: '', className: '' }
    });
  }
  await Promise.resolve();
  await Promise.resolve();
  recoveredOutage.flushTimers(3000);
  await Promise.resolve();
  await Promise.resolve();
  recoveredOutage.flushTimers(750);
  assert.equal(
    recoveredOutage.values.has('archerlab-client-error-queue:v2'),
    false,
    'a broad transient outage that recovers on delayed probes must not be reported'
  );

  const broadOutage = loadReporter('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36', { imageReachable: false });
  for (let index = 0; index < 9; index += 1) {
    broadOutage.listeners.error({
      target: { tagName: 'IMG', currentSrc: `https://game.archerlab.dev/assets/image-${index}.png`, id: '', className: '' }
    });
  }
  await Promise.resolve();
  await Promise.resolve();
  broadOutage.flushTimers(3000);
  await Promise.resolve();
  await Promise.resolve();
  broadOutage.flushTimers(750);
  const broadQueue = JSON.parse(broadOutage.values.get('archerlab-client-error-queue:v2'));
  assert.equal(broadQueue.length, 1, 'a broad image outage should create one diagnostic report');
  assert.match(broadQueue[0].body.message, /Multiple image resources failed to load/);
  assert.equal(broadQueue[0].body.context.failedImageCount, 9);

  const offline = loadReporter('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36', { imageReachable: false, onLine: false });
  offline.listeners.error({
    target: { tagName: 'IMG', currentSrc: 'https://game.archerlab.dev/assets/offline.png', id: '', className: '' }
  });
  await Promise.resolve();
  assert.equal(offline.values.has('archerlab-client-error-queue:v2'), false, 'offline image failures are not server defects');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
