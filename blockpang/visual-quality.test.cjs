'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const board = read('js/Board.js');
const piece = read('js/Piece.js');
const game = read('js/Game.js');

assert.ok(
    !board.includes('getBlockpangTexture(\'crystalSheen\')'),
    'the non-seamless crystal material sheet must not be stretched over the board'
);
assert.match(board, /const BOARD_TILE_VISUAL_SCALE = 0\.94;/);
assert.match(board, /const BOARD_GHOST_VISUAL_SCALE = 0\.90;/);
assert.match(board, /sprite\.anchor\.set\(0\.5\);/);
assert.match(board, /sprite\.position\.set\(\(col \+ 0\.5\) \* cs, \(row \+ 0\.5\) \* cs\);/);

assert.match(piece, /_getTrayCellSize\(piece\)/);
assert.match(piece, /\(this\._slotWidth \* widthRatio\) \/ cols/);
assert.match(piece, /\(this\._trayAreaHeight \* heightRatio\) \/ rows/);
assert.ok(!piece.includes('const maxDim = 5;'), 'tray pieces must be sized by their actual shape');
assert.match(piece, /fill\(\{ color: 0x020B1E, alpha: 0\.24 \}\)/);

assert.match(game, /const coverScale = Math\.max\(w \/ textureW, h \/ textureH\);/);
assert.ok(!game.includes('bgSprite.width = w;'), 'square background must preserve its aspect ratio');
assert.match(game, /const landscapeTrayH = Math\.max\(144, Math\.min\(210, h \* 0\.25\)\);/);
assert.ok(!game.includes('0.62) / PANEL_RATIO'), 'desktop board must not use the undersized fixed ratio');

const cacheVersion = '20260719-quality-v1';
for (const file of ['index.html', 'index-en.html']) {
    const html = read(file);
    for (const script of ['constants', 'SoundManager', 'ScoreManager', 'EffectManager', 'Board', 'Piece', 'InputManager', 'UIManager', 'Game', 'main']) {
        assert.ok(
            html.includes('src="js/' + script + '.js?v=' + cacheVersion + '"'),
            file + ' must cache-bust ' + script + '.js'
        );
    }
}

const uiDir = path.join(root, 'assets', 'ui');
const tileFiles = fs.readdirSync(uiDir)
    .filter((name) => /^block-tile-\d-.*\.png$/.test(name))
    .sort();
assert.equal(tileFiles.length, 8, 'all eight high-resolution block tile sources must exist');

for (const name of tileFiles) {
    const png = fs.readFileSync(path.join(uiDir, name));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', name + ' must be a PNG');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.ok(width >= 192 && height >= 192, name + ' must be at least 192x192');
}

console.log('blockpang visual quality tests passed');
