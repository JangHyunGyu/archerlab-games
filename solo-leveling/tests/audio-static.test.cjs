const assert = require('assert');
const fs = require('fs');
const path = require('path');

const soundManagerSource = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'managers', 'SoundManager.js'),
    'utf8'
);

assert.doesNotMatch(
    soundManagerSource,
    /new Tone\.NoiseSynth/,
    'procedural white-noise bursts sound like recurring static during play'
);
assert.doesNotMatch(
    soundManagerSource,
    /noise:\s*\{\s*type:\s*['"]white['"]\s*\}/,
    'the soundtrack must not reintroduce a white-noise percussion layer'
);
assert.match(
    soundManagerSource,
    /createDynamicsCompressor\(\)/,
    'the shared output still needs a safety limiter'
);
assert.match(
    soundManagerSource,
    /_limiter\.threshold\.value = -1\.5/,
    'the limiter must only catch overs, not pump every noisy SFX'
);
assert.doesNotMatch(
    soundManagerSource,
    /threshold\.value = -22/,
    'a -22 dB compressor gain-rides noise layers into crackle'
);
assert.match(
    soundManagerSource,
    /_sfxGain\.connect\(this\._masterSum\)/,
    'SFX and BGM must share one sum so they cannot clip at the device'
);
assert.match(
    soundManagerSource,
    /gain\.gain\.linearRampToValueAtTime\(0, now \+ buffer\.duration\)/,
    'decoded SFX must retain a click-free release ramp'
);
assert.match(
    soundManagerSource,
    /createMediaElementSource\(audio\)/,
    'HTML fallback must enter the same bus instead of a second device mix'
);

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
assert.match(mainSource, /noAudio:\s*true/, 'Phaser must not open a second AudioContext');

const gameSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'scenes', 'GameScene.js'), 'utf8');
assert.match(
    gameSource,
    /prepareLevelUpMix\(\);\s*this\.soundManager\.play\('levelup'\)/,
    'level-up must clear combat tails before the sting'
);
assert.match(gameSource, /_bloomSuspendedForLevelUp/, 'level-up must not stack a second live blur on bloom');

const levelSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'scenes', 'LevelUpScene.js'), 'utf8');
assert.match(levelSource, /restoreLevelUpMix\(\)/, 'leaving the choice screen must restore the BGM level');

console.log('solo-leveling audio static regression verified: tonal BGM and click-free SFX bus');
