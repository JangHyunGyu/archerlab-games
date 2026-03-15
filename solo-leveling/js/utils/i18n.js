// Detect language from saved preference, URL parameter, or default to 'ko'
const params = new URLSearchParams(window.location.search);
const langParam = params.get('lang');
const savedLang = localStorage.getItem('shadow_survival_lang');
const _supportedLangs = ['ko', 'en', 'ja'];
const _browserLang = (navigator.language || '').slice(0, 2);
export let LANG = savedLang
    || (langParam === 'en' || langParam === 'ja' ? langParam : null)
    || (_supportedLangs.includes(_browserLang) ? _browserLang : 'ko');

export const LANGUAGES = [
    { code: 'ko', label: '한국어' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
];

export function setLang(code) {
    LANG = code;
    localStorage.setItem('shadow_survival_lang', code);
}

const TEXTS = {
    ko: {
        // Menu
        title: '그림자 서바이벌',
        subtitle: 'S U R V I V O R S',
        startGame: '게임 시작',
        controlsMobile: '화면 왼쪽을 터치 & 드래그하여 이동',
        controlsMobileAuto: '공격은 자동 | 적을 처치하고 레벨업하세요',
        controlsPC: 'WASD / 방향키로 이동  |  자동 공격  |  TAB: 상태창  |  M: 사운드',
        controlsPC2: '적을 처치하고 경험치를 모아 스킬을 강화하세요',
        contact: '💬 문의하기',
        contactTitle: '💌 문의하기',
        contactDesc: '궁금한 점이나 피드백을 보내주세요!',
        contactKakao: '💬 카카오톡 오픈채팅',
        contactEmail: '📧 hyungyu@archerlab.dev',
        close: '닫기',

        // System messages
        sysEnterDungeon: '플레이어가 던전에 입장했습니다.',
        sysKillToLevel: '마수를 처치하고 레벨을 올리세요.',
        sysQuestComing: '일일 퀘스트가 주어질 예정입니다.',
        sysTabHint: 'TAB 키로 상태창을 확인할 수 있습니다.',
        sysSoundOn: '사운드: ON',
        sysSoundOff: '사운드: OFF',
        sysSystem: '[시스템]',
        sysWarning: '[경고]',
        sysQuest: '[퀘스트]',

        // Level up
        levelUp: 'LEVEL UP!',
        levelUpMsg: '레벨이 올랐습니다!',
        newSkill: '새로운 스킬을 선택하세요.',
        skillLabel: '스킬',
        passiveLabel: '패시브',

        // Boss
        bossDetected: '강력한 마수의 기운이 감지되었습니다!',
        bossAppeared: '이(가) 출현했습니다.',

        // Death / Game Over / Victory
        playerDied: '플레이어가 사망했습니다.',
        exitDungeon: '던전에서 퇴장합니다...',
        huntOver: '사냥은 끝났다...',
        victory: '던전 클리어!',
        victoryTitle: 'DUNGEON CLEAR',
        victorySub: '그림자 군주의 힘으로 모든 던전을 정복했다!',
        retry: '다시 도전',
        toMenu: '메뉴로',
        result: '결과',
        rankLabel: '랭크',
        levelLabel: '레벨',
        killLabel: '처치수',
        timeLabel: '생존 시간',
        shadowLabel: '그림자 군단',

        // Status window
        statusTitle: '상태창',
        statName: '이름',
        statRank: '칭호',
        statLevel: '레벨',
        statSection: '[ 능력치 ]',
        statHP: 'HP',
        statAttack: '공격력',
        statSpeed: '이동속도',
        statCrit: '치명타율',
        statCritDmg: '치명타 피해',
        statXP: '경험치 배율',
        statCDR: '쿨타임 감소',
        statShadow: '그림자 군단',
        statUnit: '마리',
        tabClose: 'TAB 키로 닫기',
        playerName: '성진우',

        // HUD
        hudStatus: '상태',

        // Enemy names
        enemies: {
            goblin: '고블린', antSoldier: '개미 병사', orc: '오크',
            iceBear: '아이스 베어', stoneGolem: '스톤 골렘', darkMage: '다크 메이지',
            ironKnight: '아이언 나이트', demonWarrior: '마족 전사',
        },

        // Weapons
        weapons: {
            basicDagger: { name: '단검 공격', desc: '단검으로 가까운 적을 빠르게 찌릅니다' },
            shadowDagger: { name: '단검 투척', desc: '가장 가까운 적에게 그림자 단검을 투척합니다' },
            shadowSlash: { name: '그림자 베기', desc: '전방에 그림자 검기를 휘둘러 적을 벱니다' },
            rulersAuthority: { name: '지배자의 권능', desc: '텔레키네시스로 주변 적에게 범위 피해를 줍니다' },
            dragonFear: { name: '용의 공포', desc: '공포의 오라로 주변 적의 이동속도를 감소시킵니다' },
        },

        // Passives
        passives: {
            swiftness: { name: '신속', desc: '이동속도 +8%' },
            vitality: { name: '체력 강화', desc: '최대 HP +12%' },
            strength: { name: '힘 강화', desc: '공격력 +8%' },
            critMaster: { name: '치명타 달인', desc: '치명타율 +8%' },
            scholar: { name: '학습 능력', desc: '경험치 +12%' },
            hastening: { name: '쿨타임 감소', desc: '스킬 쿨타임 -8%' },
            magnet: { name: '자석', desc: '픽업 범위 +25%' },
        },

        // Items
        items: {
            hpPotion: 'HP 포션',
            manaCrystal: '마나 크리스탈',
            shadowEssence: '그림자 정수',
        },

        // Hall of Fame
        hallOfFame: '명예의 전당',
        ranking: '랭킹',
        noRecords: '기록이 없습니다',
        enterName: '이름을 입력하세요',
        submitScore: '등록',
        skipScore: '건너뛰기',
        nameInputTitle: '명예의 전당 등록',
        rankSubmitted: '등록 완료!',
        yourRank: '순위',
        loading: '로딩 중...',
        scoreLabel: '점수',
    },

    en: {
        title: 'Shadow Survival',
        subtitle: 'S U R V I V O R S',
        startGame: 'START GAME',
        controlsMobile: 'Touch & drag the left side to move',
        controlsMobileAuto: 'Auto-attack | Kill enemies and level up!',
        controlsPC: 'WASD / Arrow keys to move  |  Auto-attack  |  TAB: Status  |  M: Sound',
        controlsPC2: 'Kill enemies and collect XP to upgrade your skills',
        contact: '💬 Contact',
        contactTitle: '💌 Contact Us',
        contactDesc: 'Send us your questions or feedback!',
        contactKakao: '💬 KakaoTalk Open Chat',
        contactEmail: '📧 hyungyu@archerlab.dev',
        close: 'Close',

        sysEnterDungeon: 'Player has entered the dungeon.',
        sysKillToLevel: 'Defeat monsters and level up.',
        sysQuestComing: 'A daily quest will be assigned soon.',
        sysTabHint: 'Press TAB to check your status.',
        sysSoundOn: 'Sound: ON',
        sysSoundOff: 'Sound: OFF',
        sysSystem: '[SYSTEM]',
        sysWarning: '[WARNING]',
        sysQuest: '[QUEST]',

        levelUp: 'LEVEL UP!',
        levelUpMsg: 'Level increased!',
        newSkill: 'Choose a new skill.',
        skillLabel: 'Skill',
        passiveLabel: 'Passive',

        bossDetected: 'A powerful enemy has been detected!',
        bossAppeared: ' has appeared.',

        playerDied: 'Player has fallen.',
        exitDungeon: 'Leaving the dungeon...',
        huntOver: 'The hunt is over...',
        victory: 'Dungeon Clear!',
        victoryTitle: 'DUNGEON CLEAR',
        victorySub: 'The Shadow Monarch has conquered all dungeons!',
        retry: 'Retry',
        toMenu: 'Menu',
        result: 'Result',
        rankLabel: 'Rank',
        levelLabel: 'Level',
        killLabel: 'Kills',
        timeLabel: 'Time',
        shadowLabel: 'Shadow Army',

        statusTitle: 'Status',
        statName: 'Name',
        statRank: 'Title',
        statLevel: 'Level',
        statSection: '[ Stats ]',
        statHP: 'HP',
        statAttack: 'Attack',
        statSpeed: 'Speed',
        statCrit: 'Crit Rate',
        statCritDmg: 'Crit DMG',
        statXP: 'XP Bonus',
        statCDR: 'Cooldown',
        statShadow: 'Shadow Army',
        statUnit: '',
        tabClose: 'Press TAB to close',
        playerName: 'Sung Jinwoo',

        hudStatus: 'Status',

        enemies: {
            goblin: 'Goblin', antSoldier: 'Ant Soldier', orc: 'Orc',
            iceBear: 'Ice Bear', stoneGolem: 'Stone Golem', darkMage: 'Dark Mage',
            ironKnight: 'Iron Knight', demonWarrior: 'Demon Warrior',
        },

        weapons: {
            basicDagger: { name: 'Dagger Attack', desc: 'Stab nearby enemies quickly with a dagger' },
            shadowDagger: { name: 'Dagger Throw', desc: 'Throw a shadow dagger at the nearest enemy' },
            shadowSlash: { name: 'Shadow Slash', desc: 'Swing a shadow blade to slash enemies ahead' },
            rulersAuthority: { name: "Ruler's Authority", desc: 'Deal AoE damage with telekinesis' },
            dragonFear: { name: "Dragon's Fear", desc: 'Slow nearby enemies with an aura of fear' },
        },

        passives: {
            swiftness: { name: 'Swiftness', desc: 'Move speed +10%' },
            vitality: { name: 'Vitality', desc: 'Max HP +15%' },
            strength: { name: 'Strength', desc: 'Attack +12%' },
            critMaster: { name: 'Crit Master', desc: 'Crit rate +5%' },
            scholar: { name: 'Scholar', desc: 'XP gain +15%' },
            hastening: { name: 'Haste', desc: 'Skill cooldown -8%' },
        },

        items: {
            hpPotion: 'HP Potion',
            manaCrystal: 'Mana Crystal',
            shadowEssence: 'Shadow Essence',
        },

        hallOfFame: 'HALL OF FAME',
        ranking: 'RANKING',
        noRecords: 'No records yet',
        enterName: 'Enter your name',
        submitScore: 'SUBMIT',
        skipScore: 'SKIP',
        nameInputTitle: 'HALL OF FAME',
        rankSubmitted: 'Submitted!',
        yourRank: 'Rank',
        loading: 'Loading...',
        scoreLabel: 'Score',
    },

    ja: {
        title: 'シャドウサバイバル',
        subtitle: 'S U R V I V O R S',
        startGame: 'ゲーム開始',
        controlsMobile: '画面左側をタッチ＆ドラッグで移動',
        controlsMobileAuto: '攻撃は自動 | 敵を倒してレベルアップ！',
        controlsPC: 'WASD / 矢印キーで移動  |  自動攻撃  |  TAB: ステータス  |  M: サウンド',
        controlsPC2: '敵を倒して経験値を集め、スキルを強化しよう',
        contact: '💬 お問い合わせ',
        contactTitle: '💌 お問い合わせ',
        contactDesc: 'ご質問やフィードバックをお送りください！',
        contactKakao: '💬 カカオトーク オープンチャット',
        contactEmail: '📧 hyungyu@archerlab.dev',
        close: '閉じる',

        sysEnterDungeon: 'プレイヤーがダンジョンに入場しました。',
        sysKillToLevel: '魔獣を倒してレベルを上げましょう。',
        sysQuestComing: 'デイリークエストが間もなく開始されます。',
        sysTabHint: 'TABキーでステータスを確認できます。',
        sysSoundOn: 'サウンド: ON',
        sysSoundOff: 'サウンド: OFF',
        sysSystem: '[システム]',
        sysWarning: '[警告]',
        sysQuest: '[クエスト]',

        levelUp: 'LEVEL UP!',
        levelUpMsg: 'レベルが上がりました！',
        newSkill: '新しいスキルを選んでください。',
        skillLabel: 'スキル',
        passiveLabel: 'パッシブ',

        bossDetected: '強力な魔獣の気配が感知されました！',
        bossAppeared: 'が出現しました。',

        playerDied: 'プレイヤーが倒れました。',
        exitDungeon: 'ダンジョンから退場します...',
        huntOver: '狩りは終わった...',
        victory: 'ダンジョンクリア！',
        victoryTitle: 'DUNGEON CLEAR',
        victorySub: '影の君主の力で全てのダンジョンを制覇した！',
        retry: 'リトライ',
        toMenu: 'メニュー',
        result: '結果',
        rankLabel: 'ランク',
        levelLabel: 'レベル',
        killLabel: '討伐数',
        timeLabel: '生存時間',
        shadowLabel: '影の軍団',

        statusTitle: 'ステータス',
        statName: '名前',
        statRank: '称号',
        statLevel: 'レベル',
        statSection: '[ 能力値 ]',
        statHP: 'HP',
        statAttack: '攻撃力',
        statSpeed: '移動速度',
        statCrit: 'クリティカル率',
        statCritDmg: 'クリティカルダメージ',
        statXP: '経験値倍率',
        statCDR: 'クールダウン減少',
        statShadow: '影の軍団',
        statUnit: '体',
        tabClose: 'TABキーで閉じる',
        playerName: '旬',

        hudStatus: 'ステータス',

        enemies: {
            goblin: 'ゴブリン', antSoldier: 'アリ兵士', orc: 'オーク',
            iceBear: 'アイスベア', stoneGolem: 'ストーンゴーレム', darkMage: 'ダークメイジ',
            ironKnight: 'アイアンナイト', demonWarrior: '魔族戦士',
        },

        weapons: {
            basicDagger: { name: '短剣攻撃', desc: '短剣で近くの敵を素早く突きます' },
            shadowDagger: { name: '短剣投擲', desc: '最も近い敵に影の短剣を投げます' },
            shadowSlash: { name: '影斬り', desc: '前方に影の剣気を振るい敵を斬ります' },
            rulersAuthority: { name: '支配者の権能', desc: 'テレキネシスで周囲の敵に範囲ダメージ' },
            dragonFear: { name: '龍の恐怖', desc: '恐怖のオーラで周囲の敵の移動速度を減少' },
        },

        passives: {
            swiftness: { name: '迅速', desc: '移動速度 +10%' },
            vitality: { name: '体力強化', desc: '最大HP +15%' },
            strength: { name: '力強化', desc: '攻撃力 +12%' },
            critMaster: { name: 'クリティカルの達人', desc: 'クリティカル率 +5%' },
            scholar: { name: '学習能力', desc: '経験値 +15%' },
            hastening: { name: 'クールダウン減少', desc: 'スキルクールダウン -8%' },
        },

        items: {
            hpPotion: 'HPポーション',
            manaCrystal: 'マナクリスタル',
            shadowEssence: '影のエッセンス',
        },

        hallOfFame: '殿堂入り',
        ranking: 'ランキング',
        noRecords: '記録がありません',
        enterName: '名前を入力',
        submitScore: '登録',
        skipScore: 'スキップ',
        nameInputTitle: '殿堂入り',
        rankSubmitted: '登録完了！',
        yourRank: '順位',
        loading: '読み込み中...',
        scoreLabel: 'スコア',
    },
};

// Game API Config
export const GAME_API_URL = 'https://game-api.yama5993.workers.dev';
export const GAME_ID_SHADOW = 'shadow-survival';

export function t(key) {
    return TEXTS[LANG]?.[key] ?? TEXTS.ko[key] ?? key;
}

export function tNested(category, key) {
    return TEXTS[LANG]?.[category]?.[key] ?? TEXTS.ko[category]?.[key] ?? key;
}
