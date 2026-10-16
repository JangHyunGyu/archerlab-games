'use client';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { RewardChain, RewardPainter, type RewardBottle } from '../lib/reward-effects';
import type { GameAudio } from '../lib/game-audio';

export type RewardHandle = {
  bottle: (node: HTMLElement, color: number) => void;
  clear: (amount: number) => void;
};
type Props = { ref: Ref<RewardHandle>; audio: GameAudio; active: boolean; scope: string };
const bottleGeometry = (node: HTMLElement, color: number): RewardBottle => {
  const rect = (node.querySelector('.tube') ?? node).getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y, width: rect.width, height: rect.height, color };
};

export function RewardEffects({ ref, audio, active, scope }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ audio, active, scope }); state.current = { audio, active, scope };
  const api = useRef<RewardHandle>({ bottle() {}, clear() {} });
  useImperativeHandle(ref, () => ({ bottle: (node, color) => api.current.bottle(node, color), clear: amount => api.current.clear(amount) }), []);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const painter = new RewardPainter(), chain = new RewardChain();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, width = 0, height = 0, disposed = false, paintScope = state.current.scope;
    const scoreNode = () => document.querySelector<HTMLElement>('.score-stat strong');
    const clear = () => {
      cancelAnimationFrame(frame); frame = 0; painter.reset();
      ctx.clearRect(0, 0, width, height); canvas.dataset.active = 'false';
      document.querySelectorAll('.score-reward').forEach(node => node.classList.remove('score-reward'));
    };
    const size = () => {
      clear(); width = document.documentElement.clientWidth; height = window.innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (now: number) => {
      frame = 0;
      if (disposed || !state.current.active || document.hidden || reduced.matches) { clear(); return; }
      if (paintScope !== state.current.scope) { painter.finishStage(); paintScope = state.current.scope; }
      painter.draw(ctx, now, width, height);
      canvas.dataset.particles = String(painter.particles);
      if (painter.active) frame = requestAnimationFrame(draw);
      else clear();
    };
    const wake = () => {
      canvas.dataset.active = 'true';
      if (!frame) frame = requestAnimationFrame(draw);
    };
    api.current = {
      bottle(node, color) {
        if (!state.current.active || document.hidden) return;
        const id = node.closest<HTMLElement>('[data-bottle-index]')?.dataset.bottleIndex;
        if (id === undefined) return;
        const count = chain.bottle(state.current.scope, id, performance.now());
        if (!count) return;
        state.current.audio.completion(count);
        if (reduced.matches) return;
        if (paintScope !== state.current.scope) { painter.finishStage(); paintScope = state.current.scope; }
        painter.bottle(bottleGeometry(node, color), count, performance.now());
        canvas.dataset.chain = String(count); wake();
      },
      clear(amount) {
        if (!state.current.active || document.hidden || !chain.clear(state.current.scope) || reduced.matches) return;
        const bottles = [...document.querySelectorAll<HTMLElement>('.bottle-button.complete')].map(node => bottleGeometry(node, Number(node.dataset.rewardColor ?? 0)));
        const score = scoreNode(), rect = score?.getBoundingClientRect();
        if (!rect || !bottles.length) return;
        painter.clear(bottles, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, amount, performance.now());
        score?.classList.remove('score-reward');
        // Restart only on a confirmed stage award, without changing the server-owned number.
        if (score) { void score.offsetWidth; score.classList.add('score-reward'); }
        canvas.dataset.finale = state.current.scope; wake();
      },
    };
    size();
    const hidden = () => { if (document.hidden) clear(); };
    window.addEventListener('resize', size); window.addEventListener('scroll', clear, { passive: true });
    window.visualViewport?.addEventListener('resize', size); window.visualViewport?.addEventListener('scroll', clear);
    document.addEventListener('visibilitychange', hidden); reduced.addEventListener('change', clear);
    return () => {
      disposed = true; clear(); api.current = { bottle() {}, clear() {} };
      window.removeEventListener('resize', size); window.removeEventListener('scroll', clear);
      window.visualViewport?.removeEventListener('resize', size); window.visualViewport?.removeEventListener('scroll', clear);
      document.removeEventListener('visibilitychange', hidden); reduced.removeEventListener('change', clear);
    };
  }, []);
  return <canvas ref={canvasRef} className="reward-overlay" data-testid="reward-effects" aria-hidden="true"/>;
}
