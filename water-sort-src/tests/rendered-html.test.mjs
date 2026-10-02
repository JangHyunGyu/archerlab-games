import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

test('static subfolder output has metadata, reachable assets, and no server catalog', async () => {
  const html = await readFile(new URL('../../water-sort/index.html', import.meta.url), 'utf8');
  assert.match(html, /lang="ko"/);
  assert.match(html, /<title>보글보글 실험실 \(Bubbly Lab\) \| Archerlab Games<\/title>/);
  assert.match(html, /60?/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /https:\/\/game.archerlab.dev\/water-sort\//);
  for (const [, file] of html.matchAll(/(?:src|href)="(\/water-sort\/assets\/[^\"]+)"/g)) {
    assert.ok((await readFile(new URL(`../../${file}`, import.meta.url))).length);
  }
  const files = await readdir(new URL('../../water-sort/assets/', import.meta.url));
  const js = (await Promise.all(files.filter(f => f.endsWith('.js')).map(f => readFile(new URL(`../../water-sort/assets/${f}`, import.meta.url), 'utf8')))).join('');
  assert.match(js, /game-api\.yama5993\.workers\.dev\/water-sort\/challenge/);
  assert.doesNotMatch(js, /challenge-levels|"optimalMoves"|INSERT INTO water_sort_runs/);
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /100dvh/);
  const english = await readFile(new URL('../../water-sort/index-en.html', import.meta.url), 'utf8');
  assert.match(english, /<html lang="en">/);
  assert.match(english, /<link rel="canonical" href="https:\/\/game\.archerlab\.dev\/water-sort\/index-en"\s*\/>/);
  const bundle = html => {
    const match = html.match(/src="(\/water-sort\/assets\/[^"]+\.js)"/);
    assert.ok(match, 'js bundle');
    return match[1];
  };
  assert.equal(bundle(english), bundle(html));
});
