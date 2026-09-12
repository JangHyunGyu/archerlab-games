import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real renderer layout without starting WebGL or audio.
const source = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const start = source.indexOf('  layout() {');
const end = source.indexOf('  render(snapshot,', start);
assert.ok(start > 0 && end > start);
const sizes = [[320,480],[320,568],[360,640],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[1920,1080],[568,320],[844,390],[932,430]];
for (const [width, height] of sizes) {
  for (const bottom of [0, 34]) {
    const top = bottom ? 24 : 0;
    const ctx = vm.createContext({ COLS: 10, ROWS: 20, safeAreaInsets: () => ({top, bottom, left:0, right:0}) });
    vm.runInContext(`class View { ${source.slice(start,end)} }; result = new View();`, ctx);
    ctx.result.app = {screen: {width, height}};
    const l = ctx.result.layout();
    const id = `${width}x${height}, safe bottom ${bottom}`;
    assert.ok(l.cell >= 8, `${id}: legible cells`);
    assert.ok(l.boardX >= 0 && l.boardX + l.boardW <= width, `${id}: board width`);
    assert.ok(l.boardY >= top + 80, `${id}: room for HUD`);
    assert.ok(l.next.y >= 0 && l.next.y + l.next.h <= height - bottom, `${id}: next preview fits`);
    if (l.portrait) {
      assert.ok(l.boardY + l.boardH <= height - bottom - 116, `${id}: board clears touch controls`);
    } else {
      assert.ok(l.boardY + l.boardH <= height - bottom, `${id}: landscape board fits`);
      if (height <= 600) {
        const sideInset = bottom ? 44 : 12;
        assert.ok(sideInset + 3 * 44 + 2 * 8 < l.boardX, `${id}: movement buttons clear the board`);
        assert.ok(l.next.x + l.next.w <= width - sideInset - 104, `${id}: rotate and drop clear the next preview`);
        assert.ok(Math.max(12, top) + 80 + 66 <= height - Math.max(12, bottom + 8) - 104, `${id}: statistics clear the editor`);
      }
    }
  }
}
console.log('Lumen board and next preview fit 12 viewports, with and without safe areas');

const renderStart = source.indexOf('  render(snapshot,');
const renderEnd = source.indexOf('  trimFxQueues()', renderStart);
const renderContext = vm.createContext({});
vm.runInContext(`class View { ${source.slice(renderStart, renderEnd)} }; view = new View();`, renderContext);
const view = renderContext.view;
const calls = [];
const transform = () => ({set(...values) { this.values = values; }});
view.app = {stage:{pivot:transform(),position:transform(),scale:transform(),rotation:1}};
view.layout = () => ({w:390,h:844});
view.motionPreference = {matches:true};
for (const name of ['trimFxQueues','drawBoard','applyCamera','drawBackground','drawParticles','drawFlash','drawStageTitle']) view[name] = () => calls.push(name);
view.bg = {clear(){return this;},rect(){return this;},fill(){return this;}};
view.flashLayer = {visible:true};
view.stageTitleLayer = {visible:true};
view.render({stage:{}},16,{});
assert.deepEqual(calls, ['trimFxQueues','drawBoard'], 'reduced motion renders playable blocks without camera or decorative effects');
assert.equal(view.app.stage.rotation, 0);
assert.equal(view.flashLayer.visible, false);
view.motionPreference.matches = false;
calls.length = 0;
view.render({stage:{}},16,{});
assert.ok(calls.includes('drawFlash'), 'normal effects return when the preference changes');
assert.equal(view.flashLayer.visible, true);
console.log('Reduced motion skips camera, flashes and particles while preserving board rendering');
