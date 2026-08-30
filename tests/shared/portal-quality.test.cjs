const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/games.json'), 'utf8'));

test('portal lists every configured game inside an accessible main landmark', () => {
  assert.match(html, /<main id="games" class="games-grid" aria-label="게임 목록">/);
  assert.match(html, /class="skip-link" href="#games"/);

  const cardLinks = [...html.matchAll(/<a href="([^"#]+\/)" class="game-card\b/g)].map(match => match[1]);
  assert.equal(cardLinks.length, config.games.length);
  for (const game of config.games) assert.ok(cardLinks.includes(`${game.id}/`), `missing ${game.id} portal card`);
});

test('portal copy stays player-facing and consistently localized', () => {
  assert.doesNotMatch(html, /\b(?:PixiJS|GSAP|Phaser|D1)\b/);
  assert.doesNotMatch(html, /(?:Puzzle|Action|Sports|Defense)\s*\//);
  assert.match(html, /설치 없이 바로 즐기는 브라우저 게임/);
});

test('portal interaction and compact-layout safeguards remain present', () => {
  assert.match(html, /\.game-card:focus-visible/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /minmax\(min\(100%, 300px\), 1fr\)/);
  assert.match(html, /blockpang\/blox_pang_link\.webp/);
  assert.match(html, /cat-tower\/cat-tower_link\.webp/);
});
