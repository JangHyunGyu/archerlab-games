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

const parseHmsSeconds = text => {
    const [h, m, s] = String(text).trim().split(':').map(Number);
    return h * 3600 + m * 60 + s;
};

try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const h = harness({
        secretWords: ['행복', '학교', '사과', '도서관'],
        enSecretWords: ['happy', 'school', 'apple', 'library'],
    });
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
    await context.route(/^https:\/\/(?:www\.googletagmanager\.com|analytics\.google\.com|www\.google\.com\/g\/collect)\b/, route => route.abort());

    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));

    // Verify portal card responsive srcset, unified 1:1 card sizing matching water-sort, and loaded artwork
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'portal-grid-desktop.png') });
    const thumbRects = await page.locator('.game-card .game-thumb').evaluateAll(
        nodes => nodes.map(n => {
            const r = n.getBoundingClientRect();
            return { width: r.width, height: r.height };
        })
    );
    assert.equal(thumbRects.length, 11);
    const baseHeight = thumbRects[0].height;
    for (const rect of thumbRects) {
        assert.ok(Math.abs(rect.width - rect.height) <= 2, `Expected 1:1 card thumbnail, got ${rect.width}x${rect.height}`);
        assert.ok(Math.abs(rect.height - baseHeight) <= 2, `Expected uniform thumbnail height ~${baseHeight}, got ${rect.height}`);
    }
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
    assert.match(cardState.currentSrc, /semantle-card-(?:400|800|1200)\.webp/);

    // Verify Semantle title screen, zero SVG usage, no give-up/ranking-tabs/name-form, countdown & previous answer display
    await page.goto(origin + '/twenty-questions/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('svg').count(), 0, 'Zero SVG elements expected');
    assert.equal(await page.locator('#give-up, #give-up-dialog, #next-game, #resume, #name-form, .ranking-tab').count(), 0);
    await page.locator('#ranking-open').click();
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#name-form').count(), 0);
    await page.locator('#ranking-dialog [data-close]').click();
    assert.doesNotMatch(await page.locator('body').textContent(), /FastText|Wiktionary|서버 시간 검증/);
    assert.ok(await page.locator('.example-card').isVisible());
    assert.ok(await page.locator('#hero-prev-round').isVisible());
    assert.match(await page.locator('#hero-countdown').textContent(), /^05:59:\d{2}$/);
    const skinLoaded = await page.locator('header img, .compass-showcase img').evaluateAll(
        imgs => imgs.every(img => img.complete && img.naturalWidth > 0)
    );
    assert.ok(skinLoaded, 'All UI skin images must load cleanly');
    await page.screenshot({ path: path.join(output, 'ko-title-desktop.png'), fullPage: true });

    // Stale persistent view/game keys from earlier visits must not bypass the title screen
    await page.evaluate(() => {
        localStorage.setItem('archerlab_semantle_view', 'game');
        localStorage.setItem('archerlab_semantle_game', 'stale-round-id-1234567890');
    });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#title-screen').isVisible(), true);
    assert.equal(await page.locator('#game-screen').isHidden(), true);

    // Start game with 0 guesses -> returning to lobby still shows '도전 시작', then re-entering works cleanly
    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start span:first-child').textContent(), '도전 시작');
    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    const t0 = await page.locator('#game-timer').textContent();
    await page.waitForFunction(prev => document.querySelector('#game-timer')?.textContent !== prev, t0, { timeout: 3000 });
    const t1 = await page.locator('#game-timer').textContent();
    assert.ok(parseHmsSeconds(t1) < parseHmsSeconds(t0), `expected countdown to tick down (${t0} -> ${t1})`);
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

    // Second player solves without a custom nickname -> HUD shows 익명, then updates to AlphaSolver after rename
    const tokenB = 'b'.repeat(64);
    const p2Start = await h.start(tokenB);
    const roundAnswer = h.answer(p2Start.game.id);
    const p2G1 = (await h.guess(p2Start.game, '사람', crypto.randomUUID(), tokenB)).data;
    h.advanceMs(5000);
    await h.guess(p2G1.game, roundAnswer, crypto.randomUUID(), tokenB);

    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start span:first-child').textContent(), '이어서 풀기');
    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#current-solver-display').textContent(), '익명');

    await h.call('profile', { name: 'AlphaSolver' }, 'PATCH', tokenB);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.querySelector('#current-solver-display')?.textContent === 'AlphaSolver');

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

    // Switch to English -> independent English wordpack & isolated 6h session on index-en
    await page.locator('#guess-input').fill('기쁨');
    await Promise.all([
        page.waitForURL(/index-en/),
        page.locator('.languages a[lang="en"]').click(),
    ]);
    await page.waitForLoadState('networkidle');
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /^05:/.test(document.querySelector('#hero-countdown')?.textContent || ''));
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#game-title').textContent(), 'Semantle');
    assert.doesNotMatch(await page.locator('body').textContent(), /Korean Semantle/);
    assert.equal(await page.locator('.example-target').textContent(), 'If the secret is "coffee"');
    assert.equal(await page.locator('#hero-solver').textContent(), 'None yet');
    assert.equal(await page.locator('#start span:first-child').textContent(), 'Play Now');
    await page.screenshot({ path: path.join(output, 'en-title-desktop.png'), fullPage: true });

    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#guess-count-display').textContent(), '0');
    assert.ok(await page.locator('.starter-chip[data-word="person"]').isVisible());

    // Hangul word is rejected in English session without charging guessCount
    await page.locator('#guess-input').fill('사람');
    await page.locator('#send').click();
    await page.locator('#turn-feedback[data-kind="error"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#guess-count-display').textContent(), '0');

    // English starter chip & mixed-case guess normalization
    await page.locator('.starter-chip[data-word="person"]').click();
    await page.waitForFunction(() => document.querySelector('#guess-count-display')?.textContent === '1');
    await page.locator('#guess-input').fill('Water');
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#guess-count-display')?.textContent === '2');
    assert.equal(await page.locator('#guesses-body tr.latest-guess .word-text').textContent(), 'water');
    await page.screenshot({ path: path.join(output, 'en-game-desktop.png'), fullPage: true });

    // English lobby resume button transitions to 'Resume Round'
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start span:first-child').textContent(), 'Resume Round');
    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });

    // Solve English round independently -> Top-1,000 filter, explore, post-win name & isolated English Hall of Fame
    h.advanceMs(3000);
    const enAnswer = h.row("SELECT answer_word FROM sm_games WHERE lang = 'en' ORDER BY created_at DESC LIMIT 1").answer_word;
    await page.locator('#guess-input').fill(enAnswer);
    await page.locator('#send').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-answer').textContent(), enAnswer);
    assert.equal(await page.locator('#current-solver-display').textContent(), 'Anonymous');
    await page.screenshot({ path: path.join(output, 'en-won-desktop.png'), fullPage: true });

    await page.locator('#open-nearest').click();
    await page.locator('#nearest-dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#nearest-body tr').length === 1000);
    await page.locator('#nearest-filter').fill('Person');
    assert.equal(await page.locator('#nearest-body tr').count(), 1);
    await page.locator('#nearest-dialog [data-close]').click();

    await page.locator('#guess-input').fill('tree');
    await page.locator('#send').click();
    await page.locator('#turn-feedback').waitFor({ state: 'visible' });

    await page.locator('#result-name-form').waitFor({ state: 'visible' });
    await page.locator('#result-name-input').fill('EnChamp');
    await page.locator('#result-name-save').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#result-name-status')?.textContent.trim()));
    await page.locator('#open-ranking-result').click();
    await page.locator('.leaderboard tbody tr').first().waitFor();
    assert.equal((await page.locator('#leaderboard tbody tr').count()), 1);
    assert.ok((await page.locator('#leaderboard tbody tr:first-child').textContent()).includes('EnChamp'));
    await page.locator('#ranking-dialog [data-close]').click();

    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start span:first-child').textContent(), 'View Result');

    // Switch back to Korean -> restores same-tab Korean #game-screen with solver, guesses, and draft intact; lobby also reflects '이어서 풀기'
    await Promise.all([
        page.waitForURL(url => url.pathname.endsWith('/twenty-questions/') || url.pathname.endsWith('/twenty-questions')),
        page.locator('.languages a[lang="ko"]').click(),
    ]);
    await page.waitForLoadState('networkidle');
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#current-solver-display')?.textContent === 'AlphaSolver');
    assert.equal(await page.locator('html').getAttribute('lang'), 'ko');
    assert.equal(await page.locator('#guess-count-display').textContent(), '2');
    assert.equal(await page.locator('#guess-input').inputValue(), '기쁨');
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#hero-solver').textContent(), 'AlphaSolver');
    assert.equal(await page.locator('#start span:first-child').textContent(), '이어서 풀기');
    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#guess-count-display').textContent(), '2');
    assert.equal(await page.locator('#guess-input').inputValue(), '기쁨');

    // Solve Korean round -> verify Option A clear time, multi-solver count, Top-1,000, post-win explore, All-Time Hall of Fame
    h.advanceMs(4000);
    await page.locator('#guess-input').fill(roundAnswer);
    await page.locator('#send').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-answer').textContent(), roundAnswer);
    assert.match(await page.locator('#result-time').textContent(), /^00:\d{2}\.\d{2}$/);
    assert.match(await page.locator('#result-next-timer').textContent(), /^05:\d{2}:\d{2}$/);
    assert.equal(await page.locator('#current-solver-display').textContent(), 'AlphaSolver 외 1명');

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

    // Post-win inline name registration & editing inside result banner -> persists directly to Korean Hall of Fame
    await page.locator('#result-name-form').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-name-input').inputValue(), '');
    await page.locator('#result-name-input').fill('StarGazer');
    await page.locator('#result-name-save').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#result-name-status')?.textContent.trim()));
    await page.locator('#result-name-input').fill('StarGazerPro');
    await Promise.all([
        page.waitForResponse(res => res.url().includes('/twenty-questions/profile') && res.request().method() === 'PATCH' && res.status() === 200),
        page.locator('#result-name-save').click(),
    ]);
    await page.waitForFunction(() => Boolean(document.querySelector('#result-name-status')?.textContent.trim()));

    // Open Hall of Fame (All-Time only, read-only without #name-form) -> verify StarGazerPro appears
    await page.locator('#open-ranking-result').click();
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#name-form').count(), 0);
    await page.locator('.leaderboard tbody tr').first().waitFor();
    await page.waitForFunction(() => document.querySelector('#leaderboard tbody tr:nth-child(2)')?.textContent.includes('StarGazerPro'));
    await page.screenshot({ path: path.join(output, 'ko-ranking-desktop.png') });
    await page.locator('#ranking-dialog [data-close]').click();
    assert.equal(await page.locator('#result-name-input').inputValue(), 'StarGazerPro');

    await page.locator('#guide-open').click();
    await page.locator('#guide-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stat-wins').textContent(), '1');
    assert.equal(await page.locator('#stat-best-streak').textContent(), '1');
    await page.locator('#guide-dialog [data-close]').click();

    await page.locator('#settings-open').click();
    await page.locator('#dark-mode').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.locator('#dark-mode').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('#settings-dialog [data-close]').click();

    // Verify lobby button says '결과 보기' when Korean round is already won, then test live mid-game forced rollover at the 6-hour boundary
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start span:first-child').textContent(), '결과 보기');
    await page.locator('#start').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });

    const currentRoundRow = h.row('SELECT ends_at FROM sm_rounds ORDER BY round_no DESC LIMIT 1');
    h.setNow(currentRoundRow.ends_at - 1600);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => /^00:00:0[12]$/.test(document.querySelector('#game-timer')?.textContent || ''));
    // Wait without any click: countdown hits 00:00:00 and forces automatic rollover + history clear
    h.setNow(currentRoundRow.ends_at + 200);
    await page.waitForFunction(() => document.querySelector('#case-label')?.textContent === '라운드 #4', null, { timeout: 5000 });
    assert.equal(await page.locator('#result-banner').isHidden(), true);
    assert.equal(await page.locator('#empty-history').isVisible(), true);
    assert.equal(await page.locator('#guesses-table').isHidden(), true);
    assert.match(await page.locator('#game-timer').textContent(), /^(?:06:00:00|05:59:5\d)$/);
    assert.ok((await page.locator('#prev-answer-btn').textContent()).includes(roundAnswer));

    // Clicking previous answer button opens Round #3's Top-1,000 list
    await page.locator('#prev-answer-btn').click();
    await page.locator('#nearest-dialog').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#nearest-title').textContent()).includes(roundAnswer));
    await page.waitForFunction(() => document.querySelectorAll('#nearest-body tr').length === 1000);
    await page.locator('#nearest-dialog [data-close]').click();

    // Responsive check across all mobile & tablet viewports
    for (const [width, height] of [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [844, 390]]) {
        await page.setViewportSize({ width, height });
        await page.locator('#home').click();
        await page.locator('#title-screen').waitFor({ state: 'visible' });
        if (width === 390 && height === 844) {
            await page.screenshot({ path: path.join(output, 'ko-title-mobile-390.png'), fullPage: true });
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}x${height}: title overflow`);
        await page.locator('#start').click();
        await page.locator('#game-screen').waitFor({ state: 'visible' });
        if (width === 390 && height === 844) {
            await page.locator('.starter-chip[data-word="사람"]').click();
            await page.waitForFunction(() => Number(document.querySelector('#guess-count-display').textContent) >= 1);
            await page.screenshot({ path: path.join(output, 'ko-game-mobile-390.png'), fullPage: true });
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}x${height}: game overflow`);
        const controls = await page.locator('#home,#prev-answer-btn,#current-solver-btn,#send,#ranking-open,#guide-open,#settings-open,.languages a,button[data-sort]').evaluateAll(
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
