// Serve the repository root on :8080. All game writes stay inside this local API fixture.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { advance, expire, leaveStage, resumeStage } from '../lib/challenge.ts';
import { solve } from '../lib/game.ts';

const url = process.env.REWARDS_URL || 'http://127.0.0.1:8080/water-sort/';
const out = process.env.REWARDS_SHOTS || new URL('../../tmp/water-sort-alchemy/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const reports = [];
// Set REWARDS_VIEWPORTS=1440x900 for a focused capture, or none for functional checks only.
// REWARDS_PERF_ONLY=1 isolates frame timing from screenshot/fixture work.
const viewports = process.env.REWARDS_VIEWPORTS === 'none' ? [] : process.env.REWARDS_VIEWPORTS
  ? process.env.REWARDS_VIEWPORTS.split(',').map(value => value.split('x').map(Number))
  : [[320,568],[360,640],[390,844],[430,932],[768,1024],[1024,768],[667,375],[844,390],[1440,900]];
async function fixture(viewport, options = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', hasTouch: viewport.width < 600, reducedMotion: options.reduced ? 'reduce' : 'no-preference', deviceScaleFactor: 2 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let state, delay = 0, reject = false;
  await page.route(/\/water-sort\/(api\/)?challenge/, async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { turnstileSiteKey: null, rows: [] } });
    const request = route.request().postDataJSON(), now = Date.now();
    if (request.type === 'start') state = { rules: 2, id: 'local-effects', version: 1, level: options.level || 1, cleared: 0, score: 0, board: options.board || [[0,0,0,1],[1,1,1,0],[],[]], bottleAvailableAt: Array(options.board?.length || 4).fill(now), history: [], initialBoard: options.board || [[0,0,0,1],[1,1,1,0],[],[]], moves: 0, deadline: now + 60000, availableAt: now, status: 'playing', historyDepth: 0, registered: false, nickname: null, serverNow: now, pace: 2 };
    else if (request.type === 'pour') {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (reject) return route.fulfill({ status: 409, json: { error: 'conflict', run: { ...state, serverNow: Date.now() } } });
      state = { ...state, ...advance(state, { type: 'pour', from: request.from, to: request.to }, Date.now()), version: state.version + 1 };
    } else if (request.type === 'sync') state = { ...state, ...expire(state, now), version: state.version + 1 };
    else if (request.type === 'leave') state = { ...state, ...leaveStage(state, now), version: state.version + 1 };
    else if (request.type === 'resume') state = { ...state, ...resumeStage(state, now), version: state.version + 1 };
    state.serverNow = Date.now();
    await route.fulfill({ json: { run: state, ...(request.type === 'start' ? { token: 'fixture' } : {}) } });
  });
  const tap = async i => {
    const b = await page.locator(`[data-testid="bottle-${i}"]`).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height * .55);
  };
  const move = async (a, b) => { await tap(a); await tap(b); };
  const idle = () => page.waitForFunction(() => !document.querySelector('[data-pouring]'));
  await page.goto(url, { waitUntil: 'networkidle' });
  return { page, context, errors, tap, move, idle, state: () => state, delay: value => { delay = value; }, reject: () => { reject = true; } };
}
const assertLayout = async page => {
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('.bottle-button')].map(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom }; }), height: innerHeight }));
  assert.ok(layout.scroll <= layout.width, JSON.stringify(layout));
  for (const b of layout.buttons) { assert.ok(b.width >= 44 && b.height >= 44); assert.ok(b.x >= 0 && b.x + b.width <= layout.width + 1); assert.ok(b.y >= 0 && b.bottom <= layout.height + 1); }
};
try {
  if (!process.env.REWARDS_PERF_ONLY) {
  for (const mode of ['ordinary', 'completion', 'delayed', 'queued']) {
    const board = mode === 'ordinary' ? [[0,1],[1,0],[],[]] : [[0,0,0],[0],[1,1,1],[1],[],[]];
    const h = await fixture({ width: 390, height: 844 }, { board });
    await h.page.evaluate(() => {
      window.__pourProbe = []; window.__impactEvents = []; window.__impactSounds = [];
      new MutationObserver(records => {
        for (const record of records) {
          const node = record.target;
          window.__impactEvents.push({ id: Number(node.dataset.pourId), phase: node.dataset.pourPhase, at: Number(node.dataset.pourAt) });
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-pour-at'] });
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.__impactSounds.push({ at: performance.now(), duration: this.buffer?.duration });
        return start.apply(this, args);
      };
    });
    await h.page.locator('.play-button').click(); await h.page.locator('.bottle-button').first().waitFor();
    if (mode === 'delayed') h.delay(3000);
    await h.move(mode === 'ordinary' ? 0 : 1, mode === 'ordinary' ? 2 : 0);
    if (mode === 'queued') {
      await h.move(0,4);
      assert.equal(await h.page.evaluate(() => window.__impactEvents.some(e => e.id === 2)), false, 'reserving a move cannot fire its launch');
    }
    const id = mode === 'queued' ? 2 : 1;
    await h.page.waitForFunction(id => document.querySelector('.reward-overlay')?.dataset.pourId === String(id) && document.querySelector('.reward-overlay')?.dataset.pourPhase === 'filled', id);
    const timing = await h.page.evaluate(id => {
      const events = window.__impactEvents.filter(e => e.id === id);
      const frame = window.__pourProbe.find(f => f.id === id);
      return { events, launchMs: events.find(e => e.phase === 'launch').at - frame.started,
        contactLagMs: events.find(e => e.phase === 'contact').at - frame.started - frame.duration * .27,
        fillLagMs: events.find(e => e.phase === 'filled').at - frame.started - frame.duration * .73,
        sounds: window.__impactSounds };
    }, id);
    assert.deepEqual(timing.events.map(e => e.phase), ['launch','contact','filled']);
    assert.ok(timing.launchMs >= 0 && timing.launchMs < 50, JSON.stringify(timing));
    assert.ok(timing.contactLagMs >= -1 && timing.contactLagMs < 55, JSON.stringify(timing));
    assert.ok(timing.fillLagMs >= -1 && timing.fillLagMs < 55, JSON.stringify(timing));
    if (mode !== 'ordinary') {
      await h.page.waitForTimeout(50);
      const sounds = await h.page.evaluate(() => window.__impactSounds);
      assert.ok(sounds.some(s => Math.abs(s.duration - .68) < .005 && Math.abs(s.at - timing.events.at(-1).at) < 100), 'impact audio belongs on the fill frame');
    }
    if (mode === 'completion') await h.page.screenshot({ scale: 'css', path: `${out}/fill-frame-impact.png` });
    if (mode === 'delayed') {
      assert.equal(await h.page.locator('.completion-seal').count(), 0);
      assert.equal(await h.page.locator('[data-testid="score"]').textContent(), '0');
      await h.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.chain === '1');
      assert.equal(await h.page.locator('.completion-burst').count(), 0);
      assert.equal(await h.page.locator('.reward-overlay').getAttribute('data-active'), 'false');
      assert.equal(await h.page.evaluate(() => window.__impactSounds.filter(s => Math.abs(s.duration - .68) < .005).length), 1, 'late confirmation cannot replay the impact sound');
    }
    await h.idle();
    assert.equal(await h.page.evaluate(id => window.__impactEvents.filter(e => e.id === id && e.phase === 'filled').length, id), 1);
    assert.deepEqual(h.errors, []); reports.push({ mode: `pour frame timing: ${mode}`, ...timing });
    await h.context.close(); console.log(`PASS ${mode} timing: launch ${timing.launchMs.toFixed(1)}ms, contact +${timing.contactLagMs.toFixed(1)}ms, fill +${timing.fillLagMs.toFixed(1)}ms`);
  }
  for (const [width, height] of viewports) {
    const h = await fixture({ width, height }), { page } = h;
    await page.screenshot({ scale: 'css', path: `${out}/${width}-title.png` });
    await page.locator('.play-button').click(); await page.locator('.bottle-button').first().waitFor();
    await assertLayout(page);
    await h.tap(0); await page.waitForTimeout(150);
    assert.ok(await page.locator('.selected .alchemy-seal').evaluate(node => Number(getComputedStyle(node).opacity) > .8));
    await page.screenshot({ scale: 'css', path: `${out}/${width}-selected.png` });
    await h.tap(2);
    if (width === 390) {
      await page.waitForFunction(() => document.querySelector('.pour-overlay')?.dataset.phase === 'pour');
      await page.screenshot({ scale: 'css', path: `${out}/${width}-magic-pour.png` });
    }
    await h.idle(); await h.move(1,0);
    await page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.chain === '1');
    await page.waitForFunction(() => Number(document.querySelector('.reward-overlay')?.dataset.particles) > 0);
    await page.waitForTimeout(150); await page.screenshot({ scale: 'css', path: `${out}/${width}-burst.png` });
    await h.idle(); await h.move(2,1);
    // Observe the 450ms connection on RAF before locator polling can skip the handoff.
    await page.waitForFunction(() => Number(document.querySelector('.reward-overlay')?.dataset.resonances) > 0);
    await page.waitForSelector('.clear-burst');
    assert.equal(await page.locator('.reward-overlay').getAttribute('data-chain'), '2');
    assert.equal(await page.locator('.reward-overlay').getAttribute('data-finale'), 'local-effects:1');
    await page.waitForTimeout(120); await page.screenshot({ scale: 'css', path: `${out}/${width}-clear.png` });
    await page.waitForFunction(() => document.querySelector('.stage-stat strong')?.textContent === '02');
    await assertLayout(page);
    await page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.active === 'false');
    await page.locator('.hud-home').click(); await page.locator('dialog[open]').waitFor();
    await page.screenshot({ scale: 'css', path: `${out}/${width}-dialog.png` });
    await page.getByRole('button', { name: '나가기', exact: true }).click();
    await page.locator('.start-screen').waitFor();
    await page.screenshot({ scale: 'css', path: `${out}/${width}-saved.png` });
    assert.deepEqual(h.errors, []);
    reports.push({ viewport: `${width}x${height}`, surfaces: 'title, selected seal, bottle burst, chain, clear, next board, dialog, saved run', errors: h.errors });
    await h.context.close(); console.log(`PASS ${width}x${height}`);
  }
  for (const mode of ['latency', 'conflict', 'reduced']) {
    const h = await fixture({ width: 390, height: 844 }, { reduced: mode === 'reduced', board: [[0,0,0],[0],[1,2,1,2],[2,1,2,1],[],[]] });
    await h.page.locator('.play-button').click(); await h.page.locator('.bottle-button').first().waitFor();
    if (mode !== 'reduced') h.delay(1600);
    if (mode === 'conflict') h.reject();
    await h.move(1,0);
    if (mode !== 'reduced') {
      await h.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.pourPhase === 'filled');
      assert.equal(await h.page.locator('.reward-overlay').getAttribute('data-active'), 'true', 'fill feedback cannot wait for the server');
      assert.equal(await h.page.locator('.completion-seal').count(), 0);
      assert.equal(await h.page.locator('[data-testid="score"]').textContent(), '0');
    }
    if (mode === 'latency') {
      await h.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.chain === '1');
      assert.equal(await h.page.locator('.completion-burst').count(), 0, 'late confirmation must not replay the fill burst');
    }
    if (mode === 'conflict') { await h.page.locator('.connection-error').waitFor(); assert.equal(await h.page.locator('.completion-burst').count(), 0); }
    if (mode === 'reduced') { await h.idle(); assert.equal(await h.page.locator('.reward-overlay').evaluate(node => getComputedStyle(node).display), 'none'); }
    assert.deepEqual(h.errors, []); reports.push({ mode, errors: h.errors }); await h.context.close(); console.log(`PASS ${mode}`);
  }
  const pausedChain = await fixture({ width: 390, height: 844 });
  await pausedChain.page.locator('.play-button').click(); await pausedChain.page.locator('.bottle-button').first().waitFor();
  await pausedChain.move(0,2); await pausedChain.idle(); await pausedChain.move(1,0);
  await pausedChain.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.chain === '1');
  await pausedChain.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.active === 'false');
  await pausedChain.move(2,1);
  await pausedChain.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.chain === '2' && Number(document.querySelector('.reward-overlay')?.dataset.resonances) > 0);
  assert.deepEqual(pausedChain.errors, []); reports.push({ mode: 'chain survives the idle gap between bursts', errors: pausedChain.errors });
  await pausedChain.context.close(); console.log('PASS idle chain');
  for (const cancel of ['tail', 'dialog', 'resize']) {
    const h = await fixture({ width: 390, height: 844 });
    await h.page.locator('.play-button').click(); await h.page.locator('.bottle-button').first().waitFor();
    if (cancel === 'resize') {
      // Chromium cannot resize a fullscreen native window through the automation protocol.
      await h.page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
    }
    await h.move(0,2); await h.idle(); await h.move(1,0); await h.idle(); await h.move(2,1);
    await h.page.waitForFunction(() => !!document.querySelector('.reward-overlay')?.dataset.finale);
    if (cancel === 'tail') {
      // Measure before capturing: screenshot encoding can consume the entire effect on a busy host.
      await h.page.waitForFunction(() => document.querySelector('.stage-stat strong')?.textContent === '02');
      await h.page.waitForTimeout(750);
      assert.equal(await h.page.locator('.reward-overlay').getAttribute('data-active'), 'true', 'finale continues over the next playable board');
      await h.page.screenshot({ scale: 'css', path: `${out}/390-finale-tail.png` });
    } else if (cancel === 'dialog') await h.page.locator('.hud-home').click();
    else await h.page.setViewportSize({ width: 844, height: 390 });
    await h.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.active === 'false');
    assert.equal(await h.page.locator('.score-reward').count(), 0);
    assert.deepEqual(h.errors, []); reports.push({ mode: cancel === 'tail' ? 'finale continues over next playable board' : `finale cancellation on ${cancel}`, errors: h.errors });
    await h.context.close(); console.log(`PASS finale ${cancel}`);
  }
  // A dense two-row board retains the same bottle hitboxes while effects overlap.
  for (const [width,height] of [[320,568],[390,844],[768,1024],[844,390],[1440,900]]) {
    const dense = await fixture({ width, height }, { level: 20, board: [[0,0,0,1],[1,1,1,0],[2,2,2,3],[3,3,3,2],[4,4,4,5],[5,5,5,4],[6,6,6,7],[7,7,7,6],[],[]] });
    await dense.page.locator('.play-button').click(); await dense.page.locator('.bottle-button').first().waitFor();
    await assertLayout(dense.page);
    const solution = solve(dense.state().board);
    for (const [from, to] of solution.slice(0,3)) { await dense.move(from,to); await dense.idle(); }
    await dense.page.screenshot({ scale: 'css', path: `${out}/${width}-dense.png` });
    await assertLayout(dense.page); assert.deepEqual(dense.errors, []);
    reports.push({ viewport: `${width}x${height}`, mode: 'ten-bottle board', errors: dense.errors });
    await dense.context.close(); console.log(`PASS ${width}x${height} dense`);
  }
  }
  const perf = await fixture({ width: 390, height: 844 });
  await perf.page.locator('.play-button').click(); await perf.page.locator('.bottle-button').first().waitFor();
  await perf.move(0,2); await perf.idle();
  await perf.page.evaluate(() => {
    window.__rewardGaps = []; let previous = 0;
    const frame = time => {
      if (previous && document.querySelector('.reward-overlay')?.dataset.active === 'true') window.__rewardGaps.push(time - previous);
      previous = time; window.__rewardFrame = requestAnimationFrame(frame);
    };
    window.__rewardFrame = requestAnimationFrame(frame);
  });
  await perf.move(1,0);
  await perf.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.chain === '1');
  await perf.page.waitForFunction(() => document.querySelector('.reward-overlay')?.dataset.active === 'false');
  const timing = await perf.page.evaluate(() => {
    cancelAnimationFrame(window.__rewardFrame);
    const gaps = window.__rewardGaps.sort((a,b) => a-b);
    return { frames: gaps.length, medianMs: gaps[Math.floor(gaps.length * .5)], p95Ms: gaps[Math.floor(gaps.length * .95)], maxMs: gaps.at(-1) };
  });
  assert.ok(timing.frames > 10); assert.deepEqual(perf.errors, []);
  reports.push({ mode: 'headless Chromium frame timing at DPR 2; local hardware only', ...timing });
  await perf.context.close(); console.log(`Frame timing: ${JSON.stringify(timing)}`);
  await writeFile(`${out}/report.json`, JSON.stringify(reports, null, 2));
  console.log(`PASS ${reports.length} scenarios; screenshots/report: ${out}`);
} finally { await browser.close(); }
