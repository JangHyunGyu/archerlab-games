const assert = require('node:assert/strict');
const core = require('../js/core-utils.js');
const persistence = require('../js/persistence.js');

assert.equal(core.clamp(7, 0, 5), 5);
assert.equal(core.formatGameSpeedLabel(2), '×2.0');
assert.equal(core.formatRunClock(125.9), '02:05');
assert.deepEqual(core.shuffleItems([]), []);

const values = new Map();
const storage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key)
};
const store = persistence.create({
  getUpgradeIds: () => ['c_power', 'b_power', 'e_power', 'a_power', 'd_charge'],
  maxLevel: 30,
  clamp: core.clamp,
  cacheKey: 'cache',
  legacySaveKey: 'legacy',
  profileAuthKey: 'profile',
  storage
});

const migrated = store.normalizeMetaSave({ coins: 8.9, upgrades: { gun: 4, bow: 5, launcher: 6 } });
assert.equal(migrated.coins, 8);
assert.deepEqual(migrated.upgrades, { c_power: 4, b_power: 4, e_power: 4, a_power: 5, d_charge: 6 });
store.saveMetaSave(migrated);
assert.deepEqual(store.loadMetaSave(), migrated);
store.saveProfileAuth({ profile_id: 'id', profile_secret: 'secret' });
assert.deepEqual(store.loadProfileAuth(), { profile_id: 'id', profile_secret: 'secret' });
console.log('✓ school zombie core and persistence compatibility verified');
