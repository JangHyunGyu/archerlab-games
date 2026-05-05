// Lightweight UI localization for Slime Volley.
(function() {
    const STORAGE_KEY = 'slimevolley_lang';
    const DEFAULT_LANG = 'ko';

    const translations = {
        ko: {
            'app.name': '슬라임 배구',
            'document.title': '슬라임 배구 | Archerlab Games',
            'header.back': '게임 목록으로 돌아가기',
            'header.sound': '사운드 켜기/끄기',
            'language.label': '언어 선택',
            'language.ko': '한국어',
            'language.en': 'English',
            'menu.subtitle': '클래식 슬라임 배구 대전',
            'menu.practice': '혼자 연습',
            'menu.practiceDesc': '봇 상대 연습 모드',
            'menu.multiplayer': '다같이 시합',
            'menu.multiplayerDesc': '온라인 멀티플레이어',
            'controls.title': '조작법',
            'controls.move': '이동',
            'controls.jump': '점프',
            'controls.or': '또는',
            'practice.title': '연습 모드',
            'practice.myTeam': '내 팀 인원',
            'practice.botTeam': '봇 팀 인원',
            'practice.difficulty': '난이도',
            'practice.solo': '1 (솔로)',
            'difficulty.easy': '쉬움',
            'difficulty.normal': '보통',
            'difficulty.hard': '어려움',
            'common.back': '뒤로',
            'common.start': '시작!',
            'common.ok': '확인',
            'common.soundOn': '사운드 ON',
            'common.soundOff': '사운드 OFF',
            'room.startGame': '게임 시작',
            'start.reason.needTwoTeams': '양 팀 모두 최소 1명 이상 있어야 시작할 수 있습니다.',
            'start.reason.notReady': '아직 준비하지 않은 플레이어가 있습니다. 모든 플레이어가 Ready 상태여야 합니다.',
        },
        en: {
            'app.name': 'Slime Volley',
            'document.title': 'Slime Volley | Archerlab Games',
            'header.back': 'Back to Games',
            'header.sound': 'Toggle Sound',
            'language.label': 'Language',
            'language.ko': '한국어',
            'language.en': 'English',
            'menu.subtitle': 'Classic Volleyball Battle',
            'menu.practice': 'Practice',
            'menu.practiceDesc': 'Practice against bots',
            'menu.multiplayer': 'Multiplayer',
            'menu.multiplayerDesc': 'Online multiplayer',
            'controls.title': 'Controls',
            'controls.move': 'Move',
            'controls.jump': 'Jump',
            'controls.or': 'or',
            'practice.title': 'Practice Mode',
            'practice.myTeam': 'My Team Size',
            'practice.botTeam': 'Bot Team Size',
            'practice.difficulty': 'Difficulty',
            'practice.solo': '1 (Solo)',
            'difficulty.easy': 'Easy',
            'difficulty.normal': 'Normal',
            'difficulty.hard': 'Hard',
            'common.back': 'Back',
            'common.start': 'Start!',
            'common.ok': 'OK',
            'common.soundOn': 'Sound ON',
            'common.soundOff': 'Sound OFF',
            'room.startGame': 'Start Game',
            'start.reason.needTwoTeams': 'Both teams need at least one player before starting.',
            'start.reason.notReady': 'Some players are not ready yet. Every player must be Ready.',
        },
    };

    let currentLang = DEFAULT_LANG;

    function normalizeLang(lang) {
        return translations[lang] ? lang : DEFAULT_LANG;
    }

    function getStoredLang() {
        try {
            return normalizeLang(localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG);
        } catch (_) {
            return DEFAULT_LANG;
        }
    }

    function saveLang(lang) {
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (_) {}
    }

    function t(key) {
        const dict = translations[currentLang] || translations[DEFAULT_LANG];
        return dict[key] || translations[DEFAULT_LANG][key] || key;
    }

    function applyText(selector, attributeName) {
        document.querySelectorAll(selector).forEach(el => {
            const key = el.dataset[attributeName];
            const value = t(key);
            if (value) el.textContent = value;
        });
    }

    function applyAttribute(selector, datasetName, attrName) {
        document.querySelectorAll(selector).forEach(el => {
            const key = el.dataset[datasetName];
            const value = t(key);
            if (value) el.setAttribute(attrName, value);
        });
    }

    function updateLanguageButtons() {
        document.querySelectorAll('[data-lang-choice]').forEach(btn => {
            const isActive = btn.dataset.langChoice === currentLang;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        });
    }

    function apply(lang) {
        currentLang = normalizeLang(lang);
        document.documentElement.lang = currentLang;
        document.title = t('document.title');
        applyText('[data-i18n]', 'i18n');
        applyAttribute('[data-i18n-title]', 'i18nTitle', 'title');
        applyAttribute('[data-i18n-placeholder]', 'i18nPlaceholder', 'placeholder');
        applyAttribute('[data-i18n-aria-label]', 'i18nAriaLabel', 'aria-label');
        updateLanguageButtons();
        saveLang(currentLang);
        window.dispatchEvent(new CustomEvent('slimevolley:languagechange', {
            detail: { lang: currentLang },
        }));
    }

    function setLang(lang) {
        apply(lang);
    }

    function init() {
        document.querySelectorAll('[data-lang-choice]').forEach(btn => {
            btn.addEventListener('click', () => {
                setLang(btn.dataset.langChoice);
            });
        });
        apply(getStoredLang());
    }

    window.SlimeVolleyI18n = {
        t,
        apply,
        setLang,
        getLang: () => currentLang,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
