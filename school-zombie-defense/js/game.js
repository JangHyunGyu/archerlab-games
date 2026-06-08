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
  const BASE_CRIT_CHANCE = 0.08;
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
    "projectile-arrow": 0.38,
    "projectile-pistol": 0.32,
    "projectile-rifle": 0.34,
    "projectile-rocket": 0.38,
    "projectile-sniper": 0.34,
    "projectile-frost": 0.78,
    "projectile-support": 0.78,
    "projectile-shock": 0.62
  };
  const STARTING_LEVEL_NEED = 12;
  const STARTING_SPAWN_TIMER = 1.15;
  const SKILL_ACCENTS = {
    pierce: 0xbef6ff,
    barrel: 0xffc768,
    rally: 0xff7fb7,
    repair: 0x7dff8d,
    barrage: 0xff8d42,
    squad: 0xc38dff,
    frost: 0x91f7ff,
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
      damageScale: 0.42,
      role: "rally",
      projectile: "projectile-arrow",
      speed: 860,
      rate: 1.08,
      aim: { pivot: [0, -134], reach: 38 },
      recruit: {
        icon: "portrait-rally",
        tag: "활",
        title: "활 지원 합류",
        desc: "화살 지원 사격\n격려 스킬 해금"
      }
    },
    {
      id: "b",
      x: 158,
      y: 924,
      height: 230,
      damageScale: 0.86,
      role: "barrage",
      projectile: "projectile-rifle",
      speed: 1020,
      rate: 0.78,
      burstCount: 3,
      burstDelay: 70,
      aim: { pivot: [2, -146], reach: 52 },
      recruit: {
        icon: "portrait-barrage",
        tag: "소총",
        title: "소총 지원 합류",
        desc: "3연발 지원 사격\n유탄 스킬 해금"
      }
    },
    {
      id: "c",
      x: 270,
      y: 925,
      height: 248,
      damageScale: 1,
      role: "player",
      projectile: "projectile-pistol",
      speed: 900,
      rate: 0.33,
      aim: { pivot: [0, -158], reach: 48 }
    },
    {
      id: "d",
      x: 382,
      y: 925,
      height: 226,
      damageScale: 0.78,
      role: "frost",
      projectile: "projectile-rocket",
      speed: 720,
      rate: 1.16,
      splashRadius: 78,
      splashDamageScale: 0.78,
      aim: { pivot: [2, -145], reach: 56 },
      recruit: {
        icon: "portrait-frost",
        tag: "로켓",
        title: "로켓 지원 합류",
        desc: "폭발 로켓 사격\n냉각 스킬 해금"
      }
    },
    {
      id: "e",
      x: 488,
      y: 924,
      height: 205,
      damageScale: 0.72,
      role: "repair",
      projectile: "projectile-sniper",
      speed: 1180,
      rate: 1.24,
      pierce: 2,
      aim: { pivot: [2, -132], reach: 64 },
      recruit: {
        icon: "portrait-repair",
        tag: "저격",
        title: "저격 지원 합류",
        desc: "관통 저격 사격\n수리 스킬 해금"
      }
    }
  ];
  const SKILL_OWNER_BY_ID = {
    rally: "a",
    barrage: "b",
    frost: "d",
    repair: "e"
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
    const source = scene.textures.get("zombie-walk").getSourceImage();
    const cellWidth = Math.floor(source.width / 4);
    const cellHeight = Math.floor(source.height / 4);
    for (let variant = 0; variant < 4; variant += 1) {
      for (let frame = 0; frame < 4; frame += 1) {
        makeImageSliceTexture(
          scene,
          "zombie-walk",
          `zombie-walk-${variant}-${frame}`,
          frame * cellWidth,
          variant * cellHeight,
          cellWidth,
          cellHeight
        );
      }
    }
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

  function createUiTextures(scene) {
    makeImageSliceTexture(scene, "ui-frame-sheet", "ui-top-hud", 42, 70, 1688, 230);
    makeImageSliceTexture(scene, "ui-frame-sheet", "ui-hero-panel", 50, 328, 1110, 250);
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
      ["portrait-frost", { glow: "#a6f6ff", dark: "#123c6c", skin: "#d0a886", hair: "#493b83", body: "#eef5f4" }, "3"],
      ["portrait-barrage", { glow: "#ffd07a", dark: "#7d241a", skin: "#e2aa76", hair: "#d5b243", body: "#eaeef0" }, "3"],
      ["portrait-rally", { glow: "#ff9ac3", dark: "#792644", skin: "#efb8a8", hair: "#e46d91", body: "#edf3ef" }, "3"],
      ["portrait-repair", { glow: "#9df89e", dark: "#173d28", skin: "#dfae86", hair: "#9a6537", body: "#ecf3ee" }, "2"]
    ].forEach(([key, palette, label]) => {
      makeCanvasTexture(scene, key, 76, 76, (ctx) => drawPortrait(ctx, 76, 76, palette, label));
    });

    ["frost", "barrage", "rally", "repair", "pierce", "barrel", "squad"].forEach((type) => {
      makeCanvasTexture(scene, `skill-${type}`, 72, 72, (ctx) => drawSkillIcon(ctx, 72, 72, type));
    });
  }

  class BootScene extends Phaser.Scene {
    constructor() {
      super("BootScene");
    }

    preload() {
      this.load.image("bg-corridor", "assets/images/corridor-battlefield.png");
      this.load.image("skill-choice-backdrop", "assets/images/skill-choice-backdrop.png");
      this.load.image("premium-skill-card", "assets/images/premium-skill-card.png");
      this.load.image("character-a", "assets/images/character-a.png");
      this.load.image("character-b", "assets/images/character-b.png");
      this.load.image("character-c", "assets/images/character-c.png");
      this.load.image("character-d", "assets/images/character-d.png");
      this.load.image("character-e", "assets/images/character-e.png");
      this.load.image("projectile-arrow", "assets/images/projectile-arrow.png");
      this.load.image("projectile-pistol", "assets/images/projectile-pistol.png");
      this.load.image("projectile-rifle", "assets/images/projectile-rifle.png");
      this.load.image("projectile-rocket", "assets/images/projectile-rocket.png");
      this.load.image("projectile-sniper", "assets/images/projectile-sniper.png");
      this.load.image("zombie-walk", "assets/images/zombie-walk.png");
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
        barricade: 704,
        survivorLine: 824,
        bottom: 920
      };

      this.zombies = [];
      this.bullets = [];
      this.effects = [];
      this.defenders = [];
      this.skillButtons = [];
      this.overlayObjects = [];
      this.recruitedDefenders = new Set(["c"]);
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
      this.shield = 0;
      this.damage = 28;
      this.playerFireTimer = 0;
      this.rallyTimer = 0;
      this.focusPoint = null;
      this.speedMultiplier = 1;
      this.pausedByButton = false;

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

      this.time.delayedCall(250, () => {
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
          this.time.delayedCall(550, () => {
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
        const sprite = this.add.image(defender.x, defender.y, `character-${defender.id}-aim-12`)
          .setOrigin(0.5, 1)
          .setDepth(142 + defender.y / 10);
        this.fitSpriteHeight(sprite, defender.height);
        sprite.setVisible(recruited).setAlpha(recruited ? 1 : 0);
        this.defenders.push({
          x: defender.x,
          y: defender.y,
          height: defender.height,
          aim: defender.aim,
          pose: "aim-12",
          firePoseTimer: 0,
          id: defender.id,
          sprite,
          role: defender.role,
          rate: defender.rate,
          baseRate: defender.rate,
          recruited,
          damageBoost: 1,
          pierce: defender.pierce || 0,
          basePierce: defender.pierce || 0,
          critChance: BASE_CRIT_CHANCE,
          rocketEvery: 0,
          shotsSinceRocket: 0,
          skillPower: 1,
          burstCount: defender.burstCount || 1,
          burstDelay: defender.burstDelay || 0,
          splashRadius: defender.splashRadius || 0,
          splashDamageScale: defender.splashDamageScale || 0,
          timer: rand(0.15, 0.65),
          damageScale: defender.damageScale,
          projectile: defender.projectile,
          speed: defender.speed
        });
      });
    }

    setDefenderRecruited(id, recruited, animate = false) {
      const defender = this.defenders.find((item) => item.id === id);
      if (!defender) {
        return;
      }

      defender.recruited = recruited;
      if (recruited) {
        this.recruitedDefenders.add(id);
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
          const ring = this.add.circle(defender.x, defender.y - defender.height * 0.48, 26, 0xffffff, 0)
            .setStrokeStyle(4, COLORS.gold, 0.9)
            .setDepth(230);
          this.tweens.add({
            targets: ring,
            scale: 2.2,
            alpha: 0,
            duration: 560,
            ease: "Cubic.easeOut",
            onComplete: () => ring.destroy()
          });
        } else {
          defender.sprite.setAlpha(1).setY(defender.y);
        }
      } else {
        this.recruitedDefenders.delete(id);
        defender.sprite.setVisible(false).setAlpha(0).setY(defender.y);
      }
      this.updateSkillButtonLocks();
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

      this.pauseCircle = this.add.image(34, 42, "ui-pause-circle").setDisplaySize(58, 58).setDepth(315);
      this.pauseCircle.setInteractive({ useHandCursor: true });
      this.pauseCircle.on("pointerdown", () => this.togglePause());
      this.ui.pauseText = this.add.text(34, 42, "II", {
        fontFamily: "Arial, sans-serif",
        fontSize: 23,
        fontStyle: "900",
        color: "#ffffff"
      }).setOrigin(0.5).setDepth(316);

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

      this.speedCircle = this.add.image(493, 42, "ui-speed-circle").setDisplaySize(60, 60).setDepth(315);
      this.speedCircle.setInteractive({ useHandCursor: true });
      this.speedCircle.on("pointerdown", () => this.toggleSpeed());
      this.ui.speed = this.add.text(493, 42, "x1.0", {
        fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(316);

      this.add.image(86, 118, "ui-hero-panel").setDisplaySize(150, 68).setDepth(310);
      this.add.image(50, 123, "character-c-idle").setDisplaySize(38, 64).setDepth(311);
      this.ui.hero = this.add.text(22, 140, "Lv.1        30/30", {
        fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 4
      }).setDepth(312);

      this.createSideButtons();
      this.createStatusPanel();
    }

    createSideButtons() {
      const utility = [
        [34, 302, "▥"],
        [34, 352, "▦"]
      ];
      utility.forEach(([x, y, label]) => {
        this.add.image(x, y, "ui-skill-button").setDisplaySize(58, 58).setDepth(310);
        this.add.text(x, y, label, {
          fontFamily: "Arial, sans-serif",
          fontSize: 28,
          fontStyle: "900",
          color: "#ffffff"
        }).setOrigin(0.5).setDepth(311);
      });

      [
        ["frost", "character-d-idle", 431],
        ["barrage", "character-b-idle", 487],
        ["rally", "character-a-idle", 543],
        ["repair", "character-e-idle", 599]
      ].forEach(([id, texture, y]) => {
        const bg = this.add.image(36, y, "ui-skill-button").setDisplaySize(66, 66).setDepth(312);
        const icon = this.add.image(36, y + 6, texture).setDisplaySize(35, 62).setDepth(313);
        const cdText = this.add.text(58, y + 22, "", {
          fontFamily: "Arial, sans-serif",
          fontSize: 17,
          fontStyle: "900",
          color: "#ffffff",
          stroke: "#111",
          strokeThickness: 4
        }).setOrigin(0.5).setDepth(314);
        bg.setInteractive({ useHandCursor: true });
        icon.setInteractive({ useHandCursor: true });
        bg.on("pointerdown", () => this.castSkill(id));
        icon.on("pointerdown", () => this.castSkill(id));
        this.skillButtons.push({
          id,
          bg,
          icon,
          cdText,
          cooldown: 0,
          maxCooldown: id === "repair" ? 13 : id === "barrage" ? 9 : 11,
          baseMaxCooldown: id === "repair" ? 13 : id === "barrage" ? 9 : 11,
          unlocked: this.isSkillUnlocked(id)
        });
      });
      this.updateSkillButtonLocks();
    }

    isSkillUnlocked(id) {
      const owner = SKILL_OWNER_BY_ID[id];
      return !owner || this.recruitedDefenders.has(owner);
    }

    getSkillOwnerDefender(id) {
      const owner = SKILL_OWNER_BY_ID[id];
      return owner ? this.getDefenderById(owner) : null;
    }

    updateSkillButtonLocks() {
      this.skillButtons.forEach((button) => {
        button.unlocked = this.isSkillUnlocked(button.id);
        if (!button.unlocked) {
          button.cooldown = 0;
        }
        this.renderSkillButton(button);
      });
    }

    renderSkillButton(button) {
      if (!button) {
        return;
      }
      if (!button.unlocked) {
        button.bg.setAlpha(0.28);
        button.icon.setAlpha(0.2);
        button.cdText.setText("잠김");
        button.cdText.setFontSize(12);
        button.cdText.setColor("#c2cbcf");
        return;
      }

      button.cdText.setFontSize(17);
      button.cdText.setColor("#ffffff");
      button.cdText.setText(button.cooldown > 0 ? Math.ceil(button.cooldown) : "");
      button.bg.setAlpha(button.cooldown > 0 ? 0.45 : 0.82);
      button.icon.setAlpha(button.cooldown > 0 ? 0.52 : 1);
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
      this.ui.core = this.add.text(378, 84, "HP3000", statStyle).setOrigin(0, 0.5).setDepth(316);
      this.ui.coins = this.add.text(445, 65, "$0", {
        ...statStyle,
        color: "#ffd75c"
      }).setOrigin(0, 0.5).setDepth(316);
      this.ui.shield = this.add.text(445, 84, "S0", {
        ...statStyle,
        color: "#62c7ff"
      }).setOrigin(0, 0.5).setDepth(316);
      this.coreBack = this.add.rectangle(270, 88, 300, 8, 0x000000, 0.78).setStrokeStyle(1, 0xffffff, 0.18).setDepth(311);
      this.coreBar = this.add.rectangle(120, 88, 300, 6, COLORS.green, 1).setOrigin(0, 0.5).setDepth(312);
    }

    bindInput() {
      this.input.on("pointerdown", (pointer) => {
        if (this.mode !== "playing") {
          return;
        }
        if (pointer.x < 76 && pointer.y > 390 && pointer.y < 640) {
          return;
        }
        if (pointer.y < 84 || pointer.y > this.bounds.barricade) {
          return;
        }
        this.focusPoint = { x: pointer.x, y: pointer.y, timer: 2.2 };
        this.createAimFlash(pointer.x, pointer.y);
        this.firePlayerBurst(true);
      });
    }

    addOverlayButton(x, y, width, height, label, depth, onClick, accent = COLORS.gold) {
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
        item.on("pointerdown", onClick);
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

    showToast(message, color = COLORS.gold) {
      const panel = this.add.rectangle(270, 158, 330, 48, 0x0b1014, 0.88)
        .setStrokeStyle(2, color, 0.9)
        .setDepth(430);
      const text = this.add.text(270, 158, message, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 20,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(431);

      this.tweens.add({
        targets: [panel, text],
        y: "-=18",
        alpha: 0,
        delay: 720,
        duration: 420,
        ease: "Cubic.easeIn",
        onComplete: () => {
          panel.destroy();
          text.destroy();
        }
      });
    }

    showMenu() {
      this.clearOverlay();
      this.mode = "menu";
      const items = this.overlayObjects;
      items.push(this.add.image(270, 480, "skill-choice-backdrop").setDisplaySize(540, 960).setAlpha(0.82).setDepth(500));
      items.push(this.add.rectangle(270, 480, 540, 960, 0x020304, 0.42).setDepth(501));
      items.push(this.add.rectangle(270, 300, 430, 214, 0x0d151b, 0.82).setStrokeStyle(2, 0xe7bb54, 0.72).setDepth(502));
      items.push(this.add.rectangle(270, 207, 372, 4, 0xffd86b, 0.88).setDepth(503));
      items.push(this.add.text(270, 248, "스쿨 언데드 디펜스", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 36,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#06090b",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(504));
      items.push(this.add.text(270, 294, "무너진 복도에서 교실 방어선을 사수하세요", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 16,
        fontStyle: "800",
        color: "#d9eef0"
      }).setOrigin(0.5).setDepth(504));
      this.addOverlayButton(270, 365, 204, 54, "출격", 505, () => this.startRun(), COLORS.gold);
      items.push(this.add.text(270, 424, "탭해서 조준 · 왼쪽 스킬 버튼으로 전술 사용", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 14,
        fontStyle: "800",
        color: "#f8fbff",
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(504));
    }

    startRun() {
      this.clearOverlay();
      this.resetRun();
      this.mode = "playing";
    }

    resetRun() {
      this.zombies.forEach((zombie) => zombie.destroy());
      this.bullets.forEach((bullet) => bullet.sprite.destroy());
      this.zombies = [];
      this.bullets = [];
      this.effects = [];
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
      this.shield = 0;
      this.damage = 28;
      this.playerFireTimer = 0;
      this.rallyTimer = 0;
      this.focusPoint = null;
      this.recruitedDefenders = new Set(["c"]);
      this.skillButtons.forEach((button) => {
        button.cooldown = 0;
        button.maxCooldown = button.baseMaxCooldown;
      });
      this.defenders.forEach((defender) => {
        defender.rate = defender.baseRate;
        defender.damageBoost = 1;
        defender.pierce = defender.basePierce || 0;
        defender.critChance = BASE_CRIT_CHANCE;
        defender.rocketEvery = 0;
        defender.shotsSinceRocket = 0;
        defender.skillPower = 1;
        defender.timer = rand(0.1, defender.rate);
        defender.firePoseTimer = 0;
        this.setDefenderRecruited(defender.id, defender.role === "player", false);
      });
      this.updateSkillButtonLocks();
      this.updateHud();
    }

    togglePause() {
      if (this.mode === "playing") {
        this.mode = "paused";
        this.ui.pauseText.setText("▶");
        this.showPauseOverlay();
      } else if (this.mode === "paused") {
        this.clearOverlay();
        this.mode = "playing";
        this.ui.pauseText.setText("II");
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
      this.ui.speed.setText(this.speedMultiplier === 1 ? "x1.0" : "x1.5");
    }

    update(time, delta) {
      if (this.mode !== "playing") {
        return;
      }

      const dt = Math.min(delta, 50) / 1000 * this.speedMultiplier;
      this.elapsed += dt;
      if (this.focusPoint) {
        this.focusPoint.timer -= dt;
        if (this.focusPoint.timer <= 0) {
          this.focusPoint = null;
        }
      }
      if (this.rallyTimer > 0) {
        this.rallyTimer -= dt;
      }
      this.updateSkillCooldowns(dt);
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

      const levelPressure = Math.min(0.78, this.level * 0.035);
      const earlyDelayBonus = Math.max(0, (5 - this.level) * 0.08);
      const baseDelay = clamp(0.88 - levelPressure + earlyDelayBonus, 0.14, 1.15);
      const delayMin = this.level < 5 ? 0.65 : 0.55;
      const delayMax = this.level < 5 ? 1.15 : 1.1;
      this.spawnTimer = rand(baseDelay * delayMin, baseDelay * delayMax);
      const burst = this.level >= 9 ? 3 : this.level >= 5 ? 2 : 1;
      for (let i = 0; i < burst; i += 1) {
        this.spawnZombie(i * rand(0.04, 0.11));
      }
    }

    spawnZombie(delay) {
      this.time.delayedCall(delay * 1000 / this.speedMultiplier, () => {
        if (this.mode !== "playing") {
          return;
        }
        const eliteRoll = this.level >= 5 && Math.random() < Math.min(0.07 + this.level * 0.008, 0.22);
        const x = rand(this.bounds.left + 28, this.bounds.right - 28);
        const y = rand(-65, 46);
        const variant = Math.floor(rand(0, 4));
        const frame = Math.floor(rand(0, 4));
        const displayHeight = eliteRoll ? rand(202, 238) : rand(152, 186);
        const displayWidth = displayHeight;
        const hp = Math.round((eliteRoll ? 150 : 78) + this.level * (eliteRoll ? 28 : 16) + rand(-6, 12));
        const zombie = this.add.image(x, y, `zombie-walk-${variant}-${frame}`)
          .setOrigin(0.5, 0.56)
          .setDisplaySize(displayWidth, displayHeight)
          .setFlipX(Math.random() < 0.5)
          .setDepth(60);
        zombie.hp = hp;
        zombie.maxHp = hp;
        zombie.speed = rand(25, 41) + this.level * 2.1 + (eliteRoll ? -4 : 0);
        zombie.hitRadius = eliteRoll ? 42 : 32;
        zombie.attack = (eliteRoll ? 44 : 20) + this.level * 2.5;
        zombie.attackTimer = rand(0.2, 0.7);
        zombie.slowTimer = 0;
        zombie.wobble = rand(0, Math.PI * 2);
        zombie.animTimer = rand(0, 1);
        zombie.animFrame = frame;
        zombie.variant = variant;
        zombie.displayW = displayWidth;
        zombie.displayH = displayHeight;
        zombie.elite = eliteRoll;
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
          defender.timer = defender.rate * rand(0.75, 1.2);
          const target = this.findTarget(defender.x, defender.role === "barrage" ? 180 : 95);
          if (target) {
            const burstCount = defender.burstCount || 1;
            for (let shot = 0; shot < burstCount; shot += 1) {
              this.time.delayedCall(shot * (defender.burstDelay || 0), () => {
                if (this.mode !== "playing" || !defender.recruited || !target.active) {
                  return;
                }
                const damage = this.getDefenderDamage(defender);
                this.fireBullet(defender, target, damage, defender.speed, defender.pierce || 0, defender.critChance || BASE_CRIT_CHANCE);
                if (defender.rocketEvery > 0) {
                  defender.shotsSinceRocket += 1;
                  if (defender.shotsSinceRocket >= defender.rocketEvery) {
                    defender.shotsSinceRocket = 0;
                    this.createExplosion(target.x, target.y, 68, damage * 1.35);
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
      const target = this.findTarget(this.focusPoint ? this.focusPoint.x : 270, this.focusPoint ? 210 : 999);
      const rateBonus = this.rallyTimer > 0 ? 0.58 : 1;
      this.playerFireTimer = player.rate * rateBonus * (isManual ? 0.45 : 1);
      if (!target) {
        return;
      }

      const count = this.rallyTimer > 0 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        this.fireBullet(
          {
            ...player,
            muzzleX: player.muzzleX + (i - (count - 1) / 2) * 12
          },
          target,
          this.getDefenderDamage(player),
          player.speed,
          player.pierce || 0,
          player.critChance || BASE_CRIT_CHANCE
        );
      }

      if (player.rocketEvery > 0) {
        player.shotsSinceRocket += 1;
        if (player.shotsSinceRocket >= player.rocketEvery) {
          player.shotsSinceRocket = 0;
          this.createExplosion(target.x, target.y, 72, this.getDefenderDamage(player) * 1.5);
        }
      }
    }

    findTarget(preferX, radius) {
      let best = null;
      let bestScore = Infinity;
      this.zombies.forEach((zombie) => {
        if (!zombie.active || zombie.hp <= 0) {
          return;
        }
        const xBias = Math.abs(zombie.x - preferX);
        if (radius !== 999 && xBias > radius) {
          return;
        }
        const score = xBias * 1.2 + (this.bounds.barricade - zombie.y) * 0.22 - zombie.y * 0.18;
        if (score < bestScore) {
          best = zombie;
          bestScore = score;
        }
      });
      return best || this.zombies.reduce((closest, zombie) => {
        if (!zombie.active || zombie.hp <= 0) {
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
      const x = muzzle.x;
      const y = muzzle.y;
      const tx = target.x + rand(-8, 8);
      const ty = target.y + rand(-10, 10);
      const angle = Math.atan2(ty - y, tx - x);
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
        splashRadius: defender.splashRadius || 0,
        splashDamageScale: defender.splashDamageScale || 0,
        hitTargets: new Set()
      });
      this.createMuzzle(x, y, angle, defender.projectile);
    }

    createMuzzle(x, y, angle, projectile) {
      const color = projectile === "projectile-arrow"
        ? 0xfff4a0
        : projectile === "projectile-rifle"
          ? 0x8ff6ff
          : projectile === "projectile-rocket"
            ? 0xff8d42
            : projectile === "projectile-sniper"
              ? 0xbef6ff
              : projectile === "projectile-frost"
                ? 0xa6fbff
                : projectile === "projectile-support"
                  ? 0x80ff9b
                  : projectile === "projectile-shock"
                    ? 0xff8fbd
                    : 0xfff3a4;
      const flashOffset = projectile === "projectile-arrow" ? 0 : 4;
      const flash = this.add.circle(x + Math.cos(angle) * flashOffset, y + Math.sin(angle) * flashOffset, 7, color, 0.95).setDepth(191);
      this.tweens.add({
        targets: flash,
        scale: 1.8,
        alpha: 0,
        duration: 120,
        onComplete: () => flash.destroy()
      });
    }

    createAimFlash(x, y) {
      const ring = this.add.circle(x, y, 22, 0xffffff, 0).setStrokeStyle(3, 0xffec80, 0.9).setDepth(200);
      this.tweens.add({
        targets: ring,
        scale: 1.7,
        alpha: 0,
        duration: 250,
        onComplete: () => ring.destroy()
      });
    }

    updateBullets(dt) {
      for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
        const bullet = this.bullets[i];
        bullet.life -= dt;
        bullet.sprite.x += bullet.vx * dt;
        bullet.sprite.y += bullet.vy * dt;
        if (bullet.life <= 0 || bullet.sprite.x < -30 || bullet.sprite.x > 570 || bullet.sprite.y < -60 || bullet.sprite.y > 980) {
          bullet.sprite.destroy();
          this.bullets.splice(i, 1);
          continue;
        }

        const hit = this.findBulletHit(bullet);
        if (hit) {
          bullet.hitTargets.add(hit);
          this.damageZombie(hit, bullet.damage, bullet.critChance);
          if (bullet.splashRadius > 0) {
            this.createExplosion(hit.x, hit.y, bullet.splashRadius, bullet.damage * (bullet.splashDamageScale || 0.75));
          }
          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
          } else {
            bullet.sprite.destroy();
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

    damageZombie(zombie, amount, critChance = BASE_CRIT_CHANCE) {
      const crit = Math.random() < critChance;
      const damage = Math.round(amount * (crit ? 1.85 : 1));
      zombie.hp -= damage;
      zombie.setTint(crit ? 0xfff2a5 : 0xff7777);
      this.time.delayedCall(70, () => {
        if (zombie.active) {
          zombie.clearTint();
        }
      });
      this.showDamageText(zombie.x + rand(-8, 8), zombie.y - rand(8, 24), damage, crit);
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
      zombie.destroy();
      this.zombies = this.zombies.filter((item) => item !== zombie);
      this.kills += 1;
      this.killsInLevel += 1;
      this.coins += zombie.elite ? 4 : 1;
      this.createDeathBurst(x, y, zombie.elite ? 1.25 : 1);

      if (this.killsInLevel >= this.levelNeed) {
        this.openSkillChoice();
      }
    }

    showDamageText(x, y, damage, crit) {
      const text = this.add.text(x, y, String(damage), {
        fontFamily: "Arial, sans-serif",
        fontSize: crit ? 31 : 23,
        fontStyle: "900",
        color: crit ? "#fff0a5" : "#ffffff",
        stroke: crit ? "#811010" : "#40191b",
        strokeThickness: 5
      }).setOrigin(0.5).setRotation(rand(-0.18, 0.18)).setDepth(250);
      this.tweens.add({
        targets: text,
        y: y - rand(26, 44),
        alpha: 0,
        scale: crit ? 1.18 : 1,
        duration: 650,
        ease: "Cubic.easeOut",
        onComplete: () => text.destroy()
      });
    }

    createDeathBurst(x, y, scale) {
      const burst = this.add.circle(x, y, 10, COLORS.blood, 0.35).setDepth(58);
      this.tweens.add({
        targets: burst,
        scale: 3.4 * scale,
        alpha: 0,
        duration: 340,
        onComplete: () => burst.destroy()
      });
    }

    updateZombies(dt) {
      for (let i = this.zombies.length - 1; i >= 0; i -= 1) {
        const zombie = this.zombies[i];
        if (!zombie.active) {
        this.zombies.splice(i, 1);
          continue;
        }
        zombie.wobble += dt * 4.2;
        zombie.animTimer += dt * (zombie.elite ? 5.2 : 6.8);
        const nextFrame = Math.floor(zombie.animTimer) % 4;
        if (nextFrame !== zombie.animFrame) {
          zombie.animFrame = nextFrame;
          zombie.setTexture(`zombie-walk-${zombie.variant}-${nextFrame}`);
          zombie.setDisplaySize(zombie.displayW, zombie.displayH);
        }
        const crowdShift = Math.sin(zombie.wobble) * 7 * dt;
        zombie.x = clamp(zombie.x + crowdShift, this.bounds.left, this.bounds.right);
        zombie.setDepth(70 + zombie.y / 5);

        if (zombie.slowTimer > 0) {
          zombie.slowTimer -= dt;
          zombie.setTint(0x99f4ff);
        } else if (zombie.tintTopLeft === 0x99f4ff) {
          zombie.clearTint();
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
      if (this.coreHp <= 0) {
        this.gameOver();
      }
    }

    createHitAtBarricade(x) {
      const sparks = this.add.circle(x, this.bounds.barricade + rand(8, 28), 8, 0xffd86b, 0.8).setDepth(220);
      this.tweens.add({
        targets: sparks,
        scale: 2.2,
        alpha: 0,
        duration: 230,
        onComplete: () => sparks.destroy()
      });
    }

    updateSkillCooldowns(dt) {
      this.skillButtons.forEach((button) => {
        button.unlocked = this.isSkillUnlocked(button.id);
        if (button.unlocked) {
          button.cooldown = Math.max(0, button.cooldown - dt);
        }
        this.renderSkillButton(button);
      });
    }

    castSkill(id) {
      if (this.mode !== "playing") {
        return;
      }
      const button = this.skillButtons.find((item) => item.id === id);
      if (!button || !button.unlocked || button.cooldown > 0) {
        if (button && !button.unlocked) {
          this.showToast("동료 영입 필요", 0x7d8790);
        }
        return;
      }
      button.cooldown = button.maxCooldown;
      const owner = this.getSkillOwnerDefender(id);
      const skillPower = owner?.skillPower || 1;

      if (id === "frost") {
        this.zombies.forEach((zombie) => {
          zombie.slowTimer = Math.max(zombie.slowTimer, 3.4);
          this.damageZombie(zombie, (12 + this.level * 2) * skillPower, 0);
        });
        this.createScreenPulse(0x8ff7ff);
      } else if (id === "barrage") {
        const points = [150, 270, 405].map((x) => ({ x: x + rand(-25, 25), y: rand(250, 610) }));
        points.forEach((point, index) => {
          this.time.delayedCall(index * 140, () => this.createExplosion(point.x, point.y, 92, (85 + this.level * 9) * skillPower));
        });
      } else if (id === "rally") {
        this.rallyTimer = 7.5 * skillPower;
        this.createScreenPulse(0xff7fb7);
      } else if (id === "repair") {
        this.coreHp = clamp(this.coreHp + (480 + this.level * 30) * skillPower, 0, this.maxCoreHp);
        this.shield += (220 + this.level * 25) * skillPower;
        this.createScreenPulse(0x7dff8d);
      }
    }

    createExplosion(x, y, radius, damage) {
      const ring = this.add.circle(x, y, 18, 0xffd35a, 0.46).setStrokeStyle(4, 0xffffff, 0.55).setDepth(221);
      this.tweens.add({
        targets: ring,
        scale: radius / 18,
        alpha: 0,
        duration: 260,
        onComplete: () => ring.destroy()
      });
      this.zombies.slice().forEach((zombie) => {
        if (!zombie.active) {
          return;
        }
        const dx = zombie.x - x;
        const dy = zombie.y - y;
        if (dx * dx + dy * dy <= radius * radius) {
          this.damageZombie(zombie, damage * (1 - Math.sqrt(dx * dx + dy * dy) / radius * 0.35), 0);
        }
      });
    }

    createScreenPulse(color) {
      const pulse = this.add.rectangle(270, 480, 540, 960, color, 0.16).setDepth(240);
      this.tweens.add({
        targets: pulse,
        alpha: 0,
        duration: 420,
        onComplete: () => pulse.destroy()
      });
    }

    openSkillChoice() {
      if (this.mode !== "playing") {
        return;
      }
      this.mode = "skill";
      this.level += 1;
      this.stage = Math.floor((this.level - 1) / 4) + 1;
      this.killsInLevel = 0;
      this.levelNeed = Math.round(16 + this.level * 5.2);
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
      const xs = [92, 270, 448];
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

    getCharacterUpgrades() {
      const upgrades = [];
      const add = (ownerId, upgrade) => {
        const defender = this.getDefenderById(ownerId);
        if (!defender || !defender.recruited) {
          return;
        }
        upgrades.push(upgrade);
      };

      add("c", {
        id: "c-pierce",
        icon: "skill-pierce",
        tag: "권총",
        title: "관통 탄심",
        desc: "주인공 관통 +1\n권총 피해 +12%",
        apply: () => {
          const defender = this.getDefenderById("c");
          defender.pierce += 1;
          defender.damageBoost *= 1.12;
        }
      });
      add("c", {
        id: "c-barrel",
        icon: "skill-barrel",
        tag: "권총",
        title: "강화 총열",
        desc: "주인공 피해 +24%\n권총 사격 -8%",
        apply: () => {
          const defender = this.getDefenderById("c");
          defender.damageBoost *= 1.24;
          defender.rate *= 0.92;
        }
      });
      add("a", {
        id: "a-rally",
        icon: "skill-rally",
        tag: "양궁",
        title: "응원 지휘",
        desc: "양궁부 치명 +12%\n격려 지속 증가",
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.critChance += 0.12;
          defender.skillPower += 0.2;
        }
      });
      add("a", {
        id: "a-archery",
        icon: "skill-pierce",
        tag: "양궁",
        title: "속사 훈련",
        desc: "양궁부 피해 +24%\n지원 사격 -12%",
        apply: () => {
          const defender = this.getDefenderById("a");
          defender.damageBoost *= 1.24;
          defender.rate *= 0.88;
        }
      });
      add("b", {
        id: "b-barrage",
        icon: "skill-barrage",
        tag: "소총",
        title: "유탄 연계",
        desc: "소총수 8발마다\n추가 폭발 발생",
        apply: () => {
          const defender = this.getDefenderById("b");
          defender.rocketEvery = defender.rocketEvery === 0 ? 8 : Math.max(4, defender.rocketEvery - 1);
        }
      });
      add("b", {
        id: "b-rifle",
        icon: "skill-barrel",
        tag: "소총",
        title: "탄창 개조",
        desc: "소총수 피해 +22%\n지원 사격 -10%",
        apply: () => {
          const defender = this.getDefenderById("b");
          defender.damageBoost *= 1.22;
          defender.rate *= 0.9;
        }
      });
      add("d", {
        id: "d-frost",
        icon: "skill-frost",
        tag: "로켓",
        title: "냉각 조명탄",
        desc: "냉각 피해 +25%\n냉각 쿨다운 -15%",
        apply: () => {
          const defender = this.getDefenderById("d");
          const frost = this.skillButtons.find((button) => button.id === "frost");
          defender.skillPower += 0.25;
          if (frost) {
            frost.maxCooldown *= 0.85;
          }
        }
      });
      add("d", {
        id: "d-rocket",
        icon: "skill-barrage",
        tag: "로켓",
        title: "로켓 추진제",
        desc: "폭발 피해 +28%\n로켓 사격 -10%",
        apply: () => {
          const defender = this.getDefenderById("d");
          defender.damageBoost *= 1.28;
          defender.rate *= 0.9;
        }
      });
      add("e", {
        id: "e-repair",
        icon: "skill-repair",
        tag: "수리",
        title: "바리케이드 수리",
        desc: "수리량 +25%\n수리 쿨다운 -15%",
        apply: () => {
          const defender = this.getDefenderById("e");
          const repair = this.skillButtons.find((button) => button.id === "repair");
          defender.skillPower += 0.25;
          if (repair) {
            repair.maxCooldown *= 0.85;
          }
        }
      });
      add("e", {
        id: "e-sniper",
        icon: "skill-pierce",
        tag: "저격",
        title: "정밀 엄호",
        desc: "저격 피해 +28%\n치명타 확률 +10%",
        apply: () => {
          const defender = this.getDefenderById("e");
          defender.damageBoost *= 1.28;
          defender.critChance += 0.1;
        }
      });
      return upgrades;
    }

    pickUpgrades() {
      const recruitPool = this.getRecruitUpgrades();
      const availablePool = this.getCharacterUpgrades();
      const chosen = [];
      const recruitOffers = Math.min(recruitPool.length, this.level <= 5 ? 2 : 1);
      while (chosen.length < recruitOffers && recruitPool.length > 0) {
        const index = Math.floor(Math.random() * recruitPool.length);
        chosen.push(recruitPool.splice(index, 1)[0]);
      }
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
      const shadow = this.add.rectangle(x, y + 15, 154, 320, 0x000000, 0.44).setDepth(523);
      const glow = this.add.ellipse(x, y - 74, 138, 206, accent, 0.1).setDepth(523.5);
      const card = this.add.image(x, y, "premium-skill-card").setDisplaySize(170, 342).setDepth(524);
      const watermark = this.add.image(x, y - 44, isRecruit ? upgrade.characterTexture : upgrade.icon)
        .setAlpha(isRecruit ? 0.08 : 0.1)
        .setDepth(525);
      if (isRecruit) {
        this.fitSpriteHeight(watermark, 205);
      } else {
        watermark.setScale(1.65);
      }
      const iconHalo = isRecruit
        ? this.add.ellipse(x, y - 70, 82, 112, accent, 0.16).setStrokeStyle(2, accent, 0.55).setDepth(527)
        : this.add.circle(x, y - 112, 40, 0x000000, 0.58).setStrokeStyle(2, accent, 0.9).setDepth(527);
      const icon = this.add.image(x, isRecruit ? y - 24 : y - 112, isRecruit ? upgrade.characterTexture : upgrade.icon).setDepth(528);
      if (isRecruit) {
        icon.setOrigin(0.5, 1);
        this.fitSpriteHeight(icon, 138);
      } else {
        icon.setScale(0.92);
      }
      const tagBg = this.add.rectangle(x, y + 24, 76, 24, accent, 0.2)
        .setStrokeStyle(1, accent, 0.78)
        .setDepth(528);
      const tagText = this.add.text(x, y + 24, upgrade.tag || "전술", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 12,
        fontStyle: "900",
        color: accentHex,
        stroke: "#050607",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(529);
      const title = this.add.text(x, y + 58, upgrade.title, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 19,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(529);
      const desc = this.add.text(x, y + 101, upgrade.desc, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 14,
        fontStyle: "900",
        color: "#d8e6e8",
        align: "center",
        lineSpacing: 4,
        wordWrap: { width: 126, useAdvancedWrap: true }
      }).setOrigin(0.5).setDepth(529);
      const chooseBg = this.add.rectangle(x, y + 148, 104, 30, 0x101820, 0.9)
        .setStrokeStyle(1, accent, 0.85)
        .setDepth(529);
      const chooseText = this.add.text(x, y + 148, "선택", {
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
        icon,
        tagBg,
        tagText,
        title,
        desc,
        chooseBg,
        chooseText
      ];

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
        watermark.setAlpha(active ? 0.18 : 0.1);
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
      this.clearOverlay();
      const items = this.overlayObjects;
      items.push(this.add.image(270, 480, "skill-choice-backdrop").setDisplaySize(540, 960).setAlpha(0.72).setDepth(540));
      items.push(this.add.rectangle(270, 480, 540, 960, 0x030405, 0.64).setDepth(541));
      items.push(this.add.rectangle(270, 405, 392, 192, 0x0d151b, 0.9).setStrokeStyle(2, 0xff6b68, 0.8).setDepth(542));
      items.push(this.add.rectangle(270, 326, 300, 4, 0xff6b68, 0.9).setDepth(543));
      items.push(this.add.text(270, 366, "방어선 붕괴", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 42,
        fontStyle: "900",
        color: "#ff6b68",
        stroke: "#050607",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(544));
      items.push(this.add.text(270, 424, `Lv.${this.level} · 처치 ${this.kills}`, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 24,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#050607",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(544));
      this.addOverlayButton(270, 512, 208, 54, "다시 방어", 545, () => this.startRun(), COLORS.gold);
    }

    clearOverlay() {
      this.overlayObjects.forEach((item) => {
        if (item && item.destroy) {
          item.destroy();
        }
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
      this.ui.hero.setText(`Lv.${Math.max(1, Math.floor(this.level / 3))}        ${Math.ceil(this.coreHp / 100)}/${Math.ceil(this.maxCoreHp / 100)}`);
      this.ui.morale.setText(`M${this.morale}%`);
      this.ui.morale.setColor(this.morale < 35 ? "#ff524f" : this.morale < 70 ? "#ffd75c" : "#4dff67");
      this.ui.core.setText(`HP${Math.round(this.coreHp)}`);
      this.ui.coins.setText(`$${this.coins}`);
      this.ui.shield.setText(`S${Math.round(this.shield)}`);
      const progress = clamp(this.killsInLevel / this.levelNeed, 0, 1);
      this.progressBar.setSize(508 * progress, 6);
      this.progressBar.setFillStyle(this.mode === "skill" ? COLORS.gold : 0xe0ab26, 1);
      const hpRate = clamp(this.coreHp / this.maxCoreHp, 0, 1);
      this.coreBar.setSize(300 * hpRate, 6);
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
})();
