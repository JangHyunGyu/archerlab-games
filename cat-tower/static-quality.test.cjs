'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const repoRoot = path.resolve(root, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const sharedCss = fs.readFileSync(path.join(repoRoot, 'shared', 'start-screen-premium.css'), 'utf8');
const game = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');

assert.match(html, /style\.css\?v=20260904-paper-path-v1/);
assert.match(game, /const SAVE_KEY = 'cat-tower\.save\.v1'/);
assert.match(game, /document\.addEventListener\('visibilitychange'/);
assert.match(game, /function resumeGame\(\)/);
assert.match(sharedCss, /var\(--ui-paper\)/);

const paperPath = css.match(/--ui-paper:\s*url\(["']?([^"')]+)["']?\)/)?.[1];
assert.equal(paperPath, '../cat-tower/assets/ui/paper-texture.webp');
assert.ok(fs.existsSync(path.resolve(root, paperPath)), 'paper texture must resolve from the game stylesheet');
assert.ok(
  fs.existsSync(path.resolve(repoRoot, 'shared', paperPath)),
  'paper texture must also resolve when the custom property is consumed by shared CSS'
);

console.log('cat-tower static quality checks passed');
