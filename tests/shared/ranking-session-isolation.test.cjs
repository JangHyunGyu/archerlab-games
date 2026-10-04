const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const section = (file, start, end) => read(file).split(start)[1].split(end)[0];
function classSource(file, name) {
  const source = read(file), start = source.indexOf(`class ${name} {`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('class not found');
}

function fixture(game) {
  const requests = [];
  const context = { console: { warn() {} }, Date, Promise,
    GAME_ID: game, GAME_ID_BLOCKPANG: game, GAME_API_URL: 'https://api', RANK_API_BASE: 'https://api',
    RANK_EVENT_BATCH_LIMIT: 20, MOVE_UPLOAD_BATCH_SIZE: 20,
    SESSION_REQUEST_TIMEOUT_MS: 10000, MOVE_UPLOAD_TIMEOUT_MS: 10000,
    normalizeBlockpangSeed: Number, makeBlockpangSeed: () => 12345,
    markSaveDirty() {}, warn() {}, withServerTrip: callback => callback(),
    DEFAULT_CHARACTER_ID: 'shadowMonarch', GAME_ID_SHADOW: 'shadow-survival-character-v1',
    getCharacterRankingGameId: (game, character) => `${game}-${character}`,
    fetch(url, options) { return new Promise(resolve => requests.push({ url, body: JSON.parse(options.body), resolve })); },
  };
  context.window = context; context.globalThis = context; context.fetchWithTimeout = context.fetch;
  vm.createContext(context);
  let source, names;
  if (game === 'solo-leveling') {
    const file = 'solo-leveling/js/scenes/GameScene.js';
    source = `class Client { init(data = {}) {${section(file, 'init(data = {}) {', 'create() {')}
      _initRankSession() {${section(file, '_initRankSession() {', '_getRankGameId() {')}
      async _syncRankProgress(force = false) {${section(file, '_syncRankProgress(force = false) {', 'async _flushRankProgress() {')}
      _getRankGameId() { return 'shadow-survival-character-v1-shadowMonarch'; }
      _getRankProgressEvent(score) { return { type: 'progress', survived_seconds: score, level: 31, kills: 500, shadow_count: 5 }; }
      start() { this.init(); this._initRankSession(); return this._rankSessionPromise; }
      _autoSave() {}
    } globalThis.client = new Client();`;
    names = ['start', null, '_rankSessionId', null, '_rankSyncFailed'];
  } else if (game === 'lumen-shift') {
    source = read('lumen-shift/js/ranking.mjs').replace('export class', 'class');
    names = ['start', 'flush', 'sessionId', 'queue', 'disabled'];
    source += '\nglobalThis.client = new RankClient();';
  } else if (game === 'jewelria' || game === 'jelly-pang-2048') {
    source = classSource(game === 'jewelria' ? 'jewelria/assets/js/main.js' : 'jelly-pang-2048/js/main.js', 'RankingClient');
    names = ['startSession', game === 'jewelria' ? 'flush' : 'flushMoves', 'sessionId', game === 'jewelria' ? 'queue' : 'pendingEvents', 'syncFailed'];
    source += '\nglobalThis.client = new RankingClient();';
  } else if (game === 'blockpang' || game === 'parking_escape') {
    const block = game === 'blockpang';
    const start = block ? '_resetRankSessionState() {' : 'resetRankSessionState() {';
    const end = block ? 'generatePieces() {' : 'bindUI() {';
    source = `class Client { ${start}${section(block ? 'blockpang/js/Game.js' : 'parking-escape/js/main.js', start, end)} }`;
    source += '\nglobalThis.client = new Client(); client._autoSave = () => {};';
    names = [block ? '_startRankSession' : 'startRankSession', block ? 'flushRankEvents' : null,
      'rankSessionId', block ? 'rankEventQueue' : null, 'rankSyncFailed'];
  } else {
    source = `let rankRunToken = {}, rankSessionId, rankVerifiedScore, rankSessionPromise, rankEventQueue = [], rankNextEventSeq = 1, rankFlushPromise, rankSyncFailed;
      function resetRankSessionState() {${section('cat-tower/js/game.js', 'function resetRankSessionState() {', 'function setupCanvas() {')}
      globalThis.client = { start: startRankSession, restore: restoreRankSession, flush: flushRankEvents,
        get sessionId() { return rankSessionId; }, get queue() { return rankEventQueue; },
        get failed() { return rankSyncFailed; }, get sessionPromise() { return rankSessionPromise; } };`;
    names = ['start', 'flush', 'sessionId', 'queue', 'failed'];
  }
  vm.runInContext(source, context);
  const client = context.client;
  const start = () => { const result = client[names[0]](); return result || client.sessionPromise || client.rankSessionPromise; };
  const respond = (index, data = {}, status = 200) => requests[index].resolve({ ok: status === 200, status,
    json: async () => ({ success: true, protocol: 2, seed: 12345, ...data }), text: async () => '' });
  return { client, requests, start, respond, setTransport: transport => { context.ArcherRanking = transport; },
    flush: () => client[names[1]](), session: () => client[names[2]],
    queue: () => client[names[3]], failed: () => !!(client[names[4]] || client.unsupported), hasQueue: !!names[3] };
}

for (const game of ['cat-tower', 'blockpang', 'jewelria', 'jelly-pang-2048', 'lumen-shift', 'parking_escape', 'solo-leveling']) {
  test(`${game}: an old start response cannot overwrite the restarted session`, async () => {
    const f = fixture(game), old = f.start(), current = f.start();
    f.respond(1, { session_id: 'new' }); await current;
    f.respond(0, { session_id: 'old' }); await old;
    assert.equal(f.session(), 'new');
    assert.equal(f.failed(), false);
  });
  test(`${game}: an old start failure cannot disable the restarted session`, async () => {
    const f = fixture(game), old = f.start(), current = f.start();
    f.respond(1, { session_id: 'new' }); await current;
    f.respond(0, {}, 400); await old;
    assert.equal(f.session(), 'new');
    assert.equal(f.failed(), false);
  });
  if (game === 'parking_escape' || game === 'solo-leveling') continue;
  test(`${game}: an old upload response cannot consume the new game's queue`, async () => {
    const f = fixture(game), initial = f.start();
    f.respond(0, { session_id: 'old' }); await initial;
    f.queue().push({ type: 'clear', delta: 100, level: 1, combo: 1 });
    const upload = f.flush();
    // flush() can wait for ensureSession() before making its network call.
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(f.requests[1].url.endsWith('/score-events'));
    const current = f.start(); f.respond(2, { session_id: 'new' }); await current;
    f.queue().push({ type: 'clear', delta: 200, level: 1, combo: 1 });
    f.respond(1, { score: 100, move_seq: 1 }); await upload;
    assert.equal(f.session(), 'new');
    assert.equal(f.queue().length, 1);
    assert.equal(f.queue()[0].delta, 200);
  });
}

test('solo-leveling: an old progress response cannot change the new run score', async () => {
  const f = fixture('solo-leveling'), initial = f.start();
  f.respond(0, { session_id: 'old' }); await initial;
  f.client.enemyManager = { getGameTime: () => 20000 };
  const upload = f.client._syncRankProgress();
  await new Promise(resolve => setImmediate(resolve));
  const current = f.start(); f.respond(2, { session_id: 'new' }); await current;
  f.respond(1, { score: 20 }); await upload;
  assert.equal(f.session(), 'new');
  assert.equal(f.client._rankSyncedScore, 0);
});

test('jelly-pang: concurrent flushes share one upload and apply its response once', async () => {
  const f = fixture('jelly-pang-2048'), initial = f.start();
  f.respond(0, { session_id: 'one' }); await initial;
  f.queue().push({ type: 'move', move_seq: 1, dir: 'left' });
  const first = f.flush(), second = f.flush();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.requests.length, 2);
  f.respond(1, { score: 4, move_seq: 1 }); await Promise.all([first, second]);
  assert.equal(f.queue().length, 0);
  assert.equal(f.client.verifiedScore, 4);
});

