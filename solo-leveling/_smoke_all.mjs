import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE_ERROR: ' + m.text());
});

// 1. Preload -> Menu
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'load' });
await page.waitForTimeout(100); // capture preload in transit if lucky
await page.screenshot({ path: 'c:/workspace/test-output/sl-01-preload.png' });

await page.waitForTimeout(2000);
await page.screenshot({ path: 'c:/workspace/test-output/sl-02-menu.png' });

// 2. Enter game
const vw = 1280, vh = 800;
await page.mouse.click(vw / 2, vh * 0.65);
await page.waitForTimeout(3000);
await page.screenshot({ path: 'c:/workspace/test-output/sl-03-hud.png' });

// 3. Open status window (TAB)
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
await page.screenshot({ path: 'c:/workspace/test-output/sl-04-status.png' });
await page.keyboard.press('Tab');
await page.waitForTimeout(300);

// 4. Force level up via console (grant XP)
await page.evaluate(() => {
    const game = window.__gameInstance || (window.Phaser && window.game);
    // Try to get Phaser game instance via DOM
    const cvs = document.querySelector('canvas');
    if (!cvs) return;
    // The game instance often attaches to window; try a few paths
    const inst = window.game || window.__game || window.Game;
    if (inst) {
        const gs = inst.scene.getScene('GameScene');
        if (gs && gs.player) {
            gs.player.addXP(10000);
        }
    }
});
await page.waitForTimeout(1000);
await page.screenshot({ path: 'c:/workspace/test-output/sl-05-levelup.png' });

// 5. Force game over via console
await page.evaluate(() => {
    const inst = window.game || window.__game;
    if (inst) {
        const gs = inst.scene.getScene('GameScene');
        if (gs && gs.player) {
            gs.player.stats.hp = 0;
            if (typeof gs._endGame === 'function') gs._endGame();
            else if (gs.scene) gs.scene.start('GameOverScene', { level: 5, rank: 'D', kills: 42, time: 123, shadowCount: 3, victory: false });
        } else if (inst.scene) {
            inst.scene.start('GameOverScene', { level: 5, rank: 'D', kills: 42, time: 123, shadowCount: 3, victory: false });
        }
    }
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'c:/workspace/test-output/sl-06-gameover.png' });

await browser.close();

if (errors.length) {
    console.log('=== ERRORS ===');
    errors.forEach(e => console.log(e));
    process.exit(1);
} else {
    console.log('=== NO ERRORS ===');
}
