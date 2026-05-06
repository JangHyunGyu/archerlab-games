import { BasicDagger } from '../weapons/BasicDagger.js';
import { ShadowDagger } from '../weapons/ShadowDagger.js';
import { ShadowSlash } from '../weapons/ShadowSlash.js';
import { RulersAuthority } from '../weapons/RulersAuthority.js';
import { DragonFear } from '../weapons/DragonFear.js';
import { WEAPONS } from '../utils/Constants.js';

const WEAPON_CLASSES = {
    basicDagger: BasicDagger,
    shadowDagger: ShadowDagger,
    shadowSlash: ShadowSlash,
    rulersAuthority: RulersAuthority,
    dragonFear: DragonFear,
};

export class WeaponManager {
    constructor(scene, player) {
        this.scene = scene;
        this.player = player;
        this.weapons = new Map();
        this.maxSlots = 6;
        this._colliders = [];
    }

    addWeapon(weaponKey) {
        if (this.weapons.has(weaponKey)) {
            // Level up existing weapon
            this.weapons.get(weaponKey).levelUp();
            return true;
        }

        if (this.weapons.size >= this.maxSlots) return false;

        const config = WEAPONS[weaponKey];
        const WeaponClass = WEAPON_CLASSES[config?.classKey || weaponKey];
        if (!WeaponClass) return false;

        const weapon = new WeaponClass(this.scene, this.player, config);
        weapon.key = weaponKey;
        this.weapons.set(weaponKey, weapon);

        // Set up collision for projectile weapons
        this._setupCollision(weaponKey, weapon);

        // Set up collision with existing bosses
        if (this.scene.onWeaponAdded) {
            this.scene.onWeaponAdded(weaponKey, weapon);
        }
        return true;
    }

    _setupCollision(weaponKey, weapon) {
        if (weapon.getProjectileGroup) {
            const projGroup = weapon.getProjectileGroup();
            const enemyGroup = this.scene.enemyManager?.getGroup();

            if (projGroup && enemyGroup) {
                const collider = this.scene.physics.add.overlap(projGroup, enemyGroup, (proj, enemy) => {
                    if (!proj.active || !enemy.active || !weapon) return;
                    const dmg = proj.damageAmount || weapon.getDamage();
                    enemy.takeDamage(dmg, proj.x, proj.y);

                    // Destroy projectile (daggers only)
                    if ((weapon.baseWeaponKey || weaponKey) === 'shadowDagger') {
                        proj.setActive(false);
                        proj.setVisible(false);
                        proj.body.enable = false;
                    }
                });
                this._colliders.push(collider);
            }
        }
    }

    hasWeapon(weaponKey) {
        return this.weapons.has(weaponKey);
    }

    getWeaponLevel(weaponKey) {
        if (!this.weapons.has(weaponKey)) return 0;
        return this.weapons.get(weaponKey).level;
    }

    getOwnedWeapons() {
        return Array.from(this.weapons.entries()).map(([key, w]) => ({
            key,
            level: w.level,
        }));
    }

    update(time, delta) {
        for (const weapon of this.weapons.values()) {
            weapon.update(time, delta);
        }
    }

    destroy() {
        if (this.scene?.physics?.world && this._colliders) {
            for (const collider of this._colliders) {
                try { this.scene.physics.world.removeCollider(collider); } catch (e) { /* already removed */ }
            }
        }
        this._colliders = [];
        for (const weapon of this.weapons.values()) {
            weapon.destroy();
        }
        this.weapons.clear();
        this.player = null;
        this.scene = null;
    }
}
