// Real-browser check of the lifted-bottle ghost and the faster pour pace, on the built bundle.
// Local: serve the repo root statically (e.g. `python3 -m http.server 8080`), start
// `wrangler dev --config wrangler.game-api.toml --local --port 8787`, then with Node 22:
//   GHOST_URL=http://127.0.0.1:8080/water-sort/ GHOST_API=http://127.0.0.1:8787 \
//   node --experimental-strip-types water-sort-src/tests/ghost-preview.browser.mjs
// GHOST_API reroutes the bundle's production API calls to the local Worker (service workers off).
// Live: GHOST_URL=https://game.archerlab.dev/water-sort/ and no GHOST_API. This creates one
// unregistered run that never reaches the ranking and is removed by the daily cleanup.
// GHOST_VIEWPORT=390x844 picks the screen; GHOST_SHOT=path.png saves a mid-pour screenshot (the
// capture stalls frames, so the duration check is skipped in that mode). GHOST_LEVEL=3 (or 6) plays
// the run up to that stage first; on a two-row board the checked pour goes from the top row down.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pour, solve } from '../lib/game.ts';
import { pourDuration } from '../lib/challenge-rules.ts';
import { WATER_COLORS } from '../lib/glass-renderer.ts';
import { overlaps } from '../lib/pour-motion.ts';
import { idle, layout, playTo } from './browser-play.mjs';

