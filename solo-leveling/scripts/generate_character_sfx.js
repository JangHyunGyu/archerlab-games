const fs = require('fs');
const path = require('path');

const RATE = 44100;
const OUT = path.join(__dirname, '..', 'sounds');

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function stereo(seconds) {
    const len = Math.ceil(seconds * RATE);
    return { left: new Float32Array(len), right: new Float32Array(len), len };
}

function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return (s / 0xffffffff) * 2 - 1;
    };
}

function env(p, attack = 0.02, releasePow = 2.4) {
    if (p < attack) return Math.pow(p / Math.max(attack, 0.0001), 2);
    return Math.pow(Math.max(0, 1 - (p - attack) / Math.max(0.0001, 1 - attack)), releasePow);
}

function pulse(p, at, width, pow = 2) {
    const d = Math.abs(p - at) / Math.max(width, 0.0001);
    return Math.pow(Math.max(0, 1 - d), pow);
}

function panGains(pan) {
    const p = Math.max(-1, Math.min(1, pan));
    const a = (p + 1) * Math.PI / 4;
    return [Math.cos(a), Math.sin(a)];
}

function addSample(buf, i, sample, pan = 0) {
    const [l, r] = panGains(pan);
    buf.left[i] += sample * l;
    buf.right[i] += sample * r;
}

function wave(phase, type = 'sine') {
    if (type === 'triangle') return 2 * Math.asin(Math.sin(phase)) / Math.PI;
    if (type === 'saw') return 2 * ((phase / (Math.PI * 2)) % 1) - 1;
    if (type === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
    return Math.sin(phase);
}

function addTone(buf, opts) {
    const rnd = rng(opts.seed || 1);
    let phase = (opts.phase ?? rnd()) * Math.PI;
    const panA = opts.panStart ?? opts.pan ?? 0;
    const panB = opts.panEnd ?? opts.pan ?? panA;
    for (let i = 0; i < buf.len; i++) {
        const p = i / Math.max(1, buf.len - 1);
        const curve = opts.curve ?? 1;
        const k = Math.pow(p, curve);
        const freq = (opts.a ?? opts.freq) + ((opts.b ?? opts.a ?? opts.freq) - (opts.a ?? opts.freq)) * k
            + Math.sin(p * Math.PI * 2 * (opts.vibratoRate || 8)) * (opts.vibrato || 0);
        phase += Math.PI * 2 * freq / RATE;
        const gain = opts.gain * env(p, opts.attack ?? 0.015, opts.releasePow ?? 2.4);
        addSample(buf, i, wave(phase, opts.type) * gain, panA + (panB - panA) * p);
    }
}

function lowpass(arr, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = dt / (rc + dt);
    let prev = 0;
    for (let i = 0; i < arr.length; i++) {
        prev += a * (arr[i] - prev);
        arr[i] = prev;
    }
}

function highpass(arr, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = rc / (rc + dt);
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i < arr.length; i++) {
        const x = arr[i];
        const y = a * (prevOut + x - prevIn);
        arr[i] = y;
        prevIn = x;
        prevOut = y;
    }
}

function bandpass(src, freq, q) {
    const w = 2 * Math.PI * freq / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w);
    const a2 = 1 - alpha;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) {
        const x0 = src[i];
        const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
        out[i] = y0;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;
    }
    return out;
}

function addNoise(buf, opts) {
    const rnd = rng(opts.seed || 7);
    const raw = new Float32Array(buf.len);
    const every = opts.every || 1;
    let held = 0;
    for (let i = 0; i < buf.len; i++) {
        if (i % every === 0) held = rnd();
        raw[i] = held;
    }

    let shaped = raw;
    if (opts.bp) shaped = bandpass(shaped, opts.bp, opts.q || 1);
    if (opts.lp) lowpass(shaped, opts.lp);
    if (opts.hp) highpass(shaped, opts.hp);

    const panA = opts.panStart ?? opts.pan ?? 0;
    const panB = opts.panEnd ?? opts.pan ?? panA;
    for (let i = 0; i < buf.len; i++) {
        const p = i / Math.max(1, buf.len - 1);
        const gate = opts.gate ? opts.gate(p) : 1;
        const amp = opts.gain * env(p, opts.attack ?? 0.01, opts.releasePow ?? 2.2) * gate;
        addSample(buf, i, shaped[i] * amp, panA + (panB - panA) * p);
    }
}

