(function () {
  "use strict";

  const SchoolI18n = window.SchoolI18n;
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
  const UI_COLORS = {
    void: 0x11120f,
    panel: 0x20221d,
    panelRaised: 0x2c2e26,
    panelHover: 0x3c3e31,
    steel: 0x767465,
    chalk: 0xeee6d2,
    olive: 0x9ba38a,
    amber: 0xc6a564,
    danger: 0xb97059,
    success: 0x99ad80,
    muted: 0xb4b2a0
  };
  function fieldAccent(color) {
    if (color === COLORS.blue || color === 0x8deeff) return UI_COLORS.olive;
    if (color === COLORS.gold) return UI_COLORS.amber;
    if (color === COLORS.red || color === 0xf15a47) return UI_COLORS.danger;
    if (color === COLORS.green) return UI_COLORS.success;
    const channel = (shift, base) => Math.round(((color >> shift) & 255) * 0.58 + base * 0.42);
    return (channel(16, 163) << 16) | (channel(8, 151) << 8) | channel(0, 123);
  }

  const GAME_SPEED_STEPS = [1, 1.5, 2];
  const DEFAULT_GAME_SPEED = GAME_SPEED_STEPS[0];
  const SKILL_REROLL_BASE_COST = 5;

  const {
    clamp,
    rand,
    formatGameSpeedLabel,
    formatRunClock,
    choose,
    shuffleItems
  } = window.SchoolZombieCore;
  const zombieMotion = window.SchoolZombieMotion;
  const zombieMotionData = window.SchoolZombieMotionData;
  const announceGameStatus = (message) => {
    const status = document.getElementById("game-a11y-status");
    if (status) {
      status.textContent = String(message || "");
    }
  };
  const SUPPORTS_WEBP = (() => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      return false;
    }
  })();
  const imageAsset = (path) => {
    return SUPPORTS_WEBP ? path.replace(/\.png$/i, ".webp") : path;
  };
  const ZOMBIE_ASSET_VERSION = "20261004-proportions-v2";
  const CHARACTER_ASSET_VERSION = "20260718-bow-video-directions-v14";
  const CHARACTER_CONTINUITY_ASSET_VERSION = "20261004-character-continuity-v1";
  const FIREBOMB_RECOVERY_ASSET_VERSION = "20261002-firebomb-recovery-v1";
  const CROSSBOW_ASSET_VERSION = "20261004-crossbow-directions-v2";
  const CROSSBOW_AUDIO_VERSION = "20260719-freesound-crossbow-firing-v1";
  const TURRET_ASSET_VERSION = "20260712-turret-v2";
  const COMBAT_EFFECT_ASSET_VERSION = "20260712-combat-fx-v2";
  const COMBAT_PROP_ASSET_VERSION = "20260712-combat-props-v2";
  const ALLIED_WEAPON_ASSET_VERSION = "20260912-allied-weapons-v1";
  const versionedImageAsset = (path, version) => {
    const resolvedPath = imageAsset(path);
    return version ? `${resolvedPath}?v=${encodeURIComponent(version)}` : resolvedPath;
  };
  const RUN_LOADING_OVERLAY_ID = "run-loading-overlay";
  const RUN_LOADING_TEXT_SELECTOR = "[data-run-loading-text]";
  const showRunLoadingOverlay = (message = SchoolI18n.t("loading.sortie")) => {
    const root = document.getElementById("game-root");
    if (!root) {
      return null;
    }
    let overlay = document.getElementById(RUN_LOADING_OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = RUN_LOADING_OVERLAY_ID;
      overlay.className = "run-loading";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = `
        <div class="run-loading__art" aria-hidden="true"></div>
        <div class="run-loading__panel">
          <div class="run-loading__signal" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="run-loading__kicker">SORTIE READY</div>
          <div class="run-loading__title"></div>
          <div class="run-loading__text" data-run-loading-text></div>
          <div class="run-loading__bar" aria-hidden="true"><span></span></div>
        </div>`;
      root.appendChild(overlay);
    }
    const title = overlay.querySelector(".run-loading__title");
    if (title) title.textContent = SchoolI18n.t("loading.sortie");
    overlay.classList.remove("run-loading--hide");
    overlay.querySelector(RUN_LOADING_TEXT_SELECTOR).textContent = message;
    return overlay;
  };
  const updateRunLoadingOverlay = (message) => {
    const overlay = document.getElementById(RUN_LOADING_OVERLAY_ID);
    const text = overlay?.querySelector(RUN_LOADING_TEXT_SELECTOR);
    if (text) {
      text.textContent = message;
    }
  };
  const hideRunLoadingOverlay = () => {
    const overlay = document.getElementById(RUN_LOADING_OVERLAY_ID);
    if (!overlay) {
      return;
    }
    overlay.classList.add("run-loading--hide");
    window.setTimeout(() => {
      if (overlay.parentNode && overlay.classList.contains("run-loading--hide")) {
        overlay.remove();
      }
    }, 220);
  };
  const waitForRenderFrames = (count = 2) => new Promise((resolve) => {
    let remaining = Math.max(1, count);
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  });
  const TEAM_BASE_DAMAGE = 28;
  const getTeamDamageForLevel = () => TEAM_BASE_DAMAGE;
  const BASE_CRIT_CHANCE = 0.08;
  const DEFAULT_CRIT_MULTIPLIER = 1.85;
  const BOW_BASE_CRIT_CHANCE = 0.3;
  const BOW_MARK_DURATION = 6.5;
  const BOW_MARK_DAMAGE_BONUS = 0.18;
  const ARROW_EMBED_DURATION = 2.8;
  const SHOCK_STUN_TINT = 0xbdfaff;
  const DEFAULT_SHOCK_STUN_DURATION = 2;
  const SHOCK_STUN_SKILL_GAIN = 0.25;
  const SHOCK_STUN_SKILL_MAX = 4;
  const SHOCK_STUN_SKILL_OFFER_LIMIT = SHOCK_STUN_SKILL_MAX - SHOCK_STUN_SKILL_GAIN;
  const FIRE_ZONE_VISUAL_DURATION_MULTIPLIER = 3.125;
  const FIRE_ZONE_VISUAL_SIZE_MULTIPLIER = 1.5;
  const FIRE_ZONE_MIN_BURN_DURATION = 0.65;
  const ZOMBIE_WALL_VISUAL_PADDING = 56;
  const AIM_FORWARD_SNAP_ANGLE = Math.PI / 18;
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
  // World-space offsets measured from each defender's planted sprite origin
  // to the visible weapon/throw release point in all nine direction cells.
  // The commercial character sheets do not share one circular muzzle arc, so
  // a single pivot/reach pair cannot keep effects attached in every pose.
  const CHARACTER_MUZZLE_OFFSETS = {
    a: [[-57, -143], [-38, -176], [-38, -181], [-22, -185], [8, -175], [22, -185], [38, -181], [38, -176], [57, -143]],
    b: [[-31, -176], [-37, -192], [-32, -198], [-23, -194], [2, -210], [24, -195], [34, -198], [39, -189], [32, -179]],
    c: [[-28, -182], [-38, -209], [-24, -210], [-15, -215], [0, -215], [15, -215], [28, -212], [34, -210], [28, -183]],
    d: [[-36, -172], [-30, -183], [-25, -193], [-15, -198], [2, -198], [18, -196], [30, -193], [31, -180], [41, -171]],
    e: [[-33, -154], [-30, -160], [-40, -163], [-34, -172], [2, -180], [23, -175], [30, -167], [30, -158], [33, -151]],
    f: [[-52, -150], [-58, -142], [-65, -158], [-31, -141], [32, -147], [32, -140], [64, -157], [58, -142], [52, -150]],
    g: [[-36, -159], [-40, -198], [-21, -199], [-15, -204], [0, -205], [17, -203], [27, -200], [33, -192], [36, -161]],
    h: [[-32, -174], [-39, -187], [-23, -203], [-14, -208], [0, -211], [21, -211], [32, -206], [39, -190], [36, -176]]
  };
  // E's recoil frames swing the rifle sideways by up to ~17 px, so the release
  // frame's muzzle would float in empty air while the flash is still alive.
  // These per-frame barrel tips keep the flash on the rifle as the frames play.
  const CHARACTER_FRAME_MUZZLE_OFFSETS = {
    e: {
      1: [[-34, -154], [-32, -160], [-42, -163], [-26, -172], [-15, -180], [30, -175], [41, -167], [30, -158], [36, -151]],
      2: [[-23, -154], [-31, -160], [-42, -163], [-27, -172], [-15, -180], [23, -175], [30, -167], [30, -158], [34, -151]]
    }
  };
  // Some bullet art keeps transparent padding below its visible tail. Anchor
  // those sprites at the visible tail so the bullet starts on the barrel tip.
  const PROJECTILE_TAIL_ORIGINS = {
    "projectile-sniper": 0.83
  };
  const DIRECTIONAL_MUZZLE_EFFECT_DEFENDERS = new Set(["b", "c", "d", "e", "g", "h"]);
  const CHARACTER_MUZZLE_EFFECT_ANGLE_OVERRIDES = {
    // G's commercial cannon art intentionally has a tighter visible arc than
    // its target-selection arc. These measured barrel axes keep the discharge
    // flash attached to the cannon while projectile physics still aim true.
    g: [-117.3, -116.2, -105.8, -100.8, -86.3, -81.9, -75.5, -66.8, -56.7]
      .map((degrees) => degrees * Math.PI / 180)
  };
  const THROW_ANIMATION_FRAMES = 4;
  const THROW_ANIMATION_FRAME_DURATION = 0.075;
  const CHARACTER_ATTACK_FRAME_DURATIONS = {
    // Give the crossbow a readable aim, a crisp release, and a softer recovery
    // while keeping the projectile release at roughly the original 150 ms beat.
    a: [0.045, 0.11, 0.045, 0.09],
    // Preserve the 150 ms release and add a shoulder-height return before ready.
    f: [0.075, 0.075, 0.075, 0.075, 0.12]
  };
  const CHARACTER_RECOVERY_BLEND_DURATIONS = {
    a: 70,
    b: 70,
    c: 80,
    d: 70,
    e: 70,
    f: 90,
    g: 50,
    h: 70
  };
  // Cross-dissolve the previous drawing into the next one (ready -> first
  // attack frame, then frame -> frame) so aiming and firing read as motion
  // instead of a cut. Turning toward a new target stretches the first blend.
  const CHARACTER_FRAME_BLEND_DURATIONS = {
    b: 55,
    c: 65,
    d: 55,
    e: 65,
    h: 55
  };
  const CHARACTER_TURN_BLEND_SCALE = 1.6;
  // Use the same drawing for ready/attack transitions. In particular, F's
  // old ready sheet holds the bottle in the opposite hand for leftward throws.
  const CHARACTER_READY_SOURCE_FRAMES = { c: 0, f: 0, g: 1, h: 0 };
  const AIM_ALIASES = {
    idle: "aim-12",
    left: "aim-1030",
    up: "aim-12",
    right: "aim-1330"
  };
  const CHARACTER_ATTACK_ACTIONS = {
    a: "attack",
    b: "attack",
    c: "attack",
    d: "attack",
    e: "attack",
    f: "throw",
    g: "attack",
    h: "attack"
  };
  const CHARACTER_ATTACK_FRAME_ZERO_ALIASES = new Set(["a", "b", "d", "e"]);
  const CHARACTER_ATTACK_DIRECTION_LOCKS = new Set(["a"]);
  const CHARACTER_ATTACK_RELEASE_FRAMES = {
    a: 2,
    d: 1,
    f: 2,
    g: 1
  };
  const CHARACTER_ACTION_HEIGHT_SCALE = {
    a: 1.2,
    b: 1,
    c: 1,
    d: 1,
    e: 1,
    f: 1,
    g: 1,
    h: 1
  };
  const PROJECTILE_SCALES = {
    "projectile-arrow": 0.228,
    "projectile-pistol": 0.032,
    "projectile-rifle": 0.08,
    "projectile-grenade": 0.23,
    "projectile-rocket": 0.19,
    "projectile-sniper": 0.16,
    "projectile-frost": 0.78,
    "projectile-firebomb": 0.26,
    "projectile-shock": 0.48,
    "projectile-nail": 0.22
  };
  const EMBEDDED_PROJECTILES = {
    "projectile-arrow": {
      texture: "projectile-arrow",
      scale: PROJECTILE_SCALES["projectile-arrow"],
      embedRatio: 0.28,
      minEmbed: 8,
      maxEmbed: 14,
      alpha: 0.95,
      depthOffset: -0.5,
      horizontal: true,
      life: ARROW_EMBED_DURATION
    }
  };
  const ROCKET_ACCELERATION = {
    startScale: 0.28,
    endScale: 1.35,
    rampDuration: 0.58
  };
  const MUZZLE_EFFECTS = {
    // Anchor the bright ignition point to the barrel, leaving smoke behind it.
    // Sizes and alpha are tuned so the flash still reads on the dark field.
    "projectile-arrow": { texture: "muzzle-arrow", width: 52, duration: 160, alpha: 0.9, scalePeak: 1.18, originX: 0.18 },
    "projectile-pistol": { texture: "muzzle-pistol", width: 52, duration: 150, alpha: 1, scalePeak: 1.28, originX: 0.34 },
    "projectile-rifle": { texture: "muzzle-rifle", width: 64, duration: 140, alpha: 1, scalePeak: 1.24, originX: 0.25 },
    "projectile-sniper": { texture: "muzzle-sniper", width: 78, duration: 160, alpha: 1, scalePeak: 1.22, originX: 0.2 },
    "projectile-rocket": { texture: "muzzle-rocket", width: 88, duration: 210, alpha: 1, scalePeak: 1.14, originX: 0.35 }
  };
  // A short white-hot core at the hotspot keeps the flash visible even when
  // the sprite itself is small.
  const MUZZLE_CORE = { radiusRatio: 0.12, color: 0xfff4c2, alpha: 0.95, scalePeak: 2.3, durationRatio: 0.75 };
  const ZOMBIE_HIT_EFFECTS = {
    "projectile-arrow": { texture: "zombie-hit-arrow-sheet", width: 42, duration: 210, alpha: 0.94, scalePeak: 1.03, rotation: 0.08, frameWidth: 96, frameHeight: 96, frames: 12 },
    "projectile-pistol": { texture: "zombie-hit-pistol-sheet", width: 54, duration: 220, alpha: 0.96, scalePeak: 1.05, rotation: 0.1, frameWidth: 112, frameHeight: 96, frames: 12 },
    "projectile-rifle": { texture: "zombie-hit-rifle-sheet", width: 72, duration: 235, alpha: 0.96, scalePeak: 1.06, rotation: 0.12, frameWidth: 140, frameHeight: 100, frames: 14 },
    "projectile-sniper": { texture: "zombie-hit-sniper-sheet", width: 132, duration: 285, alpha: 0.9, scalePeak: 1.1, rotation: 0.16, originX: 0.24, frameWidth: 150, frameHeight: 104, frames: 16 },
    "projectile-rocket": { texture: "zombie-hit-rocket-sheet", width: 116, duration: 300, alpha: 0.96, scalePeak: 1.08, rotation: 0.12, frameWidth: 160, frameHeight: 130, frames: 16 },
    "projectile-nail": { texture: "zombie-hit-nail-sheet", width: 52, duration: 195, alpha: 0.95, scalePeak: 1.04, rotation: 0.08, frameWidth: 128, frameHeight: 128, frames: 12 },
    explosion: { texture: "zombie-hit-rocket-sheet", width: 128, duration: 330, alpha: 0.94, scalePeak: 1.12, rotation: 0.18, frameWidth: 160, frameHeight: 130, frames: 16 },
    default: { texture: "zombie-hit-pistol-sheet", width: 52, duration: 215, alpha: 0.92, scalePeak: 1.04, rotation: 0.1, frameWidth: 112, frameHeight: 96, frames: 12 }
  };
  const ZOMBIE_HIT_EFFECT_SIZE_MULTIPLIER = 1.15;
  const FIRE_ZONE_ANIMATION_FRAMES = 8;
  const SHOCK_EFFECT_OUTER_COLOR = 0x8f9dff;
  const CHARGER_CHARGE_TINT = 0xffcf9e;
  const CHARGER_SURGE_TINT = 0xffa45c;
  const ZOMBIE_CORPSE_EFFECTS = {
    small: { stainWidth: 54, stainHeight: 34, fall: 250, corpseHold: 24000, corpseFade: 650 },
    normal: { stainWidth: 70, stainHeight: 42, fall: 285, corpseHold: 24000, corpseFade: 700 },
    elite: { stainWidth: 90, stainHeight: 54, fall: 340, corpseHold: 24000, corpseFade: 800 }
  };
  const BLOOD_STAIN_SIZE_MULTIPLIER = 2;
  const BLOOD_STAIN_TEXTURES = [
    "blood-stain-pool-1",
    "blood-stain-pool-2",
    "blood-stain-smear-1",
    "blood-stain-splatter-1",
    "blood-stain-direction-1",
    "blood-stain-heavy-1"
  ];
  const BLOOD_STAIN_TEXTURES_BY_HIT = {
    "projectile-arrow": ["blood-stain-direction-1", "blood-stain-smear-1", "blood-stain-splatter-1"],
    "projectile-pistol": ["blood-stain-splatter-1", "blood-stain-pool-1", "blood-stain-direction-1"],
    "projectile-rifle": ["blood-stain-direction-1", "blood-stain-splatter-1", "blood-stain-smear-1"],
    "projectile-sniper": ["blood-stain-direction-1", "blood-stain-splatter-1", "blood-stain-heavy-1"],
    "projectile-rocket": ["blood-stain-heavy-1", "blood-stain-pool-2", "blood-stain-splatter-1"],
    "projectile-firebomb": ["blood-stain-heavy-1", "blood-stain-pool-2", "blood-stain-smear-1"],
    "projectile-shock": ["blood-stain-pool-1", "blood-stain-smear-1", "blood-stain-splatter-1"],
    "projectile-nail": ["blood-stain-direction-1", "blood-stain-splatter-1", "blood-stain-pool-1"],
    explosion: ["blood-stain-heavy-1", "blood-stain-pool-2", "blood-stain-splatter-1"]
  };
  // Alpha-weighted centers keep each irregular blood texture centered on the corpse anchor.
  const BLOOD_STAIN_ALPHA_ORIGINS = {
    "blood-stain-direction-1": { x: 0.3823, y: 0.5136 },
    "blood-stain-heavy-1": { x: 0.4626, y: 0.4855 },
    "blood-stain-pool-1": { x: 0.5114, y: 0.4252 },
    "blood-stain-pool-2": { x: 0.5104, y: 0.4867 },
    "blood-stain-smear-1": { x: 0.3613, y: 0.5537 },
    "blood-stain-splatter-1": { x: 0.5033, y: 0.4964 },
    "blood-burst-core": { x: 0.4996, y: 0.4497 }
  };
  const ZOMBIE_DEATH_ANIMATION_FRAMES = 4;
  const NORMAL_ZOMBIE_DEATH_ANIMATION_FRAMES = 12;
  const ZOMBIE_DEATH_ANIMATION_FRAME_SIZE = 512;
  // Carry the lethal hit into the fall while keeping extreme knockback inside the combat lane.
  const ZOMBIE_DEATH_VERTICAL_KNOCKBACK_SCALE = 1;
  const ZOMBIE_DEATH_VERTICAL_KNOCKBACK_LIMIT_RATIO = 0.35;
  const ZOMBIE_DEATH_LANDING_RISE_LIMIT_RATIO = 0.28;
  const ZOMBIE_DEATH_TYPES = [
    "normal",
    "student",
    "runner",
    "brute",
    "volatile",
    "elite",
    "teacher",
    "nurse",
    "diva",
    "athlete",
    "janitor",
    "guard",
    "crawler",
    "screamer",
    "spider",
    "bloom",
    "charger"
  ];
  const ZOMBIE_DEATH_TEXTURES = Object.fromEntries(
    ZOMBIE_DEATH_TYPES.map((type) => [
      type,
      type === "normal"
        ? [1, 2, 3, 4].map((index) => `zombie-death-normal-variant-${index}-sheet`)
        : type === "student"
          ? [1, 2, 3].map((index) => `zombie-death-student-${index}-sheet`)
          : [`zombie-death-${type}-sheet`]
    ])
  );
  // Alpha-weighted final-frame centers and opaque bounds, normalized to each 512px death frame.
  const ZOMBIE_DEATH_FINAL_FRAME_BOUNDS = {
    "zombie-death-athlete-sheet": { x: -0.0186, y: 0.332, width: 0.7051, height: 0.2383 },
    "zombie-death-bloom-sheet": { x: -0.0135, y: 0.0588, width: 0.8594, height: 0.2656 },
    "zombie-death-brute-sheet": { x: -0.0139, y: 0.0022, width: 0.5742, height: 0.3145 },
    "zombie-death-charger-sheet": { x: -0.0425, y: 0.3623, width: 0.7324, height: 0.2324 },
    "zombie-death-crawler-sheet": { x: -0.0205, y: 0.0669, width: 0.8184, height: 0.4668 },
    "zombie-death-diva-sheet": { x: -0.0364, y: 0.3556, width: 0.5508, height: 0.1719 },
    "zombie-death-elite-sheet": { x: -0.0221, y: 0.0018, width: 0.6172, height: 0.3438 },
    "zombie-death-guard-sheet": { x: -0.0106, y: 0.0836, width: 0.7227, height: 0.1992 },
    "zombie-death-janitor-sheet": { x: -0.0484, y: 0.0621, width: 0.7695, height: 0.2363 },
    "zombie-death-normal-variant-1-sheet": { x: 0.0444, y: 0.2937, width: 0.7617, height: 0.2539 },
    "zombie-death-normal-variant-2-sheet": { x: 0.019, y: 0.2912, width: 0.7188, height: 0.2812 },
    "zombie-death-normal-variant-3-sheet": { x: 0.0435, y: 0.3308, width: 0.7129, height: 0.1914 },
    "zombie-death-normal-variant-4-sheet": { x: 0.0248, y: 0.2632, width: 0.7246, height: 0.2402 },
    "zombie-death-nurse-sheet": { x: -0.0429, y: 0.333, width: 0.8301, height: 0.2559 },
    "zombie-death-runner-sheet": { x: -0.0488, y: 0.3196, width: 0.791, height: 0.2734 },
    "zombie-death-screamer-sheet": { x: -0.0425, y: 0.0709, width: 0.7012, height: 0.2148 },
    "zombie-death-spider-sheet": { x: 0.0139, y: 0.05, width: 0.8652, height: 0.459 },
    "zombie-death-student-1-sheet": { x: -0.0486, y: 0.0409, width: 0.8496, height: 0.3535 },
    "zombie-death-student-2-sheet": { x: 0.0645, y: 0.0463, width: 0.8652, height: 0.3594 },
    "zombie-death-student-3-sheet": { x: -0.093, y: 0.0404, width: 0.8906, height: 0.3418 },
    "zombie-death-teacher-sheet": { x: -0.0297, y: 0.0403, width: 0.8594, height: 0.3027 },
    "zombie-death-volatile-sheet": { x: -0.0098, y: -0.0037, width: 0.5977, height: 0.3418 }
  };
  const ZOMBIE_DEATH_RENDER_SCALES = {
    // Match the first visible death pose to the alpha-bounded size of the walk cycle.
    // Repaint imports bake original pose corrections into the pixels; these
    // factors restore their anatomical size from the padded atlas cells.
    normal: { deathSize: 1.35 },
    student: { deathSize: 1.01 },
    runner: { deathSize: 1 },
    brute: { deathSize: 1.16 },
    volatile: { deathSize: 0.99 },
    elite: { deathSize: 1.05 },
    teacher: { deathSize: 1.35 },
    nurse: { deathSize: 1 },
    diva: { deathSize: 1.25 },
    athlete: { deathSize: 1.35 },
    janitor: { deathSize: 1.5 },
    guard: { deathSize: 1.35 },
    crawler: { deathSize: 1 },
    screamer: { deathSize: 1.23 },
    spider: { deathSize: 1 },
    bloom: { deathSize: 1.13 },
    charger: { deathSize: 1 }
  };
  const ZOMBIE_FOOT_OFFSET_RATIOS = {
    normal: 0.386,
    student: 0.395,
    runner: 0.392,
    brute: 0.414,
    volatile: 0.392,
    elite: 0.402,
    teacher: 0.394,
    nurse: 0.39,
    diva: 0.39,
    athlete: 0.384,
    janitor: 0.41,
    guard: 0.408,
    crawler: 0.235,
    screamer: 0.392,
    spider: 0.225,
    bloom: 0.392,
    charger: 0.408
  };
  const ZOMBIE_HP_MULTIPLIER = 3;
  const ZOMBIE_SPAWN_INTERVAL_MULTIPLIER = 2.4;
  const ZOMBIE_SPAWN_COUNT_MULTIPLIER = 0.75;
  const ZOMBIE_LEVEL_HP_EXPONENT = 0.88;
  const ZOMBIE_NORMAL_LEVEL_HP_GAIN = 8.2;
  const ZOMBIE_ELITE_LEVEL_HP_GAIN = 20.5;
  const ZOMBIE_NORMAL_LATE_HP_GAIN = 0.6;
  const ZOMBIE_ELITE_LATE_HP_GAIN = 2.6;
  const ZOMBIE_BODY_DEPTH_BASE = 70;
  const ZOMBIE_CORPSE_GROUND_DEPTH_BASE = 25;
  const ZOMBIE_CORPSE_GROUND_DEPTH_RANGE = 8;
  const ZOMBIE_CORPSE_DEPTH_BASE = 34;
  const ZOMBIE_CORPSE_DEPTH_RANGE = 18;
  const ZOMBIE_HIT_GRID_SIZE = 96;
  const ZOMBIE_HIT_GRID_PADDING = 88;
  const ZOMBIE_SEPARATION_RADIUS_SCALE = 0.9;
  const ZOMBIE_SEPARATION_PUSH = 0.34;
  const ZOMBIE_SEPARATION_MAX_STEP = 16;
  const ZOMBIE_FRONT_BLOCK_X_SCALE = 0.86;
  const ZOMBIE_FRONT_BLOCK_Y_GAP_SCALE = 0.48;
  const ZOMBIE_FRONT_BLOCK_LOOKAHEAD = 46;
  const ZOMBIE_FRONT_TIE_EPSILON = 2;
  const ZOMBIE_SIDE_STEP_SPEED = 72;
  const DAMAGE_TEXT_POOL_LIMIT = 64;
  const ACTIVE_DAMAGE_TEXT_LIMIT = 46;
  const DAMAGE_TEXT_FRAME_BUDGET = 12;
  const ACTIVE_HIT_EFFECT_LIMIT = 58;
  const HIT_EFFECT_FRAME_BUDGET = 16;
  const FIRE_TICK_EFFECT_FRAME_BUDGET = 8;
  const BARRICADE_IMPACT_DISPLAY_WIDTH = 240;
  const BARRICADE_IMPACT_DURATION = 320;
  const BARRICADE_FRAGMENT_LIMIT = 30;
  const BARRICADE_WOOD_FRAGMENT_MIN = 3;
  const BARRICADE_WOOD_FRAGMENT_MAX = 5;
  const BARRICADE_METAL_FRAGMENT_MIN = 1;
  const BARRICADE_METAL_FRAGMENT_MAX = 2;
  const ACTIVE_CORPSE_LIMIT = 34;
  const CORPSE_TRIM_FADE_DURATION = 260;
  const getLevelNeedForLevel = (level) => Math.max(4, Math.round((level === 1 ? 12 : 15 + level * 4.4) / ZOMBIE_SPAWN_INTERVAL_MULTIPLIER));
  const STARTING_LEVEL_NEED = getLevelNeedForLevel(1);
  const STARTING_SPAWN_TIMER = 1.15;
  const WEAPON_FIRE_INTERVAL_MULTIPLIER = 2;
  const WEAPON_DAMAGE_EXTRA_MULTIPLIER = 1.1;
  const CHARACTER_FIRE_COOLDOWN_MULTIPLIER = 1.3 * WEAPON_FIRE_INTERVAL_MULTIPLIER;
  const CHARACTER_DAMAGE_MULTIPLIER = WEAPON_FIRE_INTERVAL_MULTIPLIER * WEAPON_DAMAGE_EXTRA_MULTIPLIER;
  const scaleWeaponInterval = (value) => value * WEAPON_FIRE_INTERVAL_MULTIPLIER;
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
    grenade_fire: "assets/sounds/sfx/grenade_fire.mp3",
    arrow: `assets/sounds/sfx/arrow.mp3?v=${encodeURIComponent(CROSSBOW_AUDIO_VERSION)}`,
    firebomb_fire: "assets/sounds/sfx/firebomb_fire.mp3",
    firebomb_hit: "assets/sounds/sfx/firebomb_hit.mp3",
    shock_fire: "assets/sounds/sfx/shock_fire.mp3",
    shock_hit: "assets/sounds/sfx/shock_hit.mp3",
    nailgun_fire: "assets/sounds/sfx/nailgun_fire.mp3",
    nailgun_hit: "assets/sounds/sfx/nailgun_hit.mp3",
    purchase: "assets/sounds/sfx/purchase.mp3",
    shield_block: "assets/sounds/sfx/shield_block.mp3",
    death_elite: "assets/sounds/sfx/death_elite.mp3",
    explosion_large: "assets/sounds/sfx/explosion_large.mp3",
    core_full_repair: "assets/sounds/sfx/core_full_repair.mp3",
    shop_open: "assets/sounds/sfx/shop_open.mp3",
    upgrade_maxed: "assets/sounds/sfx/upgrade_maxed.mp3",
    button: "assets/sounds/sfx/button.mp3",
    denied: "assets/sounds/sfx/denied.mp3",
    recruit: "assets/sounds/sfx/recruit.mp3",
    wave_clear: "assets/sounds/sfx/wave_clear.mp3",
    game_over: "assets/sounds/sfx/game_over.mp3",
    coin: "assets/sounds/sfx/coin.wav",
    pause: "assets/sounds/sfx/pause.wav"
  };
  const GAMEPLAY_TIMING_SFX = [
    "hit",
    "crit",
    "explosion",
    "pistol",
    "rifle",
    "sniper",
    "rocket",
    "grenade_fire",
    "arrow",
    "firebomb_fire",
    "firebomb_hit",
    "shock_fire",
    "shock_hit",
    "nailgun_fire",
    "nailgun_hit",
    "shield_block",
    "death_elite",
    "explosion_large"
  ];
  const GAMEPLAY_TIMING_SFX_SET = new Set(GAMEPLAY_TIMING_SFX);
  const GAME_START_SFX_READY_TIMEOUT = 240;
  const WEAPON_SFX_INTENSITY = {
    pistol: 0.38,
    rifle: 1,
    sniper: 1.3,
    rocket: 1,
    grenade_fire: 0.72,
    arrow: 1.18,
    firebomb_fire: 0.74,
    shock_fire: 0.82,
    nailgun_fire: 0.78
  };
  const BGM_ASSETS = {
    menu: "assets/sounds/bgm/menu_loop.mp3",
    game: "assets/sounds/bgm/game_loop.mp3"
  };
  const AMBIENT_ASSETS = {
    zombie: "assets/sounds/bgm/zombie_ambient.mp3"
  };
  const BGM_VOLUME = 0.18;
  const ZOMBIE_AMBIENT_VOLUME = 0.1;
  const META_SAVE_KEY = "schoolZombieDefenseMetaV1";
  const META_CACHE_KEY = "schoolZombieDefenseMetaServerCacheV1";
  const PROFILE_AUTH_KEY = "schoolZombieDefenseProfileV1";
  const RANK_API_BASE = "https://game-api.yama5993.workers.dev";
  const RANK_GAME_ID = "school-zombie-defense";
  const RANK_LIMIT = 20;
  const RANK_NAME_KEY = "schoolZombieDefenseRankNameV1";
  const SHOP_MAX_LEVEL = 30;
  const SHOP_LEVEL_PIPS_PER_ROW = 15;
  const SHOP_COST_GROWTH = 1.16;
  const SHOP_COST_ROUNDING = 10;
  const SHOP_CHARACTERS = [
    {
      id: "c",
      get name() { return SchoolI18n.t("char.c.name"); },
      get weapon() { return SchoolI18n.t("char.c.weapon"); },
      portrait: "avatar-pistol",
      icon: "skill-pistol-rapid",
      accent: 0xf2b84b
    },
    {
      id: "a",
      get name() { return SchoolI18n.t("char.a.name"); },
      get weapon() { return SchoolI18n.t("char.a.weapon"); },
      portrait: "avatar-bow",
      icon: "skill-arrow-pin",
      accent: 0xff80b6
    },
    {
      id: "b",
      get name() { return SchoolI18n.t("char.b.name"); },
      get weapon() { return SchoolI18n.t("char.b.weapon"); },
      portrait: "avatar-rifle",
      icon: "skill-rifle-grenade",
      accent: 0xf6b04f
    },
    {
      id: "d",
      get name() { return SchoolI18n.t("char.d.name"); },
      get weapon() { return SchoolI18n.t("char.d.weapon"); },
      portrait: "avatar-rocket",
      icon: "skill-rocket-impact",
      accent: 0x91f7ff
    },
    {
      id: "e",
      get name() { return SchoolI18n.t("char.e.name"); },
      get weapon() { return SchoolI18n.t("char.e.weapon"); },
      portrait: "avatar-sniper",
      icon: "skill-sniper-weakpoint",
      accent: 0x91ff9a
    },
    {
      id: "f",
      get name() { return SchoolI18n.t("char.f.name"); },
      get weapon() { return SchoolI18n.t("char.f.weapon"); },
      portrait: "avatar-fire",
      icon: "skill-rocket",
      accent: 0xff7a22
    },
    {
      id: "g",
      get name() { return SchoolI18n.t("char.g.name"); },
      get weapon() { return SchoolI18n.t("char.g.weapon"); },
      portrait: "avatar-shock",
      icon: "skill-shock-amplifier",
      accent: 0xff9ad6
    },
    {
      id: "h",
      get name() { return SchoolI18n.t("char.h.name"); },
      get weapon() { return SchoolI18n.t("char.h.weapon"); },
      portrait: "avatar-engineer",
      icon: "skill-barrage",
      accent: 0xffd166
    }
  ];
  const SHOP_CHARACTER_UPGRADES = {
    c: [
      { id: "c_power", get title() { return SchoolI18n.t("up.c_power.title"); }, get subtitle() { return SchoolI18n.t("up.c_power.subtitle"); }, get part() { return SchoolI18n.t("up.c_power.part"); }, icon: "skill-pistol-rapid" },
      { id: "c_speed", get title() { return SchoolI18n.t("up.c_speed.title"); }, get subtitle() { return SchoolI18n.t("up.c_speed.subtitle"); }, get part() { return SchoolI18n.t("up.c_speed.part"); }, icon: "equipment-wrench" },
      { id: "c_crit", get title() { return SchoolI18n.t("up.c_crit.title"); }, get subtitle() { return SchoolI18n.t("up.c_crit.subtitle"); }, get part() { return SchoolI18n.t("up.c_crit.part"); }, icon: "equipment-scope" }
    ],
    a: [
      { id: "a_power", get title() { return SchoolI18n.t("up.a_power.title"); }, get subtitle() { return SchoolI18n.t("up.a_power.subtitle"); }, get part() { return SchoolI18n.t("up.a_power.part"); }, icon: "skill-arrow-pin" },
      { id: "a_mark", get title() { return SchoolI18n.t("up.a_mark.title"); }, get subtitle() { return SchoolI18n.t("up.a_mark.subtitle"); }, get part() { return SchoolI18n.t("up.a_mark.part"); }, icon: "equipment-bolt" },
      { id: "a_crit", get title() { return SchoolI18n.t("up.a_crit.title"); }, get subtitle() { return SchoolI18n.t("up.a_crit.subtitle"); }, get part() { return SchoolI18n.t("up.a_crit.part"); }, icon: "equipment-bolt" }
    ],
    b: [
      { id: "b_power", get title() { return SchoolI18n.t("up.b_power.title"); }, get subtitle() { return SchoolI18n.t("up.b_power.subtitle"); }, get part() { return SchoolI18n.t("up.b_power.part"); }, icon: "skill-barrage" },
      { id: "b_control", get title() { return SchoolI18n.t("up.b_control.title"); }, get subtitle() { return SchoolI18n.t("up.b_control.subtitle"); }, get part() { return SchoolI18n.t("up.b_control.part"); }, icon: "equipment-wrench" },
      { id: "b_grenade", get title() { return SchoolI18n.t("up.b_grenade.title"); }, get subtitle() { return SchoolI18n.t("up.b_grenade.subtitle"); }, get part() { return SchoolI18n.t("up.b_grenade.part"); }, icon: "equipment-rocket" }
    ],
    d: [
      { id: "d_charge", get title() { return SchoolI18n.t("up.d_charge.title"); }, get subtitle() { return SchoolI18n.t("up.d_charge.subtitle"); }, get part() { return SchoolI18n.t("up.d_charge.part"); }, icon: "skill-rocket-impact" },
      { id: "d_radius", get title() { return SchoolI18n.t("up.d_radius.title"); }, get subtitle() { return SchoolI18n.t("up.d_radius.subtitle"); }, get part() { return SchoolI18n.t("up.d_radius.part"); }, icon: "skill-rocket" },
      { id: "d_slow", get title() { return SchoolI18n.t("up.d_slow.title"); }, get subtitle() { return SchoolI18n.t("up.d_slow.subtitle"); }, get part() { return SchoolI18n.t("up.d_slow.part"); }, icon: "skill-frost" }
    ],
    e: [
      { id: "e_power", get title() { return SchoolI18n.t("up.e_power.title"); }, get subtitle() { return SchoolI18n.t("up.e_power.subtitle"); }, get part() { return SchoolI18n.t("up.e_power.part"); }, icon: "skill-sniper" },
      { id: "e_focus", get title() { return SchoolI18n.t("up.e_focus.title"); }, get subtitle() { return SchoolI18n.t("up.e_focus.subtitle"); }, get part() { return SchoolI18n.t("up.e_focus.part"); }, icon: "skill-sniper-weakpoint" },
      { id: "e_pierce", get title() { return SchoolI18n.t("up.e_pierce.title"); }, get subtitle() { return SchoolI18n.t("up.e_pierce.subtitle"); }, get part() { return SchoolI18n.t("up.e_pierce.part"); }, icon: "skill-pierce" }
    ],
    f: [
      { id: "f_burn", get title() { return SchoolI18n.t("up.f_burn.title"); }, get subtitle() { return SchoolI18n.t("up.f_burn.subtitle"); }, get part() { return SchoolI18n.t("up.f_burn.part"); }, icon: "equipment-fire" },
      { id: "f_area", get title() { return SchoolI18n.t("up.f_area.title"); }, get subtitle() { return SchoolI18n.t("up.f_area.subtitle"); }, get part() { return SchoolI18n.t("up.f_area.part"); }, icon: "equipment-fire" },
      { id: "f_throw", get title() { return SchoolI18n.t("up.f_throw.title"); }, get subtitle() { return SchoolI18n.t("up.f_throw.subtitle"); }, get part() { return SchoolI18n.t("up.f_throw.part"); }, icon: "equipment-fire" }
    ],
    g: [
      { id: "g_voltage", get title() { return SchoolI18n.t("up.g_voltage.title"); }, get subtitle() { return SchoolI18n.t("up.g_voltage.subtitle"); }, get part() { return SchoolI18n.t("up.g_voltage.part"); }, icon: "equipment-battery" },
      { id: "g_chain", get title() { return SchoolI18n.t("up.g_chain.title"); }, get subtitle() { return SchoolI18n.t("up.g_chain.subtitle"); }, get part() { return SchoolI18n.t("up.g_chain.part"); }, icon: "equipment-coil" },
      { id: "g_control", get title() { return SchoolI18n.t("up.g_control.title"); }, get subtitle() { return SchoolI18n.t("up.g_control.subtitle"); }, get part() { return SchoolI18n.t("up.g_control.part"); }, icon: "equipment-wrench" }
    ],
    h: [
      { id: "h_turret", get title() { return SchoolI18n.t("up.h_turret.title"); }, get subtitle() { return SchoolI18n.t("up.h_turret.subtitle"); }, get part() { return SchoolI18n.t("up.h_turret.part"); }, icon: "equipment-turret" },
      { id: "h_wire", get title() { return SchoolI18n.t("up.h_wire.title"); }, get subtitle() { return SchoolI18n.t("up.h_wire.subtitle"); }, get part() { return SchoolI18n.t("up.h_wire.part"); }, icon: "equipment-wire" },
      { id: "h_barricade", get title() { return SchoolI18n.t("up.h_barricade.title"); }, get subtitle() { return SchoolI18n.t("up.h_barricade.subtitle"); }, get part() { return SchoolI18n.t("up.h_barricade.part"); }, icon: "equipment-armor" }
    ]
  };
  const getAllShopUpgradeIds = () => Object.values(SHOP_CHARACTER_UPGRADES).flat().map((upgrade) => upgrade.id);
  const getShopUpgradeCost = (level) => {
    if (level >= SHOP_MAX_LEVEL) {
      return 0;
    }
    return Math.round((200 * Math.pow(SHOP_COST_GROWTH, level)) / SHOP_COST_ROUNDING) * SHOP_COST_ROUNDING;
  };
  const getShopUpgradeRefund = (level) => {
    const safeLevel = clamp(Math.floor(Number(level) || 0), 0, SHOP_MAX_LEVEL);
    let refund = 0;
    for (let i = 0; i < safeLevel; i += 1) {
      refund += getShopUpgradeCost(i);
    }
    return refund;
  };
  const formatShopCost = (cost) => {
    if (cost < 100000) {
      return String(cost);
    }
    const units = [
      { value: 1000000000, suffix: "B" },
      { value: 1000000, suffix: "M" },
      { value: 1000, suffix: "K" }
    ];
    const unit = units.find((item) => cost >= item.value);
    const value = cost / unit.value;
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${Number(value.toFixed(digits))}${unit.suffix}`;
  };
  const DEFAULT_CHAIN_SHOT_DELAY = 125;
  const MIN_CHAIN_SHOT_DELAY = scaleWeaponInterval(45);
  const WEAPON_CHAIN_SHOT_DELAYS = {
    "projectile-pistol": 110,
    "projectile-arrow": 140,
    "projectile-rifle": 70,
    "projectile-rocket": 190,
    "projectile-sniper": 170,
    "projectile-firebomb": 190,
    "projectile-shock": 150,
    "projectile-frost": 170,
    "projectile-nail": 85
  };
  const RIFLE_GRENADE_FLIGHT_TIME_SCALE = 4.6;
  const FIREBOMB_FLIGHT_TIME_SCALE = 2;
  const FIREBOMB_THROW_INTERVAL_SECONDS = 5;
  const FIREBOMB_FIRE_ZONE_DURATION_SECONDS = 3;
  const BARBED_WIRE_DAMAGE_PER_TICK = 9;
  const BARBED_WIRE_SLOW_DURATION = 0.28;
  const BARBED_WIRE_MAX_SLOW_DURATION = 0.48;
  const BARBED_WIRE_REINFORCE_SLOW_GAIN = 0.08;
  const BARBED_WIRE_HIT_HALF_HEIGHT = 38;
  const RIFLE_GRENADE_INTERVAL_SCALE = 1;
  const RIFLE_GRENADE_INITIAL_INTERVAL = 10 * RIFLE_GRENADE_INTERVAL_SCALE;
  const RIFLE_GRENADE_MIN_INTERVAL = 2 * RIFLE_GRENADE_INTERVAL_SCALE;
  const getRifleGrenadeEveryForLevel = (level) => {
    const progress = clamp((Math.max(1, level) - 1) / (SHOP_MAX_LEVEL - 1), 0, 1);
    return Math.round(10 - progress * 8) * RIFLE_GRENADE_INTERVAL_SCALE;
  };
  const getNextRifleGrenadeEvery = (current) => current === 0
    ? RIFLE_GRENADE_INITIAL_INTERVAL
    : Math.max(RIFLE_GRENADE_MIN_INTERVAL, current - RIFLE_GRENADE_INTERVAL_SCALE);
  const RECRUIT_UNLOCK_LEVELS = [3, 6, 9, 12];
  const RECRUIT_CUTIN_HOLD_MS = 3200;
  const getUnlockedRecruitSlots = (level) => RECRUIT_UNLOCK_LEVELS.filter((unlockLevel) => level >= unlockLevel).length;
  const ZOMBIE_BASE_DISPLAY_HEIGHT = 170;
  const ZOMBIE_ELITE_DISPLAY_HEIGHT = 220;
  const ZOMBIE_TYPE_CONFIGS = {
    normal: { id: "normal", hpScale: 1, speedScale: 1, sizeScale: 1, attackScale: 1, hitRadiusScale: 1, knockbackScale: 1, animRate: 6.8, reward: 1 },
    student: { id: "student", hpScale: 0.86, speedScale: 1.16, sizeScale: 0.9, attackScale: 0.9, hitRadiusScale: 0.9, knockbackScale: 1.08, animRate: 7.7, reward: 1 },
    runner: { id: "runner", hpScale: 0.72, speedScale: 1.72, sizeScale: 0.82, attackScale: 0.76, hitRadiusScale: 0.86, knockbackScale: 1.18, animRate: 9.4, reward: 1 },
    brute: { id: "brute", hpScale: 4.1, speedScale: 0.72, sizeScale: 1.24, attackScale: 1.45, hitRadiusScale: 1.22, knockbackScale: 0.42, animRate: 4.9, reward: 2 },
    volatile: { id: "volatile", hpScale: 1.05, speedScale: 1.08, sizeScale: 1.02, attackScale: 1.06, hitRadiusScale: 1, knockbackScale: 0.72, animRate: 7.4, reward: 2, deathExplosion: true },
    teacher: { id: "teacher", hpScale: 1.28, speedScale: 0.92, sizeScale: 1.03, attackScale: 1.18, hitRadiusScale: 1.04, knockbackScale: 0.82, animRate: 6.2, reward: 2 },
    nurse: { id: "nurse", hpScale: 0.82, speedScale: 1.32, sizeScale: 0.9, attackScale: 0.88, hitRadiusScale: 0.88, knockbackScale: 1.08, animRate: 8.2, reward: 1 },
    diva: { id: "diva", hpScale: 1.12, speedScale: 1.08, sizeScale: 1.07, attackScale: 1.04, hitRadiusScale: 0.94, knockbackScale: 0.9, animRate: 6.4, reward: 1 },
    athlete: { id: "athlete", hpScale: 0.68, speedScale: 1.88, sizeScale: 0.86, attackScale: 0.82, hitRadiusScale: 0.9, knockbackScale: 1.2, animRate: 10.2, reward: 1 },
    janitor: { id: "janitor", hpScale: 2.55, speedScale: 0.8, sizeScale: 1.14, attackScale: 1.26, hitRadiusScale: 1.14, knockbackScale: 0.55, animRate: 5.4, reward: 2 },
    guard: { id: "guard", hpScale: 3.25, speedScale: 0.68, sizeScale: 1.12, attackScale: 1.18, hitRadiusScale: 1.12, knockbackScale: 0.48, animRate: 4.8, reward: 2 },
    crawler: { id: "crawler", hpScale: 0.9, speedScale: 1.38, sizeScale: 0.68, attackScale: 0.72, hitRadiusScale: 0.68, knockbackScale: 0.95, animRate: 8.8, reward: 1 },
    screamer: { id: "screamer", hpScale: 0.92, speedScale: 1.42, sizeScale: 0.95, attackScale: 0.98, hitRadiusScale: 0.92, knockbackScale: 1.04, animRate: 8.6, reward: 2 },
    spider: { id: "spider", hpScale: 0.78, speedScale: 1.64, sizeScale: 0.72, attackScale: 0.78, hitRadiusScale: 0.76, knockbackScale: 1.08, animRate: 9.8, reward: 1 },
    bloom: { id: "bloom", hpScale: 1.48, speedScale: 0.88, sizeScale: 1.02, attackScale: 1.12, hitRadiusScale: 1, knockbackScale: 0.7, animRate: 6.1, reward: 2, deathExplosion: true },
    charger: {
      id: "charger",
      hpScale: 1.32,
      speedScale: 0.96,
      sizeScale: 1.04,
      attackScale: 1.16,
      hitRadiusScale: 1.06,
      knockbackScale: 0.66,
      animRate: 6.8,
      reward: 2,
      surgeSpeedScale: 3.05,
      surgeDuration: 0.38,
      surgeChargeDuration: 0.22,
      surgeCooldownMin: 3.8,
      surgeCooldownMax: 5.2,
      surgeMinBarricadeDistance: 120
    },
    elite: { id: "elite", hpScale: 1.5, speedScale: 1, sizeScale: 1, attackScale: 1, hitRadiusScale: 1, knockbackScale: 0.5, animRate: 5.2, reward: 4 }
  };
  const ZOMBIE_TEXTURE_TYPES = [
    "normal",
    "student",
    "runner",
    "brute",
    "volatile",
    "elite",
    "teacher",
    "nurse",
    "diva",
    "athlete",
    "janitor",
    "guard",
    "crawler",
    "screamer",
    "spider",
    "bloom",
    "charger"
  ];

  const {
    createDefaultMetaSave,
    normalizeMetaSave,
    loadMetaSave,
    saveMetaSave,
    loadProfileAuth,
    saveProfileAuth,
    restoreProfileAuth,
    readProfileAuthBackup,
    isProfileAuthSaved
  } = window.SchoolZombiePersistence.create({
    getUpgradeIds: getAllShopUpgradeIds,
    maxLevel: SHOP_MAX_LEVEL,
    clamp,
    cacheKey: META_CACHE_KEY,
    legacySaveKey: META_SAVE_KEY,
    profileAuthKey: PROFILE_AUTH_KEY
  });

  let lastDomPointerDownAt = 0;
  window.addEventListener("pointerdown", () => { lastDomPointerDownAt = performance.now(); }, true);

  function goToArcherLabHome() {
    const href = "https://archerlab.dev/";
    // Inside the Archerlab app launcher (iframe) this must close the launcher instead
    // of loading the portal in the frame; the shared helper handles both cases.
    try {
      if (window.ArcherImmersive?.goHome) {
        window.ArcherImmersive.goHome(href);
        return;
      }
    } catch (error) { /* fall through */ }
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = href;
        return;
      }
    } catch (error) { /* fall through */ }
    window.location.href = href;
  }

  function isLocalDebugHost() {
    const host = String(window.location.hostname || "");
    return host === "localhost" || host === "127.0.0.1" || host === "";
  }

  function pickZombieType(level, eliteRoll) {
    if (eliteRoll) {
      return ZOMBIE_TYPE_CONFIGS.elite;
    }
    const entries = [
      { type: ZOMBIE_TYPE_CONFIGS.normal, weight: Math.max(68, 100 - Math.max(0, level - 5) * 2.4) }
    ];
    if (level >= 2) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.student, weight: Math.min(34, 12 + level * 1.7) });
    }
    if (level >= 2) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.runner, weight: Math.min(42, 14 + level * 2) });
    }
    if (level >= 4) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.brute, weight: Math.min(28, 8 + (level - 4) * 1.6) });
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.screamer, weight: Math.min(24, 7 + (level - 4) * 1.25) });
    }
    if (level >= 3) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.nurse, weight: Math.min(28, 8 + level * 1.3) });
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.diva, weight: Math.min(24, 8 + level * 1.1) });
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.athlete, weight: Math.min(32, 9 + level * 1.4) });
    }
    if (level >= 5) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.teacher, weight: Math.min(26, 7 + (level - 5) * 1.35) });
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.janitor, weight: Math.min(24, 6 + (level - 5) * 1.25) });
    }
    if (level >= 6) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.volatile, weight: Math.min(24, 6 + (level - 6) * 1.45) });
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.spider, weight: Math.min(22, 6 + (level - 6) * 1.15) });
    }
    if (level >= 7) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.crawler, weight: Math.min(30, 8 + (level - 7) * 1.5) });
    }
    if (level >= 8) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.guard, weight: Math.min(20, 5 + (level - 8) * 1.1) });
    }
    if (level >= 9) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.bloom, weight: Math.min(18, 4 + (level - 9) * 1) });
    }
    if (level >= 10) {
      entries.push({ type: ZOMBIE_TYPE_CONFIGS.charger, weight: Math.min(16, 6 + (level - 10) * 0.8) });
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
    fire: 0xff7a22,
    shock: 0xff9ad6,
    engineer: 0xffd166,
    "core-full-repair": 0x7dffdf,
    "recruit-a": 0xff7fb7,
    "recruit-b": 0xff8d42,
    "recruit-d": 0x91f7ff,
    "recruit-e": 0x7dff8d,
    "recruit-f": 0xff7a22,
    "recruit-g": 0xff9ad6,
    "recruit-h": 0xffd166
  };
  const SKILL_ACCENT_HEX = {
    pierce: "#bef6ff",
    barrel: "#ffc768",
    rally: "#ff7fb7",
    repair: "#7dff8d",
    barrage: "#ff8d42",
    squad: "#c38dff",
    frost: "#91f7ff",
    fire: "#ff9a45",
    shock: "#ff9ad6",
    engineer: "#ffd166",
    "core-full-repair": "#7dffdf",
    "recruit-a": "#ff7fb7",
    "recruit-b": "#ff8d42",
    "recruit-d": "#91f7ff",
    "recruit-e": "#7dff8d",
    "recruit-f": "#ff9a45",
    "recruit-g": "#ff9ad6",
    "recruit-h": "#ffd166"
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
      speed: 1000,
      rate: 1.02,
      critChance: BOW_BASE_CRIT_CHANCE,
      critMultiplier: 2.05,
      markDuration: BOW_MARK_DURATION,
      markDamageBonus: BOW_MARK_DAMAGE_BONUS,
      aim: { pivot: [0, -134], reach: 38 },
      recruit: {
        icon: "avatar-bow",
        portrait: "avatar-bow",
        get tag() { return SchoolI18n.t("recruit.a.tag"); },
        get title() { return SchoolI18n.t("recruit.a.title"); },
        get desc() { return SchoolI18n.t("recruit.a.desc"); },
        get line() { return SchoolI18n.t("recruit.a.line"); }
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
      speed: 1800,
      rate: 0.86,
      critChance: 0.07,
      critMultiplier: 1.45,
      burstCount: 3,
      burstDelay: 70,
      aim: { pivot: [2, -146], reach: 52 },
      recruit: {
        icon: "avatar-rifle",
        portrait: "avatar-rifle",
        get tag() { return SchoolI18n.t("recruit.b.tag"); },
        get title() { return SchoolI18n.t("recruit.b.title"); },
        get desc() { return SchoolI18n.t("recruit.b.desc"); },
        get line() { return SchoolI18n.t("recruit.b.line"); }
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
      speed: 1800,
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
      damageScale: 1.35,
      role: "frost",
      projectile: "projectile-rocket",
      speed: 800,
      rate: 1.55,
      critChance: 0.04,
      critMultiplier: 1.35,
      splashRadius: 88,
      splashDamageScale: 0.55,
      aim: { pivot: [2, -145], reach: 56 },
      recruit: {
        icon: "avatar-rocket",
        portrait: "avatar-rocket",
        get tag() { return SchoolI18n.t("recruit.d.tag"); },
        get title() { return SchoolI18n.t("recruit.d.title"); },
        get desc() { return SchoolI18n.t("recruit.d.desc"); },
        get line() { return SchoolI18n.t("recruit.d.line"); }
      }
    },
    {
      id: "e",
      x: 488,
      y: 924,
      height: 205,
      damageScale: 2.25,
      role: "repair",
      projectile: "projectile-sniper",
      speed: 2000,
      rate: 1.8,
      critChance: 0.24,
      critMultiplier: 2.35,
      pierce: 2,
      aim: { pivot: [2, -132], reach: 64 },
      recruit: {
        icon: "avatar-sniper",
        portrait: "avatar-sniper",
        get tag() { return SchoolI18n.t("recruit.e.tag"); },
        get title() { return SchoolI18n.t("recruit.e.title"); },
        get desc() { return SchoolI18n.t("recruit.e.desc"); },
        get line() { return SchoolI18n.t("recruit.e.line"); }
      }
    },
    {
      id: "f",
      x: 270,
      y: 925,
      height: 196,
      damageScale: 0.42,
      role: "fire",
      projectile: "projectile-firebomb",
      speed: 980,
      rate: FIREBOMB_THROW_INTERVAL_SECONDS / CHARACTER_FIRE_COOLDOWN_MULTIPLIER,
      critChance: 0.05,
      critMultiplier: 1.45,
      fireZoneRadius: 64,
      fireZoneDuration: FIREBOMB_FIRE_ZONE_DURATION_SECONDS / FIRE_ZONE_VISUAL_DURATION_MULTIPLIER,
      fireZoneDamageScale: 0.2,
      aim: { pivot: [0, -121], reach: 39 },
      recruit: {
        icon: "avatar-fire",
        portrait: "avatar-fire",
        get tag() { return SchoolI18n.t("recruit.f.tag"); },
        get title() { return SchoolI18n.t("recruit.f.title"); },
        get desc() { return SchoolI18n.t("recruit.f.desc"); },
        get line() { return SchoolI18n.t("recruit.f.line"); }
      }
    },
    {
      id: "g",
      x: 270,
      y: 925,
      height: 222,
      damageScale: 0.74,
      role: "shock",
      projectile: "projectile-shock",
      speed: 1380,
      rate: 1.18,
      critChance: 0.1,
      critMultiplier: 1.6,
      pierce: 0,
      slowDuration: 0,
      stunDuration: DEFAULT_SHOCK_STUN_DURATION,
      chainJumps: 1,
      chainRadius: 118,
      chainDamageScale: 0.36,
      aim: { pivot: [1, -138], reach: 48 },
      recruit: {
        icon: "avatar-shock",
        portrait: "avatar-shock",
        get tag() { return SchoolI18n.t("recruit.g.tag"); },
        get title() { return SchoolI18n.t("recruit.g.title"); },
        get desc() { return SchoolI18n.t("recruit.g.desc"); },
        get line() { return SchoolI18n.t("recruit.g.line"); }
      }
    },
    {
      id: "h",
      x: 270,
      y: 925,
      height: 226,
      damageScale: 0.34,
      role: "engineer",
      projectile: "projectile-nail",
      speed: 1750,
      rate: 0.96,
      critChance: 0.07,
      critMultiplier: 1.45,
      aim: { pivot: [0, -142], reach: 44 },
      recruit: {
        icon: "avatar-engineer",
        portrait: "avatar-engineer",
        get tag() { return SchoolI18n.t("recruit.h.tag"); },
        get title() { return SchoolI18n.t("recruit.h.title"); },
        get desc() { return SchoolI18n.t("recruit.h.desc"); },
        get line() { return SchoolI18n.t("recruit.h.line"); }
      }
    }
  ];
  const DEFENDER_FORMATION_SLOTS = [
    { x: 270, y: 879 },
    { x: 158, y: 878 },
    { x: 382, y: 879 },
    { x: 52, y: 880 },
    { x: 488, y: 878 }
  ];
  const OWNER_SKILL_PORTRAITS = {
    c: "avatar-pistol",
    a: "avatar-bow",
    b: "avatar-rifle",
    d: "avatar-rocket",
    e: "avatar-sniper",
    f: "avatar-fire",
    g: "avatar-shock",
    h: "avatar-engineer"
  };
  const GENERATED_DEFENDER_PROFILES = {
    f: {
      label: "F",
      gender: "female",
      body: "#f2ede8",
      vest: "#8f2e2a",
      skin: "#e5b18c",
      hair: "#4b2220",
      weapon: "#ffc86b",
      accent: "#ff9a45",
      portrait: { glow: "#ffbc6f", dark: "#6f241c", skin: "#e5b18c", hair: "#4b2220", body: "#f2ede8" }
    },
    g: {
      label: "E",
      gender: "male",
      body: "#e9edf4",
      vest: "#59306f",
      skin: "#d8aa86",
      hair: "#35254f",
      weapon: "#ffd4ef",
      accent: "#ff9ad6",
      portrait: { glow: "#ffb3de", dark: "#4b214d", skin: "#d8aa86", hair: "#35254f", body: "#eef0f6" }
    },
    h: {
      label: "T",
      gender: "male",
      body: "#e7ece5",
      vest: "#6c5533",
      skin: "#d8a178",
      hair: "#2b241d",
      weapon: "#ffd166",
      accent: "#ffd166",
      portrait: { glow: "#ffe08a", dark: "#4f381a", skin: "#d8a178", hair: "#2b241d", body: "#e7ece5" }
    }
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

  function getShotAimPoseKey(angle) {
    if (angleDistance(angle, AIM_POSE_BY_KEY["aim-12"].angle) <= AIM_FORWARD_SNAP_ANGLE) {
      return "aim-12";
    }
    return getNearestAimPose(angle).key;
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

  function harmonizeCrossbowPalette(ctx, width, height, direction) {
    // Grade the existing pixels once during texture construction. Geometry,
    // alpha, weapon calibration and action timing remain identical to the atlas.
    // iOS Safari / in-app WebViews throw InvalidStateError for zero-sized or
    // memory-evicted canvases. The grading is cosmetic, so skip it there.
    if (!(width > 0 && height > 0)) return;
    let image;
    try {
      image = ctx.getImageData(0, 0, width, height);
    } catch (error) {
      return;
    }
    const pixels = image.data;
    const skirtExposure = [0.84, 0.9, 1.1, 1.18, 1.18, 1.18, 1.1, 0.9, 0.84][direction];
    for (let y = 0; y < height; y += 1) {
      const sourceY = y / height;
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (!pixels[offset + 3]) continue;
        const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
        const legSkin = sourceY >= 0.68 && sourceY < 0.855 && r > 100 && g > r * 0.52;
        const handSkin = sourceY >= 0.4 && sourceY < 0.555 && (x < width * 0.39 || x > width * 0.6)
          && r > 175 && g > r * 0.78;
        if ((legSkin || handSkin) && g < r * 0.97 && b < g * 0.98) {
          pixels[offset] = r * 0.97;
          pixels[offset + 1] = r * 0.83;
          pixels[offset + 2] = r * 0.74;
        } else if (sourceY >= 0.38 && sourceY < 0.58 && r > 95 && g < r * 0.86 && g > r * 0.3 && b < r * 0.82 && b > g * 0.48) {
          pixels[offset] = r * 0.98;
          pixels[offset + 1] = r * 0.65;
          pixels[offset + 2] = r * 0.62;
        } else if (sourceY >= 0.575 && sourceY < 0.705 && r < 180 && g < 180 && b < 160 && g >= r * 0.8 && g > 28) {
          const shade = (r + g + b) / 3 * skirtExposure;
          pixels[offset] = shade * 0.78;
          pixels[offset + 1] = shade * 1.08;
          pixels[offset + 2] = shade * 0.86;
        }
      }
    }
    try {
      ctx.putImageData(image, 0, 0);
    } catch (error) {
      // Keep the ungraded pixels already on the canvas.
    }
  }

  function makeImageSliceTexture(scene, sourceKey, key, sx, sy, sw, sh) {
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }

    const source = scene.textures.get(sourceKey).getSourceImage();
    const canvas = document.createElement("canvas");
    // Action sheets are up to 960px tall but render below 267px. Keep enough
    // detail for 2x displays without retaining hundreds of full-size canvases.
    const textureScale = Math.min(1, 576 / sh);
    canvas.width = Math.round(sw * textureScale);
    canvas.height = Math.round(sh * textureScale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    if (/^character-a(?:-attack-\d+)?$/.test(sourceKey)) {
      harmonizeCrossbowPalette(ctx, canvas.width, canvas.height, Math.round(sx / sw));
    }
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
      scene.textures.remove(sourceKey);
    };

    ZOMBIE_TEXTURE_TYPES.forEach((type) => {
      sliceSheet(`zombie-walk-${type}`, `zombie-walk-${type}`);
    });
  }

  function drawGeneratedDefenderPose(ctx, width, height, profile, poseKey) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height - 22);
    const aimAngle = getAimPose(poseKey).angle;
    const facing = Math.cos(aimAngle) < -0.08 ? -1 : 1;
    const lean = clamp(Math.cos(aimAngle) * 6, -5, 5);
    const isFemale = profile.gender === "female";
    const torsoW = isFemale ? 56 : 64;
    const torsoX = -torsoW / 2 + lean * 0.2;

    ctx.fillStyle = "rgba(0,0,0,.34)";
    ctx.beginPath();
    ctx.ellipse(0, -4, 43, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#20252a";
    ctx.lineWidth = isFemale ? 17 : 20;
    ctx.beginPath();
    ctx.moveTo(-14, -78);
    ctx.lineTo(-23, -20);
    ctx.moveTo(14, -78);
    ctx.lineTo(23, -20);
    ctx.stroke();

    ctx.fillStyle = profile.body;
    roundedRect(ctx, torsoX, -162, torsoW, 86, 14);
    ctx.fill();
    ctx.strokeStyle = "#0b1116";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = profile.vest;
    roundedRect(ctx, -20 + lean * 0.2, -152, 40, 62, 9);
    ctx.fill();
    ctx.fillStyle = profile.accent;
    ctx.globalAlpha = 0.88;
    roundedRect(ctx, -4 + lean * 0.2, -146, 8, 48, 4);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = profile.skin;
    ctx.beginPath();
    ctx.arc(lean * 0.18, -198, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = profile.hair;
    ctx.beginPath();
    ctx.arc(lean * 0.18, -205, isFemale ? 32 : 29, Math.PI * 0.9, Math.PI * 2.12);
    ctx.lineTo((isFemale ? 27 : 24) + lean * 0.18, isFemale ? -166 : -178);
    ctx.quadraticCurveTo(0 + lean * 0.18, isFemale ? -182 : -188, (isFemale ? -28 : -25) + lean * 0.18, isFemale ? -166 : -178);
    ctx.closePath();
    ctx.fill();

    if (isFemale) {
      ctx.fillStyle = profile.body;
      ctx.beginPath();
      ctx.moveTo(-27 + lean * 0.2, -83);
      ctx.lineTo(27 + lean * 0.2, -83);
      ctx.lineTo(35 + lean * 0.2, -49);
      ctx.lineTo(-35 + lean * 0.2, -49);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#0b1116";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const shoulderX = facing * 15 + lean * 0.3;
    const shoulderY = -143;
    ctx.strokeStyle = profile.skin;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-facing * 19 + lean * 0.2, -137);
    ctx.lineTo(shoulderX, shoulderY);
    ctx.stroke();

    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(aimAngle);
    ctx.strokeStyle = "#10171d";
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(78, 0);
    ctx.stroke();
    ctx.strokeStyle = profile.weapon;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(82, 0);
    ctx.stroke();
    ctx.strokeStyle = profile.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(36, -7);
    ctx.lineTo(66, -7);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#f7fbff";
    ctx.beginPath();
    ctx.arc(-8 + lean * 0.18, -196, 3.2, 0, Math.PI * 2);
    ctx.arc(9 + lean * 0.18, -196, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function createGeneratedDefenderTextures(scene) {
    const cellWidth = 256;
    const cellHeight = 384;
    Object.entries(GENERATED_DEFENDER_PROFILES).forEach(([id, profile]) => {
      if (!scene.textures.exists(`character-${id}`)) {
        makeCanvasTexture(scene, `character-${id}`, cellWidth * AIM_POSE_KEYS.length, cellHeight, (ctx) => {
          AIM_POSE_KEYS.forEach((pose, index) => {
            ctx.save();
            ctx.translate(index * cellWidth, 0);
            drawGeneratedDefenderPose(ctx, cellWidth, cellHeight, profile, pose);
            ctx.restore();
          });
        });
      }
      if (!scene.textures.exists(OWNER_SKILL_PORTRAITS[id])) {
        makeCanvasTexture(scene, OWNER_SKILL_PORTRAITS[id], 128, 128, (ctx) => {
          drawPortrait(ctx, 128, 128, profile.portrait, profile.label);
        });
      }
    });
  }

  function createCharacterSpriteTextures(scene) {
    DEFENDER_ROSTER.map((defender) => defender.id).forEach((id) => {
      const readyFrame = CHARACTER_READY_SOURCE_FRAMES[id];
      const actionSourceKey = `character-${id}-${CHARACTER_ATTACK_ACTIONS[id]}-${readyFrame}`;
      const sourceKey = Number.isInteger(readyFrame) && scene.textures.exists(actionSourceKey)
        ? actionSourceKey
        : `character-${id}`;
      if (!scene.textures.exists(sourceKey)) {
        return;
      }
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

  function createCharacterAttackTextures(scene) {
    Object.entries(CHARACTER_ATTACK_ACTIONS).forEach(([id, action]) => {
      const frameCount = CHARACTER_ATTACK_FRAME_DURATIONS[id]?.length || THROW_ANIMATION_FRAMES;
      for (let frame = 0; frame < frameCount; frame += 1) {
        const usesBasePose = frame === 0 && CHARACTER_ATTACK_FRAME_ZERO_ALIASES.has(id);
        const sourceKey = usesBasePose ? `character-${id}` : `character-${id}-${action}-${frame}`;
        if (!scene.textures.exists(sourceKey)) {
          continue;
        }
        const source = scene.textures.get(sourceKey).getSourceImage();
        const cellWidth = Math.floor(source.width / AIM_POSE_KEYS.length);
        const cellHeight = source.height;
        AIM_POSE_KEYS.forEach((pose, index) => {
          makeImageSliceTexture(
            scene,
            sourceKey,
            `character-${id}-${action}-${pose}-${frame}`,
            index * cellWidth,
            0,
            cellWidth,
            cellHeight
          );
        });
        if (!usesBasePose) {
          scene.textures.remove(sourceKey);
        }
      }
    });
  }

  function releaseCharacterSourceTextures(scene) {
    DEFENDER_ROSTER.forEach(({ id }) => {
      const sourceKey = `character-${id}`;
      if (scene.textures.exists(sourceKey)) {
        scene.textures.remove(sourceKey);
      }
    });
  }

  function createCharacterBadgeTextures(scene) {
    DEFENDER_ROSTER.map((defender) => defender.id).forEach((id) => {
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
      if (!(source.width > 0 && source.height > 0)) {
        return;
      }
      let pixels;
      try {
        pixels = scanCtx.getImageData(0, 0, source.width, source.height).data;
      } catch (error) {
        // iOS Safari / in-app WebViews can throw InvalidStateError here.
        return;
      }
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
    } else if (type === "firebomb") {
      ctx.shadowColor = "rgba(255, 110, 34, .78)";
      ctx.rotate(-0.18);
      const glass = ctx.createLinearGradient(-10, -30, 10, 34);
      glass.addColorStop(0, "#f4e0bd");
      glass.addColorStop(0.48, "#8d5a2e");
      glass.addColorStop(1, "#2b1710");
      ctx.fillStyle = glass;
      roundedRect(ctx, -10, -22, 20, 44, 7);
      ctx.fill();
      ctx.strokeStyle = "#2b1710";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#f4eee1";
      roundedRect(ctx, -5, -36, 10, 16, 3);
      ctx.fill();
      const flame = ctx.createRadialGradient(0, -44, 1, 0, -38, 18);
      flame.addColorStop(0, "#ffffff");
      flame.addColorStop(0.34, "#ffe56f");
      flame.addColorStop(0.72, "#ff7a22");
      flame.addColorStop(1, "rgba(255, 75, 20, 0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(0, -62);
      ctx.quadraticCurveTo(17, -40, 3, -26);
      ctx.quadraticCurveTo(-15, -38, 0, -62);
      ctx.fill();
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
    } else if (type === "nail") {
      const gradient = ctx.createLinearGradient(0, -38, 0, 38);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.55, "#ffd166");
      gradient.addColorStop(1, "rgba(255, 209, 102, 0)");
      ctx.fillStyle = gradient;
      roundedRect(ctx, -3, -38, 6, 76, 3);
      ctx.fill();
      ctx.strokeStyle = "#2a2112";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, -30);
      ctx.lineTo(9, -30);
      ctx.moveTo(-7, -21);
      ctx.lineTo(7, -21);
      ctx.stroke();
    }
    ctx.restore();
  }

  function createTextures(scene) {
    if (!scene.textures.exists("projectile-frost")) {
      makeCanvasTexture(scene, "projectile-frost", 48, 84, (ctx) => drawProjectile(ctx, 48, 84, "frost"));
    }
    if (!scene.textures.exists("projectile-firebomb")) {
      makeCanvasTexture(scene, "projectile-firebomb", 62, 92, (ctx) => drawProjectile(ctx, 62, 92, "firebomb"));
    }
    if (!scene.textures.exists("projectile-shock")) {
      makeCanvasTexture(scene, "projectile-shock", 96, 64, (ctx) => drawProjectile(ctx, 96, 64, "shock"));
    }
    if (!scene.textures.exists("projectile-nail")) {
      makeCanvasTexture(scene, "projectile-nail", 34, 90, (ctx) => drawProjectile(ctx, 34, 90, "nail"));
    }

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

    loadManualImage(path, version = "") {
      return new Promise((resolve) => {
        const encodedVersion = version ? `?v=${encodeURIComponent(version)}` : "";
        const candidates = [versionedImageAsset(path, version), `${path}${encodedVersion}`]
          .map((candidate) => new URL(candidate, window.location.href).href)
          .filter((candidate, index, items) => items.indexOf(candidate) === index);
        const tryLoad = (index) => {
          if (index >= candidates.length) {
            resolve(null);
            return;
          }
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.onload = () => resolve(image);
          image.onerror = () => tryLoad(index + 1);
          image.src = candidates[index];
        };
        tryLoad(0);
      });
    }

    loadManualTexture(key, path, version = "") {
      if (this.textures.exists(key)) {
        return Promise.resolve();
      }
      return this.loadManualImage(path, version).then((image) => {
        if (!image || this.textures.exists(key)) {
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, 0, 0);
        this.textures.addCanvas(key, canvas);
      });
    }

    loadManualCharacterAssets() {
      const assets = [
        ["character-f", "assets/images/character-f.png", CHARACTER_ASSET_VERSION],
        ["character-g", "assets/images/character-g.png", CHARACTER_ASSET_VERSION],
        ["character-h", "assets/images/character-h.png", CHARACTER_ASSET_VERSION],
        ["avatar-fire", "assets/images/avatar-fire.png"],
        ["avatar-shock", "assets/images/avatar-shock.png"],
        ["avatar-engineer", "assets/images/avatar-engineer.png"],
        ["projectile-firebomb", "assets/images/projectile-firebomb.png", COMBAT_PROP_ASSET_VERSION],
        ["projectile-shock", "assets/images/projectile-shock.png"],
        ["projectile-nail", "assets/images/projectile-nail.png", COMBAT_PROP_ASSET_VERSION],
        ["engineer-turret-base", "assets/images/engineer-turret-base.png", TURRET_ASSET_VERSION],
        ["engineer-turret-head", "assets/images/engineer-turret-head.png", TURRET_ASSET_VERSION]
      ];
      return Promise.all(assets.map(([key, path, version]) => this.loadManualTexture(key, path, version)));
    }

    preload() {
      const loadingRoot = document.querySelector(".loading");
      const loadingTitle = loadingRoot?.querySelector(".loading__title");
      const loadingText = loadingRoot?.querySelector(".loading__text");
      const loadingBar = loadingRoot?.querySelector(".loading__bar span");
      this.load.on("progress", (progress) => {
        const percent = clamp(Math.round(progress * 100), 0, 100);
        if (loadingTitle) {
          loadingTitle.textContent = percent < 100 ? SchoolI18n.t("loading.building") : SchoolI18n.t("loading.ready");
        }
        if (loadingText) {
          loadingText.textContent = SchoolI18n.t("loading.assets", { percent });
        }
        if (loadingBar) {
          loadingBar.style.animation = "none";
          loadingBar.style.transform = "none";
          loadingBar.style.width = `${Math.max(3, percent)}%`;
        }
      });
      this.load.on("loaderror", () => {
        if (loadingText) {
          loadingText.textContent = SchoolI18n.t("loading.retryAsset");
        }
      });
      this.load.image("bg-corridor", imageAsset("assets/images/corridor-battlefield.png"));
      Object.values(window.SchoolZombieUI.SURFACES).forEach(({ key }) => {
        this.load.image(key, imageAsset(`assets/images/${key}.png`));
      });
      this.load.image("ui-survival-equipment", imageAsset("assets/images/ui-survival-equipment.png"));
      this.load.image("title-keyart", imageAsset("assets/images/title-keyart.png"));
      this.load.image("skill-choice-backdrop", imageAsset("assets/images/skill-choice-backdrop.png"));
      this.load.image("gameover-last-stand", imageAsset("assets/images/gameover-last-stand.png"));
      this.load.image("shop-blackmarket", imageAsset("assets/images/shop-blackmarket.png"));
      this.load.image("character-a", versionedImageAsset("assets/images/character-a.png", CROSSBOW_ASSET_VERSION));
      this.load.image("character-b", versionedImageAsset("assets/images/character-b.png", CHARACTER_ASSET_VERSION));
      this.load.image("character-c", versionedImageAsset("assets/images/character-c.png", CHARACTER_ASSET_VERSION));
      this.load.image("character-d", versionedImageAsset("assets/images/character-d.png", CHARACTER_CONTINUITY_ASSET_VERSION));
      this.load.image("character-e", versionedImageAsset("assets/images/character-e.png", CHARACTER_ASSET_VERSION));
      this.load.image("character-f", versionedImageAsset("assets/images/character-f.png", CHARACTER_ASSET_VERSION));
      this.load.image("character-g", versionedImageAsset("assets/images/character-g.png", CHARACTER_ASSET_VERSION));
      this.load.image("character-h", versionedImageAsset("assets/images/character-h.png", CHARACTER_ASSET_VERSION));
      Object.entries(CHARACTER_ATTACK_ACTIONS).forEach(([id, action]) => {
        const assetVersion = id === "a" ? CROSSBOW_ASSET_VERSION
          : id === "d" ? CHARACTER_CONTINUITY_ASSET_VERSION : CHARACTER_ASSET_VERSION;
        const frameCount = CHARACTER_ATTACK_FRAME_DURATIONS[id]?.length || THROW_ANIMATION_FRAMES;
        for (let frame = 0; frame < frameCount; frame += 1) {
          if (frame === 0 && CHARACTER_ATTACK_FRAME_ZERO_ALIASES.has(id)) {
            continue;
          }
          this.load.image(
            `character-${id}-${action}-${frame}`,
            versionedImageAsset(`assets/images/character-${id}-${action}-${frame}.png`,
              id === "f" && frame === 4 ? FIREBOMB_RECOVERY_ASSET_VERSION : assetVersion)
          );
        }
      });
      this.load.image("avatar-pistol", imageAsset("assets/images/avatar-pistol.png"));
      this.load.image("avatar-bow", versionedImageAsset("assets/images/avatar-bow.png", CROSSBOW_ASSET_VERSION));
      this.load.image("avatar-rifle", imageAsset("assets/images/avatar-rifle.png"));
      this.load.image("avatar-rocket", imageAsset("assets/images/avatar-rocket.png"));
      this.load.image("avatar-sniper", imageAsset("assets/images/avatar-sniper.png"));
      this.load.image("avatar-fire", imageAsset("assets/images/avatar-fire.png"));
      this.load.image("avatar-shock", imageAsset("assets/images/avatar-shock.png"));
      this.load.image("avatar-engineer", imageAsset("assets/images/avatar-engineer.png"));
      this.load.image("projectile-arrow", versionedImageAsset("assets/images/projectile-arrow.png", CROSSBOW_ASSET_VERSION));
      this.load.image("projectile-pistol", versionedImageAsset("assets/images/projectile-pistol.png", ALLIED_WEAPON_ASSET_VERSION));
      this.load.image("projectile-rifle", versionedImageAsset("assets/images/projectile-rifle.png", ALLIED_WEAPON_ASSET_VERSION));
      this.load.image("projectile-grenade", imageAsset("assets/images/projectile-grenade.png"));
      this.load.image("projectile-rocket", imageAsset("assets/images/projectile-rocket.png"));
      this.load.image("projectile-sniper", versionedImageAsset("assets/images/projectile-sniper.png", ALLIED_WEAPON_ASSET_VERSION));
      this.load.image("projectile-firebomb", versionedImageAsset("assets/images/projectile-firebomb.png", COMBAT_PROP_ASSET_VERSION));
      this.load.image("projectile-shock", versionedImageAsset("assets/images/projectile-shock.png", ALLIED_WEAPON_ASSET_VERSION));
      this.load.image("projectile-nail", versionedImageAsset("assets/images/projectile-nail.png", COMBAT_PROP_ASSET_VERSION));
      this.load.image("muzzle-arrow", versionedImageAsset("assets/images/muzzle-arrow.png", CROSSBOW_ASSET_VERSION));
      this.load.image("muzzle-pistol", imageAsset("assets/images/muzzle-pistol.png"));
      this.load.image("muzzle-rifle", imageAsset("assets/images/muzzle-rifle.png"));
      this.load.image("muzzle-rocket", imageAsset("assets/images/muzzle-rocket.png"));
      this.load.image("muzzle-sniper", imageAsset("assets/images/muzzle-sniper.png"));
      this.load.image("skill-repair", imageAsset("assets/images/skill-repair.png"));
      this.load.spritesheet("zombie-hit-arrow-sheet", versionedImageAsset("assets/images/zombie-hit-arrow-sheet.png", COMBAT_EFFECT_ASSET_VERSION), { frameWidth: 96, frameHeight: 96 });
      this.load.spritesheet("zombie-hit-pistol-sheet", versionedImageAsset("assets/images/zombie-hit-pistol-sheet.png", COMBAT_EFFECT_ASSET_VERSION), { frameWidth: 112, frameHeight: 96 });
      this.load.spritesheet("zombie-hit-rifle-sheet", versionedImageAsset("assets/images/zombie-hit-rifle-sheet.png", COMBAT_EFFECT_ASSET_VERSION), { frameWidth: 140, frameHeight: 100 });
      this.load.spritesheet("zombie-hit-rocket-sheet", versionedImageAsset("assets/images/zombie-hit-rocket-sheet.png", COMBAT_EFFECT_ASSET_VERSION), { frameWidth: 160, frameHeight: 130 });
      this.load.spritesheet("zombie-hit-sniper-sheet", versionedImageAsset("assets/images/zombie-hit-sniper-sheet.png", COMBAT_EFFECT_ASSET_VERSION), { frameWidth: 150, frameHeight: 104 });
      this.load.spritesheet("zombie-hit-nail-sheet", versionedImageAsset("assets/images/zombie-hit-nail-sheet.png", COMBAT_EFFECT_ASSET_VERSION), { frameWidth: 128, frameHeight: 128 });
      this.load.spritesheet("effect-fire-zone-sheet", versionedImageAsset("assets/images/effect-fire-zone-sheet.png", COMBAT_EFFECT_ASSET_VERSION), { frameWidth: 256, frameHeight: 160 });
      this.load.image("barbed-wire", imageAsset("assets/images/barbed-wire.png"));
      this.load.image("barricade-impact", versionedImageAsset("assets/images/barricade-impact.png", COMBAT_PROP_ASSET_VERSION));
      this.load.image("blood-burst-core", versionedImageAsset("assets/images/blood-burst-core.png", COMBAT_EFFECT_ASSET_VERSION));
      BLOOD_STAIN_TEXTURES.forEach((key) => this.load.image(key, versionedImageAsset(`assets/images/${key}.png`, COMBAT_EFFECT_ASSET_VERSION)));
      Object.values(ZOMBIE_DEATH_TEXTURES)
        .flat()
        .forEach((key) => this.load.spritesheet(
          key,
          versionedImageAsset(`assets/images/${key}.png`, ZOMBIE_ASSET_VERSION),
          { frameWidth: ZOMBIE_DEATH_ANIMATION_FRAME_SIZE, frameHeight: ZOMBIE_DEATH_ANIMATION_FRAME_SIZE }
        ));
      ZOMBIE_TEXTURE_TYPES.forEach((type) => {
        this.load.image(
          `zombie-walk-${type}`,
          versionedImageAsset(`assets/images/zombie-walk-${type}.png`, ZOMBIE_ASSET_VERSION)
        );
      });
    }

    create() {
      createZombieSpriteTextures(this);
      const fontsReady = document.fonts?.ready || Promise.resolve();
      const loadingText = document.querySelector(".loading__text");
      if (loadingText) {
        loadingText.textContent = SchoolI18n.t("loading.assemble");
      }
      Promise.all([this.loadManualCharacterAssets(), fontsReady]).then(() => {
        createGeneratedDefenderTextures(this);
        createCharacterSpriteTextures(this);
        createCharacterAttackTextures(this);
        createCharacterBadgeTextures(this);
        releaseCharacterSourceTextures(this);
        createTextures(this);
        window.SchoolZombieUI.installIcons(this);
        const loading = document.querySelector(".loading");
        if (loading) {
          loading.remove();
        }
        this.scene.start("GameScene");
      }).catch(() => {
        const loadingTitle = document.querySelector(".loading__title");
        const failedText = document.querySelector(".loading__text");
        if (loadingTitle) {
          loadingTitle.textContent = SchoolI18n.t("loading.offlineTitle");
        }
        if (failedText) {
          failedText.textContent = SchoolI18n.t("loading.offlineText");
        }
      });
    }
  }

  class GameScene extends Phaser.Scene {
    constructor() {
      super("GameScene");
    }

    create() {
      if (isLocalDebugHost()) {
        window.__schoolZombieGame = this;
      }
      const canvas = this.game?.canvas;
      if (canvas) {
        canvas.tabIndex = 0;
        canvas.setAttribute("role", "application");
        canvas.setAttribute("aria-label", SchoolI18n.t("boot.canvas"));
        canvas.setAttribute("aria-describedby", "game-input-help");
      }
      this.bounds = {
        left: 40,
        right: 500,
        top: 70,
        autoEngageTop: 120,
        barricade: 704,
        zombieFootLine: 642,
        survivorLine: 824,
        bottom: 920
      };

      this.zombies = [];
      this.bullets = [];
      this.zombieHitBuckets = new Map();
      this.zombieHitCandidates = [];
      this.embeddedArrows = [];
      this.fireZones = [];
      this.turrets = [];
      this.barbedWire = null;
      this.defenders = [];
      this.overlayObjects = [];
      this.transientObjects = new Set();
      this.damageTextPool = [];
      this.activeDamageTexts = new Set();
      this.activeHitEffects = new Set();
      this.activeBarricadeFragments = new Set();
      this.activeCorpses = [];
      this.damageTextsThisFrame = 0;
      this.hitEffectsThisFrame = 0;
      this.fireTickEffectsThisFrame = 0;
      this.runTimers = new Set();
      this.sceneTimers = new Set();
      this.recruitedDefenders = new Set(["c"]);
      this.recruitOrder = ["c"];
      this.runId = 0;
      this.disposed = false;
      this.reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      this.mode = "menu";
      this.elapsed = 0;
      this.stage = 1;
      this.level = 1;
      this.highestClearedStage = 0;
      this.kills = 0;
      this.killsInLevel = 0;
      this.levelNeed = STARTING_LEVEL_NEED;
      this.spawnTimer = STARTING_SPAWN_TIMER;
      this.spawnBurst = 1;
      this.maxCoreHp = 3000;
      this.coreHp = this.maxCoreHp;
      this.coins = 0;
      this.rewardCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
      this.meta = loadMetaSave();
      this.runCoinsBanked = false;
      this.runCoinsQueued = false;
      this.runCoinBankPromise = null;
      this.runRerollLevels = [];
      this.lastRankableRun = null;
      this.rankRequestId = 0;
      this.rankSessionId = null;
      this.rankSessionPromise = null;
      this.rankStageSyncQueue = Promise.resolve(true);
      this.rankPendingStageEvents = new Map();
      this.rankVerifiedStage = 0;
      this.rankSyncFailed = false;
      this.rankLastSyncError = "";
      this.rankSyncToken = 0;
      this.profileAuth = loadProfileAuth();
      this.profilePromise = null;
      this.profileReady = false;
      this.profileSyncFailed = false;
      this.profileFetchControllers = new Set();
      this.rankPrepLayer = null;
      this.rankNameLayer = null;
      this.rankSubmitInFlight = false;
      this.shopSelectedCharacter = "c";
      this.shopActionInFlight = false;
      this.shopLoadingObjects = [];
      this.shopLoadingTweens = [];
      this.shield = 0;
      this.damage = getTeamDamageForLevel(this.level);
      this.playerFireTimer = 0;
      this.focusPoint = null;
      this.audioCtx = null;
      this.audioUnavailable = false;
      this.audioResumePromise = null;
      this.masterGain = null;
      this.sfxBuffers = new Map();
      this.sfxLoadPromises = new Map();
      this.sfxFallbackTracks = new Map();
      this.activeFallbackSfx = new Set();
      this.activeSampleSfx = new Set();
      this.sfxFetchControllers = new Set();
      this.rankFetchControllers = new Set();
      this.rankListFetchControllers = new Set();
      this.sfxPreloadStarted = false;
      this.sfxPreloadToken = 0;
      this.bgmTracks = null;
      this.currentBgm = null;
      this.ambientTracks = null;
      this.sfxLastPlayed = {};
      this.boundHandlePointerDown = null;
      this.boundHandleKeyDown = null;
      this.boundHandleVisibilityChange = null;
      this.gamepadButtons = new Set();
      this.gamepadAccessDenied = false;
      this.lastGamepadPoll = 0;
      this.rankNameLayerCleanup = null;
      this.rankNameFocusRaf = 0;
      this.hitStopTimer = 0;
      this.speedMultiplier = 1;
      this.skillRerollsThisRun = 0;
      this.skillRerollUsed = false;
      this.skillChoiceCardObjects = [];
      this.currentSkillChoices = [];
      this.skillChoiceFocusHandlers = [];
      this.skillChoiceFocusIndex = 0;
      this.skillRerollButtonObjects = null;
      this.currentSkillChoiceSignature = "";
      this.pausedByButton = false;
      this.pauseConfirmOpen = false;
      this.events.once("shutdown", () => this.disposeScene());
      this.events.once("destroy", () => this.disposeScene());
      this.boundHandleRankingSaved = (event) => {
        if (!this.disposed && event.detail?.game_id === RANK_GAME_ID && this.mode === "ranking") {
          this.showRankings();
        }
      };
      window.addEventListener("archer-ranking-saved", this.boundHandleRankingSaved);
      this.boundHandleRewardSaved = (event) => {
        if (this.disposed || event.detail?.data?.profile_id !== this.profileAuth?.profile_id) return;
        if (event.detail.session_id === (this.rankSessionId || window.ArcherRanking?.sessionId(RANK_GAME_ID))) {
          this.runCoinsBanked = true;
          this.runCoinsQueued = false;
        }
        // Read the latest wallet instead of applying an old delivery receipt over
        // coins earned/spent in another run or tab.
        this.ensureServerProfile({ force: true, quiet: true, allowOffline: false }).then(() => {
          if (this.disposed) return;
          if (this.menuCoinsText?.active) this.menuCoinsText.setText(`$${this.meta.coins}`);
          if (this.gameOverCoinsText?.active && this.runCoinsBanked) {
            this.gameOverCoinsText.setText(SchoolI18n.t("over.coins", { earned: this.coins, held: this.meta.coins }));
          }
          this.shopUI?.refresh();
        }).catch(() => {});
      };
      window.addEventListener("archer-reward-saved", this.boundHandleRewardSaved);
      this.drawBackground();
      this.createCharacters();
      this.createHud();
      this.bindInput();
      this.showInitialProfileLoading();
      this.ensureServerProfile({ quiet: true }).catch(() => null).finally(() => {
        if (this.disposed) {
          return;
        }
        if (this.mode === "profile-loading") {
          this.showMenu();
        }
        this.applyDebugLaunchFlags();
      });
    }

    applyDebugLaunchFlags() {
      if (!isLocalDebugHost()) {
        return;
      }
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
          this.damage = getTeamDamageForLevel(this.level);
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

      const coolSpill = this.add.ellipse(42, 286, 270, 620, COLORS.blue, 0.065)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(2);
      const alarmSpill = this.add.ellipse(508, 352, 230, 560, 0xff4c3d, 0.055)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(2);
      const atmosphere = this.add.graphics().setDepth(2);
      atmosphere.fillStyle(0x061015, 0.2);
      atmosphere.fillRect(0, 0, GAME_WIDTH, 96);
      atmosphere.fillStyle(0x061015, 0.34);
      atmosphere.fillRect(0, 870, GAME_WIDTH, 90);

      const vignette = this.add.graphics().setDepth(3);
      for (let index = 0; index < 8; index += 1) {
        vignette.lineStyle(18, 0x020304, 0.075 + index * 0.012);
        vignette.strokeRect(index * 9, index * 9, GAME_WIDTH - index * 18, GAME_HEIGHT - index * 18);
      }

      if (!this.reducedMotion) {
        this.tweens.add({
          targets: coolSpill,
          alpha: 0.78,
          scaleX: 1.06,
          duration: 3600,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: alarmSpill,
          alpha: 0.86,
          scaleY: 1.05,
          duration: 2500,
          delay: 420,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }
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
        const burstDelay = defender.burstDelay ? scaleWeaponInterval(defender.burstDelay) : 0;
        const sprite = this.add.image(defender.x, defender.y, `character-${defender.id}-aim-12`)
          .setOrigin(0.5, 1)
          .setDepth(142 + defender.y / 10);
        this.fitSpriteHeight(
          sprite,
          defender.height * (CHARACTER_ACTION_HEIGHT_SCALE[defender.id] || 1)
        );
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
          attackAnimation: null,
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
          rocketDamageBoost: 1,
          rocketRadiusBoost: 1,
          shotsSinceRocket: 0,
          burstCount: defender.burstCount || 1,
          baseBurstCount: defender.burstCount || 1,
          burstDelay,
          baseBurstDelay: burstDelay,
          splashRadius: defender.splashRadius || 0,
          splashDamageScale: defender.splashDamageScale || 0,
          splashRadiusBoost: 1,
          splashDamageBoost: 1,
          fireZoneRadius: defender.fireZoneRadius || 0,
          baseFireZoneRadius: defender.fireZoneRadius || 0,
          fireZoneDuration: defender.fireZoneDuration || 0,
          baseFireZoneDuration: defender.fireZoneDuration || 0,
          fireZoneDamageScale: defender.fireZoneDamageScale || 0,
          baseFireZoneDamageScale: defender.fireZoneDamageScale || 0,
          chainJumps: defender.chainJumps || 0,
          baseChainJumps: defender.chainJumps || 0,
          chainRadius: defender.chainRadius || 0,
          baseChainRadius: defender.chainRadius || 0,
          chainDamageScale: defender.chainDamageScale || 0,
          baseChainDamageScale: defender.chainDamageScale || 0,
          turretDamageBoost: 1,
          turretRateBoost: 1,
          wireDamageBoost: 1,
          wireSlowBoost: 1,
          barricadeRepairBoost: 1,
          barricadeShieldBoost: 1,
          markDuration: defender.markDuration || 0,
          baseMarkDuration: defender.markDuration || 0,
          markDamageBonus: defender.markDamageBonus || 0,
          baseMarkDamageBonus: defender.markDamageBonus || 0,
          slowDuration: defender.slowDuration || 0,
          baseSlowDuration: defender.slowDuration || 0,
          stunDuration: defender.stunDuration || 0,
          baseStunDuration: defender.stunDuration || 0,
          timer: rand(scaleWeaponInterval(0.15), fireRate),
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
      this.showRecruitCutIn(roster);
    }

    showRecruitCutIn(roster) {
      const recruit = roster?.recruit;
      if (!recruit) {
        return;
      }
      const accent = fieldAccent(SKILL_ACCENTS[`recruit-${roster.id}`] || COLORS.gold);
      const accentHex = "#d5c5a1";
      const portrait = recruit.portrait || recruit.icon || OWNER_SKILL_PORTRAITS[roster.id];
      const panel = this.trackTransient(this.add.container(GAME_WIDTH + 260, 178).setDepth(346).setAlpha(0).setScale(0.96));
      const shadow = this.add.rectangle(4, 12, 430, 132, 0x000000, 0.46);
      const frame = this.addSurfaceImage(0, 0, 426, 124);
      const topLine = this.add.rectangle(-160, -59, 52, 2, accent, 0.8);
      const scan = this.add.rectangle(36, 30, 320, 2, 0xeee6d2, 0.18);
      const portraitGlow = this.add.circle(-154, -4, 66, accent, 0.16)
        .setStrokeStyle(1, UI_COLORS.steel, 0.65);
      const portraitImage = this.add.image(-154, -2, portrait)
        .setDisplaySize(132, 132);
      const kicker = this.add.text(-58, -34, "NEW ALLY", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 13,
        fontStyle: "900",
        color: accentHex,
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0, 0.5);
      const title = this.add.text(-58, -7, recruit.title || SchoolI18n.t("recruit.fallbackTitle"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 25,
        fontStyle: "900",
        color: "#eee6d2",
        stroke: "#050607",
        strokeThickness: 5
      }).setOrigin(0, 0.5);
      const line = this.add.text(-58, 26, recruit.line || SchoolI18n.t("recruit.fallbackLine"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 15,
        fontStyle: "900",
        color: "#d0cbbd",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0, 0.5);
      const tag = this.add.text(164, 43, recruit.tag || SchoolI18n.t("tag.support"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 13,
        fontStyle: "900",
        color: "#050607",
        backgroundColor: accentHex,
        padding: { left: 9, right: 9, top: 4, bottom: 4 }
      }).setOrigin(0.5);

      panel.add([
        shadow,
        frame,
        topLine,
        scan,
        portraitGlow,
        portraitImage,
        kicker,
        title,
        line,
        tag
      ]);

      this.tweens.add({
        targets: panel,
        x: GAME_WIDTH / 2,
        alpha: 1,
        scale: 1,
        duration: 340,
        ease: "Cubic.easeOut"
      });
      this.tweens.add({
        targets: scan,
        x: 150,
        alpha: 0,
        duration: 780,
        repeat: 1,
        ease: "Cubic.easeIn"
      });
      this.scheduleSceneDelay(RECRUIT_CUTIN_HOLD_MS, () => {
        if (!panel.active) {
          return;
        }
        this.tweens.add({
          targets: panel,
          x: -280,
          alpha: 0,
          duration: 320,
          ease: "Cubic.easeIn",
          onComplete: () => this.destroyTransientObject(panel, false)
        });
      });
    }

    getRecruitUpgrades() {
      return DEFENDER_ROSTER
        .filter((defender) => defender.role !== "player" && !this.recruitedDefenders.has(defender.id))
        .map((defender) => ({
          id: `recruit-${defender.id}`,
          icon: defender.recruit.icon,
          characterTexture: `character-${defender.id}-idle`,
          portraitTexture: defender.recruit.portrait || defender.recruit.icon,
          tag: defender.recruit.tag,
          title: defender.recruit.title,
          desc: defender.recruit.desc,
          stat: SchoolI18n.t("recruit.stat"),
          accent: SKILL_ACCENTS[`recruit-${defender.id}`],
          accentHex: SKILL_ACCENT_HEX[`recruit-${defender.id}`],
          sfx: "recruit",
          suppressToast: true,
          toast: SchoolI18n.t("recruit.done", { title: defender.recruit.title }),
          apply: () => this.recruitDefender(defender.id)
        }));
    }

    fitSpriteHeight(sprite, height) {
      const texture = sprite.texture.getSourceImage();
      const ratio = texture.width / texture.height;
      sprite.setDisplaySize(height * ratio, height);
    }

    fitDefenderActionHeight(defender) {
      const sourceHeightScale = CHARACTER_ACTION_HEIGHT_SCALE[defender.id] || 1;
      this.fitSpriteHeight(defender.sprite, defender.height * sourceHeightScale);
    }

    blendDefenderFrame(defender, duration, nextTextureKey = null) {
      const sprite = defender.sprite;
      if (!sprite || !(duration > 0) || this.reducedMotion || sprite.texture?.key === nextTextureKey) {
        return null;
      }
      // Leave the outgoing drawing on screen and dissolve it away, so the
      // first rendered frame of a transition is never a hard cut.
      const ghost = this.trackTransient(this.add.image(sprite.x, sprite.y, sprite.texture.key)
        .setOrigin(sprite.originX, sprite.originY)
        .setDisplaySize(sprite.displayWidth, sprite.displayHeight)
        .setRotation(sprite.rotation)
        .setFlip(sprite.flipX, sprite.flipY)
        .setAlpha(sprite.alpha)
        .setDepth(sprite.depth + 0.01));
      this.tweens.add({
        targets: ghost,
        alpha: 0,
        duration,
        ease: "Sine.easeOut",
        onComplete: () => this.destroyTransientObject(ghost, false)
      });
      return ghost;
    }

    setDefenderPose(defender, pose) {
      if (!defender.sprite) {
        return;
      }
      const textureKey = `character-${defender.id}-${pose}`;
      if (!defender.attackAnimation && defender.pose === pose && defender.sprite.texture?.key === textureKey) {
        return;
      }
      defender.attackAnimation = null;
      defender.pose = pose;
      defender.sprite.setTexture(textureKey);
      this.fitSpriteHeight(
        defender.sprite,
        defender.height * (CHARACTER_ACTION_HEIGHT_SCALE[defender.id] || 1)
      );
    }

    startDefenderAttackAnimation(defender, pose, onRelease = null) {
      const action = CHARACTER_ATTACK_ACTIONS[defender.id];
      const firstAttackFrame = action ? `character-${defender.id}-${action}-${pose}-0` : null;
      const releaseFrame = CHARACTER_ATTACK_RELEASE_FRAMES[defender.id];
      const frameDurations = CHARACTER_ATTACK_FRAME_DURATIONS[defender.id]
        || Array(THROW_ANIMATION_FRAMES).fill(THROW_ANIMATION_FRAME_DURATION);
      const delaysRelease = Number.isInteger(releaseFrame) && typeof onRelease === "function";
      const previousPose = defender.pose;
      if (action && defender.sprite && this.textures.exists(firstAttackFrame)) {
        defender.pose = pose;
        defender.attackAnimation = {
          action,
          pose,
          frame: 0,
          frames: frameDurations.length,
          timer: frameDurations[0],
          frameDuration: THROW_ANIMATION_FRAME_DURATION,
          frameDurations,
          releaseFrame: delaysRelease ? releaseFrame : null,
          onRelease: delaysRelease ? onRelease : null
        };
        this.blendDefenderFrame(
          defender,
          (CHARACTER_FRAME_BLEND_DURATIONS[defender.id] || 0)
            * (previousPose && previousPose !== pose ? CHARACTER_TURN_BLEND_SCALE : 1),
          firstAttackFrame
        );
        defender.sprite.setTexture(firstAttackFrame);
        this.fitDefenderActionHeight(defender);
        defender.firePoseTimer = frameDurations.reduce((total, duration) => total + duration, 0);
        if (!delaysRelease && typeof onRelease === "function") {
          onRelease();
        }
        return;
      }
      this.setDefenderPose(defender, pose);
      defender.firePoseTimer = 0.18;
      if (typeof onRelease === "function") {
        onRelease();
      }
    }

    getAttackPose(defender, target) {
      const pivot = defender.aim?.pivot || [0, -160];
      const dx = target.x - (defender.x + pivot[0]);
      const dy = target.y - (defender.y + pivot[1]);
      return getShotAimPoseKey(Math.atan2(dy, dx));
    }

    getDefenderMuzzle(defender, pose, frame = 0) {
      const aim = defender.aim || { pivot: [0, -160], reach: 84 };
      const poseInfo = getAimPose(pose);
      const poseIndex = AIM_POSE_KEYS.indexOf(poseInfo.key);
      const measuredOffset = (frame > 0 ? CHARACTER_FRAME_MUZZLE_OFFSETS[defender.id]?.[frame]?.[poseIndex] : null)
        || CHARACTER_MUZZLE_OFFSETS[defender.id]?.[poseIndex];
      if (measuredOffset) {
        const effectAngleOverride = CHARACTER_MUZZLE_EFFECT_ANGLE_OVERRIDES[defender.id]?.[poseIndex];
        const effectAngle = Number.isFinite(effectAngleOverride)
          ? effectAngleOverride
          : DIRECTIONAL_MUZZLE_EFFECT_DEFENDERS.has(defender.id)
            ? Math.atan2(measuredOffset[1] - aim.pivot[1], measuredOffset[0] - aim.pivot[0])
            : null;
        return {
          x: defender.x + measuredOffset[0],
          y: defender.y + measuredOffset[1],
          effectAngle
        };
      }
      return {
        x: defender.x + aim.pivot[0] + Math.cos(poseInfo.angle) * aim.reach,
        y: defender.y + aim.pivot[1] + Math.sin(poseInfo.angle) * aim.reach
      };
    }

    syncDefenderMuzzleFlash(defender, frame) {
      const tracked = defender.muzzleFlash;
      const flash = tracked?.flash;
      if (!flash) {
        return;
      }
      if (flash.destroyed || flash.active === false) {
        defender.muzzleFlash = null;
        return;
      }
      if (!CHARACTER_FRAME_MUZZLE_OFFSETS[defender.id]?.[frame]) {
        return;
      }
      // Keep a live flash on the barrel while the recoil frames move it.
      const muzzle = this.getDefenderMuzzle(defender, tracked.pose, frame);
      const x = muzzle.x + tracked.shotOffset;
      flash.setPosition(x, muzzle.y);
      const core = flash.muzzleCore;
      if (core && !core.destroyed && core.active !== false) {
        core.setPosition(x, muzzle.y);
      }
    }

    createHud() {
      this.ui = {};
      this.add.rectangle(270, 58, 538, 118, 0x11120f, 0.74).setDepth(299);
      this.addCommandPanel(270, 42, 532, 82, 300, COLORS.gold, { track: false, alpha: 0.96 });
      this.add.rectangle(270, 116, 516, 12, 0x030708, 0.84)
        .setStrokeStyle(1, 0xc5b995, 0.18)
        .setDepth(301);
      this.progressBack = this.add.rectangle(270, 115, 506, 8, 0x020303, 0.9)
        .setStrokeStyle(1, 0xeee6d2, 0.12)
        .setOrigin(0.5)
        .setDepth(302);
      this.progressBar = this.add.rectangle(17, 115, 1, 6, UI_COLORS.amber, 1).setOrigin(0, 0.5).setDepth(303);
      this.createHomeButton();
      this.createPauseButton();
      this.createSpeedButton();

      this.add.text(100, 20, "SURVIVE", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 9,
        fontStyle: "900",
        color: "#c5b995"
      }).setOrigin(0.5).setDepth(316);
      this.ui.timer = this.add.text(100, 42, "00:00", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 19,
        fontStyle: "900",
        color: "#eee6d2",
        stroke: "#0c1115",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(316);
      this.ui.stage = this.add.text(270, 30, SchoolI18n.t("stage.line", { stage: "01", name: SchoolI18n.t("stage.gate") }), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 22,
        fontStyle: "900",
        color: "#eee6d2",
        stroke: "#1a2228",
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(316);
      this.ui.level = this.add.text(270, 57, "WAVE 01 · 0 / 4", {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 13,
        fontStyle: "900",
        color: "#c6c4b5",
        stroke: "#1a2228",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(316);

      this.createStatusPanel();
    }

    createHomeButton() {
      const x = 38;
      const y = 42;
      const glow = this.add.rectangle(x, y + 4, 46, 46, 0x000000, 0.38).setDepth(317);
      const base = this.addSurfaceImage(x, y, 46, 46, "button").setDepth(318);
      const icon = this.add.graphics().setDepth(319);
      const hit = this.add.zone(x, y, 76, 76)
        .setDepth(320)
        .setInteractive({ useHandCursor: true });
      const drawIcon = (hovered = false) => {
        base.setTint(hovered ? 0xffffff : 0xd8d7cd);
        glow.setAlpha(0.38);
        icon.clear();
        icon.fillStyle(hovered ? UI_COLORS.chalk : UI_COLORS.amber, 0.96);
        icon.beginPath();
        icon.moveTo(x - 12, y - 2);
        icon.lineTo(x, y - 13);
        icon.lineTo(x + 12, y - 2);
        icon.closePath();
        icon.fillPath();
        icon.fillRect(x - 9, y - 2, 18, 13);
        icon.fillStyle(0x091319, 1);
        icon.fillRect(x - 3, y + 4, 6, 7);
      };
      drawIcon(false);
      hit.on("pointerdown", (pointer, localX, localY, event) => {
        if (event && typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        this.unlockAudio();
        this.playSfx("button", 0.72);
        if (this.mode === "playing") {
          this.mode = "paused";
          this.ui.pauseText?.setText("▶");
          this.showQuitConfirmation();
        } else if (this.mode === "paused") {
          this.showQuitConfirmation();
        }
      });
      hit.on("pointerover", () => drawIcon(true));
      hit.on("pointerout", () => drawIcon(false));
      this.ui.homeButton = { base, glow, icon, hit };
    }

    createPauseButton() {
      const x = 426;
      const y = 42;
      const glow = this.add.rectangle(x, y + 4, 46, 46, 0x000000, 0.38).setDepth(314);
      const circle = this.addSurfaceImage(x, y, 46, 46, "button").setDepth(315);
      const text = this.add.text(x, y - 1, "Ⅱ", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 19,
        fontStyle: "900",
        color: "#fff6d6",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(316);
      const hit = this.add.zone(x, y, 76, 76).setDepth(320).setInteractive({ useHandCursor: true });
      const setHover = (hovered) => {
        circle.setTint(hovered ? 0xffffff : 0xd8d7cd);
        glow.setAlpha(0.38);
        text.setScale(hovered ? 1.06 : 1);
      };
      hit.on("pointerdown", (pointer, localX, localY, event) => {
        event?.stopPropagation?.();
        this.unlockAudio();
        this.playSfx("pause", 0.74);
        this.togglePause();
      });
      hit.on("pointerover", () => setHover(true));
      hit.on("pointerout", () => setHover(false));
      this.ui.pauseText = text;
      this.ui.pauseButton = { glow, circle, text, hit };
    }

    createSpeedButton() {
      const x = 502;
      const y = 42;
      const circle = this.addSurfaceImage(x, y, 46, 46, "button").setDepth(315);
      const text = this.add.text(x, y, formatGameSpeedLabel(this.speedMultiplier || DEFAULT_GAME_SPEED), {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 16,
        fontStyle: "900",
        color: "#eee6d2",
        stroke: "#111",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(316);
      const hit = this.add.zone(x, y, 76, 76)
        .setDepth(320)
        .setInteractive({ useHandCursor: true });
      const setHover = (hovered) => {
        circle.setTint(hovered ? 0xffffff : 0xd8d7cd);
        text.setScale(hovered ? 1.05 : 1);
      };
      hit.on("pointerdown", (pointer, localX, localY, event) => {
        if (event && typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        this.unlockAudio();
        this.toggleSpeed();
      });
      hit.on("pointerover", () => setHover(true));
      hit.on("pointerout", () => setHover(false));
      this.speedCircle = circle;
      this.ui.speed = text;
      this.ui.speedButton = { circle, text, hit };
    }

    createStatusPanel() {
      const coins = this.addHudChip(270, 91, 176, SchoolI18n.t("hud.supply"), "$0", COLORS.gold);
      this.ui.supplyLabel = coins.label;
      this.ui.coins = coins.value;
      this.ui.statusChips = { coins };

      const corePanel = this.addCommandPanel(270, 925, 438, 58, 315, COLORS.green, {
        alpha: 0.88,
        track: false
      });
      this.ui.corePanel = corePanel;
      this.add.text(72, 913, "BARRICADE", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 12,
        fontStyle: "900",
        color: "#b4b2a0"
      }).setOrigin(0, 0.5).setDepth(317);
      this.ui.core = this.add.text(468, 913, "3000 / 3000", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fontStyle: "900",
        color: "#eee6d2",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(1, 0.5).setDepth(317);
      this.ui.shield = this.add.text(270, 913, "SHIELD +0", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fontStyle: "900",
        color: "#acb59b",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(318).setVisible(false);
      this.coreBack = this.add.rectangle(270, 932, 380, 11, 0x000000, 0.78)
        .setStrokeStyle(1, 0xeee6d2, 0.18)
        .setDepth(316);
      this.coreBar = this.add.rectangle(80, 932, 380, 7, UI_COLORS.success, 1).setOrigin(0, 0.5).setDepth(317);
      this.shieldBar = this.add.rectangle(80, 927, 380, 3, UI_COLORS.olive, 1)
        .setOrigin(0, 0.5)
        .setDepth(318)
        .setVisible(false);
      this.ui.threat = this.add.text(270, 947, SchoolI18n.t("hud.stable"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 12,
        fontStyle: "900",
        color: "#b4c097"
      }).setOrigin(0.5).setDepth(317);
    }

    bindInput() {
      this.boundHandlePointerDown = () => {
        this.unlockAudio();
        if (this.mode === "playing") {
          this.startBgm("game");
          return;
        }
        if (this.mode === "menu" || this.mode === "shop" || this.mode === "gameover") {
          this.startBgm("menu");
        }
      };
      this.input.on("pointerdown", this.boundHandlePointerDown);

      this.boundHandleKeyDown = (event) => {
        const target = event.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        if (this.mode === "shop" && target?.closest?.(".school-shop")) return;
        const code = event.code;
        const consume = () => {
          event.preventDefault();
          event.stopPropagation();
        };
        if ((code === "Escape" || code === "KeyP") && !event.repeat) {
          if (this.mode === "playing" || this.mode === "paused") {
            consume();
            this.playSfx("pause", 0.72);
            this.togglePause();
            return;
          }
          if (this.mode === "shop" || this.mode === "ranking") {
            consume();
            if (this.shopUI?.isOpen()) this.shopUI.close();
            else this.showMenu();
            return;
          }
        }
        if (code === "KeyF" && !event.repeat && (this.mode === "playing" || this.mode === "paused")) {
          consume();
          this.toggleSpeed();
          return;
        }
        if (this.mode === "menu" && !event.repeat) {
          if (code === "Enter" || code === "Space") {
            consume();
            this.startRun();
          } else if (code === "KeyL") {
            consume();
            this.showRankings();
          } else if (code === "KeyA") {
            consume();
            this.showShop();
          }
          return;
        }
        if (this.mode === "skill" && !event.repeat) {
          if (code === "KeyR") {
            consume();
            this.rerollSkillChoices();
            return;
          }
          const choiceIndex = { Digit1: 0, Digit2: 1, Digit3: 2 }[code];
          const choice = Number.isInteger(choiceIndex) ? this.currentSkillChoices?.[choiceIndex] : null;
          if (choice) {
            consume();
            this.applyUpgrade(choice);
            return;
          }
          if (code === "ArrowUp" || code === "ArrowLeft" || code === "ArrowDown" || code === "ArrowRight") {
            consume();
            const direction = code === "ArrowUp" || code === "ArrowLeft" ? -1 : 1;
            this.setSkillChoiceFocus((this.skillChoiceFocusIndex || 0) + direction);
            return;
          }
          if (code === "Enter" || code === "Space") {
            consume();
            const focusedChoice = this.currentSkillChoices?.[this.skillChoiceFocusIndex || 0];
            if (focusedChoice) {
              this.applyUpgrade(focusedChoice);
            }
          }
        }
      };
      window.addEventListener("keydown", this.boundHandleKeyDown, { passive: false });

      this.boundHandleVisibilityChange = () => {
        if (document.hidden && this.mode === "playing") {
          this.togglePause();
        }
      };
      document.addEventListener("visibilitychange", this.boundHandleVisibilityChange);
      this.boundHandlePageHide = () => {
        if (this.disposed || !["playing", "paused", "skill"].includes(this.mode)) return;
        // bankRun enqueues the final snapshot synchronously before any network
        // wait, so refresh/navigation keeps rewards even when disconnected.
        this.mode = "gameover";
        this.runEndedOnPageHide = true;
        void this.bankRunCoins();
      };
      this.boundHandlePageShow = () => {
        if (!this.runEndedOnPageHide || this.disposed) return;
        this.runEndedOnPageHide = false;
        this.returnToGameStart();
      };
      window.addEventListener("pagehide", this.boundHandlePageHide);
      window.addEventListener("pageshow", this.boundHandlePageShow);
    }

    pollGamepadInput(time = 0) {
      if (this.gamepadAccessDenied) {
        return;
      }
      if (time - (this.lastGamepadPoll || 0) < 70) {
        return;
      }
      this.lastGamepadPoll = time;
      let gamepads = [];
      try {
        gamepads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
      } catch (error) {
        if (error?.name === "SecurityError") {
          this.gamepadAccessDenied = true;
          this.gamepadButtons.clear();
          return;
        }
        throw error;
      }
      const gamepad = Array.from(gamepads || []).find(Boolean);
      if (!gamepad) {
        this.gamepadButtons.clear();
        return;
      }
      const pressed = new Set();
      gamepad.buttons.forEach((button, index) => {
        if (button?.pressed) {
          pressed.add(index);
        }
      });
      const justPressed = (index) => pressed.has(index) && !this.gamepadButtons.has(index);
      if (this.mode === "shop" && this.shopUI) {
        if (justPressed(1)) this.shopUI.gamepad("back");
        else if (justPressed(0)) this.shopUI.gamepad("accept");
        else if (justPressed(12) || justPressed(14)) this.shopUI.gamepad("previous");
        else if (justPressed(13) || justPressed(15)) this.shopUI.gamepad("next");
        this.gamepadButtons = pressed;
        return;
      }
      if (justPressed(9) && (this.mode === "playing" || this.mode === "paused")) {
        this.playSfx("pause", 0.72);
        this.togglePause();
      } else if (justPressed(5) && (this.mode === "playing" || this.mode === "paused")) {
        this.toggleSpeed();
      } else if (this.mode === "skill" && (justPressed(12) || justPressed(14))) {
        this.setSkillChoiceFocus((this.skillChoiceFocusIndex || 0) - 1);
      } else if (this.mode === "skill" && (justPressed(13) || justPressed(15))) {
        this.setSkillChoiceFocus((this.skillChoiceFocusIndex || 0) + 1);
      } else if (this.mode === "skill" && justPressed(2)) {
        this.rerollSkillChoices();
      } else if (justPressed(0)) {
        if (this.mode === "menu") {
          this.startRun();
        } else if (this.mode === "skill") {
          const focusedChoice = this.currentSkillChoices?.[this.skillChoiceFocusIndex || 0];
          if (focusedChoice) {
            this.applyUpgrade(focusedChoice);
          }
        } else if (this.mode === "paused") {
          this.togglePause();
        }
      } else if (justPressed(1)) {
        if (this.mode === "shop" || this.mode === "ranking") {
          this.showMenu();
        } else if (this.mode === "paused") {
          this.showPauseOverlay();
        }
      }
      this.gamepadButtons = pressed;
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

    resetVisualEffectBudgets() {
      this.damageTextsThisFrame = 0;
      this.hitEffectsThisFrame = 0;
      this.fireTickEffectsThisFrame = 0;
    }

    canSpawnDamageText(priority = false) {
      const frameLimit = DAMAGE_TEXT_FRAME_BUDGET + (priority ? 4 : 0);
      const activeLimit = ACTIVE_DAMAGE_TEXT_LIMIT + (priority ? 8 : 0);
      if ((this.damageTextsThisFrame || 0) >= frameLimit) {
        return false;
      }
      if ((this.activeDamageTexts?.size || 0) >= activeLimit) {
        return false;
      }
      this.damageTextsThisFrame = (this.damageTextsThisFrame || 0) + 1;
      return true;
    }

    canSpawnHitEffect(priority = false) {
      const frameLimit = HIT_EFFECT_FRAME_BUDGET + (priority ? 4 : 0);
      const activeLimit = ACTIVE_HIT_EFFECT_LIMIT + (priority ? 10 : 0);
      if ((this.hitEffectsThisFrame || 0) >= frameLimit) {
        return false;
      }
      if ((this.activeHitEffects?.size || 0) >= activeLimit) {
        return false;
      }
      this.hitEffectsThisFrame = (this.hitEffectsThisFrame || 0) + 1;
      return true;
    }

    canSpawnFireTickEffect() {
      if ((this.fireTickEffectsThisFrame || 0) >= FIRE_TICK_EFFECT_FRAME_BUDGET) {
        return false;
      }
      this.fireTickEffectsThisFrame = (this.fireTickEffectsThisFrame || 0) + 1;
      return true;
    }

    trackHitEffectRoot(object) {
      if (object) {
        object.hitEffectRoot = true;
        this.activeHitEffects.add(object);
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
      if (object?.followZombie?.hitEffects) {
        object.followZombie.hitEffects.delete(object);
      }
      if (object?.hitEffectRoot) {
        this.activeHitEffects.delete(object);
        object.hitEffectRoot = false;
      }
      if (object?.barricadeFragment) {
        this.activeBarricadeFragments.delete(object);
        object.barricadeFragment = false;
      }
      this.transientObjects.delete(object);
      this.destroyGameObject(object, killTweens);
    }

    clearTransientObjects() {
      Array.from(this.transientObjects).forEach((object) => this.destroyTransientObject(object));
      this.transientObjects.clear();
      this.clearActiveDamageTexts();
      this.activeHitEffects.clear();
      this.activeBarricadeFragments.clear();
      this.activeCorpses.length = 0;
    }

    clearEmbeddedArrows() {
      (this.embeddedArrows || []).forEach((arrow) => this.destroyGameObject(arrow.sprite));
      this.embeddedArrows = [];
    }

    clearEmbeddedArrowsForZombie(zombie) {
      if (!zombie || !this.embeddedArrows?.length) {
        return;
      }
      for (let i = this.embeddedArrows.length - 1; i >= 0; i -= 1) {
        const arrow = this.embeddedArrows[i];
        if (arrow.zombie === zombie) {
          this.destroyGameObject(arrow.sprite);
          this.embeddedArrows.splice(i, 1);
        }
      }
    }

    clearRunEntities() {
      this.clearEmbeddedArrows();
      (this.fireZones || []).forEach((zone) => {
        (zone.objects || []).forEach((object) => this.destroyTransientObject(object, false));
      });
      (this.turrets || []).forEach((turret) => this.destroyTransientObject(turret.container, false));
      if (this.barbedWire) {
        (this.barbedWire.objects || []).forEach((object) => this.destroyTransientObject(object, false));
      }
      this.zombies.forEach((zombie) => {
        this.clearWeakMark(zombie);
        this.destroyGameObject(zombie);
      });
      this.bullets.forEach((bullet) => this.destroyBullet(bullet));
      this.zombies = [];
      this.bullets = [];
      this.zombieHitBuckets?.clear();
      if (this.zombieHitCandidates) {
        this.zombieHitCandidates.length = 0;
      }
      if (this.zombieSeparationCandidates) {
        this.zombieSeparationCandidates.length = 0;
      }
      this.fireZones = [];
      this.turrets = [];
      this.barbedWire = null;
    }

    getZombieFootOffset(zombie) {
      const displayHeight = zombie?.displayH || 170;
      const type = zombie?.elite ? "elite" : zombie?.type || "normal";
      return displayHeight * (ZOMBIE_FOOT_OFFSET_RATIOS[type] || ZOMBIE_FOOT_OFFSET_RATIOS.normal);
    }

    getZombieFootPoint(zombie) {
      const footOffset = this.getZombieFootOffset(zombie);
      return {
        x: zombie?.x || 0,
        y: (zombie?.y || 0) + footOffset
      };
    }

    fetchWithAbort(url, options = {}, controllerSet = null) {
      const AbortControllerCtor = typeof window !== "undefined" ? window.AbortController : null;
      const timeoutMs = clamp(Number(options.timeoutMs) || 8000, 1500, 20000);
      const { timeoutMs: omittedTimeout, ...fetchOptions } = options;
      if (!AbortControllerCtor || options.signal) {
        return fetch(url, fetchOptions);
      }
      const controller = new AbortControllerCtor();
      controllerSet?.add(controller);
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      return fetch(url, { ...fetchOptions, signal: controller.signal })
        .finally(() => {
          window.clearTimeout(timeout);
          controllerSet?.delete(controller);
        });
    }

    abortFetchControllers(controllerSet) {
      if (!controllerSet) {
        return;
      }
      controllerSet.forEach((controller) => {
        try {
          controller.abort();
        } catch (error) {
          // Older browsers can throw if a controller is already settled.
        }
      });
      controllerSet.clear();
    }

    applyServerProfile(data) {
      if (this.disposed) return this.meta;
      if (!data || data.success !== true) {
        throw new Error("invalid profile response");
      }
      if (this.profileAuth && data.profile_id !== this.profileAuth.profile_id) {
        throw new Error("profile response belongs to another account");
      }
      const revision = Number(data.profile_revision) || 0;
      if (this.profileRevision && revision < this.profileRevision) return this.meta;
      if (data.profile_id && data.profile_secret) {
        this.profileAuth = {
          profile_id: data.profile_id,
          profile_secret: data.profile_secret
        };
        saveProfileAuth(this.profileAuth);
      } else if (!this.profileAuth && data.profile_id) {
        this.profileAuth = loadProfileAuth();
      }
      this.meta = normalizeMetaSave(data.profile || {
        coins: data.coins,
        upgrades: data.upgrades
      });
      this.profileRevision = revision;
      saveMetaSave(this.meta);
      if (this.ui?.coins) {
        this.updateHud();
      }
      this.profileReady = true;
      this.profileSyncFailed = false;
      return this.meta;
    }

    async ensureServerProfile(options = {}) {
      const { quiet = false, force = false, allowOffline = true } = options;
      if (this.profileReady && !force) {
        return this.meta;
      }
      if (this.profilePromise) {
        const meta = await this.profilePromise;
        if (!allowOffline && this.profileSyncFailed) throw new Error("profile synchronization unavailable");
        return meta;
      }

      const requestProfile = async (auth) => {
        const response = await this.fetchWithAbort(`${RANK_API_BASE}/school-zombie/profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(auth || {})
        }, this.profileFetchControllers);
        return response;
      };

      const load = async () => {
        if (this.disposed) return this.meta;
        let auth = this.profileAuth || await restoreProfileAuth();
        if (auth) {
          this.profileAuth = auth;
          this.profileCredentialsSaved = await isProfileAuthSaved(auth);
        }
        // A failed authorization/read must never replace the existing wallet.
        let response = await requestProfile(auth);
        if (auth && response.status === 401) {
          const backup = await readProfileAuthBackup();
          if (backup?.profile_id === auth.profile_id && backup.profile_secret !== auth.profile_secret) {
            const restoredResponse = await requestProfile(backup);
            if (restoredResponse.ok) { auth = backup; response = restoredResponse; }
          }
        }
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          const error = new Error(data?.error || `profile ${response.status}`);
          error.status = response.status;
          throw error;
        }
        if (auth && data?.profile_id !== auth.profile_id) throw new Error("profile identity changed");
        const nextAuth = data.profile_secret
          ? { profile_id: data.profile_id, profile_secret: data.profile_secret } : auth;
        if (nextAuth) {
          this.profileAuth = nextAuth;
          this.profileCredentialsSaved = await saveProfileAuth(nextAuth);
        }
        if (!this.profileCredentialsSaved) {
          const error = new Error("profile credentials could not be stored");
          error.storageUnavailable = true;
          throw error;
        }
        return this.applyServerProfile(data);
      };

      // Two newly opened tabs must recover/create the same persistent identity.
      const loading = typeof navigator !== "undefined" && navigator.locks?.request
        ? navigator.locks.request("school-zombie-profile", load) : load();
      this.profilePromise = loading
        .catch((error) => {
          this.profileSyncFailed = true;
          if (allowOffline && this.profileAuth && this.profileCredentialsSaved && ![400, 401, 403, 404].includes(error.status)) {
            this.profileReady = true;
            if (!quiet) {
              this.playSfx("core", 0.5);
              this.showToast(SchoolI18n.t("toast.offlineRewards"), COLORS.gold);
            }
            return this.meta;
          }
          if (!quiet) {
            this.playSfx("core", 0.65);
            this.showToast(SchoolI18n.t(error.storageUnavailable ? "toast.profileSaveFail" : "toast.profileFail"), COLORS.red);
          }
          throw error;
        })
        .finally(() => {
          this.profilePromise = null;
        });
      return this.profilePromise;
    }

    async postProfileAction(path, body = {}) {
      await this.ensureServerProfile();
      if (!this.profileAuth) {
        throw new Error("profile credentials unavailable");
      }
      const response = await this.fetchWithAbort(`${RANK_API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ ...this.profileAuth, ...body })
      }, this.profileFetchControllers);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `profile action ${response.status}`);
      }
      this.applyServerProfile(data);
      return data;
    }

    cleanupAudio() {
      this.sfxPreloadToken = (this.sfxPreloadToken || 0) + 1;
      this.abortFetchControllers(this.sfxFetchControllers);
      Array.from(this.activeSampleSfx || []).forEach((sample) => {
        if (typeof sample.cleanup === "function") {
          sample.cleanup();
        }
      });
      this.activeSampleSfx.clear();
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
      if (this.ambientTracks) {
        Object.values(this.ambientTracks).forEach((track) => {
          track.pause();
          track.removeAttribute("src");
          if (typeof track.load === "function") {
            track.load();
          }
        });
      }
      this.ambientTracks = null;
      this.sfxBuffers.clear();
      this.sfxLoadPromises.clear();
      Array.from(this.activeFallbackSfx || []).forEach((track) => {
        if (typeof track.__schoolZombieSfxCleanup === "function") {
          track.__schoolZombieSfxCleanup();
        }
        track.pause();
        track.removeAttribute("src");
        if (typeof track.load === "function") {
          track.load();
        }
      });
      this.activeFallbackSfx.clear();
      this.sfxFallbackTracks.forEach((track) => {
        track.pause();
        track.removeAttribute("src");
        if (typeof track.load === "function") {
          track.load();
        }
      });
      this.sfxFallbackTracks.clear();
      if (this.masterGain && typeof this.masterGain.disconnect === "function") {
        this.masterGain.disconnect();
      }
      this.masterGain = null;
      if (this.audioCtx && typeof this.audioCtx.close === "function") {
        this.audioCtx.close().catch(() => {});
      }
      this.audioCtx = null;
      this.audioUnavailable = false;
      this.audioResumePromise = null;
      this.sfxPreloadStarted = false;
    }

    disposeScene() {
      if (this.disposed) {
        return;
      }
      if (window.ArcherRanking?.bankRun && ["playing", "paused", "skill"].includes(this.mode)) {
        void this.bankRunCoins();
      }
      this.disposed = true;
      this.cancelRunTimers();
      this.cancelSceneTimers();
      this.abortFetchControllers(this.rankFetchControllers);
      this.abortFetchControllers(this.rankListFetchControllers);
      this.abortFetchControllers(this.profileFetchControllers);
      if (this.input && this.boundHandlePointerDown && typeof this.input.off === "function") {
        this.input.off("pointerdown", this.boundHandlePointerDown);
      }
      this.boundHandlePointerDown = null;
      if (this.boundHandleKeyDown) {
        window.removeEventListener("keydown", this.boundHandleKeyDown);
      }
      if (this.boundHandleVisibilityChange) {
        document.removeEventListener("visibilitychange", this.boundHandleVisibilityChange);
      }
      this.boundHandleKeyDown = null;
      this.boundHandleVisibilityChange = null;
      window.removeEventListener("pagehide", this.boundHandlePageHide);
      window.removeEventListener("pageshow", this.boundHandlePageShow);
      this.boundHandlePageHide = this.boundHandlePageShow = null;
      window.removeEventListener("archer-ranking-saved", this.boundHandleRankingSaved);
      this.boundHandleRankingSaved = null;
      window.removeEventListener("archer-reward-saved", this.boundHandleRewardSaved);
      this.boundHandleRewardSaved = null;
      this.gamepadButtons.clear();
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
      if (this.audioUnavailable) {
        return null;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return null;
      }
      try {
        if (!this.audioCtx || this.audioCtx.state === "closed") {
          this.audioCtx = new AudioContext();
          this.masterGain = this.audioCtx.createGain();
          this.masterGain.gain.value = SFX_MASTER_VOLUME;
          this.masterGain.connect(this.audioCtx.destination);
        }
      } catch (error) {
        this.disableCustomAudio();
        return null;
      }
      this.preloadSfxAssets().catch(() => {});
      this.resumeAudioContext().catch(() => {});
      return this.audioCtx;
    }

    disableCustomAudio() {
      this.audioUnavailable = true;
      this.audioResumePromise = null;
      this.sfxPreloadToken = (this.sfxPreloadToken || 0) + 1;
      this.abortFetchControllers(this.sfxFetchControllers);
      this.sfxBuffers.clear();
      this.sfxLoadPromises.clear();
      if (this.masterGain && typeof this.masterGain.disconnect === "function") {
        try {
          this.masterGain.disconnect();
        } catch (error) {
          // Audio graph may already be torn down by the browser.
        }
      }
      this.masterGain = null;
      const ctx = this.audioCtx;
      this.audioCtx = null;
      if (ctx && ctx.state !== "closed" && typeof ctx.close === "function") {
        ctx.close().catch(() => {});
      }
    }

    resumeAudioContext() {
      if (!this.audioCtx || this.audioCtx.state !== "suspended") {
        return Promise.resolve();
      }
      if (this.audioResumePromise) {
        return this.audioResumePromise;
      }
      try {
        const resumePromise = this.audioCtx.resume();
        if (!resumePromise || typeof resumePromise.then !== "function") {
          return Promise.resolve();
        }
        this.audioResumePromise = resumePromise
          .catch(() => {
            this.disableCustomAudio();
          })
          .finally(() => {
            this.audioResumePromise = null;
          });
        return this.audioResumePromise;
      } catch (error) {
        this.disableCustomAudio();
        return Promise.resolve();
      }
    }

    preloadSfxAssets() {
      if (!this.audioCtx) {
        return Promise.resolve([]);
      }
      this.sfxPreloadStarted = true;
      const ctx = this.audioCtx;
      const preloadToken = this.sfxPreloadToken;
      return Promise.allSettled(
        Object.entries(SFX_ASSETS).map(([name, url]) => this.ensureSfxBuffer(name, url, ctx, preloadToken))
      );
    }

    ensureSfxBuffer(name, url = SFX_ASSETS[name], ctx = this.audioCtx, preloadToken = this.sfxPreloadToken) {
      if (!ctx || !url) {
        return Promise.resolve(null);
      }
      if (this.sfxBuffers.has(name)) {
        return Promise.resolve(this.sfxBuffers.get(name));
      }
      const existing = this.sfxLoadPromises.get(name);
      if (existing) {
        return existing;
      }
      const loadPromise = this.fetchWithAbort(url, {}, this.sfxFetchControllers)
        .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`sfx ${response.status}`)))
        .then((data) => {
          if (this.disposed || this.audioCtx !== ctx || this.sfxPreloadToken !== preloadToken) {
            throw new Error("stale sfx preload");
          }
          return ctx.decodeAudioData(data);
        })
        .then((buffer) => {
          if (!this.disposed && this.audioCtx === ctx && this.sfxPreloadToken === preloadToken) {
            this.sfxBuffers.set(name, buffer);
            return buffer;
          }
          return null;
        })
        .catch(() => null)
        .finally(() => {
          if (this.sfxLoadPromises.get(name) === loadPromise) {
            this.sfxLoadPromises.delete(name);
          }
        });
      this.sfxLoadPromises.set(name, loadPromise);
      return loadPromise;
    }

    waitForGameplaySfxReady(timeoutMs = GAME_START_SFX_READY_TIMEOUT) {
      const ctx = this.unlockAudio();
      if (!ctx || GAMEPLAY_TIMING_SFX.every((name) => this.sfxBuffers.has(name))) {
        return Promise.resolve();
      }
      const loadPromise = Promise.allSettled(
        GAMEPLAY_TIMING_SFX.map((name) => this.ensureSfxBuffer(name))
      );
      const readyPromise = Promise.all([this.resumeAudioContext(), loadPromise]);
      const timeoutPromise = new Promise((resolve) => window.setTimeout(resolve, timeoutMs));
      return Promise.race([readyPromise, timeoutPromise]).then(() => undefined);
    }

    ensureSfxFallbackTracks() {
      if (this.sfxFallbackTracks?.size) {
        return;
      }
      if (!this.sfxFallbackTracks) {
        this.sfxFallbackTracks = new Map();
      }
      Object.entries(SFX_ASSETS).forEach(([name, url]) => {
        const track = new Audio(url);
        track.preload = "metadata";
        track.volume = 0;
        this.sfxFallbackTracks.set(name, track);
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
        track.preload = name === "menu" ? "metadata" : "none";
        track.volume = BGM_VOLUME;
        this.bgmTracks[name] = track;
      });
    }

    ensureAmbientTracks() {
      if (this.ambientTracks) {
        return;
      }
      this.ambientTracks = {};
      Object.entries(AMBIENT_ASSETS).forEach(([name, url]) => {
        const track = new Audio(url);
        track.loop = true;
        track.preload = "none";
        track.volume = name === "zombie" ? ZOMBIE_AMBIENT_VOLUME : 0.08;
        this.ambientTracks[name] = track;
      });
    }

    startBgm(name) {
      this.ensureBgmTracks();
      const next = this.bgmTracks?.[name];
      if (!next) {
        return;
      }
      if (name !== "game") {
        this.stopZombieAmbient();
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
      if (name === "game") {
        this.startZombieAmbient();
      }
    }

    startZombieAmbient() {
      this.ensureAmbientTracks();
      const track = this.ambientTracks?.zombie;
      if (!track) {
        return;
      }
      track.volume = ZOMBIE_AMBIENT_VOLUME;
      if (!track.paused) {
        return;
      }
      const playPromise = track.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {});
      }
    }

    stopZombieAmbient() {
      const track = this.ambientTracks?.zombie;
      if (!track) {
        return;
      }
      track.pause();
      try {
        track.currentTime = 0;
      } catch (error) {
        // Some browsers can reject seeking while metadata is still loading.
      }
    }

    playSampleSfx(name, intensity = 1) {
      const ctx = this.audioCtx;
      const buffer = this.sfxBuffers.get(name);
      if (!ctx || ctx.state !== "running" || !this.masterGain || !buffer) {
        return false;
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = clamp(0.72 * intensity, 0.05, 1.45);
      let cleaned = false;
      const sample = { cleanup: null };
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.activeSampleSfx.delete(sample);
        source.onended = null;
        try {
          source.disconnect();
        } catch (error) {
          // Audio nodes may already be detached after playback.
        }
        try {
          gain.disconnect();
        } catch (error) {
          // Audio nodes may already be detached after playback.
        }
      };
      sample.cleanup = cleanup;
      this.activeSampleSfx.add(sample);
      source.onended = cleanup;
      source.connect(gain).connect(this.masterGain);
      try {
        source.start(ctx.currentTime);
      } catch (error) {
        cleanup();
        return false;
      }
      return true;
    }

    playTimedSampleSfx(name, duration, intensity = 1) {
      const ctx = this.audioCtx;
      const buffer = this.sfxBuffers.get(name);
      if (!ctx || ctx.state !== "running" || !this.masterGain || !buffer || duration <= 0) {
        return false;
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      const targetGain = clamp(0.72 * intensity, 0.05, 1.45);
      gain.gain.value = targetGain;
      let cleaned = false;
      const sample = { cleanup: null };
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.activeSampleSfx.delete(sample);
        source.onended = null;
        try {
          source.disconnect();
        } catch (error) {
          // Audio nodes may already be detached after playback.
        }
        try {
          gain.disconnect();
        } catch (error) {
          // Audio nodes may already be detached after playback.
        }
      };
      sample.cleanup = cleanup;
      this.activeSampleSfx.add(sample);
      source.onended = cleanup;
      source.connect(gain).connect(this.masterGain);
      try {
        const now = ctx.currentTime;
        const playDuration = Math.min(duration, buffer.duration);
        const fadeOut = Math.min(0.035, playDuration * 0.35);
        if (fadeOut > 0.004) {
          gain.gain.setValueAtTime(targetGain, now);
          gain.gain.setValueAtTime(targetGain, now + playDuration - fadeOut);
          gain.gain.linearRampToValueAtTime(0.0001, now + playDuration);
        }
        source.start(now);
        source.stop(now + playDuration);
      } catch (error) {
        cleanup();
        return false;
      }
      return true;
    }

    playFallbackSfx(name, intensity = 1) {
      this.ensureSfxFallbackTracks();
      const template = this.sfxFallbackTracks.get(name);
      if (!template) {
        return false;
      }
      const track = template.cloneNode(true);
      track.volume = clamp(SFX_MASTER_VOLUME * 0.72 * intensity, 0.03, 1);
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.activeFallbackSfx.delete(track);
        track.removeEventListener("ended", cleanup);
        track.removeEventListener("error", cleanup);
        delete track.__schoolZombieSfxCleanup;
      };
      track.__schoolZombieSfxCleanup = cleanup;
      track.addEventListener("ended", cleanup);
      track.addEventListener("error", cleanup);
      this.activeFallbackSfx.add(track);
      const playPromise = track.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(cleanup);
      }
      return true;
    }

    playTimedFallbackSfx(name, duration, intensity = 1) {
      this.ensureSfxFallbackTracks();
      const template = this.sfxFallbackTracks.get(name);
      if (!template || duration <= 0) {
        return false;
      }
      const track = template.cloneNode(true);
      track.volume = clamp(SFX_MASTER_VOLUME * 0.72 * intensity, 0.03, 1);
      let cleaned = false;
      let stopTimer = 0;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        if (stopTimer) {
          window.clearTimeout(stopTimer);
          stopTimer = 0;
        }
        this.activeFallbackSfx.delete(track);
        track.removeEventListener("ended", cleanup);
        track.removeEventListener("error", cleanup);
        delete track.__schoolZombieSfxCleanup;
      };
      track.__schoolZombieSfxCleanup = cleanup;
      track.addEventListener("ended", cleanup);
      track.addEventListener("error", cleanup);
      this.activeFallbackSfx.add(track);
      stopTimer = window.setTimeout(() => {
        track.pause();
        cleanup();
      }, Math.max(1, duration * 1000));
      const playPromise = track.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(cleanup);
      }
      return true;
    }

    playSfx(name, intensity = 1) {
      const ctx = this.unlockAudio();
      const minGap = {
        hit: 0.045,
        crit: 0.05,
        death: 0.075,
        explosion: 0.12,
        explosion_large: 0.18,
        death_elite: 0.12,
        shield_block: 0.08,
        purchase: 0.18,
        core_full_repair: 0.2,
        shop_open: 0.2,
        upgrade_maxed: 0.2,
        core: 0.16,
        pistol: 0.065,
        rifle: 0.032,
        sniper: 0.08,
        rocket: 0.12,
        grenade_fire: 0.12,
        arrow: 0.06,
        firebomb_fire: 0.16,
        firebomb_hit: 0.18,
        shock_fire: 0.055,
        shock_hit: 0.075,
        nailgun_fire: 0.035,
        nailgun_hit: 0.06,
        skill: 0.18
      }[name] || 0.04;
      const now = ctx?.currentTime || performance.now() / 1000;
      const last = this.sfxLastPlayed[name] || 0;
      if (now - last < minGap) {
        return;
      }
      if (ctx && this.sfxBuffers.has(name) && this.playSampleSfx(name, intensity)) {
        this.sfxLastPlayed[name] = now;
        return;
      }
      if (GAMEPLAY_TIMING_SFX_SET.has(name)) {
        this.ensureSfxBuffer(name);
        return;
      }
      if (this.playFallbackSfx(name, intensity)) {
        this.sfxLastPlayed[name] = now;
      }
    }

    playSfxForDuration(name, duration, intensity = 1) {
      if (duration <= 0) {
        return;
      }
      const ctx = this.unlockAudio();
      const now = ctx?.currentTime || performance.now() / 1000;
      const minGap = {
        shock_hit: 0.075
      }[name] || 0.04;
      const last = this.sfxLastPlayed[name] || 0;
      if (now - last < minGap) {
        return;
      }
      if (ctx && this.sfxBuffers.has(name) && this.playTimedSampleSfx(name, duration, intensity)) {
        this.sfxLastPlayed[name] = now;
        return;
      }
      if (GAMEPLAY_TIMING_SFX_SET.has(name)) {
        this.ensureSfxBuffer(name);
        return;
      }
      if (this.playTimedFallbackSfx(name, duration, intensity)) {
        this.sfxLastPlayed[name] = now;
      }
    }

    playWeaponSfx(projectile) {
      const map = {
        "projectile-arrow": "arrow",
        "projectile-pistol": "pistol",
        "projectile-rifle": "rifle",
        "projectile-sniper": "sniper",
        "projectile-rocket": "rocket",
        "projectile-firebomb": "firebomb_fire",
        "projectile-shock": "shock_fire",
        "projectile-frost": "sniper",
        "projectile-nail": "nailgun_fire"
      };
      const sfx = map[projectile] || "pistol";
      this.playSfx(sfx, WEAPON_SFX_INTENSITY[sfx] || 1);
    }

    shakeCamera(duration = 70, intensity = 0.004) {
      if (this.reducedMotion) {
        return;
      }
      const camera = this.cameras?.main;
      if (camera && camera.shake) {
        camera.shake(duration, intensity);
      }
    }

    vibrateImpact(pattern = [60, 28, 80]) {
      if (this.reducedMotion) {
        return;
      }
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
      if (zombie.stunTimer > 0) {
        zombie.setTint(SHOCK_STUN_TINT);
      } else if (zombie.slowTimer > 0) {
        zombie.setTint(0x99f4ff);
      } else if (zombie.surgeState === "charge") {
        zombie.setTint(CHARGER_CHARGE_TINT);
      } else if (zombie.surgeState === "surge") {
        zombie.setTint(CHARGER_SURGE_TINT);
      } else if (zombie.baseTint) {
        zombie.setTint(zombie.baseTint);
      } else {
        zombie.clearTint();
      }
    }

    applyZombieStun(zombie, duration) {
      if (!zombie || !zombie.active || duration <= 0) {
        return;
      }
      if (zombie.surgeState === "charge" || zombie.surgeState === "surge") {
        this.resetZombieSurge(zombie, 0.9);
      }
      const previousStun = zombie.stunTimer || 0;
      const nextStun = Math.max(previousStun, duration);
      if (nextStun > previousStun + 0.03) {
        this.playSfxForDuration("shock_hit", nextStun - previousStun, 0.82);
      }
      zombie.stunTimer = nextStun;
      zombie.stunAnchorX = Number.isFinite(zombie.stunAnchorX) ? zombie.stunAnchorX : zombie.x;
      zombie.stunAnchorY = Number.isFinite(zombie.stunAnchorY) ? zombie.stunAnchorY : zombie.y;
      zombie.stunSparkTimer = Math.min(zombie.stunSparkTimer || 0, 0.03);
      zombie.setTint(SHOCK_STUN_TINT);
    }

    updateZombieStun(zombie, dt) {
      if (!zombie || !zombie.active || zombie.stunTimer <= 0) {
        return false;
      }
      zombie.stunTimer = Math.max(0, zombie.stunTimer - dt);
      if (zombie.stunTimer <= 0) {
        zombie.stunAnchorX = null;
        zombie.stunAnchorY = null;
        zombie.stunSparkTimer = 0;
        zombie.setAngle(0);
        this.restoreZombieTint(zombie);
        return false;
      }

      zombie.stunAnchorX = Number.isFinite(zombie.stunAnchorX) ? zombie.stunAnchorX : zombie.x;
      zombie.stunAnchorY = Number.isFinite(zombie.stunAnchorY) ? zombie.stunAnchorY : zombie.y;
      zombie.attackTimer = Math.max(zombie.attackTimer || 0, 0.18);
      zombie.setTint(SHOCK_STUN_TINT);
      zombie.setAngle(Math.sin((this.elapsed || 0) * 46 + zombie.wobble) * 2.4);

      zombie.stunSparkTimer = (zombie.stunSparkTimer || 0) - dt;
      if (zombie.stunSparkTimer <= 0) {
        zombie.stunSparkTimer = rand(0.08, 0.16);
        this.createZombieStunSpark(zombie);
      }
      return true;
    }

    createZombieStunSpark(zombie) {
      if (!zombie || !zombie.active) {
        return;
      }
      const width = zombie.displayW || 80;
      const height = zombie.displayH || 170;
      const startX = zombie.x + rand(-width * 0.24, width * 0.24);
      const startY = zombie.y - height * rand(0.18, 0.52);
      const spark = this.trackTransient(this.add.graphics()
        .setDepth(234 + zombie.y / 5)
        .setBlendMode(Phaser.BlendModes.ADD));
      spark.lineStyle(rand(1.5, 2.8), 0xffffff, 0.96);
      spark.beginPath();
      spark.moveTo(startX, startY);
      let x = startX;
      let y = startY;
      for (let i = 0; i < 3; i += 1) {
        x += rand(-10, 10);
        y += rand(-7, 7);
        spark.lineTo(x, y);
      }
      spark.strokePath();
      spark.lineStyle(5, SHOCK_EFFECT_OUTER_COLOR, 0.32);
      spark.beginPath();
      spark.moveTo(startX, startY);
      spark.lineTo(x, y);
      spark.strokePath();
      this.tweens.add({
        targets: spark,
        alpha: 0,
        duration: 130,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(spark, false)
      });
    }

    applyZombieKnockback(zombie, hitType, crit = false) {
      if (!zombie || !zombie.active) {
        return;
      }
      if (zombie.surgeState === "charge" || zombie.surgeState === "surge") {
        this.resetZombieSurge(zombie, 0.9);
      }
      const base = hitType === "explosion" || hitType === "projectile-rocket"
        ? 36
        : hitType === "projectile-arrow"
          ? 64
        : hitType === "projectile-sniper"
          ? 50
        : hitType === "projectile-pistol" || hitType === "projectile-rifle"
          ? crit ? 18 : 10
          : crit
            ? 9
            : 5;
      const amount = base * (zombie.knockbackScale || 1);
      const targetY = Math.max(-48, zombie.y - amount);
      const targetX = this.clampZombieLaneX(zombie.x + rand(-amount * 0.34, amount * 0.34));
      const duration = clamp(95 + amount * 1.8, 110, 210);
      const knockback = {
        amount,
        dx: targetX - zombie.x,
        dy: targetY - zombie.y,
        duration
      };
      zombie.lastKnockback = knockback;
      if (zombie.knockbackTween && typeof zombie.knockbackTween.stop === "function") {
        zombie.knockbackTween.stop();
      }
      zombie.knockbackTweening = true;
      zombie.knockbackTween = this.tweens.add({
        targets: zombie,
        x: targetX,
        y: targetY,
        duration,
        ease: "Cubic.easeOut",
        onUpdate: () => this.updateFollowingHitEffectsForZombie(zombie),
        onComplete: () => {
          zombie.knockbackTweening = false;
          zombie.knockbackTween = null;
          this.updateFollowingHitEffectsForZombie(zombie);
        }
      });
      return knockback;
    }

    addSurfaceImage(x, y, width, height, kind = "panel") {
      return this.add.image(x, y, window.SchoolZombieUI.texture(this, kind, width, height))
        .setDisplaySize(width, height);
    }

    addCommandPanel(x, y, width, height, depth = 500, accent = COLORS.blue, options = {}) {
      const shadow = this.add.rectangle(x, y + 5, width - 4, height - 3, 0x000000, options.shadowAlpha ?? 0.38).setDepth(depth);
      const panel = this.addSurfaceImage(x, y, width, height).setAlpha(options.surfaceAlpha ?? Math.max(0.84, options.alpha ?? 0.96)).setDepth(depth + 0.1);
      const wash = this.add.rectangle(x, y, width - 8, height - 8, UI_COLORS.chalk, options.fill ? 0.045 : 0).setDepth(depth + 0.15);
      const objects = [shadow, panel, wash];
      if (options.track !== false) this.overlayObjects.push(...objects);
      return { shadow, panel, wash, objects };
    }

    addHudChip(x, y, width, label, value, accent, depth = 322) {
      const panel = this.addCommandPanel(x, y, width, 34, depth, accent, {
        alpha: 0.82,
        shadowAlpha: 0.3,
        track: false
      });
      const labelText = this.add.text(x - width / 2 + 15, y, label, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 12,
        fontStyle: "800",
        color: "#b4b2a0"
      }).setOrigin(0, 0.5).setDepth(depth + 0.3);
      const valueText = this.add.text(x + width / 2 - 10, y, value, {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(1, 0.5).setDepth(depth + 0.3);
      return { ...panel, label: labelText, value: valueText, objects: [...panel.objects, labelText, valueText] };
    }

    addOverlayHeader({ y = 120, title, kicker = "DEFENSE COMMAND", subtitle = "", accent = COLORS.gold, depth = 502 }) {
      const panel = this.addCommandPanel(270, y, 440, 116, depth, accent, {
        alpha: 0.88,
      });
      const signal = this.add.rectangle(270, y - 53, 42, 2, fieldAccent(accent), 0.74).setDepth(depth + 0.22);
      const kickerText = this.add.text(270, y - 34, kicker, {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fontStyle: "800",
        color: accent === COLORS.gold ? "#d5b675" : "#c5b995"
      }).setOrigin(0.5).setDepth(depth + 0.3);
      const titleText = this.add.text(270, y - 4, title, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 32,
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(0.5).setDepth(depth + 0.3);
      const subtitleText = this.add.text(270, y + 35, subtitle, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 14,
        fontStyle: "800",
        color: "#c6c4b5",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(0.5).setDepth(depth + 0.3);
      this.overlayObjects.push(signal, kickerText, titleText, subtitleText);
      return { ...panel, signal, kicker: kickerText, title: titleText, subtitle: subtitleText, objects: [...panel.objects, signal, kickerText, titleText, subtitleText] };
    }

    animateOverlayEntrance(objects, delay = 0, offsetY = 16, duration = 360) {
      if (this.reducedMotion) {
        return;
      }
      (objects || []).filter(Boolean).forEach((item, index) => {
        if (!item || !item.active) {
          return;
        }
        // Interactive hit zones stay put and rendered: Phaser skips alpha-0 objects in
        // hit tests, so animating them made fast taps right after a screen appeared
        // (e.g. the ARCHERLAB button) hit nothing. Their fill is transparent anyway.
        if (item.input) {
          return;
        }
        const targetY = item.y;
        const targetAlpha = item.alpha;
        item.setY(targetY + offsetY).setAlpha(0);
        this.tweens.add({
          targets: item,
          y: targetY,
          alpha: targetAlpha,
          duration,
          delay: delay + index * 16,
          ease: "Cubic.easeOut"
        });
      });
    }

    addOverlayButton(x, y, width, height, label, depth, onClick, accent = COLORS.gold) {
      return this.addTacticalMenuButton(x, y, width, height, label, depth, onClick, accent, {
        fontSize: height < 50 ? 17 : 22
      });
    }

    addTacticalMenuButton(x, y, width, height, label, depth, onClick, accent = COLORS.blue, options = {}) {
      const visualHeight = Math.max(34, Number(options.visualHeight) || height);
      const hitHeight = Math.max(height, Number(options.hitHeight) || height);
      const primary = options.primary === true;
      const lightText = !primary || options.lightText === true;
      const compact = options.compact === true;
      const disabled = options.disabled === true;
      const shadow = this.add.rectangle(x, y + 4, width - 6, visualHeight - 4, 0x000000, options.shadowAlpha ?? 0.45).setDepth(depth);
      const frame = this.addSurfaceImage(x, y, width, visualHeight, primary ? "primary" : "button")
        .setAlpha(options.surfaceAlpha ?? 1).setDepth(depth + 0.1);
      const wash = this.add.rectangle(x, y, width - 12, visualHeight - 12, 0xffeed0, 0).setDepth(depth + 0.2);
      const kicker = options.kicker ? this.add.text(x, y - visualHeight * 0.22, String(options.kicker), {
        resolution: 2, fontFamily: "Arial, sans-serif", fontSize: compact ? 9 : 10,
        fontStyle: "700", color: lightText ? "#bdb8a6" : "#30291d",
        stroke: "#131712", strokeThickness: options.lightText ? 2 : 0
      }).setOrigin(0.5).setDepth(depth + 0.24) : null;
      const text = this.add.text(x, y + (kicker ? visualHeight * 0.13 : 0), label, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: Number(options.fontSize) || (compact ? 16 : primary ? 30 : 21),
        fontStyle: "800", color: lightText ? accent === COLORS.red ? "#e0aa91" : "#f0e8d5" : "#1d211b",
        stroke: lightText ? "#131712" : "#1d211b", strokeThickness: options.lightText ? 2 : lightText ? 1 : 0
      }).setOrigin(0.5).setDepth(depth + 0.3);
      const hit = this.add.rectangle(x, y, width, hitHeight, 0xffffff, 0)
        .setDepth(depth + 0.5).setInteractive({ useHandCursor: !disabled });
      const setHover = (hovered) => {
        if (disabled) return;
        wash.setAlpha(hovered ? 0.075 : 0);
        frame.setTint(hovered ? 0xffffff : 0xeeeae0);
      };
      frame.setTint(disabled ? 0x777a71 : 0xeeeae0);
      if (disabled) { text.setAlpha(0.55); kicker?.setAlpha(0.55); hit.disableInteractive(); }
      hit.on("pointerover", () => setHover(true));
      hit.on("pointerout", () => setHover(false));
      const createdAt = performance.now();
      let pressFired = false;
      const activate = () => {
        // Audio is best-effort: a throw here must never swallow the button action.
        try { this.unlockAudio(); } catch (error) { /* ignore */ }
        try { this.playSfx("button", primary ? 0.94 : 0.76); } catch (error) { /* ignore */ }
        onClick();
      };
      hit.on("pointerdown", () => {
        if (disabled) return;
        pressFired = true;
        activate();
      });
      if (options.activateOnRelease === true && !disabled) {
        // A press can land before Phaser's first frame after the menu is built; the
        // release still finds the button. Skip presses that started before this
        // button existed (e.g. the tap that opened this screen) and dedupe against
        // the normal pointerdown path.
        hit.on("pointerup", () => {
          const fired = pressFired;
          pressFired = false;
          if (fired || lastDomPointerDownAt < createdAt) return;
          activate();
        });
      }
      // Phaser only registers new interactive objects at the next scene pre-update,
      // so presses in the first frame after a screen is built hit nothing. Register now.
      try {
        const inputPlugin = this.input;
        if (!disabled && inputPlugin?._pendingInsertion?.length && typeof inputPlugin.preUpdate === "function") {
          inputPlugin.preUpdate();
        }
      } catch (error) { /* the next frame registers it anyway */ }
      this.overlayObjects.push(shadow, frame, wash, text, hit);
      if (kicker) this.overlayObjects.push(kicker);
      return { shadow, frame, wash, ...(kicker ? { kicker } : {}), text, hit };
    }

    showToast(message, color = COLORS.gold) {
      announceGameStatus(message);
      if (this.mode === "shop" && this.shopUI) {
        this.shopUI.notify(message);
        return;
      }
        const text = this.trackTransient(this.add.text(270, 158, message, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 20,
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#050607",
          strokeThickness: 1,
          align: "center",
          wordWrap: { width: 402, useAdvancedWrap: true }
        }).setOrigin(0.5).setDepth(431));
        const panel = this.trackTransient(this.addSurfaceImage(270, 158,
          Math.min(450, Math.max(330, text.width + 32)), Math.max(48, text.height + 20))
          .setDepth(430));

      this.tweens.add({
        targets: [panel, text],
          y: this.reducedMotion ? 158 : "-=18",
        alpha: 0,
          delay: text.height > 30 ? 2600 : 720,
          duration: this.reducedMotion ? 0 : 420,
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.destroyTransientObject(panel, false);
          this.destroyTransientObject(text, false);
        }
      });
    }

    showShopActionLoading(message = SchoolI18n.t("shop.processing")) {
      if (this.disposed || this.mode !== "shop") return;
      this.shopActionInFlight = true;
      this.shopUI?.setBusy(message);
    }

    clearShopActionLoading() {
      this.shopActionInFlight = false;
      this.shopUI?.setBusy("");
    }

    getStoredRankName() {
      try {
        return String(window.localStorage.getItem(RANK_NAME_KEY) || "").trim().slice(0, 20);
      } catch (error) {
        return "";
      }
    }

    saveStoredRankName(name) {
      try {
        window.localStorage.setItem(RANK_NAME_KEY, name);
      } catch (error) {
        // Storage can be unavailable in private or embedded browser modes.
      }
    }

    getRankSnapshot(earnedCoins = this.coins) {
      const clearedStage = Math.max(0, Math.floor(Number(this.highestClearedStage) || 0));
      return {
        score: clearedStage,
        reachedStage: Math.max(1, Math.floor(Number(this.stage) || 1)),
        level: Math.max(1, Math.floor(Number(this.level) || 1)),
        kills: Math.max(0, Math.floor(Number(this.kills) || 0)),
        coins: Math.max(0, Math.floor(Number(earnedCoins) || 0)),
        survivedSeconds: Math.max(0, Math.floor(Number(this.elapsed) || 0))
      };
    }

    resetRankSessionState() {
      this.abortFetchControllers(this.rankFetchControllers);
      this.rankSyncToken = (this.rankSyncToken || 0) + 1;
      this.rankSessionId = null;
      this.rankSessionPromise = null;
      this.rankStageSyncQueue = Promise.resolve(true);
      this.rankPendingStageEvents = new Map();
      this.rankVerifiedStage = 0;
      this.rankSyncFailed = false;
      this.rankLastSyncError = "";
    }

    async createRankSession(syncToken = this.rankSyncToken) {
      const auth = this.profileAuth || loadProfileAuth();
      if (!auth?.profile_id || !auth?.profile_secret) {
        throw new Error("profile credentials unavailable");
      }
      const response = await this.fetchWithAbort(`${RANK_API_BASE}/score-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          game_id: RANK_GAME_ID,
          profile_id: auth.profile_id,
          profile_secret: auth.profile_secret
        })
      }, this.rankFetchControllers);
      if (!response.ok) {
        throw new Error(`rank session ${response.status}`);
      }
      const data = await response.json();
      if (!data || !data.session_id) {
        throw new Error("invalid rank session response");
      }
      if (this.disposed || syncToken !== this.rankSyncToken) {
        return null;
      }
      this.rankSessionId = data.session_id;
      this.rankSyncFailed = false;
      this.rankLastSyncError = "";
      return this.rankSessionId;
    }

    startRankSession() {
      this.resetRankSessionState();
      const syncToken = this.rankSyncToken;
      this.rankSessionPromise = this.createRankSession(syncToken).catch((error) => {
        if (!this.disposed && syncToken === this.rankSyncToken) {
          this.rankSyncFailed = true;
          this.rankLastSyncError = error.message;
          window.ArcherLabClientErrorReporter?.reportCodeException?.(error, { phase: 'rank-session' }, 'ranking_client_exception');
          console.warn("[SchoolZombie] rank session failed:", error.message);
        }
        return null;
      });
    }

    ensureRankSession() {
      if (this.rankSessionId) {
        return Promise.resolve(this.rankSessionId);
      }
      if (!this.rankSessionPromise) {
        const syncToken = this.rankSyncToken;
        this.rankSessionPromise = this.createRankSession(syncToken).catch((error) => {
          if (!this.disposed && syncToken === this.rankSyncToken) {
            this.rankSyncFailed = true;
          }
          throw error;
        });
      }
      return this.rankSessionPromise;
    }

    createRankStageEvent(clearedStage, snapshot = this.getRankSnapshot()) {
      const stage = Math.max(1, Math.floor(Number(clearedStage) || 0));
      return {
        type: "stage_clear",
        cleared_stage: stage,
        reached_stage: stage + 1,
        level: Math.max(stage * 4 + 1, Math.floor(Number(snapshot.level) || 1)),
        kills: Math.max(0, Math.floor(Number(snapshot.kills) || 0)),
        survived_seconds: Math.max(0, Math.floor(Number(snapshot.survivedSeconds) || 0))
      };
    }

    async sendRankStageEvent(event, syncToken = this.rankSyncToken) {
      const sessionId = await this.ensureRankSession();
      if (this.disposed || syncToken !== this.rankSyncToken) {
        return null;
      }
      if (!sessionId) {
        throw new Error("rank session unavailable");
      }
      const response = await this.fetchWithAbort(`${RANK_API_BASE}/score-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          game_id: RANK_GAME_ID,
          session_id: sessionId,
          profile_id: this.profileAuth?.profile_id,
          profile_secret: this.profileAuth?.profile_secret,
          event
        })
      }, this.rankFetchControllers);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `rank event ${response.status}`);
      }
      if (!data || data.success !== true) {
        throw new Error("invalid rank event response");
      }
      return data;
    }

    async syncRankStageWithRetry(clearedStage, event, syncToken = this.rankSyncToken, maxAttempts = 2) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (this.disposed || syncToken !== this.rankSyncToken) {
          return false;
        }
        try {
          const data = await this.sendRankStageEvent(event, syncToken);
          if (!data) {
            return false;
          }
          if (this.disposed || syncToken !== this.rankSyncToken) {
            return false;
          }
          const verifiedStage = Math.max(clearedStage, Math.floor(Number(data.score) || 0));
          this.rankVerifiedStage = Math.max(this.rankVerifiedStage || 0, verifiedStage);
          this.rankPendingStageEvents.forEach((pendingEvent, stage) => {
            if (stage <= this.rankVerifiedStage) {
              this.rankPendingStageEvents.delete(stage);
            }
          });
          this.rankSyncFailed = false;
          this.rankLastSyncError = "";
          return true;
        } catch (error) {
          lastError = error;
          window.ArcherLabClientErrorReporter?.reportCodeException?.(error, { phase: 'rank-stage' }, 'ranking_client_exception');
          console.warn(`[SchoolZombie] rank stage ${clearedStage} sync attempt ${attempt} failed:`, error.message);
          if (attempt < maxAttempts) {
            await new Promise((resolve) => window.setTimeout(resolve, 450 * attempt));
          }
        }
      }
      if (!this.disposed && syncToken === this.rankSyncToken) {
        this.rankSyncFailed = true;
        this.rankLastSyncError = lastError?.message || "rank stage sync failed";
      }
      return false;
    }

    recordRankStageClear(clearedStage) {
      if (!Number.isFinite(clearedStage) || clearedStage <= 0) {
        return;
      }
      const stage = Math.floor(clearedStage);
      const event = this.createRankStageEvent(stage);
      window.ArcherRanking?.track(RANK_GAME_ID, event, this.rankSessionId, {
        profile_id: this.profileAuth?.profile_id, profile_secret: this.profileAuth?.profile_secret
      });
      const syncToken = this.rankSyncToken;
      this.rankPendingStageEvents.set(stage, event);
      this.rankStageSyncQueue = this.rankStageSyncQueue
        .catch(() => false)
        .then(() => this.syncRankStageWithRetry(stage, event, syncToken, 2));
    }

    async ensureRankStagesRecorded() {
      if (!this.rankSessionPromise) {
        return false;
      }
      const syncToken = this.rankSyncToken;
      await this.rankStageSyncQueue.catch(() => false);
      const sessionId = await this.ensureRankSession().catch((error) => {
        this.rankLastSyncError = error.message;
        return null;
      });
      if (!sessionId || this.disposed || syncToken !== this.rankSyncToken) {
        return false;
      }

      const highestStage = Math.max(0, Math.floor(Number(this.highestClearedStage) || 0));
      for (let stage = Math.max(1, (this.rankVerifiedStage || 0) + 1); stage <= highestStage; stage += 1) {
        const event = this.rankPendingStageEvents.get(stage) || this.createRankStageEvent(stage);
        this.rankPendingStageEvents.set(stage, event);
        const synced = await this.syncRankStageWithRetry(stage, event, syncToken, 3);
        if (!synced) {
          return false;
        }
      }
      this.rankSyncFailed = false;
      this.rankLastSyncError = "";
      return true;
    }

    createRankRunProgressEvent() {
      return {
        type: "run_progress",
        run_coins: Math.max(0, Math.floor(Number(this.coins) || 0)),
        reward_counts: { ...this.rewardCounts },
        reroll_levels: [...this.runRerollLevels],
        kills: Math.max(0, Math.floor(Number(this.kills) || 0)),
        reached_stage: Math.max(1, Math.floor(Number(this.stage) || 1)),
        level: Math.max(1, Math.floor(Number(this.level) || 1)),
        survived_seconds: Math.max(0, Math.floor(Number(this.elapsed) || 0))
      };
    }

    checkpointRunRewards() {
      if (this.rewardCheckpointQueued || !window.ArcherRanking?.checkpointRun) return;
      this.rewardCheckpointQueued = true;
      const syncToken = this.rankSyncToken;
      // One write per JavaScript turn, including a whole explosion kill burst.
      Promise.resolve().then(() => {
        this.rewardCheckpointQueued = false;
        if (this.disposed || syncToken !== this.rankSyncToken || !["playing", "paused", "skill"].includes(this.mode)) return;
        const sessionId = this.rankSessionId || window.ArcherRanking.sessionId(RANK_GAME_ID);
        if (sessionId && this.profileAuth) void window.ArcherRanking.checkpointRun({
          ...this.profileAuth, game_id:RANK_GAME_ID, session_id:sessionId, event:this.createRankRunProgressEvent()
        });
      });
    }

    async recordRankRunProgress() {
      const sessionId = this.rankSessionId || window.ArcherRanking?.sessionId(RANK_GAME_ID) || await this.ensureRankSession();
      if (!sessionId || this.disposed) {
        return false;
      }
      const response = await this.fetchWithAbort(`${RANK_API_BASE}/score-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          game_id: RANK_GAME_ID,
          session_id: sessionId,
          profile_id: this.profileAuth?.profile_id,
          profile_secret: this.profileAuth?.profile_secret,
          event: this.createRankRunProgressEvent()
        })
      }, this.rankFetchControllers);
      if (!response.ok) {
        throw new Error(`rank run progress ${response.status}`);
      }
      const data = await response.json().catch(() => null);
      return !!(data && data.success === true);
    }

    async fetchRankRows() {
      const url = `${RANK_API_BASE}/rankings?game_id=${encodeURIComponent(RANK_GAME_ID)}&limit=${RANK_LIMIT}`;
      const response = await this.fetchWithAbort(url, { method: "GET" }, this.rankListFetchControllers);
      if (!response.ok) {
        throw new Error(`rankings ${response.status}`);
      }
      const data = await response.json();
      if (!Array.isArray(data.rankings)) {
        throw new Error("invalid rankings response");
      }
      return data.rankings;
    }

    showRankings() {
      this.abortFetchControllers(this.rankListFetchControllers);
      const requestId = (this.rankRequestId || 0) + 1;
      this.rankRequestId = requestId;
      this.renderRankingsScreen([], SchoolI18n.t("rank.loading"));
      this.fetchRankRows()
        .then((rows) => {
          if (this.rankRequestId === requestId && this.mode === "ranking") {
            this.renderRankingsScreen(rows);
          }
        })
        .catch((error) => {
          if (error?.name === "AbortError") {
            return;
          }
          if (this.rankRequestId === requestId && this.mode === "ranking") {
            this.renderRankingsScreen([], SchoolI18n.t("rank.loadFailed"), true);
          }
        });
    }

    renderRankingsScreen(rows = [], status = "", failed = false) {
      this.clearOverlay();
      this.mode = "ranking";
      announceGameStatus(status || SchoolI18n.t("rank.a11y", { detail: rows.length ? SchoolI18n.t("rank.a11yCount", { count: Math.min(rows.length, 11) }) : SchoolI18n.t("rank.a11yEmpty") }));
      this.startBgm("menu");
      const items = this.overlayObjects;
      const titleArt = this.add.image(270, 480, "title-keyart").setDepth(500);
      const source = titleArt.texture.getSourceImage();
      const ratio = source.width / source.height;
      titleArt.setDisplaySize(Math.max(GAME_WIDTH, GAME_HEIGHT * ratio), Math.max(GAME_HEIGHT, GAME_WIDTH / ratio));
      items.push(titleArt);
      const titleScaleX = titleArt.scaleX;
      const titleScaleY = titleArt.scaleY;
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: titleArt,
          y: 474,
          scaleX: titleScaleX * 1.018,
          scaleY: titleScaleY * 1.018,
          duration: 7200,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }
      items.push(this.add.rectangle(270, 480, 540, 960, 0x020304, 0.78).setDepth(501));
      const header = this.addOverlayHeader({
        y: 112,
        title: SchoolI18n.t("rank.title"),
        kicker: "DEFENDER RECORDS",
        subtitle: SchoolI18n.t("rank.subtitle"),
        accent: COLORS.gold,
        depth: 502
      });
      const board = this.addCommandPanel(270, 500, 464, 620, 502, COLORS.blue, {
        alpha: 0.91,
      });
      const boardTop = this.add.rectangle(270, 214, 416, 38, 0xb1a17b, 0.09)
        .setDepth(504);
      const headers = [
        this.add.text(74, 214, "RANK", { resolution: 2, fontFamily: "Arial, sans-serif", fontSize: 11, fontStyle: "800", color: "#c5b995" }).setOrigin(0, 0.5).setDepth(505),
        this.add.text(146, 214, "DEFENDER", { resolution: 2, fontFamily: "Arial, sans-serif", fontSize: 11, fontStyle: "800", color: "#c5b995" }).setOrigin(0, 0.5).setDepth(505),
        this.add.text(410, 214, "CLEAR", { resolution: 2, fontFamily: "Arial, sans-serif", fontSize: 11, fontStyle: "800", color: "#c5b995" }).setOrigin(1, 0.5).setDepth(505)
      ];
      items.push(boardTop, ...headers);
      this.addLanguageSwitch(470, 48, 560);

      const visibleRows = rows.slice(0, 11);
      if (!visibleRows.length) {
        const emptySignal = this.add.text(270, 434, status ? "···" : "—", {
          resolution: 2, fontFamily: "Arial, sans-serif",
          fontSize: 34,
          fontStyle: "800",
          color: status ? "#c5b995" : "#d5b675"
        }).setOrigin(0.5).setDepth(505);
        const emptyTitle = this.add.text(270, 482, status || SchoolI18n.t("rank.empty"), {
          resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
          fontSize: 19,
          fontStyle: "800",
          color: "#d0cbbd",
          stroke: "#050607",
          strokeThickness: 1,
          align: "center"
        }).setOrigin(0.5).setDepth(505);
        const emptySub = this.add.text(270, 520, status ? SchoolI18n.t("rank.network") : SchoolI18n.t("rank.emptyHint"), {
          resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
          fontSize: 12,
          fontStyle: "800",
          color: "#aaa998",
          align: "center"
        }).setOrigin(0.5).setDepth(505);
        items.push(emptySignal, emptyTitle, emptySub);
        if (failed) {
          this.addTacticalMenuButton(270, 596, 228, 58, SchoolI18n.t("rank.retry"), 506, () => this.showRankings(), COLORS.blue, {
            hitHeight: 76,
            fontSize: 17
          });
        }
      } else {
        const storedName = this.getStoredRankName().toLocaleUpperCase();
        const medalColors = [0xd5b675, 0xcbd6dc, 0xd89868];
        visibleRows.forEach((row, index) => {
          const y = 262 + index * 48;
          const rank = Math.max(1, Math.floor(Number(row.rank) || index + 1));
          const score = Math.max(0, Math.floor(Number(row.score) || 0));
          const name = String(row.player_name || "DEFENDER").trim().slice(0, 14) || "DEFENDER";
          const extra = row.extra_data && typeof row.extra_data === "object" ? row.extra_data : {};
          const kills = Math.max(0, Math.floor(Number(extra.kills) || 0));
          const isPlayer = Boolean(storedName && name.toLocaleUpperCase() === storedName);
          const rowAccent = rank <= 3 ? medalColors[rank - 1] : isPlayer ? COLORS.blue : 0x626659;
          const rowPanel = this.add.rectangle(270, y, 414, 40, isPlayer ? UI_COLORS.amber : 0xffffff, isPlayer ? 0.12 : index % 2 ? 0.015 : 0.04).setDepth(503);
          const rowRule = this.add.rectangle(270, y + 23, 404, 1, UI_COLORS.steel, 0.16).setDepth(504);
          items.push(rowPanel, rowRule);
          const rankBadge = this.add.rectangle(95, y, 28, 28, rank <= 3 ? rowAccent : 0x292b22, rank <= 3 ? 0.85 : 0)
            .setDepth(505);
          const rankText = this.add.text(95, y, `${rank}`, {
            resolution: 2, fontFamily: "Arial, sans-serif",
            fontSize: 14,
            fontStyle: "800",
            color: rank <= 3 ? "#101418" : "#eee6d2",
            stroke: "#050607",
            strokeThickness: rank <= 3 ? 0 : 2
          }).setOrigin(0.5).setDepth(506);
          const nameText = this.add.text(132, y - 5, name.length > 12 ? `${name.slice(0, 12)}…` : name, {
            resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
            fontSize: 15,
            fontStyle: "800",
            color: isPlayer ? "#c5b995" : "#eee6d2",
            stroke: "#050607",
            strokeThickness: 1
          }).setOrigin(0, 0.5).setDepth(505);
          const detailText = this.add.text(132, y + 11, `${isPlayer ? "YOU · " : ""}KILLS ${kills}`, {
            resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
            fontSize: 9,
            fontStyle: "800",
            color: "#b4b2a0",
          }).setOrigin(0, 0.5).setDepth(505);
          const scoreText = this.add.text(444, y, `ST.${String(score).padStart(2, "0")}`, {
            resolution: 2, fontFamily: "Arial, sans-serif",
            fontSize: 17,
            fontStyle: "800",
            color: rank <= 3 ? `#${rowAccent.toString(16).padStart(6, "0")}` : "#d5b675",
            stroke: "#050607",
            strokeThickness: 1
          }).setOrigin(1, 0.5).setDepth(505);
          items.push(rankBadge, rankText, nameText, detailText, scoreText);
        });
      }

      const canRegister = this.lastRankableRun && this.lastRankableRun.score > 0;
      const back = this.addTacticalMenuButton(canRegister ? 154 : 270, 884, canRegister ? 196 : 328, 64, SchoolI18n.t("rank.menu"), 560, () => this.showMenu(), COLORS.gold, {
        kicker: "BACK · ESC / B",
        hitHeight: 76,
        fontSize: 19
      });
      if (canRegister) {
        this.addTacticalMenuButton(386, 884, 196, 64, SchoolI18n.t("rank.submit"), 560, () => this.submitRankScore(), COLORS.blue, {
          kicker: "SUBMIT RUN",
          hitHeight: 76,
          fontSize: 19
        });
      }
      this.animateOverlayEntrance([...header.objects, ...board.objects, boardTop, ...headers, ...Object.values(back)], 40, 16, 340);
    }

    showRankPrepLayer(message = SchoolI18n.t("rank.prep")) {
      this.removeRankPrepLayer();
      const shell = document.getElementById("game-shell") || document.body;
      const layer = document.createElement("div");
      layer.className = "school-zombie-rank-prep";
      layer.setAttribute("role", "status");
      layer.setAttribute("aria-live", "polite");
      layer.innerHTML = `
        <div class="school-zombie-rank-prep__panel">
          <div class="school-zombie-rank-prep__signal" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="school-zombie-rank-prep__label">${message}</div>
          <div class="school-zombie-rank-prep__bar" aria-hidden="true"><span></span></div>
        </div>
      `;
      shell.appendChild(layer);
      this.rankPrepLayer = layer;
      return layer;
    }

    removeRankPrepLayer(layer = this.rankPrepLayer) {
      if (layer && layer.parentNode) {
        layer.parentNode.removeChild(layer);
      }
      if (!layer || this.rankPrepLayer === layer) {
        this.rankPrepLayer = null;
      }
    }

    removeRankNameLayer() {
      if (this.rankNameFocusRaf) {
        cancelAnimationFrame(this.rankNameFocusRaf);
        this.rankNameFocusRaf = 0;
      }
      if (typeof this.rankNameLayerCleanup === "function") {
        this.rankNameLayerCleanup();
      }
      this.rankNameLayerCleanup = null;
      if (this.rankNameLayer && this.rankNameLayer.parentNode) {
        this.rankNameLayer.parentNode.removeChild(this.rankNameLayer);
      }
      this.rankNameLayer = null;
      this.rankSubmitInFlight = false;
      if (typeof window.__schoolZombieViewportRefresh === "function") {
        window.__schoolZombieViewportRefresh();
      }
    }

    showRewardRetryOverlay() {
      this.mode = "gameover";
      this.clearOverlay();
      this.addGameOverBackdrop();
      const notice = this.add.text(270, 420, SchoolI18n.t("toast.rewardFail"), {
        fontFamily: "Pretendard Variable, Arial, sans-serif", fontSize: 24,
        color: "#eee6d2", align: "center", wordWrap: { width: 420, useAdvancedWrap: true }
      }).setOrigin(0.5).setDepth(544);
      this.overlayObjects.push(notice);
      this.addOverlayButton(270, 510, 280, 80, SchoolI18n.t("over.menu"), 545,
        () => this.returnToGameStart(), COLORS.gold);
    }

    async returnToGameStart() {
      if (this.coins > 0 && !this.runCoinsBanked && !this.runCoinsQueued) {
        await this.bankRunCoins();
        if (!this.runCoinsBanked && !this.runCoinsQueued) { this.showRewardRetryOverlay(); return; }
      }
      this.removeRankNameLayer();
      this.lastRankableRun = null;
      this.showMenu();
    }

    showRankNameLayer(snapshot = this.lastRankableRun, options = {}) {
      const run = snapshot || this.getRankSnapshot();
      if (!run || run.score <= 0) {
        this.showToast(SchoolI18n.t("toast.noStage"), COLORS.red);
        return;
      }
      this.removeRankNameLayer();

      const inlineGameOver = Boolean(options.inlineGameOver);
      const autoFocus = options.autoFocus === true;
      const shell = document.getElementById("game-shell") || document.body;
      const layer = document.createElement("div");
      layer.className = `school-zombie-rank-layer${inlineGameOver ? " school-zombie-rank-layer--gameover" : ""}`;
      layer.innerHTML = `
        <form class="school-zombie-rank-dialog${inlineGameOver ? " school-zombie-rank-dialog--gameover" : ""}" autocomplete="off" role="dialog" aria-modal="true" aria-labelledby="school-zombie-rank-dialog-title">
          ${inlineGameOver ? "" : `
            <div class="school-zombie-rank-kicker">RANKING</div>
            <div class="school-zombie-rank-title" id="school-zombie-rank-dialog-title">${SchoolI18n.t("rank.dialogTitle")}</div>
            <div class="school-zombie-rank-score">${SchoolI18n.t("rank.score", { score: run.score, kills: run.kills })}</div>
          `}
          ${inlineGameOver ? `<div class="sr-only" id="school-zombie-rank-dialog-title">${SchoolI18n.t("rank.gameOverTitle")}</div>` : ""}
          <label class="sr-only" for="school-zombie-rank-input">${SchoolI18n.t("rank.nameLabel")}</label>
          <input class="school-zombie-rank-input" id="school-zombie-rank-input" name="playerName" maxlength="20" inputmode="text" aria-describedby="school-zombie-rank-help" placeholder="${SchoolI18n.t('rank.namePlaceholder')}" />
          <div class="sr-only" id="school-zombie-rank-help">${SchoolI18n.t("rank.nameHelp")}</div>
          <div class="school-zombie-rank-loader" role="status" aria-live="polite" aria-hidden="true">
            <div class="school-zombie-rank-loader__signal" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div class="school-zombie-rank-loader__label">${SchoolI18n.t("rank.sending")}</div>
            <div class="school-zombie-rank-loader__bar" aria-hidden="true"><span></span></div>
          </div>
          <div class="school-zombie-rank-actions">
            <button class="school-zombie-rank-submit" type="submit">${SchoolI18n.t("rank.register")}</button>
            <button class="school-zombie-rank-skip" type="button">${SchoolI18n.t("rank.later")}</button>
          </div>
        </form>
      `;
      const form = layer.querySelector("form");
      const input = layer.querySelector("input");
      const submitButton = layer.querySelector(".school-zombie-rank-submit");
      const skipButton = layer.querySelector(".school-zombie-rank-skip");
      input.value = this.getStoredRankName() || (inlineGameOver ? "" : "DEFENDER");

      const stopGameInput = (event) => {
        event.stopPropagation();
      };
      layer.addEventListener("pointerdown", stopGameInput);
      layer.addEventListener("touchstart", stopGameInput, { passive: true });
      layer.addEventListener("mousedown", stopGameInput);

      const updateSubmitState = () => {
        submitButton.disabled = this.rankSubmitInFlight || input.value.trim().length <= 0;
      };
      input.addEventListener("input", updateSubmitState);
      updateSubmitState();

      const submit = () => {
        if (this.rankSubmitInFlight || input.value.trim().length <= 0) {
          updateSubmitState();
          return;
        }
        const name = input.value;
        submitButton.disabled = true;
        skipButton.disabled = true;
        input.disabled = true;
        form.classList.add("is-submitting");
        const loader = layer.querySelector(".school-zombie-rank-loader");
        if (loader) {
          loader.setAttribute("aria-hidden", "false");
        }
        submitButton.textContent = SchoolI18n.t("rank.registering");
        this.rankSubmitInFlight = true;
        this.submitRankScore(run, name, options).finally(() => {
          if (this.rankNameLayer === layer) {
            this.rankSubmitInFlight = false;
            form.classList.remove("is-submitting");
            if (loader) {
              loader.setAttribute("aria-hidden", "true");
            }
            input.disabled = false;
            updateSubmitState();
            skipButton.disabled = false;
            submitButton.textContent = SchoolI18n.t("rank.register");
          }
        });
      };

      const handleSubmit = (event) => {
        event.preventDefault();
        submit();
      };
      const handleSkipClick = () => {
        this.returnToGameStart();
      };
      const handleKeyDown = (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          this.returnToGameStart();
          return;
        }
        if (event.key === "Tab") {
          const focusable = [input, submitButton, skipButton].filter((item) => item && !item.disabled);
          if (!focusable.length) {
            return;
          }
          const currentIndex = focusable.indexOf(document.activeElement);
          const nextIndex = event.shiftKey
            ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
            : (currentIndex + 1) % focusable.length;
          event.preventDefault();
          focusable[nextIndex].focus();
        }
      };
      form.addEventListener("submit", handleSubmit);
      skipButton.addEventListener("click", handleSkipClick);
      layer.addEventListener("keydown", handleKeyDown);

      this.rankNameLayerCleanup = () => {
        layer.removeEventListener("pointerdown", stopGameInput);
        layer.removeEventListener("touchstart", stopGameInput);
        layer.removeEventListener("mousedown", stopGameInput);
        input.removeEventListener("input", updateSubmitState);
        form.removeEventListener("submit", handleSubmit);
        skipButton.removeEventListener("click", handleSkipClick);
        layer.removeEventListener("keydown", handleKeyDown);
      };

      shell.appendChild(layer);
      this.rankNameLayer = layer;
      if (typeof window.__schoolZombieViewportRefresh === "function") {
        window.__schoolZombieViewportRefresh();
      }
      if (autoFocus) {
        this.rankNameFocusRaf = requestAnimationFrame(() => {
          this.rankNameFocusRaf = 0;
          if (this.disposed || this.rankNameLayer !== layer || !layer.isConnected) {
            return;
          }
          try {
            input.focus({ preventScroll: true });
          } catch {
            input.focus();
          }
          input.select();
        });
      }
    }

    async submitRankScore(snapshot = this.lastRankableRun, rawName = null, options = {}) {
      const run = snapshot || this.getRankSnapshot();
      if (!run || run.score <= 0) {
        this.showToast(SchoolI18n.t("toast.noStage"), COLORS.red);
        return;
      }
      if (rawName === null) {
        this.showRankNameLayer(run, options);
        return;
      }
      const name = String(rawName).trim().replace(/\s+/g, " ").slice(0, 20);
      if (!name) {
        this.showToast(SchoolI18n.t("toast.needName"), COLORS.red);
        return;
      }
      if (!window.ArcherRanking) {
      this.showToast(SchoolI18n.t("toast.rankCheck"), COLORS.gold);
      const synced = await this.ensureRankStagesRecorded().catch(() => false);
      if (!this.rankSessionId || !synced || this.rankSyncFailed) {
        this.showToast(SchoolI18n.t("toast.rankCheckFail"), COLORS.red);
        return;
      }

      }

      this.showToast(SchoolI18n.t("toast.rankSubmit"), COLORS.gold);
      try {
        const response = await this.fetchWithAbort(`${RANK_API_BASE}/rankings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game_id: RANK_GAME_ID,
            player_name: name,
            score: run.score,
            session_id: this.rankSessionId,
            extra_data: {
              session_id: this.rankSessionId,
              cleared_stage: run.score,
              highest_stage: run.score,
              stage: run.score,
              reached_stage: run.reachedStage,
              level: run.level,
              kills: run.kills,
              coins: run.coins,
              survived_seconds: run.survivedSeconds
            }
          })
        }, this.rankFetchControllers);
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `rank submit ${response.status}`);
        }
        this.saveStoredRankName(name);
        this.lastRankableRun = null;
        this.removeRankNameLayer();
        this.showToast(data?.pending ? SchoolI18n.t("toast.rankQueued") : SchoolI18n.t("toast.rankDone"), COLORS.green);
        if (options.returnToMenuOnSuccess) {
          this.showMenu();
        } else {
          this.showRankings();
        }
      } catch (error) {
        window.ArcherLabClientErrorReporter?.reportCodeException?.(error, { phase: 'rank-submit' }, 'ranking_client_exception');
        console.warn("[SchoolZombie] rank submit failed:", error.message);
        this.showToast(SchoolI18n.t("toast.rankFail"), COLORS.red);
      }
    }

    refreshLanguageChrome() {
      if (this.ui?.supplyLabel?.active) this.ui.supplyLabel.setText(SchoolI18n.t("hud.supply"));
      if (this.ui?.stage?.active) this.updateHud();
      const canvas = this.game?.canvas;
      if (canvas) canvas.setAttribute("aria-label", SchoolI18n.t("boot.canvas"));
    }

    switchLanguage(lang) {
      if (SchoolI18n.getLang() === lang) return;
      SchoolI18n.setLang(lang);
      this.refreshLanguageChrome();
      if (this.mode === "menu") this.showMenu();
      else if (this.mode === "ranking") this.showRankings();
      else if (this.mode === "profile-loading") this.showInitialProfileLoading();
      else if (this.mode === "shop") this.shopUI?.localize();
      else if (this.mode === "paused") {
        if (this.pauseConfirmOpen) this.showQuitConfirmation();
        else this.showPauseOverlay();
      }
    }

    addLanguageSwitch(x, y, depth) {
      const make = (lang, offset) => this.addTacticalMenuButton(
        x + offset, y, 52, 34, lang.toUpperCase(), depth,
        () => this.switchLanguage(lang),
        SchoolI18n.getLang() === lang ? COLORS.gold : COLORS.blue,
        { compact: true, fontSize: 12, hitHeight: 44, visualHeight: 32, surfaceAlpha: 0.45, shadowAlpha: 0.12 }
      );
      return [make("ko", -30), make("en", 30)];
    }

    showInitialProfileLoading() {
      this.clearOverlay();
      this.mode = "profile-loading";
      const items = this.overlayObjects;
      const titleArt = this.add.image(270, 480, "title-keyart").setDepth(500);
      const source = titleArt.texture.getSourceImage();
      const ratio = source.width / source.height;
      titleArt.setDisplaySize(Math.max(GAME_WIDTH, GAME_HEIGHT * ratio), Math.max(GAME_HEIGHT, GAME_WIDTH / ratio));
      items.push(titleArt);
      items.push(this.add.rectangle(270, 480, 540, 960, 0x020304, 0.42).setDepth(501));
      items.push(this.addSurfaceImage(270, 458, 342, 154)
        .setDepth(502));
      items.push(this.add.rectangle(270, 392, 48, 2, UI_COLORS.amber, 0.65).setDepth(503));
      items.push(this.add.text(270, 438, SchoolI18n.t("loading.profile"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 24,
        fontStyle: "900",
        color: "#eee6d2",
        stroke: "#050607",
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(504));
      items.push(this.add.text(270, 486, SchoolI18n.t("loading.coins"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 16,
        fontStyle: "900",
        color: "#d5b675",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(504));
    }

    showMenu() {
      this.clearOverlay();
      this.mode = "menu";
      announceGameStatus(SchoolI18n.t("menu.a11y", { coins: this.meta.coins, offline: this.profileSyncFailed ? SchoolI18n.t("menu.offline") : "" }));
      this.startBgm("menu");
      const items = this.overlayObjects;
      const titleArt = this.add.image(270, 480, "title-keyart").setDepth(500);
      const source = titleArt.texture.getSourceImage();
      const ratio = source.width / source.height;
      titleArt.setDisplaySize(Math.max(GAME_WIDTH, GAME_HEIGHT * ratio), Math.max(GAME_HEIGHT, GAME_WIDTH / ratio));
      items.push(titleArt);
      const titleScaleX = titleArt.scaleX;
      const titleScaleY = titleArt.scaleY;
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: titleArt,
          y: 474,
          scaleX: titleScaleX * 1.018,
          scaleY: titleScaleY * 1.018,
          duration: 7200,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }

      const scrim = this.add.graphics().setDepth(501);
      const bandCount = 12;
      for (let index = 0; index < bandCount; index += 1) {
        const progress = index / Math.max(1, bandCount - 1);
        scrim.fillStyle(0x020406, 0.52 * Math.pow(1 - progress, 1.45));
        scrim.fillRect(0, index * 23, GAME_WIDTH, 24);
      }
      for (let index = 0; index < bandCount; index += 1) {
        const progress = index / Math.max(1, bandCount - 1);
        scrim.fillStyle(0x020406, 0.44 * Math.pow(progress, 1.25));
        scrim.fillRect(0, 628 + index * 28, GAME_WIDTH, 30);
      }
      items.push(scrim);

      const archerButton = this.addTacticalMenuButton(112, 38, 178, 42, "← ARCHERLAB", 530, () => {
        goToArcherLabHome();
      }, COLORS.blue, { compact: true, fontSize: 14, hitHeight: 76, surfaceAlpha: 0.32, shadowAlpha: 0.1, activateOnRelease: true });
      const protocol = this.add.text(492, 38, this.profileSyncFailed ? "SYNC · OFFLINE" : "THREAT · RED", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 13,
        fontStyle: "800",
        color: "#ca9273",
        stroke: "#050607",
        strokeThickness: 1
      }).setOrigin(1, 0.5).setDepth(504);
      items.push(protocol);
      this.addLanguageSwitch(292, 38, 530);
      const eyebrow = this.add.text(270, 79, "SCHOOL UNDEAD · LAST DEFENSE", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fontStyle: "800",
        color: "#c5b995",
        stroke: "#050607",
        strokeThickness: 1
      }).setOrigin(0.5).setDepth(504);
      eyebrow.setShadow(0, 2, "#000000", 8, true, true);
      items.push(eyebrow);
      const title = this.add.text(270, 132, SchoolI18n.t("menu.title"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 40,
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(0.5).setDepth(504);
      title.setShadow(0, 5, "#000000", 10, true, true);
      items.push(title);
      const subtitle = this.add.text(270, 179, SchoolI18n.t("menu.subtitle"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 18,
        fontStyle: "800",
        color: "#d0cbbd",
        stroke: "#050607",
        strokeThickness: 1
      }).setOrigin(0.5).setDepth(504);
      subtitle.setShadow(0, 3, "#000000", 7, true, true);
      items.push(subtitle);

      const missionPanel = this.addCommandPanel(270, 602, 432, 74, 522, COLORS.blue, {
        surfaceAlpha: 0.28,
        shadowAlpha: 0.08,
      });
      const missionKicker = this.add.text(72, 584, "CURRENT OBJECTIVE", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 10,
        fontStyle: "800",
        color: "#c5b995"
      }).setOrigin(0, 0.5).setDepth(524);
      const missionTitle = this.add.text(72, 610, SchoolI18n.t("menu.objective"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 15,
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(0, 0.5).setDepth(524);
      const missionTag = this.add.text(468, 602, "ENDLESS", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fontStyle: "800",
        color: "#d5b675",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(1, 0.5).setDepth(524);
      items.push(missionKicker, missionTitle, missionTag);

      const creditPanel = this.addCommandPanel(270, 700, 318, 46, 526, COLORS.gold, {
        surfaceAlpha: 0.3,
        shadowAlpha: 0.08,
      });
      const creditLabel = this.add.text(132, 700, this.profileSyncFailed ? "OFFLINE SUPPLY" : "SUPPLY CREDIT", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fontStyle: "800",
        color: "#aaa998",
        stroke: "#050607",
        strokeThickness: 1
      }).setOrigin(0, 0.5).setDepth(527);
      const creditValue = this.add.text(408, 700, `$${this.meta.coins}`, {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 19,
        fontStyle: "800",
        color: "#d5b675",
        stroke: "#050607",
        strokeThickness: 1
      }).setOrigin(1, 0.5).setDepth(527);
      this.menuCoinsText = creditValue;
      items.push(creditLabel, creditValue);

      const startButton = this.addTacticalMenuButton(270, 790, 410, 86, SchoolI18n.t("menu.deploy"), 530, () => this.startRun(), 0xf15a47, {
        primary: true,
        surfaceAlpha: 0.55,
        shadowAlpha: 0.14,
        lightText: true,
        kicker: "BEGIN SORTIE · ENTER / A",
        hitHeight: 86
      });
      const rankingButton = this.addTacticalMenuButton(164, 892, 188, 76, SchoolI18n.t("menu.ranks"), 530, () => this.showRankings(), COLORS.gold, {
        surfaceAlpha: 0.32,
        shadowAlpha: 0.1,
        kicker: "RECORDS · L",
        hitHeight: 76
      });
      const shopButton = this.addTacticalMenuButton(376, 892, 188, 76, SchoolI18n.t("menu.armory"), 530, () => this.showShop(), COLORS.blue, {
        surfaceAlpha: 0.32,
        shadowAlpha: 0.1,
        kicker: "ARMORY · A",
        hitHeight: 76
      });

      this.animateOverlayEntrance(Object.values(archerButton), 40, -10, 300);
      this.animateOverlayEntrance([protocol, eyebrow], 90, 10, 320);
      this.animateOverlayEntrance([title], 150, 18, 420);
      this.animateOverlayEntrance([subtitle], 230, 14, 380);
      this.animateOverlayEntrance([...missionPanel.objects, missionKicker, missionTitle, missionTag], 270, 18, 360);
      this.animateOverlayEntrance([...creditPanel.objects, creditLabel, creditValue], 300, 18, 360);
      this.animateOverlayEntrance(Object.values(startButton), 350, 22, 420);
      this.animateOverlayEntrance(Object.values(rankingButton), 430, 18, 380);
      this.animateOverlayEntrance(Object.values(shopButton), 470, 18, 380);
    }

    showShop(selectedId = this.shopSelectedCharacter || "c") {
      const enteringShop = this.mode !== "shop";
      this.clearOverlay();
      this.mode = "shop";
      announceGameStatus(SchoolI18n.t("shop.a11y"));
      this.startBgm("menu");
      if (enteringShop) this.playSfx("shop_open", 0.82);
      this.shopSelectedCharacter = SHOP_CHARACTERS.find((character) => character.id === selectedId)?.id || "c";
      this.overlayObjects.push(this.add.image(270, 480, "shop-blackmarket").setDisplaySize(540, 960).setDepth(500));
      const shopUI = window.SchoolZombieShop.create({
        host: document.getElementById("game-shell"),
        getView: () => this.getShopView(),
        onSelect: (id) => {
          this.shopSelectedCharacter = id;
          this.playSfx("button", 0.7);
        },
        onBuy: (id) => this.buyShopUpgrade(id),
        onReset: () => this.resetShopUpgrades(),
        onExit: () => this.showMenu(),
        onLocale: () => this.refreshLanguageChrome()
      });
      this.shopUI = shopUI;
      // A late profile response refreshes the balance without opening the dialog.
      if (!this.profileReady) {
        this.ensureServerProfile({ quiet: true }).then(() => {
          if (!this.disposed && this.shopUI === shopUI) shopUI.refresh();
        }).catch(() => {
          if (!this.disposed && this.shopUI === shopUI) shopUI.notify(SchoolI18n.t("shop.syncFail"));
        });
      }
    }

    getShopView() {
      const selected = SHOP_CHARACTERS.find((character) => character.id === this.shopSelectedCharacter) || SHOP_CHARACTERS[0];
      return {
        coins: formatShopCost(this.meta.coins),
        maxLevel: SHOP_MAX_LEVEL,
        selectedId: selected.id,
        selectedName: selected.name,
        weapon: selected.weapon,
        refund: this.getShopResetRefund(),
        characters: SHOP_CHARACTERS.map((character) => ({
          id: character.id, name: character.name, weapon: character.weapon,
          portrait: imageAsset(`assets/images/${character.portrait}.png`),
          total: this.getCharacterTotalUpgradeLevel(character.id)
        })),
        upgrades: this.getCharacterShopUpgrades(selected.id).map((upgrade) => {
          const level = this.getMetaUpgradeLevel(upgrade.id);
          const cost = getShopUpgradeCost(level);
          return {
            id: upgrade.id, title: upgrade.title, part: upgrade.part,
            stats: this.getShopUpgradeStatText(upgrade, level), level,
            cost: formatShopCost(cost), maxed: level >= SHOP_MAX_LEVEL,
            canAfford: this.meta.coins >= cost
          };
        })
      };
    }

    getCharacterShopUpgrades(characterId) {
      return SHOP_CHARACTER_UPGRADES[characterId] || [];
    }

    getCharacterTotalUpgradeLevel(characterId) {
      const total = this.getCharacterShopUpgrades(characterId)
        .reduce((sum, upgrade) => sum + this.getMetaUpgradeLevel(upgrade.id), 0);
      return SchoolI18n.t("shop.total", { total });
    }

    getMetaUpgradeLevel(id) {
      return clamp(Math.floor(Number(this.meta?.upgrades?.[id]) || 0), 0, SHOP_MAX_LEVEL);
    }

    getShopUpgradeEffectLine(id, level) {
      const percent = (value) => `${Math.round(value * 10) / 10}%`;
      const seconds = (value) => value.toFixed(2);
      if (id === "c_power") return SchoolI18n.t("shop.effect.c_power", { value: percent(level * 3.2) });
      if (id === "c_speed") return SchoolI18n.t("shop.effect.c_speed", { value: percent(level * 0.9) });
      if (id === "c_crit") return SchoolI18n.t("shop.effect.c_crit", { crit: percent(level * 0.6), critDmg: percent(level * 1) });
      if (id === "a_power") return SchoolI18n.t("shop.effect.a_power", { value: percent(level * 3) });
      if (id === "a_mark") return SchoolI18n.t("shop.effect.a_mark", { mark: percent(level * 0.6), time: seconds(level * 0.06) });
      if (id === "a_crit") return SchoolI18n.t("shop.effect.a_crit", { crit: percent(level * 0.7), critDmg: percent(level * 1) });
      if (id === "b_power") return SchoolI18n.t("shop.effect.b_power", { value: percent(level * 3) });
      if (id === "b_control") return SchoolI18n.t("shop.effect.b_control", { burst: percent(level * 1), fire: percent(level * 0.4) });
      if (id === "b_grenade") {
        return level <= 0 ? SchoolI18n.t("shop.effect.b_grenade_none") : SchoolI18n.t("shop.effect.b_grenade", { every: getRifleGrenadeEveryForLevel(level) });
      }
      if (id === "d_charge") return SchoolI18n.t("shop.effect.d_charge", { value: percent(level * 3.4) });
      if (id === "d_radius") return SchoolI18n.t("shop.effect.d_radius", { radius: percent(level * 1.3), damage: percent(level * 1) });
      if (id === "d_slow") return SchoolI18n.t("shop.effect.d_slow", { time: seconds(level * 0.09) });
      if (id === "e_power") return SchoolI18n.t("shop.effect.e_power", { value: percent(level * 3.2) });
      if (id === "e_focus") return SchoolI18n.t("shop.effect.e_focus", { crit: percent(level * 0.6), critDmg: percent(level * 2.5) });
      if (id === "e_pierce") {
        return SchoolI18n.t("shop.effect.e_pierce", { pierce: Math.floor(level / 5), damage: percent(level * 0.8) });
      }
      if (id === "f_burn") return SchoolI18n.t("shop.effect.f_burn", { hit: percent(level * 2.6), zone: percent(level * 0.6) });
      if (id === "f_area") return SchoolI18n.t("shop.effect.f_area", { radius: Math.round(level * 1.5), time: seconds(level * 0.05) });
      if (id === "f_throw") return SchoolI18n.t("shop.effect.f_throw", { value: percent(level * 1.2) });
      if (id === "g_voltage") return SchoolI18n.t("shop.effect.g_voltage", { damage: percent(level * 2.2), time: seconds(level * 0.03) });
      if (id === "g_chain") return SchoolI18n.t("shop.effect.g_chain", { radius: Math.round(level * 2), jumps: Math.floor(level / 10) });
      if (id === "g_control") return SchoolI18n.t("shop.effect.g_control", { interval: percent(level * 0.6), crit: percent(level * 0.35) });
      if (id === "h_turret") return SchoolI18n.t("shop.effect.h_turret", { power: percent(level * 3.5), speed: percent(level * 1.8) });
      if (id === "h_wire") return SchoolI18n.t("shop.effect.h_wire", { damage: percent(level * 3.2), slow: percent(level * 1.8) });
      if (id === "h_barricade") return SchoolI18n.t("shop.effect.h_barricade", { repair: percent(level * 2), shield: percent(level * 2.5) });
      return SchoolI18n.t("shop.effect.fallback", { value: percent(level * 2) });
    }

    getShopUpgradeStatText(upgrade, level) {
      const current = this.getShopUpgradeEffectLine(upgrade.id, level);
      if (level >= SHOP_MAX_LEVEL) {
        return SchoolI18n.t("shop.effect.maxed", { current });
      }
      return SchoolI18n.t("shop.effect.next", { current, next: this.getShopUpgradeEffectLine(upgrade.id, level + 1) });
    }



    async buyShopUpgrade(id) {
      if (this.shopActionInFlight) {
        return;
      }
      const character = SHOP_CHARACTERS.find((item) => this.getCharacterShopUpgrades(item.id).some((upgrade) => upgrade.id === id));
      const upgrade = character ? this.getCharacterShopUpgrades(character.id).find((item) => item.id === id) : null;
      if (!upgrade) {
        return;
      }
      const shopUI = this.shopUI;
      this.unlockAudio();
      this.showShopActionLoading(this.profileReady ? SchoolI18n.t("shop.buying") : SchoolI18n.t("loading.profile"));
      try {
        await this.ensureServerProfile();
      } catch (error) {
        if (this.disposed || this.shopUI !== shopUI || this.mode !== "shop") return;
        this.clearShopActionLoading();
        return;
      }
      if (this.disposed || this.shopUI !== shopUI || this.mode !== "shop") return;
      this.clearShopActionLoading();
      const level = this.getMetaUpgradeLevel(id);
      if (level >= SHOP_MAX_LEVEL) {
        this.playSfx("upgrade_maxed", 0.78);
        this.showToast(SchoolI18n.t("toast.maxed"), COLORS.gold);
        return;
      }
      const cost = getShopUpgradeCost(level);
      if (this.meta.coins < cost) {
        this.playSfx("core", 0.65);
        this.showToast(SchoolI18n.t("toast.noCoins"), COLORS.red);
        return;
      }
      this.showShopActionLoading(SchoolI18n.t("shop.buying"));
      try {
        const result = await this.postProfileAction("/school-zombie/profile/buy-upgrade", { upgrade_id: id });
        if (this.disposed || this.shopUI !== shopUI || this.mode !== "shop") return;
        this.clearShopActionLoading();
        this.playSfx("purchase");
        shopUI?.refresh();
        this.showToast(`${upgrade.title} Lv.${result.level || level + 1}`, character.accent);
      } catch (error) {
        if (this.disposed || this.shopUI !== shopUI || this.mode !== "shop") return;
        this.clearShopActionLoading();
        this.playSfx("core", 0.65);
        this.showToast(SchoolI18n.t("toast.buyFail"), COLORS.red);
        this.ensureServerProfile({ force: true, quiet: true }).then(() => {
          if (!this.disposed && this.shopUI === shopUI && this.mode === "shop") {
            shopUI?.refresh();
          }
        }).catch(() => {});
      }
    }

    getShopResetRefund() {
      const meta = normalizeMetaSave(this.meta || createDefaultMetaSave());
      return getAllShopUpgradeIds()
        .reduce((sum, id) => sum + getShopUpgradeRefund(meta.upgrades[id]), 0);
    }

    showShopResetNoticeLayer() {
      this.shopUI?.confirmReset(0, () => {});
    }

    showShopResetConfirmLayer(refund) {
      this.shopUI?.confirmReset(refund, () => this.resetShopUpgrades(true));
    }

    async resetShopUpgrades(confirmed = false) {
      if (this.shopActionInFlight) {
        return;
      }
      const shopUI = this.shopUI;
      this.unlockAudio();
      this.showShopActionLoading(this.profileReady ? SchoolI18n.t("shop.checking") : SchoolI18n.t("loading.profile"));
      try {
        await this.ensureServerProfile();
      } catch (error) {
        if (this.disposed || this.shopUI !== shopUI || this.mode !== "shop") return;
        this.clearShopActionLoading();
        return;
      }
      if (this.disposed || this.shopUI !== shopUI || this.mode !== "shop") return;
      this.clearShopActionLoading();
      const refund = this.getShopResetRefund();
      if (refund <= 0) {
        this.playSfx("core", 0.65);
        this.showShopResetNoticeLayer();
        return;
      }
      if (!confirmed) {
        this.showShopResetConfirmLayer(refund);
        return;
      }
      this.showShopActionLoading(SchoolI18n.t("shop.resetting"));
      try {
        const result = await this.postProfileAction("/school-zombie/profile/reset-upgrades");
        if (this.disposed || this.shopUI !== shopUI || this.mode !== "shop") return;
        this.clearShopActionLoading();
        this.playSfx("coin");
        shopUI?.refresh();
        this.showToast(SchoolI18n.t("toast.shopReset", { refund: `$${formatShopCost(result.refund || refund)}` }), COLORS.gold);
      } catch (error) {
        if (this.disposed || this.shopUI !== shopUI || this.mode !== "shop") return;
        this.clearShopActionLoading();
        this.playSfx("core", 0.65);
        this.showToast(SchoolI18n.t("toast.resetFail"), COLORS.red);
        this.ensureServerProfile({ force: true, quiet: true }).then(() => {
          if (!this.disposed && this.shopUI === shopUI && this.mode === "shop") {
            shopUI?.refresh();
          }
        }).catch(() => {});
      }
    }

    saveMeta() {
      this.meta = normalizeMetaSave(this.meta);
      saveMetaSave(this.meta);
    }

    getDisplayedCoins() {
      const storedCoins = Math.max(0, Math.floor(Number(this.meta?.coins) || 0));
      const runCoins = Math.max(0, Math.floor(Number(this.coins) || 0));
      return storedCoins + (this.runCoinsBanked ? 0 : runCoins);
    }

    async startRun() {
      if (this.mode === "starting") {
        return;
      }
      if (this.coins > 0 && !this.runCoinsBanked && !this.runCoinsQueued) {
        await this.bankRunCoins();
        if (!this.runCoinsBanked && !this.runCoinsQueued) { this.showRewardRetryOverlay(); return; }
      }
      this.unlockAudio();
      const previousMode = this.mode;
      showRunLoadingOverlay(SchoolI18n.t("loading.profile"));
      this.mode = "starting";
      try {
        await this.ensureServerProfile({ force: true });
      } catch (error) {
        hideRunLoadingOverlay();
        if (!this.disposed && this.mode === "starting") {
          this.mode = previousMode;
        }
        return;
      }
      if (this.disposed || this.mode !== "starting") {
        hideRunLoadingOverlay();
        return;
      }
      updateRunLoadingOverlay(SchoolI18n.t("loading.enterLine"));
      this.playSfx("start");
      this.startBgm("game");
      this.clearOverlay();
      this.resetRun();
      this.startRankSession();
      updateRunLoadingOverlay(SchoolI18n.t("loading.checkGear"));
      await this.waitForGameplaySfxReady();
      if (this.disposed || this.mode !== "starting") {
        hideRunLoadingOverlay();
        return;
      }
      this.mode = "playing";
      announceGameStatus(SchoolI18n.t("run.a11yStart"));
      updateRunLoadingOverlay(SchoolI18n.t("loading.showField"));
      await waitForRenderFrames(2);
      hideRunLoadingOverlay();
    }

    async returnToMenuFromRun() {
      if (this.mode !== "playing" && this.mode !== "paused") {
        return;
      }
      this.unlockAudio();
      this.playSfx("button", 0.85);
      this.setGameSpeed(DEFAULT_GAME_SPEED);
      if (this.ui.pauseText) {
        this.ui.pauseText.setText("Ⅱ");
      }
      this.mode = "gameover";
      this.clearOverlay();
      const pendingCoins = Math.max(0, Math.floor(Number(this.coins) || 0));
      const earnedCoins = await this.bankRunCoins();
      if (pendingCoins > 0 && !this.runCoinsBanked && !this.runCoinsQueued) {
        this.showRewardRetryOverlay();
        return;
      }
      this.resetRun();
      this.showMenu();
      if (earnedCoins > 0) {
        this.showToast(SchoolI18n.t("toast.gained", { amount: earnedCoins }), COLORS.gold);
      }
    }

    bankRunCoins() {
      if (this.runCoinsBanked) return Promise.resolve(0);
      if (this.runCoinBankPromise) return this.runCoinBankPromise;
      // Capture before waiting: reset/menu/new-run actions must not replace this
      // run's final ledger. Durable delivery persists it before returning pending.
      const sessionId = this.rankSessionId || window.ArcherRanking?.sessionId(RANK_GAME_ID);
      const syncToken = this.rankSyncToken;
      const auth = this.profileAuth || loadProfileAuth();
      const event = this.createRankRunProgressEvent();
      const task = (async () => {
        try {
          if (!sessionId || !auth) throw new Error("reward session unavailable");
          const body = { ...auth, game_id: RANK_GAME_ID, session_id: sessionId, event };
          const result = window.ArcherRanking?.bankRun
            ? await window.ArcherRanking.bankRun(body)
            : await this.postProfileAction("/school-zombie/profile/bank-run", body);
          if (result.pending) {
            if (this.rankSyncToken === syncToken) this.runCoinsQueued = true;
            if (!this.disposed) this.showToast(SchoolI18n.t("toast.rewardQueued"), COLORS.gold);
            return 0;
          }
          if (!this.disposed && result.profile_id === this.profileAuth?.profile_id) {
            if (this.rankSyncToken === syncToken) {
              this.runCoinsBanked = true;
              this.runCoinsQueued = false;
            }
            this.applyServerProfile(result);
          }
          return Math.max(0, Math.floor(Number(result.run_coins ?? result.earned_coins) || 0));
        } catch (error) {
          if (!this.disposed) {
            this.playSfx("core", 0.65);
            this.showToast(SchoolI18n.t("toast.rewardFail"), COLORS.red);
          }
          return 0;
        }
      })();
      this.runCoinBankPromise = task;
      return task.finally(() => {
        if (this.runCoinBankPromise === task) this.runCoinBankPromise = null;
      });
    }

    applyMetaUpgrades() {
      this.defenders.forEach((defender) => {
        if (defender.id === "c") {
          const power = this.getMetaUpgradeLevel("c_power");
          const speed = this.getMetaUpgradeLevel("c_speed");
          const crit = this.getMetaUpgradeLevel("c_crit");
          defender.damageBoost *= 1 + power * 0.032;
          defender.rate *= Math.max(0.5, 1 - speed * 0.009);
          defender.critChance = Math.min(0.72, defender.critChance + crit * 0.006);
          defender.critMultiplier += crit * 0.01;
        } else if (defender.id === "a") {
          const power = this.getMetaUpgradeLevel("a_power");
          const mark = this.getMetaUpgradeLevel("a_mark");
          const crit = this.getMetaUpgradeLevel("a_crit");
          defender.damageBoost *= 1 + power * 0.03;
          defender.markDamageBonus += mark * 0.006;
          defender.markDuration += mark * 0.06;
          defender.critChance = Math.min(0.72, defender.critChance + crit * 0.007);
          defender.critMultiplier += crit * 0.01;
        } else if (defender.id === "b") {
          const power = this.getMetaUpgradeLevel("b_power");
          const control = this.getMetaUpgradeLevel("b_control");
          const grenade = this.getMetaUpgradeLevel("b_grenade");
          defender.damageBoost *= 1 + power * 0.03;
          defender.burstDelay = Math.max(MIN_CHAIN_SHOT_DELAY, defender.burstDelay * Math.max(0.5, 1 - control * 0.01));
          defender.rate *= Math.max(0.5, 1 - control * 0.004);
          if (grenade > 0) {
            defender.rocketEvery = getRifleGrenadeEveryForLevel(grenade);
          }
        } else if (defender.id === "d") {
          const charge = this.getMetaUpgradeLevel("d_charge");
          const radius = this.getMetaUpgradeLevel("d_radius");
          const slow = this.getMetaUpgradeLevel("d_slow");
          defender.damageBoost *= 1 + charge * 0.034;
          defender.splashRadiusBoost *= 1 + radius * 0.013;
          defender.splashDamageBoost *= 1 + radius * 0.01;
          defender.slowDuration += slow * 0.09;
        } else if (defender.id === "e") {
          const power = this.getMetaUpgradeLevel("e_power");
          const focus = this.getMetaUpgradeLevel("e_focus");
          const pierce = this.getMetaUpgradeLevel("e_pierce");
          defender.damageBoost *= 1 + power * 0.032 + pierce * 0.008;
          defender.critChance = Math.min(0.76, defender.critChance + focus * 0.006);
          defender.critMultiplier += focus * 0.025;
          defender.pierce += Math.floor(pierce / 5);
        } else if (defender.id === "f") {
          const burn = this.getMetaUpgradeLevel("f_burn");
          const area = this.getMetaUpgradeLevel("f_area");
          const throwTraining = this.getMetaUpgradeLevel("f_throw");
          defender.damageBoost *= 1 + burn * 0.026 + throwTraining * 0.012;
          defender.fireZoneDamageScale += burn * 0.006;
          defender.fireZoneRadius += area * 1.5;
          defender.fireZoneDuration += area * 0.05;
        } else if (defender.id === "g") {
          const voltage = this.getMetaUpgradeLevel("g_voltage");
          const chain = this.getMetaUpgradeLevel("g_chain");
          const control = this.getMetaUpgradeLevel("g_control");
          defender.damageBoost *= 1 + voltage * 0.022;
          defender.stunDuration += voltage * 0.03;
          defender.chainDamageScale += voltage * 0.006;
          defender.chainRadius += chain * 2;
          defender.chainJumps += Math.floor(chain / 10);
          defender.rate *= Math.max(0.58, 1 - control * 0.006);
          defender.critChance = Math.min(0.64, defender.critChance + control * 0.0035);
        } else if (defender.id === "h") {
          const turret = this.getMetaUpgradeLevel("h_turret");
          const wire = this.getMetaUpgradeLevel("h_wire");
          const barricade = this.getMetaUpgradeLevel("h_barricade");
          defender.damageBoost *= 1 + turret * 0.012 + barricade * 0.008;
          defender.turretDamageBoost *= 1 + turret * 0.035;
          defender.turretRateBoost *= 1 + turret * 0.018;
          defender.wireDamageBoost *= 1 + wire * 0.032;
          defender.wireSlowBoost *= 1 + wire * 0.018;
          defender.barricadeRepairBoost = 1 + barricade * 0.02;
          defender.barricadeShieldBoost = 1 + barricade * 0.025;
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
      this.highestClearedStage = 0;
      this.lastRankableRun = null;
      this.resetRankSessionState();
      this.kills = 0;
      this.killsInLevel = 0;
      this.levelNeed = STARTING_LEVEL_NEED;
      this.spawnTimer = STARTING_SPAWN_TIMER;
      this.spawnBurst = 1;
      this.maxCoreHp = 3000;
      this.coreHp = this.maxCoreHp;
      this.coins = 0;
      this.rewardCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
      this.runCoinsBanked = false;
      this.runCoinsQueued = false;
      this.runCoinBankPromise = null;
      this.runRerollLevels = [];
      this.shield = 0;
      this.damage = getTeamDamageForLevel(this.level);
      this.playerFireTimer = 0;
      this.focusPoint = null;
      this.hitStopTimer = 0;
      this.setGameSpeed(DEFAULT_GAME_SPEED);
      this.skillRerollsThisRun = 0;
      this.skillRerollUsed = false;
      this.currentSkillChoiceSignature = "";
      this.recruitedDefenders = new Set(["c"]);
      this.recruitOrder = ["c"];
      this.defenders.forEach((defender) => {
        defender.rate = defender.baseRate;
        defender.damageBoost = 1;
        defender.pierce = defender.basePierce || 0;
        defender.critChance = defender.baseCritChance || BASE_CRIT_CHANCE;
        defender.critMultiplier = defender.baseCritMultiplier || DEFAULT_CRIT_MULTIPLIER;
        defender.rocketEvery = 0;
        defender.rocketDamageBoost = 1;
        defender.rocketRadiusBoost = 1;
        defender.shotsSinceRocket = 0;
        defender.burstCount = defender.baseBurstCount || 1;
        defender.burstDelay = defender.baseBurstDelay || 0;
        defender.splashRadiusBoost = 1;
        defender.splashDamageBoost = 1;
        defender.fireZoneRadius = defender.baseFireZoneRadius || 0;
        defender.fireZoneDuration = defender.baseFireZoneDuration || 0;
        defender.fireZoneDamageScale = defender.baseFireZoneDamageScale || 0;
        defender.chainJumps = defender.baseChainJumps || 0;
        defender.chainRadius = defender.baseChainRadius || 0;
        defender.chainDamageScale = defender.baseChainDamageScale || 0;
        defender.turretDamageBoost = 1;
        defender.turretRateBoost = 1;
        defender.wireDamageBoost = 1;
        defender.wireSlowBoost = 1;
        defender.barricadeRepairBoost = 1;
        defender.barricadeShieldBoost = 1;
        defender.markDuration = defender.baseMarkDuration || 0;
        defender.markDamageBonus = defender.baseMarkDamageBonus || 0;
        defender.slowDuration = defender.baseSlowDuration || 0;
        defender.stunDuration = defender.baseStunDuration || 0;
        defender.timer = rand(scaleWeaponInterval(0.1), defender.rate);
        defender.firePoseTimer = 0;
        defender.attackAnimation = null;
        defender.muzzleFlash = null;
      });
      this.applyMetaUpgrades();
      this.defenders.forEach((defender) => {
        defender.timer = rand(scaleWeaponInterval(0.1), defender.rate);
        this.setDefenderRecruited(defender.id, defender.role === "player", false);
      });
      this.updateHud();
    }

    togglePause() {
      if (this.mode === "playing") {
        this.mode = "paused";
        announceGameStatus(SchoolI18n.t("run.a11yPause", { stage: this.stage, wave: this.level, hp: Math.round(this.coreHp) }));
        if (this.ui.pauseText) {
          this.ui.pauseText.setText("▶");
        }
        this.showPauseOverlay();
      } else if (this.mode === "paused") {
        if (this.pauseConfirmOpen) {
          this.showPauseOverlay();
          return;
        }
        this.clearOverlay();
        this.mode = "playing";
        announceGameStatus(SchoolI18n.t("run.a11yResume"));
        if (this.ui.pauseText) {
          this.ui.pauseText.setText("Ⅱ");
        }
      }
    }

    showPauseOverlay() {
      this.clearOverlay();
      this.mode = "paused";
      this.pauseConfirmOpen = false;
      const items = this.overlayObjects;
      items.push(this.add.rectangle(270, 480, 540, 960, 0x010204, 0.72).setDepth(520));
      this.addCommandPanel(270, 486, 454, 646, 521, COLORS.gold, {
        alpha: 0.94,
      });
      const header = this.addOverlayHeader({
        y: 230,
        title: SchoolI18n.t("pause.title"),
        kicker: "TACTICAL HOLD",
        subtitle: `STAGE ${String(this.stage).padStart(2, "0")} · WAVE ${String(this.level).padStart(2, "0")}`,
        accent: COLORS.gold,
        depth: 523
      });

      const addSnapshot = (x, label, value, accent) => {
        const panel = this.addCommandPanel(x, 352, 126, 82, 525, accent, {
          alpha: 0.78,
        });
        const labelText = this.add.text(x, 331, label, {
          resolution: 2, fontFamily: "Arial, sans-serif",
          fontSize: 10,
          fontStyle: "800",
          color: "#b4b2a0"
        }).setOrigin(0.5).setDepth(525.4);
        const valueText = this.add.text(x, 360, value, {
          resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
          fontSize: 19,
          fontStyle: "800",
          color: "#eee6d2",
          stroke: "#030607",
          strokeThickness: 1
        }).setOrigin(0.5).setDepth(525.4);
        items.push(labelText, valueText);
        return [...panel.objects, labelText, valueText];
      };
      const snapshotObjects = [
        ...addSnapshot(132, SchoolI18n.t("pause.time"), formatRunClock(this.elapsed), COLORS.blue),
        ...addSnapshot(270, SchoolI18n.t("pause.kills"), `${this.kills}`, COLORS.red),
        ...addSnapshot(408, SchoolI18n.t("hud.supply"), `$${this.getDisplayedCoins()}`, COLORS.gold)
      ];

      const corePanel = this.addCommandPanel(270, 456, 400, 88, 525, this.coreHp < this.maxCoreHp * 0.35 ? COLORS.red : COLORS.green, {
        alpha: 0.78,
      });
      const coreTitle = this.add.text(92, 431, SchoolI18n.t("pause.core"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 12,
        fontStyle: "800",
        color: "#c6c4b5"
      }).setOrigin(0, 0.5).setDepth(526);
      const coreValue = this.add.text(448, 431, `${Math.round(this.coreHp)} / ${this.maxCoreHp}`, {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(1, 0.5).setDepth(526);
      const coreTrack = this.add.rectangle(270, 466, 352, 12, 0x010203, 0.9)
        .setStrokeStyle(1, 0xeee6d2, 0.18)
        .setDepth(526);
      const coreRatio = clamp(this.coreHp / this.maxCoreHp, 0, 1);
      const coreFill = this.add.rectangle(94, 466, 352 * coreRatio, 8, coreRatio < 0.35 ? UI_COLORS.danger : coreRatio < 0.68 ? UI_COLORS.amber : UI_COLORS.success, 1)
        .setOrigin(0, 0.5)
        .setDepth(527);
      items.push(coreTitle, coreValue, coreTrack, coreFill);

      const speedPanel = this.addCommandPanel(270, 540, 400, 54, 525, COLORS.blue, {
        alpha: 0.72,
      });
      const speedLabel = this.add.text(92, 540, SchoolI18n.t("pause.speed"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 13,
        fontStyle: "800",
        color: "#c6c4b5"
      }).setOrigin(0, 0.5).setDepth(526);
      this.ui.pauseSpeedValue = this.add.text(448, 540, formatGameSpeedLabel(this.speedMultiplier), {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "800",
        color: "#c5b995",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(1, 0.5).setDepth(526);
      const speedHit = this.add.rectangle(270, 540, 400, 58, 0xeee6d2, 0)
        .setDepth(527)
        .setInteractive({ useHandCursor: true });
      speedHit.on("pointerdown", () => {
        this.toggleSpeed();
        this.ui.pauseSpeedValue?.setText(formatGameSpeedLabel(this.speedMultiplier));
      });
      items.push(speedLabel, this.ui.pauseSpeedValue, speedHit);

      const resume = this.addTacticalMenuButton(270, 636, 382, 78, SchoolI18n.t("pause.resume"), 530, () => this.togglePause(), COLORS.gold, {
        primary: true,
        kicker: "RESUME · ESC / START",
        hitHeight: 82
      });
      const exit = this.addTacticalMenuButton(270, 734, 382, 62, SchoolI18n.t("pause.exit"), 530, () => this.showQuitConfirmation(), COLORS.red, {
        kicker: "BANK SUPPLIES & RETURN",
        hitHeight: 76,
        fontSize: 20
      });
      const hint = this.add.text(270, 800, SchoolI18n.t("pause.hint"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 11,
        fontStyle: "800",
        color: "#8fa8ae",
        align: "center"
      }).setOrigin(0.5).setDepth(532);
      items.push(hint);
      this.animateOverlayEntrance([
        ...header.objects,
        ...snapshotObjects,
        ...corePanel.objects,
        ...speedPanel.objects,
        speedLabel,
        this.ui.pauseSpeedValue,
        ...Object.values(resume),
        ...Object.values(exit),
        hint
      ], 40, 18, 360);
    }

    showQuitConfirmation() {
      this.clearOverlay();
      this.mode = "paused";
      this.pauseConfirmOpen = true;
      const items = this.overlayObjects;
      items.push(this.add.rectangle(270, 480, 540, 960, 0x010204, 0.82).setDepth(570));
      const panel = this.addCommandPanel(270, 480, 414, 370, 571, COLORS.red, {
        alpha: 0.96,
      });
      const kicker = this.add.text(270, 356, "CONFIRM WITHDRAWAL", {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fontStyle: "800",
        color: "#ff9b94"
      }).setOrigin(0.5).setDepth(573);
      const title = this.add.text(270, 399, SchoolI18n.t("pause.quitTitle"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 30,
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(0.5).setDepth(573);
      const body = this.add.text(270, 463, SchoolI18n.t("pause.quitBody", { coins: this.getDisplayedCoins() }), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 16,
        fontStyle: "800",
        color: "#cfe3e7",
        stroke: "#030607",
        strokeThickness: 1,
        align: "center",
        lineSpacing: 7
      }).setOrigin(0.5).setDepth(573);
      items.push(kicker, title, body);
      const cancel = this.addTacticalMenuButton(164, 570, 180, 60, SchoolI18n.t("pause.resume"), 575, () => this.showPauseOverlay(), COLORS.blue, {
        hitHeight: 76,
        fontSize: 18
      });
      const confirm = this.addTacticalMenuButton(376, 570, 180, 60, SchoolI18n.t("pause.quit"), 575, () => this.returnToMenuFromRun(), COLORS.red, {
        hitHeight: 76,
        fontSize: 18
      });
      this.animateOverlayEntrance([...panel.objects, kicker, title, body, ...Object.values(cancel), ...Object.values(confirm)], 30, 16, 320);
    }

    setGameSpeed(speed = DEFAULT_GAME_SPEED) {
      const normalized = GAME_SPEED_STEPS.find((step) => Math.abs(step - speed) < 0.001) || DEFAULT_GAME_SPEED;
      this.speedMultiplier = normalized;
      if (this.ui.speed) {
        this.ui.speed.setText(formatGameSpeedLabel(normalized));
      }
      if (this.ui.pauseSpeedValue?.active) {
        this.ui.pauseSpeedValue.setText(formatGameSpeedLabel(normalized));
      }
    }

    toggleSpeed() {
      if (this.mode !== "playing" && this.mode !== "paused") {
        return;
      }
      this.playSfx("button", 0.85);
      const currentIndex = GAME_SPEED_STEPS.findIndex((step) => Math.abs(step - this.speedMultiplier) < 0.001);
      const nextSpeed = GAME_SPEED_STEPS[(currentIndex + 1) % GAME_SPEED_STEPS.length] || DEFAULT_GAME_SPEED;
      this.setGameSpeed(nextSpeed);
    }

    update(time, delta) {
      this.pollGamepadInput(time);
      if (this.mode !== "playing") {
        return;
      }

      const rawDt = Math.min(delta, 50) / 1000;
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= rawDt;
        return;
      }
      this.resetVisualEffectBudgets();
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
      this.updateTurrets(dt);
      this.rebuildZombieHitGrid();
      this.updateBullets(dt);
      this.updateFireZones(dt);
      this.updateZombies(dt);
      this.updateFollowingHitEffects();
      this.updateEmbeddedArrows(dt);
      this.updateHud();
    }

    updateDefenderAnimations(dt) {
      this.defenders.forEach((defender) => {
        if (!defender.recruited) {
          return;
        }
        if (defender.attackAnimation) {
          const animation = defender.attackAnimation;
          animation.timer -= dt;
          // Consume elapsed frames at low frame rates and accelerated speed;
          // otherwise the release/recovery beat stretches with every frame.
          while (animation.timer <= 0 && defender.attackAnimation === animation) {
            animation.frame += 1;
            if (animation.frame >= animation.frames) {
              const restingPose = animation.pose || defender.pose || "aim-12";
              const recoveryBlendDuration = CHARACTER_RECOVERY_BLEND_DURATIONS[defender.id] || 0;
              const recoveryGhost = recoveryBlendDuration > 0 && defender.sprite
                ? this.trackTransient(this.add.image(
                  defender.sprite.x,
                  defender.sprite.y,
                  defender.sprite.texture.key
                )
                  .setOrigin(defender.sprite.originX, defender.sprite.originY)
                  .setDisplaySize(defender.sprite.displayWidth, defender.sprite.displayHeight)
                  .setRotation(defender.sprite.rotation)
                  .setFlip(defender.sprite.flipX, defender.sprite.flipY)
                  .setAlpha(defender.sprite.alpha)
                  .setDepth(defender.sprite.depth + 0.01))
                : null;
              defender.attackAnimation = null;
              defender.firePoseTimer = 0;
              this.setDefenderPose(defender, restingPose);
              if (recoveryGhost) {
                this.tweens.add({
                  targets: recoveryGhost,
                  alpha: 0,
                  duration: recoveryBlendDuration,
                  ease: "Sine.easeOut",
                  onComplete: () => this.destroyTransientObject(recoveryGhost, false)
                });
              }
              return;
            }
            animation.timer += animation.frameDurations?.[animation.frame] || animation.frameDuration;
            const textureKey = `character-${defender.id}-${animation.action}-${animation.pose}-${animation.frame}`;
            if (defender.sprite && this.textures.exists(textureKey)) {
              this.blendDefenderFrame(defender, CHARACTER_FRAME_BLEND_DURATIONS[defender.id] || 0, textureKey);
              defender.sprite.setTexture(textureKey);
              this.fitDefenderActionHeight(defender);
              this.syncDefenderMuzzleFlash(defender, animation.frame);
            }
            if (animation.frame === animation.releaseFrame && animation.onRelease) {
              const releaseAttack = animation.onRelease;
              animation.onRelease = null;
              releaseAttack();
            }
          }
          return;
        }
        if (defender.firePoseTimer > 0) {
          defender.firePoseTimer -= dt;
          if (defender.firePoseTimer <= 0) {
            this.setDefenderPose(defender, defender.pose || "aim-12");
          }
        }
      });
    }

    updateSpawning(dt) {
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) {
        return;
      }

      const levelPressure = Math.min(0.6, Math.max(0, this.level - 1) * 0.038);
      const lateFrequencyPressure = Math.min(0.38, Math.max(0, this.level - 10) * 0.037);
      const earlyDelayBonus = Math.max(0, 0.38 - this.level * 0.03);
      const baseDelay = clamp(1.08 - levelPressure + earlyDelayBonus, 0.58, 1.42) / (1 + lateFrequencyPressure);
      const delayMin = this.level < 7 ? 0.78 : 0.72;
      const delayMax = this.level < 7 ? 1.18 : 1.14;
      this.spawnTimer = rand(baseDelay * delayMin, baseDelay * delayMax) * ZOMBIE_SPAWN_INTERVAL_MULTIPLIER / ZOMBIE_SPAWN_COUNT_MULTIPLIER;
      this.spawnZombie(0);
    }

    spawnZombie(delay) {
      this.scheduleRunDelay(delay * 1000 / this.speedMultiplier, () => {
        const eliteRoll = this.level >= 6 && Math.random() < Math.min(0.045 + this.level * 0.0055, 0.16);
        const x = rand(this.getZombieLaneMinX(), this.getZombieLaneMaxX());
        const y = rand(-65, 46);
        const variant = Math.floor(rand(0, 4));
        const frame = Math.floor(rand(0, 4));
        const typeConfig = pickZombieType(this.level, eliteRoll);
        const baseDisplayHeight = eliteRoll ? ZOMBIE_ELITE_DISPLAY_HEIGHT : ZOMBIE_BASE_DISPLAY_HEIGHT;
        const displayHeight = Math.round(baseDisplayHeight * typeConfig.sizeScale);
        const displayWidth = displayHeight;
        const levelCurve = Math.pow(this.level, ZOMBIE_LEVEL_HP_EXPONENT);
        const lateLevelBonus = Math.max(0, this.level - 10);
        const earlyHpScale = clamp(0.82 + Math.max(0, this.level - 1) * 0.018, 0.82, 0.9);
        const baseHp =
          (eliteRoll ? 220 : 48)
          + levelCurve * (eliteRoll ? ZOMBIE_ELITE_LEVEL_HP_GAIN : ZOMBIE_NORMAL_LEVEL_HP_GAIN)
          + lateLevelBonus * (eliteRoll ? ZOMBIE_ELITE_LATE_HP_GAIN : ZOMBIE_NORMAL_LATE_HP_GAIN)
          + rand(-6, 12);
        const hp = Math.round(baseHp * ZOMBIE_HP_MULTIPLIER * typeConfig.hpScale * earlyHpScale);
        const textureBase = `zombie-walk-${typeConfig.id}`;
        const zombie = this.add.image(x, y, `${textureBase}-${variant}-${frame}`)
          .setOrigin(0.5, 0.56)
          .setDisplaySize(displayWidth, displayHeight)
          .setFlipX(Math.random() < 0.5)
          .setDepth(60);
        zombie.hp = hp;
        zombie.maxHp = hp;
        zombie.speed = (rand(30, 40) + (eliteRoll ? -6 : 0)) * typeConfig.speedScale;
        zombie.hitRadius = (eliteRoll ? 42 : 32) * typeConfig.hitRadiusScale;
        zombie.attack = (eliteRoll ? 40 : 18) * typeConfig.attackScale;
        zombie.attackTimer = rand(0.2, 0.7);
        zombie.slowTimer = 0;
        zombie.stunTimer = 0;
        zombie.stunSparkTimer = 0;
        zombie.stunAnchorX = null;
        zombie.stunAnchorY = null;
        zombie.fireBurnTimer = 0;
        zombie.fireBurnTickTimer = 0;
        zombie.fireBurnDamagePerTick = 0;
        zombie.fireBurnTickInterval = 0;
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
        zombie.crowdSeed = rand(-1, 1) || 0.5;
        zombie.crowdOrder = this.zombieSpawnSerial = (this.zombieSpawnSerial || 0) + 1;
        zombie.reward = typeConfig.reward;
        zombie.deathExplosion = Boolean(typeConfig.deathExplosion);
        zombie.surgeSpeedScale = typeConfig.surgeSpeedScale || 1;
        zombie.surgeDuration = typeConfig.surgeDuration || 0;
        zombie.surgeChargeDuration = typeConfig.surgeChargeDuration || 0;
        zombie.surgeCooldownMin = typeConfig.surgeCooldownMin || 0;
        zombie.surgeCooldownMax = typeConfig.surgeCooldownMax || 0;
        zombie.surgeMinBarricadeDistance = typeConfig.surgeMinBarricadeDistance || 0;
        zombie.surgeState = typeConfig.surgeSpeedScale ? "cooldown" : null;
        zombie.surgeTimer = typeConfig.surgeSpeedScale
          ? rand(typeConfig.surgeCooldownMin, typeConfig.surgeCooldownMax)
          : 0;
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
          const nextFireInterval = defender.projectile === "projectile-firebomb"
            ? FIREBOMB_THROW_INTERVAL_SECONDS
            : defender.rate * rand(0.75, 1.2);
          defender.timer = nextFireInterval + (burstCount - 1) * shotDelay / 1000;
          const target = this.findTarget(defender.x, 999, null, this.bounds.autoEngageTop);
          if (target) {
            let previousTarget = target;
            let grenadeCountedForBurst = false;
            let grenadeReadyForBurst = false;
            let grenadeFiredForBurst = false;
            for (let shot = 0; shot < burstCount; shot += 1) {
              this.scheduleRunDelay(shot * shotDelay, () => {
                if (!defender.recruited) {
                  return;
                }
                const shotTarget = this.findChainShotTarget(defender.x, 999, previousTarget, this.bounds.autoEngageTop);
                if (!shotTarget) {
                  return;
                }
                if (!shotTarget.active || shotTarget.hp <= 0) {
                  return;
                }
                previousTarget = shotTarget;
                const damage = this.getDefenderDamage(defender);
                if (defender.projectile === "projectile-firebomb") {
                  this.fireGrenade(defender, shotTarget, damage, 0, defender.slowDuration || 0, FIREBOMB_FLIGHT_TIME_SCALE);
                } else {
                  this.fireBullet(defender, shotTarget, damage, defender.speed, defender.pierce || 0, defender.critChance || BASE_CRIT_CHANCE);
                }
                if (defender.rocketEvery > 0 && !grenadeCountedForBurst) {
                  grenadeCountedForBurst = true;
                  defender.shotsSinceRocket += 1;
                  if (defender.shotsSinceRocket >= defender.rocketEvery) {
                    defender.shotsSinceRocket = 0;
                    grenadeReadyForBurst = true;
                  }
                }
                if (grenadeReadyForBurst && !grenadeFiredForBurst) {
                  grenadeFiredForBurst = true;
                  this.fireGrenade(
                    defender,
                    shotTarget,
                    damage * 1.35 * (defender.rocketDamageBoost || 1),
                    68 * (defender.rocketRadiusBoost || 1),
                    0,
                    RIFLE_GRENADE_FLIGHT_TIME_SCALE
                  );
                }
              });
            }
          }
        }
      });
    }

    createEngineerTurret(engineer) {
      if (!this.turrets) {
        this.turrets = [];
      }
      this.turrets = this.turrets.filter((turret) => turret && !turret.container?.destroyed);
      const existingTurret = this.turrets[0];
      if (existingTurret) {
        existingTurret.damageScale *= 1.14;
        existingTurret.rate = Math.max(0.34, existingTurret.rate * 0.9);
        if (existingTurret.container && !existingTurret.container.destroyed) {
          this.tweens.add({
            targets: existingTurret.container,
            scale: 1.12,
            yoyo: true,
            duration: 130,
            ease: "Sine.easeOut"
          });
        }
        this.showToast(SchoolI18n.t("skill.h-turret.titleOwned"), SKILL_ACCENTS.engineer);
        return;
      }

      const position = {
        x: clamp(engineer?.x || 270, this.bounds.left + 58, this.bounds.right - 58),
        y: clamp(this.bounds.barricade + 38, this.bounds.zombieFootLine + 24, this.bounds.survivorLine - 24)
      };
      const container = this.trackTransient(this.add.container(position.x, position.y).setDepth(228));
      const shadow = this.add.ellipse(0, 13, 44, 14, 0x000000, 0.34);
      const turretBase = this.add.image(0, 0, "engineer-turret-base")
        .setOrigin(0.5, 0.58);
      const turretHead = this.add.image(0, 0, "engineer-turret-head")
        .setOrigin(0.5, 0.5);
      turretBase.setDisplaySize(75, 75);
      turretHead.setDisplaySize(75, 75);
      container.add([shadow, turretBase, turretHead]);
      container.setAlpha(0).setScale(0.72);
      this.tweens.add({
        targets: container,
        alpha: 1,
        scale: 1,
        duration: 180,
        ease: "Back.easeOut"
      });

      const rifleDefender = this.getDefenderById("b");

      const turret = {
        x: position.x,
        y: position.y,
        container,
        turretBase,
        turretSprite: turretHead,
        projectile: "projectile-rifle",
        speed: rifleDefender?.speed || 1800,
        rate: Math.max(0.46, 0.82 / (engineer?.turretRateBoost || 1)),
        timer: rand(0.18, 0.5),
        damageScale: 0.34 * (engineer?.turretDamageBoost || 1),
        pierce: 0,
        critChance: 0.05,
        critMultiplier: 1.35,
        aim: { pivot: [0, -6], reach: 21 },
        sprite: null
      };
      this.turrets.push(turret);
      this.createScreenPulse(SKILL_ACCENTS.engineer);
    }

    updateTurrets(dt) {
      if (!this.turrets?.length) {
        return;
      }
      for (let i = this.turrets.length - 1; i >= 0; i -= 1) {
        const turret = this.turrets[i];
        if (!turret || turret.container?.destroyed) {
          this.turrets.splice(i, 1);
          continue;
        }
        turret.timer -= dt;
        const target = this.findTarget(turret.x, 999, null, this.bounds.autoEngageTop);
        if (target && turret.turretSprite && !turret.turretSprite.destroyed) {
          const targetAngle = Math.atan2(target.y - (turret.y - 12), target.x - turret.x);
          turret.turretSprite
            .setDisplaySize(75, 75)
            .setRotation(targetAngle + Math.PI / 2);
        }
        if (turret.timer > 0 || !target) {
          continue;
        }
        turret.timer = turret.rate * rand(0.82, 1.18);
        this.fireBullet(
          turret,
          target,
          this.damage * CHARACTER_DAMAGE_MULTIPLIER * turret.damageScale,
          turret.speed,
          turret.pierce || 0,
          turret.critChance || 0
        );
      }
    }

    reinforceBarbedWire(engineer) {
      const y = this.bounds.zombieFootLine + 10;
      if (!this.barbedWire) {
        const wire = this.textures.exists("barbed-wire")
          ? this.trackTransient(this.add.image(270, y, "barbed-wire")
            .setOrigin(0.5, 0.54)
            .setDepth(226)
            .setAlpha(0.97))
          : this.trackTransient(this.add.graphics().setDepth(226));
        const glow = this.trackTransient(this.add.rectangle(270, y + 8, 506, 70, 0x3d4a4f, 0.18).setDepth(225));
        this.barbedWire = {
          y,
          damageScale: engineer?.wireDamageBoost || 1,
          slowDuration: Math.min(BARBED_WIRE_MAX_SLOW_DURATION, BARBED_WIRE_SLOW_DURATION * (engineer?.wireSlowBoost || 1)),
          hitHalfHeight: BARBED_WIRE_HIT_HALF_HEIGHT,
          objects: [wire, glow]
        };
        this.drawBarbedWire();
      } else {
        this.barbedWire.damageScale *= 1.12;
        this.barbedWire.slowDuration = Math.min(
          BARBED_WIRE_MAX_SLOW_DURATION,
          this.barbedWire.slowDuration + BARBED_WIRE_REINFORCE_SLOW_GAIN
        );
        this.drawBarbedWire();
        this.barbedWire.objects.forEach((object) => {
          if (object && !object.destroyed) {
            this.tweens.add({
              targets: object,
              alpha: 0.96,
              yoyo: true,
              duration: 140,
              ease: "Sine.easeOut"
            });
          }
        });
      }
      this.createScreenPulse(SKILL_ACCENTS.engineer);
    }

    drawBarbedWire() {
      const wire = this.barbedWire?.objects?.[0];
      if (!wire || wire.destroyed) {
        return;
      }
      const y = this.barbedWire.y;
      if (this.textures.exists("barbed-wire") && typeof wire.setDisplaySize === "function") {
        const width = 510;
        const source = this.textures.get("barbed-wire").getSourceImage();
        wire
          .setPosition(270, y)
          .setDisplaySize(width, width * source.height / source.width);
        return;
      }
      if (typeof wire.clear !== "function") {
        return;
      }
      wire.clear();
      wire.lineStyle(4, 0x11181c, 0.86);
      wire.beginPath();
      wire.moveTo(24, y);
      wire.lineTo(516, y);
      wire.strokePath();
      wire.lineStyle(2, SKILL_ACCENTS.engineer, 0.9);
      for (let x = 32; x < 512; x += 24) {
        wire.beginPath();
        wire.moveTo(x, y - 10);
        wire.lineTo(x + 16, y + 10);
        wire.moveTo(x + 16, y - 10);
        wire.lineTo(x, y + 10);
        wire.strokePath();
      }
    }

    applyBarbedWireToZombie(zombie, dt) {
      if (!this.barbedWire || !zombie?.active) {
        return;
      }
      zombie.wireCooldown = Math.max(0, (zombie.wireCooldown || 0) - dt);
      const footY = this.getZombieFootPoint(zombie).y;
      if (Math.abs(footY - this.barbedWire.y) > (this.barbedWire.hitHalfHeight || BARBED_WIRE_HIT_HALF_HEIGHT) || zombie.wireCooldown > 0) {
        return;
      }
      zombie.wireCooldown = 0.58;
      const wireImpactPoint = {
        x: zombie.x + rand(-8, 8),
        y: footY - Math.max(8, (zombie.displayH || 170) * 0.08),
        angle: zombie.x < GAME_WIDTH * 0.5 ? Math.PI * 0.08 : Math.PI * 0.92
      };
      this.createWorldHitEffect(
        wireImpactPoint.x,
        wireImpactPoint.y,
        "projectile-nail",
        wireImpactPoint.angle,
        this.getZombieEffectScale(zombie) * 0.78
      );
      this.damageZombie(
        zombie,
        BARBED_WIRE_DAMAGE_PER_TICK * this.barbedWire.damageScale,
        0,
        "projectile-nail",
        1,
        wireImpactPoint,
        { applyKnockback: false, showHitEffect: false }
      );
      if (zombie.active) {
        zombie.slowTimer = Math.max(zombie.slowTimer || 0, this.barbedWire.slowDuration);
      }
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

      let previousTarget = target;
      for (let i = 0; i < count; i += 1) {
        const shotOffset = (i - (count - 1) / 2) * 12;
        const preferredX = (hasFocus ? this.focusPoint.x : 270) + shotOffset * 2.5;
        const radius = hasFocus ? 210 : 999;
        this.scheduleRunDelay(i * shotDelay, () => {
          if (!player.recruited) {
            return;
          }
          const shotTarget = this.findChainShotTarget(preferredX, radius, previousTarget, minTargetY);
          if (!shotTarget) {
            return;
          }
          previousTarget = shotTarget;
          const previousShotOffset = player.shotOffset;
          const previousAngleOffset = player.angleOffset;
          player.shotOffset = count > 1 ? 0 : shotOffset;
          player.angleOffset = 0;
          try {
            this.fireBullet(
              player,
              shotTarget,
              this.getDefenderDamage(player),
              player.speed,
              player.pierce || 0,
              player.critChance || BASE_CRIT_CHANCE
            );
          } finally {
            if (previousShotOffset === undefined) {
              delete player.shotOffset;
            } else {
              player.shotOffset = previousShotOffset;
            }
            if (previousAngleOffset === undefined) {
              delete player.angleOffset;
            } else {
              player.angleOffset = previousAngleOffset;
            }
          }
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

    isChainShotTargetValid(target, preferX, radius, minY) {
      if (!target || !target.active || target.hp <= 0 || target.y < minY) {
        return false;
      }
      return radius === 999 || Math.abs(target.x - preferX) <= radius;
    }

    findChainShotTarget(preferX, radius, previousTarget, minY) {
      const lowestTarget = this.findTarget(preferX, radius, null, minY);
      if (!lowestTarget) {
        return this.isChainShotTargetValid(previousTarget, preferX, radius, minY) ? previousTarget : null;
      }
      if (
        this.isChainShotTargetValid(previousTarget, preferX, radius, minY)
        && Math.abs(previousTarget.y - lowestTarget.y) <= 8
      ) {
        return previousTarget;
      }
      return lowestTarget;
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
      return this.damage * CHARACTER_DAMAGE_MULTIPLIER * (defender.damageScale || 1) * (defender.damageBoost || 1);
    }

    getChainShotDelay(defender) {
      if (defender.burstDelay) {
        return defender.burstDelay;
      }
      return scaleWeaponInterval(WEAPON_CHAIN_SHOT_DELAYS[defender.projectile] || DEFAULT_CHAIN_SHOT_DELAY);
    }

    getDefenderById(id) {
      return this.defenders.find((defender) => defender.id === id);
    }

    getGrenadeArcHeight(distance) {
      return clamp(distance * 0.34, 88, 190);
    }

    getGrenadeArcPoint(startX, startY, endX, endY, arcHeight, progress) {
      const t = clamp(progress, 0, 1);
      const groundX = startX + (endX - startX) * t;
      const groundY = startY + (endY - startY) * t;
      const lift = Math.sin(Math.PI * t) * arcHeight;
      return {
        x: groundX,
        y: groundY - lift,
        groundX,
        groundY
      };
    }

    getGrenadeArcAngle(startX, startY, endX, endY, arcHeight, progress) {
      const t = clamp(progress, 0, 1);
      const dx = endX - startX;
      const dy = endY - startY - Math.PI * arcHeight * Math.cos(Math.PI * t);
      return Math.atan2(dy, dx);
    }

    fireGrenade(defender, target, damage, radius = 68, slowDuration = 0, flightTimeScale = 1) {
      if (!defender || !target || !target.active) {
        return;
      }
      const isFirebomb = defender.projectile === "projectile-firebomb";
      const projectileKey = isFirebomb ? "projectile-firebomb" : "projectile-grenade";
      const initialAimPoint = this.getZombieHitPoint(target, isFirebomb ? "projectile-firebomb" : "projectile-rocket");
      const initialPose = this.getAttackPose(defender, target);
      const initialMuzzle = this.getDefenderMuzzle(defender, initialPose);
      const initialDistance = Phaser.Math.Distance.Between(initialMuzzle.x, initialMuzzle.y, initialAimPoint.x, initialAimPoint.y);
      const initialArcHeight = this.getGrenadeArcHeight(initialDistance);
      const initialAngle = this.getGrenadeArcAngle(
        initialMuzzle.x,
        initialMuzzle.y,
        initialAimPoint.x,
        initialAimPoint.y,
        initialArcHeight,
        0
      );
      const pose = getShotAimPoseKey(initialAngle);
      this.startDefenderAttackAnimation(defender, pose, () => {
        if (this.disposed || this.mode !== "playing" || !defender.recruited || !target.active || target.hp <= 0) {
          return;
        }
        const aimPoint = this.getZombieHitPoint(target, isFirebomb ? "projectile-firebomb" : "projectile-rocket");
        const aimOffsetX = aimPoint.x - target.x;
        const aimOffsetY = aimPoint.y - target.y;
        let impactX = aimPoint.x;
        let impactY = aimPoint.y;
        const muzzle = this.getDefenderMuzzle(defender, pose);
        const startX = muzzle.x;
        const startY = muzzle.y;
        const distance = Phaser.Math.Distance.Between(startX, startY, aimPoint.x, aimPoint.y);
        const arcHeight = this.getGrenadeArcHeight(distance);
        const launchAngle = this.getGrenadeArcAngle(startX, startY, aimPoint.x, aimPoint.y, arcHeight, 0);
        const projectileRotationOffset = isFirebomb ? Math.PI : Math.PI / 2;
        const sprite = this.trackTransient(this.add.image(startX, startY, projectileKey)
          // Anchor a Molotov at its neck instead of its image centre so the
          // bottle leaves the thrower's hand rather than hovering above it.
          .setOrigin(isFirebomb ? 0.8 : 0.5, 0.5)
          .setScale(PROJECTILE_SCALES[projectileKey] || PROJECTILE_SCALES["projectile-grenade"])
          .setRotation(launchAngle + projectileRotationOffset)
          .setDepth(192));
        const shadow = this.trackTransient(this.add.ellipse(startX, startY + 10, 18, 7, 0x000000, 0.32)
          .setDepth(78));
        sprite.arcT = 0;
        const duration = clamp(distance / 1.55, 330, 620) * flightTimeScale;
        this.createMuzzle(startX, startY, launchAngle, defender.projectile);
        this.playSfx(isFirebomb ? "firebomb_fire" : "grenade_fire", isFirebomb ? 0.74 : 0.72);
        this.tweens.add({
          targets: sprite,
          arcT: 1,
          duration,
          ease: "Sine.easeInOut",
          onUpdate: () => {
            if (this.disposed || sprite.destroyed) {
              return;
            }
            const t = sprite.arcT;
            if (target.active && target.hp > 0) {
              impactX = target.x + aimOffsetX;
              impactY = target.y + aimOffsetY;
            }
            const arcPoint = this.getGrenadeArcPoint(startX, startY, impactX, impactY, arcHeight, t);
            const arcAngle = this.getGrenadeArcAngle(startX, startY, impactX, impactY, arcHeight, t);
            const firebombTumble = isFirebomb ? Math.sin(t * Math.PI * 2) * 0.18 : 0;
            const flightDepth = 188 + arcPoint.groundY / 6;
            sprite
              .setPosition(arcPoint.x, arcPoint.y)
              .setRotation(arcAngle + projectileRotationOffset + firebombTumble)
              .setScale((PROJECTILE_SCALES[projectileKey] || PROJECTILE_SCALES["projectile-grenade"]) * (1 + Math.sin(Math.PI * t) * 0.16))
              .setDepth(flightDepth);
            if (shadow && !shadow.destroyed) {
              shadow
                .setPosition(arcPoint.groundX, arcPoint.groundY + 7)
                .setScale(0.72 + t * 0.42, 0.72 + t * 0.2)
                .setAlpha(0.1 + t * 0.24);
            }
          },
          onComplete: () => {
            if (!this.disposed && this.mode === "playing" && isFirebomb) {
              const hitTarget = target.active && target.hp > 0
                ? target
                : this.findTarget(impactX, 92, null, this.bounds.autoEngageTop);
              if (hitTarget) {
                this.createFirebombHitEffect(hitTarget, false, {
                  x: impactX,
                  y: impactY,
                  angle: Math.atan2(impactY - startY, impactX - startX)
                });
              }
              const fireZonePoint = hitTarget
                ? this.getZombieFootPoint(hitTarget)
                : { x: impactX, y: impactY };
              if (defender.fireZoneRadius > 0 && defender.fireZoneDuration > 0 && defender.fireZoneDamageScale > 0) {
                this.createFireZone(
                  fireZonePoint.x,
                  fireZonePoint.y,
                  defender.fireZoneRadius,
                  damage * defender.fireZoneDamageScale,
                  defender.fireZoneDuration,
                  slowDuration
                );
              }
            } else if (!this.disposed && this.mode === "playing") {
              this.createExplosion(impactX, impactY, radius, damage, slowDuration);
            }
            this.destroyTransientObject(sprite, false);
            this.destroyTransientObject(shadow, false);
          }
        });
      });
    }

    fireBullet(defender, target, damage, speed, pierce, critChance = BASE_CRIT_CHANCE) {
      if (!target || !target.active) {
        return;
      }
      const aimPoint = this.getZombieHitPoint(target, defender.projectile);
      const tx = aimPoint.x;
      const ty = aimPoint.y;
      const shotOffset = defender.shotOffset || 0;
      const angleOffset = defender.angleOffset || 0;
      const initialPose = this.getAttackPose(defender, target);
      const initialMuzzle = this.getDefenderMuzzle(defender, initialPose);
      const initialX = initialMuzzle.x + shotOffset;
      const initialAngle = Math.atan2(ty - initialMuzzle.y, tx - initialX) + angleOffset;
      const pose = CHARACTER_ATTACK_DIRECTION_LOCKS.has(defender.id)
        ? initialPose
        : getShotAimPoseKey(initialAngle);
      this.startDefenderAttackAnimation(defender, pose, () => {
        if (this.disposed || this.mode !== "playing" || !defender.recruited || !target.active || target.hp <= 0) {
          return;
        }
        const releaseAimPoint = this.getZombieHitPoint(target, defender.projectile);
        const releaseTx = releaseAimPoint.x;
        const releaseTy = releaseAimPoint.y;
        // Recoil is already drawn into the attack frames. Moving the entire
        // sprite here makes planted feet slide, especially during rifle bursts.
        const muzzle = this.getDefenderMuzzle(defender, pose);
        const x = muzzle.x + shotOffset;
        const y = muzzle.y;
        const angle = Math.atan2(releaseTy - y, releaseTx - x) + angleOffset;
        const usesHorizontalProjectile = defender.projectile === "projectile-nail"
          || defender.projectile === "projectile-arrow";
        const sprite = this.add.image(x, y, defender.projectile)
          .setOrigin(0.5, usesHorizontalProjectile ? 0.5 : (PROJECTILE_TAIL_ORIGINS[defender.projectile] ?? 1))
          .setScale(PROJECTILE_SCALES[defender.projectile] || 0.78)
          .setRotation(angle + (usesHorizontalProjectile ? 0 : Math.PI / 2))
          .setDepth(190);
        const isRocket = defender.projectile === "projectile-rocket";
        const launchSpeed = isRocket ? speed * ROCKET_ACCELERATION.startScale : speed;
        const visualEffects = defender.projectile === "projectile-arrow"
          ? this.createArrowProjectileTrail(sprite, angle)
          : defender.projectile === "projectile-sniper"
            ? this.createSniperBulletGlow(sprite, angle)
            : isRocket
              ? this.createRocketProjectileGlow(sprite, angle)
              : defender.projectile === "projectile-shock"
                ? this.createShockProjectileLink(x, y, sprite, angle)
                : null;
        this.bullets.push({
          sprite,
          visualEffects,
          angle,
          hitOffset: usesHorizontalProjectile ? sprite.displayWidth * 0.48 : sprite.displayHeight * 0.72,
          damage,
          vx: Math.cos(angle) * launchSpeed,
          vy: Math.sin(angle) * launchSpeed,
          life: defender.projectile === "projectile-rocket" ? 1.25 : defender.projectile === "projectile-sniper" ? 1.05 : 1.55,
          age: 0,
          speed,
          currentSpeed: launchSpeed,
          rocketSpeedStart: isRocket ? speed * ROCKET_ACCELERATION.startScale : null,
          rocketSpeedEnd: isRocket ? speed * ROCKET_ACCELERATION.endScale : null,
          rocketRampDuration: isRocket ? ROCKET_ACCELERATION.rampDuration : null,
          pierce,
          critChance,
          critMultiplier: defender.critMultiplier || DEFAULT_CRIT_MULTIPLIER,
          projectile: defender.projectile,
          splashRadius: (defender.splashRadius || 0) * (defender.splashRadiusBoost || 1),
          splashDamageScale: (defender.splashDamageScale || 0) * (defender.splashDamageBoost || 1),
          markDuration: defender.markDuration || 0,
          markDamageBonus: defender.markDamageBonus || 0,
          slowDuration: defender.slowDuration || 0,
          stunDuration: defender.stunDuration || 0,
          fireZoneRadius: defender.fireZoneRadius || 0,
          fireZoneDuration: defender.fireZoneDuration || 0,
          fireZoneDamageScale: defender.fireZoneDamageScale || 0,
          chainJumps: defender.chainJumps || 0,
          chainRadius: defender.chainRadius || 0,
          chainDamageScale: defender.chainDamageScale || 0,
          aimTarget: target,
          aimOffsetX: releaseAimPoint.x - target.x,
          aimOffsetY: releaseAimPoint.y - target.y,
          hitTargets: new Set(),
          trailTimer: 0
        });
        const muzzleFlash = this.createMuzzle(x, y, muzzle.effectAngle ?? angle, defender.projectile);
        defender.muzzleFlash = muzzleFlash ? { flash: muzzleFlash, pose, shotOffset } : null;
        this.playWeaponSfx(defender.projectile);
      });
    }

    createArrowProjectileTrail(sprite, angle) {
      const tailX = sprite.x - Math.cos(angle) * 14;
      const tailY = sprite.y - Math.sin(angle) * 14;
      const trail = this.add.ellipse(tailX, tailY, 74, 8, 0xffcf57, 0.24)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(angle)
        .setDepth(188.7);
      const core = this.add.ellipse(tailX + Math.cos(angle) * 9, tailY + Math.sin(angle) * 9, 42, 3, 0xffffff, 0.34)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(angle)
        .setDepth(189.1);
      return { type: "arrow", trail, core };
    }

    createSniperBulletGlow(sprite, angle) {
      const glow = this.add.ellipse(sprite.x, sprite.y, 34, 8, 0x8ff8ff, 0.24)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(angle)
        .setDepth(189.5);
      const trail = this.add.ellipse(sprite.x, sprite.y, 46, 5, 0x4fd8ff, 0.16)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(angle)
        .setDepth(189);
      return { type: "sniper", glow, trail };
    }

    createRocketProjectileGlow(sprite, angle) {
      const tailX = sprite.x - Math.cos(angle) * 5;
      const tailY = sprite.y - Math.sin(angle) * 5;
      const glow = this.add.ellipse(tailX, tailY, 36, 14, 0xff7a22, 0.22)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(angle)
        .setDepth(188);
      const flame = this.add.ellipse(tailX, tailY, 20, 8, 0xfff0a0, 0.72)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(angle)
        .setDepth(188.5);
      return { type: "rocket", glow, flame };
    }

    createShockProjectileLink(sourceX, sourceY, sprite, angle) {
      const link = this.add.graphics()
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(189.2);
      return {
        type: "shock",
        link,
        sourceX,
        sourceY,
        phase: rand(0, Math.PI * 2),
        angle
      };
    }

    updateBulletVisuals(bullet) {
      if (!bullet?.visualEffects || !bullet.sprite || bullet.sprite.destroyed) {
        return;
      }
      if (bullet.visualEffects.type === "arrow") {
        const { trail, core } = bullet.visualEffects;
        const tailX = bullet.sprite.x - Math.cos(bullet.angle) * 14;
        const tailY = bullet.sprite.y - Math.sin(bullet.angle) * 14;
        const depth = (bullet.sprite.depth || 190) - 1.2;
        const pulse = 0.9 + Math.sin((this.elapsed || 0) * 28) * 0.08;
        if (trail && !trail.destroyed) {
          trail
            .setPosition(tailX - Math.cos(bullet.angle) * 18, tailY - Math.sin(bullet.angle) * 18)
            .setRotation(bullet.angle)
            .setScale(pulse, 0.92)
            .setDepth(depth);
        }
        if (core && !core.destroyed) {
          core
            .setPosition(tailX + Math.cos(bullet.angle) * 4, tailY + Math.sin(bullet.angle) * 4)
            .setRotation(bullet.angle)
            .setScale(0.95 + pulse * 0.08, 1)
            .setDepth(depth + 0.4);
        }
        return;
      }
      if (bullet.visualEffects.type === "rocket") {
        const { glow, flame } = bullet.visualEffects;
        const tailX = bullet.sprite.x - Math.cos(bullet.angle) * 7;
        const tailY = bullet.sprite.y - Math.sin(bullet.angle) * 7;
        const depth = (bullet.sprite.depth || 190) - 1.5;
        const speedPulse = 0.72 + clamp(bullet.speedProgress || 0, 0, 1) * 0.38;
        if (glow && !glow.destroyed) {
          glow
            .setPosition(tailX - Math.cos(bullet.angle) * 8, tailY - Math.sin(bullet.angle) * 8)
            .setRotation(bullet.angle)
            .setScale(speedPulse, 0.86 + speedPulse * 0.18)
            .setDepth(depth);
        }
        if (flame && !flame.destroyed) {
          const pulse = 0.9 + Math.sin((this.elapsed || 0) * 34) * 0.12;
          flame
            .setPosition(tailX - Math.cos(bullet.angle) * 4, tailY - Math.sin(bullet.angle) * 4)
            .setRotation(bullet.angle)
            .setScale(pulse * speedPulse, 0.74 + pulse * 0.16)
            .setDepth(depth + 0.5);
        }
        return;
      }
      if (bullet.visualEffects.type === "shock") {
        this.drawShockProjectileLink(bullet);
        return;
      }
      const { glow, trail } = bullet.visualEffects;
      const tipX = bullet.sprite.x + Math.cos(bullet.angle) * bullet.hitOffset * 0.48;
      const tipY = bullet.sprite.y + Math.sin(bullet.angle) * bullet.hitOffset * 0.48;
      if (glow && !glow.destroyed) {
        glow
          .setPosition(tipX, tipY)
          .setRotation(bullet.angle)
          .setDepth((bullet.sprite.depth || 190) - 0.5);
      }
      if (trail && !trail.destroyed) {
        trail
          .setPosition(tipX - Math.cos(bullet.angle) * 22, tipY - Math.sin(bullet.angle) * 22)
          .setRotation(bullet.angle)
          .setDepth((bullet.sprite.depth || 190) - 1);
      }
    }

    spawnRocketTrailParticles(bullet, dt) {
      if (!bullet?.sprite || bullet.sprite.destroyed || bullet.projectile !== "projectile-rocket") {
        return;
      }
      bullet.trailTimer = (bullet.trailTimer || 0) - dt;
      if (bullet.trailTimer > 0) {
        return;
      }
      bullet.trailTimer = 0.026;
      const backX = Math.cos(bullet.angle);
      const backY = Math.sin(bullet.angle);
      const sideX = -Math.sin(bullet.angle);
      const sideY = Math.cos(bullet.angle);
      const tailX = bullet.sprite.x - backX * rand(4, 9) + sideX * rand(-2.5, 2.5);
      const tailY = bullet.sprite.y - backY * rand(4, 9) + sideY * rand(-2.5, 2.5);
      const baseDepth = (bullet.sprite.depth || 190) - 2;

      const flame = this.trackTransient(this.add.ellipse(tailX, tailY, rand(12, 19), rand(5, 9), 0xff9b2f, 0.66)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(bullet.angle)
        .setDepth(baseDepth + 0.4));
      this.tweens.add({
        targets: flame,
        x: tailX - backX * rand(18, 28) + sideX * rand(-4, 4),
        y: tailY - backY * rand(18, 28) + sideY * rand(-4, 4),
        scaleX: 0.35,
        scaleY: 0.28,
        alpha: 0,
        duration: 170,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(flame, false)
      });

      const smoke = this.trackTransient(this.add.circle(
        tailX - backX * 8 + sideX * rand(-3, 3),
        tailY - backY * 8 + sideY * rand(-3, 3),
        rand(4, 7),
        0x5f5a52,
        0.2
      ).setDepth(baseDepth));
      this.tweens.add({
        targets: smoke,
        x: smoke.x - backX * rand(24, 40) + sideX * rand(-8, 8),
        y: smoke.y - backY * rand(20, 34) - rand(2, 8),
        scale: rand(2.0, 3.0),
        alpha: 0,
        duration: rand(360, 520),
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(smoke, false)
      });
    }

    drawShockProjectileLink(bullet) {
      const effect = bullet.visualEffects;
      const link = effect?.link;
      if (!link || link.destroyed) {
        return;
      }
      const start = { x: effect.sourceX, y: effect.sourceY };
      const backX = Math.cos(bullet.angle);
      const backY = Math.sin(bullet.angle);
      const sideX = -Math.sin(bullet.angle);
      const sideY = Math.cos(bullet.angle);
      const end = {
        x: bullet.sprite.x - backX * 20,
        y: bullet.sprite.y - backY * 20
      };
      const segments = 6;
      const points = [];
      const pulse = (this.elapsed || 0) * 46 + (effect.phase || 0);
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const jitter = i === 0 || i === segments
          ? 0
          : Math.sin(pulse + i * 1.7) * 8 + rand(-3, 3);
        points.push({
          x: start.x + (end.x - start.x) * t + sideX * jitter,
          y: start.y + (end.y - start.y) * t + sideY * jitter
        });
      }
      const drawPath = (width, color, alpha) => {
        link.lineStyle(width, color, alpha);
        link.beginPath();
        link.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
          link.lineTo(points[i].x, points[i].y);
        }
        link.strokePath();
      };
      link.clear();
      drawPath(9, SHOCK_EFFECT_OUTER_COLOR, 0.18);
      drawPath(4, SHOCK_EFFECT_OUTER_COLOR, 0.52);
      drawPath(1.6, 0xffffff, 0.9);
      link.fillStyle(0xffffff, 0.55);
      link.fillCircle(start.x, start.y, 2.4);
      link.fillStyle(SHOCK_EFFECT_OUTER_COLOR, 0.48);
      link.fillCircle(end.x, end.y, 4.2);
      link.setDepth((bullet.sprite.depth || 190) - 0.8);
    }

    destroyBullet(bullet) {
      if (!bullet) {
        return;
      }
      if (bullet.visualEffects) {
        Object.values(bullet.visualEffects).forEach((effect) => {
          if (effect && typeof effect.destroy === "function") {
            this.destroyGameObject(effect);
          }
        });
      }
      this.destroyGameObject(bullet.sprite);
    }

    createMuzzle(x, y, angle, projectile) {
      if (["projectile-shock", "projectile-firebomb", "projectile-nail"].includes(projectile)) {
        this.createWeaponDischarge(x, y, angle, projectile);
        return;
      }
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
      const core = this.trackTransient(this.add.circle(x, y, effect.width * MUZZLE_CORE.radiusRatio, MUZZLE_CORE.color, MUZZLE_CORE.alpha)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(239));
      this.tweens.add({
        targets: core,
        scale: MUZZLE_CORE.scalePeak,
        alpha: 0,
        duration: effect.duration * MUZZLE_CORE.durationRatio,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(core, false)
      });
      const flash = this.trackTransient(this.add.image(x, y, effect.texture)
        .setOrigin(effect.originX, 0.5)
        .setDisplaySize(effect.width, displayHeight)
        .setRotation(angle)
        .setBlendMode(Phaser.BlendModes.ADD)
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
      flash.muzzleCore = core;
      return flash;
    }

    createWeaponDischarge(x, y, angle, projectile) {
      const electric = projectile === "projectile-shock";
      const ember = projectile === "projectile-firebomb";
      const length = electric ? 28 : ember ? 9 : 13;
      const flash = this.trackTransient(this.add.graphics()
        .setPosition(x, y)
        .setRotation(angle)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(238));
      if (electric) {
        const points = [[0, 0], [7, -4], [11, 2], [19, -3], [length, 0]];
        for (const [width, color, alpha] of [[5, SHOCK_EFFECT_OUTER_COLOR, 0.65], [1.7, 0xeeffff, 1]]) {
          flash.lineStyle(width, color, alpha);
          flash.beginPath();
          flash.moveTo(points[0][0], points[0][1]);
          points.slice(1).forEach(([px, py]) => flash.lineTo(px, py));
          flash.strokePath();
        }
        flash.fillStyle(0xe8ffff, 0.95).fillCircle(0, 0, 3);
      } else {
        flash.lineStyle(ember ? 2 : 1.3, ember ? 0xffa349 : 0xffdda1, 0.9);
        for (const side of [-1, 1]) {
          flash.beginPath();
          flash.moveTo(2, side);
          flash.lineTo(length, side * (ember ? 3 : 4));
          flash.strokePath();
        }
        flash.fillStyle(0xffedb9, 0.9).fillCircle(0, 0, ember ? 2.3 : 1.5);
      }
      this.tweens.add({
        targets: flash,
        scale: electric ? 1.15 : 1.35,
        alpha: 0,
        duration: electric ? 105 : ember ? 90 : 65,
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
        const previousTip = this.getBulletTip(bullet);
        bullet.life -= dt;
        bullet.age = (bullet.age || 0) + dt;
        this.updateBulletMotion(bullet);
        bullet.sprite.x += bullet.vx * dt;
        bullet.sprite.y += bullet.vy * dt;
        bullet.previousTip = previousTip;
        this.updateBulletVisuals(bullet);
        this.spawnRocketTrailParticles(bullet, dt);

        const shouldRemove = bullet.life <= 0 || bullet.sprite.x < -30 || bullet.sprite.x > 570 || bullet.sprite.y < -60 || bullet.sprite.y > 980;
        const hit = this.findBulletHit(bullet);
        if (hit) {
          const zombie = hit.zombie;
          const impactPoint = hit.point;
          const isFirebombImpact = bullet.projectile === "projectile-firebomb";
          bullet.hitTargets.add(zombie);
          if (EMBEDDED_PROJECTILES[bullet.projectile]) {
            this.createEmbeddedProjectile(zombie, bullet, impactPoint);
          }
          if (!isFirebombImpact) {
            this.damageZombie(zombie, bullet.damage, bullet.critChance, bullet.projectile, bullet.critMultiplier, impactPoint);
            if (bullet.slowDuration > 0 && zombie.active) {
              zombie.slowTimer = Math.max(zombie.slowTimer || 0, bullet.slowDuration);
            }
            if (bullet.stunDuration > 0 && zombie.active) {
              this.applyZombieStun(zombie, bullet.stunDuration);
            }
            if (bullet.markDuration > 0 && bullet.markDamageBonus > 0 && zombie.active) {
              this.applyWeakMark(zombie, bullet.markDuration, bullet.markDamageBonus);
            }
          }
          if (bullet.fireZoneRadius > 0 && bullet.fireZoneDuration > 0 && bullet.fireZoneDamageScale > 0) {
            const fireZonePoint = this.getZombieFootPoint(zombie);
            this.createFireZone(
              fireZonePoint.x,
              fireZonePoint.y,
              bullet.fireZoneRadius,
              bullet.damage * bullet.fireZoneDamageScale,
              bullet.fireZoneDuration,
              bullet.slowDuration
            );
          }
          if (bullet.chainJumps > 0 && bullet.chainRadius > 0 && bullet.chainDamageScale > 0) {
            this.createShockChain(zombie, impactPoint, bullet);
          }
          if (bullet.splashRadius > 0) {
            this.createExplosion(
              impactPoint.x,
              impactPoint.y,
              bullet.splashRadius,
              bullet.damage * (bullet.splashDamageScale || 0.75),
              bullet.slowDuration,
              { showCenterEffect: false }
            );
          }
          if (bullet.pierce > 0 && !shouldRemove) {
            bullet.pierce -= 1;
          } else {
            this.destroyBullet(bullet);
            this.bullets.splice(i, 1);
          }
        } else if (shouldRemove) {
          this.destroyBullet(bullet);
          this.bullets.splice(i, 1);
        }
      }
    }

    updateBulletMotion(bullet) {
      if (!bullet || bullet.projectile !== "projectile-rocket") {
        return;
      }
      const rampDuration = bullet.rocketRampDuration || ROCKET_ACCELERATION.rampDuration;
      const progress = clamp((bullet.age || 0) / rampDuration, 0, 1);
      const eased = progress * progress;
      const startSpeed = bullet.rocketSpeedStart || bullet.speed * ROCKET_ACCELERATION.startScale;
      const endSpeed = bullet.rocketSpeedEnd || bullet.speed * ROCKET_ACCELERATION.endScale;
      bullet.speedProgress = progress;
      bullet.currentSpeed = startSpeed + (endSpeed - startSpeed) * eased;
      bullet.vx = Math.cos(bullet.angle) * bullet.currentSpeed;
      bullet.vy = Math.sin(bullet.angle) * bullet.currentSpeed;
    }

    createFireZone(x, y, radius, damagePerTick, duration, slowDuration = 0) {
      if (!this.fireZones) {
        this.fireZones = [];
      }
      const damageDuration = Math.max(0.01, duration);
      const visualDuration = damageDuration * FIRE_ZONE_VISUAL_DURATION_MULTIPLIER;
      const visualRadius = radius * FIRE_ZONE_VISUAL_SIZE_MULTIPLIER;
      const zoneX = clamp(x, this.bounds.left + 10, this.bounds.right - 10);
      const zoneY = clamp(y, this.bounds.top + 12, this.bounds.barricade - 24);
      const glow = this.trackTransient(this.add.ellipse(zoneX, zoneY, visualRadius * 1.82, visualRadius * 0.78, 0xff5b22, 0.18)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(67 + zoneY / 15));
      const firePatch = this.trackTransient(this.add.sprite(zoneX, zoneY, "effect-fire-zone-sheet", 0)
        .setOrigin(0.5, 0.62)
        .setDisplaySize(visualRadius * 2.25, visualRadius * 1.22)
        .setAlpha(0.92)
        .setDepth(70 + zoneY / 15));
      const embers = [];
      for (let i = 0; i < 4; i += 1) {
        const ember = this.trackTransient(this.add.circle(
          zoneX + rand(-visualRadius * 0.62, visualRadius * 0.62),
          zoneY + rand(-visualRadius * 0.2, visualRadius * 0.18),
          rand(3, 6),
          choose([0xfff0a0, 0xff9a36, 0xff5330]),
          rand(0.48, 0.78)
        )
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(70 + zoneY / 15));
        embers.push(ember);
      }
      this.fireZones.push({
        x: zoneX,
        y: zoneY,
        radius,
        visualRadius,
        damagePerTick: Math.max(1, damagePerTick),
        duration: visualDuration,
        life: visualDuration,
        damageDuration,
        damageLife: visualDuration,
        burnDuration: Math.max(FIRE_ZONE_MIN_BURN_DURATION, damageDuration),
        tickTimer: 0.12,
        tickInterval: 0.34,
        slowDuration,
        frame: 0,
        frameTimer: 0,
        frameDuration: 0.12,
        pulseOffset: rand(0, Math.PI * 2),
        sprite: firePatch,
        objects: [glow, firePatch, ...embers],
        embers
      });
      this.playSfxForDuration("firebomb_hit", visualDuration, 0.86);
    }

    applyFireZoneBurn(zombie, damagePerTick, burnDuration, tickInterval) {
      if (!zombie?.active || damagePerTick <= 0 || burnDuration <= 0) {
        return;
      }
      const wasBurning = (zombie.fireBurnTimer || 0) > 0;
      zombie.fireBurnTimer = Math.max(zombie.fireBurnTimer || 0, burnDuration);
      zombie.fireBurnDamagePerTick = Math.max(wasBurning ? zombie.fireBurnDamagePerTick || 0 : 0, damagePerTick);
      zombie.fireBurnTickInterval = tickInterval || 0.34;
      if (!wasBurning) {
        zombie.fireBurnTickTimer = 0;
      }
    }

    updateFireBurn(zombie, dt) {
      if (!zombie?.active || (zombie.fireBurnTimer || 0) <= 0) {
        return;
      }
      zombie.fireBurnTimer = Math.max(0, zombie.fireBurnTimer - dt);
      zombie.fireBurnTickTimer = (zombie.fireBurnTickTimer || 0) - dt;
      if (zombie.fireBurnTickTimer <= 0) {
        zombie.fireBurnTickTimer += zombie.fireBurnTickInterval || 0.34;
        this.createFireBurnTickEffect(zombie);
        this.damageZombie(
          zombie,
          zombie.fireBurnDamagePerTick || 1,
          0,
          "projectile-firebomb",
          1,
          { x: zombie.x, y: zombie.y - (zombie.displayH || 170) * 0.2 },
          { applyKnockback: false, showHitEffect: false }
        );
      }
      if (!zombie.active || zombie.fireBurnTimer <= 0) {
        zombie.fireBurnTimer = 0;
        zombie.fireBurnTickTimer = 0;
        zombie.fireBurnDamagePerTick = 0;
        zombie.fireBurnTickInterval = 0;
      }
    }

    updateFireZones(dt) {
      if (!this.fireZones?.length) {
        return;
      }
      for (let i = this.fireZones.length - 1; i >= 0; i -= 1) {
        const zone = this.fireZones[i];
        zone.life -= dt;
        zone.damageLife = Math.max(0, (zone.damageLife || 0) - dt);
        const progress = clamp(1 - zone.life / Math.max(0.01, zone.duration), 0, 1);
        const fade = clamp(zone.life / 0.45, 0, 1);
        const pulse = 1 + Math.sin((this.elapsed || 0) * 8 + zone.pulseOffset) * 0.055;
        const [glow] = zone.objects || [];
        if (glow && !glow.destroyed) {
          glow.setScale(pulse, 1 + (pulse - 1) * 0.45).setAlpha(0.2 * fade);
        }
        if (zone.sprite && !zone.sprite.destroyed) {
          zone.frameTimer -= dt;
          if (zone.frameTimer <= 0) {
            zone.frameTimer += zone.frameDuration;
            zone.frame = (zone.frame + 1) % FIRE_ZONE_ANIMATION_FRAMES;
            zone.sprite.setFrame(zone.frame);
          }
          zone.sprite
            .setDisplaySize(zone.visualRadius * 2.25 * (1 + progress * 0.08) * pulse, zone.visualRadius * 1.22 * (1 + progress * 0.03))
            .setAlpha(0.92 * fade);
        }
        (zone.embers || []).forEach((ember, index) => {
          if (!ember || ember.destroyed) {
            return;
          }
          const bob = Math.sin((this.elapsed || 0) * (5.5 + index) + zone.pulseOffset) * 3;
          ember.setY(zone.y + bob + rand(-0.2, 0.2));
          ember.setAlpha((0.4 + Math.sin((this.elapsed || 0) * 8 + index) * 0.22) * fade);
        });

        zone.tickTimer -= dt;
        if (zone.damageLife > 0 && zone.tickTimer <= 0) {
          zone.tickTimer += zone.tickInterval;
          const hitRadius = zone.radius || zone.visualRadius;
          const hitHalfWidth = hitRadius * 1.12;
          const hitHalfHeight = Math.max(18, hitRadius * 0.62);
          this.zombies.slice().forEach((zombie) => {
            if (!zombie.active || zombie.hp <= 0 || this.mode !== "playing") {
              return;
            }
            const foot = this.getZombieFootPoint(zombie);
            const dx = foot.x - zone.x;
            const dy = foot.y - zone.y;
            const normalizedDistanceSq = (dx * dx) / (hitHalfWidth * hitHalfWidth)
              + (dy * dy) / (hitHalfHeight * hitHalfHeight);
            if (normalizedDistanceSq > 1) {
              return;
            }
            const falloff = 1 - Math.sqrt(normalizedDistanceSq) * 0.28;
            this.applyFireZoneBurn(
              zombie,
              zone.damagePerTick * falloff,
              zone.burnDuration || zone.damageDuration || FIRE_ZONE_MIN_BURN_DURATION,
              zone.tickInterval
            );
            if (zombie.active && zone.slowDuration > 0) {
              zombie.slowTimer = Math.max(zombie.slowTimer || 0, zone.slowDuration * 0.55);
            }
          });
        }

        if (zone.life <= 0) {
          (zone.objects || []).forEach((object) => this.destroyTransientObject(object, false));
          this.fireZones.splice(i, 1);
        }
      }
    }

    findShockChainTarget(origin, ignoredTargets, radius) {
      let best = null;
      let bestDistanceSq = radius * radius;
      this.zombies.forEach((zombie) => {
        if (!zombie.active || zombie.hp <= 0 || ignoredTargets.has(zombie)) {
          return;
        }
        const dx = zombie.x - origin.x;
        const dy = zombie.y - origin.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq <= bestDistanceSq) {
          best = zombie;
          bestDistanceSq = distanceSq;
        }
      });
      return best;
    }

    createShockArc(start, end, alpha = 0.88) {
      const arc = this.trackTransient(this.add.graphics()
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(233));
      const segments = 5;
      const points = [];
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const jitter = i === 0 || i === segments ? 0 : rand(-13, 13);
        points.push({
          x: start.x + (end.x - start.x) * t + rand(-5, 5),
          y: start.y + (end.y - start.y) * t + jitter
        });
      }
      const drawLine = (width, color, lineAlpha) => {
        arc.lineStyle(width, color, lineAlpha);
        arc.beginPath();
        arc.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
          arc.lineTo(points[i].x, points[i].y);
        }
        arc.strokePath();
      };
      drawLine(7, SHOCK_EFFECT_OUTER_COLOR, alpha * 0.5);
      drawLine(3, 0xffffff, alpha);
      this.tweens.add({
        targets: arc,
        alpha: 0,
        duration: 170,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(arc, false)
      });
    }

    createShockChain(sourceZombie, impactPoint, bullet) {
      const ignoredTargets = new Set(bullet.hitTargets || []);
      ignoredTargets.add(sourceZombie);
      let origin = {
        x: impactPoint?.x || sourceZombie.x,
        y: impactPoint?.y || sourceZombie.y
      };
      const jumps = Math.max(0, Math.floor(bullet.chainJumps || 0));
      for (let jump = 0; jump < jumps; jump += 1) {
        const target = this.findShockChainTarget(origin, ignoredTargets, bullet.chainRadius || 0);
        if (!target) {
          break;
        }
        const hitPoint = this.getZombieHitPoint(target, "projectile-shock");
        this.createShockArc(origin, hitPoint, 0.92 - jump * 0.12);
        this.damageZombie(
          target,
          bullet.damage * (bullet.chainDamageScale || 0.35) * Math.pow(0.82, jump),
          0,
          "projectile-shock",
          1,
          hitPoint
        );
        if (target.active && bullet.slowDuration > 0) {
          target.slowTimer = Math.max(target.slowTimer || 0, bullet.slowDuration * 0.85);
        }
        if (target.active && bullet.stunDuration > 0) {
          this.applyZombieStun(target, bullet.stunDuration);
        }
        ignoredTargets.add(target);
        origin = hitPoint;
        if (this.mode !== "playing") {
          break;
        }
      }
    }

    getBulletTip(bullet) {
      return {
        x: bullet.sprite.x + Math.cos(bullet.angle) * bullet.hitOffset,
        y: bullet.sprite.y + Math.sin(bullet.angle) * bullet.hitOffset
      };
    }

    getSegmentPointDistance(start, end, point) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq > 0
        ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1)
        : 1;
      const closest = {
        x: start.x + dx * t,
        y: start.y + dy * t
      };
      const distX = point.x - closest.x;
      const distY = point.y - closest.y;
      return {
        point: closest,
        t,
        distanceSq: distX * distX + distY * distY
      };
    }

    getBulletAimPointForZombie(bullet, zombie) {
      if (!bullet || bullet.aimTarget !== zombie) {
        return null;
      }
      return {
        x: zombie.x + (bullet.aimOffsetX || 0),
        y: zombie.y + (bullet.aimOffsetY || 0)
      };
    }

    getBulletImpactPoint(bullet, zombie, tip) {
      const hitPoint = this.getZombieBodyHitPoint(
        zombie,
        this.getBulletAimPointForZombie(bullet, zombie) || tip,
        bullet?.projectile
      );
      if (Number.isFinite(bullet?.angle)) {
        hitPoint.angle = bullet.angle;
      }
      return hitPoint;
    }

    createEmbeddedProjectile(zombie, bullet, impactPoint = null) {
      const config = EMBEDDED_PROJECTILES[bullet?.projectile];
      if (!config || !zombie || !zombie.active || !bullet?.sprite) {
        return;
      }
      const hitPoint = this.getZombieBodyHitPoint(zombie, impactPoint || this.getBulletTip(bullet), bullet.projectile);
      const hitX = hitPoint.x;
      const hitY = hitPoint.y;
      const projectileLength = (config.horizontal ? bullet.sprite.displayWidth : bullet.sprite.displayHeight) || 42;
      const embedDepth = clamp(projectileLength * config.embedRatio, config.minEmbed, config.maxEmbed);
      const visibleLength = Math.max(4, projectileLength - embedDepth);
      const tailX = hitX - Math.cos(bullet.angle) * visibleLength;
      const tailY = hitY - Math.sin(bullet.angle) * visibleLength;
      const sprite = this.add.image(tailX, tailY, config.texture)
        .setOrigin(config.horizontal ? 0 : 0.5, config.horizontal ? 0.5 : 1)
        .setScale(config.scale || 0.19)
        .setRotation(config.horizontal ? bullet.angle : bullet.angle + Math.PI / 2)
        .setAlpha(config.alpha)
        .setDepth((zombie.depth || 70) + config.depthOffset);
      this.embeddedArrows.push({
        sprite,
        zombie,
        offsetX: tailX - zombie.x,
        offsetY: tailY - zombie.y,
        alpha: config.alpha,
        depthOffset: config.depthOffset,
        life: config.life
      });
    }

    updateEmbeddedArrows(dt) {
      for (let i = (this.embeddedArrows || []).length - 1; i >= 0; i -= 1) {
        const arrow = this.embeddedArrows[i];
        const zombie = arrow.zombie;
        arrow.life -= dt;
        if (arrow.life <= 0 || !zombie || !zombie.active || zombie.destroyed) {
          this.destroyGameObject(arrow.sprite);
          this.embeddedArrows.splice(i, 1);
          continue;
        }
        arrow.sprite
          .setPosition(zombie.x + arrow.offsetX, zombie.y + arrow.offsetY)
          .setDepth((zombie.depth || 70) + (arrow.depthOffset === undefined ? -0.5 : arrow.depthOffset))
          .setAlpha(clamp(arrow.life / 0.45, 0, arrow.alpha === undefined ? 0.95 : arrow.alpha));
      }
    }

    updateFollowingHitEffects() {
      Array.from(this.transientObjects || []).forEach((object) => {
        if (!object?.followZombie) {
          return;
        }
        this.updateFollowingHitEffect(object);
      });
    }

    updateFollowingHitEffectsForZombie(zombie) {
      if (!zombie?.hitEffects) {
        return;
      }
      Array.from(zombie.hitEffects).forEach((object) => {
        this.updateFollowingHitEffect(object);
      });
    }

    updateFollowingHitEffect(object) {
      const zombie = object?.followZombie;
      if (!object || object.destroyed || !zombie || !zombie.active || zombie.dying) {
        return;
      }
      object.setPosition(
        zombie.x + (object.followOffsetX || 0),
        zombie.y + (object.followOffsetY || 0)
      );
      object.setDepth(229 + zombie.y / 5);
    }

    getZombieHitBucketKey(bucketX, bucketY) {
      return `${bucketX}:${bucketY}`;
    }

    rebuildZombieHitGrid() {
      const buckets = this.zombieHitBuckets || (this.zombieHitBuckets = new Map());
      buckets.clear();
      for (let i = 0; i < this.zombies.length; i += 1) {
        const zombie = this.zombies[i];
        if (!zombie?.active || zombie.hp <= 0) {
          continue;
        }
        const bucketX = Math.floor(zombie.x / ZOMBIE_HIT_GRID_SIZE);
        const bucketY = Math.floor(zombie.y / ZOMBIE_HIT_GRID_SIZE);
        const key = this.getZombieHitBucketKey(bucketX, bucketY);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = [];
          buckets.set(key, bucket);
        }
        bucket.push(zombie);
      }
    }

    getBulletHitCandidates(bullet, segmentStart, tip) {
      const buckets = this.zombieHitBuckets;
      const candidates = this.zombieHitCandidates || (this.zombieHitCandidates = []);
      candidates.length = 0;
      if (!buckets?.size) {
        return candidates;
      }

      const minX = Math.min(segmentStart.x, tip.x) - ZOMBIE_HIT_GRID_PADDING;
      const maxX = Math.max(segmentStart.x, tip.x) + ZOMBIE_HIT_GRID_PADDING;
      const minY = Math.min(segmentStart.y, tip.y) - ZOMBIE_HIT_GRID_PADDING;
      const maxY = Math.max(segmentStart.y, tip.y) + ZOMBIE_HIT_GRID_PADDING;
      const startBucketX = Math.floor(minX / ZOMBIE_HIT_GRID_SIZE);
      const endBucketX = Math.floor(maxX / ZOMBIE_HIT_GRID_SIZE);
      const startBucketY = Math.floor(minY / ZOMBIE_HIT_GRID_SIZE);
      const endBucketY = Math.floor(maxY / ZOMBIE_HIT_GRID_SIZE);
      for (let bucketX = startBucketX; bucketX <= endBucketX; bucketX += 1) {
        for (let bucketY = startBucketY; bucketY <= endBucketY; bucketY += 1) {
          const bucket = buckets.get(this.getZombieHitBucketKey(bucketX, bucketY));
          if (bucket) {
            candidates.push(...bucket);
          }
        }
      }

      const aimTarget = bullet?.aimTarget;
      if (aimTarget?.active && aimTarget.hp > 0 && !candidates.includes(aimTarget)) {
        candidates.push(aimTarget);
      }
      return candidates;
    }

    getNearbyZombies(zombie, radius) {
      const buckets = this.zombieHitBuckets;
      const candidates = this.zombieSeparationCandidates || (this.zombieSeparationCandidates = []);
      candidates.length = 0;
      if (!zombie || !buckets?.size) {
        return candidates;
      }

      const startBucketX = Math.floor((zombie.x - radius) / ZOMBIE_HIT_GRID_SIZE);
      const endBucketX = Math.floor((zombie.x + radius) / ZOMBIE_HIT_GRID_SIZE);
      const startBucketY = Math.floor((zombie.y - radius) / ZOMBIE_HIT_GRID_SIZE);
      const endBucketY = Math.floor((zombie.y + radius) / ZOMBIE_HIT_GRID_SIZE);
      for (let bucketX = startBucketX; bucketX <= endBucketX; bucketX += 1) {
        for (let bucketY = startBucketY; bucketY <= endBucketY; bucketY += 1) {
          const bucket = buckets.get(this.getZombieHitBucketKey(bucketX, bucketY));
          if (bucket) {
            candidates.push(...bucket);
          }
        }
      }
      return candidates;
    }

    getZombieCrowdRadius(zombie) {
      return Math.max(12, (zombie?.hitRadius || 32) * ZOMBIE_SEPARATION_RADIUS_SCALE);
    }

    getZombieLaneMinX(extra = 0) {
      return this.bounds.left + ZOMBIE_WALL_VISUAL_PADDING + extra;
    }

    getZombieLaneMaxX(extra = 0) {
      return this.bounds.right - ZOMBIE_WALL_VISUAL_PADDING - extra;
    }

    clampZombieLaneX(x, extra = 0) {
      return clamp(x, this.getZombieLaneMinX(extra), this.getZombieLaneMaxX(extra));
    }

    separateZombieFromCrowd(zombie, dt) {
      if (!zombie?.active || zombie.knockbackTweening || zombie.stunTimer > 0) {
        return;
      }

      const radius = this.getZombieCrowdRadius(zombie);
      const candidates = this.getNearbyZombies(zombie, radius * 2.4);
      let pushX = 0;
      let pushY = 0;
      let overlaps = 0;

      for (let i = 0; i < candidates.length; i += 1) {
        const other = candidates[i];
        if (!other || other === zombie || !other.active || other.hp <= 0 || other.dying) {
          continue;
        }

        const otherRadius = this.getZombieCrowdRadius(other);
        const minX = radius + otherRadius;
        const minY = Math.max(14, minX * 0.54);
        let dx = zombie.x - other.x;
        let dy = zombie.y - other.y;
        if (Math.abs(dx) + Math.abs(dy) < 0.001) {
          dx = zombie.crowdSeed || 0.5;
          dy = (zombie.wobble || 0.5) * 0.001;
        }

        const normalizedDistanceSq = (dx * dx) / (minX * minX) + (dy * dy) / (minY * minY);
        if (normalizedDistanceSq >= 1) {
          continue;
        }

        const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        const strength = (1 - Math.sqrt(normalizedDistanceSq)) * ZOMBIE_SEPARATION_PUSH;
        pushX += dx / distance * strength * minX;
        pushY += dy / distance * strength * minY;
        overlaps += 1;
      }

      if (overlaps <= 0) {
        return;
      }

      const scale = Math.min(1, dt * 9);
      const stepX = clamp(pushX / overlaps * scale, -ZOMBIE_SEPARATION_MAX_STEP, ZOMBIE_SEPARATION_MAX_STEP);
      const stepY = clamp(pushY / overlaps * scale, -ZOMBIE_SEPARATION_MAX_STEP * 0.45, ZOMBIE_SEPARATION_MAX_STEP * 0.45);
      const attackLine = this.getZombieBarricadeContactY(zombie);
      zombie.x = this.clampZombieLaneX(zombie.x + stepX);
      if (zombie.y < attackLine - 4) {
        zombie.y = clamp(zombie.y + stepY, -70, attackLine - 4);
      }
    }

    getZombieFrontBlocker(zombie, x = zombie?.x || 0) {
      if (!zombie?.active || zombie.hp <= 0) {
        return null;
      }

      const radius = this.getZombieCrowdRadius(zombie);
      const footY = zombie.y + this.getZombieFootOffset(zombie);
      const candidates = this.getNearbyZombies(zombie, radius * 3.2 + ZOMBIE_FRONT_BLOCK_LOOKAHEAD);
      let best = null;
      let bestScore = Infinity;

      for (let i = 0; i < candidates.length; i += 1) {
        const other = candidates[i];
        if (!other || other === zombie || !other.active || other.hp <= 0 || other.dying) {
          continue;
        }

        const otherRadius = this.getZombieCrowdRadius(other);
        const blockWidth = Math.max(24, (radius + otherRadius) * ZOMBIE_FRONT_BLOCK_X_SCALE);
        if (Math.abs(x - other.x) >= blockWidth) {
          continue;
        }

        const footGap = other.y + this.getZombieFootOffset(other) - footY;
        const tiedAhead = Math.abs(footGap) <= ZOMBIE_FRONT_TIE_EPSILON
          && (other.crowdOrder || 0) < (zombie.crowdOrder || 0);
        if (footGap <= ZOMBIE_FRONT_TIE_EPSILON && !tiedAhead) {
          continue;
        }

        const requiredGap = Math.max(18, (radius + otherRadius) * ZOMBIE_FRONT_BLOCK_Y_GAP_SCALE);
        if (!tiedAhead && footGap > requiredGap + ZOMBIE_FRONT_BLOCK_LOOKAHEAD) {
          continue;
        }

        const score = tiedAhead ? 0 : footGap;
        if (score < bestScore) {
          bestScore = score;
          best = other;
        }
      }

      return best;
    }

    tryZombieSideStep(zombie, direction, dt, slowFactor, currentBlocker = null) {
      const minX = this.getZombieLaneMinX();
      const maxX = this.getZombieLaneMaxX();
      currentBlocker = currentBlocker || this.getZombieFrontBlocker(zombie, zombie.x);
      const step = ZOMBIE_SIDE_STEP_SPEED * Math.max(0.55, slowFactor) * dt;
      const proposedX = clamp(zombie.x + direction * step, minX, maxX);
      if (Math.abs(proposedX - zombie.x) < 0.001) {
        return false;
      }

      const proposedBlocker = this.getZombieFrontBlocker(zombie, proposedX);
      const currentDistance = currentBlocker ? Math.abs(zombie.x - currentBlocker.x) : Infinity;
      const proposedDistance = proposedBlocker ? Math.abs(proposedX - proposedBlocker.x) : Infinity;
      if (!proposedBlocker || proposedDistance > currentDistance + 0.2) {
        zombie.x = proposedX;
        zombie.crowdSide = direction;
        return true;
      }

      return false;
    }

    stepZombieAroundBlocker(zombie, blocker, dt, slowFactor) {
      const preferredDirection = Math.abs(zombie.x - blocker.x) > 1
        ? (zombie.x >= blocker.x ? 1 : -1)
        : ((zombie.crowdSide || zombie.crowdSeed || 1) >= 0 ? 1 : -1);
      if (this.tryZombieSideStep(zombie, preferredDirection, dt, slowFactor, blocker)) {
        return true;
      }
      return this.tryZombieSideStep(zombie, -preferredDirection, dt, slowFactor, blocker);
    }

    getZombieStopYBehindBlocker(zombie, blocker, attackLine) {
      const radius = this.getZombieCrowdRadius(zombie);
      const blockerRadius = this.getZombieCrowdRadius(blocker);
      const footGap = Math.max(18, (radius + blockerRadius) * ZOMBIE_FRONT_BLOCK_Y_GAP_SCALE);
      const blockerFoot = this.getZombieFootPoint(blocker);
      return clamp(blockerFoot.y - footGap - this.getZombieFootOffset(zombie), -70, attackLine - 2);
    }

    holdZombieBehindBlocker(zombie, blocker, dt, slowFactor, attackLine) {
      this.stepZombieAroundBlocker(zombie, blocker, dt, slowFactor);
      const stopY = this.getZombieStopYBehindBlocker(zombie, blocker, attackLine);
      if (zombie.y < stopY) {
        zombie.y = Math.min(stopY, zombie.y + zombie.speed * slowFactor * dt);
      } else if (zombie.y > stopY) {
        zombie.y = Math.max(stopY, zombie.y - Math.max(18, zombie.speed * 0.5) * dt);
      }
      zombie.attackTimer = Math.max(zombie.attackTimer, 0.18);
    }

    findBulletHit(bullet) {
      const tip = this.getBulletTip(bullet);
      const segmentStart = bullet.previousTip || tip;
      const candidates = this.getBulletHitCandidates(bullet, segmentStart, tip);
      let bestHit = null;
      let bestT = Infinity;
      for (let i = 0; i < candidates.length; i += 1) {
        const zombie = candidates[i];
        if (!zombie.active || zombie.hp <= 0) {
          continue;
        }
        if (bullet.hitTargets && bullet.hitTargets.has(zombie)) {
          continue;
        }
        if (bullet.aimTarget === zombie) {
          const aimPoint = this.getBulletAimPointForZombie(bullet, zombie);
          const aimRadius = clamp((zombie.hitRadius || 32) * 0.7, 18, 34);
          const aimSweep = this.getSegmentPointDistance(segmentStart, tip, aimPoint);
          if (aimSweep.distanceSq <= aimRadius * aimRadius && aimSweep.t < bestT) {
            bestT = aimSweep.t;
            bestHit = { zombie, point: this.getBulletImpactPoint(bullet, zombie, aimSweep.point) };
          }
        }
        const bodySweep = this.getSegmentPointDistance(segmentStart, tip, zombie);
        if (bodySweep.distanceSq <= zombie.hitRadius * zombie.hitRadius && bodySweep.t < bestT) {
          bestT = bodySweep.t;
          bestHit = { zombie, point: this.getBulletImpactPoint(bullet, zombie, bodySweep.point) };
        }
      }
      return bestHit;
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
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: marker,
          scale: 1.08,
          yoyo: true,
          repeat: -1,
          duration: 420,
          ease: "Sine.easeInOut"
        });
      }
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

    getZombieHitPoint(zombie, hitType = "default", crit = false) {
      const height = zombie.displayH || 170;
      const radius = zombie.hitRadius || 32;
      const headWeight = crit || hitType === "projectile-sniper" ? 0.42 : 0.26;
      const chestWeight = 0.42;
      const roll = Math.random();
      const zone = roll < headWeight
        ? { y: -0.38, xSpread: 0.42, ySpread: 0.045 }
        : roll < headWeight + chestWeight
          ? { y: -0.22, xSpread: 0.56, ySpread: 0.06 }
          : { y: -0.06, xSpread: 0.62, ySpread: 0.065 };
      return {
        x: zombie.x + rand(-radius * zone.xSpread, radius * zone.xSpread),
        y: zombie.y + height * zone.y + rand(-height * zone.ySpread, height * zone.ySpread)
      };
    }

    getZombieBodyHitPoint(zombie, point = null, hitType = "default", crit = false) {
      const fallback = this.getZombieHitPoint(zombie, hitType, crit);
      const source = point || fallback;
      const height = zombie.displayH || 170;
      const radius = zombie.hitRadius || 32;
      const top = zombie.y - height * 0.44;
      const bottom = zombie.y + height * 0.08;
      const y = clamp(source.y, top, bottom);
      const bodyCenterY = zombie.y - height * 0.2;
      const verticalRatio = clamp(Math.abs(y - bodyCenterY) / (height * 0.34), 0, 1);
      const widthFactor = clamp(1 - verticalRatio * 0.46, 0.42, 1);
      const halfWidth = clamp(radius * 0.62 * widthFactor, 10, height * 0.18);
      return {
        x: clamp(source.x, zombie.x - halfWidth, zombie.x + halfWidth),
        y
      };
    }

    playTransientSpriteFrames(sprite, frameCount, duration, onFrame = null) {
      if (!sprite || frameCount <= 1 || typeof sprite.setFrame !== "function") {
        return null;
      }
      let frame = 0;
      let event = null;
      if (onFrame) onFrame(0);
      const frameDelay = Math.max(16, Math.round(duration / frameCount));
      event = this.time.addEvent({
        delay: frameDelay,
        repeat: frameCount - 2,
        callback: () => {
          if (this.disposed || !sprite || sprite.destroyed) {
            this.sceneTimers.delete(event);
            this.cancelTimerEvent(event);
            return;
          }
          frame += 1;
          sprite.setFrame(Math.min(frame, frameCount - 1));
          if (onFrame) onFrame(Math.min(frame, frameCount - 1));
          if (frame >= frameCount - 1) {
            this.sceneTimers.delete(event);
          }
        }
      });
      this.sceneTimers.add(event);
      return event;
    }

    createFirebombHitEffect(zombie, crit = false, impactPoint = null) {
      if (!this.canSpawnHitEffect(crit)) {
        return;
      }
      const sizeScale = this.getZombieEffectScale(zombie) * (crit ? 1.16 : 1);
      const hitPoint = this.getZombieBodyHitPoint(zombie, impactPoint, "projectile-firebomb", crit);
      const depth = 229 + zombie.y / 5;
      const addFollow = (object) => {
        if (!object) {
          return object;
        }
        object.followZombie = zombie;
        object.followOffsetX = hitPoint.x - zombie.x;
        object.followOffsetY = hitPoint.y - zombie.y;
        if (!zombie.hitEffects) {
          zombie.hitEffects = new Set();
        }
        zombie.hitEffects.add(object);
        return this.trackTransient(object);
      };

      const flame = this.trackHitEffectRoot(addFollow(this.add.container(hitPoint.x, hitPoint.y).setDepth(depth + 0.95)));
      const baseGlow = this.add.ellipse(0, 8 * sizeScale, 58 * sizeScale, 27 * sizeScale, 0xff5f1d, 0.34)
        .setBlendMode(Phaser.BlendModes.ADD);
      flame.add(baseGlow);
      [
        { x: 0, y: 6, width: 20, height: 64, color: 0xff5c19, alpha: 0.82, rotation: -0.03 },
        { x: -12, y: 10, width: 12, height: 46, color: 0xff8c24, alpha: 0.78, rotation: -0.32 },
        { x: 13, y: 11, width: 11, height: 42, color: 0xff7030, alpha: 0.72, rotation: 0.28 },
        { x: 2, y: 12, width: 9, height: 41, color: 0xfff0a5, alpha: 0.9, rotation: 0.06 }
      ].forEach((shape) => {
        const x = shape.x * sizeScale;
        const y = shape.y * sizeScale;
        const width = shape.width * sizeScale;
        const height = shape.height * sizeScale;
        const tongue = this.add.ellipse(x, y - height * 0.34, width, height, shape.color, shape.alpha)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setRotation(shape.rotation)
          .setScale(0.72, 1);
        flame.add(tongue);
      });

      this.tweens.add({
        targets: flame,
        y: hitPoint.y - 8 * sizeScale,
        scaleX: crit ? 1.26 : 1.14,
        scaleY: crit ? 1.34 : 1.2,
        alpha: 0,
        duration: crit ? 390 : 320,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(flame, false)
      });

      const sparkCount = crit ? 10 : 7;
      for (let i = 0; i < sparkCount; i += 1) {
        const angle = rand(-Math.PI * 0.92, -Math.PI * 0.08);
        const distance = rand(18, crit ? 58 : 44) * sizeScale;
        const spark = this.trackTransient(this.add.circle(
          hitPoint.x + Math.cos(angle) * rand(2, 8),
          hitPoint.y + Math.sin(angle) * rand(2, 8),
          rand(2.2, crit ? 5.2 : 4.2) * sizeScale,
          choose([0xfff4a8, 0xffc247, 0xff6a22, 0xff3f16]),
          rand(0.62, 0.9)
        )
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(depth + 0.9));
        this.tweens.add({
          targets: spark,
          x: hitPoint.x + Math.cos(angle) * distance,
          y: hitPoint.y + Math.sin(angle) * distance - rand(16, 34) * sizeScale,
          scale: 0.25,
          alpha: 0,
          duration: rand(230, 380),
          ease: "Cubic.easeOut",
          onComplete: () => this.destroyTransientObject(spark, false)
        });
      }
    }

    createFireBurnTickEffect(zombie) {
      if (!zombie?.active) {
        return;
      }
      if (!this.canSpawnFireTickEffect() || !this.canSpawnHitEffect(false)) {
        return;
      }
      const sizeScale = clamp(this.getZombieEffectScale(zombie) * 0.62, 0.42, 0.78);
      const foot = this.getZombieFootPoint(zombie);
      const x = foot.x + rand(-8, 8) * sizeScale;
      const y = foot.y - rand(2, 7) * sizeScale;
      const depth = (zombie.depth || (ZOMBIE_BODY_DEPTH_BASE + zombie.y / 5)) + 0.18;
      const ember = this.trackHitEffectRoot(this.trackTransient(this.add.container(x, y).setDepth(depth).setAlpha(0.72)));
      const glow = this.add.ellipse(0, 3 * sizeScale, 40 * sizeScale, 15 * sizeScale, 0xff6a22, 0.2)
        .setBlendMode(Phaser.BlendModes.ADD);
      ember.add(glow);

      [
        { x: -7, y: 0, width: 8, height: 18, color: 0xff6f24, alpha: 0.32, rotation: -0.22 },
        { x: 2, y: -1, width: 10, height: 23, color: 0xffb34a, alpha: 0.38, rotation: 0.06 },
        { x: 9, y: 1, width: 7, height: 15, color: 0xff4b1e, alpha: 0.24, rotation: 0.24 }
      ].forEach((shape) => {
        const tongue = this.add.ellipse(
          shape.x * sizeScale,
          shape.y * sizeScale - shape.height * sizeScale * 0.28,
          shape.width * sizeScale,
          shape.height * sizeScale,
          shape.color,
          shape.alpha
        )
          .setBlendMode(Phaser.BlendModes.ADD)
          .setRotation(shape.rotation)
          .setScale(0.78, 1);
        ember.add(tongue);
      });

      this.tweens.add({
        targets: ember,
        y: y - 4 * sizeScale,
        scaleX: 1.14,
        scaleY: 0.72,
        alpha: 0,
        duration: 260,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(ember, false)
      });
    }

    createShockHitEffect(zombie, crit = false, impactPoint = null) {
      if (!this.canSpawnHitEffect(crit)) {
        return;
      }
      const sizeScale = this.getZombieEffectScale(zombie) * (crit ? 1.14 : 1);
      const hitPoint = this.getZombieBodyHitPoint(zombie, impactPoint, "projectile-shock", crit);
      const depth = 232 + zombie.y / 5;
      const addFollow = (object) => {
        if (!object) {
          return object;
        }
        object.followZombie = zombie;
        object.followOffsetX = hitPoint.x - zombie.x;
        object.followOffsetY = hitPoint.y - zombie.y;
        if (!zombie.hitEffects) {
          zombie.hitEffects = new Set();
        }
        zombie.hitEffects.add(object);
        return this.trackTransient(object);
      };

      const pulse = this.trackHitEffectRoot(addFollow(this.add.circle(hitPoint.x, hitPoint.y, 18 * sizeScale, 0xffffff, 0.22)
        .setStrokeStyle(3 * sizeScale, 0xffffff, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(depth + 0.2)));
      this.tweens.add({
        targets: pulse,
        scale: crit ? 2.25 : 1.9,
        alpha: 0,
        duration: crit ? 260 : 220,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(pulse, false)
      });

      const bolt = addFollow(this.add.graphics({ x: hitPoint.x, y: hitPoint.y })
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(depth + 0.6));
      const drawBolt = (lineWidth, color, alpha) => {
        bolt.lineStyle(lineWidth * sizeScale, color, alpha);
        const branches = crit ? 7 : 5;
        for (let branch = 0; branch < branches; branch += 1) {
          const angle = -Math.PI / 2 + branch * (Math.PI * 2 / branches) + rand(-0.34, 0.34);
          const length = rand(22, crit ? 58 : 48) * sizeScale;
          bolt.beginPath();
          bolt.moveTo(0, 0);
          let x = 0;
          let y = 0;
          const segments = 3 + Math.floor(rand(0, 3));
          for (let i = 1; i <= segments; i += 1) {
            const t = i / segments;
            x = Math.cos(angle) * length * t + rand(-7, 7) * sizeScale;
            y = Math.sin(angle) * length * t + rand(-7, 7) * sizeScale;
            bolt.lineTo(x, y);
          }
          bolt.strokePath();
          if (Math.random() < 0.55) {
            bolt.beginPath();
            bolt.moveTo(x * 0.58, y * 0.58);
            bolt.lineTo(x * 0.58 + rand(-13, 13) * sizeScale, y * 0.58 + rand(-13, 13) * sizeScale);
            bolt.strokePath();
          }
        }
      };
      drawBolt(7, 0x9fefff, 0.28);
      drawBolt(2.4, 0xffffff, 0.98);
      this.tweens.add({
        targets: bolt,
        scale: crit ? 1.18 : 1.08,
        alpha: 0,
        duration: crit ? 250 : 210,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(bolt, false)
      });

      const sparkCount = crit ? 9 : 6;
      for (let i = 0; i < sparkCount; i += 1) {
        const angle = rand(-Math.PI, Math.PI);
        const spark = this.trackTransient(this.add.circle(
          hitPoint.x + Math.cos(angle) * rand(4, 10) * sizeScale,
          hitPoint.y + Math.sin(angle) * rand(4, 10) * sizeScale,
          rand(1.6, crit ? 3.8 : 3.1) * sizeScale,
          0xffffff,
          rand(0.7, 0.96)
        )
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(depth + 0.9));
        this.tweens.add({
          targets: spark,
          x: spark.x + Math.cos(angle) * rand(14, crit ? 44 : 34) * sizeScale,
          y: spark.y + Math.sin(angle) * rand(14, crit ? 44 : 34) * sizeScale,
          scale: 0.2,
          alpha: 0,
          duration: rand(150, 250),
          ease: "Cubic.easeOut",
          onComplete: () => this.destroyTransientObject(spark, false)
        });
      }
    }

    createImpactSprite(effect, hitPoint, sizeScale, rotation, depth) {
      const displayWidth = effect.width * sizeScale * ZOMBIE_HIT_EFFECT_SIZE_MULTIPLIER;
      const displayHeight = displayWidth * effect.frameHeight / effect.frameWidth;
      const impact = this.trackHitEffectRoot(this.trackTransient(this.add.sprite(
        hitPoint.x,
        hitPoint.y,
        effect.texture,
        0
      )
        .setOrigin(effect.originX === undefined ? 0.5 : effect.originX, effect.originY === undefined ? 0.5 : effect.originY)
        .setDisplaySize(displayWidth, displayHeight)
        .setRotation(rotation)
        .setAlpha(effect.alpha)
        .setDepth(depth)));
      this.playTransientSpriteFrames(impact, effect.frames, effect.duration);

      this.tweens.add({
        targets: impact,
        scaleX: impact.scaleX * effect.scalePeak,
        scaleY: impact.scaleY * effect.scalePeak,
        duration: effect.duration,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(impact, false)
      });
      this.tweens.add({
        targets: impact,
        alpha: 0,
        delay: effect.duration * 0.68,
        duration: effect.duration * 0.32,
        ease: "Sine.easeIn"
      });
      return impact;
    }

    createWorldHitEffect(x, y, hitType = "explosion", angle = null, sizeScale = 1) {
      if (!this.canSpawnHitEffect(false)) {
        return null;
      }
      const effect = ZOMBIE_HIT_EFFECTS[hitType] || ZOMBIE_HIT_EFFECTS.default;
      const rotation = effect.alignToImpact === false || !Number.isFinite(angle)
        ? rand(-effect.rotation, effect.rotation)
        : angle + rand(-effect.rotation * 0.36, effect.rotation * 0.36);
      return this.createImpactSprite(effect, { x, y }, sizeScale, rotation, 229 + y / 5);
    }

    createZombieHitEffect(zombie, hitType = "default", crit = false, impactPoint = null) {
      if (hitType === "projectile-firebomb") {
        this.createFirebombHitEffect(zombie, crit, impactPoint);
        return;
      }
      if (hitType === "projectile-shock") {
        this.createShockHitEffect(zombie, crit, impactPoint);
        return;
      }
      if (!this.canSpawnHitEffect(crit)) {
        return;
      }
      const effect = ZOMBIE_HIT_EFFECTS[hitType] || ZOMBIE_HIT_EFFECTS.default;
      const sizeScale = this.getZombieEffectScale(zombie) * (crit ? 1.12 : 1);
      const hitPoint = this.getZombieBodyHitPoint(zombie, impactPoint, hitType, crit);
      const impactAngle = Number.isFinite(impactPoint?.angle) ? impactPoint.angle : null;
      const rotation = effect.alignToImpact === false || impactAngle === null
        ? rand(-effect.rotation, effect.rotation)
        : impactAngle + rand(-effect.rotation * 0.36, effect.rotation * 0.36);
      this.createImpactSprite(effect, hitPoint, sizeScale, rotation, 229 + zombie.y / 5);
    }

    damageZombie(zombie, amount, critChance = BASE_CRIT_CHANCE, hitType = "default", critMultiplier = DEFAULT_CRIT_MULTIPLIER, impactPoint = null, options = {}) {
      const crit = Math.random() < critChance;
      const marked = zombie.weakMarkTimer > 0 && zombie.weakMarkBonus > 0;
      const markMultiplier = marked ? 1 + zombie.weakMarkBonus : 1;
      const damage = Math.round(amount * markMultiplier * (crit ? critMultiplier : 1));
      if (options.showHitEffect !== false) {
        this.createZombieHitEffect(zombie, hitType, crit, impactPoint);
      }
      zombie.lastHitContext = {
        type: hitType,
        angle: Number.isFinite(impactPoint?.angle) ? impactPoint.angle : null,
        crit
      };
      zombie.hp -= damage;
      const hitSfxMap = {
        "projectile-shock": null,
        "projectile-nail": "nailgun_hit"
      };
      const hitSfx = crit
        ? "crit"
        : Object.prototype.hasOwnProperty.call(hitSfxMap, hitType)
          ? hitSfxMap[hitType]
          : "hit";
      if (hitSfx && !(hitType === "projectile-firebomb" && options.showHitEffect === false)) {
        const hitIntensity = crit
          ? 1.15
          : hitSfx === "nailgun_hit"
            ? 0.78
            : 0.85;
        this.playSfx(hitSfx, hitIntensity);
      }
      const suppressKnockback =
        options.applyKnockback === false ||
        hitType === "projectile-shock" ||
        hitType === "projectile-firebomb";
      const knockback = suppressKnockback
        ? null
        : this.applyZombieKnockback(zombie, hitType, crit);
      if (crit) {
        this.requestHitStop(0.055);
        this.shakeCamera(55, 0.0038);
      } else if (hitType === "projectile-sniper") {
        this.requestHitStop(0.035);
        this.shakeCamera(55, 0.0025);
      } else if (hitType === "projectile-rocket" || hitType === "explosion") {
        this.requestHitStop(0.045);
      }
      zombie.setTint(crit ? 0xfff2a5 : 0xff7777);
      this.scheduleSceneDelay(70, () => {
        if (zombie.active) {
          this.restoreZombieTint(zombie);
        }
      });
      this.showDamageText(zombie.x + rand(-8, 8), zombie.y - rand(8, 24), damage, crit, marked);
      if (zombie.hp <= 0) {
        this.killZombie(zombie, knockback);
      }
    }

    killZombie(zombie, deathKnockback = null) {
      if (!zombie.active || zombie.dying) {
        return;
      }
      const x = zombie.x;
      const y = zombie.y;
      zombie.dying = true;
      zombie.lastKnockback = null;
      zombie.hp = 0;
      this.clearWeakMark(zombie);
      this.clearEmbeddedArrowsForZombie(zombie);
      this.playSfx(zombie.elite ? "death_elite" : "death", 1);
      if (zombie.elite || zombie.type === "brute" || zombie.type === "charger") {
        this.shakeCamera(90, 0.0045);
      }
      const shouldExplode = zombie.deathExplosion;
      this.zombies = this.zombies.filter((item) => item !== zombie);
      this.createZombieCorpse(x, y, zombie, deathKnockback);
      this.kills += 1;
      this.killsInLevel += 1;
      const reward = clamp(Math.floor(Number(zombie.reward) || (zombie.elite ? 4 : 1)), 1, 4);
      this.coins += reward;
      this.rewardCounts[reward] = Math.max(0, Math.floor(Number(this.rewardCounts[reward]) || 0)) + 1;
      this.checkpointRunRewards();
      if (shouldExplode && this.mode === "playing") {
        this.createExplosion(x, y, 74, this.damage * 1.05, 0.35);
      }

      if (this.killsInLevel >= this.levelNeed) {
        this.openSkillChoice();
      }
    }

    createDamageTextObject() {
      return this.add.text(0, 0, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: 23,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#40191b",
        strokeThickness: 5
      })
        .setOrigin(0.5)
        .setVisible(false)
        .setActive(false)
        .setAlpha(0);
    }

    acquireDamageText() {
      let text = this.damageTextPool.pop();
      if (!text || text.destroyed) {
        text = this.createDamageTextObject();
      }
      this.activeDamageTexts.add(text);
      return text.setVisible(true).setActive(true);
    }

    releaseDamageText(text) {
      if (!text || text.destroyed) {
        this.activeDamageTexts.delete(text);
        return;
      }
      this.tweens.killTweensOf(text);
      this.activeDamageTexts.delete(text);
      text
        .setVisible(false)
        .setActive(false)
        .setAlpha(0)
        .setScale(1)
        .setRotation(0)
        .setText("");
      if (this.damageTextPool.length < DAMAGE_TEXT_POOL_LIMIT) {
        this.damageTextPool.push(text);
      } else {
        this.destroyGameObject(text, false);
      }
    }

    clearActiveDamageTexts() {
      Array.from(this.activeDamageTexts || []).forEach((text) => this.releaseDamageText(text));
    }

    showDamageText(x, y, damage, crit, marked = false) {
      const priority = crit || marked;
      if (!this.canSpawnDamageText(priority)) {
        return;
      }
      const text = this.acquireDamageText();
      text
        .setText(String(damage))
        .setStyle({
          fontFamily: "Arial, sans-serif",
          fontSize: crit ? 31 : marked ? 26 : 23,
          fontStyle: "900",
          color: crit ? "#fff0a5" : marked ? "#ffe29a" : "#ffffff",
          stroke: crit ? "#811010" : marked ? "#5a310e" : "#40191b",
          strokeThickness: 5
        })
        .setPosition(x, y)
        .setRotation(rand(-0.18, 0.18))
        .setScale(1)
        .setAlpha(1)
        .setDepth(Math.max(250, 270 + y / 5));
      this.tweens.add({
        targets: text,
        y: y - rand(26, 44),
        alpha: 0,
        scale: crit ? 1.18 : 1,
        duration: 650,
        ease: "Cubic.easeOut",
        onComplete: () => this.releaseDamageText(text)
      });
    }

    registerCorpseRecord(objects, depthEntries = []) {
      const record = {
        objects: objects.filter(Boolean),
        depthEntries: depthEntries.filter((entry) => entry?.object),
        fading: false
      };
      this.activeCorpses.push(record);
      this.refreshCorpseDepthOrder();
      this.trimCorpseRecords();
      return record;
    }

    removeCorpseRecord(record) {
      if (!record || !this.activeCorpses) {
        return;
      }
      const index = this.activeCorpses.indexOf(record);
      if (index >= 0) {
        this.activeCorpses.splice(index, 1);
        this.refreshCorpseDepthOrder();
      }
    }

    refreshCorpseDepthOrder() {
      if (!this.activeCorpses) {
        return;
      }
      // Reserve a complete slot for each death, including its crossfade/fall.
      // Neither screen Y nor animation completion may override death order.
      const step = ZOMBIE_CORPSE_DEPTH_RANGE / Math.max(1, this.activeCorpses.length);
      this.activeCorpses.forEach((record, index) => {
        (record.depthEntries || []).forEach(({ object, depth, bodyLayer }) => {
          if (object && !object.destroyed && typeof object.setDepth === "function") {
            object.setDepth(bodyLayer === undefined
              ? depth
              : ZOMBIE_CORPSE_DEPTH_BASE + (index + bodyLayer) * step);
          }
        });
      });
    }

    trimCorpseRecords() {
      const retained = (this.activeCorpses || []).filter((record) => !record.fading);
      retained.slice(0, Math.max(0, retained.length - ACTIVE_CORPSE_LIMIT))
        .forEach((record) => this.fadeCorpseRecord(record, CORPSE_TRIM_FADE_DURATION));
    }

    fadeCorpseRecord(record, duration = CORPSE_TRIM_FADE_DURATION) {
      if (!record || record.fading) {
        return;
      }
      record.fading = true;
      // Fading bodies are still visible: keep their ordered slot until removal.
      const targets = record.objects.filter((object) => object && !object.destroyed);
      if (!targets.length) {
        this.removeCorpseRecord(record);
        return;
      }
      targets.forEach((target) => this.tweens.killTweensOf(target));
      this.tweens.add({
        targets,
        alpha: 0,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => {
          targets.forEach((target) => this.destroyTransientObject(target, false));
          this.removeCorpseRecord(record);
        }
      });
    }

    createZombieCorpse(x, y, zombie, deathKnockback = null) {
      const sizeScale = this.getZombieEffectScale(zombie);
      const tier = zombie.elite || zombie.type === "charger" ? "elite" : sizeScale < 0.95 ? "small" : "normal";
      const effect = ZOMBIE_CORPSE_EFFECTS[tier];
      const displayH = zombie.displayH || 170;
      const displayW = zombie.displayW || displayH;
      const fallProfiles = [
        { angle: -rand(76, 104), x: -rand(0.14, 0.27), y: rand(0.02, 0.08) },
        { angle: rand(76, 104), x: rand(0.14, 0.27), y: rand(0.02, 0.08) },
        { angle: -rand(48, 68), x: -rand(0.2, 0.34), y: rand(0.04, 0.1) },
        { angle: rand(48, 68), x: rand(0.2, 0.34), y: rand(0.04, 0.1) },
        { angle: -rand(116, 142), x: -rand(0.04, 0.15), y: rand(0, 0.06) },
        { angle: rand(116, 142), x: rand(0.04, 0.15), y: rand(0, 0.06) },
        { angle: (Math.random() < 0.5 ? -1 : 1) * rand(150, 168), x: rand(-0.08, 0.08), y: rand(-0.01, 0.05) }
      ];
      const fall = choose(fallProfiles);
      const corpseX = this.clampZombieLaneX(x);
      const knockbackDx = Number.isFinite(deathKnockback?.dx) ? deathKnockback.dx : 0;
      const knockbackDy = Number.isFinite(deathKnockback?.dy) ? deathKnockback.dy : 0;
      const deathKnockbackDy = clamp(
        knockbackDy * ZOMBIE_DEATH_VERTICAL_KNOCKBACK_SCALE,
        -displayH * ZOMBIE_DEATH_VERTICAL_KNOCKBACK_LIMIT_RATIO,
        0
      );
      const shoveX = this.clampZombieLaneX(corpseX + knockbackDx);
      const shoveY = clamp(y + deathKnockbackDy, -48, this.bounds.barricade - displayH * 0.14);
      const deathFallTravelY = displayH * fall.y * 0.35;
      const landingX = this.clampZombieLaneX(shoveX + displayH * fall.x + rand(-6, 6));
      const landingY = clamp(
        Math.max(
          y - displayH * ZOMBIE_DEATH_LANDING_RISE_LIMIT_RATIO,
          shoveY + deathFallTravelY + rand(-4, 5)
        ),
        -20,
        this.bounds.barricade - displayH * 0.1
      );
      const finalAngle = fall.angle + rand(-5, 5);
      const stumbleX = this.clampZombieLaneX(corpseX + (shoveX - corpseX) * 0.62 + displayH * fall.x * 0.16);
      const stumbleY = y + (shoveY - y) * 0.9 + displayH * (0.006 + fall.y * 0.05);
      const deathPushDuration = deathKnockback
        ? clamp((deathKnockback.duration || 110) * 0.62, 72, 140)
        : rand(70, 112);

      this.tweens.killTweensOf(zombie);
      zombie.knockbackTweening = false;
      zombie.knockbackTween = null;
      this.trackTransient(zombie);
      zombie.setActive(false)
        .setPosition(corpseX, y)
        .setOrigin(0.5, 0.56)
        .setDisplaySize(displayW, displayH)
        .setDepth(ZOMBIE_CORPSE_DEPTH_BASE)
        .setAlpha(1);
      if (typeof zombie.clearTint === "function") {
        zombie.clearTint();
      }
      zombie.setTint(0x9b8f88);

      const deathType = zombie.elite ? "elite" : zombie.type || "normal";
      const deathTexturePool = ZOMBIE_DEATH_TEXTURES[deathType] || ZOMBIE_DEATH_TEXTURES.normal;
      const deathVariantIndex = deathType === "normal"
        ? clamp(Math.floor(Number(zombie.variant) || 0), 0, deathTexturePool.length - 1)
        : deathType === "student"
          ? Math.floor(rand(0, deathTexturePool.length))
          : 0;
      const deathTexture = deathTexturePool[deathVariantIndex] || deathTexturePool[0];
      const renderScale = ZOMBIE_DEATH_RENDER_SCALES[deathType] || ZOMBIE_DEATH_RENDER_SCALES.normal;
      const hasDeathTexture = this.textures
        && typeof this.textures.exists === "function"
        && this.textures.exists(deathTexture);
      const deathDisplaySize = displayH * (renderScale.deathSize || 0.9);
      const deathCenters = zombieMotionData.death[deathTexture];
      const deathFrameCount = deathCenters?.length || (deathType === "normal"
        ? NORMAL_ZOMBIE_DEATH_ANIMATION_FRAMES
        : ZOMBIE_DEATH_ANIMATION_FRAMES);
      const settledDeathAngle = finalAngle * 0.08;
      const corpseFlipX = Boolean(zombie.flipX);
      const walkCenters = zombieMotionData.walk[deathType] || zombieMotionData.walk.normal;
      const walkFrameIndex = (zombie.variant || 0) * 4 + (zombie.animFrame || 0);
      const deathStart = zombieMotion.deathStart(
        zombie, walkCenters[walkFrameIndex] || walkCenters[0], deathCenters?.[0] || [0, 0], deathDisplaySize
      );
      const finalFrameScale = zombieMotion.frameScale(deathType, deathFrameCount - 1);
      const corpseRotation = settledDeathAngle * Math.PI / 180;
      const finalFrameBounds = hasDeathTexture
        ? ZOMBIE_DEATH_FINAL_FRAME_BOUNDS[deathTexture] || { x: 0, y: 0, width: 0.8, height: 0.32 }
        : { x: 0, y: 0, width: 0.8, height: 0.32 };
      const bloodAnchorLocalX = deathDisplaySize * finalFrameBounds.x * (corpseFlipX ? -1 : 1);
      const bloodAnchorLocalY = deathDisplaySize * finalFrameBounds.y;
      const corpseRotationCos = Math.cos(corpseRotation);
      const corpseRotationSin = Math.sin(corpseRotation);
      const bloodX = landingX
        + bloodAnchorLocalX * corpseRotationCos
        - bloodAnchorLocalY * corpseRotationSin;
      const bloodY = landingY
        + bloodAnchorLocalX * corpseRotationSin
        + bloodAnchorLocalY * corpseRotationCos;
      const corpseVisualDepthRatio = clamp(bloodY / GAME_HEIGHT, 0, 1);
      const groundDepth = ZOMBIE_CORPSE_GROUND_DEPTH_BASE
        + corpseVisualDepthRatio * ZOMBIE_CORPSE_GROUND_DEPTH_RANGE;
      const corpseVisibleWidth = deathDisplaySize * finalFrameBounds.width * finalFrameScale;
      const corpseVisibleHeight = deathDisplaySize * finalFrameBounds.height * finalFrameScale;
      const bloodBaseMaxSide = Math.max(effect.stainWidth * sizeScale, corpseVisibleWidth * 0.52) * rand(0.84, 1);
      const bloodMaxSide = bloodBaseMaxSide * BLOOD_STAIN_SIZE_MULTIPLIER;
      const lastHitContext = zombie.lastHitContext || {};
      const availableBloodTextures = this.textures && typeof this.textures.exists === "function"
        ? BLOOD_STAIN_TEXTURES.filter((key) => this.textures.exists(key))
        : [];
      const preferredBloodTextures = (BLOOD_STAIN_TEXTURES_BY_HIT[lastHitContext.type] || BLOOD_STAIN_TEXTURES)
        .filter((key) => availableBloodTextures.includes(key));
      const bloodTexturePool = preferredBloodTextures.length > 0
        ? preferredBloodTextures
        : availableBloodTextures;
      const bloodTexture = bloodTexturePool.length > 0
        ? choose(bloodTexturePool)
        : null;
      const bloodRotation = bloodTexture === "blood-stain-direction-1" && Number.isFinite(lastHitContext.angle)
        ? lastHitContext.angle + rand(-0.12, 0.12)
        : corpseRotation + rand(-0.16, 0.16);
      const hasBloodFallback = this.textures
        && typeof this.textures.exists === "function"
        && this.textures.exists("blood-burst-core");
      let bloodWidth = bloodMaxSide;
      let bloodHeight = bloodMaxSide;
      const createBloodStainImage = (textureKey, tint = null) => {
        const alphaOrigin = BLOOD_STAIN_ALPHA_ORIGINS[textureKey] || { x: 0.5, y: 0.5 };
        const image = this.add.image(bloodX, bloodY, textureKey)
          .setOrigin(alphaOrigin.x, alphaOrigin.y)
          .setRotation(bloodRotation);
        const frameWidth = image.frame?.realWidth || image.frame?.width || bloodMaxSide;
        const frameHeight = image.frame?.realHeight || image.frame?.height || bloodMaxSide;
        const aspect = frameWidth / Math.max(1, frameHeight);
        if (aspect >= 1) {
          bloodWidth = bloodMaxSide;
          bloodHeight = bloodMaxSide / aspect;
        } else {
          bloodWidth = bloodMaxSide * aspect;
          bloodHeight = bloodMaxSide;
        }
        image.setDisplaySize(bloodWidth, bloodHeight);
        if (tint !== null) {
          image.setTint(tint);
        }
        return image;
      };
      const stain = this.trackTransient(bloodTexture
        ? createBloodStainImage(bloodTexture)
        : hasBloodFallback
          ? createBloodStainImage("blood-burst-core", 0x9b1216)
        : this.add.ellipse(bloodX, bloodY, bloodMaxSide, Math.max(effect.stainHeight * sizeScale, bloodMaxSide * 0.58), COLORS.blood, 0.72)
          .setRotation(corpseRotation + rand(-0.14, 0.14)));
      stain.setAlpha(0).setDepth(groundDepth);
      const stainBaseScaleX = stain.scaleX;
      const stainBaseScaleY = stain.scaleY;
      stain.setScale(stainBaseScaleX * 0.18, stainBaseScaleY * 0.18);
      const shadowBloodWidth = bloodWidth / BLOOD_STAIN_SIZE_MULTIPLIER;
      const shadowBloodHeight = bloodHeight / BLOOD_STAIN_SIZE_MULTIPLIER;

      const shadow = this.trackTransient(this.add.ellipse(
        bloodX,
        bloodY,
        Math.max(shadowBloodWidth * 0.78, corpseVisibleWidth * 0.58),
        Math.max(shadowBloodHeight * 0.42, corpseVisibleHeight * 0.42),
        0x050101,
        0.38
      )
        .setRotation(corpseRotation)
        .setAlpha(0)
        .setDepth(groundDepth - 0.4));

      const poolShade = this.trackTransient(this.add.ellipse(
        bloodX,
        bloodY,
        bloodWidth * 0.48,
        bloodHeight * 0.5,
        0x3b0307,
        0.28
      )
        .setRotation(corpseRotation + rand(-0.08, 0.08))
        .setAlpha(0)
        .setDepth(groundDepth - 0.2));

      const deathSprite = hasDeathTexture
        ? this.trackTransient(this.add.sprite(deathStart.x, deathStart.y, deathTexture, 0)
          .setOrigin(0.5)
          .setDisplaySize(deathDisplaySize, deathDisplaySize)
          .setFlipX(corpseFlipX)
          .setAlpha(0)
          .setDepth(ZOMBIE_CORPSE_DEPTH_BASE))
        : null;
      const bloodRevealDelay = deathSprite
        ? deathPushDuration + effect.fall + 55
        : Math.max(120, effect.fall - 45);

      this.tweens.add({
        targets: stain,
        scaleX: stainBaseScaleX,
        scaleY: stainBaseScaleY,
        alpha: 0.72,
        delay: bloodRevealDelay,
        duration: 180,
        ease: "Cubic.easeOut"
      });
      this.tweens.add({
        targets: poolShade,
        alpha: 0.22,
        delay: bloodRevealDelay + 30,
        duration: 220,
        ease: "Cubic.easeOut"
      });
      this.tweens.add({
        targets: shadow,
        alpha: 0.38,
        duration: effect.fall,
        ease: "Cubic.easeOut"
      });
      if (deathSprite) {
        const applyDeathFrameSize = (frame) => {
          const transform = zombieMotion.frameTransform(
            deathDisplaySize, zombieMotion.frameScale(deathType, frame), deathCenters?.[frame] || [0, 0], corpseFlipX
          );
          deathSprite.setOrigin(transform.originX, transform.originY)
            .setDisplaySize(transform.size, transform.size);
        };
        // Bridge the different poses without teleporting or mirroring the body.
        this.tweens.add({ targets: zombie, alpha: 0, duration: 80,
          onComplete: () => this.destroyTransientObject(zombie, false) });
        this.tweens.add({ targets: deathSprite, alpha: 1, duration: 80 });
        const deathFrameEvent = this.playTransientSpriteFrames(
          deathSprite, deathFrameCount, effect.fall + 260, applyDeathFrameSize
        );
        const finishDeathFall = () => {
          this.tweens.add({
            targets: deathSprite,
            x: landingX,
            y: landingY,
            angle: settledDeathAngle,
            duration: effect.fall + 210,
            ease: "Quad.easeInOut",
            onComplete: () => {
              if (deathFrameEvent) {
                this.sceneTimers.delete(deathFrameEvent);
                this.cancelTimerEvent(deathFrameEvent);
              }
              // Keep the final death-sheet frame in place so the corpse cannot jump during an asset swap.
              deathSprite
                .setFrame(deathFrameCount - 1)
                .setPosition(landingX, landingY)
                .setAngle(settledDeathAngle)
                .setAlpha(1);
              applyDeathFrameSize(deathFrameCount - 1);
              if (zombie.elite || zombie.type === "brute") {
                this.shakeCamera(70, 0.0035);
              }
            }
          });
        };
        this.tweens.add({
          targets: deathSprite,
          x: stumbleX + (deathStart.x - corpseX) * 0.6,
          y: stumbleY + (deathStart.y - y) * 0.6,
          angle: finalAngle * 0.025,
          duration: deathPushDuration,
          ease: "Cubic.easeOut",
          onComplete: finishDeathFall
        });
      } else {
        this.tweens.add({
          targets: zombie,
          angle: finalAngle * rand(0.16, 0.28),
          x: stumbleX,
          y: stumbleY,
          duration: deathPushDuration,
          ease: "Quad.easeOut"
        });
        this.tweens.add({
          targets: zombie,
          x: landingX,
          y: landingY,
          angle: finalAngle,
          scaleX: zombie.scaleX * 1.02,
          scaleY: zombie.scaleY * 0.96,
          delay: 70,
          duration: effect.fall,
          ease: "Quad.easeIn",
          onComplete: () => {
            if (zombie.elite || zombie.type === "brute") {
              this.shakeCamera(70, 0.0035);
            }
          }
        });
      }
      const corpseRecord = this.registerCorpseRecord(
        [zombie, deathSprite, stain, shadow, poolShade],
        [
          { object: stain, depth: groundDepth },
          { object: shadow, depth: groundDepth - 0.4 },
          { object: poolShade, depth: groundDepth - 0.2 },
          { object: zombie, bodyLayer: 0 },
          { object: deathSprite, bodyLayer: 0.5 }
        ]
      );
      const corpseSettleDelay = deathSprite
        ? deathPushDuration + effect.fall + 210
        : effect.fall + 70;
      const corpseFadeDelay = corpseSettleDelay + effect.corpseHold;
      this.scheduleSceneDelay(corpseFadeDelay, () => {
        this.fadeCorpseRecord(corpseRecord, effect.corpseFade);
      });
    }

    getZombieSurgeCooldown(zombie) {
      const min = Math.max(0.4, Number(zombie?.surgeCooldownMin) || 3.8);
      const max = Math.max(min, Number(zombie?.surgeCooldownMax) || 5.2);
      return rand(min, max);
    }

    setZombieSurgeState(zombie, state, timer) {
      if (!zombie?.surgeState) {
        return;
      }
      zombie.surgeState = state;
      zombie.surgeTimer = Math.max(0, timer || 0);
      if (state === "charge") {
        this.createChargerSurgeCue(zombie);
      } else if ((zombie.stunTimer || 0) <= 0) {
        zombie.setAngle(0);
      }
      this.restoreZombieTint(zombie);
    }

    resetZombieSurge(zombie, minimumDelay = 0) {
      if (!zombie?.surgeState) {
        return;
      }
      this.setZombieSurgeState(zombie, "cooldown", Math.max(minimumDelay, this.getZombieSurgeCooldown(zombie)));
    }

    createChargerSurgeCue(zombie) {
      if (!zombie?.active) {
        return;
      }
      const foot = this.getZombieFootPoint(zombie);
      const cue = this.trackTransient(this.add.ellipse(
        foot.x,
        foot.y + 2,
        Math.max(44, (zombie.displayW || 170) * 0.42),
        18,
        0xff9d4d,
        0.12
      )
        .setStrokeStyle(3, 0xffd5a0, 0.78)
        .setDepth((zombie.depth || ZOMBIE_BODY_DEPTH_BASE) - 0.4));
      this.tweens.add({
        targets: cue,
        scaleX: 1.55,
        scaleY: 1.18,
        alpha: 0,
        duration: Math.max(180, (zombie.surgeChargeDuration || 0.22) * 1000 + 70),
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(cue, false)
      });
    }

    updateZombieSurge(zombie, dt, attackLine, frontBlocker) {
      if (!zombie?.surgeState) {
        return 1;
      }
      const remainingDistance = attackLine - zombie.y;
      const tooClose = remainingDistance <= (zombie.surgeMinBarricadeDistance || 120);
      if (frontBlocker || tooClose) {
        if (zombie.surgeState !== "cooldown") {
          this.resetZombieSurge(zombie, 0.7);
        } else {
          zombie.surgeTimer = Math.max(zombie.surgeTimer || 0, 0.55);
        }
        return 1;
      }

      zombie.surgeTimer = Math.max(0, (zombie.surgeTimer || 0) - dt);
      if (zombie.surgeState === "cooldown") {
        if (zombie.surgeTimer <= 0) {
          this.setZombieSurgeState(zombie, "charge", zombie.surgeChargeDuration || 0.22);
          return 0.2;
        }
        return 1;
      }
      if (zombie.surgeState === "charge") {
        if (zombie.surgeTimer <= 0) {
          this.setZombieSurgeState(zombie, "surge", zombie.surgeDuration || 0.38);
          return zombie.surgeSpeedScale || 3.05;
        }
        if (zombie.slowTimer <= 0) {
          zombie.setTint(CHARGER_CHARGE_TINT);
        }
        zombie.setAngle(Math.sin((this.elapsed || 0) * 44) * 1.8);
        return 0.2;
      }
      if (zombie.surgeState === "surge") {
        if (zombie.surgeTimer <= 0) {
          this.resetZombieSurge(zombie);
          zombie.setAngle(0);
          return 1;
        }
        if (zombie.slowTimer <= 0) {
          zombie.setTint(CHARGER_SURGE_TINT);
        }
        return zombie.surgeSpeedScale || 3.05;
      }
      this.resetZombieSurge(zombie);
      return 1;
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
        this.applyBarbedWireToZombie(zombie, dt);
        this.updateFireBurn(zombie, dt);
        if (!zombie.active) {
          continue;
        }
        const wasStunned = zombie.stunTimer > 0;
        zombie.wobble += dt * (wasStunned ? 13.5 : 4.2);
        const surgeAnimationScale = zombie.surgeState === "surge"
          ? 1.55
          : zombie.surgeState === "charge" ? 0.55 : 1;
        zombie.animTimer += dt * (wasStunned
          ? Math.max(15, (zombie.animRate || 6.8) * 2.35)
          : (zombie.animRate || (zombie.elite ? 5.2 : 6.8)) * surgeAnimationScale);
        const nextFrame = Math.floor(zombie.animTimer) % 4;
        if (nextFrame !== zombie.animFrame) {
          zombie.animFrame = nextFrame;
          zombie.setTexture(`${zombie.textureBase || "zombie-walk-normal"}-${zombie.variant}-${nextFrame}`);
          zombie.setDisplaySize(zombie.displayW, zombie.displayH);
        }
        if (!wasStunned) {
          const crowdShift = Math.sin(zombie.wobble) * 7 * dt;
          zombie.x = this.clampZombieLaneX(zombie.x + crowdShift);
        }
        zombie.setDepth(ZOMBIE_BODY_DEPTH_BASE + zombie.y / 5);

        if (zombie.slowTimer > 0) {
          zombie.slowTimer -= dt;
          zombie.setTint(0x99f4ff);
        } else if (zombie.tintTopLeft === 0x99f4ff) {
          this.restoreZombieTint(zombie);
        }

        const stunned = this.updateZombieStun(zombie, dt);

        if (zombie.knockbackTweening) {
          if (stunned) {
            zombie.stunAnchorX = zombie.x;
            zombie.stunAnchorY = zombie.y;
          }
          this.updateFollowingHitEffectsForZombie(zombie);
          continue;
        }

        if (stunned) {
          zombie.setPosition(
            this.clampZombieLaneX(zombie.stunAnchorX),
            zombie.stunAnchorY
          );
          this.updateFollowingHitEffectsForZombie(zombie);
          continue;
        }

        this.separateZombieFromCrowd(zombie, dt);

        const slowFactor = zombie.slowTimer > 0 ? 0.34 : 1;
        const attackLine = this.getZombieBarricadeContactY(zombie);
        const frontBlocker = this.getZombieFrontBlocker(zombie);
        const surgeMovementScale = this.updateZombieSurge(zombie, dt, attackLine, frontBlocker);
        if (frontBlocker) {
          this.holdZombieBehindBlocker(zombie, frontBlocker, dt, slowFactor, attackLine);
          continue;
        }

        if (zombie.y < attackLine) {
          zombie.y = Math.min(attackLine, zombie.y + zombie.speed * slowFactor * surgeMovementScale * dt);
        } else {
          zombie.attackTimer -= dt;
          zombie.y = clamp(zombie.y + Math.sin(zombie.wobble) * 6 * dt, attackLine - 8, attackLine);
          if (zombie.attackTimer <= 0) {
            zombie.attackTimer = rand(0.55, 1);
            this.takeDamage(zombie.attack);
            if (this.mode !== "playing") {
              return;
            }
            zombie.y = clamp(zombie.y - 8, attackLine - 10, attackLine - 2);
            this.createHitAtBarricade(zombie.x);
          }
        }
      }
    }

    getZombieBarricadeContactY(zombie) {
      return (this.bounds.zombieFootLine || this.bounds.barricade) - this.getZombieFootOffset(zombie);
    }

    takeDamage(rawAmount) {
      let amount = rawAmount;
      let blocked = 0;
      if (this.shield > 0) {
        blocked = Math.min(this.shield, amount);
        this.shield -= blocked;
        amount -= blocked;
      }
      this.coreHp = clamp(this.coreHp - amount, 0, this.maxCoreHp);
      if (rawAmount > 0) {
        if (blocked > 0) this.playSfx("shield_block", clamp(blocked / Math.max(rawAmount, 1), 0.55, 1));
        if (amount > 0) this.playSfx("core", clamp(amount / Math.max(rawAmount, 1), 0.45, 1));
        const severity = clamp(rawAmount / 46, 1, 1.9);
        this.shakeCamera(260, 0.014 * severity);
        this.requestHitStop(0.055);
        this.vibrateImpact(severity > 1.45 ? [90, 35, 125] : [62, 28, 86]);
      }
      if (this.coreHp <= 0) {
        this.gameOver();
      }
    }

    createBarricadeFragment(x, y, kind) {
      const isMetal = kind === "metal";
      const width = isMetal ? rand(5, 9) : rand(8, 15);
      const height = isMetal ? rand(2, 3.5) : rand(3, 5.5);
      const colors = isMetal
        ? [0xffdda1, 0xfff0c7, 0xd8b17b]
        : [0x5d3828, 0x875033, 0xb56d3e, 0xd08a50];
      const startAngle = rand(-42, 42);
      const fragment = this.trackTransient(this.add.rectangle(
        x + rand(-12, 12),
        y + rand(-8, 9),
        width,
        height,
        choose(colors),
        isMetal ? 0.96 : 0.92
      )
        .setAngle(startAngle)
        .setDepth(isMetal ? 228 : 227));
      if (isMetal) {
        fragment.setBlendMode(Phaser.BlendModes.ADD);
      } else {
        fragment.setStrokeStyle(1, 0x2a1711, 0.62);
      }
      fragment.barricadeFragment = true;
      this.activeBarricadeFragments.add(fragment);

      const direction = Math.random() < 0.5 ? -1 : 1;
      const travelX = rand(isMetal ? 48 : 34, isMetal ? 112 : 92);
      const rise = rand(isMetal ? 44 : 30, isMetal ? 88 : 72);
      const peakX = x + direction * travelX * rand(0.46, 0.62);
      const landingX = clamp(x + direction * travelX, 8, GAME_WIDTH - 8);
      const landingY = y + rand(16, 42);
      const spin = direction * rand(isMetal ? 140 : 100, isMetal ? 260 : 220);

      this.tweens.add({
        targets: fragment,
        x: peakX,
        y: y - rise,
        angle: startAngle + spin * 0.54,
        scaleX: isMetal ? 1.28 : 1.06,
        duration: rand(110, 170),
        ease: "Cubic.easeOut",
        onComplete: () => {
          if (!fragment.active || fragment.destroyed) {
            return;
          }
          this.tweens.add({
            targets: fragment,
            x: landingX,
            y: landingY,
            angle: startAngle + spin,
            scaleX: isMetal ? 0.54 : 0.72,
            scaleY: isMetal ? 0.54 : 0.78,
            alpha: 0,
            duration: rand(170, 255),
            ease: "Quad.easeIn",
            onComplete: () => this.destroyTransientObject(fragment, false)
          });
        }
      });
    }

    createBarricadeDebris(x, y) {
      if (this.reducedMotion) {
        return;
      }
      const available = Math.max(0, BARRICADE_FRAGMENT_LIMIT - this.activeBarricadeFragments.size);
      if (available <= 0) {
        return;
      }
      const woodCount = Math.floor(rand(BARRICADE_WOOD_FRAGMENT_MIN, BARRICADE_WOOD_FRAGMENT_MAX + 1));
      const metalCount = Math.floor(rand(BARRICADE_METAL_FRAGMENT_MIN, BARRICADE_METAL_FRAGMENT_MAX + 1));
      const kinds = [
        ...Array.from({ length: woodCount }, () => "wood"),
        ...Array.from({ length: metalCount }, () => "metal")
      ].slice(0, available);
      kinds.forEach((kind) => this.createBarricadeFragment(x, y, kind));
    }

    createHitAtBarricade(x) {
      const effectWidth = BARRICADE_IMPACT_DISPLAY_WIDTH;
      const texture = this.textures.get("barricade-impact").getSourceImage();
      const effectHeight = effectWidth * texture.height / texture.width;
      const effectVisibleHalfWidth = effectWidth * 0.26;
      const effectX = clamp(x, effectVisibleHalfWidth + 8, GAME_WIDTH - effectVisibleHalfWidth - 8);
      const effectY = this.bounds.barricade + 4;
      const impact = this.trackTransient(this.add.image(effectX, effectY, "barricade-impact")
        .setOrigin(0.5)
        .setDisplaySize(effectWidth, effectHeight)
        .setRotation(rand(-0.09, 0.09))
        .setAlpha(0.96)
        .setDepth(225));
      const flash = this.trackTransient(this.add.ellipse(effectX, effectY + 4, 128, 46, 0xffa45f, 0.28)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(224));
      const sparks = this.trackTransient(this.add.circle(effectX, effectY + rand(-4, 8), 8, 0xffe0ab, 0.88)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(226));
      this.createBarricadeDebris(effectX, effectY);
      this.tweens.add({
        targets: impact,
        scaleX: impact.scaleX * 1.16,
        scaleY: impact.scaleY * 1.1,
        alpha: 0,
        duration: BARRICADE_IMPACT_DURATION,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(impact, false)
      });
      this.tweens.add({
        targets: flash,
        scaleX: 1.35,
        alpha: 0,
        duration: 125,
        ease: "Cubic.easeOut",
        onComplete: () => this.destroyTransientObject(flash, false)
      });
      this.tweens.add({
        targets: sparks,
        scale: 2.15,
        alpha: 0,
        duration: 190,
        onComplete: () => this.destroyTransientObject(sparks, false)
      });
    }

    createExplosion(x, y, radius, damage, slowDuration = 0, options = {}) {
      const explosionSfx = radius >= 100 ? "explosion_large" : "explosion";
      this.playSfx(explosionSfx, clamp(radius / 100, 0.75, 1.2));
      this.shakeCamera(130, clamp(radius / 22000, 0.004, 0.009));
      this.requestHitStop(0.045);
      if (options.showCenterEffect !== false) {
        this.createWorldHitEffect(x, y, "explosion", null, clamp(radius / 92, 0.8, 1.35));
      }
      const ring = this.trackTransient(this.add.circle(x, y, 18, 0xff8a35, 0.28).setStrokeStyle(3, 0xffdba1, 0.44).setDepth(221));
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
          this.damageZombie(
            zombie,
            damage * (1 - Math.sqrt(dx * dx + dy * dy) / radius * 0.35),
            0,
            "explosion",
            DEFAULT_CRIT_MULTIPLIER,
            null,
            { showHitEffect: options.showSplashHitEffect === true }
          );
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
      announceGameStatus(SchoolI18n.t("skill.a11yOpen", { wave: this.level + 1 }));
      this.playSfx("wave_clear", 0.92);
      this.cancelRunTimers();
      const previousStage = this.stage;
      this.level += 1;
      this.stage = Math.floor((this.level - 1) / 4) + 1;
      this.checkpointRunRewards();
      if (this.stage > previousStage) {
        this.highestClearedStage = Math.max(this.highestClearedStage || 0, previousStage);
        this.recordRankStageClear(previousStage);
      }
      this.killsInLevel = 0;
      this.levelNeed = getLevelNeedForLevel(this.level);
      this.damage = getTeamDamageForLevel(this.level);
      this.skillRerollUsed = false;
      this.skillChoiceCardObjects = [];
      this.currentSkillChoiceSignature = "";
      this.clearOverlay();

      const items = this.overlayObjects;
      const backdrop = this.add.image(270, 480, "skill-choice-backdrop")
        .setDisplaySize(540, 960)
        .setAlpha(0)
        .setDepth(520);
      const backdropShade = this.add.rectangle(270, 480, 540, 960, 0x010204, 0.26)
        .setAlpha(0)
        .setDepth(521);
      items.push(backdrop, backdropShade);
      if (this.reducedMotion) {
        backdrop.setAlpha(1);
        backdropShade.setAlpha(1);
      } else {
        this.tweens.add({ targets: backdrop, alpha: 1, duration: 320, ease: "Cubic.easeOut" });
        this.tweens.add({ targets: backdropShade, alpha: 1, duration: 420, ease: "Cubic.easeOut" });
      }
      items.push(this.add.rectangle(270, 514, 500, 694, 0x010204, 0.24).setDepth(522));
      items.push(this.add.ellipse(270, 514, 474, 720, COLORS.gold, 0.045).setDepth(522.2));
      const header = this.addOverlayHeader({
        y: 118,
        title: SchoolI18n.t("skill.title"),
        kicker: "WAVE CLEAR · SUPPLY AUTHORIZED",
        subtitle: SchoolI18n.t("skill.subtitle", { wave: String(this.level).padStart(2, "0") }),
        accent: COLORS.gold,
        depth: 523
      });
      this.animateOverlayEntrance(header.objects, 70, 18, 390);

      this.renderSkillChoiceCards();
      this.addSkillRerollButton();
      items.push(this.add.text(270, 912, SchoolI18n.t("skill.hint"), {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 14,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(535));
      this.updateHud();
    }

    getSkillRerollCost() {
      const rerollNumber = Math.max(1, Math.floor(Number(this.skillRerollsThisRun) || 0) + 1);
      const stageMultiplier = Math.max(1, Math.floor(Number(this.stage) || 1));
      return SKILL_REROLL_BASE_COST * (rerollNumber + stageMultiplier - 1);
    }

    getUpgradeChoiceSignature(upgrades) {
      return (upgrades || [])
        .map((upgrade) => upgrade?.id || "")
        .sort()
        .join("|");
    }

    pickSkillChoiceUpgrades(avoidSignature = "") {
      let upgrades = this.pickUpgrades();
      for (let attempt = 0; attempt < 6 && avoidSignature && this.getUpgradeChoiceSignature(upgrades) === avoidSignature; attempt += 1) {
        upgrades = this.pickUpgrades();
      }
      return upgrades;
    }

    destroySkillChoiceCards() {
      const cardObjects = this.skillChoiceCardObjects || [];
      if (cardObjects.length <= 0) {
        this.skillChoiceCardObjects = [];
        return;
      }
      const cardSet = new Set(cardObjects);
      cardObjects.forEach((item) => this.destroyGameObject(item));
      this.overlayObjects = this.overlayObjects.filter((item) => !cardSet.has(item));
      this.skillChoiceCardObjects = [];
    }

    setSkillChoiceFocus(index = 0) {
      const count = this.currentSkillChoices?.length || 0;
      if (count <= 0) {
        return;
      }
      const normalized = (Math.floor(index) % count + count) % count;
      this.skillChoiceFocusIndex = normalized;
      this.skillChoiceFocusHandlers.forEach((handler, handlerIndex) => handler?.(handlerIndex === normalized));
      const choice = this.currentSkillChoices[normalized];
      if (choice) {
        announceGameStatus(SchoolI18n.t("skill.a11yCard", { index: normalized + 1, title: choice.title, desc: String(choice.desc || "").replace(/\n/g, " ") }));
      }
    }

    renderSkillChoiceCards(avoidSignature = "") {
      this.destroySkillChoiceCards();
      const upgrades = this.pickSkillChoiceUpgrades(avoidSignature);
      this.currentSkillChoices = upgrades;
      this.skillChoiceFocusHandlers = [];
      this.skillChoiceFocusIndex = 0;
      this.currentSkillChoiceSignature = this.getUpgradeChoiceSignature(upgrades);
      const spacing = upgrades.length === 1 ? 0 : 166;
      const startY = upgrades.length === 1 ? 508 : upgrades.length === 2 ? 425 : 344;
      upgrades.forEach((upgrade, index) => this.addWideSkillCard(270, startY + index * spacing, upgrade, index));
      this.setSkillChoiceFocus(0);
      if (!this.reducedMotion) {
        this.scheduleSceneDelay(620, () => {
          if (this.mode === "skill") {
            this.setSkillChoiceFocus(this.skillChoiceFocusIndex || 0);
          }
        });
      }
    }

    addSkillRerollButton() {
      const cost = this.getSkillRerollCost();
      const button = this.addTacticalMenuButton(270, 858, 230, 52,
        this.skillRerollUsed ? SchoolI18n.t("skill.rerollDone") : SchoolI18n.t("skill.reroll", { cost }), 535,
        () => this.rerollSkillChoices(), COLORS.gold, { fontSize: 18, hitHeight: 76, disabled: this.skillRerollUsed });
      this.skillRerollButtonObjects = button;
    }

    updateSkillRerollButton() {
      const button = this.skillRerollButtonObjects;
      if (!button?.text?.active) return;
      button.text.setText(this.skillRerollUsed ? SchoolI18n.t("skill.rerollDone") : SchoolI18n.t("skill.reroll", { cost: this.getSkillRerollCost() }));
      button.frame.setTint(this.skillRerollUsed ? 0x777a71 : 0xeeeae0);
      button.text.setAlpha(this.skillRerollUsed ? 0.55 : 1);
      button.wash.setAlpha(0);
      if (this.skillRerollUsed) button.hit.disableInteractive();
      else button.hit.setInteractive({ useHandCursor: true });
    }

    rerollSkillChoices() {
      if (this.mode !== "skill" || this.skillRerollUsed) {
        return;
      }
      const cost = this.getSkillRerollCost();
      if (this.coins < cost) {
        this.playSfx("core", 0.65);
        this.showToast(SchoolI18n.t("toast.noCoins"), COLORS.red);
        return;
      }
      const previousSignature = this.currentSkillChoiceSignature;
      this.coins = Math.max(0, Math.floor(Number(this.coins) || 0) - cost);
      this.skillRerollsThisRun = Math.max(0, Math.floor(Number(this.skillRerollsThisRun) || 0)) + 1;
      this.runRerollLevels.push(this.level);
      this.checkpointRunRewards();
      this.skillRerollUsed = true;
      this.playSfx("button", 0.85);
      this.renderSkillChoiceCards(previousSignature);
      this.updateSkillRerollButton();
      this.updateHud();
      this.showToast(SchoolI18n.t("toast.reroll", { cost }), COLORS.gold);
    }

    formatPercent(value) {
      return `${Math.round(value * 100)}%`;
    }

    formatBonus(value) {
      return `+${Math.round(value * 100)}%`;
    }

    formatSeconds(value) {
      return SchoolI18n.t("unit.seconds", { value: value.toFixed(2) });
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
      const fire = this.getDefenderById("f");
      const shock = this.getDefenderById("g");
      const engineer = this.getDefenderById("h");
      const rifleBurstGain = 2;
      const rifleGrenadeDamageBoost = rifle.rocketDamageBoost || 1;
      const rifleGrenadeRadiusBoost = rifle.rocketRadiusBoost || 1;

      add("c", {
        id: "c-impact",
        icon: "skill-pistol-impact",
        tag: SchoolI18n.t("tag.pistol"),
        title: SchoolI18n.t("skill.c-impact.title"),
        desc: SchoolI18n.t("skill.c-impact.desc"),
        stat: SchoolI18n.t("skill.stat.damage", {
          from: this.formatPercent(pistol.damageBoost),
          to: this.formatPercent(pistol.damageBoost * 1.12)
        }),
        available: pistol.damageBoost < 2.2,
        apply: () => {
          const defender = this.getDefenderById("c");
          defender.damageBoost *= 1.12;
        }
      });
      add("c", {
        id: "c-rapid",
        icon: "skill-pistol-rapid",
        tag: SchoolI18n.t("tag.pistol"),
        title: SchoolI18n.t("skill.c-rapid.title"),
        desc: SchoolI18n.t("skill.c-rapid.desc"),
        stat: SchoolI18n.t("skill.stat.interval", {
          from: this.formatSeconds(pistol.rate),
          to: this.formatSeconds(Math.max(pistol.baseRate * 0.52, pistol.rate * 0.82))
        }),
        available: pistol.rate > pistol.baseRate * 0.54,
        apply: () => {
          const defender = this.getDefenderById("c");
          defender.rate = Math.max(defender.baseRate * 0.52, defender.rate * 0.82);
        }
      });
      add("c", {
        id: "c-multishot",
        icon: "skill-multishot",
        tag: SchoolI18n.t("tag.pistol"),
        title: SchoolI18n.t("skill.c-multishot.title"),
        desc: SchoolI18n.t("skill.c-multishot.desc"),
        stat: SchoolI18n.t("skill.stat.followup", {
          from: pistol.burstCount,
          to: Math.min(4, pistol.burstCount + 1)
        }),
        available: pistol.burstCount < 4,
        apply: () => {
          const defender = this.getDefenderById("c");
          defender.burstCount = Math.min(4, defender.burstCount + 1);
        }
      });
      add("c", {
        id: "c-pierce",
        icon: "skill-pistol-pierce",
        tag: SchoolI18n.t("tag.pistol"),
        title: SchoolI18n.t("skill.c-pierce.title"),
        desc: SchoolI18n.t("skill.c-pierce.desc"),
        stat: SchoolI18n.t("skill.stat.pierceDamage", {
          pierceFrom: pistol.pierce,
          pierceTo: pistol.pierce + 1,
          from: this.formatPercent(pistol.damageBoost),
          to: this.formatPercent(pistol.damageBoost * 1.08)
        }),
        available: pistol.pierce < 2,
        apply: () => {
          const defender = this.getDefenderById("c");
          defender.pierce += 1;
          defender.damageBoost *= 1.08;
        }
      });
      add("a", {
        id: "a-force",
        icon: "skill-arrow-force",
        tag: SchoolI18n.t("tag.crossbow"),
        title: SchoolI18n.t("skill.a-force.title"),
        desc: SchoolI18n.t("skill.a-force.desc"),
        stat: SchoolI18n.t("skill.stat.damage", {
          from: this.formatPercent(bow.damageBoost),
          to: this.formatPercent(bow.damageBoost * 1.1)
        }),
        available: bow.damageBoost < 2.2,
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.damageBoost *= 1.1;
        }
      });
      add("a", {
        id: "a-rally",
        icon: "skill-rally",
        tag: SchoolI18n.t("tag.crossbow"),
        title: SchoolI18n.t("skill.a-rally.title"),
        desc: SchoolI18n.t("skill.a-rally.desc"),
        stat: SchoolI18n.t("skill.stat.crit", {
          critFrom: this.formatPercent(bow.critChance),
          critTo: this.formatPercent(Math.min(0.72, bow.critChance + 0.14)),
          dmgFrom: this.formatPercent(bow.critMultiplier),
          dmgTo: this.formatPercent(bow.critMultiplier + 0.35)
        }),
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.critChance = Math.min(0.72, defender.critChance + 0.14);
          defender.critMultiplier += 0.35;
        }
      });
      add("a", {
        id: "a-mark",
        icon: "skill-mark",
        tag: SchoolI18n.t("tag.crossbow"),
        title: SchoolI18n.t("skill.a-mark.title"),
        desc: SchoolI18n.t("skill.a-mark.desc"),
        stat: SchoolI18n.t("skill.stat.mark", {
          from: this.formatBonus(bow.markDamageBonus),
          to: this.formatBonus(bow.markDamageBonus + 0.12),
          timeFrom: this.formatSeconds(bow.markDuration),
          timeTo: this.formatSeconds(bow.markDuration + 1.8)
        }),
        accent: 0xffd978,
        accentHex: "#ffd978",
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.markDamageBonus += 0.12;
          defender.markDuration += 1.8;
        }
      });
      add("a", {
        id: "a-pin",
        icon: "skill-arrow-pin",
        tag: SchoolI18n.t("tag.crossbow"),
        title: SchoolI18n.t("skill.a-pin.title"),
        desc: SchoolI18n.t("skill.a-pin.desc"),
        stat: SchoolI18n.t("skill.stat.slowMark", {
          slowFrom: this.formatSeconds(bow.slowDuration),
          slowTo: this.formatSeconds(bow.slowDuration + 0.75),
          markFrom: this.formatBonus(bow.markDamageBonus),
          markTo: this.formatBonus(bow.markDamageBonus + 0.04)
        }),
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.slowDuration += 0.75;
          defender.markDuration += 1;
          defender.markDamageBonus += 0.04;
          defender.damageBoost *= 1.08;
        }
      });
      add("a", {
        id: "a-pierce",
        icon: "skill-arrow-pierce",
        tag: SchoolI18n.t("tag.crossbow"),
        title: SchoolI18n.t("skill.a-pierce.title"),
        desc: SchoolI18n.t("skill.a-pierce.desc"),
        stat: SchoolI18n.t("skill.stat.pierceDamage", {
          pierceFrom: bow.pierce,
          pierceTo: bow.pierce + 1,
          from: this.formatPercent(bow.damageBoost),
          to: this.formatPercent(bow.damageBoost * 1.1)
        }),
        available: bow.pierce < 3,
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.pierce += 1;
          defender.damageBoost *= 1.1;
          defender.markDuration += 0.6;
        }
      });
      add("b", {
        id: "b-caliber",
        icon: "skill-rifle-caliber",
        tag: SchoolI18n.t("tag.rifle"),
        title: SchoolI18n.t("skill.b-caliber.title"),
        desc: SchoolI18n.t("skill.b-caliber.desc"),
        stat: SchoolI18n.t("skill.stat.damage", {
          from: this.formatPercent(rifle.damageBoost),
          to: this.formatPercent(rifle.damageBoost * 1.09)
        }),
        available: rifle.damageBoost < 2.2,
        apply: () => {
          const defender = this.getDefenderById("b");
          defender.damageBoost *= 1.09;
        }
      });
      add("b", {
        id: "b-barrage",
        icon: "skill-rifle-grenade",
        tag: SchoolI18n.t("tag.rifle"),
        title: SchoolI18n.t("skill.b-barrage.title"),
        desc: SchoolI18n.t("skill.b-barrage.desc"),
        stat: rifle.rocketEvery === 0
          ? SchoolI18n.t("skill.stat.grenadeUnlock", {
            sets: RIFLE_GRENADE_INITIAL_INTERVAL,
            blastFrom: this.formatPercent(rifleGrenadeDamageBoost),
            blastTo: this.formatPercent(rifleGrenadeDamageBoost * 1.2),
            areaFrom: this.formatPercent(rifleGrenadeRadiusBoost),
            areaTo: this.formatPercent(rifleGrenadeRadiusBoost * 1.1)
          })
          : SchoolI18n.t("skill.stat.grenade", {
            from: rifle.rocketEvery,
            to: getNextRifleGrenadeEvery(rifle.rocketEvery),
            blastFrom: this.formatPercent(rifleGrenadeDamageBoost),
            blastTo: this.formatPercent(rifleGrenadeDamageBoost * 1.2),
            areaFrom: this.formatPercent(rifleGrenadeRadiusBoost),
            areaTo: this.formatPercent(rifleGrenadeRadiusBoost * 1.1)
          }),
        available: rifle.rocketEvery !== RIFLE_GRENADE_MIN_INTERVAL,
        apply: () => {
          const defender = this.getDefenderById("b");
          defender.rocketEvery = getNextRifleGrenadeEvery(defender.rocketEvery);
          defender.rocketDamageBoost = (defender.rocketDamageBoost || 1) * 1.2;
          defender.rocketRadiusBoost = (defender.rocketRadiusBoost || 1) * 1.1;
        }
      });
      add("b", {
        id: "b-rifle",
        icon: "skill-barrage",
        tag: SchoolI18n.t("tag.rifle"),
        title: SchoolI18n.t("skill.b-rifle.title"),
        desc: SchoolI18n.t("skill.b-rifle.desc"),
        stat: SchoolI18n.t("skill.stat.burstControl", {
          from: rifle.burstCount,
          to: Math.min(6, rifle.burstCount + rifleBurstGain),
          gapFrom: this.formatMs(rifle.burstDelay),
          gapTo: this.formatMs(Math.max(MIN_CHAIN_SHOT_DELAY, rifle.burstDelay * 0.86))
        }),
        available: rifle.burstCount < 6 || rifle.burstDelay > MIN_CHAIN_SHOT_DELAY,
        apply: () => {
          const defender = this.getDefenderById("b");
          defender.burstCount = Math.min(6, defender.burstCount + rifleBurstGain);
          defender.burstDelay = Math.max(MIN_CHAIN_SHOT_DELAY, defender.burstDelay * 0.86);
        }
      });
      add("b", {
        id: "b-suppress",
        icon: "skill-rifle-suppress",
        tag: SchoolI18n.t("tag.rifle"),
        title: SchoolI18n.t("skill.b-suppress.title"),
        desc: SchoolI18n.t("skill.b-suppress.desc"),
        stat: SchoolI18n.t("skill.stat.slowDamage", {
          slowFrom: this.formatSeconds(rifle.slowDuration),
          slowTo: this.formatSeconds(rifle.slowDuration + 0.22),
          from: this.formatPercent(rifle.damageBoost),
          to: this.formatPercent(rifle.damageBoost * 1.08)
        }),
        available: rifle.slowDuration < 0.66,
        apply: () => {
          const defender = this.getDefenderById("b");
          defender.slowDuration += 0.22;
          defender.damageBoost *= 1.08;
        }
      });
      add("d", {
        id: "d-warhead",
        icon: "skill-rocket-warhead",
        tag: SchoolI18n.t("tag.rocket"),
        title: SchoolI18n.t("skill.d-warhead.title"),
        desc: SchoolI18n.t("skill.d-warhead.desc"),
        stat: SchoolI18n.t("skill.stat.rocketDamage", {
          from: this.formatPercent(rocket.damageBoost),
          to: this.formatPercent(rocket.damageBoost * 1.14)
        }),
        available: rocket.damageBoost < 2.2,
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.damageBoost *= 1.14;
        }
      });
      add("d", {
        id: "d-frost",
        icon: "skill-frost",
        tag: SchoolI18n.t("tag.rocket"),
        title: SchoolI18n.t("skill.d-frost.title"),
        desc: SchoolI18n.t("skill.d-frost.desc"),
        stat: SchoolI18n.t("skill.stat.slowDirect", {
          slowFrom: this.formatSeconds(rocket.slowDuration),
          slowTo: this.formatSeconds(rocket.slowDuration + 1.4),
          from: this.formatPercent(rocket.damageBoost),
          to: this.formatPercent(rocket.damageBoost * 1.22)
        }),
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.slowDuration += 1.4;
          defender.damageBoost *= 1.22;
        }
      });
      add("d", {
        id: "d-rocket",
        icon: "skill-rocket",
        tag: SchoolI18n.t("tag.rocket"),
        title: SchoolI18n.t("skill.d-rocket.title"),
        desc: SchoolI18n.t("skill.d-rocket.desc"),
        stat: SchoolI18n.t("skill.stat.radiusBlast", {
          from: Math.round(rocket.splashRadius * rocket.splashRadiusBoost),
          to: Math.round(rocket.splashRadius * rocket.splashRadiusBoost * 1.12),
          dmgFrom: this.formatPercent(rocket.splashDamageScale * rocket.splashDamageBoost),
          dmgTo: this.formatPercent(rocket.splashDamageScale * rocket.splashDamageBoost * 1.16)
        }),
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.splashRadiusBoost *= 1.12;
          defender.splashDamageBoost *= 1.16;
        }
      });
      add("d", {
        id: "d-impact",
        icon: "skill-rocket-impact",
        tag: SchoolI18n.t("tag.rocket"),
        title: SchoolI18n.t("skill.d-impact.title"),
        desc: SchoolI18n.t("skill.d-impact.desc"),
        stat: SchoolI18n.t("skill.stat.direct", {
          from: this.formatPercent(rocket.damageBoost),
          to: this.formatPercent(rocket.damageBoost * 1.28)
        }),
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.damageBoost *= 1.28;
        }
      });
      add("d", {
        id: "d-reload",
        icon: "skill-rocket-reload",
        tag: SchoolI18n.t("tag.rocket"),
        title: SchoolI18n.t("skill.d-reload.title"),
        desc: SchoolI18n.t("skill.d-reload.desc"),
        stat: SchoolI18n.t("skill.stat.interval", {
          from: this.formatSeconds(rocket.rate),
          to: this.formatSeconds(Math.max(rocket.baseRate * 0.58, rocket.rate * 0.82))
        }),
        available: rocket.rate > rocket.baseRate * 0.6,
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.rate = Math.max(defender.baseRate * 0.58, defender.rate * 0.82);
        }
      });
      add("e", {
        id: "e-caliber",
        icon: "skill-sniper-caliber",
        tag: SchoolI18n.t("tag.sniper"),
        title: SchoolI18n.t("skill.e-caliber.title"),
        desc: SchoolI18n.t("skill.e-caliber.desc"),
        stat: SchoolI18n.t("skill.stat.sniperDamage", {
          from: this.formatPercent(sniper.damageBoost),
          to: this.formatPercent(sniper.damageBoost * 1.13)
        }),
        available: sniper.damageBoost < 2.2,
        apply: () => {
          const defender = this.getDefenderById("e");
          defender.damageBoost *= 1.13;
        }
      });
      add("e", {
        id: "e-weakpoint",
        icon: "skill-sniper-weakpoint",
        tag: SchoolI18n.t("tag.sniper"),
        title: SchoolI18n.t("skill.e-weakpoint.title"),
        desc: SchoolI18n.t("skill.e-weakpoint.desc"),
        stat: SchoolI18n.t("skill.stat.crit", {
          critFrom: this.formatPercent(sniper.critChance),
          critTo: this.formatPercent(Math.min(0.78, sniper.critChance + 0.1)),
          dmgFrom: this.formatPercent(sniper.critMultiplier),
          dmgTo: this.formatPercent(sniper.critMultiplier + 0.45)
        }),
        apply: () => {
          const defender = this.getDefenderById("e");
          defender.critChance = Math.min(0.78, defender.critChance + 0.1);
          defender.critMultiplier += 0.45;
        }
      });
      add("e", {
        id: "e-sniper",
        icon: "skill-sniper",
        tag: SchoolI18n.t("tag.sniper"),
        title: SchoolI18n.t("skill.e-sniper.title"),
        desc: SchoolI18n.t("skill.e-sniper.desc"),
        stat: SchoolI18n.t("skill.stat.pierceSniper", {
          pierceFrom: sniper.pierce,
          pierceTo: sniper.pierce + 1,
          from: this.formatPercent(sniper.damageBoost),
          to: this.formatPercent(sniper.damageBoost * 1.16)
        }),
        apply: () => {
          const defender = this.getDefenderById("e");
          defender.pierce += 1;
          defender.damageBoost *= 1.16;
        }
      });
      add("e", {
        id: "e-reload",
        icon: "skill-sniper-reload",
        tag: SchoolI18n.t("tag.sniper"),
        title: SchoolI18n.t("skill.e-reload.title"),
        desc: SchoolI18n.t("skill.e-reload.desc"),
        stat: SchoolI18n.t("skill.stat.interval", {
          from: this.formatSeconds(sniper.rate),
          to: this.formatSeconds(Math.max(sniper.baseRate * 0.58, sniper.rate * 0.82))
        }),
        available: sniper.rate > sniper.baseRate * 0.6,
        apply: () => {
          const defender = this.getDefenderById("e");
          defender.rate = Math.max(defender.baseRate * 0.58, defender.rate * 0.82);
        }
      });
      add("f", {
        id: "f-fuel",
        icon: "skill-fire-fuel",
        tag: SchoolI18n.t("tag.fire"),
        title: SchoolI18n.t("skill.f-fuel.title"),
        desc: SchoolI18n.t("skill.f-fuel.desc"),
        stat: SchoolI18n.t("skill.stat.flame", {
          from: this.formatPercent(fire.fireZoneDamageScale),
          to: this.formatPercent(fire.fireZoneDamageScale + 0.045)
        }),
        available: fire.fireZoneDamageScale < 0.75,
        accent: SKILL_ACCENTS.fire,
        accentHex: SKILL_ACCENT_HEX.fire,
        apply: () => {
          const defender = this.getDefenderById("f");
          defender.fireZoneDamageScale += 0.045;
        }
      });
      add("f", {
        id: "f-zone",
        icon: "skill-rocket",
        tag: SchoolI18n.t("tag.fire"),
        title: SchoolI18n.t("skill.f-zone.title"),
        desc: SchoolI18n.t("skill.f-zone.desc"),
        stat: SchoolI18n.t("skill.stat.radiusZone", {
          from: Math.round(fire.fireZoneRadius),
          to: Math.round(fire.fireZoneRadius + 12),
          dmgFrom: this.formatPercent(fire.fireZoneDamageScale),
          dmgTo: this.formatPercent(fire.fireZoneDamageScale + 0.03)
        }),
        accent: SKILL_ACCENTS.fire,
        accentHex: SKILL_ACCENT_HEX.fire,
        apply: () => {
          const defender = this.getDefenderById("f");
          defender.fireZoneRadius += 12;
          defender.fireZoneDuration += 0.5;
          defender.fireZoneDamageScale += 0.03;
        }
      });
      add("f", {
        id: "f-bottle",
        icon: "skill-rocket-impact",
        tag: SchoolI18n.t("tag.fire"),
        title: SchoolI18n.t("skill.f-bottle.title"),
        desc: SchoolI18n.t("skill.f-bottle.desc"),
        stat: SchoolI18n.t("skill.stat.burnBase", {
          from: this.formatPercent(fire.damageBoost),
          to: this.formatPercent(fire.damageBoost * 1.14),
          dmgFrom: this.formatPercent(fire.fireZoneDamageScale),
          dmgTo: this.formatPercent(fire.fireZoneDamageScale + 0.02)
        }),
        available: fire.damageBoost < 2,
        accent: SKILL_ACCENTS.fire,
        accentHex: SKILL_ACCENT_HEX.fire,
        apply: () => {
          const defender = this.getDefenderById("f");
          defender.damageBoost *= 1.14;
          defender.fireZoneDamageScale += 0.02;
        }
      });
      add("f", {
        id: "f-sticky",
        icon: "skill-frost",
        tag: SchoolI18n.t("tag.fire"),
        title: SchoolI18n.t("skill.f-sticky.title"),
        desc: SchoolI18n.t("skill.f-sticky.desc"),
        stat: SchoolI18n.t("skill.stat.slowHold", {
          slowFrom: this.formatSeconds(fire.slowDuration),
          slowTo: this.formatSeconds(fire.slowDuration + 0.35),
          timeFrom: this.formatSeconds(fire.fireZoneDuration),
          timeTo: this.formatSeconds(fire.fireZoneDuration + 0.45)
        }),
        available: fire.slowDuration < 1.4,
        accent: SKILL_ACCENTS.fire,
        accentHex: SKILL_ACCENT_HEX.fire,
        apply: () => {
          const defender = this.getDefenderById("f");
          defender.slowDuration += 0.35;
          defender.fireZoneDuration += 0.45;
          defender.fireZoneDamageScale += 0.02;
        }
      });
      add("g", {
        id: "g-amplifier",
        icon: "skill-shock-amplifier",
        tag: SchoolI18n.t("tag.shock"),
        title: SchoolI18n.t("skill.g-amplifier.title"),
        desc: SchoolI18n.t("skill.g-amplifier.desc"),
        stat: SchoolI18n.t("skill.stat.shock", {
          from: this.formatPercent(shock.damageBoost),
          to: this.formatPercent(shock.damageBoost * 1.1)
        }),
        available: shock.damageBoost < 2.2,
        accent: SKILL_ACCENTS.shock,
        accentHex: SKILL_ACCENT_HEX.shock,
        apply: () => {
          const defender = this.getDefenderById("g");
          defender.damageBoost *= 1.1;
        }
      });
      add("g", {
        id: "g-voltage",
        icon: "skill-shock-amplifier",
        tag: SchoolI18n.t("tag.shock"),
        title: SchoolI18n.t("skill.g-voltage.title"),
        desc: SchoolI18n.t("skill.g-voltage.desc"),
        stat: SchoolI18n.t("skill.stat.stunChain", {
          stunFrom: this.formatSeconds(shock.stunDuration),
          stunTo: this.formatSeconds(Math.min(SHOCK_STUN_SKILL_MAX, shock.stunDuration + SHOCK_STUN_SKILL_GAIN)),
          from: this.formatPercent(shock.chainDamageScale),
          to: this.formatPercent(shock.chainDamageScale + 0.05)
        }),
        available: shock.stunDuration < SHOCK_STUN_SKILL_OFFER_LIMIT,
        accent: SKILL_ACCENTS.shock,
        accentHex: SKILL_ACCENT_HEX.shock,
        apply: () => {
          const defender = this.getDefenderById("g");
          defender.stunDuration = Math.min(SHOCK_STUN_SKILL_MAX, defender.stunDuration + SHOCK_STUN_SKILL_GAIN);
          defender.chainDamageScale += 0.05;
          defender.damageBoost *= 1.06;
        }
      });
      add("g", {
        id: "g-chain",
        icon: "skill-pierce",
        tag: SchoolI18n.t("tag.shock"),
        title: SchoolI18n.t("skill.g-chain.title"),
        desc: SchoolI18n.t("skill.g-chain.desc"),
        stat: SchoolI18n.t("skill.stat.chainRadius", {
          from: shock.chainJumps,
          to: shock.chainJumps + 1,
          radiusFrom: Math.round(shock.chainRadius),
          radiusTo: Math.round(shock.chainRadius + 18)
        }),
        available: shock.chainJumps < 4,
        accent: SKILL_ACCENTS.shock,
        accentHex: SKILL_ACCENT_HEX.shock,
        apply: () => {
          const defender = this.getDefenderById("g");
          defender.chainJumps += 1;
          defender.chainRadius += 18;
          defender.rate = Math.max(defender.baseRate * 0.66, defender.rate * 0.9);
        }
      });
      add("g", {
        id: "g-overload",
        icon: "skill-barrage",
        tag: SchoolI18n.t("tag.shock"),
        title: SchoolI18n.t("skill.g-overload.title"),
        desc: SchoolI18n.t("skill.g-overload.desc"),
        stat: SchoolI18n.t("skill.stat.crit", {
          critFrom: this.formatPercent(shock.critChance),
          critTo: this.formatPercent(Math.min(0.64, shock.critChance + 0.09)),
          dmgFrom: this.formatPercent(shock.critMultiplier),
          dmgTo: this.formatPercent(shock.critMultiplier + 0.3)
        }),
        accent: SKILL_ACCENTS.shock,
        accentHex: SKILL_ACCENT_HEX.shock,
        apply: () => {
          const defender = this.getDefenderById("g");
          defender.critChance = Math.min(0.64, defender.critChance + 0.09);
          defender.critMultiplier += 0.3;
          defender.damageBoost *= 1.08;
        }
      });
      add("h", {
        id: "h-nail",
        icon: "skill-engineer-nail",
        tag: SchoolI18n.t("tag.engineer"),
        title: SchoolI18n.t("skill.h-nail.title"),
        desc: SchoolI18n.t("skill.h-nail.desc"),
        stat: SchoolI18n.t("skill.stat.nail", {
          from: this.formatPercent(engineer.damageBoost),
          to: this.formatPercent(engineer.damageBoost * 1.12)
        }),
        available: engineer.damageBoost < 2.2,
        accent: SKILL_ACCENTS.engineer,
        accentHex: SKILL_ACCENT_HEX.engineer,
        apply: () => {
          const defender = this.getDefenderById("h");
          defender.damageBoost *= 1.12;
        }
      });
      add("h", {
        id: "h-turret",
        icon: "skill-barrage",
        tag: SchoolI18n.t("tag.engineer"),
        title: (this.turrets?.length || 0) > 0 ? SchoolI18n.t("skill.h-turret.titleOwned") : SchoolI18n.t("skill.h-turret.title"),
        desc: SchoolI18n.t("skill.h-turret.desc"),
        stat: SchoolI18n.t((this.turrets?.length || 0) > 0 ? "skill.stat.turretOwned" : "skill.stat.turretNew", {
          from: this.formatPercent(engineer.turretDamageBoost),
          to: this.formatPercent(engineer.turretDamageBoost * 1.08)
        }),
        accent: SKILL_ACCENTS.engineer,
        accentHex: SKILL_ACCENT_HEX.engineer,
        apply: () => {
          const defender = this.getDefenderById("h");
          defender.turretDamageBoost *= 1.08;
          defender.turretRateBoost *= 1.05;
          this.createEngineerTurret(defender);
        }
      });
      add("h", {
        id: "h-wire",
        icon: "skill-pierce",
        tag: SchoolI18n.t("tag.engineer"),
        title: this.barbedWire ? SchoolI18n.t("skill.h-wire.titleOwned") : SchoolI18n.t("skill.h-wire.title"),
        desc: SchoolI18n.t("skill.h-wire.desc"),
        stat: SchoolI18n.t("skill.stat.wire", {
          from: this.formatPercent(engineer.wireDamageBoost),
          to: this.formatPercent(engineer.wireDamageBoost * 1.12),
          slowFrom: this.formatPercent(engineer.wireSlowBoost),
          slowTo: this.formatPercent(engineer.wireSlowBoost * 1.08)
        }),
        accent: SKILL_ACCENTS.engineer,
        accentHex: SKILL_ACCENT_HEX.engineer,
        apply: () => {
          const defender = this.getDefenderById("h");
          defender.wireDamageBoost *= 1.12;
          defender.wireSlowBoost *= 1.08;
          this.reinforceBarbedWire(defender);
        }
      });
      const barricadeRepair = Math.round(this.maxCoreHp * 0.1 * (engineer.barricadeRepairBoost || 1));
      const barricadeShield = Math.round(this.maxCoreHp * 0.08 * (engineer.barricadeShieldBoost || 1));
      add("h", {
        id: "h-barricade",
        icon: "skill-max-hp",
        tag: SchoolI18n.t("tag.engineer"),
        title: SchoolI18n.t("skill.h-barricade.title"),
        desc: SchoolI18n.t("skill.h-barricade.desc"),
        stat: SchoolI18n.t("skill.stat.barricade", {
          hpFrom: Math.round(this.coreHp),
          hpTo: Math.min(Math.round(this.maxCoreHp), Math.round(this.coreHp + barricadeRepair)),
          hpMax: Math.round(this.maxCoreHp),
          shieldFrom: Math.round(this.shield),
          shieldTo: Math.round(this.shield + barricadeShield)
        }),
        accent: SKILL_ACCENTS.engineer,
        accentHex: SKILL_ACCENT_HEX.engineer,
        apply: () => {
          const defender = this.getDefenderById("h");
          this.coreHp = clamp(this.coreHp + barricadeRepair, 0, this.maxCoreHp);
          this.shield += barricadeShield;
          defender.damageBoost *= 1.06;
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
          tag: SchoolI18n.t("tag.defense"),
          title: SchoolI18n.t("skill.core.title"),
          desc: SchoolI18n.t("skill.core.desc"),
          stat: `HP ${currentHp}/${maxHp} → ${maxHp}/${maxHp}`,
          accent: SKILL_ACCENTS["core-full-repair"],
          accentHex: SKILL_ACCENT_HEX["core-full-repair"],
          sfx: "core_full_repair",
          toast: SchoolI18n.t("skill.core.toast"),
          apply: () => {
            this.coreHp = this.maxCoreHp;
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
      const urgentCommon = this.coreHp < this.maxCoreHp * 0.45;
      const shouldOfferCommon = urgentCommon || Math.random() < 0.22;
      if (chosen.length < 3 && commonPool.length > 0 && shouldOfferCommon) {
        const index = Math.floor(Math.random() * commonPool.length);
        chosen.push(commonPool.splice(index, 1)[0]);
      }
      const availablePool = [...characterPool, ...(urgentCommon ? commonPool : [])];
      while (chosen.length < 3 && availablePool.length > 0) {
        const index = Math.floor(Math.random() * availablePool.length);
        chosen.push(availablePool.splice(index, 1)[0]);
      }
      while (chosen.length < 3 && commonPool.length > 0) {
        const index = Math.floor(Math.random() * commonPool.length);
        chosen.push(commonPool.splice(index, 1)[0]);
      }
      return chosen;
    }

    addWideSkillCard(x, y, upgrade, index = 0) {
      const accent = fieldAccent(upgrade.accent || SKILL_ACCENTS[upgrade.id] || COLORS.gold);
      const accentHex = "#d5c5a1";
      const isRecruit = Boolean(upgrade.characterTexture);
      const recruitPortraitTexture = isRecruit ? (upgrade.portraitTexture || upgrade.icon || upgrade.characterTexture) : null;
      const ownerTexture = upgrade.ownerCharacterTexture;
      const hasOwnerCharacter = Boolean(ownerTexture && !isRecruit && this.textures.exists(ownerTexture));
      const panel = this.addCommandPanel(x, y, 452, 150, 523, accent, {
        alpha: 0.92,
        shadowAlpha: 0.42,
        track: false
      });
      const accentRail = this.add.rectangle(x - 215, y, 3, 64, accent, 0.65).setDepth(525);
      const portraitHalo = this.add.rectangle(x - 166, y, 94, 94, 0x11120f, 0.78)
        .setStrokeStyle(1, UI_COLORS.steel, 0.6)
        .setDepth(525);
      const icon = this.add.image(x - 166, y, isRecruit ? recruitPortraitTexture : upgrade.icon).setDepth(526);
      icon.setDisplaySize(isRecruit ? 92 : 78, isRecruit ? 92 : 78);
      const iconBaseScaleX = icon.scaleX;
      const iconBaseScaleY = icon.scaleY;
      const ownerHalo = hasOwnerCharacter
        ? this.add.circle(x - 142, y + 34, 21, 0x11120f, 0.92).setStrokeStyle(1, UI_COLORS.steel, 0.65).setDepth(526)
        : null;
      const ownerCharacter = hasOwnerCharacter
        ? this.add.image(x - 142, y + 34, ownerTexture).setDisplaySize(38, 38).setDepth(527)
        : null;
      const tagBg = this.add.rectangle(x - 64, y - 51, 86, 24, accent, 0.2)
        .setStrokeStyle(1, accent, 0.72)
        .setDepth(525);
      const tagText = this.add.text(x - 64, y - 51, upgrade.tag || (isRecruit ? SchoolI18n.t("tag.recruit") : SchoolI18n.t("tag.tactic")), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 13,
        fontStyle: "800",
        color: accentHex,
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(0.5).setDepth(526);
      const title = this.add.text(x - 110, y - 33, upgrade.title, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 20,
        wordWrap: { width: 174, useAdvancedWrap: true },
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(0, 0).setDepth(526);
      const desc = this.add.text(x - 110, y - 33 + title.height + 8, upgrade.desc, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 15,
        fontStyle: "800",
        color: "#c6c4b5",
        stroke: "#030607",
        strokeThickness: 1,
        lineSpacing: 3,
        wordWrap: { width: 174, useAdvancedWrap: true }
      }).setOrigin(0, 0).setDepth(526);
      const statLines = upgrade.stat ? String(upgrade.stat).split("\n").length : 0;
      const statPanel = this.addCommandPanel(x + 132, y - 10, 128, statLines > 1 ? 70 : 58, 525, accent, {
        alpha: 0.7,
        shadowAlpha: 0.18,
        track: false
      });
      const statText = upgrade.stat
        ? this.add.text(x + 132, y - 10, upgrade.stat, {
          resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
          fontSize: statLines > 1 ? 12 : 14,
          fontStyle: "800",
          color: accentHex,
          align: "center",
          lineSpacing: 3,
          wordWrap: { width: 112, useAdvancedWrap: true }
        }).setOrigin(0.5).setDepth(527)
        : this.add.text(x + 132, y - 10, SchoolI18n.t("skill.now"), {
          resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
          fontSize: 14,
          fontStyle: "800",
          color: accentHex
        }).setOrigin(0.5).setDepth(527);
      const chooseBg = this.addSurfaceImage(x + 132, y + 49, 122, 38, "button")
        .setDepth(526);
      const chooseText = this.add.text(x + 132, y + 49, SchoolI18n.t("skill.choose"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 17,
        fontStyle: "800",
        color: "#eee6d2",
        stroke: "#030607",
        strokeThickness: 1
      }).setOrigin(0.5).setDepth(527);
      const keyBadge = this.add.rectangle(x + 205, y - 58, 28, 26, UI_COLORS.panelRaised, 0.92)
        .setStrokeStyle(1, UI_COLORS.steel, 0.7)
        .setDepth(527);
      const keyText = this.add.text(x + 205, y - 58, `${index + 1}`, {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fontStyle: "800",
        color: accentHex
      }).setOrigin(0.5).setDepth(528);
      const hit = this.add.rectangle(x, y, 456, 156, 0xeee6d2, 0)
        .setDepth(529)
        .setInteractive({ useHandCursor: true });
      const animated = [
        ...panel.objects,
        accentRail,
        portraitHalo,
        icon,
        ownerHalo,
        ownerCharacter,
        tagBg,
        tagText,
        title,
        desc,
        ...statPanel.objects,
        statText,
        chooseBg,
        chooseText,
        keyBadge,
        keyText
      ].filter(Boolean);
      if (!this.reducedMotion) {
        animated.forEach((item, itemIndex) => {
          const targetY = item.y;
          const targetAlpha = item.alpha;
          item.setY(targetY + 18).setAlpha(0);
          this.tweens.add({
            targets: item,
            y: targetY,
            alpha: targetAlpha,
            duration: 340,
            delay: 90 + index * 90 + itemIndex * 3,
            ease: "Cubic.easeOut"
          });
        });
      }
      const setHover = (active) => {
        panel.wash.setAlpha(active ? 0.085 : 0);
        portraitHalo.setScale(active ? 1.05 : 1);
        icon.setScale(
          iconBaseScaleX * (active ? 1.035 : 1),
          iconBaseScaleY * (active ? 1.035 : 1)
        );
        chooseBg.setTint(active ? 0xffffff : 0xcacbc1);
        chooseText.setScale(active ? 1.04 : 1);
      };
      this.skillChoiceFocusHandlers[index] = setHover;
      hit.on("pointerdown", () => this.applyUpgrade(upgrade));
      hit.on("pointerover", () => this.setSkillChoiceFocus(index));
      hit.on("pointerout", () => setHover(this.skillChoiceFocusIndex === index));
      [chooseBg, chooseText].forEach((item) => {
        item.setInteractive({ useHandCursor: true });
        item.on("pointerdown", () => this.applyUpgrade(upgrade));
        item.on("pointerover", () => this.setSkillChoiceFocus(index));
        item.on("pointerout", () => setHover(this.skillChoiceFocusIndex === index));
      });
      const objects = [...animated, hit];
      this.overlayObjects.push(...objects);
      this.skillChoiceCardObjects?.push(...objects);
      return objects;
    }

    addSkillCard(x, y, upgrade, index = 0) {
      const accent = fieldAccent(upgrade.accent || SKILL_ACCENTS[upgrade.id] || COLORS.gold);
      const accentHex = "#d5c5a1";
      const isRecruit = Boolean(upgrade.characterTexture);
      const recruitPortraitTexture = isRecruit ? (upgrade.portraitTexture || upgrade.icon || upgrade.characterTexture) : null;
      const isCommonSkill = upgrade.common === true;
      const ownerTexture = upgrade.ownerCharacterTexture;
      const hasOwnerCharacter = Boolean(ownerTexture && !isRecruit && this.textures.exists(ownerTexture));
      const isOwnerSkill = hasOwnerCharacter && !isRecruit;
      const tagY = isOwnerSkill ? y - 42 : isCommonSkill ? y - 8 : y + 24;
      const titleY = isOwnerSkill ? y - 9 : isCommonSkill ? y + 24 : y + 58;
      const descY = isOwnerSkill ? y + 52 : isCommonSkill ? y + 66 : y + 90;
      const statY = isOwnerSkill ? y + 112 : isCommonSkill ? y + 122 : y + 123;
      const chooseY = isOwnerSkill ? y + 150 : isCommonSkill ? y + 156 : y + 153;
      const shadow = this.add.rectangle(x, y + 15, 154, 320, 0x000000, 0.44).setDepth(523);
      const glow = this.add.ellipse(x, y - 74, 138, 206, accent, 0).setDepth(523.5);
      const card = this.addSurfaceImage(x, y, 166, 336).setDepth(524);
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
        ? this.add.circle(x, y - 74, 58, accent, 0.16).setStrokeStyle(1, UI_COLORS.steel, 0.65).setDepth(527)
        : this.add.circle(iconX, y - 112, 40, 0x000000, 0.58).setStrokeStyle(1, UI_COLORS.steel, 0.65).setDepth(527);
      const ownerHalo = hasOwnerCharacter
        ? this.add.circle(x + 49, y - 104, 33, 0x000000, 0.54).setStrokeStyle(1, UI_COLORS.steel, 0.65).setDepth(527)
        : null;
      const ownerCharacter = hasOwnerCharacter
        ? this.add.image(x + 49, y - 104, ownerTexture).setAlpha(0.96).setDepth(528)
        : null;
      if (ownerCharacter) {
        ownerCharacter.setDisplaySize(62, 62);
      }
      const icon = this.add.image(iconX, isRecruit ? y - 74 : y - 112, isRecruit ? recruitPortraitTexture : upgrade.icon).setDepth(528);
      if (isRecruit) {
        icon.setDisplaySize(118, 118);
      } else {
        icon.setDisplaySize(hasOwnerCharacter ? 66 : 74, hasOwnerCharacter ? 66 : 74);
      }
      const infoPanel = isOwnerSkill
        ? this.add.rectangle(x, y + 64, 134, 114, 0x20221d, 0.58)
          .setStrokeStyle(1, accent, 0.28)
          .setDepth(527)
        : null;
      const tagBg = this.add.rectangle(x, tagY, isOwnerSkill ? 84 : 76, 24, accent, 0.2)
        .setStrokeStyle(1, accent, 0.78)
        .setDepth(528);
      const tagText = this.add.text(x, tagY, upgrade.tag || SchoolI18n.t("tag.tactic"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 12,
        fontStyle: "900",
        color: accentHex,
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(529);
      const title = this.add.text(x, titleY, upgrade.title, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: isOwnerSkill ? 18 : isCommonSkill ? 17 : 19,
        fontStyle: "900",
        color: "#eee6d2",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(529);
      const desc = this.add.text(x, descY, upgrade.desc, {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: isCommonSkill ? 12 : 13,
        fontStyle: "900",
        color: "#c6c4b5",
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
          resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
          fontSize: statLines > 1 ? 11 : 12,
          fontStyle: "900",
          color: accentHex,
          align: "center",
          lineSpacing: 2,
          wordWrap: { width: 124, useAdvancedWrap: true }
        }).setOrigin(0.5).setDepth(530)
        : null;
      const chooseBg = this.add.rectangle(x, chooseY, 104, 30, 0x25271f, 0.9)
        .setStrokeStyle(1, accent, 0.85)
        .setDepth(529);
      const chooseText = this.add.text(x, chooseY, SchoolI18n.t("skill.choose"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 14,
        fontStyle: "900",
        color: "#eee6d2",
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

      animated.forEach((item, itemIndex) => {
        const targetY = item.y;
        const targetAlpha = item.alpha;
        item.setY(targetY + 24).setAlpha(0);
        this.tweens.add({
          targets: item,
          y: targetY,
          alpha: targetAlpha,
          duration: 390,
          delay: 120 + index * 95 + itemIndex * 5,
          ease: "Cubic.easeOut"
        });
      });

      const selectUpgrade = () => this.applyUpgrade(upgrade);
      const setHover = (active) => {
        glow.setAlpha(0);
        watermark.setAlpha(active ? 0.18 : isRecruit ? 0.08 : 0.1);
        if (ownerCharacter) {
          ownerCharacter.setAlpha(active ? 1 : 0.96);
        }
        chooseBg.setFillStyle(active ? accent : 0x25271f, active ? 0.34 : 0.9);
        if (active) {
          card.setTint(0xffffff);
        } else {
          card.setTint(0xd8d8ce);
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
      const objects = [...animated, hit];
      objects.forEach((item) => this.overlayObjects.push(item));
      if (this.skillChoiceCardObjects) {
        this.skillChoiceCardObjects.push(...objects);
      }
      return objects;
    }

    getUpgradeCharacterKey(id) {
      const map = {
        barrage: "character-b-up",
        barrel: "character-b-right",
        frost: "character-d-up",
        pierce: "character-c-up",
        rally: "character-a-up",
        repair: "character-e-right",
        squad: "character-d-right",
        fire: "character-f-up",
        shock: "character-g-up",
        engineer: "character-h-up"
      };
      return map[id] || "character-c-up";
    }

    applyUpgrade(upgrade) {
      if (this.mode !== "skill") {
        return;
      }
      this.unlockAudio();
      this.playSfx(upgrade.sfx || "skill");
      upgrade.apply();
      this.clearOverlay();
      this.mode = "playing";
      const accent = upgrade.accent || SKILL_ACCENTS[upgrade.id] || COLORS.gold;
      this.createScreenPulse(accent);
      if (!upgrade.suppressToast) {
        this.showToast(upgrade.toast || SchoolI18n.t("skill.applied", { title: upgrade.title }), accent);
      }
      this.updateHud();
    }

    addGameOverBackdrop() {
      const items = this.overlayObjects;
      const backdrop = this.add.image(270, 480, "gameover-last-stand")
        .setDisplaySize(540, 960)
        .setAlpha(0)
        .setDepth(540);
      const backdropScaleX = backdrop.scaleX;
      const backdropScaleY = backdrop.scaleY;
      backdrop.setScale(backdropScaleX * 1.045, backdropScaleY * 1.045);
      const veil = this.add.rectangle(270, 480, 540, 960, 0x030405, 0.14)
        .setAlpha(0)
        .setDepth(541);
      items.push(backdrop, veil);
      if (this.reducedMotion) {
        backdrop.setScale(backdropScaleX, backdropScaleY).setAlpha(1);
        veil.setAlpha(1);
      } else {
        this.tweens.add({
          targets: backdrop,
          scaleX: backdropScaleX,
          scaleY: backdropScaleY,
          alpha: 1,
          duration: 820,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: veil,
          alpha: 1,
          duration: 520,
          ease: "Cubic.easeOut"
        });
      }
    }

    async gameOver() {
      if (this.mode === "gameover") {
        return;
      }
      this.mode = "gameover";
      announceGameStatus(SchoolI18n.t("over.a11y", { level: this.level, kills: this.kills }));
      this.setGameSpeed(DEFAULT_GAME_SPEED);
      this.cancelRunTimers();
      this.cancelSceneTimers();
      this.clearTransientObjects();
      this.playSfx("game_over", 1);
      this.startBgm("menu");
      this.clearRunEntities();
      this.clearOverlay();
      this.addGameOverBackdrop();
      let earnedCoins = 0;
      const rankPrepLayer = this.showRankPrepLayer();
      try {
        earnedCoins = await this.bankRunCoins();
      } finally {
        this.removeRankPrepLayer(rankPrepLayer);
      }
      const rankSnapshot = this.getRankSnapshot(earnedCoins);
      this.lastRankableRun = rankSnapshot.score > 0 ? rankSnapshot : null;
      const items = this.overlayObjects;
      const summaryPanel = this.addSurfaceImage(270, 166, 424, 236).setAlpha(0.9)
        .setDepth(542);
      const summaryLine = this.add.rectangle(270, 62, 300, 4, 0xbf7963, 0.9).setDepth(543);
      const summaryTitle = this.add.text(270, 98, SchoolI18n.t("over.title"), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 42,
        fontStyle: "900",
        color: "#bf7963",
        stroke: "#050607",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(544);
      const summaryWave = this.add.text(270, 146, SchoolI18n.t("over.wave", { level: this.level, kills: this.kills }), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 22,
        fontStyle: "900",
        color: "#eee6d2",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(544);
      const summaryStage = this.add.text(270, 182, SchoolI18n.t("over.stage", { score: rankSnapshot.score, reached: rankSnapshot.reachedStage }), {
        resolution: 2, fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 19,
        fontStyle: "900",
        color: "#c5b995",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(544);
      const summaryCoins = this.add.text(270, 216, SchoolI18n.t(this.runCoinsQueued ? "over.coinsPending" : "over.coins", { earned: this.runCoinsQueued ? this.coins : earnedCoins, held: this.meta.coins }), {
        resolution: 2, fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#d5b675",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(544);
      this.gameOverCoinsText = summaryCoins;
      const summaryObjects = [summaryPanel, summaryLine, summaryTitle, summaryWave, summaryStage, summaryCoins];
      items.push(...summaryObjects);
      this.animateOverlayEntrance(summaryObjects, 60, 20, 420);
      if (this.lastRankableRun) {
        this.showRankNameLayer(this.lastRankableRun, {
          inlineGameOver: true,
          returnToMenuOnSuccess: true
        });
      } else {
        this.addOverlayButton(270, 286, 184, 52, SchoolI18n.t("over.menu"), 545, () => this.returnToGameStart(), COLORS.gold);
      }
    }

    clearOverlay() {
      this.shopUI?.destroy();
      this.shopUI = null;
      this.removeRankPrepLayer();
      this.removeRankNameLayer();
      this.clearShopActionLoading();
      this.overlayObjects.forEach((item) => {
        this.destroyGameObject(item);
      });
      this.overlayObjects = [];
      this.skillChoiceCardObjects = [];
      this.currentSkillChoices = [];
      this.skillChoiceFocusHandlers = [];
      this.skillChoiceFocusIndex = 0;
      this.skillRerollButtonObjects = null;
      this.shopResetNoticeObjects = null;
    }

    updateHud() {
      this.ui.timer.setText(formatRunClock(this.elapsed));
      const stageName = [SchoolI18n.t("stage.gate"), SchoolI18n.t("stage.hall"), SchoolI18n.t("stage.class"), SchoolI18n.t("stage.roof")][Math.min(3, this.stage - 1)];
      this.ui.stage.setText(SchoolI18n.t("stage.line", { stage: String(this.stage).padStart(2, "0"), name: stageName }));
      this.ui.level.setText(`WAVE ${String(this.level).padStart(2, "0")} · ${this.killsInLevel} / ${this.levelNeed}`);
      this.ui.core.setText(`${Math.round(this.coreHp)} / ${this.maxCoreHp}`);
      this.ui.coins.setText(`$${this.getDisplayedCoins()}`);
      const progress = clamp(this.killsInLevel / this.levelNeed, 0, 1);
      this.progressBar.setSize(506 * progress, 6);
      this.progressBar.setFillStyle(UI_COLORS.amber, 1);
      const hpRate = clamp(this.coreHp / this.maxCoreHp, 0, 1);
      this.coreBar.setSize(380 * hpRate, 7);
      this.coreBar.setFillStyle(hpRate < 0.35 ? UI_COLORS.danger : hpRate < 0.68 ? UI_COLORS.amber : UI_COLORS.success, 1);
      const shieldValue = Math.max(0, Math.round(this.shield));
      const shieldRate = clamp(this.shield / this.maxCoreHp, 0, 1);
      const hasShield = shieldValue > 0;
      this.ui.shield.setText(`SHIELD +${shieldValue}`).setVisible(hasShield);
      this.shieldBar.setSize(380 * shieldRate, 3).setVisible(hasShield);
      const threatLabel = hpRate < 0.35
        ? SchoolI18n.t("hud.collapse")
        : hpRate < 0.68
          ? SchoolI18n.t("hud.pressure")
          : SchoolI18n.t("hud.stable");
      this.ui.threat.setText(threatLabel);
      this.ui.threat.setColor(hpRate < 0.35 ? "#ff7771" : hpRate < 0.68 ? "#d5b675" : "#b4c097");
    }
  }

  if (!window.Phaser) {
    const root = document.getElementById("game-root");
    if (root) {
      root.innerHTML = `<div class="loading">${SchoolI18n.t("loading.phaserFailed")}</div>`;
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
    let stableViewportSize = null;

    const readViewportSize = () => {
      const viewport = window.visualViewport;
      return {
        width: Math.max(1, Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || GAME_WIDTH)),
        height: Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || GAME_HEIGHT))
      };
    };

    const isRankEntryOpen = () => Boolean(document.querySelector(".school-zombie-rank-layer"));

    const getViewportSize = () => {
      const size = readViewportSize();
      if (!isRankEntryOpen()) {
        stableViewportSize = size;
        return size;
      }
      // Preserve height while the mobile keyboard opens, but accept real width
      // changes even if a nickname dialog is already open during a resize.
      if (!stableViewportSize || Math.abs(size.width - stableViewportSize.width) > 2) {
        stableViewportSize = size;
      }
      return stableViewportSize;
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
    const handleOrientationChange = () => {
      stableViewportSize = null;
      scheduleSettled();
    };
    window.addEventListener("orientationchange", handleOrientationChange, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleSettled, { passive: true });
      window.visualViewport.addEventListener("scroll", schedule, { passive: true });
    }
    if (shell && window.ResizeObserver) {
      observer = new ResizeObserver(schedule);
      observer.observe(shell);
    }
    window.__schoolZombieResizeObserver = observer;
    window.__schoolZombieViewportRefresh = scheduleSettled;
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
      window.removeEventListener("orientationchange", handleOrientationChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", scheduleSettled);
        window.visualViewport.removeEventListener("scroll", schedule);
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      window.__schoolZombieResizeObserver = null;
      window.__schoolZombieViewportRefresh = null;
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
    audio: {
      noAudio: true
    },
    scene: [BootScene, GameScene]
  };

  window.__schoolZombiePhaserVersion = Phaser.VERSION;
  if (window.__schoolZombieDefense && typeof window.__schoolZombieDefense.destroy === "function") {
    try {
      window.__schoolZombieDefense.destroy(true);
    } catch (error) {
      // Keep reloads resilient if Phaser is already mid-shutdown.
    }
  }
  window.__schoolZombieDefense = new Phaser.Game(config);
  installResponsiveViewport(window.__schoolZombieDefense);
})();
