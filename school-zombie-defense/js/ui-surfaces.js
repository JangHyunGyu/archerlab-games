(function (root) {
  "use strict";

  const SURFACES = Object.freeze({
    button: { key: "ui-survival-button", sourceBorder: 64, border: 6 },
    primary: { key: "ui-survival-primary", sourceBorder: 64, border: 9 },
    panel: { key: "ui-survival-panel", sourceBorder: 40, border: 7 }
  });

  const ICONS = Object.freeze({
    "skill-pistol-impact": 0, "skill-pistol-rapid": 0, "skill-pistol-pierce": 1,
    "skill-multishot": 1, "skill-pierce": 1, "skill-arrow-force": 2,
    "skill-arrow-pin": 2, "skill-arrow-pierce": 2, "skill-mark": 5,
    "skill-rally": 2, "skill-rifle-caliber": 3, "skill-rifle-grenade": 4,
    "skill-barrage": 3, "skill-rifle-suppress": 15, "skill-rocket-warhead": 4,
    "skill-frost": 7, "skill-rocket": 4, "skill-rocket-impact": 4,
    "skill-rocket-reload": 15, "skill-sniper-caliber": 1, "skill-sniper-weakpoint": 5,
    "skill-sniper": 5, "skill-sniper-reload": 15, "skill-fire-fuel": 6,
    "skill-shock-amplifier": 8, "skill-engineer-nail": 10,
    "skill-max-hp": 13, "skill-full-repair": 14
  });

  function installIcons(scene) {
    const source = scene.textures.get("ui-survival-equipment").getSourceImage();
    const cellW = source.width / 4;
    const cellH = source.height / 4;
    Object.entries(ICONS).forEach(([key, cell]) => {
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      canvas.getContext("2d").drawImage(source, (cell % 4) * cellW, Math.floor(cell / 4) * cellH,
        cellW, cellH, 0, 0, 256, 256);
      scene.textures.addCanvas(key, canvas);
    });
    // Additional inventory illustrations can be referenced directly by equipment type.
    ["pistol", "ammo", "bolt", "rifle", "rocket", "scope", "fire", "coolant", "battery", "coil", "turret", "wire", "wrench", "armor", "medical", "magazine"].forEach((name, cell) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      canvas.getContext("2d").drawImage(source, (cell % 4) * cellW, Math.floor(cell / 4) * cellH,
        cellW, cellH, 0, 0, 256, 256);
      scene.textures.addCanvas(`equipment-${name}`, canvas);
    });
  }

  // Bake nine-slice surfaces once per logical size. Corners never stretch, and
  // 2x canvases keep the same assets sharp in both Canvas and WebGL renderers.
  function texture(scene, kind, width, height) {
    const surface = SURFACES[kind] || SURFACES.panel;
    const w = Math.max(1, Math.ceil(Number(width) || 1));
    const h = Math.max(1, Math.ceil(Number(height) || 1));
    const key = `${surface.key}:${w}x${h}`;
    if (scene.textures.exists(key)) return key;
    const source = scene.textures.get(surface.key).getSourceImage();
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const edge = Math.min(surface.sourceBorder, Math.floor(source.width / 3), Math.floor(source.height / 3));
    const dx = Math.min(surface.border * scale, Math.floor(canvas.width / 2));
    const dy = Math.min(surface.border * scale, Math.floor(canvas.height / 2));
    const sx = [0, edge, source.width - edge, source.width];
    const sy = [0, edge, source.height - edge, source.height];
    const tx = [0, dx, canvas.width - dx, canvas.width];
    const ty = [0, dy, canvas.height - dy, canvas.height];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const dw = tx[col + 1] - tx[col];
        const dh = ty[row + 1] - ty[row];
        if (dw > 0 && dh > 0) ctx.drawImage(source,
          sx[col], sy[row], sx[col + 1] - sx[col], sy[row + 1] - sy[row],
          tx[col], ty[row], dw, dh);
      }
    }
    scene.textures.addCanvas(key, canvas);
    return key;
  }

  root.SchoolZombieUI = Object.freeze({ SURFACES, ICONS, installIcons, texture });
})(typeof window === "undefined" ? globalThis : window);
