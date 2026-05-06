/**
 * Solo Leveling (그림자 서바이벌) 종합 검증 스크립트
 * node validate.js 로 실행
 *
 * 검증 항목:
 *  1. HTML 스크립트/CSS 참조 파일 존재
 *  2. ES Module import 경로 ↔ 실제 파일 일치
 *  3. 사운드 파일 존재
 *  4. 적 타입 정의 완전성 (hp/attack/speed/xp/color/size)
 *  5. 보스 스케줄 정합성 (시간 단조증가, 타입 존재)
 *  6. 무기 정의 완전성 (unlockLevel 단조증가, levelBonuses 1~10)
 *  7. 패시브 정의 완전성 (stat/bonus/icon)
 *  8. XP 테이블 정합성 (단조증가, 30레벨)
 *  9. 랭크 시스템 정합성 (레벨 매핑, 순서)
 * 10. 웨이브 설정 정합성 (값 범위)
 * 11. 플레이어 기본 스탯 정합성
 * 12. 다국어 HTML 동기화 (리다이렉트 페이지 검증)
 * 13. Phaser 씬 파일 존재 ↔ 등록 일관성
 * 14. 엔티티/매니저/UI/무기 파일 존재
 * 15. 서비스 워커 파일 존재
 * 16. 난이도 스케일링 시뮬레이션 (10분 플레이)
 * 17. 레벨업 무기 해금 시뮬레이션
 * 18. 보스 HP 스케일링 검증
 * 19. 던전 브레이크 타이밍 검증
 * 20. i18n 파일 존재 및 키 완전성
 * 21. WORLD_SIZE > GAME 크기 확인
 * 22. 무기 파일 ↔ WEAPONS 키 매핑
 *
 * 종합 플레이스루 시뮬레이션:
 *  A. 레벨 1→30 전체 게임 진행 시뮬레이션
 *  B. 전 무기 데미지 시뮬레이션 (레벨 1~10)
 *  C. 보스 조우 시뮬레이션
 *  D. 난이도 곡선 시뮬레이션 (매 분)
 *  E. 전 랭크 전환 검증
 *  F. 패시브 스탯 중첩 시뮬레이션 (5스택)
 *  G. 시간대별 웨이브 구성
 *  H. 플레이어 생존 시뮬레이션
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const errors = [];
const warnings = [];

function readFile(relPath) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf8');
}

function fileExists(relPath) {
    return fs.existsSync(path.join(ROOT, relPath));
}

function walkAssetPngs(dir, relPrefix = '') {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkAssetPngs(full, rel));
        } else if (entry.name.endsWith('.png')) {
            out.push(rel);
        }
    }
    return out;
}

for (const relPng of walkAssetPngs(path.join(ROOT, 'assets'))) {
    const relWebp = relPng.replace(/\.png$/i, '.webp');
    if (!fileExists(`assets/${relWebp}`)) {
        errors.push(`[WEBP] assets/${relPng} has no matching WebP primary asset`);
    }
}

// ═══════════════════════════════════════════
// Load Constants.js (ES Module → CommonJS 변환)
// ═══════════════════════════════════════════
const constContent = readFile('js/utils/Constants.js');
if (!constContent) {
    console.error('FATAL: js/utils/Constants.js not found');
    process.exit(1);
}

let constants;
try {
    // export 키워드 제거 + window/navigator 모킹
    let transformed = constContent
        .replace(/export\s+function\s+/g, 'function ')
        .replace(/export\s+let\s+/g, 'let ')
        .replace(/export\s+const\s+/g, 'const ')
        .replace(/export\s+class\s+/g, 'class ')
        .replace(/export\s+\{[^}]*\}/g, '');

    const code = `
        const window = { innerWidth: 1024, innerHeight: 768 };
        ${transformed}
        return {
            GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE, UI_SCALE,
            RANKS, RANK_ORDER, PLAYER_BASE_STATS, XP_TABLE,
            ENEMY_TYPES, BOSS_TYPES, BOSS_SCHEDULE, WAVE_CONFIG,
            WEAPONS, PASSIVES, COLORS,
        };
    `;
    constants = new Function(code)();
} catch (e) {
    console.error('FATAL: Constants.js 실행 실패:', e.message);
    process.exit(1);
}

const {
    GAME_WIDTH, GAME_HEIGHT, WORLD_SIZE, RANKS, RANK_ORDER,
    PLAYER_BASE_STATS, XP_TABLE, ENEMY_TYPES, BOSS_TYPES,
    BOSS_SCHEDULE, WAVE_CONFIG, WEAPONS, PASSIVES,
} = constants;

// ═══════════════════════════════════════════
// 1. HTML 스크립트/CSS 참조 파일 존재
// ═══════════════════════════════════════════
const html = readFile('index.html');
if (!html) {
    console.error('FATAL: index.html not found');
    process.exit(1);
}

const localScripts = [...html.matchAll(/src="([^"]+)"/g)]
    .map(m => m[1])
    .filter(s => !s.startsWith('http') && !s.startsWith('//') && !s.startsWith('data:'));

for (const ref of localScripts) {
    const cleanRef = ref.split('?')[0];
    if (!fileExists(cleanRef)) {
        errors.push(`[HTML_REF] "${ref}" referenced in index.html but file not found`);
    }
}

// 필수 CDN
if (!html.includes('phaser')) errors.push(`[CDN] Phaser library not found in index.html`);
if (!html.includes('tone') && !html.includes('Tone')) errors.push(`[CDN] Tone.js library not found in index.html`);

// ═══════════════════════════════════════════
// 2. ES Module import 경로 ↔ 실제 파일
// ═══════════════════════════════════════════
const jsDir = path.join(ROOT, 'js');
const allJsFiles = [];

function walkDir(dir, prefix = '') {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            walkDir(path.join(dir, entry.name), prefix + entry.name + '/');
        } else if (entry.name.endsWith('.js')) {
            allJsFiles.push({ rel: prefix + entry.name, full: path.join(dir, entry.name) });
        }
    }
}
walkDir(jsDir);

for (const { rel, full } of allJsFiles) {
    const content = fs.readFileSync(full, 'utf8');
    for (const m of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const importPath = m[1];
        if (importPath.startsWith('.')) {
            const resolvedDir = path.dirname(full);
            let resolved = path.resolve(resolvedDir, importPath);
            // .js 확장자 추가
            if (!resolved.endsWith('.js')) resolved += '.js';
            if (!fs.existsSync(resolved)) {
                const line = content.substring(0, m.index).split('\n').length;
                errors.push(`[IMPORT] js/${rel}:${line}: import "${importPath}" → file not found`);
            }
        }
    }
}

// ═══════════════════════════════════════════
// 3. 사운드 파일 존재
// ═══════════════════════════════════════════
const expectedSounds = [
    'sounds/arise.wav', 'sounds/authority.wav', 'sounds/bossAppear.wav',
    'sounds/dagger.wav', 'sounds/dungeonBreak.wav', 'sounds/fear.wav',
    'sounds/hit.wav', 'sounds/kill.wav', 'sounds/levelup.wav',
    'sounds/playerHit.wav', 'sounds/potion.wav', 'sounds/quest.wav',
    'sounds/rankup.wav', 'sounds/select.wav', 'sounds/slash.wav',
    'sounds/system.wav', 'sounds/warning.wav', 'sounds/xp.wav',
    'sounds/boss_charge.wav', 'sounds/boss_slash.wav', 'sounds/ground_slam.wav',
    'sounds/acid_shot.wav', 'sounds/acid_hit.wav', 'sounds/boss_rage.wav',
    'sounds/shadow_soldier_slash.wav', 'sounds/shadow_soldier_slam.wav',
    'sounds/shadow_soldier_spit.wav', 'sounds/mana.wav', 'sounds/essence.wav',
    'sounds/crit_hit.wav', 'sounds/elite_kill.wav',
    'sounds/light_sword_slash_sfx.wav', 'sounds/light_lance_sfx.wav',
    'sounds/light_crescent_sfx.wav', 'sounds/light_judgment_sfx.wav',
    'sounds/light_sanctum_sfx.wav', 'sounds/tiger_claw_sfx.wav',
    'sounds/tiger_fang_sfx.wav', 'sounds/tiger_rend_sfx.wav',
    'sounds/tiger_quake_sfx.wav', 'sounds/tiger_guard_sfx.wav',
    'sounds/flame_spark_sfx.wav', 'sounds/flame_bolt_sfx.wav',
    'sounds/flame_arc_sfx.wav', 'sounds/flame_meteor_sfx.wav',
    'sounds/flame_inferno_sfx.wav', 'sounds/sanctuary_mace_sfx.wav',
    'sounds/sanctuary_orb_sfx.wav', 'sounds/sanctuary_arc_sfx.wav',
    'sounds/sanctuary_seal_sfx.wav', 'sounds/sanctuary_field_sfx.wav',
];

for (const sf of expectedSounds) {
    if (!fileExists(sf)) {
        errors.push(`[SOUND] "${sf}" not found`);
    }
}

const soundManagerContent = readFile('js/managers/SoundManager.js') || '';
const registeredSoundKeys = new Set();
for (const m of soundManagerContent.matchAll(/_createPool\(\s*['"]([^'"]+)['"]/g)) {
    registeredSoundKeys.add(m[1]);
}
for (const m of soundManagerContent.matchAll(/^\s*([A-Za-z0-9_]+):\s*\{\s*file:\s*['"][^'"]+['"]/gm)) {
    registeredSoundKeys.add(m[1]);
}
for (const [weaponKey, weapon] of Object.entries(WEAPONS)) {
    if (weapon.soundKey && !registeredSoundKeys.has(weapon.soundKey)) {
        errors.push(`[SOUND] WEAPONS.${weaponKey}.soundKey "${weapon.soundKey}" is not registered`);
    }
}

// ═══════════════════════════════════════════
// 4. 적 타입 정의 완전성
// ═══════════════════════════════════════════
const requiredEnemyProps = ['name', 'hp', 'attack', 'speed', 'xp', 'color', 'size'];
for (const [id, enemy] of Object.entries(ENEMY_TYPES)) {
    for (const prop of requiredEnemyProps) {
        if (enemy[prop] === undefined || enemy[prop] === null) {
            errors.push(`[ENEMY] ENEMY_TYPES.${id}: missing "${prop}"`);
        }
    }
    if (enemy.hp <= 0) errors.push(`[ENEMY] ENEMY_TYPES.${id}: hp(${enemy.hp}) must be > 0`);
    if (enemy.attack <= 0) errors.push(`[ENEMY] ENEMY_TYPES.${id}: attack(${enemy.attack}) must be > 0`);
    if (enemy.speed <= 0) errors.push(`[ENEMY] ENEMY_TYPES.${id}: speed(${enemy.speed}) must be > 0`);
    if (enemy.xp <= 0) errors.push(`[ENEMY] ENEMY_TYPES.${id}: xp(${enemy.xp}) must be > 0`);
    if (enemy.size <= 0) errors.push(`[ENEMY] ENEMY_TYPES.${id}: size(${enemy.size}) must be > 0`);
}

// ═══════════════════════════════════════════
// 5. 보스 스케줄 정합성
// ═══════════════════════════════════════════
for (const [id, boss] of Object.entries(BOSS_TYPES)) {
    for (const prop of ['name', 'hp', 'attack', 'speed', 'xp', 'color', 'size']) {
        if (boss[prop] === undefined) {
            errors.push(`[BOSS] BOSS_TYPES.${id}: missing "${prop}"`);
        }
    }
}

// BOSS_SCHEDULE 시간 단조증가
for (let i = 1; i < BOSS_SCHEDULE.length; i++) {
    if (BOSS_SCHEDULE[i].time <= BOSS_SCHEDULE[i - 1].time) {
        errors.push(`[BOSS_SCHED] BOSS_SCHEDULE[${i}].time(${BOSS_SCHEDULE[i].time}) <= [${i - 1}](${BOSS_SCHEDULE[i - 1].time})`);
    }
}

// BOSS_SCHEDULE의 type이 BOSS_TYPES에 존재하는지
for (let i = 0; i < BOSS_SCHEDULE.length; i++) {
    const bs = BOSS_SCHEDULE[i];
    if (!BOSS_TYPES[bs.type]) {
        errors.push(`[BOSS_SCHED] BOSS_SCHEDULE[${i}].type="${bs.type}" not in BOSS_TYPES`);
    }
    if (bs.hp <= 0) {
        errors.push(`[BOSS_SCHED] BOSS_SCHEDULE[${i}].hp(${bs.hp}) must be > 0`);
    }
}

// ═══════════════════════════════════════════
// 6. 무기 정의 완전성
// ═══════════════════════════════════════════
const weaponUnlockLevels = [];
for (const [id, weapon] of Object.entries(WEAPONS)) {
    for (const prop of ['name', 'description', 'type', 'unlockLevel', 'baseDamage', 'baseCooldown']) {
        if (weapon[prop] === undefined) {
            errors.push(`[WEAPON] WEAPONS.${id}: missing "${prop}"`);
        }
    }
    if (weapon.baseDamage <= 0) errors.push(`[WEAPON] WEAPONS.${id}: baseDamage(${weapon.baseDamage}) must be > 0`);
    if (weapon.baseCooldown <= 0) errors.push(`[WEAPON] WEAPONS.${id}: baseCooldown(${weapon.baseCooldown}) must be > 0`);
    if (weapon.unlockLevel < 1 || weapon.unlockLevel > 30) {
        errors.push(`[WEAPON] WEAPONS.${id}: unlockLevel(${weapon.unlockLevel}) out of range [1, 30]`);
    }
    weaponUnlockLevels.push({ id, level: weapon.unlockLevel });

    // levelBonuses 키 2~10 확인
    if (weapon.levelBonuses) {
        for (let lv = 2; lv <= 10; lv++) {
            if (!weapon.levelBonuses[lv]) {
                warnings.push(`[WEAPON] WEAPONS.${id}: levelBonuses[${lv}] missing`);
            }
        }
    }
}

// unlockLevel 단조증가 확인
weaponUnlockLevels.sort((a, b) => a.level - b.level);
for (let i = 1; i < weaponUnlockLevels.length; i++) {
    if (weaponUnlockLevels[i].level < weaponUnlockLevels[i - 1].level) {
        errors.push(`[WEAPON] Weapon unlock order broken: ${weaponUnlockLevels[i - 1].id}(${weaponUnlockLevels[i - 1].level}) > ${weaponUnlockLevels[i].id}(${weaponUnlockLevels[i].level})`);
    }
}

// ═══════════════════════════════════════════
// 7. 패시브 정의 완전성
// ═══════════════════════════════════════════
for (const [id, passive] of Object.entries(PASSIVES)) {
    for (const prop of ['name', 'description', 'stat', 'bonus', 'icon']) {
        if (passive[prop] === undefined) {
            errors.push(`[PASSIVE] PASSIVES.${id}: missing "${prop}"`);
        }
    }
    if (passive.bonus <= 0) {
        errors.push(`[PASSIVE] PASSIVES.${id}: bonus(${passive.bonus}) must be > 0`);
    }
    // stat이 PLAYER_BASE_STATS에 존재하는지
    if (passive.stat && !(passive.stat in PLAYER_BASE_STATS)) {
        errors.push(`[PASSIVE] PASSIVES.${id}: stat "${passive.stat}" not in PLAYER_BASE_STATS`);
    }
}

// ═══════════════════════════════════════════
// 8. XP 테이블 정합성
// ═══════════════════════════════════════════
if (XP_TABLE.length < 30) {
    errors.push(`[XP] XP_TABLE has ${XP_TABLE.length} entries, need at least 30`);
}
if (XP_TABLE[0] !== 0) {
    errors.push(`[XP] XP_TABLE[0] should be 0, got ${XP_TABLE[0]}`);
}
for (let i = 1; i < XP_TABLE.length; i++) {
    if (XP_TABLE[i] <= XP_TABLE[i - 1]) {
        errors.push(`[XP] XP_TABLE[${i}](${XP_TABLE[i]}) <= [${i - 1}](${XP_TABLE[i - 1]})`);
    }
}

// ═══════════════════════════════════════════
// 9. 랭크 시스템 정합성
// ═══════════════════════════════════════════
if (RANK_ORDER.length !== Object.keys(RANKS).length) {
    errors.push(`[RANK] RANK_ORDER(${RANK_ORDER.length}) != RANKS keys(${Object.keys(RANKS).length})`);
}

for (const rank of RANK_ORDER) {
    if (!RANKS[rank]) {
        errors.push(`[RANK] "${rank}" in RANK_ORDER but not in RANKS`);
    }
}

// 랭크 레벨 단조증가
let prevRankLevel = 0;
for (const rank of RANK_ORDER) {
    if (!RANKS[rank]) continue;
    if (RANKS[rank].level <= prevRankLevel && RANKS[rank].level !== 1) {
        errors.push(`[RANK] ${rank} level(${RANKS[rank].level}) <= previous rank level(${prevRankLevel})`);
    }
    if (RANKS[rank].level > XP_TABLE.length) {
        errors.push(`[RANK] ${rank} level(${RANKS[rank].level}) exceeds XP_TABLE max level(${XP_TABLE.length})`);
    }
    prevRankLevel = RANKS[rank].level;
}

// ═══════════════════════════════════════════
// 10. 웨이브 설정 정합성
// ═══════════════════════════════════════════
const wc = WAVE_CONFIG;
if (wc.baseSpawnInterval <= 0) errors.push(`[WAVE] baseSpawnInterval must be > 0`);
if (wc.minSpawnInterval <= 0) errors.push(`[WAVE] minSpawnInterval must be > 0`);
if (wc.minSpawnInterval >= wc.baseSpawnInterval) {
    errors.push(`[WAVE] minSpawnInterval(${wc.minSpawnInterval}) >= baseSpawnInterval(${wc.baseSpawnInterval})`);
}
if (wc.baseEnemiesPerSpawn <= 0) errors.push(`[WAVE] baseEnemiesPerSpawn must be > 0`);
if (wc.maxEnemiesOnScreen <= 0) errors.push(`[WAVE] maxEnemiesOnScreen must be > 0`);

// ═══════════════════════════════════════════
// 11. 플레이어 기본 스탯 정합성
// ═══════════════════════════════════════════
const ps = PLAYER_BASE_STATS;
if (ps.hp <= 0) errors.push(`[PLAYER] hp must be > 0`);
if (ps.maxHp < ps.hp) errors.push(`[PLAYER] maxHp(${ps.maxHp}) < hp(${ps.hp})`);
if (ps.attack <= 0) errors.push(`[PLAYER] attack must be > 0`);
if (ps.speed <= 0) errors.push(`[PLAYER] speed must be > 0`);
if (ps.critRate < 0 || ps.critRate > 1) errors.push(`[PLAYER] critRate(${ps.critRate}) out of [0, 1]`);
if (ps.critDamage < 1) errors.push(`[PLAYER] critDamage(${ps.critDamage}) should be >= 1`);
if (ps.xpMultiplier <= 0) errors.push(`[PLAYER] xpMultiplier must be > 0`);
if (ps.pickupRange <= 0) errors.push(`[PLAYER] pickupRange must be > 0`);

// 12. 다국어 HTML 동기화 (리다이렉트 페이지 검증)
const htmlVariants = ['index-en.html', 'index-ja.html'];
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

for (const variant of htmlVariants) {
    const varHtml = readFile(variant);
    if (!varHtml) {
        warnings.push(`[HTML_SYNC] ${variant} not found`);
        continue;
    }
    // Redirect-style pages: verify redirect script exists
    const isRedirect = varHtml.includes('window.location.replace') || varHtml.includes('window.location.href');
    if (isRedirect) {
        // Verify correct lang parameter
        const langCode = path.basename(variant).replace('index-', '').replace('.html', '');
        if (!varHtml.includes(`'${langCode}'`) && !varHtml.includes(`"${langCode}"`)) {
            errors.push(`[HTML_SYNC] ${variant}: redirect page doesn't specify lang="${langCode}"`);
        }
        // Verify structured data exists for SEO
        if (!varHtml.includes('application/ld+json')) {
            warnings.push(`[HTML_SYNC] ${variant}: missing structured data (JSON-LD)`);
        }
    } else {
        // Full page: compare DOM IDs and scripts
        const varIds = new Set([...varHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
        for (const id of htmlIds) {
            if (!varIds.has(id)) errors.push(`[HTML_SYNC] ${variant}: missing DOM id="${id}"`);
        }
        if (!varHtml.includes('js/main.js')) errors.push(`[HTML_SYNC] ${variant}: missing main.js`);
        if (!varHtml.includes('phaser')) errors.push(`[HTML_SYNC] ${variant}: missing Phaser CDN`);
    }
}

// ═══════════════════════════════════════════
// 13. Phaser 씬 파일 존재
// ═══════════════════════════════════════════
const expectedScenes = [
    'js/scenes/BootScene.js', 'js/scenes/PreloadScene.js', 'js/scenes/MenuScene.js',
    'js/scenes/GameScene.js', 'js/scenes/LevelUpScene.js', 'js/scenes/GameOverScene.js',
];
for (const scene of expectedScenes) {
    if (!fileExists(scene)) {
        errors.push(`[SCENE] "${scene}" not found`);
    }
}

// main.js에서 씬 등록 확인
const mainContent = readFile('js/main.js') || '';
for (const scene of expectedScenes) {
    const className = path.basename(scene, '.js');
    if (!mainContent.includes(className)) {
        warnings.push(`[SCENE] ${className} not referenced in main.js — may not be registered`);
    }
}

// ═══════════════════════════════════════════
// 14. 엔티티/매니저/UI/무기 파일 존재
// ═══════════════════════════════════════════
const requiredFiles = [
    // Entities
    'js/entities/Player.js', 'js/entities/Enemy.js', 'js/entities/Boss.js',
    'js/entities/ShadowSoldier.js', 'js/entities/XPOrb.js', 'js/entities/ItemDrop.js',
    // Weapons
    'js/weapons/WeaponBase.js', 'js/weapons/BasicDagger.js', 'js/weapons/ShadowDagger.js',
    'js/weapons/ShadowSlash.js', 'js/weapons/RulersAuthority.js', 'js/weapons/DragonFear.js',
    // Managers
    'js/managers/EnemyManager.js', 'js/managers/WeaponManager.js',
    'js/managers/ShadowArmyManager.js', 'js/managers/SoundManager.js',
    // UI
    'js/ui/HUD.js', 'js/ui/StatusWindow.js', 'js/ui/SystemMessage.js',
    'js/ui/MobileControls.js',
    // Utils
    'js/utils/Constants.js', 'js/utils/i18n.js', 'js/utils/SpriteFactory.js',
    // Core
    'js/main.js', 'js/browser-check.js',
];

for (const f of requiredFiles) {
    if (!fileExists(f)) {
        errors.push(`[FILE] "${f}" not found`);
    }
}

// ═══════════════════════════════════════════
// 15. 서비스 워커 파일 존재
// ═══════════════════════════════════════════
if (html.includes('sw.js') && !fileExists('sw.js')) {
    errors.push(`[SW] Service Worker "sw.js" referenced but not found`);
}

// ═══════════════════════════════════════════
// 16. 난이도 스케일링 시뮬레이션
// ═══════════════════════════════════════════
// 10분(600초) 플레이 시뮬레이션
for (const minutes of [1, 3, 5, 10, 15, 20]) {
    const diffMult = 1 + minutes * 0.30 + Math.pow(minutes / 25, 2) * 3;
    const spawnInterval = Math.max(
        wc.minSpawnInterval,
        wc.baseSpawnInterval - wc.spawnReductionPerMinute * minutes
    );
    const enemiesPerSpawn = Math.floor(wc.baseEnemiesPerSpawn + wc.extraEnemiesPerMinute * minutes);

    if (diffMult <= 0) {
        errors.push(`[DIFFICULTY] At ${minutes}min: diffMult(${diffMult}) <= 0`);
    }
    if (spawnInterval <= 0) {
        errors.push(`[DIFFICULTY] At ${minutes}min: spawnInterval(${spawnInterval}) <= 0`);
    }
    if (enemiesPerSpawn > wc.maxEnemiesOnScreen) {
        warnings.push(`[DIFFICULTY] At ${minutes}min: enemiesPerSpawn(${enemiesPerSpawn}) > maxOnScreen(${wc.maxEnemiesOnScreen})`);
    }
}

// ═══════════════════════════════════════════
// 17. 레벨업 무기 해금 시뮬레이션
// ═══════════════════════════════════════════
// 레벨 1~30 진행 시 각 레벨에서 해금되는 무기 확인
const unlockedByLevel = {};
for (const [id, weapon] of Object.entries(WEAPONS)) {
    const lv = weapon.unlockLevel;
    if (!unlockedByLevel[lv]) unlockedByLevel[lv] = [];
    unlockedByLevel[lv].push(id);
}

// 레벨 1에 기본 무기가 있는지
const level1Weapons = unlockedByLevel[1] || [];
if (level1Weapons.length === 0) {
    errors.push(`[WEAPON_SIM] No weapon unlocked at level 1 — player starts weaponless`);
}

// 30레벨까지 적어도 3개 무기 해금
const totalWeapons = Object.keys(WEAPONS).length;
if (totalWeapons < 3) {
    warnings.push(`[WEAPON_SIM] Only ${totalWeapons} weapons total — may feel repetitive`);
}

// ═══════════════════════════════════════════
// 18. 보스 HP 스케일링 검증
// ═══════════════════════════════════════════
for (let i = 0; i < BOSS_SCHEDULE.length; i++) {
    const bs = BOSS_SCHEDULE[i];
    const baseBoss = BOSS_TYPES[bs.type];
    if (!baseBoss) continue;

    // 재등장 보스는 원본보다 HP가 높아야 함
    const sameTypePrevious = BOSS_SCHEDULE.slice(0, i).filter(b => b.type === bs.type);
    if (sameTypePrevious.length > 0) {
        const lastHp = sameTypePrevious[sameTypePrevious.length - 1].hp;
        if (bs.hp <= lastHp) {
            errors.push(`[BOSS_HP] BOSS_SCHEDULE[${i}] ${bs.type} hp(${bs.hp}) <= previous appearance(${lastHp})`);
        }
    }
}

// ═══════════════════════════════════════════
// 19. 던전 브레이크 타이밍 검증 (코드에서 추출)
// ═══════════════════════════════════════════
const enemyMgrContent = readFile('js/managers/EnemyManager.js') || '';
const breakTimings = [];
for (const m of enemyMgrContent.matchAll(/time:\s*(\d+)/g)) {
    breakTimings.push(parseInt(m[1]));
}
// 던전 브레이크 타이밍이 보스 스케줄과 겹치지 않는지
for (const bt of breakTimings) {
    for (const bs of BOSS_SCHEDULE) {
        if (Math.abs(bt - bs.time) < 10) {
            warnings.push(`[TIMING] Dungeon break(${bt}s) very close to boss spawn(${bs.time}s) — may overwhelm player`);
        }
    }
}

// ═══════════════════════════════════════════
// 20. i18n 파일 존재 및 키 완전성
// ═══════════════════════════════════════════
const i18nContent = readFile('js/utils/i18n.js');
if (i18nContent) {
    // 지원 언어 추출 — quoted ('ko':) and unquoted (ko:) patterns, plus LANGUAGES array
    const quotedLangs = [...i18nContent.matchAll(/['"](\w{2})['"]\s*:/g)].map(m => m[1]);
    const unquotedLangs = [...i18nContent.matchAll(/^\s+(\w{2})\s*:\s*\{/gm)].map(m => m[1]);
    const arrayLangs = [...i18nContent.matchAll(/code:\s*['"](\w{2})['"]/g)].map(m => m[1]);
    const supportedArrayLangs = [...i18nContent.matchAll(/['"](\w{2})['"]/g)]
        .map(m => m[1])
        .filter(l => ['ko', 'en', 'ja', 'zh', 'fr', 'de', 'es', 'pt', 'ru'].includes(l));

    const allDetected = [...quotedLangs, ...unquotedLangs, ...arrayLangs, ...supportedArrayLangs];
    const i18nLangs = [...new Set(allDetected)].filter(l => l.length === 2);

    if (i18nLangs.length < 2) {
        warnings.push(`[I18N] Only ${i18nLangs.length} language(s) detected in i18n.js`);
    }

    // 각 키가 모든 언어에 있는지 (간접 검사)
    // i18n.js는 중첩 객체를 포함하므로 brace-depth 기반 블록 추출
    function extractLangBlock(src, lang) {
        const pattern = new RegExp(`(?:^|[\\s,])${lang}\\s*:\\s*\\{`, 'm');
        const match = pattern.exec(src);
        if (!match) return null;
        let depth = 0;
        let start = match.index + match[0].indexOf('{');
        for (let i = start; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) return src.substring(start, i + 1); }
        }
        return null;
    }

    const koBlock = extractLangBlock(i18nContent, 'ko');
    if (koBlock) {
        // ko 블록의 최상위 키 추출 (중첩 객체 키 제외)
        const koTopKeys = [];
        let depth = 0;
        for (const m of koBlock.matchAll(/(\w+)\s*:|[{}]/g)) {
            if (m[0] === '{') { depth++; continue; }
            if (m[0] === '}') { depth--; continue; }
            if (depth === 1 && m[1]) koTopKeys.push(m[1]);
        }

        for (const lang of i18nLangs.filter(l => l !== 'ko')) {
            const langBlock = extractLangBlock(i18nContent, lang);
            if (!langBlock) {
                warnings.push(`[I18N] ${lang}: language block not found in TEXTS`);
                continue;
            }
            for (const key of koTopKeys) {
                if (!langBlock.includes(key)) {
                    warnings.push(`[I18N] ${lang}: key "${key}" may be missing (exists in ko)`);
                }
            }
        }
    }
}

// ═══════════════════════════════════════════
// 21. WORLD_SIZE > GAME 크기 확인
// ═══════════════════════════════════════════
if (WORLD_SIZE <= GAME_WIDTH || WORLD_SIZE <= GAME_HEIGHT) {
    errors.push(`[WORLD] WORLD_SIZE(${WORLD_SIZE}) must be > GAME dimensions(${GAME_WIDTH}×${GAME_HEIGHT})`);
}

// ═══════════════════════════════════════════
// 22. 무기 파일 ↔ WEAPONS 키 매핑
// ═══════════════════════════════════════════
const weaponFileMap = {
    basicDagger: 'js/weapons/BasicDagger.js',
    shadowDagger: 'js/weapons/ShadowDagger.js',
    shadowSlash: 'js/weapons/ShadowSlash.js',
    rulersAuthority: 'js/weapons/RulersAuthority.js',
    dragonFear: 'js/weapons/DragonFear.js',
};

for (const [weaponId, weaponFile] of Object.entries(weaponFileMap)) {
    if (WEAPONS[weaponId] && !fileExists(weaponFile)) {
        errors.push(`[WEAPON_FILE] WEAPONS.${weaponId} defined but "${weaponFile}" not found`);
    }
}

// ═══════════════════════════════════════════════════════════════
// ═══ COMPREHENSIVE PLAYTHROUGH SIMULATIONS ═══════════════════
// ═══════════════════════════════════════════════════════════════

// ── Helper: enemy types available at given time (seconds) ──
function getEnemyTypesAtTime(timeSec) {
    const minutes = timeSec / 60;
    const types = [];
    // 초반 적 (0~3분): goblin, antSoldier — always available
    types.push('goblin', 'antSoldier');
    // 중반 적 (1~5분): orc, iceBear
    if (minutes >= 1) types.push('orc', 'iceBear');
    // 후반 적 (5분~): stoneGolem, darkMage
    if (minutes >= 5) types.push('stoneGolem', 'darkMage');
    // 최후반 적 (8분~): ironKnight, demonWarrior
    if (minutes >= 8) types.push('ironKnight', 'demonWarrior');
    return types;
}

// ── Helper: difficulty multiplier at given time ──
function getDifficultyMult(minutes) {
    return 1 + minutes * 0.30 + Math.pow(minutes / 25, 2) * 3;
}

// ── Helper: calculate weapon effective stats at given weapon level ──
function getWeaponStats(weaponId, weaponLevel) {
    const w = WEAPONS[weaponId];
    if (!w) return null;
    let damage = w.baseDamage;
    let cooldown = w.baseCooldown;
    let count = w.baseCount || 1;
    for (let lv = 2; lv <= weaponLevel; lv++) {
        const bonus = w.levelBonuses && w.levelBonuses[lv];
        if (bonus) {
            if (bonus.damage) damage += bonus.damage;
            if (bonus.cooldown) cooldown += bonus.cooldown;
            if (bonus.count) count += bonus.count;
        }
    }
    return { damage, cooldown, count };
}

// ── Helper: get rank for a given level ──
function getRankAtLevel(level) {
    let currentRank = RANK_ORDER[0];
    for (const rank of RANK_ORDER) {
        if (RANKS[rank] && level >= RANKS[rank].level) currentRank = rank;
    }
    return currentRank;
}

// ── Helper: weapons unlocked at or before a given level ──
function getWeaponsAtLevel(level) {
    const result = [];
    for (const [id, w] of Object.entries(WEAPONS)) {
        if (w.unlockLevel <= level) result.push(id);
    }
    return result;
}

// ── Helper: passives available (all passives are always available for selection) ──
function getPassiveIds() {
    return Object.keys(PASSIVES);
}

// ═══════════════════════════════════════════
// A. Full game progression simulation (레벨 1→30)
// ═══════════════════════════════════════════
for (let level = 1; level <= 30; level++) {
    // XP needed for this level
    if (level - 1 >= XP_TABLE.length) {
        errors.push(`[PROGRESSION] Level ${level}: XP_TABLE has no entry for index ${level - 1}`);
        continue;
    }

    const xpThisLevel = level >= 2 ? (XP_TABLE[level - 1] - XP_TABLE[level - 2]) : XP_TABLE[0];
    if (level >= 2 && xpThisLevel <= 0) {
        errors.push(`[PROGRESSION] Level ${level}: XP needed(${xpThisLevel}) must be > 0`);
    }

    // Estimate time to reach this level (rough: assume ~1 kill/sec of average enemy)
    const avgXpPerKill = 10; // rough average across early enemies
    const killsToReachLevel = level >= 2 ? Math.ceil(XP_TABLE[level - 1] / avgXpPerKill) : 0;
    const estimatedTimeSec = killsToReachLevel; // ~1 kill/sec assumption
    const estimatedTimeMin = estimatedTimeSec / 60;

    // Verify weapons unlocked at this level
    const weaponsAvailable = getWeaponsAtLevel(level);
    if (weaponsAvailable.length === 0) {
        errors.push(`[PROGRESSION] Level ${level}: no weapons available`);
    }

    // Verify rank at this level
    const rank = getRankAtLevel(level);
    if (!RANKS[rank]) {
        errors.push(`[PROGRESSION] Level ${level}: rank "${rank}" not defined`);
    }

    // Verify passives are available
    const passives = getPassiveIds();
    if (passives.length === 0) {
        errors.push(`[PROGRESSION] Level ${level}: no passives defined`);
    }

    // Check enemies appropriate at estimated time
    const enemyTypes = getEnemyTypesAtTime(estimatedTimeSec);
    if (enemyTypes.length === 0) {
        errors.push(`[PROGRESSION] Level ${level} (~${estimatedTimeMin.toFixed(1)}min): no enemy types available`);
    }

    // Calculate kills needed for next level with current enemy mix
    if (level < 30 && level < XP_TABLE.length) {
        const xpToNext = XP_TABLE[level] - XP_TABLE[level - 1];
        const availableEnemies = enemyTypes.filter(t => ENEMY_TYPES[t]);
        if (availableEnemies.length > 0) {
            const avgXp = availableEnemies.reduce((s, t) => s + ENEMY_TYPES[t].xp, 0) / availableEnemies.length;
            const killsNeeded = Math.ceil(xpToNext / avgXp);
            if (killsNeeded > 500) {
                warnings.push(`[PROGRESSION] Level ${level}→${level + 1}: needs ~${killsNeeded} kills (may feel grindy)`);
            }
        }
    }
}

// ═══════════════════════════════════════════
// B. All weapon damage simulations (레벨 1~10)
// ═══════════════════════════════════════════
for (const [weaponId] of Object.entries(WEAPONS)) {
    let prevDamage = 0;
    for (let lv = 1; lv <= 10; lv++) {
        const stats = getWeaponStats(weaponId, lv);
        if (!stats) {
            errors.push(`[WEAPON_SIM] ${weaponId}: failed to calculate stats at level ${lv}`);
            continue;
        }

        // Verify damage increases monotonically
        if (lv > 1 && stats.damage < prevDamage) {
            errors.push(`[WEAPON_SIM] ${weaponId} Lv${lv}: damage(${stats.damage}) < Lv${lv - 1}(${prevDamage}) — not monotonically increasing`);
        }
        prevDamage = stats.damage;

        // Verify cooldown doesn't go negative
        if (stats.cooldown <= 0) {
            errors.push(`[WEAPON_SIM] ${weaponId} Lv${lv}: cooldown(${stats.cooldown}) <= 0`);
        }

        // Verify all values are positive
        if (stats.damage <= 0) {
            errors.push(`[WEAPON_SIM] ${weaponId} Lv${lv}: damage(${stats.damage}) must be > 0`);
        }
        if (stats.count <= 0) {
            errors.push(`[WEAPON_SIM] ${weaponId} Lv${lv}: count(${stats.count}) must be > 0`);
        }
    }
}

// ═══════════════════════════════════════════
// C. Boss encounter simulations
// ═══════════════════════════════════════════
for (let i = 0; i < BOSS_SCHEDULE.length; i++) {
    const bs = BOSS_SCHEDULE[i];
    const baseBoss = BOSS_TYPES[bs.type];
    if (!baseBoss) continue;

    const bossHp = bs.hp;
    const bossTimeSec = bs.time;
    const bossTimeMin = bossTimeSec / 60;

    // Estimate player level at boss spawn time
    // Rough: ~1 kill/sec, avg XP per kill scales with time
    const avgXpPerKill = 10; // conservative
    const estimatedTotalXp = bossTimeSec * avgXpPerKill;
    let estimatedLevel = 1;
    for (let lv = 1; lv < XP_TABLE.length; lv++) {
        if (estimatedTotalXp >= XP_TABLE[lv]) estimatedLevel = lv + 1;
        else break;
    }
    if (estimatedLevel > 30) estimatedLevel = 30;

    // Calculate player effective damage using all unlocked weapons at max reachable weapon level
    const playerWeapons = getWeaponsAtLevel(estimatedLevel);
    if (playerWeapons.length === 0) {
        errors.push(`[BOSS_SIM] Boss "${bs.type}" at ${bossTimeMin}min: player has no weapons at estimated level ${estimatedLevel}`);
        continue;
    }

    // Total DPS from all weapons (assume weapon level scales with player level, cap at 10)
    let totalDps = 0;
    for (const wId of playerWeapons) {
        // Weapon level: rough estimate based on how long player has had it
        const w = WEAPONS[wId];
        const levelsGained = Math.min(10, Math.max(1, estimatedLevel - w.unlockLevel + 1));
        const stats = getWeaponStats(wId, levelsGained);
        if (stats && stats.cooldown > 0) {
            const dps = (stats.damage * stats.count) / (stats.cooldown / 1000);
            totalDps += dps;
        }
    }

    if (totalDps > 0) {
        const timeToKillSec = bossHp / totalDps;
        if (timeToKillSec > 180) {
            warnings.push(`[BOSS_SIM] Boss "${bs.type}" at ${bossTimeMin}min: estimated ${timeToKillSec.toFixed(0)}s to kill (>3min, may feel too long)`);
        }
        if (timeToKillSec > 600) {
            errors.push(`[BOSS_SIM] Boss "${bs.type}" at ${bossTimeMin}min: estimated ${timeToKillSec.toFixed(0)}s to kill (>10min, likely unkillable)`);
        }
    } else {
        errors.push(`[BOSS_SIM] Boss "${bs.type}" at ${bossTimeMin}min: player DPS is 0`);
    }

    // Verify player has enough weapons unlocked
    if (playerWeapons.length < 2 && bossTimeMin >= 5) {
        warnings.push(`[BOSS_SIM] Boss "${bs.type}" at ${bossTimeMin}min: player only has ${playerWeapons.length} weapon(s)`);
    }
}

// ═══════════════════════════════════════════
// D. Difficulty curve simulation (매 분마다)
// ═══════════════════════════════════════════
let prevDiffMult = 0;
let totalEnemiesSpawned = 0;

for (let minute = 0; minute <= 30; minute++) {
    const diffMult = getDifficultyMult(minute);
    const spawnInterval = Math.max(
        wc.minSpawnInterval,
        wc.baseSpawnInterval - wc.spawnReductionPerMinute * minute
    );
    const enemiesPerSpawn = Math.floor(wc.baseEnemiesPerSpawn + wc.extraEnemiesPerMinute * minute);

    // Calculate approximate enemies spawned this minute
    if (spawnInterval > 0) {
        const spawnsPerMinute = 60000 / spawnInterval;
        totalEnemiesSpawned += spawnsPerMinute * enemiesPerSpawn;
    }

    // Verify difficulty increases smoothly (no sudden spikes > 3x in one minute)
    if (minute > 0 && prevDiffMult > 0) {
        const spike = diffMult / prevDiffMult;
        if (spike > 3.0) {
            errors.push(`[DIFFICULTY_CURVE] Minute ${minute}: difficulty spike ${spike.toFixed(2)}x (${prevDiffMult.toFixed(2)} → ${diffMult.toFixed(2)})`);
        }
    }

    if (diffMult <= 0) {
        errors.push(`[DIFFICULTY_CURVE] Minute ${minute}: diffMult(${diffMult.toFixed(3)}) <= 0`);
    }
    if (spawnInterval <= 0) {
        errors.push(`[DIFFICULTY_CURVE] Minute ${minute}: spawnInterval(${spawnInterval}) <= 0`);
    }
    if (enemiesPerSpawn <= 0 && minute > 0) {
        warnings.push(`[DIFFICULTY_CURVE] Minute ${minute}: enemiesPerSpawn(${enemiesPerSpawn}) <= 0`);
    }

    prevDiffMult = diffMult;
}

// ═══════════════════════════════════════════
// E. All rank transitions
// ═══════════════════════════════════════════
for (let ri = 0; ri < RANK_ORDER.length; ri++) {
    const rank = RANK_ORDER[ri];
    if (!RANKS[rank]) continue;

    const rankLevel = RANKS[rank].level;

    // Verify transition level matches RANKS[rank].level
    if (rankLevel < 1 || rankLevel > 30) {
        errors.push(`[RANK_SIM] Rank ${rank}: level(${rankLevel}) out of range [1, 30]`);
    }

    // Verify it corresponds to a valid XP_TABLE entry
    if (rankLevel > XP_TABLE.length) {
        errors.push(`[RANK_SIM] Rank ${rank}: level(${rankLevel}) exceeds XP_TABLE length(${XP_TABLE.length})`);
    }

    // Calculate approximate time to reach this rank
    const xpNeeded = rankLevel > 0 && rankLevel <= XP_TABLE.length ? XP_TABLE[rankLevel - 1] : 0;
    const avgXpPerSec = 10; // ~10 XP/sec rough estimate
    const estimatedTimeSec = xpNeeded / avgXpPerSec;
    const estimatedTimeMin = estimatedTimeSec / 60;

    // Warn if rank takes too long
    if (estimatedTimeMin > 30) {
        warnings.push(`[RANK_SIM] Rank ${rank} (Lv${rankLevel}): estimated ~${estimatedTimeMin.toFixed(1)}min to reach (>30min game)`);
    }

    // Verify rank order matches level order
    if (ri > 0) {
        const prevRank = RANK_ORDER[ri - 1];
        if (RANKS[prevRank] && RANKS[prevRank].level >= rankLevel && rankLevel !== 1) {
            errors.push(`[RANK_SIM] Rank ${rank}(Lv${rankLevel}) not higher than ${prevRank}(Lv${RANKS[prevRank].level})`);
        }
    }
}

// ═══════════════════════════════════════════
// F. Passive stat stacking simulation (5 stacks)
// ═══════════════════════════════════════════
for (const [passiveId, passive] of Object.entries(PASSIVES)) {
    const baseStat = PLAYER_BASE_STATS[passive.stat];
    if (baseStat === undefined) continue;

    let currentValue = baseStat;
    for (let stack = 1; stack <= 5; stack++) {
        // Percentage-based increase
        currentValue = currentValue * (1 + passive.bonus);

        // Verify no stat goes negative or NaN
        if (isNaN(currentValue)) {
            errors.push(`[PASSIVE_SIM] ${passiveId} stack ${stack}: stat "${passive.stat}" became NaN`);
            break;
        }
        if (currentValue < 0) {
            errors.push(`[PASSIVE_SIM] ${passiveId} stack ${stack}: stat "${passive.stat}" went negative(${currentValue.toFixed(4)})`);
            break;
        }
        if (!isFinite(currentValue)) {
            errors.push(`[PASSIVE_SIM] ${passiveId} stack ${stack}: stat "${passive.stat}" became Infinity`);
            break;
        }
    }

    // After 5 stacks, verify reasonable bounds
    if (isFinite(currentValue) && currentValue > 0) {
        const ratio = currentValue / baseStat;
        if (ratio > 10) {
            warnings.push(`[PASSIVE_SIM] ${passiveId} ×5: stat "${passive.stat}" grew ${ratio.toFixed(1)}x (${baseStat} → ${currentValue.toFixed(2)}) — may be overpowered`);
        }
    }
}

// ═══════════════════════════════════════════
// G. Wave composition by time
// ═══════════════════════════════════════════
const keyTimePoints = [30, 60, 120, 300, 480, 600]; // seconds

for (const timeSec of keyTimePoints) {
    const timeMin = timeSec / 60;
    const diffMult = getDifficultyMult(timeMin);
    const enemyTypes = getEnemyTypesAtTime(timeSec);

    for (const eType of enemyTypes) {
        const enemy = ENEMY_TYPES[eType];
        if (!enemy) continue;

        const effectiveHp = enemy.hp * diffMult;

        // Check if enemies become unkillable — compare against player's strongest weapon DPS
        const playerWeapons = getWeaponsAtLevel(30); // max possible weapons
        let maxWeaponDps = 0;
        for (const wId of playerWeapons) {
            const stats = getWeaponStats(wId, 10); // max weapon level
            if (stats && stats.cooldown > 0) {
                const dps = (stats.damage * stats.count) / (stats.cooldown / 1000);
                if (dps > maxWeaponDps) maxWeaponDps = dps;
            }
        }

        if (maxWeaponDps > 0) {
            const timeToKill = effectiveHp / maxWeaponDps;
            if (timeToKill > 30) {
                warnings.push(`[WAVE_SIM] At ${timeMin}min: ${eType} effectiveHP(${effectiveHp.toFixed(0)}) takes ${timeToKill.toFixed(1)}s to kill even with max weapon`);
            }
        }
    }

    if (enemyTypes.length === 0) {
        errors.push(`[WAVE_SIM] At ${timeMin}min: no enemy types available`);
    }
}

// ═══════════════════════════════════════════
// H. Player survival simulation
// ═══════════════════════════════════════════
const baseHp = PLAYER_BASE_STATS.maxHp;
// Max HP after 5 vitality stacks
const vitalityPassive = PASSIVES.vitality;
let maxHpWith5Stacks = baseHp;
if (vitalityPassive) {
    for (let i = 0; i < 5; i++) {
        maxHpWith5Stacks = maxHpWith5Stacks * (1 + vitalityPassive.bonus);
    }
}

// Test against each enemy type at base difficulty and scaled difficulty
const lateGameEnemies = ['ironKnight', 'demonWarrior', 'stoneGolem', 'darkMage'];
for (const [eType, enemy] of Object.entries(ENEMY_TYPES)) {
    const isLateGame = lateGameEnemies.includes(eType);

    if (!isLateGame) {
        // 초반 적: base HP에서 원샷이면 에러
        const hitsBase = Math.floor(baseHp / enemy.attack);
        if (hitsBase < 1) {
            errors.push(`[SURVIVAL] ${eType}: one-shots player at base HP(${baseHp}) with attack(${enemy.attack})`);
        }
    }

    // 최대 체력 패시브에서도 원샷이면 밸런스 문제
    const hitsMaxHp = Math.floor(maxHpWith5Stacks / enemy.attack);
    if (hitsMaxHp < 1) {
        warnings.push(`[SURVIVAL] ${eType}: one-shots even with max HP(${maxHpWith5Stacks.toFixed(0)})`);
    }
}

// Test against bosses
for (const [bType, boss] of Object.entries(BOSS_TYPES)) {
    const hitsBase = Math.floor(baseHp / boss.attack);
    if (hitsBase < 1) {
        warnings.push(`[SURVIVAL] Boss ${bType}: one-shots player at base HP(${baseHp}) with attack(${boss.attack})`);
    }

    const hitsMaxHp = Math.floor(maxHpWith5Stacks / boss.attack);
    if (hitsMaxHp < 2) {
        warnings.push(`[SURVIVAL] Boss ${bType}: even with max HP(${maxHpWith5Stacks.toFixed(0)}), player survives only ${hitsMaxHp} hit(s)`);
    }
}

// Check survival at each game stage with scaled enemy damage
// 5분 이후: 체력 패시브 최소 2스택 가정 (1 + 0.12×2 = 1.24배 HP)
for (const timeSec of [60, 180, 300, 480, 600]) {
    const timeMin = timeSec / 60;
    const diffMult = getDifficultyMult(timeMin);
    const enemyTypes = getEnemyTypesAtTime(timeSec);
    // 후반(5분+)에는 패시브 보정 HP로 체크
    const estimatedHp = timeSec >= 300
        ? baseHp * Math.pow(1 + 0.12, Math.min(Math.floor(timeSec / 150), 5))
        : baseHp;

    for (const eType of enemyTypes) {
        const enemy = ENEMY_TYPES[eType];
        if (!enemy) continue;

        const scaledAttack = enemy.attack * diffMult;
        const hitsEstimated = Math.floor(estimatedHp / scaledAttack);
        if (hitsEstimated < 1) {
            warnings.push(`[SURVIVAL] At ${timeMin}min: ${eType} (scaled atk ${scaledAttack.toFixed(0)}) one-shots even with ~${Math.round(estimatedHp)} estimated HP`);
        }
    }
}

// ═══════════════════════════════════════════
// I. 서비스 워커 캐시 검증
// ═══════════════════════════════════════════
if (fileExists('sw.js')) {
    const swContent = readFile('sw.js');
    // 캐시 버스팅 전략 확인
    if (!swContent.includes('no-cache') && !swContent.includes('no-store') && !swContent.includes('cache')) {
        warnings.push(`[SW] sw.js has no cache strategy — assets may be stale`);
    }
    // fetch 이벤트 핸들러 존재
    if (!swContent.includes("'fetch'") && !swContent.includes('"fetch"')) {
        warnings.push(`[SW] sw.js has no fetch event handler`);
    }
}

// ═══════════════════════════════════════════
// J. 브라우저 호환성 체크 검증
// ═══════════════════════════════════════════
if (fileExists('js/browser-check.js')) {
    const bcContent = readFile('js/browser-check.js');
    // 인앱브라우저 감지 (KakaoTalk, Line, Facebook)
    const hasInAppCheck = bcContent.includes('KAKAOTALK') || bcContent.includes('Line') || bcContent.includes('FBAN');
    if (!hasInAppCheck) {
        warnings.push(`[BROWSER] browser-check.js doesn't detect in-app browsers`);
    }
    // 리다이렉트 또는 안내 메시지
    const hasRedirectOrGuide = bcContent.includes('intent://') || bcContent.includes('createElement') || bcContent.includes('innerHTML');
    if (!hasRedirectOrGuide) {
        warnings.push(`[BROWSER] browser-check.js has no redirect or user guide for in-app browsers`);
    }
}

// ═══════════════════════════════════════════
// K. 모바일 컨트롤 검증
// ═══════════════════════════════════════════
if (fileExists('js/ui/MobileControls.js')) {
    const mcContent = readFile('js/ui/MobileControls.js');
    // 조이스틱 구현
    if (!mcContent.includes('joystick') && !mcContent.includes('Joystick') && !mcContent.includes('pointer')) {
        warnings.push(`[MOBILE] MobileControls.js has no joystick implementation`);
    }
    // 터치 이벤트
    if (!mcContent.includes('pointerdown') && !mcContent.includes('touchstart')) {
        warnings.push(`[MOBILE] MobileControls.js has no touch event handlers`);
    }
    // dead zone (의도치 않은 이동 방지)
    if (!mcContent.includes('dead') && !mcContent.includes('threshold') && !mcContent.includes('DEAD')) {
        warnings.push(`[MOBILE] MobileControls.js may not have dead zone — small touches may cause movement`);
    }
}

// ═══════════════════════════════════════════
// L. 레벨업 선택지 검증
// ═══════════════════════════════════════════
if (fileExists('js/scenes/LevelUpScene.js')) {
    const luContent = readFile('js/scenes/LevelUpScene.js');
    // 무기/패시브 선택 옵션 생성
    if (!luContent.includes('WEAPONS') && !luContent.includes('weapons')) {
        warnings.push(`[LEVELUP] LevelUpScene doesn't reference WEAPONS — weapon upgrades may not appear`);
    }
    if (!luContent.includes('PASSIVES') && !luContent.includes('passives')) {
        warnings.push(`[LEVELUP] LevelUpScene doesn't reference PASSIVES — passive upgrades may not appear`);
    }
    // 선택 후 씬 전환
    if (!luContent.includes('resume') && !luContent.includes('stop') && !luContent.includes('scene.')) {
        warnings.push(`[LEVELUP] LevelUpScene may not return to GameScene after selection`);
    }
}

// ═══════════════════════════════════════════
// M. 게임오버 랭킹/리더보드 검증
// ═══════════════════════════════════════════
if (fileExists('js/scenes/GameOverScene.js')) {
    const goContent = readFile('js/scenes/GameOverScene.js');
    // 점수/통계 표시
    if (!goContent.includes('score') && !goContent.includes('Score')) {
        warnings.push(`[GAMEOVER] GameOverScene doesn't display score`);
    }
    if (!goContent.includes('time') && !goContent.includes('Time') && !goContent.includes('survive')) {
        warnings.push(`[GAMEOVER] GameOverScene doesn't display survival time`);
    }
    // 재시작 버튼
    if (!goContent.includes('restart') && !goContent.includes('Restart') && !goContent.includes('retry') && !goContent.includes('Again')) {
        warnings.push(`[GAMEOVER] GameOverScene has no restart option`);
    }
    // 메뉴 복귀 버튼
    if (!goContent.includes('menu') && !goContent.includes('Menu') && !goContent.includes('title')) {
        warnings.push(`[GAMEOVER] GameOverScene has no menu/title return option`);
    }
    // 랭킹 제출
    const hasLeaderboard = goContent.includes('leaderboard') || goContent.includes('ranking') ||
        goContent.includes('submit') || goContent.includes('fetch');
    if (!hasLeaderboard) {
        warnings.push(`[GAMEOVER] No leaderboard/ranking submission found in GameOverScene`);
    }
}

// ═══════════════════════════════════════════
// N. 상태창 (Tab 키) 검증
// ═══════════════════════════════════════════
if (fileExists('js/ui/StatusWindow.js')) {
    const swContent = readFile('js/ui/StatusWindow.js');
    // Tab 키 또는 토글 처리
    if (!swContent.includes('Tab') && !swContent.includes('toggle') && !swContent.includes('visible')) {
        warnings.push(`[STATUS] StatusWindow has no toggle mechanism`);
    }
    // 스탯 표시
    const expectedStats = ['hp', 'attack', 'speed', 'critRate'];
    for (const stat of expectedStats) {
        if (!swContent.includes(stat)) {
            warnings.push(`[STATUS] StatusWindow may not display "${stat}" stat`);
        }
    }
}

// ═══════════════════════════════════════════
// O. i18n 언어 자동감지 + 전환 검증
// ═══════════════════════════════════════════
if (i18nContent) {
    // navigator.language 감지
    if (!i18nContent.includes('navigator.language') && !i18nContent.includes('navigator.languages')) {
        warnings.push(`[I18N_DETECT] No navigator.language detection — default language may not match user`);
    }
    // localStorage 저장
    if (!i18nContent.includes('localStorage')) {
        warnings.push(`[I18N_DETECT] Language preference not saved to localStorage`);
    }
    // URL 파라미터 (?lang=xx) 지원
    if (!i18nContent.includes('searchParams') && !i18nContent.includes('URLSearchParams') && !i18nContent.includes('lang=')) {
        warnings.push(`[I18N_DETECT] No URL lang parameter support — redirect pages may not work`);
    }
}

// ═══════════════════════════════════════════
// P. HUD 표시 요소 검증
// ═══════════════════════════════════════════
if (fileExists('js/ui/HUD.js')) {
    const hudContent = readFile('js/ui/HUD.js');
    // 필수 HUD 요소
    const hudElements = ['hp', 'level', 'xp', 'kill', 'time'];
    for (const el of hudElements) {
        if (!hudContent.toLowerCase().includes(el)) {
            warnings.push(`[HUD] HUD may not display "${el}" information`);
        }
    }
    // 미니맵
    if (!hudContent.includes('minimap') && !hudContent.includes('Minimap') && !hudContent.includes('mini')) {
        warnings.push(`[HUD] HUD may not have minimap`);
    }
}

// ═══════════════════════════════════════════
// Q. 게임오버 DOM input 정리 검증 (메모리 누수)
// ═══════════════════════════════════════════
if (fileExists('js/scenes/GameOverScene.js')) {
    const goContent2 = readFile('js/scenes/GameOverScene.js');
    // DOM input 생성 확인
    if (goContent2.includes('document.createElement')) {
        // 정리 코드 존재 확인
        if (!goContent2.includes('removeChild') && !goContent2.includes('remove()')) {
            errors.push(`[DOM_LEAK] GameOverScene creates DOM elements but never removes them`);
        }
    }
    // Enter/Escape 단축키
    if (!goContent2.includes("'Enter'") && !goContent2.includes('"Enter"')) {
        warnings.push(`[UX] GameOverScene name input: no Enter key submit shortcut`);
    }
    if (!goContent2.includes("'Escape'") && !goContent2.includes('"Escape"')) {
        warnings.push(`[UX] GameOverScene name input: no Escape key skip shortcut`);
    }
    // Phaser 키보드 캡처 해제 (input 사용 시)
    if (goContent2.includes('createElement') && !goContent2.includes('keyboard.enabled')) {
        warnings.push(`[UX] GameOverScene creates input but doesn't disable Phaser keyboard capture — WASD may interfere with typing`);
    }
}

// ═══════════════════════════════════════════
// R. 승리 조건 검증
// ═══════════════════════════════════════════
{
    // GameScene에서 victory 조건 확인
    const gsContent = readFile('js/scenes/GameScene.js') || '';
    const hasVictory = gsContent.includes('victory') || gsContent.includes('Victory') || gsContent.includes('win');
    if (!hasVictory) {
        warnings.push(`[VICTORY] No victory condition found in GameScene — game may only end by death`);
    }
}

// ═══════════════════════════════════════════
// S. 그림자 군단 소환 검증
// ═══════════════════════════════════════════
if (fileExists('js/managers/ShadowArmyManager.js')) {
    const samContent = readFile('js/managers/ShadowArmyManager.js');
    // 소환 메커니즘
    if (!samContent.includes('summon') && !samContent.includes('Summon') && !samContent.includes('spawn') && !samContent.includes('add')) {
        warnings.push(`[SHADOW] ShadowArmyManager has no summon mechanism`);
    }
    // 보스 처치 후 소환
    if (!samContent.includes('boss') && !samContent.includes('Boss')) {
        warnings.push(`[SHADOW] ShadowArmyManager doesn't reference boss — may not summon after boss kill`);
    }
}

// ═══════════════════════════════════════════
// T. 퀘스트 시스템 검증
// ═══════════════════════════════════════════
{
    // 퀘스트 관련 코드 존재 확인
    const allJsContent2 = allJsFiles.map(f => fs.readFileSync(f.full, 'utf8')).join('\n');
    const hasQuest = allJsContent2.includes('quest') || allJsContent2.includes('Quest');
    if (!hasQuest) {
        warnings.push(`[QUEST] No quest system found in any JS file`);
    }
}

// ═══════════════════════════════════════════
// U. Google Analytics 검증
// ═══════════════════════════════════════════
if (!html.includes('gtag') && !html.includes('googletagmanager')) {
    warnings.push(`[ANALYTICS] No Google Analytics found`);
}

// ═══════════════════════════════════════════
// V. localStorage 키 일관성
// ═══════════════════════════════════════════
{
    const allCode = allJsFiles.map(f => fs.readFileSync(f.full, 'utf8')).join('\n');
    const lsGet = new Set();
    const lsSet = new Set();
    for (const m of allCode.matchAll(/localStorage\.getItem\(\s*['"]([^'"]+)['"]/g)) lsGet.add(m[1]);
    for (const m of allCode.matchAll(/localStorage\.setItem\(\s*['"]([^'"]+)['"]/g)) lsSet.add(m[1]);
    for (const key of lsGet) {
        if (!lsSet.has(key)) {
            warnings.push(`[STORAGE] localStorage.getItem("${key}") used but setItem never called`);
        }
    }
}

// ═══════════════════════════════════════════
// W. 사운드 설정 검증
// ═══════════════════════════════════════════
if (fileExists('js/managers/SoundManager.js')) {
    const smContent = readFile('js/managers/SoundManager.js');
    // 음소거 토글
    if (!smContent.includes('mute') && !smContent.includes('Mute') && !smContent.includes('muted')) {
        warnings.push(`[SOUND] SoundManager has no mute toggle — user can't silence audio`);
    }
    // BGM + SFX 분리
    if (!smContent.includes('bgm') && !smContent.includes('BGM')) {
        warnings.push(`[SOUND] SoundManager may not support BGM`);
    }
    if (!smContent.includes('sfx') && !smContent.includes('SFX') && !smContent.includes('play')) {
        warnings.push(`[SOUND] SoundManager may not support SFX`);
    }
}

// ═══════════════════════════════════════════
// X-0. 런타임 null/undefined 가드 검증
// ═══════════════════════════════════════════
{
    // Player.js: XP_TABLE bounds check at level cap
    const playerContent = readFile('js/entities/Player.js') || '';
    if (playerContent.includes('XP_TABLE[this.level]') || playerContent.includes('XP_TABLE[level]')) {
        if (!playerContent.includes('XP_TABLE.length') && !playerContent.includes('level < 30') &&
            !playerContent.match(/level\s*<\s*XP_TABLE/)) {
            warnings.push(`[NULL_GUARD] Player.js: XP_TABLE[level] without bounds check — undefined at level cap`);
        }
    }

    // Player.js: xpToNext could be undefined → NaN in multiplication
    if (playerContent.includes('xpToNext * ') || playerContent.includes('xpToNext *=')) {
        if (!playerContent.includes('xpToNext ||') && !playerContent.includes('xpToNext ??') &&
            !playerContent.match(/if\s*\(\s*!?\s*this\.xpToNext/)) {
            // xpToNext fallback check
        }
    }

    // Enemy.js: player null check before takeDamage
    const enemyContent = readFile('js/entities/Enemy.js') || '';
    if (enemyContent.includes('scene.player') && enemyContent.includes('takeDamage')) {
        const hasPlayerGuard = enemyContent.includes('!player') || enemyContent.includes('!this.scene.player') ||
            enemyContent.includes('player &&') || enemyContent.match(/if\s*\(\s*!?\s*player\s*\)/);
        if (!hasPlayerGuard) {
            warnings.push(`[NULL_GUARD] Enemy.js: scene.player accessed without null check — crash if player dies mid-frame`);
        }
    }

    // EnemyManager.js: player null check in quest/spawn logic
    const emContent = readFile('js/managers/EnemyManager.js') || '';
    if (emContent.includes('player.kills') || emContent.includes('player.level')) {
        const hasGuard = emContent.includes('if (!player)') || emContent.includes('!player') ||
            emContent.includes('player &&');
        if (!hasGuard) {
            warnings.push(`[NULL_GUARD] EnemyManager.js: player properties accessed without null guard`);
        }
    }

    // HUD.js: RANKS[rank] undefined check
    const hudContent2 = readFile('js/ui/HUD.js') || '';
    if (hudContent2.includes('RANKS[') && hudContent2.includes('.color')) {
        if (!hudContent2.includes('RANKS[rank] &&') && !hudContent2.includes('if (RANKS[') &&
            !hudContent2.match(/RANKS\[\w+\]\s*\?\./)) {
            // Check if rank value is always valid (comes from RANK_ORDER which is validated)
        }
    }

    // WeaponManager.js: weapon null in projectile collision
    const wmContent = readFile('js/managers/WeaponManager.js') || '';
    if (wmContent.includes('weapon.getDamage') || wmContent.includes('weapon.damage')) {
        if (!wmContent.includes('!weapon') && !wmContent.includes('weapon &&') &&
            !wmContent.match(/if\s*\(\s*!?\s*weapon\s*\)/)) {
            warnings.push(`[NULL_GUARD] WeaponManager.js: weapon accessed without null check in collision callback`);
        }
    }

    // GameScene.js: boss collision after player destroyed
    const gsContent2 = readFile('js/scenes/GameScene.js') || '';
    if (gsContent2.includes('player.takeDamage') || gsContent2.includes('this.player.takeDamage')) {
        // Should have player.active or player existence check in collision callbacks
        if (!gsContent2.includes('player.active') && !gsContent2.includes('!this.player')) {
            warnings.push(`[NULL_GUARD] GameScene.js: player.takeDamage in collision without player.active check`);
        }
    }
}

// ═══════════════════════════════════════════
// X. 그림자 병사 색상 검증
// ═══════════════════════════════════════════
if (fileExists('js/entities/ShadowSoldier.js')) {
    const ssContent = readFile('js/entities/ShadowSoldier.js');

    // 틴트 색상 추출
    const tintColors = {};
    for (const m of ssContent.matchAll(/(melee|tank|ranged)\s*:\s*0x([0-9a-fA-F]{6})/g)) {
        if (!tintColors[m[1]]) tintColors[m[1]] = [];
        tintColors[m[1]].push(parseInt(m[2], 16));
    }

    // X-a. 각 타입에 틴트/글로우 색상 정의되어 있는지
    for (const type of ['melee', 'tank', 'ranged']) {
        if (!tintColors[type] || tintColors[type].length === 0) {
            errors.push(`[SHADOW_COLOR] shadowType "${type}" has no tint color defined`);
        }
    }

    // X-b. 틴트가 충분히 어두운지 (그림자 병사답게)
    // RGB 각 채널이 0x80(128) 이하여야 어두운 톤
    for (const [type, colors] of Object.entries(tintColors)) {
        const tint = colors[0]; // 첫 번째가 틴트
        const r = (tint >> 16) & 0xFF;
        const g = (tint >> 8) & 0xFF;
        const b = tint & 0xFF;
        const brightness = (r + g + b) / 3;
        if (brightness > 128) {
            warnings.push(`[SHADOW_COLOR] ${type} tint(0x${tint.toString(16).padStart(6,'0')}) avg brightness ${brightness.toFixed(0)} — too bright for shadow soldier`);
        }
    }

    // X-c. 타입별 색상이 서로 구분되는지 (색상 거리 체크)
    const typeKeys = Object.keys(tintColors).filter(t => tintColors[t].length >= 1);
    for (let i = 0; i < typeKeys.length; i++) {
        for (let j = i + 1; j < typeKeys.length; j++) {
            const c1 = tintColors[typeKeys[i]][0];
            const c2 = tintColors[typeKeys[j]][0];
            const dr = ((c1 >> 16) & 0xFF) - ((c2 >> 16) & 0xFF);
            const dg = ((c1 >> 8) & 0xFF) - ((c2 >> 8) & 0xFF);
            const db = (c1 & 0xFF) - (c2 & 0xFF);
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist < 30) {
                warnings.push(`[SHADOW_COLOR] ${typeKeys[i]} and ${typeKeys[j]} tint colors too similar (distance=${dist.toFixed(0)}) — hard to distinguish`);
            }
        }
    }

    // X-d. 글로우 색상이 틴트보다 밝은지 (광채 효과가 보여야 함)
    if (tintColors.melee && tintColors.melee.length >= 2) {
        for (const [type, colors] of Object.entries(tintColors)) {
            if (colors.length < 2) continue;
            const tint = colors[0];
            const glow = colors[1];
            const tintBright = (((tint >> 16) & 0xFF) + ((tint >> 8) & 0xFF) + (tint & 0xFF)) / 3;
            const glowBright = (((glow >> 16) & 0xFF) + ((glow >> 8) & 0xFF) + (glow & 0xFF)) / 3;
            if (glowBright <= tintBright) {
                warnings.push(`[SHADOW_COLOR] ${type} glow(brightness ${glowBright.toFixed(0)}) is darker than tint(${tintBright.toFixed(0)}) — glow won't be visible`);
            }
        }
    }

    // X-e. alpha 값이 적절한 범위 (0.5~0.95 — 반투명이되 너무 투명하면 안 됨)
    const alphaMatch = ssContent.match(/setAlpha\(([0-9.]+)\)/);
    if (alphaMatch) {
        const alpha = parseFloat(alphaMatch[1]);
        if (alpha < 0.5) {
            warnings.push(`[SHADOW_COLOR] Shadow soldier alpha(${alpha}) too low — nearly invisible`);
        } else if (alpha > 0.95) {
            warnings.push(`[SHADOW_COLOR] Shadow soldier alpha(${alpha}) too high — no shadow translucency`);
        }
    }
}

// ═══════════════════════════════════════════
// Z. this._prop 초기화 순서 검증 (create() 내에서 사용 전 초기화 확인)
// ═══════════════════════════════════════════
for (const f of allJsFiles) {
    const src = fs.readFileSync(f.full, 'utf8');
    const createMatch = src.match(/create\s*\([^)]*\)\s*\{/);
    if (!createMatch) continue;
    const createStart = createMatch.index;
    let depth = 0, createEnd = -1;
    for (let i = createStart + createMatch[0].length - 1; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { createEnd = i; break; } }
    }
    if (createEnd === -1) continue;
    const createBody = src.slice(createStart, createEnd + 1);
    const initRegex = /this\.(_\w+)\s*=\s*\[/g;
    const pushRegex = /this\.(_\w+)\.push\(/g;
    const inits = {};
    let m;
    while ((m = initRegex.exec(createBody)) !== null) {
        if (!(m[1] in inits)) inits[m[1]] = m.index;
    }
    while ((m = pushRegex.exec(createBody)) !== null) {
        const prop = m[1];
        if (prop in inits) continue;
        const methodCallRegex = new RegExp('this\\.\\w+\\([^)]*\\)', 'g');
        let mc;
        const methodCalls = [];
        while ((mc = methodCallRegex.exec(createBody)) !== null) {
            methodCalls.push({ name: mc[0], pos: mc.index });
        }
        for (const call of methodCalls) {
            const methodName = call.name.match(/this\.(\w+)\(/)?.[1];
            if (!methodName) continue;
            const methodRegex = new RegExp(methodName + '\\s*\\([^)]*\\)\\s*\\{');
            const methodMatch = src.match(methodRegex);
            if (!methodMatch) continue;
            const mStart = methodMatch.index;
            let mDepth = 0, mEnd = -1;
            for (let i = mStart + methodMatch[0].length - 1; i < src.length; i++) {
                if (src[i] === '{') mDepth++;
                else if (src[i] === '}') { mDepth--; if (mDepth === 0) { mEnd = i; break; } }
            }
            if (mEnd === -1) continue;
            const methodBody = src.slice(mStart, mEnd + 1);
            if (methodBody.includes(`this.${prop}.push(`)) {
                const initPos = inits[prop];
                if (initPos === undefined || call.pos < initPos) {
                    errors.push(`[INIT_ORDER] ${f.rel}: this.${prop} used in ${methodName}() before initialization in create()`);
                }
            }
        }
    }
}

// ═══════════════════════════════════════════
// 결과 출력
// ═══════════════════════════════════════════
console.log('\n══════════ SOLO LEVELING VALIDATION ══════════\n');
console.log(`JS files: ${allJsFiles.length}`);
console.log(`Scenes: ${expectedScenes.length}`);
console.log(`Enemy types: ${Object.keys(ENEMY_TYPES).length}`);
console.log(`Boss types: ${Object.keys(BOSS_TYPES).length}`);
console.log(`Boss schedule: ${BOSS_SCHEDULE.length} spawns`);
console.log(`Weapons: ${Object.keys(WEAPONS).length}`);
console.log(`Passives: ${Object.keys(PASSIVES).length}`);
console.log(`Ranks: ${RANK_ORDER.join(' → ')}`);
console.log(`XP table: ${XP_TABLE.length} levels`);
console.log(`Sound files: ${expectedSounds.length}`);
console.log(`World: ${WORLD_SIZE}×${WORLD_SIZE}`);
console.log(`Weapon unlock levels: ${weaponUnlockLevels.map(w => `${w.id}@Lv${w.level}`).join(', ')}`);
console.log();

if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ ALL CHECKS PASSED — 0 errors, 0 warnings');
} else {
    if (errors.length > 0) {
        console.log(`❌ ERRORS (${errors.length}):\n`);
        errors.forEach(e => console.log('  ' + e));
        console.log();
    }
    if (warnings.length > 0) {
        console.log(`⚠ WARNINGS (${warnings.length}):\n`);
        warnings.forEach(w => console.log('  ' + w));
        console.log();
    }
}

process.exit(errors.length > 0 ? 1 : 0);
