'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'shared/pixi-asset-base.js'), 'utf8');
assert.match(script, /resolver\.basePath\s*=\s*new URL\(\s*["']\.\/["']/);

const pages = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'tmp' || entry.name === 'water-sort-src') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) pages.push(full);
  }
}
walk(root);

const pixi = /<script src="[^"]*pixi-8\.19\.0\.min\.js"><\/script>/;
const fixer = /<script src="[^"]*shared\/pixi-asset-base\.js\?v=20261009-asset-base-v1"><\/script>/;
let covered = 0;
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  if (!pixi.test(html)) continue;
  covered++;
  const pixiAt = html.search(pixi);
  const fixerAt = html.search(fixer);
  assert.ok(fixerAt > pixiAt, `${path.relative(root, file)} must load pixi-asset-base.js after Pixi`);
}
assert.equal(covered, 11);
console.log(`pixi asset base: ${covered} pages pin the resolver to the game directory`);
