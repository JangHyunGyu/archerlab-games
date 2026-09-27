import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { useBottleDrag } from '../app/useBottleDrag.ts';

test('pointer gestures preserve taps and keyboard clicks, and commit mouse/touch drops once', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const win = dom.window;
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  const captured = new Map<Element, number>();
  const copiedCanvases: Element[] = [];
  Object.defineProperty(win.HTMLCanvasElement.prototype, 'getContext', { value() { return { drawImage: (source: Element) => copiedCanvases.push(source) }; } });
  Object.assign(win.HTMLButtonElement.prototype, {
    setPointerCapture(this: Element, id: number) { captured.set(this, id); },
    hasPointerCapture(this: Element, id: number) { return captured.get(this) === id; },
    releasePointerCapture(this: Element) { captured.delete(this); },
  });
  const drops: number[][] = [], clicks: number[] = [];
  let disabled = false;
  function Harness() {
    const drag = useBottleDrag({ disabled, canStart: i => i === 0, canPour: (_from, to) => to === 1, onDrop: (from, to) => drops.push([from, to]) });
    return createElement('div', { className: 'board' }, [0, 1, 2].map(i => createElement('button', {
      key: i, 'data-bottle-index': i,
      onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => drag.onPointerDown(e, i), onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp, onPointerCancel: drag.onPointerCancel, onLostPointerCapture: drag.onLostPointerCapture,
      onClick: e => { if (drag.allowClick(e.detail)) clicks.push(i); },
    }, createElement('canvas'), `Bottle ${i}`)));
  }
  const root = createRoot(document.getElementById('root')!);
  await act(() => root.render(createElement(Harness)));
  const buttons = [...document.querySelectorAll('button')];
  document.elementFromPoint = (x: number) => x < 0 ? null : buttons[Math.floor(x / 100)] ?? null;
  async function pointer(type: string, x: number, extra: Record<string, unknown> = {}) {
    const event = new win.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 50, pointerType: 'mouse', ...extra });
    await act(() => buttons[0].dispatchEvent(event));
  }
  async function click(detail: number) { await act(() => buttons[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true, detail }))); }
  try {
    await pointer('pointerdown', 50); await pointer('pointermove', 54); await pointer('pointerup', 54); await click(1);
    assert.deepEqual(clicks, [0]); assert.equal(drops.length, 0);
    for (const pointerType of ['mouse', 'touch']) {
      await pointer('pointerdown', 50, { pointerType }); await pointer('pointermove', 150, { pointerType });
      assert.ok(document.querySelector('.drag-preview')); assert.ok(buttons[1].classList.contains('drop-valid'));
      assert.equal(copiedCanvases.at(-1), buttons[0].querySelector('canvas')); // cloneNode alone would make the dragged glass invisible.
      await pointer('pointerup', 150, { pointerType }); await click(1);
      assert.equal(document.querySelector('.drag-preview'), null);
      assert.equal(buttons[1].classList.contains('drop-valid'), false);
    }
    assert.deepEqual(drops, [[0, 1], [0, 1]]); assert.deepEqual(clicks, [0]);
    await click(0); assert.deepEqual(clicks, [0, 0]); // Keyboard click remains available after a drag.
    await pointer('pointerdown', 50); await pointer('pointermove', 250);
    assert.ok(buttons[2].classList.contains('drop-invalid'));
    await pointer('pointercancel', 250); await pointer('pointerup', 150); await click(1);
    assert.equal(drops.length, 2); assert.equal(document.querySelector('.drag-preview'), null);
    await pointer('pointerdown', 50); await pointer('pointermove', -50); await pointer('pointerup', -50);
    assert.equal(drops.length, 2);
    await pointer('pointerdown', 50); await pointer('pointermove', 150);
    disabled = true; await act(() => root.render(createElement(Harness))); await pointer('pointerup', 150);
    assert.equal(drops.length, 2); assert.equal(document.querySelector('.drag-preview'), null); assert.equal(captured.size, 0);
    disabled = false; await act(() => root.render(createElement(Harness)));
    await pointer('pointerdown', 50, { isPrimary: false }); await pointer('pointermove', 150); await pointer('pointerup', 150);
    assert.equal(drops.length, 2);
    await pointer('pointerdown', 50); await pointer('pointermove', 150);
    await act(() => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' })));
    await pointer('pointerup', 150); assert.equal(drops.length, 2); assert.equal(document.querySelector('.drag-preview'), null);
    await pointer('pointerdown', 50); await pointer('pointermove', 150);
    await act(() => win.dispatchEvent(new win.Event('resize')));
    await pointer('pointerup', 150); assert.equal(drops.length, 2); assert.equal(captured.size, 0);
    await pointer('pointerdown', 50); await pointer('pointermove', 150);
    await act(() => root.unmount()); assert.equal(document.querySelector('.drag-preview'), null); assert.equal(captured.size, 0);
  } finally { dom.window.close(); }
});
