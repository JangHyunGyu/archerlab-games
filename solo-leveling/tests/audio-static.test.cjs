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
    'overlapping decoded SFX must remain protected by the compressor'
);
assert.match(
    soundManagerSource,
    /gain\.gain\.linearRampToValueAtTime\(0, now \+ buffer\.duration\)/,
    'decoded SFX must retain a click-free release ramp'
);

console.log('solo-leveling audio static regression verified: tonal BGM and click-free SFX bus');
