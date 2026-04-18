// [CT] 로그가 실제로 출력되는지, 에러 자동 감지가 동작하는지 검증
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

const logs = [];
const warns = [];
const errs = [];
page.on('console', m => {
    const text = m.text();
    if (text.includes('[CT]')) logs.push(text);
    else if (text.includes('[CT!]')) warns.push(text);
    else if (text.includes('[CT✖]')) errs.push(text);
});
page.on('pageerror', e => errs.push('PAGE: ' + e.message));

await page.goto('http://127.0.0.1:8768/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => {
    const btn = document.getElementById('play-btn');
    return btn && !btn.disabled;
}, { timeout: 10000 });

await page.click('#play-btn');
await page.waitForTimeout(800);

const rect = await page.evaluate(() => {
    const r = document.getElementById('canvas').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
});
for (let i = 0; i < 3; i++) {
    await page.mouse.click(rect.x + rect.w/2, rect.y + 50);
    await page.waitForTimeout(700);
}
// 홈으로 이탈 후 새 게임 시작 (이전의 pause→restart 플로우 대체)
await page.click('#home-btn');
await page.waitForTimeout(200);
await page.click('#play-btn');
await page.waitForTimeout(600);

await browser.close();

console.log(`\n=== [CT] 로그 ${logs.length}개 ===`);
logs.slice(0, 30).forEach(l => console.log(' ', l));
if (logs.length > 30) console.log(`  ... (+${logs.length - 30} more)`);
console.log(`\n=== [CT!] 경고 ${warns.length}개 ===`);
warns.forEach(w => console.log(' ', w));
console.log(`\n=== [CT✖] 에러 ${errs.length}개 ===`);
errs.forEach(e => console.log(' ', e));

if (errs.length > 0) {
    console.log('\n❌ 에러 발생');
    process.exit(1);
}
if (logs.length < 10) {
    console.log('\n❌ 로그가 충분히 출력되지 않음 (<10)');
    process.exit(1);
}
console.log('\n✅ 로그 시스템 정상 동작');
