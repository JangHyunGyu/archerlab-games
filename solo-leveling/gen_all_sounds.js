/**
 * Solo Leveling — 전체 사운드 200레이어 재생성
 * node gen_all_sounds.js
 */
const fs = require('fs');
const path = require('path');
const RATE = 44100;
const OUT = path.join(__dirname, 'sounds');

// === UTILITIES ===
function mkBuf(dur) { return new Float32Array(Math.ceil(RATE * dur)); }
function noise(len) { const b = new Float32Array(len); for (let i = 0; i < len; i++) b[i] = Math.random() * 2 - 1; return b; }
function bp(b, f, Q) {
    const w = 2 * Math.PI * f / RATE, a = Math.sin(w) / (2 * Q), b0 = a, b2 = -a, a0 = 1 + a, a1 = -2 * Math.cos(w), a2 = 1 - a;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const o = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) { const x = b[i]; o[i] = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = o[i]; }
    return o;
}
function lp(b, f) { const rc = 1 / (2 * Math.PI * f), dt = 1 / RATE, a = dt / (rc + dt); let p = 0; for (let i = 0; i < b.length; i++) { p += a * (b[i] - p); b[i] = p; } return b; }
function hp(b, f) { const rc = 1 / (2 * Math.PI * f), dt = 1 / RATE, a = rc / (rc + dt); let pi = 0, po = 0; for (let i = 0; i < b.length; i++) { const x = b[i]; po = a * (po + x - pi); pi = x; b[i] = po; } return b; }
function writeWav(name, buf) {
    const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length * 2, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(buf.length * 2, 40);
    const d = Buffer.alloc(buf.length * 2);
    for (let i = 0; i < buf.length; i++) d.writeInt16LE(Math.floor(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
    fs.writeFileSync(path.join(OUT, name), Buffer.concat([h, d]));
}
function removeDc(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const dc = sum / Math.max(1, buf.length);
    for (let i = 0; i < buf.length; i++) buf[i] -= dc;
    return buf;
}
function fadeEdges(buf, attackMs = 3, releaseMs = 12) {
    const attack = Math.min(buf.length, Math.floor(RATE * attackMs / 1000));
    const release = Math.min(buf.length, Math.floor(RATE * releaseMs / 1000));
    for (let i = 0; i < attack; i++) {
        const g = i / Math.max(1, attack);
        buf[i] *= g * g;
    }
    for (let i = 0; i < release; i++) {
        const idx = buf.length - 1 - i;
        const g = i / Math.max(1, release);
        buf[idx] *= g * g;
    }
    return buf;
}
function normalizePeak(buf, target = 0.82) {
    let mx = 0; for (let i = 0; i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i]));
    if (mx > 0) for (let i = 0; i < buf.length; i++) buf[i] *= target / mx;
    return buf;
}
function finalize(buf, lpFreq = 8000, hpFreq = 30, sat = 1.6, targetPeak = 0.82) {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * sat) * 0.88;
    if (lpFreq < 20000) lp(buf, lpFreq);
    hp(buf, hpFreq);
    removeDc(buf);
    fadeEdges(buf);
    normalizePeak(buf, targetPeak);
    return buf;
}
// Add N noise bands to buf
function addNoiseBands(buf, count, minF, maxF, minQ, maxQ, envFn, volBase) {
    const len = buf.length;
    for (let b = 0; b < count; b++) {
        const t = b / Math.max(1, count - 1);
        const freq = minF + Math.pow(t, 1.5) * (maxF - minF);
        const Q = minQ + t * (maxQ - minQ);
        const raw = noise(len); const filtered = bp(raw, freq, Q);
        for (let i = 0; i < len; i++) filtered[i] *= envFn(i / len, t) * volBase;
        for (let i = 0; i < len; i++) buf[i] += filtered[i];
    }
}
// Add N sine tones to buf
function addTones(buf, count, freqs, envFn, vol) {
    const len = buf.length;
    for (let b = 0; b < count; b++) {
        const freq = typeof freqs === 'function' ? freqs(b, count) : freqs[b % freqs.length];
        for (let i = 0; i < len; i++) {
            const t = i / RATE, p = i / len;
            buf[i] += Math.sin(2 * Math.PI * freq * t + b * 0.5) * envFn(p, b / count) * vol;
        }
    }
}
// Add N sweep tones
function addSweeps(buf, count, startFn, endFn, peakFn, envFn, vol) {
    const len = buf.length;
    for (let b = 0; b < count; b++) {
        const bt = b / Math.max(1, count - 1);
        const sF = startFn(bt), eF = endFn(bt), pk = peakFn(bt);
        for (let i = 0; i < len; i++) {
            const t = i / RATE, p = i / len;
            const f = p < pk ? sF + (eF - sF) * (p / pk) : eF - (eF - sF * 0.7) * ((p - pk) / (1 - pk));
            buf[i] += Math.sin(2 * Math.PI * f * t + b * 0.6) * envFn(p, bt) * vol;
        }
    }
}

