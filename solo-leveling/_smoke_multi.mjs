import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();

const configs = [
    { name: 'ko-desktop', viewport: { w: 1280, h: 800 }, lang: 'ko', mobile: false },
    { name: 'en-desktop', viewport: { w: 1280, h: 800 }, lang: 'en', mobile: false },
    { name: 'ja-desktop', viewport: { w: 1280, h: 800 }, lang: 'ja', mobile: false },
    { name: 'ko-portrait-phone', viewport: { w: 390, h: 844 }, lang: 'ko', mobile: true },
    { name: 'en-portrait-phone', viewport: { w: 390, h: 844 }, lang: 'en', mobile: true },
    { name: 'ko-landscape-phone', viewport: { w: 844, h: 390 }, lang: 'ko', mobile: true },
    { name: 'ko-tablet', viewport: { w: 768, h: 1024 }, lang: 'ko', mobile: true },
    { name: 'ko-narrow-phone', viewport: { w: 360, h: 780 }, lang: 'ko', mobile: true },
    { name: 'ko-ultrawide', viewport: { w: 2560, h: 1080 }, lang: 'ko', mobile: false },
];

for (const cfg of configs) {
    const ctxOpts = { viewport: { width: cfg.viewport.w, height: cfg.viewport.h } };
    if (cfg.mobile) {
        ctxOpts.hasTouch = true;
        ctxOpts.isMobile = true;
        ctxOpts.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    }
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${cfg.name}] PAGEERROR: ${e.message}`));
    page.on('console', m => {
        if (m.type() === 'error') errors.push(`[${cfg.name}] CONSOLE_ERROR: ${m.text()}`);
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

    await page.goto(`http://127.0.0.1:8765/index.html?lang=${cfg.lang}`, { waitUntil: 'load' });
    await page.waitForTimeout(3200);
    await page.screenshot({ path: `c:/workspace/test-output/mr-${cfg.name}-menu.png` });

    await ctx.close();
}

await browser.close();

if (errors.length) {
    console.log('=== ERRORS ===');
    errors.forEach(e => console.log(e));
    process.exit(1);
} else {
    console.log('=== NO ERRORS (' + configs.length + ' configs tested) ===');
}
