import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const rawDir = 'C:/Users/user/.gemini/antigravity/brain/6c49ba5a-ab31-41a1-8921-f75797ef1f9c/scratch/semantle-art-raw';
const uiDir = fileURLToPath(new URL('../assets/ui/', import.meta.url));
const bgDir = fileURLToPath(new URL('../assets/backgrounds/', import.meta.url));
const hubImagesDir = 'd:/workspace/archerlab/assets/images';

fs.mkdirSync(uiDir, { recursive: true });
fs.mkdirSync(bgDir, { recursive: true });
fs.mkdirSync(hubImagesDir, { recursive: true });

// 투명 스프라이트의 외곽 잔여 알파 노이즈(<threshold)를 정리하고 대칭 여백으로 트림
async function trimAndCleanAlpha(inputPath, { pad = 6, threshold = 8 } = {}) {
    const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    let opaqueCount = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * channels;
            const a = data[idx + 3];
            if (a < threshold) {
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 0;
            } else {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                if (a >= 240) opaqueCount++;
            }
        }
    }
    if (maxX < minX) throw new Error(`No foreground pixels found in ${inputPath}`);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const cleaned = sharp(data, { raw: { width, height, channels } })
        .extract({ left: minX, top: minY, width: cropW, height: cropH });

    const outBuf = pad > 0
        ? await cleaned.extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
        : await cleaned.png().toBuffer();

    const meta = await sharp(outBuf).metadata();
    const borderRatio = opaqueCount / (width * height);
    return { buffer: outBuf, width: meta.width, height: meta.height, borderRatio };
}

// VFX 스프라이트의 외곽 가장자리를 부드럽게 페이드 아웃해 사각형 절단선 방지
async function featherVfxEdges(inputPath, targetSize = 1024) {
    const { data, info } = await sharp(inputPath)
        .resize(targetSize, targetSize, { kernel: 'lanczos3' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const half = targetSize / 2;
    for (let y = 0; y < targetSize; y++) {
        for (let x = 0; x < targetSize; x++) {
            const dx = (x - half) / half;
            const dy = (y - half) / half;
            const r = Math.hypot(dx, dy);
            const idx = (y * targetSize + x) * info.channels;
            let a = data[idx + 3];
            if (a < 6) {
                a = 0;
            } else if (r > 0.78) {
                const factor = Math.max(0, Math.min(1, (0.98 - r) / 0.20));
                const smooth = factor * factor * (3 - 2 * factor);
                a = Math.round(a * smooth);
            }
            data[idx + 3] = a;
        }
    }
    return sharp(data, { raw: { width: targetSize, height: targetSize, channels: info.channels } }).png().toBuffer();
}

// 패널 중앙 영역이 투명하거나 반투명해지지 않도록 균일한 다크 프러시안 슬레이트 내부 채움 보장
async function stabilizePanelInterior(buffer, width, height, insetFrac = 0.085) {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const left = Math.round(width * insetFrac);
    const right = Math.round(width * (1 - insetFrac));
    const top = Math.round(height * insetFrac);
    const bottom = Math.round(height * (1 - insetFrac));
    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const idx = (y * width + x) * info.channels;
            if (data[idx + 3] < 245) {
                const a = data[idx + 3] / 255;
                data[idx] = Math.round(data[idx] * a + 9 * (1 - a));
                data[idx + 1] = Math.round(data[idx + 1] * a + 24 * (1 - a));
                data[idx + 2] = Math.round(data[idx + 2] * a + 34 * (1 - a));
                data[idx + 3] = 248;
            }
        }
    }
    return sharp(data, { raw: { width, height, channels: info.channels } }).png().toBuffer();
}

async function emitOpaqueResponsive(src, variants) {
    for (const v of variants) {
        const pipe = sharp(src).resize(v.width, v.height, { kernel: 'lanczos3' }).removeAlpha();
        if (v.path.endsWith('.webp')) {
            await pipe.webp({ quality: v.quality || 90, smartSubsample: true, effort: 6 }).toFile(v.path);
        } else {
            await pipe.png({ compressionLevel: 9 }).toFile(v.path);
        }
    }
}