console.log('Generating all sounds (200 layers each)...\n');

// ===================== 1. DAGGER (기본공격 칼 휘두르기) =====================
(function() {
    const DUR = 0.28, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    // 50 wind bands
    addNoiseBands(buf, 50, 200, 4000, 0.6, 2.0,
        (p, bt) => (p < 0.04 ? Math.pow(p / 0.04, 1.5) : 1) * Math.pow(Math.max(0, 1 - p), 1.2 + bt * 2), 0.012);
    // 30 sweeps
    addSweeps(buf, 30, bt => 400 + bt * 80, bt => 1200 + bt * 600, bt => 0.12 + bt * 0.1,
        (p, bt) => (p < 0.03 ? Math.pow(p / 0.03, 2) : 1) * Math.pow(Math.max(0, 1 - p), 1.8), 0.008);
    // 30 arm whoosh (low body)
    addNoiseBands(buf, 30, 100, 600, 0.5, 0.8,
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 2) : p < 0.15 ? 1 : Math.pow(1 - (p - 0.15) / 0.85, 2)), 0.01);
    // 20 metal vibration
    addTones(buf, 20, (b) => 2500 + b * 200, (p) => (p < 0.01 ? p / 0.01 : Math.exp(-p * 22)), 0.005);
    // 20 flutter
    addNoiseBands(buf, 20, 600, 2500, 0.8, 1.5,
        (p, bt) => {
            const wobble = 0.55 + 0.45 * Math.sin(p * Math.PI * 2 * (20 + bt * 10));
            return (p < 0.06 ? Math.pow(p / 0.06, 1.5) : Math.pow(Math.max(0, 1 - p), 1.5)) * wobble;
        }, 0.006);
    // 20 sub body
    addTones(buf, 20, (b) => 50 + b * 10, (p) => (p < 0.05 ? Math.pow(p / 0.05, 1) : Math.pow(1 - p, 2.5)), 0.01);
    // 15 doppler
    addTones(buf, 15, (b) => 800 + b * 100,
        (p) => (p < 0.06 ? p / 0.06 : Math.pow(Math.max(0, 1 - p * 0.9), 2)), 0.005);
    // 15 reverb
    addNoiseBands(buf, 15, 200, 1500, 0.4, 0.8,
        (p) => (p < 0.1 ? Math.pow(p / 0.1, 0.5) : Math.pow(1 - p, 0.8)), 0.004);
    finalize(buf, 5500, 40);
    writeWav('dagger.wav', buf);
    console.log('  dagger.wav ✓');
})();

// ===================== 2. DAGGER_THROW (단검 투척) =====================
(function() {
    const DUR = 0.35, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addNoiseBands(buf, 50, 200, 3500, 0.6, 1.8,
        (p, bt) => (p < 0.04 ? Math.pow(p / 0.04, 1.5) : 1) * Math.pow(Math.max(0, 1 - p), 1.2 + bt * 1.8), 0.011);
    addSweeps(buf, 30, bt => 400 + bt * 60, bt => 1600 + bt * 80, bt => 0.1 + bt * 0.08,
        (p) => (p < 0.03 ? Math.pow(p / 0.03, 2) : 1) * Math.pow(Math.max(0, 1 - p), 1.8), 0.008);
    addNoiseBands(buf, 30, 100, 600, 0.5, 0.7,
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 2) : p < 0.15 ? 1 : Math.pow(1 - (p - 0.15) / 0.85, 2)), 0.009);
    addNoiseBands(buf, 20, 600, 2500, 0.8, 1.5,
        (p, bt) => {
            const wobble = 0.55 + 0.45 * Math.sin(p * Math.PI * 2 * (20 + bt * 8));
            return (p < 0.06 ? Math.pow(p / 0.06, 1.5) : Math.pow(Math.max(0, 1 - p), 1.5)) * wobble;
        }, 0.006);
    addTones(buf, 20, (b) => 2000 + b * 250, (p) => (p < 0.01 ? p / 0.01 : Math.exp(-p * 20)), 0.005);
    addTones(buf, 20, (b) => 50 + b * 10, (p) => (p < 0.05 ? Math.pow(p / 0.05, 1) : Math.pow(1 - p, 2.5)), 0.008);
    addTones(buf, 15, (b) => 700 + b * 120,
        (p) => (p < 0.08 ? p / 0.08 : Math.pow(Math.max(0, 1 - p * 0.9), 2)), 0.005);
    addNoiseBands(buf, 15, 150, 1200, 0.4, 0.7,
        (p) => (p < 0.1 ? Math.pow(p / 0.1, 0.5) : Math.pow(1 - p, 0.8)), 0.004);
    finalize(buf, 5500, 40);
    writeWav('dagger_throw.wav', buf);
    console.log('  dagger_throw.wav ✓');
})();