function addClick(buf, at, gain, seed, pan = 0, tone = 0) {
    const rnd = rng(seed);
    const start = Math.max(0, Math.floor(at * RATE));
    const len = Math.min(buf.len - start, Math.floor(0.032 * RATE));
    for (let i = 0; i < len; i++) {
        const p = i / Math.max(1, len - 1);
        const bright = tone ? Math.sin(Math.PI * 2 * tone * i / RATE) * 0.45 : 0;
        addSample(buf, start + i, (rnd() + bright) * gain * Math.pow(1 - p, 4), pan);
    }
}

function addDelay(buf, delayMs, feedback, mix) {
    const d = Math.max(1, Math.floor(delayMs * RATE / 1000));
    for (let i = d; i < buf.len; i++) {
        const l = buf.left[i - d];
        const r = buf.right[i - d];
        buf.left[i] += r * mix;
        buf.right[i] += l * mix;
        buf.left[i] += buf.left[i - d] * feedback * 0.08;
        buf.right[i] += buf.right[i - d] * feedback * 0.08;
    }
}

function addBlade(buf, seed, color = 'light') {
    const bright = color === 'light' ? 1.25 : color === 'flame' ? 0.92 : 1;
    addNoise(buf, { seed, gain: 0.23 * bright, bp: 2600, q: 0.75, every: 2, attack: 0.025, releasePow: 2.8, panStart: -0.38, panEnd: 0.38 });
    addNoise(buf, { seed: seed + 1, gain: 0.15, bp: 6200, q: 1.4, every: 1, attack: 0.012, releasePow: 3.6, panStart: -0.22, panEnd: 0.28 });
    addTone(buf, { seed: seed + 2, a: 880, b: 1720, gain: 0.06 * bright, attack: 0.018, releasePow: 2.8, panStart: -0.25, panEnd: 0.25, vibrato: 12 });
    addTone(buf, { seed: seed + 3, a: 2800, b: 1260, gain: 0.035 * bright, attack: 0.008, releasePow: 3.8, pan: 0.12 });
    addClick(buf, 0.055, 0.16 * bright, seed + 4, 0.15, 4100);
}

function addLightChime(buf, seed, root = 880, intensity = 1) {
    const freqs = [root, root * 1.5, root * 2, root * 2.5, root * 3.01];
    freqs.forEach((freq, i) => {
        addTone(buf, {
            seed: seed + i,
            a: freq,
            b: freq * (1 + 0.015 * (i % 2 ? -1 : 1)),
            gain: intensity * (0.055 / (i + 1)),
            attack: 0.018 + i * 0.004,
            releasePow: 1.6 + i * 0.25,
            pan: -0.22 + i * 0.11,
            vibrato: i ? 2.5 : 1,
        });
    });
}

function addTigerBody(buf, seed, intensity = 1) {
    addNoise(buf, { seed, gain: 0.24 * intensity, bp: 760, q: 0.7, every: 3, attack: 0.012, releasePow: 2.1, panStart: 0.28, panEnd: -0.28 });
    addNoise(buf, { seed: seed + 1, gain: 0.18 * intensity, bp: 2300, q: 1.0, every: 2, attack: 0.009, releasePow: 3.2, panStart: -0.2, panEnd: 0.2 });
    addTone(buf, { seed: seed + 2, a: 115, b: 72, gain: 0.18 * intensity, attack: 0.012, releasePow: 2.7, type: 'triangle', pan: 0 });
    addTone(buf, { seed: seed + 3, a: 340, b: 190, gain: 0.06 * intensity, attack: 0.014, releasePow: 2.3, vibrato: 18, pan: -0.08 });
}

function addFire(buf, seed, intensity = 1, heavy = false) {
    addNoise(buf, { seed, gain: 0.28 * intensity, bp: heavy ? 420 : 980, q: 0.65, every: heavy ? 8 : 3, attack: 0.025, releasePow: heavy ? 1.5 : 2.1, panStart: -0.32, panEnd: 0.32 });
    addNoise(buf, { seed: seed + 1, gain: 0.22 * intensity, bp: 3600, q: 0.9, every: 1, attack: 0.01, releasePow: 2.8, panStart: 0.28, panEnd: -0.24 });
    addTone(buf, { seed: seed + 2, a: heavy ? 72 : 210, b: heavy ? 48 : 520, gain: 0.14 * intensity, attack: 0.018, releasePow: heavy ? 2.0 : 1.8, type: 'saw', pan: 0 });
    for (let i = 0; i < 6; i++) addClick(buf, 0.025 + i * 0.035, 0.055 * intensity, seed + 10 + i, (i % 2 ? 0.25 : -0.25), 1800 + i * 380);
}

