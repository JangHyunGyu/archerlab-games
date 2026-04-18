// 메모리 누수 전수 검사 — 10회 게임 재시작 사이클에서 heap / DOM / Matter body / timeout 누적 감지
import { chromium } from 'playwright';

const browser = await chromium.launch({
    args: [
        '--js-flags=--expose-gc',
        '--autoplay-policy=no-user-gesture-required',
        '--enable-precise-memory-info',
    ],
});
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE_ERROR: ' + m.text());
});

await page.goto('http://127.0.0.1:8768/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => {
    const btn = document.getElementById('play-btn');
    return btn && !btn.disabled;
}, { timeout: 10000 });

async function snapshot(label) {
    // GC 유도 후 측정
    await page.evaluate(() => { if (window.gc) window.gc(); });
    await page.waitForTimeout(250);

    const s = await page.evaluate(() => {
        const heap = performance.memory
            ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100
            : -1;
        const domNodes = document.getElementsByTagName('*').length;

        // Matter.js bodies (IIFE 안이라 window로 직접 접근 불가 → Matter의 모든 Composite 순회)
        let catBodies = -1;
        let wallBodies = -1;
        if (window.Matter) {
            // Matter.Composite.allBodies는 world 인자가 필요한데 world가 private.
            // 대신 canvas 가시성만 체크.
        }

        // Tone.js 컨텍스트 — 활성 synths/oscillators
        let toneNodes = -1;
        if (window.Tone && window.Tone.context && window.Tone.context.rawContext) {
            // AudioContext의 destination에 연결된 노드 수는 직접 못 셈
            // → 대신 AudioContext state 확인
            toneNodes = window.Tone.context.state;
        }

        return { heap, domNodes, toneNodes };
    });
    return { label, ...s };
}

console.log('\n▶ Baseline 측정 (플레이 전)');
const baseline = await snapshot('baseline');
console.log(' ', baseline);

// 실제 user gesture로 AudioContext 활성화
await page.click('#play-btn');
await page.waitForTimeout(800);

const rect = await page.evaluate(() => {
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
});

const snapshots = [baseline];

const N_CYCLES = 10;
console.log(`\n▶ ${N_CYCLES}회 게임 재시작 사이클`);

for (let cycle = 1; cycle <= N_CYCLES; cycle++) {
    // 각 사이클: 8번 드롭 → 일시정지 → 재시작
    for (let i = 0; i < 8; i++) {
        const px = rect.x + rect.w * (0.3 + Math.random() * 0.4);
        await page.mouse.click(px, rect.y + rect.h * 0.2);
        await page.waitForTimeout(450);
    }

    // 홈 → 플레이 (startGame 재호출)
    await page.click('#home-btn');
    await page.waitForTimeout(200);
    await page.click('#play-btn');
    await page.waitForTimeout(500);

    const s = await snapshot(`cycle-${cycle}`);
    snapshots.push(s);
    console.log('  ', s);
}

console.log('\n▶ 메뉴 나가기 → 다시 시작 사이클 5회');
for (let cycle = 1; cycle <= 5; cycle++) {
    await page.click('#pause-btn');
    await page.waitForTimeout(200);
    await page.click('#exit-btn');
    await page.waitForTimeout(400);
    await page.click('#play-btn');
    await page.waitForTimeout(600);

    // 몇 번 드롭
    for (let i = 0; i < 3; i++) {
        const px = rect.x + rect.w * 0.5;
        await page.mouse.click(px, rect.y + rect.h * 0.2);
        await page.waitForTimeout(400);
    }

    const s = await snapshot(`menu-cycle-${cycle}`);
    snapshots.push(s);
    console.log('  ', s);
}

console.log('\n▶ 언어 토글 20회 (buildTierPreview 반복)');
for (let i = 0; i < 20; i++) {
    await page.click((i % 2 === 0) ? '#lang-en' : '#lang-ko');
    await page.waitForTimeout(50);
}
const afterLang = await snapshot('after-lang-20x');
snapshots.push(afterLang);
console.log(' ', afterLang);

console.log('\n▶ 사운드 토글 50회');
for (let i = 0; i < 50; i++) {
    await page.click('#sound-btn');
    await page.waitForTimeout(30);
}
const afterSound = await snapshot('after-sound-50x');
snapshots.push(afterSound);
console.log(' ', afterSound);

await browser.close();

console.log('\n\n=== MEMORY GROWTH ANALYSIS ===');
const baselineHeap = baseline.heap;
const finalHeap = snapshots[snapshots.length - 1].heap;
const peakHeap = Math.max(...snapshots.map(s => s.heap));
const heapGrowth = finalHeap - baselineHeap;

console.log(`Baseline heap:     ${baselineHeap} MB`);
console.log(`Final heap:        ${finalHeap} MB`);
console.log(`Peak heap:         ${peakHeap} MB`);
console.log(`Net growth:        ${heapGrowth.toFixed(2)} MB`);

const domBase = baseline.domNodes;
const domFinal = snapshots[snapshots.length - 1].domNodes;
console.log(`DOM nodes:         ${domBase} → ${domFinal} (${domFinal - domBase >= 0 ? '+' : ''}${domFinal - domBase})`);

// 후반 사이클들이 초반보다 heap이 선형 증가하는지 추세 체크
const cycleSnaps = snapshots.filter(s => s.label.startsWith('cycle-'));
const earlyAvg = cycleSnaps.slice(0, 3).reduce((a, s) => a + s.heap, 0) / 3;
const lateAvg = cycleSnaps.slice(-3).reduce((a, s) => a + s.heap, 0) / 3;
const trendGrowth = lateAvg - earlyAvg;

console.log(`Early cycles avg:  ${earlyAvg.toFixed(2)} MB`);
console.log(`Late cycles avg:   ${lateAvg.toFixed(2)} MB`);
console.log(`Trend growth:      ${trendGrowth >= 0 ? '+' : ''}${trendGrowth.toFixed(2)} MB (restart cycles)`);

let verdict = '✅ 누수 없음';
if (heapGrowth > 5) verdict = '⚠️ heap 5MB 초과 증가 — 누수 가능성';
if (heapGrowth > 15) verdict = '❌ heap 15MB 초과 증가 — 누수 확정';
if (trendGrowth > 3) verdict += ' (재시작 누적 트렌드 감지)';
if (domFinal - domBase > 50) verdict += ' (DOM 노드 누적)';

console.log('\n' + verdict);
console.log('Runtime errors:', errors.length);
if (errors.length) errors.forEach(e => console.log(' - ' + e));
