const fs = require('fs');
const path = require('path');

const SITE = 'https://game.archerlab.dev';
const LASTMOD = '2026-07-07';

const PAGES = [
  {
    slug: 'museolchi-webgame',
    lang: 'ko',
    h1: '무설치 웹게임 - 다운로드 없이 바로 플레이',
    title: '무설치 웹게임 추천 | 다운로드 없이 즐기는 무료 게임',
    meta: '다운로드·설치 없이 브라우저에서 바로 즐기는 무료 웹게임 모음. 블럭팡, 고양이 타워, 슬라임 발리볼까지.',
    keywords: '무설치 웹게임, 무료 브라우저 게임, 고양이 타워, 블럭팡, 슬라임 발리볼',
    intro: '"무설치 웹게임"을 찾는 이유는 단순합니다. 지금 바로 5분만 가볍게 놀고 싶다는 것. 광고로 도배된 사이트 말고, 깔끔한 게임 모음입니다.',
    ctaHref: '/'
  },
  {
    slug: 'muryo-browser-game',
    lang: 'ko',
    h1: '무료 브라우저 게임 추천 - PC·모바일 동일 플레이',
    title: '무료 브라우저 게임 추천 | PC·모바일 동시 지원 2026',
    meta: '결제 없이 즐기는 무료 브라우저 게임. PC와 모바일 모두 동일하게 동작하는 캐주얼 게임 큐레이션.',
    keywords: '무료 브라우저 게임, 무료 웹게임, 모바일 웹게임, PC 웹게임, archerlab games',
    intro: '무료 브라우저 게임은 많지만, 광고와 팝업 없이 진짜 깔끔한 곳은 드뭅니다. 직접 만든 게임만 모아둔 작은 포털입니다.',
    ctaHref: '/'
  },
  {
    slug: 'block-pang-muryo',
    lang: 'ko',
    h1: '블럭팡 무료 - 무설치로 바로 플레이',
    title: '블럭팡 무료 | 다운로드 없이 브라우저에서 바로',
    meta: '블럭팡 무료 무설치 버전. PC와 모바일에서 바로 플레이할 수 있는 무료 블록 퍼즐 웹게임.',
    keywords: '블럭팡 무료, 블록 퍼즐 게임, 무료 블록 게임, 무설치 웹게임',
    intro: '블럭팡은 클래식한 블록 퍼즐 감각을 브라우저에서 바로 즐길 수 있게 만든 무료 웹게임입니다.',
    ctaHref: '/blockpang/'
  },
  {
    slug: 'cat-tower-game',
    lang: 'en',
    h1: 'Cat Tower Game - Free Cat Merge Puzzle Online',
    title: 'Cat Tower Game | Free Cat Merge Puzzle Online',
    meta: 'Play Cat Tower online for free. Merge matching cats, build toward the Savannah tier, and chase a high score in a mobile-friendly browser puzzle game.',
    keywords: 'cat tower, cat tower game, free cat game, cat merge puzzle, browser puzzle game',
    intro: 'Cat Tower is a quick browser merge puzzle where matching cats evolve into the next tier. It is built for short sessions on mobile or desktop.',
    ctaHref: '/cat-tower/',
    primaryGame: 'Cat Tower'
  },
  {
    slug: 'cat-tower-defense',
    lang: 'en',
    h1: 'Cat Tower Defense Alternative - Free Browser Cat Puzzle',
    title: 'Cat Tower Defense Alternative | Free Cat Tower Game',
    meta: 'Looking for cat tower defense? Try Cat Tower, a free browser cat merge puzzle with physics, rankings, quick rounds, and no install.',
    keywords: 'cat tower defense, cat tower, cat tower game, free cat puzzle game, browser game',
    intro: 'If you searched for cat tower defense, this is a lightweight cat-themed puzzle alternative. Stack, merge, manage space, and survive the red line.',
    ctaHref: '/cat-tower/',
    primaryGame: 'Cat Tower'
  },
  {
    slug: 'cat-laser-tower',
    lang: 'en',
    h1: 'Cat Laser Tower Alternative - Play Cat Tower Free',
    title: 'Cat Laser Tower Alternative | Free Cat Tower Browser Game',
    meta: 'Searching for cat laser tower? Play Cat Tower free in your browser: a cat merge puzzle with physics, ranking, mobile controls, and instant play.',
    keywords: 'cat laser tower, cat tower, cat tower game, free cat browser game, cat merge puzzle',
    intro: 'Cat Tower is not a laser defense clone. It is a clean cat merge puzzle for players who want an instant cat-themed browser game.',
    ctaHref: '/cat-tower/',
    primaryGame: 'Cat Tower'
  }
];

