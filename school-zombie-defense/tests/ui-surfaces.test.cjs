const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const canvases = [];
const cache = new Map();
const context = {
  document: { createElement() {
    const calls = [];
    const canvas = { width: 0, height: 0, calls, getContext: () => ({ drawImage: (...args) => calls.push(args) }) };
    canvases.push(canvas);
    return canvas;
  } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ui-surfaces.js'), 'utf8'), context);
const ui = context.SchoolZombieUI;
const scene = { textures: {
  exists: key => cache.has(key),
  get: () => ({ getSourceImage: () => ({ width: 2172, height: 724 }) }),
  addCanvas: (key, canvas) => cache.set(key, canvas)
} };

for (const [width, height] of [[46, 46], [118, 44], [410, 86], [454, 646], [1, 1]]) {
  const key = ui.texture(scene, 'button', width, height);
  const canvas = cache.get(key);
  assert.equal(canvas.width, width * 2, 'surface must retain 2x detail');
  assert.equal(canvas.height, height * 2);
  let area = 0;
  for (const call of canvas.calls) {
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = call;
    assert.ok(sx >= 0 && sy >= 0 && sx + sw <= 2172 && sy + sh <= 724, 'source crop must remain inside the image');
    assert.ok(dx >= 0 && dy >= 0 && dx + dw <= canvas.width && dy + dh <= canvas.height, 'slices must fit the destination');
    area += dw * dh;
  }
  assert.equal(area, canvas.width * canvas.height, 'nine slices must cover the face without gaps');
  if (width >= 46) assert.equal(canvas.calls[0][7], 12, '6px corners must keep their size across buttons and panels');
  const count = canvases.length;
  assert.equal(ui.texture(scene, 'button', width, height), key);
  assert.equal(canvases.length, count, 'menu transitions must reuse generated textures');
}

const game = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
const dataIcons = [...game.matchAll(/icon:\s*"(skill-[a-z-]+)"/g)].map(match => match[1]);
for (const icon of dataIcons) assert.ok(Object.hasOwn(ui.ICONS, icon), `${icon} must use an unframed inventory illustration`);
for (const surface of Object.values(ui.SURFACES)) {
  for (const extension of ['png', 'webp']) {
    assert.ok(fs.existsSync(path.join(__dirname, `../assets/images/${surface.key}.${extension}`)), 'both format paths must load');
  }
}
for (const extension of ['png', 'webp']) {
  assert.ok(fs.existsSync(path.join(__dirname, `../assets/images/ui-survival-equipment-extra.${extension}`)), 'supplementary equipment atlas must exist in both formats');
}

const shopBlockMatch = game.match(/const SHOP_CHARACTER_UPGRADES = (\{[\s\S]*?\n  \});/);
assert.ok(shopBlockMatch, 'SHOP_CHARACTER_UPGRADES must exist in game.js');
const shopUpgrades = vm.runInNewContext(`(${shopBlockMatch[1]})`, { SchoolI18n: { t: key => key } });
for (const [charId, items] of Object.entries(shopUpgrades)) {
  const seenCells = new Set();
  for (const item of items) {
    const resolved = ui.resolveIconCell(item.icon);
    assert.ok(resolved, `${charId}:${item.id} (${item.icon}) must resolve to an equipment cell`);
    assert.ok(!seenCells.has(resolved.cell), `${charId} shop upgrades must use distinct icons (${item.id} duplicates cell ${resolved.cell})`);
    seenCells.add(resolved.cell);
  }
}

assert.ok(![4, 7, 3, 1].includes(ui.ICONS['skill-fire-zone']), 'fire zone must not reuse rocket/frost/rifle/ammo');
assert.ok(![4, 7, 3, 1].includes(ui.ICONS['skill-fire-bottle']), 'fire bottle must not reuse rocket/frost/rifle/ammo');
assert.ok(![4, 7, 3, 1].includes(ui.ICONS['skill-fire-sticky']), 'fire sticky must not reuse rocket/frost/rifle/ammo');
assert.ok(![1, 3, 4, 7].includes(ui.ICONS['skill-shock-chain']), 'shock chain must not reuse ammo/rifle/rocket/frost');
assert.ok(![1, 3, 4, 7].includes(ui.ICONS['skill-shock-overload']), 'shock overload must not reuse ammo/rifle/rocket/frost');
assert.ok(![1, 3, 10].includes(ui.ICONS['skill-engineer-nail']), 'engineer nail must not reuse ammo/rifle/turret');
assert.equal(ui.ICONS['skill-engineer-turret'], ui.EQUIPMENT['equipment-turret'], 'engineer turret must use turret icon');
assert.equal(ui.ICONS['skill-engineer-wire'], ui.EQUIPMENT['equipment-wire'], 'engineer wire must use wire icon');
{
  // error_logs 7074-7077: a broken source image made drawImage throw on iOS.
  const brokenCache = new Map();
  let source = { width: 0, height: 0, complete: true, naturalWidth: 0 };
  const brokenScene = { textures: {
    exists: key => brokenCache.has(key),
    get: () => ({ getSourceImage: () => source }),
    addCanvas: (key, canvas) => brokenCache.set(key, canvas)
  } };
  const before = canvases.length;
  const blankKey = ui.texture(brokenScene, 'panel', 120, 40);
  assert.ok(blankKey.endsWith(':blank'), 'broken source must not be baked under the real key');
  assert.equal(brokenCache.get(blankKey).calls.length, 0, 'broken source must never reach drawImage');
  assert.equal(brokenCache.get(blankKey).width, 240);
  assert.equal(ui.texture(brokenScene, 'panel', 120, 40), blankKey, 'blank surface is reused while the source is broken');
  assert.equal(canvases.length, before + 1);
  source = { width: 2172, height: 724, complete: true, naturalWidth: 2172 };
  const realKey = ui.texture(brokenScene, 'panel', 120, 40);
  assert.ok(!realKey.endsWith(':blank'), 'real surface is baked once the source recovers');
  assert.ok(brokenCache.get(realKey).calls.length > 0);
}
console.log('UI surfaces verified: responsive corner sizes, complete coverage, 2x rendering, texture reuse, shop icons, and inventory coverage');
