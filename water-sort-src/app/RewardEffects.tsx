'use client';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { RewardChain, RewardPainter, type RewardBottle, type RewardPoint } from '../lib/reward-effects';
import type { PourImpactPhase } from '../lib/pour-motion';
import type { GameAudio } from '../lib/game-audio';
import type { GameHaptics } from '../lib/game-haptics';
import { WATER_COLORS } from '../lib/glass-renderer';

export type RewardHandle = {
  bottle: (node: HTMLElement, color: number, pourId?: number) => boolean;
  pour: (id: number, target: number, bottle: RewardBottle, point: RewardPoint, phase: PourImpactPhase, completes: boolean) => void;
  cancelPours: () => void;
  clear: (amount: number) => void;
};
type Props = { ref: Ref<RewardHandle>; audio: GameAudio; haptics: GameHaptics; active: boolean; scope: string };
const bottleGeometry = (node: HTMLElement, color: number): RewardBottle => {
  const rect = (node.querySelector('.tube') ?? node).getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y, width: rect.width, height: rect.height, color };
};

export function RewardEffects({ ref, audio, haptics, active, scope }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ audio, haptics, active, scope }); state.current = { audio, haptics, active, scope };
  useEffect(() => { haptics.setActive(active); return () => haptics.setActive(false); }, [haptics, active]);
  const api = useRef<RewardHandle>({ bottle: () => true, pour() {}, cancelPours() {}, clear() {} });
  useImperativeHandle(ref, () => ({ bottle: (node, color, pourId) => api.current.bottle(node, color, pourId), pour: (...args) => api.current.pour(...args), cancelPours: () => api.current.cancelPours(), clear: amount => api.current.clear(amount) }), []);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const painter = new RewardPainter(), chain = new RewardChain();
    const anticipated = new Set<string>();
    let anticipationScope = state.current.scope;
    const enterScope = () => {
      if (anticipationScope !== state.current.scope) { anticipated.clear(); anticipationScope = state.current.scope; }
      if (paintScope !== state.current.scope) { painter.finishStage(); paintScope = state.current.scope; }
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, width = 0, height = 0, disposed = false, paintScope = state.current.scope;
    const scoreNode = () => document.querySelector<HTMLElement>('.score-stat strong');
    const pulseTray = (color: string, finale = false) => {
      const tray = document.querySelector<HTMLElement>('.experiment-tray');
      if (!tray) return;
      tray.style.setProperty('--reaction-color', color);
      tray.classList.remove('reaction-impact', 'reaction-finale');
      void tray.offsetWidth;
      tray.classList.add(finale ? 'reaction-finale' : 'reaction-impact');
    };
    const hide = () => {
      cancelAnimationFrame(frame); frame = 0;
      ctx.clearRect(0, 0, width, height); canvas.dataset.active = 'false';
      document.querySelectorAll('.score-reward').forEach(node => node.classList.remove('score-reward'));
      document.querySelectorAll('.reaction-impact,.reaction-finale').forEach(node => node.classList.remove('reaction-impact', 'reaction-finale'));
    };
    const clear = () => { state.current.haptics.stop(); painter.reset(); hide(); };
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
      canvas.dataset.resonances = String(painter.connections);
      if (painter.active) frame = requestAnimationFrame(draw);
      else hide();
    };
    const wake = () => {
      canvas.dataset.active = 'true';
      if (!frame) frame = requestAnimationFrame(draw);
    };
    api.current = {
      bottle(node, color, pourId) {
        if (!state.current.active || document.hidden) return false;
        enterScope();
        const id = node.closest<HTMLElement>('[data-bottle-index]')?.dataset.bottleIndex;
        if (id === undefined) return false;
        if (pourId !== undefined) {
          canvas.dataset.pourId = String(pourId); canvas.dataset.pourPhase = 'filled';
          canvas.dataset.pourAt = String(performance.now());
        }
        const count = chain.bottle(state.current.scope, id, performance.now());
        if (!count) return false;
        const replay = anticipated.has(id);
        if (!replay) { state.current.audio.completion(count); state.current.haptics.play('complete', count); }
        if (reduced.matches) return !replay;
        painter.bottle(bottleGeometry(node, color), count, performance.now(), false, !replay);
        if (!replay) pulseTray(WATER_COLORS[color] ?? '#b485ef');
        canvas.dataset.chain = String(count); if (painter.active) wake();
        return !replay;
      },
      pour(id, target, bottle, point, phase, completes) {
        if (!state.current.active || document.hidden || reduced.matches) return;
        enterScope();
        state.current.haptics.play(phase === 'filled' ? completes ? 'complete' : 'arrival' : phase);
        if (phase === 'filled') {
          if (completes) { anticipated.add(String(target)); state.current.audio.completion(1); }
          else state.current.audio.play('target');
          pulseTray(WATER_COLORS[bottle.color]);
        }
        painter.pour(bottle, point, phase, performance.now(), completes);
        canvas.dataset.pourId = String(id); canvas.dataset.pourPhase = phase;
        canvas.dataset.pourAt = String(performance.now()); wake();
      },
      cancelPours() {
        state.current.haptics.stop();
        anticipated.clear(); painter.finishStage();
        if (painter.active) wake(); else hide();
      },
      clear(amount) {
        if (!state.current.active || document.hidden || !chain.clear(state.current.scope) || reduced.matches) return;
        const bottles = [...document.querySelectorAll<HTMLElement>('.bottle-button.complete')].map(node => bottleGeometry(node, Number(node.dataset.rewardColor ?? 0)));
        const score = scoreNode(), rect = score?.getBoundingClientRect();
        if (!rect || !bottles.length) return;
        state.current.haptics.play('clear');
        painter.clear(bottles, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, amount, performance.now());
        pulseTray('#b783e5', true);
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
      disposed = true; clear(); api.current = { bottle: () => true, pour() {}, cancelPours() {}, clear() {} };
      window.removeEventListener('resize', size); window.removeEventListener('scroll', clear);
      window.visualViewport?.removeEventListener('resize', size); window.visualViewport?.removeEventListener('scroll', clear);
      document.removeEventListener('visibilitychange', hidden); reduced.removeEventListener('change', clear);
    };
  }, []);
  return <canvas ref={canvasRef} className="reward-overlay" data-testid="reward-effects" aria-hidden="true"/>;
}
