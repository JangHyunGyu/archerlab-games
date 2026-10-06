import { area, below, rotate, roundBottom, surface, type Point, type Rect } from './pour-motion.ts';

export const WATER_COLORS = ['#eb4d68', '#249fdf', '#efbd28', '#36b889', '#8d59d2', '#df67b5', '#20bec5', '#f18c39'];
export type LiquidLayer = { color: number; units: number; faded?: boolean };
export type VesselPose = { x: number; y: number; width: number; height: number; angle?: number; pivot?: Point };
type RenderOptions = { time?: number; agitation?: number; incoming?: boolean; shadow?: boolean; ghost?: boolean };
// A ghost (the projected bottle left in a lifted bottle's slot) draws its liquid see-through and a
// little muted, so it never reads as a real, filled bottle. The slot also fades the whole canvas;
// together the liquid shows at about half strength, easy to read but not solid.
export const GHOST_LIQUID_ALPHA = .66;
// The ghost slot's own fade (.bottle-ghost opacity in globals.css). Incoming layers in a resting
// bottle have no such wrapper, so they carry both: the same strength as the ghost's liquid.
export const GHOST_SLOT_OPACITY = .72;
export const INCOMING_ALPHA = GHOST_LIQUID_ALPHA * GHOST_SLOT_OPACITY;
const GHOST_DESATURATE = .22;
export function ghostColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const gray = r * .3 + g * .59 + b * .11;
  return '#' + [r, g, b].map(value => Math.round(value + (gray - value) * GHOST_DESATURATE).toString(16).padStart(2, '0')).join('');
}

export function glassInterior(width: number, height: number): Rect {
  const wall = width * .09;
  return { x: wall, y: 3, width: width - wall * 2, height: height - 3 - width * .16 };
}
// Units from `solid` up are drawn faded: liquid a queued pour will bring but hasn't yet.
export function liquidLayers(colors: number[], remaining = colors.length, solid = colors.length): LiquidLayer[] {
  const layers: LiquidLayer[] = [];
  colors.forEach((color, i) => {
    const units = Math.max(0, Math.min(1, remaining - i));
    if (!units) return;
    const faded = i >= solid, last = layers.at(-1);
    if (last && last.color === color && !!last.faded === faded) last.units += units;
    else layers.push(faded ? { color, units, faded } : { color, units });
  });
  return layers;
}
export function liquidVolume(inner: Rect, units: number) {
  const polygon = roundBottom(inner, inner.width * .48);
  const capacity = area(below(polygon, inner.y + inner.height * .08));
  return capacity * Math.max(0, Math.min(4, units)) / 4;
}
export function liquidSurface(inner: Rect, units: number) {
  return surface(roundBottom(inner, inner.width * .48), liquidVolume(inner, units));
}
function path(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
}
function body(ctx: CanvasRenderingContext2D, w: number, h: number, inset = 0) {
  const r = (w - inset * 2) * .47;
  ctx.beginPath(); ctx.moveTo(inset, 2); ctx.lineTo(inset, h - r);
  ctx.bezierCurveTo(inset, h - r * .36, inset + r * .38, h, w / 2, h);
  ctx.bezierCurveTo(w - inset - r * .38, h, w - inset, h - r * .36, w - inset, h - r);
  ctx.lineTo(w - inset, 2); ctx.closePath();
}
function gradient(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, stops: [number, string][]) {
  const result = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const [position, color] of stops) result.addColorStop(position, color);
  return result;
}
function tint(hex: string, factor: number, alpha = 1) {
  const components = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const rgb = components.map(value => Math.round(factor > 1 ? value + (255 - value) * (factor - 1) : value * factor));
  return `rgba(${rgb.join(',')},${alpha})`;
}
function sectionAt(points: Point[], y: number) {
  const xs: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if ((a.y <= y && b.y >= y || b.y <= y && a.y >= y) && Math.abs(a.y - b.y) > .00001) xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
  }
  return xs.length > 1 ? [Math.min(...xs), Math.max(...xs)] : null;
}
function transform(ctx: CanvasRenderingContext2D, pose: VesselPose) {
  ctx.translate(pose.x, pose.y); ctx.rotate(pose.angle ?? 0);
  ctx.translate(-(pose.pivot?.x ?? 0), -(pose.pivot?.y ?? 0));
}

