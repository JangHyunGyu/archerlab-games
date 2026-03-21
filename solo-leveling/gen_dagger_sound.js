/**
 * dagger.wav - Realistic sword slash / blade swing sound
 * Multi-layer synthesis: whoosh + metallic ring + blade cut + impact
 * node gen_dagger_sound.js
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
function hpf(buf, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = rc / (rc + dt);
    let prevIn = 0, prevOut = 0;
    for (let i = 0; i < buf.length; i++) {
        const x = buf[i];
        prevOut = a * (prevOut + x - prevIn);
        prevIn = x;
        buf[i] = prevOut;
    }
    return buf;
}
function writeWav(filePath, buf) {
    const numSamples = buf.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + numSamples * 2, 4);
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
    header.writeUInt32LE(numSamples * 2, 40);
    const data = Buffer.alloc(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, buf[i]));
        data.writeInt16LE(Math.floor(s * 32767), i * 2);
    }
    fs.writeFileSync(filePath, Buffer.concat([header, data]));
}

// ===== DAGGER SLASH SOUND =====
const DUR = 0.25;

// Layer 1: Whoosh (air being cut - shaped noise sweep)
function makeWhoosh() {
    const buf = makeBuffer(DUR);
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        const noise = (Math.random() * 2 - 1);
        // Fast attack, medium decay envelope
        const e = env(t, 0.005, 0.08, 0.15, 0.1, DUR);
        // Pitch sweep: high → low (simulates blade moving through air)
        const sweepFreq = 3000 + (1 - t / DUR) * 5000;
        const bandpass = Math.sin(2 * Math.PI * sweepFreq * t);
        buf[i] = noise * e * 0.6 * (0.3 + Math.abs(bandpass) * 0.7);
    }
    hpf(buf, 800);
    lpf(buf, 9000);
    return buf;
}

// Layer 2: Metallic ring (blade resonance - tuned sine harmonics)
function makeMetallicRing() {
    const buf = makeBuffer(DUR);
    const freqs = [2800, 4200, 5600, 7100, 8500]; // metallic harmonics
    const amps = [0.35, 0.25, 0.18, 0.12, 0.08];
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        // Sharp attack, quick decay
        const e = env(t, 0.001, 0.04, 0.02, 0.15, DUR);
        let sample = 0;
        for (let h = 0; h < freqs.length; h++) {
            // Slight detuning for realism
            const detune = 1 + (Math.random() - 0.5) * 0.003;
            sample += Math.sin(2 * Math.PI * freqs[h] * detune * t) * amps[h];
        }
        buf[i] = sample * e * 0.4;
    }
    return buf;
}

// Layer 3: Blade cut (sharp transient - pitched noise burst)
function makeBladeCut() {
    const buf = makeBuffer(DUR);
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        // Ultra-fast transient
        const e = t < 0.003 ? t / 0.003 : Math.exp(-t * 40);
        const noise = Math.random() * 2 - 1;
        // High frequency emphasis
        const tone = Math.sin(2 * Math.PI * 6000 * t) * 0.5;
        buf[i] = (noise * 0.6 + tone * 0.4) * e * 0.5;
    }
    hpf(buf, 2000);
    return buf;
}

// Layer 4: Low swoosh body (gives weight to the swing)
function makeSwooshBody() {
    const buf = makeBuffer(DUR);
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        const e = env(t, 0.01, 0.06, 0.08, 0.12, DUR);
        const noise = Math.random() * 2 - 1;
        // Low-mid frequency body
        const freq = 400 + (1 - t / DUR) * 600;
        const shaped = noise * (0.5 + 0.5 * Math.sin(2 * Math.PI * freq * t));
        buf[i] = shaped * e * 0.35;
    }
    lpf(buf, 2500);
    hpf(buf, 150);
    return buf;
}

// Layer 5: Subtle "shing" (high metallic glint at the start)
function makeShing() {
    const buf = makeBuffer(DUR);
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        // Very fast attack and decay
        const e = t < 0.002 ? t / 0.002 : Math.exp(-t * 60);
        // High pitched metallic
        const s1 = Math.sin(2 * Math.PI * 9500 * t);
        const s2 = Math.sin(2 * Math.PI * 11200 * t);
        const s3 = Math.sin(2 * Math.PI * 13400 * t);
        buf[i] = (s1 * 0.4 + s2 * 0.35 + s3 * 0.25) * e * 0.3;
    }
    return buf;
}

// Mix all layers
const whoosh = makeWhoosh();
const ring = makeMetallicRing();
const cut = makeBladeCut();
const body = makeSwooshBody();
const shing = makeShing();

const final = makeBuffer(DUR);
for (let i = 0; i < final.length; i++) {
    final[i] = (whoosh[i] || 0) * 0.35
             + (ring[i] || 0) * 0.2
             + (cut[i] || 0) * 0.15
             + (body[i] || 0) * 0.18
             + (shing[i] || 0) * 0.12;
}
normalize(final, 0.9);

const outPath = path.join(__dirname, 'sounds', 'dagger.wav');
writeWav(outPath, final);
console.log('dagger.wav generated:', outPath, `(${(final.length / RATE * 1000).toFixed(0)}ms)`);
