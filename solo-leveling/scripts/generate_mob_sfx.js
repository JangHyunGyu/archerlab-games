const fs = require('fs');
const path = require('path');

const RATE = 44100;
const OUT_DIR = path.join(__dirname, '..', 'sounds');

function makeBuffer(duration) {
    return new Float32Array(Math.ceil(RATE * duration));
}

function rng(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function onePoleLowPass(buf, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = dt / (rc + dt);
    let y = 0;
    for (let i = 0; i < buf.length; i++) {
        y += a * (buf[i] - y);
        buf[i] = y;
    }
    return buf;
}

function onePoleHighPass(buf, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = rc / (rc + dt);
    let y = 0;
    let prev = 0;
    for (let i = 0; i < buf.length; i++) {
        const x = buf[i];
        y = a * (y + x - prev);
        prev = x;
        buf[i] = y;
    }
    return buf;
}

function envFast(p, attack = 0.018, releasePow = 2.5) {
    if (p <= 0) return 0;
    if (p < attack) return Math.pow(p / attack, 1.6);
    const q = (p - attack) / (1 - attack);
    return Math.pow(Math.max(0, 1 - q), releasePow);
}

function envDelayed(p, delay, attack = 0.04, releasePow = 1.8) {
    if (p < delay) return 0;
    return envFast((p - delay) / (1 - delay), attack, releasePow);
}

function addNoise(buf, seed, gain, opts = {}) {
    const random = rng(seed);
    const tmp = makeBuffer(buf.length / RATE);
    for (let i = 0; i < tmp.length; i++) {
        tmp[i] = (random() * 2 - 1) * gain;
    }

    if (opts.hp) onePoleHighPass(tmp, opts.hp);
    if (opts.lp) onePoleLowPass(tmp, opts.lp);

    for (let i = 0; i < buf.length; i++) {
        const p = i / Math.max(1, buf.length - 1);
        const e = opts.env ? opts.env(p) : envFast(p);
        buf[i] += tmp[i] * e;
    }
}

function addSweep(buf, startHz, endHz, gain, opts = {}) {
    let phase = opts.phase || 0;
    const wave = opts.wave || 'sine';
    for (let i = 0; i < buf.length; i++) {
        const p = i / Math.max(1, buf.length - 1);
        const bend = opts.curve ? opts.curve(p) : p;
        const freq = startHz + (endHz - startHz) * bend;
        phase += (Math.PI * 2 * freq) / RATE;
        const osc = wave === 'triangle'
            ? (2 / Math.PI) * Math.asin(Math.sin(phase))
            : Math.sin(phase);
        const e = opts.env ? opts.env(p) : envFast(p, 0.012, 2.2);
        buf[i] += osc * gain * e;
    }
}

function addClick(buf, atSec, gain, seed) {
    const start = Math.floor(atSec * RATE);
    const random = rng(seed);
    const len = Math.min(buf.length - start, Math.floor(0.018 * RATE));
    for (let i = 0; i < len; i++) {
        const p = i / Math.max(1, len - 1);
        const e = Math.pow(1 - p, 3.8);
        buf[start + i] += (random() * 2 - 1) * gain * e;
    }
}

function addBurst(buf, atSec, gain, seed, hp, lp) {
    const start = Math.floor(atSec * RATE);
    const len = Math.min(buf.length - start, Math.floor(0.09 * RATE));
    const tmp = makeBuffer(len / RATE);
    const random = rng(seed);
    for (let i = 0; i < len; i++) tmp[i] = (random() * 2 - 1) * gain;
    if (hp) onePoleHighPass(tmp, hp);
    if (lp) onePoleLowPass(tmp, lp);
    for (let i = 0; i < len; i++) {
        const p = i / Math.max(1, len - 1);
        buf[start + i] += tmp[i] * envFast(p, 0.01, 2.8);
    }
}

function finalize(buf, opts = {}) {
    const hp = opts.hp || 24;
    const lp = opts.lp || 7200;
    const sat = opts.sat || 1.8;
    const peak = opts.peak || 0.78;

    onePoleHighPass(buf, hp);
    if (lp < RATE / 2) onePoleLowPass(buf, lp);

    let dc = 0;
    for (let i = 0; i < buf.length; i++) dc += buf[i];
    dc /= Math.max(1, buf.length);

    let max = 0;
    for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.tanh((buf[i] - dc) * sat);
        max = Math.max(max, Math.abs(buf[i]));
    }

    const attack = Math.min(buf.length, Math.floor((opts.attackMs || 8) * RATE / 1000));
    const release = Math.min(buf.length, Math.floor((opts.releaseMs || 22) * RATE / 1000));
    for (let i = 0; i < attack; i++) {
        const g = i / Math.max(1, attack);
        buf[i] *= g * g;
    }
    for (let i = 0; i < release; i++) {
        const idx = buf.length - 1 - i;
        const g = i / Math.max(1, release);
        buf[idx] *= g * g;
    }

    max = 0;
    for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
    if (max > 0) {
        const scale = peak / max;
        for (let i = 0; i < buf.length; i++) buf[i] *= scale;
    }
    return buf;
}

