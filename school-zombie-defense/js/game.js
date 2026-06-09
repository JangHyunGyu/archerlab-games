(function () {
  "use strict";

  const GAME_WIDTH = 540;
  const GAME_HEIGHT = 960;
  const COLORS = {
    ink: 0x11161b,
    panel: 0x101820,
    glass: 0x74c9cf,
    rail: 0x16252d,
    gold: 0xe0ab26,
    blood: 0x76191d,
    green: 0x20c447,
    red: 0xd6463f,
    blue: 0x45d7ff,
    white: 0xf7fbff
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const choose = (items) => items[Math.floor(Math.random() * items.length)];
  const shuffleItems = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const getTeamDamageForLevel = (level) => Math.round(28 + Math.max(0, level - 1) * 2.1);
  const BASE_CRIT_CHANCE = 0.08;
  const DEFAULT_CRIT_MULTIPLIER = 1.85;
  const BOW_BASE_CRIT_CHANCE = 0.3;
  const BOW_MARK_DURATION = 4.25;
  const BOW_MARK_DAMAGE_BONUS = 0.18;
  const AIM_POSES = [
    { key: "aim-10", angle: -Math.PI * 5 / 6 },
    { key: "aim-1030", angle: -Math.PI * 3 / 4 },
    { key: "aim-11", angle: -Math.PI * 2 / 3 },
    { key: "aim-1130", angle: -Math.PI * 7 / 12 },
    { key: "aim-12", angle: -Math.PI / 2 },
    { key: "aim-1230", angle: -Math.PI * 5 / 12 },
    { key: "aim-13", angle: -Math.PI / 3 },
    { key: "aim-1330", angle: -Math.PI / 4 },
    { key: "aim-14", angle: -Math.PI / 6 }
  ];
  const AIM_POSE_KEYS = AIM_POSES.map((pose) => pose.key);
  const AIM_POSE_BY_KEY = Object.fromEntries(AIM_POSES.map((pose) => [pose.key, pose]));
  const AIM_ALIASES = {
    idle: "aim-12",
    left: "aim-1030",
    up: "aim-12",
    right: "aim-1330"
  };
  const PROJECTILE_SCALES = {
    "projectile-arrow": 0.19,
    "projectile-pistol": 0.14,
    "projectile-rifle": 0.16,
    "projectile-rocket": 0.19,
    "projectile-sniper": 0.16,
    "projectile-frost": 0.78,
    "projectile-support": 0.78,
    "projectile-shock": 0.62
  };
  const MUZZLE_EFFECTS = {
    "projectile-arrow": { texture: "muzzle-arrow", width: 42, duration: 150, alpha: 0.78, scalePeak: 1.12 },
    "projectile-pistol": { texture: "muzzle-pistol", width: 36, duration: 130, alpha: 0.92, scalePeak: 1.18 },
    "projectile-rifle": { texture: "muzzle-rifle", width: 48, duration: 120, alpha: 0.95, scalePeak: 1.16 },
    "projectile-sniper": { texture: "muzzle-sniper", width: 58, duration: 135, alpha: 0.9, scalePeak: 1.12 },
    "projectile-rocket": { texture: "muzzle-rocket", width: 68, duration: 190, alpha: 0.95, scalePeak: 1.08 }
  };
  const ZOMBIE_HIT_EFFECTS = {
    "projectile-arrow": { texture: "zombie-hit-arrow", width: 31, duration: 260, alpha: 0.9, scalePeak: 1.18, rotation: 0.15 },
    "projectile-pistol": { texture: "zombie-hit-pistol", width: 42, duration: 240, alpha: 0.92, scalePeak: 1.14, rotation: 0.2 },
    "projectile-rifle": { texture: "zombie-hit-rifle", width: 50, duration: 220, alpha: 0.92, scalePeak: 1.13, rotation: 0.35 },
    "projectile-sniper": { texture: "zombie-hit-sniper", width: 58, duration: 250, alpha: 0.92, scalePeak: 1.16, rotation: 0.4 },
    "projectile-rocket": { texture: "zombie-hit-rocket", width: 78, duration: 330, alpha: 0.95, scalePeak: 1.12, rotation: 0.25 },
    explosion: { texture: "zombie-hit-rocket", width: 88, duration: 340, alpha: 0.9, scalePeak: 1.16, rotation: 0.45 },
    default: { texture: "zombie-hit-pistol", width: 40, duration: 230, alpha: 0.88, scalePeak: 1.12, rotation: 0.28 }
  };
  const ZOMBIE_DEATH_EFFECTS = {
    small: { texture: "zombie-death-small", width: 150, duration: 620, alpha: 0.94, scalePeak: 1.08 },
    normal: { texture: "zombie-death-normal", width: 210, duration: 720, alpha: 0.96, scalePeak: 1.07 },
    elite: { texture: "zombie-death-elite", width: 280, duration: 820, alpha: 0.97, scalePeak: 1.05 }
  };
  const ZOMBIE_HP_MULTIPLIER = 3;
  const ZOMBIE_SPAWN_INTERVAL_MULTIPLIER = 2.4;
  const ZOMBIE_SPAWN_COUNT_MULTIPLIER = 0.75;
  const getLevelNeedForLevel = (level) => Math.max(4, Math.round((level === 1 ? 12 : 15 + level * 4.4) / ZOMBIE_SPAWN_INTERVAL_MULTIPLIER));
  const STARTING_LEVEL_NEED = getLevelNeedForLevel(1);
  const STARTING_SPAWN_TIMER = 1.15;
  const CHARACTER_FIRE_COOLDOWN_MULTIPLIER = 1.3;
  const SFX_MASTER_VOLUME = 0.44;
  const SFX_ASSETS = {
    start: "assets/sounds/sfx/start.wav",
    skill: "assets/sounds/sfx/skill.wav",
    core: "assets/sounds/sfx/core.wav",
    hit: "assets/sounds/sfx/hit.mp3",
    crit: "assets/sounds/sfx/crit.wav",
    death: "assets/sounds/sfx/death.mp3",
    explosion: "assets/sounds/sfx/explosion.wav",
    pistol: "assets/sounds/sfx/pistol.mp3",
    rifle: "assets/sounds/sfx/rifle.mp3",
    sniper: "assets/sounds/sfx/sniper.mp3",
    rocket: "assets/sounds/sfx/rocket.mp3",
    arrow: "assets/sounds/sfx/arrow.mp3",
    button: "assets/sounds/sfx/button.mp3",
    denied: "assets/sounds/sfx/denied.mp3",
    recruit: "assets/sounds/sfx/recruit.mp3",
    wave_clear: "assets/sounds/sfx/wave_clear.mp3",
    game_over: "assets/sounds/sfx/game_over.mp3",
    coin: "assets/sounds/sfx/coin.wav",
    pause: "assets/sounds/sfx/pause.wav"
  };
  const BGM_ASSETS = {
    menu: "assets/sounds/bgm/menu_loop.mp3",
    game: "assets/sounds/bgm/game_loop.mp3"
  };
  const BGM_VOLUME = 0.14;
  const MAX_CORE_HP_SKILL_CAP = 6000;
  const MAX_CORE_HP_SKILL_RATE = 0.12;
  const META_SAVE_KEY = "schoolZombieDefenseMetaV1";
  const SHOP_MAX_LEVEL = 10;
  const SHOP_CHARACTERS = [
    {
      id: "c",
      name: "권총 주인공",
      weapon: "권총",
      portrait: "avatar-pistol",
      icon: "skill-pistol-rapid",
      accent: 0xf2b84b
    },
    {
      id: "a",
      name: "활 지원",
      weapon: "활",
      portrait: "avatar-bow",
      icon: "skill-arrow-pin",
      accent: 0xff80b6
    },
    {
      id: "b",
      name: "소총 지원",
      weapon: "소총",
      portrait: "avatar-rifle",
      icon: "skill-rifle-grenade",
      accent: 0xf6b04f
    },
    {
      id: "d",
      name: "로켓 지원",
      weapon: "로켓",
      portrait: "avatar-rocket",
      icon: "skill-rocket-impact",
      accent: 0x91f7ff
    },
    {
      id: "e",
      name: "저격 지원",
      weapon: "저격총",
      portrait: "avatar-sniper",
      icon: "skill-sniper-weakpoint",
      accent: 0x91ff9a
    }
  ];
  const SHOP_CHARACTER_UPGRADES = {
    c: [
      { id: "c_power", title: "강화 총열", subtitle: "권총 부품", part: "총열 내구와 탄속 보정", icon: "skill-pistol-rapid" },
      { id: "c_speed", title: "반동 스프링", subtitle: "권총 부품", part: "슬라이드 복귀 속도 개선", icon: "skill-multishot" },
      { id: "c_crit", title: "정밀 조준기", subtitle: "권총 부품", part: "급소 조준 보정 모듈", icon: "skill-pierce" }
    ],
    a: [
      { id: "a_power", title: "복합 활대", subtitle: "활 부품", part: "장력과 화살 속도 강화", icon: "skill-arrow-pin" },
      { id: "a_mark", title: "표식 화살촉", subtitle: "화살 부품", part: "약점 표식 각인 강화", icon: "skill-mark" },
      { id: "a_crit", title: "균형 깃털", subtitle: "화살 부품", part: "비행 안정성과 치명 보정", icon: "skill-rally" }
    ],
    b: [
      { id: "b_power", title: "강선 총열", subtitle: "소총 부품", part: "탄속과 관통 안정성 강화", icon: "skill-barrage" },
      { id: "b_control", title: "가스 피스톤", subtitle: "소총 부품", part: "연발 반동 제어 장치", icon: "skill-barrage" },
      { id: "b_grenade", title: "하부 유탄장치", subtitle: "소총 부품", part: "소형 유탄 발사 모듈", icon: "skill-rifle-grenade" }
    ],
    d: [
      { id: "d_charge", title: "성형작약 탄두", subtitle: "로켓 부품", part: "직격 관통 폭압 집중", icon: "skill-rocket-impact" },
      { id: "d_radius", title: "확산 노즐", subtitle: "로켓 부품", part: "폭발 확산각 조정", icon: "skill-rocket" },
      { id: "d_slow", title: "냉각 연료캡슐", subtitle: "로켓 부품", part: "냉각 연소재 혼합", icon: "skill-frost" }
    ],
    e: [
      { id: "e_power", title: "대구경 총열", subtitle: "저격 부품", part: "고압탄 대응 총열 강화", icon: "skill-sniper" },
      { id: "e_focus", title: "약점 스코프", subtitle: "저격 부품", part: "취약부위 자동 보정", icon: "skill-sniper-weakpoint" },
      { id: "e_pierce", title: "철갑 탄심", subtitle: "저격 탄약", part: "장갑 관통 탄심 교체", icon: "skill-pierce" }
    ]
  };
  const getAllShopUpgradeIds = () => Object.values(SHOP_CHARACTER_UPGRADES).flat().map((upgrade) => upgrade.id);
  const getShopUpgradeCost = (level) => level >= SHOP_MAX_LEVEL ? 0 : 200 * Math.pow(2, level);
  const DEFAULT_CHAIN_SHOT_DELAY = 125;
  const WEAPON_CHAIN_SHOT_DELAYS = {
    "projectile-pistol": 110,
    "projectile-arrow": 140,
    "projectile-rifle": 70,
    "projectile-rocket": 190,
    "projectile-sniper": 170
  };
  const RECRUIT_UNLOCK_LEVELS = [3, 6, 9, 12];
  const getUnlockedRecruitSlots = (level) => RECRUIT_UNLOCK_LEVELS.filter((unlockLevel) => level >= unlockLevel).length;
  const ZOMBIE_TYPE_CONFIGS = {
    normal: { id: "normal", hpScale: 1, speedScale: 1, sizeScale: 1, attackScale: 1, hitRadiusScale: 1, knockbackScale: 1, animRate: 6.8, reward: 1 },
    runner: { id: "runner", hpScale: 0.72, speedScale: 1.72, sizeScale: 0.82, attackScale: 0.76, hitRadiusScale: 0.86, knockbackScale: 1.18, animRate: 9.4, reward: 1 },
    brute: { id: "brute", hpScale: 3.7, speedScale: 0.72, sizeScale: 1.24, attackScale: 1.45, hitRadiusScale: 1.22, knockbackScale: 0.42, animRate: 4.9, reward: 2 },
    volatile: { id: "volatile", hpScale: 1.05, speedScale: 1.08, sizeScale: 1.02, attackScale: 1.06, hitRadiusScale: 1, knockbackScale: 0.72, animRate: 7.4, reward: 2, deathExplosion: true },
    elite: { id: "elite", hpScale: 1, speedScale: 1, sizeScale: 1, attackScale: 1, hitRadiusScale: 1, knockbackScale: 0.5, animRate: 5.2, reward: 4 }
  };
  const ZOMBIE_TEXTURE_TYPES = ["normal", "runner", "brute", "volatile", "elite"];

  function createDefaultMetaSave() {
    const save = {
      coins: 0,
      upgrades: {}
    };
    getAllShopUpgradeIds().forEach((id) => {
      save.upgrades[id] = 0;
    });
    return save;
  }

  function normalizeMetaSave(save) {
    const defaults = createDefaultMetaSave();
    const next = {
      coins: Math.max(0, Math.floor(Number(save?.coins) || 0)),
      upgrades: { ...defaults.upgrades }
    };
    Object.keys(defaults.upgrades).forEach((id) => {
      next.upgrades[id] = clamp(Math.floor(Number(save?.upgrades?.[id]) || 0), 0, SHOP_MAX_LEVEL);
    });
    const oldGunLevel = clamp(Math.floor(Number(save?.upgrades?.gun) || 0), 0, SHOP_MAX_LEVEL);
    const oldBowLevel = clamp(Math.floor(Number(save?.upgrades?.bow) || 0), 0, SHOP_MAX_LEVEL);
    const oldLauncherLevel = clamp(Math.floor(Number(save?.upgrades?.launcher) || 0), 0, SHOP_MAX_LEVEL);
    if (oldGunLevel > 0) {
      ["c_power", "b_power", "e_power"].forEach((id) => {
        next.upgrades[id] = Math.max(next.upgrades[id], oldGunLevel);
      });
    }
    if (oldBowLevel > 0) {
      next.upgrades.a_power = Math.max(next.upgrades.a_power, oldBowLevel);
    }
    if (oldLauncherLevel > 0) {
      next.upgrades.d_charge = Math.max(next.upgrades.d_charge, oldLauncherLevel);
    }
    return next;
  }

  function loadMetaSave() {
    try {
      return normalizeMetaSave(JSON.parse(window.localStorage.getItem(META_SAVE_KEY) || "{}"));
    } catch (error) {
      return createDefaultMetaSave();
    }
  }

  function saveMetaSave(save) {
    try {
      window.localStorage.setItem(META_SAVE_KEY, JSON.stringify(normalizeMetaSave(save)));
    } catch (error) {
      // Storage can be unavailable in private or embedded browser modes.
    }
  }

  function pickZombieType(level, eliteRoll) {
    if (eliteRoll) {
      return ZOMBIE_TYPE_CONFIGS.elite;
    }
    const entries = [
      { type: ZOMBIE_TYPE_CONFIGS.normal, weight: 100 }
    ];
    if (level >= 2) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.runner, weight: Math.min(34, 14 + level * 1.5) });
    }
    if (level >= 4) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.brute, weight: Math.min(22, 8 + (level - 4) * 1.2) });
    }
    if (level >= 6) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.volatile, weight: Math.min(18, 6 + (level - 6) * 1.1) });
    }
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.type;
      }
    }
    return ZOMBIE_TYPE_CONFIGS.normal;
  }
  const SKILL_ACCENTS = {
    pierce: 0xbef6ff,
    barrel: 0xffc768,
    rally: 0xff7fb7,
    repair: 0x7dff8d,
    barrage: 0xff8d42,
    squad: 0xc38dff,
    frost: 0x91f7ff,
    "core-full-repair": 0x7dffdf,
    "core-max-hp": 0x91f7ff,
    "recruit-a": 0xff7fb7,
    "recruit-b": 0xff8d42,
    "recruit-d": 0x91f7ff,
    "recruit-e": 0x7dff8d
  };
  const SKILL_ACCENT_HEX = {
    pierce: "#bef6ff",
    barrel: "#ffc768",
    rally: "#ff7fb7",
    repair: "#7dff8d",
    barrage: "#ff8d42",
    squad: "#c38dff",
    frost: "#91f7ff",
    "core-full-repair": "#7dffdf",
    "core-max-hp": "#91f7ff",
    "recruit-a": "#ff7fb7",
    "recruit-b": "#ff8d42",
    "recruit-d": "#91f7ff",
    "recruit-e": "#7dff8d"
  };
  const DEFENDER_ROSTER = [
    {
      id: "a",
      x: 52,
      y: 926,
      height: 222,
      damageScale: 1.08,
      role: "rally",
      projectile: "projectile-arrow",
      speed: 860,
      rate: 1.02,
      critChance: BOW_BASE_CRIT_CHANCE,
      critMultiplier: 2.05,
      markDuration: BOW_MARK_DURATION,
      markDamageBonus: BOW_MARK_DAMAGE_BONUS,
      aim: { pivot: [0, -134], reach: 38 },
      recruit: {
        icon: "portrait-rally",
        tag: "활",
        title: "활 지원 합류",
        desc: "화살 지원 사격\n치명/표식 성장 해금"
      }
    },
    {
      id: "b",
      x: 158,
      y: 924,
      height: 230,
      damageScale: 0.46,
      role: "barrage",
      projectile: "projectile-rifle",
      speed: 1020,
      rate: 0.86,
      critChance: 0.07,
      critMultiplier: 1.45,
      burstCount: 3,
      burstDelay: 70,
      aim: { pivot: [2, -146], reach: 52 },
      recruit: {
        icon: "portrait-barrage",
        tag: "소총",
        title: "소총 지원 합류",
        desc: "3연발 지원 사격\n유탄 패시브 해금"
      }
    },
    {
      id: "c",
      x: 270,
      y: 925,
      height: 248,
      damageScale: 0.58,
      role: "player",
      projectile: "projectile-pistol",
      speed: 900,
      rate: 0.4,
      critChance: 0.12,
      critMultiplier: 1.6,
      aim: { pivot: [0, -158], reach: 48 }
    },
    {
      id: "d",
      x: 382,
      y: 925,
      height: 226,
      damageScale: 1.55,
      role: "frost",
      projectile: "projectile-rocket",
      speed: 720,
      rate: 1.55,
      critChance: 0.04,
      critMultiplier: 1.35,
      splashRadius: 88,
      splashDamageScale: 0.65,
      aim: { pivot: [2, -145], reach: 56 },
      recruit: {
        icon: "portrait-frost",
        tag: "로켓",
        title: "로켓 지원 합류",
        desc: "폭발 로켓 사격\n냉각 탄두 성장"
      }
    },
    {
      id: "e",
      x: 488,
      y: 924,
      height: 205,
      damageScale: 1.9,
      role: "repair",
      projectile: "projectile-sniper",
      speed: 1180,
      rate: 1.8,
      critChance: 0.24,
      critMultiplier: 2.35,
      pierce: 2,
      aim: { pivot: [2, -132], reach: 64 },
      recruit: {
        icon: "portrait-repair",
        tag: "저격",
        title: "저격 지원 합류",
        desc: "관통 저격 사격\n방어 보강 성장"
      }
    }
  ];
  const DEFENDER_FORMATION_SLOTS = [
    { x: 270, y: 925 },
    { x: 158, y: 924 },
    { x: 382, y: 925 },
    { x: 52, y: 926 },
    { x: 488, y: 924 }
  ];
  const OWNER_SKILL_PORTRAITS = {
    c: "avatar-pistol",
    a: "avatar-bow",
    b: "avatar-rifle",
    d: "avatar-rocket",
    e: "avatar-sniper"
  };
  function getAimPose(key) {
    return AIM_POSE_BY_KEY[key] || AIM_POSE_BY_KEY["aim-12"];
  }

  function angleDistance(a, b) {
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  }

  function getNearestAimPose(angle) {
    return AIM_POSES.reduce((closest, pose) => {
      return angleDistance(angle, pose.angle) < angleDistance(angle, closest.angle) ? pose : closest;
    }, AIM_POSES[4]);
  }

  function makeCanvasTexture(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    draw(ctx, width, height);
    scene.textures.addCanvas(key, canvas);
  }

  function makeImageSliceTexture(scene, sourceKey, key, sx, sy, sw, sh) {
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }

    const source = scene.textures.get(sourceKey).getSourceImage();
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    scene.textures.addCanvas(key, canvas);
  }

  function createZombieSpriteTextures(scene) {
    const sliceSheet = (sourceKey, keyPrefix) => {
      const source = scene.textures.get(sourceKey).getSourceImage();
      const cellWidth = Math.floor(source.width / 4);
      const cellHeight = Math.floor(source.height / 4);
      for (let variant = 0; variant < 4; variant += 1) {
        for (let frame = 0; frame < 4; frame += 1) {
          makeImageSliceTexture(
            scene,
            sourceKey,
            `${keyPrefix}-${variant}-${frame}`,
            frame * cellWidth,
            variant * cellHeight,
            cellWidth,
            cellHeight
          );
        }
      }
    };

    sliceSheet("zombie-walk", "zombie-walk");
    ZOMBIE_TEXTURE_TYPES.forEach((type) => {
      sliceSheet(`zombie-walk-${type}`, `zombie-walk-${type}`);
    });
  }

  function createCharacterSpriteTextures(scene) {
    ["a", "b", "c", "d", "e"].forEach((id) => {
      const sourceKey = `character-${id}`;
      const source = scene.textures.get(sourceKey).getSourceImage();
      const cellWidth = Math.floor(source.width / AIM_POSE_KEYS.length);
      const cellHeight = source.height;
      AIM_POSE_KEYS.forEach((pose, index) => {
        makeImageSliceTexture(
          scene,
          sourceKey,
          `character-${id}-${pose}`,
          index * cellWidth,
          0,
          cellWidth,
          cellHeight
        );
      });
      Object.entries(AIM_ALIASES).forEach(([alias, pose]) => {
        const index = AIM_POSE_KEYS.indexOf(pose);
        makeImageSliceTexture(
          scene,
          sourceKey,
          `character-${id}-${alias}`,
          index * cellWidth,
          0,
          cellWidth,
          cellHeight
        );
      });
    });
  }

  function createCharacterBadgeTextures(scene) {
    ["a", "b", "c", "d", "e"].forEach((id) => {
      const sourceKey = `character-${id}-idle`;
      const targetKey = `character-${id}-badge`;
      if (!scene.textures.exists(sourceKey)) {
        return;
      }
      if (scene.textures.exists(targetKey)) {
        scene.textures.remove(targetKey);
      }

      const source = scene.textures.get(sourceKey).getSourceImage();
      const scanCanvas = document.createElement("canvas");
      scanCanvas.width = source.width;
      scanCanvas.height = source.height;
      const scanCtx = scanCanvas.getContext("2d");
      scanCtx.drawImage(source, 0, 0);
      const pixels = scanCtx.getImageData(0, 0, source.width, source.height).data;
      let minX = source.width;
      let minY = source.height;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          if (pixels[(y * source.width + x) * 4 + 3] > 20) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (minX > maxX || minY > maxY) {
        return;
      }

      const bodyW = maxX - minX + 1;
      const bodyH = maxY - minY + 1;
      const cropH = Math.min(source.height, Math.round(bodyH * 0.66));
      const cropW = Math.min(source.width, Math.max(Math.round(bodyW * 1.45), Math.round(cropH * 0.78)));
      const centerX = Math.round((minX + maxX) / 2);
      const cropX = clamp(Math.round(centerX - cropW / 2), 0, source.width - cropW);
      const cropY = clamp(Math.round(minY + bodyH * 0.02), 0, source.height - cropH);
      const outputSize = 128;
      const output = document.createElement("canvas");
      output.width = outputSize;
      output.height = outputSize;
      const ctx = output.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      const scale = Math.min(112 / cropW, 120 / cropH);
      const drawW = cropW * scale;
      const drawH = cropH * scale;
      ctx.drawImage(
        source,
        cropX,
        cropY,
        cropW,
        cropH,
        (outputSize - drawW) / 2,
        outputSize - drawH - 4,
        drawW,
        drawH
      );
      scene.textures.addCanvas(targetKey, output);
    });
  }

  function createUiTextures(scene) {
    makeImageSliceTexture(scene, "ui-frame-sheet", "ui-top-hud", 42, 70, 1688, 230);
    makeImageSliceTexture(scene, "ui-frame-sheet", "ui-skill-button", 72, 610, 284, 276);
    makeImageSliceTexture(scene, "ui-frame-sheet", "ui-pause-circle", 490, 610, 275, 276);
    makeImageSliceTexture(scene, "ui-frame-sheet", "ui-speed-circle", 810, 610, 275, 276);
    makeImageSliceTexture(scene, "ui-frame-sheet", "ui-resource-panel", 1185, 382, 565, 472);
    makeImageSliceTexture(scene, "skill-card-sheet", "ui-skill-card", 45, 64, 440, 890);
  }

  function createLegacyZombieSpriteTextures(scene) {
    const cellSize = 512;
    for (let index = 0; index < 6; index += 1) {
      makeImageSliceTexture(
        scene,
        "zombie-sheet",
        `zombie-sprite-${index}`,
        (index % 3) * cellSize,
        Math.floor(index / 3) * cellSize,
        cellSize,
        cellSize
      );
    }
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function strokeText(ctx, text, x, y, size, fill, stroke) {
    ctx.font = `900 ${size}px Arial, sans-serif`;
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawZombie(ctx, width, height, palette) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, 8);
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 5;

    ctx.strokeStyle = palette.skinDark;
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-24, 38);
    ctx.lineTo(-39, 63);
    ctx.moveTo(24, 38);
    ctx.lineTo(39, 63);
    ctx.stroke();

    ctx.strokeStyle = "#1f2b31";
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(-13, 75);
    ctx.lineTo(-18, 103);
    ctx.moveTo(13, 75);
    ctx.lineTo(18, 103);
    ctx.stroke();

    ctx.fillStyle = palette.shirt;
    roundedRect(ctx, -28, 29, 56, 48, 8);
    ctx.fill();
    ctx.strokeStyle = "#87999b";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = palette.tie;
    ctx.beginPath();
    ctx.moveTo(-16, 45);
    ctx.lineTo(0, 55);
    ctx.lineTo(16, 45);
    ctx.lineTo(17, 61);
    ctx.lineTo(-17, 61);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = palette.skirt;
    ctx.beginPath();
    ctx.moveTo(-31, 72);
    ctx.lineTo(31, 72);
    ctx.lineTo(24, 91);
    ctx.lineTo(-24, 91);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = palette.skin;
    ctx.beginPath();
    ctx.arc(0, 20, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.hair;
    ctx.beginPath();
    ctx.arc(0, 13, 23, Math.PI * 0.95, Math.PI * 2.08);
    ctx.lineTo(23, 34);
    ctx.quadraticCurveTo(2, 28, -22, 34);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#172023";
    ctx.fillRect(-9, 20, 5, 5);
    ctx.fillRect(8, 20, 5, 5);
    ctx.strokeStyle = "#5f2527";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-7, 33);
    ctx.quadraticCurveTo(1, 38, 11, 32);
    ctx.stroke();

    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = "#dbe9e8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, 48);
    ctx.lineTo(18, 48);
    ctx.moveTo(-20, 58);
    ctx.lineTo(20, 58);
    ctx.stroke();
    ctx.restore();
  }

  function drawDefender(ctx, width, height, palette) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, 4);
    ctx.shadowColor = "rgba(0,0,0,.48)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 5;

    ctx.strokeStyle = "#22262b";
    ctx.lineWidth = 15;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-20, 54);
    ctx.lineTo(-38, 82);
    ctx.moveTo(20, 54);
    ctx.lineTo(39, 80);
    ctx.moveTo(-10, 84);
    ctx.lineTo(-16, 117);
    ctx.moveTo(10, 84);
    ctx.lineTo(18, 117);
    ctx.stroke();

    ctx.fillStyle = palette.body;
    roundedRect(ctx, -26, 42, 52, 55, 10);
    ctx.fill();
    ctx.strokeStyle = "#0c1115";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = palette.skin;
    ctx.beginPath();
    ctx.arc(0, 29, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.hair;
    ctx.beginPath();
    ctx.arc(0, 25, 24, Math.PI * 0.92, Math.PI * 2.16);
    ctx.lineTo(22, 49);
    ctx.quadraticCurveTo(0, 39, -22, 49);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = palette.weapon;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(22, 51);
    ctx.lineTo(52, 21);
    ctx.stroke();
    ctx.strokeStyle = "#d5dee6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, 43);
    ctx.lineTo(59, 14);
    ctx.stroke();

    ctx.restore();
  }

  function drawPortrait(ctx, width, height, palette, label) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    const gradient = ctx.createRadialGradient(width * 0.32, height * 0.22, 5, width / 2, height / 2, width * 0.55);
    gradient.addColorStop(0, palette.glow);
    gradient.addColorStop(1, palette.dark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, width * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f2fbff";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = palette.skin;
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.44, width * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.hair;
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.38, width * 0.23, Math.PI * 0.92, Math.PI * 2.15);
    ctx.lineTo(width * 0.72, height * 0.57);
    ctx.quadraticCurveTo(width / 2, height * 0.48, width * 0.27, height * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.body;
    roundedRect(ctx, width * 0.31, height * 0.58, width * 0.38, height * 0.24, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.beginPath();
    ctx.arc(width * 0.76, height * 0.76, width * 0.15, 0, Math.PI * 2);
    ctx.fill();
    strokeText(ctx, label, width * 0.705, height * 0.835, 18, "#ffffff", "#151515");
    ctx.restore();
  }

  function drawSkillIcon(ctx, width, height, type) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    const colors = {
      frost: ["#83f2ff", "#0b6b9b"],
      barrage: ["#ffdd62", "#b93a12"],
      rally: ["#ff7fb7", "#7c2356"],
      repair: ["#76f07a", "#156f31"],
      pierce: ["#d5fbff", "#246e82"],
      barrel: ["#ffd984", "#7a4912"],
      squad: ["#c38dff", "#402081"]
    }[type] || ["#f7fbff", "#26343d"];

    const gradient = ctx.createRadialGradient(-14, -14, 4, 0, 0, 34);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f8fbff";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = "#10202a";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#fff";
    if (type === "frost") {
      for (let i = 0; i < 6; i += 1) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(0, 25);
        ctx.stroke();
      }
    } else if (type === "barrage") {
      ctx.beginPath();
      ctx.moveTo(-18, 18);
      ctx.quadraticCurveTo(-5, -28, 24, -20);
      ctx.quadraticCurveTo(2, -6, 18, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (type === "repair") {
      ctx.fillRect(-6, -23, 12, 46);
      ctx.fillRect(-23, -6, 46, 12);
    } else if (type === "rally") {
      ctx.beginPath();
      ctx.moveTo(-20, 9);
      ctx.lineTo(2, 9);
      ctx.lineTo(20, -17);
      ctx.lineTo(20, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-18, 18);
      ctx.lineTo(16, -20);
      ctx.moveTo(8, -18);
      ctx.lineTo(20, -22);
      ctx.lineTo(16, -10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawProjectile(ctx, width, height, type) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.shadowColor = "rgba(255, 238, 128, .65)";
    ctx.shadowBlur = 10;

    if (type === "arrow") {
      ctx.shadowColor = "rgba(255, 245, 160, .55)";
      ctx.strokeStyle = "#f8f3d0";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 34);
      ctx.lineTo(0, -30);
      ctx.stroke();
      ctx.fillStyle = "#fff6a8";
      ctx.beginPath();
      ctx.moveTo(0, -42);
      ctx.lineTo(8, -25);
      ctx.lineTo(0, -30);
      ctx.lineTo(-8, -25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#ad7a30";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-7, 31);
      ctx.lineTo(0, 22);
      ctx.lineTo(7, 31);
      ctx.stroke();
    } else if (type === "rifle") {
      const gradient = ctx.createLinearGradient(0, -42, 0, 42);
      gradient.addColorStop(0, "rgba(129, 238, 255, 0)");
      gradient.addColorStop(0.26, "#b6fbff");
      gradient.addColorStop(0.5, "#ffffff");
      gradient.addColorStop(0.74, "#49d7ff");
      gradient.addColorStop(1, "rgba(73, 215, 255, 0)");
      ctx.fillStyle = gradient;
      roundedRect(ctx, -4, -42, 8, 84, 4);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, -1.5, -30, 3, 60, 2);
      ctx.fill();
    } else if (type === "pistol") {
      const gradient = ctx.createLinearGradient(0, -19, 0, 19);
      gradient.addColorStop(0, "#fff8ad");
      gradient.addColorStop(0.45, "#ffe13d");
      gradient.addColorStop(1, "rgba(255, 175, 40, 0)");
      ctx.fillStyle = gradient;
      roundedRect(ctx, -4, -19, 8, 38, 4);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, -13, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "rocket") {
      ctx.shadowColor = "rgba(255, 110, 64, .65)";
      const gradient = ctx.createLinearGradient(0, -34, 0, 36);
      gradient.addColorStop(0, "#e9f0f1");
      gradient.addColorStop(0.5, "#51616b");
      gradient.addColorStop(1, "#1d252b");
      ctx.fillStyle = gradient;
      roundedRect(ctx, -9, -28, 18, 58, 7);
      ctx.fill();
      ctx.fillStyle = "#ffdf71";
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.lineTo(11, -28);
      ctx.lineTo(-11, -28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff7d3e";
      ctx.beginPath();
      ctx.moveTo(-11, 18);
      ctx.lineTo(-22, 36);
      ctx.lineTo(-4, 28);
      ctx.closePath();
      ctx.moveTo(11, 18);
      ctx.lineTo(22, 36);
      ctx.lineTo(4, 28);
      ctx.closePath();
      ctx.fill();
    } else if (type === "sniper") {
      const gradient = ctx.createLinearGradient(0, -54, 0, 54);
      gradient.addColorStop(0, "rgba(255, 244, 180, 0)");
      gradient.addColorStop(0.22, "#fff7b8");
      gradient.addColorStop(0.52, "#ffffff");
      gradient.addColorStop(0.82, "#91e8ff");
      gradient.addColorStop(1, "rgba(80, 220, 255, 0)");
      ctx.fillStyle = gradient;
      roundedRect(ctx, -3, -54, 6, 108, 3);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, -1, -42, 2, 82, 1);
      ctx.fill();
    } else if (type === "frost") {
      const gradient = ctx.createRadialGradient(0, -12, 2, 0, 0, 30);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.4, "#86f4ff");
      gradient.addColorStop(1, "rgba(51, 165, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, -36);
      ctx.lineTo(14, -5);
      ctx.lineTo(5, 34);
      ctx.lineTo(-12, 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#d8fbff";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (type === "support") {
      const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.42, "#73ff9b");
      gradient.addColorStop(1, "rgba(115, 255, 155, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#baffce";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -21);
      ctx.lineTo(0, 21);
      ctx.moveTo(-21, 0);
      ctx.lineTo(21, 0);
      ctx.stroke();
    } else if (type === "shock") {
      ctx.strokeStyle = "#ff8fbd";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 20, 38, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 20, 25, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
    }
    ctx.restore();
  }

  function createTextures(scene) {
    makeCanvasTexture(scene, "projectile-frost", 48, 84, (ctx) => drawProjectile(ctx, 48, 84, "frost"));
    makeCanvasTexture(scene, "projectile-support", 48, 48, (ctx) => drawProjectile(ctx, 48, 48, "support"));
    makeCanvasTexture(scene, "projectile-shock", 96, 64, (ctx) => drawProjectile(ctx, 96, 64, "shock"));

    makeCanvasTexture(scene, "zombie-girl", 78, 124, (ctx) => drawZombie(ctx, 78, 124, {
      skin: "#9fb2a3",
      skinDark: "#8aa08d",
      shirt: "#eef4ef",
      tie: "#4b9a64",
      skirt: "#3b8651",
      hair: "#26343d"
    }));
    makeCanvasTexture(scene, "zombie-boy", 78, 124, (ctx) => drawZombie(ctx, 78, 124, {
      skin: "#9b9d8f",
      skinDark: "#858878",
      shirt: "#dde1d8",
      tie: "#c59d34",
      skirt: "#28313a",
      hair: "#5b4b38"
    }));
    makeCanvasTexture(scene, "zombie-elite", 88, 138, (ctx) => drawZombie(ctx, 88, 138, {
      skin: "#b2a09c",
      skinDark: "#936d71",
      shirt: "#f2eee9",
      tie: "#8f242a",
      skirt: "#333f44",
      hair: "#1c1b22"
    }));

    const defenders = [
      ["defender-center", { body: "#252d34", skin: "#c89d75", hair: "#2b211c", weapon: "#1e252b" }],
      ["defender-pink", { body: "#eef4ef", skin: "#f1c6ae", hair: "#e06b8d", weapon: "#3b414a" }],
      ["defender-blonde", { body: "#e9edf0", skin: "#f1c39d", hair: "#e7c244", weapon: "#2f343a" }],
      ["defender-purple", { body: "#e8eeec", skin: "#d0a886", hair: "#433a78", weapon: "#24272c" }],
      ["defender-brown", { body: "#edf2ee", skin: "#e0ae88", hair: "#9a6537", weapon: "#3b2a24" }]
    ];
    defenders.forEach(([key, palette]) => {
      makeCanvasTexture(scene, key, 92, 136, (ctx) => drawDefender(ctx, 92, 136, palette));
    });

    [
      ["portrait-pistol", { glow: "#8fdfff", dark: "#10243a", skin: "#c89d75", hair: "#2b211c", body: "#252d34" }, "1"],
      ["portrait-frost", { glow: "#a6f6ff", dark: "#123c6c", skin: "#d0a886", hair: "#493b83", body: "#eef5f4" }, "3"],
      ["portrait-barrage", { glow: "#ffd07a", dark: "#7d241a", skin: "#e2aa76", hair: "#d5b243", body: "#eaeef0" }, "3"],
      ["portrait-rally", { glow: "#ff9ac3", dark: "#792644", skin: "#efb8a8", hair: "#e46d91", body: "#edf3ef" }, "3"],
      ["portrait-repair", { glow: "#9df89e", dark: "#173d28", skin: "#dfae86", hair: "#9a6537", body: "#ecf3ee" }, "2"]
    ].forEach(([key, palette, label]) => {
      makeCanvasTexture(scene, key, 76, 76, (ctx) => drawPortrait(ctx, 76, 76, palette, label));
    });

    ["frost", "barrage", "rally", "repair", "pierce", "barrel", "squad"].forEach((type) => {
      const key = `skill-${type}`;
      if (!scene.textures.exists(key)) {
        makeCanvasTexture(scene, key, 72, 72, (ctx) => drawSkillIcon(ctx, 72, 72, type));
      }
    });
  }

  class BootScene extends Phaser.Scene {
    constructor() {
      super("BootScene");
    }

    preload() {
      this.load.image("bg-corridor", "assets/images/corridor-battlefield.png");
      this.load.image("title-keyart", "assets/images/title-keyart.png");
      this.load.image("ui-title-button", "assets/images/ui-title-button.png");
      this.load.image("skill-choice-backdrop", "assets/images/skill-choice-backdrop.png");
      this.load.image("shop-blackmarket", "assets/images/shop-blackmarket.png");
      this.load.image("premium-skill-card", "assets/images/premium-skill-card.png");
      this.load.image("character-a", "assets/images/character-a.png");
      this.load.image("character-b", "assets/images/character-b.png");
      this.load.image("character-c", "assets/images/character-c.png");
      this.load.image("character-d", "assets/images/character-d.png");
      this.load.image("character-e", "assets/images/character-e.png");
      this.load.image("avatar-pistol", "assets/images/avatar-pistol.png");
      this.load.image("avatar-bow", "assets/images/avatar-bow.png");
      this.load.image("avatar-rifle", "assets/images/avatar-rifle.png");
      this.load.image("avatar-rocket", "assets/images/avatar-rocket.png");
      this.load.image("avatar-sniper", "assets/images/avatar-sniper.png");
      this.load.image("projectile-arrow", "assets/images/projectile-arrow.png");
      this.load.image("projectile-pistol", "assets/images/projectile-pistol.png");
      this.load.image("projectile-rifle", "assets/images/projectile-rifle.png");
      this.load.image("projectile-rocket", "assets/images/projectile-rocket.png");
      this.load.image("projectile-sniper", "assets/images/projectile-sniper.png");
      this.load.image("muzzle-arrow", "assets/images/muzzle-arrow.png");
      this.load.image("muzzle-pistol", "assets/images/muzzle-pistol.png");
      this.load.image("muzzle-rifle", "assets/images/muzzle-rifle.png");
      this.load.image("muzzle-rocket", "assets/images/muzzle-rocket.png");
      this.load.image("muzzle-sniper", "assets/images/muzzle-sniper.png");
      this.load.image("skill-pierce", "assets/images/skill-pierce.png");
      this.load.image("skill-multishot", "assets/images/skill-multishot.png");
      this.load.image("skill-rally", "assets/images/skill-rally.png");
      this.load.image("skill-mark", "assets/images/skill-mark.png");
      this.load.image("skill-barrage", "assets/images/skill-barrage.png");
      this.load.image("skill-rocket", "assets/images/skill-rocket.png");
      this.load.image("skill-frost", "assets/images/skill-frost.png");
      this.load.image("skill-repair", "assets/images/skill-repair.png");
      this.load.image("skill-full-repair", "assets/images/skill-full-repair.png");
      this.load.image("skill-max-hp", "assets/images/skill-max-hp.png");
      this.load.image("skill-sniper", "assets/images/skill-sniper.png");
      this.load.image("skill-pistol-rapid", "assets/images/skill-pistol-rapid.png");
      this.load.image("skill-arrow-pin", "assets/images/skill-arrow-pin.png");
      this.load.image("skill-rifle-grenade", "assets/images/skill-rifle-grenade.png");
      this.load.image("skill-rocket-impact", "assets/images/skill-rocket-impact.png");
      this.load.image("skill-sniper-weakpoint", "assets/images/skill-sniper-weakpoint.png");
      this.load.image("zombie-hit-arrow", "assets/images/zombie-hit-arrow.png");
      this.load.image("zombie-hit-pistol", "assets/images/zombie-hit-pistol.png");
      this.load.image("zombie-hit-rifle", "assets/images/zombie-hit-rifle.png");
      this.load.image("zombie-hit-rocket", "assets/images/zombie-hit-rocket.png");
      this.load.image("zombie-hit-sniper", "assets/images/zombie-hit-sniper.png");
      this.load.image("barricade-impact", "assets/images/barricade-impact.png");
      this.load.image("zombie-death-small", "assets/images/zombie-death-small.png");
      this.load.image("zombie-death-normal", "assets/images/zombie-death-normal.png");
      this.load.image("zombie-death-elite", "assets/images/zombie-death-elite.png");
      this.load.image("zombie-walk", "assets/images/zombie-walk.png");
      this.load.image("zombie-walk-normal", "assets/images/zombie-walk-normal.png");
      this.load.image("zombie-walk-runner", "assets/images/zombie-walk-runner.png");
      this.load.image("zombie-walk-brute", "assets/images/zombie-walk-brute.png");
      this.load.image("zombie-walk-volatile", "assets/images/zombie-walk-volatile.png");
      this.load.image("zombie-walk-elite", "assets/images/zombie-walk-elite.png");
      this.load.image("ui-frame-sheet", "assets/images/ui-frame-sheet.png");
      this.load.image("skill-card-sheet", "assets/images/skill-card-sheet.png");
    }

    create() {
      const loading = document.querySelector(".loading");
      if (loading) {
        loading.remove();
      }
      createZombieSpriteTextures(this);
      createCharacterSpriteTextures(this);
      createCharacterBadgeTextures(this);
      createUiTextures(this);
      createTextures(this);
      this.scene.start("GameScene");
    }
  }

  class GameScene extends Phaser.Scene {
    constructor() {
      super("GameScene");
    }

    create() {
      window.__schoolZombieGame = this;
      this.bounds = {
        left: 40,
        right: 500,
        top: 70,
        autoEngageTop: 120,
        barricade: 704,
        survivorLine: 824,
        bottom: 920
      };

      this.zombies = [];
      this.bullets = [];
      this.defenders = [];
      this.overlayObjects = [];
      this.transientObjects = new Set();
      this.runTimers = new Set();
      this.sceneTimers = new Set();
      this.recruitedDefenders = new Set(["c"]);
      this.recruitOrder = ["c"];
      this.runId = 0;
      this.disposed = false;
      this.mode = "menu";
      this.elapsed = 0;
      this.stage = 1;
      this.level = 1;
      this.kills = 0;
      this.killsInLevel = 0;
      this.levelNeed = STARTING_LEVEL_NEED;
      this.spawnTimer = STARTING_SPAWN_TIMER;
      this.spawnBurst = 1;
      this.maxCoreHp = 3000;
      this.coreHp = this.maxCoreHp;
      this.morale = 100;
      this.coins = 0;
      this.meta = loadMetaSave();
      this.runCoinsBanked = false;
      this.shopSelectedCharacter = "c";
      this.shield = 0;
      this.damage = getTeamDamageForLevel(this.level);
      this.playerFireTimer = 0;
      this.focusPoint = null;
      this.audioCtx = null;
      this.masterGain = null;
      this.sfxBuffers = new Map();
      this.sfxPreloadStarted = false;
      this.bgmTracks = null;
      this.currentBgm = null;
      this.sfxLastPlayed = {};
      this.hitStopTimer = 0;
      this.speedMultiplier = 1;
      this.pausedByButton = false;

      this.events.once("shutdown", () => this.disposeScene());
      this.events.once("destroy", () => this.disposeScene());
      this.drawBackground();
      this.createCharacters();
      this.createHud();
      this.bindInput();
      this.showMenu();
      this.applyDebugLaunchFlags();
    }

    applyDebugLaunchFlags() {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("autostart") && !params.has("debugSkill") && !params.has("debugHorde")) {
        return;
      }

      this.scheduleSceneDelay(250, () => {
        if (this.mode === "menu") {
          this.startRun();
        }
        if (params.has("debugHorde")) {
          this.level = 12;
          this.stage = 3;
          this.levelNeed = 80;
          this.damage = 72;
          this.maxCoreHp = 3600;
          this.coreHp = 3000;
          for (let i = 0; i < 42; i += 1) {
            this.spawnZombie(i * 0.015);
          }
        }
        if (params.has("debugSkill")) {
          this.scheduleSceneDelay(550, () => {
            if (this.mode === "playing") {
              this.openSkillChoice();
            }
          });
        }
      });
    }

    drawBackground() {
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0d10).setDepth(0);
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "bg-corridor")
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setDepth(1);

      const atmosphere = this.add.graphics().setDepth(2);
      atmosphere.fillStyle(0x061015, 0.2);
      atmosphere.fillRect(0, 0, GAME_WIDTH, 96);
      atmosphere.fillStyle(0x061015, 0.34);
      atmosphere.fillRect(0, 870, GAME_WIDTH, 90);
      atmosphere.fillStyle(0x7bdce2, 0.08);
      atmosphere.fillRect(44, 76, 448, 548);
      atmosphere.lineStyle(3, 0xc4fbff, 0.26);
      atmosphere.strokeRect(52, 84, 436, 532);
    }

    drawCrack(graphics, x, y, scale) {
      graphics.lineStyle(4 * scale, 0x54606a, 0.55);
      graphics.lineBetween(x, y, x + 52 * scale, y + 20 * scale);
      graphics.lineBetween(x + 18 * scale, y + 8 * scale, x + 6 * scale, y + 42 * scale);
      graphics.lineBetween(x + 32 * scale, y + 14 * scale, x + 68 * scale, y - 25 * scale);
      graphics.lineBetween(x + 45 * scale, y + 18 * scale, x + 81 * scale, y + 48 * scale);
    }

    drawBlood(graphics, x, y, scale) {
      graphics.fillStyle(COLORS.blood, 0.38);
      graphics.fillCircle(x, y, 38 * scale);
      graphics.fillCircle(x + 24 * scale, y + 12 * scale, 20 * scale);
      graphics.fillCircle(x - 20 * scale, y + 20 * scale, 16 * scale);
      graphics.fillStyle(COLORS.blood, 0.24);
      graphics.fillCircle(x + 35 * scale, y - 21 * scale, 11 * scale);
      graphics.fillCircle(x - 31 * scale, y - 13 * scale, 8 * scale);
    }

    drawBarricade() {
      const pieces = [
        [104, 735, 112, 38, -0.13, 0x7e5847],
        [205, 747, 145, 44, 0.08, 0x6c4d42],
        [329, 737, 121, 42, -0.06, 0x81604e],
        [428, 747, 120, 43, 0.11, 0x785341],
        [142, 792, 93, 35, 0.22, 0x3f4d5a],
        [382, 793, 100, 36, -0.18, 0x465868]
      ];
      pieces.forEach(([x, y, w, h, rot, color]) => {
        this.add.rectangle(x, y, w, h, color).setRotation(rot).setStrokeStyle(3, 0x241b18, 0.8).setDepth(22);
      });
      this.add.rectangle(270, 768, 500, 12, 0x241817).setAlpha(0.7).setDepth(23);
      this.add.rectangle(270, 808, 500, 2, 0xf4f4e8).setAlpha(0.5).setDepth(24);
    }

    createCharacters() {
      DEFENDER_ROSTER.forEach((defender) => {
        const recruited = this.recruitedDefenders.has(defender.id);
        const fireRate = defender.rate * CHARACTER_FIRE_COOLDOWN_MULTIPLIER;
        const sprite = this.add.image(defender.x, defender.y, `character-${defender.id}-aim-12`)
          .setOrigin(0.5, 1)
          .setDepth(142 + defender.y / 10);
        this.fitSpriteHeight(sprite, defender.height);
        sprite.setVisible(recruited).setAlpha(recruited ? 1 : 0);
        this.defenders.push({
          x: defender.x,
          y: defender.y,
          baseX: defender.x,
          baseY: defender.y,
          height: defender.height,
          aim: defender.aim,
          pose: "aim-12",
          firePoseTimer: 0,
          id: defender.id,
          sprite,
          role: defender.role,
          rate: fireRate,
          baseRate: fireRate,
          recruited,
          damageBoost: 1,
          pierce: defender.pierce || 0,
          basePierce: defender.pierce || 0,
          critChance: defender.critChance || BASE_CRIT_CHANCE,
          baseCritChance: defender.critChance || BASE_CRIT_CHANCE,
          critMultiplier: defender.critMultiplier || DEFAULT_CRIT_MULTIPLIER,
          baseCritMultiplier: defender.critMultiplier || DEFAULT_CRIT_MULTIPLIER,
          rocketEvery: 0,
          shotsSinceRocket: 0,
          burstCount: defender.burstCount || 1,
          baseBurstCount: defender.burstCount || 1,
          burstDelay: defender.burstDelay || 0,
          baseBurstDelay: defender.burstDelay || 0,
          splashRadius: defender.splashRadius || 0,
          splashDamageScale: defender.splashDamageScale || 0,
          splashRadiusBoost: 1,
          splashDamageBoost: 1,
          markDuration: defender.markDuration || 0,
          baseMarkDuration: defender.markDuration || 0,
          markDamageBonus: defender.markDamageBonus || 0,
          baseMarkDamageBonus: defender.markDamageBonus || 0,
          slowDuration: defender.slowDuration || 0,
          baseSlowDuration: defender.slowDuration || 0,
          timer: rand(0.15, fireRate),
          damageScale: defender.damageScale,
          projectile: defender.projectile,
          speed: defender.speed
        });
      });
    }

    getDefenderFormationOrder() {
      const order = ["c"];
      (this.recruitOrder || []).forEach((id) => {
        if (id !== "c" && this.recruitedDefenders.has(id) && !order.includes(id)) {
          order.push(id);
        }
      });
      this.defenders.forEach((defender) => {
        if (defender.recruited && defender.role !== "player" && !order.includes(defender.id)) {
          order.push(defender.id);
        }
      });
      return order;
    }

    syncDefenderFormation() {
      this.getDefenderFormationOrder().forEach((id, index) => {
        const defender = this.getDefenderById(id);
        if (!defender) {
          return;
        }
        const slot = DEFENDER_FORMATION_SLOTS[index] || { x: defender.baseX, y: defender.baseY };
        defender.x = slot.x;
        defender.y = slot.y;
        if (defender.sprite) {
          defender.sprite.setX(slot.x).setDepth(142 + slot.y / 10);
          if (!defender.sprite.visible || defender.sprite.alpha >= 1) {
            defender.sprite.setY(slot.y);
          }
        }
      });
    }

    setDefenderRecruited(id, recruited, animate = false) {
      const defender = this.defenders.find((item) => item.id === id);
      if (!defender) {
        return;
      }

      defender.recruited = recruited;
      if (recruited) {
        if (!this.recruitOrder) {
          this.recruitOrder = ["c"];
        }
        if (!this.recruitOrder.includes(id)) {
          this.recruitOrder.push(id);
        }
        this.recruitedDefenders.add(id);
        this.syncDefenderFormation();
        defender.sprite.setVisible(true).clearTint();
        this.setDefenderPose(defender, "aim-12");
        if (animate) {
          defender.sprite.setAlpha(0).setY(defender.y + 46);
          this.tweens.add({
            targets: defender.sprite,
            y: defender.y,
            alpha: 1,
            duration: 460,
            ease: "Back.easeOut"
          });
          const ring = this.trackTransient(this.add.circle(defender.x, defender.y - defender.height * 0.48, 26, 0xffffff, 0)
            .setStrokeStyle(4, COLORS.gold, 0.9)
            .setDepth(230));
          this.tweens.add({
            targets: ring,
            scale: 2.2,
            alpha: 0,
            duration: 560,
            ease: "Cubic.easeOut",
            onComplete: () => this.destroyTransientObject(ring, false)
          });
        } else {
          defender.sprite.setAlpha(1).setY(defender.y);
        }
      } else {
        this.recruitedDefenders.delete(id);
        if (this.recruitOrder) {
          this.recruitOrder = this.recruitOrder.filter((orderId) => id === "c" || orderId !== id);
        }
        this.syncDefenderFormation();
        defender.sprite.setVisible(false).setAlpha(0).setY(defender.y);
      }
    }

    recruitDefender(id) {
      const roster = DEFENDER_ROSTER.find((item) => item.id === id);
      if (!roster || this.recruitedDefenders.has(id)) {
        return;
      }
      this.setDefenderRecruited(id, true, true);
      this.createScreenPulse(SKILL_ACCENTS[`recruit-${id}`] || COLORS.gold);
    }

    getRecruitUpgrades() {
      return DEFENDER_ROSTER
        .filter((defender) => defender.role !== "player" && !this.recruitedDefenders.has(defender.id))
        .map((defender) => ({
          id: `recruit-${defender.id}`,
          icon: defender.recruit.icon,
          characterTexture: `character-${defender.id}-idle`,
          tag: defender.recruit.tag,
          title: defender.recruit.title,
          desc: defender.recruit.desc,
          stat: "전투 인원 +1",
          accent: SKILL_ACCENTS[`recruit-${defender.id}`],
          accentHex: SKILL_ACCENT_HEX[`recruit-${defender.id}`],
          toast: `${defender.recruit.title} 완료`,
          apply: () => this.recruitDefender(defender.id)
        }));
    }

    fitSpriteHeight(sprite, height) {
      const texture = sprite.texture.getSourceImage();
      const ratio = texture.width / texture.height;
      sprite.setDisplaySize(height * ratio, height);
    }

    setDefenderPose(defender, pose) {
      if (!defender.sprite || defender.pose === pose) {
        return;
      }
      defender.pose = pose;
      defender.sprite.setTexture(`character-${defender.id}-${pose}`);
      this.fitSpriteHeight(defender.sprite, defender.height);
    }

    getAttackPose(defender, target) {
      const pivot = defender.aim?.pivot || [0, -160];
      const angle = Math.atan2(target.y - (defender.y + pivot[1]), target.x - (defender.x + pivot[0]));
      return getNearestAimPose(angle).key;
    }

    getDefenderMuzzle(defender, pose) {
      const aim = defender.aim || { pivot: [0, -160], reach: 84 };
      const poseInfo = getAimPose(pose);
      return {
        x: defender.x + aim.pivot[0] + Math.cos(poseInfo.angle) * aim.reach,
        y: defender.y + aim.pivot[1] + Math.sin(poseInfo.angle) * aim.reach
      };
    }

    createHud() {
      this.ui = {};
      this.add.image(270, 41, "ui-top-hud").setDisplaySize(530, 72).setDepth(300);
      this.progressBack = this.add.rectangle(270, 75, 508, 6, 0x030404, 0.82).setOrigin(0.5).setDepth(302);
      this.progressBar = this.add.rectangle(16, 75, 1, 6, COLORS.gold, 1).setOrigin(0, 0.5).setDepth(303);

      this.ui.timer = this.add.text(82, 42, "00:00", {
        fontFamily: "Arial, sans-serif",
        fontSize: 21,
        fontStyle: "900",
        color: "#f4fbff",
        stroke: "#0c1115",
        strokeThickness: 4
      }).setOrigin(0, 0.5).setDepth(316);
      this.ui.stage = this.add.text(270, 37, "St. 1 - 교문", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 28,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#1a2228",
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(316);
      this.ui.level = this.add.text(270, 65, "Lv.1", {
        fontFamily: "Arial, sans-serif",
        fontSize: 17,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#1a2228",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(316);

      this.createStatusPanel();
    }

    createStatusPanel() {
      const statStyle = {
        fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 3
      };
      this.ui.morale = this.add.text(378, 65, "M100%", {
        ...statStyle,
        color: "#4dff67"
      }).setOrigin(0, 0.5).setDepth(316);
      this.ui.coins = this.add.text(445, 65, "$0", {
        ...statStyle,
        color: "#ffd75c"
      }).setOrigin(0, 0.5).setDepth(316);
      this.ui.shield = this.add.text(445, 84, "S0", {
        ...statStyle,
        color: "#62c7ff"
      }).setOrigin(0, 0.5).setDepth(316);
      this.add.rectangle(270, 918, 220, 24, 0x050709, 0.68).setStrokeStyle(1, 0xffffff, 0.14).setDepth(316);
      this.ui.core = this.add.text(270, 918, "HP 3000 / 3000", {
        ...statStyle,
        fontSize: 15
      }).setOrigin(0.5).setDepth(317);
      this.coreBack = this.add.rectangle(270, 940, 330, 8, 0x000000, 0.78).setStrokeStyle(1, 0xffffff, 0.18).setDepth(316);
      this.coreBar = this.add.rectangle(105, 940, 330, 6, COLORS.green, 1).setOrigin(0, 0.5).setDepth(317);
    }

    bindInput() {
      this.input.on("pointerdown", () => {
        this.unlockAudio();
        if (this.mode === "playing") {
          this.startBgm("game");
          return;
        }
        if (this.mode === "menu" || this.mode === "shop" || this.mode === "gameover") {
          this.startBgm("menu");
        }
      });
    }

    scheduleSceneDelay(delayMs, callback) {
      let event = null;
      event = this.time.delayedCall(delayMs, () => {
        this.sceneTimers.delete(event);
        if (this.disposed) {
          return;
        }
        callback();
      });
      this.sceneTimers.add(event);
      return event;
    }

    scheduleRunDelay(delayMs, callback) {
      const runId = this.runId;
      let event = null;
      event = this.time.delayedCall(delayMs, () => {
        this.runTimers.delete(event);
        if (this.disposed || runId !== this.runId || this.mode !== "playing") {
          return;
        }
        callback();
      });
      this.runTimers.add(event);
      return event;
    }

    cancelTimerEvent(event) {
      if (!event) {
        return;
      }
      if (typeof event.remove === "function") {
        event.remove(false);
      } else if (this.time && typeof this.time.removeEvent === "function") {
        this.time.removeEvent(event);
      } else if (typeof event.destroy === "function") {
        event.destroy();
      }
    }

    cancelTimerSet(timers) {
      timers.forEach((event) => this.cancelTimerEvent(event));
      timers.clear();
    }

    cancelRunTimers() {
      this.cancelTimerSet(this.runTimers);
    }

    cancelSceneTimers() {
      this.cancelTimerSet(this.sceneTimers);
    }

    trackTransient(object) {
      if (object) {
        this.transientObjects.add(object);
      }
      return object;
    }

    destroyGameObject(object, killTweens = true) {
      if (!object) {
        return;
      }
      if (killTweens && this.tweens && typeof this.tweens.killTweensOf === "function") {
        this.tweens.killTweensOf(object);
      }
      if (typeof object.removeAllListeners === "function") {
        object.removeAllListeners();
      }
      if (typeof object.destroy === "function" && !object.destroyed) {
        object.destroy();
      }
    }

    destroyTransientObject(object, killTweens = true) {
      this.transientObjects.delete(object);
      this.destroyGameObject(object, killTweens);
    }

    clearTransientObjects() {
      Array.from(this.transientObjects).forEach((object) => this.destroyTransientObject(object));
      this.transientObjects.clear();
    }

    clearRunEntities() {
      this.zombies.forEach((zombie) => {
        this.clearWeakMark(zombie);
        this.destroyGameObject(zombie);
      });
      this.bullets.forEach((bullet) => this.destroyGameObject(bullet.sprite));
      this.zombies = [];
      this.bullets = [];
    }

    cleanupAudio() {
      if (this.bgmTracks) {
        Object.values(this.bgmTracks).forEach((track) => {
          track.pause();
          track.removeAttribute("src");
          if (typeof track.load === "function") {
            track.load();
          }
        });
      }
      this.bgmTracks = null;
      this.currentBgm = null;
      this.sfxBuffers.clear();
      if (this.masterGain && typeof this.masterGain.disconnect === "function") {
        this.masterGain.disconnect();
      }
      this.masterGain = null;
      if (this.audioCtx && typeof this.audioCtx.close === "function") {
        this.audioCtx.close().catch(() => {});
      }
      this.audioCtx = null;
      this.sfxPreloadStarted = false;
    }

    disposeScene() {
      if (this.disposed) {
        return;
      }
      this.disposed = true;
      this.cancelRunTimers();
      this.cancelSceneTimers();
      this.clearOverlay();
      this.clearTransientObjects();
      this.clearRunEntities();
      this.defenders.forEach((defender) => this.destroyGameObject(defender.sprite));
      this.defenders = [];
      this.cleanupAudio();
      if (window.__schoolZombieGame === this) {
        window.__schoolZombieGame = null;
      }
    }

    unlockAudio() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return null;
      }
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = SFX_MASTER_VOLUME;
        this.masterGain.connect(this.audioCtx.destination);
      }
      this.preloadSfxAssets();
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }

    preloadSfxAssets() {
      if (!this.audioCtx || this.sfxPreloadStarted) {
        return;
      }
      this.sfxPreloadStarted = true;
      Object.entries(SFX_ASSETS).forEach(([name, url]) => {
        fetch(url)
          .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`sfx ${response.status}`)))
          .then((data) => this.audioCtx.decodeAudioData(data))
          .then((buffer) => this.sfxBuffers.set(name, buffer))
          .catch(() => {});
      });
    }

    ensureBgmTracks() {
      if (this.bgmTracks) {
        return;
      }
      this.bgmTracks = {};
      Object.entries(BGM_ASSETS).forEach(([name, url]) => {
        const track = new Audio(url);
        track.loop = true;
        track.preload = "auto";
        track.volume = BGM_VOLUME;
        this.bgmTracks[name] = track;
      });
    }

    startBgm(name) {
      this.ensureBgmTracks();
      const next = this.bgmTracks?.[name];
      if (!next) {
        return;
      }
      Object.entries(this.bgmTracks).forEach(([trackName, track]) => {
        if (trackName !== name) {
          track.pause();
        }
      });
      if (this.currentBgm === name && !next.paused) {
        return;
      }
      this.currentBgm = name;
      next.volume = BGM_VOLUME;
      const playPromise = next.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {});
      }
    }

    playSampleSfx(name, intensity = 1) {
      const ctx = this.audioCtx;
      const buffer = this.sfxBuffers.get(name);
      if (!ctx || !this.masterGain || !buffer) {
        return false;
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = clamp(0.72 * intensity, 0.05, 1.45);
      source.connect(gain).connect(this.masterGain);
      source.start(ctx.currentTime);
      return true;
    }

    playSfx(name, intensity = 1) {
      const ctx = this.unlockAudio();
      if (!ctx) {
        return;
      }
      if (!this.sfxBuffers.has(name)) {
        return;
      }
      const minGap = {
        hit: 0.045,
        crit: 0.05,
        death: 0.075,
        explosion: 0.12,
        core: 0.16,
        pistol: 0.035,
        rifle: 0.032,
        sniper: 0.08,
        rocket: 0.12,
        arrow: 0.06,
        skill: 0.18
      }[name] || 0.04;
      const last = this.sfxLastPlayed[name] || 0;
      if (ctx.currentTime - last < minGap) {
        return;
      }
      this.sfxLastPlayed[name] = ctx.currentTime;
      this.playSampleSfx(name, intensity);
    }

    playWeaponSfx(projectile) {
      const map = {
        "projectile-arrow": "arrow",
        "projectile-pistol": "pistol",
        "projectile-rifle": "rifle",
        "projectile-sniper": "sniper",
        "projectile-rocket": "rocket"
      };
      this.playSfx(map[projectile] || "pistol");
    }

    shakeCamera(duration = 70, intensity = 0.004) {
      const camera = this.cameras?.main;
      if (camera && camera.shake) {
        camera.shake(duration, intensity);
      }
    }

    vibrateImpact(pattern = [60, 28, 80]) {
      const vibrate = window.navigator?.vibrate;
      if (typeof vibrate === "function") {
        vibrate.call(window.navigator, pattern);
      }
    }

    requestHitStop(duration = 0.025) {
      this.hitStopTimer = Math.max(this.hitStopTimer || 0, clamp(duration, 0, 0.055));
    }

    restoreZombieTint(zombie) {
      if (!zombie || !zombie.active) {
        return;
      }
      if (zombie.slowTimer > 0) {
        zombie.setTint(0x99f4ff);
      } else if (zombie.baseTint) {
        zombie.setTint(zombie.baseTint);
      } else {
        zombie.clearTint();
      }
    }

    applyZombieKnockback(zombie, hitType, crit = false) {
      if (!zombie || !zombie.active) {
        return;
      }
      const base = hitType === "explosion" || hitType === "projectile-rocket"
        ? 18
        : hitType === "projectile-sniper"
          ? 12
          : crit
            ? 9
            : 5;
      const amount = base * (zombie.knockbackScale || 1);
      zombie.y = Math.max(-48, zombie.y - amount);
      zombie.x = clamp(zombie.x + rand(-amount * 0.34, amount * 0.34), this.bounds.left, this.bounds.right);
    }

    addOverlayButton(x, y, width, height, label, depth, onClick, accent = COLORS.gold) {
      if (width >= 150 && this.textures.exists("ui-title-button")) {
        return this.addPremiumOverlayButton(x, y, width, height, label, depth, onClick, accent);
      }

      const shadow = this.add.rectangle(x, y + 7, width, height, 0x000000, 0.35).setDepth(depth);
      const outer = this.add.rectangle(x, y, width, height, accent, 0.95)
        .setStrokeStyle(2, 0xffffff, 0.55)
        .setDepth(depth + 0.1);
      const inner = this.add.rectangle(x, y, width - 12, height - 12, 0x111820, 0.86)
        .setStrokeStyle(1, accent, 0.65)
        .setDepth(depth + 0.2);
      const text = this.add.text(x, y, label, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 24,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#090b0d",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(depth + 0.3);

      [outer, inner, text].forEach((item) => {
        item.setInteractive({ useHandCursor: true });
        item.on("pointerdown", () => {
          this.unlockAudio();
          onClick();
        });
        item.on("pointerover", () => {
          outer.setAlpha(1);
          inner.setFillStyle(0x1f2b32, 0.95);
        });
        item.on("pointerout", () => {
          outer.setAlpha(0.95);
          inner.setFillStyle(0x111820, 0.86);
        });
      });

      this.overlayObjects.push(shadow, outer, inner, text);
      return { shadow, outer, inner, text };
    }

    addPremiumOverlayButton(x, y, width, height, label, depth, onClick, accent = COLORS.gold) {
      const isBlue = accent === COLORS.blue;
      const shadow = this.add.ellipse(x, y + Math.max(8, height * 0.16), width * 0.86, height * 0.5, 0x000000, 0.46)
        .setDepth(depth);
      const glow = this.add.image(x, y, "ui-title-button")
        .setDisplaySize(width + 14, height + 12)
        .setTint(isBlue ? COLORS.blue : COLORS.gold)
        .setAlpha(isBlue ? 0.16 : 0.13)
        .setDepth(depth + 0.05);
      const plate = this.add.image(x, y, "ui-title-button")
        .setDisplaySize(width, height)
        .setDepth(depth + 0.1);
      const shine = this.add.rectangle(x, y - height * 0.28, width * 0.76, Math.max(2, height * 0.05), 0xffffff, 0.2)
        .setDepth(depth + 0.2);
      const text = this.add.text(x, y - 1, label, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: Math.max(20, Math.round(height * 0.45)),
        fontStyle: "900",
        color: isBlue ? "#e8fbff" : "#fff8dc",
        stroke: "#050607",
        strokeThickness: Math.max(4, Math.round(height * 0.09))
      }).setOrigin(0.5).setDepth(depth + 0.3);
      text.setShadow(0, 3, "#000000", 8, true, true);

      const hit = this.add.rectangle(x, y, width, height, 0xffffff, 0)
        .setDepth(depth + 0.4)
        .setInteractive({ useHandCursor: true });
      const setHover = (hovered) => {
        plate.setDisplaySize(width * (hovered ? 1.018 : 1), height * (hovered ? 1.018 : 1));
        glow.setDisplaySize(width * (hovered ? 1.06 : 1) + 14, height * (hovered ? 1.06 : 1) + 12);
        text.setScale(hovered ? 1.025 : 1);
        glow.setAlpha(hovered ? 0.25 : isBlue ? 0.14 : 0.12);
        shine.setAlpha(hovered ? 0.32 : 0.2);
      };
      [hit, plate, text].forEach((item) => {
        item.setInteractive({ useHandCursor: true });
        item.on("pointerdown", () => {
          this.unlockAudio();
          onClick();
        });
        item.on("pointerover", () => setHover(true));
        item.on("pointerout", () => setHover(false));
      });

      this.overlayObjects.push(shadow, glow, plate, shine, text, hit);
      return { shadow, glow, plate, shine, text, hit };
    }

    showToast(message, color = COLORS.gold) {
      const panel = this.trackTransient(this.add.rectangle(270, 158, 330, 48, 0x0b1014, 0.88)
        .setStrokeStyle(2, color, 0.9)
        .setDepth(430));
      const text = this.trackTransient(this.add.text(270, 158, message, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 20,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(431));

      this.tweens.add({
        targets: [panel, text],
        y: "-=18",
        alpha: 0,
        delay: 720,
        duration: 420,
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.destroyTransientObject(panel, false);
          this.destroyTransientObject(text, false);
        }
      });
    }

    showMenu() {
      this.clearOverlay();
      this.mode = "menu";
      this.startBgm("menu");
      this.meta = loadMetaSave();
      const items = this.overlayObjects;
      const titleArt = this.add.image(270, 480, "title-keyart").setDepth(500);
      const source = titleArt.texture.getSourceImage();
      const ratio = source.width / source.height;
      titleArt.setDisplaySize(Math.max(GAME_WIDTH, GAME_HEIGHT * ratio), Math.max(GAME_HEIGHT, GAME_WIDTH / ratio));
      items.push(titleArt);
      items.push(this.add.rectangle(270, 118, 540, 236, 0x020304, 0.56).setDepth(501));
      items.push(this.add.rectangle(270, 842, 540, 244, 0x020304, 0.7).setDepth(501));
      items.push(this.add.rectangle(270, 208, 430, 2, 0xffd86b, 0.75).setDepth(502));
      items.push(this.add.rectangle(270, 666, 540, 4, 0x57e5ff, 0.18).setDepth(502));
      this.addOverlayButton(270, 34, 244, 40, "ArcherLab 이동", 530, () => {
        window.location.href = "https://game.archerlab.dev/";
      }, COLORS.gold);
      const eyebrow = this.add.text(270, 72, "SCHOOL UNDEAD", {
        fontFamily: "Arial, sans-serif",
        fontSize: 15,
        fontStyle: "900",
        color: "#ffdf7a",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(504);
      eyebrow.setShadow(0, 2, "#000000", 8, true, true);
      items.push(eyebrow);
      const title = this.add.text(270, 126, "스쿨 언데드 디펜스", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 39,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#030607",
        strokeThickness: 8
      }).setOrigin(0.5).setDepth(504);
      title.setShadow(0, 5, "#000000", 10, true, true);
      items.push(title);
      const subtitle = this.add.text(270, 174, "무너진 복도, 마지막 방어선", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 16,
        fontStyle: "900",
        color: "#d9eef0",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(504);
      subtitle.setShadow(0, 3, "#000000", 7, true, true);
      items.push(subtitle);
      items.push(this.add.rectangle(270, 708, 262, 36, 0x05080a, 0.78).setStrokeStyle(1, 0xe7bb54, 0.58).setDepth(526));
      items.push(this.add.text(270, 708, `보유 코인 $${this.meta.coins}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: 16,
        fontStyle: "900",
        color: "#ffd86b",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(527));
      this.addOverlayButton(270, 790, 390, 72, "출격", 530, () => this.startRun(), COLORS.gold);
      this.addOverlayButton(270, 874, 390, 72, "상점", 530, () => this.showShop(), COLORS.blue);
    }

    showShop(selectedId = this.shopSelectedCharacter || "c") {
      this.clearOverlay();
      this.mode = "shop";
      this.startBgm("menu");
      this.meta = loadMetaSave();
      const selectedCharacter = SHOP_CHARACTERS.find((character) => character.id === selectedId) || SHOP_CHARACTERS[0];
      this.shopSelectedCharacter = selectedCharacter.id;
      const items = this.overlayObjects;
      items.push(this.add.image(270, 480, "shop-blackmarket").setDisplaySize(540, 960).setDepth(500));
      items.push(this.add.rectangle(270, 480, 540, 960, 0x020304, 0.26).setDepth(501));
      items.push(this.add.rectangle(270, 94, 430, 86, 0x070c10, 0.78).setStrokeStyle(2, 0xe7bb54, 0.72).setDepth(502));
      items.push(this.add.rectangle(270, 48, 320, 4, 0xffd86b, 0.9).setDepth(503));
      items.push(this.add.text(270, 78, "암시장 상점", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 34,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(504));
      items.push(this.add.text(270, 118, `보유 코인 $${this.meta.coins}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffd86b",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(504));

      items.push(this.add.text(270, 330, "정비할 장비 선택", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(521));
      SHOP_CHARACTERS.forEach((character, index) => {
        this.addShopCharacterButton(character, 62 + index * 104, 402, character.id === selectedCharacter.id);
      });
      items.push(this.add.rectangle(270, 490, 430, 44, 0x071015, 0.78).setStrokeStyle(1, selectedCharacter.accent, 0.58).setDepth(520));
      items.push(this.add.text(270, 490, `${selectedCharacter.name} · ${selectedCharacter.weapon} 정비`, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 20,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(521));
      this.getCharacterShopUpgrades(selectedCharacter.id).forEach((upgrade, index) => this.addShopUpgradeCard(upgrade, selectedCharacter, 270, 566 + index * 104));
      this.addOverlayButton(142, 890, 172, 50, "뒤로", 560, () => this.showMenu(), COLORS.gold);
      this.addOverlayButton(398, 890, 172, 50, "출격", 560, () => this.startRun(), COLORS.blue);
    }

    addShopCharacterButton(character, x, y, selected) {
      const accent = character.accent || COLORS.gold;
      const objects = [];
      objects.push(this.add.rectangle(x, y, 92, 104, selected ? 0x10202a : 0x071015, selected ? 0.88 : 0.72)
        .setStrokeStyle(selected ? 3 : 1, accent, selected ? 0.95 : 0.42)
        .setDepth(522));
      objects.push(this.add.circle(x, y - 19, 32, 0x020406, 0.78).setStrokeStyle(2, accent, selected ? 0.95 : 0.55).setDepth(523));
      objects.push(this.add.image(x, y - 19, character.portrait).setDisplaySize(58, 58).setDepth(524));
      objects.push(this.add.text(x, y + 29, character.weapon, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 12,
        fontStyle: "900",
        color: selected ? "#ffffff" : "#d5e4e7",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(524));
      objects.push(this.add.text(x, y + 47, this.getCharacterTotalUpgradeLevel(character.id), {
        fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fontStyle: "900",
        color: "#ffd86b",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(524));
      const hit = this.add.rectangle(x, y, 94, 106, 0x000000, 0).setDepth(526);
      hit.setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.showShop(character.id));
      [...objects, hit].forEach((item) => this.overlayObjects.push(item));
    }

    getCharacterShopUpgrades(characterId) {
      return SHOP_CHARACTER_UPGRADES[characterId] || [];
    }

    getCharacterTotalUpgradeLevel(characterId) {
      const total = this.getCharacterShopUpgrades(characterId)
        .reduce((sum, upgrade) => sum + this.getMetaUpgradeLevel(upgrade.id), 0);
      return `합계 Lv.${total}`;
    }

    getMetaUpgradeLevel(id) {
      return clamp(Math.floor(Number(this.meta?.upgrades?.[id]) || 0), 0, SHOP_MAX_LEVEL);
    }

    getShopUpgradeEffectLine(id, level) {
      const percent = (value) => `${Math.round(value * 10) / 10}%`;
      if (id === "c_power") return `피해 +${percent(level * 2.2)}`;
      if (id === "c_speed") return `공격 간격 -${percent(level * 0.9)}`;
      if (id === "c_crit") return `치명 +${percent(level * 0.6)} · 치명피해 +${percent(level * 1)}`;
      if (id === "a_power") return `피해 +${percent(level * 2)}`;
      if (id === "a_mark") return `표식 피해 +${percent(level * 0.6)} · 지속 +${(level * 0.06).toFixed(2)}초`;
      if (id === "a_crit") return `치명 +${percent(level * 0.7)} · 치명피해 +${percent(level * 1)}`;
      if (id === "b_power") return `피해 +${percent(level * 2)}`;
      if (id === "b_control") return `연발 간격 -${percent(level * 1)} · 사격 간격 -${percent(level * 0.4)}`;
      if (id === "b_grenade") {
        return level <= 0 ? "유탄 없음" : `유탄 ${Math.max(6, 10 - Math.floor(level * 0.4))}발마다`;
      }
      if (id === "d_charge") return `직격 피해 +${percent(level * 2.4)}`;
      if (id === "d_radius") return `폭발 반경 +${percent(level * 1.3)} · 폭발 피해 +${percent(level * 1)}`;
      if (id === "d_slow") return `둔화 +${(level * 0.09).toFixed(2)}초`;
      if (id === "e_power") return `피해 +${percent(level * 2.3)}`;
      if (id === "e_focus") return `치명 +${percent(level * 0.6)} · 치명피해 +${percent(level * 2.5)}`;
      if (id === "e_pierce") {
        return `관통 +${Math.floor(level / 5)} · 피해 +${percent(level * 0.8)}`;
      }
      return `강화 +${percent(level * 2)}`;
    }

    getShopUpgradeStatText(upgrade, level) {
      if (level >= SHOP_MAX_LEVEL) {
        return `${this.getShopUpgradeEffectLine(upgrade.id, level)}\n최대 강화 완료`;
      }
      return `${this.getShopUpgradeEffectLine(upgrade.id, level)}\n다음: ${this.getShopUpgradeEffectLine(upgrade.id, level + 1)}`;
    }

    addShopUpgradeCard(upgrade, character, x, y) {
      const level = this.getMetaUpgradeLevel(upgrade.id);
      const cost = getShopUpgradeCost(level);
      const maxed = level >= SHOP_MAX_LEVEL;
      const canAfford = this.meta.coins >= cost;
      const accent = character.accent || COLORS.gold;
      const objects = [];
      objects.push(this.add.rectangle(x, y, 468, 100, 0x071015, 0.78).setStrokeStyle(2, accent, 0.55).setDepth(520));
      objects.push(this.add.rectangle(x, y + 43, 444, 1, accent, 0.22).setDepth(521));
      objects.push(this.add.circle(x - 198, y - 16, 40, 0x020406, 0.78).setStrokeStyle(2, accent, 0.75).setDepth(522));
      objects.push(this.add.image(x - 198, y - 16, upgrade.icon).setDisplaySize(64, 64).setDepth(523));
      objects.push(this.add.text(x - 144, y - 34, upgrade.title, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0, 0.5).setDepth(523));
      objects.push(this.add.text(x - 144, y - 14, upgrade.subtitle, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 11,
        fontStyle: "900",
        color: "#d6e9ed",
        stroke: "#050607",
        strokeThickness: 3,
        wordWrap: { width: 228, useAdvancedWrap: true }
      }).setOrigin(0, 0.5).setDepth(523));
      objects.push(this.add.text(x - 144, y + 4, upgrade.part || "정비 부품", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 11,
        fontStyle: "800",
        color: "#b8c8cc",
        stroke: "#050607",
        strokeThickness: 3,
        wordWrap: { width: 228, useAdvancedWrap: true }
      }).setOrigin(0, 0.5).setDepth(523));
      objects.push(this.add.text(x - 144, y + 29, this.getShopUpgradeStatText(upgrade, level), {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 11,
        fontStyle: "900",
        color: "#ffd86b",
        align: "left",
        lineSpacing: 2,
        wordWrap: { width: 228, useAdvancedWrap: true }
      }).setOrigin(0, 0.5).setDepth(523));
      objects.push(this.add.text(x + 158, y - 34, `Lv.${level}/${SHOP_MAX_LEVEL}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(523));
      for (let i = 0; i < SHOP_MAX_LEVEL; i += 1) {
        objects.push(this.add.rectangle(x + 96 + i * 12, y - 12, 8, 16, i < level ? accent : 0x15222b, i < level ? 0.95 : 0.72)
          .setStrokeStyle(1, 0x000000, 0.35)
          .setDepth(523));
      }
      this.overlayObjects.push(...objects);
      const label = maxed ? "MAX" : `$${cost}`;
      this.addOverlayButton(x + 154, y + 27, 112, 34, label, 524, () => this.buyShopUpgrade(upgrade.id), maxed ? 0x5b646b : canAfford ? COLORS.gold : 0x6f3333);
    }

    buyShopUpgrade(id) {
      const character = SHOP_CHARACTERS.find((item) => this.getCharacterShopUpgrades(item.id).some((upgrade) => upgrade.id === id));
      const upgrade = character ? this.getCharacterShopUpgrades(character.id).find((item) => item.id === id) : null;
      if (!upgrade) {
        return;
      }
      this.unlockAudio();
      this.meta = loadMetaSave();
      const level = this.getMetaUpgradeLevel(id);
      if (level >= SHOP_MAX_LEVEL) {
        this.showToast("이미 최대 강화입니다", COLORS.gold);
        return;
      }
      const cost = getShopUpgradeCost(level);
      if (this.meta.coins < cost) {
        this.playSfx("core", 0.65);
        this.showToast("코인이 부족합니다", COLORS.red);
        return;
      }
      this.meta.coins -= cost;
      this.meta.upgrades[id] = level + 1;
      this.saveMeta();
      this.playSfx("skill");
      this.showShop(character.id);
      this.showToast(`${upgrade.title} Lv.${level + 1}`, character.accent);
    }

    saveMeta() {
      this.meta = normalizeMetaSave(this.meta);
      saveMetaSave(this.meta);
    }

    startRun() {
      this.unlockAudio();
      this.playSfx("start");
      this.startBgm("game");
      this.clearOverlay();
      this.resetRun();
      this.mode = "playing";
    }

    bankRunCoins() {
      if (this.runCoinsBanked || this.coins <= 0) {
        return 0;
      }
      const earned = Math.floor(this.coins);
      this.meta = loadMetaSave();
      this.meta.coins += earned;
      this.runCoinsBanked = true;
      this.saveMeta();
      return earned;
    }

    applyMetaUpgrades() {
      this.meta = loadMetaSave();
      this.defenders.forEach((defender) => {
        if (defender.id === "c") {
          const power = this.getMetaUpgradeLevel("c_power");
          const speed = this.getMetaUpgradeLevel("c_speed");
          const crit = this.getMetaUpgradeLevel("c_crit");
          defender.damageBoost *= 1 + power * 0.022;
          defender.rate *= Math.max(0.9, 1 - speed * 0.009);
          defender.critChance = Math.min(0.72, defender.critChance + crit * 0.006);
          defender.critMultiplier += crit * 0.01;
        } else if (defender.id === "a") {
          const power = this.getMetaUpgradeLevel("a_power");
          const mark = this.getMetaUpgradeLevel("a_mark");
          const crit = this.getMetaUpgradeLevel("a_crit");
          defender.damageBoost *= 1 + power * 0.02;
          defender.markDamageBonus += mark * 0.006;
          defender.markDuration += mark * 0.06;
          defender.critChance = Math.min(0.72, defender.critChance + crit * 0.007);
          defender.critMultiplier += crit * 0.01;
        } else if (defender.id === "b") {
          const power = this.getMetaUpgradeLevel("b_power");
          const control = this.getMetaUpgradeLevel("b_control");
          const grenade = this.getMetaUpgradeLevel("b_grenade");
          defender.damageBoost *= 1 + power * 0.02;
          defender.burstDelay = Math.max(45, defender.burstDelay * Math.max(0.88, 1 - control * 0.01));
          defender.rate *= Math.max(0.94, 1 - control * 0.004);
          if (grenade > 0) {
            defender.rocketEvery = Math.max(6, 10 - Math.floor(grenade * 0.4));
          }
        } else if (defender.id === "d") {
          const charge = this.getMetaUpgradeLevel("d_charge");
          const radius = this.getMetaUpgradeLevel("d_radius");
          const slow = this.getMetaUpgradeLevel("d_slow");
          defender.damageBoost *= 1 + charge * 0.024;
          defender.splashRadiusBoost *= 1 + radius * 0.013;
          defender.splashDamageBoost *= 1 + radius * 0.01;
          defender.slowDuration += slow * 0.09;
        } else if (defender.id === "e") {
          const power = this.getMetaUpgradeLevel("e_power");
          const focus = this.getMetaUpgradeLevel("e_focus");
          const pierce = this.getMetaUpgradeLevel("e_pierce");
          defender.damageBoost *= 1 + power * 0.023 + pierce * 0.008;
          defender.critChance = Math.min(0.76, defender.critChance + focus * 0.006);
          defender.critMultiplier += focus * 0.025;
          defender.pierce += Math.floor(pierce / 5);
        }
      });
    }

    resetRun() {
      this.runId += 1;
      this.cancelRunTimers();
      this.cancelSceneTimers();
      this.clearTransientObjects();
      this.clearRunEntities();
      this.elapsed = 0;
      this.stage = 1;
      this.level = 1;
      this.kills = 0;
      this.killsInLevel = 0;
      this.levelNeed = STARTING_LEVEL_NEED;
      this.spawnTimer = STARTING_SPAWN_TIMER;
      this.spawnBurst = 1;
      this.maxCoreHp = 3000;
      this.coreHp = this.maxCoreHp;
      this.morale = 100;
      this.coins = 0;
      this.runCoinsBanked = false;
      this.shield = 0;
      this.damage = getTeamDamageForLevel(this.level);
      this.playerFireTimer = 0;
      this.focusPoint = null;
      this.hitStopTimer = 0;
      this.recruitedDefenders = new Set(["c"]);
      this.recruitOrder = ["c"];
      this.defenders.forEach((defender) => {
        defender.rate = defender.baseRate;
        defender.damageBoost = 1;
        defender.pierce = defender.basePierce || 0;
        defender.critChance = defender.baseCritChance || BASE_CRIT_CHANCE;
        defender.critMultiplier = defender.baseCritMultiplier || DEFAULT_CRIT_MULTIPLIER;
        defender.rocketEvery = 0;
        defender.shotsSinceRocket = 0;
        defender.burstCount = defender.baseBurstCount || 1;
        defender.burstDelay = defender.baseBurstDelay || 0;
        defender.splashRadiusBoost = 1;
        defender.splashDamageBoost = 1;
        defender.markDuration = defender.baseMarkDuration || 0;
        defender.markDamageBonus = defender.baseMarkDamageBonus || 0;
        defender.slowDuration = defender.baseSlowDuration || 0;
        defender.timer = rand(0.1, defender.rate);
        defender.firePoseTimer = 0;
      });
      this.applyMetaUpgrades();
      this.defenders.forEach((defender) => {
        defender.timer = rand(0.1, defender.rate);
        this.setDefenderRecruited(defender.id, defender.role === "player", false);
      });
      this.updateHud();
    }

    togglePause() {
      if (this.mode === "playing") {
        this.mode = "paused";
        if (this.ui.pauseText) {
          this.ui.pauseText.setText("▶");
        }
        this.showPauseOverlay();
      } else if (this.mode === "paused") {
        this.clearOverlay();
        this.mode = "playing";
        if (this.ui.pauseText) {
          this.ui.pauseText.setText("II");
        }
      }
    }

    showPauseOverlay() {
      this.clearOverlay();
      this.overlayObjects.push(this.add.rectangle(270, 480, 540, 960, 0x010204, 0.58).setDepth(520));
      this.overlayObjects.push(this.add.rectangle(270, 426, 300, 122, 0x0d151b, 0.88).setStrokeStyle(2, 0xe7bb54, 0.75).setDepth(521));
      this.overlayObjects.push(this.add.text(270, 394, "일시정지", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 36,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(521));
      this.overlayObjects.push(this.add.text(270, 432, "전열을 정비합니다", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 15,
        fontStyle: "800",
        color: "#cfe8ea"
      }).setOrigin(0.5).setDepth(522));
      this.addOverlayButton(270, 498, 184, 52, "계속", 523, () => this.togglePause(), COLORS.gold);
    }

    toggleSpeed() {
      this.speedMultiplier = this.speedMultiplier === 1 ? 1.5 : 1;
      if (this.ui.speed) {
        this.ui.speed.setText(this.speedMultiplier === 1 ? "x1.0" : "x1.5");
      }
    }

    update(time, delta) {
      if (this.mode !== "playing") {
        return;
      }

      const rawDt = Math.min(delta, 50) / 1000;
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= rawDt;
        return;
      }
      const dt = rawDt * this.speedMultiplier;
      this.elapsed += dt;
      if (this.focusPoint) {
        this.focusPoint.timer -= dt;
        if (this.focusPoint.timer <= 0) {
          this.focusPoint = null;
        }
      }
      this.updateSpawning(dt);
      this.updateDefenderAnimations(dt);
      this.updateDefenders(dt);
      this.updateBullets(dt);
      this.updateZombies(dt);
      this.updateHud();
    }

    updateDefenderAnimations(dt) {
      this.defenders.forEach((defender) => {
        if (!defender.recruited) {
          return;
        }
        if (defender.firePoseTimer > 0) {
          defender.firePoseTimer -= dt;
          if (defender.firePoseTimer <= 0) {
            this.setDefenderPose(defender, "aim-12");
          }
        }
      });
    }

    updateSpawning(dt) {
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) {
        return;
      }

      const levelPressure = Math.min(0.58, this.level * 0.024);
      const earlyDelayBonus = Math.max(0, (6 - this.level) * 0.07);
      const baseDelay = clamp(0.96 - levelPressure + earlyDelayBonus, 0.28, 1.18);
      const delayMin = this.level < 7 ? 0.72 : 0.64;
      const delayMax = this.level < 7 ? 1.2 : 1.16;
      const burst = this.level >= 16 ? 3 : this.level >= 10 ? 2 : 1;
      const burstPacing = burst > 1 ? 1 + (burst - 1) * 0.38 : 1;
      this.spawnTimer = rand(baseDelay * delayMin * burstPacing, baseDelay * delayMax * burstPacing) * ZOMBIE_SPAWN_INTERVAL_MULTIPLIER / ZOMBIE_SPAWN_COUNT_MULTIPLIER;
      for (let i = 0; i < burst; i += 1) {
        this.spawnZombie(i * rand(0.04, 0.11));
      }
    }

    spawnZombie(delay) {
      this.scheduleRunDelay(delay * 1000 / this.speedMultiplier, () => {
        const eliteRoll = this.level >= 6 && Math.random() < Math.min(0.045 + this.level * 0.0055, 0.16);
        const x = rand(this.bounds.left + 28, this.bounds.right - 28);
        const y = rand(-65, 46);
        const variant = Math.floor(rand(0, 4));
        const frame = Math.floor(rand(0, 4));
        const typeConfig = pickZombieType(this.level, eliteRoll);
        const baseDisplayHeight = eliteRoll ? rand(202, 238) : rand(152, 186);
        const displayHeight = baseDisplayHeight * typeConfig.sizeScale;
        const displayWidth = displayHeight;
        const levelCurve = Math.pow(this.level, 1.04);
        const lateLevelBonus = Math.max(0, this.level - 10);
        const baseHp =
          (eliteRoll ? 165 : 48)
          + levelCurve * (eliteRoll ? 24.5 : 13.8)
          + lateLevelBonus * (eliteRoll ? 4.4 : 2.8)
          + rand(-6, 12);
        const hp = Math.round(baseHp * ZOMBIE_HP_MULTIPLIER * typeConfig.hpScale);
        const textureBase = `zombie-walk-${typeConfig.id}`;
        const zombie = this.add.image(x, y, `${textureBase}-${variant}-${frame}`)
          .setOrigin(0.5, 0.56)
          .setDisplaySize(displayWidth, displayHeight)
          .setFlipX(Math.random() < 0.5)
          .setDepth(60);
        zombie.hp = hp;
        zombie.maxHp = hp;
        zombie.speed = (rand(19, 31) + this.level * 0.95 + lateLevelBonus * 0.22 + (eliteRoll ? -6 : 0)) * typeConfig.speedScale;
        zombie.hitRadius = (eliteRoll ? 42 : 32) * typeConfig.hitRadiusScale;
        zombie.attack = ((eliteRoll ? 40 : 18) + this.level * 2) * typeConfig.attackScale;
        zombie.attackTimer = rand(0.2, 0.7);
        zombie.slowTimer = 0;
        zombie.weakMarkTimer = 0;
        zombie.weakMarkBonus = 0;
        zombie.weakMarkFx = null;
        zombie.wobble = rand(0, Math.PI * 2);
        zombie.animTimer = rand(0, 1);
        zombie.animFrame = frame;
        zombie.variant = variant;
        zombie.displayW = displayWidth;
        zombie.displayH = displayHeight;
        zombie.elite = eliteRoll;
        zombie.type = typeConfig.id;
        zombie.textureBase = textureBase;
        zombie.baseTint = 0;
        zombie.animRate = typeConfig.animRate;
        zombie.knockbackScale = typeConfig.knockbackScale;
        zombie.reward = typeConfig.reward;
        zombie.deathExplosion = Boolean(typeConfig.deathExplosion);
        this.zombies.push(zombie);
      });
    }

    updateDefenders(dt) {
      this.playerFireTimer -= dt;
      if (this.playerFireTimer <= 0) {
        this.firePlayerBurst(false);
      }

      this.defenders.forEach((defender) => {
        if (!defender.recruited || defender.role === "player") {
          return;
        }
        defender.timer -= dt;
        if (defender.timer <= 0) {
          const burstCount = defender.burstCount || 1;
          const shotDelay = burstCount > 1 ? this.getChainShotDelay(defender) : 0;
          defender.timer = defender.rate * rand(0.75, 1.2) + (burstCount - 1) * shotDelay / 1000;
          const target = this.findTarget(defender.x, 999, null, this.bounds.autoEngageTop);
          if (target) {
            const usedTargets = new Set();
            for (let shot = 0; shot < burstCount; shot += 1) {
              this.scheduleRunDelay(shot * shotDelay, () => {
                if (!defender.recruited) {
                  return;
                }
                const shotTarget = this.findChainShotTarget(defender.x, 999, usedTargets, this.bounds.autoEngageTop);
                if (!shotTarget) {
                  return;
                }
                usedTargets.add(shotTarget);
                const damage = this.getDefenderDamage(defender);
                this.fireBullet(defender, shotTarget, damage, defender.speed, defender.pierce || 0, defender.critChance || BASE_CRIT_CHANCE);
                if (defender.rocketEvery > 0) {
                  defender.shotsSinceRocket += 1;
                  if (defender.shotsSinceRocket >= defender.rocketEvery) {
                    defender.shotsSinceRocket = 0;
                    this.createExplosion(shotTarget.x, shotTarget.y, 68, damage * 1.35);
                  }
                }
              });
            }
          }
        }
      });
    }

    firePlayerBurst(isManual) {
      const player = this.defenders.find((defender) => defender.role === "player");
      if (!player) {
        return;
      }
      const hasFocus = Boolean(this.focusPoint);
      const minTargetY = hasFocus ? this.bounds.top : this.bounds.autoEngageTop;
      const target = this.findTarget(hasFocus ? this.focusPoint.x : 270, hasFocus ? 210 : 999, null, minTargetY);
      const count = player.burstCount || 1;
      const shotDelay = count > 1 ? this.getChainShotDelay(player) : 0;
      this.playerFireTimer = player.rate * (isManual ? 0.45 : 1) + (count - 1) * shotDelay / 1000;
      if (!target) {
        return;
      }

      const usedTargets = new Set();
      for (let i = 0; i < count; i += 1) {
        const shotOffset = (i - (count - 1) / 2) * 12;
        const preferredX = (hasFocus ? this.focusPoint.x : 270) + shotOffset * 2.5;
        const radius = hasFocus ? 210 : 999;
        this.scheduleRunDelay(i * shotDelay, () => {
          if (!player.recruited) {
            return;
          }
          const shotTarget = this.findChainShotTarget(preferredX, radius, usedTargets, minTargetY);
          if (!shotTarget) {
            return;
          }
          const reusingTarget = usedTargets.has(shotTarget);
          usedTargets.add(shotTarget);
          this.fireBullet(
            {
              ...player,
              shotOffset: count > 1 ? 0 : shotOffset,
              angleOffset: reusingTarget ? clamp(shotOffset * 0.012, -0.1, 0.1) : 0
            },
            shotTarget,
            this.getDefenderDamage(player),
            player.speed,
            player.pierce || 0,
            player.critChance || BASE_CRIT_CHANCE
          );
        });
      }

      if (player.rocketEvery > 0) {
        player.shotsSinceRocket += 1;
        if (player.shotsSinceRocket >= player.rocketEvery) {
          player.shotsSinceRocket = 0;
          this.createExplosion(target.x, target.y, 72, this.getDefenderDamage(player) * 1.5);
        }
      }
    }

    findChainShotTarget(preferX, radius, usedTargets, minY) {
      return this.findTarget(preferX, radius, usedTargets, minY)
        || this.findTarget(preferX, radius, null, minY);
    }

    findTarget(preferX, radius, ignoredTargets = null, minY = -Infinity) {
      let best = null;
      let bestXBias = Infinity;
      this.zombies.forEach((zombie) => {
        if (!zombie.active || zombie.hp <= 0) {
          return;
        }
        if (zombie.y < minY) {
          return;
        }
        if (ignoredTargets && ignoredTargets.has(zombie)) {
          return;
        }
        const xBias = Math.abs(zombie.x - preferX);
        if (radius !== 999 && xBias > radius) {
          return;
        }
        if (!best || zombie.y > best.y + 8 || (Math.abs(zombie.y - best.y) <= 8 && xBias < bestXBias)) {
          best = zombie;
          bestXBias = xBias;
        }
      });
      return best || this.zombies.reduce((closest, zombie) => {
        if (!zombie.active || zombie.hp <= 0) {
          return closest;
        }
        if (zombie.y < minY) {
          return closest;
        }
        if (ignoredTargets && ignoredTargets.has(zombie)) {
          return closest;
        }
        if (!closest || zombie.y > closest.y) {
          return zombie;
        }
        return closest;
      }, null);
    }

    getDefenderDamage(defender) {
      return this.damage * (defender.damageScale || 1) * (defender.damageBoost || 1);
    }

    getChainShotDelay(defender) {
      return defender.burstDelay || WEAPON_CHAIN_SHOT_DELAYS[defender.projectile] || DEFAULT_CHAIN_SHOT_DELAY;
    }

    getDefenderById(id) {
      return this.defenders.find((defender) => defender.id === id);
    }

    fireBullet(defender, target, damage, speed, pierce, critChance = BASE_CRIT_CHANCE) {
      if (!target || !target.active) {
        return;
      }
      const pose = this.getAttackPose(defender, target);
      this.setDefenderPose(defender, pose);
      defender.firePoseTimer = 0.18;
      if (defender.sprite) {
        this.tweens.killTweensOf(defender.sprite);
        this.tweens.add({
          targets: defender.sprite,
          y: defender.y + 3,
          yoyo: true,
          duration: 65,
          ease: "Sine.easeOut"
        });
      }
      const muzzle = this.getDefenderMuzzle(defender, pose);
      const x = muzzle.x + (defender.shotOffset || 0);
      const y = muzzle.y;
      const tx = target.x + rand(-8, 8);
      const ty = target.y + rand(-10, 10);
      const angle = Math.atan2(ty - y, tx - x) + (defender.angleOffset || 0);
      const sprite = this.add.image(x, y, defender.projectile)
        .setOrigin(0.5, 1)
        .setScale(PROJECTILE_SCALES[defender.projectile] || 0.78)
        .setRotation(angle + Math.PI / 2)
        .setDepth(190);
      this.bullets.push({
        sprite,
        angle,
        hitOffset: sprite.displayHeight * 0.72,
        damage,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: defender.projectile === "projectile-rocket" ? 1.25 : defender.projectile === "projectile-sniper" ? 1.05 : 1.55,
        pierce,
        critChance,
        critMultiplier: defender.critMultiplier || DEFAULT_CRIT_MULTIPLIER,
        projectile: defender.projectile,
        splashRadius: (defender.splashRadius || 0) * (defender.splashRadiusBoost || 1),
        splashDamageScale: (defender.splashDamageScale || 0) * (defender.splashDamageBoost || 1),
        markDuration: defender.markDuration || 0,
        markDamageBonus: defender.markDamageBonus || 0,
        slowDuration: defender.slowDuration || 0,
        hitTargets: new Set()
      });
      this.createMuzzle(x, y, angle, defender.projectile);
      this.playWeaponSfx(defender.projectile);
    }

    createMuzzle(x, y, angle, projectile) {
      const effect = MUZZLE_EFFECTS[projectile];
      if (!effect) {
        const flash = this.trackTransient(this.add.circle(x, y, 5, 0xfff3a4, 0.8).setDepth(191));
        this.tweens.add({
          targets: flash,
          scale: 1.6,
          alpha: 0,
          duration: 110,
          onComplete: () => this.destroyTransientObject(flash, false)
        });
        return;
      }

      const texture = this.textures.get(effect.texture).getSourceImage();
      const displayHeight = effect.width * texture.height / texture.width;
      const flash = this.trackTransient(this.add.image(x, y, effect.texture)
        .setOrigin(0.08, 0.5)
        .setDisplaySize(effect.width, displayHeight)
        .setRotation(angle)
        .setAlpha(effect.alpha)
        .setDepth(238));
      this.tweens.add({
        targets: flash,
        scaleX: flash.scaleX * effect.scalePeak,
        scaleY: flash.scaleY * effect.scalePeak,
        alpha: 0,
        duration: effect.duration,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(flash, false)
      });
    }

    createAimFlash(x, y) {
      const ring = this.trackTransient(this.add.circle(x, y, 22, 0xffffff, 0).setStrokeStyle(3, 0xffec80, 0.9).setDepth(200));
      this.tweens.add({
        targets: ring,
        scale: 1.7,
        alpha: 0,
        duration: 250,
        onComplete: () => this.destroyTransientObject(ring, false)
      });
    }

    updateBullets(dt) {
      for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
        const bullet = this.bullets[i];
        bullet.life -= dt;
        bullet.sprite.x += bullet.vx * dt;
        bullet.sprite.y += bullet.vy * dt;
        if (bullet.life <= 0 || bullet.sprite.x < -30 || bullet.sprite.x > 570 || bullet.sprite.y < -60 || bullet.sprite.y > 980) {
          this.destroyGameObject(bullet.sprite);
          this.bullets.splice(i, 1);
          continue;
        }

        const hit = this.findBulletHit(bullet);
        if (hit) {
          bullet.hitTargets.add(hit);
          this.damageZombie(hit, bullet.damage, bullet.critChance, bullet.projectile, bullet.critMultiplier);
          if (bullet.slowDuration > 0 && hit.active) {
            hit.slowTimer = Math.max(hit.slowTimer || 0, bullet.slowDuration);
          }
          if (bullet.markDuration > 0 && bullet.markDamageBonus > 0 && hit.active) {
            this.applyWeakMark(hit, bullet.markDuration, bullet.markDamageBonus);
          }
          if (bullet.splashRadius > 0) {
            this.createExplosion(hit.x, hit.y, bullet.splashRadius, bullet.damage * (bullet.splashDamageScale || 0.75), bullet.slowDuration);
          }
          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
          } else {
            this.destroyGameObject(bullet.sprite);
            this.bullets.splice(i, 1);
          }
        }
      }
    }

    findBulletHit(bullet) {
      for (let i = 0; i < this.zombies.length; i += 1) {
        const zombie = this.zombies[i];
        if (!zombie.active || zombie.hp <= 0) {
          continue;
        }
        if (bullet.hitTargets && bullet.hitTargets.has(zombie)) {
          continue;
        }
        const hitX = bullet.sprite.x + Math.cos(bullet.angle) * bullet.hitOffset;
        const hitY = bullet.sprite.y + Math.sin(bullet.angle) * bullet.hitOffset;
        const dx = hitX - zombie.x;
        const dy = hitY - zombie.y;
        if (dx * dx + dy * dy < zombie.hitRadius * zombie.hitRadius) {
          return zombie;
        }
      }
      return null;
    }

    applyWeakMark(zombie, duration, damageBonus) {
      if (!zombie || !zombie.active) {
        return;
      }
      zombie.weakMarkTimer = Math.max(zombie.weakMarkTimer || 0, duration);
      zombie.weakMarkBonus = Math.max(zombie.weakMarkBonus || 0, damageBonus);
      if (zombie.weakMarkFx) {
        return;
      }

      const markerY = zombie.y - zombie.displayH * 0.62;
      const marker = this.add.container(zombie.x, markerY).setDepth(230);
      const halo = this.add.circle(0, 0, 15, 0xffe18a, 0.16).setStrokeStyle(2, 0xfff0a5, 0.92);
      const vertical = this.add.rectangle(0, 0, 2, 25, 0xfff5bf, 0.88);
      const horizontal = this.add.rectangle(0, 0, 25, 2, 0xfff5bf, 0.88);
      const center = this.add.circle(0, 0, 3, 0xffffff, 0.92);
      marker.add([halo, vertical, horizontal, center]);
      marker.setScale(0.82);
      zombie.weakMarkFx = marker;
      this.tweens.add({
        targets: marker,
        scale: 1.08,
        yoyo: true,
        repeat: -1,
        duration: 420,
        ease: "Sine.easeInOut"
      });
    }

    clearWeakMark(zombie) {
      if (!zombie) {
        return;
      }
      if (zombie.weakMarkFx) {
        this.tweens.killTweensOf(zombie.weakMarkFx);
        this.destroyGameObject(zombie.weakMarkFx, false);
      }
      zombie.weakMarkFx = null;
      zombie.weakMarkTimer = 0;
      zombie.weakMarkBonus = 0;
    }

    updateWeakMark(zombie, dt) {
      if (!zombie.weakMarkTimer) {
        return;
      }
      zombie.weakMarkTimer -= dt;
      if (zombie.weakMarkTimer <= 0) {
        this.clearWeakMark(zombie);
        return;
      }
      if (zombie.weakMarkFx) {
        zombie.weakMarkFx
          .setPosition(zombie.x, zombie.y - zombie.displayH * 0.62)
          .setDepth(226 + zombie.y / 5)
          .setAlpha(clamp(zombie.weakMarkTimer / 0.45, 0.35, 1));
      }
    }

    getZombieEffectScale(zombie) {
      return clamp((zombie.displayH || 170) / 172, 0.72, zombie.elite ? 1.48 : 1.24);
    }

    createZombieHitEffect(zombie, hitType = "default", crit = false) {
      const effect = ZOMBIE_HIT_EFFECTS[hitType] || ZOMBIE_HIT_EFFECTS.default;
      const sizeScale = this.getZombieEffectScale(zombie) * (crit ? 1.12 : 1);
      const texture = this.textures.get(effect.texture).getSourceImage();
      const displayWidth = effect.width * sizeScale;
      const displayHeight = displayWidth * texture.height / texture.width;
      const impact = this.trackTransient(this.add.image(
        zombie.x + rand(-zombie.hitRadius * 0.18, zombie.hitRadius * 0.18),
        zombie.y - (zombie.displayH || 170) * 0.08 + rand(-zombie.hitRadius * 0.12, zombie.hitRadius * 0.1),
        effect.texture
      )
        .setOrigin(0.5)
        .setDisplaySize(displayWidth, displayHeight)
        .setRotation(rand(-effect.rotation, effect.rotation))
        .setAlpha(effect.alpha)
        .setDepth(229 + zombie.y / 5));

      this.tweens.add({
        targets: impact,
        scaleX: impact.scaleX * effect.scalePeak,
        scaleY: impact.scaleY * effect.scalePeak,
        alpha: 0,
        duration: effect.duration,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(impact, false)
      });
    }

    damageZombie(zombie, amount, critChance = BASE_CRIT_CHANCE, hitType = "default", critMultiplier = DEFAULT_CRIT_MULTIPLIER) {
      const crit = Math.random() < critChance;
      const marked = zombie.weakMarkTimer > 0 && zombie.weakMarkBonus > 0;
      const markMultiplier = marked ? 1 + zombie.weakMarkBonus : 1;
      const damage = Math.round(amount * markMultiplier * (crit ? critMultiplier : 1));
      this.createZombieHitEffect(zombie, hitType, crit);
      zombie.hp -= damage;
      this.playSfx(crit ? "crit" : "hit", crit ? 1.15 : 0.85);
      this.applyZombieKnockback(zombie, hitType, crit);
      if (crit || hitType === "projectile-sniper") {
        this.requestHitStop(crit ? 0.04 : 0.025);
        this.shakeCamera(55, crit ? 0.0038 : 0.0025);
      } else if (hitType === "projectile-rocket" || hitType === "explosion") {
        this.requestHitStop(0.03);
      }
      zombie.setTint(crit ? 0xfff2a5 : 0xff7777);
      this.scheduleSceneDelay(70, () => {
        if (zombie.active) {
          this.restoreZombieTint(zombie);
        }
      });
      this.showDamageText(zombie.x + rand(-8, 8), zombie.y - rand(8, 24), damage, crit, marked);
      if (zombie.hp <= 0) {
        this.killZombie(zombie);
      }
    }

    killZombie(zombie) {
      if (!zombie.active) {
        return;
      }
      const x = zombie.x;
      const y = zombie.y;
      this.clearWeakMark(zombie);
      this.createDeathBurst(x, y, zombie);
      this.playSfx("death", zombie.elite ? 1.35 : 1);
      if (zombie.elite || zombie.type === "brute") {
        this.shakeCamera(90, 0.0045);
      }
      const shouldExplode = zombie.deathExplosion;
      this.destroyGameObject(zombie);
      this.zombies = this.zombies.filter((item) => item !== zombie);
      this.kills += 1;
      this.killsInLevel += 1;
      this.coins += zombie.reward || (zombie.elite ? 4 : 1);
      if (shouldExplode && this.mode === "playing") {
        this.createExplosion(x, y, 74, this.damage * 1.05, 0.35);
      }

      if (this.killsInLevel >= this.levelNeed) {
        this.openSkillChoice();
      }
    }

    showDamageText(x, y, damage, crit, marked = false) {
      const text = this.trackTransient(this.add.text(x, y, String(damage), {
        fontFamily: "Arial, sans-serif",
        fontSize: crit ? 31 : marked ? 26 : 23,
        fontStyle: "900",
        color: crit ? "#fff0a5" : marked ? "#ffe29a" : "#ffffff",
        stroke: crit ? "#811010" : marked ? "#5a310e" : "#40191b",
        strokeThickness: 5
      }).setOrigin(0.5).setRotation(rand(-0.18, 0.18)).setDepth(250));
      this.tweens.add({
        targets: text,
        y: y - rand(26, 44),
        alpha: 0,
        scale: crit ? 1.18 : 1,
        duration: 650,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(text, false)
      });
    }

    createDeathBurst(x, y, zombie) {
      const sizeScale = this.getZombieEffectScale(zombie);
      const tier = zombie.elite ? "elite" : sizeScale < 0.95 ? "small" : "normal";
      const effect = ZOMBIE_DEATH_EFFECTS[tier];
      const texture = this.textures.get(effect.texture).getSourceImage();
      const displayWidth = effect.width * sizeScale;
      const displayHeight = displayWidth * texture.height / texture.width;
      const effectX = clamp(x, displayWidth / 2 + 8, GAME_WIDTH - displayWidth / 2 - 8);
      const effectY = y - (zombie.displayH || 170) * 0.06;
      const burst = this.trackTransient(this.add.image(effectX, effectY, effect.texture)
        .setOrigin(0.5, 0.64)
        .setDisplaySize(displayWidth, displayHeight)
        .setRotation(rand(-0.12, 0.12))
        .setAlpha(effect.alpha)
        .setDepth(232));
      this.tweens.add({
        targets: burst,
        scaleX: burst.scaleX * effect.scalePeak,
        scaleY: burst.scaleY * effect.scalePeak,
        alpha: 0,
        duration: effect.duration,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(burst, false)
      });
    }

    updateZombies(dt) {
      for (let i = this.zombies.length - 1; i >= 0; i -= 1) {
        const zombie = this.zombies[i];
        if (!zombie.active) {
          this.clearWeakMark(zombie);
          this.zombies.splice(i, 1);
          continue;
        }
        this.updateWeakMark(zombie, dt);
        zombie.wobble += dt * 4.2;
        zombie.animTimer += dt * (zombie.animRate || (zombie.elite ? 5.2 : 6.8));
        const nextFrame = Math.floor(zombie.animTimer) % 4;
        if (nextFrame !== zombie.animFrame) {
          zombie.animFrame = nextFrame;
          zombie.setTexture(`${zombie.textureBase || "zombie-walk"}-${zombie.variant}-${nextFrame}`);
          zombie.setDisplaySize(zombie.displayW, zombie.displayH);
        }
        const crowdShift = Math.sin(zombie.wobble) * 7 * dt;
        zombie.x = clamp(zombie.x + crowdShift, this.bounds.left, this.bounds.right);
        zombie.setDepth(70 + zombie.y / 5);

        if (zombie.slowTimer > 0) {
          zombie.slowTimer -= dt;
          zombie.setTint(0x99f4ff);
        } else if (zombie.tintTopLeft === 0x99f4ff) {
          this.restoreZombieTint(zombie);
        }

        const slowFactor = zombie.slowTimer > 0 ? 0.34 : 1;
        if (zombie.y < this.bounds.barricade - 30) {
          zombie.y += zombie.speed * slowFactor * dt;
        } else {
          zombie.attackTimer -= dt;
          zombie.y += Math.sin(zombie.wobble) * 6 * dt;
          if (zombie.attackTimer <= 0) {
            zombie.attackTimer = rand(0.55, 1);
            this.takeDamage(zombie.attack);
            if (this.mode !== "playing") {
              return;
            }
            zombie.y = Math.max(zombie.y - 6, this.bounds.barricade - 20);
            this.createHitAtBarricade(zombie.x);
          }
        }
      }
    }

    takeDamage(rawAmount) {
      let amount = rawAmount;
      if (this.shield > 0) {
        const blocked = Math.min(this.shield, amount);
        this.shield -= blocked;
        amount -= blocked;
      }
      this.coreHp = clamp(this.coreHp - amount, 0, this.maxCoreHp);
      this.morale = Math.round((this.coreHp / this.maxCoreHp) * 100);
      if (rawAmount > 0) {
        this.playSfx("core");
        const severity = clamp(rawAmount / 46, 1, 1.9);
        this.shakeCamera(260, 0.014 * severity);
        this.requestHitStop(0.055);
        this.vibrateImpact(severity > 1.45 ? [90, 35, 125] : [62, 28, 86]);
      }
      if (this.coreHp <= 0) {
        this.gameOver();
      }
    }

    createHitAtBarricade(x) {
      const effectWidth = 520;
      const texture = this.textures.get("barricade-impact").getSourceImage();
      const effectHeight = effectWidth * texture.height / texture.width;
      const effectX = clamp(x, effectWidth / 2 + 8, GAME_WIDTH - effectWidth / 2 - 8);
      const effectY = this.bounds.barricade + 38;
      const impact = this.trackTransient(this.add.image(effectX, effectY, "barricade-impact")
        .setOrigin(0.5, 0.55)
        .setDisplaySize(effectWidth, effectHeight)
        .setRotation(rand(-0.035, 0.035))
        .setAlpha(0.98)
        .setDepth(225));
      const flash = this.trackTransient(this.add.rectangle(270, this.bounds.barricade + 46, 540, 86, 0xff3b22, 0.18).setDepth(224));
      const sparks = this.trackTransient(this.add.circle(x, this.bounds.barricade + rand(10, 30), 11, 0xffd86b, 0.86).setDepth(226));
      this.tweens.add({
        targets: impact,
        scaleX: impact.scaleX * 1.08,
        scaleY: impact.scaleY * 1.08,
        alpha: 0,
        duration: 330,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(impact, false)
      });
      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 150,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(flash, false)
      });
      this.tweens.add({
        targets: sparks,
        scale: 2.8,
        alpha: 0,
        duration: 240,
        onComplete: () => this.destroyTransientObject(sparks, false)
      });
    }

    createExplosion(x, y, radius, damage, slowDuration = 0) {
      this.playSfx("explosion", clamp(radius / 82, 0.75, 1.35));
      this.shakeCamera(130, clamp(radius / 22000, 0.004, 0.009));
      this.requestHitStop(0.045);
      const ring = this.trackTransient(this.add.circle(x, y, 18, 0xffd35a, 0.46).setStrokeStyle(4, 0xffffff, 0.55).setDepth(221));
      this.tweens.add({
        targets: ring,
        scale: radius / 18,
        alpha: 0,
        duration: 260,
        onComplete: () => this.destroyTransientObject(ring, false)
      });
      this.zombies.slice().forEach((zombie) => {
        if (!zombie.active) {
          return;
        }
        const dx = zombie.x - x;
        const dy = zombie.y - y;
        if (dx * dx + dy * dy <= radius * radius) {
          this.damageZombie(zombie, damage * (1 - Math.sqrt(dx * dx + dy * dy) / radius * 0.35), 0, "explosion");
          if (slowDuration > 0 && zombie.active) {
            zombie.slowTimer = Math.max(zombie.slowTimer || 0, slowDuration);
          }
        }
      });
    }

    createScreenPulse(color) {
      const pulse = this.trackTransient(this.add.rectangle(270, 480, 540, 960, color, 0.16).setDepth(240));
      this.tweens.add({
        targets: pulse,
        alpha: 0,
        duration: 420,
        onComplete: () => this.destroyTransientObject(pulse, false)
      });
    }

    openSkillChoice() {
      if (this.mode !== "playing") {
        return;
      }
      this.mode = "skill";
      this.cancelRunTimers();
      this.level += 1;
      this.stage = Math.floor((this.level - 1) / 4) + 1;
      this.killsInLevel = 0;
      this.levelNeed = getLevelNeedForLevel(this.level);
      this.damage = getTeamDamageForLevel(this.level);
      this.clearOverlay();

      const items = this.overlayObjects;
      items.push(this.add.image(270, 480, "skill-choice-backdrop").setDisplaySize(540, 960).setDepth(520));
      items.push(this.add.rectangle(270, 480, 540, 960, 0x010204, 0.26).setDepth(521));
      items.push(this.add.rectangle(270, 538, 492, 520, 0x010204, 0.18).setDepth(522));
      items.push(this.add.ellipse(270, 552, 450, 570, COLORS.gold, 0.05).setDepth(522.2));
      items.push(this.add.rectangle(270, 180, 432, 92, 0x0a1116, 0.82).setStrokeStyle(2, 0xeac15b, 0.76).setDepth(523));
      items.push(this.add.rectangle(270, 130, 320, 4, 0xffd86b, 0.95).setDepth(524));
      items.push(this.add.text(270, 160, "스킬 선택", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 38,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(525));
      items.push(this.add.text(270, 202, `Lv.${this.level} 보급 승인 - 전술 하나를 선택하세요`, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 16,
        fontStyle: "900",
        color: "#f6d985",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(525));

      const upgrades = this.pickUpgrades();
      const xs = upgrades.length === 1 ? [270] : upgrades.length === 2 ? [174, 366] : [92, 270, 448];
      upgrades.forEach((upgrade, index) => this.addSkillCard(xs[index], 548, upgrade, index));
      items.push(this.add.text(270, 810, "카드를 눌러 즉시 적용", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(535));
    }

    formatPercent(value) {
      return `${Math.round(value * 100)}%`;
    }

    formatBonus(value) {
      return `+${Math.round(value * 100)}%`;
    }

    formatSeconds(value) {
      return `${value.toFixed(2)}초`;
    }

    formatMs(value) {
      return `${Math.round(value)}ms`;
    }

    getCharacterUpgrades() {
      const upgrades = [];
      const add = (ownerId, upgrade) => {
        const defender = this.getDefenderById(ownerId);
        if (!defender || !defender.recruited) {
          return;
        }
        if (upgrade.available === false) {
          return;
        }
        upgrades.push({
          ownerId,
          ownerCharacterTexture: OWNER_SKILL_PORTRAITS[ownerId] || `character-${ownerId}-badge`,
          ...upgrade
        });
      };

      const pistol = this.getDefenderById("c");
      const bow = this.getDefenderById("a");
      const rifle = this.getDefenderById("b");
      const rocket = this.getDefenderById("d");
      const sniper = this.getDefenderById("e");

      add("c", {
        id: "c-rapid",
        icon: "skill-pistol-rapid",
        tag: "권총",
        title: "권총 속사",
        desc: "가까이 붙은 적을\n더 빠르게 끊어냅니다.",
        stat: `공격 간격 ${this.formatSeconds(pistol.rate)} → ${this.formatSeconds(Math.max(pistol.baseRate * 0.65, pistol.rate * 0.88))}`,
        available: pistol.rate > pistol.baseRate * 0.66,
        apply: () => {
          const defender = this.getDefenderById("c");
          defender.rate = Math.max(defender.baseRate * 0.65, defender.rate * 0.88);
        }
      });
      add("c", {
        id: "c-multishot",
        icon: "skill-multishot",
        tag: "권총",
        title: "연속 사격",
        desc: "한 번의 자동 사격을\n빠르게 이어 쏩니다.",
        stat: `연속 사격 ${pistol.burstCount}회 → ${Math.min(4, pistol.burstCount + 1)}회`,
        available: pistol.burstCount < 4,
        apply: () => {
          const defender = this.getDefenderById("c");
          defender.burstCount = Math.min(4, defender.burstCount + 1);
        }
      });
      add("a", {
        id: "a-rally",
        icon: "skill-rally",
        tag: "활",
        title: "집중 호흡",
        desc: "활시위를 당길수록\n치명타가 날카로워집니다.",
        stat: `치명률 ${this.formatPercent(bow.critChance)} → ${this.formatPercent(Math.min(0.65, bow.critChance + 0.1))}\n치명 피해 ${this.formatPercent(bow.critMultiplier)} → ${this.formatPercent(bow.critMultiplier + 0.15)}`,
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.critChance = Math.min(0.65, defender.critChance + 0.1);
          defender.critMultiplier += 0.15;
        }
      });
      add("a", {
        id: "a-mark",
        icon: "skill-mark",
        tag: "활",
        title: "약점 표식",
        desc: "표식이 붙은 적이\n더 큰 피해를 받습니다.",
        stat: `표식 피해 ${this.formatBonus(bow.markDamageBonus)} → ${this.formatBonus(bow.markDamageBonus + 0.07)}\n표식 지속 ${this.formatSeconds(bow.markDuration)} → ${this.formatSeconds(bow.markDuration + 1.5)}`,
        accent: 0xffd978,
        accentHex: "#ffd978",
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.markDamageBonus += 0.07;
          defender.markDuration += 1.5;
        }
      });
      add("a", {
        id: "a-pin",
        icon: "skill-arrow-pin",
        tag: "활",
        title: "속박 화살",
        desc: "맞은 좀비의 발을\n잠시 묶어둡니다.",
        stat: `둔화 ${this.formatSeconds(bow.slowDuration)} → ${this.formatSeconds(bow.slowDuration + 0.55)}\n표식 지속 ${this.formatSeconds(bow.markDuration)} → ${this.formatSeconds(bow.markDuration + 0.75)}`,
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.slowDuration += 0.55;
          defender.markDuration += 0.75;
        }
      });
      add("b", {
        id: "b-barrage",
        icon: "skill-rifle-grenade",
        tag: "소총",
        title: "하부 유탄",
        desc: "연발 중간마다\n소형 폭발을 섞습니다.",
        stat: rifle.rocketEvery === 0
          ? "유탄 없음 → 8발마다"
          : `유탄 ${rifle.rocketEvery}발마다 → ${Math.max(4, rifle.rocketEvery - 1)}발마다`,
        available: rifle.rocketEvery !== 4,
        apply: () => {
          const defender = this.getDefenderById("b");
          defender.rocketEvery = defender.rocketEvery === 0 ? 8 : Math.max(4, defender.rocketEvery - 1);
        }
      });
      add("b", {
        id: "b-rifle",
        icon: "skill-barrage",
        tag: "소총",
        title: "연발 제어",
        desc: "여러 적에게\n탄막을 짧게 끊어 쏩니다.",
        stat: `연사 ${rifle.burstCount}회 → ${Math.min(6, rifle.burstCount + 1)}회\n간격 ${this.formatMs(rifle.burstDelay)} → ${this.formatMs(Math.max(45, rifle.burstDelay * 0.9))}`,
        available: rifle.burstCount < 6 || rifle.burstDelay > 45,
        apply: () => {
          const defender = this.getDefenderById("b");
          defender.burstCount = Math.min(6, defender.burstCount + 1);
          defender.burstDelay = Math.max(45, defender.burstDelay * 0.9);
        }
      });
      add("d", {
        id: "d-frost",
        icon: "skill-frost",
        tag: "로켓",
        title: "냉각 탄두",
        desc: "폭발에 휘말린 적을\n느리게 만듭니다.",
        stat: `둔화 ${this.formatSeconds(rocket.slowDuration)} → ${this.formatSeconds(rocket.slowDuration + 1.2)}\n직격 피해 ${this.formatPercent(rocket.damageBoost)} → ${this.formatPercent(rocket.damageBoost * 1.12)}`,
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.slowDuration += 1.2;
          defender.damageBoost *= 1.12;
        }
      });
      add("d", {
        id: "d-rocket",
        icon: "skill-rocket",
        tag: "로켓",
        title: "고폭 탄두",
        desc: "몰려 있는 좀비를\n더 넓게 쓸어냅니다.",
        stat: `반경 ${Math.round(rocket.splashRadius * rocket.splashRadiusBoost)} → ${Math.round(rocket.splashRadius * rocket.splashRadiusBoost * 1.18)}\n폭발 피해 ${this.formatPercent(rocket.splashDamageScale * rocket.splashDamageBoost)} → ${this.formatPercent(rocket.splashDamageScale * rocket.splashDamageBoost * 1.22)}`,
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.splashRadiusBoost *= 1.18;
          defender.splashDamageBoost *= 1.22;
        }
      });
      add("d", {
        id: "d-impact",
        icon: "skill-rocket-impact",
        tag: "로켓",
        title: "직격 장약",
        desc: "정면으로 맞은 대상에게\n더 묵직하게 박힙니다.",
        stat: `직격 피해 ${this.formatPercent(rocket.damageBoost)} → ${this.formatPercent(rocket.damageBoost * 1.18)}`,
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.damageBoost *= 1.18;
        }
      });
      add("e", {
        id: "e-weakpoint",
        icon: "skill-sniper-weakpoint",
        tag: "저격",
        title: "약점 조준",
        desc: "큰 위협을 노릴 때\n한 발의 위력이 커집니다.",
        stat: `치명률 ${this.formatPercent(sniper.critChance)} → ${this.formatPercent(Math.min(0.7, sniper.critChance + 0.06))}\n치명 피해 ${this.formatPercent(sniper.critMultiplier)} → ${this.formatPercent(sniper.critMultiplier + 0.3)}`,
        apply: () => {
          const defender = this.getDefenderById("e");
          defender.critChance = Math.min(0.7, defender.critChance + 0.06);
          defender.critMultiplier += 0.3;
        }
      });
      add("e", {
        id: "e-sniper",
        icon: "skill-sniper",
        tag: "저격",
        title: "철갑 저격",
        desc: "앞줄을 꿰뚫고\n뒤쪽 위협까지 노립니다.",
        stat: `관통 ${sniper.pierce} → ${sniper.pierce + 1}\n저격 피해 ${this.formatPercent(sniper.damageBoost)} → ${this.formatPercent(sniper.damageBoost * 1.18)}`,
        apply: () => {
          const defender = this.getDefenderById("e");
          defender.pierce += 1;
          defender.damageBoost *= 1.18;
        }
      });
      return upgrades;
    }

    getCommonUpgrades() {
      const upgrades = [];
      const currentHp = Math.round(this.coreHp);
      const maxHp = Math.round(this.maxCoreHp);
      if (this.coreHp < this.maxCoreHp - 1) {
        upgrades.push({
          id: "core-full-repair",
          common: true,
          icon: "skill-full-repair",
          tag: "공용",
          title: "완전 복구",
          desc: "방어선을 즉시\n최대 HP까지 수리",
          stat: `HP ${currentHp}/${maxHp} → ${maxHp}/${maxHp}`,
          accent: SKILL_ACCENTS["core-full-repair"],
          accentHex: SKILL_ACCENT_HEX["core-full-repair"],
          toast: "방어선 완전 복구",
          apply: () => {
            this.coreHp = this.maxCoreHp;
            this.morale = 100;
          }
        });
      }

      const hpBonus = Math.max(240, Math.round(this.maxCoreHp * MAX_CORE_HP_SKILL_RATE));
      const nextMaxHp = Math.min(MAX_CORE_HP_SKILL_CAP, Math.round(this.maxCoreHp + hpBonus));
      const appliedBonus = nextMaxHp - maxHp;
      if (appliedBonus > 0) {
        upgrades.push({
          id: "core-max-hp",
          common: true,
          icon: "skill-max-hp",
          tag: "공용",
          title: "방벽 증축",
          desc: "이번 방어 중\n최대 HP 확장",
          stat: `최대 HP ${maxHp} → ${nextMaxHp}\n현재 HP +${appliedBonus}`,
          accent: SKILL_ACCENTS["core-max-hp"],
          accentHex: SKILL_ACCENT_HEX["core-max-hp"],
          toast: "방어선 최대 HP 증가",
          apply: () => {
            const bonus = Math.max(0, nextMaxHp - Math.round(this.maxCoreHp));
            this.maxCoreHp = Math.round(this.maxCoreHp + bonus);
            this.coreHp = clamp(this.coreHp + bonus, 0, this.maxCoreHp);
            this.morale = Math.round((this.coreHp / this.maxCoreHp) * 100);
          }
        });
      }
      return upgrades;
    }

    pickUpgrades() {
      const recruitPool = shuffleItems(this.getRecruitUpgrades());
      const commonPool = this.getCommonUpgrades();
      const characterPool = this.getCharacterUpgrades();
      const chosen = [];
      const recruitedNonPlayerCount = [...this.recruitedDefenders]
        .filter((id) => id !== "c")
        .length;
      const openRecruitSlots = Math.max(0, getUnlockedRecruitSlots(this.level) - recruitedNonPlayerCount);
      const recruitOffers = Math.min(recruitPool.length, openRecruitSlots > 0 ? 1 : 0);
      while (chosen.length < recruitOffers && recruitPool.length > 0) {
        chosen.push(recruitPool.pop());
      }
      const shouldOfferCommon = this.coreHp < this.maxCoreHp * 0.55 || Math.random() < 0.45;
      if (chosen.length < 3 && commonPool.length > 0 && shouldOfferCommon) {
        const index = Math.floor(Math.random() * commonPool.length);
        chosen.push(commonPool.splice(index, 1)[0]);
      }
      const availablePool = [...characterPool, ...commonPool];
      while (chosen.length < 3 && availablePool.length > 0) {
        const index = Math.floor(Math.random() * availablePool.length);
        chosen.push(availablePool.splice(index, 1)[0]);
      }
      return chosen;
    }

    addSkillCard(x, y, upgrade, index = 0) {
      const accent = upgrade.accent || SKILL_ACCENTS[upgrade.id] || COLORS.gold;
      const accentHex = upgrade.accentHex || SKILL_ACCENT_HEX[upgrade.id] || "#f6d985";
      const isRecruit = Boolean(upgrade.characterTexture);
      const isCommonSkill = upgrade.common === true;
      const ownerTexture = upgrade.ownerCharacterTexture;
      const hasOwnerCharacter = Boolean(ownerTexture && !isRecruit && this.textures.exists(ownerTexture));
      const isOwnerSkill = hasOwnerCharacter && !isRecruit;
      const tagY = isOwnerSkill ? y - 42 : isCommonSkill ? y + 18 : y + 24;
      const titleY = isOwnerSkill ? y - 9 : isCommonSkill ? y + 48 : y + 58;
      const descY = isOwnerSkill ? y + 52 : isCommonSkill ? y + 84 : y + 90;
      const statY = isOwnerSkill ? y + 112 : isCommonSkill ? y + 128 : y + 123;
      const chooseY = isOwnerSkill ? y + 150 : isCommonSkill ? y + 158 : y + 153;
      const shadow = this.add.rectangle(x, y + 15, 154, 320, 0x000000, 0.44).setDepth(523);
      const glow = this.add.ellipse(x, y - 74, 138, 206, accent, 0.1).setDepth(523.5);
      const card = this.add.image(x, y, "premium-skill-card").setDisplaySize(170, 342).setDepth(524);
      const watermarkTexture = isRecruit ? upgrade.characterTexture : upgrade.icon;
      const watermark = this.add.image(x, y - 44, watermarkTexture)
        .setAlpha(isRecruit ? 0.08 : 0.1)
        .setDepth(525);
      if (isRecruit) {
        watermark.setOrigin(0.5, 1);
        this.fitSpriteHeight(watermark, 205);
      } else {
        watermark.setDisplaySize(150, 150);
      }
      const iconX = hasOwnerCharacter ? x - 26 : x;
      const iconHalo = isRecruit
        ? this.add.ellipse(x, y - 70, 82, 112, accent, 0.16).setStrokeStyle(2, accent, 0.55).setDepth(527)
        : this.add.circle(iconX, y - 112, 40, 0x000000, 0.58).setStrokeStyle(2, accent, 0.9).setDepth(527);
      const ownerHalo = hasOwnerCharacter
        ? this.add.circle(x + 49, y - 104, 33, 0x000000, 0.54).setStrokeStyle(2, accent, 0.65).setDepth(527)
        : null;
      const ownerCharacter = hasOwnerCharacter
        ? this.add.image(x + 49, y - 104, ownerTexture).setAlpha(0.96).setDepth(528)
        : null;
      if (ownerCharacter) {
        ownerCharacter.setDisplaySize(62, 62);
      }
      const icon = this.add.image(iconX, isRecruit ? y - 24 : y - 112, isRecruit ? upgrade.characterTexture : upgrade.icon).setDepth(528);
      if (isRecruit) {
        icon.setOrigin(0.5, 1);
        this.fitSpriteHeight(icon, 138);
      } else {
        icon.setDisplaySize(hasOwnerCharacter ? 66 : 74, hasOwnerCharacter ? 66 : 74);
      }
      const infoPanel = isOwnerSkill
        ? this.add.rectangle(x, y + 64, 134, 114, 0x071015, 0.58)
          .setStrokeStyle(1, accent, 0.28)
          .setDepth(527)
        : null;
      const tagBg = this.add.rectangle(x, tagY, isOwnerSkill ? 84 : 76, 24, accent, 0.2)
        .setStrokeStyle(1, accent, 0.78)
        .setDepth(528);
      const tagText = this.add.text(x, tagY, upgrade.tag || "전술", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 12,
        fontStyle: "900",
        color: accentHex,
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(529);
      const title = this.add.text(x, titleY, upgrade.title, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: isOwnerSkill ? 18 : isCommonSkill ? 17 : 19,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(529);
      const desc = this.add.text(x, descY, upgrade.desc, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: isCommonSkill ? 12 : 13,
        fontStyle: "900",
        color: "#d8e6e8",
        align: "center",
        lineSpacing: isOwnerSkill ? 6 : isCommonSkill ? 3 : 4,
        wordWrap: { width: 126, useAdvancedWrap: true }
      }).setOrigin(0.5).setDepth(529);
      const statLines = upgrade.stat ? String(upgrade.stat).split("\n").length : 0;
      const statBg = upgrade.stat
        ? this.add.rectangle(x, statY, 132, statLines > 1 ? 38 : 27, 0x05090d, 0.78)
          .setStrokeStyle(1, accent, 0.48)
          .setDepth(529)
        : null;
      const statText = upgrade.stat
        ? this.add.text(x, statY, upgrade.stat, {
          fontFamily: "Pretendard Variable, Arial, sans-serif",
          fontSize: statLines > 1 ? 11 : 12,
          fontStyle: "900",
          color: accentHex,
          align: "center",
          lineSpacing: 2,
          wordWrap: { width: 124, useAdvancedWrap: true }
        }).setOrigin(0.5).setDepth(530)
        : null;
      const chooseBg = this.add.rectangle(x, chooseY, 104, 30, 0x101820, 0.9)
        .setStrokeStyle(1, accent, 0.85)
        .setDepth(529);
      const chooseText = this.add.text(x, chooseY, "선택", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 14,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(530);
      const hit = this.add.rectangle(x, y, 166, 336, 0x000000, 0).setDepth(531);
      const animated = [
        shadow,
        glow,
        card,
        watermark,
        iconHalo,
        ownerHalo,
        ownerCharacter,
        icon,
        infoPanel,
        tagBg,
        tagText,
        title,
        desc,
        statBg,
        statText,
        chooseBg,
        chooseText
      ].filter(Boolean);

      animated.forEach((item) => {
        item.y += 24;
      });
      this.tweens.add({
        targets: animated,
        y: "-=24",
        duration: 360,
        delay: index * 90,
        ease: "Cubic.easeOut"
      });

      const selectUpgrade = () => this.applyUpgrade(upgrade);
      const setHover = (active) => {
        glow.setAlpha(active ? 0.26 : 0.1);
        watermark.setAlpha(active ? 0.18 : isRecruit ? 0.08 : 0.1);
        if (ownerCharacter) {
          ownerCharacter.setAlpha(active ? 1 : 0.96);
        }
        chooseBg.setFillStyle(active ? accent : 0x101820, active ? 0.34 : 0.9);
        if (active) {
          card.setTint(0xfff1c0);
        } else {
          card.clearTint();
        }
      };

      hit.setInteractive({ useHandCursor: true });
      hit.on("pointerdown", selectUpgrade);
      hit.on("pointerover", () => setHover(true));
      hit.on("pointerout", () => setHover(false));
      [icon, chooseBg, chooseText].forEach((item) => {
        item.setInteractive({ useHandCursor: true });
        item.on("pointerdown", selectUpgrade);
        item.on("pointerover", () => setHover(true));
        item.on("pointerout", () => setHover(false));
      });
      [...animated, hit].forEach((item) => this.overlayObjects.push(item));
    }

    getUpgradeCharacterKey(id) {
      const map = {
        barrage: "character-b-up",
        barrel: "character-b-right",
        frost: "character-d-up",
        pierce: "character-c-up",
        rally: "character-a-up",
        repair: "character-e-right",
        squad: "character-d-right"
      };
      return map[id] || "character-c-up";
    }

    applyUpgrade(upgrade) {
      if (this.mode !== "skill") {
        return;
      }
      this.unlockAudio();
      this.playSfx("skill");
      upgrade.apply();
      this.clearOverlay();
      this.mode = "playing";
      const accent = upgrade.accent || SKILL_ACCENTS[upgrade.id] || COLORS.gold;
      this.createScreenPulse(accent);
      this.showToast(upgrade.toast || `${upgrade.title} 적용`, accent);
      this.updateHud();
    }

    gameOver() {
      if (this.mode === "gameover") {
        return;
      }
      this.mode = "gameover";
      this.cancelRunTimers();
      this.cancelSceneTimers();
      this.clearTransientObjects();
      this.startBgm("menu");
      const earnedCoins = this.bankRunCoins();
      this.clearRunEntities();
      this.clearOverlay();
      const items = this.overlayObjects;
      items.push(this.add.image(270, 480, "skill-choice-backdrop").setDisplaySize(540, 960).setAlpha(0.72).setDepth(540));
      items.push(this.add.rectangle(270, 480, 540, 960, 0x030405, 0.64).setDepth(541));
      items.push(this.add.rectangle(270, 412, 392, 224, 0x0d151b, 0.9).setStrokeStyle(2, 0xff6b68, 0.8).setDepth(542));
      items.push(this.add.rectangle(270, 326, 300, 4, 0xff6b68, 0.9).setDepth(543));
      items.push(this.add.text(270, 366, "방어선 붕괴", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 42,
        fontStyle: "900",
        color: "#ff6b68",
        stroke: "#050607",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(544));
      items.push(this.add.text(270, 418, `Lv.${this.level} · 처치 ${this.kills}`, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 24,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(544));
      items.push(this.add.text(270, 462, `획득 $${earnedCoins} · 보유 $${this.meta.coins}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffd86b",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(544));
      this.addOverlayButton(164, 532, 164, 50, "다시 방어", 545, () => this.startRun(), COLORS.gold);
      this.addOverlayButton(376, 532, 164, 50, "상점", 545, () => this.showShop(), COLORS.blue);
    }

    clearOverlay() {
      this.overlayObjects.forEach((item) => {
        this.destroyGameObject(item);
      });
      this.overlayObjects = [];
    }

    updateHud() {
      const minutes = Math.floor(this.elapsed / 60);
      const seconds = Math.floor(this.elapsed % 60);
      this.ui.timer.setText(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
      const stageName = ["교문", "복도", "교실", "옥상"][Math.min(3, this.stage - 1)];
      this.ui.stage.setText(`St.${this.stage} - ${stageName}`);
      this.ui.level.setText(`Lv.${this.level}`);
      this.ui.morale.setText(`M${this.morale}%`);
      this.ui.morale.setColor(this.morale < 35 ? "#ff524f" : this.morale < 70 ? "#ffd75c" : "#4dff67");
      this.ui.core.setText(`HP ${Math.round(this.coreHp)} / ${this.maxCoreHp}`);
      this.ui.coins.setText(`$${this.coins}`);
      this.ui.shield.setText(`S${Math.round(this.shield)}`);
      const progress = clamp(this.killsInLevel / this.levelNeed, 0, 1);
      this.progressBar.setSize(508 * progress, 6);
      this.progressBar.setFillStyle(this.mode === "skill" ? COLORS.gold : 0xe0ab26, 1);
      const hpRate = clamp(this.coreHp / this.maxCoreHp, 0, 1);
      this.coreBar.setSize(330 * hpRate, 6);
      this.coreBar.setFillStyle(hpRate < 0.35 ? COLORS.red : hpRate < 0.68 ? COLORS.gold : COLORS.green, 1);
    }
  }

  if (!window.Phaser) {
    const root = document.getElementById("game-root");
    if (root) {
      root.innerHTML = '<div class="loading">Phaser 4 로드에 실패했습니다.</div>';
    }
    return;
  }

  function installResponsiveViewport(game) {
    if (typeof window.__schoolZombieViewportCleanup === "function") {
      window.__schoolZombieViewportCleanup();
    }
    const rootStyle = document.documentElement.style;
    const shell = document.getElementById("game-shell");
    let raf = 0;
    let refreshRaf = 0;
    const settleTimers = new Set();
    let observer = null;

    const getViewportSize = () => {
      const viewport = window.visualViewport;
      return {
        width: Math.max(1, Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || GAME_WIDTH)),
        height: Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || GAME_HEIGHT))
      };
    };

    const scheduleTimer = (callback, delay) => {
      const timer = window.setTimeout(() => {
        settleTimers.delete(timer);
        callback();
      }, delay);
      settleTimers.add(timer);
      return timer;
    };

    const apply = () => {
      raf = 0;
      const { width, height } = getViewportSize();
      rootStyle.setProperty("--game-viewport-width", `${width}px`);
      rootStyle.setProperty("--game-viewport-height", `${height}px`);

      if (refreshRaf) {
        cancelAnimationFrame(refreshRaf);
      }
      refreshRaf = requestAnimationFrame(() => {
        refreshRaf = 0;
        const canvas = game.canvas || game.scale?.canvas || document.querySelector("#game-root canvas");
        if (!canvas?.style) {
          scheduleTimer(schedule, 80);
          return;
        }
        if (game.scale?.refresh) {
          try {
            game.scale.refresh();
          } catch (error) {
            scheduleTimer(schedule, 120);
          }
        }
      });
    };

    const schedule = () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
      raf = requestAnimationFrame(apply);
    };

    const scheduleSettled = () => {
      schedule();
      [90, 240, 520].forEach((delay) => scheduleTimer(schedule, delay));
    };

    scheduleSettled();
    window.addEventListener("resize", scheduleSettled, { passive: true });
    window.addEventListener("orientationchange", scheduleSettled, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleSettled, { passive: true });
      window.visualViewport.addEventListener("scroll", schedule, { passive: true });
    }
    if (shell && window.ResizeObserver) {
      observer = new ResizeObserver(schedule);
      observer.observe(shell);
    }
    window.__schoolZombieResizeObserver = observer;
    window.__schoolZombieViewportCleanup = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (refreshRaf) {
        cancelAnimationFrame(refreshRaf);
        refreshRaf = 0;
      }
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      settleTimers.clear();
      window.removeEventListener("resize", scheduleSettled);
      window.removeEventListener("orientationchange", scheduleSettled);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", scheduleSettled);
        window.visualViewport.removeEventListener("scroll", schedule);
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      window.__schoolZombieResizeObserver = null;
      window.__schoolZombieViewportCleanup = null;
    };
  }

  const config = {
    type: Phaser.AUTO,
    parent: "game-root",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#101418",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    input: {
      activePointers: 4
    },
    render: {
      antialias: true,
      pixelArt: false
    },
    scene: [BootScene, GameScene]
  };

  window.__schoolZombiePhaserVersion = Phaser.VERSION;
  window.__schoolZombieDefense = new Phaser.Game(config);
  installResponsiveViewport(window.__schoolZombieDefense);
})();
