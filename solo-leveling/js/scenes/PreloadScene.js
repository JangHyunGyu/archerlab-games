import { SpriteFactory } from '../utils/SpriteFactory.js';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
        // --- Loading bar UI ---
        const { width, height } = this.cameras.main;
        const cx = width / 2, cy = height / 2;

        const barW = Math.min(320, width * 0.6);
        const barH = 18;

        // Background box
        this.add.rectangle(cx, cy, barW + 20, barH + 20, 0x1a1a2e)
            .setStrokeStyle(2, 0x4a1a8a);

        // Progress bar bg
        const barBg = this.add.rectangle(cx - barW / 2, cy, barW, barH, 0x333344)
            .setOrigin(0, 0.5);

        // Progress bar fill
        const barFill = this.add.rectangle(cx - barW / 2, cy, 0, barH, 0x7b2fff)
            .setOrigin(0, 0.5);

        // Loading text
        const loadText = this.add.text(cx, cy - 30, '로딩 중...', {
            fontSize: '14px', fontFamily: 'Arial', color: '#b366ff',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5);

        // Listen to load progress
        this.load.on('progress', (value) => {
            barFill.width = barW * value;
        });

        this.load.on('complete', () => {
            loadText.setText('완료!');
        });

        // --- Try loading external assets (optional) ---
        // If assets/ folder has sprite sheets, they'll be loaded here.
        // Missing files are silently ignored via error handler.
        this._loadOptionalAssets();
    }

    create() {
        // Generate procedural textures for any assets not loaded externally
        SpriteFactory.createAll(this);
        this.scene.start('MenuScene');
    }

    _loadOptionalAssets() {
        // Future: load external sprite sheets / audio here
        // Example format:
        // this.load.spritesheet('ext_player', 'assets/sprites/player.png', { frameWidth: 48, frameHeight: 52 });
        // this.load.audio('bgm_game', 'assets/audio/bgm/game.mp3');
        //
        // For now, all textures are procedurally generated in create().
        // When external assets are added, SpriteFactory can check if a texture
        // already exists before generating it:
        //   if (!scene.textures.exists('player_idle_0')) { ... }
    }
}
