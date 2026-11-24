import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SCRATCH = String.raw`C:\Users\user\.gemini\antigravity\brain\05acd3bc-38fd-44fd-90cd-5cbab77eca27\scratch`;

const ENEMY_KEYS = [
    'goblin', 'steelFangLycan', 'antSoldier', 'orc', 'iceBear',
    'iceElf', 'stoneGolem', 'darkMage', 'ironKnight', 'demonWarrior',
];
const BOSS_KEYS = ['igris', 'tusk', 'beru'];
const VFX_KEYS = ['dark_mage_orb', 'boss_igris_slash', 'boss_tusk_slam', 'boss_beru_acid'];
const ATLAS_NAMES = ['enemies_early', 'enemies_late', 'boss_igris', 'boss_tusk', 'boss_beru'];
const QUALITY_LADDER = [
    { label: 'q92', opts: { quality: 92, alphaQuality: 100, effort: 6, smartSubsample: false } },
    { label: 'q95', opts: { quality: 95, alphaQuality: 100, effort: 6, smartSubsample: false } },
    { label: 'q98', opts: { quality: 98, alphaQuality: 100, effort: 6, smartSubsample: false } },
    { label: 'nl80', opts: { quality: 80, alphaQuality: 100, effort: 6, nearLossless: true } },
    { label: 'nl90', opts: { quality: 90, alphaQuality: 100, effort: 6, nearLossless: true } },
    { label: 'lossless', opts: { lossless: true, effort: 6 } },
];

function zeroTransparentRgb(rgbaBuf) {
    const out = Buffer.from(rgbaBuf);
    for (let i = 0; i < out.length; i += 4) {
        if (out[i + 3] === 0) {
            out[i] = 0;
            out[i + 1] = 0;
            out[i + 2] = 0;
        }
    }
    return out;
}

function compositeOverBg(rgbaBuf, bgR, bgG, bgB) {
    const pxCount = rgbaBuf.length >> 2;
    const rgb = new Uint8Array(pxCount * 3);
    for (let p = 0, s = 0, d = 0; p < pxCount; p++, s += 4, d += 3) {
        const a = rgbaBuf[s + 3];
        if (a === 255) {
            rgb[d] = rgbaBuf[s];
            rgb[d + 1] = rgbaBuf[s + 1];
            rgb[d + 2] = rgbaBuf[s + 2];
        } else if (a === 0) {
            rgb[d] = bgR;
            rgb[d + 1] = bgG;
            rgb[d + 2] = bgB;
        } else {
            const fa = a / 255;
            const ia = 1 - fa;
            rgb[d] = Math.round(rgbaBuf[s] * fa + bgR * ia);
            rgb[d + 1] = Math.round(rgbaBuf[s + 1] * fa + bgG * ia);
            rgb[d + 2] = Math.round(rgbaBuf[s + 2] * fa + bgB * ia);
        }
    }
    return rgb;
}

function computeCompositeMetrics(refRgba, candRgba, width, height, bgR, bgG, bgB) {
    const refRgb = compositeOverBg(refRgba, bgR, bgG, bgB);
    const candRgb = compositeOverBg(candRgba, bgR, bgG, bgB);

    let sumAbs = 0;
    for (let i = 0; i < refRgb.length; i++) {
        sumAbs += Math.abs(refRgb[i] - candRgb[i]);
    }
    const mae = sumAbs / refRgb.length;

    const c1 = (0.01 * 255) ** 2;
    const c2 = (0.03 * 255) ** 2;
    const win = 8;
    const step = 4;

    let ssimSum = 0;
    let winCount = 0;

    for (let y = 0; y <= height - win; y += step) {
        for (let x = 0; x <= width - win; x += step) {
            for (let ch = 0; ch < 3; ch++) {
                let sumX = 0;
                let sumY = 0;
                let sumX2 = 0;
                let sumY2 = 0;
                let sumXY = 0;
                const n = win * win;
                for (let dy = 0; dy < win; dy++) {
                    const rowBase = ((y + dy) * width + x) * 3 + ch;
                    for (let dx = 0; dx < win; dx++) {
                        const idx = rowBase + dx * 3;
                        const vx = refRgb[idx];
                        const vy = candRgb[idx];
                        sumX += vx;
                        sumY += vy;
                        sumX2 += vx * vx;
                        sumY2 += vy * vy;
                        sumXY += vx * vy;
                    }
                }
                const muX = sumX / n;
                const muY = sumY / n;
                const varX = Math.max(0, sumX2 / n - muX * muX);
                const varY = Math.max(0, sumY2 / n - muY * muY);
                const covXY = sumXY / n - muX * muY;
                const num = (2 * muX * muY + c1) * (2 * covXY + c2);
                const den = (muX * muX + muY * muY + c1) * (varX + varY + c2);
                ssimSum += num / den;
                winCount++;
            }
        }
    }

    const ssim = winCount > 0 ? ssimSum / winCount : 1;
    return { ssim, mae };
}

