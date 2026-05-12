import { SpriteFactory } from '../utils/SpriteFactory.js';
import { SYSTEM, UI_FONT_MONO, drawSystemPanel } from '../utils/Constants.js';
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
        const cx = width / 2, cy = height / 2;

        // Deep background
        this.add.rectangle(cx, cy, width, height, SYSTEM.BG_DEEP);

        // Scanlines
        const sg = this.add.graphics();
        sg.lineStyle(1, SYSTEM.SCAN_LINE, 0.5);
        for (let y = 0; y < height; y += 3) sg.lineBetween(0, y, width, y);

        // Bar geometry
        const barW = Math.min(340, width * 0.6);
        const barH = 16;
        const barX = cx - barW / 2;
        const barY = cy;

        // Frame (angular panel)
        const frame = this.add.graphics();
        drawSystemPanel(frame, barX - 10, barY - barH / 2 - 10, barW + 20, barH + 20, {
            cut: 8,
            fill: SYSTEM.BG_PANEL, fillAlpha: 0.85,
            border: SYSTEM.BORDER, borderAlpha: 0.85, borderWidth: 1,
        });

        // Bar inner background
        this.add.rectangle(barX, barY - barH / 2, barW, barH, 0x0a1520, 1)
            .setOrigin(0, 0)
            .setDepth(1);

        // Fill (grows with progress)
        const barFill = this.add.rectangle(barX + 1, barY - barH / 2 + 1, 0, barH - 2, SYSTEM.BORDER, 1)
            .setOrigin(0, 0)
            .setDepth(2);
        let barFillSkin = null;
        let barFrameSkin = null;
        let coreIcon = null;
        const buildPreloadSkin = () => {
            if (!barFrameSkin && this.textures.exists('preload_bar_frame')) {
                barFrameSkin = this.add.image(cx, barY, 'preload_bar_frame')
                    .setDisplaySize(barW + 26, barH + 30)
                    .setDepth(1.5);
                frame.setAlpha(0.18);
            }
            if (!barFillSkin && this.textures.exists('preload_bar_fill')) {
                barFillSkin = this.add.image(barX + 1, barY, 'preload_bar_fill')
                    .setOrigin(0, 0.5)
                    .setDisplaySize(1, barH - 2)
                    .setVisible(false)
                    .setDepth(2.5);
            }
            if (!coreIcon && this.textures.exists('preload_core')) {
                coreIcon = this.add.image(cx, barY - barH / 2 - 86, 'preload_core')
                    .setDisplaySize(54, 54)
                    .setDepth(3)
                    .setBlendMode(Phaser.BlendModes.ADD);
                this.tweens.add({
                    targets: coreIcon,
                    angle: 360,
                    duration: 3600,
                    repeat: -1,
                    ease: 'Linear',
                });
            }
        };
        this.load.on('filecomplete', buildPreloadSkin);

        // System tag above bar
        this.add.text(cx, barY - barH / 2 - 34, '[ SYSTEM · INITIALIZING ]', {
            fontSize: '12px', fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            letterSpacing: 0,
        }).setOrigin(0.5).setDepth(4);

        // Loading label + percent readout
        const baseLabel = 'SYSTEM LOADING';
        const loadText = this.add.text(cx, barY - barH / 2 - 60, baseLabel, {
            fontSize: '16px', fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, letterSpacing: 0,
            stroke: '#02040a', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(4);

        const pctText = this.add.text(cx, barY + barH / 2 + 20, '000 %', {
            fontSize: '11px', fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN_DIM, letterSpacing: 0,
        }).setOrigin(0.5).setDepth(4);

        // Dots animation
        let dotCount = 0;
        this.time.addEvent({
            delay: 320, loop: true,
            callback: () => {
                if (!loadText.active) return;
                dotCount = (dotCount + 1) % 4;
                loadText.setText(baseLabel + '.'.repeat(dotCount));
            },
        });

        this.load.on('progress', (value) => {
            const fillW = (barW - 2) * value;
            barFill.width = fillW;
            if (barFillSkin) {
                barFillSkin.setVisible(fillW > 1);
                barFillSkin.setDisplaySize(Math.max(1, fillW), barH - 2);
            }
            pctText.setText(String(Math.floor(value * 100)).padStart(3, '0') + ' %');
        });

        this.load.on('complete', () => {
            this.load.off('filecomplete', buildPreloadSkin);
            loadText.setText('SYSTEM READY');
            loadText.setColor(SYSTEM.TEXT_GOLD);
            pctText.setText('100 %');
        });

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

    _loadImage(key, pngPath) {
        if (this.textures.exists(key) || this._queuedAssetKeys.has(key)) return;
        this._queuedAssetKeys.add(key);
        if (!this._preferWebP || !pngPath.endsWith('.png')) {
            this.load.image(key, pngPath);
            return;
        }

        const webpPath = pngPath.replace(/\.png$/i, '.webp');
        this._pngFallbacks.set(key, pngPath);
        this.load.image(key, webpPath);
    }

    _loadPreloadSkinAssets() {
        [
            { key: 'preload_core', path: 'assets/ui/menu/preload_core.png' },
            { key: 'preload_bar_frame', path: 'assets/ui/menu/preload_bar_frame.png' },
            { key: 'preload_bar_fill', path: 'assets/ui/menu/preload_bar_fill.png' },
        ].forEach(asset => this._loadImage(asset.key, asset.path));
    }

    _loadOptionalAssets() {
        this.load.on('loaderror', (file) => {
            const fallback = this._pngFallbacks.get(file.key);
            if (fallback) {
                this._pngFallbacks.delete(file.key);
                console.warn('WebP asset not loaded; falling back to PNG:', file.key);
                this.load.image(file.key, fallback);
                return;
            }
            console.warn('Asset not loaded (procedural fallback if available):', file.key);
        });

        getMenuAssetList().forEach(asset => this._loadImage(asset.key, asset.path));
    }
}
