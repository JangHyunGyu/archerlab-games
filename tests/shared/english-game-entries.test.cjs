'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const game of ['jewelria', 'solo-leveling']) {
  test(`${game}: English entry contains the complete game and static English metadata`, () => {
    const ko = read(`${game}/index.html`);
    const en = read(`${game}/index-en.html`);
    assert.match(en, /<html lang="en">/);
    assert.ok(en.includes(`rel="canonical" href="https://game.archerlab.dev/${game}/index-en"`));
    for (const html of [ko, en]) {
      assert.ok(html.includes(`hreflang="ko" href="https://game.archerlab.dev/${game}/"`));
      assert.ok(html.includes(`hreflang="en" href="https://game.archerlab.dev/${game}/index-en"`));
    }
    assert.doesNotMatch(en, /http-equiv="refresh"|location\.replace|navigator\.userAgent|content="noindex/);
    assert.match(en, game === 'jewelria' ? /id="board"/ : /id="game-container"/);
    assert.match(en, /<script type="module" src="(?:assets\/)?js\/main\.js/);
    assert.doesNotMatch(read('_redirects'), new RegExp(`^/${game}/index-en\\s`, 'm'));
  });

  test(`${game}: old English URLs redirect once, keeping unrelated parameters`, async () => {
    const module = await import('data:text/javascript;base64,' + Buffer.from(read(`functions/${game}/index.js`)).toString('base64'));
    const context = { request: new Request(`https://game.archerlab.dev/${game}/?lang=en&start=1&from=old`), next() { throw new Error('unexpected fallback'); } };
    const response = await module.onRequest(context);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), `https://game.archerlab.dev/${game}/index-en?start=1&from=old${game === 'solo-leveling' ? '&_lang_entry=20261012' : ''}`);
    for (const query of ['', '?lang=ko', '?lang=ja', '?lang=invalid']) {
      const unchanged = new Response('unchanged');
      assert.equal(await module.onRequest({ request: new Request(`https://game.archerlab.dev/${game}/${query}`), next: () => unchanged }), unchanged);
    }
    const preview = await module.onRequest({ request: new Request(`https://preview.archerlab-games.pages.dev/${game}/`), next: () => new Response('unchanged') });
    assert.equal(preview.headers.get('x-robots-tag'), 'noindex, follow');
    assert.equal(await preview.text(), 'unchanged');
  });
}

test('language redirects invoke Functions only on the two game roots', () => {
  const routes = JSON.parse(read('_routes.json'));
  assert.deepEqual(routes.include, ['/jewelria', '/jewelria/', '/solo-leveling', '/solo-leveling/']);
  assert.deepEqual(routes.exclude, []);
});

function languageState(pathname, search, saved = 'ko', pageLang = 'ko') {
  const source = read('solo-leveling/js/utils/i18n.js').split('const TEXTS =')[0]
    .replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
  const store = new Map([['shadow_survival_lang', saved], ['shadow_save', 'preserved-game-save']]);
  const location = { pathname, search, href: 'https://game.archerlab.dev' + pathname + search };
  const history = { state: { retained: true }, replaceState(state, unused, url) { this.url = String(url); this.state = state; } };
  const context = { URL, URLSearchParams, window: { location, history }, document: { documentElement: { lang: pageLang } }, navigator: { language: 'en-US' }, localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) } };
  vm.runInNewContext(source + '\nglobalThis.result = { get: () => LANG, setLang };', context);
  return { ...context.result, store, history };
}

test('explicit English entry wins over old language storage and conflicting queries', () => {
  assert.equal(languageState('/solo-leveling/index-en', '', 'ko').get(), 'en');
  assert.equal(languageState('/solo-leveling/index-en.html', '?lang=ja', 'ja').get(), 'en');
  assert.equal(languageState('/solo-leveling/', '?lang=en', 'ko').get(), 'en');
  assert.equal(languageState('/solo-leveling/', '?lang=ja', 'en').get(), 'ja');
  assert.equal(languageState('/solo-leveling/', '', 'en').get(), 'ko');
});

test('language selection updates the address without navigating or changing game saves', () => {
  const state = languageState('/solo-leveling/index-en', '?from=menu');
  state.setLang('ko');
  assert.equal(state.get(), 'ko');
  assert.equal(state.history.url, 'https://game.archerlab.dev/solo-leveling/?from=menu');
  state.setLang('ja');
  assert.equal(state.history.url, 'https://game.archerlab.dev/solo-leveling/?from=menu&lang=ja');
  assert.equal(state.store.get('shadow_save'), 'preserved-game-save');
  assert.equal(state.history.state.retained, true);
});

test('early language selection also supports older cached Shadow runtimes', () => {
  const html = read('solo-leveling/index-en.html');
  const bootstrap = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const store = new Map([['shadow_survival_lang', 'ko'], ['saved_progress', 'unchanged']]);
  vm.runInNewContext(bootstrap, {
    URLSearchParams, location: { pathname: '/solo-leveling/index-en', search: '' },
    document: { documentElement: { lang: 'en' } },
    localStorage: { setItem: (key, value) => store.set(key, value) }
  });
  assert.equal(store.get('shadow_survival_lang'), 'en');
  assert.equal(store.get('saved_progress'), 'unchanged');
  assert.doesNotThrow(() => vm.runInNewContext(bootstrap, {
    URLSearchParams, location: { pathname: '/solo-leveling/index-en', search: '' },
    document: { documentElement: { lang: 'en' } },
    localStorage: { setItem() { throw new Error('Storage blocked'); } }
  }));
});
