(function () {
  const STORAGE_KEY = "jelly-pang-2048-lang";
  const DICTS = {
    ko: {
      "document.title": "Jelly Pang 2048 - Free Jelly Merge Puzzle Game | ArcherLab Games",
      "noscript": "젤리팡 2048을 플레이하려면 JavaScript를 활성화해 주세요.",
      "shell.aria": "Jelly Pang game",
      "instructions": "화면을 밀거나 방향 버튼, 키보드 방향키 또는 W A S D 키로 같은 숫자의 젤리를 합치세요.",
      "title.screenAria": "Jelly Pang start screen",
      "brand.name": "Archerlab",
      "brand.aria": "Archerlab home",
      "title.kickerHtml": "<span aria-hidden=\"true\">✦</span> THE SOFTEST LITTLE PUZZLE",
      "title.jelly": "Jelly",
      "title.pang": "Pang!",
      "title.taglineHtml": "톡, 밀면 말랑하게 팡!<br>같은 젤리를 합쳐 왕관 젤리까지.",
      "title.featuresAria": "game features",
      "title.badgeBoard": "4 × 4 머지 퍼즐",
      "title.badgeFriends": "12가지 젤리 친구",
      "title.chipHtml": "<span aria-hidden=\"true\">✦</span> 작은 젤리의 커다란 변신",
      "title.play": "게임 시작",
      "title.continue": "이어하기",
      "title.newGame": "새 게임",
      "title.rank": "명예의 전당",
      "lang.group": "언어",
      "lang.chooseKo": "한국어",
      "lang.chooseEn": "English",
      "hud.home": "시작 화면으로 이동",
      "hud.kicker": "Merge Puzzle",
      "hud.title": "Jelly Pang!",
      "sound.off": "소리 끄기",
      "sound.on": "소리 켜기",
      "score.aria": "score board",
      "score.now": "지금 점수",
      "score.best": "최고 기록",
      "board.aria": "4 by 4 jelly merge board",
      "board.empty": "빈칸",
      "board.summary": "점수 {score}점. 최고 젤리 {best}. 빈 칸 {empty}개.",
      "board.live": "4 곱하기 4 젤리 보드. {rows}. {summary}",
      "modal.crownEyebrow": "Crown Jelly",
      "modal.winTitle": "You win!",
      "modal.crownCopy": "왕관 젤리를 계속 키워보세요.",
      "modal.finalScore": "Final Score",
      "modal.nickname": "닉네임 입력",
      "modal.submit": "등록",
      "modal.skip": "건너뛰기",
      "modal.keep": "Keep playing",
      "modal.retry": "Try again",
      "modal.home": "시작 화면",
      "modal.overEyebrow": "Game over",
      "modal.overTitle": "No moves",
      "modal.overCopy": "더 이상 움직일 수 없어요.",
      "rank.aria": "명예의 전당",
      "rank.kicker": "Hall of Fame",
      "rank.title": "명예의 전당",
      "rank.close": "닫기",
      "rank.loading": "불러오는 중...",
      "rank.error": "랭킹 서버에 연결할 수 없습니다.",
      "rank.needName": "닉네임을 입력해주세요.",
      "rank.verifying": "서버 검증 중...",
      "rank.pending": "기록을 보관했어요. 연결되면 자동으로 등록합니다.",
      "rank.submitted": "등록 완료{rank}",
      "rank.mismatch": "서버 검증 점수와 현재 점수가 달라 등록하지 않았어요.",
      "rank.failed": "서버 검증이 지연되거나 실패했어요. 잠시 후 다시 눌러주세요.",
      "rank.empty": "아직 등록된 기록이 없습니다.",
      "rank.skipped": "랭킹 등록을 건너뛰었습니다.",
      "rank.player": "Jelly Player",
      "goal.title": "다음 목표, 왕관 젤리!",
      "goal.copy": "같은 숫자를 합쳐 2048에 도전하세요.",
      "controls.aria": "방향 조작",
      "controls.up": "위로 이동",
      "controls.left": "왼쪽으로 이동",
      "controls.down": "아래로 이동",
      "controls.right": "오른쪽으로 이동",
      "controls.hint": "화면을 밀거나 방향키로 움직여요",
      "error.eyebrow": "Load error",
      "error.title": "Reload",
      "error.copy": "라이브러리를 불러오지 못했습니다.",
      "announce.resume": "게임을 이어합니다.",
      "announce.newGame": "새 게임을 시작합니다.",
      "announce.blocked": "움직일 수 없는 방향입니다.",
      "announce.crown": "왕관 젤리를 완성했습니다!",
      "announce.gameOver": "더 움직일 수 없습니다. 게임 오버입니다.",
      "announce.score": "{score}점을 얻었습니다.",
      "announce.moved": "젤리를 움직였습니다.",
      "confirm.newGame": "진행 중인 게임을 끝내고 새 게임을 시작할까요?",
    },
    en: {
      "document.title": "Jelly Pang 2048 - Free Jelly Merge Puzzle Game | ArcherLab Games",
      "noscript": "Enable JavaScript to play Jelly Pang 2048.",
      "shell.aria": "Jelly Pang game",
      "instructions": "Swipe, use the arrow buttons, or press the arrow keys or W A S D to merge jellies with the same number.",
      "title.screenAria": "Jelly Pang start screen",
      "brand.name": "Archerlab",
      "brand.aria": "Archerlab home",
      "title.kickerHtml": "<span aria-hidden=\"true\">✦</span> THE SOFTEST LITTLE PUZZLE",
      "title.jelly": "Jelly",
      "title.pang": "Pang!",
      "title.taglineHtml": "Give them a nudge and they pop!<br>Merge matches all the way to the Crown Jelly.",
      "title.featuresAria": "Game features",
      "title.badgeBoard": "4 × 4 merge puzzle",
      "title.badgeFriends": "12 jelly friends",
      "title.chipHtml": "<span aria-hidden=\"true\">✦</span> Tiny jellies, big transformations",
      "title.play": "Start",
      "title.continue": "Continue",
      "title.newGame": "New game",
      "title.rank": "Hall of Fame",
      "lang.group": "Language",
      "lang.chooseKo": "한국어",
      "lang.chooseEn": "English",
      "hud.home": "Back to the start screen",
      "hud.kicker": "Merge Puzzle",
      "hud.title": "Jelly Pang!",
      "sound.off": "Turn sound off",
      "sound.on": "Turn sound on",
      "score.aria": "Scoreboard",
      "score.now": "Score",
      "score.best": "Best",
      "board.aria": "4 by 4 jelly merge board",
      "board.empty": "empty",
      "board.summary": "Score {score}. Best jelly {best}. {empty} empty cells.",
      "board.live": "4 by 4 jelly board. {rows}. {summary}",
      "modal.crownEyebrow": "Crown Jelly",
      "modal.winTitle": "You win!",
      "modal.crownCopy": "Keep growing your Crown Jelly.",
      "modal.finalScore": "Final Score",
      "modal.nickname": "Enter a nickname",
      "modal.submit": "Submit",
      "modal.skip": "Skip",
      "modal.keep": "Keep playing",
      "modal.retry": "Try again",
      "modal.home": "Start screen",
      "modal.overEyebrow": "Game over",
      "modal.overTitle": "No moves",
      "modal.overCopy": "No moves left.",
      "rank.aria": "Hall of Fame",
      "rank.kicker": "Rankings",
      "rank.title": "Hall of Fame",
      "rank.close": "Close",
      "rank.loading": "Loading...",
      "rank.error": "Can't reach the ranking server.",
      "rank.needName": "Enter a nickname.",
      "rank.verifying": "Checking with the server...",
      "rank.pending": "Score saved on this device. We'll submit it when you're back online.",
      "rank.submitted": "Submitted{rank}",
      "rank.mismatch": "The verified score didn't match, so it wasn't submitted.",
      "rank.failed": "Verification was delayed or failed. Please try again in a moment.",
      "rank.empty": "No scores yet.",
      "rank.skipped": "Skipped the leaderboard.",
      "rank.player": "Jelly Player",
      "goal.title": "Next up: Crown Jelly!",
      "goal.copy": "Merge matching numbers and race to 2048.",
      "controls.aria": "Direction controls",
      "controls.up": "Move up",
      "controls.left": "Move left",
      "controls.down": "Move down",
      "controls.right": "Move right",
      "controls.hint": "Swipe or use the arrow keys",
      "error.eyebrow": "Load error",
      "error.title": "Reload",
      "error.copy": "Couldn't load the game library.",
      "announce.resume": "Continuing your game.",
      "announce.newGame": "Starting a new game.",
      "announce.blocked": "That way is blocked.",
      "announce.crown": "You made the Crown Jelly!",
      "announce.gameOver": "No moves left. Game over.",
      "announce.score": "Scored {score}.",
      "announce.moved": "Jellies moved.",
      "confirm.newGame": "End this game and start a new one?",
    },
  };

  function normalize(value) {
    if (value == null) return null;
    const lang = String(value).trim().toLowerCase();
    return lang === "en" || lang === "ko" ? lang : null;
  }

  function readStored() {
    try {
      return normalize(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function save(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  }

  function langFromPathname() {
    const path = window.location.pathname || "";
    return /(?:^|\/)index-en(?:\.html)?$/.test(path) ? "en" : null;
  }

  function langFromQuery() {
    try {
      return normalize(new URLSearchParams(window.location.search).get("lang"));
    } catch {
      return null;
    }
  }

  function resolveLang() {
    return langFromPathname()
      || langFromQuery()
      || readStored()
      || normalize(document.documentElement.lang)
      || "ko";
  }

  let lang = resolveLang();
  save(lang);

  function t(key, vars) {
    const primary = DICTS[lang] || DICTS.ko;
    let value = primary[key];
    if (value == null) value = DICTS.ko[key];
    if (value == null) return key;
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (token, name) => (
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : token
    ));
  }

  function apply() {
    document.documentElement.lang = lang;
    document.title = t("document.title");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    document.querySelectorAll("[data-lang-choice]").forEach((button) => {
      const active = button.getAttribute("data-lang-choice") === lang;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setLang(next) {
    const normalized = normalize(next);
    if (!normalized) return;
    lang = normalized;
    save(lang);
    apply();
  }

  function getLang() {
    return lang;
  }

  window.JellyI18n = { t, getLang, setLang, apply };

  if (document.querySelector("[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-aria]")) {
    apply();
  } else {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  }
})();
