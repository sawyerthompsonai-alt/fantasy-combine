import type { EventType } from '@/lib/types';
import type { AthletePose } from './Athlete';

/** Ease-out curve (starts fast, settles) — used for travel and reveal
 * motion across every per-event scene. */
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 2.2);

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Lives in lib/timeline.ts (lib/scoreboard.ts needs it and lib/ must not
 * import from components/) — re-exported here so every existing per-event
 * scene import keeps working unchanged. */
import { STAT_REVEAL_FRACTION } from '@/lib/timeline';
export { STAT_REVEAL_FRACTION };

export function poseFor(type: EventType): AthletePose {
  switch (type) {
    case 'bench': return 'lift';
    case 'vertical':
    case 'broad': return 'jump';
    case 'gauntlet': return 'catch';
    default: return 'run'; // forty, threecone, shuttle, champ40
  }
}

/** Competitors in a fixed, ranking-independent lane order — matches the
 * order the timeline assigns turnIndex/athlete from. */
export function laneOrder(competitors: number[]): number[] {
  return [...competitors].sort((a, b) => a - b);
}

/** A stat value that "counts up" toward its final value as progress runs
 * 0 -> STAT_REVEAL_FRACTION, then holds exactly at the final value. Pure
 * function of progress and the already-known final value — no timers, no
 * randomness, so it renders identically for every viewer at any elapsed
 * time. */
export function countUpStat(progress: number, finalValue: number, revealFraction = STAT_REVEAL_FRACTION): number {
  const u = clamp01(progress / revealFraction);
  return finalValue * easeOut(u);
}

/** Turn-phase choreography beats: the athlete walks on from the sideline,
 * performs, then walks off (or the scene fades). Fractions of overall turn
 * progress; scenes that don't need a physical walk-on (e.g. a sprint whose
 * whole path *is* the performance) can ignore this and use `edgeFade`
 * instead for a clean cut. */
export const WALK_IN_FRAC = 0.12;
export const WALK_OFF_FRAC = 0.88;

export type TurnStage = 'walk-in' | 'perform' | 'walk-off';

export function turnWindow(progress: number): { stage: TurnStage; u: number } {
  if (progress < WALK_IN_FRAC) return { stage: 'walk-in', u: clamp01(progress / WALK_IN_FRAC) };
  if (progress > WALK_OFF_FRAC) {
    return { stage: 'walk-off', u: clamp01((progress - WALK_OFF_FRAC) / (1 - WALK_OFF_FRAC)) };
  }
  return { stage: 'perform', u: clamp01((progress - WALK_IN_FRAC) / (WALK_OFF_FRAC - WALK_IN_FRAC)) };
}

/** Opacity for a clean fade in/out at the very edges of a turn — the
 * "walk-off/fade" alternative for scenes whose perform motion already
 * carries the athlete on/off screen (dash sprints, ball flight, etc). */
export function edgeFade(progress: number, inFrac = 0.06, outFrac = 0.94): number {
  if (progress < inFrac) return clamp01(progress / inFrac);
  if (progress > outFrac) return clamp01((1 - progress) / (1 - outFrac));
  return 1;
}

export interface Point { x: number; y: number }

/** Interpolates a position along a polyline of waypoints (percent-space) by
 * overall path-length fraction t (0..1), plus the direction (dx, dy) of the
 * segment currently being traversed — used to flip an athlete's facing at
 * each direction change. Pure geometry, no randomness. */
export function pathPosition(waypoints: Point[], t: number): Point & { dx: number; dy: number } {
  if (waypoints.length < 2) {
    const p = waypoints[0] ?? { x: 50, y: 50 };
    return { ...p, dx: 0, dy: 0 };
  }
  const clamped = clamp01(t);
  const segLens = waypoints.slice(1).map((p, i) => Math.hypot(p.x - waypoints[i].x, p.y - waypoints[i].y));
  const total = segLens.reduce((a, b) => a + b, 0) || 1;
  const target = clamped * total;
  let covered = 0;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i];
    if (target <= covered + len || i === segLens.length - 1) {
      const local = len === 0 ? 0 : clamp01((target - covered) / len);
      const a = waypoints[i];
      const b = waypoints[i + 1];
      return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local, dx: b.x - a.x, dy: b.y - a.y };
    }
    covered += len;
  }
  const last = waypoints[waypoints.length - 1];
  return { ...last, dx: 0, dy: 0 };
}

