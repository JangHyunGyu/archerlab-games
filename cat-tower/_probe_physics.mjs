// 물리 진단: 매 프레임 position을 감시하여 NaN이 언제 발생하는지 추적
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { const t=m.type(); if (t==='error'||t==='warning'||t==='log') console.log(`[${t}]`, m.text()); });

await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => { const b = document.getElementById('play-btn'); return b && !b.disabled; }, { timeout: 10000 });

// Hook into Matter engine + log every frame for cats that go NaN
await page.evaluate(() => {
    const origCreate = Matter.Engine.create;
    Matter.Engine.create = function (...args) {
        const e = origCreate.apply(this, args);
        window.__engine = e;
        return e;
    };
    // Hook Body.setVelocity to catch the impulse
    const origSV = Matter.Body.setVelocity;
    window.__velocityLog = [];
    Matter.Body.setVelocity = function(body, v) {
        window.__velocityLog.push({
            label: body.label, tier: body.cat?.tier,
            pos: { x: Math.round(body.position.x*10)/10, y: Math.round(body.position.y*10)/10 },
            vel: v,
            t: performance.now(),
        });
        return origSV.call(this, body, v);
    };
});

await page.click('#play-btn');
await page.waitForTimeout(500);

const rect = await page.evaluate(() => {
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
});

// Drop 5 cats at same x
console.log('\n--- Drop 5 cats ---');
for (let i = 0; i < 5; i++) {
    await page.mouse.click(rect.x + rect.w/2, rect.y + 50);
    // Take a sample every 100ms during drop sequence
    for (let k = 0; k < 7; k++) {
        await page.waitForTimeout(100);
        const s = await page.evaluate(() => {
            const e = window.__engine;
            if (!e) return null;
            return Matter.Composite.allBodies(e.world)
                .filter(b => b.label === 'cat')
                .map(b => ({
                    tier: b.cat?.tier,
                    x: Number.isFinite(b.position.x) ? Math.round(b.position.x*10)/10 : 'NaN',
                    y: Number.isFinite(b.position.y) ? Math.round(b.position.y*10)/10 : 'NaN',
                    vy: Number.isFinite(b.velocity.y) ? Math.round(b.velocity.y*100)/100 : 'NaN',
                    s: b.isStatic ? 'S' : '',
                }));
        });
        console.log(`drop${i+1} +${(k+1)*100}ms:`, JSON.stringify(s));
    }
}

// Print velocity set log
const velLog = await page.evaluate(() => window.__velocityLog);
console.log('\n--- setVelocity calls ---');
velLog.forEach(v => console.log(JSON.stringify(v)));

await browser.close();
