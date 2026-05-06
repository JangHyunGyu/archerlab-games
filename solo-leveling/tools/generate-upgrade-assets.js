const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const RATE = 44100;

const out = (...parts) => path.join(ROOT, ...parts);
const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

// ------------------------------ WAV ------------------------------
function mkBuf(dur) {
    return new Float32Array(Math.ceil(RATE * dur));
}

function noise(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return ((s / 0xffffffff) * 2) - 1;
    };
}

function env(p, attack = 0.03, releasePow = 2) {
    if (p < attack) return Math.pow(p / attack, 2);
    return Math.pow(Math.max(0, 1 - p), releasePow);
}

function addTone(buf, freqStart, freqEnd, gain, opts = {}) {
    const phase = opts.phase || 0;
    const attack = opts.attack ?? 0.02;
    const releasePow = opts.releasePow ?? 2.2;
    const vibrato = opts.vibrato || 0;
    for (let i = 0; i < buf.length; i++) {
        const p = i / Math.max(1, buf.length - 1);
        const t = i / RATE;
        const f = freqStart + (freqEnd - freqStart) * p + Math.sin(t * Math.PI * 2 * 7) * vibrato;
        buf[i] += Math.sin(Math.PI * 2 * f * t + phase) * gain * env(p, attack, releasePow);
    }
}

function addNoise(buf, seed, gain, opts = {}) {
    const rnd = noise(seed);
    const attack = opts.attack ?? 0.01;
    const releasePow = opts.releasePow ?? 2.4;
    const every = opts.every || 1;
    let held = 0;
    for (let i = 0; i < buf.length; i++) {
        if (i % every === 0) held = rnd();
        const p = i / Math.max(1, buf.length - 1);
        buf[i] += held * gain * env(p, attack, releasePow);
    }
}

function addClick(buf, at, gain, seed = 10) {
    const rnd = noise(seed);
    const start = Math.max(0, Math.floor(at * RATE));
    const len = Math.min(buf.length - start, Math.floor(0.025 * RATE));
    for (let i = 0; i < len; i++) {
        const p = i / Math.max(1, len - 1);
        buf[start + i] += rnd() * gain * Math.pow(1 - p, 4);
    }
}

function lowpass(buf, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = dt / (rc + dt);
    let prev = 0;
    for (let i = 0; i < buf.length; i++) {
        prev += a * (buf[i] - prev);
        buf[i] = prev;
    }
}

function highpass(buf, cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / RATE;
    const a = rc / (rc + dt);
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i < buf.length; i++) {
        const x = buf[i];
        const y = a * (prevOut + x - prevIn);
        buf[i] = y;
        prevIn = x;
        prevOut = y;
    }
}

function finalize(buf, opts = {}) {
    const sat = opts.sat ?? 1.8;
    for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * sat) * 0.92;
    if (opts.lp) lowpass(buf, opts.lp);
    if (opts.hp) highpass(buf, opts.hp);

    let max = 0;
    for (const v of buf) max = Math.max(max, Math.abs(v));
    const target = opts.peak ?? 0.82;
    if (max > 0) for (let i = 0; i < buf.length; i++) buf[i] *= target / max;

    const fade = Math.min(buf.length, Math.floor(0.006 * RATE));
    for (let i = 0; i < fade; i++) {
        const g = i / fade;
        buf[i] *= g * g;
        buf[buf.length - 1 - i] *= g * g;
    }
    return buf;
}

function writeWav(filePath, buf) {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0);
    h.writeUInt32LE(36 + buf.length * 2, 4);
    h.write('WAVE', 8);
    h.write('fmt ', 12);
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(1, 22);
    h.writeUInt32LE(RATE, 24);
    h.writeUInt32LE(RATE * 2, 28);
    h.writeUInt16LE(2, 32);
    h.writeUInt16LE(16, 34);
    h.write('data', 36);
    h.writeUInt32LE(buf.length * 2, 40);
    const d = Buffer.alloc(buf.length * 2);
    for (let i = 0; i < buf.length; i++) {
        d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
    }
    fs.writeFileSync(filePath, Buffer.concat([h, d]));
}

