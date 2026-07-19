'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

const game = read('js/Game.js');
const input = read('js/InputManager.js');
const sound = read('js/SoundManager.js');
const score = read('js/ScoreManager.js');
const ui = read('js/UIManager.js');
const constants = read('js/constants.js');

assert.match(game, /const previousBestScore = this\.scoreManager\.bestScore;/);
assert.match(game, /this\.scoreManager\.score > previousBestScore/);
assert.match(sound, /blockpang_sound_enabled/);
assert.match(sound, /localStorage\.setItem\('blockpang_sound_enabled'/);
assert.match(score, /Number\.isFinite\(storedBest\)/);
assert.match(input, /selectKeyboardPiece\(slotIndex\)/);
assert.match(input, /confirmKeyboardPlacement\(\)/);
assert.match(ui, /const resultFrameTexture = null;/);
assert.match(ui, /const nameFrameTexture = null;/);
assert.ok(!constants.includes("crystalSheen: 'assets/ui/crystal-sheen"));
assert.ok(!constants.includes("ghostValidCell: 'assets/ui/ghost-valid-cell"));

for (const file of ['index.html', 'index-en.html']) {
  const html = read(file);
  assert.ok(!html.includes('user-scalable=no'));
  assert.ok(!html.includes('maximum-scale='));
  assert.match(html, /id="game-loading"/);
  assert.match(html, /id="game-instructions"/);
  assert.match(html, /<noscript>/);
}

console.log('blockpang quality fix tests passed');
