'use strict';

// Browser regression test: double-clicking the title "start" button while a
// saved game exists must start a clean new game. The second click must not
// fall through to the tray/board (no piece grabbed or placed), and board input
// must work again once the start transition is over.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

function loadChromium() {
    try { return require('@playwright/test').chromium; } catch (_) { /* fall through */ }
    return require('playwright').chromium;
}

const root = path.resolve(process.env.BLOCKPANG_TEST_ROOT || path.join(__dirname, '..'));
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function startServer() {
    const server = http.createServer((req, res) => {
        let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = path.join(root, pathname);
        if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
        try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (_) { /* 404 below */ }
        fs.readFile(file, (error, body) => {
            if (error) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
            res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
            res.end(body);
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function launch(chromium) {
    try {
        return await chromium.launch({ headless: true });
    } catch (error) {
        // CI images ship Google Chrome even when Playwright's bundled browser
        // has not been downloaded.
        return chromium.launch({ headless: true, channel: 'chrome' });
    }
}

const SAVED_GAME = {
    grid: Array.from({ length: 10 }, (_, row) => Array.from({ length: 10 }, (_, col) => (row === 9 && col < 7 ? 2 : -1))),
    slots: [
        { shape: [[1]], colorIndex: 1, rows: 1, cols: 1, cellCount: 1 },
        { shape: [[1, 1]], colorIndex: 3, rows: 1, cols: 2, cellCount: 2 },
        { shape: [[1], [1]], colorIndex: 5, rows: 2, cols: 1, cellCount: 2 },
    ],
    score: 4321, combo: 0, level: 1, linesCleared: 0, totalLinesForLevel: 0,
    rankProtocol: 0, rankSeed: 0, rankMoveSeq: 0, pieceRngState: 0, ts: Date.now(),
};

async function openTitle(browser, baseUrl, reducedMotion, viewport = { width: 412, height: 915 }, hasTouch = false) {
    const context = await browser.newContext({
        viewport, hasTouch, deviceScaleFactor: 1, reducedMotion, locale: 'ko-KR',
    });
    await context.route(/googletagmanager|google-analytics|analytics\.google|fonts\.googleapis|fonts\.gstatic|workers\.dev/, (route) => {
        const url = route.request().url();
        if (/\.js(\?|$)|googletagmanager/.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
        return route.fulfill({ status: 204, body: '' });
    });
    await context.addInitScript((save) => {
        try {
            if (!sessionStorage.getItem('__bp_seeded')) {
                localStorage.setItem('blockpang_save', JSON.stringify(save));
                sessionStorage.setItem('__bp_seeded', '1');
            }
        } catch (_) { /* storage unavailable */ }
    }, SAVED_GAME);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseUrl + '/blockpang/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => {
        const g = window.__blockpangGame;
        return g && g.state === 'title' && g.ui && g.ui.titleContainer && (g.ui._activeButtons || []).length >= 2
            && document.getElementById('game-loading')?.classList.contains('is-hidden');
    }, null, { timeout: 60000 });
    // Count real placements without changing how they work.
    await page.evaluate(() => {
        const g = window.__blockpangGame;
        const placePiece = g.placePiece;
        g.__placements = 0;
        g.placePiece = function (...args) { g.__placements += 1; return placePiece.apply(this, args); };
    });
    return { context, page, errors };
}

function startButtonPoint(page) {
    return page.evaluate(() => {
        const g = window.__blockpangGame;
        const rect = g.app.canvas.getBoundingClientRect();
        const scale = rect.width / g.app.screen.width;
        const wide = [...g.ui._activeButtons].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 2);
        const start = wide.sort((a, b) => b.y - a.y)[0]; // "game start" sits below "continue"
        return { x: rect.left + (start.x + start.w / 2) * scale, y: rect.top + (start.y + start.h / 2) * scale };
    });
}

function trayPoints(page) {
    return page.evaluate(() => {
        const g = window.__blockpangGame;
        const rect = g.app.canvas.getBoundingClientRect();
        const scale = rect.width / g.app.screen.width;
        return [0, 1, 2].map((i) => {
            const p = g.tray.getSlotGlobalCenter(i);
            return { x: rect.left + p.x * scale, y: rect.top + p.y * scale };
        });
    });
}

function snapshot(page) {
    return page.evaluate(() => {
        const g = window.__blockpangGame;
        let filled = 0;
        g.board.grid.forEach((row) => row.forEach((cell) => { if (cell !== -1) filled += 1; }));
        return {
            state: g.state,
            score: g.scoreManager.score,
            traySlots: g.tray.slots.filter(Boolean).length,
            filled,
            placements: g.__placements,
            dragging: Boolean(g.input.dragging),
            boardVisible: g.board.container.visible,
            titleGone: !g.ui.titleContainer,
        };
    });
}

async function waitForBoard(page) {
    await page.waitForFunction(() => {
        const g = window.__blockpangGame;
        return g.state === 'playing' && g.board.container.visible && g.tray.container.visible;
    }, null, { timeout: 15000 });
}

async function waitForSettled(page) {
    await page.waitForFunction(() => {
        const g = window.__blockpangGame;
        return g.board.container.alpha >= 0.99 && !g.ui.titleContainer
            && (typeof g.isBoardInputLocked !== 'function' || !g.isBoardInputLocked());
    }, null, { timeout: 15000 });
}

async function assertCleanNewGame(page, label) {
    await waitForSettled(page);
    const s = await snapshot(page);
    assert.equal(s.state, 'playing', `${label}: game must be playing`);
    assert.equal(s.placements, 0, `${label}: the second click must not place a piece`);
    assert.equal(s.score, 0, `${label}: new game must start with score 0`);
    assert.equal(s.traySlots, 3, `${label}: new game must have 3 tray pieces`);
    assert.equal(s.filled, 0, `${label}: new game must start with an empty board`);
    assert.equal(s.dragging, false, `${label}: no piece may stay grabbed`);
    return s;
}

async function dragFirstPieceToBoard(page) {
    // Dispatch the gesture in the page. A Playwright mouse drag drops the piece
    // when the machine is busy, and a fixed center cell misses large shapes.
    await page.evaluate(() => {
        const g = window.__blockpangGame;
        const piece = g.tray.slots[0];
        if (!piece) throw new Error('tray slot 0 is empty');
        const rows = g.board.grid.length;
        const cols = g.board.grid[0].length;
        let spot = null;
        for (let row = 0; row <= rows - piece.rows && !spot; row++) {
            for (let col = 0; col <= cols - piece.cols; col++) {
                if (g.board.canPlace(piece.shape, col, row)) {
                    spot = { col, row };
                    break;
                }
            }
        }
        if (!spot) throw new Error('no legal cell for the first tray piece');
        const canvas = g.app.canvas;
        const rect = canvas.getBoundingClientRect();
        const scale = rect.width / g.app.screen.width;
        const from = g.tray.getSlotGlobalCenter(0);
        const board = g.board.getGlobalPosition();
        const centerX = board.x + (spot.col + piece.cols / 2) * g.cellSize;
        const centerY = board.y + (spot.row + piece.rows / 2) * g.cellSize;
        const fx = rect.left + from.x * scale;
        const fy = rect.top + from.y * scale;
        const tx = rect.left + centerX * scale;
        const ty = rect.top + (centerY - g.input.dragOffsetY) * scale;
        const fire = (type, x, y) => {
            canvas.dispatchEvent(new PointerEvent(type, {
                bubbles: true, cancelable: true, composed: true,
                pointerId: 1, pointerType: 'mouse', isPrimary: true,
                button: 0, buttons: type === 'pointerup' ? 0 : 1,
                clientX: x, clientY: y,
            }));
        };
        fire('pointerdown', fx, fy);
        for (let step = 1; step <= 8; step++) {
            fire('pointermove', fx + (tx - fx) * step / 8, fy + (ty - fy) * step / 8);
        }
        fire('pointerup', tx, ty);
    });
}

// Waits in the page for the first frame on which the board is visible and,
// on that same frame, sends a press on the first tray piece that slides onto
// the board and releases, through the canvas pointer events the game handles.
// Running it in the page keeps the timing independent of harness latency on a
// loaded machine.
function sloppySecondPressOnBoardAppear(page) {
    return page.evaluate(() => new Promise((resolve) => {
        const g = window.__blockpangGame;
        const canvas = g.app.canvas;
        const fire = (type, x, y) => {
            canvas.dispatchEvent(new PointerEvent(type, {
                bubbles: true, cancelable: true, composed: true,
                pointerId: 1, pointerType: 'mouse', isPrimary: true,
                button: 0, buttons: type === 'pointerup' ? 0 : 1,
                clientX: x, clientY: y,
            }));
        };
        const tick = () => {
            if (!(g.state === 'playing' && g.board.container.visible && g.tray.container.visible && g.tray.slots[0])) {
                requestAnimationFrame(tick);
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const scale = rect.width / g.app.screen.width;
            const from = g.tray.getSlotGlobalCenter(0);
            const board = g.board.getGlobalPosition();
            const fx = rect.left + from.x * scale;
            const fy = rect.top + from.y * scale;
            const tx = rect.left + (board.x + g.cellSize * 5) * scale;
            const ty = rect.top + (board.y + g.cellSize * 5 - g.input.dragOffsetY) * scale;
            fire('pointerdown', fx, fy);
            const grabbed = Boolean(g.input.dragging);
            for (let i = 1; i <= 8; i++) fire('pointermove', fx + (tx - fx) * i / 8, fy + (ty - fy) * i / 8);
            fire('pointerup', tx, ty);
            resolve({ grabbed, boardAlpha: g.board.container.alpha });
        };
        tick();
    }));
}

async function run() {
    const chromium = loadChromium();
    const server = await startServer();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const browser = await launch(chromium);
    const results = [];
    try {
        for (const reducedMotion of ['no-preference', 'reduce']) {
            // 1) A fast native double click on "game start".
            {
                const { context, page, errors } = await openTitle(browser, baseUrl, reducedMotion);
                const p = await startButtonPoint(page);
                await page.mouse.dblclick(p.x, p.y);
                results.push([reducedMotion, 'dblclick', await assertCleanNewGame(page, `${reducedMotion} dblclick`)]);
                assert.deepEqual(errors, []);
                await context.close();
            }
            // 2) The second click of a slow double click lands right after the
            //    board has appeared (the reported case), at the same point.
            {
                const { context, page, errors } = await openTitle(browser, baseUrl, reducedMotion);
                const p = await startButtonPoint(page);
                await page.mouse.click(p.x, p.y);
                await waitForBoard(page);
                await page.mouse.click(p.x, p.y);
                results.push([reducedMotion, 'second click on board', await assertCleanNewGame(page, `${reducedMotion} late second click`)]);
                assert.deepEqual(errors, []);
                await context.close();
            }
            // 3) A sloppy second click: it presses a tray piece right after the
            //    board appears and slides onto the board before releasing.
            {
                const { context, page, errors } = await openTitle(browser, baseUrl, reducedMotion);
                const p = await startButtonPoint(page);
                const pressed = sloppySecondPressOnBoardAppear(page);
                await page.mouse.click(p.x, p.y);
                await pressed;
                results.push([reducedMotion, 'second press dragged onto the board', await assertCleanNewGame(page, `${reducedMotion} dragged second press`)]);
                assert.deepEqual(errors, []);
                await context.close();
            }
            // 4) Presses on every tray piece while the board is still entering
            //    are ignored; once it has settled, dragging a piece works.
            {
                const { context, page, errors } = await openTitle(browser, baseUrl, reducedMotion);
                const p = await startButtonPoint(page);
                await page.mouse.click(p.x, p.y);
                await waitForBoard(page);
                for (const slot of await trayPoints(page)) {
                    await page.mouse.click(slot.x, slot.y);
                }
                await assertCleanNewGame(page, `${reducedMotion} tray presses during entrance`);
                await dragFirstPieceToBoard(page);
                await page.waitForFunction(() => window.__blockpangGame.__placements === 1 && !window.__blockpangGame.isAnimating, null, { timeout: 10000 });
                const after = await snapshot(page);
                assert.equal(after.placements, 1, `${reducedMotion}: a drag after the transition must place the piece`);
                assert.ok(after.score > 0, `${reducedMotion}: placing a piece must score`);
                assert.equal(after.traySlots, 2, `${reducedMotion}: the placed piece leaves the tray`);
                results.push([reducedMotion, 'tray presses then drag', after]);
                assert.deepEqual(errors, []);
                await context.close();
            }
        }
    } finally {
        await browser.close();
        server.close();
    }
    for (const [motion, name, s] of results) console.log(`  ${motion} / ${name}: ${JSON.stringify(s)}`);
    console.log('Blockpang start input guard: double click starts a clean game and board input resumes after the transition');
}

if (require.main === module) {
    run().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { loadChromium, startServer, launch, openTitle, startButtonPoint, trayPoints, snapshot, dragFirstPieceToBoard, sloppySecondPressOnBoardAppear, waitForBoard };