/** The same optical layers draw resting, dragged and pouring vessels. */
export function drawVessel(ctx: CanvasRenderingContext2D, pose: VesselPose, layers: LiquidLayer[], options: RenderOptions = {}) {
  const { width: w, height: h } = pose, angle = pose.angle ?? 0;
  const inner = glassInterior(w, h), polygon = roundBottom(inner, inner.width * .48);
  const world = rotate(polygon, angle, pose.pivot).map(p => ({ x: p.x + pose.x, y: p.y + pose.y }));
  const minX = Math.min(...world.map(p => p.x)), maxX = Math.max(...world.map(p => p.x)), maxY = Math.max(...world.map(p => p.y));
  const time = options.time ?? 0, agitation = options.agitation ?? 0;

  ctx.save(); transform(ctx, pose);
  if (options.shadow !== false && Math.abs(angle) < .01) {
    const shadow = ctx.createRadialGradient(w / 2, h + 5, 1, w / 2, h + 5, w * .66);
    shadow.addColorStop(0, 'rgba(51,76,89,.2)'); shadow.addColorStop(1, 'rgba(77,105,120,0)');
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.ellipse(w / 2, h + 5, w * .66, w * .1, 0, 0, Math.PI * 2); ctx.fill();
  }
  // The back of the cylinder: cool edge refraction and an almost clear center.
  body(ctx, w, h);
  ctx.fillStyle = gradient(ctx, 0, 0, w, 0, [[0, '#7195a52b'], [.06, '#e8f8ffac'], [.17, '#c6e0e329'], [.46, '#ffffff07'], [.79, '#c1d5da16'], [.94, '#b2cbd675'], [1, '#647e9261']]);
  ctx.fill(); ctx.lineWidth = 1.15; ctx.strokeStyle = '#57788977'; ctx.stroke();
  ctx.restore();

  ctx.save(); path(ctx, world); ctx.clip();
  let lower = maxY + 1, total = 0;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i], muted = options.ghost || layer.faded;
    const liquidAlpha = options.ghost ? GHOST_LIQUID_ALPHA : layer.faded ? INCOMING_ALPHA : 1;
    const color = muted ? ghostColor(WATER_COLORS[layer.color]) : WATER_COLORS[layer.color]; total += layer.units;
    ctx.globalAlpha = liquidAlpha;
    const upper = surface(world, liquidVolume(inner, total));
    const section = sectionAt(world, upper), topmost = i === layers.length - 1;
    const amplitude = topmost ? agitation * Math.min(1, Math.max(0, lower - upper) / 8) : agitation * .12;
    const waveY = (x: number) => upper + amplitude * (Math.sin((x - minX) / Math.max(8, w * .22) + time * .018) * .62 + Math.sin(time * .023) * (x - (minX + maxX) / 2) / Math.max(w, maxX - minX));
    ctx.beginPath(); ctx.moveTo(minX - 1, lower + 1); ctx.lineTo(minX - 1, waveY(minX));
    for (let x = minX; x <= maxX + 2; x += 2) ctx.lineTo(x, waveY(x));
    ctx.lineTo(maxX + 2, lower + 1); ctx.closePath();
    ctx.fillStyle = gradient(ctx, minX, 0, maxX, 0, [[0, tint(color, .60, .96)], [.12, tint(color, .83, .95)], [.34, tint(color, 1.18, .92)], [.58, tint(color, 1.08, .93)], [.84, tint(color, .89, .96)], [1, tint(color, .54, .98)]]);
    ctx.fill();
    // Absorption through the liquid gives it depth instead of flat color blocks.
    ctx.save(); ctx.clip(); ctx.fillStyle = gradient(ctx, 0, upper, 0, lower, [[0, '#ffffff15'], [.25, '#ffffff00'], [1, '#122c421a']]); ctx.fillRect(minX, upper - 4, maxX - minX, lower - upper + 6); ctx.restore();
    if (section && section[1] - section[0] > 2) {
      const [left, right] = section, center = (left + right) / 2, ry = Math.min(w * .065, (lower - upper) * .2);
      ctx.save(); ctx.globalAlpha = liquidAlpha * (topmost ? .85 : .35);
      ctx.beginPath(); ctx.ellipse(center, upper + ry * .24, (right - left) / 2, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = gradient(ctx, 0, upper - ry, 0, upper + ry, [[0, tint(color, .72)], [.52, tint(color, 1.35)], [1, tint(color, 1.08)]]); ctx.fill();
      // Thin raised meniscus catches the light where the liquid meets the glass.
      ctx.beginPath();
      for (let x = left; x <= right; x += 1) {
        const edge = Math.pow(Math.abs((x - center) / ((right - left) / 2)), 6);
        const y = waveY(x) - edge * Math.min(1.5, w * .025);
        if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#ffffffa6'; ctx.lineWidth = topmost ? .85 : .45; ctx.stroke(); ctx.restore();
    }
    if (topmost && options.incoming && section) {
      const center = (section[0] + section[1]) / 2;
      for (let j = 0; j < 3; j++) {
        const phase = ((time * .0019 + j / 3) % 1), radius = (w * .08 + phase * w * .27);
        ctx.globalAlpha = liquidAlpha * (1 - phase) * .5;
        ctx.beginPath(); ctx.ellipse(center, upper + 1 + phase * 2, radius, radius * .2, 0, 0, Math.PI * 2); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = .8; ctx.stroke();
        const bx = center + Math.sin(j * 2.7 + time * .004) * w * .13, by = upper + 4 + (1 - phase) * Math.max(0, Math.min(16, lower - upper - 4));
        ctx.beginPath(); ctx.arc(bx, by, .6 + (1 - phase) * w * .018, 0, Math.PI * 2); ctx.strokeStyle = '#ffffffb3'; ctx.stroke();
      }
      ctx.globalAlpha = liquidAlpha;
    }
    lower = upper;
  }
  ctx.restore();

  ctx.save(); transform(ctx, pose); body(ctx, w, h); ctx.clip();
  // Front reflections stay attached to the glass as the liquid stays level.
  ctx.fillStyle = gradient(ctx, 0, 0, w, 0, [[0, '#2c576b30'], [.04, '#e7faffaa'], [.09, '#faffff0d'], [.18, '#ffffff08'], [.25, '#ffffff55'], [.32, '#ffffff20'], [.40, '#ffffff00'], [.72, '#ffffff00'], [.84, '#a6dbe829'], [.93, '#ffffffaa'], [.97, '#7194a747'], [1, '#ffffff7d']]);
  ctx.fillRect(0, 0, w, h);
  // Long softbox and narrow glints, not a painted outline.
  const shine = gradient(ctx, 0, 8, 0, h, [[0, '#ffffff00'], [.1, '#ffffffda'], [.6, '#ffffff9c'], [.88, '#ffffff26'], [1, '#ffffff00']]);
  ctx.fillStyle = shine; ctx.beginPath(); ctx.roundRect(w * .105, 9, Math.max(1.1, w * .044), h * .74, w * .025); ctx.fill();
  ctx.fillStyle = '#ffffff52'; ctx.beginPath(); ctx.roundRect(w * .80, h * .15, Math.max(.7, w * .016), h * .57, 1); ctx.fill();
  // Thick polished bottom, including its inner reflection and small caustic.
  ctx.strokeStyle = '#537f924d'; ctx.lineWidth = w * .058;
  ctx.beginPath(); ctx.ellipse(w / 2, h - w * .18, w * .445, w * .15, 0, .05, Math.PI - .05); ctx.stroke();
  ctx.strokeStyle = '#f2ffffe6'; ctx.lineWidth = Math.max(1, w * .028);
  ctx.beginPath(); ctx.ellipse(w / 2, h - w * .145, w * .385, w * .11, 0, .1, Math.PI - .1); ctx.stroke();
  const caustic = ctx.createRadialGradient(w * .35, h - 4, .1, w * .35, h - 4, w * .4);
  caustic.addColorStop(0, '#ffffff88'); caustic.addColorStop(1, '#ffffff00'); ctx.fillStyle = caustic; ctx.fillRect(0, h - w * .3, w, w * .3);
  ctx.restore();

  ctx.save(); transform(ctx, pose);
  body(ctx, w, h); ctx.strokeStyle = '#597d8b8c'; ctx.lineWidth = .9; ctx.stroke();
  // Rolled glass lip with an open elliptical bore and visible wall thickness.
  const rimY = 2, rimHeight = Math.max(2.2, w * .085);
  ctx.beginPath(); ctx.ellipse(w / 2, rimY + 1.2, w / 2 + 2.5, rimHeight, 0, 0, Math.PI * 2);
  ctx.fillStyle = gradient(ctx, 0, rimY - rimHeight, 0, rimY + rimHeight * 1.5, [[0, '#faffffe6'], [.40, '#d4e9eccc'], [.63, '#83a7b188'], [1, '#f3ffffc9']]); ctx.fill(); ctx.strokeStyle = '#7896a391'; ctx.lineWidth = .8; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(w / 2, rimY - .3, inner.width / 2, rimHeight * .55, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#738f9b35'; ctx.fill(); ctx.strokeStyle = '#5c849c6b'; ctx.lineWidth = .65; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(w / 2, rimY - .6, w / 2 + 1.6, rimHeight * .92, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = '#ffffffff'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}

export function drawStream(ctx: CanvasRenderingContext2D, start: Point, end: Point, color: number, width: number, time: number, flow: number) {
  const base = WATER_COLORS[color], taper = Math.min(1, flow * 16, (1 - flow) * 16), radius = Math.max(.3, width * taper / 2);
  const wobble = Math.sin(time * .025) * .45;
  ctx.save(); ctx.beginPath(); ctx.moveTo(start.x - radius, start.y);
  ctx.bezierCurveTo(start.x - radius + wobble, start.y + 12, end.x - radius * .7, end.y - 14, end.x - radius * .8, end.y);
  ctx.quadraticCurveTo(end.x, end.y + 3, end.x + radius * .8, end.y);
  ctx.bezierCurveTo(end.x + radius * .7, end.y - 14, start.x + radius + wobble, start.y + 12, start.x + radius, start.y);
  ctx.closePath(); ctx.fillStyle = gradient(ctx, start.x - radius, 0, start.x + radius, 0, [[0, tint(base, .68, .8)], [.35, tint(base, 1.45, .9)], [.7, tint(base, 1.08, .92)], [1, tint(base, .75, .8)]]); ctx.fill();
  ctx.beginPath(); ctx.moveTo(start.x - radius * .25, start.y + 1); ctx.bezierCurveTo(start.x + wobble, start.y + 13, end.x - .35, end.y - 9, end.x, end.y);
  ctx.strokeStyle = '#ffffff73'; ctx.lineWidth = Math.max(.5, radius * .25); ctx.stroke(); ctx.restore();
}