async function decodeRawRgba(fileOrBuf) {
    const { data, info } = await sharp(fileOrBuf)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

function maxChannelDiff(bufA, bufB, onlyAlpha = false) {
    if (bufA.length !== bufB.length) return 255;
    let maxD = 0;
    const start = onlyAlpha ? 3 : 0;
    const step = onlyAlpha ? 4 : 1;
    for (let i = start; i < bufA.length; i += step) {
        const d = Math.abs(bufA[i] - bufB[i]);
        if (d > maxD) maxD = d;
    }
    return maxD;
}

async function optimizeAndGateAsset({ label, pngPath, webpPath, updatePng }) {
    if (!fs.existsSync(pngPath)) {
        throw new Error(`[${label}] missing source PNG: ${pngPath}`);
    }

    const pillowBuf = fs.readFileSync(pngPath);
    const decoded = await decodeRawRgba(pillowBuf);
    const cleanRaw = zeroTransparentRgb(decoded.data);
    const { width, height } = decoded;

    // Normalize PNG (zero RGB where alpha===0) & pick smallest 4-channel lossless PNG
    const sharpPngBuf = await sharp(cleanRaw, {
        raw: { width, height, channels: 4 },
    })
        .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
        .toBuffer();

    const decodedSharpPng = await decodeRawRgba(sharpPngBuf);
    const losslessDiff = maxChannelDiff(cleanRaw, decodedSharpPng.data, false);
    if (losslessDiff !== 0) {
        throw new Error(`[${label}] sharp PNG failed 4-channel lossless invariant (max_abs_diff=${losslessDiff})`);
    }

    // Re-encode cleanRaw with Pillow equivalent only when Pillow file already has clean zeros,
    // or verify Pillow buffer also matches cleanRaw cleanly before comparing byte size.
    let finalPngBuf = sharpPngBuf;
    let pngWinner = 'sharp';
    if (pillowBuf.length < sharpPngBuf.length && maxChannelDiff(decoded.data, cleanRaw, false) === 0) {
        finalPngBuf = pillowBuf;
        pngWinner = 'pillow';
    }
    if (updatePng) {
        fs.writeFileSync(pngPath, finalPngBuf);
    }

    let chosenWebp = null;
    let chosenMetrics = null;
    const attempts = [];

    for (const candidate of QUALITY_LADDER) {
        const webpBuf = await sharp(cleanRaw, {
            raw: { width, height, channels: 4 },
        })
            .webp(candidate.opts)
            .toBuffer();

        const decWebp = await decodeRawRgba(webpBuf);
        const sameDims = decWebp.width === width && decWebp.height === height;
        const alphaMaxDiff = sameDims ? maxChannelDiff(cleanRaw, decWebp.data, true) : 255;
        const dark = sameDims ? computeCompositeMetrics(cleanRaw, decWebp.data, width, height, 24, 24, 36) : { ssim: 0, mae: 999 };
        const light = sameDims ? computeCompositeMetrics(cleanRaw, decWebp.data, width, height, 255, 255, 255) : { ssim: 0, mae: 999 };
        const savings = 1 - (webpBuf.length / finalPngBuf.length);

        attempts.push({ q: candidate.label, bytes: webpBuf.length, savings, alphaMaxDiff, dark, light });

        if (
            sameDims
            && alphaMaxDiff === 0
            && dark.ssim >= 0.99 && dark.mae <= 1.5
            && light.ssim >= 0.99 && light.mae <= 1.5
            && savings >= 0.15
        ) {
            chosenWebp = webpBuf;
            chosenMetrics = { q: candidate.label, bytes: webpBuf.length, savings, alphaMaxDiff, dark, light };
            break;
        }
    }

    if (!chosenWebp) {
        const detail = attempts.map(a =>
            `q=${a.q}: bytes=${a.bytes}/${finalPngBuf.length} (${(a.savings * 100).toFixed(1)}%), alphaDiff=${a.alphaMaxDiff}, `
            + `dark=(SSIM ${a.dark.ssim.toFixed(4)}, MAE ${a.dark.mae.toFixed(2)}), light=(SSIM ${a.light.ssim.toFixed(4)}, MAE ${a.light.mae.toFixed(2)})`
        ).join(' | ');
        throw new Error(`[QUALITY_GATE_FAILED] ${label}: ${detail}`);
    }

    fs.mkdirSync(path.dirname(webpPath), { recursive: true });
    fs.writeFileSync(webpPath, chosenWebp);

    return {
        label,
        pngBytes: finalPngBuf.length,
        pngWinner,
        webpBytes: chosenMetrics.bytes,
        savingsPct: (chosenMetrics.savings * 100).toFixed(1),
        q: chosenMetrics.q,
        alphaMaxDiff: chosenMetrics.alphaMaxDiff,
        minSsim: Math.min(chosenMetrics.dark.ssim, chosenMetrics.light.ssim).toFixed(4),
        maxMae: Math.max(chosenMetrics.dark.mae, chosenMetrics.light.mae).toFixed(3),
    };
}

async function main() {
    const scratchArgIdx = process.argv.indexOf('--scratch-dir');
    const scratchDir = scratchArgIdx !== -1 && process.argv[scratchArgIdx + 1]
        ? process.argv[scratchArgIdx + 1]
        : DEFAULT_SCRATCH;

    const tasks = [];

    for (const key of ENEMY_KEYS) {
        const pngPath = path.join(ROOT, 'assets', 'enemies', 'source', `${key}.png`);
        tasks.push({
            label: `enemy_source/${key}`,
            pngPath,
            webpPath: pngPath.replace(/\.png$/i, '.webp'),
            updatePng: true,
        });
    }
    for (const key of BOSS_KEYS) {
        const pngPath = path.join(ROOT, 'assets', 'bosses', 'source', `${key}.png`);
        tasks.push({
            label: `boss_source/${key}`,
            pngPath,
            webpPath: pngPath.replace(/\.png$/i, '.webp'),
            updatePng: true,
        });
    }
    for (const key of VFX_KEYS) {
        for (let f = 0; f < 6; f++) {
            const pngPath = path.join(ROOT, 'assets', 'effects', 'enemy_boss', `${key}_${f}.png`);
            tasks.push({
                label: `vfx/${key}_${f}`,
                pngPath,
                webpPath: pngPath.replace(/\.png$/i, '.webp'),
                updatePng: true,
            });
        }
    }
    for (const name of ATLAS_NAMES) {
        tasks.push({
            label: `atlas/${name}`,
            pngPath: path.join(scratchDir, 'atlases_png', `${name}.png`),
            webpPath: path.join(ROOT, 'assets', 'atlases', `${name}.webp`),
            updatePng: false,
        });
    }

    let totalPng = 0;
    let totalWebp = 0;
    for (const task of tasks) {
        const res = await optimizeAndGateAsset(task);
        totalPng += res.pngBytes;
        totalWebp += res.webpBytes;
        console.log(
            `[PASS] ${res.label.padEnd(28)} PNG=${String(Math.round(res.pngBytes / 1024)).padStart(4)}KB (${res.pngWinner.padEnd(6)}) `
            + `-> WebP=${String(Math.round(res.webpBytes / 1024)).padStart(4)}KB (q=${res.q}, -${res.savingsPct}%, `
            + `alphaDiff=${res.alphaMaxDiff}, minSSIM=${res.minSsim}, maxMAE=${res.maxMae})`
        );
    }

    const overallSavings = (1 - totalWebp / totalPng) * 100;
    console.log(`\n[SUMMARY] ${tasks.length} assets passed all quality gates: ${Math.round(totalPng / 1024)}KB PNG -> ${Math.round(totalWebp / 1024)}KB WebP (-${overallSavings.toFixed(1)}%)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
