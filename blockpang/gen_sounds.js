// BlockPang WAV Sound Generator - Ultra Satisfying Block Puzzle Sounds
// Generates: block_break, glass_shatter, combo_hit, clear_single, clear_double,
//            clear_triple, clear_quad, impact_heavy, sparkle, whoosh
const fs = require('fs');
const path = require('path');

const RATE = 44100;
const outDir = path.join(__dirname, 'sounds');

// ─── DSP Utilities ───────────────────────────────────────────────
function makeBuffer(seconds) { return new Float32Array(Math.ceil(RATE * seconds)); }

function mix(a, b, bVol = 1) {
    const out = new Float32Array(Math.max(a.length, b.length));
    for (let i = 0; i < out.length; i++) {
        out[i] = (i < a.length ? a[i] : 0) + (i < b.length ? b[i] : 0) * bVol;
    }
    return out;
}

function mixMulti(...layers) {
    let maxLen = 0;
    for (const [buf] of layers) maxLen = Math.max(maxLen, buf.length);
    const out = new Float32Array(maxLen);
    for (const [buf, vol = 1] of layers) {
        for (let i = 0; i < buf.length; i++) out[i] += buf[i] * vol;
    }
    return out;
}

function normalize(buf, peak = 0.95) {
    let max = 0;
    for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
    if (max > 0) { const s = peak / max; for (let i = 0; i < buf.length; i++) buf[i] *= s; }
    return buf;
}

function env(t, a, d, s, r, total) {
    if (t < a) return t / a;
    if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
    if (t < total - r) return s;
    return s * (1 - (t - (total - r)) / r);
}

function saturate(x, drive = 2) { return Math.tanh(x * drive); }

function lpf(samples, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = dt / (rc + dt);
    const out = new Float32Array(samples.length);
    out[0] = samples[0];
    for (let i = 1; i < samples.length; i++) out[i] = out[i - 1] + a * (samples[i] - out[i - 1]);
    return out;
}

function hpf(samples, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = rc / (rc + dt);
    const out = new Float32Array(samples.length);
    out[0] = samples[0];
    for (let i = 1; i < samples.length; i++) out[i] = a * (out[i - 1] + samples[i] - samples[i - 1]);
    return out;
}

function bpf(samples, center, width) {
    return hpf(lpf(samples, center + width / 2), center - width / 2);
}

function dynamicLpf(samples, cutoffFn) {
    const out = new Float32Array(samples.length);
    let prev = 0;
    for (let i = 0; i < samples.length; i++) {
        const t = i / RATE;
        const cutoff = cutoffFn(t);
        const rc = 1 / (2 * Math.PI * cutoff);
        const dt = 1 / RATE;
        const a = dt / (rc + dt);
        out[i] = prev + a * (samples[i] - prev);
        prev = out[i];
    }
    return out;
}

function reverb(samples, wet = 0.3, roomSize = 'medium') {
    const presets = {
        small: [0.013, 0.017, 0.023, 0.029, 0.037],
        medium: [0.017, 0.023, 0.031, 0.041, 0.053, 0.067, 0.079],
        large: [0.023, 0.037, 0.053, 0.071, 0.089, 0.101, 0.127, 0.149, 0.173, 0.199],
    };
    const delays = presets[roomSize] || presets.medium;
    const dry = 1 - wet;
    const out = new Float32Array(samples.length + Math.ceil(RATE * 0.2));
    for (let i = 0; i < samples.length; i++) out[i] += samples[i] * dry;
    const tapGain = wet / delays.length;
    for (const d of delays) {
        const delaySamples = Math.round(d * RATE);
        const feedback = 0.3 + Math.random() * 0.15;
        for (let i = 0; i < samples.length; i++) {
            const idx = i + delaySamples;
            if (idx < out.length) out[idx] += samples[i] * tapGain * feedback;
        }
    }
    return out.subarray(0, samples.length);
}

function pitchEnv(startFreq, endFreq, duration) {
    return (t) => {
        const p = Math.min(t / duration, 1);
        return startFreq * Math.pow(endFreq / startFreq, p);
    };
}

// ─── Sound Generators ────────────────────────────────────────────

