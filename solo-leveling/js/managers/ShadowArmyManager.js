import { COLORS, BOSS_TYPES } from '../utils/Constants.js';
import { ShadowSoldier } from '../entities/ShadowSoldier.js';

export class ShadowArmyManager {
    constructor(scene) {
        this.scene = scene;
        this.soldiers = [];
        this.maxSoldiers = 5;
        this.isPerformingArise = false;
        this._ariseElements = []; // Track all created elements for cleanup
        this._destroyed = false;
    }

    onBossKilled(boss) {
        if (this._destroyed) return;
        if (this.soldiers.length >= this.maxSoldiers) return;
        if (this.isPerformingArise) return;

        // Capture boss data immediately (boss will be destroyed soon)
        const bossData = {
            x: boss.x,
            y: boss.y,
            bossKey: boss.bossKey,
            config: BOSS_TYPES[boss.bossKey],
        };

        if (!bossData.config) {
            console.warn('[ARISE] Unknown boss key:', boss.bossKey);
            return;
        }

        console.log('[ARISE] Starting shadow extraction for:', bossData.config.name);
        this.isPerformingArise = true;
        this._ariseElements = [];

        // Safety timeout: force reset after 12 seconds even if something goes wrong
        this._ariseSafetyTimer = this.scene.time.delayedCall(12000, () => {
            if (this.isPerformingArise) {
                console.warn('[ARISE] Safety timeout - force cleanup');
                this._cleanupArise();
            }
        });

        try {
            this._performAriseSequence(bossData);
        } catch (e) {
            console.error('[ARISE] Error starting sequence:', e);
            this._cleanupArise();
        }
    }

    _cleanupArise() {
        // Kill tweens then destroy all tracked elements
        const tweens = this.scene?.tweens;
        for (const el of this._ariseElements) {
            try {
                if (tweens && el && el.active !== false) {
                    tweens.killTweensOf(el);
                }
                if (el && el.destroy) el.destroy();
            } catch (e) { /* already destroyed */ }
        }
        this._ariseElements = [];
        this.isPerformingArise = false;

        if (this._ariseSafetyTimer) {
            this._ariseSafetyTimer.remove(false);
            this._ariseSafetyTimer = null;
        }
    }

    _trackElement(el) {
        if (el) this._ariseElements.push(el);
        return el;
    }