function makeSfx(kind) {
    const b = mkBuf(kind.dur);
    for (const n of kind.noise || []) addNoise(b, n.seed, n.gain, n);
    for (const t of kind.tones || []) addTone(b, t.a, t.b, t.gain, t);
    for (const c of kind.clicks || []) addClick(b, c.at, c.gain, c.seed);
    return finalize(b, kind.final || {});
}

function generateSounds() {
    const dir = out('sounds');
    ensureDir(dir);
    const specs = {
        boss_charge: {
            dur: 0.62,
            noise: [{ seed: 101, gain: 0.10, every: 8, attack: 0.05, releasePow: 1.1 }],
            tones: [
                { a: 70, b: 115, gain: 0.22, attack: 0.1, releasePow: 1.1 },
                { a: 180, b: 360, gain: 0.08, attack: 0.06, releasePow: 1.4, vibrato: 5 },
            ],
            final: { lp: 3400, hp: 25, sat: 2.1, peak: 0.78 },
        },
        boss_slash: {
            dur: 0.34,
            noise: [{ seed: 102, gain: 0.22, every: 2, attack: 0.012, releasePow: 3.2 }],
            tones: [
                { a: 2200, b: 520, gain: 0.10, attack: 0.01, releasePow: 2.8 },
                { a: 3800, b: 1200, gain: 0.05, attack: 0.01, releasePow: 4.4 },
            ],
            clicks: [{ at: 0.055, gain: 0.5, seed: 108 }],
            final: { lp: 6800, hp: 80, sat: 2.4, peak: 0.84 },
        },
        ground_slam: {
            dur: 0.72,
            noise: [{ seed: 103, gain: 0.28, every: 12, attack: 0.005, releasePow: 2.5 }],
            tones: [
                { a: 46, b: 34, gain: 0.48, attack: 0.004, releasePow: 2.8 },
                { a: 92, b: 55, gain: 0.22, attack: 0.006, releasePow: 2.5 },
            ],
            clicks: [{ at: 0.0, gain: 0.9, seed: 109 }, { at: 0.04, gain: 0.4, seed: 110 }],
            final: { lp: 2600, hp: 18, sat: 2.2, peak: 0.9 },
        },
        acid_shot: {
            dur: 0.33,
            noise: [{ seed: 104, gain: 0.18, every: 3, attack: 0.01, releasePow: 2.4 }],
            tones: [
                { a: 520, b: 880, gain: 0.10, attack: 0.015, releasePow: 2.1, vibrato: 18 },
                { a: 1300, b: 620, gain: 0.05, attack: 0.008, releasePow: 2.8 },
            ],
            final: { lp: 5200, hp: 90, sat: 2.0, peak: 0.76 },
        },
        acid_hit: {
            dur: 0.45,
            noise: [{ seed: 105, gain: 0.22, every: 2, attack: 0.004, releasePow: 2.2 }],
            tones: [
                { a: 260, b: 160, gain: 0.14, attack: 0.005, releasePow: 2.1 },
                { a: 980, b: 340, gain: 0.08, attack: 0.005, releasePow: 3.2 },
            ],
            clicks: [{ at: 0.01, gain: 0.35, seed: 111 }],
            final: { lp: 4200, hp: 45, sat: 2.0, peak: 0.78 },
        },
        boss_rage: {
            dur: 0.86,
            noise: [{ seed: 106, gain: 0.18, every: 5, attack: 0.06, releasePow: 1.4 }],
            tones: [
                { a: 58, b: 74, gain: 0.38, attack: 0.08, releasePow: 1.5, vibrato: 2 },
                { a: 116, b: 148, gain: 0.18, attack: 0.08, releasePow: 1.8 },
                { a: 540, b: 260, gain: 0.07, attack: 0.04, releasePow: 2.1 },
            ],
            final: { lp: 3600, hp: 20, sat: 2.3, peak: 0.86 },
        },
        shadow_soldier_slash: {
            dur: 0.24,
            noise: [{ seed: 201, gain: 0.13, every: 3, attack: 0.012, releasePow: 2.7 }],
            tones: [
                { a: 720, b: 1180, gain: 0.08, attack: 0.012, releasePow: 2.6 },
                { a: 180, b: 90, gain: 0.08, attack: 0.01, releasePow: 2.0 },
            ],
            final: { lp: 5600, hp: 70, sat: 2.0, peak: 0.68 },
        },
        shadow_soldier_slam: {
            dur: 0.42,
            noise: [{ seed: 202, gain: 0.14, every: 10, attack: 0.01, releasePow: 2.3 }],
            tones: [
                { a: 62, b: 45, gain: 0.28, attack: 0.006, releasePow: 2.4 },
                { a: 150, b: 80, gain: 0.12, attack: 0.01, releasePow: 2.6 },
            ],
            clicks: [{ at: 0.0, gain: 0.45, seed: 203 }],
            final: { lp: 2600, hp: 20, sat: 2.1, peak: 0.74 },
        },
        shadow_soldier_spit: {
            dur: 0.26,
            noise: [{ seed: 204, gain: 0.12, every: 3, attack: 0.01, releasePow: 2.2 }],
            tones: [{ a: 390, b: 650, gain: 0.09, attack: 0.012, releasePow: 2.1, vibrato: 14 }],
            final: { lp: 4800, hp: 75, sat: 1.8, peak: 0.66 },
        },
        mana: {
            dur: 0.32,
            tones: [
                { a: 660, b: 1320, gain: 0.12, attack: 0.015, releasePow: 2.2 },
                { a: 990, b: 1760, gain: 0.06, attack: 0.02, releasePow: 2.6 },
            ],
            clicks: [{ at: 0.02, gain: 0.18, seed: 210 }],
            final: { lp: 7600, hp: 160, sat: 1.6, peak: 0.72 },
        },
        essence: {
            dur: 0.48,
            noise: [{ seed: 211, gain: 0.09, every: 5, attack: 0.025, releasePow: 1.7 }],
            tones: [
                { a: 180, b: 260, gain: 0.16, attack: 0.05, releasePow: 1.8 },
                { a: 540, b: 380, gain: 0.07, attack: 0.04, releasePow: 2.2 },
            ],
            final: { lp: 4200, hp: 45, sat: 1.9, peak: 0.74 },
        },
        crit_hit: {
            dur: 0.22,
            noise: [{ seed: 212, gain: 0.18, every: 2, attack: 0.004, releasePow: 3.8 }],
            tones: [
                { a: 2400, b: 900, gain: 0.09, attack: 0.004, releasePow: 3.3 },
                { a: 120, b: 70, gain: 0.11, attack: 0.004, releasePow: 2.4 },
            ],
            clicks: [{ at: 0.0, gain: 0.52, seed: 213 }],
            final: { lp: 7200, hp: 65, sat: 2.4, peak: 0.82 },
        },
        elite_kill: {
            dur: 0.68,
            noise: [{ seed: 214, gain: 0.18, every: 5, attack: 0.008, releasePow: 2.0 }],
            tones: [
                { a: 150, b: 55, gain: 0.24, attack: 0.008, releasePow: 2.1 },
                { a: 420, b: 180, gain: 0.12, attack: 0.012, releasePow: 2.6 },
                { a: 900, b: 520, gain: 0.06, attack: 0.02, releasePow: 3.0 },
            ],
            clicks: [{ at: 0.02, gain: 0.45, seed: 215 }],
            final: { lp: 4800, hp: 25, sat: 2.2, peak: 0.84 },
        },
    };

    for (const [name, spec] of Object.entries(specs)) {
        writeWav(path.join(dir, `${name}.wav`), makeSfx(spec));
    }
    console.log(`Generated ${Object.keys(specs).length} SFX`);
}

