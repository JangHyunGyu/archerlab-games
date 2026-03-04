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
        const CDN = 'https://cdn.jsdelivr.net/gh/crawl/crawl@master/crawl-ref/source/rltiles/';

        // Silently ignore load failures — procedural fallback will be used
        this.load.on('loaderror', (file) => {
            console.warn('CDN asset not loaded (procedural fallback):', file.key);
        });

        // --- Enemy sprites (DCSS 32x32 CC0 tiles) ---
        this.load.image('ext_enemy_goblin', CDN + 'mon/humanoids/goblin.png');
        this.load.image('ext_enemy_orc', CDN + 'mon/humanoids/orcs/orc_warrior.png');
        this.load.image('ext_enemy_iceBear', CDN + 'mon/animals/polar_bear.png');
        this.load.image('ext_enemy_antSoldier', CDN + 'mon/animals/goliath_beetle.png');
        this.load.image('ext_enemy_stoneGolem', CDN + 'mon/nonliving/iron_golem.png');
        this.load.image('ext_enemy_darkMage', CDN + 'mon/humanoids/humans/necromancer.png');
        this.load.image('ext_enemy_ironKnight', CDN + 'mon/humanoids/humans/death_knight.png');
        this.load.image('ext_enemy_demonWarrior', CDN + 'mon/demons/executioner.png');

        // --- Boss sprites ---
        this.load.image('ext_boss_igris', CDN + 'mon/humanoids/humans/death_knight.png');
        this.load.image('ext_boss_tusk', CDN + 'mon/humanoids/orcs/orc_warlord.png');
        this.load.image('ext_boss_beru', CDN + 'mon/animals/emperor_scorpion.png');

        // --- Shadow soldier sprites ---
        this.load.image('ext_shadow_melee', CDN + 'mon/nonliving/shadows/shadow_human.png');
        this.load.image('ext_shadow_tank', CDN + 'mon/nonliving/shadows/shadow_dwarf.png');
        this.load.image('ext_shadow_ranged', CDN + 'mon/nonliving/shadows/shadow_elf.png');
    }
}
