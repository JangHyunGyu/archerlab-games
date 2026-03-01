import { SpriteFactory } from '../utils/SpriteFactory.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    create() {
        SpriteFactory.createAll(this);
        this.scene.start('MenuScene');
    }
}