// ===================== 3. HIT (적 타격) =====================
(function() {
    const DUR = 0.15, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addNoiseBands(buf, 50, 100, 2000, 0.4, 1.2,
        (p) => (p < 0.005 ? p / 0.005 : Math.exp(-p * 14)), 0.016);
    addTones(buf, 40, (b) => 80 + b * 15, (p) => (p < 0.003 ? p / 0.003 : Math.exp(-p * 12)), 0.012);
    addNoiseBands(buf, 40, 500, 3000, 0.8, 1.5,
        (p) => (p < 0.003 ? p / 0.003 : Math.exp(-p * 18)), 0.008);
    addNoiseBands(buf, 30, 1500, 5000, 1.5, 2.5,
        (p) => (p < 0.002 ? p / 0.002 : Math.exp(-p * 25)), 0.005);
    addTones(buf, 20, (b) => 40 + b * 8, (p) => (p < 0.004 ? p / 0.004 : Math.exp(-p * 10)), 0.015);
    addNoiseBands(buf, 20, 200, 800, 0.5, 0.8,
        (p) => (p < 0.01 ? p / 0.01 : Math.pow(1 - p, 1.5)), 0.006);
    finalize(buf, 5000, 30, 2.0);
    writeWav('hit.wav', buf);
    console.log('  hit.wav ✓');
})();

// ===================== 4. KILL (적 처치) =====================
(function() {
    const DUR = 0.25, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addNoiseBands(buf, 40, 80, 1500, 0.4, 1.0,
        (p) => (p < 0.008 ? p / 0.008 : Math.exp(-p * 8)), 0.014);
    addTones(buf, 40, (b) => 60 + b * 12, (p) => (p < 0.005 ? p / 0.005 : Math.exp(-p * 6)), 0.01);
    addNoiseBands(buf, 30, 300, 2000, 0.6, 1.2,
        (p) => (p < 0.01 ? p / 0.01 : Math.pow(1 - p, 2)), 0.008);
    // dissolve particles
    addNoiseBands(buf, 30, 1000, 4000, 1.0, 2.0,
        (p) => (p < 0.05 ? 0 : Math.pow((p - 0.05) / 0.95, 0.5) * Math.pow(1 - p, 1.5)), 0.005);
    addTones(buf, 20, (b) => 200 + b * 30,
        (p) => (p < 0.02 ? p / 0.02 : Math.pow(1 - p, 1.8)), 0.006);
    addNoiseBands(buf, 20, 100, 600, 0.3, 0.6,
        (p) => Math.pow(1 - p, 1), 0.004);
    addTones(buf, 20, (b) => 30 + b * 5, (p) => (p < 0.01 ? p / 0.01 : Math.pow(1 - p, 2.5)), 0.012);
    finalize(buf, 4500, 35, 1.45, 0.78);
    writeWav('kill.wav', buf);
    console.log('  kill.wav ✓');
})();

// ===================== 5. PLAYER_HIT (플레이어 피격) =====================
(function() {
    const DUR = 0.35, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addNoiseBands(buf, 50, 80, 500, 0.4, 0.8,
        (p) => (p < 0.01 ? Math.pow(p / 0.01, 1.5) : Math.exp(-p * 10)), 0.016);
    addNoiseBands(buf, 40, 300, 1500, 0.7, 1.2,
        (p) => (p < 0.005 ? p / 0.005 : Math.exp(-p * 15)), 0.012);
    addTones(buf, 30, (b) => 30 + b * 4, (p) => (p < 0.008 ? p / 0.008 : Math.exp(-p * 8)), 0.018);
    addNoiseBands(buf, 20, 1000, 3000, 1.2, 1.8,
        (p) => (p < 0.003 ? p / 0.003 : Math.exp(-p * 20)), 0.008);
    addTones(buf, 20, (b) => 150 + b * 40,
        (p) => (p < 0.02 ? p / 0.02 : Math.pow(1 - p, 2)), 0.008);
    addTones(buf, 15, (b) => 200 + b * 50,
        (p) => { if (p < 0.03) return 0; const pp = (p - 0.03) / 0.97; return (pp < 0.02 ? pp / 0.02 : Math.exp(-pp * 12)); }, 0.007);
    addNoiseBands(buf, 15, 60, 300, 0.3, 0.5,
        (p) => Math.pow(1 - p, 1.5), 0.005);
    addTones(buf, 10, (b) => 60 + b * 15,
        (p) => { const e = Math.exp(-Math.pow(p - 0.03, 2) * 5000); return e; }, 0.02);
    finalize(buf, 4000, 25, 2.0);
    writeWav('playerHit.wav', buf);
    console.log('  playerHit.wav ✓');
})();

