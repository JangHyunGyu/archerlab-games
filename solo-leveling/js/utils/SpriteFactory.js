import { COLORS, ENEMY_TYPES, BOSS_TYPES } from './Constants.js';

export class SpriteFactory {
    static createAll(scene) {
        this.createPlayerTextures(scene);
        this.createEnemyTextures(scene);
        this.createBossTextures(scene);
        this.createProjectileTextures(scene);
        this.createEffectTextures(scene);
        this.createUITextures(scene);
        this.createShadowSoldierTextures(scene);
        this.createFloorTexture(scene);
    }

    static createPlayerTextures(scene) {
        // Player idle frames (4 frames for idle animation)
        for (let i = 0; i < 4; i++) {
            const g = scene.make.graphics({ add: false });
            const breathOffset = Math.sin(i * Math.PI / 2) * 1.5;

            // Shadow on ground
            g.fillStyle(0x000000, 0.3);
            g.fillEllipse(24, 46, 24, 8);

            // Coat / body
            g.fillStyle(COLORS.PLAYER_COAT);
            g.fillRoundedRect(12, 16 + breathOffset, 24, 26, 3);

            // Coat flaps
            g.fillTriangle(12, 38 + breathOffset, 8, 48, 18, 42 + breathOffset);
            g.fillTriangle(36, 38 + breathOffset, 40, 48, 30, 42 + breathOffset);

            // Inner shirt (dark)
            g.fillStyle(0x0f0f2f);
            g.fillRect(17, 18 + breathOffset, 14, 10);

            // Head
            g.fillStyle(0xdeb887);
            g.fillCircle(24, 12, 9);

            // Hair (black, spiky)
            g.fillStyle(COLORS.PLAYER_HAIR);
            g.fillRect(15, 3, 18, 8);
            g.fillTriangle(15, 5, 13, 11, 18, 8);
            g.fillTriangle(33, 5, 35, 11, 30, 8);
            g.fillTriangle(22, 2, 24, -1, 26, 2);

            // Eyes (glowing blue when rank up)
            g.fillStyle(0x4488ff);
            g.fillRect(20, 10, 3, 3);
            g.fillRect(26, 10, 3, 3);

            // Arms
            g.fillStyle(COLORS.PLAYER_COAT);
            g.fillRect(8, 18 + breathOffset, 5, 16);
            g.fillRect(35, 18 + breathOffset, 5, 16);

            // Hands
            g.fillStyle(0xdeb887);
            g.fillCircle(10, 35 + breathOffset, 3);
            g.fillCircle(38, 35 + breathOffset, 3);

            // Legs
            g.fillStyle(0x1a1a30);
            g.fillRect(16, 42 + breathOffset, 6, 8);
            g.fillRect(26, 42 + breathOffset, 6, 8);

            g.generateTexture('player_idle_' + i, 48, 52);
            g.destroy();
        }

        // Player walking frames (4 frames)
        for (let i = 0; i < 4; i++) {
            const g = scene.make.graphics({ add: false });
            const legSwing = Math.sin(i * Math.PI / 2) * 4;
            const armSwing = Math.sin(i * Math.PI / 2) * 3;
            const bodyBob = Math.abs(Math.sin(i * Math.PI / 2)) * 1.5;

            // Shadow on ground
            g.fillStyle(0x000000, 0.3);
            g.fillEllipse(24, 46, 24, 8);

            // Coat / body
            g.fillStyle(COLORS.PLAYER_COAT);
            g.fillRoundedRect(12, 16 - bodyBob, 24, 26, 3);

            // Coat flaps (swaying)
            g.fillTriangle(12, 38 - bodyBob, 8 - armSwing/2, 48, 18, 42 - bodyBob);
            g.fillTriangle(36, 38 - bodyBob, 40 + armSwing/2, 48, 30, 42 - bodyBob);

            // Inner shirt
            g.fillStyle(0x0f0f2f);
            g.fillRect(17, 18 - bodyBob, 14, 10);

            // Head
            g.fillStyle(0xdeb887);
            g.fillCircle(24, 12, 9);

            // Hair
            g.fillStyle(COLORS.PLAYER_HAIR);
            g.fillRect(15, 3, 18, 8);
            g.fillTriangle(15, 5, 13, 11, 18, 8);
            g.fillTriangle(33, 5, 35, 11, 30, 8);
            g.fillTriangle(22, 2, 24, -1, 26, 2);

            // Eyes
            g.fillStyle(0x4488ff);
            g.fillRect(20, 10, 3, 3);
            g.fillRect(26, 10, 3, 3);

            // Arms swinging
            g.fillStyle(COLORS.PLAYER_COAT);
            g.fillRect(8, 18 - bodyBob + armSwing, 5, 16);
            g.fillRect(35, 18 - bodyBob - armSwing, 5, 16);

            // Hands
            g.fillStyle(0xdeb887);
            g.fillCircle(10, 35 - bodyBob + armSwing, 3);
            g.fillCircle(38, 35 - bodyBob - armSwing, 3);

            // Legs walking
            g.fillStyle(0x1a1a30);
            g.fillRect(16 + legSwing, 42, 6, 8);
            g.fillRect(26 - legSwing, 42, 6, 8);

            g.generateTexture('player_walk_' + i, 48, 52);
            g.destroy();
        }

        // Player S-rank overlay (glowing aura version)
        const sg = scene.make.graphics({ add: false });
        sg.fillStyle(COLORS.SHADOW_PRIMARY, 0.08);
        sg.fillCircle(48, 48, 48);
        sg.fillStyle(COLORS.SHADOW_PRIMARY, 0.15);
        sg.fillCircle(48, 48, 36);
        sg.generateTexture('player_aura', 96, 96);
        sg.destroy();
    }

