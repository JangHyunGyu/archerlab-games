const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');

function method(name, globals = {}) {
  const start = source.search(new RegExp(`^    (?:async )?${name}\\(`, 'm'));
  assert.ok(start >= 0, `missing method ${name}`);
  const end = source.indexOf('\n    }', start) + 6;
  return vm.runInNewContext(`({${source.slice(start, end)}}).${name}`, {
    SHOP_CHARACTERS: [{ id: 'c', accent: 1 }], SHOP_MAX_LEVEL: 30,
    COLORS: { gold: 1, red: 2 }, getShopUpgradeCost: () => 200,
    formatShopCost: String, ...globals
  });
}

function setup() {
  const calls = { sync: 0, posts: 0, refresh: 0, confirmation: 0, notices: [], busy: [] };
  const shopUI = { setBusy: value => calls.busy.push(value), refresh: () => calls.refresh++ };
  const scene = {
    mode: 'shop', profileReady: true, shopUI, meta: { coins: 1000 },
    getCharacterShopUpgrades: () => [{ id: 'c_power', title: 'Power' }],
    getMetaUpgradeLevel: () => 0, getShopResetRefund: () => 200,
    ensureServerProfile: async () => { calls.sync++; },
    postProfileAction: async () => { calls.posts++; return { level: 1, refund: 200 }; },
    unlockAudio() {}, playSfx() {}, showToast: value => calls.notices.push(value),
    showShopResetConfirmLayer: () => calls.confirmation++,
    showShopResetNoticeLayer: () => calls.notices.push('no-refund')
  };
  for (const name of ['buyShopUpgrade', 'resetShopUpgrades', 'showShopActionLoading', 'clearShopActionLoading']) scene[name] = method(name);
  return { scene, calls, shopUI };
}

test('repeated purchase presses share the busy lock before profile sync yields', async () => {
  const { scene, calls, shopUI } = setup();
  let release;
  scene.ensureServerProfile = () => { calls.sync++; return new Promise(resolve => { release = resolve; }); };
  const first = scene.buyShopUpgrade('c_power');
  await scene.buyShopUpgrade('c_power');
  assert.equal(calls.sync, 1);
  assert.equal(scene.shopActionInFlight, true);
  release();
  await first;
  assert.equal(calls.posts, 1);
  assert.equal(calls.refresh, 1);
  assert.equal(scene.shopUI, shopUI, 'purchase must keep the current dialog');
  assert.equal(scene.shopActionInFlight, false);
});

test('insufficient funds, max level and sync failure leave the dialog usable', async () => {
  for (const kind of ['funds', 'max', 'sync']) {
    const { scene, calls, shopUI } = setup();
    if (kind === 'funds') scene.meta.coins = 0;
    if (kind === 'max') scene.getMetaUpgradeLevel = () => 30;
    if (kind === 'sync') scene.ensureServerProfile = async () => { throw new Error('offline'); };
    await scene.buyShopUpgrade('c_power');
    assert.equal(calls.posts, 0);
    assert.equal(scene.shopActionInFlight, false);
    assert.equal(scene.shopUI, shopUI);
  }
});

test('leaving during profile sync cannot buy or reset in another shop instance', async () => {
  for (const action of ['buyShopUpgrade', 'resetShopUpgrades']) {
    const { scene, calls } = setup();
    let release;
    scene.ensureServerProfile = () => new Promise(resolve => { release = resolve; });
    const pending = scene[action](action === 'buyShopUpgrade' ? 'c_power' : true);
    scene.shopUI = {};
    release();
    await pending;
    assert.equal(calls.posts, 0);
    assert.equal(calls.refresh, 0);
  }
});

test('refund requires confirmation and refreshes the same dialog after completion', async () => {
  const { scene, calls, shopUI } = setup();
  await scene.resetShopUpgrades();
  assert.equal(calls.confirmation, 1);
  assert.equal(calls.posts, 0);
  await scene.resetShopUpgrades(true);
  assert.equal(calls.posts, 1);
  assert.equal(calls.refresh, 1);
  assert.equal(scene.shopUI, shopUI);
  assert.equal(scene.shopActionInFlight, false);
});

test('failed purchase keeps the dialog and reconciles its balance', async () => {
  const { scene, calls, shopUI } = setup();
  scene.postProfileAction = async () => { throw new Error('network'); };
  await scene.buyShopUpgrade('c_power');
  await Promise.resolve();
  assert.equal(scene.shopUI, shopUI);
  assert.equal(scene.shopActionInFlight, false);
  assert.equal(calls.refresh, 1);
  assert.equal(calls.notices.length, 1);
});

test('late profile sync refreshes the shop without opening maintenance or replacing another screen', async () => {
  for (const leave of [false, true]) {
    let release;
    let refreshed = 0;
    let options;
    const ui = { refresh: () => refreshed++, notify() {} };
    const scene = {
      mode: 'menu', shopSelectedCharacter: 'c', profileReady: false,
      clearOverlay() { this.overlayObjects = []; }, startBgm() {}, playSfx() {},
      add: { image: () => ({ setDisplaySize() { return this; }, setDepth() { return this; } }) },
      ensureServerProfile: () => new Promise(resolve => { release = resolve; })
    };
    const showShop = method('showShop', {
      announceGameStatus() {}, document: { getElementById: () => ({}) },
      window: { SchoolZombieShop: { create: value => { options = value; return ui; } } }
    });
    showShop.call(scene);
    assert.equal(options.initialOpen, undefined, 'the shop must start with the dialog closed');
    if (leave) scene.shopUI = null;
    release();
    await Promise.resolve();
    assert.equal(refreshed, leave ? 0 : 1);
  }
});