function genBlockBreak() {
    // Satisfying ceramic/glass block shattering - crisp and punchy
    const dur = 0.35;
    const buf = makeBuffer(dur);

    // Layer 1: Impact transient - short sharp click
    const click = makeBuffer(dur);
    for (let i = 0; i < click.length; i++) {
        const t = i / RATE;
        const e = Math.exp(-t * 200);
        click[i] = (Math.random() * 2 - 1) * e * 0.8;
    }

    // Layer 2: Ceramic crack - mid-frequency burst
    const crack = makeBuffer(dur);
    for (let i = 0; i < crack.length; i++) {
        const t = i / RATE;
        const freq = 2000 * Math.exp(-t * 15);
        const e = Math.exp(-t * 40);
        crack[i] = Math.sin(2 * Math.PI * freq * t + Math.sin(t * 5000) * 3) * e;
    }

    // Layer 3: Glass shatter spray - filtered noise
    const shatter = makeBuffer(dur);
    for (let i = 0; i < shatter.length; i++) {
        const t = i / RATE;
        const e = Math.exp(-t * 20) * env(t, 0.001, 0.05, 0.3, 0.1, dur);
        shatter[i] = (Math.random() * 2 - 1) * e;
    }
    const shatterFiltered = dynamicLpf(shatter, t => 8000 * Math.exp(-t * 8) + 1000);

    // Layer 4: Sub impact thump
    const sub = makeBuffer(dur);
    for (let i = 0; i < sub.length; i++) {
        const t = i / RATE;
        const freq = 120 * Math.exp(-t * 30);
        const e = Math.exp(-t * 50);
        sub[i] = Math.sin(2 * Math.PI * freq * t) * e;
    }

    // Layer 5: Bright tinkle harmonics
    const tinkle = makeBuffer(dur);
    for (let i = 0; i < tinkle.length; i++) {
        const t = i / RATE;
        const e = Math.exp(-t * 25);
        tinkle[i] = (Math.sin(t * 2 * Math.PI * 4500) * 0.3 +
                     Math.sin(t * 2 * Math.PI * 6200) * 0.2 +
                     Math.sin(t * 2 * Math.PI * 8100) * 0.15) * e;
    }

    const result = mixMulti([click, 0.7], [crack, 0.9], [shatterFiltered, 0.6], [sub, 0.8], [tinkle, 0.4]);
    return normalize(reverb(result, 0.15, 'small'));
}

function genGlassShatter() {
    // Heavy glass shatter for multi-clears - longer, more dramatic
    const dur = 0.6;

    // Layer 1: Heavy impact
    const impact = makeBuffer(dur);
    for (let i = 0; i < impact.length; i++) {
        const t = i / RATE;
        const freq = 80 * Math.exp(-t * 25);
        impact[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 35) * 1.2;
    }

    // Layer 2: Multiple crack cascades
    const cracks = makeBuffer(dur);
    for (let c = 0; c < 5; c++) {
        const offset = c * 0.03;
        const freq = 1500 + c * 800 + Math.random() * 500;
        for (let i = 0; i < cracks.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            const e = Math.exp(-t * 30);
            cracks[i] += Math.sin(2 * Math.PI * freq * t * (1 - t * 5) + Math.random() * 0.5) * e * 0.4;
        }
    }

    // Layer 3: Long shatter spray
    const spray = makeBuffer(dur);
    for (let i = 0; i < spray.length; i++) {
        const t = i / RATE;
        const e = env(t, 0.003, 0.1, 0.4, 0.2, dur) * Math.exp(-t * 6);
        spray[i] = (Math.random() * 2 - 1) * e;
    }
    const sprayFiltered = dynamicLpf(spray, t => 12000 * Math.exp(-t * 5) + 2000);

    // Layer 4: Metallic ring
    const ring = makeBuffer(dur);
    for (let i = 0; i < ring.length; i++) {
        const t = i / RATE;
        const e = Math.exp(-t * 10);
        ring[i] = (Math.sin(t * 2 * Math.PI * 3200) +
                   Math.sin(t * 2 * Math.PI * 5100 * 1.414) * 0.5 +
                   Math.sin(t * 2 * Math.PI * 7300) * 0.3) * e * 0.3;
    }

    // Layer 5: Secondary debris
    const debris = makeBuffer(dur);
    for (let i = 0; i < debris.length; i++) {
        const t = i / RATE;
        if (t < 0.05) continue;
        const e = Math.exp(-(t - 0.05) * 12);
        debris[i] = (Math.random() * 2 - 1) * e * 0.5 *
                    (1 + Math.sin(t * 2 * Math.PI * 200) * 0.3);
    }
    const debrisFiltered = bpf(debris, 4000, 6000);

    const result = mixMulti([impact, 0.9], [cracks, 0.7], [sprayFiltered, 0.8], [ring, 0.5], [debrisFiltered, 0.4]);
    return normalize(reverb(result, 0.2, 'medium'));
}

