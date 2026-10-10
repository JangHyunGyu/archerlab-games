import { boundsOf, chooseDirection, mix, phases, placeVessel, planHover, roundBottom, spillAngle, vesselOutline, type Box, type Point, type Rect } from './pour-motion.ts';
import { liquidVolume } from './glass-renderer.ts';

// The lifted bottle's whole path for one pour, shared by PourAnimation and the geometry tests.
export type PourGeometry = {
  source: Rect; destination: Rect; sourceWater: Rect; sourceLift: number;
  others?: Rect[]; // Resting bottles beside the pour. The lip does not climb over them.
};
export type PourPose = { t: number; approach: number; flow: number; retreat: number; pouring: boolean; angle: number; position: Point; outline: Point[] };
// Highest the lifted bottle may go, so its rim is never cut off at the top of the screen.
export const TOP_MARGIN = 6;
// The stretch where the bottle has left its slot and not yet started back: hold, then pour.
export const HOLD_START = .24, RETURN_START = .77;
const HOVER_SAMPLES = 97;

// The lip stays at one height for a route, whichever water level is poured. It clears every tilt
// from a full bottle down to empty, and it does not climb over neighboring glasses: that climb
// followed how upright this glass was, so the same move poured from higher up as the glass got
// fuller. The glass tips toward the side it came from unless the other side stays on screen and
// sits lower. The ghost left in the source slot is still cleared.
export function planPour(geometry: PourGeometry, units: number, amount: number, viewportWidth: number, viewportHeight = Number.POSITIVE_INFINITY) {
  const usual = chooseDirection(geometry.source, geometry.destination, viewportWidth);
  const plan = planSide(geometry, units, amount, usual, viewportWidth, viewportHeight);
  const other = planSide(geometry, units, amount, -usual, viewportWidth, viewportHeight);
  const usable = (side: { fits: boolean; blocked: boolean; lift: number }) => side.fits && !side.blocked;
  if (usable(other) && (!usable(plan) || other.lift < plan.lift - .5)) return other;
  return plan;
}
function planSide(geometry: PourGeometry, units: number, amount: number, direction: number, viewportWidth: number, viewportHeight: number) {
  const { source, destination, sourceWater: water } = geometry;
  const pivot = { x: direction > 0 ? water.x + water.width : water.x, y: water.y };
  const polygon = roundBottom(water, water.width * .48);
  const volume = (n: number) => liquidVolume(water, n);
  const angleFor = (remaining: number) => spillAngle(polygon, pivot, volume(remaining), direction);
  const initialAngle = angleFor(units), finalAngle = angleFor(units - amount);
  const outline = vesselOutline(source.width, source.height);
  // The faded ghost stays in the source slot; the lifted bottle pours from above it.
  const ghost: Box = { x0: source.x - 4, y0: source.y - 6, x1: source.x + source.width + 4, y1: source.y + source.height + 10 };
  const base = { x: destination.x + destination.width / 2, y: destination.y - 15 };
  // Same angles for every water level, so the lip height does not change between pours.
  const hoverAngles = Array.from({ length: HOVER_SAMPLES }, (_, i) => mix(angleFor(4), angleFor(0), i / (HOVER_SAMPLES - 1)));
  const hover = planHover(outline, pivot, base, hoverAngles, ghost, TOP_MARGIN);
  const end = { x: base.x, y: base.y - hover.lift };
  const fits = hoverAngles.every(angle => {
    const box = boundsOf(placeVessel(outline, angle, pivot, end));
    return box.x0 >= -0.5 && box.x1 <= viewportWidth + 0.5 && box.y0 >= -0.5 && box.y1 <= viewportHeight + 0.5;
  });
  const start = { x: source.x + pivot.x, y: source.y + pivot.y + geometry.sourceLift };
  const rest = { x: source.x + pivot.x, y: source.y + pivot.y };
  function pose(t: number): PourPose {
    const { approach, flow, retreat } = phases(t);
    let angle = t < .27 ? initialAngle * approach : angleFor(units - amount * flow);
    angle *= 1 - retreat;
    let position = { x: mix(start.x, end.x, approach), y: mix(start.y, end.y, approach) - Math.sin(approach * Math.PI) * 18 };
    if (retreat) position = { x: mix(end.x, rest.x, retreat), y: mix(end.y, rest.y, retreat) - Math.sin(retreat * Math.PI) * 12 };
    let placed = placeVessel(outline, angle, pivot, position);
    // The travel arc may not lift the rim past the top margin either.
    const over = TOP_MARGIN - boundsOf(placed).y0;
    if (over > 0 && (t < HOLD_START || t >= RETURN_START)) {
      position = { x: position.x, y: position.y + over };
      placed = placed.map(p => ({ x: p.x, y: p.y + over }));
    }
    return { t, approach, flow, retreat, pouring: t >= .27 && t < .73, angle, position, outline: placed };
  }
  return { direction, pivot, ghost, end, lift: hover.lift, blocked: hover.blocked, fits, initialAngle, finalAngle, pose };
}
export type PourPlan = ReturnType<typeof planPour>;
