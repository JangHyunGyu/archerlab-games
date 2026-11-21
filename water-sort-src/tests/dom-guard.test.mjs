import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';
import { advance } from '../lib/challenge.ts';
import { installDomMutationGuard } from '../app/dom-guard.ts';

test('DOM mutation guard protects managed containers while preserving native DOM semantics elsewhere', async t => {
  await t.test('handles normal operations, detached children, wrapped nodes, portals, and restore()', () => {
    const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/' });
    const win = dom.window;
    const doc = win.document;
    const root = doc.getElementById('root');
    const restore = installDomMutationGuard(root, win);

    try {
      // 1. Normal removeChild and insertBefore behave identically to native DOM.
      const box = doc.createElement('div');
      const a = doc.createElement('span');
      const b = doc.createElement('span');
      const c = doc.createElement('span');
      box.appendChild(a);
      box.appendChild(c);
      box.insertBefore(b, c);
      assert.deepEqual([...box.children], [a, b, c]);
      root.appendChild(box);
      assert.equal(box.removeChild(b), b);
      assert.deepEqual([...box.children], [a, c]);

      // 2. Detached child inside #root returns safely without NotFoundError.
      a.remove();
      assert.equal(box.removeChild(a), a);

      // 3. Externally wrapped child inside #root is removed from its wrapper instead of lingering.
      const wrapper = doc.createElement('font');
      box.appendChild(wrapper);
      wrapper.appendChild(c);
      assert.equal(box.removeChild(c), c);
      assert.equal(c.parentNode, null);
      assert.equal(wrapper.children.length, 0);

      // 4. Child moved outside parent is not stolen from its external parent.
      const externalContainer = doc.createElement('div');
      const moved = doc.createElement('em');
      externalContainer.appendChild(moved);
      assert.equal(box.removeChild(moved), moved);
      assert.equal(moved.parentNode, externalContainer);

      // 5. Wrapped referenceNode in insertBefore inserts before the direct-child wrapper.
      const targetWrapper = doc.createElement('font');
      const innerSpan = doc.createElement('span');
      const refNode = doc.createElement('div');
      targetWrapper.appendChild(innerSpan);
      innerSpan.appendChild(refNode);
      const firstChild = doc.createElement('i');
      const lastChild = doc.createElement('b');
      box.replaceChildren(firstChild, targetWrapper, lastChild);
      const inserted = doc.createElement('p');
      box.insertBefore(inserted, refNode);
      assert.deepEqual([...box.children], [firstChild, inserted, targetWrapper, lastChild]);

      // 6. Detached referenceNode in insertBefore appends to parent so UI is not lost.
      const orphanRef = doc.createElement('div');
      const appended = doc.createElement('u');
      box.insertBefore(appended, orphanRef);
      assert.equal(box.lastElementChild, appended);

      // 7. document.body portals tolerate detached/wrapped nodes too.
      const portal = doc.createElement('canvas');
      const portalWrap = doc.createElement('font');
      doc.body.appendChild(portalWrap);
      portalWrap.appendChild(portal);
      assert.equal(doc.body.removeChild(portal), portal);
      assert.equal(portal.parentNode, null);
      assert.equal(doc.body.removeChild(portal), portal);

      const portalAnchorWrap = doc.createElement('font');
      const portalAnchor = doc.createElement('div');
      doc.body.appendChild(portalAnchorWrap);
      portalAnchorWrap.appendChild(portalAnchor);
      const portalBefore = doc.createElement('canvas');
      doc.body.insertBefore(portalBefore, portalAnchor);
      assert.equal(portalBefore.nextSibling, portalAnchorWrap);

      // 8. Unmanaged container outside #root and document.body still throws native NotFoundError.
      const unmanaged = doc.createElement('div');
      const stranger = doc.createElement('span');
      assert.throws(() => unmanaged.removeChild(stranger), { name: 'NotFoundError' });

      // 9. restore() cleanly restores native Node.prototype behavior.
      restore();
      const orphanInRoot = doc.createElement('span');
      assert.throws(() => box.removeChild(orphanInRoot), { name: 'NotFoundError' });
    } finally {
      restore();
      win.close();
    }
  });
});

