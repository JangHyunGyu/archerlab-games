import { MAX_COOLDOWN_REDUCTION } from '../utils/Constants.js';
import {
    resolveCombatVfxRotation,
    resolveMirroredCombatVfxRotation,
} from '../utils/CombatVfxDirection.js';
import { COMBAT_VFX_CANVAS_SIZE, getCombatVfxVisibleBounds } from '../utils/CombatVfxMetrics.js';

export class WeaponBase {
    constructor(scene, player, config) {
        this.scene = scene;
        this.player = player;
        this.config = config;
        this.key = config.key;
        this.baseWeaponKey = config.baseWeaponKey || config.key;
        this.level = 1;
        this.cooldownTimer = 0;
        this.damage = config.baseDamage;
        this.cooldown = config.baseCooldown;
        this.count = config.baseCount || 1;
        this.extraRange = 0;
        this.extraSlow = 0;
        this._timers = new Set();
        this._effectFrameTimers = new Set();
        this._destroyed = false;
    }

    update(time, delta) {
        const cdReduction = Math.max(0, Math.min(MAX_COOLDOWN_REDUCTION, this.player.stats.cooldownReduction || 0));
        const effectiveCooldown = Math.max(240, this.cooldown * (1 - cdReduction));

        this.cooldownTimer -= delta;
        if (this.cooldownTimer <= 0) {
            this.cooldownTimer = effectiveCooldown;
            this.fire();
        }
    }

    fire() {
        // Override in subclasses
    }

    levelUp() {
        this.level++;
        const bonuses = this.config.levelBonuses[this.level];
        if (bonuses) {
            if (bonuses.damage) this.damage += bonuses.damage;
            if (bonuses.cooldown) this.cooldown += bonuses.cooldown;
            if (bonuses.count) this.count += bonuses.count;
            if (bonuses.range) this.extraRange += bonuses.range;
            if (bonuses.slow) this.extraSlow += bonuses.slow;
        }
    }

    getDamage() {
        const levelMult = 1 + (this.player.level - 1) * 0.04;
        const buffMult = 1 + (this.player._tempAtkBuff || 0);
        let dmg = (this.damage + this.player.stats.attack) * levelMult * buffMult;
        if (Math.random() < this.player.stats.critRate) {
            dmg = Math.floor(dmg * this.player.stats.critDamage);
        }
        return Math.floor(dmg);
    }

    applyDamage(target, amount, x, y) {
        if (!((target === null || target === void 0 ? void 0 : target.takeDamage))) return false;
        return target.takeDamage(amount, x, y, this.config.hitEffect || null);
    }

    healPlayerFromConfig() { var __oc0, __oc1, __oc2, __oc3;
        if (!this.config.healPercent || !(((__oc0 = this.player) === null || __oc0 === void 0 ? void 0 : __oc0.heal))) return 0;

        const now = (((__oc3 = (__oc2 = (__oc1 = this.scene) === null || __oc1 === void 0 ? void 0 : __oc1.time) === null || __oc2 === void 0 ? void 0 : __oc2.now) !== null && __oc3 !== void 0 ? __oc3 : 0));
        const healCooldownMs = this.config.healCooldownMs || 0;
        if (healCooldownMs > 0 && this._lastConfigHealAt !== undefined && now - this._lastConfigHealAt < healCooldownMs) {
            return 0;
        }

        this._lastConfigHealAt = now;
        const amount = Math.max(1, Math.floor(this.player.stats.maxHp * this.config.healPercent));
        return this.player.heal(amount);
    }

    playHitSound() { var __oc4;
        if (this.config.hitEffect === 'burn') return;
        if ((((__oc4 = this.scene) === null || __oc4 === void 0 ? void 0 : __oc4.soundManager))) this.scene.soundManager.play('hit');
    }

    getEffectTexture() { var __oc5, __oc6;
        const key = this.config.effectKey ? `char_skill_${this.config.effectKey}` : null;
        return key && (((__oc6 = (__oc5 = this.scene) === null || __oc5 === void 0 ? void 0 : __oc5.textures) === null || __oc6 === void 0 ? void 0 : __oc6.exists(key))) ? key : null;
    }

    getEffectRotation(aimAngle = 0) { var __oc7;
        return resolveCombatVfxRotation(
            aimAngle,
            this.config.effectOrientation,
            (((__oc7 = this.config.effectRotationOffset) !== null && __oc7 !== void 0 ? __oc7 : 0))
        );
    }

