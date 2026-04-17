// pause 중 restart 시 물리가 2배속으로 돌지 않음을 검증
import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE_ERROR: ' + m.text()); });

await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => {
    const btn = document.getElementById('play-btn');
    return btn && !btn.disabled;
}, { timeout: 10000 });

// Hook into RAF count via the game's scope — we'll count Engine.update calls
await page.evaluate(() => {
    window.__engineUpdateCount = 0;
    const Matter = window.Matter;
    const origUpdate = Matter.Engine.update;
    Matter.Engine.update = function (...args) {
        window.__engineUpdateCount++;
        return origUpdate.apply(this, args);
    };
});

// Start game
await page.click('#play-btn');
await page.waitForTimeout(600);

// Reset counter, wait 1s, read count (baseline: ~60)
await page.evaluate(() => { window.__engineUpdateCount = 0; });
await page.waitForTimeout(1000);
const baseline = await page.evaluate(() => window.__engineUpdateCount);
console.log('Baseline updates/sec (single loop):', baseline);

// Now pause, then restart — this was the bug trigger
await page.click('#pause-btn');
await page.waitForTimeout(300);
await page.click('#restart-btn');
await page.waitForTimeout(300);

// Measure again
await page.evaluate(() => { window.__engineUpdateCount = 0; });
await page.waitForTimeout(1000);
const afterRestart = await page.evaluate(() => window.__engineUpdateCount);
console.log('After pause+restart updates/sec:', afterRestart);

// Do it 3 more times — should NOT accumulate
for (let i = 0; i < 3; i++) {
    await page.click('#pause-btn');
    await page.waitForTimeout(150);
    await page.click('#restart-btn');
    await page.waitForTimeout(150);
}
await page.evaluate(() => { window.__engineUpdateCount = 0; });
await page.waitForTimeout(1000);
const afterMany = await page.evaluate(() => window.__engineUpdateCount);
console.log('After 4x pause+restart updates/sec:', afterMany);

await browser.close();

const ratioRestart = afterRestart / baseline;
const ratioMany = afterMany / baseline;
console.log(`\nRatio after 1 restart: ${ratioRestart.toFixed(2)}x`);
console.log(`Ratio after 4 restarts: ${ratioMany.toFixed(2)}x`);

if (ratioMany > 1.3) {
    console.log('❌ FAIL: loop multiplication detected (expected ~1.0x)');
    process.exit(1);
}
if (errors.length) {
    console.log('❌ FAIL: errors during test');
    errors.forEach(e => console.log(e));
    process.exit(1);
}
console.log('✅ PASS: loop stays stable after repeated pause+restart');