const COPY = {
  ko: {
    htmlLang: 'ko',
    cta: '지금 플레이',
    whyTitle: '왜 Archerlab Games인가',
    why: [
      '다운로드·설치·가입 없이 링크 한 번이면 시작',
      'PC와 모바일 브라우저에서 바로 동작',
      '광고와 팝업을 최소화한 직접 제작 게임',
      '짧은 세션으로 즐기기 좋은 퍼즐과 액션 게임'
    ],
    picksTitle: '대표 게임',
    picks: [
      ['고양이 타워', 'Merge', '같은 고양이를 합쳐 더 높은 단계로 성장시키는 물리 합성 퍼즐.'],
      ['블럭팡', 'Puzzle', '블록을 배치하고 줄을 완성해 최고 점수를 노리는 무료 퍼즐.'],
      ['슬라임 발리볼', 'Sports', '브라우저에서 바로 즐기는 슬라임 배구 게임.']
    ],
    howTitle: '시작하는 법',
    how: ['아래 버튼을 누릅니다.', '원하는 게임을 선택합니다.', '설치 없이 바로 플레이합니다.'],
    faqTitle: '자주 묻는 질문',
    faqs: [
      ['정말 무료인가요?', '네. 결제 없이 모든 게임을 브라우저에서 플레이할 수 있습니다.'],
      ['모바일에서도 되나요?', '네. 주요 게임은 모바일 터치 조작을 지원합니다.'],
      ['설치가 필요한가요?', '아니요. 최신 브라우저만 있으면 바로 실행됩니다.']
    ],
    footer: 'game.archerlab.dev - 무설치 브라우저 게임 포털'
  },
  en: {
    htmlLang: 'en',
    cta: 'Play now',
    whyTitle: 'Why Play On Archerlab Games',
    why: [
      'No download, install, account, or paywall required',
      'Designed for quick browser sessions on mobile and desktop',
      'Clean first-party games without heavy portal clutter',
      'Puzzle, merge, action, sports, and casual games in one place'
    ],
    picksTitle: 'Featured Games',
    picks: [
      ['Cat Tower', 'Merge', 'Merge matching cats, manage the stack, and reach the Savannah tier.'],
      ['Lumen Shift', 'Puzzle', 'A reactive falling block puzzle with glowing effects and ranking.'],
      ['Slime Volley', 'Sports', 'A fast browser volleyball game with solo and multiplayer modes.']
    ],
    howTitle: 'How To Start',
    how: ['Press the play button below.', 'Open the game in your browser.', 'Play instantly with no install.'],
    faqTitle: 'FAQ',
    faqs: [
      ['Is Cat Tower free?', 'Yes. Cat Tower and the other Archerlab Games browser titles are free to play.'],
      ['Does it work on mobile?', 'Yes. Cat Tower is tuned for portrait mobile play and also works on desktop browsers.'],
      ['Is this a defense game?', 'Cat Tower is a cat merge puzzle, not a tower defense clone. The page is provided for players searching nearby cat tower terms.']
    ],
    footer: 'game.archerlab.dev - free browser games by ArcherLab'
  }
};

const CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,"Noto Sans KR",sans-serif;line-height:1.65;color:#1a1a2a;background:linear-gradient(180deg,#e3f2fd 0%,#fff 40%);min-height:100vh}.wrap{max-width:760px;margin:0 auto;padding:32px 20px 80px}h1{font-size:28px;line-height:1.3;margin:24px 0 16px;color:#1565c0;text-align:center}h2{font-size:20px;margin:36px 0 12px;color:#0d47a1;border-bottom:2px solid #bbdefb;padding-bottom:6px}p{margin-bottom:14px}ul{margin:12px 0 18px 22px}li{margin-bottom:8px}.intro{font-size:17px;color:#444;background:#fff;border-left:4px solid #1976d2;padding:14px 18px;border-radius:6px;margin:18px 0}.cta-box{text-align:center;margin:36px 0;padding:28px 20px;background:linear-gradient(135deg,#1976d2,#0d47a1);border-radius:14px}.cta{display:inline-block;background:#fff;color:#0d47a1;font-weight:700;font-size:18px;padding:14px 32px;border-radius:50px;text-decoration:none}.pick{background:#fff;border:1px solid #bbdefb;border-radius:10px;padding:16px;margin-bottom:14px}.pick h3{font-size:17px;color:#0d47a1;margin-bottom:6px}.pick .badge{display:inline-block;background:#bbdefb;color:#0d47a1;font-size:12px;padding:2px 8px;border-radius:10px;margin-left:6px;vertical-align:middle}.pick p{font-size:14px;color:#555}.faq{margin-bottom:14px}.faq summary{cursor:pointer;font-weight:600;padding:10px 0}.faq p{padding:6px 0;color:#555;font-size:15px}footer{margin-top:48px;padding-top:20px;border-top:1px solid #bbdefb;text-align:center;font-size:13px;color:#888}@media(max-width:520px){h1{font-size:23px}h2{font-size:18px}.cta{font-size:16px;padding:12px 26px}}`;

const esc = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const pageUrl = slug => `${SITE}/seo/${slug}`;

function render(p) {
  const copy = COPY[p.lang] || COPY.ko;
  const url = pageUrl(p.slug);
  const ctaHref = p.ctaHref || '/';
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: copy.faqs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };
  const webPageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: p.title,
    headline: p.h1,
    description: p.meta,
    url,
    inLanguage: p.lang,
    dateModified: LASTMOD,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Archerlab Games',
      url: SITE
    },
    mainEntity: p.primaryGame ? {
      '@type': 'VideoGame',
      name: p.primaryGame,
      url: `${SITE}/cat-tower/`,
      applicationCategory: 'Game',
      operatingSystem: 'Any',
      gamePlatform: ['Web Browser', 'Mobile Browser'],
      isAccessibleForFree: true
    } : undefined
  };
  if (!webPageLd.mainEntity) delete webPageLd.mainEntity;

  return `<!DOCTYPE html>
<html lang="${copy.htmlLang}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title><meta name="description" content="${esc(p.meta)}">
<meta name="keywords" content="${esc(p.keywords)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.meta)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(p.title)}"><meta name="twitter:description" content="${esc(p.meta)}">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify([webPageLd, faqLd])}</script>
<script src="../assets/js/ga-engagement.js?v=20260618-engagement" defer></script>
</head><body><div class="wrap">
<h1>${esc(p.h1)}</h1>
<p class="intro">${esc(p.intro)}</p>
<div class="cta-box"><a class="cta" href="${ctaHref}">${esc(copy.cta)}</a></div>
<h2>${esc(copy.whyTitle)}</h2><ul>${copy.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
<h2>${esc(copy.picksTitle)}</h2>
${copy.picks.map(([name, badge, desc]) => `<div class="pick"><h3>${esc(name)} <span class="badge">${esc(badge)}</span></h3><p>${esc(desc)}</p></div>`).join('')}
<h2>${esc(copy.howTitle)}</h2><ul>${copy.how.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
<div class="cta-box"><a class="cta" href="${ctaHref}">${esc(copy.cta)}</a></div>
<h2>${esc(copy.faqTitle)}</h2>
${copy.faqs.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
<footer>${esc(copy.footer)}</footer>
</div></body></html>`;
}

let n = 0;
for (const p of PAGES) {
  fs.writeFileSync(path.join(__dirname, `${p.slug}.html`), render(p), 'utf8');
  n++;
}

const frag = PAGES
  .map(p => `  <url><loc>${pageUrl(p.slug)}</loc><lastmod>${LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>${p.slug.startsWith('cat-') ? '0.8' : '0.7'}</priority></url>`)
  .join('\n');
fs.writeFileSync(path.join(__dirname, '_sitemap_fragment.xml'), frag, 'utf8');

console.log(`${n} pages generated`);
console.log('sitemap fragment written');
