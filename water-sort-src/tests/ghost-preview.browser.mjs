// Real-browser check of the lifted-bottle ghost and the faster pour pace, on the built bundle.
// Local: serve the repo root statically (e.g. `python3 -m http.server 8080`), start
// `wrangler dev --config wrangler.game-api.toml --local --port 8787`, then with Node 22:
//   GHOST_URL=http://127.0.0.1:8080/water-sort/ GHOST_API=http://127.0.0.1:8787 \
//   node --experimental-strip-types water-sort-src/tests/ghost-preview.browser.mjs
// GHOST_API reroutes the bundle's production API calls to the local Worker (service workers off).
// Live: GHOST_URL=https://game.archerlab.dev/water-sort/ and no GHOST_API. This creates one
// unregistered run that never reaches the ranking and is removed by the daily cleanup.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pour } from '../lib/game.ts';
import { pourDuration } from '../lib/challenge-rules.ts';

const url = process.env.GHOST_URL || 'http://127.0.0.1:8080/water-sort/';
const api = process.env.GHOST_API;
const shot = process.env.GHOST_SHOT;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const [vw, vh] = (process.env.GHOST_VIEWPORT || '1280x900').split('x').map(Number);
const context = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: vw < 600, ...(api ? { serviceWorkers: 'block' } : {}) });
const page = await context.newPage();
if (api) await page.route(/workers\.dev\/water-sort\/challenge/, async route => {
  const request = route.request(), target = new URL(request.url());
  const response = await fetch(new URL(target.pathname + target.search, api), { method: request.method(), headers: { 'content-type': request.headers()['content-type'] ?? 'application/json' }, body: request.method() === 'POST' ? request.postData() : undefined });
  await route.fulfill({ status: response.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await response.text() });
});
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(String(e)));
let latest = null; const pourReplies = [];
page.on('response', async response => {
  if (!/challenge/.test(response.url()) || response.request().method() !== 'POST') return;
  try { const data = await response.json(); if (data?.run) latest = { run: data.run, at: Date.now() }; if (data?.run && JSON.parse(response.request().postData() || '{}').type === 'pour') pourReplies.push(data.run); } catch { /* not JSON */ }
});
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  const sw = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    const script = registration?.active?.scriptURL || registration?.installing?.scriptURL || registration?.waiting?.scriptURL || null;
    return script;
  }).catch(() => null);
  await page.locator('.play-button').click();
  await page.locator('[data-testid="bottle-0"]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.bottle-button:not([disabled])').length > 0);
  const run = latest.run, b0 = run.board;
  assert.equal(run.pace, 2, 'the worker stamps the new pour pace on new runs');
  // First pour A→B, then a reservation that changes A's final contents. Prefer A→C (tap the ghost
  // to select the pouring bottle); fall back to D→A (tap the ghost as the target).
  let plan = null;
  for (let a = 0; a < b0.length && !plan; a++) for (let b = 0; b < b0.length && !plan; b++) {
    const b1 = pour(b0, a, b); if (!b1) continue;
    for (let c = 0; c < b0.length && !plan; c++) if (c !== b && c !== a && pour(b1, a, c)) plan = { a, b, second: [a, c], b1, b2: pour(b1, a, c) };
  }
  for (let a = 0; a < b0.length && !plan; a++) for (let b = 0; b < b0.length && !plan; b++) {
    const b1 = pour(b0, a, b); if (!b1) continue;
    for (let d = 0; d < b0.length && !plan; d++) if (d !== b && d !== a && pour(b1, d, a)) plan = { a, b, second: [d, a], b1, b2: pour(b1, d, a) };
  }
  assert.ok(plan, 'board offers a pour plus a reservation touching the same bottle');
  const { a, b, second, b1, b2 } = plan;
  const amount1 = b1[b].length - b0[b].length, amount2 = b2[second[1]].length - b1[second[1]].length;
  const center = async i => { const box = await page.locator(`[data-testid="bottle-${i}"]`).boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height * .55 }; };
  const points = await Promise.all(b0.map((_, i) => center(i)));
  // Timeline of ghost, lift and selection changes, stamped in the page.
  await page.evaluate(() => {
    const log = window.__ghostLog = [];
    const snap = () => [...document.querySelectorAll('.bottle-button')].map(el => ({ ghost: el.getAttribute('data-ghost'), source: el.classList.contains('pour-source'), target: el.classList.contains('pour-target'), pressed: el.getAttribute('aria-pressed') === 'true', queued: el.hasAttribute('data-queued'), label: el.getAttribute('aria-label'), ghostEl: !!el.querySelector('.bottle-ghost canvas') }));
    let last = '';
    const record = () => { const s = snap(), key = JSON.stringify(s); if (key !== last) { last = key; log.push({ t: performance.now(), s }); } };
    new MutationObserver(record).observe(document.querySelector('.board'), { subtree: true, attributes: true, childList: true });
    record();
  });
  const tap = p => page.mouse.click(p.x, p.y);
  await tap(points[a]); await tap(points[b]);
  await page.waitForSelector(`[data-testid="bottle-ghost-${a}"]`, { timeout: 3000 });
  if (shot) await page.screenshot({ path: shot.replace(/\.png$/, '-lifted.png') });
  const [s0, s1] = second;
  // Tap the ghost slot (select or target), add the reservation, cancel it by repeating, add it again.
  for (let i = 0; i < 3; i++) { await tap(points[s0]); await tap(points[s1]); }
  if (shot) await page.screenshot({ path: shot });
  // Both pours finish and nothing is pending for A.
  await page.waitForFunction(i => {
    const el = document.querySelector(`[data-testid="bottle-${i}"]`);
    return !document.querySelector('.bottle-ghost') && !el.hasAttribute('data-pouring') && !document.querySelector('[data-queued]') && !document.querySelector('.pour-source');
  }, a, { timeout: 8000 });
  await page.waitForTimeout(300);
  const log = await page.evaluate(() => window.__ghostLog);
  const key = tube => tube.join(',');
  const ghostSeq = [];
  for (const entry of log) { const g = entry.s[a].ghost; if (ghostSeq.at(-1) !== g) ghostSeq.push(g); }
  // null → b1[A] (no reservation) → b2[A] (added) → b1[A] (cancelled) → b2[A] (added again), then the
  // ghost leaves on return. When A is the source of the queued pour it is lifted again and the ghost
  // shows b2[A] once more; if the server lock already passed, the two lifts join without a gap.
  assert.deepEqual(ghostSeq.slice(0, 5), [null, key(b1[a]), key(b2[a]), key(b1[a]), key(b2[a])], 'ghost tracks the projected final contents');
  assert.equal(ghostSeq.at(-1), null, 'ghost leaves when the bottle is back and nothing is pending');
  assert.ok(ghostSeq.slice(5).every(g => g === null || g === key(b2[a])));
  if (s0 === a) {
    const queuedAt = log.findLastIndex(e => e.s[s1].queued);
    assert.ok(log.slice(queuedAt + 1).some(e => e.s[a].source && e.s[a].ghost === key(b2[a])), 'second lift shows the final contents');
  }
  // Ghost is drawn only while A is out of its slot, and it renders a real bottle canvas.
  for (const entry of log) {
    assert.equal(entry.s[a].ghost !== null, entry.s[a].source, 'ghost exists exactly while the bottle is lifted');
    if (entry.s[a].ghost !== null) assert.ok(entry.s[a].ghostEl);
    entry.s.forEach((bottle, i) => { if (i !== a && bottle.ghost !== null) assert.ok(bottle.source); });
  }
  // Tapping the ghost slot selected the pouring bottle (or used it as the target) like any bottle.
  const tapped = log.filter(e => e.s[a].ghost !== null);
  if (s0 === a) assert.ok(tapped.some(e => e.s[a].pressed), 'ghost tap selects the pouring bottle');
  assert.ok(tapped.some(e => e.s[s0 === a ? s1 : s0].queued), 'reservation queued during the animation');
  // Pour pace: the first pour's animation span equals 600 + 80/unit, below the old 1020 + 130/unit.
  // Measured on B, which only takes part in the first pour (a queued pour from A may follow at once).
  const liftStart = log.find(e => e.s[b].target).t, liftEnd = log.find(e => e.t > liftStart && !e.s[b].target).t;
  const measured = liftEnd - liftStart, want = pourDuration(amount1, 2);
  console.log(JSON.stringify({ url, sw, lockMs: (() => { const r = pourReplies.find(x => x.moves === 1); return r ? r.bottleAvailableAt[a] - r.serverNow : null; })(), plan: { a, b, second, amount1, amount2 }, measured: Math.round(measured), want, old: pourDuration(amount1, undefined), ghostSeq }));
  assert.ok(measured >= want - 40 && measured <= want + 150, `first pour animation ${measured} ms vs ${want} ms`);
  assert.ok(measured < pourDuration(amount1, undefined) - 100, 'faster than the old pace');
  // The Worker locked both bottles of the first pour for exactly the new duration.
  const firstReply = pourReplies.find(r => r.moves === 1);
  const lock = firstReply.bottleAvailableAt[a] - firstReply.serverNow;
  assert.ok(lock <= want && lock > want - 200, `server lock ${lock} ms vs ${want} ms`);
  assert.equal(firstReply.bottleAvailableAt[a], firstReply.bottleAvailableAt[b]);
  // Final real bottle contents equal the ghost's projection, confirmed by the server.
  assert.deepEqual(latest.run.board[a], b2[a]); assert.equal(latest.run.moves, 2);
  assert.deepEqual(consoleErrors, []);
  console.log('ghost-preview browser check passed');
} finally { await browser.close(); }