async function emitRgbaResponsive(buffer, variants) {
    for (const v of variants) {
        const pipe = sharp(buffer).resize(v.width, v.height, { kernel: 'lanczos3' });
        if (v.path.endsWith('.webp')) {
            await pipe.webp({ quality: v.quality || 92, alphaQuality: 100, smartSubsample: true, effort: 6 }).toFile(v.path);
        } else {
            await pipe.png({ compressionLevel: 9 }).toFile(v.path);
        }
    }
}

// 1. 불투명 키아트 및 배경 반응형 출력
await emitOpaqueResponsive(path.join(rawDir, 'semantle-card.png'), [
    { width: 1200, height: 1200, path: path.join(uiDir, 'semantle-card.png') },
    { width: 400, height: 400, path: path.join(uiDir, 'semantle-card-400.webp'), quality: 88 },
    { width: 800, height: 800, path: path.join(uiDir, 'semantle-card-800.webp'), quality: 90 },
    { width: 1200, height: 1200, path: path.join(uiDir, 'semantle-card-1200.webp'), quality: 90 },
]);
fs.copyFileSync(path.join(uiDir, 'semantle-card.png'), path.join(hubImagesDir, 'semantle-link.png'));
fs.copyFileSync(path.join(uiDir, 'semantle-card-400.webp'), path.join(hubImagesDir, 'semantle-link-400.webp'));
fs.copyFileSync(path.join(uiDir, 'semantle-card-800.webp'), path.join(hubImagesDir, 'semantle-link-800.webp'));
fs.copyFileSync(path.join(uiDir, 'semantle-card-1200.webp'), path.join(hubImagesDir, 'semantle-link.webp'));

await emitOpaqueResponsive(path.join(rawDir, 'semantle-wide.png'), [
    { width: 1440, height: 810, path: path.join(uiDir, 'semantle-wide.png') },
    { width: 480, height: 270, path: path.join(uiDir, 'semantle-wide-480.webp'), quality: 88 },
    { width: 960, height: 540, path: path.join(uiDir, 'semantle-wide-960.webp'), quality: 90 },
    { width: 1440, height: 810, path: path.join(uiDir, 'semantle-wide-1440.webp'), quality: 90 },
]);

await emitOpaqueResponsive(path.join(rawDir, 'study-desktop.png'), [
    { width: 1920, height: 1080, path: path.join(bgDir, 'study-desktop.png') },
    { width: 960, height: 540, path: path.join(bgDir, 'study-desktop-960.webp'), quality: 86 },
    { width: 1440, height: 810, path: path.join(bgDir, 'study-desktop-1440.webp'), quality: 88 },
    { width: 1920, height: 1080, path: path.join(bgDir, 'study-desktop-1920.webp'), quality: 88 },
]);

await emitOpaqueResponsive(path.join(rawDir, 'study-mobile.png'), [
    { width: 1080, height: 1920, path: path.join(bgDir, 'study-mobile.png') },
    { width: 480, height: 854, path: path.join(bgDir, 'study-mobile-480.webp'), quality: 86 },
    { width: 828, height: 1472, path: path.join(bgDir, 'study-mobile-828.webp'), quality: 88 },
    { width: 1080, height: 1920, path: path.join(bgDir, 'study-mobile-1080.webp'), quality: 88 },
]);

// 2. 투명 배경 UI 스킨(버튼·패널·메달리온·아이콘·VFX) 정리 및 출력
const btnGold = await trimAndCleanAlpha(path.join(rawDir, 'crafted-btn-gold.png'), { pad: 6 });
const btnGoldH = Math.round((720 / btnGold.width) * btnGold.height);
await emitRgbaResponsive(btnGold.buffer, [
    { width: 720, height: btnGoldH, path: path.join(uiDir, 'crafted-btn-gold.png') },
    { width: 360, height: Math.round(btnGoldH / 2), path: path.join(uiDir, 'crafted-btn-gold-360.webp') },
    { width: 720, height: btnGoldH, path: path.join(uiDir, 'crafted-btn-gold-720.webp') },
]);

