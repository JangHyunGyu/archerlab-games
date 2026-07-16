import { MAX_COOLDOWN_REDUCTION } from '../utils/Constants.js';
import { resolveCombatVfxRotation } from '../utils/CombatVfxDirection.js';
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
        if (!target?.takeDamage) return false;
        return target.takeDamage(amount, x, y, this.config.hitEffect || null);
    }

    healPlayerFromConfig() {
        if (!this.config.healPercent || !this.player?.heal) return 0;

        const now = this.scene?.time?.now ?? 0;
        const healCooldownMs = this.config.healCooldownMs || 0;
        if (healCooldownMs > 0 && this._lastConfigHealAt !== undefined && now - this._lastConfigHealAt < healCooldownMs) {
            return 0;
        }

        this._lastConfigHealAt = now;
        const amount = Math.max(1, Math.floor(this.player.stats.maxHp * this.config.healPercent));
        return this.player.heal(amount);
    }

    playHitSound() {
        if (this.config.hitEffect === 'burn') return;
        if (this.scene?.soundManager) this.scene.soundManager.play('hit');
    }

    getEffectTexture() {
        const key = this.config.effectKey ? `char_skill_${this.config.effectKey}` : null;
        return key && this.scene?.textures?.exists(key) ? key : null;
    }

    getEffectRotation(aimAngle = 0) {
        return resolveCombatVfxRotation(
            aimAngle,
            this.config.effectOrientation,
            this.config.effectRotationOffset ?? 0
        );
    }

    getEffectVisibleBounds(textureKey = this.getEffectTexture()) {
        return getCombatVfxVisibleBounds(textureKey);
    }

    getEffectProjectedBounds(textureKey = this.getEffectTexture(), rotationOffset = 0) {
        const bounds = this.getEffectVisibleBounds(textureKey);
        const center = COMBAT_VFX_CANVAS_SIZE / 2;
        const cos = Math.cos(rotationOffset);
        const sin = Math.sin(rotationOffset);
        const corners = [
            [bounds.left - center, bounds.top - center],
            [bounds.right - center, bounds.top - center],
            [bounds.right - center, bounds.bottom - center],
            [bounds.left - center, bounds.bottom - center],
        ].map(([x, y]) => ({
            x: x * cos - y * sin,
            y: x * sin + y * cos,
        }));
        return {
            minX: Math.min(...corners.map(point => point.x)),
            maxX: Math.max(...corners.map(point => point.x)),
            minY: Math.min(...corners.map(point => point.y)),
            maxY: Math.max(...corners.map(point => point.y)),
        };
    }

    getEffectScaleForVisibleSize(textureKey, width, height = width) {
        const bounds = this.getEffectVisibleBounds(textureKey);
        return {
            x: width / Math.max(1, bounds.width),
            y: height / Math.max(1, bounds.height),
        };
    }

    createEffectSprite(x, y, textureKey = this.getEffectTexture(), animationOptions = {}) {
        if (!textureKey || !this.scene?.add) return null;
        const initialTexture = this.scene.textures.exists(`${textureKey}_0`)
            ? `${textureKey}_0`
            : textureKey;
        const sprite = this.scene.add.sprite(x, y, initialTexture);
        this.animateEffectSprite(sprite, textureKey, animationOptions);
        return sprite;
    }

    animateEffectSprite(sprite, textureKey, options = {}) {
        if (!sprite?.scene || !textureKey || !this.scene?.time) return sprite;
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

        const loopStart = Phaser.Math.Clamp(options.loopStart ?? 0, 0, frames.length - 1);
        const loopEnd = Phaser.Math.Clamp(options.loopEnd ?? frames.length - 1, loopStart, frames.length - 1);
        const shouldLoop = !!options.loop;
        const frameMs = Math.max(16, options.frameMs ?? this.config.effectFrameMs ?? 48);
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
            callback: () => {
                if (!sprite.scene || !this.scene?.scene?.isActive()) {
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

    getEffectColor(fallback) {
        return this.config.effectColor ?? fallback;
    }

    getEffectGlowColor(fallback) {
        return this.config.effectGlowColor ?? fallback;
    }

    getEffectDarkColor(fallback) {
        return this.config.effectDarkColor ?? fallback;
    }

    playConfiguredSound(fallback) {
        const soundName = this.config.soundKey || fallback;
        if (soundName && this.scene?.soundManager) {
            this.scene.soundManager.play(soundName);
        }
    }

    _delay(ms, callback) {
        if (!this.scene?.time) return null;
        const timer = this.scene.time.delayedCall(ms, () => {
            this._timers.delete(timer);
            if (!this._destroyed && this.scene?.scene?.isActive()) callback();
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
