// 고양이 타워 i18n — ko/en 2개 언어
(function (global) {
  'use strict';

  const STRINGS = {
    ko: {
      // 메뉴
      'menu.tagline': '같은 고양이를 합쳐 사바나까지',
      'menu.best': '최고 기록',
      'menu.play': '플레이',
      'menu.how': '조작법 · 진화표',
      'menu.rank': '랭킹',
      'menu.archerlab': '🏹 ArcherLab',

      // HUD
      'hud.score': '점수',
      'hud.next': '다음',
      'hud.hint': '좌우로 움직여 탭하면 드롭!',
      'hud.soundAria': '사운드 켜기/끄기',
      'hud.pauseAria': '일시정지',

      // 일시정지
      'pause.title': '일시정지',
      'pause.resume': '계속하기',
      'pause.restart': '다시 시작',
      'pause.exit': '메인 메뉴',

      // 게임오버
      'over.title': '게임 오버',
      'over.final': '최종 점수',
      'over.newRecord': '🏆 신기록!',
      'over.replay': '다시 도전',
      'over.menu': '메인 메뉴',
      'over.submitRank': '🏆 랭킹 등록',
      'over.skipRank': 'Skip',
      'over.nicknamePh': '닉네임 (20자)',
      'over.submitting': '등록 중...',
      'over.submitOk': '등록 완료!',
      'over.submitFail': '등록 실패 — 나중에 다시',

      // 조작법
      'how.title': '조작법',
      'how.1': '드래그로 위치 조정, 탭하면 드롭',
      'how.2': '같은 종류 둘이 닿으면 합쳐져요 (2마리 → 1마리, 공간 확보!)',
      'how.3': '점수는 기하급수: 새끼 10점 → 사바나 10,000점',
      'how.4': '10단계 <b>사바나</b> 둘이 만나면 <b>소멸 + 20,000점 보너스</b> (필드 청소 기술!)',
      'how.5': '빨간 점선 위에 너무 오래 쌓이면 게임 오버',
      'how.tiers': '진화 단계',
      'how.close': '닫기',

      // 랭킹 모달
      'rank.title': '🏆 랭킹 TOP 20',
      'rank.loading': '불러오는 중...',
      'rank.empty': '아직 기록이 없어요. 첫 번째 도전자가 되어보세요!',
      'rank.error': '랭킹을 불러오지 못했어요',
      'rank.close': '닫기',
      'rank.rank': '순위',
      'rank.name': '닉네임',
      'rank.score': '점수',

      // 플래시
      'flash.combo': '{n}연쇄!',
      'flash.legend': '🏆 전설의 사바나!',

      // 고양이 이름
      'cat.0': '새끼 고양이',
      'cat.1': '치즈',
      'cat.2': '턱시도',
      'cat.3': '삼색이',
      'cat.4': '고등어',
      'cat.5': '러시안 블루',
      'cat.6': '스코티시 폴드',
      'cat.7': '페르시안',
      'cat.8': '메인쿤',
      'cat.9': '사바나',

      // 메타
      'title': '고양이 타워',
    },
    en: {
      'menu.tagline': 'Merge cats all the way to Savannah',
      'menu.best': 'Best',
      'menu.play': 'Play',
      'menu.how': 'How to Play · Tiers',
      'menu.rank': 'Ranking',
      'menu.archerlab': '🏹 ArcherLab',

      'hud.score': 'Score',
      'hud.next': 'Next',
      'hud.hint': 'Drag to move, tap to drop!',
      'hud.soundAria': 'Toggle sound',
      'hud.pauseAria': 'Pause',

      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.restart': 'Restart',
      'pause.exit': 'Main Menu',

      'over.title': 'Game Over',
      'over.final': 'Final Score',
      'over.newRecord': '🏆 New Record!',
      'over.replay': 'Try Again',
      'over.menu': 'Main Menu',
      'over.submitRank': '🏆 Submit Score',
      'over.skipRank': 'Skip',
      'over.nicknamePh': 'Nickname (20 chars)',
      'over.submitting': 'Submitting...',
      'over.submitOk': 'Submitted!',
      'over.submitFail': 'Submit failed — try later',

      'how.title': 'How to Play',
      'how.1': 'Drag to move, tap to drop',
      'how.2': 'Two of the same kind merge (2 → 1, frees space!)',
      'how.3': 'Scores grow exponentially: Kitten 10pts → Savannah 10,000pts',
      'how.4': 'Two <b>Savannahs</b> touch → <b>vanish + 20,000pt bonus</b> (field clear!)',
      'how.5': 'Too long above the red line = game over',
      'how.tiers': 'Evolution Tiers',
      'how.close': 'Close',

      'rank.title': '🏆 Ranking TOP 20',
      'rank.loading': 'Loading...',
      'rank.empty': 'No records yet. Be the first!',
      'rank.error': 'Could not load rankings',
      'rank.close': 'Close',
      'rank.rank': 'Rank',
      'rank.name': 'Name',
      'rank.score': 'Score',

      'flash.combo': '{n} Combo!',
      'flash.legend': '🏆 Legendary Savannah!',

      'cat.0': 'Kitten',
      'cat.1': 'Cheese Tabby',
      'cat.2': 'Tuxedo',
      'cat.3': 'Calico',
      'cat.4': 'Mackerel',
      'cat.5': 'Russian Blue',
      'cat.6': 'Scottish Fold',
      'cat.7': 'Persian',
      'cat.8': 'Maine Coon',
      'cat.9': 'Savannah',

      'title': 'Cat Tower',
    },
  };

  const LANG_KEY = 'cat-tower.lang';
  let lang = (function loadLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'ko' || saved === 'en') return saved;
    } catch {}
    // 브라우저 언어 감지
    const nav = (navigator.language || 'ko').toLowerCase();
    return nav.startsWith('ko') ? 'ko' : 'en';
  })();

  function t(key, vars) {
    const dict = STRINGS[lang] || STRINGS.ko;
    let v = dict[key];
    if (v == null) v = STRINGS.ko[key] || key;
    if (vars) {
      for (const k in vars) v = v.replaceAll('{' + k + '}', vars[k]);
    }
    return v;
  }

  function getLang() { return lang; }

  function setLang(l) {
    if (l !== 'ko' && l !== 'en') return;
    lang = l;
    try { localStorage.setItem(LANG_KEY, l); } catch {}
    applyDom();
    document.documentElement.lang = l;
    global.dispatchEvent(new CustomEvent('cattower:langchange', { detail: { lang: l } }));
  }

  // data-i18n="key" → textContent, data-i18n-html="key" → innerHTML, data-i18n-ph="key" → placeholder
  function applyDom() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    // title
    const titleEl = document.querySelector('title');
    if (titleEl) titleEl.textContent = t('title');
  }

  global.I18N = { t, getLang, setLang, applyDom };
})(window);