const btnTeal = await trimAndCleanAlpha(path.join(rawDir, 'crafted-btn-teal.png'), { pad: 6 });
const btnTealH = Math.round((720 / btnTeal.width) * btnTeal.height);
await emitRgbaResponsive(btnTeal.buffer, [
    { width: 720, height: btnTealH, path: path.join(uiDir, 'crafted-btn-teal.png') },
    { width: 360, height: Math.round(btnTealH / 2), path: path.join(uiDir, 'crafted-btn-teal-360.webp') },
    { width: 720, height: btnTealH, path: path.join(uiDir, 'crafted-btn-teal-720.webp') },
]);

const panelTrim = await trimAndCleanAlpha(path.join(rawDir, 'crafted-panel.png'), { pad: 4 });
const panelBuf = await stabilizePanelInterior(panelTrim.buffer, panelTrim.width, panelTrim.height);
await emitRgbaResponsive(panelBuf, [
    { width: 1024, height: 1024, path: path.join(uiDir, 'crafted-panel.png') },
    { width: 512, height: 512, path: path.join(uiDir, 'crafted-panel-512.webp') },
    { width: 1024, height: 1024, path: path.join(uiDir, 'crafted-panel-1024.webp') },
]);

const compass = await trimAndCleanAlpha(path.join(rawDir, 'compass-chronograph.png'), { pad: 6 });
await emitRgbaResponsive(compass.buffer, [
    { width: 640, height: Math.round((640 / compass.width) * compass.height), path: path.join(uiDir, 'compass-chronograph.png') },
    { width: 160, height: Math.round((160 / compass.width) * compass.height), path: path.join(uiDir, 'compass-chronograph-160.webp') },
    { width: 320, height: Math.round((320 / compass.width) * compass.height), path: path.join(uiDir, 'compass-chronograph-320.webp') },
    { width: 640, height: Math.round((640 / compass.width) * compass.height), path: path.join(uiDir, 'compass-chronograph-640.webp') },
]);

const vfxBuf = await featherVfxEdges(path.join(rawDir, 'vfx-compass-burst.png'), 1024);
await emitRgbaResponsive(vfxBuf, [
    { width: 1024, height: 1024, path: path.join(uiDir, 'vfx-compass-burst.png') },
    { width: 512, height: 512, path: path.join(uiDir, 'vfx-compass-burst-512.webp') },
    { width: 1024, height: 1024, path: path.join(uiDir, 'vfx-compass-burst-1024.webp') },
]);

for (const iconName of ['icon-trophy', 'icon-guide', 'icon-settings']) {
    const trimmed = await trimAndCleanAlpha(path.join(rawDir, `${iconName}.png`), { pad: 4 });
    const iconSq = await sharp(trimmed.buffer)
        .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
        .png()
        .toBuffer();
    await emitRgbaResponsive(iconSq, [
        { width: 96, height: 96, path: path.join(uiDir, `${iconName}.png`) },
        { width: 48, height: 48, path: path.join(uiDir, `${iconName}-48.webp`) },
        { width: 96, height: 96, path: path.join(uiDir, `${iconName}-96.webp`) },
    ]);
}

const barFrame = await trimAndCleanAlpha(path.join(rawDir, 'loading-bar-frame.png'), { pad: 2 });
const barFrameH = Math.round((640 / barFrame.width) * barFrame.height);
await emitRgbaResponsive(barFrame.buffer, [
    { width: 640, height: barFrameH, path: path.join(uiDir, 'loading-bar-frame.png') },
    { width: 320, height: Math.round(barFrameH / 2), path: path.join(uiDir, 'loading-bar-frame-320.webp') },
    { width: 640, height: barFrameH, path: path.join(uiDir, 'loading-bar-frame-640.webp') },
]);