test('React 19 <Home /> survives external Safari/extension DOM mutations inside .experiment-tray', async t => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { default: Home } = await vite.ssrLoadModule('/app/page.tsx');

    async function withGame(useGuard, runTest) {
      const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true });
      const win = dom.window;
      const rootEl = win.document.getElementById('root');
      const savedWorker = globalThis.Worker;
      const pageErrors = [];
      const uncaughtErrors = [];
      const onWinError = event => {
        event.preventDefault();
        pageErrors.push(event.error || new Error(event.message));
      };
      win.addEventListener('error', onWinError);

      globalThis.Worker = class {
        onmessage = null; onerror = null;
        postMessage() {}
        terminate() {}
      };
      const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      Object.assign(globalThis, {
        window: win, document: win.document, localStorage: win.localStorage,
        IS_REACT_ACT_ENVIRONMENT: true, matchMedia: media,
        innerWidth: 1180, innerHeight: 763, scrollX: 0, scrollY: 0,
        visualViewport: undefined, devicePixelRatio: 2,
        requestAnimationFrame: () => 1, cancelAnimationFrame() {},
      });
      Object.assign(win, { matchMedia: media });
      win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      win.HTMLCanvasElement.prototype.getContext = function () { return this.classList.contains('pour-overlay') ? { scale() {} } : null; };
      Object.defineProperty(win.HTMLElement.prototype, 'offsetParent', { get() { return this.parentElement; } });
      win.HTMLElement.prototype.getBoundingClientRect = function () {
        const index = Number(this.closest('[data-bottle-index]')?.dataset.bottleIndex ?? 0);
        return { x: 100 + index * 100, y: 200, width: 50, height: 150, top: 200, bottom: 350, left: 100 + index * 100, right: 150 + index * 100 };
      };

      const initial = {
        rules: 2, id: 'run', version: 1, level: 1, cleared: 0, score: 0,
        board: [[0, 1], [1, 0], [], []], bottleAvailableAt: [0, 0, 0, 0],
        moves: 0, deadline: Date.now() + 60000, availableAt: 0, status: 'playing',
        historyDepth: 0, registered: false, nickname: null, serverNow: Date.now(),
      };
      const pourRequests = [];
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        if (body.type === 'pour') return new Promise((resolve, reject) => pourRequests.push({ body, resolve, reject }));
        return { ok: true, json: async () => ({ run: initial, ...(body.type === 'start' ? { token: 'token' } : {}) }) };
      };

      const restore = useGuard ? installDomMutationGuard(rootEl, win) : () => {};
      const root = createRoot(rootEl, {
        onUncaughtError(error) { uncaughtErrors.push(error); },
      });
      const click = async el => act(() => el.click());
      const button = text => [...win.document.querySelectorAll('button')].find(e => e.textContent.replace('▶', '').trim() === text);
      const bottles = () => [...win.document.querySelectorAll('[data-bottle-index]')];
      const queuePour = async (from = 2, to = 3) => { await click(bottles()[from]); await click(bottles()[to]); };
      const pressEscape = async () => act(() => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' })));

      try {
        await act(() => root.render(createElement(Home)));
        await click(button('새로 시작'));
        // Start one active pour so subsequent pours enter the reservation queue (.queue-count).
        await click(bottles()[0]);
        await click(bottles()[2]);
        await runTest({ win, doc: win.document, bottles, queuePour, pressEscape, pageErrors, uncaughtErrors, pourRequests, initial });
      } finally {
        await act(() => root.unmount());
        restore();
        win.removeEventListener('error', onWinError);
        globalThis.Worker = savedWorker;
        win.close();
      }
    }

    await t.test('baseline without guard reproduces NotFoundError when .queue-count is externally removed', async () => {
      await withGame(false, async h => {
        await h.queuePour();
        const badge = h.doc.querySelector('.queue-count');
        assert.ok(badge);
        badge.remove();
        let thrown = null;
        try {
          await h.pressEscape();
        } catch (e) {
          thrown = e;
        }
        const err = thrown ?? h.uncaughtErrors[0] ?? h.pageErrors[0];
        assert.equal(err?.name, 'NotFoundError');
      });
    });

    await t.test('Case A: external removal of .queue-count does not crash and keeps the board interactive', async () => {
      await withGame(true, async h => {
        await h.queuePour();
        const badge = h.doc.querySelector('.queue-count');
        assert.ok(badge);
        badge.remove();
        await h.pressEscape();
        assert.equal(h.uncaughtErrors.length, 0);
        assert.equal(h.pageErrors.length, 0);
        assert.ok(h.doc.querySelector('.board'));
        // Board remains interactive and can queue again cleanly.
        await h.queuePour(2, 3);
        assert.equal(h.doc.querySelector('.queue-count')?.textContent, '예약 1/5');
      });
    });

    await t.test('Case B: extension wrapping .queue-count in <font> removes the node cleanly on unmount', async () => {
      await withGame(true, async h => {
        await h.queuePour();
        const tray = h.doc.querySelector('.experiment-tray');
        const badge = tray.querySelector('.queue-count');
        const font = h.doc.createElement('font');
        tray.insertBefore(font, badge);
        font.appendChild(badge);
        await h.pressEscape();
        assert.equal(h.uncaughtErrors.length, 0);
        assert.equal(h.pageErrors.length, 0);
        assert.equal(h.doc.querySelector('.queue-count'), null);
        assert.equal(font.children.length, 0);
        await h.queuePour(2, 3);
        assert.equal(h.doc.querySelector('.queue-count')?.textContent, '예약 1/5');
      });
    });

    await t.test('Case C: wrapping .board reference sibling still allows .queue-count to mount via insertBefore', async () => {
      await withGame(true, async h => {
        const tray = h.doc.querySelector('.experiment-tray');
        const board = tray.querySelector('.board');
        const font = h.doc.createElement('font');
        tray.insertBefore(font, board);
        font.appendChild(board);
        await h.queuePour();
        assert.equal(h.uncaughtErrors.length, 0);
        assert.equal(h.pageErrors.length, 0);
        const badge = tray.querySelector('.queue-count');
        assert.ok(badge);
        assert.equal(badge.textContent, '예약 1/5');
        await h.pressEscape();
        assert.equal(tray.querySelector('.queue-count'), null);
      });
    });

    await t.test('survives queued pour confirmation followed by external DOM mutation', async () => {
      await withGame(true, async h => {
        await h.queuePour();
        const badge = h.doc.querySelector('.queue-count');
        badge.remove();
        const moved = { ...h.initial, ...advance({ ...h.initial, history: [] }, { type: 'pour', from: 0, to: 2 }, Date.now()), version: 2, serverNow: Date.now() };
        await act(async () => h.pourRequests[0].resolve({ ok: true, json: async () => ({ run: moved }) }));
        await h.pressEscape();
        assert.equal(h.uncaughtErrors.length, 0);
        assert.ok(h.doc.querySelector('.board'));
      });
    });
  } finally {
    await vite.close();
  }
});
