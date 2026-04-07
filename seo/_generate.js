// archerlab-games SEO 생성기 — ko only, 3 pages
const fs = require('fs'); const path = require('path');
const SITE = 'https://game.archerlab.dev'; const HOME = '/';
const PAGES = [
  { slug:'museolchi-webgame', h1:'무설치 웹게임 — 다운로드 없이 바로 플레이', title:'무설치 웹게임 추천 | 다운로드 없이 즐기는 무료 게임', meta:'다운로드·설치 없이 브라우저에서 바로 즐기는 무료 웹게임 모음. 블럭팡, 슬라임 발리볼, 솔로 레벨링까지.', intro:'"무설치 웹게임"을 찾는 이유는 단순합니다 — 지금 바로 5분만 가볍게 놀고 싶다는 것. 광고로 도배된 사이트 말고, 깔끔한 게임 모음입니다.' },
  { slug:'muryo-browser-game', h1:'무료 브라우저 게임 추천 — PC·모바일 동일 플레이', title:'무료 브라우저 게임 추천 | PC·모바일 동시 지원 2026', meta:'결제 없이 즐기는 무료 브라우저 게임. PC와 모바일 모두 동일하게 동작하는 캐주얼 게임 큐레이션.', intro:'무료 브라우저 게임은 많지만, 광고와 팝업 없이 진짜 깔끔한 곳은 드뭅니다. 직접 만든 게임만 모아둔 작은 포털입니다.' },
  { slug:'block-pang-muryo', h1:'블럭팡 무료 — 무설치로 바로 플레이', title:'블럭팡 무료 | 다운로드 없이 브라우저에서 바로', meta:'블럭팡(블록 깨기) 무료 무설치 버전. PC와 모바일에서 바로 플레이.', intro:'블럭팡(블록 깨기)은 클래식이지만 무설치 무료 버전은 의외로 찾기 어렵습니다. 광고 없이 깔끔하게 즐길 수 있는 버전입니다.' }
];
const C = {
  why_title:'왜 archerlab games인가',
  why:['다운로드·설치·가입 0 — 링크 한 번이면 끝','PC·모바일 동일하게 동작','광고/팝업 최소화','직접 만든 캐주얼 게임만 큐레이션'],
  how_title:'시작하는 법',
  how:['아래 [지금 플레이] 클릭','원하는 게임 선택','즉시 플레이 — 가입 불필요'],
  faq_title:'자주 묻는 질문',
  faqs:[
    ['정말 무료인가요?','네. 결제·가입 없이 모든 게임을 무제한 플레이할 수 있습니다.'],
    ['모바일에서도 잘 되나요?','네. 모든 게임이 모바일 터치 컨트롤을 지원합니다.'],
    ['저장은 되나요?','브라우저 로컬 저장이 지원되는 게임은 자동 저장됩니다. (게임마다 다름)']
  ],
  picks_title:'대표 게임',
  main_name:'블럭팡',
  main_desc:'클래식 블록 깨기 게임. 모바일 최적화, 무설치.',
  sec_name:'솔로 레벨링',
  sec_label:'액션',
  sec_desc:'캐주얼 액션 RPG. 짧은 세션으로 가볍게 즐기는 그림자 서바이벌.',
  cta:'지금 플레이 →',
  footer:'© game.archerlab.dev — 무설치 브라우저 게임 포털'
};

const CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,"Noto Sans KR",sans-serif;line-height:1.65;color:#1a1a2a;background:linear-gradient(180deg,#e3f2fd 0%,#fff 40%);min-height:100vh}.wrap{max-width:760px;margin:0 auto;padding:32px 20px 80px}h1{font-size:28px;line-height:1.3;margin:24px 0 16px;color:#1565c0;text-align:center}h2{font-size:20px;margin:36px 0 12px;color:#0d47a1;border-bottom:2px solid #bbdefb;padding-bottom:6px}p{margin-bottom:14px}ul{margin:12px 0 18px 22px}li{margin-bottom:8px}.intro{font-size:17px;color:#444;background:#fff;border-left:4px solid #1976d2;padding:14px 18px;border-radius:6px;margin:18px 0}.cta-box{text-align:center;margin:36px 0;padding:28px 20px;background:linear-gradient(135deg,#1976d2,#0d47a1);border-radius:14px}.cta{display:inline-block;background:#fff;color:#0d47a1;font-weight:700;font-size:18px;padding:14px 32px;border-radius:50px;text-decoration:none}.pick{background:#fff;border:1px solid #bbdefb;border-radius:10px;padding:16px;margin-bottom:14px}.pick h3{font-size:17px;color:#0d47a1;margin-bottom:6px}.pick .badge{display:inline-block;background:#bbdefb;color:#0d47a1;font-size:12px;padding:2px 8px;border-radius:10px;margin-left:6px;vertical-align:middle}.pick p{font-size:14px;color:#555}.faq{margin-bottom:14px}.faq summary{cursor:pointer;font-weight:600;padding:10px 0}.faq p{padding:6px 0;color:#555;font-size:15px}footer{margin-top:48px;padding-top:20px;border-top:1px solid #bbdefb;text-align:center;font-size:13px;color:#888}@media(max-width:520px){h1{font-size:23px}h2{font-size:18px}.cta{font-size:16px;padding:12px 26px}}`;

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function render(p) {
  const url = `${SITE}/seo/${p.slug}.html`;
  const faqLd = {"@context":"https://schema.org","@type":"FAQPage","mainEntity":C.faqs.map(([q,a])=>({"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))};
  return `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title><meta name="description" content="${esc(p.meta)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.meta)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head><body><div class="wrap">
<h1>${esc(p.h1)}</h1>
<p class="intro">${esc(p.intro)}</p>
<div class="cta-box"><a class="cta" href="${HOME}">${esc(C.cta)}</a></div>
<h2>${esc(C.why_title)}</h2><ul>${C.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>
<h2>${esc(C.picks_title)}</h2>
<div class="pick"><h3>${esc(C.main_name)}</h3><p>${esc(C.main_desc)}</p></div>
<div class="pick"><h3>${esc(C.sec_name)} <span class="badge">${esc(C.sec_label)}</span></h3><p>${esc(C.sec_desc)}</p></div>
<h2>${esc(C.how_title)}</h2><ul>${C.how.map(h=>`<li>${esc(h)}</li>`).join('')}</ul>
<div class="cta-box"><a class="cta" href="${HOME}">${esc(C.cta)}</a></div>
<h2>${esc(C.faq_title)}</h2>
${C.faqs.map(([q,a])=>`<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
<footer>${esc(C.footer)}</footer>
</div></body></html>`;
}

let n=0;
for (const p of PAGES) { fs.writeFileSync(path.join(__dirname, `${p.slug}.html`), render(p), 'utf8'); n++; }
console.log(`✓ ${n} pages generated`);
const frag = PAGES.map(p=>`  <url><loc>${SITE}/seo/${p.slug}.html</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`).join('\n');
fs.writeFileSync(path.join(__dirname, '_sitemap_fragment.xml'), frag, 'utf8');
console.log('✓ sitemap fragment written');
