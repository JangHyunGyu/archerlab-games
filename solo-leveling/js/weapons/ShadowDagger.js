import { WeaponBase } from './WeaponBase.js';
import { WEAPONS, COLORS } from '../utils/Constants.js';

export class ShadowDagger extends WeaponBase {
    constructor(scene, player) {
        super(scene, player, WEAPONS.shadowDagger);
        this._activeDaggers = []; // 비행 중 단검 추적 (씬 종료 시 정리용)
        this._trailPool = []; // Pool for trail circle objects
    }

    _getTrailCircle(x, y) {
        let trail = this._trailPool.pop();
        if (trail && trail.scene) {
            trail.setPosition(x, y);
            trail.setVisible(true);
            trail.setAlpha(0.4);
            trail.setScale(1);
            return trail;
        }
        return this.scene.add.circle(x, y, 3, 0xb366ff, 0.4).setDepth(7);
    }

    _releaseTrailCircle(trail) {
        if (!trail || !trail.scene) return;
        trail.setVisible(false);
        if (this._trailPool.length < 50) {
            this._trailPool.push(trail);
        } else {
            trail.destroy();
        }
    }

    fire() {
        for (let i = 0; i < this.count; i++) {
            this.scene.time.delayedCall(i * 100, () => this._throwDagger());
        }
    }

    _throwDagger() {
        const target = this.player.getClosestEnemy(6000);
        if (!target) return;

        const px = this.player.x;
        const py = this.player.y;
        const angle = Phaser.Math.Angle.Between(px, py, target.x, target.y);
        const range = 1500;
        const endX = px + Math.cos(angle) * range;
        const endY = py + Math.sin(angle) * range;
        const duration = 2500; // 600px/s * 2.5s = 1500px
        const dmg = this.getDamage();

        // 단검 스프라이트 생성 (physics body 없이)
        const dagger = this.scene.add.sprite(px, py, 'proj_dagger')
            .setDepth(8)
            .setScale(1.2)
            .setRotation(angle + Math.PI / 2);

        let hasHit = false;
        let trailInterval = null;
        let collisionCheckCounter = 0;
        const entry = { dagger, trailInterval: null };
        this._activeDaggers.push(entry);

        const cleanup = () => {
            if (trailInterval) { trailInterval.destroy(); trailInterval = null; }
            entry.trailInterval = null;
            if (dagger.active) dagger.destroy();
            // 추적 배열에서 제거
            const idx = this._activeDaggers.indexOf(entry);
            if (idx !== -1) this._activeDaggers.splice(idx, 1);
        };

        // 트윈으로 직선 이동
        this.scene.tweens.add({
            targets: dagger,
            x: endX,
            y: endY,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => {
                if (hasHit || !dagger.active) return;
                // Throttle collision checks to every 3rd frame
                collisionCheckCounter++;
                if (collisionCheckCounter % 3 !== 0) return;
                const enemies = this.player.getAllEnemies();
                for (const enemy of enemies) {
                    if (!enemy.active) continue;
                    const dist = Phaser.Math.Distance.Between(dagger.x, dagger.y, enemy.x, enemy.y);
                    if (dist < 25) {
                        enemy.takeDamage(dmg, dagger.x, dagger.y);
                        if (this.scene.soundManager) this.scene.soundManager.play('hit');
                        hasHit = true;
                        const sx = dagger.x, sy = dagger.y;
                        // onUpdate 내에서 tween 조작하면 프리즈 → 숨기기만 하고 onComplete에서 정리
                        dagger.setVisible(false);
                        if (trailInterval) { trailInterval.destroy(); trailInterval = null; }
                        entry.trailInterval = null;
                        const spark = this.scene.add.circle(sx, sy, 6, 0xb366ff, 0.8).setDepth(9);
                        this.scene.tweens.add({
                            targets: spark, alpha: 0, scale: 3,
                            duration: 200, onComplete: () => spark.destroy(),
                        });
                        return;
                    }
                }
            },
            onComplete: () => cleanup(),
        });

        // 트레일 이펙트 (pooled circles)
        trailInterval = this.scene.time.addEvent({
            delay: 50,
            repeat: duration / 50,
            callback: () => {
                if (!dagger.active) return;
                const trail = this._getTrailCircle(dagger.x, dagger.y);
                this.scene.tweens.add({
                    targets: trail, alpha: 0, scale: 0,
                    duration: 180, onComplete: () => this._releaseTrailCircle(trail),
                });
            },
        });
        entry.trailInterval = trailInterval;
    }

    destroy() {
        // 비행 중인 모든 단검 정리
        const tweens = this.scene?.tweens;
        for (const entry of this._activeDaggers) {
            if (entry.trailInterval) entry.trailInterval.destroy();
            if (tweens) tweens.killTweensOf(entry.dagger);
            if (entry.dagger.active) entry.dagger.destroy();
        }
        this._activeDaggers = [];
    }
}
