const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../../shared/immersive.js'), 'utf8');

function setup(options = {}) {
  const calls = [];
  const listeners = {};
  const timeouts = [];
  const classNames = new Set();
  const style = { transform: '', setProperty(name, value) { this[name] = value; } };
  const document = {
    documentElement: {
      style,
      clientHeight: options.innerHeight || 800,
      classList: {
        add: name => classNames.add(name),
        remove: name => classNames.delete(name),
        toggle(name, force) {
          const on = force === undefined ? !classNames.has(name) : !!force;
          if (on) classNames.add(name); else classNames.delete(name);
          return on;
        },
        contains: name => classNames.has(name)
      }
    },
    body: {},
    activeElement: options.activeElement || { matches: () => false, closest: () => null },
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  if (!options.unsupported) document.documentElement[options.webkit ? 'webkitRequestFullscreen' : 'requestFullscreen'] = (value) => {
    calls.push(value);
    if (options.reject) return Promise.reject(new Error('denied'));
    if (options.throws) throw new Error('blocked');
    return options.webkit ? undefined : Promise.resolve();
  };
  const window = {
    document,
    innerHeight: options.innerHeight || 800,
    navigator: {
      userActivation: { isActive: true },
      standalone: options.standalone,
      virtualKeyboard: options.keyboard ? {
        overlaysContent: false,
        boundingRect: { height: options.keyboard },
        addEventListener() {}
      } : undefined
    },
    visualViewport: options.visualViewport,
    matchMedia: () => ({ matches: false }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
    clearTimeout() {}
  };
  vm.runInNewContext(code, { window });
  return { api: window.ArcherImmersive, calls, window, document, listeners, timeouts, style, click: (kind, trusted = true) => listeners.click({ isTrusted: trusted, target: { closest: selector => selector.includes(kind) } }) };
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
test('a denied first request does not lock the start gesture', async () => {
  const s = setup({ reject: true });
  assert.equal(await s.api.autoEnter(), false);
  assert.equal(await s.api.autoEnter(), false);
  assert.equal(s.calls.length, 2, 'failed autoEnter must retry on the next gesture');
});
test('touch pointerdown does not request fullscreen', () => {
  const s = setup();
  s.listeners.pointerdown?.({ isTrusted: true, pointerType: 'touch', target: { closest: () => null } });
  assert.equal(s.calls.length, 0);
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
test('lifts the layout briefly after fullscreen so the browser exit hint does not cover controls', async () => {
  const s = setup();
  await s.api.enter();
  s.document.fullscreenElement = s.document.documentElement;
  s.listeners.fullscreenchange();
  assert.match(s.style.transform, /translate3d\(0,-80px,0\)/);
  assert.equal(s.timeouts[0].ms, 2530);
  s.timeouts[0].fn();
  assert.equal(s.style.transform, '');
});
test('lifts by virtual keyboard height when fullscreen overlays the composer', () => {
  const s = setup({ keyboard: 320, activeElement: { matches: sel => sel.includes('textarea'), closest: () => null } });
  s.document.fullscreenElement = s.document.documentElement;
  s.listeners.fullscreenchange();
  assert.equal(s.style.transform, '', 'fullscreen keyboard inset is applied by the app, not by translating the document');
  assert.equal(s.style['--immersive-keyboard-inset'], '320px');
  assert.equal(s.api.keyboardOverlap(), 320);
});
test('keyboard overlap uses visual viewport shrink in windowed layout and the virtual keyboard in fullscreen overlay', () => {
  const s = setup();
  assert.equal(s.api.keyboardOverlapFrom({
    editing: true, innerHeight: 800, clientHeight: 800, vvHeight: 480, vvOffsetTop: 0, vkHeight: 0
  }), 320);
  assert.equal(s.api.keyboardOverlapFrom({
    editing: true, innerHeight: 800, clientHeight: 800, vvHeight: 800, vvOffsetTop: 0, vkHeight: 320
  }), 320);
  assert.equal(s.api.keyboardOverlapFrom({
    editing: false, innerHeight: 800, clientHeight: 800, vvHeight: 480, vvOffsetTop: 0, vkHeight: 320
  }), 0);
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
    let html = fs.readFileSync(path.join(repo, entry), 'utf8');
    const gzipPayload = html.match(/var b64 = "([A-Za-z0-9+/=]+)"/);
    if (gzipPayload) html = require('zlib').gunzipSync(Buffer.from(gzipPayload[1], 'base64')).toString('utf8');
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
