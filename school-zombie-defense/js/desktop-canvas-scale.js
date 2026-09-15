(function () {
  "use strict";

  const MQ = "(min-width: 900px) and (min-aspect-ratio: 5/4)";
  const ASPECT = 540 / 960;
  let raf = 0;
  let watchedCanvas = null;
  let sizeObserver = null;

  function isDesktop() {
    try {
      return Boolean(window.matchMedia?.(MQ).matches);
    } catch (error) {
      return window.innerWidth >= 900 && window.innerWidth / Math.max(window.innerHeight, 1) >= 1.25;
    }
  }

  function applyScale() {
    raf = 0;
    const shell = document.getElementById("game-shell");
    const canvas = document.querySelector("#game-root canvas");
    if (!shell || !canvas?.style) {
      return;
    }

    watchCanvas(canvas);

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
    const targetW = shellW;
    const targetH = targetW / ASPECT;

    // important: Phaser Scale.FIT keeps rewriting non-important inline sizes
    canvas.style.setProperty("width", `${Math.round(targetW)}px`, "important");
    canvas.style.setProperty("height", `${Math.round(targetH)}px`, "important");
    canvas.style.setProperty("max-width", "none", "important");
    canvas.style.setProperty("max-height", "none", "important");
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

  function watchCanvas(canvas) {
    if (watchedCanvas === canvas) {
      return;
    }
    watchedCanvas = canvas;
    if (sizeObserver) {
      sizeObserver.disconnect();
    }
    if (!window.ResizeObserver) {
      return;
    }
    sizeObserver = new ResizeObserver(() => {
      if (!isDesktop()) {
        return;
      }
      const shell = document.getElementById("game-shell");
      if (!shell) {
        return;
      }
      // Phaser shrank the canvas back toward ~height×0.5625 — push again.
      if (Math.abs(canvas.clientWidth - shell.clientWidth) > 2) {
        schedule();
      }
    });
    sizeObserver.observe(canvas);
  }

  function patchViewportRefresh() {
    const prev = window.__schoolZombieViewportRefresh;
    if (prev && prev.__desktopCanvasPatched) {
      return;
    }
    const wrapped = function patchedRefresh() {
      if (typeof prev === "function") {
        prev();
      }
      schedule();
      window.setTimeout(schedule, 16);
      window.setTimeout(schedule, 50);
      window.setTimeout(schedule, 120);
      window.setTimeout(schedule, 320);
    };
    wrapped.__desktopCanvasPatched = true;
    window.__schoolZombieViewportRefresh = wrapped;
  }

  function boot() {
    schedule();
    patchViewportRefresh();
    [50, 100, 200, 400, 800, 1600, 3200].forEach((ms) => window.setTimeout(() => {
      patchViewportRefresh();
      schedule();
    }, ms));

    // Keep fighting Phaser refresh for a short window after boot.
    let ticks = 0;
    const pulse = window.setInterval(() => {
      schedule();
      ticks += 1;
      if (ticks >= 40) {
        window.clearInterval(pulse);
      }
    }, 250);

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
      new MutationObserver(schedule).observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "width", "height"]
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("load", () => {
    patchViewportRefresh();
    schedule();
  }, { once: true });
})();
