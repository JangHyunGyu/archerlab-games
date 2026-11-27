(function (root) {
  "use strict";

  const SURFACES = Object.freeze({
    button: { key: "ui-survival-button", sourceBorder: 160, border: 6 },
    primary: { key: "ui-survival-primary", sourceBorder: 230, border: 14 },
    panel: { key: "ui-survival-panel", sourceBorder: 256, border: 20 },
    danger: { key: "ui-survival-danger", sourceBorder: 168, border: 14 },
    card: { key: "ui-survival-card", sourceBorder: 140, border: 12 },
    header: { key: "ui-survival-header", sourceBorder: 150, border: 14 },
    slot: { key: "ui-survival-slot", sourceBorder: 150, border: 10 }
  });

  const ICONS = Object.freeze({
    "skill-pistol-impact": 1, "skill-pistol-rapid": 0, "skill-pistol-pierce": 23,
    "skill-multishot": 1, "skill-pierce": 1, "skill-arrow-force": 2,
    "skill-arrow-pin": 2, "skill-arrow-pierce": 2, "skill-mark": 31,
    "skill-rally": 5, "skill-rifle-caliber": 15, "skill-rifle-grenade": 19,
    "skill-barrage": 3, "skill-rifle-suppress": 1, "skill-rocket-warhead": 4,
    "skill-frost": 7, "skill-rocket": 20, "skill-rocket-impact": 4,
    "skill-rocket-reload": 21, "skill-sniper-caliber": 23, "skill-sniper-weakpoint": 5,
    "skill-sniper": 22, "skill-sniper-reload": 15, "skill-fire-fuel": 24,
    "skill-fire-zone": 25, "skill-fire-bottle": 6, "skill-fire-sticky": 26,
    "skill-shock-amplifier": 8, "skill-shock-voltage": 9, "skill-shock-chain": 9,
    "skill-shock-overload": 27, "skill-engineer-nail": 29, "skill-engineer-turret": 10,
    "skill-engineer-wire": 11, "skill-max-hp": 13, "skill-full-repair": 14
  });

  const BASE_EQUIPMENT = [
    "pistol", "ammo", "bolt", "rifle",
    "rocket", "scope", "fire", "coolant",
    "battery", "coil", "turret", "wire",
    "wrench", "armor", "medical", "magazine"
  ];
  const EXTRA_EQUIPMENT = [
    "spring", "crossbow", "fletching", "grenade",
    "nozzle", "rocket-loader", "sniper-rifle", "ap-round",
    "fuel-can", "fire-spread", "napalm", "shock-arc",
    "insulated-grip", "nails", "pistol-barrel", "marked-tip"
  ];
  const EQUIPMENT = Object.freeze(
    [...BASE_EQUIPMENT, ...EXTRA_EQUIPMENT].reduce((acc, name, cell) => {
      acc[`equipment-${name}`] = cell;
      return acc;
    }, {})
  );

  function resolveIconCell(key) {
    let cell = null;
    if (Object.prototype.hasOwnProperty.call(ICONS, key)) {
      cell = ICONS[key];
    } else if (Object.prototype.hasOwnProperty.call(EQUIPMENT, key)) {
      cell = EQUIPMENT[key];
    }
    if (!Number.isInteger(cell) || cell < 0) return null;
    const extra = cell >= 16;
    const localCell = extra ? cell - 16 : cell;
    return {
      sheet: extra ? "ui-survival-equipment-extra" : "ui-survival-equipment",
      cell,
      col: localCell % 4,
      row: Math.floor(localCell / 4)
    };
  }

  // One job per icon: the job draws the cell and returns the upload, so a
  // deferred builder can run them in separate tasks. addImage uploads the same
  // canvas pixels as addCanvas without reading them back first.
  function iconJobs(scene, onDrawn) {
    const baseSource = scene.textures.get("ui-survival-equipment").getSourceImage();
    const extraSource = scene.textures.exists("ui-survival-equipment-extra")
      ? scene.textures.get("ui-survival-equipment-extra").getSourceImage()
      : null;
    const drawCell = (cell) => {
      const useExtra = cell >= 16 && Boolean(extraSource);
      const source = useExtra ? extraSource : baseSource;
      const localCell = useExtra ? cell - 16 : (cell % 16);
      const cellW = source.width / 4;
      const cellH = source.height / 4;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      canvas.getContext("2d").drawImage(source, (localCell % 4) * cellW, Math.floor(localCell / 4) * cellH,
        cellW, cellH, 0, 0, 256, 256);
      if (onDrawn) onDrawn(canvas);
      return canvas;
    };
    // Some icons replace generated skill textures with the same key, so the
    // old texture is removed right before the upload, keeping the job order.
    const jobs = Object.entries(ICONS).map(([key, cell]) => () => {
      const canvas = drawCell(cell);
      return () => {
        if (scene.textures.exists(key)) scene.textures.remove(key);
        scene.textures.addImage(key, canvas);
      };
    });
    // Additional inventory illustrations can be referenced directly by equipment type.
    BASE_EQUIPMENT.forEach((name, cell) => {
      jobs.push(() => {
        const canvas = drawCell(cell);
        return () => scene.textures.addImage(`equipment-${name}`, canvas);
      });
    });
    return jobs;
  }

  function installIcons(scene) {
    iconJobs(scene).forEach((job) => {
      const upload = job();
      if (typeof upload === "function") upload();
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

  root.SchoolZombieUI = Object.freeze({ SURFACES, ICONS, EQUIPMENT, resolveIconCell, iconJobs, installIcons, texture });
})(typeof window === "undefined" ? globalThis : window);
