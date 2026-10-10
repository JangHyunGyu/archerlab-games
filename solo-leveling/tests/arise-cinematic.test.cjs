const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/managers/ShadowArmyManager.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export class', 'class');
const sandbox = { console: { log() {}, warn() {}, error() {} }, BOSS_TYPES: { igris: { name: 'Igris' } },
    ShadowSoldier: class { constructor(scene, x, y, key) { Object.assign(this, { scene, x, y, key, active: true }); } destroy() { this.active = false; } } };
vm.runInNewContext(source + '\nglobalThis.Manager = ShadowArmyManager;', sandbox);
function setup() {
    let paused = false, resumes = 0;
    const player = { characterId: 'shadowMonarch', active: true, x: 500, y: 700 };
    const camera = { scrollX: 10, scrollY: 20, useBounds: true, _follow: player, lerp: { x: .08, y: .08 }, roundPixels: true,
        stopFollow() { this._follow = null; }, centerOn(x, y) { this.center = [x, y]; }, setScroll(x, y) { this.scrollX = x; this.scrollY = y; },
        startFollow(target) { this._follow = target; } };
    const scene = { player, cameras: { main: camera }, scene: { isActive: () => !paused, isPaused: () => paused,
        pause() { paused = true; }, resume() { paused = false; resumes++; }, launch() {} } };
    const timers = [];
    const presentation = { time: { delayedCall(ms, callback) { const timer = { ms, callback, remove() {} }; timers.push(timer); return timer; } },
        scene: { isActive: () => true, stop() {} }, tweens: { killTweensOf() {} } };
    const manager = new sandbox.Manager(scene);
    manager._performAriseSequence = () => {};
    const start = () => { manager.onBossKilled({ x: 20, y: 30, bossKey: 'igris' }); manager._startArisePresentation(presentation, manager._pendingRecruit); };
    return { manager, scene, camera, timers, start, paused: () => paused, resumes: () => resumes };
}
test('extraction focuses even an edge boss, then restores follow and recruits exactly once', () => {
    const h = setup();
    const message = { active: true, visible: true, setVisible(value) { this.visible = value; } };
    h.scene.systemMessage = message;
    h.start();
    assert.equal(message.visible, false);
    assert.equal(h.paused(), true);
    assert.deepEqual(h.camera.center, [20, 30]); assert.equal(h.camera.useBounds, false);
    h.camera.centerOn(500, 700); h.manager.syncScreenLayout();
    assert.deepEqual(h.camera.center, [20, 30]);
    h.manager._cleanupArise(); h.manager._cleanupArise();
    assert.equal(h.resumes(), 1); assert.equal(h.manager.soldiers.length, 1);
    assert.equal(h.manager.soldiers[0].scene, h.scene);
    assert.equal(h.camera._follow, h.scene.player); assert.equal(h.camera.useBounds, true);
    assert.equal(message.visible, true);
});
test('presentation timeout or an exception resumes combat and preserves the earned recruit', () => {
    for (const failure of ['timeout', 'error']) {
        const h = setup();
        if (failure === 'error') h.manager._performAriseSequence = () => { throw new Error('missing effect'); };
        h.start();
        if (failure === 'timeout') h.timers.find(t => t.ms === 12000).callback();
        assert.equal(h.paused(), false); assert.equal(h.resumes(), 1);
        assert.equal(h.manager.soldiers.length, 1);
    }
});
test('shutdown cannot resume an abandoned run or create a late soldier', () => {
    const h = setup(); h.start(); h.manager.destroy();
    h.timers[0].callback();
    assert.equal(h.resumes(), 0); assert.equal(h.manager.soldiers.length, 0);
});
test('healer range expands without changing its damage or attack cadence', async () => {
    const { WEAPONS } = await import('../js/utils/Constants.js');
    const strike = WEAPONS.sanctuaryStrike;
    assert.equal(strike.attackRange, 276); assert.equal(strike.impactRadius, 88);
    assert.equal(strike.baseDamage, 45);
    assert.equal(strike.baseCooldown, WEAPONS.basicDagger.baseCooldown);
});
