import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'https://game.archerlab.dev';
const DATE = '2026-10-02';
const ORIGIN = '<meta http-equiv="origin-trial" content="Agn9opFYdjvT/UqEIvt4RnCkmN8Kt+8/lzvg731pKSz7MpNoJkLvra/pLOIFgR9GZb39JbBGeJ+CDO++Tus3FggAAABmeyJvcmlnaW4iOiJodHRwczovL2FyY2hlcmxhYi5kZXY6NDQzIiwiZmVhdHVyZSI6IkhUTUxJbkNhbnZhcyIsImV4cGlyeSI6MTc5MjQ1NDQwMCwiaXNTdWJkb21haW4iOnRydWV9">';
const CSS = `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f3ff;color:#25232a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",Arial,sans-serif;line-height:1.75}.shell{width:min(760px,calc(100% - 36px));margin:0 auto;padding:28px 0 72px}.brand{display:inline-flex;align-items:center;color:#37249b;font-weight:800;text-decoration:none;letter-spacing:-.01em}.lang-link{float:right;color:#37249b;font-weight:700;text-decoration:none}.hero{padding:54px 0 34px}.eyebrow{margin:0 0 10px;color:#6c4df6;font-size:.82rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin:0;color:#19171d;font-size:clamp(2rem,6vw,3.35rem);line-height:1.16;letter-spacing:-.045em}.intro{margin:22px 0 0;font-size:1.1rem;color:#514d58}.cta{display:inline-flex;margin-top:26px;padding:13px 22px;border-radius:999px;background:#6c4df6;color:#fff;font-weight:800;text-decoration:none;box-shadow:0 10px 28px color-mix(in srgb,#6c4df6 24%,transparent)}main section{margin-top:28px;padding:26px;background:#fff;border:1px solid color-mix(in srgb,#6c4df6 18%,#ddd);border-radius:18px;box-shadow:0 12px 34px rgba(30,25,35,.06)}h2{margin:0 0 14px;color:#37249b;font-size:1.35rem;line-height:1.35;letter-spacing:-.02em}p{margin:0 0 12px}p:last-child{margin-bottom:0}.faq-wrap{margin-top:36px}.faq-wrap h2{margin-bottom:8px}.faq-wrap details{background:#fff;border:1px solid color-mix(in srgb,#6c4df6 17%,#ddd);border-radius:14px;margin-top:10px;padding:0 18px}.faq-wrap summary{cursor:pointer;padding:16px 0;font-weight:800;color:#302c36}.faq-wrap details p{padding:0 0 17px;color:#56515d}.related{margin-top:36px}.related-grid{display:grid;gap:12px}.related-card{display:grid;gap:6px;padding:18px;background:#fff;border:1px solid color-mix(in srgb,#6c4df6 18%,#ddd);border-radius:14px;text-decoration:none;color:#27232b}.related-card strong{color:#37249b}.related-card span{font-size:.94rem;color:#625d69}.final-cta{margin-top:38px;padding:30px;text-align:center;background:linear-gradient(135deg,#6c4df6,#37249b);border-radius:20px;color:#fff}.final-cta p{font-size:1.05rem}.final-cta .cta{margin-top:10px;background:#fff;color:#37249b;box-shadow:none}footer{margin-top:40px;padding-top:22px;border-top:1px solid color-mix(in srgb,#6c4df6 16%,#ddd);font-size:.9rem;color:#716b77}footer a{color:#37249b}@media(max-width:560px){.shell{width:min(100% - 26px,760px)}.hero{padding:40px 0 24px}main section{padding:21px}.final-cta{padding:24px 18px}.lang-link{float:none;display:inline-block;margin-top:8px}}table{border-collapse:collapse;width:100%;margin:.6rem 0;font-size:.95rem}th,td{border:1px solid #ddd6fb;padding:.45rem .7rem;text-align:left}th{background:#f1eeff}main section ul{margin:.4rem 0 .4rem 1.2rem;padding:0}main section li{margin:.35rem 0}`;

const ui = {
  ko: { eyebrow: '게임 가이드', faq: '자주 묻는 질문', related: '함께 보면 좋은 안내', home: 'ArcherLab Games 홈으로', other: 'English', updated: '업데이트' },
  en: { eyebrow: 'Game guide', faq: 'Questions', related: 'Related guides', home: 'ArcherLab Games home', other: '한국어', updated: 'Updated' }
};

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render(page) {
  const copy = ui[page.lang];
  const url = `${SITE}/seo/${page.slug}`;
  const koUrl = `${SITE}/seo/${page.koSlug}`;
  const enUrl = `${SITE}/seo/${page.enSlug}`;
  const otherUrl = page.lang === 'ko' ? enUrl : koUrl;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'ArcherLab Games', inLanguage: page.lang },
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: page.h1,
        datePublished: DATE,
        dateModified: DATE,
        inLanguage: page.lang,
        author: { '@type': 'Organization', name: 'ArcherLab', url: 'https://archerlab.dev/' },
        publisher: { '@type': 'Organization', name: 'ArcherLab', url: 'https://archerlab.dev/' },
        mainEntityOfPage: { '@id': `${url}#webpage` }
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: page.lang,
        dateModified: DATE,
        isPartOf: { '@id': `${SITE}/#website` }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ArcherLab Games', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: page.crumb, item: url }
        ]
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faqs.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a }
        }))
      }
    ]
  };
  const sections = page.sections.map(section => `<section><h2>${esc(section.h2)}</h2>${section.html}</section>`).join('');
  const faqs = page.faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  const related = page.related.map(card => `<a class="related-card" href="${card.href}"><strong>${esc(card.title)}</strong><span>${esc(card.text)}</span></a>`).join('');
  return `<!doctype html>
<html lang="${page.lang}">
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-66FS0YCEEM"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-66FS0YCEEM');
  </script>
  <script src="../assets/js/ga-engagement.js?v=20260618-engagement" defer></script>
  <meta charset="utf-8">
  ${ORIGIN}
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="ko" href="${koUrl}">
  <link rel="alternate" hreflang="en" href="${enUrl}">
  <link rel="alternate" hreflang="x-default" href="${koUrl}">
  <link rel="sitemap" type="application/xml" href="${SITE}/sitemap.xml">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="ArcherLab Games">
  <meta property="og:locale" content="${page.lang === 'ko' ? 'ko_KR' : 'en_US'}">
  <meta property="og:locale:alternate" content="${page.lang === 'ko' ? 'en_US' : 'ko_KR'}">
  <meta property="og:title" content="${esc(page.title)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(page.title)}">
  <meta name="twitter:description" content="${esc(page.description)}">
  <script type="application/ld+json">${JSON.stringify(graph)}</script>
  <style>${CSS}</style>
</head>
<body>
  <div class="shell">
    <a class="brand" href="/">ArcherLab Games</a>
    <a class="lang-link" href="${otherUrl}">${copy.other}</a>
    <header class="hero">
      <p class="eyebrow">${copy.eyebrow}</p>
      <h1>${esc(page.h1)}</h1>
      <p class="intro">${esc(page.intro)}</p>
      <a class="cta" href="${page.play}">${esc(page.cta)}</a>
    </header>
    <main>${sections}</main>
    <section class="faq-wrap" aria-labelledby="faq-title"><h2 id="faq-title">${copy.faq}</h2>${faqs}</section>
    <nav class="related" aria-labelledby="related-title"><h2 id="related-title">${copy.related}</h2><div class="related-grid">${related}</div></nav>
    <section class="final-cta"><p>${esc(page.closing)}</p><a class="cta" href="${page.play}">${esc(page.cta)}</a></section>
    <footer><a href="/">${copy.home}</a> · <a href="${otherUrl}">${copy.other}</a> · ${copy.updated} ${DATE}</footer>
  </div>
</body>
</html>
`;
}