// ===================== 6. SLASH (그림자 베기) =====================
(function() {
    const DUR = 0.3, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addNoiseBands(buf, 50, 300, 5000, 0.7, 2.0,
        (p, bt) => (p < 0.03 ? Math.pow(p / 0.03, 1.5) : 1) * Math.pow(Math.max(0, 1 - p), 1.5 + bt * 1.5), 0.01);
    addSweeps(buf, 40, bt => 500 + bt * 100, bt => 2000 + bt * 500, bt => 0.15 + bt * 0.1,
        (p) => (p < 0.02 ? Math.pow(p / 0.02, 2) : 1) * Math.pow(Math.max(0, 1 - p), 1.5), 0.007);
    // shadow energy
    addTones(buf, 30, (b) => 100 + b * 20,
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 2) : p < 0.2 ? 1 : Math.pow(1 - (p - 0.2) / 0.8, 2)), 0.008);
    addNoiseBands(buf, 30, 150, 800, 0.5, 0.8,
        (p) => (p < 0.04 ? Math.pow(p / 0.04, 2) : p < 0.12 ? 1 : Math.pow(1 - (p - 0.12) / 0.88, 2)), 0.009);
    addNoiseBands(buf, 25, 2000, 6000, 1.5, 2.5,
        (p) => (p < 0.02 ? p / 0.02 : Math.exp(-p * 12)), 0.005);
    addTones(buf, 25, (b) => 50 + b * 8, (p) => (p < 0.04 ? Math.pow(p / 0.04, 1) : Math.pow(1 - p, 2)), 0.01);
    finalize(buf, 5600, 80, 1.5, 0.68);
    writeWav('slash.wav', buf);
    console.log('  slash.wav ✓');
})();

// ===================== 7. AUTHORITY (군주의 권능) =====================
(function() {
    const DUR = 0.8, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addTones(buf, 40, (b) => 30 + b * 5,
        (p) => (p < 0.15 ? Math.pow(p / 0.15, 1.5) : p < 0.25 ? 1 : Math.pow(1 - (p - 0.25) / 0.75, 1.8)), 0.012);
    addNoiseBands(buf, 40, 100, 800, 0.4, 0.8,
        (p) => (p < 0.15 ? Math.pow(p / 0.15, 3) : p < 0.22 ? 1 : Math.exp(-((p - 0.22)) * 8)), 0.014);
    addNoiseBands(buf, 30, 300, 1500, 0.7, 1.0,
        (p) => (p < 0.1 ? Math.pow(p / 0.1, 2) : p < 0.3 ? 1 : Math.pow(1 - (p - 0.3) / 0.7, 1.5)), 0.01);
    addSweeps(buf, 20, () => 60, bt => 200 + bt * 100, () => 0.2,
        (p) => (p > 0.2 ? 0 : Math.pow(p / 0.2, 2)), 0.015);
    addTones(buf, 20, (b) => [65, 98, 131, 196][b % 4],
        (p) => (p > 0.22 ? 0 : Math.pow(p / 0.22, 3)), 0.012);
    addTones(buf, 15, (b) => 400 + b * 60,
        (p) => { if (p < 0.18) return 0; const pp = (p - 0.18) / 0.82; return Math.pow(1 - pp, 2); }, 0.008);
    addNoiseBands(buf, 15, 40, 200, 0.3, 0.5,
        (p) => (p < 0.15 ? Math.pow(p / 0.15, 0.5) : Math.pow(1 - (p - 0.15) / 0.85, 2.5)), 0.015);
    addNoiseBands(buf, 10, 1500, 4000, 1.5, 2.5,
        (p) => (p < 0.18 ? 0 : p < 0.23 ? Math.pow((p - 0.18) / 0.05, 2) : Math.exp(-(p - 0.23) * 12)), 0.006);
    addNoiseBands(buf, 10, 100, 500, 0.3, 0.5,
        (p) => (p < 0.25 ? 0 : Math.pow(1 - (p - 0.25) / 0.75, 0.6)), 0.005);
    finalize(buf, 5000, 20);
    writeWav('authority.wav', buf);
    console.log('  authority.wav ✓');
})();

