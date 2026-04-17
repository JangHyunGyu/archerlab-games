// 사바나 최초 달성 플래시 검증
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', e => errs.push('PAGE: ' + e.message));
page.on('console', m => {
    const t = m.text();
    if (m.type()==='error') errs.push('ERR: ' + t);
    if (t.includes('merge') || t.includes('사바나') || t.includes('legend')) console.log('> ' + t);
});

await page.goto('http://127.0.0.1:8768/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => { const b = document.getElementById('play-btn'); return b && !b.disabled; }, { timeout: 10000 });

// Hook Matter to expose engine
await page.evaluate(() => {
    const orig = Matter.Engine.create;
    Matter.Engine.create = function (...args) { const e = orig.apply(this, args); window.__engine = e; return e; };
});

await page.click('#play-btn');
await page.waitForTimeout(800);

// Directly inject two tier-8 (메인쿤) cats close to each other
// Using Matter directly is too invasive; instead, spawn via the game's createCat by finding it
// Simplest: dispatch tier-8 cats through the Matter API at rest
const result = await page.evaluate(() => {
    const e = window.__engine;
    if (!e) return { ok: false, reason: 'engine not exposed' };
    const TIERS = window.CatAssets.TIERS;
    const tier8 = TIERS[8];
    // r=96이라 서로 >192 떨어뜨려서 초기 겹침 없이 collisionStart 트리거
    const cat1 = Matter.Bodies.circle(100, 400, tier8.radius, {
        restitution: 0.08, friction: 0.55, frictionAir: 0.005,
        density: 0.0012 + 8 * 0.00015, label: 'cat',
    });
    cat1.cat = { tier: 8, merging: false, spawnedAt: performance.now() - 5000, aboveSince: 0 };
    const cat2 = Matter.Bodies.circle(300, 400, tier8.radius, {
        restitution: 0.08, friction: 0.55, frictionAir: 0.005,
        density: 0.0012 + 8 * 0.00015, label: 'cat',
    });
    cat2.cat = { tier: 8, merging: false, spawnedAt: performance.now() - 5000, aboveSince: 0 };
    Matter.World.add(e.world, [cat1, cat2]);
    // 서로 마주 달리게 속도 부여 — 1~2초 내 충돌
    Matter.Body.setVelocity(cat1, { x: 5, y: 0 });
    Matter.Body.setVelocity(cat2, { x: -5, y: 0 });
    return { ok: true, count: Matter.Composite.allBodies(e.world).filter(b=>b.label==='cat').length };
});
console.log('injected:', result);

await page.waitForTimeout(2500);

// Check if legend flash appeared (has class 'legend pop')
const flashState = await page.evaluate(() => {
    const el = document.getElementById('combo-flash');
    return {
        text: el?.textContent,
        classes: el?.className,
        visible: el && window.getComputedStyle(el).opacity > 0,
    };
});
console.log('flash state during:', flashState);

await page.screenshot({ path: 'c:/workspace/test-output/cat-legend.png' });

await page.waitForTimeout(2000);
const afterState = await page.evaluate(() => {
    const el = document.getElementById('combo-flash');
    return { text: el?.textContent, classes: el?.className };
});
console.log('flash state after:', afterState);

await browser.close();

if (errs.length) { console.log('❌ ERRORS:'); errs.forEach(e=>console.log(' ',e)); process.exit(1); }
if (!flashState.text?.includes('사바나')) { console.log('❌ 사바나 플래시 미출현'); process.exit(1); }
if (!flashState.classes?.includes('legend')) { console.log('❌ legend 클래스 없음'); process.exit(1); }
console.log('\n✅ 사바나 최초 달성 플래시 정상 출현');
