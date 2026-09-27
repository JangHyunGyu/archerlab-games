'use client';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

type Options = { disabled: boolean; canStart: (from: number) => boolean; canPour: (from: number, to: number) => boolean; onDrop: (from: number, to: number) => void; onDragStart?: () => void };
type Gesture = { id: number; from: number; x: number; y: number; source: HTMLButtonElement; board: HTMLElement; active: boolean; layer: HTMLDivElement | null; ghost: HTMLDivElement | null; target: HTMLButtonElement | null };

// Pointer capture keeps touch, pen and mouse gestures on the same path, even off-board.
export function useBottleDrag(options: Options) {
  const latest = useRef(options); latest.current = options;
  const gesture = useRef<Gesture | null>(null), suppressClick = useRef(false);
  function clear() {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    current.layer?.remove();
    current.source.classList.remove('drag-source');
    current.target?.classList.remove('drop-valid', 'drop-invalid');
    if (current.source.hasPointerCapture(current.id)) current.source.releasePointerCapture(current.id);
  }
  function cancel() { if (gesture.current?.active) suppressClick.current = true; clear(); }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => { cancel(); window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => { if (options.disabled) cancel(); }, [options.disabled]);
  function hit(current: Gesture, x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLButtonElement>('[data-bottle-index]');
    return element && element !== current.source && current.board.contains(element) ? element : null;
  }
  return {
    onPointerDown(e: ReactPointerEvent<HTMLButtonElement>, from: number) {
      if (!e.isPrimary || e.button !== 0 || gesture.current) return;
      suppressClick.current = false;
      if (latest.current.disabled || !latest.current.canStart(from)) return;
      const source = e.currentTarget;
      gesture.current = { id: e.pointerId, from, x: e.clientX, y: e.clientY, source, board: source.parentElement!, active: false, layer: null, ghost: null, target: null };
      source.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
      const current = gesture.current;
      if (!current || current.id !== e.pointerId) return;
      if (latest.current.disabled) { cancel(); return; }
      const dx = e.clientX - current.x, dy = e.clientY - current.y;
      if (!current.active && Math.hypot(dx, dy) < 8) return;
      e.preventDefault();
      if (!current.active) {
        current.active = true;
        latest.current.onDragStart?.();
        const rect = current.source.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = current.board.className + ' drag-preview';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.inert = true;
        Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        const clone = current.source.cloneNode(true) as HTMLButtonElement;
        // Canvas pixels are not copied by cloneNode; preserve the shared glass render.
        const originals = current.source.querySelectorAll('canvas');
        clone.querySelectorAll('canvas').forEach((canvas, i) => {
          if (originals[i]) canvas.getContext('2d')?.drawImage(originals[i], 0, 0);
        });
        clone.removeAttribute('data-testid'); clone.removeAttribute('data-bottle-index');
        clone.classList.remove('selected'); clone.tabIndex = -1;
        const layer = document.createElement('div'); layer.className = 'drag-layer';
        ghost.appendChild(clone); layer.appendChild(ghost); document.body.appendChild(layer);
        current.layer = layer; current.ghost = ghost;
        current.source.classList.add('drag-source');
      }
      current.ghost!.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      current.target?.classList.remove('drop-valid', 'drop-invalid');
      current.target = hit(current, e.clientX, e.clientY);
      if (current.target) current.target.classList.add(latest.current.canPour(current.from, Number(current.target.dataset.bottleIndex)) ? 'drop-valid' : 'drop-invalid');
    },
    onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
      const current = gesture.current;
      if (!current || current.id !== e.pointerId) return;
      const target = hit(current, e.clientX, e.clientY);
      if (current.active) { e.preventDefault(); suppressClick.current = true; }
      clear();
      if (current.active && target && !latest.current.disabled) latest.current.onDrop(current.from, Number(target.dataset.bottleIndex));
    },
    onPointerCancel(e: ReactPointerEvent<HTMLButtonElement>) { if (gesture.current?.id === e.pointerId) cancel(); },
    onLostPointerCapture(e: ReactPointerEvent<HTMLButtonElement>) { if (gesture.current?.id === e.pointerId) cancel(); },
    allowClick(detail: number) { return detail === 0 || !suppressClick.current; },
  };
}
