import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';
import { advance, leaveStage, resumeStage } from '../lib/challenge.ts';

test('pour previews start before the server responds and reconcile safely', async t => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { default: Home } = await vite.ssrLoadModule('/app/page.tsx');
    async function harness(check, reduced = false, overrides = {}) {
      const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
      const win = dom.window, requests = [], commands = [], inspections = [], workers = [];
      const savedWorker = globalThis.Worker;
      globalThis.Worker = class {
        jobs = []; onmessage = null; onerror = null; terminated = false;
        constructor() { workers.push(this); }
        postMessage(job) { this.jobs.push(structuredClone(job)); }
        terminate() { this.terminated = true; }
      };
      const workerResult = async (outcome, job = workers.at(-1).jobs.at(-1)) => {
        await act(() => workers.at(-1).onmessage?.({ data: { id: job.id, version: job.version, outcome } }));
      };
      const initial = { rules: 2, id: 'run', version: 1, level: 1, cleared: 0, score: 0, board: [[0, 1], [1, 0], [], []], bottleAvailableAt: [0, 0, 0, 0], moves: 0, deadline: Date.now() + 60000, availableAt: 0, status: 'playing', historyDepth: 0, registered: false, nickname: null, serverNow: Date.now(), ...overrides };
      let authoritative = initial;
      const media = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} });
      Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage, IS_REACT_ACT_ENVIRONMENT: true, matchMedia: media, innerWidth: 1024, innerHeight: 768, scrollX: 0, scrollY: 0, visualViewport: undefined, devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
      Object.assign(win, { matchMedia: media });
      win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      win.HTMLCanvasElement.prototype.getContext = function () { return this.classList.contains('pour-overlay') ? { scale() {} } : null; };
      Object.defineProperty(win.HTMLElement.prototype, 'offsetParent', { get() { return this.parentElement; } });
      win.HTMLElement.prototype.getBoundingClientRect = function () { const index = Number(this.closest('[data-bottle-index]')?.dataset.bottleIndex ?? 0); return { x: 100 + index * 100, y: 200, width: 50, height: 150, top: 200, bottom: 350, left: 100 + index * 100, right: 150 + index * 100 }; };
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        if (body.type === 'inspect') return new Promise(resolve => inspections.push({ body, resolve, signal: init.signal }));
        commands.push(body);
        if (body.type === 'pour') return new Promise((resolve, reject) => requests.push({ body, resolve, reject }));
        if (body.type === 'leave' || body.type === 'resume') {
          const state = { ...authoritative, history: [], initialBoard: initial.board };
          authoritative = { ...(body.type === 'leave' ? leaveStage(state, Date.now()) : resumeStage(state, Date.now())), version: authoritative.version + 1, serverNow: Date.now() };
        }
        return { ok: true, json: async () => ({ run: authoritative, ...(body.type === 'start' ? { token: 'token' } : {}) }) };
      };
      let root = createRoot(document.getElementById('root'));
      const reload = async () => {
        await act(() => root.unmount());
        root = createRoot(document.getElementById('root'));
        await act(() => root.render(createElement(Home)));
      };
      const click = async element => act(() => element.click());
      const button = text => [...document.querySelectorAll('button')].find(e => e.textContent.replace('▶', '').trim() === text);
      const bottles = () => [...document.querySelectorAll('[data-bottle-index]')];
      const animation = () => document.querySelector('[data-testid="pour-animation"]');
      const begin = async () => { await click(bottles()[0]); await click(bottles()[2]); };
      const confirm = async (run, ok = true, index = 0) => { authoritative = run; await act(async () => requests[index].resolve({ ok, json: async () => ({ run, error: ok ? undefined : 'conflict' }) })); };
      const moved = () => ({ ...initial, ...advance({ ...initial, history: [] }, { type: 'pour', from: 0, to: 2 }, Date.now()), version: 2, serverNow: Date.now() });
      try {
        await act(() => root.render(createElement(Home)));
        await click(button('새로 시작'));
        await check({ win, initial, requests, commands, inspections, workers, workerResult, click, button, bottles, animation, begin, confirm, moved, reload });
      } finally { await act(() => root.unmount()); assert.ok(workers.every(w => w.terminated)); globalThis.Worker = savedWorker; dom.window.close(); }
    }

    await t.test('click starts animation immediately, holds the final preview during latency, and submits once', () => harness(async h => {
      await h.begin();
      assert.equal(h.requests.length, 1);
      assert.ok(h.animation(), 'animation must exist while the fetch promise is still unresolved');
      assert.equal(document.querySelector('[data-testid="score"]').textContent, '0');
      await h.click(h.bottles()[2]); assert.equal(h.requests.length, 1);
      // Resize settles an animation even when the request takes longer than playback.
      globalThis.innerWidth = 1000;
      await act(() => h.win.dispatchEvent(new h.win.Event('resize')));
      assert.equal(h.animation(), null);
      assert.match(h.bottles()[2].getAttribute('aria-label'), /파란색/);
      assert.ok(h.bottles().every(b => !b.disabled), 'inputs stay available for selection and reservation');
      assert.equal(h.bottles()[0].dataset.pouring, 'true');
      await h.confirm({ ...h.moved(), availableAt: 0 });
      assert.match(h.bottles()[2].getAttribute('aria-label'), /파란색/);
      assert.equal(h.animation(), null, 'confirmation must not replay the animation');
      assert.ok(h.bottles().every(b => !b.disabled));
    }));
    await t.test('touch drag uses the same immediate path and ignores the synthetic click', () => harness(async h => {
      const source = h.bottles()[0];
      Object.assign(source, { setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} });
      document.elementFromPoint = () => h.bottles()[2];
      for (const [type, x] of [['pointerdown', 125], ['pointermove', 325], ['pointerup', 325]]) {
        const event = new h.win.Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 250, pointerType: 'touch' });
        await act(() => source.dispatchEvent(event));
      }
      assert.equal(h.requests.length, 1); assert.ok(h.animation());
      await act(() => source.dispatchEvent(new h.win.MouseEvent('click', { bubbles: true, detail: 1 })));
      assert.equal(h.requests.length, 1);
      await h.confirm(h.moved());
      assert.ok(h.animation(), 'fast confirmation must not interrupt playback');
    }));
    await t.test('independent clicks animate together on one canvas while HTTP requests remain ordered', () => harness(async h => {
      await h.begin();
      await h.click(h.bottles()[1]); await h.click(h.bottles()[3]);
      assert.equal(h.animation().dataset.count, '2');
      assert.equal(document.querySelectorAll('.pour-overlay').length, 1);
      assert.equal(h.requests.length, 1, 'second visual move must not race the first server version');
      const first = h.moved();
      await h.confirm(first);
      assert.equal(h.requests.length, 2);
      assert.equal(h.requests[1].body.version, first.version);
      const second = { ...first, ...advance({ ...first, history: [] }, { type: 'pour', from: 1, to: 3 }, Date.now()), version: 3, serverNow: Date.now() };
      assert.equal(second.moves, 2);
      await h.confirm(second, true, 1);
      assert.equal(h.animation().dataset.count, '2');
      assert.match(h.bottles()[3].getAttribute('aria-label'), /산호색/);
    }));
    await t.test('busy-bottle touch drop reserves once, shows its markers, and Escape cancels', () => harness(async h => {
      await h.begin();
      const source = h.bottles()[2];
      Object.assign(source, { setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} });
      document.elementFromPoint = () => h.bottles()[3];
      for (const [type, x] of [['pointerdown', 325], ['pointermove', 425], ['pointerup', 425]]) {
        const event = new h.win.Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 250, pointerType: 'touch' });
        await act(() => source.dispatchEvent(event));
      }
      assert.equal(h.requests.length, 1);
      assert.equal(document.querySelectorAll('[data-queued]').length, 2);
      assert.match(h.bottles()[2].getAttribute('aria-label'), /예약/);
      await act(() => h.win.dispatchEvent(new h.win.KeyboardEvent('keydown', { key: 'Escape' })));
      assert.equal(document.querySelectorAll('[data-queued]').length, 0);
      assert.equal(h.requests.length, 1);
    }));
    await t.test('five UI reservations use future contents, expose their order, and need no erase button', () => harness(async h => {
      await h.begin();
      for (const [from, to] of [[2, 3], [3, 2], [2, 3], [3, 2], [2, 3]]) {
        await h.click(h.bottles()[from]); await h.click(h.bottles()[to]);
      }
      assert.equal(document.querySelector('.queue-count').textContent, '예약 5/5');
      assert.equal(document.querySelector('.queue-count button'), null);
      assert.equal(h.bottles()[3].querySelector('.queue-label').textContent, '1·2·3·4·5');
      assert.match(h.bottles()[3].getAttribute('aria-label'), /예약 순서 1, 2, 3, 4, 5/);
      assert.equal(h.requests.length, 1);
      await h.click(h.bottles()[3]); await h.click(h.bottles()[2]);
      assert.equal(document.querySelector('.queue-count').textContent, '예약 5/5');
      assert.match(document.querySelector('.board-notice').textContent, /최대 5개/);
      await h.click(h.bottles()[2]); await h.click(h.bottles()[3]);
      assert.equal(document.querySelector('.queue-count').textContent, '예약 4/5');
      await act(() => h.win.dispatchEvent(new h.win.KeyboardEvent('keydown', { key: 'Escape' })));
      assert.equal(document.querySelector('.queue-count'), null);
    }));
    await t.test('a color-matched completion seal and burst wait for confirmation and settled animation', () => harness(async h => {
      await h.click(h.bottles()[1]); await h.click(h.bottles()[0]);
      assert.equal(document.querySelector('.completion-seal'), null);
      assert.doesNotMatch(h.bottles()[0].getAttribute('aria-label'), /완성/);
      const advanced = advance({ ...h.initial, history: [] }, { type: 'pour', from: 1, to: 0 }, Date.now());
      await h.confirm({ ...h.initial, ...advanced, version: 2, serverNow: Date.now(), availableAt: 0, bottleAvailableAt: [0, 0, 0, 0, 0] });
      assert.equal(document.querySelector('.completion-seal'), null, 'confirmation alone cannot celebrate an unfinished visual');
      globalThis.innerWidth = 1000;
      await act(() => h.win.dispatchEvent(new h.win.Event('resize')));
      assert.equal(h.bottles()[0].querySelector('.completion-seal').textContent, '완성');
      assert.ok(h.bottles()[0].querySelector('.completion-burst'));
      assert.equal(h.bottles()[0].querySelector('.bottle-completion').style.getPropertyValue('--liquid-color'), '#eb4d68');
      assert.match(h.bottles()[0].getAttribute('aria-label'), /완성/);
    }, false, { board: [[0, 0, 0], [0], [1, 2], [], []], bottleAvailableAt: [0, 0, 0, 0, 0] }));
    await t.test('server conflict cancels the preview and restores authoritative liquid and score', () => harness(async h => {
      await h.begin();
      await h.confirm({ ...h.initial, version: 2 }, false);
      assert.equal(h.animation(), null); assert.match(h.bottles()[2].getAttribute('aria-label'), /비어 있음/);
      assert.equal(document.querySelector('[data-testid="score"]').textContent, '0');
      assert.ok(h.bottles().every(b => b.disabled));
      await h.click(h.button('다시 시도'));
      assert.ok(h.bottles().every(b => !b.disabled));
    }));
    await t.test('network failure rolls back and blocks more moves until sync', () => harness(async h => {
      await h.begin(); await act(async () => h.requests[0].reject(new Error('offline')));
      assert.equal(h.animation(), null); assert.match(h.bottles()[2].getAttribute('aria-label'), /비어 있음/);
      assert.ok(h.bottles().every(b => b.disabled));
    }));
    await t.test('server timeout cannot turn a preview into points or a completed stage', () => harness(async h => {
      await h.begin(); await h.confirm({ ...h.initial, status: 'ended', version: 2 });
      assert.equal(h.animation(), null); assert.match(h.bottles()[2].getAttribute('aria-label'), /비어 있음/);
      assert.equal(document.querySelector('[data-testid="score"]').textContent, '0');
      assert.ok(document.querySelector('.result-dialog[open]'));
    }));
    await t.test('an unresolved inspection never blocks another pour; authoritative dead end clears previews and reservations', () => harness(async h => {
      await h.begin(); const first = h.moved(); await h.confirm(first);
      assert.equal(h.inspections.length, 0);
      await h.workerResult('blocked');
      assert.equal(h.inspections.length, 1);
      assert.ok(h.bottles().every(b => !b.disabled));
      await h.click(h.bottles()[1]); await h.click(h.bottles()[3]);
      assert.equal(h.requests.length, 2, 'the next pour must submit before the inspection response');
      await h.click(h.bottles()[2]); await h.click(h.bottles()[1]);
      const ended = { ...first, status: 'ended', endReason: 'blocked', endedAt: Date.now(), version: first.version + 1 };
      await act(() => h.inspections[0].resolve({ ok: true, json: async () => ({ run: ended }) }));
      assert.equal(h.animation(), null); assert.equal(document.querySelector('.queue-count'), null);
      assert.ok(h.bottles().every(b => b.disabled));
      assert.match(document.querySelector('.result-dialog').textContent, /GAME OVER/);
      assert.match(document.querySelector('.blocked-explanation').textContent, /모을 수 없어/);
      assert.doesNotMatch(document.querySelector('.result-dialog').textContent, /TIME OVER/);
      assert.equal(h.button('랭킹 등록').disabled, false);
      assert.notEqual(document.querySelector('[role="timer"]').getAttribute('aria-label'), '0초');
    }));
    await t.test('a stale inspection cannot replace a newer accepted board', () => harness(async h => {
      await h.begin(); const first = h.moved(); await h.confirm(first);
      await h.workerResult('blocked');
      const stale = h.inspections[0];
      await h.click(h.bottles()[1]); await h.click(h.bottles()[3]);
      const second = { ...first, ...advance({ ...first, history: [] }, { type: 'pour', from: 1, to: 3 }, Date.now()), version: first.version + 1, serverNow: Date.now() };
      await h.confirm(second, true, 1);
      assert.equal(stale.signal.aborted, true);
      await act(() => stale.resolve({ ok: true, json: async () => ({ run: { ...first, status: 'ended', endReason: 'blocked', version: first.version + 1 } }) }));
      assert.equal(document.querySelector('.result-dialog'), null);
      assert.match(h.bottles()[3].getAttribute('aria-label'), /산호색/);
    }));
    await t.test('worker search does not hold pours and playable or inconclusive results send no inspection requests', () => harness(async h => {
      await h.begin(); const first = h.moved(); await h.confirm(first);
      assert.equal(h.workers.length, 1);
      assert.deepEqual(h.workers[0].jobs[0].board, first.board);
      await h.click(h.bottles()[1]); await h.click(h.bottles()[3]);
      assert.equal(h.requests.length, 2, 'second pour starts while the worker has not replied');
      await h.workerResult('solvable'); await h.workerResult('unknown');
      assert.equal(h.inspections.length, 0);
      assert.equal(document.querySelector('.result-dialog'), null);
    }));
    await t.test('old worker results are ignored and duplicate blocked results need only one server confirmation', () => harness(async h => {
      await h.begin(); const first = h.moved(); await h.confirm(first);
      const oldJob = h.workers[0].jobs[0];
      await h.click(h.bottles()[1]); await h.click(h.bottles()[3]);
      const second = { ...first, ...advance({ ...first, history: [] }, { type: 'pour', from: 1, to: 3 }, Date.now()), version: first.version + 1, serverNow: Date.now() };
      await h.confirm(second, true, 1);
      await h.workerResult('blocked', oldJob);
      assert.equal(h.inspections.length, 0);
      await h.workerResult('blocked'); await h.workerResult('blocked');
      assert.equal(h.inspections.length, 1);
      assert.equal(document.querySelector('.result-dialog'), null, 'local results cannot authorize game over');
      assert.equal(h.workers.length, 1, 'reuse the warmed worker across moves');
    }));
    await t.test('a worker error falls back to the server without locking gameplay', () => harness(async h => {
      await h.begin(); await h.confirm(h.moved());
      await act(() => h.workers[0].onerror());
      assert.equal(h.workers[0].terminated, true);
      assert.equal(h.inspections.length, 1);
      await h.click(h.bottles()[1]); await h.click(h.bottles()[3]);
      assert.equal(h.requests.length, 2);
      assert.equal(document.querySelector('.result-dialog'), null);
    }));
    await t.test('Home discards late responses and Continue resets the stage board and timer together', () => harness(async h => {
      await h.begin();
      await h.click(document.querySelector('.hud-home')); await h.click(h.button('나가기'));
      await h.confirm(h.moved());
      assert.ok(document.querySelector('.start-screen')); assert.equal(h.animation(), null);
      await h.click(h.button('이어하기'));
      assert.match(h.bottles()[2].getAttribute('aria-label'), /비어 있음/);
      assert.equal(h.commands.at(-1).type, 'resume');
      assert.ok(h.commands.some(c => c.type === 'leave'));
      assert.equal(document.querySelector('[role="timer"]').getAttribute('aria-label'), '60초');
    }));
    await t.test('reload saves the interruption before Continue resets layout and time', () => harness(async h => {
      await h.begin();
      await h.confirm({ ...h.moved(), availableAt: 0, deadline: Date.now() + 20000 });
      await h.reload();
      assert.ok(document.querySelector('.start-screen'));
      assert.deepEqual(h.commands.slice(-2).map(c => c.type), ['sync', 'leave']);
      assert.equal(h.button('이어하기').disabled, false);
      await h.click(h.button('이어하기'));
      assert.match(h.bottles()[2].getAttribute('aria-label'), /비어 있음/);
      assert.equal(document.querySelector('[role="timer"]').getAttribute('aria-label'), '60초');
    }));
    await t.test('reduced motion previews immediately without an overlay and still awaits validation', () => harness(async h => {
      await h.begin(); assert.equal(h.animation(), null);
      assert.match(h.bottles()[2].getAttribute('aria-label'), /파란색/);
      assert.ok(h.bottles().every(b => !b.disabled));
      await h.click(h.bottles()[2]); await h.click(h.bottles()[3]);
      assert.equal(document.querySelectorAll('[data-queued]').length, 2);
      assert.equal(h.requests.length, 1);
      await h.confirm(h.moved());
      assert.equal(document.querySelector('[data-testid="score"]').textContent, '0');
    }, true));
    await t.test('a visually completed puzzle earns nothing until the server confirms the clear', () => harness(async h => {
      await h.click(h.bottles()[1]); await h.click(h.bottles()[0]);
      assert.equal(document.querySelector('[data-testid="score"]').textContent, '0');
      assert.equal(document.querySelector('.clear-burst'), null);
      const confirmed = { ...h.initial, ...advance({ ...h.initial, history: [] }, { type: 'pour', from: 1, to: 0 }, Date.now()), version: 2, serverNow: Date.now() };
      assert.equal(confirmed.status, 'cleared');
      await h.confirm(confirmed);
      assert.equal(document.querySelector('[data-testid="score"]').textContent, confirmed.score.toLocaleString());
      assert.equal(document.querySelector('.clear-burst'), null, 'clear feedback waits for the pour to finish');
    }, true, { board: [[0, 0, 0], [0], [], []] }));
  } finally { await vite.close(); }
});
