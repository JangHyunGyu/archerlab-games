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
        const top = vv?.offsetTop || 0;
        const bottom = top + (vv?.height || innerHeight);
        return {
            top,
            bottom,
            scroll: scrollY,
            controls: ['guess-input', 'send'].map(id => ({ id, rect: document.getElementById(id).getBoundingClientRect().toJSON() })),
        };
    });
    for (const control of layout.controls) {
        assert.ok(control.rect.top >= layout.top - 1, `${label}: ${control.id} above visible viewport`);
        assert.ok(control.rect.bottom <= layout.bottom - 8, `${label}: ${control.id} behind keyboard`);
    }
    results.push({ label, ...layout });
}

try {
    for (const [width, height] of [[320, 568], [390, 844], [430, 932], [768, 1024], [844, 390]]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
        const h = harness({ secretWords: ['행복'] });
        const errors = [];
        await context.route('http://127.0.0.1:8787/twenty-questions/**', async route => {
            const req = route.request();
            const headers = {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
            };
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
            const response = await h.fetch(new Request(req.url(), {
                method: req.method(),
                headers: req.headers(),
                ...(req.method() === 'GET' ? {} : { body: req.postData() }),
            }));
            await route.fulfill({ status: response.status, headers, body: await response.text() });
        });

        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/twenty-questions/');
        await page.evaluate(() => document.fonts.ready);
        await page.locator('#start').click();
        await page.locator('#game-screen').waitFor({ state: 'visible' });

        const initial = await page.locator('.ledger-panel').evaluate(n => n.getBoundingClientRect().height);
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

        const words = ['사람', '사랑', '학교', '시간', '사과', '과일', '도서관', '기쁨'];
        for (let i = 0; i < words.length; i++) {
            await page.locator('#guess-input').fill(words[i]);
            await page.locator('#send').click();
            await page.waitForFunction(n => Number(document.querySelector('#guess-count-display').textContent) === n, i + 1);
            const pane = await page.locator('.ledger-panel').evaluate(n => n.getBoundingClientRect().height);
            assert.ok(Math.abs(pane - initial) < 2, `${width}: ledger panel changed height`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), pageHeight, `${width}: document height grew`);
        }

        // Verify IME composition ignores Enter during Korean composition
        await page.locator('#guess-input').fill('아');
        await page.locator('#guess-input').dispatchEvent('compositionstart');
        await page.locator('#guess-input').dispatchEvent('keydown', { key: 'Enter', isComposing: true });
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#guess-count-display').textContent(), String(words.length));
        await page.locator('#guess-input').dispatchEvent('compositionend');

        await page.locator('#guess-input').focus();
        const reduced = Math.max(220, height - 330);
        await page.setViewportSize({ width, height: reduced });
        await visibleComposer(page, `${width}: layout and visual viewport resize together`);
        await page.locator('#guess-input').blur();
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(100);

        await page.evaluate(r => {
            Object.defineProperty(visualViewport, 'height', { configurable: true, value: r });
            visualViewport.dispatchEvent(new Event('resize'));
            scrollTo(0, 0);
        }, reduced);
        await page.locator('#guess-input').focus();
        await visibleComposer(page, `${width}: focus while keyboard open`);

        await page.evaluate(() => {
            Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 55 });
            visualViewport.dispatchEvent(new Event('scroll'));
        });
        await visibleComposer(page, `${width}: visual viewport pans`);

        await page.locator('#guess-input').fill('물');
        await page.locator('#send').click();
        await page.waitForFunction(n => Number(document.querySelector('#guess-count-display').textContent) === n, words.length + 1);
        await visibleComposer(page, `${width}: guess lands while keyboard open`);

        await page.locator('#guess-input').blur();
        await page.evaluate(() => {
            delete visualViewport.height;
            delete visualViewport.offsetTop;
            visualViewport.dispatchEvent(new Event('resize'));
        });
        await page.waitForTimeout(150);
        assert.equal(await page.locator('body').evaluate(n => n.classList.contains('keyboard-open')), false);
        assert.deepEqual(errors, []);
        await context.close();
        h.db.sqlite.close();
    }
    fs.writeFileSync(new URL('result.json', output), JSON.stringify(results, null, 2));
    console.log(`Keyboard and bounded ledger: ${results.length} scenarios passed`);
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
