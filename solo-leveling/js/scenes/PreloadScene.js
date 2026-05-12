import { SpriteFactory } from '../utils/SpriteFactory.js';
import { SYSTEM, UI_FONT_MONO, drawSystemPanel } from '../utils/Constants.js';
import { getMenuAssetList } from '../utils/AssetManifest.js';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
        this._preferWebP = true;
        this._pngFallbacks = new Map();
    }

    preload() {
        this._preferWebP = this._supportsWebP();
        this._pngFallbacks.clear();

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
        this.add.rectangle(barX, barY - barH / 2, barW, barH, 0x0a1520, 1).setOrigin(0, 0);

        // Fill (grows with progress)
        const barFill = this.add.rectangle(barX + 1, barY - barH / 2 + 1, 0, barH - 2, SYSTEM.BORDER, 1)
            .setOrigin(0, 0);

        // System tag above bar
        this.add.text(cx, barY - barH / 2 - 34, '[ SYSTEM · INITIALIZING ]', {
            fontSize: '12px', fontFamily: UI_FONT_MONO, color: SYSTEM.TEXT_CYAN,
            letterSpacing: 2,
        }).setOrigin(0.5);

        // Loading label + percent readout
        const baseLabel = '▷  LOADING';
        const loadText = this.add.text(cx, barY - barH / 2 - 60, baseLabel, {
            fontSize: '16px', fontFamily: UI_FONT_MONO, fontStyle: 'bold',
            color: SYSTEM.TEXT_BRIGHT, letterSpacing: 2,
        }).setOrigin(0.5);

        const pctText = this.add.text(cx, barY + barH / 2 + 20, '000 %', {
            fontSize: '11px', fontFamily: UI_FONT_MONO,
            color: SYSTEM.TEXT_CYAN_DIM, letterSpacing: 2,
        }).setOrigin(0.5);

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
            barFill.width = (barW - 2) * value;
            pctText.setText(String(Math.floor(value * 100)).padStart(3, '0') + ' %');
        });

        this.load.on('complete', () => {
            loadText.setText('▷  READY');
            loadText.setColor(SYSTEM.TEXT_GOLD);
            pctText.setText('100 %');
        });

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
        if (!this._preferWebP || !pngPath.endsWith('.png')) {
            this.load.image(key, pngPath);
            return;
        }

        const webpPath = pngPath.replace(/\.png$/i, '.webp');
        this._pngFallbacks.set(key, pngPath);
        this.load.image(key, webpPath);
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
