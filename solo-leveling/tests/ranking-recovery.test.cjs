'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const gameScene = read('js/scenes/GameScene.js');
const gameOverScene = read('js/scenes/GameOverScene.js');
const main = read('js/main.js');
const menuScene = read('js/scenes/MenuScene.js');
const i18n = read('js/utils/i18n.js');
const html = read('index.html');

assert.match(gameScene, /const RANK_SYNC_MAX_ATTEMPTS = 3;/);
assert.match(gameScene, /const RANK_SYNC_RETRY_DELAY_MS = 400;/);
assert.match(gameScene, /if \(this\._rankSyncDisabled\) return null;/);
assert.match(gameScene, /for \(let attempt = 0; attempt < RANK_SYNC_MAX_ATTEMPTS; attempt \+= 1\)/);
assert.match(gameScene, /this\._rankSyncFailed = false;\s+return this\._rankSyncedScore;/);
assert.match(gameScene, /let rankSyncFailed = this\._rankSyncDisabled;/);
assert.match(gameScene, /rankSyncDisabled: this\._rankSyncDisabled/);
assert.doesNotMatch(gameScene, /if \(this\._rankSyncFailed \|\| !this\.enemyManager/);
assert.match(gameOverScene, /if \(!this\.finalData\.rankSyncDisabled\) \{\s+this\._reportRankSubmitError/);
assert.match(gameOverScene, /data\?\.rankSyncDisabled \|\| data\?\.__viewState === 'stats'/);
assert.match(gameOverScene, /this\.finalData\.rankSyncDisabled\s+\? t\('continuedRunUnranked'\)/);
assert.equal((i18n.match(/continuedRunUnranked:/g) || []).length, 3);
assert.match(main, /GameScene\.js\?v=20260904-continuation-rank-v1/);
assert.match(main, /GameOverScene\.js\?v=20260904-continuation-rank-v1/);
assert.match(menuScene, /GameScene\.js\?v=20260904-continuation-rank-v1/);
assert.match(html, /js\/main\.js\?v=20260904-continuation-rank-v1/);

console.log('solo-leveling ranking transient recovery verified');