/** Which way an athlete should face given horizontal travel direction;
 * keeps a caller-supplied fallback when the current segment is purely
 * vertical (dx ~ 0). */
export function facingFromDx(dx: number, fallback: 'left' | 'right' = 'right'): 'left' | 'right' {
  if (dx > 0.01) return 'right';
  if (dx < -0.01) return 'left';
  return fallback;
}

/** Concave climb curve: fast early progress, decelerating "strain" near the
 * end — used for the bench rep counter. */
export function strainEase(u: number): number {
  return Math.sqrt(clamp01(u));
}

/** Turn-phase beat boundaries for the 40-yard dash, as fractions of overall
 * turn progress: walk in from the sideline, hold the 3-point stance, the
 * gun/sprint burst, running through the finish, the OFFICIAL time reveal,
 * and the jog-off. `official` intentionally equals `STAT_REVEAL_FRACTION` —
 * the clock freezes at the same instant the shared stat-reveal beat fires,
 * so DashScene's existing countUpStat/lock wiring lines up for free. */
export const DASH_BEATS = {
  walkIn: [0, 0.12],
  stance: [0.12, 0.28],
  sprint: [0.28, 0.60],
  through: [0.60, 0.70],
  official: 0.70,
  jogOff: [0.86, 1],
} as const;

/** Turn progress at which the gun fires and the sprint begins — also where
 * Broadcast's whistle-at-sprint-start beat triggers for dash-type events. */
export const SPRINT_START_FRAC = DASH_BEATS.sprint[0];

/** Camera x (viewport %) that keeps the runner ~38% from the left once
 * they've traveled past that anchor point; clamped to the track bounds
 * [0, 200] so the pan never runs past the edges of the panning TrackLines
 * layer. Below the anchor the camera holds at 0 — the runner visibly
 * accelerates away from a static camera before the pan kicks in, matching
 * real combine coverage. */
export function cameraX(runnerWorldPct: number, viewportAnchor = 38, trackMax = 200): number {
  return Math.min(trackMax, Math.max(0, runnerWorldPct - viewportAnchor));
}

// --- Waypoint-route choreography ------------------------------------------
// Shared by any turn that travels a fixed polyline of Point waypoints in a
// single static frame (the 3-cone L-drill and 5-10-5 shuttle both use these;
// the 40 has its own straight-line world-space helpers above because it also
// pans the camera, which these routes don't). Pure geometry — no timers, no
// randomness — so every derived value is a deterministic function of
// (waypoints, progress).

/** Smooth "ease in, ease out" cubic (0 slope at both ends) — applied to
 * each waypoint segment's local progress so a runner decelerates into every
 * cone/line and re-accelerates out of it, instead of gliding through
 * corners at constant speed. */
export function smoothstep(u: number): number {
  const c = clamp01(u);
  return c * c * (3 - 2 * c);
}

/** Running path-length total at each waypoint: `dist[0] === 0`,
 * `dist[i]` is the cumulative distance from `waypoints[0]` to
 * `waypoints[i]`. Used to convert an overall route fraction into a segment
 * + local-progress pair. */
export function cumulativeDist(waypoints: Point[]): number[] {
  const dist = [0];
  for (let i = 1; i < waypoints.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y));
  }
  return dist;
}

/** Position + current-segment direction along a waypoint path at route
 * fraction `u` (0..1), with each segment's local progress smoothstep-eased
 * (see above) rather than linear — a smoothstep-eased sibling of
 * `pathPosition`. `cumDist` must be `cumulativeDist(waypoints)`; passed in
 * (rather than recomputed) so callers with a fixed waypoint list can
 * compute it once at module load. */
export function easedPathPosition(waypoints: Point[], cumDist: number[], u: number): Point & { dx: number; dy: number } {
  const total = cumDist[cumDist.length - 1] || 1;
  const target = clamp01(u) * total;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const segStart = cumDist[i];
    const segEnd = cumDist[i + 1];
    if (target <= segEnd || i === waypoints.length - 2) {
      const len = segEnd - segStart;
      const local = len === 0 ? 0 : smoothstep((target - segStart) / len);
      const a = waypoints[i];
      const b = waypoints[i + 1];
      return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local, dx: b.x - a.x, dy: b.y - a.y };
    }
  }
  const last = waypoints[waypoints.length - 1];
  return { ...last, dx: 0, dy: 0 };
}

