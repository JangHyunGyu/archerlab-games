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
    /limiter\.threshold\.value = -1\.5/,
    'the limiter must only catch overs, not pump every noisy SFX'
);
assert.match(
    soundManagerSource,
    /_rebuildLimiter/,
    'waking the tab must replace the limiter whose envelope survived suspend'
);
assert.match(
    soundManagerSource,
    /_suppressToneUntil/,
    'notes scheduled into a waking context must be dropped'
);
assert.match(
    soundManagerSource,
    /this\._bgmStarting = bgmToken/,
    'an in-flight BGM start must keep its own generation across hide'
);
assert.match(
    soundManagerSource,
    /this\._introStarting = introToken/,
    'an in-flight intro start must keep its own generation across hide'
);
assert.match(
    soundManagerSource,
    /_outputGain\.connect\(ctx\.destination\)/,
    'the mute gate must sit in front of the device'
);
const hideFn = soundManagerSource.slice(
    soundManagerSource.indexOf('_handleVisibilityChange() {'),
    soundManagerSource.indexOf('async _settleAfterShow() {')
);
assert.ok(hideFn.length > 0, 'visibility handler must stay in SoundManager');
assert.match(hideFn, /releaseCombatVoices\(\)/, 'hiding the tab must drop live combat voices');
assert.match(hideFn, /stopGameBGM\(true\)/, 'hiding the tab must tear the synths down before suspend');
assert.doesNotMatch(
    hideFn,
    /_sfxGain\.gain\.value = this\.enabled \? this\._sfxMaster : 0/,
    'hide must not snap the SFX fader back open on the next show'
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
assert.match(soundManagerSource, /_musicIn/, 'BGM must enter the shared sum on the dry music bus');
assert.match(soundManagerSource, /_takeToneSlot/, 'late music callbacks must skip missed notes instead of bursting');
assert.doesNotMatch(soundManagerSource, /new Tone\.Freeverb/, 'Freeverb denormals crackle when the main thread stalls');
assert.doesNotMatch(soundManagerSource, /new Tone\.FeedbackDelay/, 'the feedback delay is a second denormal tail on the music bus');
assert.doesNotMatch(soundManagerSource, /new Tone\.Compressor/, 'the music compressor gain-rides the bed into crackle');
assert.doesNotMatch(soundManagerSource, /new Tone\.Chorus/, 'chorus modulation flutters on the same bus as the safety limiter');
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
assert.match(gameSource, /_bloomSuspendedForLevelUp/, 'level-up must turn bloom off while the choice is open');
assert.match(gameSource, /this\.scene\.setVisible\(false\)/, 'level-up must stop the live battle render');
const levelUpBlurFn = gameSource.slice(
    gameSource.indexOf('_addLevelUpBlur() {'),
    gameSource.indexOf('removeLevelUpBlur() {')
);
assert.doesNotMatch(levelUpBlurFn, /addBlur\(/, 'level-up must not keep a full-screen blur running');

const levelSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'scenes', 'LevelUpScene.js'), 'utf8');
assert.match(levelSource, /restoreLevelUpMix\(\)/, 'leaving the choice screen must restore the BGM level');
assert.match(levelSource, /setBackgroundColor\(SYSTEM\.BG_DEEP\)/, 'the choice screen must cover the hidden battle');

const genSource = fs.readFileSync(path.join(__dirname, '..', 'gen_all_sounds.js'), 'utf8');
const levelupGen = genSource.slice(genSource.indexOf('10. LEVELUP'), genSource.indexOf('11. RANKUP'));
assert.doesNotMatch(levelupGen, /addNoiseBands\(/, 'the level-up sting must stay tonal');
const selectAt = genSource.indexOf("name === 'select.wav'");
const selectGen = genSource.slice(selectAt, genSource.indexOf('continue;', selectAt));
assert.ok(selectGen.length > 0, 'select cue generator must stay in the source');
assert.doesNotMatch(selectGen, /addNoiseBands\(/, 'the card click must stay tonal');

console.log('solo-leveling audio static regression verified: tonal BGM and click-free SFX bus');