    static createEnemyTextures(scene) {
        // Goblin
        this._createEnemySprite(scene, 'goblin', ENEMY_TYPES.goblin.size, (g, s) => {
            // Body
            g.fillStyle(ENEMY_TYPES.goblin.color);
            g.fillCircle(s, s, s * 0.7);
            // Ears
            g.fillTriangle(s - s*0.6, s - s*0.3, s - s*0.9, s - s*0.9, s - s*0.3, s - s*0.6);
            g.fillTriangle(s + s*0.6, s - s*0.3, s + s*0.9, s - s*0.9, s + s*0.3, s - s*0.6);
            // Eyes (red, menacing)
            g.fillStyle(0xff3333);
            g.fillCircle(s - 3, s - 2, 2);
            g.fillCircle(s + 3, s - 2, 2);
            // Mouth
            g.fillStyle(0x2a4a1a);
            g.fillRect(s - 3, s + 3, 6, 2);
        });

        // Orc
        this._createEnemySprite(scene, 'orc', ENEMY_TYPES.orc.size, (g, s) => {
            // Body (bulky)
            g.fillStyle(ENEMY_TYPES.orc.color);
            g.fillRoundedRect(s * 0.25, s * 0.3, s * 1.5, s * 1.5, 6);
            // Head
            g.fillCircle(s, s * 0.4, s * 0.5);
            // Tusks
            g.fillStyle(0xeeeecc);
            g.fillTriangle(s - 5, s * 0.5, s - 3, s * 0.5 + 6, s - 7, s * 0.5 + 6);
            g.fillTriangle(s + 5, s * 0.5, s + 3, s * 0.5 + 6, s + 7, s * 0.5 + 6);
            // Eyes
            g.fillStyle(0xff6600);
            g.fillCircle(s - 4, s * 0.35, 2);
            g.fillCircle(s + 4, s * 0.35, 2);
            // Arms
            g.fillStyle(ENEMY_TYPES.orc.color);
            g.fillRect(s * 0.05, s * 0.6, s * 0.25, s);
            g.fillRect(s * 1.7, s * 0.6, s * 0.25, s);
        });

        // Ice Bear
        this._createEnemySprite(scene, 'iceBear', ENEMY_TYPES.iceBear.size, (g, s) => {
            // Body
            g.fillStyle(ENEMY_TYPES.iceBear.color);
            g.fillRoundedRect(s * 0.2, s * 0.3, s * 1.6, s * 1.4, 8);
            // Head
            g.fillCircle(s, s * 0.35, s * 0.5);
            // Ears
            g.fillCircle(s - s*0.4, s * 0.15, s * 0.2);
            g.fillCircle(s + s*0.4, s * 0.15, s * 0.2);
            // Eyes
            g.fillStyle(0x3366cc);
            g.fillCircle(s - 4, s * 0.3, 2.5);
            g.fillCircle(s + 4, s * 0.3, 2.5);
            // Nose
            g.fillStyle(0x334466);
            g.fillCircle(s, s * 0.45, 3);
            // Ice crystals on body
            g.fillStyle(0xcceeFF, 0.6);
            g.fillTriangle(s - 6, s * 0.8, s - 3, s * 0.5, s, s * 0.8);
            g.fillTriangle(s + 2, s, s + 5, s * 0.7, s + 8, s);
        });

        // Ant Soldier
        this._createEnemySprite(scene, 'antSoldier', ENEMY_TYPES.antSoldier.size, (g, s) => {
            // Body segments
            g.fillStyle(ENEMY_TYPES.antSoldier.color);
            g.fillCircle(s, s * 0.4, s * 0.35);
            g.fillCircle(s, s * 0.75, s * 0.3);
            g.fillCircle(s, s * 1.2, s * 0.45);
            // Mandibles
            g.lineStyle(2, 0xcc0000);
            g.beginPath();
            g.moveTo(s - 3, s * 0.45);
            g.lineTo(s - 7, s * 0.6);
            g.strokePath();
            g.beginPath();
            g.moveTo(s + 3, s * 0.45);
            g.lineTo(s + 7, s * 0.6);
            g.strokePath();
            // Eyes
            g.fillStyle(0xff0000);
            g.fillCircle(s - 3, s * 0.35, 1.5);
            g.fillCircle(s + 3, s * 0.35, 1.5);
            // Legs
            g.lineStyle(1, 0x660000);
            for (let side = -1; side <= 1; side += 2) {
                g.beginPath(); g.moveTo(s, s * 0.7); g.lineTo(s + side * s * 0.7, s * 0.5); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.8); g.lineTo(s + side * s * 0.8, s * 0.8); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.9); g.lineTo(s + side * s * 0.7, s * 1.1); g.strokePath();
            }
        });

        // Stone Golem - 거대한 바위 몸체, 높은 방어력
        this._createEnemySprite(scene, 'stoneGolem', ENEMY_TYPES.stoneGolem.size, (g, s) => {
            // Body (large rocky mass)
            g.fillStyle(0x555566);
            g.fillRoundedRect(s * 0.15, s * 0.25, s * 1.7, s * 1.6, 10);
            // Head
            g.fillStyle(ENEMY_TYPES.stoneGolem.color);
            g.fillRoundedRect(s * 0.35, s * 0.1, s * 1.3, s * 0.6, 6);
            // Cracks on body
            g.lineStyle(2, 0x444455);
            g.beginPath(); g.moveTo(s * 0.5, s * 0.5); g.lineTo(s * 0.8, s * 1.2); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.5, s * 0.6); g.lineTo(s * 1.2, s * 1.4); g.strokePath();
            // Glowing eyes
            g.fillStyle(0xff8800);
            g.fillCircle(s * 0.65, s * 0.35, 3);
            g.fillCircle(s * 1.35, s * 0.35, 3);
            // Arms (thick)
            g.fillStyle(0x555566);
            g.fillRect(s * -0.1, s * 0.5, s * 0.35, s * 1.0);
            g.fillRect(s * 1.75, s * 0.5, s * 0.35, s * 1.0);
            // Stone texture dots
            g.fillStyle(0x777788);
            g.fillCircle(s * 0.7, s * 0.8, 3);
            g.fillCircle(s * 1.3, s * 1.0, 2);
            g.fillCircle(s * 0.9, s * 1.4, 2.5);
        });

        // Dark Mage - 보라색 로브, 마법 지팡이
        this._createEnemySprite(scene, 'darkMage', ENEMY_TYPES.darkMage.size, (g, s) => {
            // Robe body (triangle shape)
            g.fillStyle(ENEMY_TYPES.darkMage.color);
            g.fillTriangle(s, s * 0.3, s * 0.2, s * 1.8, s * 1.8, s * 1.8);
            // Hood
            g.fillStyle(0x2a0e4a);
            g.fillCircle(s, s * 0.4, s * 0.45);
            // Face shadow
            g.fillStyle(0x110022);
            g.fillCircle(s, s * 0.45, s * 0.3);
            // Glowing eyes
            g.fillStyle(0xcc44ff);
            g.fillCircle(s * 0.8, s * 0.4, 2);
            g.fillCircle(s * 1.2, s * 0.4, 2);
            // Staff
            g.lineStyle(2, 0x664400);
            g.beginPath(); g.moveTo(s * 1.6, s * 0.2); g.lineTo(s * 1.6, s * 1.7); g.strokePath();
            // Staff orb
            g.fillStyle(0xaa33ff);
            g.fillCircle(s * 1.6, s * 0.2, 4);
            g.fillStyle(0xdd88ff, 0.5);
            g.fillCircle(s * 1.6, s * 0.2, 6);
        });

        // Iron Knight - 무거운 갑옷, 방패
        this._createEnemySprite(scene, 'ironKnight', ENEMY_TYPES.ironKnight.size, (g, s) => {
            // Armor body
            g.fillStyle(ENEMY_TYPES.ironKnight.color);
            g.fillRoundedRect(s * 0.3, s * 0.35, s * 1.4, s * 1.3, 5);
            // Helmet
            g.fillStyle(0x777799);
            g.fillRoundedRect(s * 0.4, s * 0.05, s * 1.2, s * 0.5, 8);
            // Helmet visor slit
            g.fillStyle(0xff3333);
            g.fillRect(s * 0.6, s * 0.25, s * 0.8, 3);
            // Shield (left side)
            g.fillStyle(0x6666aa);
            g.fillRoundedRect(s * -0.05, s * 0.4, s * 0.5, s * 0.9, 4);
            g.lineStyle(2, 0x9999cc);
            g.strokeRoundedRect(s * -0.05, s * 0.4, s * 0.5, s * 0.9, 4);
            // Shield emblem
            g.fillStyle(0xbbbbdd);
            g.fillCircle(s * 0.2, s * 0.85, 5);
            // Sword (right side)
            g.lineStyle(3, 0xccccee);
            g.beginPath(); g.moveTo(s * 1.7, s * 0.3); g.lineTo(s * 1.7, s * 1.5); g.strokePath();
            // Sword guard
            g.fillStyle(0xaaaa88);
            g.fillRect(s * 1.5, s * 1.0, s * 0.4, 4);
            // Legs
            g.fillStyle(0x666688);
            g.fillRect(s * 0.5, s * 1.55, s * 0.35, s * 0.4);
            g.fillRect(s * 1.15, s * 1.55, s * 0.35, s * 0.4);
        });

        // Demon Warrior - 어둡고 강력한 마족
        this._createEnemySprite(scene, 'demonWarrior', ENEMY_TYPES.demonWarrior.size, (g, s) => {
            // Body (dark muscular)
            g.fillStyle(ENEMY_TYPES.demonWarrior.color);
            g.fillRoundedRect(s * 0.2, s * 0.3, s * 1.6, s * 1.4, 8);
            // Head
            g.fillStyle(0x330015);
            g.fillCircle(s, s * 0.35, s * 0.45);
            // Horns
            g.fillStyle(0x1a0000);
            g.fillTriangle(s * 0.4, s * 0.25, s * 0.2, s * -0.15, s * 0.6, s * 0.1);
            g.fillTriangle(s * 1.6, s * 0.25, s * 1.8, s * -0.15, s * 1.4, s * 0.1);
            // Glowing red eyes
            g.fillStyle(0xff0000);
            g.fillCircle(s * 0.75, s * 0.3, 3);
            g.fillCircle(s * 1.25, s * 0.3, 3);
            // Eye glow
            g.fillStyle(0xff4444, 0.3);
            g.fillCircle(s * 0.75, s * 0.3, 6);
            g.fillCircle(s * 1.25, s * 0.3, 6);
            // Mouth / fangs
            g.fillStyle(0xcc0000);
            g.fillRect(s * 0.7, s * 0.5, s * 0.6, 3);
            // Dark armor plates
            g.fillStyle(0x220011);
            g.fillRect(s * 0.3, s * 0.55, s * 1.4, s * 0.15);
            g.fillRect(s * 0.3, s * 1.0, s * 1.4, s * 0.15);
            // Arms
            g.fillStyle(0x440022);
            g.fillRect(s * -0.05, s * 0.5, s * 0.35, s * 1.0);
            g.fillRect(s * 1.7, s * 0.5, s * 0.35, s * 1.0);
            // Demonic energy aura
            g.lineStyle(2, 0x880044, 0.4);
            g.strokeCircle(s, s * 0.85, s * 1.1);
        });
    }

    static _createEnemySprite(scene, key, size, drawFn) {
        for (let i = 0; i < 2; i++) {
            const g = scene.make.graphics({ add: false });
            const s = size;

            drawFn(g, s);

            g.generateTexture('enemy_' + key + '_' + i, size * 2, size * 2);
            g.destroy();
        }
    }

    static createBossTextures(scene) {
        // Igris - Red armored knight
        this._createBossSprite(scene, 'igris', BOSS_TYPES.igris, (g, s) => {
            // Armor body
            g.fillStyle(0x880000);
            g.fillRoundedRect(s * 0.3, s * 0.3, s * 1.4, s * 1.3, 6);
            // Helmet
            g.fillStyle(0xaa0000);
            g.fillCircle(s, s * 0.3, s * 0.45);
            // Visor
            g.fillStyle(0x440000);
            g.fillRect(s * 0.55, s * 0.2, s * 0.9, s * 0.12);
            // Eyes through visor
            g.fillStyle(0xff3333);
            g.fillCircle(s * 0.75, s * 0.25, 3);
            g.fillCircle(s * 1.25, s * 0.25, 3);
            // Plume
            g.fillStyle(0xff2222);
            g.fillTriangle(s, s * 0.1, s * 0.85, s * -0.15, s * 1.15, s * -0.15);
            // Shoulder pads
            g.fillStyle(0x990000);
            g.fillCircle(s * 0.25, s * 0.45, s * 0.2);
            g.fillCircle(s * 1.75, s * 0.45, s * 0.2);
            // Sword
            g.fillStyle(0xcccccc);
            g.fillRect(s * 1.8, s * 0.1, 4, s * 1.2);
            g.fillStyle(0x888888);
            g.fillRect(s * 1.72, s * 0.05, 20, 5);
            // Legs
            g.fillStyle(0x660000);
            g.fillRect(s * 0.5, s * 1.5, s * 0.35, s * 0.5);
            g.fillRect(s * 1.15, s * 1.5, s * 0.35, s * 0.5);
        });

        // Tusk - Giant Orc King
        this._createBossSprite(scene, 'tusk', BOSS_TYPES.tusk, (g, s) => {
            // Massive body
            g.fillStyle(0x4a2a0a);
            g.fillRoundedRect(s * 0.15, s * 0.25, s * 1.7, s * 1.5, 10);
            // Head
            g.fillStyle(0x5a3a1a);
            g.fillCircle(s, s * 0.3, s * 0.5);
            // Crown / helmet
            g.fillStyle(0xccaa33);
            g.fillRect(s * 0.5, s * -0.05, s, s * 0.12);
            g.fillTriangle(s * 0.5, s * -0.05, s * 0.65, s * -0.25, s * 0.8, s * -0.05);
            g.fillTriangle(s * 0.85, s * -0.05, s, s * -0.3, s * 1.15, s * -0.05);
            g.fillTriangle(s * 1.2, s * -0.05, s * 1.35, s * -0.25, s * 1.5, s * -0.05);
            // Giant tusks
            g.fillStyle(0xeeeecc);
            g.fillTriangle(s * 0.6, s * 0.4, s * 0.4, s * 0.8, s * 0.8, s * 0.4);
            g.fillTriangle(s * 1.4, s * 0.4, s * 1.2, s * 0.4, s * 1.6, s * 0.8);
            // Eyes
            g.fillStyle(0xff4400);
            g.fillCircle(s * 0.75, s * 0.25, 4);
            g.fillCircle(s * 1.25, s * 0.25, 4);
            // Arms (massive)
            g.fillStyle(0x4a2a0a);
            g.fillRoundedRect(s * -0.15, s * 0.5, s * 0.4, s, 5);
            g.fillRoundedRect(s * 1.75, s * 0.5, s * 0.4, s, 5);
            // Fists
            g.fillStyle(0x5a3a1a);
            g.fillCircle(s * 0.05, s * 1.5, s * 0.22);
            g.fillCircle(s * 1.95, s * 1.5, s * 0.22);
        });

        // Beru - Ant King
        this._createBossSprite(scene, 'beru', BOSS_TYPES.beru, (g, s) => {
            // Thorax
            g.fillStyle(0x440022);
            g.fillEllipse(s, s * 1.3, s * 0.9, s * 0.7);
            // Abdomen
            g.fillStyle(0x550033);
            g.fillRoundedRect(s * 0.35, s * 0.35, s * 1.3, s * 1.0, 8);
            // Head
            g.fillStyle(0x660033);
            g.fillCircle(s, s * 0.3, s * 0.4);
            // Mandibles (large)
            g.fillStyle(0x990044);
            g.fillTriangle(s * 0.5, s * 0.4, s * 0.2, s * 0.7, s * 0.7, s * 0.55);
            g.fillTriangle(s * 1.5, s * 0.4, s * 1.8, s * 0.7, s * 1.3, s * 0.55);
            // Eyes (multiple, glowing)
            g.fillStyle(0xff0066);
            g.fillCircle(s * 0.75, s * 0.22, 4);
            g.fillCircle(s * 1.25, s * 0.22, 4);
            g.fillStyle(0xff0044);
            g.fillCircle(s * 0.65, s * 0.32, 2);
            g.fillCircle(s * 1.35, s * 0.32, 2);
            // Wings
            g.fillStyle(0x880044, 0.4);
            g.fillEllipse(s * 0.2, s * 0.6, s * 0.6, s * 1.0);
            g.fillEllipse(s * 1.8, s * 0.6, s * 0.6, s * 1.0);
            // Legs (6 legs)
            g.lineStyle(3, 0x440022);
            for (let side = -1; side <= 1; side += 2) {
                g.beginPath(); g.moveTo(s, s * 0.6); g.lineTo(s + side * s * 0.9, s * 0.3); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.8); g.lineTo(s + side * s, s * 0.8); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 1.0); g.lineTo(s + side * s * 0.9, s * 1.3); g.strokePath();
            }
        });
    }

    static _createBossSprite(scene, key, config, drawFn) {
        const g = scene.make.graphics({ add: false });
        const s = config.size;

        // Boss glow background
        g.fillStyle(config.color, 0.15);
        g.fillCircle(s, s, s * 1.1);

        drawFn(g, s);

        g.generateTexture('boss_' + key, s * 2, s * 2);
        g.destroy();
    }

    static createProjectileTextures(scene) {
        // Shadow Dagger
        const dg = scene.make.graphics({ add: false });
        dg.fillStyle(COLORS.DAGGER);
        dg.fillTriangle(2, 10, 8, 0, 14, 10);
        dg.fillStyle(0x999aaa);
        dg.fillRect(5, 10, 6, 6);
        dg.fillStyle(COLORS.SHADOW_PRIMARY, 0.4);
        dg.fillTriangle(2, 10, 8, -2, 14, 10);
        dg.generateTexture('proj_dagger', 16, 16);
        dg.destroy();

        // Shadow Slash arc
        const sg = scene.make.graphics({ add: false });
        sg.fillStyle(COLORS.SLASH, 0.7);
        sg.slice(40, 40, 38, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(60), false);
        sg.fillPath();
        sg.fillStyle(0xffffff, 0.3);
        sg.slice(40, 40, 30, Phaser.Math.DegToRad(-45), Phaser.Math.DegToRad(45), false);
        sg.fillPath();
        sg.generateTexture('proj_slash', 80, 80);
        sg.destroy();

        // Ruler's Authority circle
        const rg = scene.make.graphics({ add: false });
        rg.fillStyle(COLORS.SHADOW_PRIMARY, 0.15);
        rg.fillCircle(50, 50, 50);
        rg.lineStyle(3, COLORS.SHADOW_PRIMARY, 0.6);
        rg.strokeCircle(50, 50, 48);
        rg.lineStyle(1, COLORS.SHADOW_GLOW, 0.4);
        rg.strokeCircle(50, 50, 35);
        // Runes around the circle
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const rx = 50 + Math.cos(angle) * 42;
            const ry = 50 + Math.sin(angle) * 42;
            rg.fillStyle(COLORS.SHADOW_GLOW, 0.5);
            rg.fillRect(rx - 2, ry - 2, 4, 4);
        }
        rg.generateTexture('proj_ruler', 100, 100);
        rg.destroy();

        // Dragon Fear aura
        const fg = scene.make.graphics({ add: false });
        fg.fillStyle(0xff4400, 0.08);
        fg.fillCircle(60, 60, 60);
        fg.lineStyle(2, 0xff6600, 0.3);
        fg.strokeCircle(60, 60, 58);
        fg.lineStyle(1, 0xff8800, 0.2);
        fg.strokeCircle(60, 60, 45);
        fg.generateTexture('proj_fear', 120, 120);
        fg.destroy();

        // Shadow soldier projectile
        const spg = scene.make.graphics({ add: false });
        spg.fillStyle(COLORS.SHADOW_PRIMARY, 0.8);
        spg.fillCircle(6, 6, 5);
        spg.fillStyle(0xffffff, 0.3);
        spg.fillCircle(6, 6, 2);
        spg.generateTexture('proj_shadow', 12, 12);
        spg.destroy();

        // Dark Mage projectile (purple magic bolt)
        const mg = scene.make.graphics({ add: false });
        mg.fillStyle(0x8833cc, 0.9);
        mg.fillCircle(8, 8, 7);
        mg.fillStyle(0xcc66ff, 0.6);
        mg.fillCircle(8, 8, 4);
        mg.fillStyle(0xffffff, 0.4);
        mg.fillCircle(7, 6, 2);
        mg.generateTexture('proj_darkMage', 16, 16);
        mg.destroy();

        // Boss Igris sword slash (red arc)
        const ig = scene.make.graphics({ add: false });
        ig.fillStyle(0xcc0000, 0.7);
        ig.slice(30, 30, 28, Phaser.Math.DegToRad(-50), Phaser.Math.DegToRad(50), false);
        ig.fillPath();
        ig.fillStyle(0xff4444, 0.4);
        ig.slice(30, 30, 20, Phaser.Math.DegToRad(-35), Phaser.Math.DegToRad(35), false);
        ig.fillPath();
        ig.generateTexture('proj_igris', 60, 60);
        ig.destroy();

        // Boss Tusk ground slam (brown shockwave)
        const tg = scene.make.graphics({ add: false });
        tg.fillStyle(0x6b4423, 0.2);
        tg.fillCircle(40, 40, 40);
        tg.lineStyle(4, 0x8b5a2b, 0.6);
        tg.strokeCircle(40, 40, 38);
        tg.lineStyle(2, 0xaa7744, 0.4);
        tg.strokeCircle(40, 40, 25);
        tg.generateTexture('proj_tusk', 80, 80);
        tg.destroy();

        // Boss Beru acid spit (dark red projectile)
        const bg = scene.make.graphics({ add: false });
        bg.fillStyle(0x660033, 0.9);
        bg.fillCircle(8, 8, 7);
        bg.fillStyle(0xcc0066, 0.5);
        bg.fillCircle(8, 8, 4);
        bg.fillStyle(0xff3399, 0.3);
        bg.fillCircle(7, 6, 2);
        bg.generateTexture('proj_beru', 16, 16);
        bg.destroy();
    }

    static createEffectTextures(scene) {
        // Particle (generic glow dot)
        const pg = scene.make.graphics({ add: false });
        pg.fillStyle(0xffffff);
        pg.fillCircle(4, 4, 4);
        pg.generateTexture('particle', 8, 8);
        pg.destroy();

        // XP Orb
        const xg = scene.make.graphics({ add: false });
        xg.fillStyle(COLORS.XP_ORB, 0.8);
        xg.fillCircle(6, 6, 5);
        xg.fillStyle(0xffffff, 0.5);
        xg.fillCircle(5, 4, 2);
        xg.generateTexture('xp_orb', 12, 12);
        xg.destroy();

        // Large XP Orb (for bosses)
        const lxg = scene.make.graphics({ add: false });
        lxg.fillStyle(0xffcc00, 0.8);
        lxg.fillCircle(8, 8, 7);
        lxg.fillStyle(0xffffff, 0.5);
        lxg.fillCircle(6, 6, 3);
        lxg.generateTexture('xp_orb_large', 16, 16);
        lxg.destroy();

        // Damage number bg
        const dmg = scene.make.graphics({ add: false });
        dmg.fillStyle(0x000000, 0.5);
        dmg.fillRoundedRect(0, 0, 40, 20, 4);
        dmg.generateTexture('dmg_bg', 40, 20);
        dmg.destroy();

        // Arise rune circle
        const ag = scene.make.graphics({ add: false });
        ag.lineStyle(3, COLORS.SHADOW_PRIMARY, 0.8);
        ag.strokeCircle(60, 60, 55);
        ag.lineStyle(2, COLORS.SHADOW_GLOW, 0.5);
        ag.strokeCircle(60, 60, 45);
        ag.lineStyle(1, COLORS.SHADOW_LIGHT, 0.3);
        ag.strokeCircle(60, 60, 35);
        // Rune symbols
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const x = 60 + Math.cos(angle) * 50;
            const y = 60 + Math.sin(angle) * 50;
            ag.fillStyle(COLORS.SHADOW_GLOW, 0.7);
            ag.fillRect(x - 2, y - 4, 4, 8);
        }
        ag.generateTexture('arise_rune', 120, 120);
        ag.destroy();
    }

    static createShadowSoldierTextures(scene) {
        // Shadow soldier (generic - dark silhouette with purple glow)
        const types = ['melee', 'tank', 'ranged'];
        const sizes = [32, 40, 30];

        types.forEach((type, idx) => {
            const g = scene.make.graphics({ add: false });
            const s = sizes[idx];
            const half = s / 2;

            // Shadow aura
            g.fillStyle(COLORS.SHADOW_PRIMARY, 0.2);
            g.fillCircle(half, half, half);

            // Body (dark silhouette)
            g.fillStyle(0x110022);
            g.fillRoundedRect(half * 0.4, half * 0.5, half * 1.2, half * 1.4, 3);

            // Head
            g.fillStyle(0x0a0015);
            g.fillCircle(half, half * 0.45, half * 0.3);

            // Glowing eyes
            g.fillStyle(COLORS.SHADOW_PRIMARY);
            g.fillCircle(half - 3, half * 0.42, 2);
            g.fillCircle(half + 3, half * 0.42, 2);

            // Type-specific details
            if (type === 'melee') {
                // Sword
                g.fillStyle(0x6622cc);
                g.fillRect(half + half * 0.6, half * 0.2, 3, half * 1.2);
            } else if (type === 'tank') {
                // Shield
                g.fillStyle(0x3311aa, 0.6);
                g.fillRoundedRect(half * 0.1, half * 0.6, half * 0.4, half * 0.8, 2);
            } else if (type === 'ranged') {
                // Magic orb
                g.fillStyle(COLORS.SHADOW_GLOW, 0.6);
                g.fillCircle(half + half * 0.5, half * 0.6, 4);
            }

            // Smoke effect at bottom
            g.fillStyle(COLORS.SHADOW_PRIMARY, 0.15);
            g.fillEllipse(half, s - 4, half * 1.2, 6);

            g.generateTexture('shadow_' + type, s, s);
            g.destroy();
        });
    }

    static createUITextures(scene) {
        // Skill icons
        const icons = {
            basicDagger: (g) => {
                // Simple dagger pointing up
                g.fillStyle(0xbbbbcc);
                g.fillTriangle(14, 22, 16, 4, 18, 22);
                g.fillStyle(0x776655);
                g.fillRect(14, 22, 4, 6);
                g.fillStyle(0x888888);
                g.fillRect(12, 21, 8, 2);
            },
            shadowDagger: (g) => {
                g.fillStyle(COLORS.DAGGER);
                g.fillTriangle(12, 24, 16, 4, 20, 24);
                g.fillStyle(0x888899);
                g.fillRect(13, 24, 6, 4);
            },
            shadowSlash: (g) => {
                g.fillStyle(COLORS.SLASH, 0.8);
                g.slice(16, 16, 12, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(0), false);
                g.fillPath();
            },
            rulersAuthority: (g) => {
                g.lineStyle(2, COLORS.SHADOW_PRIMARY, 0.8);
                g.strokeCircle(16, 16, 10);
                g.fillStyle(COLORS.SHADOW_GLOW, 0.4);
                g.fillCircle(16, 16, 6);
            },
            dragonFear: (g) => {
                g.fillStyle(0xff4400, 0.6);
                g.fillCircle(16, 16, 12);
                g.fillStyle(0xff6600, 0.4);
                g.fillCircle(16, 16, 8);
            },
        };

        for (const [key, drawFn] of Object.entries(icons)) {
            const g = scene.make.graphics({ add: false });
            g.fillStyle(0x2a1a4a, 0.8);
            g.fillRoundedRect(0, 0, 32, 32, 4);
            drawFn(g);
            g.generateTexture('icon_' + key, 32, 32);
            g.destroy();
        }

        // Passive icons
        const passiveColors = {
            swiftness: 0x44ff44,
            vitality: 0xff4444,
            strength: 0xff8844,
            critMaster: 0xffff44,
            scholar: 0x44aaff,
            hastening: 0xaa44ff,
        };

        for (const [key, color] of Object.entries(passiveColors)) {
            const g = scene.make.graphics({ add: false });
            g.fillStyle(0x1a1a2e, 0.8);
            g.fillRoundedRect(0, 0, 32, 32, 4);
            g.fillStyle(color, 0.6);
            g.fillCircle(16, 16, 10);
            g.fillStyle(color, 0.9);
            g.fillCircle(16, 16, 5);
            g.generateTexture('icon_' + key, 32, 32);
            g.destroy();
        }
    }

    static createFloorTexture(scene) {
        const g = scene.make.graphics({ add: false });
        const tileSize = 64;

        g.fillStyle(COLORS.BG_FLOOR);
        g.fillRect(0, 0, tileSize, tileSize);

        // Tile pattern
        g.fillStyle(COLORS.BG_FLOOR_LIGHT, 0.3);
        g.fillRect(0, 0, tileSize / 2, tileSize / 2);
        g.fillRect(tileSize / 2, tileSize / 2, tileSize / 2, tileSize / 2);

        // Subtle crack lines
        g.lineStyle(1, 0x1a1a3a, 0.3);
        g.beginPath();
        g.moveTo(0, tileSize / 2);
        g.lineTo(tileSize, tileSize / 2);
        g.strokePath();
        g.beginPath();
        g.moveTo(tileSize / 2, 0);
        g.lineTo(tileSize / 2, tileSize);
        g.strokePath();

        g.generateTexture('floor_tile', tileSize, tileSize);
        g.destroy();
    }
}