    _performAriseSequence(bossData) {
        const scene = this.scene;
        const bossX = bossData.x;
        const bossY = bossData.y;
        const bossConfig = bossData.config;

        // Sound
        if (scene.soundManager) scene.soundManager.play('arise');

        // Phase 1: Darken screen
        const overlay = this._trackElement(
            scene.add.rectangle(0, 0, scene.cameras.main.width, scene.cameras.main.height, 0x000000, 0)
                .setDepth(50).setScrollFactor(0).setOrigin(0, 0)
        );

        scene.tweens.add({
            targets: overlay,
            alpha: 0.7,
            duration: 600,
        });

        // System message
        scene.time.delayedCall(300, () => {
            try {
                if (!scene.scene?.isActive()) return;
                if (scene.systemMessage) {
                    scene.systemMessage.show('[시스템]', [
                        '그림자 추출이 가능한 대상을 감지했습니다.',
                        `대상: ${bossConfig.name}`,
                    ], { duration: 2500, type: 'arise' });
                }
            } catch (e) { console.warn('[ARISE] Phase 1 error:', e); }
        });

        // Phase 2: Rune circle + ground shadows
        scene.time.delayedCall(600, () => {
            try {
                if (!scene.scene.isActive()) { this._cleanupArise(); return; }

                const groundShadow = this._trackElement(
                    scene.add.ellipse(bossX, bossY + 15, 10, 5, 0x1a0033, 0.8).setDepth(50)
                );
                scene.tweens.add({
                    targets: groundShadow,
                    scaleX: 12, scaleY: 8, alpha: 0.6,
                    duration: 800, ease: 'Power2',
                });

                const rune = this._trackElement(
                    scene.add.sprite(bossX, bossY, 'arise_rune').setDepth(51).setAlpha(0).setScale(0.2)
                );
                scene.tweens.add({
                    targets: rune,
                    alpha: 1, scaleX: 1.8, scaleY: 1.8, rotation: Math.PI * 2,
                    duration: 1200, ease: 'Power2',
                });

                // Purple particles (reduced count for performance)
                for (let i = 0; i < 12; i++) {
                    scene.time.delayedCall(i * 80, () => {
                        if (!scene.scene?.isActive()) return;
                        try {
                            const px = bossX + Phaser.Math.Between(-50, 50);
                            const p = scene.add.circle(px, bossY + 20, Phaser.Math.Between(3, 7), COLORS.SHADOW_PRIMARY, 0.8)
                                .setDepth(52);
                            scene.tweens.add({
                                targets: p,
                                y: p.y - Phaser.Math.Between(80, 160),
                                alpha: 0, scale: 0.3,
                                duration: 800,
                                onComplete: () => p.destroy(),
                            });
                        } catch (e) { /* particle error, not critical */ }
                    });
                }

                // Phase 3: Hand emerges
                scene.time.delayedCall(800, () => {
                    try {
                        if (!scene.scene.isActive()) { this._cleanupArise(); return; }

                        const handLine = this._trackElement(
                            scene.add.rectangle(bossX, bossY + 10, 6, 0, 0x220044, 0.8)
                                .setDepth(52).setOrigin(0.5, 1)
                        );
                        scene.tweens.add({
                            targets: handLine,
                            displayHeight: 40,
                            duration: 500, ease: 'Power2',
                        });

                        // Command text
                        scene.time.delayedCall(300, () => {
                            try {
                                if (!scene.scene.isActive()) { this._cleanupArise(); return; }

                                const commandText = this._trackElement(
                                    scene.add.text(0, 0, '"나의 병사가 되어라"', {
                                        fontSize: '22px', fontFamily: 'Arial', fontStyle: 'bold italic',
                                        color: '#d4aaff', stroke: '#0a0020', strokeThickness: 3,
                                    }).setOrigin(0.5).setDepth(55).setScrollFactor(0).setAlpha(0)
                                );
                                commandText.setPosition(
                                    scene.cameras.main.width / 2,
                                    scene.cameras.main.height * 0.34
                                );

                                scene.tweens.add({
                                    targets: commandText,
                                    alpha: 1, duration: 300,
                                });

                                // Phase 4: ARISE!
                                scene.time.delayedCall(600, () => {
                                    try {
                                        if (!scene.scene.isActive()) { this._cleanupArise(); return; }

                                        // Heavy camera shake (long, intense)
                                        scene.cameras.main.shake(1200, 0.025);

                                        // Long vibration pattern (mobile)
                                        if (navigator.vibrate) {
                                            navigator.vibrate([200, 50, 300, 40, 200, 30, 150, 50, 400]);
                                        }

                                        const camW = scene.cameras.main.width;
                                        const camH = scene.cameras.main.height;

                                        // Multi-flash sequence (3 bursts)
                                        for (let f = 0; f < 3; f++) {
                                            scene.time.delayedCall(f * 150, () => {
                                                if (!scene.scene?.isActive()) return;
                                                try {
                                                    const fl = scene.add.rectangle(0, 0, camW, camH,
                                                        f === 1 ? 0x7b2fff : COLORS.SHADOW_PRIMARY, 0
                                                    ).setDepth(53).setScrollFactor(0).setOrigin(0, 0);
                                                    scene.tweens.add({
                                                        targets: fl,
                                                        alpha: f === 1 ? 0.5 : 0.3,
                                                        duration: 80, yoyo: true,
                                                        onComplete: () => fl.destroy(),
                                                    });
                                                } catch (e) {}
                                            });
                                        }

                                        // Shadow energy pillar (vertical beam from ground)
                                        const pillar = this._trackElement(
                                            scene.add.rectangle(bossX, bossY, 20, 0, 0x7b2fff, 0.6)
                                                .setDepth(52).setOrigin(0.5, 1)
                                        );
                                        scene.tweens.add({
                                            targets: pillar,
                                            displayHeight: 500, displayWidth: 60, alpha: 0.8,
                                            duration: 400, ease: 'Power3',
                                        });
                                        scene.tweens.add({
                                            targets: pillar,
                                            alpha: 0, displayWidth: 10,
                                            duration: 600, delay: 500,
                                        });

                                        // Ground cracks (lines radiating outward)
                                        for (let c = 0; c < 8; c++) {
                                            const angle = (Math.PI * 2 / 8) * c;
                                            const len = 80 + Math.random() * 60;
                                            const crack = scene.add.line(0, 0,
                                                bossX, bossY,
                                                bossX + Math.cos(angle) * len,
                                                bossY + Math.sin(angle) * len,
                                                0x9944ee, 0
                                            ).setDepth(51).setLineWidth(2);
                                            scene.tweens.add({
                                                targets: crack, alpha: 0.7,
                                                duration: 200, delay: c * 30,
                                                yoyo: true, hold: 300,
                                                onComplete: () => crack.destroy(),
                                            });
                                        }

                                        // Shadow particle explosion (massive burst)
                                        for (let i = 0; i < 25; i++) {
                                            scene.time.delayedCall(i * 30, () => {
                                                if (!scene.scene?.isActive()) return;
                                                try {
                                                    const angle = Math.random() * Math.PI * 2;
                                                    const dist = 20 + Math.random() * 40;
                                                    const px = bossX + Math.cos(angle) * dist;
                                                    const py = bossY + Math.sin(angle) * dist;
                                                    const size = 4 + Math.random() * 8;
                                                    const p = scene.add.circle(px, py, size,
                                                        Math.random() > 0.5 ? 0x7b2fff : COLORS.SHADOW_PRIMARY,
                                                        0.8
                                                    ).setDepth(52);
                                                    scene.tweens.add({
                                                        targets: p,
                                                        y: py - 60 - Math.random() * 100,
                                                        x: px + (Math.random() - 0.5) * 60,
                                                        alpha: 0, scale: 0.2,
                                                        duration: 600 + Math.random() * 400,
                                                        onComplete: () => p.destroy(),
                                                    });
                                                } catch (e) {}
                                            });
                                        }

                                        // Shadow ring waves (expanding outward)
                                        for (let r = 0; r < 3; r++) {
                                            scene.time.delayedCall(r * 200, () => {
                                                if (!scene.scene?.isActive()) return;
                                                try {
                                                    const ring = scene.add.circle(bossX, bossY, 10,
                                                        0x7b2fff, 0
                                                    ).setDepth(51).setStrokeStyle(3, 0x9944ee, 0.8);
                                                    scene.tweens.add({
                                                        targets: ring,
                                                        scale: 8 + r * 3, alpha: 0,
                                                        duration: 800,
                                                        onComplete: () => ring.destroy(),
                                                    });
                                                } catch (e) {}
                                            });
                                        }

                                        // "일어나라" text (epic entrance)
                                        const ariseText = this._trackElement(
                                            scene.add.text(0, 0, '일어나라', {
                                                fontSize: '80px', fontFamily: 'Arial', fontStyle: 'bold',
                                                color: '#b366ff', stroke: '#0a0020', strokeThickness: 8,
                                            }).setOrigin(0.5).setDepth(56).setScrollFactor(0).setAlpha(0).setScale(0.3)
                                        );
                                        ariseText.setPosition(camW / 2, camH * 0.43);

                                        const ariseSubText = this._trackElement(
                                            scene.add.text(0, 0, 'ARISE', {
                                                fontSize: '32px', fontFamily: 'Arial', fontStyle: 'bold',
                                                color: '#7b2fff',
                                            }).setOrigin(0.5).setDepth(55).setScrollFactor(0).setAlpha(0).setScale(1.5)
                                        );
                                        ariseSubText.setPosition(camW / 2, camH * 0.43);

                                        scene.tweens.add({
                                            targets: ariseText,
                                            alpha: 1, scaleX: 1.1, scaleY: 1.1,
                                            duration: 250, ease: 'Back.easeOut',
                                            onComplete: () => {
                                                // Text pulse after appearing
                                                scene.tweens.add({
                                                    targets: ariseText,
                                                    scaleX: 1.0, scaleY: 1.0,
                                                    duration: 150,
                                                });
                                            },
                                        });

                                        scene.tweens.add({
                                            targets: ariseSubText,
                                            alpha: 0.5, scaleX: 2.5, scaleY: 2.5,
                                            duration: 800,
                                        });

                                        // Phase 5: Shadow soldier rises
                                        scene.time.delayedCall(800, () => {
                                            try {
                                                if (!scene.scene.isActive()) { this._cleanupArise(); return; }

                                                const soldier = new ShadowSoldier(
                                                    scene, bossX, bossY,
                                                    bossData.bossKey
                                                );
                                                this.soldiers.push(soldier);

                                                console.log(`[ARISE] Shadow soldier created: ${bossConfig.name} (${bossConfig.shadowType})`);

                                                soldier.setAlpha(0);
                                                const finalScale = soldier.scaleX;
                                                soldier.setScale(finalScale * 0.2);
                                                scene.tweens.add({
                                                    targets: soldier,
                                                    alpha: 0.85, scaleX: finalScale, scaleY: finalScale,
                                                    y: bossY - 10,
                                                    duration: 500, ease: 'Back.easeOut',
                                                });

                                                // Success message
                                                scene.time.delayedCall(300, () => {
                                                    try {
                                                        if (!scene.scene?.isActive()) return;
                                                        if (scene.systemMessage) {
                                                            scene.systemMessage.show('[시스템]', [
                                                                '그림자 추출에 성공했습니다.',
                                                                `${bossConfig.name}이(가) 그림자 군단에 합류했습니다.`,
                                                                `현재 그림자 병사: ${this.soldiers.length}/${this.maxSoldiers}`,
                                                            ], { duration: 3000, type: 'arise' });
                                                        }
                                                    } catch (e) { console.warn('[ARISE] Message error:', e); }
                                                });

                                                // Phase 6: Cleanup (delayed)
                                                scene.time.delayedCall(1800, () => {
                                                    if (!scene.scene?.isActive()) return;
                                                    this._cleanupArise();
                                                });
                                            } catch (e) {
                                                console.error('[ARISE] Phase 5 error:', e);
                                                this._cleanupArise();
                                            }
                                        });
                                    } catch (e) {
                                        console.error('[ARISE] Phase 4 error:', e);
                                        this._cleanupArise();
                                    }
                                });
                            } catch (e) {
                                console.error('[ARISE] Phase 3b error:', e);
                                this._cleanupArise();
                            }
                        });
                    } catch (e) {
                        console.error('[ARISE] Phase 3 error:', e);
                        this._cleanupArise();
                    }
                });
            } catch (e) {
                console.error('[ARISE] Phase 2 error:', e);
                this._cleanupArise();
            }
        });
    }

    update(time, delta) {
        const player = this.scene.player;
        const enemies = [
            ...(this.scene.enemyManager?.getActiveEnemies() || []),
            ...(this.scene.activeBosses?.filter(b => b.active) || []),
        ];

        for (let i = this.soldiers.length - 1; i >= 0; i--) {
            const soldier = this.soldiers[i];
            if (soldier.active) {
                soldier.update(time, delta, player, enemies);
            } else {
                soldier.destroy();
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
        this._destroyed = true;
        this._cleanupArise();
        for (const soldier of this.soldiers) {
            soldier.destroy();
        }
        this.soldiers = [];
        this.scene = null;
    }
}
