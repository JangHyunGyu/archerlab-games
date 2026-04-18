// 이어서 하기(resume) 기능 검증
import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE_ERROR: ' + m.text());
});

const BASE = 'http://127.0.0.1:8768/index.html';

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => {
    const btn = document.getElementById('play-btn');
    return btn && !btn.disabled;
}, { timeout: 10000 });

// 초기 상태: 저장 없음 → 이어서 버튼 숨김
const initialHidden = await page.evaluate(() =>
    document.getElementById('resume-btn-menu').classList.contains('hidden')
);
console.log('1) Fresh start, resume 버튼 hidden:', initialHidden);
if (!initialHidden) { errors.push('resume 버튼이 처음부터 보임'); }

// 게임 시작 → 고양이 몇 개 드롭
await page.click('#play-btn');
await page.waitForTimeout(500);

const canvas = await page.$('#canvas');
const box = await canvas.boundingBox();
async function dropAt(xRatio) {
    await page.mouse.move(box.x + box.width * xRatio, box.y + 100);
    await page.waitForTimeout(50);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(700); // drop cooldown
}

for (let i = 0; i < 5; i++) {
    await dropAt(0.2 + (i % 3) * 0.25);
}
await page.waitForTimeout(2000); // 물리 정착 + 자동저장(매 1.5초)

// score 확인
const mid = await page.evaluate(() => document.getElementById('score').textContent);
console.log('2) 드롭 후 점수:', mid);

// localStorage 저장 확인
const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('cat-tower.save.v1');
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { cats: data.cats.length, score: data.score, nextTier: data.nextTier, hasCurrent: !!data.current };
});
console.log('3) localStorage 저장:', saved);
if (!saved || saved.cats === 0) { errors.push('저장에 고양이가 없음'); }

// 메뉴로 복귀 — 홈 버튼 한 번으로 바로 이탈
await page.click('#home-btn');
await page.waitForTimeout(400);

// resume 버튼 보여야 함
const resumeVisible = await page.evaluate(() => {
    const b = document.getElementById('resume-btn-menu');
    return { hidden: b.classList.contains('hidden'), text: b.textContent };
});
console.log('4) 메뉴 복귀 후 resume 버튼:', resumeVisible);
if (resumeVisible.hidden) { errors.push('resume 버튼이 안 보임'); }

// 이어서 하기 → 점수 보존되어야 함
await page.click('#resume-btn-menu');
await page.waitForTimeout(800);

const resumedScore = await page.evaluate(() => document.getElementById('score').textContent);
const resumedCats = await page.evaluate(() => {
    const world = window.__CT_DEBUG_world;
    return world ? null : 'no-debug-exposed';
});
console.log('5) 이어서 후 점수:', resumedScore, '(이전:', mid, ')');
if (resumedScore !== mid) { errors.push(`점수 불일치: 이어서 전 ${mid}, 후 ${resumedScore}`); }

// 페이지 리로드 → resume 여전히 가능
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => {
    const btn = document.getElementById('play-btn');
    return btn && !btn.disabled;
}, { timeout: 10000 });
const afterReload = await page.evaluate(() => {
    const b = document.getElementById('resume-btn-menu');
    return { hidden: b.classList.contains('hidden'), text: b.textContent };
});
console.log('6) 리로드 후 resume 버튼:', afterReload);

// 플레이 버튼 클릭(새 게임) → 기존 저장 위에 덮어쓰기는 자동저장에 맡김 → 1.5s 기다렸다 확인
await page.click('#play-btn');
await page.waitForTimeout(2500);
const afterNewGameSave = await page.evaluate(() => {
    const raw = localStorage.getItem('cat-tower.save.v1');
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { cats: d.cats.length, score: d.score };
});
console.log('7) 새 게임 1.5s 후 저장(빈 필드 + current 아님):', afterNewGameSave);

await browser.close();

if (errors.length) {
    console.log('\n❌ FAIL');
    errors.forEach(e => console.log('  ' + e));
    process.exit(1);
}
console.log('\n✅ PASS: 이어서 하기 기능 정상');
