import { WATER_COLORS } from './glass-renderer.ts';
import type { Point } from './pour-motion.ts';

const TAU = Math.PI * 2;
/** Flow feedback shares the pour canvas and its clock, with no emitters or extra RAF. */
export function drawPourMagic(ctx: CanvasRenderingContext2D, end: Point, surface: Point, color: number, time: number, flow: number, tubeWidth: number) {
  const ink = WATER_COLORS[color], scale = Math.min(1.2, tubeWidth / 52);
  const pulse = Math.min(1, flow * 12, (1 - flow) * 12);
  ctx.save(); ctx.lineCap = 'round';
  const radius = 32 * scale;
  const glow = ctx.createRadialGradient(surface.x, surface.y, 0, surface.x, surface.y, radius);
  glow.addColorStop(0, '#ffffffaa'); glow.addColorStop(.25, ink + '99'); glow.addColorStop(1, ink + '00');
  ctx.globalAlpha = pulse * .75; ctx.fillStyle = glow;
  ctx.fillRect(surface.x - radius, surface.y - radius, radius * 2, radius * 2);
  // A luminous double helix winds around, rather than replacing, the liquid stream.
  for (let strand = 0; strand < 2; strand++) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const p = i / 24, x = end.x + Math.sin(p * TAU * 2 - time * .012 + strand * Math.PI) * 6 * scale;
      const y = end.y + (surface.y - end.y) * p;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = pulse * .6; ctx.strokeStyle = strand ? '#fff0a3' : ink; ctx.lineWidth = 2 * scale; ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const p = ((time * .0017 + i / 12) % 1), angle = i * 2.39996 + time * .003;
    const spread = (9 + p * 23) * scale;
    const x = surface.x + Math.cos(angle) * spread, y = surface.y - Math.sin(p * Math.PI) * (18 + i % 3 * 8) * scale;
    const size = (1 - p) * 3 * scale;
    ctx.globalAlpha = pulse * Math.sin(p * Math.PI); ctx.fillStyle = i % 3 ? '#ffffff' : ink;
    ctx.beginPath(); ctx.moveTo(x - size * 2, y); ctx.lineTo(x, y - size * 2); ctx.lineTo(x + size * 2, y); ctx.lineTo(x, y + size * 2); ctx.closePath(); ctx.fill();
  }
  for (let i = 0; i < 2; i++) {
    const p = (time * .002 + i / 2) % 1;
    ctx.globalAlpha = (1 - p) * pulse * .65; ctx.strokeStyle = i ? '#ffffff' : ink; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(surface.x, surface.y, (8 + p * 22) * scale, (2 + p * 6) * scale, 0, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