function addSanctuary(buf, seed, intensity = 1, impact = false) {
    addLightChime(buf, seed, impact ? 660 : 720, 0.8 * intensity);
    addNoise(buf, { seed: seed + 20, gain: 0.11 * intensity, bp: impact ? 520 : 1280, q: 0.85, every: impact ? 6 : 3, attack: impact ? 0.02 : 0.045, releasePow: impact ? 2.2 : 1.6, panStart: -0.18, panEnd: 0.18 });
    addTone(buf, { seed: seed + 21, a: impact ? 120 : 220, b: impact ? 74 : 260, gain: (impact ? 0.18 : 0.09) * intensity, attack: 0.03, releasePow: impact ? 2.7 : 1.8, type: 'triangle', pan: 0 });
    if (impact) addClick(buf, 0.05, 0.22 * intensity, seed + 22, 0, 1200);
}

function addHolyImpact(buf, seed, intensity = 1) {
    addTone(buf, { seed, a: 76, b: 44, gain: 0.26 * intensity, attack: 0.008, releasePow: 2.5, type: 'triangle' });
    addNoise(buf, { seed: seed + 1, gain: 0.20 * intensity, bp: 340, q: 0.7, every: 9, attack: 0.004, releasePow: 2.4 });
    addLightChime(buf, seed + 2, 540, 0.62 * intensity);
    addClick(buf, 0.012, 0.34 * intensity, seed + 3, 0, 900);
}

function finalize(buf, opts = {}) {
    highpass(buf.left, opts.hp || 28);
    highpass(buf.right, opts.hp || 28);
    if (opts.lp) {
        lowpass(buf.left, opts.lp);
        lowpass(buf.right, opts.lp);
    }

    const sat = opts.sat || 1.75;
    for (let i = 0; i < buf.len; i++) {
        buf.left[i] = Math.tanh(buf.left[i] * sat) * 0.92;
        buf.right[i] = Math.tanh(buf.right[i] * sat) * 0.92;
    }

    let peak = 0;
    for (let i = 0; i < buf.len; i++) peak = Math.max(peak, Math.abs(buf.left[i]), Math.abs(buf.right[i]));
    const target = opts.peak || 0.82;
    if (peak > 0) {
        const g = target / peak;
        for (let i = 0; i < buf.len; i++) {
            buf.left[i] *= g;
            buf.right[i] *= g;
        }
    }

    const fade = Math.min(buf.len, Math.floor((opts.fadeMs || 8) * RATE / 1000));
    for (let i = 0; i < fade; i++) {
        const g = Math.pow(i / Math.max(1, fade), 2);
        buf.left[i] *= g;
        buf.right[i] *= g;
        buf.left[buf.len - 1 - i] *= g;
        buf.right[buf.len - 1 - i] *= g;
    }
}

function writeWav(file, buf) {
    const header = Buffer.alloc(44);
    const channels = 2;
    const bytesPerSample = 2;
    const dataBytes = buf.len * channels * bytesPerSample;
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataBytes, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * channels * bytesPerSample, 28);
    header.writeUInt16LE(channels * bytesPerSample, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataBytes, 40);

    const data = Buffer.alloc(dataBytes);
    for (let i = 0; i < buf.len; i++) {
        data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf.left[i])) * 32767), i * 4);
        data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf.right[i])) * 32767), i * 4 + 2);
    }
    fs.writeFileSync(path.join(OUT, file), Buffer.concat([header, data]));
}

