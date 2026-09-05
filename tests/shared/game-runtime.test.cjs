const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../shared/game-runtime.js'), 'utf8');
const values = new Map();
const storage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key)
};
const listeners = {};
const registrations = [];
const window = {
  localStorage: storage,
  location: { pathname: '/test-game/' },
  navigator: { serviceWorker: { register: async (url) => registrations.push(url) } },
  document: { currentScript: { getAttribute: (key) => ({ 'data-game-id': 'Test Game', 'data-service-worker': 'sw.js' })[key] || null } },
  addEventListener: (name, listener) => { listeners[name] = listener; },
  fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  Promise,
  Date
};
window.window = window;
vm.runInNewContext(source, window, { filename: 'game-runtime.js' });

assert.equal(window.ArcherGames.gameId, 'test-game');
assert.equal(window.ArcherGames.storage.setJSON('save', { stage: 3 }), true);
assert.equal(window.ArcherGames.storage.getJSON('save', null).stage, 3);
assert.equal(values.has('test-game:save'), true);
assert.equal(window.ArcherGames.audio.isEnabled(true), true);
window.ArcherGames.audio.setEnabled(false);
assert.equal(window.ArcherGames.audio.isEnabled(true), false);

const requests = [];
const ranking = window.ArcherGames.createRankingClient({
  now: () => 1234,
  fetch: async (url, options = {}) => {
    requests.push({ url, options });
    const body = url.endsWith('/score-sessions') ? { session_id: 'session-1' } : url.includes('/rankings?') ? { rankings: [{ score: 9 }] } : { ok: true };
    return { ok: true, status: 200, json: async () => body };
  }
});

(async () => {
  assert.equal(await ranking.start(), 'session-1');
  assert.equal(ranking.record({ type: 'score', delta: 4 }), true);
  assert.equal(await ranking.flush(), true);
  assert.equal(ranking.queue.length, 0);
  assert.deepEqual(await ranking.fetchTop(999), [{ score: 9 }]);
  assert.match(requests.at(-1).url, /limit=100$/);
  await listeners.load();
  assert.deepEqual(registrations, ['sw.js']);

  const retryDelays = [];
  const retryReports = [];
  let retryAttempts = 0;
  const retryWindow = {
    localStorage: storage,
    location: { pathname: '/lumen-shift/' },
    navigator: {
      onLine: true,
      serviceWorker: {
        register: async () => {
          retryAttempts += 1;
          if (retryAttempts < 3) throw new TypeError('transient service worker fetch failure');
          return { scope: '/lumen-shift/' };
        }
      }
    },
    document: { currentScript: { getAttribute: () => null } },
    addEventListener() {},
    ArcherLabClientErrorReporter: { report: (...args) => retryReports.push(args) },
    setTimeout(callback, delay) { retryDelays.push(delay); callback(); return retryDelays.length; },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    Promise,
    Date
  };
  retryWindow.window = retryWindow;
  vm.runInNewContext(source, retryWindow, { filename: 'game-runtime.js' });
  assert.deepEqual(await retryWindow.ArcherGames.registerServiceWorker('sw.js'), { scope: '/lumen-shift/' });
  assert.equal(retryAttempts, 3);
  assert.deepEqual(retryDelays, [500, 1000]);
  assert.deepEqual(retryReports, []);

  const persistentReports = [];
  let persistentAttempts = 0;
  retryWindow.ArcherGames = undefined;
  retryWindow.navigator.serviceWorker.register = async () => {
    persistentAttempts += 1;
    throw new TypeError('persistent service worker fetch failure');
  };
  retryWindow.ArcherLabClientErrorReporter = {
    report: (...args) => persistentReports.push(args)
  };
  vm.runInNewContext(source, retryWindow, { filename: 'game-runtime.js' });
  assert.equal(await retryWindow.ArcherGames.registerServiceWorker('sw.js'), null);
  assert.equal(persistentAttempts, 3);
  assert.equal(persistentReports.length, 1);
  assert.equal(persistentReports[0][1].attempts, 3);

  const lumenHtml = fs.readFileSync(path.join(__dirname, '../../lumen-shift/index.html'), 'utf8');
  assert.doesNotMatch(lumenHtml, /rel="preload"[^>]+title-screen-(?:desktop|mobile)-v2\.webp/);
  assert.match(lumenHtml, /game-runtime\.js\?v=20260905-bot-filter-v2/);

  for (const userAgent of [
    'Mozilla/5.0 (compatible; Google-Read-Aloud)',
    'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd) Chrome/149.0.0.0 Safari/537.36',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/136.0.0.0 Safari/537.36 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
    'Mozilla/5.0 (compatible; YandexRenderResourcesBot/1.0; +http://yandex.com/bots) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0'
  ]) {
    const crawlerListeners = {};
    const crawlerRegistrations = [];
    const crawlerReports = [];
    const crawlerWindow = {
      localStorage: storage,
      location: { pathname: '/blockpang/' },
      navigator: {
        userAgent,
        serviceWorker: {
          register: async (url) => {
            crawlerRegistrations.push(url);
            throw new Error('Rejected');
          }
        }
      },
      document: { currentScript: { getAttribute: (key) => ({ 'data-game-id': 'blockpang', 'data-service-worker': 'sw.js' })[key] || null } },
      addEventListener: (name, listener) => { crawlerListeners[name] = listener; },
      ArcherLabClientErrorReporter: { report: (error) => crawlerReports.push(error) },
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      Promise,
      Date
    };
    crawlerWindow.window = crawlerWindow;
    vm.runInNewContext(source, crawlerWindow, { filename: 'game-runtime.js' });
    await crawlerListeners.load();
    assert.deepEqual(crawlerRegistrations, []);
    assert.deepEqual(crawlerReports, []);
  }
  console.log('✓ shared game runtime storage/audio/ranking/service worker verified');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
