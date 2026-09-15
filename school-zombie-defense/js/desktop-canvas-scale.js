(function () {
  "use strict";

  const MQ = "(min-width: 900px) and (min-aspect-ratio: 5/4)";
  const ASPECT = 540 / 960;
  let raf = 0;

  function isDesktop() {
    return Boolean(window.matchMedia?.(MQ).matches);
  }

  function applyScale() {
    raf = 0;
    const shell = document.getElementById("game-shell");
    const canvas = document.querySelector("#game-root canvas");
    if (!shell || !canvas?.style) {
      return;
    }

    if (!isDesktop()) {
      canvas.style.removeProperty("width");
      canvas.style.removeProperty("height");
      canvas.style.removeProperty("max-width");
      canvas.style.removeProperty("max-height");
      canvas.style.removeProperty("transform");
      return;
    }

    const shellW = Math.max(1, shell.clientWidth);
    const shellH = Math.max(1, shell.clientHeight);
    // Fill shell width while keeping the authored 9:16 aspect; shell overflow clips.
    const targetW = shellW;
    const targetH = targetW / ASPECT;
    canvas.style.width = `${Math.round(targetW)}px`;
    canvas.style.height = `${Math.round(targetH)}px`;
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
    canvas.style.transform = targetH > shellH + 1
      ? `translateY(${Math.round((shellH - targetH) / 2)}px)`
      : "";
  }

  function schedule() {
    if (raf) {
      cancelAnimationFrame(raf);
    }
    raf = requestAnimationFrame(applyScale);
  }

  function boot() {
    schedule();
    [80, 200, 480, 1000].forEach((ms) => window.setTimeout(schedule, ms));

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", schedule, { passive: true });
    }
    if (window.matchMedia) {
      const mql = window.matchMedia(MQ);
      mql.addEventListener?.("change", schedule);
    }

    const root = document.getElementById("game-root");
    if (root && window.MutationObserver) {
      new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    }

    const prevRefresh = window.__schoolZombieViewportRefresh;
    window.__schoolZombieViewportRefresh = function patchedRefresh() {
      if (typeof prevRefresh === "function") {
        prevRefresh();
      }
      schedule();
      window.setTimeout(schedule, 50);
      window.setTimeout(schedule, 160);
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("load", schedule, { once: true });
})();
