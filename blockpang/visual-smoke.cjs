'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const baseUrl = process.env.BLOCKPANG_URL || 'http://127.0.0.1:4173/blockpang/';
const outputDir = process.env.BLOCKPANG_SCREENSHOT_DIR
    || path.join(os.tmpdir(), 'blockpang-visual-smoke');

const allScenarios = [
    { name: 'mobile-390x844', width: 390, height: 844, minCell: 28 },
    { name: 'mobile-412x915', width: 412, height: 915, minCell: 30 },
    { name: 'short-900x500', width: 900, height: 500, minCell: 19 },
    { name: 'desktop-1365x768', width: 1365, height: 768, minCell: 35 },
    { name: 'desktop-1920x1080', width: 1920, height: 1080, minCell: 50 },
];
const scenarios = process.env.BLOCKPANG_SCENARIO
    ? allScenarios.filter((scenario) => scenario.name === process.env.BLOCKPANG_SCENARIO)
    : allScenarios;

async function run() {
    fs.mkdirSync(outputDir, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const pageErrors = [];

    try {
        for (const scenario of scenarios) {
            const context = await browser.newContext({
                viewport: { width: scenario.width, height: scenario.height },
                deviceScaleFactor: 1,
                reducedMotion: 'reduce',
            });
            await context.route('**/*', (route) => {
                const url = route.request().url();
                if (url.includes('googletagmanager.com')) {
                    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
                }
                if (url.includes('analytics.google.com')) {
                    return route.fulfill({ status: 204, body: '' });
                }
                if (url.includes('fonts.googleapis.com')) {
                    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
                }
                return route.continue();
            });
            const page = await context.newPage();
            page.on('console', (message) => {
                if (message.type() === 'error' || message.type() === 'warning') {
                    console.error(scenario.name + ' console ' + message.type() + ': ' + message.text());
                }
            });
            page.on('pageerror', (error) => {
                pageErrors.push(scenario.name + ': ' + error.message);
                console.error(scenario.name + ' pageerror: ' + error.message);
            });
            page.on('requestfailed', (request) => {
                console.error(
                    scenario.name + ' requestfailed: ' + request.url() + ' '
                    + ((request.failure() && request.failure().errorText) || '')
                );
            });

            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            try {
                await page.waitForFunction(() => Boolean(window.__blockpangGame), null, { timeout: 15000 });
            } catch (error) {
                const diagnostics = await page.evaluate(() => ({
                    href: location.href,
                    title: document.title,
                    pixiType: typeof window.PIXI,
                    gameType: typeof window.__blockpangGame,
                    canvasCount: document.querySelectorAll('canvas').length,
                }));
                console.error(JSON.stringify({ scenario: scenario.name, diagnostics }));
                throw error;
            }
            await page.evaluate(() => {
                localStorage.removeItem('blockpang_save');
                window.__blockpangGame.startGame(false);
            });
            await page.waitForFunction(
                () => window.__blockpangGame.tray.trayCellSizes.every((size) => size > 0),
                null,
                { timeout: 10000 }
            );
            await page.evaluate(() => {
                const board = window.__blockpangGame.board;
                const cyan = board.place([[1, 1, 1], [0, 1, 0]], 2, 4, 0);
                const orange = board.place([[1, 0], [1, 0], [1, 1]], 6, 3, 5);
                window.__blockpangVisualPlacedCells = cyan.cells.length + orange.cells.length;
            });
            await page.waitForTimeout(150);

            const metrics = await page.evaluate(() => {
                const game = window.__blockpangGame;
                const width = game.app.screen.width;
                const height = game.app.screen.height;
                const cellSize = game.cellSize;
                const gridSize = cellSize * GRID_SIZE;
                const frameExt = getBlockpangBoardPanelExt(cellSize, width, height);
                return {
                    width,
                    height,
                    cellSize,
                    gridSize,
                    frameExt,
                    boardX: game.board.container.x,
                    boardY: game.board.container.y,
                    trayY: game.tray.container.y,
                    trayCellSizes: game.tray.trayCellSizes.slice(),
                    placedCellCount: window.__blockpangVisualPlacedCells || 0,
                    state: game.state,
                };
            });
            console.log(JSON.stringify({ scenario: scenario.name, metrics }));

            assert.equal(metrics.state, 'playing', scenario.name + ' must enter gameplay');
            assert.equal(metrics.placedCellCount, 8, scenario.name + ' must render placed crystal blocks');
            assert.ok(
                metrics.cellSize >= scenario.minCell,
                scenario.name + ' board cells are unexpectedly small: ' + metrics.cellSize
            );
            assert.ok(
                metrics.boardX - metrics.frameExt >= -1,
                scenario.name + ' board frame clips on the left'
            );
            assert.ok(
                metrics.boardX + metrics.gridSize + metrics.frameExt <= metrics.width + 1,
                scenario.name + ' board frame clips on the right'
            );
            assert.ok(
                metrics.boardY + metrics.gridSize <= metrics.trayY + 1,
                scenario.name + ' board overlaps the piece tray'
            );
            assert.ok(
                metrics.trayCellSizes.filter((size) => size > 0).length === 3
                    && metrics.trayCellSizes.every((size) => size >= 10),
                scenario.name + ' contains an unreadably small tray piece'
            );

            const screenshotPath = path.join(outputDir, scenario.name + '.png');
            await page.screenshot({ path: screenshotPath, fullPage: false });
            console.log(JSON.stringify({ scenario: scenario.name, screenshotPath }));
            await context.close();
        }
    } finally {
        await browser.close();
    }

    assert.deepEqual(pageErrors, [], 'browser page errors: ' + pageErrors.join(' | '));
    console.log('blockpang visual smoke passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
