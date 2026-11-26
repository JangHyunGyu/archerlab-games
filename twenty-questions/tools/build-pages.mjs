import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { messages } from '../js/i18n.mjs';

const STARTER_CHIPS = {
    ko: ['사람', '음식', '학교', '자연', '기쁘다'],
    en: ['person', 'food', 'school', 'nature', 'happy'],
};

const directory = fileURLToPath(new URL('../', import.meta.url));
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const skinIcon = (name, size = 22) =>
    `<img src="assets/ui/${name}-48.webp?v=4" srcset="assets/ui/${name}-48.webp?v=4 1x, assets/ui/${name}-96.webp?v=4 2x" alt="" width="${size}" height="${size}" decoding="async">`;

for (const locale of ['ko', 'en']) {
    const t = messages[locale];
    const en = locale === 'en';
    const url = `https://game.archerlab.dev/twenty-questions/${en ? 'index-en' : ''}`;
    const text = key => escape(t[key]);
    const starterChipsHtml = STARTER_CHIPS[locale]
        .map(word => `<button type="button" class="starter-chip" data-word="${word}">${word}</button>`)
        .join('\n              ');
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
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': ['VideoGame', 'WebApplication'], name: t.title, description: `${t.intro} ${t.rules}`, url, image: 'https://game.archerlab.dev/twenty-questions/assets/ui/semantle-card.png', inLanguage: locale, applicationCategory: 'GameApplication', operatingSystem: 'Any', gamePlatform: ['Web Browser', 'Mobile Browser'], playMode: 'SinglePlayer', isAccessibleForFree: true, dateModified: '2026-11-20', author: { '@type': 'Organization', name: 'ArcherLab', url: 'https://archerlab.dev' } })}</script>
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <script>try{var m=localStorage.getItem('archerlab_semantle_themeMode');if(m!=='dark'&&m!=='light'&&m!=='excel'&&m!=='notepad'&&m!=='vscode'&&m!=='eclipse')m=localStorage.getItem('archerlab_semantle_darkMode')==='false'?'light':'dark';document.documentElement.dataset.theme=m;}catch(_e){}</script>
  <link rel="stylesheet" href="css/style.css?v=20261126-v19">
  <link rel="stylesheet" href="css/light-mode.css?v=20261126-v19">
  <link rel="stylesheet" href="css/excel-mode.css?v=20261126-v19">
  <link rel="stylesheet" href="css/notepad-mode.css?v=20261126-v19">
  <link rel="stylesheet" href="css/vscode-mode.css?v=20261126-v19">
  <link rel="stylesheet" href="css/eclipse-mode.css?v=20261126-v19">
  <link rel="preload" as="image" href="assets/backgrounds/study-mobile-828.webp?v=4" media="(max-width: 768px) and (orientation: portrait)">
  <link rel="preload" as="image" href="assets/backgrounds/study-desktop-1440.webp?v=4" media="(min-width: 769px), (orientation: landscape)">
  <script src="../shared/browser-check.js?v=20261005-env-guard-v1"></script>
  <script type="module" src="js/main.mjs?v=20261126-v19"></script>
  <script src="../shared/immersive.js?v=20261028" defer></script>
</head>
<body data-no-fullscreen data-screen="title">
  <div class="observatory-bg" aria-hidden="true"></div>
  <canvas id="vfx-canvas" class="vfx-canvas" aria-hidden="true"></canvas>
  <div id="vfx-stage" class="vfx-stage" aria-hidden="true">
    <div id="vfx-edge-glow" class="vfx-edge-glow"></div>
    <div id="vfx-sprite-a" class="vfx-sprite"></div>
    <div id="vfx-sprite-b" class="vfx-sprite"></div>
  </div>
  <div class="excel-titlebar" id="excel-titlebar">
    <div class="excel-title-left">
      <span class="excel-app-icon" aria-hidden="true">X</span>
      <span class="excel-autosave" aria-hidden="true"><span>${text('excel_autosave')}</span><i class="excel-autosave-toggle"></i></span>
      <span class="excel-qat" aria-hidden="true"><i class="qat-save"></i><i class="qat-undo">↶</i><i class="qat-redo">↷</i></span>
    </div>
    <div class="excel-title-center">
      <span class="excel-doc-name">${text('excel_workbook_name')}</span>
      <span class="excel-saved-pill">${text('excel_saved_badge')}</span>
      <button type="button" id="excel-search-trigger" class="excel-search-box">${text('excel_search_placeholder')}</button>
    </div>
    <div class="excel-win-controls" aria-hidden="true"><span>─</span><span>□</span><span class="is-close">×</span></div>
  </div>
  <div class="excel-ribbon-tabs" id="excel-ribbon-tabs">
    <button type="button" class="excel-rtab is-file" data-excel-action="settings">${text('excel_tab_file')}</button>
    <button type="button" class="excel-rtab is-active" data-excel-action="home">${text('excel_tab_home')}</button>
    <span class="excel-rtab is-static" aria-hidden="true">${text('excel_tab_insert')}</span>
    <span class="excel-rtab is-static" aria-hidden="true">${text('excel_tab_layout')}</span>
    <button type="button" class="excel-rtab" data-excel-action="focus-input">${text('excel_tab_formulas')}</button>
    <button type="button" class="excel-rtab" data-excel-action="ranking">${text('excel_tab_data')}</button>
    <button type="button" class="excel-rtab" data-excel-action="guide">${text('excel_tab_review')}</button>
    <button type="button" class="excel-rtab" data-excel-action="settings">${text('excel_tab_view')}</button>
    <button type="button" class="excel-rtab" data-excel-action="guide">${text('excel_tab_help')}</button>
  </div>
  <header class="site-header">
    <a class="brand" href="../" aria-label="${text('portal')}">
      <img src="assets/ui/compass-chronograph-160.webp?v=4" srcset="assets/ui/compass-chronograph-160.webp?v=4 1x, assets/ui/compass-chronograph-320.webp?v=4 2x" alt="" width="30" height="37" decoding="async">
      <span>ArcherLab</span>
    </a>
    <div class="header-controls">
      <nav class="languages" aria-label="${text('language')}"><a href="./" lang="ko" ${!en ? 'aria-current="page"' : ''}>한국어</a><span aria-hidden="true">/</span><a href="index-en" lang="en" ${en ? 'aria-current="page"' : ''}>English</a></nav>
      <button class="icon-button" id="ranking-open" aria-label="${text('ranking')}">${skinIcon('icon-trophy')}<span class="excel-btn-label">${text('ranking')}</span></button>
      <button class="icon-button" id="guide-open" aria-label="${text('guide')}">${skinIcon('icon-guide')}<span class="excel-btn-label">${text('guide')}</span></button>
      <button class="icon-button" id="settings-open" aria-label="${text('settings')}">${skinIcon('icon-settings')}<span class="excel-btn-label">${text('settings')}</span></button>
    </div>
  </header>
  <div class="excel-ribbon-body" id="excel-ribbon-body" aria-hidden="true">
    <div class="excel-rgroup">
      <div class="excel-rgroup-items">
        <span class="excel-rtool is-tall"><i class="r-ico-paste"></i><span>${text('excel_paste')}</span></span>
        <div class="excel-rcol">
          <span class="excel-rtool-sm">✂ ${text('excel_cut')}</span>
          <span class="excel-rtool-sm">❐ ${text('excel_copy')}</span>
        </div>
      </div>
      <span class="excel-rgroup-label">${text('excel_grp_clipboard')}</span>
    </div>
    <div class="excel-rgroup">
      <div class="excel-rgroup-items excel-rstack">
        <div class="excel-rrow">
          <span class="excel-rcombo is-font">${text('excel_font_name')} <i>▾</i></span>
          <span class="excel-rcombo is-size">11 <i>▾</i></span>
        </div>
        <div class="excel-rrow">
          <span class="excel-rbtn"><strong>B</strong></span>
          <span class="excel-rbtn"><em>I</em></span>
          <span class="excel-rbtn"><u>U</u></span>
          <span class="excel-rsep"></span>
          <span class="excel-rbtn">⊞</span>
          <span class="excel-rbtn is-color">A<i></i></span>
        </div>
      </div>
      <span class="excel-rgroup-label">${text('excel_grp_font')}</span>
    </div>
    <div class="excel-rgroup">
      <div class="excel-rgroup-items excel-rstack">
        <div class="excel-rrow">
          <span class="excel-rbtn">≡</span>
          <span class="excel-rbtn">≣</span>
          <span class="excel-rsep"></span>
          <span class="excel-rtool-sm">${text('excel_wrap_text')}</span>
        </div>
        <div class="excel-rrow">
          <span class="excel-rbtn">⇕</span>
          <span class="excel-rsep"></span>
          <span class="excel-rtool-sm">${text('excel_merge_center')}</span>
        </div>
      </div>
      <span class="excel-rgroup-label">${text('excel_grp_align')}</span>
    </div>
    <div class="excel-rgroup">
      <div class="excel-rgroup-items excel-rstack">
        <div class="excel-rrow"><span class="excel-rcombo is-num">${text('excel_num_general')} <i>▾</i></span></div>
        <div class="excel-rrow">
          <span class="excel-rbtn">₩</span>
          <span class="excel-rbtn">%</span>
          <span class="excel-rbtn">,</span>
          <span class="excel-rbtn">.00</span>
        </div>
      </div>
      <span class="excel-rgroup-label">${text('excel_grp_number')}</span>
    </div>
    <div class="excel-rgroup">
      <div class="excel-rgroup-items">
        <span class="excel-rtool is-pill"><i class="r-ico-cf"></i><span>${text('excel_cond_format')}</span></span>
        <span class="excel-rtool is-pill"><i class="r-ico-tbl"></i><span>${text('excel_table_format')}</span></span>
        <span class="excel-rtool is-pill"><i class="r-ico-cs"></i><span>${text('excel_cell_styles')}</span></span>
      </div>
      <span class="excel-rgroup-label">${text('excel_grp_styles')}</span>
    </div>
    <div class="excel-rgroup">
      <div class="excel-rgroup-items">
        <div class="excel-rcol">
          <span class="excel-rtool-sm">Σ ${text('excel_autosum')}</span>
          <span class="excel-rtool-sm">⇅ ${text('excel_sort_filter')}</span>
        </div>
      </div>
      <span class="excel-rgroup-label">${text('excel_grp_editing')}</span>
    </div>
  </div>
  <div class="excel-formula-bar" id="excel-formula-bar">
    <div class="excel-name-box" id="excel-name-box">B3</div>
    <div class="excel-fx-controls" aria-hidden="true"><span>✕</span><span>✓</span><span class="excel-fx-sym">fx</span></div>
    <button type="button" class="excel-formula-display" id="excel-formula-display">${text('excel_formula_idle')}</button>
  </div>
  <div class="excel-col-letters" id="excel-col-letters" aria-hidden="true">
    <span class="excel-corner"></span>
    <span class="excel-col-head is-col-a">A</span>
    <span class="excel-col-head is-col-b is-active">B</span>
    <span class="excel-col-head is-col-c">C</span>
    <span class="excel-col-head is-col-d">D</span>
    <span class="excel-col-head is-col-e">E</span>
    <span class="excel-col-head is-col-f">F</span>
    <span class="excel-col-head is-col-g">G</span>
    <span class="excel-col-head is-col-h">H</span>
    <span class="excel-col-head is-col-i">I</span>
  </div>
  <div class="notepad-titlebar" id="notepad-titlebar">
    <div class="notepad-tabs-wrap">
      <span class="notepad-app-icon" aria-hidden="true">≡</span>
      <div class="notepad-tab is-active">
        <span class="notepad-tab-title" id="notepad-tab-name">${text('notepad_file_name')}</span>
        <span class="notepad-dirty-dot" id="notepad-dirty-dot" hidden>•</span>
        <span class="notepad-tab-close" aria-hidden="true">×</span>
      </div>
      <span class="notepad-tab-add" aria-hidden="true">＋</span>
    </div>
    <div class="notepad-win-controls" aria-hidden="true"><span>─</span><span>□</span><span class="is-close">×</span></div>
  </div>
  <div class="notepad-menubar" id="notepad-menubar">
    <button type="button" class="notepad-menu-item" data-office-action="settings">${text('notepad_menu_file')}</button>
    <button type="button" class="notepad-menu-item" data-office-action="focus-input">${text('notepad_menu_edit')}</button>
    <button type="button" class="notepad-menu-item" data-office-action="ranking">${text('notepad_menu_view')}</button>
    <button type="button" class="notepad-menu-item" data-office-action="guide">${text('notepad_menu_log')}</button>
  </div>
  <div class="vsc-titlebar" id="vsc-titlebar">
    <div class="vsc-title-left">
      <span class="vsc-app-icon" aria-hidden="true">&lt;/&gt;</span>
      <div class="vsc-menubar">
        <button type="button" class="vsc-menu-btn" data-office-action="settings">File</button>
        <button type="button" class="vsc-menu-btn" data-office-action="focus-input">Edit</button>
        <button type="button" class="vsc-menu-btn" data-office-action="home">Selection</button>
        <button type="button" class="vsc-menu-btn" data-office-action="ranking">View</button>
        <button type="button" class="vsc-menu-btn" data-office-action="focus-input">Go</button>
        <button type="button" class="vsc-menu-btn" data-office-action="focus-input">Run</button>
        <button type="button" class="vsc-menu-btn" data-office-action="guide">Terminal</button>
        <button type="button" class="vsc-menu-btn" data-office-action="guide">Help</button>
      </div>
    </div>
    <div class="vsc-title-center">
      <span class="vsc-nav-arrows" aria-hidden="true"><span>←</span><span>→</span></span>
      <button type="button" id="vsc-search-trigger" class="vsc-command-center">${text('vsc_search_title')}</button>
    </div>
    <div class="vsc-win-controls" aria-hidden="true"><span>◧</span><span>◫</span><span>◨</span><span>─</span><span>□</span><span class="is-close">×</span></div>
  </div>
  <aside class="vsc-activitybar" id="vsc-activitybar" aria-hidden="true">
    <div class="vsc-act-top">
      <button type="button" class="vsc-act-btn is-active" data-office-action="home" tabindex="-1"><span class="vsc-act-glyph">❐</span></button>
      <button type="button" class="vsc-act-btn" data-office-action="focus-input" tabindex="-1"><span class="vsc-act-glyph">⌕</span></button>
      <button type="button" class="vsc-act-btn" data-office-action="ranking" tabindex="-1"><span class="vsc-act-glyph">⌥</span><i class="vsc-act-badge">2</i></button>
      <button type="button" class="vsc-act-btn" data-office-action="guide" tabindex="-1"><span class="vsc-act-glyph">▷</span></button>
      <button type="button" class="vsc-act-btn" data-office-action="guide" tabindex="-1"><span class="vsc-act-glyph">⊞</span></button>
    </div>
    <div class="vsc-act-bottom">
      <button type="button" class="vsc-act-btn" data-office-action="settings" tabindex="-1"><span class="vsc-act-glyph">⚙</span></button>
    </div>
  </aside>
  <aside class="vsc-sidebar" id="vsc-sidebar">
    <div class="vsc-sidebar-header"><span>EXPLORER</span><span class="vsc-more" aria-hidden="true">···</span></div>
    <div class="vsc-tree-section is-open">
      <div class="vsc-tree-title">▾ SEMANTIC-ENGINE</div>
      <div class="vsc-tree-list">
        <div class="vsc-tree-folder">▾ src</div>
        <div class="vsc-tree-folder is-indent">▾ core</div>
        <button type="button" class="vsc-tree-file is-active" data-office-action="home"><i class="vsc-ext is-ts">TS</i><span>similarity.service.ts</span></button>
        <button type="button" class="vsc-tree-file" data-office-action="ranking"><i class="vsc-ext is-ts">TS</i><span>ranking.controller.ts</span></button>
        <button type="button" class="vsc-tree-file" data-office-action="focus-input"><i class="vsc-ext is-ts">TS</i><span>vector.index.ts</span></button>
        <button type="button" class="vsc-tree-file is-root" data-office-action="guide"><i class="vsc-ext is-md">M↓</i><span>README.md</span></button>
        <button type="button" class="vsc-tree-file is-root" data-office-action="settings"><i class="vsc-ext is-json">{}</i><span>settings.json</span></button>
      </div>
    </div>
    <div class="vsc-tree-section">
      <div class="vsc-tree-title">▸ OUTLINE</div>
    </div>
    <div class="vsc-tree-section">
      <div class="vsc-tree-title">▸ TIMELINE</div>
    </div>
  </aside>
  <div class="vsc-tabs" id="vsc-tabs">
    <button type="button" class="vsc-tab is-active" data-office-action="home"><i class="vsc-ext is-ts">TS</i><span>similarity.service.ts</span><em aria-hidden="true">×</em></button>
    <button type="button" class="vsc-tab" data-office-action="ranking"><i class="vsc-ext is-ts">TS</i><span>ranking.controller.ts</span></button>
    <button type="button" class="vsc-tab" data-office-action="settings"><i class="vsc-ext is-json">{}</i><span>settings.json</span></button>
  </div>
  <div class="vsc-breadcrumbs" id="vsc-breadcrumbs" aria-hidden="true">
    <span>src</span><i>›</i><span>core</span><i>›</i><span>similarity.service.ts</span><i>›</i><span class="vsc-bc-sym">SemanticAnalyzer</span>
  </div>
  <div class="ecl-titlebar" id="ecl-titlebar">
    <div class="ecl-title-left">
      <span class="ecl-app-icon" aria-hidden="true"><i></i></span>
      <span class="ecl-window-title">${text('ecl_window_title')}</span>
    </div>
    <div class="ecl-win-controls" aria-hidden="true"><span>─</span><span>□</span><span class="is-close">×</span></div>
  </div>
  <div class="ecl-menubar" id="ecl-menubar">
    <button type="button" class="ecl-menu-btn" data-office-action="settings">File</button>
    <button type="button" class="ecl-menu-btn" data-office-action="focus-input">Edit</button>
    <button type="button" class="ecl-menu-btn" data-office-action="home">Source</button>
    <button type="button" class="ecl-menu-btn" data-office-action="home">Refactor</button>
    <button type="button" class="ecl-menu-btn" data-office-action="ranking">Navigate</button>
    <button type="button" class="ecl-menu-btn" data-office-action="focus-input">Search</button>
    <button type="button" class="ecl-menu-btn" data-office-action="guide">Project</button>
    <button type="button" class="ecl-menu-btn" data-office-action="focus-input">Run</button>
    <button type="button" class="ecl-menu-btn" data-office-action="settings">Window</button>
    <button type="button" class="ecl-menu-btn" data-office-action="guide">Help</button>
  </div>
  <div class="ecl-toolbar" id="ecl-toolbar">
    <div class="ecl-tool-icons" aria-hidden="true">
      <span class="ecl-tbtn">📄</span><span class="ecl-tbtn">💾</span><span class="ecl-tsep"></span>
      <span class="ecl-tbtn is-play">▶</span><span class="ecl-tbtn is-bug">🐞</span><span class="ecl-tbtn">🔨</span><span class="ecl-tsep"></span>
      <span class="ecl-tbtn">↶</span><span class="ecl-tbtn">↷</span>
    </div>
    <div class="ecl-perspectives">
      <button type="button" class="ecl-persp-btn is-active" data-office-action="home">Java</button>
      <button type="button" class="ecl-persp-btn" data-office-action="ranking">Debug</button>
      <button type="button" class="ecl-persp-btn" data-office-action="settings">Preferences</button>
    </div>
  </div>
  <aside class="ecl-explorer" id="ecl-explorer">
    <div class="ecl-view-tabs"><span class="ecl-view-tab is-active">Package Explorer</span><span class="ecl-view-tab">Hierarchy</span></div>
    <div class="ecl-tree">
      <div class="ecl-node">▾ <i class="ecl-ico-proj">J</i> <strong>semantic-core</strong> <em>[main]</em></div>
      <div class="ecl-node is-l1">▾ <i class="ecl-ico-src">S</i> src/main/java</div>
      <div class="ecl-node is-l2">▾ <i class="ecl-ico-pkg">⊞</i> com.archerlab.semantic</div>
      <button type="button" class="ecl-node-btn is-l3 is-active" data-office-action="home"><i class="ecl-ico-java">J</i> SemanticAnalyzer.java</button>
      <button type="button" class="ecl-node-btn is-l3" data-office-action="ranking"><i class="ecl-ico-java">J</i> RankingService.java</button>
      <button type="button" class="ecl-node-btn is-l3" data-office-action="guide"><i class="ecl-ico-java">J</i> RoundConfig.java</button>
      <div class="ecl-node is-l1">▸ <i class="ecl-ico-lib">📚</i> JRE System Library [JavaSE-21]</div>
      <div class="ecl-node is-l1">▸ <i class="ecl-ico-lib">📚</i> Maven Dependencies</div>
      <button type="button" class="ecl-node-btn is-l1" data-office-action="settings"><i class="ecl-ico-cfg">⚙</i> application.properties</button>
    </div>
  </aside>
  <div class="ecl-editor-tabs" id="ecl-editor-tabs">
    <button type="button" class="ecl-etab is-active" data-office-action="home"><i class="ecl-ico-java">J</i> SemanticAnalyzer.java <em aria-hidden="true">×</em></button>
    <button type="button" class="ecl-etab" data-office-action="ranking"><i class="ecl-ico-java">J</i> RankingService.java</button>
    <button type="button" class="ecl-etab" data-office-action="settings"><i class="ecl-ico-cfg">⚙</i> application.properties</button>
  </div>
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
        </div>
        <div class="hero-records">
          <div class="hero-stat accent"><span>${text('timer_label')}</span><strong id="hero-countdown">06:00:00</strong></div>
          <div class="hero-stat"><span>${text('solver_label')}</span><strong id="hero-solver">${text('solver_none')}</strong></div>
          <div class="hero-stat"><span>${text('wins')}</span><strong id="hero-wins">0</strong></div>
        </div>
        <div id="hero-prev-round" class="prev-round-strip" hidden>
          <div class="prev-round-meta">
            <span id="hero-prev-label"></span>
            <strong id="hero-prev-answer"></strong>
          </div>
          <button type="button" id="hero-prev-nearest" class="ghost-btn">${text('prev_nearest_btn')}</button>
        </div>
      </div>
      <div class="hero-art">
        <div class="compass-showcase" aria-hidden="true">
          <img class="showcase-burst" src="assets/ui/vfx-compass-burst-512.webp?v=4" alt="" width="240" height="240" decoding="async">
          <img class="showcase-compass" src="assets/ui/compass-chronograph-320.webp?v=4" srcset="assets/ui/compass-chronograph-320.webp?v=4 1x, assets/ui/compass-chronograph-640.webp?v=4 2x" alt="" width="136" height="170" decoding="async">
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
        <button type="button" id="prev-answer-btn" class="ghost-btn prev-answer-btn" hidden><span id="prev-answer-btn-text"></span></button>
      </div>
      <div class="chronometer-console crafted-frame" data-excel-kpi="${text('excel_kpi_header')}">
        <div class="hud-primary">
          <div class="hud-card timer-card">
            <span><img class="timer-emblem" src="assets/ui/compass-chronograph-160.webp?v=4" alt="" width="18" height="22" decoding="async">${text('timer_label')}</span>
            <strong id="game-timer" aria-live="off">06:00:00</strong>
          </div>
          <div class="hud-card"><span>${text('guess_count')}</span><strong id="guess-count-display">0</strong></div>
          <button type="button" id="current-solver-btn" class="hud-card accent solver-card"><span>${text('solver_label')}</span><strong id="current-solver-display">${text('solver_none')}</strong></button>
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
          <img src="assets/ui/vfx-compass-burst-512.webp?v=4" srcset="assets/ui/vfx-compass-burst-512.webp?v=4 1x, assets/ui/vfx-compass-burst-1024.webp?v=4 2x" alt="" width="440" height="440" decoding="async">
        </div>
        <div id="result-banner" class="result-banner crafted-frame" hidden>
          <p id="record-badge" class="record-badge" hidden>${text('new_record')}</p>
          <p id="unranked-note" class="unranked-note" hidden></p>
          <h2 id="result-title"></h2>
          <div class="result-answer-line"><span>${text('answer_label')}</span><strong id="result-answer"></strong></div>
          <div class="result-stats">
            <div><span>${text('stat_time')}</span><strong id="result-time">00:00.00</strong></div>
            <div><span>${text('stat_guesses')}</span><strong id="result-guesses">0</strong></div>
            <div><span>${text('stat_next_round')}</span><strong id="result-next-timer">06:00:00</strong></div>
            <div><span>${text('stat_streak')}</span><strong id="result-streak">0</strong></div>
          </div>
          <form id="result-name-form" class="result-name-form" hidden>
            <p id="result-name-label" class="result-name-label">${text('result_name_prompt')}</p>
            <div class="result-name-row">
              <label class="sr-only" for="result-name-input">${text('name_label')}</label>
              <input id="result-name-input" type="text" maxlength="16" placeholder="${text('name_placeholder')}" aria-label="${text('name_label')}">
              <button id="result-name-save" class="secondary-btn" type="submit">${text('result_name_submit')}</button>
            </div>
            <p id="result-name-status" class="name-status" role="status"></p>
          </form>
          <div class="result-actions">
            <button id="open-nearest" class="primary-btn">${text('open_nearest')}</button>
            <button id="open-ranking-result" class="secondary-btn">${text('open_ranking')}</button>
            <button id="share-result" class="ghost-btn">${text('share_result')}</button>
          </div>
          <p class="explore-banner-note">${text('explore_banner')}</p>
        </div>
      </div>
      <div class="composer-wrap">
        <form id="guess-form" class="composer" data-excel-input-tag="${text('excel_input_cell_tag')}">
          <label class="sr-only" for="guess-input">${text('guess_placeholder')}</label>
          <input id="guess-input" type="text" maxlength="32" placeholder="${text('guess_placeholder')}" autocomplete="off" enterkeyhint="send">
          <button id="send" class="primary-btn" type="submit"><span>${text('send')}</span></button>
        </form>
        <div class="composer-status-slot" id="composer-status-slot">
          <p id="input-hint" class="input-hint">${text('input_hint')}</p>
          <div id="guess-loading" class="guess-loading" data-phase="idle" role="status" aria-live="polite" hidden>
            <img class="guess-loading-emblem" src="assets/ui/compass-chronograph-160.webp?v=4" srcset="assets/ui/compass-chronograph-160.webp?v=4 1x, assets/ui/compass-chronograph-320.webp?v=4 2x" alt="" width="22" height="27" decoding="async">
            <div class="guess-loading-gauge" aria-hidden="true">
              <img class="guess-loading-frame" src="assets/ui/loading-bar-frame-320.webp?v=4" srcset="assets/ui/loading-bar-frame-320.webp?v=4 1x, assets/ui/loading-bar-frame-640.webp?v=4 2x" alt="" width="640" height="338" decoding="async">
              <div class="guess-loading-track">
                <img class="guess-loading-fill" src="assets/ui/loading-bar-fill-280.webp?v=4" srcset="assets/ui/loading-bar-fill-280.webp?v=4 1x, assets/ui/loading-bar-fill-560.webp?v=4 2x" alt="" width="560" height="52" decoding="async">
              </div>
            </div>
            <span id="pending" class="guess-loading-text">${text('pending')}</span>
          </div>
        </div>
        <p id="turn-feedback" class="turn-feedback" role="status" hidden></p>
      </div>
      <div class="ledger-panel crafted-frame">
        <div class="ledger-scroll">
          <table id="guesses-table" class="guesses-table" hidden>
            <thead>
              <tr>
                <th scope="col" aria-sort="none" data-excel-row="4"><button type="button" class="sort-btn" data-sort="guessNo">${text('col_order')}</button></th>
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
              ${starterChipsHtml}
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
  <div id="notice" class="notice" role="status" hidden></div>
  <div class="excel-sheet-bar" id="excel-sheet-bar">
    <div class="excel-sheet-arrows" aria-hidden="true"><span>◀</span><span>▶</span></div>
    <div class="excel-sheet-tabs">
      <button type="button" class="excel-sheet-tab is-active" data-excel-action="sheet-main">${text('excel_sheet_main')}</button>
      <button type="button" class="excel-sheet-tab" data-excel-action="ranking">${text('excel_sheet_ranking')}</button>
      <button type="button" class="excel-sheet-tab" data-excel-action="guide">${text('excel_sheet_guide')}</button>
      <button type="button" class="excel-sheet-tab" data-excel-action="settings">${text('excel_sheet_settings')}</button>
      <span class="excel-sheet-add" aria-hidden="true">＋</span>
    </div>
    <div class="excel-hscroll" aria-hidden="true"><span>◀</span><div class="excel-hscroll-track"><i class="excel-hscroll-thumb"></i></div><span>▶</span></div>
  </div>
  <div class="excel-status-bar" id="excel-status-bar">
    <div class="excel-status-left">
      <span id="excel-status-state">${text('excel_status_ready')}</span>
    </div>
    <div class="excel-status-right">
      <span id="excel-status-avg" class="excel-status-stat"></span>
      <span id="excel-status-count" class="excel-status-stat"></span>
      <span id="excel-status-max" class="excel-status-stat"></span>
      <span class="excel-status-views" aria-hidden="true"><span>▦</span><span>▤</span><span>▥</span></span>
      <span class="excel-status-zoom" aria-hidden="true"><span>−</span><i class="excel-zoom-track"></i><span>+</span><span>100%</span></span>
    </div>
  </div>
  <div class="notepad-status-bar" id="notepad-status-bar">
    <div class="notepad-status-left">
      <span id="notepad-pos">${text('notepad_status_pos', { ln: 1, col: 1 })}</span>
      <span class="notepad-sep" aria-hidden="true">|</span>
      <span id="notepad-chars">${text('notepad_status_items', { count: 0 })}</span>
    </div>
    <div class="notepad-status-right">
      <span>100%</span>
      <span class="notepad-sep" aria-hidden="true">|</span>
      <span>${text('notepad_status_eol')}</span>
      <span class="notepad-sep" aria-hidden="true">|</span>
      <span>${text('notepad_status_enc')}</span>
    </div>
  </div>
  <div class="vsc-terminal" id="vsc-terminal" aria-hidden="true">
    <div class="vsc-term-tabs">
      <span>PROBLEMS <i>0</i></span><span>OUTPUT</span><span>DEBUG CONSOLE</span><span class="is-active">TERMINAL</span>
    </div>
    <div class="vsc-term-line" id="vsc-terminal-line">PS D:\workspace\semantic-engine&gt; npm run analyze -- --watch</div>
  </div>
  <div class="vsc-statusbar" id="vsc-statusbar">
    <div class="vsc-status-left">
      <span class="vsc-status-remote" aria-hidden="true">⧎</span>
      <span>⎇ main*</span>
      <span>⊗ 0 ⚠ 0</span>
      <span id="vsc-status-state">${text('vsc_status_ready')}</span>
    </div>
    <div class="vsc-status-right">
      <span id="vsc-status-cursor">Ln 1, Col 1</span>
      <span>Spaces: 2</span>
      <span>UTF-8</span>
      <span>CRLF</span>
      <span>{} TypeScript</span>
      <span>✓ Prettier</span>
    </div>
  </div>
  <div class="ecl-console" id="ecl-console" aria-hidden="true">
    <div class="ecl-console-tabs">
      <span>Problems</span><span>Javadoc</span><span>Declaration</span><span class="is-active">Console</span>
    </div>
    <div class="ecl-console-body" id="ecl-console-line">[INFO] SemanticAnalyzer (JavaSE-21) - Ready for vector lookup</div>
  </div>
  <div class="ecl-statusbar" id="ecl-statusbar">
    <div class="ecl-status-left">
      <span id="ecl-status-msg">${text('ecl_status_ready')}</span>
    </div>
    <div class="ecl-status-right">
      <span>Writable</span>
      <span>Smart Insert</span>
      <span id="ecl-status-pos">1 : 1</span>
      <span class="ecl-heap" aria-hidden="true">142M of 512M <i class="ecl-heap-bar"></i></span>
    </div>
  </div>
  <footer class="site-footer"><a href="../">ArcherLab Games</a></footer>

  <dialog id="ranking-dialog" class="game-dialog crafted-frame" aria-labelledby="ranking-title">
    <button class="dialog-close icon-button" data-close aria-label="${text('close')}">✕</button>
    <h2 id="ranking-title">${text('ranking')}</h2>
    <div class="ranking-sort-toggle" role="group" aria-label="${text('ranking_sort_label')}">
      <button type="button" id="ranking-sort-wins" class="ranking-sort-btn is-active" data-ranking-sort="wins" aria-pressed="true">${text('ranking_sort_wins')}</button>
      <button type="button" id="ranking-sort-time" class="ranking-sort-btn" data-ranking-sort="time" aria-pressed="false">${text('ranking_sort_time')}</button>
    </div>
    <p id="ranking-rule" class="dialog-intro">${text('ranking_rule_wins')}</p>
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
        <thead><tr><th>${text('rank_col')}</th><th>${text('nearest_word_col')}</th><th>${text('col_sim')}</th><th></th></tr></thead>
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
      <div><span>${text('stat_total_guesses')}</span><strong id="stat-total-guesses">0</strong></div>
      <div><span>${text('stat_streak')}</span><strong id="stat-streak">0</strong></div>
      <div><span>${text('stat_best_streak')}</span><strong id="stat-best-streak">0</strong></div>
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
    <div class="setting-group">
      <span id="display-mode-label" class="setting-group-label">${text('display_mode')}</span>
      <div class="mode-selector" role="group" aria-labelledby="display-mode-label">
        <button type="button" id="theme-dark" class="mode-option-btn is-active" data-theme-option="dark" aria-pressed="true">${text('mode_dark')}</button>
        <button type="button" id="theme-light" class="mode-option-btn" data-theme-option="light" aria-pressed="false">${text('mode_light')}</button>
        <button type="button" id="theme-excel" class="mode-option-btn" data-theme-option="excel" aria-pressed="false">${text('mode_excel')}</button>
        <button type="button" id="theme-notepad" class="mode-option-btn" data-theme-option="notepad" aria-pressed="false">${text('mode_notepad')}</button>
        <button type="button" id="theme-vscode" class="mode-option-btn" data-theme-option="vscode" aria-pressed="false">${text('mode_vscode')}</button>
        <button type="button" id="theme-eclipse" class="mode-option-btn" data-theme-option="eclipse" aria-pressed="false">${text('mode_eclipse')}</button>
      </div>
      <p id="mode-excel-hint" class="setting-hint" hidden>${text('mode_excel_hint')}</p>
    </div>
    <label class="setting-row" for="sound-enabled"><span>${text('sound')}</span><input type="checkbox" id="sound-enabled" checked></label>
    <label class="setting-row" for="sound-volume">${text('volume')}</label>
    <input type="range" id="sound-volume" min="0" max="100" value="45">
    <label class="setting-row" for="share-guesses"><span>${text('share_guesses')}</span><input type="checkbox" id="share-guesses" checked></label>
    <label class="setting-row" for="share-time"><span>${text('share_time')}</span><input type="checkbox" id="share-time" checked></label>
    <label class="setting-row" for="share-max"><span>${text('share_max')}</span><input type="checkbox" id="share-max" checked></label>
  </dialog>
</body>
</html>
`;
    fs.writeFileSync(directory + (en ? 'index-en.html' : 'index.html'), html);
}
await import('./sync-copy.mjs');