// ------------------------------ PNG ------------------------------
const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    return c >>> 0;
});

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
}

function writePng(filePath, w, h, px) {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        const row = y * (w * 4 + 1);
        raw[row] = 0;
        for (let x = 0; x < w; x++) {
            const src = (y * w + x) * 4;
            px.copy(raw, row + 1 + x * 4, src, src + 4);
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND'),
    ]);
    fs.writeFileSync(filePath, png);
}

function canvas(w, h) {
    return { w, h, px: Buffer.alloc(w * h * 4) };
}

function rgba(hex, a = 255) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, a];
}

function blend(c, x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= c.w || y >= c.h || color[3] <= 0) return;
    const i = (y * c.w + x) * 4;
    const sa = color[3] / 255;
    const da = c.px[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    c.px[i] = Math.round((color[0] * sa + c.px[i] * da * (1 - sa)) / oa);
    c.px[i + 1] = Math.round((color[1] * sa + c.px[i + 1] * da * (1 - sa)) / oa);
    c.px[i + 2] = Math.round((color[2] * sa + c.px[i + 2] * da * (1 - sa)) / oa);
    c.px[i + 3] = Math.round(oa * 255);
}

function rect(c, x, y, w, h, color) {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
        for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) blend(c, xx, yy, color);
    }
}

