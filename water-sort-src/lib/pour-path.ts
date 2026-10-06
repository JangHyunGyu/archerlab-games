import { boundsOf, chooseDirection, mix, phases, placeVessel, planHover, roundBottom, spillAngle, vesselOutline, type Box, type Point, type Rect } from './pour-motion.ts';
import { liquidVolume } from './glass-renderer.ts';

// The lifted bottle's whole path for one pour, shared by PourAnimation and the geometry tests.
export type PourGeometry = {
  source: Rect; destination: Rect; sourceWater: Rect; sourceLift: number;
  others?: Rect[]; // Resting bottles the lifted bottle should pass above when there is room.
};
export type PourPose = { t: number; approach: number; flow: number; retreat: number; pouring: boolean; angle: number; position: Point; outline: Point[] };
// Highest the lifted bottle may go, so its rim is never cut off at the top of the screen.
export const TOP_MARGIN = 6;
// The stretch where the bottle has left its slot and not yet started back: hold, then pour.
export const HOLD_START = .24, RETURN_START = .77;
const ANGLE_SAMPLES = 33;

// Usually the bottle tips toward the side it came from. When that side would have to climb far to
// keep the ghost clear (a top-row bottle pouring into the row below swings back over its own slot),
// it tips the other way instead, if the bottle fits on screen that way.
export function planPour(geometry: PourGeometry, units: number, amount: number, viewportWidth: number) {
  const { source, destination } = geometry;
  const usual = chooseDirection(source, destination, viewportWidth);
  const plan = planSide(geometry, units, amount, usual);
  const x = destination.x + destination.width / 2, needed = Math.hypot(source.width, source.height) + 12;
  const fits = usual === 1 ? viewportWidth - x >= needed : x >= needed;
  if (!fits || plan.lift < 24 && !plan.blocked) return plan;
  const other = planSide(geometry, units, amount, -usual);
  const better = plan.blocked ? !other.blocked || other.lift < plan.lift : !other.blocked && other.lift <= plan.lift - 24;
  return better ? other : plan;
}
function planSide(geometry: PourGeometry, units: number, amount: number, direction: number) {
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
  const others = (geometry.others ?? []).map(r => ({ x0: r.x - 2, y0: r.y - 4, x1: r.x + r.width + 2, y1: r.y + r.height + 6 }));
  // Every angle the bottle holds still at: the hold uses the first, the pour sweeps to the last.
  const angles = Array.from({ length: ANGLE_SAMPLES }, (_, i) => mix(initialAngle, finalAngle, i / (ANGLE_SAMPLES - 1)));
  const hover = planHover(outline, pivot, base, angles, ghost, TOP_MARGIN, others, 8, source.height);
  const end = { x: base.x, y: base.y - hover.lift };
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
  return { direction, pivot, ghost, end, lift: hover.lift, blocked: hover.blocked, initialAngle, finalAngle, pose };
}
export type PourPlan = ReturnType<typeof planPour>;