function genComboHit() {
    // Punchy satisfying combo hit - like a power chord impact
    const dur = 0.4;

    // Layer 1: Heavy membrane thump
    const thump = makeBuffer(dur);
    for (let i = 0; i < thump.length; i++) {
        const t = i / RATE;
        const freq = 200 * Math.exp(-t * 40);
        thump[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 30);
    }

    // Layer 2: Power chord - root + fifth + octave
    const chord = makeBuffer(dur);
    for (let i = 0; i < chord.length; i++) {
        const t = i / RATE;
        const e = env(t, 0.003, 0.1, 0.4, 0.15, dur);
        chord[i] = (Math.sin(t * 2 * Math.PI * 440) * 0.4 +
                    Math.sin(t * 2 * Math.PI * 660) * 0.3 +
                    Math.sin(t * 2 * Math.PI * 880) * 0.25 +
                    Math.sin(t * 2 * Math.PI * 1320) * 0.15) * e;
    }

    // Layer 3: Noise burst
    const noise = makeBuffer(dur);
    for (let i = 0; i < noise.length; i++) {
        const t = i / RATE;
        noise[i] = (Math.random() * 2 - 1) * Math.exp(-t * 35);
    }
    const noiseFiltered = bpf(noise, 3000, 4000);

    // Layer 4: FM impact sizzle
    const fm = makeBuffer(dur);
    for (let i = 0; i < fm.length; i++) {
        const t = i / RATE;
        const mod = Math.sin(t * 2 * Math.PI * 880) * (8 * Math.exp(-t * 20));
        fm[i] = Math.sin(t * 2 * Math.PI * 440 + mod) * Math.exp(-t * 18) * 0.5;
    }

    // Layer 5: Crispy click transient
    const click = makeBuffer(dur);
    for (let i = 0; i < click.length; i++) {
        const t = i / RATE;
        click[i] = Math.sin(t * 2 * Math.PI * 3000) * Math.exp(-t * 300) * 0.6;
    }

    const result = mixMulti([thump, 1.0], [chord, 0.6], [noiseFiltered, 0.4], [fm, 0.5], [click, 0.5]);
    return normalize(reverb(saturateArr(result, 1.5), 0.15, 'small'));
}

function saturateArr(buf, drive) {
    const out = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = saturate(buf[i], drive);
    return out;
}

function genClearSingle() {
    // Clean ascending arpeggio ding - C E G
    const dur = 0.5;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5

    const buf = makeBuffer(dur);
    notes.forEach((freq, idx) => {
        const offset = idx * 0.05;
        for (let i = 0; i < buf.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            const e = env(t, 0.002, 0.06, 0.3, 0.15, dur - offset);
            buf[i] += Math.sin(t * 2 * Math.PI * freq) * e * 0.4;
            // Harmonic shimmer
            buf[i] += Math.sin(t * 2 * Math.PI * freq * 2) * e * 0.12;
            buf[i] += Math.sin(t * 2 * Math.PI * freq * 3) * e * 0.06;
        }
    });

    // Sparkle on top
    const sparkle = makeBuffer(dur);
    for (let i = 0; i < sparkle.length; i++) {
        const t = i / RATE;
        sparkle[i] = Math.sin(t * 2 * Math.PI * 4000) * Math.exp(-t * 20) * 0.15;
    }

    // Soft sub hit
    const sub = makeBuffer(dur);
    for (let i = 0; i < sub.length; i++) {
        const t = i / RATE;
        sub[i] = Math.sin(t * 2 * Math.PI * 80 * Math.exp(-t * 30)) * Math.exp(-t * 40);
    }

    return normalize(reverb(mixMulti([buf, 1], [sparkle, 1], [sub, 0.6]), 0.2, 'medium'));
}

