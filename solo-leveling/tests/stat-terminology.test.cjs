const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const constantsSource = fs.readFileSync(path.join(root, 'js', 'utils', 'Constants.js'), 'utf8');
const i18nSource = fs.readFileSync(path.join(root, 'js', 'utils', 'i18n.js'), 'utf8');

assert.match(
    constantsSource,
    /strength:\s+\{ name: '공격력 강화', description: '공격력 \+8%', stat: 'attack', bonus: 0\.08/,
    'the attack passive must use the same user-facing term as the attack stat',
);
assert.doesNotMatch(constantsSource, /name: '힘 강화'/, 'strength must not be presented as a physical-only stat');
assert.match(i18nSource, /strength: \{ name: '공격력 강화', desc: '공격력 \+8%' \}/);
assert.match(i18nSource, /strength: \{ name: 'Attack Boost', desc: 'Attack \+8%' \}/);
assert.match(i18nSource, /strength: \{ name: '攻撃力強化', desc: '攻撃力 \+8%' \}/);

console.log('attack terminology verified: character-neutral labels in ko/en/ja');