// ===================== 8. FEAR (용의 공포) =====================
(function() {
    const DUR = 0.6, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    // dark rumble
    addTones(buf, 40, (b) => 30 + b * 4,
        (p) => (p < 0.1 ? Math.pow(p / 0.1, 2) : Math.pow(1 - p, 1.5)), 0.012);
    // fear noise
    addNoiseBands(buf, 40, 80, 600, 0.4, 0.7,
        (p) => (p < 0.08 ? Math.pow(p / 0.08, 2) : p < 0.3 ? 1 : Math.pow(1 - (p - 0.3) / 0.7, 1.5)), 0.01);
    // dissonant tones (fear/dread)
    addTones(buf, 30, (b) => [55, 58.3, 82.4, 87.3, 110, 116.5][b % 6],
        (p) => (p < 0.15 ? Math.pow(p / 0.15, 1.5) : Math.pow(1 - p, 1.2)), 0.008);
    // descending sweep
    addSweeps(buf, 30, bt => 400 + bt * 50, bt => 80 + bt * 10, bt => 0.05,
        (p) => Math.pow(1 - p, 1.5), 0.006);
    // aura pulse
    addNoiseBands(buf, 25, 200, 1200, 0.5, 1.0,
        (p) => (p < 0.05 ? p / 0.05 : 1) * (0.6 + 0.4 * Math.sin(p * Math.PI * 2 * 4)) * Math.pow(1 - p, 1), 0.007);
    // sub
    addTones(buf, 20, (b) => 20 + b * 3,
        (p) => (p < 0.08 ? Math.pow(p / 0.08, 1) : Math.pow(1 - p, 2)), 0.015);
    addNoiseBands(buf, 15, 300, 800, 0.4, 0.6,
        (p) => Math.pow(1 - p, 0.8), 0.004);
    finalize(buf, 3500, 20);
    writeWav('fear.wav', buf);
    console.log('  fear.wav ✓');
})();

// ===================== 9. XP (경험치 수집) =====================
(function() {
    const DUR = 0.12, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    // bright sparkle tones
    addTones(buf, 60, (b) => 800 + b * 80,
        (p) => (p < 0.01 ? p / 0.01 : Math.exp(-p * 15)), 0.008);
    // ascending chime
    addSweeps(buf, 40, bt => 500 + bt * 100, bt => 2000 + bt * 200, () => 0.5,
        (p) => (p < 0.01 ? p / 0.01 : Math.exp(-p * 12)), 0.006);
    // soft sparkle noise
    addNoiseBands(buf, 40, 2000, 8000, 2.0, 3.0,
        (p) => (p < 0.005 ? p / 0.005 : Math.exp(-p * 20)), 0.004);
    // warm body
    addTones(buf, 30, (b) => 300 + b * 50,
        (p) => (p < 0.01 ? p / 0.01 : Math.exp(-p * 10)), 0.005);
    addTones(buf, 30, (b) => 100 + b * 20,
        (p) => (p < 0.005 ? p / 0.005 : Math.exp(-p * 18)), 0.006);
    finalize(buf, 8000, 100);
    writeWav('xp.wav', buf);
    console.log('  xp.wav ✓');
})();

// ===================== 10. LEVELUP (레벨업) =====================
(function() {
    const DUR = 0.5, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    // ascending major chord arpeggio
    const notes = [261.6, 329.6, 392, 523.3, 659.3, 784];
    addTones(buf, 40, (b) => notes[b % 6] * (1 + Math.floor(b / 6) * 0.001),
        (p, bt) => {
            const delay = bt * 0.08;
            if (p < delay) return 0;
            const pp = (p - delay) / (1 - delay);
            return (pp < 0.05 ? pp / 0.05 : Math.pow(1 - pp, 1.5));
        }, 0.01);
    addNoiseBands(buf, 40, 1000, 6000, 1.5, 3.0,
        (p) => (p < 0.02 ? p / 0.02 : Math.exp(-p * 6)), 0.004);
    addTones(buf, 30, (b) => 130 + b * 20,
        (p) => (p < 0.03 ? Math.pow(p / 0.03, 2) : p < 0.2 ? 1 : Math.pow(1 - (p - 0.2) / 0.8, 1.5)), 0.006);
    // shimmer
    addTones(buf, 30, (b) => 2000 + b * 200,
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 2) : Math.exp(-p * 5)), 0.003);
    // sub warmth
    addTones(buf, 20, (b) => 65 + b * 10,
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 1.5) : Math.pow(1 - p, 2)), 0.008);
    addNoiseBands(buf, 20, 200, 800, 0.4, 0.7,
        (p) => Math.pow(1 - p, 0.8), 0.003);
    addTones(buf, 20, (b) => [523, 659, 784, 1047][b % 4],
        (p) => { if (p < 0.15) return 0; return Math.exp(-(p - 0.15) * 5); }, 0.005);
    finalize(buf, 7000, 50, 1.45, 0.78);
    writeWav('levelup.wav', buf);
    console.log('  levelup.wav ✓');
})();