function genClearDouble() {
    // Fuller chord + sweep - C E G C6
    const dur = 0.65;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    const melody = makeBuffer(dur);
    notes.forEach((freq, idx) => {
        const offset = idx * 0.045;
        for (let i = 0; i < melody.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            const e = env(t, 0.002, 0.08, 0.4, 0.2, dur - offset);
            melody[i] += Math.sin(t * 2 * Math.PI * freq) * e * 0.35;
            melody[i] += Math.sin(t * 2 * Math.PI * freq * 2) * e * 0.1;
        }
    });

    // Chord pad underneath
    const pad = makeBuffer(dur);
    for (let i = 0; i < pad.length; i++) {
        const t = i / RATE;
        if (t < 0.03) continue;
        const e = env(t - 0.03, 0.01, 0.15, 0.35, 0.2, dur - 0.03);
        pad[i] = (Math.sin(t * 2 * Math.PI * 523.25) * 0.2 +
                  Math.sin(t * 2 * Math.PI * 659.25) * 0.15 +
                  Math.sin(t * 2 * Math.PI * 783.99) * 0.12) * e;
    }

    // Sweep whoosh
    const sweep = makeBuffer(dur);
    for (let i = 0; i < sweep.length; i++) {
        const t = i / RATE;
        const freq = 100 + t * 2000;
        sweep[i] = (Math.random() * 2 - 1) * env(t, 0.005, 0.15, 0.2, 0.1, dur) * 0.3;
    }
    const sweepFiltered = dynamicLpf(sweep, t => 500 + t * 8000);

    // Impact
    const impact = makeBuffer(dur);
    for (let i = 0; i < impact.length; i++) {
        const t = i / RATE;
        impact[i] = Math.sin(t * 2 * Math.PI * 100 * Math.exp(-t * 25)) * Math.exp(-t * 35);
    }

    // Glass crack accent
    const crack = makeBuffer(dur);
    for (let i = 0; i < crack.length; i++) {
        const t = i / RATE;
        if (t < 0.01) continue;
        const e = Math.exp(-(t - 0.01) * 30);
        crack[i] = (Math.random() * 2 - 1) * e * 0.3;
    }
    const crackFiltered = bpf(crack, 5000, 6000);

    return normalize(reverb(mixMulti([melody, 1], [pad, 0.7], [sweepFiltered, 0.5], [impact, 0.8], [crackFiltered, 0.4]), 0.2, 'medium'));
}

function genClearTriple() {
    // Powerful arpeggio + double impact - epic and thrilling
    const dur = 0.8;
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1318.51]; // C5 E5 G5 B5 D6 E6

    const melody = makeBuffer(dur);
    notes.forEach((freq, idx) => {
        const offset = idx * 0.04;
        for (let i = 0; i < melody.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            const e = env(t, 0.001, 0.1, 0.5, 0.25, dur - offset);
            melody[i] += Math.sin(t * 2 * Math.PI * freq) * e * 0.3;
            melody[i] += Math.sin(t * 2 * Math.PI * freq * 2) * e * 0.1;
            melody[i] += Math.sin(t * 2 * Math.PI * freq * 3) * e * 0.04;
        }
    });

    // Power chord
    const chord = makeBuffer(dur);
    for (let i = 0; i < chord.length; i++) {
        const t = i / RATE;
        if (t < 0.02) continue;
        const e = env(t - 0.02, 0.008, 0.15, 0.4, 0.2, dur - 0.02);
        chord[i] = (Math.sin(t * 2 * Math.PI * 523.25) +
                    Math.sin(t * 2 * Math.PI * 659.25) * 0.8 +
                    Math.sin(t * 2 * Math.PI * 783.99) * 0.7 +
                    Math.sin(t * 2 * Math.PI * 987.77) * 0.5) * e * 0.15;
    }

    // FM shimmer
    const fm = makeBuffer(dur);
    for (let i = 0; i < fm.length; i++) {
        const t = i / RATE;
        if (t < 0.1) continue;
        const mod = Math.sin(t * 2 * Math.PI * 1174.66 * 4) * (8 * Math.exp(-(t - 0.1) * 10));
        fm[i] = Math.sin(t * 2 * Math.PI * 1174.66 + mod) * env(t - 0.1, 0.005, 0.12, 0.3, 0.15, dur - 0.1) * 0.25;
    }

    // Double impact
    const impact = makeBuffer(dur);
    for (let i = 0; i < impact.length; i++) {
        const t = i / RATE;
        impact[i] = Math.sin(t * 2 * Math.PI * 70 * Math.exp(-t * 20)) * Math.exp(-t * 30);
        if (t > 0.08) {
            const t2 = t - 0.08;
            impact[i] += Math.sin(t2 * 2 * Math.PI * 50 * Math.exp(-t2 * 25)) * Math.exp(-t2 * 35) * 0.7;
        }
    }

    // Noise crash
    const noise = makeBuffer(dur);
    for (let i = 0; i < noise.length; i++) {
        const t = i / RATE;
        noise[i] = (Math.random() * 2 - 1) * env(t, 0.002, 0.1, 0.3, 0.15, dur) * Math.exp(-t * 8);
    }
    const noiseFiltered = dynamicLpf(noise, t => 10000 * Math.exp(-t * 5) + 1500);

    // Double glass crack
    const cracks = makeBuffer(dur);
    for (let c = 0; c < 3; c++) {
        const offset = c * 0.04 + 0.01;
        for (let i = 0; i < cracks.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            const freq = 3000 + c * 1000;
            cracks[i] += Math.sin(t * 2 * Math.PI * freq * (1 + Math.sin(t * 800) * 0.5)) * Math.exp(-t * 25) * 0.2;
        }
    }

    const result = mixMulti([melody, 1], [chord, 0.8], [fm, 0.6], [impact, 1], [noiseFiltered, 0.5], [cracks, 0.5]);
    return normalize(reverb(result, 0.22, 'medium'));
}

