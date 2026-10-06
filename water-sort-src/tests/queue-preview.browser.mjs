// Real-browser check of reservation badges (n↑ on the bottle that sends, ↓n on the one that
// receives) and of the faded incoming layers drawn on bottles that queued pours will fill.
// Same setup as ghost-preview.browser.mjs: GHOST_URL, GHOST_API (local Worker), GHOST_VIEWPORT,
// GHOST_SHOT (screenshot right after two reservations are queued), GHOST_SHOT_MANY (screenshot
// with the longest chain on one bottle queued), PW_CHROMIUM. Live runs create
// one unregistered run that never reaches the ranking.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pour, sharedBottom, won } from '../lib/game.ts';
import { glassInterior, liquidSurface } from '../lib/glass-renderer.ts';
import { idle } from './browser-play.mjs';

const url = process.env.GHOST_URL || 'http://127.0.0.1:8080/water-sort/';
const api = process.env.GHOST_API;
const shot = process.env.GHOST_SHOT;
const [vw, vh] = (process.env.GHOST_VIEWPORT || '390x844').split('x').map(Number);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const userAgent = api ? undefined : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const context = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: vw < 600, ...(userAgent ? { userAgent } : {}), ...(api ? { serviceWorkers: 'block' } : {}) });
const page = await context.newPage();
// While a chain is being checked, the first pour's request is held back (a slow network): the
// pouring bottles stay busy until the server answers, so the queue can't start draining between
// taps and every snapshot shows exactly the reservations made so far.
let gate = null;
await page.route(/workers\.dev\/water-sort\/challenge/, async route => {
  const request = route.request();
  if (gate && request.method() === 'POST' && JSON.parse(request.postData() || '{}').type === 'pour') await gate.promise;
  if (!api) return route.continue();
  const target = new URL(request.url());
  const response = await fetch(new URL(target.pathname + target.search, api), { method: request.method(), headers: { 'content-type': 'application/json' }, body: request.method() === 'POST' ? request.postData() : undefined });
  await route.fulfill({ status: response.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await response.text() });
});
const hold = () => { let release; const promise = new Promise(r => { release = r; }); gate = { promise, release }; };
const release = () => { gate?.release(); gate = null; };
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
let latest = null;
page.on('response', async response => { if (/challenge/.test(response.url()) && response.request().method() === 'POST') try { const d = await response.json(); if (d?.run) latest = d.run; } catch { /* not JSON */ } });

// Expected badge text and incoming layers for a board with these pours queued behind `first`.
const badge = (queue, i) => queue.flatMap(([from, to], k) => from === i ? [`${k + 1}↑`] : to === i ? [`↓${k + 1}`] : []).join('·');
function expected(now, queue, lifted) {
  let planned = now;
  for (const [from, to] of queue) planned = pour(planned, from, to);
  return now.map((tube, i) => {
    const keep = sharedBottom(tube, planned[i]);
    return { badge: badge(queue, i), incoming: !lifted.includes(i) && planned[i].length > keep ? planned[i].slice(keep).join(',') : null, keep };
  });
}
const read = () => page.evaluate(() => [...document.querySelectorAll('.bottle-button')].map(el => {
  const label = el.querySelector('.queue-label'), box = el.getBoundingClientRect(), l = label?.getBoundingClientRect();
  return { badge: label ? label.textContent : '', incoming: el.getAttribute('data-incoming'), lifted: el.classList.contains('pour-source'), aria: el.getAttribute('aria-label'),
    fits: !label || (label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1 && l.left >= box.left - .5 && l.right <= box.right + .5), many: !!label?.classList.contains('queue-many'),
    // Every glyph box of the badge text, against the pill (the label's own box and background).
    text: label && label.textContent ? (() => { const range = document.createRange(); range.selectNodeContents(label); const rects = [...range.getClientRects()].filter(r => r.width && r.height); return { x0: Math.min(...rects.map(r => r.left)), y0: Math.min(...rects.map(r => r.top)), x1: Math.max(...rects.map(r => r.right)), y1: Math.max(...rects.map(r => r.bottom)) }; })() : null,
    pill: l ? { x0: l.left, y0: l.top, x1: l.right, y1: l.bottom } : null,
    tube: el.querySelector('.tube').getBoundingClientRect().y };
}));
// Effective alpha of the liquid in the middle of unit `unit` of bottle i's canvas.
async function alphaAt(i, unit) {
  const [w, h] = await page.evaluate(i => { const t = document.querySelector(`[data-testid="bottle-${i}"] .tube`); return [t.clientWidth, t.clientHeight]; }, i);
  const inner = glassInterior(w, h), y = 10 + (liquidSurface(inner, unit) + liquidSurface(inner, unit + 1)) / 2;
  return page.evaluate(({ i, x, y }) => {
    const canvas = document.querySelector(`[data-testid="bottle-${i}"] .tube > canvas`), ratio = canvas.width / canvas.clientWidth;
    return canvas.getContext('2d').getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1).data[3] / 255;
  }, { i, x: 10 + w / 2, y });
}
const tap = async i => { const b = await page.locator(`[data-testid="bottle-${i}"]`).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height * .55); };

