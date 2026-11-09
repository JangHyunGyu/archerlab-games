// Runs the real START -> play path of lumen-shift in headless Chromium (software GL).
// Regression: Pixi auto-rendered the filtered stage every tick behind the opaque title,
// starving the main thread so START clicks stalled and play never began.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath });
  const runs = Number(process.env.RUNS || 3);
  try {
    for (let i = 0; i < runs; i += 1) {
      const page = await browser.newPage({ viewport: { width: 1024, height: 572 } });
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
      await page.goto(`${base}/lumen-shift/`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__lumenApp?.view?.app, null, { timeout: 15000 });
      await page.waitForTimeout(800);
      const titleFrameMs = await page.evaluate(() => new Promise((res) => {
        const ts = [];
        const f = (t) => { ts.push(t); if (ts.length < 12) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, k) => x - ts[k]).sort((a, b) => a - b); res(d[Math.floor(d.length / 2)]); } };
        requestAnimationFrame(f);
      }));
      const t0 = Date.now();
      await page.click('#play-button', { timeout: 10000 });
      await page.waitForFunction(() => window.__lumenApp.core.status === 'playing'
        && !document.querySelector('.is-menu-mode'), null, { timeout: 10000 });
      const startMs = Date.now() - t0;
      const score = await page.evaluate(() => {
        const el = [...document.querySelectorAll('.hud *')].find((n) => /score/i.test(n.textContent || ''));
        return el ? getComputedStyle(el).visibility !== 'hidden' : false;
      });
      assert.ok(score, 'score HUD visible after START');
      assert.deepEqual(pageErrors, [], 'no page errors');
      console.log(`run ${i}: title median frame ${titleFrameMs.toFixed(0)}ms, START->playing ${startMs}ms`);
      assert.ok(titleFrameMs < 100, `title screen should not render the Pixi scene every frame (median ${titleFrameMs}ms)`);
      await page.close();
    }
    console.log('lumen-shift START->play: ok');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