function genClearQuad() {
    // EUPHORIC EXPLOSION - Full orchestra feeling, maximum satisfaction
    const dur = 1.0;
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1318.51, 1567.98]; // C5-G6

    const melody = makeBuffer(dur);
    notes.forEach((freq, idx) => {
        const offset = idx * 0.035;
        for (let i = 0; i < melody.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            const e = env(t, 0.001, 0.12, 0.6, 0.3, dur - offset);
            melody[i] += Math.sin(t * 2 * Math.PI * freq) * e * 0.28;
            melody[i] += Math.sin(t * 2 * Math.PI * freq * 2) * e * 0.09;
            melody[i] += Math.sin(t * 2 * Math.PI * freq * 3) * e * 0.04;
            melody[i] += Math.sin(t * 2 * Math.PI * freq * 4) * e * 0.02;
        }
    });

    // Massive chord
    const chord = makeBuffer(dur);
    for (let i = 0; i < chord.length; i++) {
        const t = i / RATE;
        if (t < 0.02) continue;
        const e = env(t - 0.02, 0.01, 0.2, 0.5, 0.3, dur - 0.02);
        const freqs = [523.25, 659.25, 783.99, 987.77, 1174.66];
        freqs.forEach((f, idx) => {
            chord[i] += Math.sin(t * 2 * Math.PI * f) * e * (0.2 - idx * 0.02);
        });
    }

    // Dual FM shimmer
    const fm = makeBuffer(dur);
    for (let i = 0; i < fm.length; i++) {
        const t = i / RATE;
        if (t < 0.08) continue;
        const t2 = t - 0.08;
        const mod1 = Math.sin(t2 * 2 * Math.PI * 1318.51 * 5) * (12 * Math.exp(-t2 * 8));
        fm[i] += Math.sin(t2 * 2 * Math.PI * 1318.51 + mod1) * env(t2, 0.005, 0.15, 0.35, 0.2, dur - 0.08) * 0.2;
        if (t > 0.15) {
            const t3 = t - 0.15;
            const mod2 = Math.sin(t3 * 2 * Math.PI * 1567.98 * 3) * (8 * Math.exp(-t3 * 10));
            fm[i] += Math.sin(t3 * 2 * Math.PI * 1567.98 + mod2) * env(t3, 0.005, 0.12, 0.3, 0.15, dur - 0.15) * 0.15;
        }
    }

    // Triple impact cascade
    const impact = makeBuffer(dur);
    const impactTimes = [0, 0.07, 0.14];
    const impactFreqs = [80, 55, 40];
    impactTimes.forEach((offset, idx) => {
        for (let i = 0; i < impact.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            impact[i] += Math.sin(t * 2 * Math.PI * impactFreqs[idx] * Math.exp(-t * 20)) *
                         Math.exp(-t * 25) * (1 - idx * 0.15);
        }
    });

    // White noise crash - big and dramatic
    const crash = makeBuffer(dur);
    for (let i = 0; i < crash.length; i++) {
        const t = i / RATE;
        crash[i] = (Math.random() * 2 - 1) * env(t, 0.005, 0.15, 0.4, 0.25, dur) * Math.exp(-t * 4);
    }
    const crashFiltered = dynamicLpf(crash, t => 15000 * Math.exp(-t * 3) + 2000);

    // Triple glass crack explosion
    const glass = makeBuffer(dur);
    for (let c = 0; c < 4; c++) {
        const offset = c * 0.035 + 0.01;
        const freq = 2500 + c * 800;
        for (let i = 0; i < glass.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            glass[i] += Math.sin(t * 2 * Math.PI * freq * (1 + Math.sin(t * 1200) * 0.3)) * Math.exp(-t * 20) * 0.2;
            glass[i] += (Math.random() * 2 - 1) * Math.exp(-t * 25) * 0.08;
        }
    }

    // AM shimmer tail
    const shimmer = makeBuffer(dur);
    for (let i = 0; i < shimmer.length; i++) {
        const t = i / RATE;
        if (t < 0.1) continue;
        const t2 = t - 0.1;
        const am = 1 + Math.sin(t2 * 2 * Math.PI * 6) * 0.3;
        shimmer[i] = Math.sin(t2 * 2 * Math.PI * 1046.5) * am *
                     env(t2, 0.01, 0.15, 0.3, 0.3, dur - 0.1) * 0.2;
    }

    // Epic sweep
    const sweep = makeBuffer(dur);
    for (let i = 0; i < sweep.length; i++) {
        const t = i / RATE;
        const sawFreq = 98; // G2
        let saw = 0;
        for (let h = 1; h <= 8; h++) saw += Math.sin(t * 2 * Math.PI * sawFreq * h) / h;
        sweep[i] = saw * env(t, 0.005, 0.2, 0.15, 0.15, dur) * 0.15;
    }
    const sweepFiltered = dynamicLpf(sweep, t => 300 + Math.pow(t / dur, 2) * 8000);

    const result = mixMulti(
        [melody, 1], [chord, 0.7], [fm, 0.6], [impact, 1.1],
        [crashFiltered, 0.6], [glass, 0.5], [shimmer, 0.5], [sweepFiltered, 0.5]
    );
    return normalize(reverb(saturateArr(result, 1.3), 0.25, 'large'));
}