const url = process.env.GHOST_URL || 'http://127.0.0.1:8080/water-sort/';
const api = process.env.GHOST_API;
const shot = process.env.GHOST_SHOT;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const [vw, vh] = (process.env.GHOST_VIEWPORT || '1280x900').split('x').map(Number);
// The shared runtime skips service workers for HeadlessChrome (bot filter); a desktop UA lets the
// live check read the installed SW version.
const userAgent = api ? undefined : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const context = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: vw < 600, ...(userAgent ? { userAgent } : {}), ...(api ? { serviceWorkers: 'block' } : {}) });
const page = await context.newPage();
// Real frame geometry from PourAnimation (it records only when this array exists).
await page.addInitScript(() => { window.__pourProbe = []; });
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
  try { const data = await response.json(); if (data?.run) latest = { run: data.run, at: Date.now() }; if (data?.run && JSON.parse(response.request().postData() || '{}').type === 'pour') pourReplies.push({ ...data.run, rtt: response.request().timing().responseEnd }); } catch { /* not JSON */ }
});
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  const sw = api ? null : await page.evaluate(async () => {
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 8000))]);
    const script = registration?.active?.scriptURL;
    return script ? (await (await fetch(script, { cache: 'no-store' })).text()).match(/version: '([^']+)'/)?.[1] ?? script : null;
  }).catch(() => null);
  await page.locator('.play-button').click();
  await page.locator('[data-testid="bottle-0"]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.bottle-button:not([disabled])').length > 0);
  assert.equal(latest.run.pace, 2, 'the worker stamps the new pour pace on new runs');
  const stage = Number(process.env.GHOST_LEVEL || 1);
  if (stage > 1) await playTo(page, stage, () => latest?.run);
  assert.equal(latest.run.level, stage);
  const { rows } = await layout(page);
  const center = async i => { const box = await page.locator(`[data-testid="bottle-${i}"]`).boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height * .55, top: box.y }; };
  const points = await Promise.all(rows.map((_, i) => center(i)));
  const topRow = Math.min(...points.map(p => p.top));
  // Top-row sources first: they have the least room above them.
  const order = rows.map((_, i) => i).sort((x, y) => points[x].top - points[y].top || x - y);
  // GHOST_SOURCE=i forces a particular source bottle when the board allows it (e.g. a bottom-row one).
  if (process.env.GHOST_SOURCE) order.unshift(...order.splice(order.indexOf(Number(process.env.GHOST_SOURCE)), 1));
  // First pour A→B, then a reservation that changes A's final contents: A→C (tap the ghost to
  // select the pouring bottle) or else D→A (tap the ghost as the target). On two rows, a pour from
  // the top row into the row below comes first: the bottle has to lift over its own ghost there.
  const twoRows = Math.max(...rows) > 0, down = ([a, b]) => rows[b] > rows[a];
  const pairs = order.flatMap(a => rows.map((_, b) => [a, b])).filter(([a, b]) => a !== b).sort((x, y) => Number(down(y)) - Number(down(x)));
  const findPlan = board => {
    for (const [a, b] of pairs) {
      const b1 = pour(board, a, b); if (!b1) continue;
      for (let c = 0; c < board.length; c++) if (c !== b && c !== a && pour(b1, a, c)) return { a, b, second: [a, c], b1, b2: pour(b1, a, c) };
      for (let d = 0; d < board.length; d++) if (d !== b && d !== a && pour(b1, d, a)) return { a, b, second: [d, a], b1, b2: pour(b1, d, a) };
    }
    return null;
  };
  let b0 = latest.run.board, plan = findPlan(b0);
  // No downward pour on this board yet: find a few legal moves that keep the stage solvable and
  // lead to one, and play them first.
  if (twoRows && !(plan && down([plan.a, plan.b]))) {
    const key = board => board.map(t => t.join('')).join('|');
    const seen = new Set([key(b0)]);
    let queue = [{ board: b0, path: [] }], path = null;
    for (let depth = 0; depth < 4 && !path; depth++) {
      const next = [];
      for (const node of queue) for (let from = 0; from < node.board.length && !path; from++) for (let to = 0; to < node.board.length && !path; to++) {
        const board = from !== to && pour(node.board, from, to);
        if (!board || seen.has(key(board))) continue;
        seen.add(key(board));
        if (!solve(board, 20000)) continue;
        const found = findPlan(board);
        if (found && down([found.a, found.b])) path = [...node.path, [from, to]];
        else next.push({ board, path: [...node.path, [from, to]] });
      }
      queue = next;
    }
    assert.ok(path, 'a downward pour can be reached on this board');
    for (const [from, to] of path) {
      for (const i of [from, to]) await page.mouse.click(points[i].x, points[i].y);
      await idle(page);
    }
    b0 = latest.run.board; plan = findPlan(b0);
  }
  if (twoRows) assert.ok(down([plan.a, plan.b]), 'a top-row bottle pours into the row below');
  const movesBefore = latest.run.moves;
  // Only the checked pours and their frames count below.
  pourReplies.length = 0;
  await page.evaluate(() => { window.__pourProbe = []; });
  assert.ok(plan, 'board offers a pour plus a reservation touching the same bottle');
  const { a, b, second, b1, b2 } = plan;
  const amount1 = b1[b].length - b0[b].length, amount2 = b2[second[1]].length - b1[second[1]].length;
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
  await page.waitForSelector(`[data-testid="bottle-ghost-${a}"] canvas`, { timeout: 3000 });
  // The ghost's liquid must look see-through and muted, not like a real filled bottle.
  const sample = await page.evaluate(({ a }) => {
    const read = canvas => {
      const ratio = canvas.width / canvas.clientWidth, tube = canvas.parentElement, w = tube.clientWidth, h = tube.clientHeight;
      const x = Math.round((10 + w * .5) * ratio), y = Math.round((10 + 3 + .86 * (h - 3 - w * .16)) * ratio);
      const [r, g, b, alpha] = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
      return { r, g, b, alpha: alpha / 255 };
    };
    const ghostWrap = document.querySelector(`[data-testid="bottle-ghost-${a}"]`);
    const real = [...document.querySelectorAll('.bottle-button:not(.pour-source):not(.pour-target) .tube > canvas')].map(read).filter(p => p.alpha > 0.5);
    return { opacity: Number(getComputedStyle(ghostWrap).opacity), pixel: read(ghostWrap.querySelector('canvas')), flagged: ghostWrap.querySelector('canvas').dataset.ghost, real };
  }, { a });
  const sat = ({ r, g, b }) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const hexSat = hex => { const v = [1, 3, 5].map(o => parseInt(hex.slice(o, o + 2), 16)); return (Math.max(...v) - Math.min(...v)) / 255; };
  const ghostBottom = b1[a][0];
  const effectiveAlpha = sample.opacity * sample.pixel.alpha;
  assert.equal(sample.flagged, 'true');
  // Clearly visible, yet lighter than a real bottle.
  assert.ok(sample.opacity >= .65 && sample.opacity <= .78, `ghost opacity ${sample.opacity}`);
  if (ghostBottom !== undefined) {
    assert.ok(effectiveAlpha >= .4 && effectiveAlpha <= .55, `ghost liquid shows at ${effectiveAlpha.toFixed(2)} alpha`);
    assert.ok(sat(sample.pixel) < hexSat(WATER_COLORS[ghostBottom]) * .9, 'ghost liquid is muted');
  }
  // Same sampling point on real bottles reads solid, so the check measures the liquid itself.
  assert.ok(sample.real.length && sample.real.every(p => p.alpha >= .9));
  const [s0, s1] = second;
  // Tap the ghost slot (select or target), add the reservation, cancel it by repeating, add it again.
  for (let i = 0; i < 3; i++) { await tap(points[s0]); await tap(points[s1]); }
  if (shot) {
    await page.waitForFunction(() => document.querySelector('[data-testid="pour-animation"]')?.dataset.phase === 'pour', null, { timeout: 2000 }).catch(() => {});
    await page.screenshot({ path: shot });
  }
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
  console.log(JSON.stringify({ url, sw, lockMs: (() => { const r = pourReplies.find(x => x.moves === movesBefore + 1); return r ? r.bottleAvailableAt[a] - r.serverNow : null; })(), plan: { a, b, second, amount1, amount2 }, measured: Math.round(measured), want, old: pourDuration(amount1, undefined), ghostSeq }));
  if (!shot) {
    assert.ok(measured >= want - 40 && measured <= want + 150, `first pour animation ${measured} ms vs ${want} ms`);
    assert.ok(measured < pourDuration(amount1, undefined) - 100, 'faster than the old pace');
  }
  // The Worker locked both bottles of the first pour for exactly the new duration.
  const firstReply = pourReplies.find(r => r.moves === movesBefore + 1);
  const lock = firstReply.bottleAvailableAt[a] - firstReply.serverNow;
  // serverNow is stamped after the D1 write, so the remaining lock is shorter by that processing time.
  assert.ok(lock <= want && lock >= want - firstReply.rtt - 20, `server lock ${lock} ms vs ${want} ms (rtt ${Math.round(firstReply.rtt)} ms)`);
  assert.equal(firstReply.bottleAvailableAt[a], firstReply.bottleAvailableAt[b]);
  // Final real bottle contents equal the ghost's projection, confirmed by the server.
  assert.deepEqual(latest.run.board[a], b2[a]); assert.equal(latest.run.moves, movesBefore + 2);
  assert.deepEqual(consoleErrors, []);
  // Lifted bottle and stream: drawn outline from the real frames. Once the bottle has lifted off and
  // until it starts back (hover + pour), neither touches the ghost slot; every frame stays on screen.
  const frames = await page.evaluate(() => window.__pourProbe);
  const mine = frames.filter(f => f.from === a);
  assert.ok(mine.some(f => f.phase === 'pour'), 'pour frames were recorded');
  const hit = (box, g) => box.x0 < g.x1 && box.x1 > g.x0 && box.y0 < g.y1 && box.y1 > g.y0;
  for (const f of mine) {
    assert.equal(f.blocked, false, 'the room above cleared the ghost');
    assert.ok(f.vessel.y0 >= 0 && f.vessel.x0 >= 0 && f.vessel.x1 <= f.viewport.width && f.vessel.y1 <= f.viewport.height, `bottle leaves the screen at t=${f.t.toFixed(2)} ${JSON.stringify(f.vessel)}`);
    if (f.t < .24 || f.t >= .77) continue;
    assert.equal(overlaps(f.outline, f.ghost), false, `lifted bottle covers the ghost at t=${f.t.toFixed(2)}`);
    if (f.stream) {
      // The stream falls straight down, so it may only pass the ghost when the receiving bottle
      // stands right under the source slot.
      const stacked = rows[f.to] > rows[f.from] && f.stream.x0 < f.ghost.x1 && f.stream.x1 > f.ghost.x0;
      if (!stacked) assert.equal(hit(f.stream, f.ghost), false, 'stream crosses the ghost');
      assert.ok(f.stream.y0 >= 0);
      // The stream leaves the bottle's mouth and ends inside the receiving bottle's opening.
      const target = await page.locator(`[data-testid="bottle-${f.to}"] .tube`).boundingBox();
      assert.ok(f.stream.x0 >= target.x && f.stream.x1 <= target.x + target.width && f.stream.y1 > target.y, `stream lands in the receiving bottle ${JSON.stringify({ stream: f.stream, target })}`);
    }
  }
  const pourFrames = mine.filter(f => f.phase === 'pour');
  console.log(JSON.stringify({ viewport: `${vw}x${vh}`, stage, rows: Math.max(...rows) + 1, pour: `${a}→${b}`, fromRow: rows[a], toRow: rows[b], sourceTopRow: points[a].top === topRow, lift: Math.round(pourFrames[0].lift), highest: Math.round(Math.min(...mine.map(f => f.vessel.y0))), ghostAlpha: +effectiveAlpha.toFixed(2), ghostOpacity: sample.opacity }));
  console.log('ghost-preview browser check passed');
} finally { await browser.close(); }
