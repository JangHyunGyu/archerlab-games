import { cpSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const source = fileURLToPath(new URL('../dist/', import.meta.url));
const destination = fileURLToPath(new URL('../../water-sort/', import.meta.url));
// Only the dedicated generated bundle directory is replaced. Source and public assets stay intact.
const assets = path.resolve(destination, 'assets');
if (path.dirname(assets) !== path.resolve(destination) || path.basename(assets) !== 'assets') throw new Error('Unexpected asset target');
rmSync(assets, { recursive: true, force: true });
for (const name of readdirSync(source)) cpSync(path.join(source, name), path.join(destination, name), { recursive: true });

const HREFLANG = [
  '<link rel="alternate" hreflang="ko" href="https://game.archerlab.dev/water-sort/" />',
  '<link rel="alternate" hreflang="en" href="https://game.archerlab.dev/water-sort/index-en" />',
  '<link rel="alternate" hreflang="x-default" href="https://game.archerlab.dev/water-sort/" />',
].join('\n  ');

function ensureHreflang(html) {
  if (html.includes('hreflang="ko"') && html.includes('hreflang="en"') && html.includes('hreflang="x-default"')) return html;
  return html.replace('</head>', `  ${HREFLANG}\n</head>`);
}

function replaceExact(html, from, to, label) {
  if (!html.includes(from)) throw new Error(`English page is missing ${label}`);
  return html.replaceAll(from, to);
}

function englishPage(html) {
  let page = html;
  page = replaceExact(page, '<html lang="ko">', '<html lang="en">', 'html lang');
  page = replaceExact(page, '보글보글 실험실 (Bubbly Lab) | Archerlab Games', 'Bubbly Lab - Free Potion Sort Puzzle | Archerlab Games', 'title');
  page = replaceExact(
    page,
    '<main class="static-intro"><h1>보글보글 실험실 (Bubbly Lab)</h1><p>같은 색 물약을 한 병에 모으세요. 한 스테이지는 60초이고, 갈수록 어려워집니다. 같은 색을 모아 100단계까지 가고, 깬 단계와 점수는 랭킹에 남깁니다. 설치 없이 브라우저에서 바로 시작합니다.</p></main>',
    '<main class="static-intro"><h1>Bubbly Lab</h1><p>Sort matching potion colors into one bottle. You get 60 seconds per stage, and the puzzles get harder as you go. Clear all 100 stages, then save your cleared stages and score to the ranking. Play instantly in your browser, with nothing to install.</p></main>',
    'static intro',
  );
  page = replaceExact(page, '같은 색 물약을 한 병에 모으세요. 한 스테이지는 60초이고, 갈수록 어려워집니다.', 'Sort matching potion colors into one bottle. You get 60 seconds per stage, and the puzzles get harder as you go.', 'description');
  page = replaceExact(page, '보글보글 실험실을 플레이하려면 JavaScript를 켜 주세요.', 'Turn on JavaScript to play Bubbly Lab.', 'noscript');
  page = replaceExact(page, '알록달록 물약 병이 놓인 보글보글 실험실 화면', 'Colorful potion bottles in Bubbly Lab', 'image alt');
  page = replaceExact(page, '<link rel="canonical" href="https://game.archerlab.dev/water-sort/" />', '<link rel="canonical" href="https://game.archerlab.dev/water-sort/index-en" />', 'canonical');
  page = replaceExact(page, '<meta property="og:url" content="https://game.archerlab.dev/water-sort/" />', '<meta property="og:url" content="https://game.archerlab.dev/water-sort/index-en" />', 'og:url');
  let gameSchema = false;
  page = page.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (_, open, json, close) => {
    const schema = JSON.parse(json);
    if (schema['@type'] === 'VideoGame') {
      schema.name = 'Bubbly Lab'; schema.alternateName = ['보글보글 실험실', 'Water Sort Puzzle'];
      schema.inLanguage = 'en'; schema.url = 'https://game.archerlab.dev/water-sort/index-en'; gameSchema = true;
    }
    if (schema['@type'] === 'WebPage') {
      schema.url = 'https://game.archerlab.dev/water-sort/index-en'; schema['@id'] = schema.url + '#webpage';
    }
    return open + JSON.stringify(schema) + close;
  });
  if (!gameSchema) throw new Error('English page is missing its game schema');
  page = replaceExact(page, '<meta property="og:locale" content="ko_KR" />', '<meta property="og:locale" content="en_US" />', 'og:locale');
  if (!page.includes('lang="en"') || !page.includes('https://game.archerlab.dev/water-sort/index-en')) throw new Error('English page head is incomplete');
  if (!/name="robots" content="[^"]*index,\s*follow/.test(page) || page.includes('noindex')) throw new Error('English page must allow indexing');
  return page;
}

function bundleSrc(html) {
  const match = html.match(/src="(\/water-sort\/assets\/[^"]+\.js)"/);
  if (!match) throw new Error('Built page is missing its JS bundle');
  return match[1];
}

const entry = path.join(destination, 'index.html');
const korean = ensureHreflang(readFileSync(entry, 'utf8').replace(/\r\n?/g, '\n'));
const english = englishPage(korean);
if (bundleSrc(korean) !== bundleSrc(english)) throw new Error('English page JS bundle does not match index.html');
writeFileSync(entry, korean);
writeFileSync(path.join(destination, 'index-en.html'), english);
