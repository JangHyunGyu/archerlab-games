'use client';
import { useEffect, useRef } from 'react';
import { drawVessel, liquidLayers } from '../lib/glass-renderer';

/** Idle bottles draw once; only selection/settling uses a short animation. */
export function BottleVisual({ colors, selected, ghost = false }: { colors: number[]; selected: boolean; ghost?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const first = useRef(true);
  const key = colors.join(',');
  useEffect(() => {
    const canvas = canvasRef.current, tube = canvas?.parentElement;
    if (!canvas || !tube) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const palette = key ? key.split(',').map(Number) : [];
    const layers = liquidLayers(palette), started = performance.now();
    const animate = !first.current && !reduced.matches; first.current = false;
    let frame = 0, width = 0, height = 0;
    const paint = (time: number, moving = false) => {
      ctx.clearRect(0, 0, width + 20, height + 24);
      const age = (time - started) / 1000;
      drawVessel(ctx, { x: 10, y: 10, width, height }, layers, { time, ghost, agitation: moving ? Math.exp(-age * 5) * (selected ? 1.8 : 1.2) : 0 });
    };
    const resize = () => {
      width = tube.clientWidth; height = tube.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.ceil((width + 20) * ratio); canvas.height = Math.ceil((height + 24) * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); paint(performance.now());
    };
    const tick = (time: number) => {
      const moving = time - started < 850 && !document.hidden && !reduced.matches;
      paint(time, moving); if (moving) frame = requestAnimationFrame(tick);
    };
    const settle = () => { cancelAnimationFrame(frame); paint(performance.now()); };
    const observer = new ResizeObserver(resize); observer.observe(tube); resize();
    if (animate && !document.hidden) frame = requestAnimationFrame(tick);
    reduced.addEventListener('change', settle); document.addEventListener('visibilitychange', settle);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); reduced.removeEventListener('change', settle); document.removeEventListener('visibilitychange', settle); };
  }, [key, selected, ghost]);
  return <canvas className="glass-canvas" ref={canvasRef} data-ghost={ghost || undefined} aria-hidden="true"/>;
}
