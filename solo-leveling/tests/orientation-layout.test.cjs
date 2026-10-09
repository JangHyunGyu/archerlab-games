const assert = require('assert');
const fs = require('fs');
const path = require('path');

const main = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, '..', 'js', 'scenes', 'GameScene.js'), 'utf8');
const level = fs.readFileSync(path.join(__dirname, '..', 'js', 'scenes', 'LevelUpScene.js'), 'utf8');

const applyAt = main.indexOf('function applyViewport()');
const applyFn = main.slice(applyAt, main.indexOf('function scheduleViewportSync'));
assert.ok(applyFn.length > 0, 'viewport apply must live in main.js');
assert.ok(
    applyFn.indexOf('syncCanvasDisplaySize(nextViewport)') < applyFn.indexOf('game.scale.refresh()'),
    'pointer scale must be refreshed after the canvas CSS size is written'
);
assert.match(applyFn, /lockDocumentToVisualViewport\(\)/, 'rotation must pin the page to the visual viewport');
assert.match(main, /boxPortrait === visualPortrait/, 'a stale container on the old orientation must not win');
assert.doesNotMatch(
    main,
    /container\?\.clientWidth \|\| viewport\?\.width/,
    'container size must not override a newer visual viewport'
);

const resizeAt = game.indexOf('this._onGameResize = () => {');
const resizeFn = game.slice(resizeAt, game.indexOf('this.events.on(\'game-resize\''));
assert.match(resizeFn, /cam\.centerOn\(this\.player\.x, this\.player\.y\)/, 'the player must stay centered after a rotation');
assert.match(resizeFn, /this\._relayoutStartupOverlay\(\)/, 'the boot gate must rebuild in the new frame');
assert.match(resizeFn, /this\.hud\.rebuild\(\)/, 'the HUD must rebuild in the new frame');
assert.match(resizeFn, /this\.shadowArmyManager\?\.syncScreenLayout\?\.\(\)/, 'an arise overlay must follow the new frame');
assert.match(resizeFn, /new MobileControls\(this\)/, 'touch controls must be recreated for the new frame');
assert.match(resizeFn, /this\.systemMessage\.relayout\(\)/, 'a visible system message must move with the frame');

assert.match(level, /this\._redraw\(\)/, 'level-up cards must redraw on rotation');
assert.doesNotMatch(
    level.slice(level.indexOf('_onGameResize'), level.indexOf('this.events.on(\'game-resize\'')),
    /if \(!this\._selectionLocked\) this\._redraw\(\)/,
    'a rotation during the choice animation must still redraw'
);

console.log('solo-leveling orientation layout verified: visual viewport, pointer scale, and in-run UI');
