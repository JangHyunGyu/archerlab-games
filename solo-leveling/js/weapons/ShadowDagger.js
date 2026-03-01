import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class ShadowDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.shadowDagger);
        this.projectiles = scene.physics.add.group({
            defaultKey: 'proj_dagger',
            maxSize: 30,
        });
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this.scene.time.delayedCall(i * 100, () => this._throwDagger());
        }
    }

    _throwDagger() {
        const target = this.player.getClosestEnemy(1000);
        if (!target) return;

        const dagger = this.projectiles.get(this.player.x, this.player.y, 'proj_dagger');
        if (!dagger) return;

        dagger.setActive(true);
        dagger.setVisible(true);
        dagger.setDepth(8);
        dagger.body.enable = true;
        dagger.setScale(1);

        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
        const speed = 400;

        dagger.setRotation(angle + Math.PI / 2);
        dagger.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        dagger.damageAmount = this.getDamage();

        // Auto-destroy after distance
        this.scene.time.delayedCall(2400, () => {
            if (dagger.active) {
                dagger.setActive(false);
                dagger.setVisible(false);
                dagger.body.enable = false;
            }
        });
    }

    getProjectileGroup() {
        return this.projectiles;
    }

    destroy() {
        this.projectiles.destroy(true);
    }
}
