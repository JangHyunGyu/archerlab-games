import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE_ERROR: ' + m.text());
});

await page.addInitScript(() => {
    const patch = () => {
        if (!window.Phaser || !window.Phaser.Game) { setTimeout(patch, 50); return; }
        const OrigGame = window.Phaser.Game;
        window.Phaser.Game = function(...args) {
            const g = new OrigGame(...args);
            window.__game = g;
            return g;
        };
        window.Phaser.Game.prototype = OrigGame.prototype;
    };
    patch();
});

await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'load' });
await page.waitForTimeout(2000);

// Enter game
await page.mouse.click(640, 520);
await page.waitForTimeout(2500);

// Force level up
await page.evaluate(() => {
    const g = window.__game;
    if (!g) return;
    const gs = g.scene.getScene('GameScene');
    if (!gs || !gs.player || !gs.weaponManager) return;
    gs.scene.pause();
    gs.scene.launch('LevelUpScene', { gameScene: gs, player: gs.player, weaponManager: gs.weaponManager });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'c:/workspace/test-output/sl-05b-levelup.png' });

// Gameover with victory
await page.evaluate(() => {
    const g = window.__game;
    if (!g) return;
    g.scene.stop('LevelUpScene');
    g.scene.stop('GameScene');
    g.scene.start('GameOverScene', { level: 12, rank: 'C', kills: 358, time: 720, shadowCount: 5, victory: true });
});
await page.waitForTimeout(600);
// Click skip to get stats view
await page.mouse.click(640 + 75, 416);
await page.waitForTimeout(900);
await page.screenshot({ path: 'c:/workspace/test-output/sl-06b-gameover-stats.png' });

await browser.close();

if (errors.length) {
    console.log('=== ERRORS ===');
    errors.forEach(e => console.log(e));
    process.exit(1);
} else {
    console.log('=== NO ERRORS ===');
}
