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

  for (const userAgent of [
    'Mozilla/5.0 (compatible; Google-Read-Aloud)',
    'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd) Chrome/149.0.0.0 Safari/537.36'
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
