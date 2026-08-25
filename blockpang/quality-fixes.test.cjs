'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

const game = read('js/Game.js');
const input = read('js/InputManager.js');
const sound = read('js/SoundManager.js');
const score = read('js/ScoreManager.js');
const ui = read('js/UIManager.js');
const constants = read('js/constants.js');
const main = read('js/main.js');

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

test('renderer probe replaces a broken WebGL application with Canvas before game startup', async () => {
  const initOptions = [];
  const applications = [];
  const capturedErrors = [];
  const capturedWarnings = [];
  const sandboxConsole = {
    error: (...args) => capturedErrors.push(args),
    warn: (...args) => capturedWarnings.push(args),
  };

  class FakeGraphics {
    rect() { return this; }
    fill() { return this; }
    destroy() { this.destroyed = true; }
  }

  class FakeApplication {
    constructor() {
      this.destroyed = false;
      this.stage = {
        addChild: child => { this.probe = child; },
        removeChild: child => { this.removedProbe = child; },
      };
      this.renderer = {
        render: () => {
          if (applications.indexOf(this) === 0) {
            sandboxConsole.error('PixiJS Error: Could not initialize shader');
            throw new TypeError("Cannot read properties of undefined (reading 'value')");
          }
        },
      };
      applications.push(this);
    }

    async init(options) { initOptions.push(options); }
    destroy() { this.destroyed = true; }
  }

  const sandbox = {
    PIXI: { Application: FakeApplication, Graphics: FakeGraphics },
    console: sandboxConsole,
  };
  const helperSource = main.slice(0, main.indexOf('// ─── Entry Point ───'));
  vm.runInNewContext(helperSource, sandbox);

  const application = await sandbox.createBlockpangApplication({
    preference: ['webgl'],
    antialias: true,
    resolution: 2,
  });

  assert.equal(applications.length, 2);
  assert.equal(applications[0].destroyed, true);
  assert.equal(application, applications[1]);
  assert.deepEqual(Array.from(initOptions[1].preference), ['canvas']);
  assert.equal(initOptions[1].antialias, false);
  assert.equal(initOptions[1].resolution, 1);
  assert.equal(initOptions[1].autoStart, false);
  assert.equal(capturedErrors.length, 0);
  assert.equal(capturedWarnings.length, 1);
});

console.log('blockpang quality fix tests passed');
