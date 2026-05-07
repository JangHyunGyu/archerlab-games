import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class ShadowSlash extends WeaponBase {
    constructor(scene, player, config = WEAPONS.shadowSlash) {
        super(scene, player, config);
        this.slashGroup = scene.physics.add.group();
        this._gfxPool = [];
        this._activeGfx = new Set();
        this._activeTweens = new Set();
    }

    _getGfx() {
        let gfx = this._gfxPool.pop();
        if (!gfx || !gfx.scene) {
            gfx = this.scene.add.graphics().setDepth(8);
        } else {
            gfx.clear();
            gfx.setVisible(true);
            gfx.setAlpha(1);
        }
        this._activeGfx.add(gfx);
        return gfx;
    }

    _releaseGfx(gfx) {
        this._activeGfx.delete(gfx);
        gfx.clear();
        gfx.setVisible(false);
        if (this._gfxPool.length < 10) {
            this._gfxPool.push(gfx);
        } else {
            gfx.destroy();
        }
    }

    fire() {
        if (this.config.slashMode === 'linePierce') {
            for (let i = 0; i < this.count; i++) {
                this._delay(i * (this.config.patternDelay ?? 140), () => this._doLinePierce());
            }
            return;
        }

        if (this.config.slashMode === 'radialPulse') {
            for (let i = 0; i < this.count; i++) {
                this._delay(i * 180, () => this._doRadialPulse());
            }
            return;
        }

        const configuredOffsets = Array.isArray(this.config.arcOffsets) ? this.config.arcOffsets : null;
        const patternOffsets = configuredOffsets || Array.from(
            { length: this.count },
            (_, i) => this.count > 1 ? (i - (this.count - 1) / 2) * 0.8 : 0
        );
        const repeats = configuredOffsets ? this.count : 1;
        let sequence = 0;

        for (let r = 0; r < repeats; r++) {
            for (const angleOffset of patternOffsets) {
                this._delay(sequence * 120, () => this._doSlash(angleOffset));
                sequence++;
            }
        }
    }

    _doSlash(angleOffset) {
        const target = this.player.getClosestEnemy((this.config.acquireRange || 360) + this.extraRange);
        let angle;
        if (target) {
            angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        } else {
            angle = this.player.facingRight ? 0 : Math.PI;
        }
        angle += angleOffset;

        const range = (this.config.slashRange || 350) + this.extraRange;
        const slashDist = range * (this.config.slashDistanceRatio ?? 0.45);
        const slashX = this.player.x + Math.cos(angle) * slashDist;
        const slashY = this.player.y + Math.sin(angle) * slashDist;

        // Single graphics object for all arc layers (pooled)
        const gfx = this._getGfx();
        const px = this.player.x;
        const py = this.player.y;
        const arcRadius = range;
        const darkColor = this.getEffectDarkColor(0x4400aa);
        const color = this.getEffectColor(0x9944dd);
        const glowColor = this.getEffectGlowColor(0xddaaff);
        const arcHalf = this.config.slashArc ?? 0.8;

        let progress = { t: 0 };
        let arcTween = null;
        arcTween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 280,
            ease: 'Power2',
            onUpdate: () => {
                gfx.clear();

                const curAngle = Phaser.Math.Linear(angle - arcHalf, angle + arcHalf, progress.t);
                const prevAngle = Phaser.Math.Linear(angle - arcHalf, angle + arcHalf, Math.max(0, progress.t - 0.35));

                // Outer glow aura (wide, faint)
                gfx.lineStyle(22, darkColor, 0.12 * (1 - progress.t));
                gfx.beginPath();
                gfx.arc(px, py, arcRadius + 8, prevAngle, curAngle, false);
                gfx.strokePath();

                // Secondary trail (energy afterimage)
                gfx.lineStyle(14, color, 0.25 * (1 - progress.t));
                gfx.beginPath();
                gfx.arc(px, py, arcRadius, prevAngle, curAngle, false);
                gfx.strokePath();

                // Inner energy trail (brighter)
                gfx.lineStyle(6, color, 0.4 * (1 - progress.t * 0.5));
                gfx.beginPath();
                gfx.arc(px, py, arcRadius - 4, prevAngle, curAngle, false);
                gfx.strokePath();

                // Main slash arc (bright core)
                const arcStart = Phaser.Math.Linear(angle - arcHalf, angle + arcHalf, Math.max(0, progress.t - 0.15));
                gfx.lineStyle(4, glowColor, 0.95 * (1 - progress.t * 0.3));
                gfx.beginPath();
                gfx.arc(px, py, arcRadius, arcStart, curAngle, false);
                gfx.strokePath();

                // White-hot core line
                gfx.lineStyle(2, 0xffffff, 0.8 * (1 - progress.t * 0.5));
                gfx.beginPath();
                gfx.arc(px, py, arcRadius, arcStart, curAngle, false);
                gfx.strokePath();

                // Glowing tip
                const tipX = px + Math.cos(curAngle) * arcRadius;
                const tipY = py + Math.sin(curAngle) * arcRadius;

                gfx.fillStyle(color, 0.4 * (1 - progress.t * 0.3));
                gfx.fillCircle(tipX, tipY, 12);
                gfx.fillStyle(glowColor, 0.8);
                gfx.fillCircle(tipX, tipY, 6);
                gfx.fillStyle(0xffffff, 0.9);
                gfx.fillCircle(tipX, tipY, 2.5);

                // Shadow energy wisps along trailing edge
                if (progress.t > 0.1 && progress.t < 0.9) {
                    gfx.fillStyle(color, 0.5);
                    for (let w = 0; w < 2; w++) {
                        const wAngle = Phaser.Math.FloatBetween(prevAngle, curAngle);
                        const wR = arcRadius + Phaser.Math.Between(-8, 8);
                        gfx.fillCircle(
                            px + Math.cos(wAngle) * wR,
                            py + Math.sin(wAngle) * wR,
                            Phaser.Math.FloatBetween(1.5, 3)
                        );
                    }
                }

                // Energy radial lines from tip
                if (progress.t > 0.2 && progress.t < 0.7) {
                    for (let r = 0; r < 3; r++) {
                        const lineAngle = curAngle + Phaser.Math.FloatBetween(-0.3, 0.3);
                        const lineLen = Phaser.Math.FloatBetween(15, 35);
                        gfx.lineStyle(1.5, glowColor, 0.6 * (1 - progress.t));
                        gfx.lineBetween(tipX, tipY, tipX + Math.cos(lineAngle) * lineLen, tipY + Math.sin(lineAngle) * lineLen);
                    }
                }
            },
            onComplete: () => {
                this._activeTweens.delete(arcTween);
                this._releaseGfx(gfx);
            },
        });
        this._activeTweens.add(arcTween);

        // Visual-only slash sprite (energy wave projection)
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && this.scene.textures.exists('effect_shadow_slash');
        const slashRotation = useCharacterEffect ? angle : (useEffectAsset ? angle + Math.PI : angle);
        const slash = this.scene.add.sprite(slashX, slashY, effectTexture || (useEffectAsset ? 'effect_shadow_slash' : 'proj_slash'))
            .setDepth(8)
            .setRotation(slashRotation)
            .setAlpha((useCharacterEffect || useEffectAsset) ? 0.82 : 0.5)
            .setScale(useCharacterEffect ? (this.config.effectScale || 0.58) + this.extraRange / 520 : (useEffectAsset ? 0.48 + this.extraRange / 460 : 1.5 + this.extraRange / 60))
            .setBlendMode((useCharacterEffect || useEffectAsset) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        if (!useCharacterEffect && !useEffectAsset) slash.setTint(color);

        this.scene.tweens.add({
            targets: slash,
            alpha: 0,
            scaleX: slash.scaleX * ((useCharacterEffect || useEffectAsset) ? 1.28 : 1.8),
            scaleY: slash.scaleY * ((useCharacterEffect || useEffectAsset) ? 1.28 : 1.8),
            duration: (useCharacterEffect || useEffectAsset) ? 320 : 400,
            onComplete: () => slash.destroy(),
        });

        // Afterglow flash at slash center
        const flash = this.scene.add.circle(slashX, slashY, 20, color, 0.4).setDepth(7);
        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            scaleX: 3,
            scaleY: 3,
            duration: 350,
            ease: 'Power2',
            onComplete: () => flash.destroy(),
        });

        // Hit enemies in arc
        const enemies = this.player.getAllEnemies();
        const hitAngle = this.config.hitAngle ?? arcHalf;
        const maxHits = this.config.maxHits ?? Infinity;
        const damage = Math.floor(this.getDamage() * (this.config.damageMult ?? 1));
        let hits = 0;
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
            if (dist > range) continue;

            const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
            const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - angle));
            if (angleDiff < hitAngle) {
                enemy.takeDamage(damage, px, py);
                if (this.config.slowMultiplier !== undefined && enemy.applySlow) {
                    enemy.applySlow(this.config.slowMultiplier, this.config.slowDuration || 1200);
                }
                hits++;
                if (hits >= maxHits) break;
            }
        }

        if (this.config.aftershockRadius) {
            this._delay(this.config.aftershockDelay || 180, () => {
                if (!this.scene?.scene?.isActive()) return;
                const pulse = this.scene.add.circle(slashX, slashY, this.config.aftershockRadius * 0.35, color, 0.28)
                    .setDepth(7)
                    .setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: pulse,
                    alpha: 0,
                    scale: 2.8,
                    duration: 260,
                    onComplete: () => pulse.destroy(),
                });

                for (const enemy of this.player.getAllEnemies()) {
                    if (!enemy.active) continue;
                    const dist = Phaser.Math.Distance.Between(slashX, slashY, enemy.x, enemy.y);
                    if (dist > this.config.aftershockRadius) continue;
                    enemy.takeDamage(Math.floor(this.getDamage() * (this.config.aftershockDamageMult ?? 0.45)), slashX, slashY);
                }
            });
        }

        // Sound
        this.playConfiguredSound('slash');
    }

    _distanceToLineSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 0) return Phaser.Math.Distance.Between(px, py, ax, ay);
        const t = Phaser.Math.Clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
        return Phaser.Math.Distance.Between(px, py, ax + dx * t, ay + dy * t);
    }

    _doLinePierce() {
        const target = this.player.getClosestEnemy((this.config.acquireRange || 540) + this.extraRange);
        let angle = this.player.facingRight ? 0 : Math.PI;
        if (target) {
            angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        }

        const px = this.player.x;
        const py = this.player.y - 8;
        const range = (this.config.slashRange || 520) + this.extraRange;
        const startX = px + Math.cos(angle) * 24;
        const startY = py + Math.sin(angle) * 24;
        const endX = px + Math.cos(angle) * range;
        const endY = py + Math.sin(angle) * range;
        const midX = (startX + endX) * 0.5;
        const midY = (startY + endY) * 0.5;
        const color = this.getEffectColor(0xffd86a);
        const glowColor = this.getEffectGlowColor(0xffffff);
        const lineWidth = this.config.lineWidth || 34;

        const gfx = this._getGfx();
        const progress = { t: 0 };
        let lineTween = null;
        lineTween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: this.config.motionDuration || 210,
            ease: 'Quad.easeOut',
            onUpdate: () => {
                const reach = Phaser.Math.Easing.Cubic.Out(progress.t);
                const currentX = startX + (endX - startX) * reach;
                const currentY = startY + (endY - startY) * reach;
                gfx.clear();
                gfx.lineStyle(lineWidth, color, 0.18 * (1 - progress.t * 0.35));
                gfx.lineBetween(startX, startY, currentX, currentY);
                gfx.lineStyle(Math.max(7, lineWidth * 0.38), glowColor, 0.72 * (1 - progress.t * 0.25));
                gfx.lineBetween(startX, startY, currentX, currentY);
                gfx.lineStyle(3, 0xffffff, 0.95 * (1 - progress.t * 0.2));
                gfx.lineBetween(startX, startY, currentX, currentY);
                gfx.fillStyle(glowColor, 0.75 * (1 - progress.t * 0.25));
                gfx.fillCircle(currentX, currentY, 8 + 8 * reach);
            },
            onComplete: () => {
                this._activeTweens.delete(lineTween);
                this._releaseGfx(gfx);
            },
        });
        this._activeTweens.add(lineTween);

        const effectTexture = this.getEffectTexture();
        if (effectTexture) {
            const lance = this.scene.add.sprite(midX, midY, effectTexture)
                .setDepth(9)
                .setRotation(angle)
                .setAlpha(0.88)
                .setScale(this.config.effectScale || 0.58)
                .setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: lance,
                alpha: 0,
                scaleX: lance.scaleX * 1.18,
                scaleY: lance.scaleY * 0.74,
                duration: 260,
                ease: 'Quad.easeOut',
                onComplete: () => lance.destroy(),
            });
        }

        const damage = Math.floor(this.getDamage() * (this.config.damageMult ?? 1));
        const maxHits = this.config.maxHits ?? Infinity;
        let hits = 0;
        for (const enemy of this.player.getAllEnemies()) {
            if (!enemy.active) continue;
            const dist = this._distanceToLineSegment(enemy.x, enemy.y, startX, startY, endX, endY);
            if (dist > lineWidth) continue;
            enemy.takeDamage(damage, px, py);
            hits++;
            if (hits >= maxHits) break;
        }

        if (this.player.playAttackMotion) {
            this.player.playAttackMotion(angle, 230, 1);
        }
        this.playConfiguredSound('slash');
    }

    _doRadialPulse() {
        const range = (this.config.slashRange || 280) + this.extraRange;
        const color = this.getEffectColor(0x66f2b0);
        const glowColor = this.getEffectGlowColor(0xe8fff5);
        const px = this.player.x;
        const py = this.player.y;
        const maxHits = this.config.maxHits ?? Infinity;
        const damage = Math.floor(this.getDamage() * (this.config.damageMult ?? 0.85));
        let hits = 0;

        const pulse = this.scene.add.circle(px, py, range * 0.18, color, 0.24)
            .setDepth(7)
            .setBlendMode(Phaser.BlendModes.ADD);
        const ring = this.scene.add.circle(px, py, range * 0.24, glowColor, 0)
            .setDepth(8);
        ring.setStrokeStyle(3, glowColor, 0.85);

        this.scene.tweens.add({
            targets: pulse,
            alpha: 0,
            scale: 5.2,
            duration: 380,
            ease: 'Quad.easeOut',
            onComplete: () => pulse.destroy(),
        });
        this.scene.tweens.add({
            targets: ring,
            alpha: 0,
            scale: 4.2,
            duration: 420,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });

        for (const enemy of this.player.getAllEnemies()) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
            if (dist > range) continue;
            enemy.takeDamage(damage, px, py);
            if (this.config.slowMultiplier !== undefined && enemy.applySlow) {
                enemy.applySlow(this.config.slowMultiplier, this.config.slowDuration || 1500);
            }
            hits++;
            if (hits >= maxHits) break;
        }

        this.playConfiguredSound('slash');
    }

    getProjectileGroup() {
        return this.slashGroup;
    }

    destroy() {
        if (this.scene?.tweens) {
            for (const tween of this._activeTweens) {
                this.scene.tweens.remove(tween);
            }
            for (const gfx of this._activeGfx) {
                this.scene.tweens.killTweensOf(gfx);
            }
        }
        this._activeTweens.clear();

        if (this.slashGroup) this.slashGroup.destroy(true);
        for (const gfx of this._activeGfx) {
            if (gfx && gfx.scene) gfx.destroy();
        }
        this._activeGfx.clear();
        for (const gfx of this._gfxPool) {
            if (gfx && gfx.scene) gfx.destroy();
        }
        this._gfxPool = [];
        this.slashGroup = null;
        super.destroy();
    }
}
