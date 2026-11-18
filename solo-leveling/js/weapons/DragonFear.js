import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class DragonFear extends WeaponBase {
    constructor(scene, player, config = WEAPONS.dragonFear) {
        super(scene, player, config);
        this.auraSprite = null;
    }

    fire() { var __oc0, __oc1, __oc2, __oc3, __oc4, __oc5, __oc6, __oc7, __oc8, __oc9, __oc13;
        const range = (this.config.auraRange || 230) + this.extraRange;
        const slowAmount = Math.max(0.1, (((__oc0 = this.config.slowMultiplier) !== null && __oc0 !== void 0 ? __oc0 : 0.4)) - this.extraSlow);
        const auraDuration = this.config.auraDuration || 2000;
        if (this.player.playAttackMotion) {
            const dirAngles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
            const facingAngle = (((__oc1 = dirAngles[this.player.facingDirection]) !== null && __oc1 !== void 0 ? __oc1 : (this.player.facingRight ? 0 : Math.PI)));
            const angle = this.player.moveIntensity > 0.12
                ? this.player.lastMoveAngle
                : facingAngle;
            const variantMotion = (((__oc3 = (__oc2 = this.player.character) === null || __oc2 === void 0 ? void 0 : __oc2.basicAttackVariants) === null || __oc3 === void 0 ? void 0 : __oc3[0]));
            this.player.playAttackMotion(angle, this.config.motionDuration || 280, 1, variantMotion);
        }

        // Visual aura effect (이전 트윈 확실히 정리)
        if (this.auraSprite) {
            this.scene.tweens.killTweensOf(this.auraSprite);
            this.auraSprite.destroy();
        }
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && this.scene.textures.exists('effect_dragon_fear');
        const visualTexture = effectTexture || (useEffectAsset ? 'effect_dragon_fear' : null);
        const fittedScale = (useCharacterEffect || useEffectAsset)
            ? this.getEffectScaleForVisibleSize(visualTexture, range * 2)
            : { x: range / 60, y: range / 60 };
        const targetScaleX = fittedScale.x;
        const targetScaleY = fittedScale.y;
        this.auraSprite = this.createEffectSprite(
            this.player.x,
            this.player.y,
            effectTexture || (useEffectAsset ? 'effect_dragon_fear' : 'proj_fear'),
            { frameMs: Math.max(48, Math.round(auraDuration / 6)) },
        )
            .setDepth(3)
            .setAlpha(0)
            .setBlendMode((useCharacterEffect || useEffectAsset) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        const startRatio = this.config.smoothVisual ? (((__oc4 = this.config.visualStartScaleRatio) !== null && __oc4 !== void 0 ? __oc4 : 0.55)) : 1;
        this.auraSprite.setScale(targetScaleX * startRatio, targetScaleY * startRatio);
        const auraSprite = this.auraSprite;

        if (this.config.smoothVisual) {
            const fadeInDuration = (((__oc5 = this.config.visualFadeInDuration) !== null && __oc5 !== void 0 ? __oc5 : 320));
            const fadeOutDuration = (((__oc6 = this.config.visualFadeOutDuration) !== null && __oc6 !== void 0 ? __oc6 : 430));
            const holdDuration = Math.max(0, auraDuration - fadeInDuration - fadeOutDuration);
            this.scene.tweens.add({
                targets: auraSprite,
                alpha: (((__oc7 = this.config.visualPeakAlpha) !== null && __oc7 !== void 0 ? __oc7 : ((useCharacterEffect || useEffectAsset) ? 0.76 : 0.58))),
                scaleX: targetScaleX * (((__oc8 = this.config.visualPeakScaleRatio) !== null && __oc8 !== void 0 ? __oc8 : 1)),
                scaleY: targetScaleY * (((__oc9 = this.config.visualPeakScaleRatio) !== null && __oc9 !== void 0 ? __oc9 : 1)),
                duration: fadeInDuration,
                ease: 'Sine.easeOut',
                onComplete: () => { var __oc10, __oc11, __oc12;
                    this.scene.tweens.add({
                        targets: auraSprite,
                        alpha: 0,
                        scaleX: targetScaleX * (((__oc10 = this.config.visualEndScaleRatio) !== null && __oc10 !== void 0 ? __oc10 : 1.22)),
                        scaleY: targetScaleY * (((__oc11 = this.config.visualEndScaleRatio) !== null && __oc11 !== void 0 ? __oc11 : 1.22)),
                        duration: fadeOutDuration,
                        delay: (((__oc12 = this.config.visualHoldDuration) !== null && __oc12 !== void 0 ? __oc12 : holdDuration)),
                        ease: 'Sine.easeInOut',
                        onComplete: () => {
                            if (((auraSprite === null || auraSprite === void 0 ? void 0 : auraSprite.active))) auraSprite.destroy();
                            if (this.auraSprite === auraSprite) {
                                this.auraSprite = null;
                            }
                        },
                    });
                },
            });
        } else {
            this.scene.tweens.add({
                targets: auraSprite,
                alpha: (useCharacterEffect || useEffectAsset) ? 0.82 : 0.6,
                duration: 200,
            });

            this.scene.tweens.add({
                targets: auraSprite,
                alpha: 0,
                scaleX: targetScaleX * 1.3,
                scaleY: targetScaleY * 1.3,
                duration: Math.max(500, auraDuration - 500),
                delay: 500,
                onComplete: () => {
                    if (((auraSprite === null || auraSprite === void 0 ? void 0 : auraSprite.active))) auraSprite.destroy();
                    if (this.auraSprite === auraSprite) {
                        this.auraSprite = null;
                    }
                },
            });
        }

        this.playConfiguredSound('fear');

        this.healPlayerFromConfig();

        this._auraEndTime = this.scene.time.now + auraDuration;
        this._auraRange = range;
        this._auraSlowAmount = slowAmount;

        // Apply damage & slow to enemies currently in range
        this._damageEnemiesInAura(range, slowAmount, auraDuration, (((__oc13 = this.config.damageMult) !== null && __oc13 !== void 0 ? __oc13 : 1)));

        const tickCount = Math.max(0, this.config.tickCount || 0);
        const tickInterval = this.config.tickInterval || 600;
        for (let i = 0; i < tickCount; i++) {
            this._delay((i + 1) * tickInterval, () => { var __oc14, __oc15, __oc16, __oc17;
                if (!(((__oc15 = (__oc14 = this.scene) === null || __oc14 === void 0 ? void 0 : __oc14.scene) === null || __oc15 === void 0 ? void 0 : __oc15.isActive())) || !(((__oc16 = this.player) === null || __oc16 === void 0 ? void 0 : __oc16.active))) return;
                const remaining = Math.max(300, this._auraEndTime - this.scene.time.now);
                this._damageEnemiesInAura(range, slowAmount, remaining, (((__oc17 = this.config.tickDamageMult) !== null && __oc17 !== void 0 ? __oc17 : 0.35)));
            });
        }
    }

    _damageEnemiesInAura(range, slowAmount, slowDuration, damageMult) {
        const enemies = this.player.getAllEnemies();
        const damage = Math.floor(this.getDamage() * damageMult);
        for (const enemy of enemies) {
            if (!enemy.active) continue;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            if (dist < range) {
                if (damage > 0) this.applyDamage(enemy, damage, this.player.x, this.player.y);
                if (enemy.applySlow) enemy.applySlow(slowAmount, slowDuration);
            }
        }
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.auraSprite && this.auraSprite.active) {
            this.auraSprite.setPosition(this.player.x, this.player.y);

            if (this._auraEndTime && this.scene.time.now < this._auraEndTime) {
                const remaining = this._auraEndTime - this.scene.time.now;
                const enemies = this.player.getAllEnemies();
                for (const enemy of enemies) {
                    if (!enemy.active) continue;
                    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                    if (dist < this._auraRange) {
                        if (enemy.applySlow) enemy.applySlow(this._auraSlowAmount, remaining);
                    }
                }
            }
        }
    }

    destroy() { var __oc18;
        if (this.auraSprite) {
            if ((((__oc18 = this.scene) === null || __oc18 === void 0 ? void 0 : __oc18.tweens))) this.scene.tweens.killTweensOf(this.auraSprite);
            this.auraSprite.destroy();
            this.auraSprite = null;
        }
        super.destroy();
    }
}
