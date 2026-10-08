const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');

// Minimal documents keep this check focused on the real browser's worker lifecycle.
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://test');
  if (/\/(?:sw|service-worker|service-worker-runtime|service-worker-error-reporter)\.js$/.test(url.pathname)) {
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, body) => {
      res.writeHead(error ? 404 : 200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      res.end(error ? '' : body);
    });
    return;
  }
  const language = /index-en/.test(url.pathname) ? 'en' : /index-ja/.test(url.pathname) ? 'ja' : 'ko';
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  res.end(`<html lang="${language}"><body>${language}</body></html>`);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    try { browser = await chromium.launch(); }
    catch { browser = await chromium.launch({ channel: 'chrome' }); }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base + '/cat-tower/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    for (const target of ['index-en', 'index-ja.html']) await page.goto(base + '/cat-tower/' + target);
    await page.waitForFunction(async () => {
      const name = (await caches.keys()).find(name => name.startsWith('archer-game-cat-tower-'));
      return !!(await caches.match('/cat-tower/index-ja.html', { cacheName:name }));
    });
    await context.setOffline(true);
    for (const [target, language] of [['index.html','ko'],['index-en.html?from=menu','en'],['index-ja','ja']]) {
      await page.goto(base + '/cat-tower/' + target);
      assert.equal(await page.locator('html').getAttribute('lang'), language);
    }
    await context.setOffline(false);
    await page.goto(base + '/jewelria/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('./service-worker.js');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    assert.ok((await page.evaluate(() => caches.keys())).some(name => name.startsWith('archer-game-cat-tower-')));
    await page.goto(base + '/jewelria/index-en');
    await page.waitForFunction(async () => {
      const name = (await caches.keys()).find(name => name.startsWith('jewelria-'));
      return !!(await caches.match('/jewelria/index-en.html', { cacheName:name }));
    });
    await context.setOffline(true);
    await page.goto(base + '/jewelria/index-en.html');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.goto(base + '/cat-tower/index-en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    console.log('Real Chromium: offline KO/EN/JA aliases and cross-game cache preservation passed');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
