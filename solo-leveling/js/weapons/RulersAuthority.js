import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class RulersAuthority extends WeaponBase {
    constructor(scene, player, config = WEAPONS.rulersAuthority) {
        super(scene, player, config);
    }

    fire() { var __oc0;
        const strikeCount = Math.max(1, this.config.strikeCount || 1);
        const strikeDelay = (((__oc0 = this.config.strikeDelay) !== null && __oc0 !== void 0 ? __oc0 : 300));
        let sequence = 0;
        for (let cast = 0; cast < this.count; cast++) {
            for (let strike = 0; strike < strikeCount; strike++) {
                this._delay(sequence * strikeDelay, () => this._blast(strike));
                sequence++;
            }
        }
    }

    _blast(strikeIndex = 0) { var __oc1, __oc2, __oc3, __oc4, __oc5, __oc6, __oc7, __oc8, __oc9, __oc10, __oc11, __oc12, __oc13;
        const range = (this.config.blastRange || 160) + this.extraRange;
        const impactDelay = (((__oc1 = this.config.impactDelay) !== null && __oc1 !== void 0 ? __oc1 : 200));

        this.playConfiguredSound('authority');
        if (strikeIndex === 0) this.healPlayerFromConfig();

        // Find a nearby enemy cluster, or default to player position if no threat is close.
        let targetX = this.player.x;
        let targetY = this.player.y;

        if (this.config.targetMode !== 'self') {
            const enemies = this.player.getAllEnemies();
            const acquireRange = this.config.acquireRange || Math.max(560, range * 3.25);
            const candidates = enemies.filter((enemy) => {
                if (!enemy.active) return false;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                return dist <= acquireRange;
            });

            if (candidates.length > 0) {
                let bestTarget = null;
                let bestScore = -Infinity;
                let bestDist = Infinity;
                for (const enemy of candidates) {
                    const distToPlayer = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                    let score = 0;
                    for (const other of candidates) {
                        const clusterDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, other.x, other.y);
                        if (clusterDist <= range) {
                            score += 1 + (1 - clusterDist / range) * 0.6;
                        }
                    }

                    score -= distToPlayer / acquireRange * 0.12;
                    if (score > bestScore || (score === bestScore && distToPlayer < bestDist)) {
                        bestScore = score;
                        bestDist = distToPlayer;
                        bestTarget = enemy;
                    }
                }

                if (bestTarget) {
                    targetX = bestTarget.x;
                    targetY = bestTarget.y;
                }
            }
        }

        if (this.config.targetMode === 'randomCluster' && strikeIndex > 0) {
            const offsetRadius = this.config.randomOffsetRadius || range;
            const offsetAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const offsetDist = Phaser.Math.FloatBetween(range * 0.25, offsetRadius);
            targetX += Math.cos(offsetAngle) * offsetDist;
            targetY += Math.sin(offsetAngle) * offsetDist;
        }

        if (strikeIndex === 0 && this.player.playAttackMotion) {
            const selfCentered = this.config.targetMode === 'self'
                || (targetX === this.player.x && targetY === this.player.y);
            const dirAngles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
            const facingAngle = (((__oc2 = dirAngles[this.player.facingDirection]) !== null && __oc2 !== void 0 ? __oc2 : (this.player.facingRight ? 0 : Math.PI)));
            const angle = selfCentered
                ? (this.player.moveIntensity > 0.12 ? this.player.lastMoveAngle : facingAngle)
                : Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY);
            const variantMotion = (((__oc4 = (__oc3 = this.player.character) === null || __oc3 === void 0 ? void 0 : __oc3.basicAttackVariants) === null || __oc4 === void 0 ? void 0 : __oc4[0]));
            this.player.playAttackMotion(angle, this.config.motionDuration || 260, 1, variantMotion);
        }

        // Visual effect - expanding circle
        const effectTexture = this.getEffectTexture();
        const useCharacterEffect = !!effectTexture;
        const useEffectAsset = !useCharacterEffect && !this.config.imageOnlyVfx && this.scene.textures.exists('effect_ruler_authority');
        const visualTexture = effectTexture || (useEffectAsset ? 'effect_ruler_authority' : null);
        const fittedScale = (useCharacterEffect || useEffectAsset)
            ? this.getEffectScaleForVisibleSize(visualTexture, range * 2)
            : { x: range / 50, y: range / 50 };
        const targetScaleX = fittedScale.x;
        const targetScaleY = fittedScale.y;
        const impactTweenDuration = Math.max(80, impactDelay);
        const visualPeakDuration = this.config.smoothVisual
            ? (((__oc5 = this.config.visualFadeInDuration) !== null && __oc5 !== void 0 ? __oc5 : 260))
            : impactTweenDuration;
        const effectFrameMs = (((__oc6 = this.config.effectFrameMs) !== null && __oc6 !== void 0 ? __oc6 : Math.max(24, Math.round(visualPeakDuration / 3))));
        const circle = this.createEffectSprite(
            targetX,
            targetY,
            effectTexture || (useEffectAsset ? 'effect_ruler_authority' : 'proj_ruler'),
            {
                frameMs: effectFrameMs,
                loop: (((__oc7 = this.config.effectLoop) !== null && __oc7 !== void 0 ? __oc7 : false)),
                loopStart: (((__oc8 = this.config.effectStartFrame) !== null && __oc8 !== void 0 ? __oc8 : 0)),
                loopEnd: this.config.effectLoopEnd,
            },
        )
            .setDepth(7)
            .setAlpha(0)
            .setBlendMode((useCharacterEffect || useEffectAsset) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        const startRatio = this.config.smoothVisual
            ? (((__oc9 = this.config.visualStartScaleRatio) !== null && __oc9 !== void 0 ? __oc9 : 0.35))
            : ((useCharacterEffect || useEffectAsset) ? 0.08 : 0.2);
        circle.setScale(targetScaleX * startRatio, targetScaleY * startRatio);

        if (this.config.smoothVisual) {
            const peakAlpha = (((__oc10 = this.config.visualPeakAlpha) !== null && __oc10 !== void 0 ? __oc10 : ((useCharacterEffect || useEffectAsset) ? 0.82 : 0.72)));
            const peakRatio = (((__oc11 = this.config.visualPeakScaleRatio) !== null && __oc11 !== void 0 ? __oc11 : 1));
            const endRatio = (((__oc12 = this.config.visualEndScaleRatio) !== null && __oc12 !== void 0 ? __oc12 : 1.16));
            this.scene.tweens.add({
                targets: circle,
                alpha: peakAlpha,
                scaleX: targetScaleX * peakRatio,
                scaleY: targetScaleY * peakRatio,
                duration: (((__oc13 = this.config.visualFadeInDuration) !== null && __oc13 !== void 0 ? __oc13 : 260)),
                ease: 'Sine.easeOut',
                onComplete: () => { var __oc14, __oc15;
                    this.scene.tweens.add({
                        targets: circle,
                        alpha: 0,
                        scaleX: targetScaleX * endRatio,
                        scaleY: targetScaleY * endRatio,
                        duration: (((__oc14 = this.config.visualFadeOutDuration) !== null && __oc14 !== void 0 ? __oc14 : 420)),
                        delay: (((__oc15 = this.config.visualHoldDuration) !== null && __oc15 !== void 0 ? __oc15 : 80)),
                        ease: 'Sine.easeInOut',
                        onComplete: () => circle.destroy(),
                    });
                },
            });
        } else {
            this.scene.tweens.add({
                targets: circle,
                alpha: (useCharacterEffect || useEffectAsset) ? 0.92 : 0.8,
                scaleX: targetScaleX,
                scaleY: targetScaleY,
                duration: impactTweenDuration,
                yoyo: true,
                hold: 100,
                onComplete: () => circle.destroy(),
            });
        }

        if (!this.config.imageOnlyVfx && !useCharacterEffect && !useEffectAsset) {
            // Ground crack effect
            const crack = this.scene.add.circle(targetX, targetY, range * 0.3, this.getEffectColor(COLORS.SHADOW_PRIMARY), 0.3)
                .setDepth(3);
            this.scene.tweens.add({
                targets: crack,
                alpha: 0,
                scale: 2,
                duration: 500,
                onComplete: () => crack.destroy(),
            });
        }

        // Deal damage to enemies in range
        this._delay(impactDelay, () => { var __oc16, __oc17, __oc18;
            if (!(((__oc17 = (__oc16 = this.scene) === null || __oc16 === void 0 ? void 0 : __oc16.scene) === null || __oc17 === void 0 ? void 0 : __oc17.isActive()))) return;
            const damage = Math.floor(this.getDamage() * (((__oc18 = this.config.damageMult) !== null && __oc18 !== void 0 ? __oc18 : 1)));
            const enemies = this.player.getAllEnemies();
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Phaser.Math.Distance.Between(targetX, targetY, enemy.x, enemy.y);
                if (dist <= range) {
                    this.applyDamage(enemy, damage, targetX, targetY);
                    if (this.config.slowMultiplier !== undefined && enemy.applySlow) {
                        enemy.applySlow(this.config.slowMultiplier, this.config.slowDuration || 1800);
                    }
                }
            }
        });
    }

    destroy() {
        super.destroy();
    }

}
