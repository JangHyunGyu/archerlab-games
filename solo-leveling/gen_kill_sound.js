/**
 * kill.wav 재생성 — 고주파 제거, 저음 묵직한 임팩트 사운드
 * node gen_kill_sound.js
 */
const fs = require('fs');
const path = require('path');

const RATE = 44100;

function makeBuffer(dur) { return new Float32Array(Math.ceil(RATE * dur)); }
function env(t, a, d, s, r, dur) {
    if (t < a) return t / a;
    if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
    if (t < dur - r) return s;
    return s * ((dur - t) / r);
}
function mix(a, b, w = 0.5) {
    const out = new Float32Array(Math.max(a.length, b.length));
    for (let i = 0; i < out.length; i++) out[i] = (a[i] || 0) * (1 - w) + (b[i] || 0) * w;
    return out;
}
function mixMulti(buffers, weights) {
    const len = Math.max(...buffers.map(b => b.length));
    const out = new Float32Array(len);
    for (let b = 0; b < buffers.length; b++) {
        const w = weights[b];
        for (let i = 0; i < buffers[b].length; i++) out[i] += buffers[b][i] * w;
    }
    return out;
}
function normalize(buf, peak = 0.92) {
    let max = 0;
    for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
    if (max > 0) { const s = peak / max; for (let i = 0; i < buf.length; i++) buf[i] *= s; }
    return buf;
}
function lpf(buf, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = dt / (rc + dt);
    let prev = 0;
    for (let i = 0; i < buf.length; i++) { prev += a * (buf[i] - prev); buf[i] = prev; }
    return buf;
}
function saturate(buf, amount = 2) {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * amount);
    return buf;
}

function genKillSound() {
    const dur = 0.28;
    const len = Math.ceil(RATE * dur);

    // Layer 1: Low thud (membrane-like) — freq drops from 200Hz to 40Hz
    const thud = makeBuffer(dur);
    for (let i = 0; i < len; i++) {
        const t = i / RATE;
        const e = env(t, 0.001, 0.06, 0.15, 0.12, dur);
        // Pitch drops fast
        const freq = 200 * Math.exp(-t * 12) + 40;
        const phase = 2 * Math.PI * freq * t;
        thud[i] = Math.sin(phase) * e;
    }

    // Layer 2: Body impact — low noise burst through LPF
    const body = makeBuffer(dur);
    for (let i = 0; i < len; i++) {
        const t = i / RATE;
        const e = env(t, 0.001, 0.04, 0.05, 0.08, dur);
        body[i] = (Math.random() * 2 - 1) * e;
    }
    lpf(body, 600);  // Keep only low frequencies

    // Layer 3: Subtle mid "crunch" — very short, filtered noise
    const crunch = makeBuffer(dur * 0.4);
    for (let i = 0; i < crunch.length; i++) {
        const t = i / RATE;
        const e = env(t, 0.001, 0.02, 0.02, 0.04, dur * 0.4);
        crunch[i] = (Math.random() * 2 - 1) * e;
    }
    lpf(crunch, 1800);  // Cut high frequencies

    // Layer 4: Sub bass punch
    const sub = makeBuffer(dur);
    for (let i = 0; i < len; i++) {
        const t = i / RATE;
        const e = env(t, 0.002, 0.08, 0.1, 0.1, dur);
        sub[i] = Math.sin(2 * Math.PI * 55 * t) * e;
    }

    // Mix: heavy on thud and sub, light on crunch
    const result = mixMulti([thud, body, crunch, sub], [0.45, 0.2, 0.1, 0.35]);
    saturate(result, 1.5);
    lpf(result, 2500);  // Final LPF to kill any remaining high freq
    normalize(result, 0.88);
    return result;
}

function writeWav(filePath, buf) {
    const samples = buf.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + samples * 2, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);   // PCM
    header.writeUInt16LE(1, 22);   // mono
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(samples * 2, 40);

    const data = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        const s = Math.max(-1, Math.min(1, buf[i]));
        data.writeInt16LE(Math.round(s * 32767), i * 2);
    }
    fs.writeFileSync(filePath, Buffer.concat([header, data]));
}

const outPath = path.join(__dirname, 'sounds', 'kill.wav');
const buf = genKillSound();
writeWav(outPath, buf);
const size = fs.statSync(outPath).size;
console.log(`kill.wav generated: ${(size / 1024).toFixed(1)}KB (${(buf.length / RATE * 1000).toFixed(0)}ms)`);
