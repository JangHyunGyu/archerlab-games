import { SystemMessage } from '../ui/SystemMessage.js?v=20261009-orient-v1&ui=20261127-gothic-ui-v2';

// A separate clock keeps the extraction moving while the entire combat scene,
// including projectile tweens and delayed damage, is paused.
export class AriseScene extends Phaser.Scene {
    constructor() { super({ key: 'AriseScene' }); }

    create({ manager, bossData }) { var __oc0, __oc1;
        this.manager = manager;
        this.bossData = bossData;
        this.player = manager.scene.player;
        this.soundManager = manager.scene.soundManager;
        this.systemMessage = new SystemMessage(this, { placement: 'bottom' });
        this.reducedMotion = (((__oc1 = (__oc0 = (typeof globalThis !== 'undefined' ? globalThis : window)).matchMedia) === null || __oc1 === void 0 ? void 0 : __oc1.call(__oc0, '(prefers-reduced-motion: reduce)').matches)) === true;
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
