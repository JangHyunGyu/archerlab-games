import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const pages = ['index.html', 'index-en.html'].map((name) => fs.readFileSync(path.join(root, name), 'utf8'));

assert.match(main, /this\.on\(window, "blur", \(\) => this\.stopRepeat\(\)\)/);
assert.match(main, /this\.on\(document, "visibilitychange", \(\) => \{\s*if \(document\.hidden\) this\.stopRepeat\(\);/);
for (const html of pages) {
  assert.match(html, /js\/main\.js\?v=20260913-concept-ui-v2&ranking=20261004-ranking-audit-v1&i18n=20261002-en-page-v1&input=20261009-repeat-blur-v1/);
}

console.log('lumen-shift hold repeat stops when the window blurs or hides');