function circle(c, cx, cy, r, color) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            const d2 = (x - cx) ** 2 + (y - cy) ** 2;
            if (d2 <= r2) blend(c, x, y, color);
        }
    }
}

function ellipse(c, cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
            const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            if (d <= 1) blend(c, x, y, color);
        }
    }
}

function glow(c, cx, cy, r, hex, alpha = 120) {
    for (let rr = r; rr > 0; rr -= 2) {
        const a = Math.round(alpha * (1 - rr / r) ** 1.4);
        circle(c, cx, cy, rr, rgba(hex, a));
    }
}

function line(c, x0, y0, x1, y1, color, width = 1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        circle(c, x, y, width / 2, color);
    }
}

function polygon(c, pts, color) {
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const minX = Math.floor(Math.min(...xs)), maxX = Math.ceil(Math.max(...xs));
    const minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const xi = pts[i][0], yi = pts[i][1];
                const xj = pts[j][0], yj = pts[j][1];
                if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi + 0.00001) + xi) inside = !inside;
            }
            if (inside) blend(c, x, y, color);
        }
    }
}

function strokeCircle(c, cx, cy, r, color, width = 2) {
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
        circle(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, width / 2, color);
    }
}

function arc(c, cx, cy, r, a0, a1, color, width = 2) {
    for (let a = a0; a <= a1; a += 0.01) {
        circle(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, width / 2, color);
    }
}

function save(c, filePath) {
    ensureDir(path.dirname(filePath));
    writePng(filePath, c.w, c.h, c.px);
}

function iconFrame(c, accent = 0x4dd2ff) {
    rect(c, 0, 0, c.w, c.h, rgba(0x050812, 235));
    glow(c, c.w / 2, c.h / 2, c.w * 0.46, accent, 70);
    rect(c, 3, 3, c.w - 6, 1, rgba(accent, 170));
    rect(c, 3, c.h - 4, c.w - 6, 1, rgba(accent, 110));
    rect(c, 3, 3, 1, c.h - 6, rgba(accent, 120));
    rect(c, c.w - 4, 3, 1, c.h - 6, rgba(accent, 120));
}

function generateItemAssets() {
    const dir = out('assets', 'items');
    ensureDir(dir);

    let c = canvas(64, 64);
    glow(c, 32, 36, 28, 0xff3344, 120);
    polygon(c, [[24, 16], [40, 16], [44, 24], [40, 52], [24, 52], [20, 24]], rgba(0x5a0612, 235));
    polygon(c, [[25, 19], [36, 19], [39, 25], [36, 48], [26, 48], [23, 25]], rgba(0xff3d55, 235));
    rect(c, 28, 29, 8, 18, rgba(0xffffff, 235));
    rect(c, 23, 34, 18, 8, rgba(0xffffff, 235));
    rect(c, 26, 10, 12, 7, rgba(0xbfd9e8, 230));
    save(c, path.join(dir, 'hp_potion.png'));

    c = canvas(64, 64);
    glow(c, 32, 32, 30, 0x44aaff, 140);
    polygon(c, [[32, 6], [48, 25], [39, 56], [25, 56], [16, 25]], rgba(0x164ea2, 235));
    polygon(c, [[32, 8], [38, 27], [32, 54], [22, 26]], rgba(0x78e6ff, 210));
    polygon(c, [[32, 8], [48, 25], [38, 27]], rgba(0xcdf7ff, 190));
    line(c, 32, 8, 32, 54, rgba(0xffffff, 160), 2);
    save(c, path.join(dir, 'mana_crystal.png'));

    c = canvas(64, 64);
    glow(c, 32, 35, 31, 0x9b44ff, 150);
    ellipse(c, 32, 39, 22, 18, rgba(0x1a0033, 235));
    circle(c, 32, 34, 17, rgba(0x7b2fff, 215));
    circle(c, 27, 28, 6, rgba(0xd4aaff, 170));
    for (let i = 0; i < 5; i++) {
        const x = 19 + i * 6;
        line(c, x, 47, x + Math.sin(i) * 7, 14 + (i % 2) * 5, rgba(0xb366ff, 110), 4);
    }
    save(c, path.join(dir, 'shadow_essence.png'));
}

