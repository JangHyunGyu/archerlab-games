import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { messages } from '../js/i18n.mjs';

const directory = fileURLToPath(new URL('../', import.meta.url));
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const skinIcon = (name, size = 22) =>
    `<img src="assets/ui/${name}-48.webp?v=3" srcset="assets/ui/${name}-48.webp?v=3 1x, assets/ui/${name}-96.webp?v=3 2x" alt="" width="${size}" height="${size}" decoding="async">`;

for (const locale of ['ko', 'en']) {
    const t = messages[locale];
    const en = locale === 'en';
    const url = `https://game.archerlab.dev/twenty-questions/${en ? 'index-en' : ''}`;
    const text = key => escape(t[key]);
    const html = `<!DOCTYPE html>
<html lang="${locale}" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#07131a">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="manifest" href="${en ? 'manifest-en.json' : 'manifest.json'}">
  <title>${text('title')} | ArcherLab</title>
  <meta name="description" content="${text('intro')} ${text('rules')}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="ko" href="https://game.archerlab.dev/twenty-questions/">
  <link rel="alternate" hreflang="en" href="https://game.archerlab.dev/twenty-questions/index-en">
  <link rel="alternate" hreflang="x-default" href="https://game.archerlab.dev/twenty-questions/">
  <meta property="og:title" content="${text('title')} | ArcherLab">
  <meta property="og:description" content="${text('intro')}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="https://game.archerlab.dev/twenty-questions/assets/ui/semantle-card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="1200">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': ['VideoGame', 'WebApplication'], name: t.title, description: `${t.intro} ${t.rules}`, url, image: 'https://game.archerlab.dev/twenty-questions/assets/ui/semantle-card.png', inLanguage: locale, applicationCategory: 'GameApplication', operatingSystem: 'Any', gamePlatform: ['Web Browser', 'Mobile Browser'], playMode: 'SinglePlayer', isAccessibleForFree: true, dateModified: '2026-11-17', author: { '@type': 'Organization', name: 'ArcherLab', url: 'https://archerlab.dev' } })}</script>
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/style.css?v=20261117-v3">
  <link rel="preload" as="image" href="assets/backgrounds/study-mobile-828.webp?v=3" media="(max-width: 768px) and (orientation: portrait)">
  <link rel="preload" as="image" href="assets/backgrounds/study-desktop-1440.webp?v=3" media="(min-width: 769px), (orientation: landscape)">
  <script type="module" src="js/main.mjs?v=20261117-v3"></script>
  <script src="../shared/immersive.js?v=20261028" defer></script>
</head>
<body data-no-fullscreen data-screen="title">
  <div class="observatory-bg" aria-hidden="true"></div>
  <canvas id="vfx-canvas" class="vfx-canvas" aria-hidden="true"></canvas>
  <header class="site-header">
    <a class="brand" href="../" aria-label="${text('portal')}">
      <img src="assets/ui/compass-chronograph-160.webp?v=3" srcset="assets/ui/compass-chronograph-160.webp?v=3 1x, assets/ui/compass-chronograph-320.webp?v=3 2x" alt="" width="30" height="37" decoding="async">
      <span>ArcherLab</span>
    </a>
    <div class="header-controls">
      <nav class="languages" aria-label="${text('language')}"><a href="./" lang="ko" ${!en ? 'aria-current="page"' : ''}>한국어</a><span aria-hidden="true">/</span><a href="index-en.html" lang="en" ${en ? 'aria-current="page"' : ''}>English</a></nav>
      <button class="icon-button" id="ranking-open" aria-label="${text('ranking')}">${skinIcon('icon-trophy')}</button>
      <button class="icon-button" id="guide-open" aria-label="${text('guide')}">${skinIcon('icon-guide')}</button>
      <button class="icon-button" id="settings-open" aria-label="${text('settings')}">${skinIcon('icon-settings')}</button>
    </div>
  </header>
  <main>
    <section id="title-screen" class="title-screen" aria-labelledby="game-title">
      <div class="hero-copy">
        <span class="eyebrow"><i></i>${text('archive')}</span>
        <h1 id="game-title">${text('title')}</h1>
        <p class="hero-subtitle">${text('subtitle')}</p>
        <p class="hero-intro">${text('intro')}</p>
        <div class="rule-strip" aria-label="${text('rules')}">
          <span class="rule-token">${text('rule_1_title')}</span>
          <span class="rule-token">${text('rule_2_title')}</span>
          <span class="rule-token">${text('rule_3_title')}</span>
        </div>
        <div class="hero-actions">
          <button id="start" class="primary-btn"><span>${text('start')}</span><span class="btn-arrow" aria-hidden="true">▶</span></button>
          <button id="resume" class="secondary-btn" hidden><span>${text('resume')}</span><span id="resume-timer" class="resume-timer">00:00.0</span></button>
        </div>
        <div class="hero-records">
          <div class="hero-stat accent"><span>${text('best_time_label')}</span><strong id="hero-best-time">-</strong></div>
          <div class="hero-stat"><span>${text('wins')}</span><strong id="hero-wins">0</strong></div>
          <div class="hero-stat"><span>${text('streak')}</span><strong id="hero-streak">0</strong></div>
        </div>
      </div>
      <div class="hero-art">
        <div class="compass-showcase" aria-hidden="true">
          <img class="showcase-burst" src="assets/ui/vfx-compass-burst-512.webp?v=3" alt="" width="240" height="240" decoding="async">
          <img class="showcase-compass" src="assets/ui/compass-chronograph-320.webp?v=3" srcset="assets/ui/compass-chronograph-320.webp?v=3 1x, assets/ui/compass-chronograph-640.webp?v=3 2x" alt="" width="136" height="170" decoding="async">
        </div>
        <div class="example-card crafted-frame" aria-label="${text('example_heading')}">
          <div class="example-head">
            <span class="example-badge">${text('example_heading')}</span>
            <strong class="example-target">${text('example_target')}</strong>
          </div>
          <div class="example-rows">
            <div class="ex-row cool"><span class="ex-word">${text('example_w1')}</span><span class="ex-score">4.20</span><div class="ex-rank-col"><span class="ex-rank">${text('example_r1')}</span><div class="sim-meter"><i style="width:12%"></i></div></div></div>
            <div class="ex-row warm"><span class="ex-word">${text('example_w2')}</span><span class="ex-score">41.80</span><div class="ex-rank-col"><span class="ex-rank">${text('example_r2')}</span><div class="sim-meter"><i style="width:58%"></i></div></div></div>
            <div class="ex-row hot"><span class="ex-word">${text('example_w3')}</span><span class="ex-score">63.50</span><div class="ex-rank-col"><span class="ex-rank">${text('example_r3')}</span><div class="sim-meter"><i style="width:93%"></i></div></div></div>
            <div class="ex-row exact"><span class="ex-word">${text('example_w4')}</span><span class="ex-score">100.00</span><div class="ex-rank-col"><span class="ex-rank">${text('example_r4')}</span><div class="sim-meter"><i style="width:100%"></i></div></div></div>
          </div>
          <p class="example-note">${text('example_note')}</p>
        </div>
      </div>
    </section>

    <section id="game-screen" class="game-screen" hidden aria-label="${text('title')}">
      <div class="game-toolbar">
        <button id="home" class="ghost-btn">← ${text('home')}</button>
        <span id="case-label" class="case-label"></span>
        <button id="give-up" class="ghost-btn">${text('give_up')}</button>
      </div>
      <div class="chronometer-console crafted-frame">
        <div class="hud-primary">
          <div class="hud-card timer-card">
            <span><img class="timer-emblem" src="assets/ui/compass-chronograph-160.webp?v=3" alt="" width="18" height="22" decoding="async">${text('timer_label')}</span>
            <strong id="game-timer" aria-live="off">00:00.0</strong>
          </div>
          <div class="hud-card"><span>${text('guess_count')}</span><strong id="guess-count-display">0</strong></div>
          <div class="hud-card accent"><span>${text('best_time_label')}</span><strong id="game-best-time">-</strong></div>
        </div>
        <div class="benchmark-strip">
          <span class="bench-prefix">${text('benchmark_prefix')}</span>
          <span class="bench-chip hot">${text('top1_label')} <strong id="top1-score">-</strong></span>
          <span class="bench-chip warm">${text('top10_label')} <strong id="top10-score">-</strong></span>
          <span class="bench-chip cool">${text('top1000_label')} <strong id="top1000-score">-</strong></span>
          <span class="bench-suffix">${text('benchmark_suffix')}</span>
        </div>
        <div class="resonance-strip" id="resonance-strip">
          <div class="resonance-meta"><span id="resonance-text">${text('resonance_idle')}</span></div>
          <div class="resonance-track"><div id="resonance-fill" class="resonance-fill" data-tier="idle"></div></div>
        </div>
      </div>
      <div id="result-wrap" class="result-wrap">
        <div id="vfx-burst" class="vfx-burst" aria-hidden="true">
          <img src="assets/ui/vfx-compass-burst-512.webp?v=3" srcset="assets/ui/vfx-compass-burst-512.webp?v=3 1x, assets/ui/vfx-compass-burst-1024.webp?v=3 2x" alt="" width="440" height="440" decoding="async">
        </div>
        <div id="result-banner" class="result-banner crafted-frame" hidden>
          <p id="record-badge" class="record-badge" hidden>${text('new_record')}</p>
          <p id="unranked-note" class="unranked-note" hidden></p>
          <h2 id="result-title"></h2>
          <div class="result-answer-line"><span>${text('answer_label')}</span><strong id="result-answer"></strong></div>
          <div class="result-stats">
            <div><span>${text('stat_time')}</span><strong id="result-time">00:00.00</strong></div>
            <div><span>${text('stat_guesses')}</span><strong id="result-guesses">0</strong></div>
            <div><span>${text('stat_best')}</span><strong id="result-best-time">-</strong></div>
            <div><span>${text('stat_streak')}</span><strong id="result-streak">0</strong></div>
          </div>
          <div class="result-actions">
            <button id="next-game" class="primary-btn"><span>${text('next_game')}</span><span class="btn-arrow" aria-hidden="true">▶</span></button>
            <button id="open-nearest" class="secondary-btn">${text('open_nearest')}</button>
            <button id="open-ranking-result" class="secondary-btn">${text('open_ranking')}</button>
            <button id="share-result" class="ghost-btn">${text('share_result')}</button>
          </div>
          <p class="explore-banner-note">${text('explore_banner')}</p>
        </div>
      </div>
      <div class="composer-wrap">
        <form id="guess-form" class="composer">
          <label class="sr-only" for="guess-input">${text('guess_placeholder')}</label>
          <input id="guess-input" type="text" maxlength="32" placeholder="${text('guess_placeholder')}" autocomplete="off" enterkeyhint="send">
          <button id="send" class="primary-btn" type="submit"><span>${text('send')}</span></button>
        </form>
        <p class="input-hint">${text('input_hint')}</p>
        <div class="composer-meta"><span id="pending" hidden>${text('pending')}</span></div>
        <p id="turn-feedback" class="turn-feedback" role="status" hidden></p>
      </div>
      <div class="ledger-panel crafted-frame">
        <div class="ledger-scroll">
          <table id="guesses-table" class="guesses-table" hidden>
            <thead>
              <tr>
                <th scope="col" aria-sort="none"><button type="button" class="sort-btn" data-sort="guessNo">${text('col_order')}</button></th>
                <th scope="col" aria-sort="none"><button type="button" class="sort-btn" data-sort="word">${text('col_word')}</button></th>
                <th scope="col" aria-sort="descending"><button type="button" class="sort-btn is-sorted" data-sort="similarity" data-dir="desc">${text('col_sim')}</button></th>
                <th scope="col">${text('col_rank')}</th>
              </tr>
            </thead>
            <tbody id="guesses-body"></tbody>
          </table>
          <div id="empty-history" class="empty-history">
            <h2>${text('empty_title')}</h2>
            <p>${text('empty_body')}</p>
            <div id="starter-chips" class="starter-chips" aria-label="${text('starter_label')}">
              <button type="button" class="starter-chip" data-word="사람">사람</button>
              <button type="button" class="starter-chip" data-word="음식">음식</button>
              <button type="button" class="starter-chip" data-word="학교">학교</button>
              <button type="button" class="starter-chip" data-word="자연">자연</button>
              <button type="button" class="starter-chip" data-word="기쁘다">기쁘다</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
  <div id="notice" class="notice" role="status" hidden></div>
  <footer class="site-footer"><a href="../">ArcherLab Games</a><span>${text('footer_credit')}</span></footer>

  <dialog id="ranking-dialog" class="game-dialog crafted-frame" aria-labelledby="ranking-title">
    <button class="dialog-close icon-button" data-close aria-label="${text('close')}">✕</button>
    <h2 id="ranking-title">${text('ranking')}</h2>
    <p class="dialog-intro">${text('ranking_rule')}</p>
    <form id="name-form" class="name-form">
      <label class="sr-only" for="name-input">${text('name_label')}</label>
      <input id="name-input" type="text" maxlength="16" placeholder="${text('name_placeholder')}" aria-label="${text('name_label')}">
      <button id="name-save" class="secondary-btn" type="submit">${text('save')}</button>
      <p class="name-help">${text('name_help')}</p>
      <p id="name-status" class="name-status" role="status"></p>
    </form>
    <div id="leaderboard" class="leaderboard"></div>
    <p id="own-rank" class="own-rank"></p>
  </dialog>

  <dialog id="nearest-dialog" class="game-dialog crafted-frame" aria-labelledby="nearest-title">
    <button class="dialog-close icon-button" data-close aria-label="${text('close')}">✕</button>
    <h2 id="nearest-title"></h2>
    <p class="dialog-intro">${text('nearest_desc')}</p>
    <input id="nearest-filter" class="nearest-filter" type="search" placeholder="${text('nearest_filter')}" aria-label="${text('nearest_filter')}">
    <p id="nearest-loading" class="dialog-intro" hidden>${text('loading')}</p>
    <div class="nearest-scroll">
      <table class="nearest-table">
        <thead><tr><th>${text('rank_col')}</th><th>${text('col_word')}</th><th>${text('col_sim')}</th><th></th></tr></thead>
        <tbody id="nearest-body"></tbody>
      </table>
      <p id="nearest-empty" class="dialog-intro" hidden>${text('nearest_empty')}</p>
    </div>
  </dialog>

  <dialog id="guide-dialog" class="game-dialog crafted-frame" aria-labelledby="guide-title">
    <button class="dialog-close icon-button" data-close aria-label="${text('close')}">✕</button>
    <h2 id="guide-title">${text('guide')}</h2>
    <p class="dialog-intro">${text('stats_heading')}</p>
    <div class="stats-grid">
      <div><span>${text('stat_played')}</span><strong id="stat-played">0</strong></div>
      <div><span>${text('stat_wins')}</span><strong id="stat-wins">0</strong></div>
      <div><span>${text('stat_giveups')}</span><strong id="stat-giveups">0</strong></div>
      <div><span>${text('stat_total_guesses')}</span><strong id="stat-total-guesses">0</strong></div>
      <div><span>${text('stat_streak')}</span><strong id="stat-streak">0</strong></div>
      <div><span>${text('stat_best')}</span><strong id="stat-best-time">-</strong></div>
    </div>
    <p class="dialog-intro">${text('faq_heading')}</p>
    <div class="faq-list">
      <div class="faq-item"><h3>${text('faq_q1')}</h3><p>${text('faq_a1')}</p></div>
      <div class="faq-item"><h3>${text('faq_q2')}</h3><p>${text('faq_a2')}</p></div>
      <div class="faq-item"><h3>${text('faq_q3')}</h3><p>${text('faq_a3')}</p></div>
      <div class="faq-item"><h3>${text('faq_q4')}</h3><p>${text('faq_a4')}</p></div>
    </div>
  </dialog>

  <dialog id="settings-dialog" class="game-dialog crafted-frame" aria-labelledby="settings-title">
    <button class="dialog-close icon-button" data-close aria-label="${text('close')}">✕</button>
    <h2 id="settings-title">${text('settings')}</h2>
    <label class="setting-row" for="dark-mode"><span>${text('dark_mode')}</span><input type="checkbox" id="dark-mode" checked></label>
    <label class="setting-row" for="sound-enabled"><span>${text('sound')}</span><input type="checkbox" id="sound-enabled" checked></label>
    <label class="setting-row" for="sound-volume">${text('volume')}</label>
    <input type="range" id="sound-volume" min="0" max="100" value="45">
    <label class="setting-row" for="share-guesses"><span>${text('share_guesses')}</span><input type="checkbox" id="share-guesses" checked></label>
    <label class="setting-row" for="share-time"><span>${text('share_time')}</span><input type="checkbox" id="share-time" checked></label>
    <label class="setting-row" for="share-max"><span>${text('share_max')}</span><input type="checkbox" id="share-max" checked></label>
  </dialog>

  <dialog id="give-up-dialog" class="game-dialog confirm-dialog crafted-frame" aria-labelledby="give-up-title">
    <h2 id="give-up-title">${text('give_up_confirm')}</h2>
    <p class="dialog-intro">${text('give_up_note')}</p>
    <div class="confirm-actions">
      <button id="confirm-give-up" class="primary-btn">${text('give_up')}</button>
      <button data-close class="secondary-btn">${text('cancel')}</button>
    </div>
  </dialog>
</body>
</html>
`;
    fs.writeFileSync(directory + (en ? 'index-en.html' : 'index.html'), html);
}
await import('./sync-copy.mjs');