test('cat-tower: an offline save without a session id recovers its original journal session', () => {
  const f = fixture('cat-tower');
  const event = { type: 'merge', created_tier: 1, combo: 1, delta: 25, seq: 1, _delivery_id: 'saved-event' };
  // Install the transport in the actual VM global used by the extracted client.
  const source = read('cat-tower/js/game.js');
  assert.match(source, /rankSessionId: rankSessionId \|\| window\.ArcherRanking\?\.sessionId\(GAME_ID\)/);
  // The fixture exposes its VM window via the shared function's realm.
  f.setTransport({ pending: () => [{ id: 'saved-event', gameId: 'cat-tower', sessionId: 'retained-run' }] });
  f.client.restore(null, 25, [event], 2);
  assert.equal(f.session(), 'retained-run');
  assert.equal(f.requests.filter(r => r.url.endsWith('/score-sessions')).length, 0);
});

test('blockpang: an offline save keeps its original seed-bound journal session', () => {
  const f = fixture('blockpang');
  f.setTransport({ pending: () => [{ path: '/score-sessions', gameId: 'blockpang', sessionId: 'retained-run', body: { seed: 12345 } }] });
  f.client._restoreRankSession(null, 10, { protocol: 2, seed: 12345, rngState: 54321, moveSeq: 3 });
  assert.equal(f.session(), 'retained-run');
  assert.equal(f.failed(), false);
  assert.equal(f.requests.length, 0);
  assert.match(read('blockpang/js/Game.js'), /rankSessionId: this\.rankSessionId \|\| window\.ArcherRanking\?\.sessionId\(GAME_ID_BLOCKPANG\)/);
});