function generateUiIcons() {
    const dir = out('assets', 'ui', 'icons');
    ensureDir(dir);
    const weaponDraw = {
        basicDagger(c) {
            polygon(c, [[31, 5], [39, 35], [33, 49], [27, 35]], rgba(0xe7eef8, 240));
            polygon(c, [[31, 5], [31, 47], [24, 35]], rgba(0x687286, 230));
            rect(c, 23, 45, 18, 5, rgba(0xb88b35, 230));
            rect(c, 28, 49, 8, 11, rgba(0x20162c, 235));
        },
        shadowDagger(c) {
            glow(c, 32, 30, 26, 0x9b44ff, 90);
            polygon(c, [[33, 3], [43, 34], [35, 48], [26, 34]], rgba(0x1a1028, 250));
            polygon(c, [[33, 5], [39, 35], [33, 47]], rgba(0xe8f2ff, 235));
            polygon(c, [[33, 5], [27, 35], [33, 47]], rgba(0x596171, 235));
            rect(c, 22, 46, 22, 5, rgba(0x7b2fff, 215));
            rect(c, 29, 51, 7, 9, rgba(0x140d22, 250));
        },
        shadowSlash(c) {
            glow(c, 32, 32, 30, 0x9b44ff, 110);
            arc(c, 17, 47, 39, -1.42, -0.18, rgba(0xffffff, 240), 5);
            arc(c, 17, 47, 35, -1.55, -0.05, rgba(0xb366ff, 220), 10);
            arc(c, 17, 47, 27, -1.55, 0.0, rgba(0x4a1a8a, 120), 10);
        },
        rulersAuthority(c) {
            glow(c, 32, 32, 30, 0x66ccff, 110);
            strokeCircle(c, 32, 32, 21, rgba(0x4dd2ff, 230), 3);
            strokeCircle(c, 32, 32, 13, rgba(0xd9f4ff, 170), 2);
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3;
                line(c, 32, 32, 32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24, rgba(0x4dd2ff, 140), 2);
            }
            circle(c, 32, 32, 6, rgba(0xffffff, 180));
        },
        dragonFear(c) {
            glow(c, 32, 32, 30, 0xff5500, 110);
            polygon(c, [[15, 43], [25, 16], [33, 27], [41, 16], [50, 43], [38, 35], [32, 53], [26, 35]], rgba(0xff6633, 225));
            circle(c, 25, 31, 3, rgba(0xffffff, 230));
            circle(c, 39, 31, 3, rgba(0xffffff, 230));
        },
    };

    const passiveDraw = {
        swiftness: (c) => { polygon(c, [[15, 35], [35, 7], [31, 28], [49, 28], [28, 57], [33, 36]], rgba(0x55ff88, 235)); },
        vitality: (c) => { circle(c, 25, 26, 10, rgba(0xff4455, 235)); circle(c, 39, 26, 10, rgba(0xff4455, 235)); polygon(c, [[15, 30], [49, 30], [32, 54]], rgba(0xff4455, 235)); },
        strength: (c) => { rect(c, 17, 25, 30, 10, rgba(0xff8844, 235)); rect(c, 12, 21, 8, 18, rgba(0xd45b28, 235)); rect(c, 44, 21, 8, 18, rgba(0xd45b28, 235)); },
        critMaster: (c) => { polygon(c, [[32, 7], [38, 25], [57, 25], [41, 36], [47, 56], [32, 44], [17, 56], [23, 36], [7, 25], [26, 25]], rgba(0xffdd44, 235)); },
        scholar: (c) => { rect(c, 17, 14, 30, 38, rgba(0x44aaff, 225)); rect(c, 21, 18, 22, 4, rgba(0xffffff, 160)); line(c, 23, 30, 41, 30, rgba(0xffffff, 130), 2); line(c, 23, 38, 39, 38, rgba(0xffffff, 120), 2); },
        hastening: (c) => { strokeCircle(c, 32, 32, 20, rgba(0xaa44ff, 230), 4); line(c, 32, 32, 32, 18, rgba(0xffffff, 210), 3); line(c, 32, 32, 44, 35, rgba(0xffffff, 210), 3); },
        magnet: (c) => { arc(c, 32, 31, 18, 0.18, Math.PI - 0.18, rgba(0x66ccff, 235), 7); rect(c, 11, 32, 9, 12, rgba(0x66ccff, 235)); rect(c, 44, 32, 9, 12, rgba(0x66ccff, 235)); },
    };

    for (const [key, draw] of Object.entries(weaponDraw)) {
        const c = canvas(64, 64);
        iconFrame(c, 0xff9966);
        draw(c);
        save(c, path.join(dir, `${key}.png`));
    }
    for (const [key, draw] of Object.entries(passiveDraw)) {
        const c = canvas(64, 64);
        iconFrame(c, 0x4dd2ff);
        glow(c, 32, 32, 24, 0x4dd2ff, 55);
        draw(c);
        save(c, path.join(dir, `${key}.png`));
    }
}

