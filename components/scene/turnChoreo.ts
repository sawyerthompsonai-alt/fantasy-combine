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
