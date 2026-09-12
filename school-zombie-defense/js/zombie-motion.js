(function (global) {
  "use strict";

  // Art corrections, reviewed at gameplay size. A crouched/foreshortened pose
  // must not be stretched to the standing height; preserve its anatomy instead.
  const frameScales = {
    // Male repaint atlases already contain the reviewed pose corrections.
    runner: [1, 1, 1, 1.02, 1.05, 1.10, 1.12, 1.12],
    charger: [1, 1, 1, 1, 1.06, 1.07, 1.15, 1.15],
    student: [1, 0.88, 1.04, 1.03],
    brute: [0.95, 1, 1.06, 1.18],
    volatile: [1, 1, 1.03, 1.12],
    elite: [1, 1.05, 1.04, 1.16],
    screamer: [0.75, 0.75, 0.88, 1.06],
    bloom: [0.93, 0.95, 1, 1.13]
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
