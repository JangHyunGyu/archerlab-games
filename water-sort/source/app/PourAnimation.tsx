'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { chooseDirection, mix, phases, roundBottom, spillAngle, type Rect } from '../lib/pour-motion';
import { drawVessel, drawStream, glassInterior, liquidLayers, liquidVolume, liquidSurface } from '../lib/glass-renderer';
import type { Board } from '../lib/game';
import { pourDuration } from '../lib/challenge-rules';


export type PourMotion = {
  id: number; from: number; to: number; before: Board; amount: number;
  source: Rect; destination: Rect; sourceWater: Rect; targetWater: Rect; sourceLift: number;
};
const rect = (r: DOMRect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });
export function measurePour(source: HTMLElement, destination: HTMLElement) {
  const a = source.getBoundingClientRect(), b = destination.getBoundingClientRect();
  const inner = glassInterior(a.width, a.height), target = glassInterior(b.width, b.height);
  const parent = source.offsetParent!.getBoundingClientRect();
  const restingY = parent.y + source.offsetTop;
  return {
    source: { x: parent.x + source.offsetLeft, y: restingY, width: a.width, height: a.height },
    destination: rect(b), sourceWater: inner, sourceLift: a.y - restingY,
    targetWater: { ...target, x: b.x + target.x, y: b.y + target.y },
  };
}

export function PourAnimation({ motion, onFinish }: { motion: PourMotion; onFinish: (id: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { finishRef.current(motion.id); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) { finishRef.current(motion.id); return; }
    const width = document.documentElement.clientWidth, height = window.innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.scale(ratio, ratio);
    const { source, destination, sourceWater: water, targetWater: target, amount, before, from, to } = motion;
    const tube = before[from], receiving = before[to], color = tube.at(-1)!;
    const direction = chooseDirection(source, destination, width);
    const pivot = { x: direction > 0 ? water.x + water.width : water.x, y: water.y };
    const polygon = roundBottom(water, water.width * .48);
    const volume = (units: number) => liquidVolume(water, units);
    const initialAngle = spillAngle(polygon, pivot, volume(tube.length), direction);
    const start = { x: source.x + pivot.x, y: source.y + pivot.y + motion.sourceLift };
    const end = { x: destination.x + destination.width / 2, y: destination.y - 15 };
    const rest = { x: source.x + pivot.x, y: source.y + pivot.y };
    const duration = pourDuration(amount);
    let frame = 0, finished = false;
    const started = performance.now();
    const finish = () => {
      if (finished) return;
      finished = true; cancelAnimationFrame(frame); finishRef.current(motion.id);
    };
    function draw(time: number) {
      if (!ctx || !canvas || finished) return;
      const t = Math.min(1, (time - started) / duration), { approach, flow, retreat } = phases(t);
      let angle = t < .27 ? initialAngle * approach : spillAngle(polygon, pivot, volume(tube.length - amount * flow), direction);
      angle *= 1 - retreat;
      let position = { x: mix(start.x, end.x, approach), y: mix(start.y, end.y, approach) - Math.sin(approach * Math.PI) * 18 };
      if (retreat) position = { x: mix(end.x, rest.x, retreat), y: mix(end.y, rest.y, retreat) - Math.sin(retreat * Math.PI) * 12 };
      ctx.clearRect(0, 0, width, height);
      const pouring = t >= .27 && t < .73;
      canvas.dataset.phase = pouring ? 'pour' : t < .27 ? 'lift' : 'return';
      canvas.dataset.flow = flow.toFixed(3);
      const targetLayers = liquidLayers([...receiving, ...Array(amount).fill(color)], receiving.length + amount * flow);
      drawVessel(ctx, { ...destination }, targetLayers, { time, incoming: pouring, agitation: pouring ? 1 : Math.exp(-Math.max(0, t - .73) * 24) * .7 });
      if (pouring) {
        const surfaceY = liquidSurface(target, receiving.length + amount * flow);
        drawStream(ctx, end, { x: end.x, y: surfaceY + 1 }, color, Math.min(5, target.width * .13), time, flow);
      }
      drawVessel(ctx, { x: position.x, y: position.y, width: source.width, height: source.height, pivot, angle }, liquidLayers(tube, tube.length - amount * flow), { time, shadow: false, agitation: pouring ? .22 : Math.sin((approach + retreat) * Math.PI) * .8 });
      if (t < 1) frame = requestAnimationFrame(draw); else finish();
    }
    // Settle to the preview or confirmed board; the request still owns validation.
    const viewportKey = () => [innerWidth, innerHeight, scrollX, scrollY, visualViewport?.width, visualViewport?.height, visualViewport?.offsetLeft, visualViewport?.offsetTop].join(',');
    const initialViewport = viewportKey();
    const viewportChanged = () => { if (viewportKey() !== initialViewport) finish(); };
    const visibility = () => { if (document.hidden) finish(); };
    window.addEventListener('resize', viewportChanged); window.addEventListener('scroll', viewportChanged, { passive: true });
    window.visualViewport?.addEventListener('resize', viewportChanged); window.visualViewport?.addEventListener('scroll', viewportChanged);
    document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', finish);
    frame = requestAnimationFrame(draw);
    return () => {
      finished = true; cancelAnimationFrame(frame);
      window.removeEventListener('resize', viewportChanged); window.removeEventListener('scroll', viewportChanged);
      window.visualViewport?.removeEventListener('resize', viewportChanged); window.visualViewport?.removeEventListener('scroll', viewportChanged);
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', finish);
    };
  }, [motion]);
  return createPortal(<canvas ref={ref} className="pour-overlay" data-testid="pour-animation" aria-hidden="true"/>, document.body);
}