// ===================== 11. RANKUP (랭크업) =====================
(function() {
    const DUR = 0.8, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    const notes = [130.8, 164.8, 196, 261.6, 329.6, 392, 523.3];
    addTones(buf, 50, (b) => notes[b % 7] * (1 + Math.floor(b / 7) * 0.001),
        (p, bt) => {
            const delay = bt * 0.06;
            if (p < delay) return 0;
            const pp = (p - delay) / (1 - delay);
            return (pp < 0.04 ? pp / 0.04 : Math.pow(1 - pp, 1.2));
        }, 0.008);
    addTones(buf, 40, (b) => 50 + b * 5,
        (p) => (p < 0.1 ? Math.pow(p / 0.1, 2) : Math.pow(1 - p, 2)), 0.008);
    addNoiseBands(buf, 30, 1500, 8000, 2.0, 3.5,
        (p) => (p < 0.02 ? p / 0.02 : Math.exp(-p * 4)), 0.004);
    addNoiseBands(buf, 30, 200, 1000, 0.5, 0.8,
        (p) => (p < 0.08 ? Math.pow(p / 0.08, 2) : Math.pow(1 - p, 1)), 0.005);
    addTones(buf, 25, (b) => 30 + b * 4,
        (p) => (p < 0.08 ? Math.pow(p / 0.08, 1) : Math.pow(1 - p, 2.5)), 0.01);
    addTones(buf, 25, (b) => [784, 988, 1175, 1568][b % 4],
        (p) => { if (p < 0.2) return 0; return Math.exp(-(p - 0.2) * 4); }, 0.004);
    finalize(buf, 7000, 25);
    writeWav('rankup.wav', buf);
    console.log('  rankup.wav ✓');
})();

// ===================== 12. BOSS_APPEAR =====================
(function() {
    const DUR = 0.8, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addTones(buf, 50, (b) => 25 + b * 3,
        (p) => (p < 0.2 ? Math.pow(p / 0.2, 2) : Math.pow(1 - (p - 0.2) / 0.8, 1.5)), 0.012);
    addNoiseBands(buf, 40, 60, 400, 0.3, 0.6,
        (p) => (p < 0.15 ? Math.pow(p / 0.15, 3) : Math.exp(-(p - 0.15) * 5)), 0.012);
    addTones(buf, 30, (b) => [55, 58.3, 65.4, 69.3][b % 4],
        (p) => (p < 0.2 ? Math.pow(p / 0.2, 2) : p < 0.5 ? 1 : Math.pow(1 - (p - 0.5) / 0.5, 1.5)), 0.01);
    addNoiseBands(buf, 30, 200, 1200, 0.5, 1.0,
        (p) => (p < 0.1 ? Math.pow(p / 0.1, 2) : Math.pow(1 - p, 1.2)), 0.008);
    addTones(buf, 25, (b) => 300 + b * 40,
        (p) => { if (p < 0.18) return 0; return Math.pow(1 - (p - 0.18) / 0.82, 2); }, 0.006);
    addNoiseBands(buf, 25, 30, 150, 0.3, 0.4,
        (p) => Math.pow(1 - p, 2), 0.01);
    finalize(buf, 4000, 20);
    writeWav('bossAppear.wav', buf);
    console.log('  bossAppear.wav ✓');
})();