// A first pour, then reservations that wait on it, all sharing one bottle M so that M ends up in
// several reservations. `score` ranks the chains found.
function findChain(b0, score) {
  let best = null;
  for (let a = 0; a < b0.length; a++) for (let b = 0; b < b0.length; b++) {
    const b1 = a !== b && pour(b0, a, b); if (!b1) continue;
    for (let m = 0; m < b0.length; m++) {
      const visit = (board, queue) => {
        // A chain that finishes the stage would swap the board mid-check.
        if (queue.length >= 2 && !won(board)) {
          const value = score(b1, queue, a, b);
          if (!best || value > best.value) best = { a, b, b1, queue, value };
        }
        if (queue.length === 5) return;
        for (let x = 0; x < b0.length; x++) for (let y = 0; y < b0.length; y++) {
          if (x === y || (x !== m && y !== m) || queue.length === 0 && ![a, b].includes(x) && ![a, b].includes(y)) continue;
          // A repeated last pair cancels instead of queueing again.
          if (queue.length && queue.at(-1)[0] === x && queue.at(-1)[1] === y) continue;
          const next = pour(board, x, y); if (next) visit(next, [...queue, [x, y]]);
        }
      };
      visit(b1, []);
    }
  }
  return best;
}
// Faded layers on a bottle that stays put (not the lifted source or the hidden in-flight target).
const visibleIncoming = (b1, queue, a, b) => expected(b1, queue, [a]).filter((e, i) => e.incoming && i !== a && i !== b).length;
// Best of all: the faded part sits on liquid that stays, so solid and faded show side by side.
const overSolid = (b1, queue, a, b) => expected(b1, queue, [a]).filter((e, i) => e.incoming && e.keep && i !== a && i !== b).length;

