// Code bugs (e.g. "Assignment to constant variable") must never be hidden as a
// transient network failure: the Cupid FreeTalk regression went unlogged for two days.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtimeSource = fs.readFileSync(path.join(__dirname, '../../shared/game-runtime.js'), 'utf8');
const reporterSource = fs.readFileSync(path.join(__dirname, '../../shared/client-error-reporter.js'), 'utf8');

function loadRuntime(fetch, onLine = true) {
  const reports = [];
  const window = {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/test-game/' },
    navigator: { onLine },
    document: { currentScript: { getAttribute: key => key === 'data-game-id' ? 'test-game' : null } },
    addEventListener() {},
    ArcherLabClientErrorReporter: { reportPayload: payload => reports.push(payload) },
    Promise, Date
  };
  window.window = window;
  vm.runInNewContext(runtimeSource, window, { filename: 'game-runtime.js' });
  return { reports, ranking: window.ArcherGames.createRankingClient({ fetch }), runtime: window.ArcherGames };
}

function loadReporter(onLine = true) {
  const values = new Map();
  const document = {
    currentScript: { src: '', getAttribute: key => key === 'data-game-id' ? 'blockpang' : null },
    documentElement: { lang: 'ko' }, visibilityState: 'visible', addEventListener() {},
    head: { appendChild() {} }, createElement: () => ({ setAttribute() {} })
  };
  const window = {
    location: { href: 'https://game.archerlab.dev/blockpang/', pathname: '/blockpang/', origin: 'https://game.archerlab.dev' },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36', language: 'ko', onLine },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    addEventListener() {}, setTimeout: () => 0, clearTimeout() {}, fetch: async () => ({ ok: true }),
    console: { error() {} }, crypto: global.crypto, innerWidth: 400, innerHeight: 400, devicePixelRatio: 1,
    Promise, Date, Math, URL, Uint32Array
  };
  window.window = window; window.document = document;
  vm.runInNewContext(reporterSource, window, { filename: 'client-error-reporter.js' });
  return { api: window.ArcherLabClientErrorReporter, queued: () => JSON.parse(values.get('archerlab-client-error-queue:v2') || '[]') };
}

(async () => {
  // RankingClient: a network failure disables ranking quietly.
  let offline = loadRuntime(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(await offline.ranking.start(), '');
  assert.equal(offline.reports.length, 0);

  // HTTP errors are transport results, not client exceptions.
  let http = loadRuntime(async () => ({ ok: false, status: 503, json: async () => ({ error: 'busy' }) }));
  assert.equal(await http.ranking.start(), '');
  assert.equal(http.reports.length, 0);

  // A code-level TypeError is reported with a distinct errorType.
  let bug = loadRuntime(async () => { throw new TypeError("Cannot read properties of undefined (reading 'session_id')"); });
  assert.equal(await bug.ranking.start(), '');
  assert.equal(bug.reports.length, 1);
  assert.equal(bug.reports[0].error_type, 'ranking_client_exception');
  assert.equal(bug.reports[0].error_class, 'TypeError');
  assert.equal(bug.runtime.isRankingTransportFailure(new TypeError('x is not a function')), false);
  assert.equal(bug.runtime.isRankingTransportFailure(new TypeError('Load failed')), true);

  // Flush failures follow the same rule.
  let calls = 0;
  const flushBug = loadRuntime(async (url) => {
    calls += 1;
    if (url.endsWith('/score-sessions')) return { ok: true, status: 200, json: async () => ({ session_id: 's1' }) };
    throw new TypeError('Assignment to constant variable.');
  });
  assert.equal(await flushBug.ranking.start(), 's1');
  flushBug.ranking.record({ type: 'score', delta: 1 });
  assert.equal(await flushBug.ranking.flush(), false);
  assert.equal(flushBug.reports.length, 1);
  assert.match(flushBug.reports[0].message, /Assignment to constant variable/);
  assert.equal(calls, 2);

  // Shared reporter helper used by individual games.
  const reporter = loadReporter();
  for (const message of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'The network connection was lost.']) {
    assert.equal(reporter.api.isNetworkFailure(new TypeError(message)), true, message);
    assert.equal(reporter.api.reportClientException(new TypeError(message), {}, 'ranking_client_exception'), false);
  }
  assert.equal(reporter.api.isNetworkFailure(Object.assign(new Error('rank 500'), { archerTransport: true })), true);
  assert.equal(reporter.api.isNetworkFailure(Object.assign(new Error('timeout'), { name: 'AbortError' })), true);
  assert.equal(reporter.queued().length, 0);
  assert.equal(reporter.api.reportClientException(new TypeError('Assignment to constant variable.'), { phase: 'test' }, 'ranking_client_exception'), true);
  const queued = reporter.queued().map(item => item.body);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].errorType, 'ranking_client_exception');
  assert.equal(queued[0].errorClass, 'TypeError');
  assert.match(queued[0].message, /^\[ranking_client_exception\] TypeError: Assignment to constant variable\./);
  assert.equal(loadReporter(false).api.isNetworkFailure(new TypeError('x is not a function')), true, 'offline stays transient');

  console.log('✓ client exception reporting: network failures quiet, code TypeErrors reported');
})().catch((error) => { console.error(error); process.exit(1); });
