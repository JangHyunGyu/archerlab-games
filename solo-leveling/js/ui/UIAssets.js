import { SYSTEM } from '../utils/Constants.js';

function colorToRgb(color) {
    return {
        r: (color >> 16) & 0xff,
        g: (color >> 8) & 0xff,
        b: color & 0xff,
    };
}

function rgba(color, alpha = 1) {
    const rgb = colorToRgb(color);
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function panelPath(ctx, x, y, w, h, cut, cutCorners = [true, true, true, true]) {
    const tl = cutCorners[0] ? cut : 0;
    const tr = cutCorners[1] ? cut : 0;
    const br = cutCorners[2] ? cut : 0;
    const bl = cutCorners[3] ? cut : 0;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.lineTo(x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.lineTo(x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.lineTo(x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.closePath();
}

function textureKey(prefix, w, h, opts) {
    const signature = JSON.stringify({
        w: Math.ceil(w),
        h: Math.ceil(h),
        cut: opts.cut || 0,
        fill: opts.fill,
        fillAlpha: opts.fillAlpha,
        border: opts.border,
        borderAlpha: opts.borderAlpha,
        borderWidth: opts.borderWidth,
        accent: opts.accent,
        glow: opts.glow,
        cutCorners: opts.cutCorners,
        variant: opts.variant,
        innerBorder: opts.innerBorder,
        ornament: opts.ornament,
        surfaceLines: opts.surfaceLines,
        highlight: opts.highlight,
    });
    return `${prefix}_${hashString(signature)}`;
}

// Source slicing profiles tailored to the native-transparent gothic UI kit.
const SLICE_PROFILES = {
    ui_skin_panel: {
        mode: 'nine',
        left: 0.24, right: 0.76, midX: [0.25, 0.75],
        top: 0.24, bottom: 0.76, midY: [0.25, 0.75],
        edgeCss: 36,
    },
    ui_crafted_frame: {
        mode: 'nine',
        left: 0.21, right: 0.79, midX: [0.22, 0.40],
        top: 0.21, bottom: 0.79, midY: [0.22, 0.40],
        edgeCss: 22,
    },
    ui_slot: {
        mode: 'nine',
        left: 0.26, right: 0.74, midX: [0.27, 0.73],
        top: 0.26, bottom: 0.74, midY: [0.27, 0.73],
        edgeCss: 20,
    },
    ui_minimap: {
        mode: 'nine',
        left: 0.22, right: 0.78, midX: [0.23, 0.41],
        top: 0.22, bottom: 0.78, midY: [0.23, 0.41],
        edgeCss: 22,
    },
    ui_card_gold: {
        mode: 'nine',
        left: 0.23, right: 0.77, midX: [0.24, 0.34],
        top: 0.26, bottom: 0.78, midY: [0.27, 0.77],
        edgeCss: 36,
        preserveTopCrown: true,
        crownBand: [0.35, 0.65],
    },
    ui_card_cyan: {
        mode: 'nine',
        left: 0.24, right: 0.76, midX: [0.25, 0.75],
        top: 0.24, bottom: 0.76, midY: [0.25, 0.75],
        edgeCss: 34,
    },
    ui_crafted_button: {
        mode: 'three',
        left: 0.24, right: 0.76, midX: [0.26, 0.41],
    },
    ui_skin_button: {
        mode: 'three',
        left: 0.24, right: 0.76, midX: [0.26, 0.74],
    },
    ui_button_gold: {
        mode: 'three',
        left: 0.24, right: 0.76, midX: [0.26, 0.74],
    },
    ui_hud_bar_frame: {
        mode: 'three',
        left: 0.23, right: 0.77, midX: [0.25, 0.41],
    },
};

const BOUNDS_CACHE = new WeakMap();

export class UIAssets {
    static getOpaqueBounds(scene, sourceKey) {
        if (!scene || !scene.textures || !scene.textures.exists(sourceKey)) return null;
        const source = scene.textures.get(sourceKey).getSourceImage();
        if (!source || !source.width || !source.height) return null;

        let cache = BOUNDS_CACHE.get(source);
        if (cache) return cache;

        const sw = source.width;
        const sh = source.height;
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0);
        const data = ctx.getImageData(0, 0, sw, sh).data;

        let minX = sw;
        let minY = sh;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < sh; y++) {
            const rowOffset = y * sw * 4;
            for (let x = 0; x < sw; x++) {
                if (data[rowOffset + x * 4 + 3] > 8) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < minX || maxY < minY) {
            cache = { sx: 0, sy: 0, sw: sw, sh: sh, fullW: sw, fullH: sh };
        } else {
            cache = {
                sx: minX,
                sy: minY,
                sw: maxX - minX + 1,
                sh: maxY - minY + 1,
                fullW: sw,
                fullH: sh,
            };
        }
        BOUNDS_CACHE.set(source, cache);
        return cache;
    }

    static ensureTrimmedTexture(scene, sourceKey) {
        if (!scene || !scene.textures || !scene.textures.exists(sourceKey)) return null;
        const trimmedKey = `ui_trim_${sourceKey}`;
        if (scene.textures.exists(trimmedKey)) return trimmedKey;
        const bounds = this.getOpaqueBounds(scene, sourceKey);
        if (!bounds) return sourceKey;
        const source = scene.textures.get(sourceKey).getSourceImage();
        const canvas = document.createElement('canvas');
        canvas.width = bounds.sw;
        canvas.height = bounds.sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, bounds.sx, bounds.sy, bounds.sw, bounds.sh, 0, 0, bounds.sw, bounds.sh);
        scene.textures.addCanvas(trimmedKey, canvas);
        return trimmedKey;
    }

    static _applyStateEffect(ctx, width, height, state, tintColor, tintAlpha) {
        if (tintColor !== undefined && tintColor !== null && tintAlpha > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = rgba(tintColor, tintAlpha);
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
        if (state === 'hover' || state === 'active') {
            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            const grad = ctx.createLinearGradient(0, 0, 0, height);
            if (state === 'active') {
                grad.addColorStop(0, 'rgba(255, 232, 168, 0.22)');
                grad.addColorStop(0.5, 'rgba(232, 182, 74, 0.12)');
                grad.addColorStop(1, 'rgba(180, 128, 255, 0.14)');
            } else {
                grad.addColorStop(0, 'rgba(232, 218, 255, 0.18)');
                grad.addColorStop(0.5, 'rgba(164, 130, 255, 0.11)');
                grad.addColorStop(1, 'rgba(255, 224, 160, 0.12)');
            }
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        } else if (state === 'pressed') {
            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    }

    static ensureThreeSlice(scene, sourceKey, w, h, opts = {}) {
        if (!scene || !scene.textures || !scene.textures.exists(sourceKey)) return null;
        const width = Math.max(4, Math.ceil(w));
        const height = Math.max(4, Math.ceil(h));
        const profile = SLICE_PROFILES[sourceKey] || { left: 0.24, right: 0.76, midX: [0.26, 0.74] };
        const state = opts.state || 'normal';
        const tintColor = opts.tintColor !== undefined ? opts.tintColor : null;
        const tintAlpha = opts.tintAlpha !== undefined ? opts.tintAlpha : 0;
        const key = `ui_3s_${sourceKey}_${width}x${height}_${state}_${tintColor || 0}_${Math.round(tintAlpha * 100)}`;
        if (scene.textures.exists(key)) return key;

        const bounds = this.getOpaqueBounds(scene, sourceKey);
        const source = scene.textures.get(sourceKey).getSourceImage();
        if (!bounds || !source) return null;

        const leftSrcW = Math.max(1, Math.round(bounds.sw * profile.left));
        const rightSrcX = Math.round(bounds.sw * profile.right);
        const rightSrcW = Math.max(1, bounds.sw - rightSrcX);
        const midSrcX = Math.round(bounds.sw * profile.midX[0]);
        const midSrcEnd = Math.round(bounds.sw * profile.midX[1]);
        const midSrcW = Math.max(2, midSrcEnd - midSrcX);

        const capRatioLeft = leftSrcW / bounds.sh;
        const capRatioRight = rightSrcW / bounds.sh;
        let dstLeftW = Math.round(height * capRatioLeft);
        let dstRightW = Math.round(height * capRatioRight);
        const maxCapsTotal = Math.max(2, Math.floor(width * 0.82));
        if (dstLeftW + dstRightW > maxCapsTotal) {
            const shrink = maxCapsTotal / (dstLeftW + dstRightW);
            dstLeftW = Math.max(1, Math.floor(dstLeftW * shrink));
            dstRightW = Math.max(1, Math.floor(dstRightW * shrink));
        }
        const dstMidW = Math.max(1, width - dstLeftW - dstRightW);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
            source,
            bounds.sx, bounds.sy, leftSrcW, bounds.sh,
            0, 0, dstLeftW, height
        );
        ctx.drawImage(
            source,
            bounds.sx + midSrcX, bounds.sy, midSrcW, bounds.sh,
            Math.max(0, dstLeftW - 0.5), 0, dstMidW + 1, height
        );
        ctx.drawImage(
            source,
            bounds.sx + rightSrcX, bounds.sy, rightSrcW, bounds.sh,
            width - dstRightW, 0, dstRightW, height
        );

        this._applyStateEffect(ctx, width, height, state, tintColor, tintAlpha);
        scene.textures.addCanvas(key, canvas);
        return key;
    }

    static ensureNineSlice(scene, sourceKey, w, h, opts = {}) {
        if (!scene || !scene.textures || !scene.textures.exists(sourceKey)) return null;
        const width = Math.max(4, Math.ceil(w));
        const height = Math.max(4, Math.ceil(h));
        const profile = SLICE_PROFILES[sourceKey] || {
            left: 0.24, right: 0.76, midX: [0.25, 0.75],
            top: 0.24, bottom: 0.76, midY: [0.25, 0.75],
            edgeCss: 26,
        };
        const unitsPerPixel = (scene.scale && scene.game && scene.game.canvas && scene.game.canvas.clientWidth)
            ? scene.scale.width / Math.max(1, scene.game.canvas.clientWidth)
            : 1;
        const requestedEdge = opts.edge !== undefined ? opts.edge : ((profile.edgeCss || 24) * unitsPerPixel);
        const edgeX = Math.max(2, Math.min(Math.floor(width * 0.4), Math.round(requestedEdge)));
        const edgeY = Math.max(2, Math.min(Math.floor(height * 0.4), Math.round(requestedEdge)));
        const state = opts.state || 'normal';
        const tintColor = opts.tintColor !== undefined ? opts.tintColor : null;
        const tintAlpha = opts.tintAlpha !== undefined ? opts.tintAlpha : 0;
        const key = `ui_9s_${sourceKey}_${width}x${height}_${edgeX}x${edgeY}_${state}_${tintColor || 0}_${Math.round(tintAlpha * 100)}`;
        if (scene.textures.exists(key)) return key;

        const bounds = this.getOpaqueBounds(scene, sourceKey);
        const source = scene.textures.get(sourceKey).getSourceImage();
        if (!bounds || !source) return null;

        const sx0 = bounds.sx;
        const sy0 = bounds.sy;
        const sw = bounds.sw;
        const sh = bounds.sh;

        const srcCols = [
            [sx0, Math.max(1, Math.round(sw * profile.left))],
            [sx0 + Math.round(sw * profile.midX[0]), Math.max(2, Math.round(sw * (profile.midX[1] - profile.midX[0])))],
            [sx0 + Math.round(sw * profile.right), Math.max(1, sw - Math.round(sw * profile.right))],
        ];
        const srcRows = [
            [sy0, Math.max(1, Math.round(sh * profile.top))],
            [sy0 + Math.round(sh * profile.midY[0]), Math.max(2, Math.round(sh * (profile.midY[1] - profile.midY[0])))],
            [sy0 + Math.round(sh * profile.bottom), Math.max(1, sh - Math.round(sh * profile.bottom))],
        ];

        const dstCols = [
            [0, edgeX],
            [edgeX, Math.max(1, width - edgeX * 2)],
            [width - edgeX, edgeX],
        ];
        const dstRows = [
            [0, edgeY],
            [edgeY, Math.max(1, height - edgeY * 2)],
            [height - edgeY, edgeY],
        ];

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const padW = c === 1 ? 1 : 0;
                const padH = r === 1 ? 1 : 0;
                ctx.drawImage(
                    source,
                    srcCols[c][0], srcRows[r][0], srcCols[c][1], srcRows[r][1],
                    dstCols[c][0] - padW * 0.5, dstRows[r][0] - padH * 0.5,
                    dstCols[c][1] + padW, dstRows[r][1] + padH
                );
            }
        }

        if (profile.preserveTopCrown && profile.crownBand && width > edgeX * 2.5) {
            const cStart = Math.round(sw * profile.crownBand[0]);
            const cEnd = Math.round(sw * profile.crownBand[1]);
            const cSrcW = Math.max(4, cEnd - cStart);
            const cSrcH = srcRows[0][1];
            const dstCrownW = Math.min(width - edgeX * 2, Math.round(edgeY * (cSrcW / Math.max(1, cSrcH))));
            if (dstCrownW > 4) {
                ctx.clearRect((width - dstCrownW) / 2, 0, dstCrownW, edgeY);
                ctx.drawImage(
                    source,
                    sx0 + cStart, sy0, cSrcW, cSrcH,
                    (width - dstCrownW) / 2, 0, dstCrownW, edgeY
                );
            }
        }

        this._applyStateEffect(ctx, width, height, state, tintColor, tintAlpha);
        scene.textures.addCanvas(key, canvas);
        return key;
    }

    static ensureSkinPanel(scene, w, h, variant = 'panel', opts = {}) {
        const keyMap = {
            modal: 'ui_skin_panel',
            panel: opts.compact ? 'ui_crafted_frame' : 'ui_skin_panel',
            hud: 'ui_crafted_frame',
            card: opts.asset || 'ui_crafted_frame',
            slot: 'ui_slot',
            minimap: 'ui_minimap',
            bar: 'ui_hud_bar_frame',
            button: opts.tone === 'primary' || opts.primary
                ? 'ui_crafted_button'
                : (opts.tone === 'gold' ? 'ui_button_gold' : 'ui_skin_button'),
        };
        let sourceKey = opts.asset ? (this.resolveAsset(scene, opts.asset) || opts.asset) : keyMap[variant];
        if (!sourceKey || !scene.textures.exists(sourceKey)) {
            if (scene.textures.exists('ui_crafted_frame')) sourceKey = 'ui_crafted_frame';
            else if (scene.textures.exists('ui_skin_panel')) sourceKey = 'ui_skin_panel';
            else return null;
        }

        const profile = SLICE_PROFILES[sourceKey];
        const isCompactButton = variant === 'button'
            && profile
            && profile.mode === 'three'
            && (w / Math.max(1, h) < 2.2);
        if (isCompactButton && scene.textures.exists('ui_crafted_frame')) {
            const compactOpts = { ...opts };
            if (compactOpts.edge === undefined) {
                compactOpts.edge = Math.max(6, Math.round(Math.min(w, h) * 0.24));
            }
            if (compactOpts.tintColor === undefined) {
                if (opts.tone === 'primary' || opts.primary || sourceKey === 'ui_crafted_button') {
                    compactOpts.tintColor = 0x8a5cff;
                    compactOpts.tintAlpha = 0.24;
                } else if (opts.tone === 'gold' || sourceKey === 'ui_button_gold') {
                    compactOpts.tintColor = 0xe8b64a;
                    compactOpts.tintAlpha = 0.24;
                }
            }
            return this.ensureNineSlice(scene, 'ui_crafted_frame', w, h, compactOpts);
        }
        if (profile && profile.mode === 'three') {
            return this.ensureThreeSlice(scene, sourceKey, w, h, opts);
        }
        if ((sourceKey === 'ui_slot' || sourceKey === 'ui_minimap') && Math.abs(w - h) <= 2 && (!opts.state || opts.state === 'normal') && !opts.tintColor) {
            return this.ensureTrimmedTexture(scene, sourceKey);
        }
        return this.ensureNineSlice(scene, sourceKey, w, h, opts);
    }

    static resolveAsset(scene, asset) {
        if (!asset || !scene || !scene.textures) return null;
        const key = asset.startsWith('ui_') ? asset : `ui_${asset}`;
        if (scene.textures.exists(key)) return key;
        if (scene.textures.exists(asset)) return asset;
        return null;
    }

    static ensurePanel(scene, w, h, opts = {}) {
        const width = Math.max(2, Math.ceil(w));
        const height = Math.max(2, Math.ceil(h));
        const options = {
            cut: 8,
            fill: SYSTEM.BG_PANEL,
            fillAlpha: 0.88,
            border: SYSTEM.BORDER,
            borderAlpha: 0.9,
            borderWidth: 1,
            accent: 0,
            glow: 0,
            cutCorners: [true, true, true, true],
            variant: 'panel',
            innerBorder: true,
            ornament: true,
            surfaceLines: true,
            highlight: true,
            ...opts,
        };
        const key = textureKey('ui_panel', width, height, options);
        if (scene.textures.exists(key)) return key;

        const pad = Math.max(3, Math.ceil((options.borderWidth || 1) + (options.glow ? 3 : 0)));
        const canvas = document.createElement('canvas');
        canvas.width = width + pad * 2;
        canvas.height = height + pad * 2;
        const ctx = canvas.getContext('2d');
        const x = pad;
        const y = pad;

        if (options.glow) {
            panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
            ctx.shadowColor = rgba(options.border, 0.44);
            ctx.shadowBlur = options.glow;
            ctx.fillStyle = rgba(options.border, 0.07);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
        const fill = ctx.createLinearGradient(x, y, x, y + height);
        fill.addColorStop(0, rgba(0x1b1530, Math.min(1, options.fillAlpha + 0.02)));
        fill.addColorStop(0.14, rgba(options.fill, Math.min(1, options.fillAlpha + 0.08)));
        fill.addColorStop(0.58, rgba(options.fill, options.fillAlpha));
        fill.addColorStop(1, rgba(0x05040d, Math.min(1, options.fillAlpha + 0.08)));
        ctx.fillStyle = fill;
        ctx.fill();

        if (options.surfaceLines && width > 38 && height > 24) {
            ctx.save();
            panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
            ctx.clip();
            ctx.lineWidth = 1;
            ctx.strokeStyle = rgba(options.border, options.variant === 'card' ? 0.055 : 0.035);
            const step = Math.max(7, Math.round(Math.min(width, height) / 16));
            for (let sy = y + step; sy < y + height; sy += step) {
                ctx.beginPath();
                ctx.moveTo(x + 3, sy + 0.5);
                ctx.lineTo(x + width - 3, sy + 0.5);
                ctx.stroke();
            }
            ctx.restore();
        }

        if (options.accent) {
            ctx.save();
            panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
            ctx.clip();
            const accent = ctx.createLinearGradient(x, y, x + width, y);
            accent.addColorStop(0, rgba(options.accent, 0.2));
            accent.addColorStop(0.28, rgba(options.accent, 0.06));
            accent.addColorStop(1, rgba(options.accent, 0));
            ctx.fillStyle = accent;
            ctx.fillRect(x, y, width, height);
            ctx.restore();
        }

        panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
        ctx.lineWidth = options.borderWidth;
        ctx.strokeStyle = rgba(options.border, options.borderAlpha);
        ctx.stroke();

        scene.textures.addCanvas(key, canvas);
        return key;
    }

    static createPanel(scene, x, y, w, h, opts = {}) {
        const variant = opts.variant || 'panel';
        let normalized = { ...opts };
        if (variant === 'hud' || variant === 'slot' || variant === 'minimap' || variant === 'bar') {
            normalized = {
                cut: 4,
                fill: 0x0b0a16,
                fillAlpha: 0.72,
                border: 0x9b8ac4,
                borderAlpha: 0.38,
                borderWidth: 1,
                ...normalized,
                accent: 0,
                glow: 0,
                innerBorder: false,
                ornament: false,
                surfaceLines: false,
                highlight: false,
            };
        } else if (variant === 'button') {
            normalized = {
                cut: 5,
                fill: 0x121022,
                fillAlpha: 0.78,
                border: 0x9b8ac4,
                borderAlpha: 0.48,
                borderWidth: 1,
                hover: {
                    fill: 0x201a3a,
                    fillAlpha: 0.94,
                    border: 0xc8b5f8,
                    borderAlpha: 0.88,
                    borderWidth: 1,
                    glow: 0,
                },
                ...normalized,
                accent: 0,
                glow: 0,
                innerBorder: false,
                ornament: false,
                surfaceLines: false,
                highlight: false,
            };
        } else {
            normalized = {
                cut: 6,
                fill: 0x0d0b1a,
                fillAlpha: 0.92,
                border: 0x8f7bc4,
                borderAlpha: 0.45,
                borderWidth: 1,
                ...normalized,
                accent: 0,
                glow: 0,
                innerBorder: false,
                ornament: false,
                surfaceLines: false,
                highlight: false,
            };
        }

        const useSkin = normalized.useAsset !== false;
        let normal = null;
        let hover = null;
        let pressed = null;
        let activeTex = null;

        if (useSkin) {
            normal = this.ensureSkinPanel(scene, w, h, variant, { ...normalized, state: 'normal' });
            if (normal) {
                if (normalized.hoverAsset) {
                    hover = this.ensureSkinPanel(scene, w, h, variant, {
                        ...normalized,
                        asset: normalized.hoverAsset,
                        state: 'hover',
                    }) || normal;
                } else {
                    hover = this.ensureSkinPanel(scene, w, h, variant, { ...normalized, state: 'hover' }) || normal;
                }
                pressed = this.ensureSkinPanel(scene, w, h, variant, { ...normalized, state: 'pressed' }) || normal;
                if (normalized.activeAsset) {
                    activeTex = this.ensureSkinPanel(scene, w, h, variant, {
                        ...normalized,
                        asset: normalized.activeAsset,
                        state: 'active',
                    }) || hover;
                } else {
                    activeTex = this.ensureSkinPanel(scene, w, h, variant, { ...normalized, state: 'active' }) || hover;
                }
            }
        }

        if (!normal) {
            normal = this.ensurePanel(scene, w, h, normalized);
            hover = normalized.hover ? this.ensurePanel(scene, w, h, { ...normalized, ...normalized.hover }) : normal;
            pressed = normal;
            activeTex = hover;
        }

        const image = scene.add.image(x, y, normal).setOrigin(0, 0);
        image.setDisplaySize(w, h);
        if (normalized.depth !== undefined) image.setDepth(normalized.depth);
        if (normalized.scrollFactor !== undefined) image.setScrollFactor(normalized.scrollFactor);
        if (normalized.alpha !== undefined) image.setAlpha(normalized.alpha);

        image.setUIState = (state) => {
            let nextTex = normal;
            if (state === 'hover') nextTex = hover;
            else if (state === 'pressed') nextTex = pressed;
            else if (state === 'active') nextTex = activeTex;
            if (image.texture && image.texture.key !== nextTex) {
                image.setTexture(nextTex);
            }
            image.setDisplaySize(w, h);
            return image;
        };
        return image;
    }

    static createHitArea(scene, x, y, w, h, depth = 1) {
        return scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setDepth(depth)
            .setInteractive({ useHandCursor: true });
    }
}
