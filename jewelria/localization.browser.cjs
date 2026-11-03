'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://test').pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch {}
  fs.readFile(file, (error, body) => {
    res.writeHead(error ? 404 : 200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(error ? '' : body);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try { browser = await chromium.launch(); }
  catch { browser = await chromium.launch({ channel: 'chrome' }); }
  try {
    for (const [lang, entry] of [['ko', 'index.html'], ['en', 'index-en.html'], ['ja', 'index-ja.html']]) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue()
        : route.request().url().includes('game-api.') ? route.fulfill({ json: { ok: true, rankings: [], session_id: 'locale-test' }, headers: { 'access-control-allow-origin': '*' } })
          : route.fulfill({ status: 204 }));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/jewelria/${entry}`);
      await page.waitForFunction(lang => document.documentElement.lang === lang && document.querySelector('#board canvas'), lang);
      const check = async selector => {
        const text = await page.locator(selector).innerText();
        if (lang !== 'ko') assert.doesNotMatch(text, /[가-힣]/, `${lang}: ${selector}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      };
      await check('#title-screen');
      await page.locator('#rank-open-title').click();
      await page.locator('.rank-empty').waitFor();
      await check('#rank-modal');
      await page.locator('#rank-close').click();
      await page.locator('#play-btn').click();
      await page.locator('#game-screen.is-active').waitFor();
      await check('#game-screen');
      await page.locator('#pause-btn').click();
      await check('#pause-modal');
      await page.evaluate(async lang => {
        const main = document.querySelector('script[type="module"]').src;
        const { UI } = await import(new URL('./ui.js', main));
        window.localeUi = new UI(lang);
        localeUi.hidePause();
        localeUi.showResult({ score: 100, bestScore: 200, nickname: 'Player' });
      }, lang);
      await check('#result-modal');
      const cdp = await context.newCDPSession(page);
      for (const [width, height] of [[375,812],[430,932],[768,1024],[667,375],[1440,900]]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await page.evaluate(() => {
          localeUi.hideResult();
          localeUi.showRankLoading();
          localeUi.renderRanks([{ rank: 1, player_name: 'Player', score: 1234 }]);
        });
        await check('#rank-modal');
        const points = await page.locator('.rank-points').textContent();
        assert.ok(points.endsWith(lang === 'ko' ? '점' : lang === 'ja' ? '点' : ' pts'));
        await page.evaluate(() => localeUi.showRankError());
        await check('#rank-modal');
        const missing = await page.locator('[aria-label], [placeholder], [title]').evaluateAll(nodes => nodes.map(node => [node.getAttribute('aria-label'), node.getAttribute('placeholder'), node.getAttribute('title')].filter(Boolean).join(' ')).filter(text => /[가-힣]/.test(text)));
        if (lang !== 'ko') assert.deepEqual(missing, [], `${lang}: inaccessible untranslated labels`);
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${lang}: title, play, pause, result, empty/populated/error rankings and accessible labels at five viewports`);
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
