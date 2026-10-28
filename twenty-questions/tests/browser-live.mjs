import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { previewServer } from '../tools/preview.mjs';
import { harness } from './helpers.mjs';
import { initialize } from '../../server/twenty-questions/database.mjs';

const h = harness();
const timings = [];
h.env.TQ_AI = { async decide(input) {
    const start = Date.now();
    const response = await fetch('http://127.0.0.1:8799/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error('Live model unavailable');
    const result = await response.json(); timings.push({ model: result.model, ms: Date.now() - start }); return result;
} };
await initialize(h.db);
h.db.sqlite.exec("UPDATE tq_catalog SET active = CASE WHEN en_key = 'penguin' THEN 1 ELSE 0 END");
const server = previewServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('http://127.0.0.1:8787/twenty-questions/**', async route => {
        const request = route.request();
        const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Content-Type': 'application/json' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const result = await h.fetch(new Request(request.url(), { method: request.method(), headers: request.headers(), ...(request.method() === 'GET' ? {} : { body: request.postData() }) }));
        return route.fulfill({ status: result.status, headers, body: await result.text() });
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/twenty-questions/', { waitUntil: 'networkidle' });
    await page.locator('#start').click(); await page.locator('#game-screen').waitFor({ state: 'visible' });
    await page.locator('#question-input').fill('새인가요?'); await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#remaining').textContent === '19');
    assert.equal(await page.locator('.stamp').last().textContent(), '예');
    await page.locator('.languages a[lang=en]').click(); await page.locator('#game-screen').waitFor({ state: 'visible' });
    await page.locator('#question-input').fill('Can it fly?'); await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#remaining').textContent === '18');
    assert.equal(await page.locator('.stamp').last().textContent(), 'No');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tmp/twenty-questions-qa/live-en-mobile.png', fullPage: true });
    await page.locator('#guess-mode').click(); await page.locator('#question-input').fill('penguin'); await page.locator('#send').click();
    await page.locator('#result-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-streak').textContent(), '1');
    assert.equal(await page.locator('#result-answer').textContent(), 'penguin');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: 'tmp/twenty-questions-qa/live-success-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync('tmp/twenty-questions-qa/live-browser.json', JSON.stringify({ live: true, database: 'isolated local SQLite', provider: 'existing shared Worker key via remote preview', timings, errors, result: 'won', turns: 3, streak: 1 }, null, 2));
    console.log(JSON.stringify({ passed: true, timings }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
