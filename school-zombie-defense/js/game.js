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

  function createTextures(scene) {
    makeCanvasTexture(scene, "bullet", 18, 34, (ctx) => {
      ctx.save();
      ctx.translate(9, 17);
      const gradient = ctx.createLinearGradient(0, -16, 0, 16);
      gradient.addColorStop(0, "#fff69a");
      gradient.addColorStop(0.45, "#ffe647");
      gradient.addColorStop(1, "rgba(255,190,53,0)");
      ctx.fillStyle = gradient;
      roundedRect(ctx, -4, -16, 8, 32, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, -12, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

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
      this.load.image("survivor-line", "assets/images/survivor-line.png");
      this.load.image("zombie-sheet", "assets/images/zombie-sheet.png");
    }

    create() {
      const loading = document.querySelector(".loading");
      if (loading) {
        loading.remove();
      }
      createZombieSpriteTextures(this);
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
      this.mode = "menu";
      this.elapsed = 0;
      this.stage = 1;
      this.level = 1;
      this.kills = 0;
      this.killsInLevel = 0;
      this.levelNeed = 16;
      this.spawnTimer = 0.6;
      this.spawnBurst = 1;
      this.maxCoreHp = 3000;
      this.coreHp = this.maxCoreHp;
      this.morale = 100;
      this.coins = 0;
      this.shield = 0;
      this.damage = 28;
      this.fireRate = 0.33;
      this.playerFireTimer = 0;
      this.pierce = 0;
      this.critChance = 0.08;
      this.rocketEvery = 0;
      this.shotsSinceRocket = 0;
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
      this.add.image(270, 927, "survivor-line")
        .setOrigin(0.5, 1)
        .setDisplaySize(575, 323)
        .setDepth(143);

      const positions = [
        [84, 787, 0.54, "rally"],
        [188, 779, 0.74, "barrage"],
        [276, 773, 1, "player"],
        [374, 779, 0.66, "frost"],
        [470, 786, 0.6, "repair"]
      ];
      positions.forEach(([x, y, damageScale, role]) => {
        this.defenders.push({
          x,
          y,
          sprite: null,
          role,
          rate: role === "player" ? 0.33 : rand(0.8, 1.2),
          timer: rand(0.15, 0.65),
          damageScale
        });
      });
    }

    createHud() {
      this.ui = {};
      this.add.rectangle(270, 44, 520, 60, 0x101820, 0.72).setDepth(300);
      this.add.rectangle(270, 74, 520, 6, 0x020405, 0.7).setDepth(301);
      this.progressBack = this.add.rectangle(270, 74, 508, 6, 0x030404, 0.82).setOrigin(0.5).setDepth(302);
      this.progressBar = this.add.rectangle(16, 74, 1, 6, COLORS.gold, 1).setOrigin(0, 0.5).setDepth(303);

      this.pauseCircle = this.add.circle(34, 42, 25, 0x1b232a, 0.8).setStrokeStyle(2, 0xffffff, 0.28).setDepth(315);
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

      this.speedCircle = this.add.circle(493, 42, 27, 0x1b232a, 0.65).setStrokeStyle(2, 0xffffff, 0.25).setDepth(315);
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

      this.add.rectangle(86, 118, 138, 62, 0x9f3f3f, 0.88).setStrokeStyle(3, 0xe8edf0, 0.82).setDepth(310);
      this.add.image(50, 119, "portrait-barrage").setScale(0.72).setDepth(311);
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
        this.add.circle(x, y, 27, 0x101820, 0.58).setStrokeStyle(2, 0xffffff, 0.45).setDepth(310);
        this.add.text(x, y, label, {
          fontFamily: "Arial, sans-serif",
          fontSize: 28,
          fontStyle: "900",
          color: "#ffffff"
        }).setOrigin(0.5).setDepth(311);
      });

      [
        ["frost", "portrait-frost", 431],
        ["barrage", "portrait-barrage", 487],
        ["rally", "portrait-rally", 543],
        ["repair", "portrait-repair", 599]
      ].forEach(([id, texture, y]) => {
        const bg = this.add.circle(36, y, 33, 0x050708, 0.74).setStrokeStyle(2, 0xffffff, 0.28).setDepth(312);
        const icon = this.add.image(36, y, texture).setScale(0.82).setDepth(313);
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
          maxCooldown: id === "repair" ? 13 : id === "barrage" ? 9 : 11
        });
      });
    }

    createStatusPanel() {
      this.add.circle(500, 676, 33, 0x101820, 0.74).setStrokeStyle(2, 0xffffff, 0.24).setDepth(310);
      this.add.text(500, 676, "💬", {
        fontFamily: "Arial, sans-serif",
        fontSize: 26
      }).setOrigin(0.5).setDepth(311);

      this.ui.morale = this.add.text(500, 724, "100%", {
        fontFamily: "Arial, sans-serif",
        fontSize: 19,
        fontStyle: "900",
        color: "#4dff67",
        stroke: "#111",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(312);
      this.ui.core = this.add.text(492, 755, "3000", {
        fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(312);
      this.ui.coins = this.add.text(492, 785, "0", {
        fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(312);
      this.ui.shield = this.add.text(492, 815, "0", {
        fontFamily: "Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(312);

      this.add.text(458, 755, "♥", {
        fontFamily: "Arial, sans-serif",
        fontSize: 17,
        fontStyle: "900",
        color: "#2ee35b",
        stroke: "#fff",
        strokeThickness: 2
      }).setDepth(312);
      this.add.text(458, 785, "✦", {
        fontFamily: "Arial, sans-serif",
        fontSize: 17,
        fontStyle: "900",
        color: "#ffc83d",
        stroke: "#fff",
        strokeThickness: 2
      }).setDepth(312);
      this.add.text(458, 815, "◆", {
        fontFamily: "Arial, sans-serif",
        fontSize: 17,
        fontStyle: "900",
        color: "#62c7ff",
        stroke: "#fff",
        strokeThickness: 2
      }).setDepth(312);

      this.coreBack = this.add.rectangle(270, 915, 320, 12, 0x000000, 0.9).setStrokeStyle(2, 0x0f1010, 1).setDepth(311);
      this.coreBar = this.add.rectangle(110, 915, 320, 10, COLORS.green, 1).setOrigin(0, 0.5).setDepth(312);
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

    showMenu() {
      this.clearOverlay();
      this.mode = "menu";
      const items = this.overlayObjects;
      items.push(this.add.rectangle(270, 480, 540, 960, 0x040608, 0.34).setDepth(500));
      items.push(this.add.rectangle(270, 315, 450, 210, 0x101820, 0.86).setStrokeStyle(2, 0xf1c553, 0.7).setDepth(501));
      items.push(this.add.text(270, 245, "스쿨 언데드 디펜스", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 34,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111820",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(502));
      items.push(this.add.text(270, 291, "몰려오는 감염 학생들을 막고 교실 방어선을 지키세요", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 16,
        fontStyle: "800",
        color: "#d9eef0"
      }).setOrigin(0.5).setDepth(502));
      const start = this.add.rectangle(270, 365, 190, 52, 0xd49b22, 1).setStrokeStyle(3, 0xfff1a5, 0.8).setDepth(502);
      const startText = this.add.text(270, 365, "출격", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 25,
        fontStyle: "900",
        color: "#1b1205"
      }).setOrigin(0.5).setDepth(503);
      start.setInteractive({ useHandCursor: true });
      startText.setInteractive({ useHandCursor: true });
      start.on("pointerdown", () => this.startRun());
      startText.on("pointerdown", () => this.startRun());
      items.push(start, startText);
      items.push(this.add.text(270, 424, "탭해서 조준 · 왼쪽 원형 아이콘으로 스킬 사용", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 14,
        fontStyle: "800",
        color: "#ffffff"
      }).setOrigin(0.5).setDepth(502));
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
      this.levelNeed = 16;
      this.spawnTimer = 0.6;
      this.spawnBurst = 1;
      this.maxCoreHp = 3000;
      this.coreHp = this.maxCoreHp;
      this.morale = 100;
      this.coins = 0;
      this.shield = 0;
      this.damage = 28;
      this.fireRate = 0.33;
      this.playerFireTimer = 0;
      this.pierce = 0;
      this.critChance = 0.08;
      this.rocketEvery = 0;
      this.shotsSinceRocket = 0;
      this.rallyTimer = 0;
      this.focusPoint = null;
      this.skillButtons.forEach((button) => {
        button.cooldown = 0;
      });
      this.defenders.forEach((defender) => {
        defender.timer = rand(0.1, defender.rate);
      });
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
      this.overlayObjects.push(this.add.rectangle(270, 480, 540, 960, 0x010204, 0.48).setDepth(520));
      this.overlayObjects.push(this.add.text(270, 430, "일시정지", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 38,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(521));
      const resume = this.add.rectangle(270, 495, 180, 52, 0xd49b22, 1).setStrokeStyle(3, 0xfff1a5, 0.85).setDepth(522);
      const text = this.add.text(270, 495, "계속", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 24,
        fontStyle: "900",
        color: "#1b1205"
      }).setOrigin(0.5).setDepth(523);
      resume.setInteractive({ useHandCursor: true });
      text.setInteractive({ useHandCursor: true });
      resume.on("pointerdown", () => this.togglePause());
      text.on("pointerdown", () => this.togglePause());
      this.overlayObjects.push(resume, text);
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
      this.updateDefenders(dt);
      this.updateBullets(dt);
      this.updateZombies(dt);
      this.updateHud();
    }

    updateSpawning(dt) {
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) {
        return;
      }

      const levelPressure = Math.min(0.78, this.level * 0.035);
      const baseDelay = clamp(0.88 - levelPressure, 0.14, 0.9);
      this.spawnTimer = rand(baseDelay * 0.55, baseDelay * 1.1);
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
        const variant = Math.floor(rand(0, 6));
        const displayHeight = eliteRoll ? rand(202, 238) : rand(152, 186);
        const displayWidth = displayHeight;
        const hp = Math.round((eliteRoll ? 120 : 58) + this.level * (eliteRoll ? 23 : 13) + rand(-8, 10));
        const zombie = this.add.image(x, y, `zombie-sprite-${variant}`)
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
        if (defender.role === "player") {
          return;
        }
        defender.timer -= dt;
        if (defender.timer <= 0) {
          defender.timer = defender.rate * rand(0.75, 1.2);
          const target = this.findTarget(defender.x, defender.role === "barrage" ? 160 : 85);
          if (target) {
            this.fireBullet(defender.x, defender.y, target, this.damage * defender.damageScale, 760, 0);
          }
        }
      });
    }

    firePlayerBurst(isManual) {
      const target = this.findTarget(this.focusPoint ? this.focusPoint.x : 270, this.focusPoint ? 210 : 999);
      const rateBonus = this.rallyTimer > 0 ? 0.58 : 1;
      this.playerFireTimer = this.fireRate * rateBonus * (isManual ? 0.45 : 1);
      if (!target) {
        return;
      }

      const count = this.rallyTimer > 0 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const originX = 272 + (i - (count - 1) / 2) * 14;
        this.fireBullet(originX, 770, target, this.damage, 840, this.pierce);
      }

      this.shotsSinceRocket += 1;
      if (this.rocketEvery > 0 && this.shotsSinceRocket >= this.rocketEvery) {
        this.shotsSinceRocket = 0;
        this.createExplosion(target.x, target.y, 72, this.damage * 1.5);
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

    fireBullet(x, y, target, damage, speed, pierce) {
      if (!target || !target.active) {
        return;
      }
      const tx = target.x + rand(-8, 8);
      const ty = target.y + rand(-10, 10);
      const angle = Math.atan2(ty - y, tx - x);
      const sprite = this.add.image(x, y, "bullet").setScale(0.8).setRotation(angle + Math.PI / 2).setDepth(190);
      this.bullets.push({
        sprite,
        damage,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.55,
        pierce
      });
      this.createMuzzle(x, y, angle);
    }

    createMuzzle(x, y, angle) {
      const flash = this.add.circle(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, 7, 0xfff3a4, 0.95).setDepth(191);
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
          this.damageZombie(hit, bullet.damage);
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
        const dx = bullet.sprite.x - zombie.x;
        const dy = bullet.sprite.y - zombie.y;
        if (dx * dx + dy * dy < zombie.hitRadius * zombie.hitRadius) {
          return zombie;
        }
      }
      return null;
    }

    damageZombie(zombie, amount) {
      const crit = Math.random() < this.critChance;
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
        button.cooldown = Math.max(0, button.cooldown - dt);
        button.cdText.setText(button.cooldown > 0 ? Math.ceil(button.cooldown) : "");
        button.bg.setAlpha(button.cooldown > 0 ? 0.45 : 0.82);
        button.icon.setAlpha(button.cooldown > 0 ? 0.52 : 1);
      });
    }

    castSkill(id) {
      if (this.mode !== "playing") {
        return;
      }
      const button = this.skillButtons.find((item) => item.id === id);
      if (!button || button.cooldown > 0) {
        return;
      }
      button.cooldown = button.maxCooldown;

      if (id === "frost") {
        this.zombies.forEach((zombie) => {
          zombie.slowTimer = Math.max(zombie.slowTimer, 3.4);
          this.damageZombie(zombie, 12 + this.level * 2);
        });
        this.createScreenPulse(0x8ff7ff);
      } else if (id === "barrage") {
        const points = [150, 270, 405].map((x) => ({ x: x + rand(-25, 25), y: rand(250, 610) }));
        points.forEach((point, index) => {
          this.time.delayedCall(index * 140, () => this.createExplosion(point.x, point.y, 92, 85 + this.level * 9));
        });
      } else if (id === "rally") {
        this.rallyTimer = 7.5;
        this.createScreenPulse(0xff7fb7);
      } else if (id === "repair") {
        this.coreHp = clamp(this.coreHp + 480 + this.level * 30, 0, this.maxCoreHp);
        this.shield += 220 + this.level * 25;
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
          this.damageZombie(zombie, damage * (1 - Math.sqrt(dx * dx + dy * dy) / radius * 0.35));
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
      items.push(this.add.rectangle(270, 480, 540, 960, 0x010204, 0.64).setDepth(520));
      items.push(this.add.rectangle(270, 264, 540, 45, 0x6d3c08, 0.86).setStrokeStyle(2, 0xe4a72e, 0.8).setDepth(521));
      items.push(this.add.text(270, 264, "스킬 선택", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 28,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#251606",
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(522));

      const upgrades = this.pickUpgrades();
      const xs = [102, 270, 438];
      upgrades.forEach((upgrade, index) => this.addSkillCard(xs[index], 510, upgrade));
      items.push(this.add.text(270, 828, "<눌러서 선택>", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 22,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(530));
    }

    pickUpgrades() {
      const pool = [
        {
          id: "pierce",
          icon: "skill-pierce",
          title: "참격 탄두",
          desc: "탄환 관통 +1, 기본 피해 +12%",
          apply: () => {
            this.pierce += 1;
            this.damage *= 1.12;
          }
        },
        {
          id: "barrel",
          icon: "skill-barrel",
          title: "고압 배럴",
          desc: "기본 피해 +28%, 사격 간격 +8%",
          apply: () => {
            this.damage *= 1.28;
            this.fireRate *= 1.08;
          }
        },
        {
          id: "rally",
          icon: "skill-rally",
          title: "응급 지휘",
          desc: "치명타 확률 +10%, 사기 회복",
          apply: () => {
            this.critChance += 0.1;
            this.coreHp = clamp(this.coreHp + 220, 0, this.maxCoreHp);
          }
        },
        {
          id: "repair",
          icon: "skill-repair",
          title: "책상 방벽",
          desc: "최대 체력 +450, 방어막 +300",
          apply: () => {
            this.maxCoreHp += 450;
            this.coreHp += 450;
            this.shield += 300;
          }
        },
        {
          id: "barrage",
          icon: "skill-barrage",
          title: "유탄 연사",
          desc: "8발마다 작은 폭발 발생",
          apply: () => {
            this.rocketEvery = this.rocketEvery === 0 ? 8 : Math.max(4, this.rocketEvery - 1);
          }
        },
        {
          id: "squad",
          icon: "skill-squad",
          title: "구조대 합류",
          desc: "지원 사격 속도 +18%, 스킬 쿨타임 -10%",
          apply: () => {
            this.defenders.forEach((defender) => {
              if (defender.role !== "player") {
                defender.rate *= 0.82;
              }
            });
            this.skillButtons.forEach((button) => {
              button.maxCooldown *= 0.9;
            });
          }
        },
        {
          id: "frost",
          icon: "skill-frost",
          title: "냉각 조명탄",
          desc: "감속 스킬 쿨타임 -25%, 피해 +20",
          apply: () => {
            const frost = this.skillButtons.find((button) => button.id === "frost");
            if (frost) {
              frost.maxCooldown *= 0.75;
            }
            this.damage += 20;
          }
        }
      ];
      const chosen = [];
      while (chosen.length < 3 && pool.length > 0) {
        const index = Math.floor(Math.random() * pool.length);
        chosen.push(pool.splice(index, 1)[0]);
      }
      return chosen;
    }

    addSkillCard(x, y, upgrade) {
      const card = this.add.rectangle(x, y, 150, 310, 0xf4f6f0, 0.97).setStrokeStyle(4, 0x6a3007, 1).setDepth(524);
      const top = this.add.rectangle(x, y - 111, 150, 68, 0x4a1606, 1).setDepth(525);
      const ribbon = this.add.rectangle(x, y - 95, 150, 10, 0xe0aa23, 1).setDepth(526);
      const icon = this.add.image(x, y - 153, upgrade.icon).setScale(1.08).setDepth(527);
      const title = this.add.text(x, y - 107, upgrade.title, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 18,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#1a0703",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(528);
      const desc = this.add.text(x, y + 34, upgrade.desc, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 17,
        fontStyle: "900",
        color: "#53585c",
        align: "center",
        wordWrap: { width: 126, useAdvancedWrap: true }
      }).setOrigin(0.5).setDepth(528);
      const stain = this.add.circle(x + 42, y + 120, 18, COLORS.blood, 0.18).setDepth(527);
      [card, top, ribbon, icon, title, desc, stain].forEach((item) => this.overlayObjects.push(item));
      card.setInteractive({ useHandCursor: true });
      card.on("pointerdown", () => this.applyUpgrade(upgrade));
      icon.setInteractive({ useHandCursor: true });
      icon.on("pointerdown", () => this.applyUpgrade(upgrade));
    }

    applyUpgrade(upgrade) {
      if (this.mode !== "skill") {
        return;
      }
      upgrade.apply();
      this.clearOverlay();
      this.mode = "playing";
      this.createScreenPulse(COLORS.gold);
      this.updateHud();
    }

    gameOver() {
      if (this.mode === "gameover") {
        return;
      }
      this.mode = "gameover";
      this.clearOverlay();
      const items = this.overlayObjects;
      items.push(this.add.rectangle(270, 480, 540, 960, 0x010204, 0.68).setDepth(540));
      items.push(this.add.text(270, 360, "방어선 붕괴", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 42,
        fontStyle: "900",
        color: "#ff6b68",
        stroke: "#111",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(541));
      items.push(this.add.text(270, 418, `Lv.${this.level} · 처치 ${this.kills}`, {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 24,
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#111",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(541));
      const retry = this.add.rectangle(270, 500, 200, 54, 0xd49b22, 1).setStrokeStyle(3, 0xfff1a5, 0.8).setDepth(542);
      const text = this.add.text(270, 500, "다시 방어", {
        fontFamily: "Pretendard Variable, Arial, sans-serif",
        fontSize: 24,
        fontStyle: "900",
        color: "#1b1205"
      }).setOrigin(0.5).setDepth(543);
      retry.setInteractive({ useHandCursor: true });
      text.setInteractive({ useHandCursor: true });
      retry.on("pointerdown", () => this.startRun());
      text.on("pointerdown", () => this.startRun());
      items.push(retry, text);
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
      this.ui.morale.setText(`${this.morale}%`);
      this.ui.morale.setColor(this.morale < 35 ? "#ff524f" : this.morale < 70 ? "#ffd75c" : "#4dff67");
      this.ui.core.setText(String(Math.round(this.coreHp)));
      this.ui.coins.setText(String(this.coins));
      this.ui.shield.setText(String(Math.round(this.shield)));
      const progress = clamp(this.killsInLevel / this.levelNeed, 0, 1);
      this.progressBar.setSize(508 * progress, 6);
      this.progressBar.setFillStyle(this.mode === "skill" ? COLORS.gold : 0xe0ab26, 1);
      const hpRate = clamp(this.coreHp / this.maxCoreHp, 0, 1);
      this.coreBar.setSize(320 * hpRate, 10);
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
