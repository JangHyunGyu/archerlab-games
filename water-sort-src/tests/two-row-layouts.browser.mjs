// Records the real resting bottle layout of stages 3 and 6 (two rows on phones, and stage 6 on
// tablet and desktop too) at the screens the pour geometry tests sweep, into
// tests/fixtures/two-row-layouts.json. Plays one run on the built bundle against a local Worker,
// like ghost-preview.browser.mjs (same GHOST_URL / GHOST_API / PW_CHROMIUM settings), and resizes
// the page at each stage. Rerun after layout changes: the geometry test reads the file.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { layout, playTo, stageReady } from './browser-play.mjs';

const url = process.env.GHOST_URL || 'http://127.0.0.1:8080/water-sort/';
const api = process.env.GHOST_API || 'http://127.0.0.1:8787';
const screens = ['390x844', '360x640', '820x1180', '1280x800', '844x390'];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await context.newPage();
// The page goes fullscreen on the first tap, and a fullscreen window can't be resized.
await page.addInitScript(() => { Element.prototype.requestFullscreen = undefined; Element.prototype.webkitRequestFullscreen = undefined; });
await page.route(/workers\.dev\/water-sort\/challenge/, async route => {
  const request = route.request(), target = new URL(request.url());
  const response = await fetch(new URL(target.pathname + target.search, api), { method: request.method(), headers: { 'content-type': 'application/json' }, body: request.method() === 'POST' ? request.postData() : undefined });
  await route.fulfill({ status: response.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await response.text() });
});
let latest = null;
page.on('response', async response => { if (/challenge/.test(response.url()) && response.request().method() === 'POST') try { const d = await response.json(); if (d?.run) latest = d.run; } catch { /* not JSON */ } });
const out = {};
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.play-button').click();
  await page.locator('[data-testid="bottle-0"]').waitFor();
  for (const stage of [3, 6]) {
    await playTo(page, stage, () => latest);
    for (const screen of screens) {
      const [width, height] = screen.split('x').map(Number);
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      await stageReady(page, stage);
      const { tubes, rows } = await layout(page);
      const round = v => Math.round(v * 100) / 100;
      (out[screen] ??= {})[stage] = { rows, tubes: tubes.map(t => ({ x: round(t.x), y: round(t.y), width: round(t.width), height: round(t.height) })) };
      console.log(screen, stage, 'rows', Math.max(...rows) + 1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
  }
  writeFileSync(new URL('./fixtures/two-row-layouts.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
} catch (e) { console.log('last run from the server:', JSON.stringify(latest)); throw e; } finally { await browser.close(); }
