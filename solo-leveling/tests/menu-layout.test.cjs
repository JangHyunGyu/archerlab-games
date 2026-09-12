'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/ui/MenuLayout.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.replace('export function', 'function'), context);
for (const [w, h] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[1920,1080],[568,320],[844,390],[932,430]]) {
  for (const saved of [false, true]) {
    const l = vm.runInContext(`getShadowMenuLayout(${w},${h},${saved})`, context);
    const id = `${w}x${h} saved=${saved}`;
    assert.ok(l.buttonH >= 44, `${id}: touch target`);
    assert.ok(l.x >= 0 && l.x + l.contentW <= w, `${id}: content width`);
    const bottom = l.actionsY + (saved ? 3 : 2) * l.buttonH + (saved ? 2 : 1) * l.gap;
    assert.ok(bottom <= h - 12, `${id}: actions bottom`);
    assert.ok(l.top + l.titleSize * 2.2 <= l.actionsY, `${id}: title clear of actions`);
    assert.ok(l.heroX - l.heroSize * .57 >= 0 && l.heroX + l.heroSize * .57 <= w, `${id}: portrait width`);
    assert.ok(l.heroY + l.heroSize * .57 + (l.short ? 32 : 54) < h, `${id}: portrait caption bottom`);
    if (l.portrait) {
      assert.ok(l.heroY - l.heroSize * .5 >= l.top + l.titleSize * 2.2, `${id}: title and portrait separation`);
      assert.ok(l.heroY + l.heroSize * .57 + 54 <= l.actionsY, `${id}: caption and actions separation`);
    } else {
      assert.ok(l.x + l.contentW <= l.heroX - l.heroSize * .5, `${id}: columns separation`);
    }
  }
}
console.log('Shadow menu geometry verified across 11 sizes, with and without a saved game');
