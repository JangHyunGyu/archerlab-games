'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const effects = read('js/EffectManager.js');
const game = read('js/Game.js');
const input = read('js/InputManager.js');
const smoke = read('visual-smoke.cjs');

function section(start, end) {
    const from = effects.indexOf(start);
    const to = effects.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, 'missing effect section: ' + start);
    return effects.slice(from, to);
}

assert.match(effects, /playPlacementImpact\(x, y, color = 0x44FF88, cellCount = 1\)/);
assert.match(effects, /playPrismaticFlare\(x, y, color = 0x44FF88, intensity = 1\)/);
assert.match(effects, /playBoardResonance\(boardGlobalPos, lineCount = 1/);
assert.match(effects, /if \(minSide < 520\) return 420;/);
assert.match(effects, /if \(minSide < 900\) return 620;/);
assert.equal(
    (effects.match(/this\.particles\.push\(/g) || []).length,
    1,
    'particles must pass through the capped helper'
);
assert.equal((input.match(/effects\.particles\.push\(/g) || []).length, 0, 'input particles must use the capped helper');
assert.equal((input.match(/effects\._pushParticle\(/g) || []).length, 2, 'both drag trail variants must use the capped helper');

const placement = section('playPlacementImpact(', '// ── Ring Burst');
assert.ok(!placement.includes('vfxComboBurstSheet'), 'placement must preserve combo VFX rarity');
assert.match(placement, /effectSoftBurst/);
assert.match(placement, /playPrismaticFlare/);
assert.match(placement, /playRadialRays/);

const lineSweep = section('playLineSweep(', 'playBoardResonance(');
assert.equal((lineSweep.match(/vfxLineClearSheet/g) || []).length, 2);
assert.match(lineSweep, /rotation: 0,/);
assert.match(lineSweep, /rotation: Math\.PI \* 0\.5,/);

const combo = section('playComboEffect(', '\n    showComboPopup(');
assert.ok(!combo.includes('tier >= 2'));
assert.ok(!combo.includes('tier >= 3'));
assert.match(combo, /vfxRewardNovaSheet/);
assert.match(combo, /playPrismaticFlare/);
assert.match(effects, /const textFitScale = Math\.min\(/);
assert.match(game, /this\.effects\.playPlacementImpact\(/);
assert.match(game, /this\.effects\.playBoardResonance\(/);
assert.match(smoke, /BLOCKPANG_EFFECT_SHOWCASE/);
assert.match(smoke, /peakParticles <= metrics\.effectDiagnostics\.particleBudget/);

for (const file of ['index.html', 'index-en.html']) {
    const html = read(file);
    assert.ok(html.includes('EffectManager.js?v=20260825-renderer-fallback-v1'));
    assert.ok(html.includes('Game.js?v=20260825-renderer-fallback-v1'));
}

console.log('blockpang effect quality tests passed');
