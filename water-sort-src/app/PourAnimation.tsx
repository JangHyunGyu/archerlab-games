'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { boundsOf, chooseDirection, hoverLift, mix, phases, placeVessel, roundBottom, spillAngle, vesselOutline, type Box, type Rect } from '../lib/pour-motion';
import { drawVessel, drawStream, glassInterior, liquidLayers, liquidVolume, liquidSurface } from '../lib/glass-renderer';
import type { Board } from '../lib/game';


export type PourMotion = {
  id: number; from: number; to: number; before: Board; amount: number; started: number;
  duration: number; // pourDuration(amount, run.pace), the same span the server locks both bottles for.
  source: Rect; destination: Rect; sourceWater: Rect; targetWater: Rect; sourceLift: number;
  others?: Rect[]; // Resting bottles the lifted bottle should pass above when there is room.
};
const rect = (r: DOMRect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });
export function measurePour(source: HTMLElement, destination: HTMLElement, others: HTMLElement[] = []) {
  const a = source.getBoundingClientRect(), b = destination.getBoundingClientRect();
  const inner = glassInterior(a.width, a.height), target = glassInterior(b.width, b.height);
  const parent = source.offsetParent!.getBoundingClientRect();
  const restingY = parent.y + source.offsetTop;
  return {
    source: { x: parent.x + source.offsetLeft, y: restingY, width: a.width, height: a.height },
    destination: rect(b), sourceWater: inner, sourceLift: a.y - restingY,
    targetWater: { ...target, x: b.x + target.x, y: b.y + target.y },
    others: others.map(node => rect(node.getBoundingClientRect())),
  };
}

// Highest the lifted bottle may go, so its rim is never cut off at the top of the screen.
const TOP_MARGIN = 6;
const lifts = new WeakMap<PourMotion, number>();
type ProbeFrame = { id: number; from: number; to: number; t: number; phase: string; outline: { x: number; y: number }[]; vessel: Box; stream: Box | null; ghost: Box; lift: number; viewport: { width: number; height: number } };
// Tests read real frame geometry by setting window.__pourProbe = []. Nothing is recorded otherwise.
const probe = () => (window as unknown as { __pourProbe?: ProbeFrame[] }).__pourProbe;

function paintMotion(ctx: CanvasRenderingContext2D, motion: PourMotion, time: number, width: number) {
  const { source, destination, sourceWater: water, targetWater: target, amount, before, from, to } = motion;
  const tube = before[from], receiving = before[to], color = tube.at(-1)!;
  const direction = chooseDirection(source, destination, width);
  const pivot = { x: direction > 0 ? water.x + water.width : water.x, y: water.y };
  const polygon = roundBottom(water, water.width * .48);
  const volume = (units: number) => liquidVolume(water, units);
  const initialAngle = spillAngle(polygon, pivot, volume(tube.length), direction);
  const start = { x: source.x + pivot.x, y: source.y + pivot.y + motion.sourceLift };
  const finalAngle = spillAngle(polygon, pivot, volume(tube.length - amount), direction);
  const outline = vesselOutline(source.width, source.height);
  // The faded ghost stays in the source slot; the lifted bottle pours from above it.
  const ghost: Box = { x0: source.x - 4, y0: source.y - 6, x1: source.x + source.width + 4, y1: source.y + source.height + 10 };
  const base = { x: destination.x + destination.width / 2, y: destination.y - 15 };
  let lift = lifts.get(motion);
  if (lift === undefined) {
    const angles = Array.from({ length: 17 }, (_, i) => mix(initialAngle, finalAngle, i / 16));
    const others = (motion.others ?? []).map(r => ({ x0: r.x - 2, y0: r.y - 4, x1: r.x + r.width + 2, y1: r.y + r.height + 6 }));
    lift = hoverLift(outline, pivot, base, angles, ghost, TOP_MARGIN, others);
    lifts.set(motion, lift);
  }
  const end = { x: base.x, y: base.y - lift };
  const rest = { x: source.x + pivot.x, y: source.y + pivot.y };
  const t = Math.max(0, Math.min(1, (time - motion.started) / motion.duration));
  const { approach, flow, retreat } = phases(t);
  let angle = t < .27 ? initialAngle * approach : spillAngle(polygon, pivot, volume(tube.length - amount * flow), direction);
  angle *= 1 - retreat;
  let position = { x: mix(start.x, end.x, approach), y: mix(start.y, end.y, approach) - Math.sin(approach * Math.PI) * 18 };
  if (retreat) position = { x: mix(end.x, rest.x, retreat), y: mix(end.y, rest.y, retreat) - Math.sin(retreat * Math.PI) * 12 };
  const pouring = t >= .27 && t < .73;
  const targetLayers = liquidLayers([...receiving, ...Array(amount).fill(color)], receiving.length + amount * flow);
  drawVessel(ctx, { ...destination }, targetLayers, { time, incoming: pouring, agitation: pouring ? 1 : Math.exp(-Math.max(0, t - .73) * 24) * .7 });
  if (pouring) {
    const surfaceY = liquidSurface(target, receiving.length + amount * flow);
    drawStream(ctx, end, { x: end.x, y: surfaceY + 1 }, color, Math.min(5, target.width * .13), time, flow);
  }
  drawVessel(ctx, { x: position.x, y: position.y, width: source.width, height: source.height, pivot, angle }, liquidLayers(tube, tube.length - amount * flow), { time, shadow: false, agitation: pouring ? .22 : Math.sin((approach + retreat) * Math.PI) * .8 });
  const frames = probe();
  if (frames) {
    const surfaceY = liquidSurface(target, receiving.length + amount * flow), half = Math.min(5, target.width * .13) / 2 + 1;
    const lifted = placeVessel(outline, angle, pivot, position);
    frames.push({ id: motion.id, from, to, t, phase: pouring ? 'pour' : t < .27 ? 'lift' : 'return', outline: lifted, vessel: boundsOf(lifted), stream: pouring ? { x0: end.x - half, y0: end.y, x1: end.x + half, y1: surfaceY + 4 } : null, ghost, lift, viewport: { width, height: window.innerHeight } });
  }
  return t;
}

