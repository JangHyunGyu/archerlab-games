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
        for (let i = 0; i < this.count; i++) {
            const angleOffset = this.count > 1 ? (i - (this.count - 1) / 2) * 0.8 : 0;
            this._delay(i * 150, () => this._doSlash(angleOffset));
        }
    }

    _doSlash(angleOffset) {
        const target = this.player.getClosestEnemy(360 + this.extraRange);
        let angle;
        if (target) {
            angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        } else {
            angle = this.player.facingRight ? 0 : Math.PI;
        }
        angle += angleOffset;

        const range = 350 + this.extraRange;
        const slashDist = range * 0.45;
        const slashX = this.player.x + Math.cos(angle) * slashDist;
        const slashY = this.player.y + Math.sin(angle) * slashDist;

        // Single graphics object for all arc layers (pooled)
        const gfx = this._getGfx();
        const px = this.player.x;
        const py = this.player.y;
        const arcRadius = range;
        const swingStart = angle - 0.8;
        const swingEnd = angle + 0.8;
        const darkColor = this.getEffectDarkColor(0x4400aa);
        const color = this.getEffectColor(0x9944dd);
        const glowColor = this.getEffectGlowColor(0xddaaff);

        let progress = { t: 0 };
        let arcTween = null;
        arcTween = this.scene.tweens.add({
            targets: progress,
            t: 1,
            duration: 280,
            ease: 'Power2',
            onUpdate: () => {
                gfx.clear();

                const curAngle = Phaser.Math.Linear(swingStart, swingEnd, progress.t);
                const prevAngle = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.35));

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
                const arcStart = Phaser.Math.Linear(swingStart, swingEnd, Math.max(0, progress.t - 0.15));
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

        // Hit enemies in arc (92 degree cone, range 200+)
        const enemies = this.player.getAllEnemies();
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(px, py, enemy.x, enemy.y);
            if (dist > range) continue;

            const enemyAngle = Phaser.Math.Angle.Between(px, py, enemy.x, enemy.y);
            const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - angle));
            if (angleDiff < 0.8) {
                enemy.takeDamage(this.getDamage(), px, py);
            }
        }

        // Sound
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
