'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const main = read('js/main.js');

const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
assert.ok(jsonLdMatch, 'structured data must exist');
assert.equal(JSON.parse(jsonLdMatch[1])['@type'], 'VideoGame');

assert.ok(!html.includes('user-scalable=no'));
assert.ok(!html.includes('maximum-scale='));
assert.match(html, /id="best-score"/);
assert.match(html, /id="sound-toggle"/);
assert.match(html, /aria-modal="true"/);
assert.match(html, /<noscript>/);
assert.match(html, /main\.js\?v=20260809-focus-v1/);
assert.match(css, /\.sound-command/);
assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(main, /const SESSION_REQUEST_TIMEOUT_MS = 3000;/);
assert.match(main, /jelly-pang-2048-sound-enabled/);
assert.match(main, /Number\.isFinite\(storedBestScore\)/);
assert.match(main, /init\(\)\.catch/);
assert.match(main, /appCanvas\.tabIndex = 0/);
assert.match(main, /const wasOpen = !refs\.rankModal\.classList\.contains\("hidden"\);/);
assert.match(main, /if \(!wasOpen\) return;/);

for (let rank = 0; rank < 12; rank++) {
  const stem = `jelly-${String(rank).padStart(2, '0')}`;
  assert.ok(fs.existsSync(path.join(__dirname, 'assets', 'images', 'jellies', `${stem}.png`)), `${stem}.png missing`);
  assert.ok(fs.existsSync(path.join(__dirname, 'assets', 'images', 'jellies', `${stem}.webp`)), `${stem}.webp missing`);
}

for (const relativePath of [
  'assets/images/jelly-pang-main-link.png',
  'assets/images/jelly-pang-main-link.webp',
  'assets/images/jelly-pang-link.png',
  'assets/images/jelly-pang-link.webp',
  'assets/images/effects/merge-pop.png',
  'assets/images/effects/merge-pop.webp',
  'assets/images/effects/sparkle-star.png',
  'assets/images/effects/sparkle-star.webp',
  'assets/images/effects/jelly-drop.png',
  'assets/images/effects/jelly-drop.webp',
  'assets/images/effects/crown-burst.png',
  'assets/images/effects/crown-burst.webp',
  'assets/sounds/jelly-slide.mp3',
  'assets/sounds/jelly-merge.mp3',
  'assets/sounds/jelly-merge-combo.mp3',
  'assets/sounds/jelly-bump.mp3',
  'assets/sounds/jelly-win.mp3',
  'assets/sounds/jelly-gameover.mp3',
  'assets/sounds/jelly-start.mp3',
  'assets/sounds/jelly-rank-open.mp3',
  'assets/sounds/jelly-rank-submit.mp3',
]) {
  assert.ok(fs.existsSync(path.join(__dirname, relativePath)), `${relativePath} missing`);
}

console.log('jelly pang static quality tests passed');
