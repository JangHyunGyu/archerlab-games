// 프레임 시간 스트레스 프로브 — 장기 플레이 중 실제 버벅임 탐지
// requestAnimationFrame 훅킹으로 매 프레임 dt 수집, heartbeat 로그에서 body 수 파싱
import { chromium } from 'playwright';

const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

const heartbeats = [];
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error') errors.push('CONSOLE_ERROR: ' + text);
    // heartbeat fps=X bodies=Y score=Z 파싱
    const match = text.match(/heartbeat fps=(\d+) bodies=(\d+) score=(\d+)/);
    if (match) heartbeats.push({ fps: +match[1], bodies: +match[2], score: +match[3], t: Date.now() });
});

await page.goto('http://127.0.0.1:8768/index.html', { waitUntil: 'load' });

// requestAnimationFrame 훅킹 — 매 프레임 dt 누적
await page.evaluate(() => {
    window.__frameTimes = [];
    window.__frameTsAt = [];
    let lastT = performance.now();
    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function(cb) {
        return origRaf(function(ts) {
            const now = performance.now();
            const dt = now - lastT;
            lastT = now;
            if (dt < 500) {  // 탭 백그라운드 구간 제외
                window.__frameTimes.push(dt);
                window.__frameTsAt.push(now);
            }
            return cb(ts);
        });
    };
});

await page.waitForFunction(() => !document.getElementById('play-btn').disabled, { timeout: 10000 });

// 플레이 시작 (AudioContext 활성화 + 게임 시작)
await page.click('#play-btn');
await page.waitForTimeout(1000);

const rect = await page.evaluate(() => {
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
});

// frames-so-far 시점 마커
async function mark(label) {
    const v = await page.evaluate(() => ({ n: window.__frameTimes.length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1024/1024*100)/100 : -1 }));
    return { label, frames: v.n, heap: v.heap, hbBody: heartbeats.length ? heartbeats[heartbeats.length-1].bodies : 0 };
}

// 콘솔 로그 타임라인 수집 (히치 주변 이벤트 파악용)
const allConsoleLogs = [];
page.on('console', m => {
    if (m.type() === 'log') allConsoleLogs.push({ t: Date.now(), text: m.text() });
});

const marks = [];
marks.push(await mark('0s-start'));

console.log('\n▶ Phase A: 30초 집중 드롭 (바디 다수 축적)');
const phaseAStart = Date.now();
let dropCount = 0;
while (Date.now() - phaseAStart < 30000) {
    const px = rect.x + rect.w * (0.25 + Math.random() * 0.5);
    await page.mouse.click(px, rect.y + rect.h * 0.1);
    dropCount++;
    await page.waitForTimeout(650); // 드롭 쿨다운 550ms 감안
}
marks.push(await mark('30s-phaseA-end'));
console.log(`  드롭 수: ${dropCount}`);

console.log('\n▶ Phase B: 30초 더 (총 60초)');
const phaseBStart = Date.now();
while (Date.now() - phaseBStart < 30000) {
    const px = rect.x + rect.w * (0.25 + Math.random() * 0.5);
    await page.mouse.click(px, rect.y + rect.h * 0.1);
    dropCount++;
    await page.waitForTimeout(650);
}
marks.push(await mark('60s-phaseB-end'));

console.log('\n▶ Phase C: 15초 더 (총 75초)');
const phaseCStart = Date.now();
while (Date.now() - phaseCStart < 15000) {
    const px = rect.x + rect.w * (0.25 + Math.random() * 0.5);
    await page.mouse.click(px, rect.y + rect.h * 0.1);
    dropCount++;
    await page.waitForTimeout(650);
}
marks.push(await mark('75s-phaseC-end'));
console.log(`  총 드롭 수: ${dropCount}`);

console.log('\n▶ Phase D: 재시작 3회 (매 replay 시 히치 있는지 확인)');
for (let i = 0; i < 3; i++) {
    await page.click('#pause-btn');
    await page.waitForTimeout(250);
    await page.click('#restart-btn');
    await page.waitForTimeout(1000);
    marks.push(await mark(`restart-${i+1}`));
    // 몇 번 드롭
    for (let k = 0; k < 5; k++) {
        const px = rect.x + rect.w * 0.5;
        await page.mouse.click(px, rect.y + rect.h * 0.1);
        await page.waitForTimeout(650);
    }
}
marks.push(await mark('restart-end'));

// 프레임 타임 + heartbeat 수집
const { frameTimes, frameTsAt } = await page.evaluate(() => ({
    frameTimes: window.__frameTimes,
    frameTsAt: window.__frameTsAt,
}));

await browser.close();

console.log('\n\n=== ANALYSIS ===');
console.log(`총 프레임: ${frameTimes.length}`);

function percentile(arr, p) {
    const sorted = [...arr].sort((a,b) => a-b);
    const i = Math.floor(sorted.length * p);
    return sorted[i];
}