const catEn = {
  slug: 'cat-tower-guide-en', koSlug: 'cat-tower-guide', enSlug: 'cat-tower-guide-en', lang: 'en',
  title: 'Cat Tower Guide | Tiers, Scores, and Combos',
  h1: 'Cat Tower guide: tiers, scores, and how long a run lasts',
  crumb: 'Cat Tower guide',
  description: 'Cat Tower tier order, score for each merge, combo bonus, the Savannah clear, and the red-line game over. Includes a few placement habits for longer runs.',
  intro: 'Cat Tower is a physics merge puzzle. Two cats of the same tier become one cat of the next tier. Scores jump as the tiers climb, and a crowded board ends the run, so where you drop matters. The numbers below are the ones the game uses.',
  play: '/cat-tower/index-en', cta: 'Play Cat Tower',
  closing: 'Touch two matching cats and they grow one tier. The first run is for learning the merge, not the score.',
  sections: [
    { h2: 'Ten tiers and the score for creating each one', html: `<p>There are ten tiers, from Kitten to Savannah. The score is awarded when that tier is created.</p><table><thead><tr><th>Tier</th><th>Cat</th><th>Score when created</th></tr></thead><tbody><tr><td>1</td><td>Kitten</td><td>10</td></tr><tr><td>2</td><td>Cheese Tabby</td><td>25</td></tr><tr><td>3</td><td>Tuxedo</td><td>55</td></tr><tr><td>4</td><td>Calico</td><td>110</td></tr><tr><td>5</td><td>Mackerel</td><td>220</td></tr><tr><td>6</td><td>Russian Blue</td><td>440</td></tr><tr><td>7</td><td>Scottish Fold</td><td>880</td></tr><tr><td>8</td><td>Persian</td><td>1,700</td></tr><tr><td>9</td><td>Maine Coon</td><td>3,500</td></tr><tr><td>10</td><td>Savannah</td><td>10,000</td></tr></tbody></table><p>The score roughly doubles each tier, then jumps to 10,000 on Savannah. A high score comes from reaching the upper tiers.</p>` },
    { h2: 'You only drop tiers 1 through 5', html: `<p>The cats you drop yourself are Kitten through Mackerel, and those five show up at nearly the same rate. Russian Blue and above exist only as merges. The next cat is shown before you drop, so place the current cat with that next one in mind.</p>` },
    { h2: 'Placements that leave room', html: `<ul><li>Keep large cats near one wall. A large cat in the middle leaves less room for small ones.</li><li>Matching tiers next to each other are more likely to chain.</li><li>Use a small cat to fill a gap between larger ones.</li><li>There is a short wait after each drop, so you cannot spam drops. Use that pause to choose the next spot.</li></ul><p>These are ordinary merge-puzzle habits, not a guaranteed line. The drop order changes every run.</p>` },
    { h2: 'How a combo is scored', html: `<p>If another merge happens within 0.7 seconds, it continues the chain. From the second merge onward, the bonus is 25% of that merge's base score times (chain count minus 1). A Calico worth 110 in a 3-chain gets 110 × 25% × 2 = 55 extra.</p><p>The usual shape is several small cats stacked so they merge one after another. Higher tiers make the bonus larger.</p>` },
    { h2: 'When two Savannahs meet', html: `<p>Two tier-10 Savannahs that touch both disappear and award a 20,000 point bonus. Savannah is the largest cat, so that clear also opens a lot of space. The first Savannah shows a short celebration.</p>` },
    { h2: 'Game over', html: `<p>If the top of a cat stays above the red dotted line for more than 2 seconds, the run ends. Crossing the line does not end it instantly, so a merge can still pull the stack down. A cat you just dropped is briefly left out of that check.</p>` },
    { h2: 'Controls', html: `<ul><li>Phone: drag to aim, tap to drop.</li><li>Desktop: mouse to aim and click to drop. Arrow keys move, Space drops.</li><li>The board is portrait. Turning a phone sideways asks you to rotate back.</li></ul>` }
  ],
  faqs: [
    ['Can I submit a score?', 'On the game over screen, enter a nickname to join the top 20. You can also skip it.'],
    ['Can I resume a run?', 'The menu has Continue for a run saved in this browser. It does not move to another device.'],
    ['What is the highest tier?', 'Savannah, tier 10. Two Savannahs vanish and award 20,000 points.'],
    ['Do I need an install or an account?', 'No. Open the page in a browser. No account is required.']
  ],
  related: [
    { href: '/seo/bubbly-lab-guide-en', title: 'Bubbly Lab guide', text: '60-second stages, the pour queue, and how ranking is scored.' },
    { href: '/seo/jelly-pang-2048-guide-en', title: 'Jelly Pang 2048 guide', text: 'How merges score and what the crown jelly is worth.' },
    { href: '/seo/quick-browser-games-en', title: 'Short browser games', text: 'Pick a puzzle or action game by how long a round takes.' }
  ]
};