// One canvas and one RAF for every active pair, instead of one full-screen canvas per pour.
export function PourAnimation({ motions, onFinish }: { motions: PourMotion[]; onFinish: (id: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const finishRef = useRef(onFinish);
  const motionsRef = useRef(motions);
  motionsRef.current = motions;
  finishRef.current = onFinish;
  useEffect(() => {
    const completed = new Set<number>();
    const finish = (id: number) => { if (!completed.has(id)) { completed.add(id); finishRef.current(id); } };
    const finishAll = () => { for (const motion of motionsRef.current) finish(motion.id); };
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { finishAll(); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) { finishAll(); return; }
    const width = document.documentElement.clientWidth, height = window.innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.scale(ratio, ratio);
    let frame = 0, finished = false;
    function draw(time: number) {
      if (!ctx || !canvas || finished) return;
      ctx.clearRect(0, 0, width, height);
      for (const motion of motionsRef.current) {
        if (completed.has(motion.id)) continue;
        const t = paintMotion(ctx, motion, time, width);
        canvas.dataset.phase = t >= .27 && t < .73 ? 'pour' : t < .27 ? 'lift' : 'return';
        if (t >= 1) finish(motion.id);
      }
      frame = requestAnimationFrame(draw);
    }
    // Settle to the preview or confirmed board; the request still owns validation.
    const viewportKey = () => [innerWidth, innerHeight, scrollX, scrollY, visualViewport?.width, visualViewport?.height, visualViewport?.offsetLeft, visualViewport?.offsetTop].join(',');
    const initialViewport = viewportKey();
    const viewportChanged = () => { if (viewportKey() !== initialViewport) finishAll(); };
    const visibility = () => { if (document.hidden) finishAll(); };
    window.addEventListener('resize', viewportChanged); window.addEventListener('scroll', viewportChanged, { passive: true });
    window.visualViewport?.addEventListener('resize', viewportChanged); window.visualViewport?.addEventListener('scroll', viewportChanged);
    document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', finishAll);
    frame = requestAnimationFrame(draw);
    return () => {
      finished = true; cancelAnimationFrame(frame);
      window.removeEventListener('resize', viewportChanged); window.removeEventListener('scroll', viewportChanged);
      window.visualViewport?.removeEventListener('resize', viewportChanged); window.visualViewport?.removeEventListener('scroll', viewportChanged);
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', finishAll);
    };
  }, []);
  return createPortal(<canvas ref={ref} className="pour-overlay" data-testid="pour-animation" data-count={motions.length} aria-hidden="true"/>, document.body);
}
