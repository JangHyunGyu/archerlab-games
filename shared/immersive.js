/* Shared across ArcherLab games, Cupid and Nevergrad. Keep copies in sync. */
(function (root) {
  'use strict';
  if (root.ArcherImmersive) return;
  const doc = root.document;
  let pending = null;
  let attempted = false;

  const isFullscreen = () => Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
  const isStandalone = () => Boolean(root.navigator.standalone || root.matchMedia?.('(display-mode: standalone)').matches || root.matchMedia?.('(display-mode: fullscreen)').matches);
  const supported = () => Boolean(doc.documentElement.requestFullscreen || doc.documentElement.webkitRequestFullscreen || doc.documentElement.msRequestFullscreen);

  function enter() {
    if (pending) return pending;
    if (isFullscreen() || isStandalone()) return Promise.resolve(true);
    if (!supported() || root.navigator.userActivation?.isActive === false) return Promise.resolve(false);
    const element = doc.documentElement;
    try {
      const result = element.requestFullscreen
        ? element.requestFullscreen({ navigationUI: 'hide' })
        : (element.webkitRequestFullscreen || element.msRequestFullscreen).call(element);
      // Older WebKit returns void; denial must never interrupt game startup.
      pending = Promise.resolve(result).then(() => true, () => false).finally(() => { pending = null; });
      return pending;
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function autoEnter() {
    if (attempted || root.navigator.userActivation?.isActive === false) return Promise.resolve(false);
    attempted = true;
    return enter();
  }

  function exit() {
    if (!isFullscreen()) return Promise.resolve(false);
    try {
      const leave = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      return Promise.resolve(leave?.call(doc)).then(() => true, () => false);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  // Desktop mouse play should not jump into browser fullscreen; keep that for
  // explicit controls and for coarse-pointer (phone/tablet) canvas taps.
  const prefersTouchImmersive = () => Boolean(root.matchMedia?.('(pointer: coarse)').matches);

  function onGesture(event) {
    const target = event.target;
    if (!event.isTrusted || !target?.closest || target.closest('a, input, textarea, select, [contenteditable], [data-ranking-scroll], [data-no-fullscreen]')) return;
    const explicit = target.closest('[data-fullscreen-start], [data-fullscreen-play]');
    const canvasTouch = prefersTouchImmersive() && target.closest('canvas');
    if (explicit || canvasTouch) autoEnter();
  }

  // Click retains activation for touch, mouse and native keyboard buttons.
  // Never preventDefault: navigation, focus, audio and game input keep working.
  doc.addEventListener('click', onGesture, true);
  // Canvas engines can cancel compatibility clicks after a touch. Pointer-up
  // still carries touch activation on coarse pointers only.
  doc.addEventListener('pointerup', event => {
    if (prefersTouchImmersive() && event.target?.closest?.('canvas')) onGesture(event);
  }, true);
  doc.addEventListener('keydown', event => {
    if (!prefersTouchImmersive()) return;
    if (event.isTrusted && event.key === 'Enter' && !event.repeat &&
        ['BODY', 'CANVAS'].includes(event.target?.tagName) && doc.querySelector('canvas')) autoEnter();
  }, true);
  root.addEventListener('pageshow', event => {
    if (event.persisted) attempted = false;
  });
  root.ArcherImmersive = Object.freeze({ enter, autoEnter, exit, isFullscreen, isStandalone, supported,
    toggle: () => isFullscreen() ? exit() : enter() });
})(window);