const bubblyEn = {
  slug: 'bubbly-lab-guide-en', koSlug: 'bubbly-lab-guide', enSlug: 'bubbly-lab-guide-en', lang: 'en',
  title: 'Bubbly Lab Guide | Sort Potions in 60 Seconds',
  h1: 'Bubbly Lab guide: sort each color into its own bottle',
  crumb: 'Bubbly Lab guide',
  description: 'Bubbly Lab rules, the 100-stage color counts, the 60-second clock, the pour queue, and how score and rank are calculated.',
  intro: 'Bubbly Lab asks you to gather each potion color into one bottle. A stage lasts 60 seconds, and the clock keeps running while liquid is pouring. The rules below match the in-game explanation.',
  play: '/water-sort/index-en', cta: 'Play Bubbly Lab',
  closing: 'Each stage is 60 seconds. Stage 1 uses three colors, which is enough to learn the pour.',
  sections: [
    { h2: 'Rules', html: `<ul><li>A bottle holds four doses.</li><li>Tap the bottle you pour from, then the bottle you pour into. You can also drag one bottle onto another.</li><li>The destination must be empty or topped with the same color, and it needs empty space.</li><li>A run of the same color on top moves together, and the pour stops when the destination is full.</li><li>The stage clears when every color sits full in its own bottle.</li></ul>` },
    { h2: '100 stages', html: `<p>There are 100 stages. The color count rises as you go. Every stage gives you two empty bottles.</p><table><thead><tr><th>Stages</th><th>Colors</th></tr></thead><tbody><tr><td>1-2</td><td>3</td></tr><tr><td>3-5</td><td>4</td></tr><tr><td>6-15</td><td>5</td></tr><tr><td>16-35</td><td>6</td></tr><tr><td>36-65</td><td>7</td></tr><tr><td>66-100</td><td>8</td></tr></tbody></table><p>Later stages inside the same band are deeper puzzles. The arrangement also changes from board to board.</p>` },
    { h2: 'The 60-second clock', html: `<ul><li>Time falls while a pour is still moving. Switching tabs or apps does not pause it.</li><li>Bottles that are not already pouring can pour at the same time. Two pairs that do not share a bottle run side by side.</li><li>If a bottle is busy, or an earlier reservation is waiting, the next pour is queued. The queue holds 5 pours. The number on a bottle is its place in line.</li><li>Choose the next pour against the board you will have after the earlier pours finish.</li><li>Picking the last queued pair again, in the same order, cancels that one reservation. Esc cancels every waiting pour.</li></ul><p>The last pour has to finish for the clear to count. Filling the colors while the final pour is still moving, and letting the clock hit zero, is not a clear.</p>` },
    { h2: 'Dead ends and leaving the board', html: `<p>If the board can no longer be solved, the run ends even with time left, and you can submit the record. The game does not end a board early when it is only unsure.</p><p>The start screen pauses the clock. Continue resets that stage to its opening layout and restores 60 seconds. Score and pour count carry forward, but a stage you already cleared does not pay again.</p>` },
    { h2: 'Score and rank', html: `<p>Each clear pays 1,000 points, plus up to 200 for time left and up to 100 for move count. Rank is sorted by stages cleared, then by score. You can submit even if you never clear stage 1.</p><p>Because stage count comes first, finishing the stage beats spending the clock on a small bonus.</p>` }
  ],
  faqs: [
    ['Can I play with a keyboard?', 'Yes. Tab selects a bottle. Enter or Space confirms. Esc cancels the selection.'],
    ['When does the clock stop?', 'On the start screen. During play it keeps running through pours and while you are in another tab.'],
    ['What happens if I start over?', 'You cannot resume the old run or submit its record. Submit first if you still want that score.'],
    ['Do I need an install or an account?', 'No. A nickname is only for the ranking.']
  ],
  related: [
    { href: '/seo/cat-tower-guide-en', title: 'Cat Tower guide', text: 'Tier order, combo math, and the Savannah bonus.' },
    { href: '/seo/parking-escape-guide-en', title: 'Parking Escape guide', text: 'How the 50 sliding-car levels and the clock work.' },
    { href: '/seo/quick-browser-games-en', title: 'Short browser games', text: 'Pick a game by round length and controls.' }
  ]
};

function pair(ko, en) {
  return [ko, en];
}

