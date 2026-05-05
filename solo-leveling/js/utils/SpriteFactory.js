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

    // --- Canvas2D helpers ---
    static _hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

    static _tex(scene, key, w, h, drawFn) {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        drawFn(ctx);
        if (scene.textures.exists(key)) scene.textures.remove(key);
        scene.textures.addCanvas(key, canvas);
    }

    static _cRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // Scale an external CDN texture to target size and register under a new key
    // Uses nearest-neighbor scaling to keep pixel art crisp
    // Flips horizontally so sprites face right (DCSS tiles face left by default)
    // Applies NEAREST filter so upscaled pixel tiles stay crisp instead of blurry
    static _scaleExtTexture(scene, extKey, targetKey, w, h) {
        if (!scene.textures.exists(extKey)) return false;
        try {
            const src = scene.textures.get(extKey).getSourceImage();
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            // Flip horizontally so sprite faces right by default
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(src, 0, 0, w, h);
            if (scene.textures.exists(targetKey)) scene.textures.remove(targetKey);
            scene.textures.addCanvas(targetKey, canvas);
            // Pixel-perfect upscale: keep sharp edges on retro tiles
            try {
                const tex = scene.textures.get(targetKey);
                if (tex && tex.setFilter && Phaser.Textures?.FilterMode) {
                    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
                }
            } catch (_) { /* filter mode optional */ }
            return true;
        } catch (e) { return false; }
    }

    static _fitSourceToFrame(src, frameW, frameH, maxW = 0.95, maxH = 0.95) {
        const scale = Math.min((frameW * maxW) / src.width, (frameH * maxH) / src.height);
        return {
            w: Math.max(1, Math.round(src.width * scale)),
            h: Math.max(1, Math.round(src.height * scale)),
        };
    }

    // Pseudo-gradient 3D lighting overlay (for Phaser Graphics sprites)
    static _applyLighting(g, cx, cy, radius) {
        // Top-left highlight
        for (let j = 1; j <= 5; j++) {
            const t = j / 5;
            g.fillStyle(0xffffff, 0.015 + t * 0.02);
            g.fillCircle(cx - radius * 0.15, cy - radius * 0.2, radius * (1 - t * 0.6));
        }
        // Bottom-right shadow
        for (let j = 1; j <= 5; j++) {
            const t = j / 5;
            g.fillStyle(0x000011, 0.015 + t * 0.02);
            g.fillCircle(cx + radius * 0.15, cy + radius * 0.15, radius * (1 - t * 0.4));
        }
        // Rim light (subtle edge highlight)
        g.fillStyle(0x4466aa, 0.04);
        g.fillCircle(cx - radius * 0.3, cy - radius * 0.3, radius * 0.6);
    }

    // Chroma key: remove green background (#00FF00) and register as new texture
    static _chromaKey(scene, srcKey, destKey, w, h) {
        if (!scene.textures.exists(srcKey)) return false;
        try {
            const src = scene.textures.get(srcKey).getSourceImage();
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(src, 0, 0, w, h);
            const imgData = ctx.getImageData(0, 0, w, h);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                // Green screen removal: high green, low red/blue
                if (g > 120 && g > r * 1.4 && g > b * 1.4) {
                    d[i + 3] = 0; // Set alpha to 0
                }
            }
            ctx.putImageData(imgData, 0, 0);
            if (scene.textures.exists(destKey)) scene.textures.remove(destKey);
            scene.textures.addCanvas(destKey, canvas);
            return true;
        } catch (e) { return false; }
    }

    static createAll(scene) {
        // Try AI-generated player sprites first (with chroma key background removal)
        const motionPlayerLoaded = this._loadMotionPlayerTextures(scene);
        const aiPlayerLoaded = motionPlayerLoaded || this._loadAIPlayerTextures(scene);
        if (!motionPlayerLoaded && !aiPlayerLoaded) {
            this.createPlayerTextures(scene);
        }
        this.createEnemyTextures(scene);
        this.createBossTextures(scene);
        this.createProjectileTextures(scene);
        this.createEffectTextures(scene);
        this.createUITextures(scene);
        this.createShadowSoldierTextures(scene);
        // Use AI dungeon floor if available, else procedural
        if (!this._loadAIDungeonFloor(scene)) {
            this.createFloorTexture(scene);
        }
        this._createParticleTextures(scene);
    }

    static _copyTexture(scene, srcKey, destKey, w, h) {
        const src = scene.textures.get(srcKey).getSourceImage();
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(src, 0, 0, w, h);
        if (scene.textures.exists(destKey)) scene.textures.remove(destKey);
        scene.textures.addCanvas(destKey, canvas);
    }

    static _createPlayerAuraTexture(scene) {
        if (scene.textures.exists('player_aura')) scene.textures.remove('player_aura');
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

    static _loadMotionPlayerTextures(scene) {
        const W = 112, H = 144;
        const names = [
            ...Array.from({ length: 4 }, (_, i) => `player_idle_${i}`),
            ...['down', 'right', 'up', 'left'].flatMap(dir =>
                Array.from({ length: 4 }, (_, i) => `player_walk_${dir}_${i}`)
            ),
            ...Array.from({ length: 6 }, (_, i) => `player_attack_${i}`),
            ...['down', 'right', 'up', 'left'].flatMap(dir =>
                Array.from({ length: 6 }, (_, i) => `player_attack_${dir}_${i}`)
            ),
            ...Array.from({ length: 2 }, (_, i) => `player_hit_${i}`),
        ];
        if (!names.every(name => scene.textures.exists(`motion_${name}`))) {
            return false;
        }

        for (const name of names) {
            this._copyTexture(scene, `motion_${name}`, name, W, H);
        }
        for (let i = 0; i < 4; i++) {
            this._copyTexture(scene, `motion_player_walk_down_${i}`, `player_walk_${i}`, W, H);
        }
        this._createPlayerAuraTexture(scene);

        console.log('[SpriteFactory] Motion player sprite set loaded (28 frames)');
        return true;
    }

    static _loadAIPlayerTextures(scene) {
        if (!scene.textures.exists('ai_player_idle')) return false;
        const W = 96, H = 128;

        const src = scene.textures.get('ai_player_idle').getSourceImage();
        const base = document.createElement('canvas');
        base.width = W; base.height = H;
        const baseCtx = base.getContext('2d');
        baseCtx.imageSmoothingEnabled = true;
        baseCtx.drawImage(src, 0, 0, W, H);

        const imgData = baseCtx.getImageData(0, 0, W, H);
        const d = imgData.data;
        for (let p = 0; p < d.length; p += 4) {
            const r = d[p], g = d[p + 1], b = d[p + 2];
            if (g > 120 && g > r * 1.35 && g > b * 1.35) {
                d[p + 3] = 0;
            }
        }
        baseCtx.putImageData(imgData, 0, 0);

        const makeFrame = ({ bob = 0, sway = 0, scaleX = 1, scaleY = 1, angle = 0 }) => {
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.save();
            ctx.translate(W / 2 + sway, H / 2 + bob);
            ctx.rotate(angle);
            ctx.scale(scaleX, scaleY);
            ctx.drawImage(base, -W / 2, -H / 2, W, H);
            ctx.restore();
            return c;
        };

        for (let i = 0; i < 8; i++) {
            const phase = i * Math.PI / 4;
            const breath = Math.sin(phase);
            const idleKey = 'player_idle_' + i;
            if (scene.textures.exists(idleKey)) scene.textures.remove(idleKey);
            scene.textures.addCanvas(idleKey, makeFrame({
                bob: -breath * 1.2,
                scaleX: 1 - breath * 0.004,
                scaleY: 1 + breath * 0.011,
            }));

            const step = Math.sin(phase);
            const footfall = Math.abs(step);
            const walkKey = 'player_walk_' + i;
            if (scene.textures.exists(walkKey)) scene.textures.remove(walkKey);
            scene.textures.addCanvas(walkKey, makeFrame({
                bob: -footfall * 2.0,
                sway: step * 1.8,
                scaleX: 1 + footfall * 0.01,
                scaleY: 1 - footfall * 0.014,
                angle: step * 0.015,
            }));
        }

        this._createPlayerAuraTexture(scene);

        console.log('[SpriteFactory] AI player sprite loaded (single image + generated motion frames)');
        return true;
    }

    static _loadAIDungeonFloor(scene) {
        if (!scene.textures.exists('ai_dungeon_floor')) return false;
        try {
            const src = scene.textures.get('ai_dungeon_floor').getSourceImage();
            const tileSize = 512;
            const canvas = document.createElement('canvas');
            canvas.width = tileSize; canvas.height = tileSize;
            const ctx = canvas.getContext('2d');
            ctx.filter = 'brightness(0.68) contrast(0.82) saturate(0.72)';
            ctx.drawImage(src, 0, 0, tileSize, tileSize);
            ctx.filter = 'none';
            ctx.fillStyle = 'rgba(5, 4, 18, 0.32)';
            ctx.fillRect(0, 0, tileSize, tileSize);
            const glow = ctx.createRadialGradient(tileSize * 0.5, tileSize * 0.48, 10, tileSize * 0.5, tileSize * 0.48, tileSize * 0.64);
            glow.addColorStop(0, 'rgba(90, 74, 125, 0.12)');
            glow.addColorStop(0.45, 'rgba(20, 18, 46, 0.02)');
            glow.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, tileSize, tileSize);
            if (scene.textures.exists('floor_tile')) scene.textures.remove('floor_tile');
            scene.textures.addCanvas('floor_tile', canvas);
            console.log('[SpriteFactory] AI dungeon floor loaded (Imagen 4)');
            return true;
        } catch (e) { return false; }
    }

    // =============================================
    //  PLAYER TEXTURES
    // =============================================
    static createPlayerTextures(scene) {
        const W = 96, H = 104;

        // Player idle frames (8 frames, high-res Canvas2D)
        for (let i = 0; i < 8; i++) {
            const breathe = Math.sin(i * Math.PI / 4) * 2.5;
            this._tex(scene, 'player_idle_' + i, W, H, (ctx) => {
                this._drawPlayerCanvas(ctx, W, H, breathe, 0, 0, false, i);
            });
        }

        // Player walk frames (8 frames)
        for (let i = 0; i < 8; i++) {
            const legSwing = Math.sin(i * Math.PI / 4) * 7;
            const armSwing = Math.sin(i * Math.PI / 4) * 5;
            const bob = Math.abs(Math.sin(i * Math.PI / 4)) * 2;
            this._tex(scene, 'player_walk_' + i, W, H, (ctx) => {
                this._drawPlayerCanvas(ctx, W, H, -bob, legSwing, armSwing, true, i);
            });
        }

        this._createPlayerAuraTexture(scene);
    }

    static _drawPlayerCanvas(ctx, W, H, by, legSwing, armSwing, walking, frame) {
        const cx = W / 2;

        // ── GROUND SHADOW ──
        const gShadow = ctx.createRadialGradient(cx, 97, 0, cx, 97, 26);
        gShadow.addColorStop(0, 'rgba(10,0,30,0.55)');
        gShadow.addColorStop(0.5, 'rgba(5,0,20,0.2)');
        gShadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gShadow;
        ctx.beginPath(); ctx.ellipse(cx, 97, 26, 6, 0, 0, Math.PI * 2); ctx.fill();

        // ── SHADOW WISPS (behind character) ──
        ctx.save();
        ctx.globalAlpha = 0.15;
        for (let w = 0; w < 5; w++) {
            const phase = w * 1.3 + frame * 0.8;
            const wx = cx - 16 + w * 8 + (walking ? Math.sin(phase) * 3 : 0);
            const wy = 90 + by;
            const wGrad = ctx.createLinearGradient(wx, wy + 8, wx, wy - 18);
            wGrad.addColorStop(0, 'rgba(60,30,120,0)');
            wGrad.addColorStop(0.4, 'rgba(80,40,160,0.7)');
            wGrad.addColorStop(1, 'rgba(60,30,120,0)');
            ctx.fillStyle = wGrad;
            ctx.beginPath(); ctx.ellipse(wx, wy - 4, 3, 12 + Math.sin(phase) * 3, (w - 2) * 0.15, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        // ── COAT TAILS (behind legs) ──
        const tailBase = 76 + by;
        const tailGrad = ctx.createLinearGradient(24, tailBase, 24, 92);
        tailGrad.addColorStop(0, '#12142a');
        tailGrad.addColorStop(1, '#08091a');
        ctx.fillStyle = tailGrad;
        // Left tail
        ctx.beginPath();
        ctx.moveTo(28, tailBase); ctx.quadraticCurveTo(22 - (walking ? armSwing * 0.5 : 0), 94, 32, 90 + by);
        ctx.lineTo(38, tailBase); ctx.fill();
        // Right tail
        ctx.beginPath();
        ctx.moveTo(58, tailBase); ctx.quadraticCurveTo(74 + (walking ? armSwing * 0.5 : 0), 94, 64, 90 + by);
        ctx.lineTo(68, tailBase); ctx.fill();
        // Center tail fill
        ctx.fillStyle = '#0e1024';
        ctx.beginPath();
        ctx.moveTo(36, tailBase); ctx.quadraticCurveTo(cx, 90 + (walking ? 2 : 0), 60, tailBase); ctx.fill();
        // Tail inner lining (subtle purple)
        ctx.fillStyle = 'rgba(40,15,60,0.25)';
        ctx.beginPath();
        ctx.moveTo(34, tailBase + 2); ctx.quadraticCurveTo(cx, 86 + by, 62, tailBase + 2); ctx.fill();

        // ── LEGS ──
        const lx1 = 34 + (walking ? legSwing : 0);
        const lx2 = 52 + (walking ? -legSwing : 0);
        const legTop = 78 + by;
        const pantsGrad = ctx.createLinearGradient(0, legTop, 0, legTop + 16);
        pantsGrad.addColorStop(0, '#16162e');
        pantsGrad.addColorStop(1, '#0c0c1e');
        ctx.fillStyle = pantsGrad;
        this._cRoundRect(ctx, lx1, legTop, 10, 14, 2); ctx.fill();
        this._cRoundRect(ctx, lx2, legTop, 10, 14, 2); ctx.fill();
        // Leg inner highlight
        ctx.fillStyle = 'rgba(30,30,55,0.35)';
        ctx.fillRect(lx1 + 1, legTop + 1, 3, 12);
        ctx.fillRect(lx2 + 1, legTop + 1, 3, 12);
        // Knee seam
        ctx.strokeStyle = 'rgba(20,20,40,0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(lx1 + 1, legTop + 8); ctx.lineTo(lx1 + 9, legTop + 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx2 + 1, legTop + 8); ctx.lineTo(lx2 + 9, legTop + 7); ctx.stroke();

        // ── BOOTS ──
        const bootY = legTop + 12;
        const bootGrad = ctx.createLinearGradient(0, bootY, 0, bootY + 10);
        bootGrad.addColorStop(0, '#1a1a30');
        bootGrad.addColorStop(0.5, '#101020');
        bootGrad.addColorStop(1, '#0a0a16');
        ctx.fillStyle = bootGrad;
        this._cRoundRect(ctx, lx1 - 2, bootY, 14, 10, 3); ctx.fill();
        this._cRoundRect(ctx, lx2 - 2, bootY, 14, 10, 3); ctx.fill();
        // Boot top strap
        ctx.fillStyle = '#2a2a44';
        ctx.fillRect(lx1 - 1, bootY, 12, 2.5);
        ctx.fillRect(lx2 - 1, bootY, 12, 2.5);
        // Boot buckle
        const bkGrad = ctx.createLinearGradient(0, bootY, 0, bootY + 2.5);
        bkGrad.addColorStop(0, '#aaaacc');
        bkGrad.addColorStop(1, '#777799');
        ctx.fillStyle = bkGrad;
        ctx.fillRect(lx1 + 3, bootY, 4, 2.5);
        ctx.fillRect(lx2 + 3, bootY, 4, 2.5);
        // Boot outline
        ctx.strokeStyle = 'rgba(0,0,10,0.45)';
        ctx.lineWidth = 0.8;
        this._cRoundRect(ctx, lx1 - 2, bootY, 14, 10, 3); ctx.stroke();
        this._cRoundRect(ctx, lx2 - 2, bootY, 14, 10, 3); ctx.stroke();
        // Boot sole rim
        ctx.fillStyle = 'rgba(40,40,65,0.3)';
        this._cRoundRect(ctx, lx1 - 1, bootY + 8, 12, 2, 1); ctx.fill();
        this._cRoundRect(ctx, lx2 - 1, bootY + 8, 12, 2, 1); ctx.fill();

        // ── COAT BODY (main torso) ──
        const coatTop = 36 + by;
        const coatBot = 78 + by;
        // Main shape (tapered)
        const coatGrad = ctx.createLinearGradient(26, coatTop, 70, coatBot);
        coatGrad.addColorStop(0, '#181e3a');
        coatGrad.addColorStop(0.3, '#141832');
        coatGrad.addColorStop(0.7, '#101428');
        coatGrad.addColorStop(1, '#0c0e1e');
        ctx.fillStyle = coatGrad;
        ctx.beginPath();
        ctx.moveTo(30, coatTop); ctx.lineTo(66, coatTop);
        ctx.lineTo(68, coatBot); ctx.lineTo(28, coatBot);
        ctx.closePath(); ctx.fill();
        // Left edge highlight (light source)
        const leftHL = ctx.createLinearGradient(28, 0, 42, 0);
        leftHL.addColorStop(0, 'rgba(45,55,90,0.3)');
        leftHL.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = leftHL;
        ctx.fillRect(28, coatTop, 14, coatBot - coatTop);
        // Right edge shadow
        const rightSH = ctx.createLinearGradient(56, 0, 68, 0);
        rightSH.addColorStop(0, 'rgba(0,0,0,0)');
        rightSH.addColorStop(1, 'rgba(0,0,10,0.2)');
        ctx.fillStyle = rightSH;
        ctx.fillRect(56, coatTop, 12, coatBot - coatTop);
        // Center seam
        ctx.strokeStyle = 'rgba(20,20,40,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, coatTop + 12); ctx.lineTo(cx, coatBot); ctx.stroke();
        // Cross-stitch on seam
        ctx.strokeStyle = 'rgba(50,50,80,0.2)';
        ctx.lineWidth = 0.5;
        for (let sy = coatTop + 16; sy < coatBot - 4; sy += 8) {
            ctx.beginPath(); ctx.moveTo(cx - 2, sy); ctx.lineTo(cx + 2, sy + 4); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + 2, sy); ctx.lineTo(cx - 2, sy + 4); ctx.stroke();
        }
        // Coat outline
        ctx.strokeStyle = 'rgba(0,0,10,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, coatTop); ctx.lineTo(66, coatTop);
        ctx.lineTo(68, coatBot); ctx.lineTo(28, coatBot); ctx.closePath();
        ctx.stroke();

        // ── HIGH COLLAR (signature hunter coat) ──
        const collarGrad = ctx.createLinearGradient(0, coatTop - 8, 0, coatTop + 6);
        collarGrad.addColorStop(0, '#1e2444');
        collarGrad.addColorStop(1, '#141830');
        ctx.fillStyle = collarGrad;
        // Left collar
        ctx.beginPath();
        ctx.moveTo(30, coatTop); ctx.lineTo(28, coatTop - 8);
        ctx.lineTo(36, coatTop - 4); ctx.lineTo(40, coatTop + 6); ctx.fill();
        // Right collar
        ctx.beginPath();
        ctx.moveTo(66, coatTop); ctx.lineTo(68, coatTop - 8);
        ctx.lineTo(60, coatTop - 4); ctx.lineTo(56, coatTop + 6); ctx.fill();
        // Collar edge highlight
        ctx.strokeStyle = 'rgba(65,75,115,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(28, coatTop - 8); ctx.lineTo(36, coatTop - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(68, coatTop - 8); ctx.lineTo(60, coatTop - 4); ctx.stroke();
        // Collar inner shadow
        ctx.strokeStyle = 'rgba(10,10,25,0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(30, coatTop - 6); ctx.lineTo(36, coatTop - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(66, coatTop - 6); ctx.lineTo(60, coatTop - 2); ctx.stroke();

        // ── V-NECK OPENING ──
        // Neck skin
        ctx.fillStyle = '#c8a878';
        ctx.beginPath();
        ctx.moveTo(40, coatTop - 2); ctx.lineTo(cx, coatTop + 6);
        ctx.lineTo(56, coatTop - 2); ctx.fill();
        // V-neck shadow
        const vGrad = ctx.createLinearGradient(0, coatTop, 0, coatTop + 10);
        vGrad.addColorStop(0, '#0c0816');
        vGrad.addColorStop(1, '#06040e');
        ctx.fillStyle = vGrad;
        ctx.beginPath();
        ctx.moveTo(38, coatTop); ctx.lineTo(cx, coatTop + 12);
        ctx.lineTo(58, coatTop); ctx.fill();
        // Collar edge lines
        ctx.strokeStyle = 'rgba(50,55,85,0.45)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(38, coatTop); ctx.lineTo(cx, coatTop + 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(58, coatTop); ctx.lineTo(cx, coatTop + 10); ctx.stroke();

        // ── BELT ──
        const beltY = 72 + by;
        const beltGrad = ctx.createLinearGradient(0, beltY, 0, beltY + 5);
        beltGrad.addColorStop(0, '#3a3a58');
        beltGrad.addColorStop(0.5, '#2e2e48');
        beltGrad.addColorStop(1, '#22223a');
        ctx.fillStyle = beltGrad;
        ctx.fillRect(29, beltY, 38, 5);
        // Buckle (metallic)
        const buckGrad = ctx.createLinearGradient(44, beltY, 52, beltY + 5);
        buckGrad.addColorStop(0, '#ccccee');
        buckGrad.addColorStop(0.3, '#aaaacc');
        buckGrad.addColorStop(0.7, '#8888aa');
        buckGrad.addColorStop(1, '#666688');
        ctx.fillStyle = buckGrad;
        this._cRoundRect(ctx, 44, beltY, 8, 5, 1); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.5;
        this._cRoundRect(ctx, 44, beltY, 8, 5, 1); ctx.stroke();
        // Buckle diamond detail
        ctx.fillStyle = '#555570';
        ctx.beginPath();
        ctx.moveTo(48, beltY + 1); ctx.lineTo(50, beltY + 2.5);
        ctx.lineTo(48, beltY + 4); ctx.lineTo(46, beltY + 2.5); ctx.fill();

        // ── SHOULDER ARMOR ──
        // Left shoulder
        const shY = coatTop - 2;
        const lsGrad = ctx.createLinearGradient(18, shY, 32, shY + 10);
        lsGrad.addColorStop(0, '#282e50');
        lsGrad.addColorStop(0.5, '#1e2444');
        lsGrad.addColorStop(1, '#161c38');
        ctx.fillStyle = lsGrad;
        ctx.beginPath(); ctx.ellipse(27, shY + 4, 11, 7, -0.15, 0, Math.PI * 2); ctx.fill();
        // Right shoulder
        const rsGrad = ctx.createLinearGradient(64, shY, 78, shY + 10);
        rsGrad.addColorStop(0, '#222844');
        rsGrad.addColorStop(0.5, '#1c2240');
        rsGrad.addColorStop(1, '#161c38');
        ctx.fillStyle = rsGrad;
        ctx.beginPath(); ctx.ellipse(69, shY + 4, 11, 7, 0.15, 0, Math.PI * 2); ctx.fill();
        // Shoulder highlights
        ctx.strokeStyle = 'rgba(65,75,115,0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(27, shY + 4, 11, 7, -0.15, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(69, shY + 4, 11, 7, 0.15, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        // Shoulder accent lines
        ctx.strokeStyle = 'rgba(80,90,140,0.25)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(27, shY + 4, 7, 4.5, -0.15, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(69, shY + 4, 7, 4.5, 0.15, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
        // Shoulder outlines
        ctx.strokeStyle = 'rgba(0,0,10,0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(27, shY + 4, 11, 7, -0.15, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(69, shY + 4, 11, 7, 0.15, 0, Math.PI * 2); ctx.stroke();

        // ── ARMS ──
        const laOff = walking ? armSwing : 0;
        const raOff = walking ? -armSwing : 0;
        const armTop = coatTop + 6;
        // Left arm
        const laGrad = ctx.createLinearGradient(16, armTop, 28, armTop);
        laGrad.addColorStop(0, '#1c2240');
        laGrad.addColorStop(1, '#161c36');
        ctx.fillStyle = laGrad;
        this._cRoundRect(ctx, 18, armTop + laOff, 10, 24, 3); ctx.fill();
        // Left arm highlight
        ctx.fillStyle = 'rgba(40,50,80,0.25)';
        ctx.fillRect(19, armTop + 1 + laOff, 3, 22);
        // Left arm bands
        ctx.strokeStyle = 'rgba(50,55,85,0.45)';
        ctx.lineWidth = 1;
        for (let b = 0; b < 3; b++) {
            const bY = armTop + 6 + b * 7 + laOff;
            ctx.beginPath(); ctx.moveTo(19, bY); ctx.lineTo(27, bY + 1); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,10,0.35)';
        ctx.lineWidth = 0.8;
        this._cRoundRect(ctx, 18, armTop + laOff, 10, 24, 3); ctx.stroke();
        // Right arm
        const raGrad = ctx.createLinearGradient(68, armTop, 78, armTop);
        raGrad.addColorStop(0, '#161c36');
        raGrad.addColorStop(1, '#121830');
        ctx.fillStyle = raGrad;
        this._cRoundRect(ctx, 68, armTop + raOff, 10, 24, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(50,55,85,0.45)';
        ctx.lineWidth = 1;
        for (let b = 0; b < 3; b++) {
            const bY = armTop + 6 + b * 7 + raOff;
            ctx.beginPath(); ctx.moveTo(69, bY + 1); ctx.lineTo(77, bY); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,10,0.35)';
        ctx.lineWidth = 0.8;
        this._cRoundRect(ctx, 68, armTop + raOff, 10, 24, 3); ctx.stroke();

        // ── GLOVES ──
        const gloveY_L = armTop + 22 + laOff;
        const gloveY_R = armTop + 22 + raOff;
        // Left glove
        const lgGrad = ctx.createRadialGradient(23, gloveY_L + 4, 0, 23, gloveY_L + 4, 6);
        lgGrad.addColorStop(0, '#1e1e34');
        lgGrad.addColorStop(1, '#12122a');
        ctx.fillStyle = lgGrad;
        this._cRoundRect(ctx, 17, gloveY_L, 12, 9, 4); ctx.fill();
        ctx.fillStyle = '#2a2a44';
        ctx.fillRect(17, gloveY_L, 12, 2.5);
        ctx.strokeStyle = 'rgba(0,0,10,0.35)';
        ctx.lineWidth = 0.5;
        this._cRoundRect(ctx, 17, gloveY_L, 12, 9, 4); ctx.stroke();
        // Right glove
        const rgGrad = ctx.createRadialGradient(73, gloveY_R + 4, 0, 73, gloveY_R + 4, 6);
        rgGrad.addColorStop(0, '#1e1e34');
        rgGrad.addColorStop(1, '#12122a');
        ctx.fillStyle = rgGrad;
        this._cRoundRect(ctx, 67, gloveY_R, 12, 9, 4); ctx.fill();
        ctx.fillStyle = '#2a2a44';
        ctx.fillRect(67, gloveY_R, 12, 2.5);
        ctx.strokeStyle = 'rgba(0,0,10,0.35)';
        ctx.lineWidth = 0.5;
        this._cRoundRect(ctx, 67, gloveY_R, 12, 9, 4); ctx.stroke();

        // ── HEAD ──
        const headY = 20 + by;
        const headR = 13;
        // Neck
        const neckGrad = ctx.createLinearGradient(0, headY + 10, 0, headY + headR + 6);
        neckGrad.addColorStop(0, '#deb887');
        neckGrad.addColorStop(1, '#c0a070');
        ctx.fillStyle = neckGrad;
        ctx.fillRect(42, headY + 10, 12, 8);
        // Face (3D radial gradient)
        const faceGrad = ctx.createRadialGradient(cx - 2, headY - 2, 0, cx, headY, headR + 2);
        faceGrad.addColorStop(0, '#f2dab0');
        faceGrad.addColorStop(0.35, '#ecd0a0');
        faceGrad.addColorStop(0.65, '#deb887');
        faceGrad.addColorStop(1, '#b89060');
        ctx.fillStyle = faceGrad;
        ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.fill();
        // Jawline (angular, Sung Jin-Woo style)
        const jawGrad = ctx.createLinearGradient(0, headY + 4, 0, headY + headR + 2);
        jawGrad.addColorStop(0, '#deb887');
        jawGrad.addColorStop(1, '#c8a070');
        ctx.fillStyle = jawGrad;
        ctx.beginPath();
        ctx.moveTo(cx - 11, headY + 4); ctx.lineTo(cx - 7, headY + headR + 1);
        ctx.lineTo(cx, headY + headR + 2); ctx.lineTo(cx + 7, headY + headR + 1);
        ctx.lineTo(cx + 11, headY + 4); ctx.closePath(); ctx.fill();
        // Chin shadow
        const chinSh = ctx.createLinearGradient(0, headY + 8, 0, headY + headR + 2);
        chinSh.addColorStop(0, 'rgba(0,0,0,0)');
        chinSh.addColorStop(1, 'rgba(140,90,50,0.15)');
        ctx.fillStyle = chinSh;
        ctx.beginPath(); ctx.arc(cx, headY, headR, 0.1, Math.PI - 0.1); ctx.fill();
        // Cheek blush (subtle)
        ctx.fillStyle = 'rgba(200,120,100,0.08)';
        ctx.beginPath(); ctx.arc(cx - 8, headY + 5, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 8, headY + 5, 4, 0, Math.PI * 2); ctx.fill();
        // Face outline
        ctx.strokeStyle = 'rgba(120,80,50,0.25)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.stroke();
        // Nose
        ctx.strokeStyle = 'rgba(160,110,70,0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, headY + 2); ctx.lineTo(cx - 1.5, headY + 6);
        ctx.lineTo(cx, headY + 7); ctx.stroke();
        ctx.fillStyle = 'rgba(255,230,200,0.25)';
        ctx.beginPath(); ctx.arc(cx - 0.8, headY + 4, 1, 0, Math.PI * 2); ctx.fill();
        // Mouth (determined expression)
        ctx.strokeStyle = 'rgba(140,90,60,0.45)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - 4, headY + 10);
        ctx.quadraticCurveTo(cx, headY + 10.5, cx + 4, headY + 10);
        ctx.stroke();

        // ── EYES (anime-style, glowing) ──
        const eyeY = headY;
        for (const [ex, dir] of [[cx - 6, -1], [cx + 6, 1]]) {
            // Eye white
            ctx.fillStyle = 'rgba(235,235,248,0.7)';
            ctx.beginPath(); ctx.ellipse(ex, eyeY, 4.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
            // Iris (blue → purple gradient)
            const irisGrad = ctx.createRadialGradient(ex - dir * 0.5, eyeY - 0.5, 0, ex, eyeY, 3.5);
            irisGrad.addColorStop(0, '#88ddff');
            irisGrad.addColorStop(0.25, '#55aaff');
            irisGrad.addColorStop(0.55, '#3366ee');
            irisGrad.addColorStop(1, '#2244aa');
            ctx.fillStyle = irisGrad;
            ctx.beginPath(); ctx.ellipse(ex, eyeY, 3.2, 3, 0, 0, Math.PI * 2); ctx.fill();
            // Pupil
            ctx.fillStyle = '#0a1430';
            ctx.beginPath(); ctx.ellipse(ex, eyeY + 0.3, 1.5, 2, 0, 0, Math.PI * 2); ctx.fill();
            // Iris detail ring
            ctx.strokeStyle = 'rgba(100,180,255,0.3)';
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.ellipse(ex, eyeY, 2.2, 2, 0, 0, Math.PI * 2); ctx.stroke();
            // Large highlight (anime sparkle)
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.arc(ex - dir * 1.3, eyeY - 1.3, 1.3, 0, Math.PI * 2); ctx.fill();
            // Small secondary highlight
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath(); ctx.arc(ex + dir * 0.8, eyeY + 1.3, 0.6, 0, Math.PI * 2); ctx.fill();
            // Glow bloom (strong blue)
            const bloom = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, 12);
            bloom.addColorStop(0, 'rgba(68,153,255,0.3)');
            bloom.addColorStop(0.4, 'rgba(68,120,255,0.1)');
            bloom.addColorStop(1, 'rgba(68,100,255,0)');
            ctx.fillStyle = bloom;
            ctx.beginPath(); ctx.arc(ex, eyeY, 12, 0, Math.PI * 2); ctx.fill();
            // Eye outline
            ctx.strokeStyle = 'rgba(15,20,45,0.65)';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.ellipse(ex, eyeY, 4.5, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
            // Upper eyelid (thick, anime style)
            ctx.strokeStyle = 'rgba(10,10,30,0.8)';
            ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.ellipse(ex, eyeY - 0.3, 4.8, 3.5, 0, Math.PI + 0.15, -0.15); ctx.stroke();
            // Lower lash line (subtle)
            ctx.strokeStyle = 'rgba(60,40,30,0.3)';
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.ellipse(ex, eyeY + 0.3, 4, 3.2, 0, 0.2, Math.PI - 0.2); ctx.stroke();
        }
        // Eyebrows (sharp, fierce)
        ctx.strokeStyle = 'rgba(20,20,40,0.85)';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 12, headY - 6.5);
        ctx.quadraticCurveTo(cx - 8, headY - 8, cx - 3, headY - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 3, headY - 6);
        ctx.quadraticCurveTo(cx + 8, headY - 8, cx + 12, headY - 6.5); ctx.stroke();
        ctx.lineCap = 'butt';

        // ── HAIR (Sung Jin-Woo style: dark, messy spikes) ──
        const hairGrad = ctx.createLinearGradient(cx - 18, headY - headR - 8, cx + 18, headY + 4);
        hairGrad.addColorStop(0, '#1e1e36');
        hairGrad.addColorStop(0.3, '#181830');
        hairGrad.addColorStop(0.6, '#141428');
        hairGrad.addColorStop(1, '#0e0e20');
        ctx.fillStyle = hairGrad;
        // Hair base (covers top of head)
        ctx.beginPath(); ctx.arc(cx, headY, headR + 1.5, Math.PI * 0.92, Math.PI * 2.08); ctx.fill();
        // Hair mass top
        ctx.beginPath();
        ctx.moveTo(cx - 16, headY - 2);
        ctx.quadraticCurveTo(cx - 17, headY - 10, cx - 12, headY - 15);
        ctx.quadraticCurveTo(cx - 6, headY - 19, cx, headY - 17);
        ctx.quadraticCurveTo(cx + 6, headY - 19, cx + 12, headY - 15);
        ctx.quadraticCurveTo(cx + 17, headY - 10, cx + 16, headY - 2);
        ctx.fill();
        // Spike 1 (center-left, tallest)
        ctx.beginPath();
        ctx.moveTo(cx - 5, headY - 15);
        ctx.quadraticCurveTo(cx - 4, headY - 25, cx, headY - 22);
        ctx.quadraticCurveTo(cx + 1, headY - 17, cx + 3, headY - 15);
        ctx.fill();
        // Spike 2 (left)
        ctx.beginPath();
        ctx.moveTo(cx - 10, headY - 12);
        ctx.quadraticCurveTo(cx - 14, headY - 22, cx - 8, headY - 19);
        ctx.quadraticCurveTo(cx - 6, headY - 14, cx - 4, headY - 15);
        ctx.fill();
        // Spike 3 (far left)
        ctx.beginPath();
        ctx.moveTo(cx - 14, headY - 8);
        ctx.quadraticCurveTo(cx - 20, headY - 17, cx - 15, headY - 15);
        ctx.quadraticCurveTo(cx - 12, headY - 10, cx - 10, headY - 10);
        ctx.fill();
        // Spike 4 (right)
        ctx.beginPath();
        ctx.moveTo(cx + 9, headY - 13);
        ctx.quadraticCurveTo(cx + 15, headY - 21, cx + 10, headY - 18);
        ctx.quadraticCurveTo(cx + 7, headY - 14, cx + 4, headY - 15);
        ctx.fill();
        // Spike 5 (far right)
        ctx.beginPath();
        ctx.moveTo(cx + 13, headY - 8);
        ctx.quadraticCurveTo(cx + 20, headY - 15, cx + 16, headY - 14);
        ctx.quadraticCurveTo(cx + 13, headY - 10, cx + 10, headY - 10);
        ctx.fill();
        // Side hair strands (framing face)
        ctx.beginPath();
        ctx.moveTo(cx - 15, headY - 4);
        ctx.quadraticCurveTo(cx - 19, headY + 4, cx - 16, headY + 12);
        ctx.lineTo(cx - 13, headY + 4); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + 15, headY - 4);
        ctx.quadraticCurveTo(cx + 19, headY + 4, cx + 16, headY + 12);
        ctx.lineTo(cx + 13, headY + 4); ctx.fill();
        // Hair forehead bangs (layered strands)
        ctx.beginPath();
        ctx.moveTo(cx - 8, headY - 12);
        ctx.quadraticCurveTo(cx - 4, headY - 6, cx - 2, headY - 5);
        ctx.lineTo(cx + 2, headY - 8);
        ctx.quadraticCurveTo(cx + 5, headY - 6, cx + 7, headY - 5);
        ctx.lineTo(cx + 10, headY - 9);
        ctx.fill();
        // Blue sheen highlights (multiple layers)
        const sheen1 = ctx.createLinearGradient(cx - 10, headY - 18, cx + 10, headY - 10);
        sheen1.addColorStop(0, 'rgba(50,65,120,0)');
        sheen1.addColorStop(0.3, 'rgba(60,80,140,0.4)');
        sheen1.addColorStop(0.6, 'rgba(65,85,145,0.3)');
        sheen1.addColorStop(1, 'rgba(50,65,120,0)');
        ctx.fillStyle = sheen1;
        ctx.fillRect(cx - 14, headY - 22, 28, 12);
        const sheen2 = ctx.createLinearGradient(cx - 14, headY - 8, cx + 2, headY - 2);
        sheen2.addColorStop(0, 'rgba(45,60,110,0)');
        sheen2.addColorStop(0.5, 'rgba(55,70,130,0.25)');
        sheen2.addColorStop(1, 'rgba(45,60,110,0)');
        ctx.fillStyle = sheen2;
        ctx.fillRect(cx - 16, headY - 10, 18, 8);
        // Individual hair strand highlights
        ctx.strokeStyle = 'rgba(60,75,130,0.3)';
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(cx - 6, headY - 17); ctx.quadraticCurveTo(cx - 3, headY - 20, cx, headY - 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 4, headY - 16); ctx.quadraticCurveTo(cx + 8, headY - 19, cx + 11, headY - 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 12, headY - 10); ctx.quadraticCurveTo(cx - 16, headY - 15, cx - 14, headY - 13); ctx.stroke();
        // Hair outline
        ctx.strokeStyle = 'rgba(8,8,20,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Left side
        ctx.moveTo(cx - 16, headY + 12);
        ctx.quadraticCurveTo(cx - 19, headY + 2, cx - 16, headY - 4);
        ctx.quadraticCurveTo(cx - 18, headY - 10, cx - 14, headY - 14);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 14, headY - 8);
        ctx.quadraticCurveTo(cx - 20, headY - 17, cx - 15, headY - 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 10, headY - 14);
        ctx.quadraticCurveTo(cx - 14, headY - 22, cx - 8, headY - 19);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 5, headY - 17);
        ctx.quadraticCurveTo(cx - 4, headY - 25, cx, headY - 22);
        ctx.quadraticCurveTo(cx + 1, headY - 18, cx + 3, headY - 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 9, headY - 14);
        ctx.quadraticCurveTo(cx + 15, headY - 21, cx + 10, headY - 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 13, headY - 10);
        ctx.quadraticCurveTo(cx + 20, headY - 15, cx + 16, headY - 14);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 16, headY - 4);
        ctx.quadraticCurveTo(cx + 19, headY + 2, cx + 16, headY + 12);
        ctx.stroke();

        // ── FRONT SHADOW WISPS (subtle overlay) ──
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.06;
        for (let w = 0; w < 3; w++) {
            const phase = w * 2 + frame * 0.6;
            const wx = cx - 8 + w * 8;
            const wy = 86 + by;
            const fwGrad = ctx.createLinearGradient(wx, wy + 6, wx, wy - 12);
            fwGrad.addColorStop(0, 'rgba(100,60,200,0)');
            fwGrad.addColorStop(0.5, 'rgba(100,60,200,1)');
            fwGrad.addColorStop(1, 'rgba(100,60,200,0)');
            ctx.fillStyle = fwGrad;
            ctx.beginPath(); ctx.ellipse(wx, wy, 2.5, 8 + Math.sin(phase) * 2, (w - 1) * 0.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    // =============================================
    //  ENEMY TEXTURES
    // =============================================
    static createEnemyTextures(scene) {
        // Goblin
        this._createEnemySprite(scene, 'goblin', ENEMY_TYPES.goblin.size, (g, s, frame) => {
            const wobble = Math.sin(frame * Math.PI / 2) * 1.5;
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
            g.fillRect(s + s*0.5, s - s*0.1 + wobble + wobble * 1.3, 2, 10);
            g.fillStyle(0x665544);
            g.fillRect(s + s*0.5 - 1, s + 4 + wobble + wobble * 1.3, 4, 3);
        });

        // Orc
        this._createEnemySprite(scene, 'orc', ENEMY_TYPES.orc.size, (g, s, frame) => {
            const wobble = Math.sin(frame * Math.PI / 2) * 1;
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
            const wobble = Math.sin(frame * Math.PI / 2) * 1;
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
            const wobble = Math.sin(frame * Math.PI / 2) * 1.5;
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
            const legAngle = Math.sin(frame * Math.PI / 2) * 0.15;
            for (let side = -1; side <= 1; side += 2) {
                g.beginPath(); g.moveTo(s, s * 0.7 + wobble); g.lineTo(s + side * s * 0.75, s * 0.45 + legAngle * side * 10); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.8 + wobble); g.lineTo(s + side * s * 0.85, s * 0.8); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.9); g.lineTo(s + side * s * 0.75, s * 1.15 - legAngle * side * 10); g.strokePath();
            }
        });

        // Stone Golem
        this._createEnemySprite(scene, 'stoneGolem', ENEMY_TYPES.stoneGolem.size, (g, s, frame) => {
            const wobble = Math.sin(frame * Math.PI / 2) * 1;
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
            const wobble = Math.sin(frame * Math.PI / 2) * 1.5;
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
            const angle = frame * Math.PI / 2;
            g.fillStyle(0xcc66ff, 0.5);
            g.fillCircle(s * 1.65 + Math.cos(angle) * 10, s * 0.15 + Math.sin(angle) * 10, 2);
            g.fillCircle(s * 1.65 + Math.cos(angle + 2) * 8, s * 0.15 + Math.sin(angle + 2) * 8, 1.5);
        });

        // Iron Knight
        this._createEnemySprite(scene, 'ironKnight', ENEMY_TYPES.ironKnight.size, (g, s, frame) => {
            const wobble = Math.sin(frame * Math.PI / 2) * 1;
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
            const swordBob = Math.sin(frame * Math.PI / 2) * 3;
            g.fillRect(s * 1.72, s * 0.15 + wobble + swordBob, 4, s * 1.3);
            g.lineStyle(1, 0xaaaacc, 0.6);
            g.strokeRect(s * 1.72, s * 0.15 + wobble + swordBob, 4, s * 1.3);
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
            const wobble = Math.sin(frame * Math.PI / 2) * 1;
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
            const wispOff = Math.sin(frame * Math.PI / 2) * 3;
            g.fillCircle(s * 0.3 + wispOff, s * 0.3, 3);
            g.fillCircle(s * 1.7 - wispOff, s * 0.5, 2.5);
            g.fillCircle(s, s * 1.7, 3);
        });
    }

    static _createEnemySprite(scene, key, size, drawFn) {
        if (this._loadAIEnemyTexture(scene, key, size)) return;

        // Try external CDN texture first
        const extKey = 'ext_enemy_' + key;
        if (scene.textures.exists(extKey)) {
            const texW = size * 2, texH = size * 2;
            for (let i = 0; i < 4; i++) {
                this._scaleExtTexture(scene, extKey, 'enemy_' + key + '_' + i, texW, texH);
            }
            return;
        }
        // Fallback: procedural generation
        for (let i = 0; i < 4; i++) {
            const g = scene.make.graphics({ add: false });
            const s = size;
            // Ground shadow
            this._groundShadow(g, s, s * 1.7, s * 0.7, s * 0.15);
            drawFn(g, s, i);
            // 3D gradient lighting overlay
            this._applyLighting(g, s, s * 0.8, s * 0.85);
            g.generateTexture('enemy_' + key + '_' + i, size * 2, size * 2);
            g.destroy();
        }
    }

    static _loadAIEnemyTexture(scene, key, size) {
        const srcKey = 'ai_enemy_' + key;
        if (!scene.textures.exists(srcKey)) return false;

        try {
            const src = scene.textures.get(srcKey).getSourceImage();
            const frameW = size * 2;
            const frameH = size * 2;
            const fitted = this._fitSourceToFrame(src, frameW, frameH, 0.95, 0.94);

            for (let i = 0; i < 4; i++) {
                const canvas = document.createElement('canvas');
                canvas.width = frameW;
                canvas.height = frameH;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;

                const phase = i * Math.PI / 2;
                const bob = Math.sin(phase) * Math.max(1, size * 0.035);
                const lean = Math.sin(phase) * 0.045;
                const squash = Math.abs(Math.sin(phase)) * 0.025;
                const drawW = fitted.w * (1 + squash * 0.35);
                const drawH = fitted.h * (1 - squash);
                const x = frameW / 2;
                const y = frameH * 0.96 + bob;

                const shadowGrad = ctx.createRadialGradient(x, frameH * 0.88, 0, x, frameH * 0.88, size * 0.78);
                shadowGrad.addColorStop(0, 'rgba(5, 0, 24, 0.42)');
                shadowGrad.addColorStop(0.55, 'rgba(20, 0, 50, 0.18)');
                shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = shadowGrad;
                ctx.beginPath();
                ctx.ellipse(x, frameH * 0.88, size * 0.78, size * 0.17, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.filter = 'blur(3px)';
                ctx.drawImage(src, x - drawW / 2, y - drawH, drawW, drawH);
                ctx.globalCompositeOperation = 'source-in';
                ctx.fillStyle = 'rgba(123, 47, 255, 0.24)';
                ctx.fillRect(0, 0, frameW, frameH);
                ctx.restore();

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(lean);
                ctx.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,0.65)) contrast(1.04) saturate(1.05)';
                ctx.drawImage(src, -drawW / 2, -drawH, drawW, drawH);
                ctx.restore();

                if (scene.textures.exists('enemy_' + key + '_' + i)) {
                    scene.textures.remove('enemy_' + key + '_' + i);
                }
                scene.textures.addCanvas('enemy_' + key + '_' + i, canvas);
            }
            return true;
        } catch (e) {
            console.warn('[SpriteFactory] AI enemy texture failed:', key, e);
            return false;
        }
    }

    // =============================================
    //  BOSS TEXTURES
    // =============================================
    static createBossTextures(scene) {
        // Igris - Red armored knight
        this._createBossSprite(scene, 'igris', BOSS_TYPES.igris, (g, s, frame, breathe) => {
            // Armor body
            this._outlinedRect(g, s * 0.3, s * 0.3 + breathe, s * 1.4, s * 1.3, 0x880000, 0x440000, 6);
            const b = breathe;
            // Armor shading
            g.fillStyle(0x990000, 0.3);
            g.fillRect(s * 0.35, s * 0.35 + b, s * 0.4, s * 1.2);
            g.fillStyle(0x660000, 0.3);
            g.fillRect(s * 1.2, s * 0.35 + b, s * 0.4, s * 1.2);
            // Armor detail lines
            g.lineStyle(1, 0x660000, 0.5);
            g.beginPath(); g.moveTo(s * 0.5, s * 0.7 + b); g.lineTo(s * 1.5, s * 0.7 + b); g.strokePath();
            g.beginPath(); g.moveTo(s * 0.5, s * 1.1 + b); g.lineTo(s * 1.5, s * 1.1 + b); g.strokePath();
            // Rivets
            g.fillStyle(0xcc4444, 0.6);
            for (const rx of [0.4, 1.6]) for (const ry of [0.5, 0.9, 1.3]) g.fillCircle(s * rx, s * ry + b, 2);
            // Helmet
            this._outlinedCircle(g, s, s * 0.3 + b, s * 0.45, 0xaa0000, 0x550000);
            // Visor
            g.fillStyle(0x440000, 0.9);
            g.fillRect(s * 0.55, s * 0.2 + b, s * 0.9, s * 0.12);
            // Eyes through visor (glowing)
            this._glowEyes(g, s * 0.75, s * 0.25 + b, s * 1.25, s * 0.25 + b, 0xff4444, 3.5);
            // Plume
            g.fillStyle(0xff2222);
            g.fillTriangle(s, s * 0.08 + b, s * 0.8, s * -0.18 + b, s * 1.2, s * -0.18 + b);
            g.lineStyle(1, 0xcc0000, 0.6);
            g.beginPath(); g.moveTo(s * 0.8, s * -0.18 + b); g.lineTo(s, s * 0.08 + b); g.lineTo(s * 1.2, s * -0.18 + b); g.strokePath();
            // Shoulder pads
            this._outlinedCircle(g, s * 0.25, s * 0.45 + b, s * 0.22, 0x990000, 0x550000);
            this._outlinedCircle(g, s * 1.75, s * 0.45 + b, s * 0.22, 0x990000, 0x550000);
            // Shoulder spikes
            g.fillStyle(0xbb0000);
            g.fillTriangle(s * 0.25, s * 0.25 + b, s * 0.15, s * 0.45 + b, s * 0.35, s * 0.45 + b);
            g.fillTriangle(s * 1.75, s * 0.25 + b, s * 1.65, s * 0.45 + b, s * 1.85, s * 0.45 + b);
            // Sword
            const swordSwing = Math.sin(frame * Math.PI / 2) * 3;
            g.fillStyle(0xdddddd);
            g.fillRect(s * 1.82, s * 0.05 + b + swordSwing, 5, s * 1.25);
            g.lineStyle(1, 0xaaaaaa, 0.6);
            g.strokeRect(s * 1.82, s * 0.05 + b + swordSwing, 5, s * 1.25);
            // Sword gleam
            g.fillStyle(0xffffff, 0.5);
            g.fillRect(s * 1.83, s * 0.1 + b + swordSwing, 2, s * 0.4);
            // Crossguard
            g.fillStyle(0xcc8833);
            g.fillRect(s * 1.72, s * 0.03 + b + swordSwing, 22, 5);
            // Legs
            this._outlinedRect(g, s * 0.5, s * 1.5, s * 0.35, s * 0.5, 0x770000, 0x440000, 2);
            this._outlinedRect(g, s * 1.15, s * 1.5, s * 0.35, s * 0.5, 0x770000, 0x440000, 2);
        });

        // Tusk - Giant Orc King
        this._createBossSprite(scene, 'tusk', BOSS_TYPES.tusk, (g, s, frame, breathe) => {
            const b = breathe;
            // Massive body
            this._outlinedRect(g, s * 0.15, s * 0.25 + b, s * 1.7, s * 1.5, 0x4a2a0a, 0x2a1a00, 10);
            // Body muscle shading
            g.fillStyle(0x5a3a1a, 0.3);
            g.fillCircle(s * 0.6, s * 0.7 + b, s * 0.4);
            g.fillCircle(s * 1.4, s * 0.7 + b, s * 0.4);
            g.fillStyle(0x3a1a00, 0.25);
            g.fillRect(s * 1.3, s * 0.3 + b, s * 0.5, s * 1.4);
            // Head
            this._outlinedCircle(g, s, s * 0.3 + b, s * 0.5, 0x5a3a1a, 0x2a1a00);
            // Crown
            g.fillStyle(0xccaa33);
            g.fillRect(s * 0.5, s * -0.05 + b, s, s * 0.12);
            g.fillTriangle(s * 0.5, s * -0.05 + b, s * 0.65, s * -0.28 + b, s * 0.8, s * -0.05 + b);
            g.fillTriangle(s * 0.85, s * -0.05 + b, s, s * -0.33 + b, s * 1.15, s * -0.05 + b);
            g.fillTriangle(s * 1.2, s * -0.05 + b, s * 1.35, s * -0.28 + b, s * 1.5, s * -0.05 + b);
            g.lineStyle(1, 0xaa8822, 0.6);
            g.strokeRect(s * 0.5, s * -0.05 + b, s, s * 0.12);
            // Crown gems
            g.fillStyle(0xff2222, 0.8);
            g.fillCircle(s, s * -0.25 + b, 3);
            g.fillStyle(0xffffff, 0.4);
            g.fillCircle(s - 1, s * -0.26 + b, 1);
            // Giant tusks
            g.fillStyle(0xeeeecc);
            g.fillTriangle(s * 0.6, s * 0.4 + b, s * 0.35, s * 0.85 + b, s * 0.8, s * 0.4 + b);
            g.fillTriangle(s * 1.4, s * 0.4 + b, s * 1.2, s * 0.4 + b, s * 1.65, s * 0.85 + b);
            g.lineStyle(1, 0xcccc99, 0.5);
            g.beginPath(); g.moveTo(s * 0.6, s * 0.4 + b); g.lineTo(s * 0.35, s * 0.85 + b); g.lineTo(s * 0.8, s * 0.4 + b); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.4, s * 0.4 + b); g.lineTo(s * 1.65, s * 0.85 + b); g.lineTo(s * 1.2, s * 0.4 + b); g.strokePath();
            // Eyes
            this._glowEyes(g, s * 0.75, s * 0.25 + b, s * 1.25, s * 0.25 + b, 0xff5500, 4);
            // Brow
            g.lineStyle(2.5, 0x3a1a00, 0.8);
            g.beginPath(); g.moveTo(s * 0.55, s * 0.17 + b); g.lineTo(s * 0.8, s * 0.2 + b); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.45, s * 0.17 + b); g.lineTo(s * 1.2, s * 0.2 + b); g.strokePath();
            // Arms (massive) - arms swing slightly
            const armSwing = Math.sin(frame * Math.PI / 2) * 2;
            this._outlinedRect(g, s * -0.15, s * 0.5 + armSwing, s * 0.4, s, 0x4a2a0a, 0x2a1a00, 5);
            this._outlinedRect(g, s * 1.75, s * 0.5 - armSwing, s * 0.4, s, 0x4a2a0a, 0x2a1a00, 5);
            // Fists
            this._outlinedCircle(g, s * 0.05, s * 1.5 + armSwing, s * 0.22, 0x5a3a1a, 0x2a1a00);
            this._outlinedCircle(g, s * 1.95, s * 1.5 - armSwing, s * 0.22, 0x5a3a1a, 0x2a1a00);
            // Arm bands
            g.fillStyle(0x8b6914, 0.6);
            g.fillRect(s * -0.1, s * 0.65 + armSwing, s * 0.3, 4);
            g.fillRect(s * 1.8, s * 0.65 - armSwing, s * 0.3, 4);
        });

        // Beru - Ant King
        this._createBossSprite(scene, 'beru', BOSS_TYPES.beru, (g, s, frame, breathe) => {
            const b = breathe;
            const wingFlap = Math.sin(frame * Math.PI / 2) * 0.08;
            // Wings (behind body) - flutter animation
            g.fillStyle(0x880044, 0.25);
            g.fillEllipse(s * 0.15, s * 0.6 + b, s * (0.65 + wingFlap), s * (1.05 - wingFlap));
            g.fillEllipse(s * 1.85, s * 0.6 + b, s * (0.65 + wingFlap), s * (1.05 - wingFlap));
            g.lineStyle(1, 0x660033, 0.3);
            g.strokeEllipse(s * 0.15, s * 0.6 + b, s * (0.65 + wingFlap), s * (1.05 - wingFlap));
            g.strokeEllipse(s * 1.85, s * 0.6 + b, s * (0.65 + wingFlap), s * (1.05 - wingFlap));
            // Wing veins
            g.lineStyle(0.5, 0xaa0055, 0.2);
            g.beginPath(); g.moveTo(s * 0.15, s * 0.3 + b); g.lineTo(s * 0.15, s * 1.1 + b); g.strokePath();
            g.beginPath(); g.moveTo(s * 1.85, s * 0.3 + b); g.lineTo(s * 1.85, s * 1.1 + b); g.strokePath();
            // Thorax
            g.fillStyle(0x440022);
            g.fillEllipse(s, s * 1.3, s * 0.9, s * 0.7);
            g.lineStyle(1, 0x330011, 0.6);
            g.strokeEllipse(s, s * 1.3, s * 0.9, s * 0.7);
            // Abdomen
            this._outlinedRect(g, s * 0.35, s * 0.35 + b, s * 1.3, s * 1.0, 0x550033, 0x330016, 8);
            // Chitin shading
            g.fillStyle(0x660044, 0.3);
            g.fillRect(s * 0.4, s * 0.4 + b, s * 0.4, s * 0.9);
            // Head
            this._outlinedCircle(g, s, s * 0.3 + b, s * 0.42, 0x660033, 0x330016);
            // Mandibles (large, sharp) - snap animation
            const mandibleSnap = Math.sin(frame * Math.PI / 2) * 0.03;
            g.fillStyle(0xaa0044);
            g.fillTriangle(s * (0.45 - mandibleSnap), s * 0.4 + b, s * (0.15 - mandibleSnap), s * 0.75 + b, s * 0.7, s * 0.55 + b);
            g.fillTriangle(s * (1.55 + mandibleSnap), s * 0.4 + b, s * (1.85 + mandibleSnap), s * 0.75 + b, s * 1.3, s * 0.55 + b);
            g.lineStyle(1, 0x880033, 0.6);
            g.beginPath(); g.moveTo(s * (0.45 - mandibleSnap), s * 0.4 + b); g.lineTo(s * (0.15 - mandibleSnap), s * 0.75 + b); g.lineTo(s * 0.7, s * 0.55 + b); g.strokePath();
            g.beginPath(); g.moveTo(s * (1.55 + mandibleSnap), s * 0.4 + b); g.lineTo(s * (1.85 + mandibleSnap), s * 0.75 + b); g.lineTo(s * 1.3, s * 0.55 + b); g.strokePath();
            // Eyes (multiple, glowing pink)
            this._glowEyes(g, s * 0.75, s * 0.22 + b, s * 1.25, s * 0.22 + b, 0xff0066, 4);
            // Secondary eyes
            g.fillStyle(0xff0044, 0.7);
            g.fillCircle(s * 0.63, s * 0.33 + b, 2.5);
            g.fillCircle(s * 1.37, s * 0.33 + b, 2.5);
            // Chitin armor plates
            g.fillStyle(0x770044, 0.4);
            g.fillRect(s * 0.45, s * 0.65 + b, s * 1.1, s * 0.1);
            g.fillRect(s * 0.45, s * 0.85 + b, s * 1.1, s * 0.1);
            g.fillRect(s * 0.45, s * 1.05, s * 1.1, s * 0.1);
            // Legs (6 legs with joints) - leg movement
            const legMove = Math.sin(frame * Math.PI / 2) * 0.05;
            g.lineStyle(3, 0x440022);
            for (let side = -1; side <= 1; side += 2) {
                g.beginPath(); g.moveTo(s, s * 0.6 + b); g.lineTo(s + side * s * (0.7 + legMove), s * 0.4); g.lineTo(s + side * s * (0.95 + legMove), s * 0.25); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 0.8 + b); g.lineTo(s + side * s * 0.8, s * 0.7); g.lineTo(s + side * s * 1.05, s * 0.8); g.strokePath();
                g.beginPath(); g.moveTo(s, s * 1.0); g.lineTo(s + side * s * (0.7 - legMove), s * 1.1); g.lineTo(s + side * s * (0.95 - legMove), s * 1.3); g.strokePath();
            }
        });
    }

    static _createBossSprite(scene, key, config, drawFn) {
        if (this._loadAIBossTexture(scene, key, config)) return;

        // Try external CDN texture first
        const extKey = 'ext_boss_' + key;
        if (scene.textures.exists(extKey)) {
            const s = config.size;
            for (let i = 0; i < 4; i++) {
                this._scaleExtTexture(scene, extKey, 'boss_' + key + '_' + i, s * 2, s * 2);
            }
            return;
        }
        // Fallback: procedural generation
        for (let i = 0; i < 4; i++) {
            const g = scene.make.graphics({ add: false });
            const s = config.size;
            const breathe = Math.sin(i * Math.PI / 2) * 2;
            const auraPulse = 1 + Math.sin(i * Math.PI / 2) * 0.08;

            // Boss glow aura (double layer, pulsing)
            g.fillStyle(config.color, 0.06 + Math.sin(i * Math.PI / 2) * 0.03);
            g.fillCircle(s, s, s * 1.2 * auraPulse);
            g.fillStyle(config.color, 0.12 + Math.sin(i * Math.PI / 2) * 0.04);
            g.fillCircle(s, s, s * 0.9 * auraPulse);

            // Ground shadow
            this._groundShadow(g, s, s * 1.8, s * 0.8, s * 0.15);

            drawFn(g, s, i, breathe);

            // 3D gradient lighting overlay
            this._applyLighting(g, s, s * 0.8, s * 1.0);

            g.generateTexture('boss_' + key + '_' + i, s * 2, s * 2);
            g.destroy();
        }
    }

    static _loadAIBossTexture(scene, key, config) {
        const srcKey = 'ai_boss_' + key;
        if (!scene.textures.exists(srcKey)) return false;

        try {
            const src = scene.textures.get(srcKey).getSourceImage();
            const s = config.size;
            const frameW = s * 2;
            const frameH = s * 2;
            const fitted = this._fitSourceToFrame(src, frameW, frameH, 1.05, 0.98);

            for (let i = 0; i < 4; i++) {
                const canvas = document.createElement('canvas');
                canvas.width = frameW;
                canvas.height = frameH;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;

                const phase = i * Math.PI / 2;
                const breathe = Math.sin(phase);
                const drawW = fitted.w * (1 + Math.abs(breathe) * 0.02);
                const drawH = fitted.h * (1 - Math.abs(breathe) * 0.012);
                const x = frameW / 2;
                const y = frameH * 0.98 + breathe * Math.max(1, s * 0.025);

                const aura = ctx.createRadialGradient(x, frameH * 0.62, 0, x, frameH * 0.62, s * 1.25);
                aura.addColorStop(0, 'rgba(123, 47, 255, 0.23)');
                aura.addColorStop(0.45, 'rgba(80, 20, 160, 0.10)');
                aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = aura;
                ctx.fillRect(0, 0, frameW, frameH);

                const shadow = ctx.createRadialGradient(x, frameH * 0.9, 0, x, frameH * 0.9, s * 0.95);
                shadow.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
                shadow.addColorStop(0.55, 'rgba(30, 0, 60, 0.18)');
                shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = shadow;
                ctx.beginPath();
                ctx.ellipse(x, frameH * 0.9, s * 0.92, s * 0.18, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.globalAlpha = 0.58;
                ctx.filter = 'blur(4px)';
                ctx.drawImage(src, x - drawW / 2, y - drawH, drawW, drawH);
                ctx.globalCompositeOperation = 'source-in';
                ctx.fillStyle = 'rgba(123, 47, 255, 0.24)';
                ctx.fillRect(0, 0, frameW, frameH);
                ctx.restore();

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.sin(phase) * 0.025);
                ctx.filter = 'drop-shadow(0 3px 3px rgba(0,0,0,0.72)) contrast(1.05) saturate(1.06)';
                ctx.drawImage(src, -drawW / 2, -drawH, drawW, drawH);
                ctx.restore();

                if (scene.textures.exists('boss_' + key + '_' + i)) {
                    scene.textures.remove('boss_' + key + '_' + i);
                }
                scene.textures.addCanvas('boss_' + key + '_' + i, canvas);
            }
            return true;
        } catch (e) {
            console.warn('[SpriteFactory] AI boss texture failed:', key, e);
            return false;
        }
    }

    // =============================================
    //  PROJECTILE TEXTURES
    // =============================================
    static createProjectileTextures(scene) {
        // Shadow Dagger (32x64 — 고퀄리티 투척용 단검)
        const dg = scene.make.graphics({ add: false });
        const cx = 16;

        // 외곽 보라 오라 (3단 그라데이션)
        dg.fillStyle(COLORS.SHADOW_PRIMARY, 0.08);
        dg.fillEllipse(cx, 32, 22, 58);
        dg.fillStyle(COLORS.SHADOW_GLOW, 0.12);
        dg.fillEllipse(cx, 30, 14, 48);
        dg.fillStyle(COLORS.SHADOW_GLOW, 0.18);
        dg.fillEllipse(cx, 24, 8, 38);

        // 블레이드 외곽 (leaf 형태, 다크 엣지)
        dg.fillStyle(0x15101e, 0.95);
        dg.beginPath();
        dg.moveTo(cx, 3);          // 팁
        dg.lineTo(cx + 5, 14);
        dg.lineTo(cx + 6, 27);     // 가장 넓은 지점
        dg.lineTo(cx + 4, 37);
        dg.lineTo(cx - 4, 37);
        dg.lineTo(cx - 6, 27);
        dg.lineTo(cx - 5, 14);
        dg.closePath();
        dg.fillPath();

        // 블레이드 좌반부 (그림자면)
        dg.fillStyle(0x555968, 0.95);
        dg.beginPath();
        dg.moveTo(cx, 4);
        dg.lineTo(cx - 4.5, 14);
        dg.lineTo(cx - 5.5, 27);
        dg.lineTo(cx - 3.5, 37);
        dg.lineTo(cx, 37);
        dg.closePath();
        dg.fillPath();

        // 블레이드 우반부 (광택면 — 실버)
        dg.fillStyle(0xced6e2, 1);
        dg.beginPath();
        dg.moveTo(cx, 4);
        dg.lineTo(cx + 4.5, 14);
        dg.lineTo(cx + 5.5, 27);
        dg.lineTo(cx + 3.5, 37);
        dg.lineTo(cx, 37);
        dg.closePath();
        dg.fillPath();

        // 광택 하이라이트 (폴리시드 글림)
        dg.fillStyle(0xf0f4fa, 0.7);
        dg.beginPath();
        dg.moveTo(cx + 0.5, 6);
        dg.lineTo(cx + 2.5, 22);
        dg.lineTo(cx + 2, 33);
        dg.lineTo(cx + 1, 36);
        dg.lineTo(cx + 0.5, 36);
        dg.closePath();
        dg.fillPath();

        // 중앙 리지 (밝은 세로 라인)
        dg.lineStyle(1, 0xffffff, 0.9);
        dg.lineBetween(cx, 5, cx, 36);

        // 우측 면도날 엣지 하이라이트
        dg.lineStyle(0.7, 0xffffff, 0.8);
        dg.beginPath();
        dg.moveTo(cx + 0.3, 5);
        dg.lineTo(cx + 4.8, 27);
        dg.lineTo(cx + 3.3, 36);
        dg.strokePath();

        // 좌측 엣지 라인 (은은)
        dg.lineStyle(0.5, 0xaab0c0, 0.55);
        dg.beginPath();
        dg.moveTo(cx - 0.3, 5);
        dg.lineTo(cx - 4.8, 27);
        dg.lineTo(cx - 3.3, 36);
        dg.strokePath();

        // 팁 스파클
        dg.fillStyle(COLORS.SHADOW_GLOW, 0.55);
        dg.fillCircle(cx, 3, 4);
        dg.fillStyle(0xffffff, 0.9);
        dg.fillCircle(cx, 3, 1.8);
        dg.fillStyle(0xffffff, 0.5);
        dg.fillCircle(cx + 0.5, 2.5, 0.8);

        // 크로스가드 베이스 (다크)
        dg.fillStyle(0x10101a);
        dg.fillRoundedRect(cx - 8, 37, 16, 4, 1);
        // 크로스가드 상단면 (금속)
        dg.fillStyle(0x8890a0);
        dg.fillRect(cx - 7.5, 37.3, 15, 1.5);
        // 하이라이트
        dg.fillStyle(0xf0f4fa, 0.75);
        dg.fillRect(cx - 7, 37.4, 14, 0.5);
        // 보라 언더글로우
        dg.fillStyle(COLORS.SHADOW_GLOW, 0.35);
        dg.fillRect(cx - 7, 40, 14, 0.8);
        // 양끝 캡 (구체)
        dg.fillStyle(0x666880);
        dg.fillCircle(cx - 8, 39, 1.8);
        dg.fillCircle(cx + 8, 39, 1.8);
        dg.fillStyle(0xddddee, 0.6);
        dg.fillCircle(cx - 8.2, 38.5, 0.8);
        dg.fillCircle(cx + 7.8, 38.5, 0.8);

        // 핸들 베이스 (다크 가죽 랩)
        dg.fillStyle(0x17122a);
        dg.fillRect(cx - 3, 41, 6, 18);
        // 랩 바인딩 라인 (교차 패턴)
        dg.fillStyle(0x000000, 0.55);
        for (let y = 43; y < 59; y += 3) {
            dg.fillRect(cx - 3, y, 6, 0.8);
        }
        // 랩 하이라이트
        dg.fillStyle(0x4a3a6a, 0.5);
        for (let y = 43.8; y < 59; y += 3) {
            dg.fillRect(cx - 3, y, 6, 0.3);
        }
        // 좌측 섀도우
        dg.fillStyle(0x000000, 0.45);
        dg.fillRect(cx - 3, 41, 1.2, 18);
        // 우측 보라 림라이트
        dg.fillStyle(COLORS.SHADOW_GLOW, 0.3);
        dg.fillRect(cx + 1.8, 41, 1.2, 18);

        // 포멜 (자주색 젬 박힌 라운드 캡)
        dg.fillStyle(0x10101a);
        dg.fillCircle(cx, 60, 4);
        dg.fillStyle(0x889099);
        dg.fillCircle(cx, 60, 3.3);
        dg.fillStyle(0xddddee, 0.75);
        dg.fillCircle(cx - 0.9, 59.2, 1.1);
        // 젬
        dg.fillStyle(COLORS.SHADOW_PRIMARY);
        dg.fillCircle(cx, 60.3, 1.7);
        dg.fillStyle(COLORS.SHADOW_GLOW, 0.95);
        dg.fillCircle(cx - 0.35, 60, 0.9);
        dg.fillStyle(0xffffff, 0.8);
        dg.fillCircle(cx - 0.6, 59.7, 0.4);

        dg.generateTexture('proj_dagger', 32, 64);
        dg.destroy();

        // Close-range stab dagger: longer, narrower, and easier to read during a thrust.
        const stabDg = scene.make.graphics({ add: false });
        const scx = 19;

        stabDg.fillStyle(COLORS.SHADOW_PRIMARY, 0.08);
        stabDg.fillEllipse(scx, 40, 24, 78);
        stabDg.fillStyle(COLORS.SHADOW_GLOW, 0.16);
        stabDg.fillEllipse(scx, 31, 12, 62);

        stabDg.fillStyle(0x0b0912, 0.98);
        stabDg.beginPath();
        stabDg.moveTo(scx, 2);
        stabDg.lineTo(scx + 8, 20);
        stabDg.lineTo(scx + 6.5, 49);
        stabDg.lineTo(scx + 3, 58);
        stabDg.lineTo(scx - 3, 58);
        stabDg.lineTo(scx - 6.5, 49);
        stabDg.lineTo(scx - 8, 20);
        stabDg.closePath();
        stabDg.fillPath();

        stabDg.fillStyle(0x596171, 1);
        stabDg.beginPath();
        stabDg.moveTo(scx, 4);
        stabDg.lineTo(scx - 6, 21);
        stabDg.lineTo(scx - 4.5, 49);
        stabDg.lineTo(scx, 57);
        stabDg.closePath();
        stabDg.fillPath();

        stabDg.fillStyle(0xdce6f1, 1);
        stabDg.beginPath();
        stabDg.moveTo(scx, 4);
        stabDg.lineTo(scx + 6, 21);
        stabDg.lineTo(scx + 4.5, 49);
        stabDg.lineTo(scx, 57);
        stabDg.closePath();
        stabDg.fillPath();

        stabDg.fillStyle(0xf8fbff, 0.72);
        stabDg.beginPath();
        stabDg.moveTo(scx + 0.6, 6);
        stabDg.lineTo(scx + 2.8, 26);
        stabDg.lineTo(scx + 2.1, 48);
        stabDg.lineTo(scx + 0.6, 55);
        stabDg.closePath();
        stabDg.fillPath();

        stabDg.lineStyle(1, 0xffffff, 0.92);
        stabDg.lineBetween(scx, 5, scx, 56);
        stabDg.lineStyle(1, 0xb4bfce, 0.62);
        stabDg.lineBetween(scx - 5.7, 22, scx - 3, 55);
        stabDg.lineStyle(1, 0xffffff, 0.72);
        stabDg.lineBetween(scx + 5.7, 22, scx + 3, 55);

        stabDg.fillStyle(0xffffff, 0.92);
        stabDg.fillCircle(scx, 3.5, 2.2);
        stabDg.fillStyle(COLORS.SHADOW_GLOW, 0.5);
        stabDg.fillCircle(scx, 4, 4.5);

        stabDg.fillStyle(0x090911, 1);
        stabDg.fillRoundedRect(scx - 13, 58, 26, 5, 1.5);
        stabDg.fillStyle(0xb8c1d0, 0.9);
        stabDg.fillRoundedRect(scx - 11, 58.4, 22, 1.8, 1);
        stabDg.fillStyle(COLORS.SHADOW_GLOW, 0.35);
        stabDg.fillRoundedRect(scx - 9, 62, 18, 1.1, 1);
        stabDg.fillStyle(0x6d7485, 1);
        stabDg.fillCircle(scx - 13, 60.5, 2.1);
        stabDg.fillCircle(scx + 13, 60.5, 2.1);

        stabDg.fillStyle(0x171126, 1);
        stabDg.fillRoundedRect(scx - 4, 64, 8, 14, 2);
        stabDg.fillStyle(0x050408, 0.55);
        for (let y = 66; y < 78; y += 3) {
            stabDg.fillRect(scx - 4, y, 8, 0.8);
        }
        stabDg.fillStyle(COLORS.SHADOW_GLOW, 0.28);
        stabDg.fillRect(scx + 2, 64.5, 1.4, 13);

        stabDg.fillStyle(0x090911, 1);
        stabDg.fillCircle(scx, 79, 4.5);
        stabDg.fillStyle(0x9ba4b2, 0.95);
        stabDg.fillCircle(scx, 79, 3.4);
        stabDg.fillStyle(COLORS.SHADOW_GLOW, 0.9);
        stabDg.fillCircle(scx - 0.6, 78.4, 1.5);

        stabDg.generateTexture('proj_dagger_stab', 38, 82);
        stabDg.destroy();

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

        // Dark Mage projectile (RED/ORANGE — enemy attack, distinct from player purple)
        const mg = scene.make.graphics({ add: false });
        mg.fillStyle(0xff2200, 0.25);
        mg.fillCircle(8, 8, 8);
        mg.fillStyle(0xff3300, 0.9);
        mg.fillCircle(8, 8, 6);
        mg.fillStyle(0xff6622, 0.7);
        mg.fillCircle(8, 8, 4);
        mg.fillStyle(0xffcc44, 0.6);
        mg.fillCircle(8, 8, 2.5);
        mg.fillStyle(0xffffff, 0.5);
        mg.fillCircle(7, 6, 1.5);
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
            // Try external CDN texture first
            const extKey = 'ext_shadow_' + type;
            const s = sizes[idx];
            if (scene.textures.exists(extKey)) {
                this._scaleExtTexture(scene, extKey, 'shadow_' + type, s, s);
                return;
            }
            // Fallback: procedural generation
            const g = scene.make.graphics({ add: false });
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

            // 3D gradient lighting
            this._applyLighting(g, half, half * 0.7, half * 0.8);

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
            magnet: 0x66ccff,
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

    // ===== Particle textures =====
    static _createParticleTextures(scene) {
        // Soft circle particle (8x8)
        let g = scene.make.graphics({ add: false });
        g.fillStyle(0xffffff, 1);
        g.fillCircle(4, 4, 4);
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(4, 4, 3);
        g.generateTexture('particle_circle', 8, 8);
        g.destroy();

        // Soft glow particle (16x16) - radial gradient effect
        g = scene.make.graphics({ add: false });
        for (let r = 8; r > 0; r--) {
            const alpha = (1 - r / 8) * 0.8;
            g.fillStyle(0xffffff, alpha);
            g.fillCircle(8, 8, r);
        }
        g.generateTexture('particle_glow', 16, 16);
        g.destroy();

        // Spark particle (8x8) - diamond shape
        g = scene.make.graphics({ add: false });
        g.fillStyle(0xffffff, 1);
        g.fillTriangle(4, 0, 8, 4, 4, 8);
        g.fillTriangle(4, 0, 0, 4, 4, 8);
        g.fillStyle(0xffffff, 0.6);
        g.fillCircle(4, 4, 2);
        g.generateTexture('particle_spark', 8, 8);
        g.destroy();

        // Smoke particle (12x12) - soft blob
        g = scene.make.graphics({ add: false });
        for (let r = 6; r > 0; r--) {
            g.fillStyle(0xffffff, (1 - r / 6) * 0.4);
            g.fillCircle(6, 6, r);
        }
        g.generateTexture('particle_smoke', 12, 12);
        g.destroy();

        // Ring particle (16x16)
        g = scene.make.graphics({ add: false });
        g.lineStyle(2, 0xffffff, 0.8);
        g.strokeCircle(8, 8, 6);
        g.lineStyle(1, 0xffffff, 0.4);
        g.strokeCircle(8, 8, 7);
        g.generateTexture('particle_ring', 16, 16);
        g.destroy();

        // Vignette overlay texture (512x512, purple-tinted torch light around center)
        // Wider gradient + stronger edges = "player carries a torch in dungeon" feel
        try {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.62);
            gradient.addColorStop(0,    'rgba(0,0,0,0)');
            gradient.addColorStop(0.35, 'rgba(10,5,30,0.12)');
            gradient.addColorStop(0.6,  'rgba(18,8,48,0.55)');
            gradient.addColorStop(0.85, 'rgba(8,2,22,0.88)');
            gradient.addColorStop(1,    'rgba(2,0,10,0.97)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);
            scene.textures.addCanvas('vignette', canvas);
        } catch (e) { /* vignette texture failed */ }
    }
}
