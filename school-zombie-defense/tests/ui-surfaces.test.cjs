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
console.log('UI surfaces verified: responsive corner sizes, complete coverage, 2x rendering, texture reuse, and inventory coverage');