const pages = [
  catEn,
  bubblyEn,
  ...pair(
    {
      slug: 'jelly-pang-2048-guide', koSlug: 'jelly-pang-2048-guide', enSlug: 'jelly-pang-2048-guide-en', lang: 'ko',
      title: '젤리팡 2048 공략 | 4×4에서 왕관 젤리까지',
      h1: '젤리팡 2048 공략: 같은 숫자를 밀어 왕관 젤리 만들기',
      crumb: '젤리팡 2048 공략',
      description: '젤리팡 2048의 4×4 밀기 규칙, 합칠 때 점수가 오르는 방식, 2048 왕관 젤리, 게임 오버 조건을 정리했습니다.',
      intro: '보드는 가로세로 4칸입니다. 같은 숫자 젤리 둘을 한 방향으로 밀면 하나로 합쳐지고, 숫자는 두 배가 됩니다. 2에서 두 배씩 열 번 올라가면 2048, 왕관 젤리입니다.',
      play: '/jelly-pang-2048/', cta: '젤리팡 2048 플레이하기',
      closing: '첫 판은 왕관을 노리기보다, 큰 숫자를 한구석에 붙여 두는 감각부터 익혀 보세요.',
      sections: [
        { h2: '움직이는 법', html: '<p>화면을 밀거나, 화면의 방향 버튼, 키보드 방향키, W A S D로 보드 전체를 한 방향으로 밉니다. 빈 칸이 있는 쪽으로 젤리가 이동하고, 맞닿은 같은 숫자만 합쳐집니다.</p><p>한 번 밀 때마다 빈 칸 하나에 새 젤리가 나타납니다. 새로 나오는 값은 2 또는 4입니다.</p>' },
        { h2: '점수', html: '<p>합쳐져 생긴 젤리의 숫자가 점수에 더해집니다. 2와 2가 만나 4가 되면 4점입니다. 숫자가 커질수록 한 번의 합치기가 점수에 크게 남습니다.</p>' },
        { h2: '왕관 젤리', html: '<p>값은 2, 4, 8, 16 순으로 두 배씩 올라갑니다. 2048은 그 열한 번째 값이고, 화면에서는 왕관 젤리로 표시됩니다. 왕관을 만들어도 그 판이 바로 끝나지는 않습니다. 더 큰 수를 이어 갈 수 있습니다.</p>' },
        { h2: '막히기 전에', html: '<ul><li>어느 방향으로도 밀 수 없으면 게임 오버입니다.</li><li>가장 큰 젤리는 한 모서리에 두고, 그 옆에 절반 값을 붙이면 다음 합치기가 짧아집니다.</li><li>큰 젤리를 보드 가운데로 흘리면 빈 칸이 조각나기 쉽습니다.</li></ul><p>새로 놓이는 칸은 판마다 달라서, 같은 배치가 항상 통하지는 않습니다.</p>' },
        { h2: '명예의 전당', html: '<p>판이 끝나면 닉네임으로 점수를 명예의 전당에 올릴 수 있고, 등록을 건너뛸 수도 있습니다. 최고 점수와 닉네임은 그 브라우저에 남습니다.</p>' }
      ],
      faqs: [
        ['2048을 만들면 끝나나요?', '아니요. 왕관 젤리를 만든 뒤에도 판을 이어 갈 수 있습니다. 더 이상 밀 곳이 없을 때 끝납니다.'],
        ['키보드로 할 수 있나요?', '방향키와 W A S D로 밀 수 있습니다. 화면의 방향 버튼과 스와이프도 됩니다.'],
        ['설치나 가입이 필요한가요?', '아니요. 브라우저에서 바로 시작합니다. 랭킹에 올릴 때만 닉네임을 입력합니다.']
      ],
      related: [
        { href: '/seo/lumen-shift-guide', title: '루멘 시프트 공략', text: '100스테이지 낙하 블록과 줄 점수 계산을 정리했습니다.' },
        { href: '/seo/cat-tower-guide', title: '고양이 타워 공략', text: '10단계 진화 점수와 연쇄 콤보를 정리했습니다.' },
        { href: '/seo/quick-browser-games', title: '짧게 즐기는 브라우저 게임', text: '한 판 길이에 맞춰 게임을 골라 보세요.' }
      ]
    },
    {
      slug: 'jelly-pang-2048-guide-en', koSlug: 'jelly-pang-2048-guide', enSlug: 'jelly-pang-2048-guide-en', lang: 'en',
      title: 'Jelly Pang 2048 Guide | Reach the Crown Jelly',
      h1: 'Jelly Pang 2048 guide: slide matching numbers to the crown',
      crumb: 'Jelly Pang 2048 guide',
      description: 'Jelly Pang 2048 rules on the 4×4 board, how a merge scores, what the 2048 crown jelly is, and when the board ends.',
      intro: 'The board is 4 by 4. Slide two jellies with the same number together and they become one jelly of double the value. Ten doublings from 2 reach 2048, the crown jelly.',
      play: '/jelly-pang-2048/index-en', cta: 'Play Jelly Pang 2048',
      closing: 'The first board is for keeping the largest jelly in a corner, not for rushing the crown.',
      sections: [
        { h2: 'How a move works', html: '<p>Swipe, use the on-screen arrows, or press the arrow keys or W A S D. The whole board steps one way. Jellies move into empty cells, and only matching numbers that meet will merge.</p><p>Each move drops a new jelly into an empty cell. The new value is 2 or 4.</p>' },
        { h2: 'Score', html: '<p>The number on the jelly you just created is added to the score. Merging two 2s into a 4 scores 4. Larger merges are worth more because the new value is larger.</p>' },
        { h2: 'The crown jelly', html: '<p>Values double: 2, 4, 8, 16, and so on. 2048 is the eleventh value, shown as the crown jelly. Making it does not end the board. You can keep merging into larger numbers.</p>' },
        { h2: 'Before the board locks', html: '<ul><li>The game ends when no direction has a legal slide.</li><li>Park the largest jelly in a corner and keep half its value beside it.</li><li>Letting a large jelly drift into the middle splits the empty space.</li></ul><p>The empty cell that receives the next jelly changes from board to board, so the same setup does not repeat.</p>' },
        { h2: 'Hall of Fame', html: '<p>At the end of a run you can submit a nickname and score to the Hall of Fame, or skip it. Your best score and nickname stay in this browser.</p>' }
      ],
      faqs: [
        ['Does 2048 end the game?', 'No. You can keep playing after the crown jelly. The board ends when nothing can slide.'],
        ['Does the keyboard work?', 'Arrow keys and W A S D slide the board. On-screen arrows and swipes work too.'],
        ['Do I need an install or an account?', 'No. A nickname is only for the Hall of Fame.']
      ],
      related: [
        { href: '/seo/lumen-shift-guide-en', title: 'Lumen Shift guide', text: '100 stages, line scores, and the other modes.' },
        { href: '/seo/cat-tower-guide-en', title: 'Cat Tower guide', text: 'Tier scores, combos, and the Savannah bonus.' },
        { href: '/seo/quick-browser-games-en', title: 'Short browser games', text: 'Pick a game by how long a round takes.' }
      ]
    }
  ),
  ...pair(
    {
      slug: 'lumen-shift-guide', koSlug: 'lumen-shift-guide', enSlug: 'lumen-shift-guide-en', lang: 'ko',
      title: '루멘 시프트 공략 | 100스테이지 낙하 블록',
      h1: '루멘 시프트 공략: 줄을 지우고 스테이지를 넘기는 법',
      crumb: '루멘 시프트 공략',
      description: '루멘 시프트의 블록 종류, 여정 100스테이지, 줄 점수, 스프린트·울트라·마라톤·릴랙스 모드와 터치 조작을 정리했습니다.',
      intro: '루멘 시프트는 가로 10칸 보드에 블록을 떨어뜨려 가로줄을 지우는 퍼즐입니다. 빛과 음악이 플레이에 반응하고, 여정 모드는 스테이지가 100개입니다.',
      play: '/lumen-shift/', cta: '루멘 시프트 플레이하기',
      closing: '처음에는 여정보다 스프린트로 줄 지우기만 익혀 보세요. 40줄이면 한 판이 짧습니다.',
      sections: [
        { h2: '블록', html: '<p>블록은 I, O, T, S, Z, J, L 일곱 가지입니다. 왼쪽·오른쪽 이동, 회전, 아래 소프트 드롭, 하드 드롭이 있습니다. 가로로 가득 찬 줄은 지워집니다.</p>' },
        { h2: '모드', html: `<ul><li>여정: 스테이지 100개. 스테이지마다 14줄을 지우면 다음으로 넘어갑니다.</li><li>스프린트: 40줄을 지우면 끝입니다.</li><li>울트라: 3분 동안 줄을 지웁니다.</li><li>마라톤: 끝없이 이어지는 줄 지우기입니다.</li><li>릴랙스: 떨어지는 속도가 느리고, 랭킹에는 오르지 않습니다.</li></ul><p>여정, 스프린트, 울트라, 마라톤은 랭킹에 기록을 남길 수 있습니다.</p>` },
        { h2: '줄 점수', html: '<p>한 번에 지운 줄 수에 기본 점수가 있고, 그 값에 현재 레벨을 곱한 뒤 콤보 보너스가 붙습니다. 기본 점수는 1줄 100, 2줄 300, 3줄 500, 4줄 800입니다.</p>' },
        { h2: '터치 버튼', html: '<p>화면 아래 버튼으로 좌우, 소프트 드롭, 회전, 하드 드롭을 누릅니다. 키편집으로 버튼 위치를 옮길 수 있고, Reset으로 그 배치를 되돌립니다. 키보드를 쓰는 쪽은 버튼 없이 플레이할 수 있습니다.</p>' }
      ],
      faqs: [
        ['모바일에서도 되나요?', '터치 버튼이 있습니다. 버튼이 손에 안 맞으면 키편집으로 옮기세요.'],
        ['랭킹에 오르는 모드는 무엇인가요?', '여정, 마라톤, 스프린트, 울트라입니다. 릴랙스는 랭킹에 올리지 않습니다.'],
        ['설치가 필요한가요?', '아니요. 브라우저에서 바로 시작합니다.']
      ],
      related: [
        { href: '/seo/jelly-pang-2048-guide', title: '젤리팡 2048 공략', text: '4×4 머지와 왕관 젤리 점수를 정리했습니다.' },
        { href: '/seo/parking-escape-guide', title: '주차장 탈출 공략', text: '50레벨 슬라이딩 퍼즐과 제한 시간을 정리했습니다.' },
        { href: '/seo/mobile-and-keyboard-web-games', title: '터치와 키보드', text: '기기별로 손이 맞는 게임을 비교합니다.' }
      ]
    },
    {
      slug: 'lumen-shift-guide-en', koSlug: 'lumen-shift-guide', enSlug: 'lumen-shift-guide-en', lang: 'en',
      title: 'Lumen Shift Guide | 100 Falling-Block Stages',
      h1: 'Lumen Shift guide: clear lines and move through the stages',
      crumb: 'Lumen Shift guide',
      description: 'Lumen Shift pieces, the 100-stage journey, line scores, Sprint, Ultra, Marathon, Relax, and the touch controls.',
      intro: 'Lumen Shift drops pieces on a 10-column board and clears full horizontal lines. Light and music react while you play. Journey has 100 stages.',
      play: '/lumen-shift/index-en', cta: 'Play Lumen Shift',
      closing: 'Sprint is the short way to learn the clear. A run ends at 40 lines.',
      sections: [
        { h2: 'Pieces', html: '<p>The seven pieces are I, O, T, S, Z, J, and L. You can move left and right, rotate, soft drop, and hard drop. A full horizontal line clears.</p>' },
        { h2: 'Modes', html: `<ul><li>Journey: 100 stages. Clear 14 lines to advance.</li><li>Sprint: ends at 40 lines.</li><li>Ultra: a 3-minute clear.</li><li>Marathon: lines with no stage end.</li><li>Relax: slower falling speed, and it is not ranked.</li></ul><p>Journey, Sprint, Ultra, and Marathon can submit a ranking.</p>` },
        { h2: 'Line score', html: '<p>Each clear has a base score, multiplied by the current level, then a combo bonus is added. The base is 100 for one line, 300 for two, 500 for three, and 800 for four.</p>' },
        { h2: 'Touch buttons', html: '<p>The buttons under the board are left, right, soft drop, rotate, and hard drop. Edit keys moves those buttons, and Reset puts them back. Keyboard play does not need the buttons.</p>' }
      ],
      faqs: [
        ['Does it work on a phone?', 'Yes. If the buttons sit in the wrong place, use Edit keys.'],
        ['Which modes are ranked?', 'Journey, Marathon, Sprint, and Ultra. Relax is not ranked.'],
        ['Do I need to install it?', 'No. Open it in a browser.']
      ],
      related: [
        { href: '/seo/jelly-pang-2048-guide-en', title: 'Jelly Pang 2048 guide', text: '4×4 merges and the crown jelly score.' },
        { href: '/seo/parking-escape-guide-en', title: 'Parking Escape guide', text: '50 sliding-car levels and the clock.' },
        { href: '/seo/mobile-and-keyboard-web-games-en', title: 'Touch and keyboard', text: 'Which games fit a phone, and which fit a keyboard.' }
      ]
    }
  ),
  ...pair(
    {
      slug: 'parking-escape-guide', koSlug: 'parking-escape-guide', enSlug: 'parking-escape-guide-en', lang: 'ko',
      title: '주차장 탈출 공략 | 50레벨 차 빼기 퍼즐',
      h1: '주차장 탈출 공략: 막힌 차를 밀고 출구로 빼기',
      crumb: '주차장 탈출 공략',
      description: '주차장 탈출의 6칸 보드, 50레벨, 왼쪽 출구, 레벨별 제한 시간, 최소 이동 수와 랭킹을 정리했습니다.',
      intro: '주차장 탈출은 가로세로 6칸 주차장에서 차를 밀고, 목표 차량을 왼쪽 출구로 빼는 퍼즐입니다. 레벨은 50개입니다.',
      play: '/parking-escape/', cta: '주차장 탈출 플레이하기',
      closing: '1레벨은 차가 적습니다. 목표 차의 왼쪽이 비는지부터 보면 규칙이 바로 보입니다.',
      sections: [
        { h2: '규칙', html: '<ul><li>차는 놓인 방향으로만 움직입니다. 가로로 긴 차는 좌우, 세로로 긴 차는 위아래입니다.</li><li>다른 차가 길을 막고 있으면 그 칸으로는 가지 못합니다.</li><li>목표 차량이 왼쪽 출구로 나가면 그 레벨을 클리어합니다.</li><li>화면의 최소 수는 그 배치를 푸는 데 필요한 이동 수입니다.</li></ul>' },
        { h2: '제한 시간', html: '<p>레벨마다 제한 시간이 있습니다. 가장 짧은 시간은 30초이고, 최소 이동 수가 많은 레벨은 그보다 깁니다. 계산은 18초에 최소 이동 수 × 1.5초를 더한 뒤 올림한 값과 30초 중 큰 쪽입니다.</p><p>남은 시간이 5초 이하로 떨어지면 시간 표시가 달라집니다. 0이 되면 그 도전은 실패입니다.</p>' },
        { h2: '50레벨과 랭킹', html: '<p>레벨은 1부터 50까지 이어집니다. 이어서 하면 도달해 둔 레벨부터 다시 시작합니다. 랭킹에는 어디까지 갔는지가 남고, 닉네임을 입력해 등록합니다.</p><p>시간을 아끼려고 막힌 수를 연달아 넣기보다, 목표 차 앞의 한 칸을 먼저 비우는 쪽이 최소 이동에 가깝습니다. 배치마다 정답 수순은 다릅니다.</p>' }
      ],
      faqs: [
        ['레벨은 몇 개인가요?', '50개입니다. 보드는 모두 가로세로 6칸이고 출구는 왼쪽입니다.'],
        ['시간이 레벨마다 같나요?', '아니요. 짧은 퍼즐은 30초이고, 최소 이동이 긴 레벨은 더 긴 시간이 주어집니다.'],
        ['설치가 필요한가요?', '아니요. 브라우저에서 바로 플레이합니다.']
      ],
      related: [
        { href: '/seo/bubbly-lab-guide', title: '보글보글 실험실 공략', text: '60초 스테이지와 붓기 예약을 정리했습니다.' },
        { href: '/seo/lumen-shift-guide', title: '루멘 시프트 공략', text: '낙하 블록 모드와 줄 점수를 정리했습니다.' },
        { href: '/seo/quick-browser-games', title: '짧게 즐기는 브라우저 게임', text: '한 판이 짧은 게임을 모아 두었습니다.' }
      ]
    },
    {
      slug: 'parking-escape-guide-en', koSlug: 'parking-escape-guide', enSlug: 'parking-escape-guide-en', lang: 'en',
      title: 'Parking Escape Guide | 50 Sliding-Car Levels',
      h1: 'Parking Escape guide: slide the blocked cars out',
      crumb: 'Parking Escape guide',
      description: 'Parking Escape on a 6×6 lot, 50 levels, the left exit, the per-level clock, par moves, and ranking.',
      intro: 'Parking Escape is a 6 by 6 lot. Cars slide along their length, and the target car has to leave through the exit on the left. There are 50 levels.',
      play: '/parking-escape/index-en', cta: 'Play Parking Escape',
      closing: 'Level 1 has few cars. Watch whether the space to the left of the target car is open.',
      sections: [
        { h2: 'Rules', html: '<ul><li>A car only moves along the way it is parked. Horizontal cars go left and right. Vertical cars go up and down.</li><li>Another car in the way blocks that slide.</li><li>The level clears when the target car leaves through the left exit.</li><li>The par number is the move count that solves that layout.</li></ul>' },
        { h2: 'Time limit', html: '<p>Every level has a clock. The shortest limit is 30 seconds. Levels with a higher par get more time: take 18 seconds plus 1.5 seconds times the par, round up, and use that if it is above 30.</p><p>The timer changes appearance at 5 seconds or less. Hitting zero fails the attempt.</p>' },
        { h2: '50 levels and rank', html: '<p>Levels run from 1 to 50. Continue resumes the level you had reached. The ranking records how far you got, under the nickname you submit.</p><p>Clearing the cell in front of the target car usually wastes fewer moves than sliding a blocked car back and forth. The shortest path still changes with the layout.</p>' }
      ],
      faqs: [
        ['How many levels are there?', '50. Every board is 6 by 6, and the exit is on the left.'],
        ['Is the clock the same on every level?', 'No. Short puzzles get 30 seconds. A higher par gets a longer clock.'],
        ['Do I need to install it?', 'No. Play it in the browser.']
      ],
      related: [
        { href: '/seo/bubbly-lab-guide-en', title: 'Bubbly Lab guide', text: '60-second stages and the pour queue.' },
        { href: '/seo/lumen-shift-guide-en', title: 'Lumen Shift guide', text: 'Falling-block modes and line scores.' },
        { href: '/seo/quick-browser-games-en', title: 'Short browser games', text: 'Games that fit a short break.' }
      ]
    }
  ),
  ...pair(
    {
      slug: 'school-zombie-defense-guide', koSlug: 'school-zombie-defense-guide', enSlug: 'school-zombie-defense-guide-en', lang: 'ko',
      title: '스쿨 언데드 디펜스 공략 | 세로 화면 학교 디펜스',
      h1: '스쿨 언데드 디펜스 공략: 복도 바리케이드를 버티는 법',
      crumb: '스쿨 언데드 디펜스 공략',
      description: '스쿨 언데드 디펜스의 세로 화면, 위에서 내려오는 좀비, 바리케이드, 스킬 선택, 키보드·게임패드, 암시장 정비소를 정리했습니다.',
      intro: '스쿨 언데드 디펜스는 세로 화면에서 학교 복도를 지키는 디펜스입니다. 좀비는 위에서 아래로 내려오고, 아래쪽 바리케이드를 넘기 전에 막아야 합니다.',
      play: '/school-zombie-defense/', cta: '스쿨 언데드 디펜스 플레이하기',
      closing: '첫 출격은 스킬 이름을 외우기보다, 바리케이드 앞에 몰린 무리부터 보세요.',
      sections: [
        { h2: '한 판의 흐름', html: '<p>출격하면 복도에 방어선이 서고, 웨이브마다 좀비가 위쪽에서 내려옵니다. 쓰러뜨린 뒤 고르는 전술 카드로 공격이 달라지고, 런이 길어지면 석궁, 소총, 로켓, 저격, 화염병, 전격, 엔지니어 지원이 합류합니다.</p><p>화면은 세로에 맞춰져 있습니다. 휴대폰을 가로로 돌리면 세로로 돌리라는 안내가 나옵니다.</p>' },
        { h2: '조작', html: `<ul><li>키보드: Enter로 출격, Esc로 일시정지 또는 뒤로, F로 전투 속도.</li><li>스킬 화면에서는 숫자 1부터 3, 또는 방향키와 Enter로 고릅니다. R은 리롤입니다.</li><li>게임패드: A로 출격 또는 선택, Start로 일시정지, RB로 속도, 방향 패드로 전술 선택, X로 리롤, B로 뒤로.</li></ul>` },
        { h2: '암시장 정비소', html: '<p>런에서 모은 보급으로 캐릭터의 영구 강화를 삽니다. 정비소에서 캐릭터를 고르고, 부품을 올리거나 강화를 초기화해 보급을 되돌릴 수 있습니다. 강화는 그 브라우저에 남습니다.</p>' },
        { h2: '랭킹', html: '<p>출격 기록은 랭킹에 남길 수 있습니다. 메뉴에서 랭킹을 열고, 한 판이 끝난 뒤 닉네임을 등록합니다.</p>' }
      ],
      faqs: [
        ['가로 화면으로 할 수 있나요?', '이 게임은 세로 화면용입니다. 가로로 두면 세로로 돌리라는 안내가 나옵니다.'],
        ['강화는 한 판이 끝나면 사라지나요?', '정비소에서 산 영구 강화는 남습니다. 런 중에 고른 전술 카드는 그 출격의 성장입니다.'],
        ['설치가 필요한가요?', '아니요. 브라우저에서 바로 출격합니다.']
      ],
      related: [
        { href: '/seo/slime-volley-guide', title: '슬라임 배구 공략', text: '봇 연습과 온라인 방의 세트 규칙을 정리했습니다.' },
        { href: '/seo/lumen-shift-guide', title: '루멘 시프트 공략', text: '짧은 스프린트와 100스테이지 여정을 비교합니다.' },
        { href: '/seo/mobile-and-keyboard-web-games', title: '터치와 키보드', text: '액션은 키보드, 퍼즐은 터치가 편한 경우를 비교합니다.' }
      ]
    },
    {
      slug: 'school-zombie-defense-guide-en', koSlug: 'school-zombie-defense-guide', enSlug: 'school-zombie-defense-guide-en', lang: 'en',
      title: 'School Zombie Defense Guide | Portrait Corridor Defense',
      h1: 'School Zombie Defense guide: hold the corridor barricade',
      crumb: 'School Zombie Defense guide',
      description: 'School Zombie Defense in portrait, zombies moving down the corridor, the barricade, skill picks, keyboard and gamepad, and the field armory.',
      intro: 'School Zombie Defense is a portrait defense game in a school corridor. Zombies move from the top toward the bottom, and you hold the barricade before they pass it.',
      play: '/school-zombie-defense/index-en', cta: 'Play School Zombie Defense',
      closing: 'On the first deploy, watch the crowd in front of the barricade before you memorize skill names.',
      sections: [
        { h2: 'A run', html: '<p>Deploy to set the line. Each wave sends zombies down from the top. Tactic cards chosen after the fighting change the attack, and longer runs bring allies: crossbow, rifle, rocket, sniper, molotov, shock, and engineer.</p><p>The game is built for a vertical screen. Turning a phone sideways asks you to rotate back to portrait.</p>' },
        { h2: 'Controls', html: `<ul><li>Keyboard: Enter deploys, Esc pauses or goes back, F changes combat speed.</li><li>On a skill screen, press 1 to 3, or use the arrow keys and Enter. R rerolls.</li><li>Gamepad: A deploys or confirms, Start pauses, RB changes speed, the D-pad picks a tactic, X rerolls, B goes back.</li></ul>` },
        { h2: 'Field armory', html: '<p>Supplies from runs buy permanent upgrades for a character. Pick the character in the armory, raise a part, or reset upgrades to refund supplies. Those upgrades stay in this browser.</p>' },
        { h2: 'Ranking', html: '<p>A deploy can be submitted to the ranking. Open the ranking from the menu, and enter a nickname after the run.</p>' }
      ],
      faqs: [
        ['Can I play in landscape?', 'This game is portrait. A landscape phone is asked to rotate back.'],
        ['Do upgrades disappear when a run ends?', 'Armory upgrades stay. Tactic cards picked during a deploy belong to that run.'],
        ['Do I need to install it?', 'No. Deploy from the browser.']
      ],
      related: [
        { href: '/seo/slime-volley-guide-en', title: 'Slime Volley guide', text: 'Bot practice and the online room rules.' },
        { href: '/seo/lumen-shift-guide-en', title: 'Lumen Shift guide', text: 'A short Sprint beside the 100-stage journey.' },
        { href: '/seo/mobile-and-keyboard-web-games-en', title: 'Touch and keyboard', text: 'Action on a keyboard, puzzles on a phone.' }
      ]
    }
  ),
  ...pair(
    {
      slug: 'slime-volley-guide', koSlug: 'slime-volley-guide', enSlug: 'slime-volley-guide-en', lang: 'ko',
      title: '슬라임 배구 공략 | 봇 연습과 온라인 대전',
      h1: '슬라임 배구 공략: 1대1부터 4대4까지',
      crumb: '슬라임 배구 공략',
      description: '슬라임 배구의 이동·점프, 봇 연습 인원과 난이도, 온라인 방의 세트·점수·듀스 규칙을 정리했습니다.',
      intro: '슬라임 배구는 브라우저에서 하는 슬라임 배구입니다. 봇과 연습하거나, 방을 만들어 1대1부터 4대4까지 온라인으로 붙을 수 있습니다. 화면은 가로가 편합니다.',
      play: '/slimevolley/', cta: '슬라임 배구 플레이하기',
      closing: '온라인 방 전에 연습 모드에서 점프 타이밍만 맞춰 보세요. 솔로 대 솔로, 보통 난이도면 충분합니다.',
      sections: [
        { h2: '조작', html: '<p>이동은 왼쪽·오른쪽 방향키 또는 A, D입니다. 점프는 위 방향키, W, 스페이스 중 하나입니다. 슬라임은 자기 코트 안에서 움직이고, 네트 위로 올라간 공에 몸을 맞춥니다.</p><p>휴대폰을 세로로 들고 있으면 가로로 돌리라는 안내가 나옵니다.</p>' },
        { h2: '혼자 연습', html: '<p>내 팀과 봇 팀을 각각 1명에서 4명까지 고릅니다. 난이도는 쉬움, 보통, 어려움입니다. 설치나 방 없이 바로 시작합니다.</p>' },
        { h2: '온라인 방', html: `<ul><li>닉네임을 넣고 열린 방에 들어가거나, 직접 방을 만듭니다.</li><li>공개방과 비밀방이 있습니다. 비밀방 비밀번호는 숫자 4자리입니다.</li><li>세트는 단판, 3세트 2선승, 5세트 3선승 중에서 고릅니다.</li><li>한 세트 점수는 15, 21, 25 중 하나입니다.</li><li>듀스를 켜면 동점일 때 2점 차이로 세트를 가져갑니다.</li><li>양 팀에 최소 한 명씩 있고, 모두가 준비를 마쳐야 방장이 시작할 수 있습니다.</li></ul><p>호스트가 나가면 남은 사람 중 새 호스트로 연결을 넘깁니다. 그 사이 안내가 뜨고, 연결이 안 되면 빈자리는 봇으로 이어집니다.</p>` }
      ],
      faqs: [
        ['혼자 할 수 있나요?', '연습 모드가 있습니다. 봇 수와 난이도를 고르고 바로 시작합니다.'],
        ['몇 명까지 들어오나요?', '팀당 최대 4명, 양 팀 합쳐 8명입니다. 1대1도 됩니다.'],
        ['계정이 필요한가요?', '아니요. 온라인은 닉네임만 입력합니다.']
      ],
      related: [
        { href: '/seo/school-zombie-defense-guide', title: '스쿨 언데드 디펜스 공략', text: '세로 화면 디펜스의 조작과 정비소를 정리했습니다.' },
        { href: '/seo/quick-browser-games', title: '짧게 즐기는 브라우저 게임', text: '한 판이 짧은 게임과 긴 게임을 나눠 두었습니다.' },
        { href: '/seo/mobile-and-keyboard-web-games', title: '터치와 키보드', text: '키보드 액션과 터치 퍼즐을 비교합니다.' }
      ]
    },
    {
      slug: 'slime-volley-guide-en', koSlug: 'slime-volley-guide', enSlug: 'slime-volley-guide-en', lang: 'en',
      title: 'Slime Volley Guide | Bots and Online Matches',
      h1: 'Slime Volley guide: from 1v1 to 4v4',
      crumb: 'Slime Volley guide',
      description: 'Slime Volley movement and jump, bot practice sizes and difficulty, and the online rules for sets, points, and deuce.',
      intro: 'Slime Volley is browser volleyball with slimes. Practice against bots, or make a room and play online from 1v1 to 4v4. The court wants a landscape screen.',
      play: '/slimevolley/index-en', cta: 'Play Slime Volley',
      closing: 'Before an online room, take one practice match. Solo versus solo on Normal is enough to learn the jump.',
      sections: [
        { h2: 'Controls', html: '<p>Move with the left and right arrows or A and D. Jump with the up arrow, W, or Space. A slime stays on its own side of the court and bumps the ball with its body.</p><p>A portrait phone is asked to rotate to landscape.</p>' },
        { h2: 'Practice', html: '<p>Set your team and the bot team from 1 to 4 slimes each. Difficulty is Easy, Normal, or Hard. It starts without an account or a room.</p>' },
        { h2: 'Online rooms', html: `<ul><li>Enter a nickname, join an open room, or create one.</li><li>Rooms are public or private. A private password is 4 digits.</li><li>Matches are one set, best of 3, or best of 5.</li><li>Each set is played to 15, 21, or 25.</li><li>Deuce means a tied set is won by 2 points.</li><li>Both teams need at least one player, and everyone has to be Ready before the host can start.</li></ul><p>If the host leaves, the room hands the connection to a new host. A notice stays up during that move. If the connection fails, the empty slot continues as a bot.</p>` }
      ],
      faqs: [
        ['Can I play alone?', 'Yes. Practice mode asks for a bot count and a difficulty, then starts.'],
        ['How many players fit?', 'Up to 4 on a team, 8 in the match. 1v1 works too.'],
        ['Do I need an account?', 'No. Online play only asks for a nickname.']
      ],
      related: [
        { href: '/seo/school-zombie-defense-guide-en', title: 'School Zombie Defense guide', text: 'Portrait defense controls and the armory.' },
        { href: '/seo/quick-browser-games-en', title: 'Short browser games', text: 'Short rounds and longer ones, side by side.' },
        { href: '/seo/mobile-and-keyboard-web-games-en', title: 'Touch and keyboard', text: 'Keyboard action next to touch puzzles.' }
      ]
    }
  ),
  ...pair(
    {
      slug: 'quick-browser-games-en', koSlug: 'quick-browser-games', enSlug: 'quick-browser-games-en', lang: 'en',
      title: 'Short Free Browser Games | ArcherLab Games',
      h1: 'Browser games for a 10-minute break',
      crumb: 'Short browser games',
      description: 'Puzzle and action browser games you can start without an install, sorted by how long a round takes and how you control them.',
      intro: 'When you do not want to spend the break on a download or a tutorial, round length and controls matter. These ArcherLab Games fits are grouped by that.',
      play: '/', cta: 'Choose a free game',
      closing: 'Round length and controls decide a break better than a genre label. Start with the one that fits the time you have.',
      sections: [
        { h2: 'If you want to think', html: '<p>Parking Escape and Lumen Shift are readable with the sound off. You can pause, look at the board, and come back.</p><p>Blockpang and Jelly Pang 2048 use rules that take one round to learn, then the fun is nudging the score up.</p><p>Bubbly Lab sorts potion colors into bottles. A stage is 60 seconds, so it breaks cleanly between other things.</p>' },
        { h2: 'If you want speed', html: '<p>Slime Volley starts a match from a few keys. School Zombie Defense and Shadow Survival still fit a short sitting: you grow, then you deal with the next wave.</p><p>Check the keyboard and touch notes on each game before you commit.</p>' },
        { h2: 'Pick for the device in your hand', html: '<p>On a phone, large touch targets and a portrait board are easier. On a desktop, arrow keys or a mouse feel more precise. The portal lists the genre and the controls before you open a game.</p>' }
      ],
      faqs: [
        ['Do I install the games?', 'No. Open a game page in a current browser and start.'],
        ['Do I need an account or a payment?', 'The games are free to play, and you do not create an account first.'],
        ['Does progress sync between phone and PC?', 'Saves that live in the browser do not follow you to another device.']
      ],
      related: [
        { href: '/seo/mobile-and-keyboard-web-games-en', title: 'Touch games and keyboard games', text: 'Which titles fit a phone, and which fit a keyboard.' },
        { href: '/seo/cat-tower-guide-en', title: 'Cat Tower guide', text: 'Tier order, combos, and the Savannah bonus.' },
        { href: '/seo/bubbly-lab-guide-en', title: 'Bubbly Lab guide', text: 'Rules, 100 stages, the pour queue, and ranking.' }
      ]
    },
    {
      slug: 'mobile-and-keyboard-web-games-en', koSlug: 'mobile-and-keyboard-web-games', enSlug: 'mobile-and-keyboard-web-games-en', lang: 'en',
      title: 'Touch Games and Keyboard Games | ArcherLab Games',
      h1: 'Which browser games fit touch, and which fit a keyboard?',
      crumb: 'Touch and keyboard',
      description: 'Compare touch-friendly mobile web games with browser games that feel better on a keyboard, then pick one that matches how you play.',
      intro: 'The same web game feels different when the screen turns or the input changes. Decide whether you are playing one-handed on the move or sitting at a keyboard, then pick.',
      play: '/', cta: 'Find a game for this device',
      closing: 'Screen direction and input change the game more than the genre label. Choose the sitting first.',
      sections: [
        { h2: 'What fits a phone', html: '<p>Puzzles with large blocks, taps, or drags forgive a small screen. Short sessions and a save in the browser are easier to leave and resume.</p><p>Bubbly Lab moves potion by tapping a bottle, and it also accepts a mouse and a keyboard, so the device matters less.</p><p>Check whether the game wants a rotation, and whether it is still playable with the sound off.</p>' },
        { h2: 'What wakes up on a keyboard', html: '<p>Action that needs a precise move and a fast reaction has a clearer feel on the arrow keys or WASD. A wide screen also makes enemies and obstacles easier to read.</p><p>Read the control note on the game card and learn the keys and the pause before the first run.</p>' },
        { h2: 'Choose the setup before the genre', html: '<p>Puzzle versus action is not enough. Device, minutes per round, and whether you can use sound should come first. Then compare the descriptions on the portal.</p>' }
      ],
      faqs: [
        ['Does every game support touch?', 'No. The recommended input differs. Check the game page for touch or keyboard.'],
        ['Can a browser game go fullscreen?', 'Some browsers and games support it. On a phone, adding the page to the home screen can be easier.'],
        ['Will a low-end device run them?', 'Most are light. Games with a lot of animation still vary with the device and the browser.']
      ],
      related: [
        { href: '/seo/quick-browser-games-en', title: 'Games for a short break', text: 'Puzzle and action games sorted by round length and controls.' },
        { href: '/seo/cat-tower-guide-en', title: 'Cat Tower guide', text: 'Tier order, combos, and the Savannah bonus.' },
        { href: '/seo/bubbly-lab-guide-en', title: 'Bubbly Lab guide', text: 'Rules, 100 stages, the pour queue, and ranking.' }
      ]
    }
  )
];

