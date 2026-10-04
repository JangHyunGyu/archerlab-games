'use strict';
// Chrome/native browser storage + real SQLite. Every game API request is local;
// this harness never submits QA scores to the production service.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const { server, d1, storage } = require('../tests/helpers/ranking-delivery.cjs');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '../output/ranking-audit-20261004');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const files = http.createServer((request, response) => {
  let relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (relative.endsWith('/')) relative += 'index.html';
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});
const games = [
  ['cat-tower', 'cat-tower', { type: 'merge', created_tier: 1, combo: 1, delta: 25, seq: 1 }, 25],
  ['blockpang', 'blockpang', { type: 'move', seq: 1, slot_index: 0, grid_x: 0, grid_y: 0 }, null],
  ['jewelria', 'jewelria', { type: 'match', removed: 3, longest: 3, lines: 1, special: 0, combo: 1, delta: 30 }, 30],
  ['jelly-pang-2048', 'jelly-pang-2048', { type: 'move', move_seq: 1, dir: 'left' }, 4],
  ['lumen-shift', 'lumen-shift', { type: 'clear', lines: 1, level: 81, combo: 1, delta: 8100 }, 8100],
  ['parking-escape', 'parking_escape', { type: 'level_clear', moves: 1, level_moves: 1, vehicles: 2, seed: 123 }, 2],
  ['solo-leveling', 'shadow-survival-character-v1-shadowMonarch', { type: 'progress', survived_seconds: 20, level: 31, kills: 500, shadow_count: 5 }, 20],
];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => files.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + files.address().port;
  const db = d1(); await server.initDB(db);
  const boxes = new Map();
  const env = { DB: db, RANKING_DELIVERY: { getByName(id) {
    if (!boxes.has(id)) boxes.set(id, new server.RankingDelivery({ storage: storage() }, { DB: db }));
    return boxes.get(id);
  } } };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const reports = [];
  try {
    for (const [folder, game, event, expected] of games) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      let disconnected = false;
      await context.route('https://game-api.yama5993.workers.dev/**', async route => {
        if (disconnected) { await route.abort('internetdisconnected'); return; }
        const q = route.request();
        if (new URL(q.url()).pathname === '/client-errors') { await route.fulfill({ status: 200, body: '{}' }); return; }
        const result = await server.deliveryWorker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: q.postData() || undefined }), env);
        await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers), body: await result.text() });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/' + folder + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.ArcherRanking);
      const started = await page.evaluate(async game => {
        const res = await fetch('https://game-api.yama5993.workers.dev/score-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: game, seed: 12345 }) });
        return res.json();
      }, game);
      assert.ok(started.session_id);
      db.sql.prepare('UPDATE ranking_sessions SET started_at = started_at - 3600000 WHERE session_id = ?').run(started.session_id);
      if (game === 'jelly-pang-2048') {
        // Model a reachable, already verified board prefix; test its next merge.
        const state = JSON.parse(db.sql.prepare('SELECT state_json FROM ranking_sessions WHERE session_id = ?').get(started.session_id).state_json);
        state.grid = [[0, 0, null, null], ...Array.from({ length: 3 }, () => Array(4).fill(null))];
        db.sql.prepare('UPDATE ranking_sessions SET state_json = ? WHERE session_id = ?').run(JSON.stringify(state), started.session_id);
      }
      const score = expected ?? started.pieces[0].cellCount;
      disconnected = true;
      const pending = await page.evaluate(async ({ game, event, score, session }) => {
        window.ArcherRanking.track(game, event, session);
        return window.ArcherRanking.submit({ game_id: game, session_id: session, player_name: 'Local Chrome QA', score });
      }, { game, event, score, session: started.session_id });
      assert.equal(pending.pending, true);
      assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM ranking_submissions WHERE session_id = ?').get(started.session_id).n, 0);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.ArcherRanking?.pending().some(entry => entry.path === '/rankings'));
      disconnected = false;
      await page.evaluate(() => window.ArcherRanking.flush());
      await page.waitForFunction(() => !window.ArcherRanking.pending().some(entry => entry.path === '/rankings'));
      const saved = db.sql.prepare('SELECT score FROM ranking_submissions WHERE session_id = ?').get(started.session_id);
      assert.equal(saved.score, score);
      await page.evaluate(() => window.ArcherRanking.flush());
      assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM ranking_submissions WHERE session_id = ?').get(started.session_id).n, 1);
      assert.equal(errors.length, 0, errors.join('\n'));
      reports.push({ game, score, reloadRecovered: true, submissions: 1, errors });
      console.log(`${game}: offline intent + reload + reconnect saved ${score} exactly once`);
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'chrome-ranking-recovery.json'), JSON.stringify(reports, null, 2));
  } finally { await browser.close(); await new Promise(resolve => files.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
