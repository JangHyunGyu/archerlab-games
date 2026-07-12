import { SYSTEM } from '../utils/Constants.js';

function colorToRgb(color) {
    return {
        r: (color >> 16) & 0xff,
        g: (color >> 8) & 0xff,
        b: color & 0xff,
    };
}

function rgba(color, alpha = 1) {
    const { r, g, b } = colorToRgb(color);
    return `rgba(${r},${g},${b},${alpha})`;
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
    const [tl, tr, br, bl] = cutCorners.map(enabled => enabled ? cut : 0);
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

export class UIAssets {
    static resolveAsset(scene, asset) {
        if (!asset) return null;
        const key = asset.startsWith('ui_') ? asset : `ui_${asset}`;
        return scene.textures.exists(key) ? key : null;
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
        fill.addColorStop(0, rgba(0x17253a, Math.min(1, options.fillAlpha + 0.02)));
        fill.addColorStop(0.12, rgba(options.fill, Math.min(1, options.fillAlpha + 0.08)));
        fill.addColorStop(0.58, rgba(options.fill, options.fillAlpha));
        fill.addColorStop(1, rgba(0x02040a, Math.min(1, options.fillAlpha + 0.08)));
        ctx.fillStyle = fill;
        ctx.fill();

        // A quiet, deterministic material texture keeps large panels from looking flat.
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
            const sheen = ctx.createLinearGradient(x, y, x + width, y + height);
            sheen.addColorStop(0, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.43, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.5, 'rgba(255,255,255,0.028)');
            sheen.addColorStop(0.57, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen;
            ctx.fillRect(x, y, width, height);
            ctx.restore();
        }

        if (options.accent) {
            ctx.save();
            panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
            ctx.clip();
            const accent = ctx.createLinearGradient(x, y, x + width, y);
            accent.addColorStop(0, rgba(options.accent, 0.22));
            accent.addColorStop(0.28, rgba(options.accent, 0.07));
            accent.addColorStop(1, rgba(options.accent, 0));
            ctx.fillStyle = accent;
            ctx.fillRect(x, y, width, height);
            ctx.restore();
        }

        if (options.highlight && width > 26) {
            const topGlow = ctx.createLinearGradient(x, y, x + width, y);
            topGlow.addColorStop(0, rgba(options.border, 0));
            topGlow.addColorStop(0.2, rgba(options.border, 0.16));
            topGlow.addColorStop(0.5, rgba(0xffffff, 0.2));
            topGlow.addColorStop(0.8, rgba(options.border, 0.16));
            topGlow.addColorStop(1, rgba(options.border, 0));
            ctx.fillStyle = topGlow;
            ctx.fillRect(x + options.cut, y + 1, Math.max(0, width - options.cut * 2), 1);
        }

        panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
        ctx.lineWidth = options.borderWidth;
        ctx.strokeStyle = rgba(options.border, options.borderAlpha);
        ctx.stroke();

        if (options.innerBorder && width > 20 && height > 20) {
            panelPath(ctx, x + 3, y + 3, width - 6, height - 6, Math.max(0, options.cut - 3), options.cutCorners);
            ctx.lineWidth = 1;
            ctx.strokeStyle = rgba(options.border, Math.min(0.32, options.borderAlpha * 0.34));
            ctx.stroke();
        }

        if (options.ornament && width > 54 && height > 28) {
            const mark = Math.max(4, Math.min(9, Math.round(options.cut * 0.72)));
            ctx.lineWidth = Math.max(1, Math.min(2, options.borderWidth));
            ctx.strokeStyle = rgba(options.border, Math.min(0.78, options.borderAlpha));
            const corners = [
                [x + options.cut + 3, y + 4, 1, 1],
                [x + width - options.cut - 3, y + 4, -1, 1],
                [x + width - options.cut - 3, y + height - 4, -1, -1],
                [x + options.cut + 3, y + height - 4, 1, -1],
            ];
            corners.forEach(([cx, cy, dx, dy]) => {
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + dx * mark, cy);
                ctx.lineTo(cx + dx * (mark + 3), cy + dy * 3);
                ctx.stroke();
            });

            if (options.variant === 'card' && height > 72) {
                ctx.fillStyle = rgba(options.border, 0.58);
                ctx.beginPath();
                ctx.moveTo(x + width / 2, y + 3);
                ctx.lineTo(x + width / 2 + 4, y + 7);
                ctx.lineTo(x + width / 2, y + 11);
                ctx.lineTo(x + width / 2 - 4, y + 7);
                ctx.closePath();
                ctx.fill();
            }
        }

        scene.textures.addCanvas(key, canvas);
        return key;
    }

    static createPanel(scene, x, y, w, h, opts = {}) {
        // Most bundled panels were authored at one ratio and looked soft or distorted when
        // stretched. Runtime chrome is the default; fixed-ratio artwork opts in explicitly.
        const normalAsset = opts.preferAsset ? this.resolveAsset(scene, opts.asset) : null;
        const hoverAsset = opts.preferAsset ? this.resolveAsset(scene, opts.hoverAsset) : null;
        const normal = normalAsset || this.ensurePanel(scene, w, h, opts);
        const hover = hoverAsset
            || (opts.hover ? this.ensurePanel(scene, w, h, { ...opts, ...opts.hover }) : normal);
        const image = scene.add.image(x, y, normal).setOrigin(0, 0);
        image.setDisplaySize(w, h);
        if (opts.depth !== undefined) image.setDepth(opts.depth);
        if (opts.scrollFactor !== undefined) image.setScrollFactor(opts.scrollFactor);
        image.setUIState = (state) => {
            image.setTexture(state === 'hover' ? hover : normal).setDisplaySize(w, h);
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
