export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const ease = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function roundBottom(rect: Rect, radius: number): Point[] {
  const { x, y, width: w, height: h } = rect, r = Math.min(radius, w / 2, h / 2);
  const points = [{ x, y }, { x: x + w, y }];
  for (let i = 0; i <= 8; i++) {
    const a = i / 8 * Math.PI / 2;
    points.push({ x: x + w - r + Math.cos(a) * r, y: y + h - r + Math.sin(a) * r });
  }
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 + i / 8 * Math.PI / 2;
    points.push({ x: x + r + Math.cos(a) * r, y: y + h - r + Math.sin(a) * r });
  }
  return points;
}
export function rotate(points: Point[], angle: number, pivot: Point = { x: 0, y: 0 }): Point[] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return points.map(p => ({ x: (p.x - pivot.x) * cos - (p.y - pivot.y) * sin, y: (p.x - pivot.x) * sin + (p.y - pivot.y) * cos }));
}
export function area(points: Point[]): number {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
}
export function below(points: Point[], line: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a.y >= line) result.push(a);
    if ((a.y >= line) !== (b.y >= line)) {
      const t = (line - a.y) / (b.y - a.y);
      result.push({ x: mix(a.x, b.x, t), y: line });
    }
  }
  return result;
}
export function surface(points: Point[], volume: number): number {
  let low = Math.min(...points.map(p => p.y)), high = Math.max(...points.map(p => p.y));
  for (let i = 0; i < 19; i++) {
    const mid = (low + high) / 2;
    if (area(below(points, mid)) > volume) low = mid; else high = mid;
  }
  return (low + high) / 2;
}
export function spillAngle(points: Point[], pivot: Point, volume: number, direction: number): number {
  let low = 0, high = Math.PI * .525;
  for (let i = 0; i < 17; i++) {
    const angle = (low + high) / 2;
    if (area(below(rotate(points, angle * direction, pivot), 0)) > volume) low = angle; else high = angle;
  }
  return (low + high) / 2 * direction;
}
export function chooseDirection(source: Rect, target: Rect, viewportWidth: number): number {
  const x = target.x + target.width / 2, needed = Math.hypot(source.width, source.height) + 12;
  const preferred = source.x < target.x ? 1 : -1;
  if (preferred === 1 && x >= needed || preferred === -1 && viewportWidth - x >= needed) return preferred;
  return x > viewportWidth / 2 ? 1 : -1;
}
export function phases(progress: number) {
  return { approach: ease(progress / .24), flow: clamp01((progress - .27) / .46), retreat: ease((progress - .77) / .23) };
}

// Conservative outline of a drawn vessel (rim included) in its local coordinates.
export function vesselOutline(width: number, height: number): Point[] {
  const rim = Math.max(2.2, width * .085);
  return [{ x: -2.5, y: 3.2 - rim }, { x: width + 2.5, y: 3.2 - rim }, { x: width + 2.5, y: height + 1 }, { x: -2.5, y: height + 1 }];
}
// World polygon of a vessel posed like drawVessel: `at` is where the pivot sits on screen.
export function placeVessel(outline: Point[], angle: number, pivot: Point, at: Point): Point[] {
  return rotate(outline, angle, pivot).map(p => ({ x: p.x + at.x, y: p.y + at.y }));
}
export type Box = { x0: number; y0: number; x1: number; y1: number };
export function boundsOf(points: Point[]): Box {
  return { x0: Math.min(...points.map(p => p.x)), y0: Math.min(...points.map(p => p.y)), x1: Math.max(...points.map(p => p.x)), y1: Math.max(...points.map(p => p.y)) };
}
function clipX(points: Point[], edge: number, keepAbove: boolean): Point[] {
  const inside = (p: Point) => keepAbove ? p.x >= edge : p.x <= edge;
  const result: Point[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    if (inside(a)) result.push(a);
    if (inside(a) !== inside(b)) result.push({ x: edge, y: mix(a.y, b.y, (edge - a.x) / (b.x - a.x)) });
  });
  return result;
}
// The part of a convex polygon inside a vertical strip (empty when it never crosses the strip).
export function clipStrip(points: Point[], x0: number, x1: number): Point[] {
  return clipX(clipX(points, x0, true), x1, false);
}
export function overlaps(points: Point[], box: Box): boolean {
  const part = clipStrip(points, box.x0, box.x1);
  return part.length > 0 && Math.min(...part.map(p => p.y)) < box.y1 && Math.max(...part.map(p => p.y)) > box.y0;
}
// How far to raise the pour point so the tilted bottle clears the ghost left in its slot for every
// angle of the pour, without leaving the top of the viewport. `others` (the resting bottles) are
// cleared too when the screen has room and doing so keeps the ghost clear; the ghost always wins.
// Returns 0 when nothing is in the way. If the screen is too short, it rises as far as it can.
export function hoverLift(outline: Point[], pivot: Point, at: Point, angles: number[], ghost: Box, top: number, others: Box[] = [], gap = 8): number {
  const poses = angles.map(angle => placeVessel(outline, angle, pivot, at));
  const room = Math.min(...poses.map(poly => Math.min(...poly.map(p => p.y)) - top));
  const needFor = (boxes: Box[]) => {
    let need = 0;
    for (const poly of poses) for (const box of boxes) {
      if (overlaps(poly, box)) need = Math.max(need, Math.max(...clipStrip(poly, box.x0, box.x1).map(p => p.y)) - box.y0 + gap);
    }
    return Math.max(0, Math.min(need, room));
  };
  const clear = (shift: number) => poses.every(poly => !overlaps(poly.map(p => ({ x: p.x, y: p.y - shift })), ghost));
  let lift = needFor([ghost]);
  // A lift that solves one angle but pushes another into the ghost is not used.
  if (lift && !clear(lift) && clear(0)) lift = 0;
  const wider = needFor([ghost, ...others]);
  return wider > lift && clear(wider) ? wider : lift;
}