// 전체 통계
const all = frameTimes;
console.log('\n[전체 세션]');
console.log(`  평균: ${(all.reduce((a,b)=>a+b,0)/all.length).toFixed(2)}ms`);
console.log(`  p50 : ${percentile(all, 0.50).toFixed(2)}ms`);
console.log(`  p95 : ${percentile(all, 0.95).toFixed(2)}ms`);
console.log(`  p99 : ${percentile(all, 0.99).toFixed(2)}ms`);
console.log(`  max : ${Math.max(...all).toFixed(2)}ms`);

// Hitch 카운트 (33ms=30fps, 50ms=20fps, 100ms=10fps)
const hitch33 = all.filter(d => d > 33).length;
const hitch50 = all.filter(d => d > 50).length;
const hitch100 = all.filter(d => d > 100).length;
console.log(`  hitches >33ms (drop to 30fps): ${hitch33} (${(hitch33/all.length*100).toFixed(2)}%)`);
console.log(`  hitches >50ms (drop to 20fps): ${hitch50} (${(hitch50/all.length*100).toFixed(2)}%)`);
console.log(`  hitches >100ms              : ${hitch100}`);

// Phase별 비교 (초기 vs 후반)
// 마크 프레임 수로 구간 분할
const seg = (start, end) => all.slice(start, end);
const phaseA = seg(marks[0].frames, marks[1].frames);
const phaseC = seg(marks[2].frames, marks[3].frames);

console.log('\n[초반 30초 (Phase A, 바디 적음)]');
console.log(`  프레임: ${phaseA.length}, 평균: ${(phaseA.reduce((a,b)=>a+b,0)/phaseA.length).toFixed(2)}ms, p95: ${percentile(phaseA, 0.95).toFixed(2)}ms, >33ms: ${phaseA.filter(d=>d>33).length}`);

console.log('\n[후반 30초 (Phase C, 바디 다수)]');
console.log(`  프레임: ${phaseC.length}, 평균: ${(phaseC.reduce((a,b)=>a+b,0)/phaseC.length).toFixed(2)}ms, p95: ${percentile(phaseC, 0.95).toFixed(2)}ms, >33ms: ${phaseC.filter(d=>d>33).length}`);

// heartbeat 바디 수 변화
console.log('\n[Heartbeat (FPS + body count)]');
const hbEvery = Math.max(1, Math.floor(heartbeats.length / 10));
heartbeats.forEach((hb, i) => {
    if (i % hbEvery === 0) console.log(`  t=${((hb.t - heartbeats[0].t)/1000).toFixed(0)}s fps=${hb.fps} bodies=${hb.bodies} score=${hb.score}`);
});

// 히치 시점 분석
console.log('\n[히치 시점 분석]');
const hitchList = [];
for (let i = 0; i < frameTimes.length; i++) {
    if (frameTimes[i] > 33) hitchList.push({ idx: i, dt: frameTimes[i], absT: frameTsAt[i] });
}
console.log(`히치 ${hitchList.length}건:`);
const probeStartT = frameTsAt[0] || 0;
hitchList.forEach(h => {
    const tSec = ((h.absT - probeStartT) / 1000).toFixed(1);
    console.log(`  [t=${tSec}s, frame#${h.idx}] dt=${h.dt.toFixed(1)}ms`);
});

// 히치 직전 ±500ms 콘솔 로그 보기 — 어떤 이벤트가 있었는지
console.log('\n[히치 주변 이벤트]');
hitchList.forEach((h, i) => {
    console.log(`\n— 히치 #${i+1} (dt=${h.dt.toFixed(1)}ms) 주변 로그:`);
    // pageperformance.now()와 console log의 Date.now()를 직접 매핑 어려움
    // 대신 히치 frame 인덱스로 대략 "몇 번째 프레임 근처" 파악
});

// 판정
console.log('\n=== VERDICT ===');
const verdictHitches = hitch33 + hitch50 + hitch100;
const phaseAGrow = (phaseC.reduce((a,b)=>a+b,0)/phaseC.length) - (phaseA.reduce((a,b)=>a+b,0)/phaseA.length);

if (verdictHitches === 0) {
    console.log('✅ 스터터 없음 (60fps 유지)');
} else if (hitch100 === 0 && hitch50 < 5) {
    console.log(`🟡 경미한 히치 — 33ms 초과 ${hitch33}회, 50ms 초과 ${hitch50}회 (사용자 체감 가능한 수준)`);
} else {
    console.log(`🔴 명확한 스터터 — 50ms+ 히치 ${hitch50}회, 100ms+ ${hitch100}회`);
}
if (phaseAGrow > 1) console.log(`⚠️ 후반 프레임 시간이 ${phaseAGrow.toFixed(2)}ms 증가 — 바디 축적에 따른 물리 비용 증가 가능성`);

if (errors.length) {
    console.log('\n--- ERRORS ---');
    errors.forEach(e => console.log(' - ' + e));
}
