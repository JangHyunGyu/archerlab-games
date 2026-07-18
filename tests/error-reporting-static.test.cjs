const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const reporter = read('shared/client-error-reporter.js');
assert.match(reporter, /remoteReportingEnabled = !isLocalDevelopmentHost/);
assert.match(reporter, /127\(\?:\\\.\\d\+\)\{3\}/);
assert.match(reporter, /if \(!remoteReportingEnabled\) return;/);

const worker = read('game-api-worker.js');
assert.match(worker, /reason: 'local_development_session'/);
assert.match(worker, /reason: 'automated_resource_probe'/);
assert.match(worker, /INSERT OR IGNORE INTO error_logs/);
assert.match(worker, /report_id/);
assert.match(worker, /context\?\.clientReportId/);

const policySource = worker.match(/function isAutomatedResourceProbe\(errorType, userAgent\) \{[\s\S]*?\n\}/);
assert.ok(policySource, 'automated resource probe policy must be defined');
const isAutomatedResourceProbe = Function(
    `${policySource[0]}; return isAutomatedResourceProbe;`,
)();
assert.equal(isAutomatedResourceProbe('resource_error', 'HeadlessChrome/146.0.0.0'), true);
assert.equal(isAutomatedResourceProbe('RESOURCE_ERROR', 'Googlebot/2.1'), true);
assert.equal(isAutomatedResourceProbe('error', 'HeadlessChrome/146.0.0.0'), false);
assert.equal(isAutomatedResourceProbe('resource_error', 'Chrome/146.0.0.0'), false);

for (const relativePath of [
    'solo-leveling/js/scenes/PreloadScene.js',
    'solo-leveling/js/scenes/MenuScene.js',
]) {
    const content = read(relativePath);
    assert.match(content, /if \(this\.textures\.exists\(file\.key\)\) return;/);
}

console.log('error-reporting-static.test.cjs: ok');