/** Path-length distance to the nearest *interior* waypoint (a real plant —
 * endpoints are excluded, they're the start/finish, not a redirect) plus
 * the turn-direction sign there (cross product of the incoming/outgoing
 * unit directions: 0 for a straight-line reversal like a shuttle line or
 * the 3-cone's out-and-back leg, ±1 for an angular cut like the L-drill's
 * corners). Drives both the plant lean and the run-cycle slowdown. */
export function nearestPlant(waypoints: Point[], cumDist: number[], u: number): { dist: number; sign: number } {
  const total = cumDist[cumDist.length - 1] || 1;
  const target = clamp01(u) * total;
  let dist = Infinity;
  let sign = 0;
  for (let i = 1; i < waypoints.length - 1; i++) {
    const d = Math.abs(target - cumDist[i]);
    if (d < dist) {
      const prev = waypoints[i - 1];
      const cur = waypoints[i];
      const next = waypoints[i + 1];
      const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
      const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
      const inX = (cur.x - prev.x) / inLen;
      const inY = (cur.y - prev.y) / inLen;
      const outX = (next.x - cur.x) / outLen;
      const outY = (next.y - cur.y) / outLen;
      dist = d;
      sign = Math.sign(inX * outY - inY * outX);
    }
  }
  return { dist, sign };
}

// Path-length units (in the shared percent-space) on either side of a
// plant where the lean/cadence effects apply.
export const PLANT_WINDOW = 9;

export function plantLean(plant: { dist: number; sign: number }, maxDeg: number): number {
  if (plant.dist >= PLANT_WINDOW) return 0;
  return plant.sign * maxDeg * (1 - plant.dist / PLANT_WINDOW);
}

export function plantRunCycleSec(plant: { dist: number }): number {
  const proximity = clamp01(1 - plant.dist / PLANT_WINDOW);
  return 0.42 + 0.24 * proximity;
}

/** Maps overall turn progress to route fraction 0..1 across the shared
 * stance-end -> official-reveal window ([0.28, 0.70] per DASH_BEATS). */
export function routeU(progress: number): number {
  const { stance, official } = DASH_BEATS;
  return clamp01((progress - stance[1]) / (official - stance[1]));
}

/** walk / stance / run / walk — the pose rhythm every dash drill shares. */
export function dashPhasePose(progress: number): AthletePose {
  const { walkIn, stance, official } = DASH_BEATS;
  if (progress < walkIn[1]) return 'walk';
  if (progress < stance[1]) return 'stance';
  if (progress < official) return 'run';
  return 'walk';
}

/** Eases the athlete in from just below the stance mark during walk-in. */
export function routeWalkInY(progress: number, standY: number): number {
  const { walkIn } = DASH_BEATS;
  if (progress >= walkIn[1]) return standY;
  const fromY = standY + 10;
  const u = easeOut(clamp01(progress / walkIn[1]));
  return fromY - (fromY - standY) * u;
}

/** A few more steps' drift past the finish line during jog-off, along the
 * route's final direction. */
export function routeJogOffOffset(progress: number, dirX: number, dirY: number, amount = 6): { dx: number; dy: number } {
  const { jogOff } = DASH_BEATS;
  if (progress < jogOff[0]) return { dx: 0, dy: 0 };
  const u = easeOut(clamp01((progress - jogOff[0]) / (jogOff[1] - jogOff[0])));
  return { dx: dirX * amount * u, dy: dirY * amount * u };
}

// --- Bench press ------------------------------------------------------

/** Lockout fractions (0..1 of the perform window) for R reps: even pacing,
 * except the last two reps take 1.5x and 2x as long as a normal rep (the
 * struggle) — each rep's weight is its share of the perform window, and the
 * lockout fractions are the prefix sums of those weights normalized to 1.
 * Pure arithmetic — no timers, no randomness, so the same rep count always
 * produces the same lockout schedule. */
