import { SystemMessage } from '../ui/SystemMessage.js?v=20261009-orient-v1';

// A separate clock keeps the extraction moving while the entire combat scene,
// including projectile tweens and delayed damage, is paused.
export class AriseScene extends Phaser.Scene {
    constructor() { super({ key: 'AriseScene' }); }

    create({ manager, bossData }) {
        this.manager = manager;
        this.bossData = bossData;
        this.player = manager.scene.player;
        this.soundManager = manager.scene.soundManager;
        this.systemMessage = new SystemMessage(this, { placement: 'bottom' });
        this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
        this._onResize = () => {
            this.cameras.main.centerOn(bossData.x, bossData.y);
            this.systemMessage.relayout();
            manager.syncScreenLayout();
        };
        this.events.on('game-resize', this._onResize);
        this.events.once('shutdown', () => {
            this.events.off('game-resize', this._onResize);
            this.systemMessage.destroy();
            // Also recover if another scene interrupts the presentation.
            manager._cleanupArise();
            this.manager = this.player = this.soundManager = null;
        });
        this.cameras.main.centerOn(bossData.x, bossData.y);
        manager._startArisePresentation(this, bossData);
    }
}
