const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

const html = read('index.html');
const main = read('assets/js/main.js');
const serviceWorker = read('service-worker.js');
const version = JSON.parse(read('version.json'));

assert.match(html, /main\.js\?v=20260816-pause-guard-v1/);
assert.match(main, /let resolving = false;/);
assert.match(main, /function pauseGame\(\{ playSound = true \} = \{\}\)/);
assert.match(main, /function resumeGame\(\)/);
assert.match(main, /document\.addEventListener\('visibilitychange'/);
assert.match(main, /if \(document\.hidden\) pauseGame\(\{ playSound: false \}\)/);
assert.match(main, /window\.addEventListener\('pagehide', \(\) => pauseGame/);
assert.match(main, /if \(state\?\.status === 'paused'\)/);
assert.match(main, /input\.setEnabled\(!resolving\)/);
assert.match(serviceWorker, /jewelria-v0\.3\.2-pause-guard/);
assert.equal(version.version, '0.3.2');
assert.equal(version.build, '2026-08-16');

console.log('jewelria pause lifecycle quality tests passed');
