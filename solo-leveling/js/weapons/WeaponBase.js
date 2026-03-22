export class WeaponBase {
    constructor(scene, player, config) {
        this.scene = scene;
        this.player = player;
        this.config = config;
        this.level = 1;
        this.cooldownTimer = 0;
        this.damage = config.baseDamage;
        this.cooldown = config.baseCooldown;
        this.count = config.baseCount || 1;
        this.extraRange = 0;
        this.extraSlow = 0;
    }

    update(time, delta) {
        const cdReduction = this.player.stats.cooldownReduction || 0;
        const effectiveCooldown = this.cooldown * (1 - cdReduction);

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

    destroy() {
        // Override for cleanup
    }
}