const barFill = await trimAndCleanAlpha(path.join(rawDir, 'loading-bar-fill.png'), { pad: 2 });
const barFillH = Math.round((560 / barFill.width) * barFill.height);
await emitRgbaResponsive(barFill.buffer, [
    { width: 560, height: barFillH, path: path.join(uiDir, 'loading-bar-fill.png') },
    { width: 280, height: Math.round(barFillH / 2), path: path.join(uiDir, 'loading-bar-fill-280.webp') },
    { width: 560, height: barFillH, path: path.join(uiDir, 'loading-bar-fill-560.webp') },
]);

// Measure inner dark trough bounds in trimmed loading-bar-frame for pixel-exact CSS alignment
const frameRaw = await sharp(path.join(uiDir, 'loading-bar-frame.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let troughTop = frameRaw.info.height, troughBottom = 0, troughLeft = frameRaw.info.width, troughRight = 0;
const midX = Math.floor(frameRaw.info.width / 2);
for (let y = Math.floor(frameRaw.info.height * 0.42); y < Math.floor(frameRaw.info.height * 0.68); y++) {
    const idx = (y * frameRaw.info.width + midX) * 4;
    const r = frameRaw.data[idx], g = frameRaw.data[idx + 1], b = frameRaw.data[idx + 2], a = frameRaw.data[idx + 3];
    if (a > 200 && r < 45 && g < 65 && b < 85) {
        if (y < troughTop) troughTop = y;
        if (y > troughBottom) troughBottom = y;
    }
}
const midY = Math.floor((troughTop + troughBottom) / 2);
for (let x = 0; x < frameRaw.info.width; x++) {
    const idx = (midY * frameRaw.info.width + x) * 4;
    const r = frameRaw.data[idx], g = frameRaw.data[idx + 1], b = frameRaw.data[idx + 2], a = frameRaw.data[idx + 3];
    if (a > 200 && r < 45 && g < 65 && b < 85) {
        if (x < troughLeft) troughLeft = x;
        if (x > troughRight) troughRight = x;
    }
}
console.log('Trough box px:', {
    w: frameRaw.info.width,
    h: frameRaw.info.height,
    leftPct: ((troughLeft / frameRaw.info.width) * 100).toFixed(2) + '%',
    rightPct: (((frameRaw.info.width - 1 - troughRight) / frameRaw.info.width) * 100).toFixed(2) + '%',
    topPct: ((troughTop / frameRaw.info.height) * 100).toFixed(2) + '%',
    heightPct: (((troughBottom - troughTop + 1) / frameRaw.info.height) * 100).toFixed(2) + '%',
});

// 1:1 무손실 PNG 3색 대비 시트 (#181824, #FF00FF, #00FF00) for loading bar assets
const lbFrameMeta = await sharp(path.join(uiDir, 'loading-bar-frame.png')).metadata();
const lbFillMeta = await sharp(path.join(uiDir, 'loading-bar-fill.png')).metadata();
const lbSheetW = Math.max(lbFrameMeta.width, lbFillMeta.width) + 40;
const lbRowH = Math.max(lbFrameMeta.height, lbFillMeta.height) + 28;
const lbSheetH = lbRowH * 6;
const bgColors = ['#181824', '#FF00FF', '#00FF00'];
const lbTiles = [];
for (let bi = 0; bi < bgColors.length; bi++) {
    const topBand1 = bi * 2 * lbRowH;
    const topBand2 = (bi * 2 + 1) * lbRowH;
    lbTiles.push({
        input: await sharp({ create: { width: lbSheetW, height: lbRowH * 2, channels: 4, background: bgColors[bi] } }).png().toBuffer(),
        left: 0,
        top: topBand1,
    });
    lbTiles.push({
        input: path.join(uiDir, 'loading-bar-frame.png'),
        left: 20,
        top: topBand1 + Math.floor((lbRowH - lbFrameMeta.height) / 2),
    });
    lbTiles.push({
        input: path.join(uiDir, 'loading-bar-fill.png'),
        left: 20,
        top: topBand2 + Math.floor((lbRowH - lbFillMeta.height) / 2),
    });
}
await sharp({ create: { width: lbSheetW, height: lbSheetH, channels: 4, background: '#181824' } })
    .composite(lbTiles)
    .png({ compressionLevel: 9 })
    .toFile(path.join(rawDir, 'loading-bar-verify.png'));

// 3. 투명 UI 에셋 육안 검증용 고대비(#181824 / #00FF00) 시트 생성
const previewItems = [
    { file: 'crafted-btn-gold.png', w: 340, h: 120 },
    { file: 'crafted-btn-teal.png', w: 340, h: 120 },
    { file: 'crafted-panel.png', w: 280, h: 280 },
    { file: 'compass-chronograph.png', w: 280, h: 280 },
    { file: 'vfx-compass-burst.png', w: 280, h: 280 },
    { file: 'loading-bar-frame.png', w: 340, h: 190 },
    { file: 'loading-bar-fill.png', w: 340, h: 80 },
    { file: 'icon-trophy.png', w: 96, h: 96 },
    { file: 'icon-guide.png', w: 96, h: 96 },
    { file: 'icon-settings.png', w: 96, h: 96 },
];
const composites = [];
let y = 20;
for (const item of previewItems) {
    const tile = await sharp(path.join(uiDir, item.file))
        .resize(item.w, item.h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
    composites.push({ input: tile, left: 20, top: y });
    composites.push({ input: tile, left: 400, top: y });
    y += item.h + 18;
}
const sheetH = y + 10;
const leftBg = await sharp({ create: { width: 380, height: sheetH, channels: 4, background: '#181824' } }).png().toBuffer();
const rightBg = await sharp({ create: { width: 380, height: sheetH, channels: 4, background: '#00FF00' } }).png().toBuffer();
await sharp({ create: { width: 760, height: sheetH, channels: 4, background: '#181824' } })
    .composite([{ input: leftBg, left: 0, top: 0 }, { input: rightBg, left: 380, top: 0 }, ...composites])
    .png()
    .toFile(path.join(rawDir, 'alpha-verify-sheet.png'));

// 4. Rebuild twenty-questions/assets/manifest.json for all background & UI images
const manifestPath = fileURLToPath(new URL('../assets/manifest.json', import.meta.url));
const imageEntries = [];
for (const sub of ['backgrounds', 'ui']) {
    const subDir = path.join(fileURLToPath(new URL('../assets/', import.meta.url)), sub);
    for (const file of fs.readdirSync(subDir).sort()) {
        if (!file.endsWith('.png') && !file.endsWith('.webp')) continue;
        const abs = path.join(subDir, file);
        const buf = fs.readFileSync(abs);
        const meta = await sharp(buf).metadata();
        imageEntries.push({
            file: `${sub}/${file}`,
            bytes: buf.byteLength,
            width: meta.width,
            height: meta.height,
            sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        });
    }
}
fs.writeFileSync(manifestPath, JSON.stringify({
    version: 4,
    created_at: new Date().toISOString().slice(0, 10),
    images: imageEntries,
}, null, 2) + '\n');

console.log('Processed UI skins:', {
    btnGold: `${btnGold.width}x${btnGold.height} -> 720x${btnGoldH}`,
    btnTeal: `${btnTeal.width}x${btnTeal.height} -> 720x${btnTealH}`,
    barFrame: `${barFrame.width}x${barFrame.height} -> 640x${barFrameH}`,
    barFill: `${barFill.width}x${barFill.height} -> 560x${barFillH}`,
    panel: `${panelTrim.width}x${panelTrim.height} -> 1024x1024`,
    compass: `${compass.width}x${compass.height} -> 640x${Math.round((640 / compass.width) * compass.height)}`,
    manifestEntries: imageEntries.length,
});