function genImpactHeavy() {
    // Massive satisfying impact for screen-shake moments
    const dur = 0.45;

    // Sub bass drop
    const sub = makeBuffer(dur);
    for (let i = 0; i < sub.length; i++) {
        const t = i / RATE;
        const freq = 150 * Math.exp(-t * 25);
        sub[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 15);
    }

    // Compressed noise burst
    const noise = makeBuffer(dur);
    for (let i = 0; i < noise.length; i++) {
        const t = i / RATE;
        noise[i] = (Math.random() * 2 - 1) * Math.exp(-t * 20);
    }
    const noiseLpf = lpf(noise, 2500);

    // Metal clang
    const metal = makeBuffer(dur);
    for (let i = 0; i < metal.length; i++) {
        const t = i / RATE;
        metal[i] = (Math.sin(t * 2 * Math.PI * 1800) * 0.3 +
                    Math.sin(t * 2 * Math.PI * 2900 * 1.414) * 0.2 +
                    Math.sin(t * 2 * Math.PI * 4100) * 0.15) * Math.exp(-t * 18);
    }

    // Body thump
    const body = makeBuffer(dur);
    for (let i = 0; i < body.length; i++) {
        const t = i / RATE;
        body[i] = Math.sin(t * 2 * Math.PI * 200 * Math.exp(-t * 35)) * Math.exp(-t * 30) * 0.8;
    }

    const result = mixMulti([sub, 1], [noiseLpf, 0.5], [metal, 0.3], [body, 0.8]);
    return normalize(reverb(saturateArr(result, 1.8), 0.15, 'small'));
}

