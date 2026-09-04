import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(main, /const ENABLE_GENERATED_TONE_LOOPS = false;/);
assert.match(
  main,
  /if \(ENABLE_GENERATED_TONE_LOOPS\) this\.createStageStemPlayers\(Tone, 0\);/,
  'disabled stem mixing must not instantiate seven unused stage players'
);
assert.doesNotMatch(main, /\n\s*this\.createStageStemPlayers\(Tone, 0\);/);
assert.match(html, /js\/main\.js\?v=20260904-audio-loading-v1/);

console.log('lumen-shift audio loading policy verified');
