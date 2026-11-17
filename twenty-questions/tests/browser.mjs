import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewServer } from '../tools/preview.mjs';
import { harness } from './helpers.mjs';

const server = previewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = fileURLToPath(new URL('../../tmp/twenty-questions-qa/', import.meta.url));
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const h = harness({ secretWords: ['행복', '학교', '사과'] });
    await context.route('http://127.0.0.1:8787/twenty-questions/**', async route => {
        const original = route.request();
        const headers = {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
            'Content-Type': 'application/json',
        };
        if (original.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const response = await h.fetch(new Request(original.url(), {
            method: original.method(),
            headers: original.headers(),
            ...(['GET', 'HEAD'].includes(original.method()) ? {} : { body: original.postData() }),
        }));
        await route.fulfill({ status: response.status, headers, body: await response.text() });
    });

    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));

    // Verify portal card responsive srcset & loaded artwork on game.archerlab.dev index.html
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    const cardImg = page.locator('.game-card.twenty-questions img');
    await cardImg.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
        const img = document.querySelector('.game-card.twenty-questions img');
        return Boolean(img && img.complete && img.naturalWidth > 0);
    });
    const cardState = await cardImg.evaluate(img => ({
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        currentSrc: img.currentSrc,
    }));
    assert.ok(cardState.complete && cardState.naturalWidth > 0, JSON.stringify(cardState));
    assert.match(cardState.currentSrc, /semantle-wide-(?:480|960|1440)\.webp/);

    // Verify Semantle title screen, zero SVG usage, clean jargon-free copy, and UI skin image loading
    await page.goto(origin + '/twenty-questions/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('svg').count(), 0, 'Zero SVG elements expected');
    assert.doesNotMatch(await page.locator('body').textContent(), /FastText|Wiktionary|서버 시간 검증/);
    assert.ok(await page.locator('.example-card').isVisible());
    const skinLoaded = await page.locator('header img, .compass-showcase img').evaluateAll(
        imgs => imgs.every(img => img.complete && img.naturalWidth > 0)
    );
    assert.ok(skinLoaded, 'All UI skin images must load cleanly');
    await page.screenshot({ path: path.join(output, 'ko-title-desktop.png'), fullPage: true });

    // Start game -> stopwatch begins counting up immediately
    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    const t0 = await page.locator('#game-timer').textContent();
    await page.waitForTimeout(350);
    const t1 = await page.locator('#game-timer').textContent();
    assert.notEqual(t1, t0, `expected live count-up timer to advance (${t0} -> ${t1})`);
    assert.ok(Number(await page.locator('#top1-score').textContent()) > 30);

    // Submit starter chip + manual guess (with brief delay to verify custom 3D image loading bar)
    await page.locator('.starter-chip[data-word="사람"]').click();
    await page.waitForFunction(() => document.querySelector('#guess-count-display').textContent === '1');

    let holdNextGuess = true;
    await context.route('http://127.0.0.1:8787/twenty-questions/games/*/guesses', async route => {
        const req = route.request();
        if (holdNextGuess && req.method() === 'POST') {
            holdNextGuess = false;
            await new Promise(r => setTimeout(r, 240));
        }
        return route.fallback();
    });

    await page.locator('#guess-input').fill('물');
    await page.locator('#send').click();
    await page.locator('#guess-loading').waitFor({ state: 'visible' });
    const loadingBarOk = await page.locator('#guess-loading img').evaluateAll(
        imgs => imgs.length === 3 && imgs.every(img => img.complete && img.naturalWidth > 0)
    );
    assert.ok(loadingBarOk, 'Custom 3D loading bar frame, fill, and compass emblem must load cleanly');
    await page.screenshot({ path: path.join(output, 'ko-guess-loading.png'), fullPage: true });
    await page.waitForFunction(() => document.querySelector('#guess-count-display').textContent === '2');

    assert.equal(await page.locator('#guesses-body tr.latest-guess .word-text').textContent(), '물');
    assert.ok(await page.locator('#guesses-body tr.latest-guess .latest-pill').isVisible());
    assert.equal(await page.locator('#guesses-body tr.delimiter').count(), 1);
    assert.equal(await page.locator('#guesses-body tr:not(.delimiter)').count(), 3);

    // Simulate background time passing & foreground return -> clock continues seamlessly!
    const activeRow = h.row("SELECT id, answer_word, created_at FROM sm_games WHERE status = 'active'");
    h.db.sqlite.prepare('UPDATE sm_games SET created_at = ? WHERE id = ?').run(activeRow.created_at - 15200, activeRow.id);
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    await page.locator('#resume').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    const resumedTime = await page.locator('#game-timer').textContent();
    assert.match(resumedTime, /^00:1[5-9]\.\d$/, `resumed timer expected >=15s, got ${resumedTime}`);

    // Sort toggle
    await page.locator('button[data-sort="guessNo"]').click();
    assert.equal(await page.locator('button[data-sort="guessNo"]').getAttribute('data-dir'), 'asc');

    // Unknown and duplicate word feedback
    await page.locator('#guess-input').fill('뷁뷁뷁');
    await page.locator('#send').click();
    await page.locator('#turn-feedback[data-kind="error"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#guess-count-display').textContent(), '2');

    await page.locator('#guess-input').fill('사람');
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#guesses-body tr.latest-guess .word-text')?.textContent === '사람');
    assert.equal(await page.locator('#guess-count-display').textContent(), '2');

    // Language switch preserves active game & draft
    await page.locator('#guess-input').fill('기쁨');
    await page.locator('.languages a[lang="en"]').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#guess-count-display').textContent(), '2');
    assert.equal(await page.locator('#guess-input').inputValue(), '기쁨');
    await page.screenshot({ path: path.join(output, 'en-game-desktop.png'), fullPage: true });

    // Solve after >=2 guesses & >=15s elapsed -> verify fastest-time registration, Top-1,000, post-win explore
    await page.locator('#guess-input').fill(activeRow.answer_word);
    await page.locator('#send').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-answer').textContent(), activeRow.answer_word);
    assert.match(await page.locator('#result-best-time').textContent(), /^00:1\d\.\d{2}$/);
    await page.screenshot({ path: path.join(output, 'en-won-desktop.png'), fullPage: true });

    await page.locator('#open-nearest').click();
    await page.locator('#nearest-dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#nearest-body tr').length === 1000);
    await page.locator('#nearest-filter').fill('사람');
    assert.equal(await page.locator('#nearest-body tr').count(), 1);
    await page.locator('#nearest-dialog [data-close]').click();

    await page.locator('#guess-input').fill('나무');
    await page.locator('#send').click();
    await page.locator('#turn-feedback').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-guesses').textContent(), '3');

    // Open Hall of Fame from result banner -> verify fastest time row + display name update
    await page.locator('#open-ranking-result').click();
    await page.locator('.leaderboard tbody tr').waitFor();
    await page.locator('#name-input').fill('StarGazer');
    await page.locator('#name-save').click();
    await page.waitForFunction(() => document.querySelector('#leaderboard tbody tr')?.textContent.includes('StarGazer'));
    assert.match(await page.locator('#leaderboard tbody tr').first().textContent(), /00:1\d\.\d{2}/);
    await page.locator('#ranking-dialog [data-close]').click();

    await page.locator('#guide-open').click();
    await page.locator('#guide-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stat-wins').textContent(), '1');
    await page.locator('#guide-dialog [data-close]').click();

    await page.locator('#settings-open').click();
    await page.locator('#dark-mode').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.locator('#dark-mode').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('#settings-dialog [data-close]').click();

    // Next unlimited word -> Give up
    await page.locator('#next-game').click();
    await page.waitForFunction(() => document.querySelector('#result-banner').hidden === true);
    await page.locator('#give-up').click();
    await page.locator('#confirm-give-up').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-streak').textContent(), '0');

    // Responsive check across all mobile & tablet viewports
    await page.locator('.languages a[lang="ko"]').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });
    await page.locator('#next-game').click();
    await page.waitForFunction(() => document.querySelector('#result-banner').hidden === true);

    for (const [width, height] of [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [844, 390]]) {
        await page.setViewportSize({ width, height });
        await page.locator('#home').click();
        await page.locator('#title-screen').waitFor({ state: 'visible' });
        if (width === 390 && height === 844) {
            await page.screenshot({ path: path.join(output, 'ko-title-mobile-390.png'), fullPage: true });
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}x${height}: title overflow`);
        await page.locator('#resume').click();
        await page.locator('#game-screen').waitFor({ state: 'visible' });
        if (width === 390 && height === 844) {
            await page.locator('.starter-chip[data-word="사람"]').click();
            await page.waitForFunction(() => Number(document.querySelector('#guess-count-display').textContent) >= 1);
            await page.screenshot({ path: path.join(output, 'ko-game-mobile-390.png'), fullPage: true });
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}x${height}: game overflow`);
        const controls = await page.locator('#home,#give-up,#send,#ranking-open,#guide-open,#settings-open,.languages a,button[data-sort]').evaluateAll(
            nodes => nodes.map(n => ({ id: n.id || n.dataset.sort || n.textContent.trim(), rect: n.getBoundingClientRect().toJSON() }))
        );
        for (const { id, rect } of controls) {
            if (rect.width === 0 && rect.height === 0) continue;
            assert.ok(rect.width >= 44 && rect.height >= 44, `${width}x${height}: ${id} touch target ${rect.width}x${rect.height}`);
        }
    }

    // Check portal game card image loads cleanly alongside sibling games
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(origin + '/', { waitUntil: 'networkidle' });
    const portalCard = page.locator('.game-card.twenty-questions');
    await portalCard.scrollIntoViewIfNeeded();
    const portalImgOk = await page.evaluate(async () => {
        const img = document.querySelector('.game-card.twenty-questions img');
        if (!img || !img.complete || img.naturalWidth <= 0) return false;
        if (typeof img.decode === 'function') await img.decode().catch(() => {});
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return img.naturalWidth > 0;
    });
    assert.ok(portalImgOk, 'Portal game card image must load and decode with naturalWidth > 0');
    await page.screenshot({ path: path.join(output, 'portal-card-desktop.png') });

    assert.equal((await fetch(origin + '/server/twenty-questions/service.mjs')).status, 404);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ok: true, viewports: 7, errors }, null, 2));
    console.log(`Browser checks passed. Screenshots: ${output}`);
    h.db.sqlite.close();
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
