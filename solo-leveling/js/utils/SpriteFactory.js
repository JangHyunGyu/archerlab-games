import { COLORS, ENEMY_TYPES, BOSS_TYPES } from './Constants.js';

export class SpriteFactory {
    // --- Color helpers ---
    static _darken(color, amt = 0x1a) {
        const r = Math.max(0, ((color >> 16) & 0xff) - amt);
        const g = Math.max(0, ((color >> 8) & 0xff) - amt);
        const b = Math.max(0, (color & 0xff) - amt);
        return (r << 16) | (g << 8) | b;
    }
    static _lighten(color, amt = 0x1a) {
        const r = Math.min(255, ((color >> 16) & 0xff) + amt);
        const g = Math.min(255, ((color >> 8) & 0xff) + amt);
        const b = Math.min(255, (color & 0xff) + amt);
        return (r << 16) | (g << 8) | b;
    }

    // --- Drawing helpers ---
    static _outlinedRect(g, x, y, w, h, fill, stroke = 0x080810, radius = 0, alpha = 1) {
        g.fillStyle(fill, alpha);
        if (radius > 0) {
            g.fillRoundedRect(x, y, w, h, radius);
            g.lineStyle(1, stroke, 0.7);
            g.strokeRoundedRect(x, y, w, h, radius);
        } else {
            g.fillRect(x, y, w, h);
            g.lineStyle(1, stroke, 0.7);
            g.strokeRect(x, y, w, h);
        }
    }
    static _outlinedCircle(g, cx, cy, r, fill, stroke = 0x080810, alpha = 1) {
        g.fillStyle(fill, alpha);
        g.fillCircle(cx, cy, r);
        g.lineStyle(1, stroke, 0.6);
        g.strokeCircle(cx, cy, r);
    }
    static _groundShadow(g, cx, cy, rx = 14, ry = 4) {
        g.fillStyle(0x000000, 0.35);
        g.fillEllipse(cx, cy, rx, ry);
    }
    static _glowEyes(g, lx, ly, rx, ry, color = 0x4499ff, size = 2.5) {
        // Glow bloom
        g.fillStyle(color, 0.25);
        g.fillCircle(lx, ly, size + 3);
        g.fillCircle(rx, ry, size + 3);
        // Eye base
        g.fillStyle(color, 0.9);
        g.fillCircle(lx, ly, size);
        g.fillCircle(rx, ry, size);
        // White highlight dot
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(lx - 0.5, ly - 0.5, size * 0.4);
        g.fillCircle(rx - 0.5, ry - 0.5, size * 0.4);
    }

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

    // =============================================
    //  PLAYER TEXTURES
    // =============================================
    static createPlayerTextures(scene) {
        const W = 48, H = 52, cx = 24;

        // Player idle frames (4 frames)
        for (let i = 0; i < 4; i++) {
            const g = scene.make.graphics({ add: false });
            const breathOffset = Math.sin(i * Math.PI / 2) * 1.5;
            this._drawPlayer(g, cx, breathOffset, 0, 0, false);
            g.generateTexture('player_idle_' + i, W, H);
            g.destroy();
        }

        // Player walking frames (4 frames)
        for (let i = 0; i < 4; i++) {
            const g = scene.make.graphics({ add: false });
            const legSwing = Math.sin(i * Math.PI / 2) * 4;
            const armSwing = Math.sin(i * Math.PI / 2) * 3;
            const bodyBob = Math.abs(Math.sin(i * Math.PI / 2)) * 1.5;
            this._drawPlayer(g, cx, -bodyBob, legSwing, armSwing, true);
            g.generateTexture('player_walk_' + i, W, H);
            g.destroy();
        }

        // Player S-rank aura
        const sg = scene.make.graphics({ add: false });
        sg.fillStyle(COLORS.SHADOW_PRIMARY, 0.06);
        sg.fillCircle(48, 48, 48);
        sg.fillStyle(COLORS.SHADOW_PRIMARY, 0.12);
        sg.fillCircle(48, 48, 36);
        sg.fillStyle(COLORS.SHADOW_GLOW, 0.06);
        sg.fillCircle(48, 48, 24);
        sg.generateTexture('player_aura', 96, 96);
        sg.destroy();
    }

    static _drawPlayer(g, cx, by, legSwing, armSwing, walking) {
        // Ground shadow
        this._groundShadow(g, cx, 48, 16, 5);

        // Legs / boots
        const legColor = 0x12122a;
        const bootColor = 0x0e0e20;
        g.fillStyle(legColor);
        g.fillRect(16 + (walking ? legSwing : 0), 41 + by, 6, 8);
        g.fillRect(26 + (walking ? -legSwing : 0), 41 + by, 6, 8);
        // Boots
        this._outlinedRect(g, 14 + (walking ? legSwing : 0), 47 + by, 9, 4, bootColor, 0x060612, 2);
        this._outlinedRect(g, 25 + (walking ? -legSwing : 0), 47 + by, 9, 4, bootColor, 0x060612, 2);

        // Coat body
        const coatColor = COLORS.PLAYER_COAT;
        const coatDark = this._darken(coatColor, 0x0a);
        const coatLight = this._lighten(coatColor, 0x10);
        this._outlinedRect(g, 11, 16 + by, 26, 26, coatColor, 0x080816, 3);
        // Coat shadow right side
        g.fillStyle(coatDark, 0.6);
        g.fillRect(32, 18 + by, 4, 22);
        // Coat highlight left edge
        g.fillStyle(coatLight, 0.4);
        g.fillRect(12, 18 + by, 2, 22);

        // Coat flaps (bottom)
        g.fillStyle(coatColor);
        g.fillTriangle(11, 38 + by, 7 - (walking ? armSwing/2 : 0), 48, 17, 42 + by);
        g.fillTriangle(37, 38 + by, 41 + (walking ? armSwing/2 : 0), 48, 31, 42 + by);
        g.lineStyle(1, 0x080816, 0.5);
        g.beginPath();
        g.moveTo(11, 38 + by); g.lineTo(7 - (walking ? armSwing/2 : 0), 48); g.lineTo(17, 42 + by);
        g.strokePath();
        g.beginPath();
        g.moveTo(37, 38 + by); g.lineTo(41 + (walking ? armSwing/2 : 0), 48); g.lineTo(31, 42 + by);
        g.strokePath();

        // Collar / V-neck
        g.fillStyle(0x0a0a22);
        g.fillTriangle(17, 17 + by, cx, 26 + by, 31, 17 + by);
        // Collar highlights
        g.lineStyle(1, coatLight, 0.5);
        g.beginPath(); g.moveTo(17, 17 + by); g.lineTo(cx, 24 + by); g.strokePath();
        g.beginPath(); g.moveTo(31, 17 + by); g.lineTo(cx, 24 + by); g.strokePath();

        // Belt
        g.fillStyle(0x2a2a44);
        g.fillRect(13, 38 + by, 22, 3);
        // Belt buckle
        g.fillStyle(0x8888aa);
        g.fillRect(22, 38 + by, 4, 3);

        // Arms
        g.fillStyle(coatColor);
        g.fillRect(7, 18 + by + (walking ? armSwing : 0), 6, 15);
        g.fillRect(35, 18 + by + (walking ? -armSwing : 0), 6, 15);
        g.lineStyle(1, 0x080816, 0.4);
        g.strokeRect(7, 18 + by + (walking ? armSwing : 0), 6, 15);
        g.strokeRect(35, 18 + by + (walking ? -armSwing : 0), 6, 15);
        // Arm highlight
        g.fillStyle(coatLight, 0.3);
        g.fillRect(8, 19 + by + (walking ? armSwing : 0), 2, 13);

        // Hands (skin)
        this._outlinedCircle(g, 10, 34 + by + (walking ? armSwing : 0), 3, 0xdeb887, 0x886644);
        this._outlinedCircle(g, 38, 34 + by + (walking ? -armSwing : 0), 3, 0xdeb887, 0x886644);

        // Head
        g.fillStyle(0xdeb887);
        g.fillCircle(cx, 11, 9);
        // Face shadow (bottom half)
        g.fillStyle(0xc9a372, 0.4);
        g.fillRect(16, 12, 16, 6);
        g.lineStyle(1, 0x886644, 0.5);
        g.strokeCircle(cx, 11, 9);

        // Hair (dark with blue sheen)
        const hairBase = COLORS.PLAYER_HAIR;
        const hairHighlight = 0x3a4a6e;
        g.fillStyle(hairBase);
        g.fillRect(15, 2, 18, 10);
        // Spiky hair tips
        g.fillTriangle(14, 6, 12, 12, 18, 8);
        g.fillTriangle(34, 6, 36, 12, 30, 8);
        g.fillTriangle(21, 1, 24, -2, 27, 1);
        g.fillTriangle(17, 3, 19, -1, 22, 2);
        g.fillTriangle(26, 2, 29, -1, 31, 3);
        // Hair blue highlight
        g.fillStyle(hairHighlight, 0.5);
        g.fillRect(18, 3, 12, 4);
        g.fillTriangle(22, 1, 24, -2, 26, 1);
        // Hair outline
        g.lineStyle(1, 0x0a0a18, 0.6);
        g.beginPath();
        g.moveTo(12, 12); g.lineTo(14, 6); g.lineTo(17, 3); g.lineTo(19, -1);
        g.lineTo(22, 1); g.lineTo(24, -2); g.lineTo(26, 1); g.lineTo(29, -1);
        g.lineTo(31, 3); g.lineTo(34, 6); g.lineTo(36, 12);
        g.strokePath();

        // Eyes (glowing blue)
        this._glowEyes(g, 20, 10, 28, 10, 0x4499ff, 2.5);

        // Eyebrows
        g.lineStyle(1.5, 0x1a1a2e, 0.8);
        g.beginPath(); g.moveTo(18, 7); g.lineTo(22, 7.5); g.strokePath();
        g.beginPath(); g.moveTo(26, 7.5); g.lineTo(30, 7); g.strokePath();
    }

