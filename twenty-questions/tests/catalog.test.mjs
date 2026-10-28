import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_CATALOG } from '../../server/twenty-questions/seed-catalog.mjs';

const normalized = (value) => value.normalize('NFC').trim().toLowerCase();

test('initial catalog has 200 independently addressable bilingual concepts', () => {
  assert.equal(SEED_CATALOG.length, 200);
  const ids = new Set();
  const categories = new Set();
  for (const entry of SEED_CATALOG) {
    assert.match(entry.id, /^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(entry.id), `Duplicate concept ID: ${entry.id}`);
    ids.add(entry.id);
    categories.add(entry.category);
    assert.equal(entry.id.split('.')[0], entry.category);
    assert.match(entry.ko, /[가-힣]/, `Missing Korean display name: ${entry.id}`);
    assert.match(entry.en, /[a-z]/i, `Missing English display name: ${entry.id}`);
    assert.equal(entry.ko, entry.ko.normalize('NFC').trim());
    assert.equal(entry.en, entry.en.trim());
    assert.ok(Array.isArray(entry.aliasesKo));
    assert.ok(Array.isArray(entry.aliasesEn));
  }
  assert.ok(categories.size >= 6, 'The catalog must not collapse into one narrow subject');
});

test('an accepted name cannot silently identify two different seed concepts', () => {
  for (const language of ['ko', 'en']) {
    const owners = new Map();
    for (const entry of SEED_CATALOG) {
      const aliases = language === 'ko' ? entry.aliasesKo : entry.aliasesEn;
      for (const value of [entry[language], ...aliases]) {
        assert.equal(typeof value, 'string');
        assert.ok(value.trim(), `Empty alias: ${entry.id}`);
        const name = normalized(value);
        assert.ok(!owners.has(name) || owners.get(name) === entry.id,
          `${language} name ${value} collides between ${owners.get(name)} and ${entry.id}`);
        owners.set(name, entry.id);
      }
    }
  }
});

test('every answer has a bounded fact card rather than only a label', () => {
  for (const entry of SEED_CATALOG) {
    assert.equal(typeof entry.facts, 'string');
    assert.ok(entry.facts.length >= 150, `Fact card too thin: ${entry.id}`);
    assert.ok(entry.facts.length <= 900, `Fact card unexpectedly large: ${entry.id}`);
    const sentences = entry.facts.match(/[.!?](?:\s|$)/g) || [];
    assert.ok(sentences.length >= 5 && sentences.length <= 8,
      `Expected 5-8 concrete sentences: ${entry.id}`);
    assert.doesNotMatch(entry.facts, /\b(?:TODO|TBD|lorem ipsum|placeholder)\b/i);
  }
});

test('aliases preserve specificity for easily confused concepts', () => {
  const find = (id) => SEED_CATALOG.find((entry) => entry.id === id);
  assert.ok(find('animal.penguin'));
  assert.ok(find('animal.chipmunk'));
  assert.ok(find('plant.rice-plant'));
  assert.ok(find('food.cooked-rice'));
  assert.ok(find('food.plum'));
  assert.ok(find('transport.ship'));
  assert.ok(!find('animal.penguin').aliasesEn.includes('bird'));
  assert.ok(!find('animal.blue-whale').aliasesEn.includes('whale'));
  assert.ok(!find('plant.aloe-vera').aliasesKo.includes('알로에'));
  assert.ok(!find('object.spoon').aliasesKo.includes('수저'));
});
