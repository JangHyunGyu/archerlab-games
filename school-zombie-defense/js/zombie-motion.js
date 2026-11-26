(function (global) {
  "use strict";

  // Art corrections, reviewed at gameplay size. A crouched/foreshortened pose
  // must not be stretched to the standing height; preserve its anatomy instead.
  const frameScales = {
    // Male repaint atlases already contain the reviewed pose corrections.
    normal: [0.89, 0.88, 0.88, 0.85, 0.84, 0.84, 0.9, 1, 1.05, 1.04, 1.05, 1.05],
    runner: [1, 1, 1, 1.04, 1.15, 1.14, 1.08, 1.16],
    athlete: [1.01, 0.97, 0.92, 0.91, 0.91, 1.01, 1, 1.08],
    crawler: [1, 1, 0.98, 0.88, 0.98, 0.94, 0.98, 1],
    volleyball: [1.01, 1.02, 1.07, 1.07, 1, 1.18, 1.2, 1.2],
    plump: [1.01, 1.05, 1.08, 1.1, 1.06, 1.14, 1.14, 1.14],
    swimmer: [1, 1.02, 1.04, 1.05, 0.96, 1.13, 1.2, 1.2],
    ballet: [1.01, 1.01, 1.01, 1, 1, 1, 1, 0.99],
    librarian: [1, 1, 1, 1, 1, 1, 1, 1],
    charger: [1, 1, 0.98, 0.98, 1.08, 1.04, 1.2, 1.14],
    student: [1, 0.88, 1.04, 1.03],
    brute: [0.95, 1, 1.06, 1.18],
    volatile: [1, 1, 1.03, 1.12],
    elite: [1, 1.05, 1.04, 1.16],
    screamer: [1, 1, 1.16, 1.32],
    bloom: [0.93, 0.95, 1, 1.13],
    guard: [1, 1, 1.12, 1.08],
    diva: [1, 1.02, 1.05, 1.04, 0.98, 1.08, 1.22, 1.08],
    kendo: [1, 1.08, 1.2, 1.12],
    cheer: [1, 1, 1, 1.02, 1, 1.06, 1.36, 1.22]
  };

  function frameScale(type, frame) {
    const scales = frameScales[type];
    return scales ? scales[Math.min(Math.max(0, frame), scales.length - 1)] : 1;
  }

  // Resize around the visible body's alpha centroid, not the transparent cell.
  // Its local/world center therefore stays fixed, also after flip and rotation.
  function frameTransform(size, scale, center, flipX = false) {
    const [x, y] = center;
    return {
      size: size * scale,
      // Phaser flips the texture inside its box, rather than about the origin.
      originX: 0.5 + x * (flipX ? -1 : 1) * (1 - 1 / scale),
      originY: 0.5 + y * (1 - 1 / scale)
    };
  }

  function deathStart(zombie, walkCenter, deathCenter, size) {
    const sign = zombie.flipX ? -1 : 1;
    const height = zombie.displayH || 170;
    const width = zombie.displayW || height;
    return {
      x: zombie.x + walkCenter[0] * width * sign - deathCenter[0] * size * sign,
      y: zombie.y + (walkCenter[1] - 0.06) * height - deathCenter[1] * size
    };
  }

  const api = Object.freeze({ frameScales, frameScale, frameTransform, deathStart });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SchoolZombieMotion = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
