import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { previewServer } from '../tools/preview.mjs';
import { harness } from './helpers.mjs';

const server = previewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = new URL('../../tmp/twenty-keyboard-qa/', import.meta.url);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
async function visibleComposer(page, label) {
    await page.waitForTimeout(450);
    const layout = await page.evaluate(() => {
        const vv = window.visualViewport;
        const top = vv?.offsetTop || 0, bottom = top + (vv?.height || innerHeight);
        return { top, bottom, scroll: scrollY, controls: ['question-input', 'send'].map(id => ({ id, rect: document.getElementById(id).getBoundingClientRect().toJSON() })) };
    });
    for (const control of layout.controls) {
        assert.ok(control.rect.top >= layout.top - 1, `${label}: ${control.id} above visible viewport ${JSON.stringify(layout)}`);
        assert.ok(control.rect.bottom <= layout.bottom - 8, `${label}: ${control.id} behind keyboard ${JSON.stringify(layout)}`);
    }
    results.push({ label, ...layout });
}
try {
 for (const [width, height] of [[320,568],[390,844],[430,932],[768,1024],[844,390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const h = harness(); const errors = [];
    await context.route('http://127.0.0.1:8787/twenty-questions/**', async route => {
        const req = route.request();
        const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const response = await h.fetch(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'GET' ? {} : { body: req.postData() }) }));
        await route.fulfill({ status: response.status, headers, body: await response.text() });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/twenty-questions/');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#start').click(); await page.locator('#game-screen').waitFor({ state: 'visible' });
    const initial = await page.locator('.case-file').evaluate(n => n.getBoundingClientRect().height);
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let i = 0; i < 8; i++) {
        await page.locator('#question-input').fill(`Question ${i}: ${'a detailed clue '.repeat(10)}`);
        // Keep the question inside the server's 200-character limit.
        await page.locator('#send').click();
        await page.waitForFunction(n => document.querySelectorAll('#history .history-row').length === n, i + 1);
        const pane = await page.locator('.case-file').evaluate(n => n.getBoundingClientRect().height);
        assert.ok(Math.abs(pane - initial) < 1, `${width}: question history grows the page (${initial} -> ${pane})`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), pageHeight, `${width}: document height stays fixed as history accumulates`);
        assert.ok(await page.locator('#history').evaluate(n => n.scrollHeight - n.clientHeight - n.scrollTop < 2), 'latest answer is visible');
        assert.ok(await page.locator('#history').evaluate(n => {
            const stamp = n.lastElementChild.querySelector('.stamp').getBoundingClientRect(), pane = n.getBoundingClientRect();
            return stamp.top >= pane.top - 4 && stamp.bottom <= pane.bottom + 4;
        }), `${width}: latest verdict stays visible beside a long question`);
        if (i === 6) await page.locator('#history').evaluate(n => { n.scrollTop = 0; });
    }
    await page.locator('#question-input').blur();
    await page.screenshot({ path: new URL(`history-${width}.png`, output).pathname.replace(/^\/([A-Za-z]:)/,'$1'), fullPage: true });
    await page.locator('#question-input').focus();
    const reduced = Math.max(220, height - 330);
    await page.setViewportSize({ width, height: reduced });
    await visibleComposer(page, `${width}: layout and visual viewport resize together`);
    await page.locator('#question-input').blur(); await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    await page.evaluate(reduced => {
        Object.defineProperty(visualViewport, 'height', { configurable:true, value:reduced });
        visualViewport.dispatchEvent(new Event('resize'));
        scrollTo(0,0);
    }, reduced);
    await page.locator('#question-input').focus();
    await visibleComposer(page, `${width}: focus while keyboard already open`);
    await page.screenshot({ path: new URL(`keyboard-${width}.png`, output).pathname.replace(/^\/([A-Za-z]:)/,'$1') });
    await page.evaluate(() => {
        Object.defineProperty(visualViewport, 'offsetTop', { configurable:true, value:55 });
        visualViewport.dispatchEvent(new Event('scroll'));
    });
    await visibleComposer(page, `${width}: visual viewport pans`);
    await page.locator('#question-input').fill('another question after keyboard resize'); await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelectorAll('#history .history-row').length === 9);
    await visibleComposer(page, `${width}: answer arrives with keyboard open`);
    assert.ok(await page.locator('#history').evaluate(n => n.scrollHeight - n.clientHeight - n.scrollTop < 2));
    await page.locator('#question-input').blur();
    await page.evaluate(() => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('body').evaluate(n => n.classList.contains('keyboard-open')), false);
    assert.deepEqual(errors, []);
    await context.close(); h.db.sqlite.close();
 }
 fs.writeFileSync(new URL('result.json', output), JSON.stringify(results,null,2));
 console.log(`Keyboard and bounded history: ${results.length} viewport scenarios passed`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