function generateShadowSprites() {
    const dir = out('assets', 'shadows');
    ensureDir(dir);
    const specs = {
        melee: { accent: 0x4466aa, w: 82, h: 104 },
        tank: { accent: 0x55aa33, w: 92, h: 108 },
        ranged: { accent: 0x9933aa, w: 78, h: 100 },
    };
    for (const [key, spec] of Object.entries(specs)) {
        const c = canvas(96, 112);
        glow(c, 48, 64, 42, spec.accent, 95);
        ellipse(c, 48, 96, 30, 9, rgba(0x05000d, 180));
        polygon(c, [[34, 35], [62, 35], [68, 84], [28, 84]], rgba(0x090616, 240));
        circle(c, 48, 28, 16, rgba(0x080512, 245));
        circle(c, 41, 27, 3, rgba(spec.accent, 235));
        circle(c, 55, 27, 3, rgba(spec.accent, 235));
        line(c, 35, 45, 22, 72, rgba(0x110822, 230), 8);
        line(c, 61, 45, 75, 72, rgba(0x110822, 230), 8);
        line(c, 39, 83, 35, 104, rgba(0x080512, 220), 7);
        line(c, 57, 83, 61, 104, rgba(0x080512, 220), 7);
        if (key === 'melee') {
            line(c, 68, 28, 84, 84, rgba(0xd9f4ff, 220), 4);
            line(c, 70, 30, 86, 86, rgba(spec.accent, 170), 8);
        } else if (key === 'tank') {
            polygon(c, [[17, 49], [36, 42], [39, 77], [21, 88]], rgba(0x13320f, 235));
            strokeCircle(c, 28, 64, 14, rgba(spec.accent, 180), 3);
        } else {
            circle(c, 74, 48, 10, rgba(spec.accent, 175));
            glow(c, 74, 48, 18, spec.accent, 105);
            line(c, 61, 47, 73, 48, rgba(spec.accent, 150), 4);
        }
        for (let i = 0; i < 5; i++) {
            line(c, 33 + i * 7, 89, 28 + i * 8, 105, rgba(spec.accent, 60), 3);
        }
        save(c, path.join(dir, `shadow_${key}.png`));
    }
}

