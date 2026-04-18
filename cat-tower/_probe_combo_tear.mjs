// Combo 연쇄 시 사운드 찢어짐 재현 검증.
// 브라우저의 OfflineAudioContext를 쓸 수 없고 Tone은 실시간 AudioContext라
// 대신 AnalyserNode로 limiter 출력 peak를 샘플링해서 clipping/포화 여부를 추정한다.
// 수치 지표: maxPeak(리미터 출력 최대치), clipRatio(0dB 근처 붙은 샘플 비율).
// 기준: limiter threshold=-1dB, 정상이면 maxPeak ~0.89 (=-1dBFS). 그 이상이면 포화.
import { chromium } from 'playwright';

const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 440, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', e => console.log('PAGEERROR:', e.message));

await page.goto('http://127.0.0.1:8768/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => {
    const btn = document.getElementById('play-btn');
    return btn && !btn.disabled;
}, { timeout: 10000 });
await page.click('#play-btn');
await page.waitForTimeout(500);

// Tone.Destination 앞단에 analyser 삽입
await page.evaluate(() => {
    const T = window.Tone;
    window.__analyser = T.context.createAnalyser();
    window.__analyser.fftSize = 2048;
    T.Destination.output.connect(window.__analyser);

    window.__samplePeaks = () => {
        const buf = new Float32Array(window.__analyser.fftSize);
        window.__analyser.getFloatTimeDomainData(buf);
        let max = 0, clipped = 0;
        for (const v of buf) {
            const a = Math.abs(v);
            if (a > max) max = a;
            if (a > 0.95) clipped++;  // -0.45dB 이상 근접 → 포화 의심
        }
        return { max, clipRatio: clipped / buf.length };
    };
});

// SoundManager 인스턴스 가져오기 — boot에서 sound = new SoundManager() 후 숨겨져 있음.
// 워커 IIFE 내부 참조 접근 불가라 새 인스턴스 만들어 직접 호출.
console.log('\n▶ 시나리오 A: merge(tier5) → 90ms → combo(2) (로그에서 찢어짐 발생했던 패턴)');
const scenarioA = await page.evaluate(async () => {
    const sm = new window.SoundManager();
    sm.ensureContext();
    await new Promise(r => setTimeout(r, 300));
    const peaks = [];

    sm.playMerge(5);
    const t0 = performance.now();
    // 90ms 동안 샘플링
    for (let i = 0; i < 9; i++) {
        await new Promise(r => setTimeout(r, 10));
        peaks.push(window.__samplePeaks());
    }
    sm.playCombo(2);
    const comboStart = performance.now() - t0;
    // combo 이후 400ms 샘플링
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 10));
        peaks.push(window.__samplePeaks());
    }

    const maxes = peaks.map(p => p.max);
    const clips = peaks.map(p => p.clipRatio);
    return {
        comboStartMs: comboStart.toFixed(1),
        maxPeakOverall: Math.max(...maxes).toFixed(4),
        maxPeakAfterCombo: Math.max(...maxes.slice(9)).toFixed(4),
        clipSamples: clips.filter(c => c > 0).length,
        maxClipRatio: Math.max(...clips).toFixed(4),
    };
});
console.log(' ', scenarioA);

console.log('\n▶ 시나리오 B: 연쇄 콤보 5회 (2→3→4→5→6), 60ms 간격');
const scenarioB = await page.evaluate(async () => {
    const sm = new window.SoundManager();
    sm.ensureContext();
    await new Promise(r => setTimeout(r, 300));
    const peaks = [];

    for (let lv = 2; lv <= 6; lv++) {
        sm.playCombo(lv);
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 10));
            peaks.push(window.__samplePeaks());
        }
    }
    // 꼬리 400ms
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 10));
        peaks.push(window.__samplePeaks());
    }

    const maxes = peaks.map(p => p.max);
    const clips = peaks.map(p => p.clipRatio);
    return {
        maxPeakOverall: Math.max(...maxes).toFixed(4),
        clipSamples: clips.filter(c => c > 0).length,
        maxClipRatio: Math.max(...clips).toFixed(4),
    };
});
console.log(' ', scenarioB);

console.log('\n▶ 시나리오 C: merge(9) → 50ms → combo(3) → 50ms → combo(4) (최악)');
const scenarioC = await page.evaluate(async () => {
    const sm = new window.SoundManager();
    sm.ensureContext();
    await new Promise(r => setTimeout(r, 300));
    const peaks = [];

    sm.playMerge(9);
    await new Promise(r => setTimeout(r, 50));
    sm.playCombo(3);
    await new Promise(r => setTimeout(r, 50));
    sm.playCombo(4);
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 10));
        peaks.push(window.__samplePeaks());
    }

    const maxes = peaks.map(p => p.max);
    const clips = peaks.map(p => p.clipRatio);
    return {
        maxPeakOverall: Math.max(...maxes).toFixed(4),
        clipSamples: clips.filter(c => c > 0).length,
        maxClipRatio: Math.max(...clips).toFixed(4),
    };
});
console.log(' ', scenarioC);

await browser.close();
console.log('\n기준: maxPeak ≤ 0.90 (리미터 -1dB), clipSamples 적을수록 OK');