    getMirroredEffectRotation(aimAngle = 0, flipY = false) { var __oc8;
        return resolveMirroredCombatVfxRotation(
            aimAngle,
            this.config.effectOrientation,
            (((__oc8 = this.config.effectRotationOffset) !== null && __oc8 !== void 0 ? __oc8 : 0)),
            flipY,
        );
    }

    getEffectVisibleBounds(textureKey = this.getEffectTexture()) {
        return getCombatVfxVisibleBounds(textureKey);
    }

    getEffectProjectedBounds(textureKey = this.getEffectTexture(), rotationOffset = 0, flipY = false) {
        const bounds = this.getEffectVisibleBounds(textureKey);
        const center = COMBAT_VFX_CANVAS_SIZE / 2;
        const cos = Math.cos(rotationOffset);
        const sin = Math.sin(rotationOffset);
        const corners = [
            [bounds.left - center, bounds.top - center],
            [bounds.right - center, bounds.top - center],
            [bounds.right - center, bounds.bottom - center],
            [bounds.left - center, bounds.bottom - center],
        ].map(([x, sourceY]) => {
            const y = flipY ? -sourceY : sourceY;
            return {
                x: x * cos - y * sin,
                y: x * sin + y * cos,
            };
        });
        return {
            minX: Math.min(...corners.map(point => point.x)),
            maxX: Math.max(...corners.map(point => point.x)),
            minY: Math.min(...corners.map(point => point.y)),
            maxY: Math.max(...corners.map(point => point.y)),
        };
    }

    getEffectForwardFit(textureKey, {
        innerReach = 0,
        outerReach,
        rotationOffset = 0,
        flipY = false,
    } = {}) {
        const projection = this.getEffectProjectedBounds(textureKey, rotationOffset, flipY);
        const safeInnerReach = Number.isFinite(innerReach) ? innerReach : 0;
        const safeOuterReach = Number.isFinite(outerReach)
            ? Math.max(safeInnerReach + 1, outerReach)
            : safeInnerReach + Math.max(1, projection.maxX - projection.minX);
        const visibleSpan = Math.max(1, projection.maxX - projection.minX);
        const scale = Math.max(0.1, (safeOuterReach - safeInnerReach) / visibleSpan);
        return {
            scale,
            centerForward: safeInnerReach - projection.minX * scale,
            projection,
        };
    }

    getEffectCenteredFit(textureKey, {
        outerReach,
        rotationOffset = 0,
        flipY = false,
    } = {}) {
        const projection = this.getEffectProjectedBounds(textureKey, rotationOffset, flipY);
        const safeOuterReach = Number.isFinite(outerReach) ? Math.max(1, outerReach) : 1;
        const forwardExtent = Math.max(1, projection.maxX);
        return {
            scale: Math.max(0.1, safeOuterReach / forwardExtent),
            centerForward: 0,
            projection,
        };
    }

    getEffectScaleForVisibleSize(textureKey, width, height = width) {
        const bounds = this.getEffectVisibleBounds(textureKey);
        return {
            x: width / Math.max(1, bounds.width),
            y: height / Math.max(1, bounds.height),
        };
    }

    createEffectSprite(x, y, textureKey = this.getEffectTexture(), animationOptions = {}) { var __oc9;
        if (!textureKey || !(((__oc9 = this.scene) === null || __oc9 === void 0 ? void 0 : __oc9.add))) return null;
        const initialTexture = this.scene.textures.exists(`${textureKey}_0`)
            ? `${textureKey}_0`
            : textureKey;
        const sprite = this.scene.add.sprite(x, y, initialTexture);
        this.animateEffectSprite(sprite, textureKey, animationOptions);
        return sprite;
    }