function generateTelegraphs() {
    const dir = out('assets', 'effects', 'telegraphs');
    ensureDir(dir);

    let c = canvas(128, 128);
    strokeCircle(c, 64, 64, 44, rgba(0xff3344, 210), 4);
    strokeCircle(c, 64, 64, 27, rgba(0xffaa33, 160), 2);
    line(c, 64, 9, 64, 34, rgba(0xff3344, 180), 3);
    line(c, 64, 94, 64, 119, rgba(0xff3344, 180), 3);
    line(c, 9, 64, 34, 64, rgba(0xff3344, 180), 3);
    line(c, 94, 64, 119, 64, rgba(0xff3344, 180), 3);
    polygon(c, [[64, 32], [79, 78], [49, 78]], rgba(0xff3344, 165));
    rect(c, 61, 45, 6, 22, rgba(0xffffff, 210));
    rect(c, 61, 72, 6, 6, rgba(0xffffff, 210));
    save(c, path.join(dir, 'warning_reticle.png'));

    c = canvas(256, 256);
    glow(c, 128, 128, 108, 0xff2244, 90);
    arc(c, 54, 210, 185, -1.42, -0.22, rgba(0xff3344, 210), 18);
    arc(c, 54, 210, 155, -1.55, -0.08, rgba(0xffaa66, 150), 9);
    arc(c, 54, 210, 120, -1.55, -0.05, rgba(0xffffff, 115), 4);
    for (let i = 0; i < 8; i++) {
        const a = -1.45 + i * 0.16;
        line(c, 54 + Math.cos(a) * 145, 210 + Math.sin(a) * 145, 54 + Math.cos(a) * 190, 210 + Math.sin(a) * 190, rgba(0xff3344, 110), 3);
    }
    save(c, path.join(dir, 'igris_slash_warning.png'));

    c = canvas(256, 256);
    glow(c, 128, 132, 96, 0xffbb55, 75);
    const cracks = [
        [128, 126, 43, 39], [128, 126, 72, 165], [128, 126, 218, 93],
        [128, 126, 185, 207], [128, 126, 96, 220], [128, 126, 154, 39],
    ];
    for (const cr of cracks) line(c, ...cr, rgba(0xffcc66, 185), 6);
    for (const cr of cracks) line(c, cr[0], cr[1], cr[2], cr[3], rgba(0x2a1806, 210), 2);
    strokeCircle(c, 128, 128, 88, rgba(0xffdd99, 110), 5);
    save(c, path.join(dir, 'ground_crack.png'));

    c = canvas(128, 128);
    glow(c, 64, 70, 54, 0x99ff33, 100);
    ellipse(c, 64, 73, 48, 24, rgba(0x66cc22, 155));
    ellipse(c, 56, 69, 31, 16, rgba(0x223b18, 180));
    circle(c, 44, 62, 4, rgba(0xddff88, 170));
    circle(c, 82, 78, 5, rgba(0xccff66, 150));
    save(c, path.join(dir, 'acid_puddle.png'));
}

function generateEnvironment() {
    const dir = out('assets', 'environment');
    ensureDir(dir);

    let c = canvas(128, 128);
    ellipse(c, 64, 111, 32, 9, rgba(0x000000, 95));
    rect(c, 43, 19, 42, 84, rgba(0x28283c, 235));
    rect(c, 38, 91, 52, 15, rgba(0x1a1a2a, 245));
    rect(c, 39, 14, 50, 12, rgba(0x36364d, 235));
    line(c, 55, 24, 48, 94, rgba(0x0a0a16, 190), 3);
    line(c, 72, 28, 81, 85, rgba(0x0a0a16, 160), 2);
    save(c, path.join(dir, 'cracked_pillar.png'));

    c = canvas(128, 128);
    ellipse(c, 64, 105, 30, 9, rgba(0x000000, 100));
    polygon(c, [[45, 31], [83, 31], [91, 99], [37, 99]], rgba(0x1a2633, 235));
    strokeCircle(c, 64, 62, 20, rgba(0x4dd2ff, 160), 3);
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        line(c, 64, 62, 64 + Math.cos(a) * 21, 62 + Math.sin(a) * 21, rgba(0x4dd2ff, 95), 1.5);
    }
    save(c, path.join(dir, 'rune_stone.png'));

    c = canvas(128, 128);
    glow(c, 64, 68, 52, 0x7b2fff, 145);
    strokeCircle(c, 64, 68, 34, rgba(0xb366ff, 210), 5);
    strokeCircle(c, 64, 68, 23, rgba(0x4a1a8a, 170), 5);
    circle(c, 64, 68, 18, rgba(0x05070d, 225));
    ellipse(c, 64, 104, 38, 9, rgba(0x000000, 110));
    save(c, path.join(dir, 'shadow_portal.png'));

    c = canvas(128, 128);
    for (let i = 0; i < 8; i++) {
        const y = i * 16 - 2;
        strokeCircle(c, 64 + (i % 2 ? 0 : -1), y + 10, 8, rgba(0x9ca4b5, 210), 4);
    }
    glow(c, 64, 64, 22, 0x4dd2ff, 40);
    save(c, path.join(dir, 'hanging_chain.png'));
}

function generateImages() {
    generateItemAssets();
    generateUiIcons();
    generateShadowSprites();
    generateTelegraphs();
    generateEnvironment();
    console.log('Generated PNG assets');
}

generateSounds();
generateImages();
