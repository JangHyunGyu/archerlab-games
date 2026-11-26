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
    await context.addInitScript(() => {
        window.__vibrateLog = [];
        try {
            Object.defineProperty(navigator, 'vibrate', {
                configurable: true,
                value: pattern => {
                    window.__vibrateLog.push(Array.isArray(pattern) ? pattern.slice() : [Number(pattern) || 0]);
                    return true;
                },
            });
        } catch (_err) {
            navigator.vibrate = pattern => {
                window.__vibrateLog.push(Array.isArray(pattern) ? pattern.slice() : [Number(pattern) || 0]);
                return true;
            };
        }
    });
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
    const apiMjsRequests = [];
    const vfxAssetStatuses = new Map();
    page.on('request', req => {
        if (req.url().includes('/twenty-questions/js/api.mjs')) apiMjsRequests.push(req.url());
    });
    page.on('response', res => {
        const match = res.url().match(/\/twenty-questions\/assets\/ui\/(vfx-[a-z-]+\.webp)/);
        if (match) vfxAssetStatuses.set(match[1], res.status());
    });

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

    // Verify Semantle title screen, zero SVG usage, no give-up/ranking-tabs/name-form/per-round arrows, single api.mjs version, countdown & previous answer display
    await page.goto(origin + '/twenty-questions/', { waitUntil: 'networkidle' });
    assert.ok(apiMjsRequests.length === 1 && apiMjsRequests[0].endsWith('/twenty-questions/js/api.mjs?v=20261126-v18'), `Expected single versioned api.mjs request, got ${JSON.stringify(apiMjsRequests)}`);
    assert.equal(await page.locator('svg').count(), 0, 'Zero SVG elements expected');
    assert.equal(await page.locator('#vfx-stage, #vfx-edge-glow, #vfx-sprite-a, #vfx-sprite-b').count(), 4);
    assert.equal(await page.locator('#give-up, #give-up-dialog, #next-game, #resume, #name-form, .ranking-tab, #ranking-prev, #ranking-next').count(), 0);
    await page.locator('#ranking-open').click();
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#name-form').count(), 0);
    await page.waitForFunction(() => document.querySelector('#ranking-title')?.textContent === '랭킹' && Boolean(document.querySelector('.leaderboard-empty-title, .leaderboard table')));
    assert.equal(await page.locator('.leaderboard-empty-title').textContent(), '아직 등록된 랭커가 없어요.');
    await page.screenshot({ path: path.join(output, 'ko-ranking-empty.png') });
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

    // Verify all 4 native-transparent VFX WebP sprites load 200 OK & decode at 1024x1024, plus light cold haptic feedback on '물'
    await page.waitForFunction(() => [
        'vfx-pulse-cyan.webp',
        'vfx-sigil-violet.webp',
        'vfx-flare-hot.webp',
        'vfx-nova-molten.webp',
    ].every(name => performance.getEntriesByType('resource').some(r => r.name.includes(name))));
    for (const vfxName of ['vfx-pulse-cyan.webp', 'vfx-sigil-violet.webp', 'vfx-flare-hot.webp', 'vfx-nova-molten.webp']) {
        assert.equal(vfxAssetStatuses.get(vfxName), 200, `Expected 200 OK for ${vfxName}`);
    }
    const vfxDims = await page.evaluate(async () => {
        const names = ['vfx-pulse-cyan.webp', 'vfx-sigil-violet.webp', 'vfx-flare-hot.webp', 'vfx-nova-molten.webp'];
        const results = {};
        for (const n of names) {
            const img = new Image();
            img.src = `assets/ui/${n}?v=20261124-v15`;
            await img.decode();
            results[n] = { w: img.naturalWidth, h: img.naturalHeight };
        }
        return results;
    });
    for (const [name, dim] of Object.entries(vfxDims)) {
        assert.deepEqual(dim, { w: 1024, h: 1024 }, `${name} natural dimensions mismatch`);
    }
    const coldVibration = await page.evaluate(() => window.__vibrateLog[window.__vibrateLog.length - 1] || []);
    const coldDuration = coldVibration.reduce((a, b) => a + b, 0);
    assert.ok(coldVibration.length === 1 && coldDuration > 0 && coldDuration <= 25, `Unexpected cold vibration: ${JSON.stringify(coldVibration)}`);
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

    // Unknown word clears input box (both click submit & Enter submit) and duplicate word feedback
    await page.locator('#guess-input').fill('뷁뷁뷁');
    await page.locator('#send').click();
    await page.locator('#turn-feedback[data-kind="error"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#guess-input').inputValue(), '', 'Unknown word click submit must clear #guess-input');
    assert.equal(await page.locator('#guess-count-display').textContent(), '2');

    await page.locator('#guess-input').fill('없는단어테스트');
    await page.locator('#guess-input').press('Enter');
    await page.waitForFunction(() => document.querySelector('#turn-feedback[data-kind="error"]')?.textContent.includes('없는단어테스트'));
    assert.equal(await page.locator('#guess-input').inputValue(), '', 'Unknown word Enter submit must clear #guess-input');
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
    assert.deepEqual(await page.locator('#nearest-dialog thead th').allTextContents(), ['Rank', 'Word', 'Score', '']);
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
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#ranking-title')?.textContent === 'Ranking' && Boolean(document.querySelector('.leaderboard tbody tr')));
    assert.equal(await page.locator('#ranking-sort-wins').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#ranking-sort-time').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await page.locator('#leaderboard thead th').allTextContents(), ['Rank', 'Player', 'Solved', 'Best Time']);
    assert.equal((await page.locator('#leaderboard tbody tr').count()), 1);
    assert.ok((await page.locator('#leaderboard tbody tr:first-child').textContent()).includes('EnChamp'));
    assert.match(await page.locator('#own-rank').textContent(), /^Your Rank · #1 · 1 solved · \d{2}:\d{2}\.\d{2}$/);
    await page.locator('#ranking-sort-time').click();
    await page.waitForFunction(() => document.querySelector('#ranking-sort-time')?.getAttribute('aria-pressed') === 'true' && Boolean(document.querySelector('.leaderboard tbody tr')));
    assert.equal(await page.locator('#ranking-sort-wins').getAttribute('aria-pressed'), 'false');
    await page.locator('#ranking-sort-wins').click();
    await page.waitForFunction(() => document.querySelector('#ranking-sort-wins')?.getAttribute('aria-pressed') === 'true');
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

    // Trigger Top-10 Molten VFX ('기쁨' is rank 1 for '행복') -> multi-pulse vibration + vfx-nova-molten sprite
    await page.evaluate(() => { window.__vibrateLog = []; });
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#guess-count-display')?.textContent === '3');
    const moltenVfx = await page.evaluate(() => ({
        tier: document.getElementById('vfx-stage')?.dataset.tier || '',
        spriteA: getComputedStyle(document.getElementById('vfx-sprite-a')).backgroundImage,
        vibe: window.__vibrateLog[window.__vibrateLog.length - 1] || [],
    }));
    const moltenDuration = moltenVfx.vibe.reduce((a, b) => a + b, 0);
    assert.equal(moltenVfx.tier, 'molten');
    assert.match(moltenVfx.spriteA, /vfx-nova-molten\.webp/);
    assert.ok(moltenVfx.vibe.length >= 5 && moltenDuration > coldDuration, `Unexpected molten vibration: ${JSON.stringify(moltenVfx.vibe)}`);
    await page.screenshot({ path: path.join(output, 'ko-vfx-molten.png') });

    // Solve Korean round -> verify Exact victory supernova VFX, grand vibration, Option A clear time, multi-solver count
    h.advanceMs(4000);
    await page.locator('#guess-input').fill(roundAnswer);
    await page.locator('#send').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });
    const exactVfx = await page.evaluate(() => ({
        tier: document.getElementById('vfx-stage')?.dataset.tier || '',
        vibe: window.__vibrateLog[window.__vibrateLog.length - 1] || [],
    }));
    const exactDuration = exactVfx.vibe.reduce((a, b) => a + b, 0);
    assert.equal(exactVfx.tier, 'exact');
    assert.ok(exactVfx.vibe.length >= 7 && exactDuration > moltenDuration, `Unexpected exact vibration: ${JSON.stringify(exactVfx.vibe)}`);
    await page.screenshot({ path: path.join(output, 'ko-vfx-won.png') });
    assert.equal(await page.locator('#result-answer').textContent(), roundAnswer);
    assert.match(await page.locator('#result-time').textContent(), /^00:\d{2}\.\d{2}$/);
    assert.match(await page.locator('#result-next-timer').textContent(), /^05:\d{2}:\d{2}$/);
    assert.equal(await page.locator('#current-solver-display').textContent(), 'AlphaSolver 외 1명');

    const expectedJosa = ((roundAnswer.charCodeAt(roundAnswer.length - 1) - 0xac00) % 28) !== 0 ? '과' : '와';
    await page.locator('#open-nearest').click();
    await page.locator('#nearest-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#nearest-title').textContent(), `‘${roundAnswer}’${expectedJosa} 의미가 가장 가까운 단어 1,000개`);
    assert.deepEqual(await page.locator('#nearest-dialog thead th').allTextContents(), ['순위', '단어', '유사도', '']);
    await page.waitForFunction(() => document.querySelectorAll('#nearest-body tr').length === 1000);
    await page.locator('#nearest-filter').fill('사람');
    assert.equal(await page.locator('#nearest-body tr').count(), 1);
    await page.locator('#nearest-dialog [data-close]').click();

    await page.locator('#guess-input').fill('나무');
    await page.locator('#send').click();
    await page.locator('#turn-feedback').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-guesses').textContent(), '4');

    // Second slower player registers the same name ('AlphaSolver') -> only faster AlphaSolver record stays in leaderboard
    const tokenC = 'c'.repeat(64);
    h.advanceMs(10000);
    const p3Start = await h.start(tokenC);
    const p3G1 = (await h.guess(p3Start.game, '사람', crypto.randomUUID(), tokenC)).data;
    await h.guess(p3G1.game, roundAnswer, crypto.randomUUID(), tokenC);
    await h.call('profile', { name: 'AlphaSolver' }, 'PATCH', tokenC);

    // Post-win inline name registration & editing inside result banner -> persists directly to Korean single-page ranking
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

    // Open single-page ranking (4 columns with solved count, no guess count) -> AlphaSolver appears once + StarGazerPro
    await page.locator('#open-ranking-result').click();
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#name-form').count(), 0);
    await page.waitForFunction(() => document.querySelector('#ranking-title')?.textContent === '랭킹');
    await page.locator('.leaderboard tbody tr').first().waitFor();
    await page.waitForFunction(() => document.querySelector('#leaderboard tbody tr:nth-child(2)')?.textContent.includes('StarGazerPro'));
    assert.equal(await page.locator('#ranking-sort-wins').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.locator('#leaderboard thead th').allTextContents(), ['순위', '이름', '정답', '최단 시간']);
    assert.equal(await page.locator('#leaderboard tbody tr').count(), 2);
    const ownText = await page.locator('#own-rank').textContent();
    assert.match(ownText, /^내 순위 · #2 · 정답 1회 · \d{2}:\d{2}\.\d{2}$/);
    await page.screenshot({ path: path.join(output, 'ko-ranking-desktop.png') });
    await page.locator('#ranking-dialog [data-close]').click();
    assert.equal(await page.locator('#result-name-input').inputValue(), 'StarGazerPro');

    await page.locator('#guide-open').click();
    await page.locator('#guide-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stat-wins').textContent(), '1');
    assert.equal(await page.locator('#stat-best-streak').textContent(), '1');
    await page.locator('#guide-dialog [data-close]').click();

    // Test all 6 modes on won screen + dedicated Light-mode assets + reload persistence across stealth modes
    await page.locator('#settings-open').click();
    await page.locator('#theme-light').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.screenshot({ path: path.join(output, 'ko-light-settings-desktop.png') });
    await page.locator('#settings-dialog [data-close]').click();
    await page.waitForFunction(() => [
        'study-light-desktop-1440.webp',
        'crafted-panel-light-1024.webp',
        'crafted-btn-light-gold-720.webp',
        'crafted-btn-light-ivory-720.webp',
    ].some(name => performance.getEntriesByType('resource').some(r => r.name.includes(name))) || true);
    const lightSkinOk = await page.evaluate(async () => {
        const urls = [
            'assets/backgrounds/study-light-desktop-1440.webp?v=20261126-v18',
            'assets/ui/crafted-panel-light-1024.webp?v=20261126-v18',
            'assets/ui/crafted-btn-light-gold-720.webp?v=20261126-v18',
            'assets/ui/crafted-btn-light-ivory-720.webp?v=20261126-v18',
        ];
        for (const u of urls) {
            const res = await fetch(u);
            if (!res.ok) return u + ':' + res.status;
        }
        return 'ok';
    });
    assert.equal(lightSkinOk, 'ok');
    await page.screenshot({ path: path.join(output, 'ko-light-won-desktop.png'), fullPage: true });
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'ko-light-title-desktop.png'), fullPage: true });
    await page.locator('#start').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });

    await page.locator('#settings-open').click();
    await page.locator('#theme-excel').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'excel');
    assert.equal(await page.title(), '2026_Q4_어휘유사도_분석리포트.xlsx - Excel');
    await page.screenshot({ path: path.join(output, 'ko-excel-settings-desktop.png') });
    await page.locator('#settings-dialog [data-close]').click();

    // Excel mode desktop verification: authentic Office workbook UI, zero VFX/haptics, live formula/status stats, persistence on reload
    assert.equal(await page.locator('svg').count(), 0, 'Excel mode must keep zero SVG DOM nodes');
    assert.ok(await page.locator('#excel-titlebar').isVisible());
    assert.ok(await page.locator('#excel-ribbon-tabs').isVisible());
    assert.ok(await page.locator('#excel-ribbon-body').isVisible());
    assert.ok(await page.locator('#excel-formula-bar').isVisible());
    assert.ok(await page.locator('#excel-col-letters').isVisible());
    assert.ok(await page.locator('#excel-sheet-bar').isVisible());
    assert.ok(await page.locator('#excel-status-bar').isVisible());
    assert.equal(await page.locator('.observatory-bg').isVisible(), false);
    assert.equal(await page.locator('.vfx-stage').isVisible(), false);
    await page.screenshot({ path: path.join(output, 'ko-excel-won-desktop.png'), fullPage: true });

    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'excel');
    assert.equal(await page.title(), '2026_Q4_어휘유사도_분석리포트.xlsx - Excel');
    await page.locator('#result-banner').waitFor({ state: 'visible' });
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'ko-excel-title-desktop.png'), fullPage: true });
    await page.locator('#start').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });

    await page.locator('[data-excel-action="ranking"]').first().click();
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#leaderboard tbody tr').length === 2);
    await page.screenshot({ path: path.join(output, 'ko-excel-ranking-desktop.png') });
    await page.locator('#ranking-dialog [data-close]').click();

    // VS Code & Eclipse won-screen verification + reload persistence
    await page.locator('#settings-open').click();
    await page.locator('#theme-vscode').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'vscode');
    assert.match(await page.title(), /Visual Studio Code/);
    await page.locator('#settings-dialog [data-close]').click();
    assert.equal(await page.locator('svg').count(), 0);
    assert.ok(await page.locator('#vsc-titlebar').isVisible());
    assert.ok(await page.locator('#vsc-activitybar').isVisible());
    assert.ok(await page.locator('#vsc-sidebar').isVisible());
    assert.ok(await page.locator('#vsc-statusbar').isVisible());
    await page.screenshot({ path: path.join(output, 'ko-vscode-won-desktop.png'), fullPage: true });
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'ko-vscode-title-desktop.png'), fullPage: true });
    await page.locator('#start').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });

    await page.locator('#settings-open').click();
    await page.locator('#theme-eclipse').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'eclipse');
    assert.match(await page.title(), /Eclipse IDE/);
    await page.locator('#settings-dialog [data-close]').click();
    assert.equal(await page.locator('svg').count(), 0);
    assert.ok(await page.locator('#ecl-titlebar').isVisible());
    assert.ok(await page.locator('#ecl-menubar').isVisible());
    assert.ok(await page.locator('#ecl-explorer').isVisible());
    assert.ok(await page.locator('#ecl-console').isVisible());
    assert.ok(await page.locator('#ecl-statusbar').isVisible());
    await page.screenshot({ path: path.join(output, 'ko-eclipse-won-desktop.png'), fullPage: true });
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'ko-eclipse-title-desktop.png'), fullPage: true });
    await page.locator('#start').click();
    await page.locator('#result-banner').waitFor({ state: 'visible' });

    await page.locator('#settings-open').click();
    await page.locator('#theme-dark').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.match(await page.title(), /시맨틀/);
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

    // Clicking previous answer button opens Round #3's Top-1,000 list with proper Korean particle
    await page.locator('#prev-answer-btn').click();
    await page.locator('#nearest-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#nearest-title').textContent(), `‘${roundAnswer}’${expectedJosa} 의미가 가장 가까운 단어 1,000개`);
    await page.waitForFunction(() => document.querySelectorAll('#nearest-body tr').length === 1000);
    await page.locator('#nearest-dialog [data-close]').click();

    // Active gameplay verification for Light, Excel, Notepad, VS Code, Eclipse modes
    await page.locator('#settings-open').click();
    await page.locator('#theme-excel').click();
    await page.locator('#settings-dialog [data-close]').click();
    await page.evaluate(() => { window.__vibrateLog = []; });
    await page.locator('#guess-input').fill('사람');
    assert.equal(await page.locator('#excel-formula-display').textContent(), '사람');
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#guess-count-display')?.textContent === '1');
    await page.locator('#guess-input').fill('행복');
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#guess-count-display')?.textContent === '2');
    const excelState = await page.evaluate(() => ({
        vibeLen: window.__vibrateLog.length,
        vfxTier: document.getElementById('vfx-stage')?.dataset.tier || '',
        avg: document.getElementById('excel-status-avg')?.textContent || '',
        count: document.getElementById('excel-status-count')?.textContent || '',
        max: document.getElementById('excel-status-max')?.textContent || '',
    }));
    assert.equal(excelState.vibeLen, 0, 'Excel mode must suppress haptic vibration');
    assert.equal(excelState.vfxTier, '', 'Excel mode must suppress VFX stage tier');
    assert.match(excelState.avg, /평균:/);
    assert.equal(excelState.count, '개수: 2');
    assert.match(excelState.max, /최대:/);
    await page.locator('#guesses-body tr:not(.delimiter)').nth(1).click();
    assert.match(await page.locator('#excel-name-box').textContent(), /^B\d+$/);
    assert.match(await page.locator('#excel-formula-display').textContent(), /^=SIMILARITY\(/);
    await page.screenshot({ path: path.join(output, 'ko-excel-game-desktop.png'), fullPage: true });

    // Light mode active gameplay desktop & 390 mobile
    await page.locator('#settings-open').click();
    await page.locator('#theme-light').click();
    await page.locator('#settings-dialog [data-close]').click();
    await page.screenshot({ path: path.join(output, 'ko-light-game-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Light 390x844 overflow');
    await page.screenshot({ path: path.join(output, 'ko-light-game-mobile-390.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Notepad mode active gameplay + reload persistence + responsive
    await page.locator('#settings-open').click();
    await page.locator('#theme-notepad').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'notepad');
    assert.equal(await page.title(), '업무_회의록_메모.txt - 메모장');
    await page.locator('#settings-dialog [data-close]').click();
    assert.equal(await page.locator('svg').count(), 0);
    assert.ok(await page.locator('#notepad-titlebar').isVisible());
    assert.ok(await page.locator('#notepad-menubar').isVisible());
    assert.ok(await page.locator('#notepad-status-bar').isVisible());
    assert.equal(await page.locator('.observatory-bg').isVisible(), false);
    assert.equal(await page.locator('#notepad-chars').textContent(), '2개 항목');
    await page.evaluate(() => { window.__vibrateLog = []; });
    await page.locator('#guess-input').fill('기쁨');
    assert.equal(await page.locator('#notepad-dirty-dot').isVisible(), true);
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#guess-count-display')?.textContent === '3');
    assert.equal(await page.evaluate(() => window.__vibrateLog.length), 0, 'Notepad mode must suppress vibration');
    assert.equal(await page.locator('#notepad-chars').textContent(), '3개 항목');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'notepad');
    await page.screenshot({ path: path.join(output, 'ko-notepad-game-desktop.png'), fullPage: true });
    await page.locator('#home').click();
    await page.locator('#title-screen').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'ko-notepad-title-desktop.png'), fullPage: true });
    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });

    // VS Code & Eclipse active gameplay + Explorer ranking action + reload persistence
    await page.locator('#settings-open').click();
    await page.locator('#theme-vscode').click();
    await page.locator('#settings-dialog [data-close]').click();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'vscode');
    assert.equal(await page.locator('#vsc-sidebar').isVisible(), true);
    await page.screenshot({ path: path.join(output, 'ko-vscode-game-desktop.png'), fullPage: true });
    await page.locator('#vsc-sidebar [data-office-action="ranking"]').click();
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    await page.locator('#ranking-dialog [data-close]').click();

    await page.locator('#settings-open').click();
    await page.locator('#theme-eclipse').click();
    await page.locator('#settings-dialog [data-close]').click();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'eclipse');
    assert.equal(await page.locator('#ecl-explorer').isVisible(), true);
    await page.screenshot({ path: path.join(output, 'ko-eclipse-game-desktop.png'), fullPage: true });
    await page.locator('#ecl-explorer [data-office-action="ranking"]').click();
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    await page.locator('#ranking-dialog [data-close]').click();

    // Responsive check across all 4 office/IDE modes (Excel, Notepad, VS Code, Eclipse) on mobile/tablet/landscape
    for (const modeInfo of [
        { id: '#theme-excel', name: 'excel', mobileShot: 'ko-excel-game-mobile-390.png', tabletShot: 'ko-excel-game-tablet-768.png' },
        { id: '#theme-notepad', name: 'notepad', mobileShot: 'ko-notepad-game-mobile-390.png', tabletShot: null },
        { id: '#theme-vscode', name: 'vscode', mobileShot: 'ko-vscode-game-mobile-390.png', tabletShot: null },
        { id: '#theme-eclipse', name: 'eclipse', mobileShot: 'ko-eclipse-game-mobile-390.png', tabletShot: null },
    ]) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('#settings-open').click();
        await page.locator(modeInfo.id).click();
        await page.locator('#settings-dialog [data-close]').click();
        for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390]]) {
            await page.setViewportSize({ width, height });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${modeInfo.name} ${width}x${height}: horizontal overflow`);
            const controls = await page.locator('#home,#prev-answer-btn,#current-solver-btn,#send,#ranking-open,#guide-open,#settings-open,.languages a,button[data-sort]').evaluateAll(
                nodes => nodes.map(n => ({ id: n.id || n.dataset.sort || n.textContent.trim(), rect: n.getBoundingClientRect().toJSON() }))
            );
            for (const { id, rect } of controls) {
                if (rect.width === 0 && rect.height === 0) continue;
                assert.ok(rect.width >= 44 && rect.height >= 44, `${modeInfo.name} ${width}x${height}: ${id} touch target ${rect.width}x${rect.height}`);
            }
            if (width === 390 && modeInfo.mobileShot) await page.screenshot({ path: path.join(output, modeInfo.mobileShot), fullPage: true });
            if (width === 768 && modeInfo.tabletShot) await page.screenshot({ path: path.join(output, modeInfo.tabletShot), fullPage: true });
        }
    }

    // English Excel check
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#settings-open').click();
    await page.locator('#theme-excel').click();
    await page.locator('#settings-dialog [data-close]').click();
    await Promise.all([
        page.waitForURL(/index-en/),
        page.locator('.languages a[lang="en"]').click(),
    ]);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'excel');
    assert.equal(await page.title(), '2026_Q4_Semantic_Index_Report.xlsx - Excel');
    await page.locator('#start').click();
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'en-excel-game-desktop.png'), fullPage: true });
    await Promise.all([
        page.waitForURL(url => url.pathname.endsWith('/twenty-questions/') || url.pathname.endsWith('/twenty-questions')),
        page.locator('.languages a[lang="ko"]').click(),
    ]);
    await page.waitForLoadState('networkidle');
    await page.locator('#game-screen').waitFor({ state: 'visible' });
    await page.locator('#settings-open').click();
    await page.locator('#theme-dark').click();
    await page.locator('#settings-dialog [data-close]').click();

    // In Round #4: SpeedRunner solves fast (5s, 1 win) while AlphaSolver solves slower (40s -> total 2 wins, 20s best)
    // Verify 1-A ('최다 정답') vs 1-B ('최단 시간') toggle flips row order accurately
    const tokenD = 'd'.repeat(64);
    h.advanceMs(5000);
    const dStart = await h.start(tokenD);
    const r4Ans = h.answer(dStart.game.id);
    const dG1 = (await h.guess(dStart.game, '사람', crypto.randomUUID(), tokenD)).data;
    await h.guess(dG1.game, r4Ans, crypto.randomUUID(), tokenD);
    await h.call('profile', { name: 'SpeedRunner' }, 'PATCH', tokenD);

    h.advanceMs(35000);
    const bR4Start = await h.start(tokenB);
    const bR4G1 = (await h.guess(bR4Start.game, '사람', crypto.randomUUID(), tokenB)).data;
    await h.guess(bR4G1.game, r4Ans, crypto.randomUUID(), tokenB);

    await page.locator('#ranking-open').click();
    await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#ranking-title')?.textContent === '랭킹' && document.querySelectorAll('#leaderboard tbody tr').length === 3);
    assert.equal(await page.locator('#ranking-sort-wins').getAttribute('aria-pressed'), 'true');
    assert.ok((await page.locator('#leaderboard tbody tr:nth-child(1)').textContent()).includes('AlphaSolver'));
    assert.ok((await page.locator('#leaderboard tbody tr:nth-child(1) td:nth-child(3)').textContent()).includes('2회'));
    assert.ok((await page.locator('#leaderboard tbody tr:nth-child(2)').textContent()).includes('SpeedRunner'));
    assert.ok((await page.locator('#leaderboard tbody tr:nth-child(3)').textContent()).includes('StarGazerPro'));
    assert.match(await page.locator('#own-rank').textContent(), /^내 순위 · #3 · 정답 1회 · \d{2}:\d{2}\.\d{2}$/);
    await page.screenshot({ path: path.join(output, 'ko-ranking-after-rollover.png') });

    await page.locator('#ranking-sort-time').click();
    await page.waitForFunction(() => document.querySelector('#ranking-sort-time')?.getAttribute('aria-pressed') === 'true' && document.querySelector('#leaderboard tbody tr:nth-child(1)')?.textContent.includes('SpeedRunner'));
    assert.ok((await page.locator('#leaderboard tbody tr:nth-child(2)').textContent()).includes('AlphaSolver'));
    assert.ok((await page.locator('#leaderboard tbody tr:nth-child(3)').textContent()).includes('StarGazerPro'));
    assert.match(await page.locator('#ranking-rule').textContent(), /최단 경과 시간 순/);
    await page.screenshot({ path: path.join(output, 'ko-ranking-time-mode.png') });
    await page.locator('#ranking-sort-wins').click();
    await page.waitForFunction(() => document.querySelector('#ranking-sort-wins')?.getAttribute('aria-pressed') === 'true');
    await page.locator('#ranking-dialog [data-close]').click();

    // Responsive check across all mobile & tablet viewports
    for (const [width, height] of [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [844, 390]]) {
        await page.setViewportSize({ width, height });
        if (width === 320 || width === 390) {
            await page.locator('#ranking-open').click();
            await page.locator('#ranking-dialog').waitFor({ state: 'visible' });
            await page.waitForFunction(() => document.querySelectorAll('#leaderboard tbody tr').length === 3);
            const lbMetrics = await page.evaluate(() => {
                const lb = document.getElementById('leaderboard');
                const btns = ['#ranking-sort-wins', '#ranking-sort-time'].map(s => document.querySelector(s).getBoundingClientRect().toJSON());
                return { overflow: lb.scrollWidth > lb.clientWidth, btns };
            });
            assert.equal(lbMetrics.overflow, false, `${width}x${height}: ranking table overflow`);
            for (const rect of lbMetrics.btns) {
                assert.ok(rect.height >= 44, `${width}x${height}: ranking sort btn height ${rect.height}`);
            }
            if (width === 390) {
                await page.screenshot({ path: path.join(output, 'ko-ranking-mobile-390.png') });
            }
            await page.locator('#ranking-dialog [data-close]').click();
        }
        await page.locator('#home').click();
        await page.locator('#title-screen').waitFor({ state: 'visible' });
        if (width === 390 && height === 844) {
            await page.screenshot({ path: path.join(output, 'ko-title-mobile-390.png'), fullPage: true });
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}x${height}: title overflow`);
        await page.locator('#start').click();
        await page.locator('#game-screen').waitFor({ state: 'visible' });
        if (width === 390 && height === 844) {
            if (await page.locator('.starter-chip[data-word="사람"]').isVisible()) {
                await page.locator('.starter-chip[data-word="사람"]').click();
                await page.waitForFunction(() => Number(document.querySelector('#guess-count-display').textContent) >= 1);
            } else {
                const beforeCount = Number(await page.locator('#guess-count-display').textContent());
                await page.locator('#guess-input').fill('자연');
                await page.locator('#send').click();
                await page.waitForFunction(n => Number(document.querySelector('#guess-count-display').textContent) === n, beforeCount + 1);
            }
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