const hreflangPatches = [
  ['quick-browser-games.html', 'quick-browser-games', 'quick-browser-games-en'],
  ['mobile-and-keyboard-web-games.html', 'mobile-and-keyboard-web-games', 'mobile-and-keyboard-web-games-en'],
  ['cat-tower-guide.html', 'cat-tower-guide', 'cat-tower-guide-en'],
  ['bubbly-lab-guide.html', 'bubbly-lab-guide', 'bubbly-lab-guide-en']
];

for (const page of pages) {
  writeFileSync(path.join(dir, `${page.slug}.html`), render(page));
}

for (const [file, koSlug, enSlug] of hreflangPatches) {
  const filePath = path.join(dir, file);
  let html = readFileSync(filePath, 'utf8');
  const canonical = `${SITE}/seo/${koSlug}`;
  const links = `<link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="ko" href="${canonical}">
  <link rel="alternate" hreflang="en" href="${SITE}/seo/${enSlug}">
  <link rel="alternate" hreflang="x-default" href="${canonical}">`;
  if (!html.includes('hreflang="en"')) {
    html = html.replace(`<link rel="canonical" href="${canonical}">`, links);
  }
  if (!html.includes(enSlug)) {
    html = html.replace(
      '<footer><a href="/">ArcherLab Games 홈으로</a>',
      `<footer><a href="/">ArcherLab Games 홈으로</a> · <a href="/seo/${enSlug}">English</a>`
    );
  }
  writeFileSync(filePath, html);
}

const sitemapPath = path.join(dir, '..', 'sitemap.xml');
let sitemap = readFileSync(sitemapPath, 'utf8');
const legacyKorean = ['quick-browser-games', 'mobile-and-keyboard-web-games', 'cat-tower-guide', 'bubbly-lab-guide'];
const locs = [...legacyKorean, ...pages.map(page => page.slug)].map(slug => `  <url>
    <loc>${SITE}/seo/${slug}</loc>
    <lastmod>${DATE}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`);
const block = `<!-- traffic-pages:start -->\n${locs.join('\n')}\n<!-- traffic-pages:end -->`;
if (!sitemap.includes('<!-- traffic-pages:start -->')) {
  throw new Error('sitemap traffic marker missing');
}
sitemap = sitemap.replace(/<!-- traffic-pages:start -->[\s\S]*?<!-- traffic-pages:end -->/, block);
writeFileSync(sitemapPath, sitemap);
console.log(`wrote ${pages.length} traffic pages`);
