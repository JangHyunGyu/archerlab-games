import { COLORS, BOSS_TYPES } from '../utils/Constants.js';
import { ShadowSoldier } from '../entities/ShadowSoldier.js';

export class ShadowArmyManager {
    constructor(scene) {
        this.scene = scene;
        this.soldiers = [];
        this.maxSoldiers = 5;
        this.isPerformingArise = false;
    }

    onBossKilled(boss) {
        if (this.soldiers.length >= this.maxSoldiers) return;
        if (this.isPerformingArise) return;

        this.isPerformingArise = true;
        this._performAriseSequence(boss);
    }

    _performAriseSequence(boss) {
        const scene = this.scene;
        const bossX = boss.x;
        const bossY = boss.y;
        const bossConfig = BOSS_TYPES[boss.bossKey];

        // Sound
        if (scene.soundManager) scene.soundManager.play('arise');

        // Phase 1: Darken screen + pause feel
        const overlay = scene.add.rectangle(
            scene.cameras.main.scrollX + 512,
            scene.cameras.main.scrollY + 384,
            1024, 768, 0x000000, 0
        ).setDepth(50).setScrollFactor(0);

        scene.tweens.add({
            targets: overlay,
            alpha: 0.7,
            duration: 600,
        });

        // System message: "그림자 추출이 가능한 대상을 감지했습니다."
        scene.time.delayedCall(300, () => {
            if (scene.systemMessage) {
                scene.systemMessage.show('[시스템]', [
                    '그림자 추출이 가능한 대상을 감지했습니다.',
                    `대상: ${bossConfig.name}`,
                ], { duration: 2500, type: 'arise' });
            }
        });

        // Phase 2: Rune circle + ground shadows
        scene.time.delayedCall(600, () => {
            // Ground shadow pool
            const groundShadow = scene.add.ellipse(bossX, bossY + 15, 10, 5, 0x1a0033, 0.8)
                .setDepth(50);
            scene.tweens.add({
                targets: groundShadow,
                scaleX: 12,
                scaleY: 8,
                alpha: 0.6,
                duration: 800,
                ease: 'Power2',
            });

            const rune = scene.add.sprite(bossX, bossY, 'arise_rune')
                .setDepth(51).setAlpha(0).setScale(0.2);

            scene.tweens.add({
                targets: rune,
                alpha: 1,
                scaleX: 1.8,
                scaleY: 1.8,
                rotation: Math.PI * 2,
                duration: 1200,
                ease: 'Power2',
            });

            // Purple rune particles rising from ground
            for (let i = 0; i < 30; i++) {
                scene.time.delayedCall(i * 40, () => {
                    const px = bossX + Phaser.Math.Between(-50, 50);
                    const p = scene.add.circle(px, bossY + 20, Phaser.Math.Between(2, 6), COLORS.SHADOW_PRIMARY, 0.8)
                        .setDepth(52);
                    scene.tweens.add({
                        targets: p,
                        y: p.y - Phaser.Math.Between(80, 160),
                        alpha: 0,
                        scale: 0.3,
                        duration: 1000,
                        onComplete: () => p.destroy(),
                    });
                });
            }

            // Phase 3: Hand emerges from shadow (iconic scene)
            scene.time.delayedCall(800, () => {
                // Shadow hand reaching up
                const handLine = scene.add.rectangle(bossX, bossY + 10, 6, 0, 0x220044, 0.8)
                    .setDepth(52).setOrigin(0.5, 1);
                scene.tweens.add({
                    targets: handLine,
                    displayHeight: 40,
                    duration: 500,
                    ease: 'Power2',
                });

                // "나의 병사가 되어라" text
                scene.time.delayedCall(300, () => {
                    const commandText = scene.add.text(
                        scene.cameras.main.scrollX + 512,
                        scene.cameras.main.scrollY + 260,
                        '"나의 병사가 되어라"',
                        {
                            fontSize: '22px', fontFamily: 'Arial', fontStyle: 'bold italic',
                            color: '#d4aaff', stroke: '#0a0020', strokeThickness: 3,
                        }
                    ).setOrigin(0.5).setDepth(55).setScrollFactor(0).setAlpha(0);

                    scene.tweens.add({
                        targets: commandText,
                        alpha: 1,
                        duration: 300,
                    });

                    // Phase 4: ARISE!
                    scene.time.delayedCall(600, () => {
                        // Camera shake
                        scene.cameras.main.shake(400, 0.015);

                        // ARISE text - big impact
                        const ariseText = scene.add.text(
                            scene.cameras.main.scrollX + 512,
                            scene.cameras.main.scrollY + 330,
                            '일어나라',
                            {
                                fontSize: '80px', fontFamily: 'Arial', fontStyle: 'bold',
                                color: '#b366ff', stroke: '#0a0020', strokeThickness: 8,
                            }
                        ).setOrigin(0.5).setDepth(56).setScrollFactor(0).setAlpha(0).setScale(0.3);

                        const ariseSubText = scene.add.text(
                            scene.cameras.main.scrollX + 512,
                            scene.cameras.main.scrollY + 330,
                            'ARISE',
                            {
                                fontSize: '32px', fontFamily: 'Arial', fontStyle: 'bold',
                                color: '#7b2fff',
                            }
                        ).setOrigin(0.5).setDepth(55).setScrollFactor(0).setAlpha(0).setScale(1.5);

                        // Glow flash
                        const flash = scene.add.rectangle(
                            scene.cameras.main.scrollX + 512,
                            scene.cameras.main.scrollY + 384,
                            1024, 768, COLORS.SHADOW_PRIMARY, 0
                        ).setDepth(53).setScrollFactor(0);

                        scene.tweens.add({
                            targets: flash,
                            alpha: 0.3,
                            duration: 100,
                            yoyo: true,
                            onComplete: () => flash.destroy(),
                        });

                        scene.tweens.add({
                            targets: ariseText,
                            alpha: 1,
                            scaleX: 1,
                            scaleY: 1,
                            duration: 300,
                            ease: 'Back.easeOut',
                        });

                        scene.tweens.add({
                            targets: ariseSubText,
                            alpha: 0.5,
                            scaleX: 2,
                            scaleY: 2,
                            duration: 600,
                        });

                        // Phase 5: Shadow soldier rises
                        scene.time.delayedCall(800, () => {
                            const soldier = new ShadowSoldier(
                                scene, bossX, bossY,
                                bossConfig.shadowType,
                                bossConfig.name
                            );
                            this.soldiers.push(soldier);

                            soldier.setAlpha(0);
                            soldier.setScale(0.2);
                            scene.tweens.add({
                                targets: soldier,
                                alpha: 1,
                                scaleX: 1,
                                scaleY: 1,
                                y: bossY - 10,
                                duration: 500,
                                ease: 'Back.easeOut',
                            });

                            // System message: extraction success
                            scene.time.delayedCall(300, () => {
                                if (scene.systemMessage) {
                                    scene.systemMessage.show('[시스템]', [
                                        '그림자 추출에 성공했습니다.',
                                        `${bossConfig.name}이(가) 그림자 군단에 합류했습니다.`,
                                        `현재 그림자 병사: ${this.soldiers.length}/${this.maxSoldiers}`,
                                    ], { duration: 3000, type: 'arise' });
                                }
                            });

                            // Phase 6: Cleanup
                            scene.time.delayedCall(1800, () => {
                                const allElements = [overlay, rune, groundShadow, handLine, commandText, ariseText, ariseSubText];
                                scene.tweens.add({
                                    targets: allElements,
                                    alpha: 0,
                                    duration: 500,
                                    onComplete: () => {
                                        allElements.forEach(el => { if (el && el.destroy) el.destroy(); });
                                        this.isPerformingArise = false;
                                    },
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    update(time, delta) {
        const player = this.scene.player;
        const enemies = this.scene.enemyManager?.getActiveEnemies() || [];

        for (let i = this.soldiers.length - 1; i >= 0; i--) {
            const soldier = this.soldiers[i];
            if (soldier.active) {
                soldier.update(time, delta, player, enemies);
            } else {
                this.soldiers.splice(i, 1);
            }
        }
    }

    getSoldierCount() {
        return this.soldiers.length;
    }

    getSoldiers() {
        return this.soldiers;
    }

    destroy() {
        for (const soldier of this.soldiers) {
            soldier.destroy();
        }
        this.soldiers = [];
    }
}