// ===================== 13. BOSS_KILL =====================
(function() {
    const DUR = 1.0, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addNoiseBands(buf, 40, 40, 400, 0.4, 0.7,
        (p) => (p < 0.01 ? p / 0.01 : Math.exp(-p * 6)), 0.016);
    const victory = [130.8, 164.8, 196, 261.6, 329.6, 392];
    addTones(buf, 40, (b) => victory[b % 6],
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 2) : p < 0.3 ? 1 : Math.pow(1 - (p - 0.3) / 0.7, 1.5)), 0.008);
    addSweeps(buf, 30, bt => 100 + bt * 30, bt => 600 + bt * 50, () => 0.4,
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 1.5) : p < 0.5 ? 1 : Math.pow(1 - (p - 0.5) / 0.5, 2)), 0.006);
    addNoiseBands(buf, 30, 2000, 7000, 2, 3,
        (p) => (p < 0.01 ? p / 0.01 : Math.exp(-p * 8)), 0.005);
    addTones(buf, 20, (b) => 25 + b * 4,
        (p) => (p < 0.02 ? p / 0.02 : Math.pow(1 - p, 2)), 0.012);
    addTones(buf, 20, (b) => [523, 659, 784, 1047, 1319][b % 5],
        (p) => { const d = 0.08 + (b => b * 0.04); if (p < 0.08) return 0; return Math.exp(-(p - 0.08) * 6); }, 0.008);
    addNoiseBands(buf, 10, 100, 500, 0.3, 0.5,
        (p) => (p < 0.25 ? 0 : Math.pow(1 - (p - 0.25) / 0.75, 0.7)), 0.005);
    addNoiseBands(buf, 10, 80, 300, 0.3, 0.4,
        (p) => Math.pow(1 - p, 1.5), 0.004);
    finalize(buf, 6000, 20);
    writeWav('bossKill.wav', buf);
    console.log('  bossKill.wav ✓');
})();

// ===================== 14. GAME_OVER =====================
(function() {
    const DUR = 1.2, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addTones(buf, 40, (b) => 20 + b * 3,
        (p) => (p < 0.02 ? Math.pow(p / 0.02, 0.5) : Math.exp(-p * 3)), 0.015);
    addNoiseBands(buf, 40, 60, 400, 0.3, 0.6,
        (p) => Math.pow(p, 0.8) * Math.pow(1 - p, 0.3), 0.01);
    addTones(buf, 30, (b) => { const s = 300 + b * 40; return (p) => s * Math.pow(0.3, p); },
        (p) => (p < 0.05 ? p / 0.05 : Math.pow(1 - p, 1.5)), 0.006);
    addTones(buf, 30, (b) => [65, 69, 98, 139][b % 4],
        (p) => (p < 0.1 ? Math.pow(p / 0.1, 2) : p < 0.6 ? 1 : Math.pow(1 - (p - 0.6) / 0.4, 2)), 0.005);
    addTones(buf, 25, (b) => 3000 + b * 400,
        (p) => Math.pow(p, 2) * Math.pow(1 - p, 0.5), 0.003);
    addNoiseBands(buf, 15, 100, 400, 0.3, 0.5,
        (p) => Math.pow(p, 0.5) * Math.pow(1 - p, 0.5), 0.005);
    addTones(buf, 10, (b) => 40 + b * 5,
        (p) => { let e = 0; for (const beat of [0.05, 0.45]) { const d = p - beat / DUR; if (d > 0 && d < 0.06) e += Math.exp(-d * 40); } return e; }, 0.02);
    addNoiseBands(buf, 10, 30, 100, 0.3, 0.4,
        (p) => (p < 0.1 ? p / 0.1 : Math.pow(1 - p, 2)), 0.008);
    finalize(buf, 5000, 20);
    writeWav('gameOver.wav', buf);
    console.log('  gameOver.wav ✓');
})();

// ===================== 15~21. UTILITY SOUNDS =====================
// ARISE
(function() {
    const DUR = 0.8, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addTones(buf, 50, (b) => 30 + b * 4,
        (p) => (p < 0.3 ? Math.pow(p / 0.3, 2) : Math.pow(1 - (p - 0.3) / 0.7, 1.2)), 0.01);
    addNoiseBands(buf, 40, 80, 500, 0.4, 0.7,
        (p) => (p < 0.2 ? Math.pow(p / 0.2, 3) : p < 0.4 ? 1 : Math.pow(1 - (p - 0.4) / 0.6, 1.5)), 0.01);
    addTones(buf, 30, (b) => [65.4, 77.8, 98, 130.8][b % 4],
        (p) => (p < 0.25 ? Math.pow(p / 0.25, 2) : Math.pow(1 - (p - 0.25) / 0.75, 1.5)), 0.008);
    addSweeps(buf, 30, () => 50, bt => 300 + bt * 80, () => 0.35,
        (p) => (p < 0.35 ? Math.pow(p / 0.35, 3) : Math.pow(1 - (p - 0.35) / 0.65, 2)), 0.008);
    addNoiseBands(buf, 25, 200, 1500, 0.5, 1.0,
        (p) => (p < 0.15 ? Math.pow(p / 0.15, 2) : Math.pow(1 - p, 1)), 0.006);
    addTones(buf, 25, (b) => 20 + b * 3,
        (p) => (p < 0.2 ? Math.pow(p / 0.2, 1) : Math.pow(1 - p, 2.5)), 0.012);
    finalize(buf, 4000, 20);
    writeWav('arise.wav', buf);
    console.log('  arise.wav ✓');
})();