    // =============================================
    //  ENEMY TEXTURES
    // =============================================
    static createEnemyTextures(scene) {
        // Goblin
        this._createEnemySprite(scene, 'goblin', ENEMY_TYPES.goblin.size, (g, s, frame) => {
            const wobble = frame * 1.5;
            const c = ENEMY_TYPES.goblin.color;
            // Body
            this._outlinedCircle(g, s, s + wobble, s * 0.65, c, this._darken(c, 0x20));
            // Body highlight
            g.fillStyle(this._lighten(c, 0x18), 0.4);
            g.fillCircle(s - 3, s - 3 + wobble, s * 0.3);
            // Ears (pointy)
            g.fillStyle(c);
            g.fillTriangle(s - s*0.6, s - s*0.2 + wobble, s - s*0.95, s - s*0.95, s - s*0.25, s - s*0.55 + wobble);
            g.fillTriangle(s + s*0.6, s - s*0.2 + wobble, s + s*0.95, s - s*0.95, s + s*0.25, s - s*0.55 + wobble);
            g.lineStyle(1, this._darken(c, 0x20), 0.6);
            g.beginPath(); g.moveTo(s - s*0.6, s - s*0.2 + wobble); g.lineTo(s - s*0.95, s - s*0.95); g.lineTo(s - s*0.25, s - s*0.55 + wobble); g.strokePath();
            g.beginPath(); g.moveTo(s + s*0.6, s - s*0.2 + wobble); g.lineTo(s + s*0.95, s - s*0.95); g.lineTo(s + s*0.25, s - s*0.55 + wobble); g.strokePath();
            // Eyes (menacing red)
            this._glowEyes(g, s - 4, s - 3 + wobble, s + 4, s - 3 + wobble, 0xff3333, 2.5);
            // Mouth with teeth
            g.fillStyle(0x1a3a10);
            g.fillRect(s - 4, s + 4 + wobble, 8, 3);
            g.fillStyle(0xccccaa);
            g.fillRect(s - 3, s + 4 + wobble, 2, 2);
            g.fillRect(s + 1, s + 4 + wobble, 2, 2);
            // Small knife
            g.fillStyle(0xaaaacc);
            g.fillRect(s + s*0.5, s - s*0.1 + wobble + (frame ? 2 : 0), 2, 10);
            g.fillStyle(0x665544);
            g.fillRect(s + s*0.5 - 1, s + 4 + wobble + (frame ? 2 : 0), 4, 3);
        });

        // Orc
        this._createEnemySprite(scene, 'orc', ENEMY_TYPES.orc.size, (g, s, frame) => {
            const wobble = frame * 1;
            const c = ENEMY_TYPES.orc.color;
            // Body (bulky)
            this._outlinedRect(g, s * 0.2, s * 0.3 + wobble, s * 1.6, s * 1.5, c, this._darken(c, 0x20), 6);
            // Body shading
            g.fillStyle(this._darken(c, 0x15), 0.5);
            g.fillRect(s * 1.3, s * 0.4 + wobble, s * 0.4, s * 1.3);
            g.fillStyle(this._lighten(c, 0x12), 0.35);
            g.fillRect(s * 0.25, s * 0.4 + wobble, s * 0.3, s * 1.3);
            // Head
            this._outlinedCircle(g, s, s * 0.38 + wobble, s * 0.5, c, this._darken(c, 0x20));
            // Tusks
            g.fillStyle(0xeeeecc);
            g.fillTriangle(s - 6, s * 0.5, s - 3, s * 0.5 + 8, s - 8, s * 0.5 + 8);
            g.fillTriangle(s + 6, s * 0.5, s + 3, s * 0.5 + 8, s + 8, s * 0.5 + 8);
            g.lineStyle(1, 0xaaaa99, 0.5);
            g.beginPath(); g.moveTo(s - 6, s * 0.5); g.lineTo(s - 3, s * 0.5 + 8); g.lineTo(s - 8, s * 0.5 + 8); g.closePath(); g.strokePath();
            g.beginPath(); g.moveTo(s + 6, s * 0.5); g.lineTo(s + 3, s * 0.5 + 8); g.lineTo(s + 8, s * 0.5 + 8); g.closePath(); g.strokePath();
            // Eyes (angry orange)
            this._glowEyes(g, s - 5, s * 0.33 + wobble, s + 5, s * 0.33 + wobble, 0xff6600, 2.5);
            // Brow ridges
            g.lineStyle(2, this._darken(c, 0x20), 0.8);
            g.beginPath(); g.moveTo(s - 9, s * 0.26 + wobble); g.lineTo(s - 3, s * 0.28 + wobble); g.strokePath();
            g.beginPath(); g.moveTo(s + 9, s * 0.26 + wobble); g.lineTo(s + 3, s * 0.28 + wobble); g.strokePath();
            // Arms (thick)
            this._outlinedRect(g, s * 0.0, s * 0.6 + wobble, s * 0.28, s * 0.9, c, this._darken(c, 0x20), 3);
            this._outlinedRect(g, s * 1.72, s * 0.6 + wobble, s * 0.28, s * 0.9, c, this._darken(c, 0x20), 3);
            // Armor belt
            g.fillStyle(0x443322);
            g.fillRect(s * 0.3, s * 1.2 + wobble, s * 1.4, 4);
        });

        // Ice Bear
        this._createEnemySprite(scene, 'iceBear', ENEMY_TYPES.iceBear.size, (g, s, frame) => {
            const wobble = frame * 1;
            const c = ENEMY_TYPES.iceBear.color;
            // Body
            this._outlinedRect(g, s * 0.2, s * 0.3 + wobble, s * 1.6, s * 1.4, c, this._darken(c, 0x20), 8);
            // Fur shading
            g.fillStyle(this._lighten(c, 0x10), 0.3);
            g.fillCircle(s * 0.6, s * 0.7 + wobble, s * 0.5);
            g.fillStyle(this._darken(c, 0x10), 0.25);
            g.fillRect(s * 1.2, s * 0.4 + wobble, s * 0.5, s * 1.2);
            // Head
            this._outlinedCircle(g, s, s * 0.35 + wobble, s * 0.5, c, this._darken(c, 0x20));
            // Ears
            this._outlinedCircle(g, s - s*0.4, s * 0.15 + wobble, s * 0.2, c, this._darken(c, 0x20));
            this._outlinedCircle(g, s + s*0.4, s * 0.15 + wobble, s * 0.2, c, this._darken(c, 0x20));
            // Inner ears
            g.fillStyle(this._darken(c, 0x20), 0.4);
            g.fillCircle(s - s*0.4, s * 0.15 + wobble, s * 0.12);
            g.fillCircle(s + s*0.4, s * 0.15 + wobble, s * 0.12);
            // Eyes (icy blue)
            this._glowEyes(g, s - 5, s * 0.3 + wobble, s + 5, s * 0.3 + wobble, 0x44aaff, 3);
            // Nose
            g.fillStyle(0x334466);
            g.fillCircle(s, s * 0.45 + wobble, 3.5);
            g.lineStyle(1, 0x223355, 0.5);
            g.strokeCircle(s, s * 0.45 + wobble, 3.5);
            // Ice crystals
            g.fillStyle(0xcceeFF, 0.7);
            g.fillTriangle(s - 8, s * 0.9, s - 4, s * 0.55, s, s * 0.9);
            g.fillTriangle(s + 3, s * 0.7, s + 7, s * 0.45, s + 10, s * 0.75);
            g.lineStyle(1, 0x88ccff, 0.5);
            g.beginPath(); g.moveTo(s - 8, s * 0.9); g.lineTo(s - 4, s * 0.55); g.lineTo(s, s * 0.9); g.strokePath();
            g.beginPath(); g.moveTo(s + 3, s * 0.7); g.lineTo(s + 7, s * 0.45); g.lineTo(s + 10, s * 0.75); g.strokePath();
            // Frost particles
            g.fillStyle(0xffffff, 0.4);
            g.fillCircle(s - 6, s * 1.1, 1.5);
            g.fillCircle(s + 8, s * 0.9, 1);
            g.fillCircle(s + 3, s * 1.3, 1.5);
        });

        // Ant Soldier
        this._createEnemySprite(scene, 'antSoldier', ENEMY_TYPES.antSoldier.size, (g, s, frame) => {
            const wobble = frame * 1.5;
            const c = ENEMY_TYPES.antSoldier.color;
            const cd = this._darken(c, 0x20);
            // Body segments
            this._outlinedCircle(g, s, s * 0.4 + wobble, s * 0.35, c, cd);
            this._outlinedCircle(g, s, s * 0.75 + wobble, s * 0.28, c, cd);
            this._outlinedCircle(g, s, s * 1.2, s * 0.45, c, cd);
            // Chitin highlight
            g.fillStyle(this._lighten(c, 0x25), 0.3);
            g.fillCircle(s - 2, s * 0.35 + wobble, s * 0.15);
            g.fillCircle(s - 2, s * 1.1, s * 0.2);
            // Mandibles
            g.fillStyle(0xcc2200);
            g.fillTriangle(s - 3, s * 0.45, s - 9, s * 0.65, s - 2, s * 0.55);
            g.fillTriangle(s + 3, s * 0.45, s + 9, s * 0.65, s + 2, s * 0.55);
            g.lineStyle(1, 0x880000, 0.6);
            g.beginPath(); g.moveTo(s - 3, s * 0.45); g.lineTo(s - 9, s * 0.65); g.strokePath();
            g.beginPath(); g.moveTo(s + 3, s * 0.45); g.lineTo(s + 9, s * 0.65); g.strokePath();
            // Eyes (glowing red)
            this._glowEyes(g, s - 3, s * 0.35 + wobble, s + 3, s * 0.35 + wobble, 0xff2200, 2);
            // Legs
            g.lineStyle(1.5, cd);
            const legAngle = frame ? 0.15 : -0.15;
            for (let side = -1; side <= 1; side += 2) {
                g.beginPath(); g.moveTo(s, s * 0.7 + wobble); g.lineTo(s + side * s * 0.75, s * 0.45 + legAngle * side * 10); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.8 + wobble); g.lineTo(s + side * s * 0.85, s * 0.8); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.9); g.lineTo(s + side * s * 0.75, s * 1.15 - legAngle * side * 10); g.strokePath();
            }
        });

        // Stone Golem
        this._createEnemySprite(scene, 'stoneGolem', ENEMY_TYPES.stoneGolem.size, (g, s, frame) => {
            const wobble = frame * 1;
            const c = ENEMY_TYPES.stoneGolem.color;
            // Body (massive)
            this._outlinedRect(g, s * 0.15, s * 0.25 + wobble, s * 1.7, s * 1.6, 0x555566, this._darken(c, 0x20), 10);
            // Rock texture shading
            g.fillStyle(0x4a4a5b, 0.5);
            g.fillRoundedRect(s * 0.2, s * 0.3 + wobble, s * 0.6, s * 1.4, 5);
            g.fillStyle(0x606073, 0.4);
            g.fillRoundedRect(s * 0.9, s * 0.3 + wobble, s * 0.7, s * 0.8, 5);
            // Head
            this._outlinedRect(g, s * 0.35, s * 0.1 + wobble, s * 1.3, s * 0.6, c, this._darken(c, 0x20), 6);
            // Cracks
            g.lineStyle(2, 0x3a3a4b, 0.8);
            g.beginPath(); g.moveTo(s * 0.5, s * 0.5 + wobble); g.lineTo(s * 0.65, s * 0.9); g.lineTo(s * 0.8, s * 1.4); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.5, s * 0.6 + wobble); g.lineTo(s * 1.35, s * 1.0); g.lineTo(s * 1.2, s * 1.5); g.strokePath();
            g.lineStyle(1, 0x444455, 0.5);
            g.beginPath(); g.moveTo(s * 0.7, s * 0.7 + wobble); g.lineTo(s * 1.0, s * 0.9); g.strokePath();
            // Glowing rune eyes
            this._glowEyes(g, s * 0.65, s * 0.35 + wobble, s * 1.35, s * 0.35 + wobble, 0xff8800, 3.5);
            // Arms (thick stone)
            this._outlinedRect(g, s * -0.1, s * 0.5 + wobble, s * 0.35, s * 1.0, 0x4e4e5f, this._darken(c, 0x20), 4);
            this._outlinedRect(g, s * 1.75, s * 0.5 + wobble, s * 0.35, s * 1.0, 0x4e4e5f, this._darken(c, 0x20), 4);
            // Fist glow
            g.fillStyle(0xff8800, 0.15);
            g.fillCircle(s * 0.05, s * 1.5, 8);
            g.fillCircle(s * 1.95, s * 1.5, 8);
            // Moss/lichen patches
            g.fillStyle(0x445533, 0.35);
            g.fillCircle(s * 0.5, s * 1.3, 4);
            g.fillCircle(s * 1.5, s * 0.8 + wobble, 3);
        });

        // Dark Mage
        this._createEnemySprite(scene, 'darkMage', ENEMY_TYPES.darkMage.size, (g, s, frame) => {
            const wobble = frame * 1.5;
            const c = ENEMY_TYPES.darkMage.color;
            // Robe body (triangular)
            g.fillStyle(c);
            g.fillTriangle(s, s * 0.3 + wobble, s * 0.15, s * 1.85, s * 1.85, s * 1.85);
            g.lineStyle(1, this._darken(c, 0x15), 0.7);
            g.beginPath(); g.moveTo(s, s * 0.3 + wobble); g.lineTo(s * 0.15, s * 1.85); g.lineTo(s * 1.85, s * 1.85); g.closePath(); g.strokePath();
            // Robe shading
            g.fillStyle(this._lighten(c, 0x10), 0.25);
            g.fillTriangle(s, s * 0.4 + wobble, s * 0.4, s * 1.6, s * 0.9, s * 1.6);
            // Hood
            this._outlinedCircle(g, s, s * 0.4 + wobble, s * 0.45, 0x2a0e4a, this._darken(c, 0x15));
            // Face shadow
            g.fillStyle(0x0e0018, 0.9);
            g.fillCircle(s, s * 0.45 + wobble, s * 0.3);
            // Glowing eyes
            this._glowEyes(g, s * 0.8, s * 0.4 + wobble, s * 1.2, s * 0.4 + wobble, 0xcc44ff, 2.5);
            // Staff
            g.lineStyle(2.5, 0x664400);
            g.beginPath(); g.moveTo(s * 1.65, s * 0.15); g.lineTo(s * 1.65, s * 1.7); g.strokePath();
            // Staff orb (glowing)
            g.fillStyle(0xdd88ff, 0.3);
            g.fillCircle(s * 1.65, s * 0.15, 8);
            g.fillStyle(0xaa33ff, 0.9);
            g.fillCircle(s * 1.65, s * 0.15, 4);
            g.fillStyle(0xffffff, 0.5);
            g.fillCircle(s * 1.62, s * 0.12, 1.5);
            // Magic particles
            const angle = frame * Math.PI;
            g.fillStyle(0xcc66ff, 0.5);
            g.fillCircle(s * 1.65 + Math.cos(angle) * 10, s * 0.15 + Math.sin(angle) * 10, 2);
            g.fillCircle(s * 1.65 + Math.cos(angle + 2) * 8, s * 0.15 + Math.sin(angle + 2) * 8, 1.5);
        });

        // Iron Knight
        this._createEnemySprite(scene, 'ironKnight', ENEMY_TYPES.ironKnight.size, (g, s, frame) => {
            const wobble = frame * 1;
            const c = ENEMY_TYPES.ironKnight.color;
            // Armor body
            this._outlinedRect(g, s * 0.3, s * 0.35 + wobble, s * 1.4, s * 1.3, c, this._darken(c, 0x20), 5);
            // Armor shading
            g.fillStyle(this._lighten(c, 0x15), 0.3);
            g.fillRect(s * 0.35, s * 0.4 + wobble, s * 0.4, s * 1.2);
            g.fillStyle(this._darken(c, 0x12), 0.4);
            g.fillRect(s * 1.2, s * 0.4 + wobble, s * 0.4, s * 1.2);
            // Armor rivets
            g.fillStyle(0xaabbcc, 0.6);
            g.fillCircle(s * 0.45, s * 0.55 + wobble, 1.5);
            g.fillCircle(s * 1.55, s * 0.55 + wobble, 1.5);
            g.fillCircle(s * 0.45, s * 1.2 + wobble, 1.5);
            g.fillCircle(s * 1.55, s * 1.2 + wobble, 1.5);
            // Helmet
            this._outlinedRect(g, s * 0.4, s * 0.05 + wobble, s * 1.2, s * 0.5, 0x777799, this._darken(c, 0x20), 8);
            // Visor slit (red glow)
            g.fillStyle(0xff3333, 0.8);
            g.fillRect(s * 0.6, s * 0.25 + wobble, s * 0.8, 3);
            g.fillStyle(0xff0000, 0.2);
            g.fillRect(s * 0.55, s * 0.22 + wobble, s * 0.9, 8);
            // Shield
            this._outlinedRect(g, s * -0.05, s * 0.4 + wobble, s * 0.5, s * 0.9, 0x5555aa, 0x333388, 4);
            g.lineStyle(1, 0x8888cc, 0.5);
            g.strokeRoundedRect(s * 0.0, s * 0.45 + wobble, s * 0.4, s * 0.8, 3);
            // Shield emblem
            g.fillStyle(0xbbbbdd, 0.7);
            g.fillCircle(s * 0.2, s * 0.85 + wobble, 5);
            g.fillStyle(0x5555aa, 0.5);
            g.fillCircle(s * 0.2, s * 0.85 + wobble, 3);
            // Sword
            g.fillStyle(0xddddee);
            g.fillRect(s * 1.72, s * 0.15 + wobble + (frame ? 3 : 0), 4, s * 1.3);
            g.lineStyle(1, 0xaaaacc, 0.6);
            g.strokeRect(s * 1.72, s * 0.15 + wobble + (frame ? 3 : 0), 4, s * 1.3);
            // Sword guard
            g.fillStyle(0xaaaa88);
            g.fillRect(s * 1.6, s * 1.0 + wobble, s * 0.4, 4);
            // Sword gleam
            g.fillStyle(0xffffff, 0.4);
            g.fillRect(s * 1.73, s * 0.2 + wobble, 2, s * 0.3);
            // Legs
            this._outlinedRect(g, s * 0.5, s * 1.55, s * 0.35, s * 0.4, 0x666688, this._darken(c, 0x20), 2);
            this._outlinedRect(g, s * 1.15, s * 1.55, s * 0.35, s * 0.4, 0x666688, this._darken(c, 0x20), 2);
        });

        // Demon Warrior
        this._createEnemySprite(scene, 'demonWarrior', ENEMY_TYPES.demonWarrior.size, (g, s, frame) => {
            const wobble = frame * 1;
            const c = ENEMY_TYPES.demonWarrior.color;
            // Demonic energy aura
            g.fillStyle(0x880044, 0.12);
            g.fillCircle(s, s * 0.85, s * 1.15);
            // Body
            this._outlinedRect(g, s * 0.2, s * 0.3 + wobble, s * 1.6, s * 1.4, c, this._darken(c, 0x15), 8);
            // Muscle shading
            g.fillStyle(this._lighten(c, 0x15), 0.3);
            g.fillCircle(s * 0.6, s * 0.6 + wobble, s * 0.3);
            g.fillCircle(s * 1.4, s * 0.6 + wobble, s * 0.3);
            // Head
            this._outlinedCircle(g, s, s * 0.35 + wobble, s * 0.45, 0x330015, this._darken(c, 0x15));
            // Horns
            g.fillStyle(0x1a0000);
            g.fillTriangle(s * 0.35, s * 0.25 + wobble, s * 0.15, s * -0.2, s * 0.55, s * 0.1 + wobble);
            g.fillTriangle(s * 1.65, s * 0.25 + wobble, s * 1.85, s * -0.2, s * 1.45, s * 0.1 + wobble);
            g.lineStyle(1, 0x330000, 0.6);
            g.beginPath(); g.moveTo(s * 0.35, s * 0.25 + wobble); g.lineTo(s * 0.15, s * -0.2); g.lineTo(s * 0.55, s * 0.1 + wobble); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.65, s * 0.25 + wobble); g.lineTo(s * 1.85, s * -0.2); g.lineTo(s * 1.45, s * 0.1 + wobble); g.strokePath();
            // Glowing red eyes
            this._glowEyes(g, s * 0.75, s * 0.3 + wobble, s * 1.25, s * 0.3 + wobble, 0xff0000, 3.5);
            // Fangs
            g.fillStyle(0xccccbb);
            g.fillTriangle(s * 0.8, s * 0.5, s * 0.85, s * 0.6, s * 0.9, s * 0.5);
            g.fillTriangle(s * 1.1, s * 0.5, s * 1.15, s * 0.6, s * 1.2, s * 0.5);
            // Dark armor plates
            g.fillStyle(0x220011, 0.8);
            g.fillRect(s * 0.3, s * 0.55 + wobble, s * 1.4, s * 0.12);
            g.fillRect(s * 0.3, s * 1.0 + wobble, s * 1.4, s * 0.12);
            g.lineStyle(1, 0x440022, 0.5);
            g.strokeRect(s * 0.3, s * 0.55 + wobble, s * 1.4, s * 0.12);
            // Arms
            this._outlinedRect(g, s * -0.05, s * 0.5 + wobble, s * 0.35, s * 1.0, 0x350018, this._darken(c, 0x15), 3);
            this._outlinedRect(g, s * 1.7, s * 0.5 + wobble, s * 0.35, s * 1.0, 0x350018, this._darken(c, 0x15), 3);
            // Energy wisps
            g.fillStyle(0xff0044, 0.3);
            g.fillCircle(s * 0.3 + (frame ? 3 : 0), s * 0.3, 3);
            g.fillCircle(s * 1.7 - (frame ? 3 : 0), s * 0.5, 2.5);
            g.fillCircle(s, s * 1.7, 3);
        });
    }

    static _createEnemySprite(scene, key, size, drawFn) {
        for (let i = 0; i < 2; i++) {
            const g = scene.make.graphics({ add: false });
            const s = size;
            // Ground shadow
            this._groundShadow(g, s, s * 1.7, s * 0.7, s * 0.15);
            drawFn(g, s, i);
            g.generateTexture('enemy_' + key + '_' + i, size * 2, size * 2);
            g.destroy();
        }
    }

    // =============================================
    //  BOSS TEXTURES
    // =============================================
    static createBossTextures(scene) {
        // Igris - Red armored knight
        this._createBossSprite(scene, 'igris', BOSS_TYPES.igris, (g, s) => {
            // Armor body
            this._outlinedRect(g, s * 0.3, s * 0.3, s * 1.4, s * 1.3, 0x880000, 0x440000, 6);
            // Armor shading
            g.fillStyle(0x990000, 0.3);
            g.fillRect(s * 0.35, s * 0.35, s * 0.4, s * 1.2);
            g.fillStyle(0x660000, 0.3);
            g.fillRect(s * 1.2, s * 0.35, s * 0.4, s * 1.2);
            // Armor detail lines
            g.lineStyle(1, 0x660000, 0.5);
            g.beginPath(); g.moveTo(s * 0.5, s * 0.7); g.lineTo(s * 1.5, s * 0.7); g.strokePath();
            g.beginPath(); g.moveTo(s * 0.5, s * 1.1); g.lineTo(s * 1.5, s * 1.1); g.strokePath();
            // Rivets
            g.fillStyle(0xcc4444, 0.6);
            for (const rx of [0.4, 1.6]) for (const ry of [0.5, 0.9, 1.3]) g.fillCircle(s * rx, s * ry, 2);
            // Helmet
            this._outlinedCircle(g, s, s * 0.3, s * 0.45, 0xaa0000, 0x550000);
            // Visor
            g.fillStyle(0x440000, 0.9);
            g.fillRect(s * 0.55, s * 0.2, s * 0.9, s * 0.12);
            // Eyes through visor (glowing)
            this._glowEyes(g, s * 0.75, s * 0.25, s * 1.25, s * 0.25, 0xff4444, 3.5);
            // Plume
            g.fillStyle(0xff2222);
            g.fillTriangle(s, s * 0.08, s * 0.8, s * -0.18, s * 1.2, s * -0.18);
            g.lineStyle(1, 0xcc0000, 0.6);
            g.beginPath(); g.moveTo(s * 0.8, s * -0.18); g.lineTo(s, s * 0.08); g.lineTo(s * 1.2, s * -0.18); g.strokePath();
            // Shoulder pads
            this._outlinedCircle(g, s * 0.25, s * 0.45, s * 0.22, 0x990000, 0x550000);
            this._outlinedCircle(g, s * 1.75, s * 0.45, s * 0.22, 0x990000, 0x550000);
            // Shoulder spikes
            g.fillStyle(0xbb0000);
            g.fillTriangle(s * 0.25, s * 0.25, s * 0.15, s * 0.45, s * 0.35, s * 0.45);
            g.fillTriangle(s * 1.75, s * 0.25, s * 1.65, s * 0.45, s * 1.85, s * 0.45);
            // Sword
            g.fillStyle(0xdddddd);
            g.fillRect(s * 1.82, s * 0.05, 5, s * 1.25);
            g.lineStyle(1, 0xaaaaaa, 0.6);
            g.strokeRect(s * 1.82, s * 0.05, 5, s * 1.25);
            // Sword gleam
            g.fillStyle(0xffffff, 0.5);
            g.fillRect(s * 1.83, s * 0.1, 2, s * 0.4);
            // Crossguard
            g.fillStyle(0xcc8833);
            g.fillRect(s * 1.72, s * 0.03, 22, 5);
            // Legs
            this._outlinedRect(g, s * 0.5, s * 1.5, s * 0.35, s * 0.5, 0x770000, 0x440000, 2);
            this._outlinedRect(g, s * 1.15, s * 1.5, s * 0.35, s * 0.5, 0x770000, 0x440000, 2);
        });

        // Tusk - Giant Orc King
        this._createBossSprite(scene, 'tusk', BOSS_TYPES.tusk, (g, s) => {
            // Massive body
            this._outlinedRect(g, s * 0.15, s * 0.25, s * 1.7, s * 1.5, 0x4a2a0a, 0x2a1a00, 10);
            // Body muscle shading
            g.fillStyle(0x5a3a1a, 0.3);
            g.fillCircle(s * 0.6, s * 0.7, s * 0.4);
            g.fillCircle(s * 1.4, s * 0.7, s * 0.4);
            g.fillStyle(0x3a1a00, 0.25);
            g.fillRect(s * 1.3, s * 0.3, s * 0.5, s * 1.4);
            // Head
            this._outlinedCircle(g, s, s * 0.3, s * 0.5, 0x5a3a1a, 0x2a1a00);
            // Crown
            g.fillStyle(0xccaa33);
            g.fillRect(s * 0.5, s * -0.05, s, s * 0.12);
            g.fillTriangle(s * 0.5, s * -0.05, s * 0.65, s * -0.28, s * 0.8, s * -0.05);
            g.fillTriangle(s * 0.85, s * -0.05, s, s * -0.33, s * 1.15, s * -0.05);
            g.fillTriangle(s * 1.2, s * -0.05, s * 1.35, s * -0.28, s * 1.5, s * -0.05);
            g.lineStyle(1, 0xaa8822, 0.6);
            g.strokeRect(s * 0.5, s * -0.05, s, s * 0.12);
            // Crown gems
            g.fillStyle(0xff2222, 0.8);
            g.fillCircle(s, s * -0.25, 3);
            g.fillStyle(0xffffff, 0.4);
            g.fillCircle(s - 1, s * -0.26, 1);
            // Giant tusks
            g.fillStyle(0xeeeecc);
            g.fillTriangle(s * 0.6, s * 0.4, s * 0.35, s * 0.85, s * 0.8, s * 0.4);
            g.fillTriangle(s * 1.4, s * 0.4, s * 1.2, s * 0.4, s * 1.65, s * 0.85);
            g.lineStyle(1, 0xcccc99, 0.5);
            g.beginPath(); g.moveTo(s * 0.6, s * 0.4); g.lineTo(s * 0.35, s * 0.85); g.lineTo(s * 0.8, s * 0.4); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.4, s * 0.4); g.lineTo(s * 1.65, s * 0.85); g.lineTo(s * 1.2, s * 0.4); g.strokePath();
            // Eyes
            this._glowEyes(g, s * 0.75, s * 0.25, s * 1.25, s * 0.25, 0xff5500, 4);
            // Brow
            g.lineStyle(2.5, 0x3a1a00, 0.8);
            g.beginPath(); g.moveTo(s * 0.55, s * 0.17); g.lineTo(s * 0.8, s * 0.2); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.45, s * 0.17); g.lineTo(s * 1.2, s * 0.2); g.strokePath();
            // Arms (massive)
            this._outlinedRect(g, s * -0.15, s * 0.5, s * 0.4, s, 0x4a2a0a, 0x2a1a00, 5);
            this._outlinedRect(g, s * 1.75, s * 0.5, s * 0.4, s, 0x4a2a0a, 0x2a1a00, 5);
            // Fists
            this._outlinedCircle(g, s * 0.05, s * 1.5, s * 0.22, 0x5a3a1a, 0x2a1a00);
            this._outlinedCircle(g, s * 1.95, s * 1.5, s * 0.22, 0x5a3a1a, 0x2a1a00);
            // Arm bands
            g.fillStyle(0x8b6914, 0.6);
            g.fillRect(s * -0.1, s * 0.65, s * 0.3, 4);
            g.fillRect(s * 1.8, s * 0.65, s * 0.3, 4);
        });

        // Beru - Ant King
        this._createBossSprite(scene, 'beru', BOSS_TYPES.beru, (g, s) => {
            // Wings (behind body)
            g.fillStyle(0x880044, 0.25);
            g.fillEllipse(s * 0.15, s * 0.6, s * 0.65, s * 1.05);
            g.fillEllipse(s * 1.85, s * 0.6, s * 0.65, s * 1.05);
            g.lineStyle(1, 0x660033, 0.3);
            g.strokeEllipse(s * 0.15, s * 0.6, s * 0.65, s * 1.05);
            g.strokeEllipse(s * 1.85, s * 0.6, s * 0.65, s * 1.05);
            // Wing veins
            g.lineStyle(0.5, 0xaa0055, 0.2);
            g.beginPath(); g.moveTo(s * 0.15, s * 0.3); g.lineTo(s * 0.15, s * 1.1); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.85, s * 0.3); g.lineTo(s * 1.85, s * 1.1); g.strokePath();
            // Thorax
            g.fillStyle(0x440022);
            g.fillEllipse(s, s * 1.3, s * 0.9, s * 0.7);
            g.lineStyle(1, 0x330011, 0.6);
            g.strokeEllipse(s, s * 1.3, s * 0.9, s * 0.7);
            // Abdomen
            this._outlinedRect(g, s * 0.35, s * 0.35, s * 1.3, s * 1.0, 0x550033, 0x330016, 8);
            // Chitin shading
            g.fillStyle(0x660044, 0.3);
            g.fillRect(s * 0.4, s * 0.4, s * 0.4, s * 0.9);
            // Head
            this._outlinedCircle(g, s, s * 0.3, s * 0.42, 0x660033, 0x330016);
            // Mandibles (large, sharp)
            g.fillStyle(0xaa0044);
            g.fillTriangle(s * 0.45, s * 0.4, s * 0.15, s * 0.75, s * 0.7, s * 0.55);
            g.fillTriangle(s * 1.55, s * 0.4, s * 1.85, s * 0.75, s * 1.3, s * 0.55);
            g.lineStyle(1, 0x880033, 0.6);
            g.beginPath(); g.moveTo(s * 0.45, s * 0.4); g.lineTo(s * 0.15, s * 0.75); g.lineTo(s * 0.7, s * 0.55); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.55, s * 0.4); g.lineTo(s * 1.85, s * 0.75); g.lineTo(s * 1.3, s * 0.55); g.strokePath();
            // Eyes (multiple, glowing pink)
            this._glowEyes(g, s * 0.75, s * 0.22, s * 1.25, s * 0.22, 0xff0066, 4);
            // Secondary eyes
            g.fillStyle(0xff0044, 0.7);
            g.fillCircle(s * 0.63, s * 0.33, 2.5);
            g.fillCircle(s * 1.37, s * 0.33, 2.5);
            // Chitin armor plates
            g.fillStyle(0x770044, 0.4);
            g.fillRect(s * 0.45, s * 0.65, s * 1.1, s * 0.1);
            g.fillRect(s * 0.45, s * 0.85, s * 1.1, s * 0.1);
            g.fillRect(s * 0.45, s * 1.05, s * 1.1, s * 0.1);
            // Legs (6 legs with joints)
            g.lineStyle(3, 0x440022);
            for (let side = -1; side <= 1; side += 2) {
                g.beginPath(); g.moveTo(s, s * 0.6); g.lineTo(s + side * s * 0.7, s * 0.4); g.lineTo(s + side * s * 0.95, s * 0.25); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.8); g.lineTo(s + side * s * 0.8, s * 0.7); g.lineTo(s + side * s * 1.05, s * 0.8); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 1.0); g.lineTo(s + side * s * 0.7, s * 1.1); g.lineTo(s + side * s * 0.95, s * 1.3); g.strokePath();
            }
        });
    }

    static _createBossSprite(scene, key, config, drawFn) {
        const g = scene.make.graphics({ add: false });
        const s = config.size;

        // Boss glow aura (double layer)
        g.fillStyle(config.color, 0.08);
        g.fillCircle(s, s, s * 1.2);
        g.fillStyle(config.color, 0.15);
        g.fillCircle(s, s, s * 0.9);

        // Ground shadow
        this._groundShadow(g, s, s * 1.8, s * 0.8, s * 0.15);

        drawFn(g, s);

        g.generateTexture('boss_' + key, s * 2, s * 2);
        g.destroy();
    }

    // =============================================
    //  PROJECTILE TEXTURES
    // =============================================
    static createProjectileTextures(scene) {
        // Shadow Dagger
        const dg = scene.make.graphics({ add: false });
        dg.fillStyle(COLORS.SHADOW_PRIMARY, 0.3);
        dg.fillTriangle(1, 11, 8, -2, 15, 11);
        dg.fillStyle(COLORS.DAGGER);
        dg.fillTriangle(2, 10, 8, 0, 14, 10);
        dg.lineStyle(1, 0xbbbbcc, 0.5);
        dg.beginPath(); dg.moveTo(2, 10); dg.lineTo(8, 0); dg.lineTo(14, 10); dg.strokePath();
        dg.fillStyle(0x999aaa);
        dg.fillRect(5, 10, 6, 6);
        dg.fillStyle(0xffffff, 0.3);
        dg.fillRect(7, 2, 2, 6);
        dg.generateTexture('proj_dagger', 16, 16);
        dg.destroy();

        // Shadow Slash arc
        const sg = scene.make.graphics({ add: false });
        sg.fillStyle(COLORS.SLASH, 0.5);
        sg.slice(40, 40, 38, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(60), false);
        sg.fillPath();
        sg.fillStyle(COLORS.SHADOW_GLOW, 0.4);
        sg.slice(40, 40, 32, Phaser.Math.DegToRad(-50), Phaser.Math.DegToRad(50), false);
        sg.fillPath();
        sg.fillStyle(0xffffff, 0.25);
        sg.slice(40, 40, 24, Phaser.Math.DegToRad(-40), Phaser.Math.DegToRad(40), false);
        sg.fillPath();
        sg.generateTexture('proj_slash', 80, 80);
        sg.destroy();

        // Ruler's Authority circle
        const rg = scene.make.graphics({ add: false });
        rg.fillStyle(COLORS.SHADOW_PRIMARY, 0.1);
        rg.fillCircle(50, 50, 50);
        rg.lineStyle(3, COLORS.SHADOW_PRIMARY, 0.6);
        rg.strokeCircle(50, 50, 48);
        rg.lineStyle(2, COLORS.SHADOW_GLOW, 0.35);
        rg.strokeCircle(50, 50, 38);
        rg.lineStyle(1, COLORS.SHADOW_LIGHT, 0.2);
        rg.strokeCircle(50, 50, 28);
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const rx = 50 + Math.cos(angle) * 42;
            const ry = 50 + Math.sin(angle) * 42;
            rg.fillStyle(COLORS.SHADOW_GLOW, 0.6);
            rg.fillRect(rx - 2, ry - 3, 4, 6);
        }
        rg.generateTexture('proj_ruler', 100, 100);
        rg.destroy();

        // Dragon Fear aura
        const fg = scene.make.graphics({ add: false });
        fg.fillStyle(0xff4400, 0.06);
        fg.fillCircle(60, 60, 60);
        fg.lineStyle(2, 0xff6600, 0.25);
        fg.strokeCircle(60, 60, 58);
        fg.lineStyle(1.5, 0xff8800, 0.18);
        fg.strokeCircle(60, 60, 48);
        fg.lineStyle(1, 0xffaa00, 0.1);
        fg.strokeCircle(60, 60, 38);
        fg.generateTexture('proj_fear', 120, 120);
        fg.destroy();

        // Shadow soldier projectile
        const spg = scene.make.graphics({ add: false });
        spg.fillStyle(COLORS.SHADOW_PRIMARY, 0.3);
        spg.fillCircle(6, 6, 6);
        spg.fillStyle(COLORS.SHADOW_PRIMARY, 0.8);
        spg.fillCircle(6, 6, 4);
        spg.fillStyle(0xffffff, 0.4);
        spg.fillCircle(5, 5, 2);
        spg.generateTexture('proj_shadow', 12, 12);
        spg.destroy();

        // Dark Mage projectile
        const mg = scene.make.graphics({ add: false });
        mg.fillStyle(0x8833cc, 0.3);
        mg.fillCircle(8, 8, 8);
        mg.fillStyle(0x8833cc, 0.9);
        mg.fillCircle(8, 8, 6);
        mg.fillStyle(0xcc66ff, 0.6);
        mg.fillCircle(8, 8, 4);
        mg.fillStyle(0xffffff, 0.5);
        mg.fillCircle(7, 6, 2);
        mg.generateTexture('proj_darkMage', 16, 16);
        mg.destroy();

        // Boss Igris sword slash
        const ig = scene.make.graphics({ add: false });
        ig.fillStyle(0xcc0000, 0.5);
        ig.slice(30, 30, 28, Phaser.Math.DegToRad(-55), Phaser.Math.DegToRad(55), false);
        ig.fillPath();
        ig.fillStyle(0xff4444, 0.4);
        ig.slice(30, 30, 22, Phaser.Math.DegToRad(-40), Phaser.Math.DegToRad(40), false);
        ig.fillPath();
        ig.fillStyle(0xffffff, 0.2);
        ig.slice(30, 30, 15, Phaser.Math.DegToRad(-25), Phaser.Math.DegToRad(25), false);
        ig.fillPath();
        ig.generateTexture('proj_igris', 60, 60);
        ig.destroy();

        // Boss Tusk ground slam
        const tg = scene.make.graphics({ add: false });
        tg.fillStyle(0x6b4423, 0.15);
        tg.fillCircle(40, 40, 40);
        tg.lineStyle(4, 0x8b5a2b, 0.6);
        tg.strokeCircle(40, 40, 38);
        tg.lineStyle(2.5, 0xaa7744, 0.4);
        tg.strokeCircle(40, 40, 28);
        tg.lineStyle(1.5, 0xcc9966, 0.2);
        tg.strokeCircle(40, 40, 18);
        tg.generateTexture('proj_tusk', 80, 80);
        tg.destroy();

        // Boss Beru acid spit
        const bg = scene.make.graphics({ add: false });
        bg.fillStyle(0x660033, 0.3);
        bg.fillCircle(8, 8, 8);
        bg.fillStyle(0x660033, 0.9);
        bg.fillCircle(8, 8, 6);
        bg.fillStyle(0xcc0066, 0.6);
        bg.fillCircle(8, 8, 4);
        bg.fillStyle(0xff3399, 0.4);
        bg.fillCircle(7, 6, 2);
        bg.generateTexture('proj_beru', 16, 16);
        bg.destroy();
    }

    // =============================================
    //  EFFECT TEXTURES
    // =============================================
    static createEffectTextures(scene) {
        // Particle (glow dot)
        const pg = scene.make.graphics({ add: false });
        pg.fillStyle(0xffffff, 0.4);
        pg.fillCircle(4, 4, 4);
        pg.fillStyle(0xffffff, 0.9);
        pg.fillCircle(4, 4, 2);
        pg.generateTexture('particle', 8, 8);
        pg.destroy();

        // XP Orb
        const xg = scene.make.graphics({ add: false });
        xg.fillStyle(COLORS.XP_ORB, 0.3);
        xg.fillCircle(6, 6, 6);
        xg.fillStyle(COLORS.XP_ORB, 0.8);
        xg.fillCircle(6, 6, 4);
        xg.fillStyle(0xffffff, 0.6);
        xg.fillCircle(5, 4, 2);
        xg.generateTexture('xp_orb', 12, 12);
        xg.destroy();

        // Large XP Orb
        const lxg = scene.make.graphics({ add: false });
        lxg.fillStyle(0xffcc00, 0.3);
        lxg.fillCircle(8, 8, 8);
        lxg.fillStyle(0xffcc00, 0.8);
        lxg.fillCircle(8, 8, 6);
        lxg.fillStyle(0xffffff, 0.6);
        lxg.fillCircle(6, 5, 3);
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
        ag.lineStyle(1.5, COLORS.SHADOW_LIGHT, 0.3);
        ag.strokeCircle(60, 60, 35);
        ag.lineStyle(1, COLORS.SHADOW_PRIMARY, 0.2);
        ag.strokeCircle(60, 60, 25);
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const x = 60 + Math.cos(angle) * 50;
            const y = 60 + Math.sin(angle) * 50;
            ag.fillStyle(COLORS.SHADOW_GLOW, 0.7);
            ag.fillRect(x - 2, y - 5, 4, 10);
            // Inner rune dots
            const x2 = 60 + Math.cos(angle + 0.26) * 40;
            const y2 = 60 + Math.sin(angle + 0.26) * 40;
            ag.fillStyle(COLORS.SHADOW_PRIMARY, 0.5);
            ag.fillCircle(x2, y2, 2);
        }
        ag.generateTexture('arise_rune', 120, 120);
        ag.destroy();
    }

    // =============================================
    //  SHADOW SOLDIER TEXTURES
    // =============================================
    static createShadowSoldierTextures(scene) {
        const types = ['melee', 'tank', 'ranged'];
        const sizes = [32, 40, 30];

        types.forEach((type, idx) => {
            const g = scene.make.graphics({ add: false });
            const s = sizes[idx];
            const half = s / 2;

            // Shadow aura (double layer)
            g.fillStyle(COLORS.SHADOW_PRIMARY, 0.1);
            g.fillCircle(half, half, half);
            g.fillStyle(COLORS.SHADOW_PRIMARY, 0.2);
            g.fillCircle(half, half, half * 0.7);

            // Body
            this._outlinedRect(g, half * 0.35, half * 0.5, half * 1.3, half * 1.4, 0x110022, 0x06000e, 3);
            // Body shading
            g.fillStyle(0x1a0033, 0.3);
            g.fillRect(half * 0.4, half * 0.55, half * 0.4, half * 1.3);

            // Head
            this._outlinedCircle(g, half, half * 0.45, half * 0.32, 0x0a0015, 0x06000e);

            // Glowing eyes
            this._glowEyes(g, half - 3, half * 0.42, half + 3, half * 0.42, COLORS.SHADOW_PRIMARY, 2);

            // Type-specific details
            if (type === 'melee') {
                // Sword with glow
                g.fillStyle(0x8833cc, 0.3);
                g.fillRect(half + half * 0.55, half * 0.15, 5, half * 1.3);
                g.fillStyle(0x6622cc, 0.9);
                g.fillRect(half + half * 0.6, half * 0.2, 3, half * 1.2);
                g.fillStyle(0xaa55ff, 0.4);
                g.fillRect(half + half * 0.62, half * 0.25, 1.5, half * 0.4);
            } else if (type === 'tank') {
                // Shield with glow
                this._outlinedRect(g, half * 0.05, half * 0.55, half * 0.45, half * 0.85, 0x3311aa, 0x1a0066, 2);
                g.fillStyle(COLORS.SHADOW_GLOW, 0.2);
                g.fillCircle(half * 0.27, half * 0.97, 4);
            } else if (type === 'ranged') {
                // Magic orb with glow
                g.fillStyle(COLORS.SHADOW_GLOW, 0.25);
                g.fillCircle(half + half * 0.5, half * 0.6, 6);
                g.fillStyle(COLORS.SHADOW_GLOW, 0.7);
                g.fillCircle(half + half * 0.5, half * 0.6, 4);
                g.fillStyle(0xffffff, 0.3);
                g.fillCircle(half + half * 0.47, half * 0.56, 1.5);
            }

            // Smoke effect at bottom
            g.fillStyle(COLORS.SHADOW_PRIMARY, 0.12);
            g.fillEllipse(half, s - 3, half * 1.3, 7);
            g.fillStyle(COLORS.SHADOW_DARK, 0.08);
            g.fillEllipse(half, s - 1, half * 1.0, 5);

            g.generateTexture('shadow_' + type, s, s);
            g.destroy();
        });
    }

    // =============================================
    //  UI TEXTURES
    // =============================================
    static createUITextures(scene) {
        const icons = {
            basicDagger: (g) => {
                g.fillStyle(0xbbbbcc);
                g.fillTriangle(14, 22, 16, 3, 18, 22);
                g.lineStyle(1, 0x888899, 0.5);
                g.beginPath(); g.moveTo(14, 22); g.lineTo(16, 3); g.lineTo(18, 22); g.strokePath();
                g.fillStyle(0xffffff, 0.3);
                g.fillRect(15.5, 5, 1, 10);
                g.fillStyle(0x776655);
                g.fillRect(14, 22, 4, 6);
                g.fillStyle(0x888888);
                g.fillRect(12, 21, 8, 2);
            },
            shadowDagger: (g) => {
                g.fillStyle(COLORS.DAGGER);
                g.fillTriangle(12, 24, 16, 3, 20, 24);
                g.lineStyle(1, 0xaaaabc, 0.5);
                g.beginPath(); g.moveTo(12, 24); g.lineTo(16, 3); g.lineTo(20, 24); g.strokePath();
                g.fillStyle(0xffffff, 0.25);
                g.fillRect(15, 6, 1.5, 12);
                g.fillStyle(0x888899);
                g.fillRect(13, 24, 6, 4);
            },
            shadowSlash: (g) => {
                g.fillStyle(COLORS.SLASH, 0.7);
                g.slice(16, 16, 13, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(0), false);
                g.fillPath();
                g.fillStyle(0xffffff, 0.25);
                g.slice(16, 16, 9, Phaser.Math.DegToRad(-80), Phaser.Math.DegToRad(-10), false);
                g.fillPath();
            },
            rulersAuthority: (g) => {
                g.lineStyle(2, COLORS.SHADOW_PRIMARY, 0.8);
                g.strokeCircle(16, 16, 11);
                g.lineStyle(1, COLORS.SHADOW_GLOW, 0.4);
                g.strokeCircle(16, 16, 8);
                g.fillStyle(COLORS.SHADOW_GLOW, 0.4);
                g.fillCircle(16, 16, 5);
                g.fillStyle(0xffffff, 0.3);
                g.fillCircle(15, 15, 2);
            },
            dragonFear: (g) => {
                g.fillStyle(0xff4400, 0.4);
                g.fillCircle(16, 16, 12);
                g.fillStyle(0xff6600, 0.5);
                g.fillCircle(16, 16, 8);
                g.fillStyle(0xff8800, 0.3);
                g.fillCircle(16, 16, 4);
            },
        };

        for (const [key, drawFn] of Object.entries(icons)) {
            const g = scene.make.graphics({ add: false });
            g.fillStyle(0x2a1a4a, 0.8);
            g.fillRoundedRect(0, 0, 32, 32, 4);
            g.lineStyle(1, 0x4a2a7a, 0.4);
            g.strokeRoundedRect(0, 0, 32, 32, 4);
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
            g.lineStyle(1, 0x2a2a4e, 0.4);
            g.strokeRoundedRect(0, 0, 32, 32, 4);
            // Outer glow
            g.fillStyle(color, 0.15);
            g.fillCircle(16, 16, 13);
            g.fillStyle(color, 0.5);
            g.fillCircle(16, 16, 9);
            g.fillStyle(color, 0.9);
            g.fillCircle(16, 16, 5);
            // Highlight
            g.fillStyle(0xffffff, 0.3);
            g.fillCircle(14, 14, 2.5);
            g.generateTexture('icon_' + key, 32, 32);
            g.destroy();
        }
    }

    // =============================================
    //  FLOOR TEXTURE
    // =============================================
    static createFloorTexture(scene) {
        const g = scene.make.graphics({ add: false });
        const ts = 128; // Larger tile for more detail
        const half = ts / 2;

        // Base stone color
        g.fillStyle(COLORS.BG_FLOOR);
        g.fillRect(0, 0, ts, ts);

        // Stone block pattern (4 blocks)
        const blockColors = [0x131328, 0x111125, 0x141430, 0x12122a];
        const blocks = [
            [1, 1, half - 2, half - 2, blockColors[0]],
            [half + 1, 1, half - 2, half - 2, blockColors[1]],
            [1, half + 1, half - 2, half - 2, blockColors[2]],
            [half + 1, half + 1, half - 2, half - 2, blockColors[3]],
        ];
        for (const [bx, by, bw, bh, bc] of blocks) {
            g.fillStyle(bc, 0.8);
            g.fillRect(bx, by, bw, bh);
        }

        // Mortar lines (between blocks)
        g.fillStyle(0x0a0a18, 0.8);
        g.fillRect(0, half - 1, ts, 2);
        g.fillRect(half - 1, 0, 2, ts);

        // Subtle highlight on block edges (top-left of each block)
        g.fillStyle(0x1e1e3e, 0.3);
        g.fillRect(2, 2, half - 4, 1);
        g.fillRect(2, 2, 1, half - 4);
        g.fillRect(half + 2, 2, half - 4, 1);
        g.fillRect(half + 2, 2, 1, half - 4);
        g.fillRect(2, half + 2, half - 4, 1);
        g.fillRect(2, half + 2, 1, half - 4);
        g.fillRect(half + 2, half + 2, half - 4, 1);
        g.fillRect(half + 2, half + 2, 1, half - 4);

        // Crack lines
        g.lineStyle(1, 0x0e0e22, 0.4);
        g.beginPath(); g.moveTo(18, 10); g.lineTo(25, 22); g.lineTo(22, 35); g.strokePath();
        g.beginPath(); g.moveTo(85, 70); g.lineTo(92, 82); g.lineTo(100, 90); g.strokePath();
        g.beginPath(); g.moveTo(75, 15); g.lineTo(80, 28); g.strokePath();
        g.beginPath(); g.moveTo(35, 80); g.lineTo(28, 95); g.lineTo(30, 105); g.strokePath();

        // Stone texture dots (subtle)
        g.fillStyle(0x1a1a38, 0.3);
        const dots = [[15,20],[40,35],[70,15],[95,40],[25,75],[55,90],[80,100],[110,70],[12,110],[45,55]];
        for (const [dx, dy] of dots) {
            g.fillCircle(dx, dy, 1.5);
        }

        // Subtle dirt/dust patches
        g.fillStyle(0x16162e, 0.2);
        g.fillCircle(30, 30, 6);
        g.fillCircle(95, 95, 5);
        g.fillCircle(20, 100, 4);

        // Moss hints in corners
        g.fillStyle(0x1a2a1a, 0.15);
        g.fillCircle(3, 3, 5);
        g.fillCircle(ts - 3, ts - 3, 4);
        g.fillCircle(3, ts - 3, 3);

        g.generateTexture('floor_tile', ts, ts);
        g.destroy();
    }
}
