/* Shared across ArcherLab games, Cupid and Nevergrad. Keep copies in sync. */
(function (root) {
  'use strict';
  if (root.ArcherImmersive) return;
  const doc = root.document;
  const HINT_PX = 80;
  const HINT_MS = 2500;
  let pending = null;
  let attempted = false;
  let vvBound = false;
  let vkBound = false;
  let hintUntil = 0;
  let hintTimer = null;
  let leavingHome = false;

  const isFullscreen = () => Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
  const isStandalone = () => { var __oc0, __oc1; return (
Boolean(root.navigator.standalone || (((__oc0 = root.matchMedia) === null || __oc0 === void 0 ? void 0 : __oc0.call(root, '(display-mode: standalone)').matches)) || (((__oc1 = root.matchMedia) === null || __oc1 === void 0 ? void 0 : __oc1.call(root, '(display-mode: fullscreen)').matches)))
); };
  const supported = () => Boolean(doc.documentElement.requestFullscreen || doc.documentElement.webkitRequestFullscreen || doc.documentElement.msRequestFullscreen);

  function isEditing() { var __oc2, __oc3;
    const el = doc.activeElement;
    if (!el || el === doc.body || el === doc.documentElement) return false;
    if ((((__oc2 = el.matches) === null || __oc2 === void 0 ? void 0 : __oc2.call(el, 'input, textarea, select, [contenteditable="true"], [contenteditable=""]')))) return true;
    return Boolean((((__oc3 = el.closest) === null || __oc3 === void 0 ? void 0 : __oc3.call(el, '[contenteditable="true"]'))));
  }

  function keyboardOverlapFrom(metrics) {
    if (!((metrics === null || metrics === void 0 ? void 0 : metrics.editing))) return 0;
    const layout = Math.max(metrics.innerHeight || 0, metrics.clientHeight || 0);
    const vvOverlap = metrics.vvHeight == null
      ? 0
      : Math.max(0, Math.round(layout - metrics.vvHeight - (metrics.vvOffsetTop || 0)));
    const vk = Math.round(metrics.vkHeight || 0);
    return Math.max(vk > 80 ? vk : 0, vvOverlap > 80 ? vvOverlap : 0);
  }

  function keyboardOverlap() { var __oc4, __oc5, __oc6;
    const vv = root.visualViewport;
    return keyboardOverlapFrom({
      editing: isEditing(),
      innerHeight: root.innerHeight || 0,
      clientHeight: doc.documentElement.clientHeight || 0,
      vvHeight: vv ? vv.height : null,
      vvOffsetTop: vv ? vv.offsetTop || 0 : 0,
      vkHeight: (((__oc6 = (__oc5 = (__oc4 = root.navigator) === null || __oc4 === void 0 ? void 0 : __oc4.virtualKeyboard) === null || __oc5 === void 0 ? void 0 : __oc5.boundingRect) === null || __oc6 === void 0 ? void 0 : __oc6.height)) || 0
    });
  }

  function bindKeyboard() { var __oc7;
    const vk = (((__oc7 = root.navigator) === null || __oc7 === void 0 ? void 0 : __oc7.virtualKeyboard));
    if (vk && !vkBound && vk.addEventListener) {
      vkBound = true;
      vk.addEventListener('geometrychange', syncLayout);
    }
    if (root.visualViewport && !vvBound) {
      vvBound = true;
      root.visualViewport.addEventListener('resize', syncLayout);
      root.visualViewport.addEventListener('scroll', syncLayout);
    }
  }

  function clearHintTimer() {
    if (hintTimer && root.clearTimeout) root.clearTimeout(hintTimer);
    hintTimer = null;
  }

  function armBriefHint() {
    // Browser exit toasts cannot be dismissed; lift controls briefly then restore.
    hintUntil = Date.now() + HINT_MS;
    clearHintTimer();
    if (root.setTimeout) {
      hintTimer = root.setTimeout(() => {
        hintTimer = null;
        hintUntil = 0;
        syncLayout();
      }, HINT_MS + 30);
    }
  }

  function syncLayout() { var __oc8, __oc9, __oc10, __oc11, __oc12, __oc13, __oc14, __oc15;
    const el = doc.documentElement;
    const fs = isFullscreen();
    const keyboard = keyboardOverlap();
    const hintActive = fs && keyboard === 0 && Date.now() < hintUntil;
    const hint = hintActive ? HINT_PX : 0;
    (((__oc8 = el.classList) === null || __oc8 === void 0 ? void 0 : __oc8.toggle('archer-immersive-fs', fs)));
    (((__oc9 = el.classList) === null || __oc9 === void 0 ? void 0 : __oc9.toggle('archer-immersive-hint', hint > 0)));
    (((__oc11 = (__oc10 = el.style).setProperty) === null || __oc11 === void 0 ? void 0 : __oc11.call(__oc10, '--immersive-bottom-inset', `${hint}px`)));
    (((__oc13 = (__oc12 = el.style).setProperty) === null || __oc13 === void 0 ? void 0 : __oc13.call(__oc12, '--immersive-keyboard-inset', `${keyboard}px`)));
    (((__oc15 = (__oc14 = el.style).setProperty) === null || __oc15 === void 0 ? void 0 : __oc15.call(__oc14, '--immersive-top-shift', `${hint}px`)));
    // Never transform <html>: it turns position:fixed into a broken hit target.
    el.style.transform = '';
    hardenHomeLinks();
  }

  function installStyle() { var __oc16, __oc17;
    if ((((__oc16 = doc.getElementById) === null || __oc16 === void 0 ? void 0 : __oc16.call(doc, 'archer-immersive-style'))) || !doc.createElement || !(((__oc17 = doc.head) === null || __oc17 === void 0 ? void 0 : __oc17.appendChild))) return;
    const style = doc.createElement('style');
    style.id = 'archer-immersive-style';
    style.textContent = [
      'a[href="https://archerlab.dev"],a[href="https://archerlab.dev/"],a[href="https://www.archerlab.dev"],a[href="https://www.archerlab.dev/"]{pointer-events:auto!important;z-index:2147483646!important}',
      'html.archer-immersive-fs :is(.archerlab-link,a.archerlab-btn,.menu-archerlab-link,.title-brand,.brand-link,.lang-switcher,#topbar){top:max(88px,calc(env(safe-area-inset-top,0px) + 72px + var(--immersive-top-shift,0px)))!important}'
    ].join('');
    doc.head.appendChild(style);
  }

  function onFullscreenChange() {
    if (isFullscreen()) {
      bindKeyboard();
      armBriefHint();
    } else {
      clearHintTimer();
      hintUntil = 0;
      leavingHome = false;
    }
    syncLayout();
  }

  function enter() { var __oc18;
    if (pending) return pending;
    if (isFullscreen() || isStandalone()) return Promise.resolve(true);
    if (!supported() || (((__oc18 = root.navigator.userActivation) === null || __oc18 === void 0 ? void 0 : __oc18.isActive)) === false) return Promise.resolve(false);
    const element = doc.documentElement;
    try {
      const result = element.requestFullscreen
        ? element.requestFullscreen({ navigationUI: 'hide' })
        : (element.webkitRequestFullscreen || element.msRequestFullscreen).call(element);
      pending = Promise.resolve(result).then(() => {
        onFullscreenChange();
        return true;
      }, () => false).finally(() => { pending = null; });
      return pending;
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function autoEnter() { var __oc19;
    if (attempted) return Promise.resolve(false);
    if (isFullscreen() || isStandalone()) {
      attempted = true;
      return Promise.resolve(true);
    }
    if (!supported()) {
      attempted = true;
      return Promise.resolve(false);
    }
    if ((((__oc19 = root.navigator.userActivation) === null || __oc19 === void 0 ? void 0 : __oc19.isActive)) === false) return Promise.resolve(false);
    return enter().then((ok) => {
      if (ok) attempted = true;
      return ok;
    });
  }

  function exit() {
    if (!isFullscreen()) return Promise.resolve(false);
    try {
      const leave = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      return Promise.resolve(((leave === null || leave === void 0 ? void 0 : leave.call(doc)))).then(() => true, () => false);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function homeHref(anchor) { var __oc20;
    const raw = String((((__oc20 = anchor === null || anchor === void 0 ? void 0 : anchor.getAttribute) === null || __oc20 === void 0 ? void 0 : __oc20.call(anchor, 'href'))) || ((anchor === null || anchor === void 0 ? void 0 : anchor.href)) || '').trim();
    const path = raw.replace(/https?:\/\/(?:www\.)?archerlab\.dev/i, '');
    if (!/^https?:\/\/(?:www\.)?archerlab\.dev/i.test(raw)) return '';
    if (path && path !== '/' && path !== '') return '';
    return 'https://archerlab.dev/';
  }

  const HOME_MESSAGE = 'archerlab:go-home';
  const HOME_ORIGINS = ['https://archerlab.dev', 'https://www.archerlab.dev'];
  const FRAME_ESCAPE_MS = 350;
  const handledFrameEvents = typeof WeakSet === 'function' ? new WeakSet() : null;
  let frameEscapeTimer = null;

  function isFramed() {
    try {
      return Boolean(root.top) && root.top !== root;
    } catch (_) {
      return true;
    }
  }

  // Inside the Archerlab app launcher (mobile iframe overlay) a plain link would
  // load the portal *inside* the frame. Ask the launcher to close itself, and if
  // nobody answers (older cached portal script, other embedder), take over the top
  // window instead. Cross-origin top.location assignment is allowed; reading is not.
  function leaveFrame(href) {
    if (frameEscapeTimer) return;
    try {
      for (const origin of HOME_ORIGINS) root.parent.postMessage({ type: HOME_MESSAGE, href }, origin);
    } catch (_) {}
    const fallback = () => {
      frameEscapeTimer = null;
      try {
        root.top.location.href = href;
      } catch (_) {
        try { root.location.href = href; } catch (__) {}
      }
    };
    if (root.setTimeout) frameEscapeTimer = root.setTimeout(fallback, FRAME_ESCAPE_MS);
    else fallback();
  }

  function goHome(href) { var __oc21;
    leavingHome = false;
    href = href || 'https://archerlab.dev/';
    if (isFramed()) {
      if (isFullscreen()) Promise.resolve(exit()).then(() => leaveFrame(href), () => leaveFrame(href));
      else leaveFrame(href);
      return;
    }
    if ((((__oc21 = root.location) === null || __oc21 === void 0 ? void 0 : __oc21.assign))) root.location.assign(href);
    else root.location.href = href;
  }

  function hardenHomeLinks() { var __oc22;
    const nodes = (((__oc22 = doc.querySelectorAll) === null || __oc22 === void 0 ? void 0 : __oc22.call(doc, 'a[href]'))) || [];
    for (const a of nodes) {
      if (!homeHref(a)) continue;
      if (a.style.pointerEvents === 'none') a.style.pointerEvents = 'auto';
      if (!a.__archerHomeBound) {
        a.__archerHomeBound = true;
        a.addEventListener('click', onHomeClick, true);
      }
    }
  }

  function onHomeClick(event) { var __oc23, __oc24, __oc25, __oc26;
    const anchor = (((__oc24 = (__oc23 = event.target) === null || __oc23 === void 0 ? void 0 : __oc23.closest) === null || __oc24 === void 0 ? void 0 : __oc24.call(__oc23, 'a')));
    const href = homeHref(anchor);
    if (!event.isTrusted || !href) return false;
    if (isFramed()) {
      // One activation can reach both the document and anchor listeners.
      if (handledFrameEvents) {
        if (handledFrameEvents.has(event)) return true;
        handledFrameEvents.add(event);
      }
      (((__oc25 = event.preventDefault) === null || __oc25 === void 0 ? void 0 : __oc25.call(event)));
      goHome(href);
      return true;
    }
    if (!isFullscreen() && !event.defaultPrevented) return false;
    (((__oc26 = event.preventDefault) === null || __oc26 === void 0 ? void 0 : __oc26.call(event)));
    if (leavingHome) {
      goHome(href);
      return true;
    }
    leavingHome = true;
    if (!isFullscreen()) {
      goHome(href);
      return true;
    }
    Promise.resolve(exit()).then(() => goHome(href), () => goHome(href));
    return true;
  }

  function onGesture(event) {
    if (onHomeClick(event)) return;
    const target = event.target;
    if (!event.isTrusted || !((target === null || target === void 0 ? void 0 : target.closest)) || target.closest('a, input, textarea, select, [contenteditable], [data-ranking-scroll], [data-no-fullscreen]')) return;
    if (target.closest('[data-fullscreen-start], canvas, [data-fullscreen-play], [data-fullscreen-force], button, [role="button"]')) autoEnter();
  }

  doc.addEventListener('click', onGesture, true);
  doc.addEventListener('pointerup', event => { var __oc27, __oc28, __oc29, __oc30;
    // Touch/pen activation is pointerup; pointerdown is not a fullscreen gesture on Chrome Android.
    if (event.pointerType === 'mouse') return;
    if ((((__oc28 = (__oc27 = event.target) === null || __oc27 === void 0 ? void 0 : __oc27.closest) === null || __oc28 === void 0 ? void 0 : __oc28.call(__oc27, 'a[href]')))) return;
    if ((((__oc30 = (__oc29 = event.target) === null || __oc29 === void 0 ? void 0 : __oc29.closest) === null || __oc30 === void 0 ? void 0 : __oc30.call(__oc29, 'canvas, [data-fullscreen-start], [data-fullscreen-play], button, [role="button"]')))) onGesture(event);
  }, true);
  doc.addEventListener('keydown', event => { var __oc31;
    if (event.isTrusted && event.key === 'Enter' && !event.repeat &&
        ['BODY', 'CANVAS', 'BUTTON'].includes((((__oc31 = event.target) === null || __oc31 === void 0 ? void 0 : __oc31.tagName)))) autoEnter();
  }, true);
  doc.addEventListener('fullscreenchange', onFullscreenChange);
  doc.addEventListener('webkitfullscreenchange', onFullscreenChange);
  doc.addEventListener('MSFullscreenChange', onFullscreenChange);
  doc.addEventListener('focusin', syncLayout, true);
  doc.addEventListener('focusout', () => {
    if (root.setTimeout) root.setTimeout(syncLayout, 60);
    else syncLayout();
  }, true);
  root.addEventListener('resize', syncLayout);
  root.addEventListener('pageshow', event => {
    if (event.persisted) attempted = false;
    leavingHome = false;
    syncLayout();
  });
  doc.addEventListener('visibilitychange', () => {
    if (!isFullscreen()) leavingHome = false;
    syncLayout();
  });
  bindKeyboard();
  installStyle();
  hardenHomeLinks();
  root.ArcherImmersive = Object.freeze({
    enter, autoEnter, exit, isFullscreen, isStandalone, supported, goHome,
    keyboardOverlap, keyboardOverlapFrom,
    toggle: () => isFullscreen() ? exit() : enter()
  });
})(window);
