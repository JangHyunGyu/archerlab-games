// i18n 토글 + 랭킹 버튼 + 게임오버 제출 UI 검증
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', e => errs.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type()==='error') errs.push('ERR: ' + m.text()); });

// 랭킹 API 요청은 원격에 실제 쏘지 말고 가짜 응답으로 가로챔 — 로컬 테스트 목적
await page.route('**/cat-tower/top**', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, rows: [
            { nickname: 'alpha', score: 99999 },
            { nickname: 'bravo', score: 50000 },
            { nickname: 'charlie', score: 12345 },
        ]}),
    });
});
await page.route('**/cat-tower/submit', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, updated: true, score: 100 }),
    });
});

await page.goto('http://127.0.0.1:8767/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => { const b = document.getElementById('play-btn'); return b && !b.disabled; }, { timeout: 10000 });
await page.waitForTimeout(300);

// 1. ArcherLab 링크 존재
const arch = await page.evaluate(() => {
    const a = document.querySelector('.archerlab-btn');
    return a ? { href: a.href, text: a.textContent.trim(), visible: a.offsetWidth > 0 } : null;
});
console.log('ArcherLab btn:', arch);
if (!arch || !arch.href.startsWith('https://archerlab.dev')) { console.log('❌ ArcherLab 링크 부재'); process.exit(1); }

// 2. 기본 언어 = ko (또는 navigator.language 기반)
let state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    playBtn: document.getElementById('play-btn').textContent,
    tagline: document.querySelector('.tagline').textContent,
    koActive: document.getElementById('lang-ko').classList.contains('active'),
    enActive: document.getElementById('lang-en').classList.contains('active'),
}));
console.log('초기 상태:', state);

// 3. EN으로 전환
await page.click('#lang-en');
await page.waitForTimeout(300);
state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    playBtn: document.getElementById('play-btn').textContent,
    tagline: document.querySelector('.tagline').textContent,
    rankBtn: document.getElementById('rank-btn').textContent,
    howBtn: document.getElementById('how-btn').textContent,
    koActive: document.getElementById('lang-ko').classList.contains('active'),
    enActive: document.getElementById('lang-en').classList.contains('active'),
}));
console.log('EN 전환 후:', state);
if (state.lang !== 'en' || !state.playBtn.match(/Play/i)) { console.log('❌ EN 전환 실패'); process.exit(1); }
if (!state.enActive || state.koActive) { console.log('❌ 언어 버튼 active 동기화 실패'); process.exit(1); }

await page.screenshot({ path: 'c:/workspace/test-output/cat-i18n-en.png' });

// 4. KO로 되돌림
await page.click('#lang-ko');
await page.waitForTimeout(200);
state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    playBtn: document.getElementById('play-btn').textContent,
}));
console.log('KO 복귀:', state);
if (state.lang !== 'ko' || !state.playBtn.match(/플레이/)) { console.log('❌ KO 복귀 실패'); process.exit(1); }

// 5. 랭킹 버튼이 disabled 아님 + 클릭 시 모달 + TOP3 표시
const rankDisabled = await page.evaluate(() => document.getElementById('rank-btn').disabled);
if (rankDisabled) { console.log('❌ 랭킹 버튼이 여전히 disabled'); process.exit(1); }

await page.click('#rank-btn');
await page.waitForTimeout(600);
const rankState = await page.evaluate(() => ({
    modalVisible: !document.getElementById('rank-modal').classList.contains('hidden'),
    rowCount: document.querySelectorAll('#rank-content .rank-row').length,
    top1Name: document.querySelector('#rank-content .rank-row.top1 .rank-name')?.textContent,
}));
console.log('랭킹 모달:', rankState);
if (!rankState.modalVisible || rankState.rowCount !== 3 || rankState.top1Name !== 'alpha') {
    console.log('❌ 랭킹 모달/데이터 불일치'); process.exit(1);
}
await page.screenshot({ path: 'c:/workspace/test-output/cat-rank-modal.png' });
await page.click('#rank-close');
await page.waitForTimeout(200);

// 6. 게임 플레이 → 게임오버 강제 → 닉네임 입력 → 제출
await page.click('#play-btn');
await page.waitForTimeout(500);
// 직접 triggerGameOver 상황 구현 — 점수 수동 세팅은 private이라 API 통해
// 간단히: 직접 gameover-modal을 보여주고 점수를 넣는 방식은 전역 노출 함수가 없으므로
// UI 검증만: 게임오버 모달 내 rank-submit-row의 존재와 구조 확인
await page.evaluate(() => {
    // 내부 상태 조작은 안 되지만, 모달 DOM 자체는 볼 수 있음 — hidden 해제
    const mod = document.getElementById('gameover-modal');
    mod.classList.remove('hidden');
    // rank-submit-row는 점수가 0이면 숨어있으므로 강제 표시
    document.getElementById('rank-submit-row').style.display = '';
    document.getElementById('final-score').textContent = '12,345';
});
await page.waitForTimeout(200);
const goState = await page.evaluate(() => ({
    hasNickInput: !!document.getElementById('nickname-input'),
    hasSubmitBtn: !!document.getElementById('submit-rank-btn'),
    submitLabel: document.getElementById('submit-rank-btn').textContent,
    nickPlaceholder: document.getElementById('nickname-input').placeholder,
}));
console.log('게임오버 UI:', goState);
if (!goState.hasNickInput || !goState.hasSubmitBtn) { console.log('❌ 랭킹 제출 UI 부재'); process.exit(1); }

await page.screenshot({ path: 'c:/workspace/test-output/cat-gameover-submit.png' });

await browser.close();

if (errs.length) { console.log('❌ ERRORS:'); errs.forEach(e=>console.log(' ',e)); process.exit(1); }
console.log('\n✅ i18n + 랭킹 UI 정상');