const recipes = [
    ['light_sword_slash_sfx.wav', 0.34, (b) => { addBlade(b, 1001, 'light'); addLightChime(b, 1010, 1040, 0.9); addDelay(b, 34, 0.18, 0.11); }, { lp: 11200, sat: 1.55, peak: 0.82 }],
    ['light_lance_sfx.wav', 0.46, (b) => { addBlade(b, 1021, 'light'); addTone(b, { seed: 1025, a: 520, b: 1880, gain: 0.11, attack: 0.035, releasePow: 1.9, panStart: -0.15, panEnd: 0.32 }); addLightChime(b, 1030, 880, 0.7); addDelay(b, 42, 0.12, 0.09); }, { lp: 11800, sat: 1.5, peak: 0.81 }],
    ['light_crescent_sfx.wav', 0.52, (b) => { addBlade(b, 1041, 'light'); addNoise(b, { seed: 1044, gain: 0.12, bp: 1550, q: 0.5, attack: 0.06, releasePow: 1.6, panStart: -0.55, panEnd: 0.55 }); addLightChime(b, 1050, 760, 0.95); addDelay(b, 56, 0.18, 0.14); }, { lp: 11000, sat: 1.6, peak: 0.82 }],
    ['light_judgment_sfx.wav', 0.76, (b) => { addHolyImpact(b, 1060, 1.15); addTone(b, { seed: 1065, a: 330, b: 990, gain: 0.08, attack: 0.09, releasePow: 1.4, type: 'triangle' }); addLightChime(b, 1070, 660, 1.0); addDelay(b, 70, 0.22, 0.14); }, { lp: 9600, sat: 1.85, peak: 0.86 }],
    ['light_sanctum_sfx.wav', 0.88, (b) => { addLightChime(b, 1080, 520, 1.25); addNoise(b, { seed: 1085, gain: 0.12, bp: 920, q: 0.55, attack: 0.12, releasePow: 1.05, panStart: -0.35, panEnd: 0.35 }); addTone(b, { seed: 1086, a: 96, b: 132, gain: 0.12, attack: 0.16, releasePow: 1.3, type: 'triangle' }); addDelay(b, 84, 0.2, 0.12); }, { lp: 9400, sat: 1.45, peak: 0.8 }],

    ['tiger_claw_sfx.wav', 0.32, (b) => { addTigerBody(b, 2001, 1.12); addBlade(b, 2008, 'tiger'); addClick(b, 0.06, 0.18, 2010, 0.18, 2200); }, { lp: 7600, sat: 2.1, peak: 0.84 }],
    ['tiger_fang_sfx.wav', 0.42, (b) => { addTigerBody(b, 2020, 1.0); addTone(b, { seed: 2025, a: 260, b: 760, gain: 0.09, attack: 0.03, releasePow: 1.8, type: 'saw', panStart: -0.18, panEnd: 0.24 }); addNoise(b, { seed: 2027, gain: 0.12, bp: 3100, q: 1.1, attack: 0.02, releasePow: 2.7, panStart: 0.3, panEnd: -0.2 }); }, { lp: 8200, sat: 2.0, peak: 0.82 }],
    ['tiger_rend_sfx.wav', 0.48, (b) => { addTigerBody(b, 2040, 1.08); addBlade(b, 2048, 'tiger'); addNoise(b, { seed: 2050, gain: 0.12, bp: 1350, q: 0.55, attack: 0.05, releasePow: 1.5, panStart: -0.5, panEnd: 0.48 }); addDelay(b, 36, 0.1, 0.08); }, { lp: 7800, sat: 2.1, peak: 0.84 }],
    ['tiger_quake_sfx.wav', 0.74, (b) => { addTigerBody(b, 2060, 0.8); addTone(b, { seed: 2064, a: 58, b: 36, gain: 0.38, attack: 0.006, releasePow: 2.3, type: 'triangle' }); addNoise(b, { seed: 2065, gain: 0.32, bp: 210, q: 0.5, every: 10, attack: 0.005, releasePow: 2.0 }); addClick(b, 0.012, 0.48, 2069, 0, 520); }, { lp: 4300, sat: 2.35, peak: 0.88 }],
    ['tiger_guard_sfx.wav', 0.82, (b) => { addTigerBody(b, 2080, 0.88); addTone(b, { seed: 2083, a: 92, b: 124, gain: 0.24, attack: 0.08, releasePow: 1.2, type: 'triangle', vibrato: 4 }); addNoise(b, { seed: 2086, gain: 0.12, bp: 640, q: 0.5, attack: 0.1, releasePow: 1.25, panStart: -0.3, panEnd: 0.3 }); addDelay(b, 62, 0.2, 0.11); }, { lp: 5200, sat: 2.0, peak: 0.82 }],

    ['flame_spark_sfx.wav', 0.38, (b) => { addFire(b, 3001, 0.95); addTone(b, { seed: 3005, a: 340, b: 860, gain: 0.08, attack: 0.025, releasePow: 1.8, type: 'saw', panStart: -0.18, panEnd: 0.18 }); }, { lp: 9000, sat: 2.1, peak: 0.82 }],
    ['flame_bolt_sfx.wav', 0.44, (b) => { addFire(b, 3020, 1.04); addTone(b, { seed: 3025, a: 460, b: 1220, gain: 0.09, attack: 0.018, releasePow: 1.65, type: 'saw', panStart: -0.3, panEnd: 0.35 }); addDelay(b, 28, 0.08, 0.08); }, { lp: 9400, sat: 2.15, peak: 0.83 }],
    ['flame_arc_sfx.wav', 0.52, (b) => { addBlade(b, 3040, 'flame'); addFire(b, 3048, 0.88); addNoise(b, { seed: 3055, gain: 0.14, bp: 1850, q: 0.6, attack: 0.05, releasePow: 1.4, panStart: -0.52, panEnd: 0.52 }); }, { lp: 8800, sat: 2.2, peak: 0.84 }],
    ['flame_meteor_sfx.wav', 0.88, (b) => { addFire(b, 3060, 1.12, true); addTone(b, { seed: 3062, a: 88, b: 39, gain: 0.36, attack: 0.02, releasePow: 2.1, type: 'triangle' }); addNoise(b, { seed: 3065, gain: 0.35, bp: 260, q: 0.55, every: 10, attack: 0.04, releasePow: 1.8 }); addClick(b, 0.16, 0.52, 3069, 0, 440); addDelay(b, 76, 0.18, 0.12); }, { lp: 5600, sat: 2.35, peak: 0.88 }],
    ['flame_inferno_sfx.wav', 0.92, (b) => { addFire(b, 3080, 1.18, true); addTone(b, { seed: 3085, a: 128, b: 190, gain: 0.18, attack: 0.12, releasePow: 1.05, type: 'saw', vibrato: 5 }); addNoise(b, { seed: 3088, gain: 0.18, bp: 1450, q: 0.45, attack: 0.1, releasePow: 1.1, panStart: -0.45, panEnd: 0.45 }); addDelay(b, 64, 0.25, 0.13); }, { lp: 7600, sat: 2.15, peak: 0.84 }],

    ['sanctuary_mace_sfx.wav', 0.42, (b) => { addSanctuary(b, 4001, 0.95, true); addHolyImpact(b, 4010, 0.78); }, { lp: 8200, sat: 1.8, peak: 0.83 }],
    ['sanctuary_orb_sfx.wav', 0.48, (b) => { addSanctuary(b, 4020, 1.05, false); addTone(b, { seed: 4025, a: 440, b: 880, gain: 0.07, attack: 0.05, releasePow: 1.5, type: 'triangle', panStart: -0.2, panEnd: 0.25 }); addDelay(b, 52, 0.18, 0.12); }, { lp: 9000, sat: 1.55, peak: 0.8 }],
    ['sanctuary_arc_sfx.wav', 0.54, (b) => { addBlade(b, 4040, 'light'); addSanctuary(b, 4048, 0.78, false); addNoise(b, { seed: 4055, gain: 0.08, bp: 1180, q: 0.55, attack: 0.06, releasePow: 1.6, panStart: -0.46, panEnd: 0.46 }); addDelay(b, 58, 0.15, 0.1); }, { lp: 9000, sat: 1.65, peak: 0.8 }],
    ['sanctuary_seal_sfx.wav', 0.76, (b) => { addSanctuary(b, 4060, 1.22, true); addTone(b, { seed: 4067, a: 220, b: 330, gain: 0.11, attack: 0.09, releasePow: 1.35, type: 'triangle' }); addClick(b, 0.09, 0.2, 4070, 0, 1320); addDelay(b, 74, 0.22, 0.14); }, { lp: 8400, sat: 1.65, peak: 0.82 }],
    ['sanctuary_field_sfx.wav', 0.94, (b) => { addSanctuary(b, 4080, 1.25, false); addTone(b, { seed: 4088, a: 164, b: 220, gain: 0.12, attack: 0.16, releasePow: 1.1, type: 'triangle' }); addNoise(b, { seed: 4090, gain: 0.1, bp: 740, q: 0.55, attack: 0.14, releasePow: 1.05, panStart: -0.38, panEnd: 0.38 }); addDelay(b, 88, 0.24, 0.14); }, { lp: 8200, sat: 1.5, peak: 0.8 }],
];

ensureDir(OUT);
for (const [file, dur, build, opts] of recipes) {
    const buf = stereo(dur);
    build(buf);
    finalize(buf, opts);
    writeWav(file, buf);
    console.log(`generated ${file}`);
}
