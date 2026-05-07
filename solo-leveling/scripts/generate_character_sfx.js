const fs = require('fs');
const path = require('path');

const RATE = 48000;
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

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

function env(p, attack = 0.025, releasePow = 2.2, hold = 0) {
    const safeAttack = Math.max(0.0001, attack);
    if (p < safeAttack) return Math.pow(p / safeAttack, 2);
    if (hold > 0 && p < hold) return 1;
    const releaseStart = Math.max(safeAttack, hold);
    return Math.pow(Math.max(0, 1 - (p - releaseStart) / Math.max(0.0001, 1 - releaseStart)), releasePow);
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
    if (i < 0 || i >= buf.len) return;
    const [l, r] = panGains(pan);
    buf.left[i] += sample * l;
    buf.right[i] += sample * r;
}

function wave(phase, type = 'sine') {
    if (type === 'triangle') return 2 * Math.asin(Math.sin(phase)) / Math.PI;
    if (type === 'saw') return 2 * ((phase / (Math.PI * 2)) % 1) - 1;
    if (type === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
    if (type === 'softSaw') return Math.tanh((2 * ((phase / (Math.PI * 2)) % 1) - 1) * 1.8);
    return Math.sin(phase);
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

function addTone(buf, opts) {
    const start = Math.max(0, Math.floor((opts.start || 0) * RATE));
    const len = Math.min(buf.len - start, Math.ceil((opts.duration || opts.dur || 0.2) * RATE));
    if (len <= 0) return;

    const rnd = rng(opts.seed || 1);
    let phase = (opts.phase ?? rnd()) * Math.PI;
    const panA = opts.panStart ?? opts.pan ?? 0;
    const panB = opts.panEnd ?? opts.pan ?? panA;
    for (let j = 0; j < len; j++) {
        const i = start + j;
        const p = j / Math.max(1, len - 1);
        const curve = opts.curve ?? 1;
        const k = Math.pow(p, curve);
        const freq = (opts.a ?? opts.freq) + ((opts.b ?? opts.a ?? opts.freq) - (opts.a ?? opts.freq)) * k
            + Math.sin(p * Math.PI * 2 * (opts.vibratoRate || 8)) * (opts.vibrato || 0);
        phase += Math.PI * 2 * freq / RATE;
        const gate = opts.gate ? opts.gate(p) : 1;
        const gain = opts.gain * env(p, opts.attack ?? 0.015, opts.releasePow ?? 2.4, opts.hold ?? 0) * gate;
        addSample(buf, i, wave(phase, opts.type) * gain, panA + (panB - panA) * p);
    }
}

function addNoise(buf, opts) {
    const start = Math.max(0, Math.floor((opts.start || 0) * RATE));
    const len = Math.min(buf.len - start, Math.ceil((opts.duration || opts.dur || 0.2) * RATE));
    if (len <= 0) return;

    const rnd = rng(opts.seed || 7);
    const raw = new Float32Array(len);
    const every = opts.every || 1;
    let held = 0;
    for (let i = 0; i < len; i++) {
        if (i % every === 0) held = rnd();
        raw[i] = held;
    }

    let shaped = raw;
    if (opts.bp) shaped = bandpass(shaped, opts.bp, opts.q || 1);
    if (opts.lp) lowpass(shaped, opts.lp);
    if (opts.hp) highpass(shaped, opts.hp);

    const panA = opts.panStart ?? opts.pan ?? 0;
    const panB = opts.panEnd ?? opts.pan ?? panA;
    for (let j = 0; j < len; j++) {
        const p = j / Math.max(1, len - 1);
        const gate = opts.gate ? opts.gate(p) : 1;
        const amp = opts.gain * env(p, opts.attack ?? 0.01, opts.releasePow ?? 2.2, opts.hold ?? 0) * gate;
        addSample(buf, start + j, shaped[j] * amp, panA + (panB - panA) * p);
    }
}

function addClick(buf, at, gain, seed, pan = 0, tone = 0, duration = 0.036) {
    const rnd = rng(seed);
    const start = Math.max(0, Math.floor(at * RATE));
    const len = Math.min(buf.len - start, Math.floor(duration * RATE));
    for (let i = 0; i < len; i++) {
        const p = i / Math.max(1, len - 1);
        const bright = tone ? Math.sin(Math.PI * 2 * tone * i / RATE) * 0.45 : 0;
        addSample(buf, start + i, (rnd() + bright) * gain * Math.pow(1 - p, 4), pan);
    }
}

function addFilteredBurst(buf, at, gain, seed, freq = 900, q = 0.8, duration = 0.08, pan = 0) {
    addNoise(buf, {
        start: at,
        duration,
        seed,
        gain,
        bp: freq,
        q,
        every: 1,
        attack: 0.004,
        releasePow: 3.6,
        pan,
    });
}

function addTransientStack(buf, at, seed, strength = 1, pan = 0) {
    addClick(buf, at, 0.22 * strength, seed, pan, 1800, 0.024);
    addFilteredBurst(buf, at + 0.002, 0.16 * strength, seed + 1, 420, 0.6, 0.07, pan * 0.4);
    addFilteredBurst(buf, at + 0.004, 0.08 * strength, seed + 2, 3600, 1.4, 0.055, -pan * 0.5);
}

function addMetalRing(buf, seed, root, intensity = 1, start = 0.02, duration = 0.45, panSpread = 0.25) {
    const ratios = [1, 1.48, 2.03, 2.71, 3.94, 5.12];
    ratios.forEach((ratio, i) => {
        addTone(buf, {
            start: start + i * 0.002,
            duration: duration * (1 - i * 0.06),
            seed: seed + i,
            a: root * ratio,
            b: root * ratio * (1 + (i % 2 ? -0.012 : 0.016)),
            gain: intensity * (0.07 / (1 + i * 0.55)),
            attack: 0.012 + i * 0.003,
            releasePow: 1.35 + i * 0.22,
            pan: -panSpread + panSpread * 2 * (i / Math.max(1, ratios.length - 1)),
            vibrato: i ? 2.5 + i : 1.2,
            vibratoRate: 2 + i * 0.4,
        });
    });
}

function addBladeAir(buf, seed, color = 'light', start = 0, duration = 0.34, intensity = 1) {
    const bright = color === 'light' ? 1.18 : color === 'flame' ? 0.86 : color === 'shadow' ? 0.72 : 0.95;
    const low = color === 'shadow' ? 240 : color === 'tiger' ? 380 : 680;
    const high = color === 'light' ? 7200 : color === 'flame' ? 4600 : color === 'shadow' ? 3600 : 5200;

    addNoise(buf, {
        start,
        duration,
        seed,
        gain: 0.18 * intensity * bright,
        bp: low + 900,
        q: 0.72,
        every: 2,
        attack: 0.035,
        releasePow: 2.2,
        panStart: -0.5,
        panEnd: 0.5,
        gate: (p) => 0.72 + 0.28 * Math.sin(p * Math.PI * 2.5),
    });
    addNoise(buf, {
        start: start + 0.01,
        duration: duration * 0.78,
        seed: seed + 1,
        gain: 0.12 * intensity * bright,
        bp: high,
        q: 1.2,
        every: 1,
        attack: 0.018,
        releasePow: 3.4,
        panStart: -0.22,
        panEnd: 0.32,
    });
    addTone(buf, {
        start: start + 0.015,
        duration: duration * 0.72,
        seed: seed + 2,
        a: color === 'shadow' ? 480 : 840,
        b: color === 'flame' ? 1320 : color === 'tiger' ? 1060 : 1720,
        gain: 0.055 * intensity * bright,
        attack: 0.018,
        releasePow: 2.1,
        panStart: -0.24,
        panEnd: 0.24,
        vibrato: color === 'shadow' ? 8 : 14,
    });
}

function addLightChime(buf, seed, root = 880, intensity = 1, start = 0.02, duration = 0.6) {
    const freqs = [root, root * 1.5, root * 2, root * 2.5, root * 3.01, root * 4.02];
    freqs.forEach((freq, i) => {
        addTone(buf, {
            start: start + i * 0.004,
            duration: duration * (1 - i * 0.055),
            seed: seed + i,
            a: freq,
            b: freq * (1 + 0.012 * (i % 2 ? -1 : 1)),
            gain: intensity * (0.055 / (i + 1)),
            attack: 0.02 + i * 0.005,
            releasePow: 1.35 + i * 0.22,
            pan: -0.32 + i * 0.13,
            vibrato: i ? 2.8 : 1,
        });
    });
}

function addTigerBody(buf, seed, intensity = 1, start = 0, duration = 0.42) {
    addNoise(buf, {
        start,
        duration,
        seed,
        gain: 0.19 * intensity,
        bp: 620,
        q: 0.68,
        every: 4,
        attack: 0.014,
        releasePow: 1.95,
        panStart: 0.28,
        panEnd: -0.28,
    });
    addNoise(buf, {
        start: start + 0.006,
        duration: duration * 0.82,
        seed: seed + 1,
        gain: 0.12 * intensity,
        bp: 2300,
        q: 1.0,
        every: 2,
        attack: 0.01,
        releasePow: 3.0,
        panStart: -0.2,
        panEnd: 0.2,
    });
    addTone(buf, {
        start,
        duration: duration * 0.76,
        seed: seed + 2,
        a: 118,
        b: 62,
        gain: 0.19 * intensity,
        attack: 0.01,
        releasePow: 2.7,
        type: 'triangle',
        pan: 0,
    });
    addTone(buf, {
        start: start + 0.012,
        duration: duration * 0.55,
        seed: seed + 3,
        a: 360,
        b: 190,
        gain: 0.055 * intensity,
        attack: 0.014,
        releasePow: 2.3,
        vibrato: 18,
        pan: -0.08,
    });
}

function addFire(buf, seed, intensity = 1, start = 0, duration = 0.48, heavy = false) {
    addNoise(buf, {
        start,
        duration,
        seed,
        gain: 0.23 * intensity,
        bp: heavy ? 360 : 920,
        q: 0.62,
        every: heavy ? 9 : 3,
        attack: heavy ? 0.045 : 0.024,
        releasePow: heavy ? 1.35 : 2.0,
        panStart: -0.36,
        panEnd: 0.36,
    });
    addNoise(buf, {
        start: start + 0.006,
        duration: duration * 0.9,
        seed: seed + 1,
        gain: 0.16 * intensity,
        bp: 3400,
        q: 0.85,
        every: 1,
        attack: 0.01,
        releasePow: 2.7,
        panStart: 0.3,
        panEnd: -0.24,
    });
    addTone(buf, {
        start,
        duration: duration * 0.72,
        seed: seed + 2,
        a: heavy ? 74 : 210,
        b: heavy ? 45 : 540,
        gain: 0.12 * intensity,
        attack: heavy ? 0.03 : 0.018,
        releasePow: heavy ? 2.1 : 1.65,
        type: 'softSaw',
        pan: 0,
    });
    for (let i = 0; i < 8; i++) {
        addClick(buf, start + 0.018 + i * duration * 0.075, 0.035 * intensity, seed + 10 + i, i % 2 ? 0.3 : -0.3, 1900 + i * 330, 0.02);
    }
}

function addSanctuary(buf, seed, intensity = 1, start = 0, duration = 0.56, impact = false) {
    addLightChime(buf, seed, impact ? 620 : 760, 0.72 * intensity, start + 0.018, duration);
    addNoise(buf, {
        start,
        duration,
        seed: seed + 20,
        gain: 0.095 * intensity,
        bp: impact ? 520 : 1180,
        q: 0.85,
        every: impact ? 6 : 3,
        attack: impact ? 0.02 : 0.06,
        releasePow: impact ? 2.25 : 1.45,
        panStart: -0.24,
        panEnd: 0.24,
    });
    addTone(buf, {
        start,
        duration: duration * 0.88,
        seed: seed + 21,
        a: impact ? 124 : 220,
        b: impact ? 68 : 270,
        gain: (impact ? 0.15 : 0.075) * intensity,
        attack: impact ? 0.025 : 0.07,
        releasePow: impact ? 2.8 : 1.65,
        type: 'triangle',
        pan: 0,
    });
    if (impact) addTransientStack(buf, start + 0.02, seed + 22, 0.78 * intensity, 0);
}

function addShadowAura(buf, seed, intensity = 1, start = 0, duration = 0.65) {
    addNoise(buf, {
        start,
        duration,
        seed,
        gain: 0.14 * intensity,
        bp: 250,
        q: 0.42,
        every: 12,
        attack: 0.08,
        releasePow: 1.2,
        panStart: -0.28,
        panEnd: 0.28,
    });
    addNoise(buf, {
        start: start + 0.012,
        duration: duration * 0.84,
        seed: seed + 1,
        gain: 0.08 * intensity,
        bp: 1700,
        q: 0.6,
        every: 3,
        attack: 0.035,
        releasePow: 1.8,
        panStart: 0.36,
        panEnd: -0.36,
    });
    addTone(buf, {
        start,
        duration,
        seed: seed + 2,
        a: 58,
        b: 43,
        gain: 0.18 * intensity,
        attack: 0.06,
        releasePow: 1.65,
        type: 'triangle',
        vibrato: 4,
        vibratoRate: 3,
        pan: 0,
    });
}

function addReflections(buf, delaysMs = [21, 37, 61], gain = 0.12, damping = 5200) {
    const dryL = new Float32Array(buf.left);
    const dryR = new Float32Array(buf.right);
    lowpass(dryL, damping);
    lowpass(dryR, damping);
    delaysMs.forEach((ms, idx) => {
        const d = Math.max(1, Math.floor(ms * RATE / 1000));
        const g = gain / (1 + idx * 0.62);
        for (let i = d; i < buf.len; i++) {
            buf.left[i] += dryR[i - d] * g;
            buf.right[i] += dryL[i - d] * g;
        }
    });
}

function addTail(buf, seed, start, duration, opts = {}) {
    addNoise(buf, {
        start,
        duration,
        seed,
        gain: opts.gain ?? 0.05,
        bp: opts.bp ?? 900,
        q: opts.q ?? 0.55,
        every: opts.every ?? 4,
        attack: opts.attack ?? 0.12,
        releasePow: opts.releasePow ?? 1.2,
        panStart: opts.panStart ?? -0.35,
        panEnd: opts.panEnd ?? 0.35,
    });
}

function removeDc(buf) {
    let l = 0;
    let r = 0;
    for (let i = 0; i < buf.len; i++) {
        l += buf.left[i];
        r += buf.right[i];
    }
    l /= Math.max(1, buf.len);
    r /= Math.max(1, buf.len);
    for (let i = 0; i < buf.len; i++) {
        buf.left[i] -= l;
        buf.right[i] -= r;
    }
}

function stereoWidth(buf, width = 1.08) {
    for (let i = 0; i < buf.len; i++) {
        const mid = (buf.left[i] + buf.right[i]) * 0.5;
        const side = (buf.left[i] - buf.right[i]) * 0.5 * width;
        buf.left[i] = mid + side;
        buf.right[i] = mid - side;
    }
}

function compressorSample(v, threshold = 0.62, ratio = 3.2) {
    const a = Math.abs(v);
    if (a <= threshold) return v;
    const over = a - threshold;
    const compressed = threshold + over / ratio;
    return Math.sign(v) * compressed;
}

function finalize(buf, opts = {}) {
    highpass(buf.left, opts.hp || 26);
    highpass(buf.right, opts.hp || 26);
    if (opts.lp) {
        lowpass(buf.left, opts.lp);
        lowpass(buf.right, opts.lp);
    }
    removeDc(buf);
    stereoWidth(buf, opts.width || 1.08);

    const sat = opts.sat || 1.55;
    for (let i = 0; i < buf.len; i++) {
        buf.left[i] = compressorSample(Math.tanh(buf.left[i] * sat) * 0.92, opts.threshold || 0.62, opts.ratio || 3.0);
        buf.right[i] = compressorSample(Math.tanh(buf.right[i] * sat) * 0.92, opts.threshold || 0.62, opts.ratio || 3.0);
    }

    let peak = 0;
    let sum = 0;
    for (let i = 0; i < buf.len; i++) {
        peak = Math.max(peak, Math.abs(buf.left[i]), Math.abs(buf.right[i]));
        sum += buf.left[i] * buf.left[i] + buf.right[i] * buf.right[i];
    }
    const currentRms = Math.sqrt(sum / Math.max(1, buf.len * 2));
    const targetRms = opts.rms || 0;
    if (targetRms > 0 && currentRms > 0) {
        const gain = Math.min(opts.maxRmsGain || 1.4, targetRms / currentRms);
        for (let i = 0; i < buf.len; i++) {
            buf.left[i] *= gain;
            buf.right[i] *= gain;
        }
    }

    peak = 0;
    for (let i = 0; i < buf.len; i++) peak = Math.max(peak, Math.abs(buf.left[i]), Math.abs(buf.right[i]));
    const target = opts.peak || 0.86;
    if (peak > 0) {
        const g = target / peak;
        for (let i = 0; i < buf.len; i++) {
            buf.left[i] *= g;
            buf.right[i] *= g;
        }
    }

    const fadeIn = Math.min(buf.len, Math.floor((opts.fadeInMs || 3) * RATE / 1000));
    const fadeOut = Math.min(buf.len, Math.floor((opts.fadeOutMs || 14) * RATE / 1000));
    for (let i = 0; i < fadeIn; i++) {
        const g = Math.pow(i / Math.max(1, fadeIn), 2);
        buf.left[i] *= g;
        buf.right[i] *= g;
    }
    for (let i = 0; i < fadeOut; i++) {
        const idx = buf.len - 1 - i;
        const g = Math.pow(i / Math.max(1, fadeOut), 2);
        buf.left[idx] *= g;
        buf.right[idx] *= g;
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
    ['dagger.wav', 0.36, (b) => {
        addBladeAir(b, 501, 'shadow', 0.0, 0.28, 1.1);
        addShadowAura(b, 510, 0.5, 0.01, 0.34);
        addMetalRing(b, 520, 520, 0.55, 0.038, 0.25, 0.22);
        addTransientStack(b, 0.048, 530, 0.52, -0.12);
        addReflections(b, [18, 29, 47], 0.08, 3800);
    }, { lp: 8600, sat: 1.85, peak: 0.86, rms: 0.135, width: 1.14 }],
    ['dagger_throw.wav', 0.46, (b) => {
        addBladeAir(b, 541, 'shadow', 0.0, 0.38, 1.05);
        addTone(b, { start: 0.01, duration: 0.32, seed: 548, a: 460, b: 1080, gain: 0.075, attack: 0.02, releasePow: 2.0, panStart: -0.45, panEnd: 0.48, vibrato: 8 });
        addShadowAura(b, 550, 0.42, 0.04, 0.38);
        addMetalRing(b, 558, 720, 0.42, 0.055, 0.32, 0.26);
        addReflections(b, [24, 41, 64], 0.08, 4200);
    }, { lp: 8800, sat: 1.75, peak: 0.85, rms: 0.125, width: 1.18 }],
    ['slash.wav', 0.62, (b) => {
        addBladeAir(b, 561, 'shadow', 0.0, 0.48, 1.18);
        addNoise(b, { start: 0.045, duration: 0.43, seed: 568, gain: 0.12, bp: 960, q: 0.5, attack: 0.08, releasePow: 1.4, panStart: -0.56, panEnd: 0.56 });
        addShadowAura(b, 570, 0.6, 0.07, 0.48);
        addMetalRing(b, 578, 440, 0.38, 0.07, 0.32, 0.3);
        addTransientStack(b, 0.082, 582, 0.42, 0.18);
        addReflections(b, [25, 43, 72], 0.1, 3600);
    }, { lp: 7900, sat: 1.78, peak: 0.86, rms: 0.13, width: 1.2 }],
    ['authority.wav', 0.96, (b) => {
        addShadowAura(b, 591, 1.0, 0.0, 0.86);
        addTone(b, { start: 0.03, duration: 0.72, seed: 596, a: 64, b: 36, gain: 0.34, attack: 0.07, releasePow: 1.7, type: 'triangle' });
        addNoise(b, { start: 0.11, duration: 0.54, seed: 598, gain: 0.18, bp: 230, q: 0.45, every: 11, attack: 0.02, releasePow: 1.8 });
        addTransientStack(b, 0.16, 602, 0.95, 0);
        addTail(b, 608, 0.22, 0.68, { gain: 0.06, bp: 720, q: 0.55, every: 6, attack: 0.16, releasePow: 1.05 });
        addReflections(b, [31, 58, 93, 137], 0.12, 2600);
    }, { lp: 5200, sat: 1.95, peak: 0.88, rms: 0.15, width: 1.08, fadeOutMs: 24 }],
    ['fear.wav', 0.88, (b) => {
        addShadowAura(b, 611, 1.12, 0.0, 0.82);
        addTone(b, { start: 0.0, duration: 0.76, seed: 618, a: 48, b: 72, gain: 0.19, attack: 0.14, releasePow: 1.2, type: 'triangle', vibrato: 5, vibratoRate: 2.5 });
        addNoise(b, { start: 0.08, duration: 0.66, seed: 620, gain: 0.09, bp: 1850, q: 0.5, every: 4, attack: 0.08, releasePow: 1.25, panStart: 0.42, panEnd: -0.42 });
        addMetalRing(b, 628, 180, 0.22, 0.12, 0.56, 0.18);
        addReflections(b, [42, 76, 119], 0.1, 3000);
    }, { lp: 5600, sat: 1.68, peak: 0.84, rms: 0.13, width: 1.16, fadeOutMs: 28 }],

    ['light_sword_slash_sfx.wav', 0.42, (b) => {
        addBladeAir(b, 1001, 'light', 0.0, 0.32, 1.08);
        addLightChime(b, 1010, 1180, 0.72, 0.025, 0.34);
        addMetalRing(b, 1018, 1120, 0.45, 0.035, 0.28, 0.34);
        addTransientStack(b, 0.052, 1024, 0.45, 0.16);
        addReflections(b, [17, 31, 52], 0.11, 8200);
    }, { lp: 12600, sat: 1.45, peak: 0.84, rms: 0.13, width: 1.2 }],
    ['light_lance_sfx.wav', 0.56, (b) => {
        addBladeAir(b, 1031, 'light', 0.0, 0.38, 0.98);
        addTone(b, { start: 0.035, duration: 0.36, seed: 1038, a: 420, b: 2100, gain: 0.11, attack: 0.035, releasePow: 1.55, panStart: -0.18, panEnd: 0.38, vibrato: 8 });
        addLightChime(b, 1042, 920, 0.62, 0.05, 0.42);
        addTransientStack(b, 0.075, 1048, 0.52, 0.1);
        addReflections(b, [21, 39, 67], 0.1, 9200);
    }, { lp: 12800, sat: 1.42, peak: 0.84, rms: 0.13, width: 1.18 }],
    ['light_crescent_sfx.wav', 0.62, (b) => {
        addBladeAir(b, 1051, 'light', 0.0, 0.48, 1.04);
        addNoise(b, { start: 0.045, duration: 0.46, seed: 1058, gain: 0.1, bp: 1600, q: 0.52, attack: 0.075, releasePow: 1.45, panStart: -0.58, panEnd: 0.58 });
        addLightChime(b, 1062, 780, 0.82, 0.04, 0.52);
        addMetalRing(b, 1068, 860, 0.32, 0.07, 0.42, 0.34);
        addReflections(b, [25, 46, 78], 0.12, 8600);
    }, { lp: 11800, sat: 1.48, peak: 0.84, rms: 0.125, width: 1.24 }],
    ['light_judgment_sfx.wav', 0.92, (b) => {
        addSanctuary(b, 1071, 0.88, 0.0, 0.56, true);
        addTone(b, { start: 0.02, duration: 0.72, seed: 1078, a: 86, b: 48, gain: 0.24, attack: 0.018, releasePow: 2.1, type: 'triangle' });
        addLightChime(b, 1084, 660, 0.9, 0.06, 0.64);
        addNoise(b, { start: 0.08, duration: 0.48, seed: 1088, gain: 0.11, bp: 420, q: 0.52, every: 7, attack: 0.02, releasePow: 1.9 });
        addReflections(b, [35, 66, 101, 151], 0.13, 7200);
    }, { lp: 9800, sat: 1.68, peak: 0.87, rms: 0.155, width: 1.14, fadeOutMs: 24 }],
    ['light_sanctum_sfx.wav', 1.02, (b) => {
        addLightChime(b, 1091, 520, 1.08, 0.0, 0.92);
        addTone(b, { start: 0.04, duration: 0.82, seed: 1098, a: 108, b: 148, gain: 0.14, attack: 0.18, releasePow: 1.2, type: 'triangle' });
        addNoise(b, { start: 0.04, duration: 0.78, seed: 1102, gain: 0.09, bp: 920, q: 0.5, every: 5, attack: 0.16, releasePow: 1.05, panStart: -0.36, panEnd: 0.36 });
        addReflections(b, [48, 91, 144], 0.12, 7600);
    }, { lp: 9400, sat: 1.38, peak: 0.82, rms: 0.16, width: 1.18, fadeOutMs: 32 }],

    ['tiger_claw_sfx.wav', 0.4, (b) => {
        addTigerBody(b, 2001, 1.12, 0.0, 0.34);
        addBladeAir(b, 2008, 'tiger', 0.01, 0.28, 0.8);
        addTransientStack(b, 0.045, 2012, 0.58, 0.18);
        addFilteredBurst(b, 0.08, 0.13, 2018, 2600, 1.0, 0.12, -0.08);
        addReflections(b, [16, 28, 44], 0.075, 5200);
    }, { lp: 8600, sat: 1.95, peak: 0.86, rms: 0.155, width: 1.1 }],
    ['tiger_fang_sfx.wav', 0.5, (b) => {
        addTigerBody(b, 2021, 1.05, 0.0, 0.4);
        addTone(b, { start: 0.016, duration: 0.34, seed: 2028, a: 250, b: 820, gain: 0.085, attack: 0.03, releasePow: 1.65, type: 'softSaw', panStart: -0.18, panEnd: 0.24 });
        addBladeAir(b, 2032, 'tiger', 0.035, 0.24, 0.7);
        addTransientStack(b, 0.065, 2038, 0.58, -0.12);
        addReflections(b, [19, 35, 58], 0.08, 5800);
    }, { lp: 8800, sat: 1.88, peak: 0.86, rms: 0.15, width: 1.12 }],
    ['tiger_rend_sfx.wav', 0.58, (b) => {
        addTigerBody(b, 2041, 1.08, 0.0, 0.44);
        addBladeAir(b, 2048, 'tiger', 0.0, 0.43, 0.92);
        addNoise(b, { start: 0.055, duration: 0.4, seed: 2054, gain: 0.11, bp: 1350, q: 0.55, attack: 0.055, releasePow: 1.45, panStart: -0.54, panEnd: 0.54 });
        addTransientStack(b, 0.075, 2060, 0.55, 0.2);
        addReflections(b, [23, 41, 69], 0.085, 5600);
    }, { lp: 8300, sat: 1.96, peak: 0.86, rms: 0.155, width: 1.18 }],
    ['tiger_quake_sfx.wav', 0.9, (b) => {
        addTigerBody(b, 2061, 0.9, 0.0, 0.58);
        addTone(b, { start: 0.0, duration: 0.62, seed: 2068, a: 62, b: 34, gain: 0.36, attack: 0.006, releasePow: 2.25, type: 'triangle' });
        addNoise(b, { start: 0.008, duration: 0.52, seed: 2072, gain: 0.28, bp: 210, q: 0.48, every: 11, attack: 0.006, releasePow: 2.0 });
        addTransientStack(b, 0.018, 2078, 1.05, 0);
        addTail(b, 2084, 0.16, 0.66, { gain: 0.055, bp: 680, q: 0.5, every: 7, attack: 0.12, releasePow: 1.05 });
        addReflections(b, [29, 54, 86, 129], 0.1, 3200);
    }, { lp: 4800, sat: 2.05, peak: 0.89, rms: 0.18, width: 1.08, fadeOutMs: 28 }],
    ['tiger_guard_sfx.wav', 0.96, (b) => {
        addTigerBody(b, 2091, 0.92, 0.0, 0.72);
        addTone(b, { start: 0.04, duration: 0.76, seed: 2098, a: 92, b: 132, gain: 0.22, attack: 0.1, releasePow: 1.18, type: 'triangle', vibrato: 4 });
        addNoise(b, { start: 0.07, duration: 0.68, seed: 2102, gain: 0.1, bp: 640, q: 0.5, attack: 0.11, releasePow: 1.2, panStart: -0.34, panEnd: 0.34 });
        addMetalRing(b, 2108, 260, 0.23, 0.08, 0.62, 0.16);
        addReflections(b, [38, 74, 118], 0.105, 3900);
    }, { lp: 5600, sat: 1.82, peak: 0.85, rms: 0.165, width: 1.14, fadeOutMs: 32 }],

    ['flame_spark_sfx.wav', 0.46, (b) => {
        addFire(b, 3001, 1.02, 0.0, 0.36, false);
        addTone(b, { start: 0.018, duration: 0.26, seed: 3008, a: 340, b: 920, gain: 0.075, attack: 0.022, releasePow: 1.7, type: 'softSaw', panStart: -0.2, panEnd: 0.2 });
        addTransientStack(b, 0.035, 3014, 0.44, -0.08);
        addReflections(b, [18, 32, 53], 0.08, 6400);
    }, { lp: 9800, sat: 1.9, peak: 0.85, rms: 0.15, width: 1.16 }],
    ['flame_bolt_sfx.wav', 0.54, (b) => {
        addFire(b, 3021, 1.08, 0.0, 0.44, false);
        addTone(b, { start: 0.018, duration: 0.36, seed: 3028, a: 420, b: 1260, gain: 0.085, attack: 0.018, releasePow: 1.58, type: 'softSaw', panStart: -0.34, panEnd: 0.36 });
        addNoise(b, { start: 0.06, duration: 0.32, seed: 3034, gain: 0.09, bp: 2100, q: 0.7, attack: 0.03, releasePow: 1.7, panStart: -0.25, panEnd: 0.32 });
        addReflections(b, [22, 39, 63], 0.085, 6600);
    }, { lp: 10200, sat: 1.92, peak: 0.86, rms: 0.15, width: 1.18 }],
    ['flame_arc_sfx.wav', 0.62, (b) => {
        addBladeAir(b, 3041, 'flame', 0.0, 0.46, 0.94);
        addFire(b, 3048, 0.95, 0.02, 0.48, false);
        addNoise(b, { start: 0.05, duration: 0.43, seed: 3055, gain: 0.11, bp: 1850, q: 0.58, attack: 0.05, releasePow: 1.42, panStart: -0.54, panEnd: 0.54 });
        addTransientStack(b, 0.07, 3062, 0.44, 0.15);
        addReflections(b, [24, 43, 70], 0.09, 6200);
    }, { lp: 9300, sat: 1.98, peak: 0.86, rms: 0.15, width: 1.2 }],
    ['flame_meteor_sfx.wav', 1.04, (b) => {
        addFire(b, 3071, 1.15, 0.0, 0.72, true);
        addTone(b, { start: 0.0, duration: 0.78, seed: 3078, a: 88, b: 38, gain: 0.32, attack: 0.025, releasePow: 2.05, type: 'triangle' });
        addNoise(b, { start: 0.12, duration: 0.54, seed: 3082, gain: 0.26, bp: 260, q: 0.55, every: 11, attack: 0.035, releasePow: 1.75 });
        addTransientStack(b, 0.17, 3088, 1.05, 0);
        addTail(b, 3094, 0.24, 0.72, { gain: 0.07, bp: 1050, q: 0.45, every: 4, attack: 0.12, releasePow: 0.95 });
        addReflections(b, [35, 67, 106, 161], 0.13, 4100);
    }, { lp: 5900, sat: 2.12, peak: 0.9, rms: 0.18, width: 1.1, fadeOutMs: 34 }],
    ['flame_inferno_sfx.wav', 1.08, (b) => {
        addFire(b, 3101, 1.2, 0.0, 0.94, true);
        addTone(b, { start: 0.04, duration: 0.84, seed: 3108, a: 128, b: 190, gain: 0.16, attack: 0.14, releasePow: 1.05, type: 'softSaw', vibrato: 5 });
        addNoise(b, { start: 0.08, duration: 0.78, seed: 3112, gain: 0.14, bp: 1450, q: 0.45, attack: 0.1, releasePow: 1.05, panStart: -0.46, panEnd: 0.46 });
        addTail(b, 3118, 0.22, 0.76, { gain: 0.065, bp: 2600, q: 0.52, every: 2, attack: 0.14, releasePow: 1.0 });
        addReflections(b, [33, 62, 99, 145], 0.13, 5400);
    }, { lp: 7900, sat: 1.95, peak: 0.87, rms: 0.17, width: 1.2, fadeOutMs: 36 }],

    ['sanctuary_mace_sfx.wav', 0.54, (b) => {
        addSanctuary(b, 4001, 0.98, 0.0, 0.44, true);
        addTone(b, { start: 0.0, duration: 0.32, seed: 4008, a: 82, b: 48, gain: 0.23, attack: 0.008, releasePow: 2.4, type: 'triangle' });
        addMetalRing(b, 4014, 540, 0.5, 0.04, 0.34, 0.24);
        addReflections(b, [22, 41, 68], 0.1, 7200);
    }, { lp: 8800, sat: 1.62, peak: 0.85, rms: 0.155, width: 1.12 }],
    ['sanctuary_orb_sfx.wav', 0.62, (b) => {
        addSanctuary(b, 4021, 1.05, 0.0, 0.56, false);
        addTone(b, { start: 0.04, duration: 0.46, seed: 4028, a: 440, b: 910, gain: 0.065, attack: 0.06, releasePow: 1.45, type: 'triangle', panStart: -0.22, panEnd: 0.26 });
        addLightChime(b, 4034, 880, 0.38, 0.08, 0.46);
        addReflections(b, [31, 55, 88], 0.1, 8200);
    }, { lp: 9400, sat: 1.35, peak: 0.82, rms: 0.13, width: 1.18, fadeOutMs: 24 }],
    ['sanctuary_arc_sfx.wav', 0.66, (b) => {
        addBladeAir(b, 4041, 'light', 0.0, 0.46, 0.86);
        addSanctuary(b, 4048, 0.76, 0.03, 0.5, false);
        addNoise(b, { start: 0.055, duration: 0.46, seed: 4055, gain: 0.075, bp: 1180, q: 0.55, attack: 0.06, releasePow: 1.55, panStart: -0.5, panEnd: 0.5 });
        addReflections(b, [27, 48, 79], 0.105, 8000);
    }, { lp: 9400, sat: 1.42, peak: 0.82, rms: 0.125, width: 1.22 }],
    ['sanctuary_seal_sfx.wav', 0.92, (b) => {
        addSanctuary(b, 4061, 1.15, 0.0, 0.68, true);
        addTone(b, { start: 0.05, duration: 0.66, seed: 4068, a: 220, b: 330, gain: 0.1, attack: 0.1, releasePow: 1.32, type: 'triangle' });
        addLightChime(b, 4074, 620, 0.72, 0.08, 0.62);
        addTransientStack(b, 0.095, 4080, 0.48, 0);
        addReflections(b, [34, 64, 102, 154], 0.12, 7600);
    }, { lp: 8600, sat: 1.48, peak: 0.84, rms: 0.145, width: 1.16, fadeOutMs: 28 }],
    ['sanctuary_field_sfx.wav', 1.08, (b) => {
        addSanctuary(b, 4091, 1.22, 0.0, 0.92, false);
        addTone(b, { start: 0.05, duration: 0.88, seed: 4098, a: 164, b: 220, gain: 0.11, attack: 0.18, releasePow: 1.08, type: 'triangle' });
        addNoise(b, { start: 0.08, duration: 0.8, seed: 4102, gain: 0.08, bp: 740, q: 0.55, attack: 0.15, releasePow: 1.0, panStart: -0.4, panEnd: 0.4 });
        addLightChime(b, 4108, 520, 0.62, 0.12, 0.82);
        addReflections(b, [46, 86, 138], 0.12, 7600);
    }, { lp: 8500, sat: 1.32, peak: 0.82, rms: 0.155, width: 1.18, fadeOutMs: 36 }],
];

ensureDir(OUT);
for (const [file, dur, build, opts] of recipes) {
    const buf = stereo(dur);
    build(buf);
    finalize(buf, opts);
    writeWav(file, buf);
    console.log(`generated ${file}`);
}
