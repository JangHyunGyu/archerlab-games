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
            ctx.shadowColor = rgba(options.border, 0.5);
            ctx.shadowBlur = options.glow;
            ctx.fillStyle = rgba(options.border, 0.08);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
        const fill = ctx.createLinearGradient(x, y, x, y + height);
        fill.addColorStop(0, rgba(options.fill, Math.min(1, options.fillAlpha + 0.05)));
        fill.addColorStop(0.55, rgba(options.fill, options.fillAlpha));
        fill.addColorStop(1, rgba(0x02040a, Math.min(1, options.fillAlpha + 0.06)));
        ctx.fillStyle = fill;
        ctx.fill();

        if (options.accent) {
            ctx.save();
            panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
            ctx.clip();
            const accent = ctx.createLinearGradient(x, y, x + width, y);
            accent.addColorStop(0, rgba(options.accent, 0.18));
            accent.addColorStop(0.35, rgba(options.accent, 0.04));
            accent.addColorStop(1, rgba(options.accent, 0));
            ctx.fillStyle = accent;
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = rgba(0xffffff, 0.035);
            ctx.fillRect(x + 1, y + 1, Math.max(0, width - 2), 1);
            ctx.restore();
        }

        panelPath(ctx, x, y, width, height, options.cut, options.cutCorners);
        ctx.lineWidth = options.borderWidth;
        ctx.strokeStyle = rgba(options.border, options.borderAlpha);
        ctx.stroke();

        if (options.borderWidth <= 1 && width > 20 && height > 20) {
            panelPath(ctx, x + 2, y + 2, width - 4, height - 4, Math.max(0, options.cut - 2), options.cutCorners);
            ctx.lineWidth = 1;
            ctx.strokeStyle = rgba(options.border, Math.min(0.25, options.borderAlpha * 0.25));
            ctx.stroke();
        }

        scene.textures.addCanvas(key, canvas);
        return key;
    }

    static createPanel(scene, x, y, w, h, opts = {}) {
        const normal = this.resolveAsset(scene, opts.asset) || this.ensurePanel(scene, w, h, opts);
        const hover = this.resolveAsset(scene, opts.hoverAsset)
            || (opts.hover ? this.ensurePanel(scene, w, h, { ...opts, ...opts.hover }) : normal);
        const image = scene.add.image(x, y, normal).setOrigin(0, 0);
        image.setDisplaySize(w, h);
        if (opts.depth !== undefined) image.setDepth(opts.depth);
        if (opts.scrollFactor !== undefined) image.setScrollFactor(opts.scrollFactor);
        image.setUIState = (state) => image.setTexture(state === 'hover' ? hover : normal).setDisplaySize(w, h);
        return image;
    }

    static createHitArea(scene, x, y, w, h, depth = 1) {
        return scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
            .setDepth(depth)
            .setInteractive({ useHandCursor: true });
    }
}