export function benchLockouts(reps: number): number[] {
  if (reps <= 0) return [];
  const weights: number[] = [];
  for (let i = 0; i < reps; i++) {
    if (i === reps - 1) weights.push(2);
    else if (i === reps - 2) weights.push(1.5);
    else weights.push(1);
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let sum = 0;
  return weights.map(w => {
    sum += w;
    return sum / total;
  });
}

// --- Jump events (vertical vertec, broad jump) -----------------------------

/** State for one of N items that peel away in sequence, each starting
 * `staggerFrac` of turn progress after the previous item and taking
 * `spinFrac` of progress to complete its own motion — the vertec flags
 * swatted away below the reached height (Task 11), but generic over any
 * staggered "knock away"/reveal driven by an item's index rather than a CSS
 * animation-delay (so it stays correct for a viewer who joins mid-turn).
 * `u` is the item's own local progress (0 before its turn starts, 1 once its
 * motion is complete and holds there); `eased` is `easeOut(u)`. Pure
 * function of (progress, index, startProgress, staggerFrac, spinFrac). */
export function staggeredSpin(
  progress: number, index: number, startProgress: number, staggerFrac: number, spinFrac: number,
): { u: number; eased: number } {
  const itemStart = startProgress + index * staggerFrac;
  const u = clamp01((progress - itemStart) / Math.max(spinFrac, 1e-6));
  return { u, eased: easeOut(u) };
}

/** Two-pump "load" rhythm as a scaleY multiplier over u∈[0,1]: dips to
 * `1 - dip1` at the quarter mark, back to 1 at the half mark, then dips to
 * `1 - dip2` and *stays* there at u=1 rather than recoiling back — the
 * second, deeper dip becomes the crouch an explosive movement launches from
 * (the broad jump's double arm pump into a leap, a vertical's final load
 * into its explode). Pure function of (u, dip1, dip2); no timers, no
 * randomness. */
export function doublePumpScaleY(u: number, dip1: number, dip2: number): number {
  const c = clamp01(u);
  if (c < 0.5) {
    const local = c / 0.5;
    return 1 - dip1 * Math.sin(Math.PI * local);
  }
  const local = (c - 0.5) / 0.5;
  return 1 - dip2 * Math.sin((Math.PI / 2) * local);
}

/** Piecewise, smoothstep-eased interpolation through a list of hand-authored
 * `[u, value]` keyframes — used for the broad jump's stick-the-landing
 * wobble (rotation +6deg -> -4deg -> +2deg -> 0deg, a damped oscillation)
 * but generic over any authored damped curve. `points` must be sorted by u
 * ascending; values outside the first/last u hold at the nearest endpoint's
 * value. Pure function of (u, points) — no timers, no randomness. */
export function dampedKeyframes(u: number, points: Array<[number, number]>): number {
  if (points.length === 0) return 0;
  const c = clamp01(u);
  for (let i = 0; i < points.length - 1; i++) {
    const [u0, v0] = points[i];
    const [u1, v1] = points[i + 1];
    if (c <= u1 || i === points.length - 2) {
      const local = u1 === u0 ? 0 : clamp01((c - u0) / (u1 - u0));
      return v0 + (v1 - v0) * smoothstep(local);
    }
  }
  return points[points.length - 1][1];
}

// --- Gauntlet (JUGS thrower) -------------------------------------------

/** Two decaying "hop" bounces as a vertical offset (negative = upward) over
 * u∈[0,1]: the first, taller hop peaks at u=0.25, the second (smaller) hop
 * peaks at u=0.75, both returning to 0 at u=0, 0.5 and 1 — a dropped ball
 * settling on the ground. Pure function of (u, amp1, amp2); no timers, no
 * randomness, so a viewer joining mid-bounce lands on the correct height. */
export function dampedHops(u: number, amp1: number, amp2: number): number {
  const c = clamp01(u);
  if (c < 0.5) {
    const local = c / 0.5;
    return -amp1 * Math.sin(Math.PI * local);
  }
  const local = (c - 0.5) / 0.5;
  return -amp2 * Math.sin(Math.PI * local);
}

/** A recoil/impulse pulse that fires once at every `1/count`-th boundary of
 * progress (e.g. a JUGS machine's kick at each of `count` evenly spaced
 * launches): 1 right at the boundary, decaying linearly to 0 over `frac` of
 * progress, 0 for the remainder of the period. Pure function of (progress,
 * count, frac) — no timers, no randomness. */
export function periodicPulse(progress: number, count: number, frac: number): number {
  if (count <= 0 || frac <= 0) return 0;
  const period = 1 / count;
  const local = clamp01(progress) % period;
  return local < frac ? 1 - local / frac : 0;
}