    animateEffectSprite(sprite, textureKey, options = {}) { var __oc10, __oc11, __oc12, __oc13, __oc14;
        if (!((sprite === null || sprite === void 0 ? void 0 : sprite.scene)) || !textureKey || !(((__oc10 = this.scene) === null || __oc10 === void 0 ? void 0 : __oc10.time))) return sprite;
        this.stopEffectAnimation(sprite);

        const frames = [];
        for (let index = 0; index < 12; index++) {
            const frameKey = `${textureKey}_${index}`;
            if (!this.scene.textures.exists(frameKey)) break;
            frames.push(frameKey);
        }
        if (frames.length < 2) {
            if (this.scene.textures.exists(textureKey)) sprite.setTexture(textureKey);
            return sprite;
        }

        const loopStart = Phaser.Math.Clamp((((__oc11 = options.loopStart) !== null && __oc11 !== void 0 ? __oc11 : 0)), 0, frames.length - 1);
        const loopEnd = Phaser.Math.Clamp((((__oc12 = options.loopEnd) !== null && __oc12 !== void 0 ? __oc12 : frames.length - 1)), loopStart, frames.length - 1);
        const shouldLoop = !!options.loop;
        const frameMs = Math.max(16, (((__oc14 = (__oc13 = options.frameMs) !== null && __oc13 !== void 0 ? __oc13 : this.config.effectFrameMs) !== null && __oc14 !== void 0 ? __oc14 : 48)));
        let frameIndex = loopStart;
        sprite.setTexture(frames[frameIndex]);

        const cleanup = () => {
            const timer = sprite._skillVfxFrameTimer;
            if (timer) {
                timer.destroy();
                this._effectFrameTimers.delete(timer);
            }
            sprite._skillVfxFrameTimer = null;
            if (sprite._skillVfxDestroyHandler) {
                sprite.off('destroy', sprite._skillVfxDestroyHandler);
                sprite._skillVfxDestroyHandler = null;
            }
        };

        const timer = this.scene.time.addEvent({
            delay: frameMs,
            loop: true,
            callback: () => { var __oc15, __oc16;
                if (!sprite.scene || !(((__oc16 = (__oc15 = this.scene) === null || __oc15 === void 0 ? void 0 : __oc15.scene) === null || __oc16 === void 0 ? void 0 : __oc16.isActive()))) {
                    cleanup();
                    return;
                }
                if (frameIndex >= loopEnd) {
                    if (!shouldLoop) {
                        cleanup();
                        return;
                    }
                    frameIndex = loopStart;
                } else {
                    frameIndex += 1;
                }
                sprite.setTexture(frames[frameIndex]);
            },
        });
        sprite._skillVfxFrameTimer = timer;
        sprite._skillVfxDestroyHandler = cleanup;
        sprite.once('destroy', cleanup);
        this._effectFrameTimers.add(timer);
        return sprite;
    }

    stopEffectAnimation(sprite) {
        if (!sprite) return;
        const timer = sprite._skillVfxFrameTimer;
        if (timer) {
            timer.destroy();
            this._effectFrameTimers.delete(timer);
            sprite._skillVfxFrameTimer = null;
        }
        if (sprite._skillVfxDestroyHandler) {
            sprite.off('destroy', sprite._skillVfxDestroyHandler);
            sprite._skillVfxDestroyHandler = null;
        }
    }

    getEffectColor(fallback) { var __oc17;
        return (((__oc17 = this.config.effectColor) !== null && __oc17 !== void 0 ? __oc17 : fallback));
    }

    getEffectGlowColor(fallback) { var __oc18;
        return (((__oc18 = this.config.effectGlowColor) !== null && __oc18 !== void 0 ? __oc18 : fallback));
    }

    getEffectDarkColor(fallback) { var __oc19;
        return (((__oc19 = this.config.effectDarkColor) !== null && __oc19 !== void 0 ? __oc19 : fallback));
    }

    playConfiguredSound(fallback) { var __oc20;
        const soundName = this.config.soundKey || fallback;
        if (soundName && (((__oc20 = this.scene) === null || __oc20 === void 0 ? void 0 : __oc20.soundManager))) {
            this.scene.soundManager.play(soundName);
        }
    }

    _delay(ms, callback) { var __oc21;
        if (!(((__oc21 = this.scene) === null || __oc21 === void 0 ? void 0 : __oc21.time))) return null;
        const timer = this.scene.time.delayedCall(ms, () => { var __oc22, __oc23;
            this._timers.delete(timer);
            if (!this._destroyed && (((__oc23 = (__oc22 = this.scene) === null || __oc22 === void 0 ? void 0 : __oc22.scene) === null || __oc23 === void 0 ? void 0 : __oc23.isActive()))) callback();
        });
        this._timers.add(timer);
        return timer;
    }

    destroy() {
        this._destroyed = true;
        for (const timer of this._timers) {
            try { timer.remove(false); } catch (e) { /* already removed */ }
        }
        this._timers.clear();
        for (const timer of this._effectFrameTimers) {
            try { timer.destroy(); } catch (e) { /* already removed */ }
        }
        this._effectFrameTimers.clear();
        this.player = null;
        this.scene = null;
    }
}