function genSparkle() {
    // Bright crystalline sparkle for score popups and effects
    const dur = 0.4;
    const buf = makeBuffer(dur);

    // Multiple high harmonics with staggered attacks
    const freqs = [3520, 4186, 5274, 6272, 7040]; // A7, C8 range
    freqs.forEach((freq, idx) => {
        const offset = idx * 0.015;
        for (let i = 0; i < buf.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            const e = env(t, 0.001, 0.04, 0.2, 0.15, dur - offset);
            buf[i] += Math.sin(t * 2 * Math.PI * freq) * e * (0.3 - idx * 0.04);
        }
    });

    // Tiny noise sparkle
    const noise = makeBuffer(dur);
    for (let i = 0; i < noise.length; i++) {
        const t = i / RATE;
        noise[i] = (Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.15;
    }
    const noiseHpf = hpf(noise, 6000);

    return normalize(reverb(mix(buf, noiseHpf), 0.25, 'medium'));
}

function genWhoosh() {
    // Rising whoosh sweep for combo buildup
    const dur = 0.35;
    const buf = makeBuffer(dur);

    // Filtered noise sweep
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        buf[i] = (Math.random() * 2 - 1) * env(t, 0.01, 0.15, 0.5, 0.1, dur);
    }
    const swept = dynamicLpf(buf, t => 200 + Math.pow(t / dur, 2) * 12000);

    // Tonal sweep component
    const tone = makeBuffer(dur);
    for (let i = 0; i < tone.length; i++) {
        const t = i / RATE;
        const freq = 150 + Math.pow(t / dur, 2) * 3000;
        tone[i] = Math.sin(t * 2 * Math.PI * freq) * env(t, 0.01, 0.1, 0.4, 0.1, dur) * 0.3;
    }

    return normalize(mix(swept, tone, 0.6));
}

function genPlace() {
    // Satisfying heavy place/drop thump with crystalline accent
    const dur = 0.25;

    // Deep membrane thump
    const thump = makeBuffer(dur);
    for (let i = 0; i < thump.length; i++) {
        const t = i / RATE;
        const freq = 250 * Math.exp(-t * 50);
        thump[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 35);
    }

    // Sub bass
    const sub = makeBuffer(dur);
    for (let i = 0; i < sub.length; i++) {
        const t = i / RATE;
        sub[i] = Math.sin(t * 2 * Math.PI * 60) * Math.exp(-t * 40) * 0.6;
    }

    // Sharp click
    const click = makeBuffer(dur);
    for (let i = 0; i < click.length; i++) {
        const t = i / RATE;
        click[i] = Math.sin(t * 2 * Math.PI * 2500) * Math.exp(-t * 300) * 0.5;
    }

    // Crystal accent
    const crystal = makeBuffer(dur);
    for (let i = 0; i < crystal.length; i++) {
        const t = i / RATE;
        if (t < 0.01) continue;
        crystal[i] = (Math.sin(t * 2 * Math.PI * 3136) + Math.sin(t * 2 * Math.PI * 5274) * 0.4) *
                     Math.exp(-(t - 0.01) * 30) * 0.25;
    }

    // White noise snap
    const snap = makeBuffer(dur);
    for (let i = 0; i < snap.length; i++) {
        const t = i / RATE;
        snap[i] = (Math.random() * 2 - 1) * Math.exp(-t * 150) * 0.3;
    }

    return normalize(reverb(mixMulti([thump, 1], [sub, 0.8], [click, 0.6], [crystal, 0.5], [snap, 0.4]), 0.1, 'small'));
}

function genPickup() {
    // Glass bottle clinking / lifting sound — gentle rattling glass with warm resonance
    const dur = 0.22;

    // Glass clink 1 — mid-frequency resonant tap
    const clink1 = makeBuffer(dur);
    for (let i = 0; i < clink1.length; i++) {
        const t = i / RATE;
        // Glass resonance around 800-1200Hz (pleasant mid range, not shrill)
        const f1 = 880, f2 = 1100;
        clink1[i] = (Math.sin(t * 2 * Math.PI * f1) * 0.6 +
                     Math.sin(t * 2 * Math.PI * f2) * 0.4) *
                     Math.exp(-t * 25);
    }

    // Glass clink 2 — slightly delayed second tap (달그락 double-tap feel)
    const clink2 = makeBuffer(dur);
    const delay2 = 0.04; // 40ms later
    for (let i = 0; i < clink2.length; i++) {
        const t = i / RATE;
        if (t < delay2) continue;
        const td = t - delay2;
        const f1 = 950, f2 = 1250;
        clink2[i] = (Math.sin(td * 2 * Math.PI * f1) * 0.5 +
                     Math.sin(td * 2 * Math.PI * f2) * 0.3) *
                     Math.exp(-td * 30) * 0.7;
    }

    // Soft body thud — hand touching glass
    const thud = makeBuffer(dur);
    for (let i = 0; i < thud.length; i++) {
        const t = i / RATE;
        thud[i] = Math.sin(t * 2 * Math.PI * 150) * Math.exp(-t * 45);
    }

    // Tiny filtered noise rattle
    const rattle = makeBuffer(dur);
    for (let i = 0; i < rattle.length; i++) {
        const t = i / RATE;
        rattle[i] = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.3;
    }
    const rattleFiltered = lpf(hpf(rattle, 400), 2000);

    return normalize(
        reverb(mixMulti([clink1, 0.5], [clink2, 0.4], [thud, 0.6], [rattleFiltered, 0.3]), 0.15, 'small')
    );
}

