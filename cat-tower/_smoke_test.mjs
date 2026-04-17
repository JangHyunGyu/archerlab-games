import { chromium } from 'playwright';

const errors = [];
const warnings = [];
const consoleMessages = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
page.on('console', m => {
    const text = m.text();
    consoleMessages.push(`[${m.type()}] ${text}`);
    if (m.type() === 'error') errors.push('CONSOLE_ERROR: ' + text);
    if (m.type() === 'warning') warnings.push('CONSOLE_WARN: ' + text);
});

const STEPS = [];
function step(name) { STEPS.push(name); console.log('\n▶', name); }

try {
    step('1. Load page');
    await page.goto('http://127.0.0.1:8767/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    step('2. Wait for play button to enable (preload)');
    await page.waitForFunction(() => {
        const btn = document.getElementById('play-btn');
        return btn && !btn.disabled && btn.textContent.trim() === '플레이';
    }, { timeout: 10000 });

    step('3. Screenshot main menu');
    await page.screenshot({ path: 'c:/workspace/test-output/cat-01-menu.png' });

    step('4. Open how-to modal');
    await page.click('#how-btn');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'c:/workspace/test-output/cat-02-how.png' });
    await page.click('#how-close');
    await page.waitForTimeout(300);

    step('5. Click Play → start game');
    await page.click('#play-btn');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'c:/workspace/test-output/cat-03-game-start.png' });

    step('6. Verify canvas is visible and cat spawned');
    const state1 = await page.evaluate(() => {
        const canvas = document.getElementById('canvas');
        const nextCanvas = document.getElementById('next-cat');
        return {
            canvasVisible: !!canvas && canvas.offsetWidth > 0 && canvas.offsetHeight > 0,
            canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'none',
            nextCanvasSize: nextCanvas ? `${nextCanvas.width}x${nextCanvas.height}` : 'none',
            scoreText: document.getElementById('score')?.textContent,
        };
    });
    console.log('  state1:', state1);

    step('7. Drop first cat at center');
    const rect = await page.evaluate(() => {
        const c = document.getElementById('canvas');
        const r = c.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    console.log('  canvas rect:', rect);

    // Tap center → drop
    await page.mouse.click(rect.x + rect.w/2, rect.y + rect.h/4);
    await page.waitForTimeout(900);

    step('8. Drop more cats (5 drops) to trigger potential merges');
    for (let i = 0; i < 5; i++) {
        const px = rect.x + rect.w * (0.3 + Math.random() * 0.4);
        const py = rect.y + rect.h * 0.2;
        await page.mouse.click(px, py);
        await page.waitForTimeout(800);
    }
    await page.screenshot({ path: 'c:/workspace/test-output/cat-04-after-drops.png' });

    step('9. Check score and physics state');
    const state2 = await page.evaluate(() => {
        return {
            score: document.getElementById('score')?.textContent,
        };
    });
    console.log('  state2:', state2);

    step('10. Test pause');
    await page.click('#pause-btn');
    await page.waitForTimeout(400);
    const pauseVisible = await page.evaluate(() => {
        return !document.getElementById('pause-modal').classList.contains('hidden');
    });
    console.log('  pause modal visible:', pauseVisible);

    step('11. Resume');
    await page.click('#resume-btn');
    await page.waitForTimeout(400);

    step('12. Test Escape key pauses');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const pauseByEsc = await page.evaluate(() => {
        return !document.getElementById('pause-modal').classList.contains('hidden');
    });
    console.log('  pause by ESC:', pauseByEsc);
    await page.click('#resume-btn');
    await page.waitForTimeout(300);

    step('13. Space drop');
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);

    step('14. Exit to menu');
    await page.click('#pause-btn');
    await page.waitForTimeout(300);
    await page.click('#exit-btn');
    await page.waitForTimeout(400);
    const backToMenu = await page.evaluate(() => {
        return !document.getElementById('menu').classList.contains('hidden');
    });
    console.log('  back to menu:', backToMenu);

    step('15. Replay — start game 2nd time');
    await page.click('#play-btn');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'c:/workspace/test-output/cat-05-replay.png' });

    step('16. Drag pointer across canvas (mouse move)');
    await page.mouse.move(rect.x + rect.w * 0.2, rect.y + rect.h * 0.15);
    await page.waitForTimeout(100);
    await page.mouse.move(rect.x + rect.w * 0.8, rect.y + rect.h * 0.15);
    await page.waitForTimeout(100);
    await page.mouse.move(rect.x + rect.w * 0.5, rect.y + rect.h * 0.15);
    await page.waitForTimeout(300);

    step('17. Force-trigger game over by stacking many cats at top');
    await page.evaluate(() => {
        // Dispatch rapid drops to stack cats
        const canvas = document.getElementById('canvas');
        const rect = canvas.getBoundingClientRect();
    });
    // rapid drops
    for (let i = 0; i < 14; i++) {
        const px = rect.x + rect.w * (0.45 + (Math.random() - 0.5) * 0.1);
        await page.mouse.click(px, rect.y + rect.h * 0.2);
        await page.waitForTimeout(650);
    }
    await page.screenshot({ path: 'c:/workspace/test-output/cat-06-stacked.png' });

    step('18. Wait for potential gameover');
    await page.waitForTimeout(4000);
    const gameOverState = await page.evaluate(() => {
        return {
            gameoverVisible: !document.getElementById('gameover-modal').classList.contains('hidden'),
            finalScore: document.getElementById('final-score')?.textContent,
        };
    });
    console.log('  gameover state:', gameOverState);
    await page.screenshot({ path: 'c:/workspace/test-output/cat-07-gameover.png' });

    if (gameOverState.gameoverVisible) {
        step('19. Replay from gameover');
        await page.click('#replay-btn');
        await page.waitForTimeout(1000);
    }

} catch (err) {
    errors.push('TEST_STEP_ERROR in [' + STEPS[STEPS.length - 1] + ']: ' + err.message);
}

await browser.close();

console.log('\n\n=== SUMMARY ===');
console.log('Total steps passed:', STEPS.length);
console.log('Errors:', errors.length);
console.log('Warnings:', warnings.length);

if (warnings.length) {
    console.log('\n--- WARNINGS ---');
    warnings.forEach(w => console.log(w));
}
if (errors.length) {
    console.log('\n--- ERRORS ---');
    errors.forEach(e => console.log(e));
    process.exit(1);
} else {
    console.log('\n✅ NO ERRORS');
}
