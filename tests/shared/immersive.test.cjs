const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../../shared/immersive.js'), 'utf8');

function setup(options = {}) {
  const calls = [];
  const listeners = {};
  const document = { documentElement: {}, addEventListener: (name, fn) => { listeners[name] = fn; } };
  if (!options.unsupported) document.documentElement[options.webkit ? 'webkitRequestFullscreen' : 'requestFullscreen'] = (value) => {
    calls.push(value);
    if (options.reject) return Promise.reject(new Error('denied'));
    if (options.throws) throw new Error('blocked');
    return options.webkit ? undefined : Promise.resolve();
  };
  const window = { document, navigator: { userActivation: { isActive: true }, standalone: options.standalone }, matchMedia: () => ({ matches: false }), addEventListener: (name, fn) => { listeners[name] = fn; } };
  vm.runInNewContext(code, { window });
  return { api: window.ArcherImmersive, calls, window, document, listeners, click: (kind, trusted = true) => listeners.click({ isTrusted: trusted, target: { closest: selector => selector.includes(kind) } }) };
}

test('fullscreen requests the whole document and hides browser navigation', async () => {
  const s = setup();
  assert.equal(await s.api.autoEnter(), true);
  assert.equal(s.calls[0].navigationUI, 'hide');
  await s.api.autoEnter();
  assert.equal(s.calls.length, 1, 'do not reenter automatically after Escape');
  await s.api.enter();
  assert.equal(s.calls.length, 2, 'explicit settings toggle can reenter');
});
test('parallel requests share one pending transition', async () => {
  const s = setup();
  await Promise.all([s.api.enter(), s.api.enter()]);
  assert.equal(s.calls.length, 1);
});
test('legacy void return, denied permission and unsupported browsers never break startup', async () => {
  for (const options of [{ webkit: true }, { reject: true }, { throws: true }, { unsupported: true }]) {
    const s = setup(options);
    assert.equal(await s.api.enter(), Boolean(options.webkit));
  }
});
test('standalone launch and inactive gestures need no fullscreen request', async () => {
  const s = setup({ standalone: true });
  assert.equal(await s.api.enter(), true);
  assert.equal(s.calls.length, 0);
  const inactive = setup();
  inactive.window.navigator.userActivation.isActive = false;
  await inactive.api.autoEnter();
  inactive.window.navigator.userActivation.isActive = true;
  await inactive.api.autoEnter();
  assert.equal(inactive.calls.length, 1);
});
test('links, forms, scrollable ranking and synthetic events never consume activation', async () => {
  for (const kind of ['a,', 'input', 'textarea', 'select', '[contenteditable]', '[data-ranking-scroll]', '[data-no-fullscreen]']) {
    const s = setup(); s.click(kind); assert.equal(s.calls.length, 0);
  }
  const s = setup(); s.click('canvas', false); assert.equal(s.calls.length, 0);
  s.click('canvas'); await Promise.resolve(); assert.equal(s.calls.length, 1);
});
test('exit denial is handled and the settings toggle follows actual fullscreen state', async () => {
  const s = setup();
  s.document.fullscreenElement = s.document.documentElement;
  s.document.exitFullscreen = () => Promise.reject(new Error('denied'));
  assert.equal(await s.api.toggle(), false);
  assert.equal(s.calls.length, 0);
});
test('canvas touch and keyboard menus enter even without a compatibility click', () => {
  const touch = setup();
  touch.listeners.pointerup({ isTrusted: true, target: { closest: selector => selector.includes('canvas') } });
  assert.equal(touch.calls.length, 1);
  const keyboard = setup();
  keyboard.document.querySelector = () => ({});
  keyboard.listeners.keydown({ isTrusted: true, key: 'Enter', target: { tagName: 'A' } });
  assert.equal(keyboard.calls.length, 0, 'home navigation retains keyboard activation');
  keyboard.listeners.keydown({ isTrusted: true, key: 'Enter', target: { tagName: 'BODY' } });
  assert.equal(keyboard.calls.length, 1);
});
test('back-forward cache restoration allows a fresh start gesture', async () => {
  const s = setup();
  await s.api.autoEnter();
  s.listeners.pageshow({ persisted: false });
  await s.api.autoEnter();
  assert.equal(s.calls.length, 1);
  s.listeners.pageshow({ persisted: true });
  await s.api.autoEnter();
  assert.equal(s.calls.length, 2);
});


test('every localized game shell has a local immersive helper and an unrestricted app manifest', () => {
  const repo = path.resolve(__dirname, fs.existsSync(path.join(__dirname, '../../config/games.json')) ? '../..' : '..');
  let entries;
  if (fs.existsSync(path.join(repo, 'config/games.json'))) {
    const games = JSON.parse(fs.readFileSync(path.join(repo, 'config/games.json'), 'utf8')).games;
    entries = games.flatMap(game => fs.readdirSync(path.join(repo, game.id)).filter(name => /^index(?:-[a-z]+)?\.html$/.test(name)).map(name => `${game.id}/${name}`));
  } else if (fs.existsSync(path.join(repo, 'game.html'))) {
    entries = fs.readdirSync(repo).filter(name => /^(?:index|game|gallery)(?:-[a-z]+)?\.html$/.test(name));
  } else {
    entries = ['index.html', ...['en','ja','es','fr','de','pt'].map(lang => `${lang}/index.html`)];
  }
  for (const entry of entries) {
    const html = fs.readFileSync(path.join(repo, entry), 'utf8');
    assert.match(html, /<script[^>]+src="[^"]*immersive\.js\?v=/, entry);
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/, entry);
    assert.doesNotMatch(html, /<a\b(?=[^>]*href="https:\/\/archerlab\.dev\/?")(?=[^>]*target="_blank")[^>]*>/, entry);
    const ref = html.match(/rel="manifest" href="([^"]+)"/)[1];
    const manifestPath = ref.startsWith('/') ? path.join(repo, ref) : path.resolve(repo, path.dirname(entry), ref);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.display, 'fullscreen', entry);
    assert.equal(manifest.orientation, 'any', entry);
    assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone']);
    for (const icon of manifest.icons) {
      const iconPath = icon.src.startsWith('/') ? path.join(repo, icon.src) : path.resolve(path.dirname(manifestPath), icon.src);
      assert.ok(fs.existsSync(iconPath), `${entry}: missing install icon`);
    }
  }
});