// DUNGEON_BREAK
(function() {
    const DUR = 0.7, len = Math.ceil(RATE * DUR), buf = new Float32Array(len);
    addTones(buf, 50, (b) => 25 + b * 4,
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 1.5) : p < 0.2 ? 1 : Math.pow(1 - (p - 0.2) / 0.8, 1.5)), 0.012);
    addNoiseBands(buf, 50, 80, 600, 0.4, 0.8,
        (p) => (p < 0.05 ? Math.pow(p / 0.05, 2) : Math.exp(-p * 4)), 0.01);
    addTones(buf, 30, (b) => [55, 65.4, 82.4][b % 3],
        (p) => (p < 0.1 ? Math.pow(p / 0.1, 2) : Math.pow(1 - p, 1.2)), 0.01);
    addNoiseBands(buf, 30, 300, 2000, 0.6, 1.2,
        (p) => (p < 0.08 ? Math.pow(p / 0.08, 2) : Math.pow(1 - p, 1.5)), 0.007);
    addTones(buf, 20, (b) => 1000 + b * 200,
        (p) => (p < 0.03 ? p / 0.03 : Math.exp(-p * 8)), 0.005);
    addTones(buf, 20, (b) => 15 + b * 2,
        (p) => Math.pow(1 - p, 2), 0.015);
    finalize(buf, 4500, 15);
    writeWav('dungeonBreak.wav', buf);
    console.log('  dungeonBreak.wav ✓');
})();

// POTION, SELECT, QUEST, SYSTEM, WARNING — lighter utility sounds
for (const [name, dur, cfg] of [
    ['potion.wav', 0.25, { baseF: 400, topF: 2000, bright: true }],
    ['select.wav', 0.1, { baseF: 600, topF: 3000, bright: true }],
    ['quest.wav', 0.35, { baseF: 200, topF: 1500, bright: false }],
    ['system.wav', 0.15, { baseF: 300, topF: 2000, bright: true }],
    ['warning.wav', 0.3, { baseF: 80, topF: 800, bright: false }],
]) {
    const len = Math.ceil(RATE * dur), buf = new Float32Array(len);
    addNoiseBands(buf, 40, cfg.baseF, cfg.topF, 0.5, 1.5,
        (p) => (p < 0.02 ? p / 0.02 : Math.exp(-p * (cfg.bright ? 8 : 5))), 0.012);
    addTones(buf, 40, (b) => cfg.baseF + b * ((cfg.topF - cfg.baseF) / 40),
        (p) => (p < 0.01 ? p / 0.01 : Math.exp(-p * (cfg.bright ? 10 : 6))), 0.008);
    if (cfg.bright) {
        addTones(buf, 40, (b) => cfg.topF + b * 100,
            (p) => (p < 0.005 ? p / 0.005 : Math.exp(-p * 15)), 0.004);
    } else {
        addTones(buf, 40, (b) => 30 + b * 5,
            (p) => (p < 0.03 ? Math.pow(p / 0.03, 1.5) : Math.pow(1 - p, 2)), 0.01);
    }
    addNoiseBands(buf, 40, cfg.baseF * 0.5, cfg.topF * 0.5, 0.3, 0.7,
        (p) => Math.pow(1 - p, 1.5), 0.004);
    addTones(buf, 20, (b) => cfg.baseF * 0.3 + b * 10,
        (p) => (p < 0.01 ? p / 0.01 : Math.pow(1 - p, 2.5)), 0.006);
    addNoiseBands(buf, 20, cfg.topF, cfg.topF * 2, 2, 3,
        (p) => (p < 0.005 ? p / 0.005 : Math.exp(-p * 20)), 0.003);
    finalize(buf, cfg.bright ? 8000 : 4000, cfg.bright ? 80 : 30);
    writeWav(name, buf);
    console.log('  ' + name + ' ✓');
}

console.log('\nAll 21 sounds regenerated with 200 layers!');
