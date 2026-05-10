import { MAX_COOLDOWN_REDUCTION } from '../utils/Constants.js';

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
        this.player = null;
        this.scene = null;
    }
}