function writeWav(filePath, buf) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + buf.length * 2, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(buf.length * 2, 40);

    const data = Buffer.alloc(buf.length * 2);
    for (let i = 0; i < buf.length; i++) {
        const s = Math.max(-1, Math.min(1, buf[i]));
        data.writeInt16LE(Math.round(s * 32767), i * 2);
    }
    fs.writeFileSync(filePath, Buffer.concat([header, data]));
}

function makeHit() {
    const b = makeBuffer(0.165);
    addNoise(b, 1101, 0.42, { hp: 520, lp: 5600, env: p => envFast(p, 0.035, 3.6) });
    addNoise(b, 1102, 0.30, { hp: 80, lp: 1450, env: p => envFast(p, 0.028, 2.8) });
    addSweep(b, 150, 62, 0.34, { env: p => envFast(p, 0.018, 3.2), curve: p => Math.pow(p, 0.45) });
    addSweep(b, 920, 410, 0.10, { env: p => envFast(p, 0.025, 4.2), curve: p => Math.pow(p, 0.7) });
    addClick(b, 0.011, 0.16, 1103);
    return finalize(b, { lp: 6200, hp: 35, sat: 2.05, peak: 0.76, attackMs: 7, releaseMs: 20 });
}

function makeCritHit() {
    const b = makeBuffer(0.23);
    addNoise(b, 1201, 0.34, { hp: 850, lp: 7600, env: p => envFast(p, 0.024, 4.0) });
    addNoise(b, 1202, 0.18, { hp: 120, lp: 1800, env: p => envFast(p, 0.02, 2.5) });
    addSweep(b, 2600, 820, 0.22, { env: p => envFast(p, 0.018, 3.5), wave: 'triangle' });
    addSweep(b, 125, 56, 0.26, { env: p => envFast(p, 0.012, 2.8), curve: p => Math.pow(p, 0.5) });
    addClick(b, 0.009, 0.26, 1203);
    return finalize(b, { lp: 7800, hp: 45, sat: 2.15, peak: 0.80, attackMs: 7, releaseMs: 24 });
}

function makeKill() {
    const b = makeBuffer(0.34);
    addNoise(b, 1301, 0.34, { hp: 70, lp: 1350, env: p => envFast(p, 0.02, 1.9) });
    addNoise(b, 1302, 0.20, { hp: 820, lp: 4200, env: p => envDelayed(p, 0.15, 0.06, 2.2) });
    addSweep(b, 155, 38, 0.46, { env: p => envFast(p, 0.018, 2.5), curve: p => Math.pow(p, 0.42) });
    addSweep(b, 420, 180, 0.11, { env: p => envFast(p, 0.035, 2.0), curve: p => Math.pow(p, 0.8) });
    addBurst(b, 0.028, 0.18, 1303, 140, 1800);
    return finalize(b, { lp: 4600, hp: 28, sat: 1.75, peak: 0.80, attackMs: 8, releaseMs: 30 });
}

function makeEliteKill() {
    const b = makeBuffer(0.66);
    addNoise(b, 1401, 0.34, { hp: 55, lp: 1750, env: p => envFast(p, 0.018, 1.55) });
    addNoise(b, 1402, 0.22, { hp: 850, lp: 4800, env: p => envDelayed(p, 0.11, 0.045, 1.8) });
    addSweep(b, 190, 42, 0.55, { env: p => envFast(p, 0.012, 2.0), curve: p => Math.pow(p, 0.38) });
    addSweep(b, 58, 34, 0.36, { env: p => envDelayed(p, 0.12, 0.06, 1.4), curve: p => Math.pow(p, 0.65) });
    addSweep(b, 700, 220, 0.12, { env: p => envDelayed(p, 0.08, 0.035, 2.0) });
    addBurst(b, 0.018, 0.25, 1403, 110, 2200);
    addBurst(b, 0.11, 0.18, 1404, 90, 1800);
    return finalize(b, { lp: 5200, hp: 24, sat: 1.9, peak: 0.84, attackMs: 8, releaseMs: 36 });
}

const sounds = {
    'hit.wav': makeHit,
    'crit_hit.wav': makeCritHit,
    'kill.wav': makeKill,
    'elite_kill.wav': makeEliteKill,
};

for (const [name, make] of Object.entries(sounds)) {
    const file = path.join(OUT_DIR, name);
    writeWav(file, make());
    console.log(`generated ${name}`);
}
