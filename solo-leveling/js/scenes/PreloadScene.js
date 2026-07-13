import { SpriteFactory } from '../utils/SpriteFactory.js';
import { SYSTEM, UI_FONT_MONO, fs, uv, drawSystemPanel, fitText, padText } from '../utils/Constants.js';
import { getMenuAssetList } from '../utils/AssetManifest.js';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
        this._preferWebP = true;
        this._pngFallbacks = new Map();
        this._queuedAssetKeys = new Set();
    }

    preload() {
        this._preferWebP = this._supportsWebP();
        this._pngFallbacks.clear();
        this._queuedAssetKeys.clear();

        const { width, height } = this.cameras.main;
        const cx = width / 2;
        const cy = height / 2;
        const isPortrait = height > width * 1.08;
        const isWide = width / height > 1.55;
        const reducedMotion = window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false;
        const sidePad = uv(isPortrait ? 26 : 40);
        const panelW = Math.min(width - sidePad * 2, uv(isPortrait ? 600 : (isWide ? 720 : 650)));
        const panelH = Math.min(height - uv(72), uv(isPortrait ? 330 : 280));
        const panelCX = cx;
        const panelCY = isPortrait ? height * 0.43 : cy;
        const panelX = panelCX - panelW / 2;
        const panelY = panelCY - panelH / 2;

        // Layered system backdrop
        this.add.rectangle(cx, cy, width, height, SYSTEM.BG_DEEP);

        const ambientRadius = Math.min(panelW * 0.62, uv(420));
        this.add.circle(panelCX, panelCY, ambientRadius, 0x0d3850, 0.08)
            .setBlendMode(Phaser.BlendModes.ADD);
        this.add.circle(panelCX, panelCY, ambientRadius * 0.62, 0x1a6685, 0.045)
            .setBlendMode(Phaser.BlendModes.ADD);

        const grid = this.add.graphics();
        const gridStep = Math.max(uv(44), 32);
        grid.lineStyle(1, SYSTEM.SCAN_LINE, 0.22);
        for (let x = cx % gridStep; x < width; x += gridStep) grid.lineBetween(x, 0, x, height);
        for (let y = panelCY % gridStep; y < height; y += gridStep) grid.lineBetween(0, y, width, y);

        // Scanlines stay subtle enough to preserve text clarity.
        const scanlines = this.add.graphics();
        scanlines.lineStyle(1, SYSTEM.SCAN_LINE, 0.34);
        for (let y = 0; y < height; y += Math.max(3, uv(3))) {
            scanlines.lineBetween(0, y, width, y);
        }

        const frameGlow = this.add.graphics();
        drawSystemPanel(frameGlow, panelX - uv(5), panelY - uv(5), panelW + uv(10), panelH + uv(10), {
            cut: uv(18),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.18,
            border: SYSTEM.BORDER, borderAlpha: 0.1, borderWidth: uv(4),
        });

        const frame = this.add.graphics();
        drawSystemPanel(frame, panelX, panelY, panelW, panelH, {
            cut: uv(15),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.9,
            border: SYSTEM.BORDER, borderAlpha: 0.65, borderWidth: 1,
        });
        drawSystemPanel(frame, panelX + uv(8), panelY + uv(8), panelW - uv(16), panelH - uv(16), {
            cut: uv(10),
            fill: SYSTEM.BG_PANEL, fillAlpha: 0,
            border: SYSTEM.BORDER_DIM, borderAlpha: 0.32, borderWidth: 1,
        });
        frame.fillStyle(SYSTEM.BORDER, 0.9);
        frame.fillRect(panelX + uv(22), panelY, Math.min(uv(96), panelW * 0.24), Math.max(1, uv(2)));
        frame.fillStyle(SYSTEM.BORDER, 0.42);
        frame.fillRect(
            panelX + panelW - uv(76),
            panelY + panelH - Math.max(1, uv(2)),
            uv(54),
            Math.max(1, uv(2)),
        );

        const tagY = panelY + uv(25);
        const coreY = panelY + uv(isPortrait ? 72 : 65);
        const loadLabelY = panelY + uv(isPortrait ? 122 : 116);

        // The procedural core keeps the first paint intentional while textures stream in.
        const coreFallback = this.add.graphics().setPosition(panelCX, coreY).setDepth(2);
        const coreRadius = uv(isPortrait ? 25 : 23);
        coreFallback.lineStyle(Math.max(1, uv(1)), SYSTEM.BORDER, 0.54);
        coreFallback.strokeCircle(0, 0, coreRadius);
        coreFallback.lineStyle(1, SYSTEM.BORDER_DIM, 0.8);
        coreFallback.strokeCircle(0, 0, coreRadius * 0.66);
        coreFallback.lineBetween(-coreRadius - uv(8), 0, -coreRadius + uv(3), 0);
        coreFallback.lineBetween(coreRadius - uv(3), 0, coreRadius + uv(8), 0);
        coreFallback.lineBetween(0, -coreRadius - uv(8), 0, -coreRadius + uv(3));
        coreFallback.lineBetween(0, coreRadius - uv(3), 0, coreRadius + uv(8));
        this.add.circle(panelCX, coreY, Math.max(2, uv(3)), SYSTEM.BORDER, 0.9)
            .setDepth(2)
            .setBlendMode(Phaser.BlendModes.ADD);
        if (!reducedMotion) {
            this.tweens.add({
                targets: coreFallback,
                angle: 360,
                duration: 5200,
                repeat: -1,
                ease: 'Linear',
            });
        }

        const barW = Math.min(panelW - uv(70), uv(isPortrait ? 500 : 560));
        const barH = Math.max(uv(14), 14);
        const barX = cx - barW / 2;
        const barY = panelY + uv(isPortrait ? 190 : 180);

        const barFrame = this.add.graphics().setDepth(3);
        drawSystemPanel(barFrame, barX - uv(8), barY - barH / 2 - uv(8), barW + uv(16), barH + uv(16), {
            cut: uv(7),
            fill: 0x03070d, fillAlpha: 0.94,
            border: SYSTEM.BORDER_DIM, borderAlpha: 0.85, borderWidth: 1,
        });

        this.add.rectangle(barX, barY - barH / 2, barW, barH, 0x0a1520, 1)
            .setOrigin(0, 0)
            .setDepth(3);

        const barFill = this.add.rectangle(
            barX + 1,
            barY - barH / 2 + 1,
            0,
            barH - 2,
            SYSTEM.BORDER,
            0.88,
        ).setOrigin(0, 0).setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
        const barGloss = this.add.rectangle(
            barX + 1,
            barY - barH / 2 + 1,
            0,
            Math.max(1, barH * 0.24),
            0xc8f6ff,
            0.88,
        ).setOrigin(0, 0).setDepth(5);
        const barCap = this.add.rectangle(
            barX + 1,
            barY,
            Math.max(2, uv(2)),
            barH + uv(8),
            0x8cecff,
            0.9,
        ).setDepth(5).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);

        const barTicks = this.add.graphics().setDepth(6);
        barTicks.lineStyle(1, 0x02070d, 0.6);
        for (let i = 1; i < 16; i++) {
            const tickX = barX + (barW * i / 16);
            barTicks.lineBetween(tickX, barY - barH / 2 + 2, tickX, barY + barH / 2 - 2);
        }

        let barFillSkin = null;
        let barFrameSkin = null;
        let coreIcon = null;
        const buildPreloadSkin = () => {
            if (!barFrameSkin && this.textures.exists('preload_bar_frame')) {
                barFrameSkin = this.add.image(cx, barY, 'preload_bar_frame')
                    .setDisplaySize(barW + uv(22), barH + uv(26))
                    .setDepth(3.5);
                barFrame.setAlpha(0.28);
            }
            if (!barFillSkin && this.textures.exists('preload_bar_fill')) {
                barFillSkin = this.add.image(barX + 1, barY, 'preload_bar_fill')
                    .setOrigin(0, 0.5)
                    .setDisplaySize(1, barH - 2)
                    .setVisible(false)
                    .setDepth(4.5);
            }
            if (!coreIcon && this.textures.exists('preload_core')) {
                const coreSize = uv(isPortrait ? 60 : 56);
                coreIcon = this.add.image(cx, coreY, 'preload_core')
                    .setDisplaySize(coreSize, coreSize)
                    .setDepth(2.5)
                    .setBlendMode(Phaser.BlendModes.ADD);
                coreFallback.setAlpha(0.34);
                if (!reducedMotion) {
                    this.tweens.add({
                        targets: coreIcon,
                        angle: 360,
                        duration: 3600,
                        repeat: -1,
                        ease: 'Linear',
                    });
                }
            }
        };
        this.load.on('filecomplete', buildPreloadSkin);

        const systemTag = padText(this.add.text(cx, tagY, '[ SYSTEM · INITIALIZING ]', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN, letterSpacing: 0,
        }).setOrigin(0.5).setDepth(7), 4, 5, 3, 3);
        fitText(systemTag, panelW - uv(42), 0, 0.72);

        const baseLabel = 'SYSTEM LOADING';
        const loadText = padText(this.add.text(cx, loadLabelY, baseLabel, {
            fontSize: fs(isPortrait ? 17 : 16), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, letterSpacing: 0,
            stroke: '#02040a', strokeThickness: uv(2),
        }).setOrigin(0.5).setDepth(7), 5, 6, 4, 4);
        fitText(loadText, panelW - uv(48), uv(40), 0.72);

        const pctText = padText(this.add.text(cx, barY + barH / 2 + uv(24), '000 %', {
            fontSize: fs(11), fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_CYAN_DIM, letterSpacing: 0,
        }).setOrigin(0.5).setDepth(7), 3, 4, 3, 3);

        let dotCount = 0;
        if (!reducedMotion) {
            this.time.addEvent({
                delay: 320,
                loop: true,
                callback: () => {
                    if (!loadText.active) return;
                    dotCount = (dotCount + 1) % 4;
                    loadText.setText(baseLabel + '.'.repeat(dotCount));
                },
            });
        }

        const onProgress = (value) => {
            const fillW = (barW - 2) * value;
            barFill.width = fillW;
            barGloss.width = fillW;
            barCap.setVisible(fillW > 2).setX(barX + 1 + fillW);
            if (barFillSkin) {
                barFillSkin.setVisible(fillW > 1);
                barFillSkin.setDisplaySize(Math.max(1, fillW), barH - 2);
            }
            pctText.setText(String(Math.floor(value * 100)).padStart(3, '0') + ' %');
        };

        const cleanupLoadHandlers = () => {
            this.load.off('filecomplete', buildPreloadSkin);
            this.load.off('progress', onProgress);
            this.load.off('complete', onComplete);
            if (this._onPreloadLoadError) {
                this.load.off('loaderror', this._onPreloadLoadError);
                this._onPreloadLoadError = null;
            }
            this.events.off('shutdown', cleanupLoadHandlers);
        };
        const onComplete = () => {
            cleanupLoadHandlers();
            loadText.setText('SYSTEM READY');
            loadText.setColor(SYSTEM.TEXT_GOLD);
            pctText.setText('100 %');
            pctText.setColor(SYSTEM.TEXT_GOLD);
            barCap.setFillStyle(SYSTEM.BORDER_GOLD, 1);
        };

        this.load.on('progress', onProgress);
        this.load.on('complete', onComplete);
        this.events.once('shutdown', cleanupLoadHandlers);

        this._loadPreloadSkinAssets();
        this._loadOptionalAssets();
    }

    create() {
        SpriteFactory.createAll(this);
        this.scene.start('MenuScene');
    }

    _supportsWebP() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            return canvas.toDataURL('image/webp').startsWith('data:image/webp');
        } catch (e) {
            return false;
        }
    }

    _loadImage(key, pngPath, options = {}) {
        if (this.textures.exists(key) || this._queuedAssetKeys.has(key)) return;
        this._queuedAssetKeys.add(key);
        const withVersion = (path) => {
            if (!options.cacheVersion) return path;
            const separator = path.includes('?') ? '&' : '?';
            return `${path}${separator}v=${encodeURIComponent(options.cacheVersion)}`;
        };
        if (options.preferPng || !this._preferWebP || !pngPath.endsWith('.png')) {
            this.load.image(key, withVersion(pngPath));
            return;
        }

        const webpPath = pngPath.replace(/\.png$/i, '.webp');
        this._pngFallbacks.set(key, withVersion(pngPath));
        this.load.image(key, withVersion(webpPath));
    }

    _loadPreloadSkinAssets() {
        [
            { key: 'preload_core', path: 'assets/ui/menu/preload_core.png' },
            { key: 'preload_bar_frame', path: 'assets/ui/menu/preload_bar_frame.png' },
            { key: 'preload_bar_fill', path: 'assets/ui/menu/preload_bar_fill.png' },
        ].forEach(asset => this._loadImage(asset.key, asset.path, asset));
    }

    _loadOptionalAssets() {
        this._onPreloadLoadError = (file) => {
            const fallback = this._pngFallbacks.get(file.key);
            if (fallback) {
                this._pngFallbacks.delete(file.key);
                console.warn('WebP asset not loaded; falling back to PNG:', file.key);
                this.load.image(file.key, fallback);
                return;
            }
            console.warn('Asset not loaded (procedural fallback if available):', file.key);
        };
        this.load.on('loaderror', this._onPreloadLoadError);

        getMenuAssetList().forEach(asset => this._loadImage(asset.key, asset.path, asset));
    }
}
