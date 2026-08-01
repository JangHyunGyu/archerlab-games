(function (global) {
  "use strict";

  const random = () => Math.random();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => random() * (max - min) + min;
  const formatGameSpeedLabel = (speed) => Number.isInteger(speed) ? `×${speed}.0` : `×${speed}`;
  const formatRunClock = (elapsed = 0) => {
    const total = Math.max(0, Math.floor(Number(elapsed) || 0));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const choose = (items) => items[Math.floor(random() * items.length)];
  const shuffleItems = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const api = Object.freeze({
    clamp,
    rand,
    formatGameSpeedLabel,
    formatRunClock,
    choose,
    shuffleItems
  });

  global.SchoolZombieCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