async function runChain({ a, b, b1, queue }, shotAt2, shotAtEnd) {
  const restingTubes = await page.evaluate(() => [...document.querySelectorAll('.bottle-button .tube')].map(t => t.getBoundingClientRect().y));
  // Wait out the server's bottle locks from earlier pours, so the first tap starts a pour at once.
  await page.waitForTimeout(Math.max(0, ...latest.bottleAvailableAt.map(t => t - latest.serverNow)) + 150);
  hold();
  await tap(a); await tap(b);
  await page.waitForSelector(`[data-testid="bottle-ghost-${a}"]`, { timeout: 3000 });
  const snapshots = [];
  for (let k = 1; k <= queue.length; k++) {
    const [x, y] = queue[k - 1];
    await tap(x); await tap(y);
    snapshots.push({ k, seen: await read() });
    if (k === 2 && shotAt2) await page.screenshot({ path: shotAt2 });
  }
  if (shotAtEnd) await page.screenshot({ path: shotAtEnd });
  // Cancel the last reservation by repeating it.
  const [lx, ly] = queue.at(-1);
  await tap(lx); await tap(ly);
  const cancelled = await read();
  await tap(lx); await tap(ly);
  const readded = await read();
  const fadedAlpha = [];
  for (const { k, seen } of snapshots) {
    const want = expected(b1, queue.slice(0, k), [a]);
    seen.forEach((bottle, i) => {
      assert.equal(bottle.badge, want[i].badge, `after ${k} reservation(s), bottle ${i} badge: ${JSON.stringify({ seen: seen.map(x => x.badge), want: want.map(x => x.badge), queue, first: [a, b] })}`);
      if (!bottle.lifted) assert.equal(bottle.incoming, want[i].incoming, `after ${k} reservation(s), bottle ${i} incoming`);
      assert.ok(bottle.fits, `bottle ${i} badge '${bottle.badge}' fits its bottle at ${vw}px`);
      if (bottle.text) {
        const { text: t, pill: p } = bottle;
        assert.ok(t.x0 >= p.x0 - .5 && t.x1 <= p.x1 + .5 && t.y0 >= p.y0 - .5 && t.y1 <= p.y1 + .5, `bottle ${i} badge '${bottle.badge}' text stays inside its pill at ${vw}x${vh}: ${JSON.stringify(bottle)}`);
      }
      // Badges never move the bottle: same tube position as before any reservation.
      assert.ok(Math.abs(bottle.tube - restingTubes[i]) < .5 || bottle.lifted, `bottle ${i} moved by its badge`);
      assert.equal(bottle.many, want[i].badge.split('·').length > 2 && want[i].badge !== '');
    });
  }
  const want1 = expected(b1, queue.slice(0, 1), [a]), [x1, y1] = queue[0];
  assert.equal(want1[x1].badge, '1↑'); assert.equal(want1[y1].badge, '↓1');
  assert.match(snapshots[0].seen[x1].aria, /예약 1번 보내는 병|source of queued pour 1/);
  assert.match(snapshots[0].seen[y1].aria, /예약 1번 받는 병|target of queued pour 1/);
  const multi = expected(b1, queue.slice(0, 2), [a]).findIndex(e => e.badge.includes('·'));
  assert.ok(multi >= 0, 'one bottle shows two reservations');
  const wantCancel = expected(b1, queue.slice(0, -1), [a]);
  cancelled.forEach((bottle, i) => { assert.equal(bottle.badge, wantCancel[i].badge, `cancel: bottle ${i} badge`); if (!bottle.lifted) assert.equal(bottle.incoming, wantCancel[i].incoming, `cancel: bottle ${i} incoming`); });
  const wantAll = expected(b1, queue, [a]);
  readded.forEach((bottle, i) => { assert.equal(bottle.badge, wantAll[i].badge); });
  // Faded incoming layers read at about the ghost's strength, solid layers stay solid.
  const filled = wantAll.map((e, i) => ({ ...e, i })).filter(e => e.incoming && !readded[e.i].lifted);
  for (const e of filled) {
    const units = e.incoming.split(',').length;
    if (e.keep) fadedAlpha.push({ solid: await alphaAt(e.i, e.keep - 1) });
    fadedAlpha.push({ faded: await alphaAt(e.i, e.keep + units - 1) });
  }
  release();
  // Everything lands: no faded layer is left, and the server board equals the projection.
  await idle(page, 30000);
  await page.waitForTimeout(300);
  let final = b1; for (const [x, y] of queue) final = pour(final, x, y);
  assert.deepEqual(latest.board, final);
  const after = await read();
  after.forEach((bottle, i) => { assert.equal(bottle.incoming, null, `bottle ${i} still shows incoming after landing`); assert.equal(bottle.badge, ''); });
  const solidAfter = [];
  for (const e of filled) solidAfter.push(await alphaAt(e.i, e.keep + e.incoming.split(',').length - 1));
  for (const f of fadedAlpha) {
    if ('faded' in f) assert.ok(f.faded > .38 && f.faded < .56, `faded incoming alpha ${f.faded.toFixed(2)}`);
    else assert.ok(f.solid >= .9, `solid layer alpha ${f.solid.toFixed(2)}`);
  }
  for (const s of solidAfter) assert.ok(s >= .9, `landed layer alpha ${s.toFixed(2)}`);
  return { first: `${a}→${b}`, queue: queue.map(p => p.join('→')), badges: snapshots.at(-1).seen.map(s => s.badge), filled: filled.map(e => e.i), fadedAlpha: fadedAlpha.map(f => +(f.faded ?? f.solid).toFixed(2)), solidAfter: solidAfter.map(v => +v.toFixed(2)) };
}

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.play-button').click();
  await page.locator('[data-testid="bottle-0"]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.bottle-button:not([disabled])').length > 0);
  await idle(page);
  // 1) Faded incoming layers on a resting bottle, already visible with two reservations.
  const fill = findChain(latest.board, (b1, queue, a, b) => Math.min(1, visibleIncoming(b1, queue.slice(0, 2), a, b)) * 20 + Math.min(1, overSolid(b1, queue.slice(0, 2), a, b)) * 10 + Math.min(1, overSolid(b1, queue, a, b)) * 6 + queue.length);
  assert.ok(fill && visibleIncoming(fill.b1, fill.queue.slice(0, 2), fill.a, fill.b), 'board offers reservations that fill a resting bottle');
  const one = await runChain(fill, shot);
  assert.ok(one.filled.length && one.fadedAlpha.length, 'faded layers were measured');
  // The first chain may have finished the stage; carry on with the next board once it is playable.
  await page.waitForFunction(() => document.querySelectorAll('.bottle-button:not([disabled])').length > 0 && !document.querySelector('.clear-burst'), null, { timeout: 20000 });
  for (let k = 0; k < 50 && latest.status !== 'playing'; k++) await page.waitForTimeout(100);
  await idle(page);
  // 2) The longest chain on one bottle (up to five) for the badge text and fit.
  const many = findChain(latest.board, (b1, queue) => queue.length);
  const two = await runChain(many, null, process.env.GHOST_SHOT_MANY);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ url, viewport: `${vw}x${vh}`, fill: one, many: two }));
  console.log('queue-preview browser check passed');
} finally { await browser.close(); }
