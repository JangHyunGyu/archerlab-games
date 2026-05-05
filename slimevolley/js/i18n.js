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
            'lobby.title': '온라인 대전',
            'lobby.nickname': '닉네임',
            'lobby.nicknamePlaceholder': '이름 입력',
            'lobby.refresh': '새로고침',
            'lobby.createRoom': '방 만들기',
            'lobby.loading': '방 목록을 불러오는 중...',
            'lobby.empty': '열린 방이 없습니다. 새로 만들어보세요!',
            'lobby.loadFailed': '서버 연결 실패',
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
            'common.create': '생성',
            'common.cancel': '취소',
            'common.ok': '확인',
            'common.send': '전송',
            'common.leave': '나가기',
            'common.soundOn': '사운드 ON',
            'common.soundOff': '사운드 OFF',
            'create.title': '방 만들기',
            'create.roomType': '방 유형',
            'create.password': '비밀번호 (숫자 4자리)',
            'create.sets': '세트 수',
            'create.setOne': '단판 (1세트)',
            'create.setThree': '3세트 (2선승)',
            'create.setFive': '5세트 (3선승)',
            'create.score': '세트 당 스코어',
            'create.score15': '15점',
            'create.score21': '21점',
            'create.score25': '25점',
            'create.deuce': '듀스 (동점 시 2점 차 승리)',
            'room.title': '대기실',
            'room.public': '공개방',
            'room.private': '비밀방',
            'room.setSingle': '단판',
            'room.setBestOf': '{sets}세트 ({wins}선승)',
            'room.points': '{score}점',
            'room.deuce': '듀스 {state}',
            'room.deuceOn': 'ON',
            'room.deuceOff': 'OFF',
            'room.teamA': '팀 A (블루)',
            'room.teamB': '팀 B (레드)',
            'room.empty': '비어 있음',
            'room.host': '방장',
            'room.ready': '준비',
            'room.readyActive': '준비 완료',
            'room.bot': '봇',
            'room.addBot': '+ 봇',
            'room.switchTeam': '팀 변경',
            'room.chatPlaceholder': '메시지 입력...',
            'room.startGame': '게임 시작',
            'start.reason.needTwoTeams': '양 팀 모두 최소 1명 이상 있어야 시작할 수 있습니다.',
            'start.reason.notReady': '아직 준비하지 않은 플레이어가 있습니다. 모든 플레이어가 준비 상태여야 합니다.',
            'lobby.statusWaiting': '대기중',
            'lobby.statusPlaying': '경기중',
            'lobby.playerCount': '{count}명',
            'password.title': '비밀번호 입력',
            'password.placeholder': '숫자 4자리',
            'password.join': '입장',
            'error.enterNickname': '닉네임을 입력해주세요',
            'error.enterNicknameFirst': '닉네임을 먼저 입력해주세요',
            'error.enterFourDigits': '숫자 4자리를 입력해주세요',
            'error.passwordFourDigits': '비밀번호는 숫자 4자리로 입력해주세요',
            'error.serverRetry': '서버 연결 실패. 잠시 후 다시 시도해주세요.',
            'error.passwordWrong': '비밀번호가 틀렸습니다',
            'error.joinFailed': '방에 입장할 수 없습니다',
            'confirm.leaveGame': '게임을 나가시겠습니까?',
            'confirm.leaveRoom': '방을 나가시겠습니까?',
            'gameOver.victory': '승리!',
            'gameOver.defeat': '패배',
            'gameOver.lobby': '로비로',
            'gameOver.playAgain': '다시 하기',
            'gameOver.set': '세트',
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
            'lobby.title': 'Online Match',
            'lobby.nickname': 'Nickname',
            'lobby.nicknamePlaceholder': 'Enter name',
            'lobby.refresh': 'Refresh',
            'lobby.createRoom': 'Create Room',
            'lobby.loading': 'Loading rooms...',
            'lobby.empty': 'No open rooms yet. Create one!',
            'lobby.loadFailed': 'Server connection failed',
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
            'common.create': 'Create',
            'common.cancel': 'Cancel',
            'common.ok': 'OK',
            'common.send': 'Send',
            'common.leave': 'Leave',
            'common.soundOn': 'Sound ON',
            'common.soundOff': 'Sound OFF',
            'create.title': 'Create Room',
            'create.roomType': 'Room Type',
            'create.password': 'Password (4 digits)',
            'create.sets': 'Sets',
            'create.setOne': 'Single Set',
            'create.setThree': '3 Sets (Best of 3)',
            'create.setFive': '5 Sets (Best of 5)',
            'create.score': 'Score Per Set',
            'create.score15': '15 pts',
            'create.score21': '21 pts',
            'create.score25': '25 pts',
            'create.deuce': 'Deuce (win by 2 on tie)',
            'room.title': 'Room',
            'room.public': 'Public',
            'room.private': 'Private',
            'room.setSingle': 'Single set',
            'room.setBestOf': '{sets} sets (best of {wins})',
            'room.points': '{score} pts',
            'room.deuce': 'Deuce {state}',
            'room.deuceOn': 'ON',
            'room.deuceOff': 'OFF',
            'room.teamA': 'Team A (Blue)',
            'room.teamB': 'Team B (Red)',
            'room.empty': 'Empty',
            'room.host': 'HOST',
            'room.ready': 'Ready',
            'room.readyActive': 'Ready!',
            'room.bot': 'BOT',
            'room.addBot': '+ Bot',
            'room.switchTeam': 'Switch Team',
            'room.chatPlaceholder': 'Enter message...',
            'room.startGame': 'Start Game',
            'start.reason.needTwoTeams': 'Both teams need at least one player before starting.',
            'start.reason.notReady': 'Some players are not ready yet. Every player must be Ready.',
            'lobby.statusWaiting': 'Waiting',
            'lobby.statusPlaying': 'Playing',
            'lobby.playerCount': '{count} players',
            'password.title': 'Enter Password',
            'password.placeholder': '4 digits',
            'password.join': 'Join',
            'error.enterNickname': 'Please enter a nickname',
            'error.enterNicknameFirst': 'Please enter a nickname first',
            'error.enterFourDigits': 'Please enter 4 digits',
            'error.passwordFourDigits': 'Password must be 4 digits',
            'error.serverRetry': 'Server connection failed. Please try again shortly.',
            'error.passwordWrong': 'Incorrect password',
            'error.joinFailed': 'Unable to join the room',
            'confirm.leaveGame': 'Leave the game?',
            'confirm.leaveRoom': 'Leave the room?',
            'gameOver.victory': 'Victory!',
            'gameOver.defeat': 'Defeat',
            'gameOver.lobby': 'Lobby',
            'gameOver.playAgain': 'Play Again',
            'gameOver.set': 'Set',
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
