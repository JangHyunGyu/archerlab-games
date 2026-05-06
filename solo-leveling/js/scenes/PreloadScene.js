import { SpriteFactory } from '../utils/SpriteFactory.js';
import { SYSTEM, UI_FONT_MONO, drawSystemPanel, WEAPONS, PASSIVES } from '../utils/Constants.js';
import { CHARACTER_DEFS, CHARACTER_FRAME_NAMES, CHARACTER_SKILL_EFFECT_KEYS } from '../utils/Characters.js';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
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

    _loadOptionalAssets() {
        [
            'ui_panel_cyan',
            'ui_panel_gold',
            'ui_panel_red',
            'ui_panel_purple',
            'ui_card_cyan',
            'ui_card_gold',
            'ui_card_hover',
            'ui_choice_cyan',
            'ui_choice_gold',
            'ui_choice_hover',
            'ui_button_cyan',
            'ui_button_hover',
            'ui_slot',
            'ui_minimap',
        ].forEach((key) => {
            this.load.image(key, `assets/ui/${key}.png`);
        });

        [...Object.keys(WEAPONS), ...Object.keys(PASSIVES)].forEach((key) => {
            this.load.image(`asset_icon_${key}`, `assets/ui/icons/${key}.png`);
        });

        [
            'hp_potion',
            'mana_crystal',
            'shadow_essence',
        ].forEach((key) => {
            this.load.image(`item_${key}`, `assets/items/${key}.png`);
        });

        [
            'warning_reticle',
            'igris_slash_warning',
            'ground_crack',
            'acid_puddle',
        ].forEach((key) => {
            this.load.image(`telegraph_${key}`, `assets/effects/telegraphs/${key}.png`);
        });

        [
            'cracked_pillar',
            'rune_stone',
            'shadow_portal',
            'hanging_chain',
        ].forEach((key) => {
            this.load.image(`env_${key}`, `assets/environment/${key}.png`);
        });

        ['melee', 'tank', 'ranged'].forEach((key) => {
            this.load.image(`asset_shadow_${key}`, `assets/shadows/shadow_${key}.png`);
        });

        Object.values(CHARACTER_DEFS).forEach((character) => {
            this.load.image(
                `char_${character.assetKey}_portrait`,
                `assets/player/characters/${character.assetKey}/portrait.png`
            );
            if (character.usesExistingPlayerMotion) return;
            CHARACTER_FRAME_NAMES.forEach((frameName) => {
                this.load.image(
                    `${character.texturePrefix}_${frameName}`,
                    `assets/player/characters/${character.assetKey}/motion/${frameName}.png`
                );
            });
        });

        CHARACTER_SKILL_EFFECT_KEYS.forEach((key) => {
            this.load.image(`char_skill_${key}`, `assets/effects/character_skills/${key}.png`);
        });

        this.load.image('ai_player_idle', 'assets/player/player_idle.png');
        this.load.image('ai_dungeon_floor', 'assets/background/bg_dungeon_floor.png');

        const loadPlayerMotion = (name) => {
            this.load.image(`motion_${name}`, `assets/player/motion/${name}.png`);
        };
        for (let i = 0; i < 4; i++) {
            loadPlayerMotion(`player_idle_${i}`);
            loadPlayerMotion(`player_walk_down_${i}`);
            loadPlayerMotion(`player_walk_right_${i}`);
            loadPlayerMotion(`player_walk_up_${i}`);
            loadPlayerMotion(`player_walk_left_${i}`);
        }
        for (let i = 0; i < 6; i++) loadPlayerMotion(`player_attack_${i}`);
        ['down', 'right', 'up', 'left'].forEach((dir) => {
            for (let i = 0; i < 6; i++) loadPlayerMotion(`player_attack_${dir}_${i}`);
        });
        for (let i = 0; i < 2; i++) loadPlayerMotion(`player_hit_${i}`);

        [
            'goblin',
            'antSoldier',
            'orc',
            'iceBear',
            'stoneGolem',
            'darkMage',
            'ironKnight',
            'demonWarrior',
        ].forEach((key) => {
            this.load.image(`ai_enemy_${key}`, `assets/enemies/source/${key}.png`);
        });
        ['igris', 'tusk', 'beru'].forEach((key) => {
            this.load.image(`ai_boss_${key}`, `assets/bosses/source/${key}.png`);
        });
        [
            'shadow_dagger',
            'shadow_slash',
            'ruler_authority',
            'dragon_fear',
        ].forEach((key) => {
            this.load.image(`effect_${key}`, `assets/effects/${key}.png`);
        });
        [
            'basic_stab',
            'monster_hit',
            'monster_crit',
            'monster_death',
        ].forEach((key) => {
            for (let i = 0; i < 6; i++) {
                this.load.image(`effect_${key}_${i}`, `assets/effects/combat/${key}_${i}.png`);
            }
        });
        [
            'dark_mage_orb',
            'boss_igris_slash',
            'boss_tusk_slam',
            'boss_beru_acid',
        ].forEach((key) => {
            for (let i = 0; i < 6; i++) {
                this.load.image(`effect_${key}_${i}`, `assets/effects/enemy_boss/${key}_${i}.png`);
            }
        });

        const CDN = 'https://cdn.jsdelivr.net/gh/crawl/crawl@master/crawl-ref/source/rltiles/';

        this.load.on('loaderror', (file) => {
            console.warn('CDN asset not loaded (procedural fallback):', file.key);
        });

        this.load.image('ext_enemy_goblin', CDN + 'mon/humanoids/goblin.png');
        this.load.image('ext_enemy_orc', CDN + 'mon/humanoids/orcs/orc_warrior.png');
        this.load.image('ext_enemy_iceBear', CDN + 'mon/animals/polar_bear.png');
        this.load.image('ext_enemy_antSoldier', CDN + 'mon/animals/goliath_beetle.png');
        this.load.image('ext_enemy_stoneGolem', CDN + 'mon/nonliving/iron_golem.png');
        this.load.image('ext_enemy_darkMage', CDN + 'mon/humanoids/humans/necromancer.png');
        this.load.image('ext_enemy_ironKnight', CDN + 'mon/humanoids/humans/death_knight.png');
        this.load.image('ext_enemy_demonWarrior', CDN + 'mon/demons/executioner.png');

        this.load.image('ext_boss_igris', CDN + 'mon/humanoids/humans/death_knight.png');
        this.load.image('ext_boss_tusk', CDN + 'mon/humanoids/orcs/orc_warlord.png');
        this.load.image('ext_boss_beru', CDN + 'mon/animals/emperor_scorpion.png');

        this.load.image('ext_shadow_melee', CDN + 'mon/nonliving/shadows/shadow_human.png');
        this.load.image('ext_shadow_tank', CDN + 'mon/nonliving/shadows/shadow_dwarf.png');
        this.load.image('ext_shadow_ranged', CDN + 'mon/nonliving/shadows/shadow_elf.png');
    }
}
