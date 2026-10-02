(function (global) {
  "use strict";

  const LANG_KEY = "parking-escape-lang";
  const STRINGS = {
    ko: {
      "meta.title": "주차장 탈출 | Parking Escape - Free Car Parking Puzzle Game",
      "aria.archerlab": "ArcherLab 홈",
      "aria.board": "주차 퍼즐 게임 화면",
      "aria.hud": "게임 상태",
      "aria.loading": "레벨 생성 중",
      "sound.on": "사운드 켬",
      "sound.off": "사운드 끔",
      "hud.menu": "메뉴",
      "hud.level": "레벨",
      "hud.time": "시간",
      "hud.moves": "이동",
      "hud.par": "최소",
      "menu.titleAria": "주차장 탈출",
      "menu.title1": "주차장",
      "menu.title2": "탈출",
      "menu.play": "게임 시작",
      "menu.continue": "계속하기",
      "menu.continueLevel": "Lv {level} 계속하기",
      "menu.rank": "랭킹",
      "lang.group": "언어",
      "lang.ko": "한국어",
      "lang.en": "English",
      "clear.idle": "LEVEL CLEAR",
      "clear.moves": "이동",
      "clear.next": "다음",
      "clear.reached": "도달",
      "clear.last": "마지막",
      "clear.done": "완료",
      "clear.allTitle": "ALL LEVELS CLEAR",
      "clear.totalMoves": "총 이동",
      "clear.toMenu": "메뉴로",
      "clear.levelTitle": "LEVEL {level} CLEAR",
      "clear.nextBtn": "다음",
      "fail.title": "TIME UP",
      "fail.moves": "이동",
      "fail.failed": "실패",
      "fail.reached": "도달",
      "fail.menu": "메인",
      "fail.retry": "다시하기",
      "rank.nickPh": "닉네임 (20자)",
      "rank.nickAria": "랭킹 닉네임",
      "rank.submit": "등록",
      "rank.skip": "건너뛰기",
      "rank.progressAria": "랭킹 등록 중",
      "rank.title": "랭킹",
      "rank.loading": "불러오는 중...",
      "rank.challenge": "Lv.1부터 랭킹 도전",
      "rank.close": "닫기",
      "rank.error": "랭킹을 불러오지 못했습니다",
      "rank.empty": "아직 등록된 기록이 없습니다",
      "rank.needName": "닉네임을 입력하세요",
      "rank.submitting": "등록 중...",
      "rank.submittingShort": "등록 중",
      "rank.pendingBtn": "저장 대기",
      "rank.doneBtn": "완료",
      "rank.pendingStatus": "기록을 보관했습니다. 자동으로 등록합니다.",
      "rank.doneStatus": "등록 완료",
      "rank.syncFail": "기록 동기화가 끊겨 등록하지 못했습니다",
      "rank.submitFail": "등록 실패. 다시 시도하거나 Skip하세요",
      "rank.skipped": "등록을 건너뛰었습니다",
      "rank.allClear": "ALL CLEAR",
      "toast.blocked": "이 방향으로는 움직일 수 없습니다",
    },
    en: {
      "meta.title": "Parking Escape - Free Car Parking Puzzle Game",
      "aria.archerlab": "ArcherLab home",
      "aria.board": "Parking puzzle",
      "aria.hud": "Game status",
      "aria.loading": "Building level",
      "sound.on": "Sound on",
      "sound.off": "Sound off",
      "hud.menu": "Menu",
      "hud.level": "Level",
      "hud.time": "Time",
      "hud.moves": "Moves",
      "hud.par": "Par",
      "menu.titleAria": "Parking Escape",
      "menu.title1": "Parking",
      "menu.title2": "Escape",
      "menu.play": "Start",
      "menu.continue": "Continue",
      "menu.continueLevel": "Continue Lv {level}",
      "menu.rank": "Ranking",
      "lang.group": "Language",
      "lang.ko": "Korean",
      "lang.en": "English",
      "clear.idle": "LEVEL CLEAR",
      "clear.moves": "Moves",
      "clear.next": "Next",
      "clear.reached": "Reached",
      "clear.last": "Last",
      "clear.done": "Cleared",
      "clear.allTitle": "ALL LEVELS CLEAR",
      "clear.totalMoves": "Total moves",
      "clear.toMenu": "Menu",
      "clear.levelTitle": "LEVEL {level} CLEAR",
      "clear.nextBtn": "Next",
      "fail.title": "TIME UP",
      "fail.moves": "Moves",
      "fail.failed": "Failed",
      "fail.reached": "Reached",
      "fail.menu": "Menu",
      "fail.retry": "Retry",
      "rank.nickPh": "Nickname (20 chars)",
      "rank.nickAria": "Ranking nickname",
      "rank.submit": "Submit",
      "rank.skip": "Skip",
      "rank.progressAria": "Submitting score",
      "rank.title": "Ranking",
      "rank.loading": "Loading...",
      "rank.challenge": "Rank from Lv.1",
      "rank.close": "Close",
      "rank.error": "Couldn't load rankings",
      "rank.empty": "No scores yet",
      "rank.needName": "Enter a nickname",
      "rank.submitting": "Submitting...",
      "rank.submittingShort": "Submitting",
      "rank.pendingBtn": "Pending",
      "rank.doneBtn": "Done",
      "rank.pendingStatus": "Score saved. It will be submitted automatically.",
      "rank.doneStatus": "Submitted",
      "rank.syncFail": "Score sync dropped, so it was not submitted",
      "rank.submitFail": "Submit failed. Try again or skip.",
      "rank.skipped": "Ranking skipped",
      "rank.allClear": "ALL CLEAR",
      "toast.blocked": "Can't move that way",
    },
  };

  function pathLang() {
    const path = String(global.location && global.location.pathname || "").replace(/\/+$/, "");
    return /(?:^|\/)index-en(?:\.html)?$/i.test(path) ? "en" : null;
  }

  function queryLang() {
    try {
      const value = new URLSearchParams(global.location.search).get("lang");
      if (value === "en" || value === "ko") return value;
    } catch (error) { /* Query parsing can fail in non-browser hosts. */ }
    return null;
  }

  function storedLang() {
    try {
      const value = global.localStorage.getItem(LANG_KEY);
      if (value === "en" || value === "ko") return value;
    } catch (error) { /* Storage may be blocked. */ }
    return null;
  }

  function documentLang() {
    const value = String(document.documentElement.getAttribute("lang") || "").toLowerCase();
    if (value.startsWith("en")) return "en";
    if (value.startsWith("ko")) return "ko";
    return null;
  }

  function persist(next) {
    try { global.localStorage.setItem(LANG_KEY, next); } catch (error) { /* Keep playing if storage is blocked. */ }
  }

  let lang = pathLang() || queryLang() || storedLang() || documentLang() || "ko";
  persist(lang);

  function t(key, vars) {
    const dict = STRINGS[lang] || STRINGS.ko;
    let value = dict[key];
    if (value == null) value = STRINGS.ko[key] != null ? STRINGS.ko[key] : key;
    if (vars) {
      value = String(value).replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? "" : String(vars[name])));
    }
    return value;
  }

  function getLang() { return lang; }

  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.placeholder = t(el.getAttribute("data-i18n-ph"));
    });
    document.querySelectorAll("[data-lang-choice]").forEach((btn) => {
      const active = btn.getAttribute("data-lang-choice") === lang;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setLang(next) {
    if (next !== "ko" && next !== "en") return;
    if (next === lang) {
      apply();
      return;
    }
    lang = next;
    persist(lang);
    apply();
    global.dispatchEvent(new CustomEvent("parking-escape:langchange", { detail: { lang } }));
  }

  function bindLangSwitch() {
    document.querySelectorAll("[data-lang-choice]").forEach((btn) => {
      if (btn.dataset.langBound === "1") return;
      btn.dataset.langBound = "1";
      btn.addEventListener("click", () => setLang(btn.getAttribute("data-lang-choice")));
    });
  }

  bindLangSwitch();
  apply();

  global.ParkingI18n = { t, getLang, setLang, apply };
})(window);