function genComboEscalate() {
    // Escalating power sound for high combos - more intense than combo_hit
    const dur = 0.5;

    // Rising power chord
    const chord = makeBuffer(dur);
    for (let i = 0; i < chord.length; i++) {
        const t = i / RATE;
        const baseFreq = 440 + t * 200; // Rising pitch
        const e = env(t, 0.003, 0.12, 0.5, 0.2, dur);
        chord[i] = (Math.sin(t * 2 * Math.PI * baseFreq) * 0.35 +
                    Math.sin(t * 2 * Math.PI * baseFreq * 1.5) * 0.25 +
                    Math.sin(t * 2 * Math.PI * baseFreq * 2) * 0.2 +
                    Math.sin(t * 2 * Math.PI * baseFreq * 3) * 0.1) * e;
    }

    // Distorted FM crunch
    const fm = makeBuffer(dur);
    for (let i = 0; i < fm.length; i++) {
        const t = i / RATE;
        const carrier = 440;
        const modIdx = 15 * Math.exp(-t * 8);
        const mod = Math.sin(t * 2 * Math.PI * carrier * 3) * modIdx;
        fm[i] = Math.sin(t * 2 * Math.PI * carrier + mod) * env(t, 0.002, 0.15, 0.4, 0.15, dur) * 0.3;
    }

    // Heavy impacts
    const impact = makeBuffer(dur);
    for (let i = 0; i < impact.length; i++) {
        const t = i / RATE;
        impact[i] = Math.sin(t * 2 * Math.PI * 100 * Math.exp(-t * 30)) * Math.exp(-t * 25);
    }

    // Noise crash
    const noise = makeBuffer(dur);
    for (let i = 0; i < noise.length; i++) {
        const t = i / RATE;
        noise[i] = (Math.random() * 2 - 1) * Math.exp(-t * 15) * env(t, 0.003, 0.08, 0.3, 0.15, dur);
    }
    const noiseFiltered = dynamicLpf(noise, t => 6000 * Math.exp(-t * 5) + 1500);

    // Glass shatter cascade
    const glass = makeBuffer(dur);
    for (let c = 0; c < 4; c++) {
        const offset = c * 0.03;
        const freq = 2000 + c * 700;
        for (let i = 0; i < glass.length; i++) {
            const t = i / RATE - offset;
            if (t < 0) continue;
            glass[i] += Math.sin(t * 2 * Math.PI * freq) * Math.exp(-t * 22) * 0.15;
        }
    }

    const result = mixMulti([chord, 0.8], [fm, 0.6], [impact, 1], [noiseFiltered, 0.5], [glass, 0.5]);
    return normalize(reverb(saturateArr(result, 1.6), 0.18, 'medium'));
}

// ─── WAV Writer ──────────────────────────────────────────────────
function writeWav(filepath, samples) {
    const numSamples = samples.length;
    const buffer = Buffer.alloc(44 + numSamples * 2);

    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(RATE, 24);
    buffer.writeUInt32LE(RATE * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
    }

    fs.writeFileSync(filepath, buffer);
    const kb = (buffer.length / 1024).toFixed(1);
    console.log(`  ${path.basename(filepath)}: ${kb}KB`);
}

// ─── Generate All Sounds ─────────────────────────────────────────
console.log('Generating BlockPang sounds...\n');

const sounds = {
    'block_break': genBlockBreak,
    'glass_shatter': genGlassShatter,
    'combo_hit': genComboHit,
    'clear_single': genClearSingle,
    'clear_double': genClearDouble,
    'clear_triple': genClearTriple,
    'clear_quad': genClearQuad,
    'impact_heavy': genImpactHeavy,
    'sparkle': genSparkle,
    'whoosh': genWhoosh,
    'place': genPlace,
    'pickup': genPickup,
    'combo_escalate': genComboEscalate,
};

for (const [name, generator] of Object.entries(sounds)) {
    const samples = generator();
    writeWav(path.join(outDir, `${name}.wav`), samples);
}

console.log('\nDone! All sounds generated.');
