'use client';
import Athlete, { type AthletePose } from '../Athlete';
import LowerThird from '../LowerThird';
import TrackLines from '../sets/TrackLines';
import EventFrame from './EventFrame';
import {
  laneOrder, countUpStat, facingFromDx, edgeFade, easeOut, clamp01,
  DASH_BEATS, cameraX, type Point,
  cumulativeDist, easedPathPosition, nearestPlant, plantLean, plantRunCycleSec,
  routeU, dashPhasePose, routeWalkInY, routeJogOffOffset,
} from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';
import type { AthleteBio } from '@/lib/jokes';

function Cone({ x, y }: Point) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${x}%`, top: `${y}%` }}>
      <div
        className="h-3 w-3 bg-[var(--accent)] shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
        style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}
      />
    </div>
  );
}

/** A shuttle touch line drawn like a yard line (thin rule + faint number),
 * not the panning `TrackLines` grid — the shuttle's local percent-space
 * isn't calibrated to that layer's world-yard scale, and a full-width grid
 * would be clutter around a drill contained in a small strip of the frame. */
function ShuttleLine({ x, label }: { x: number; label: string }) {
  return (
    <div className="absolute -translate-x-1/2" style={{ left: `${x}%`, top: '52%', bottom: '10%' }}>
      <div className="h-full w-px bg-white/25" />
      <span className="display absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/40">
        {label}
      </span>
    </div>
  );
}

// --- 40-yard dash: world-space track geometry (viewport-% units, 3 world
// units ≈ 1 yard — 130 - 10 = 120 world units spans the 40-yard course). ---
const START_WORLD = 10; // start line
const FINISH_WORLD = 130; // 40 yards on
const PULLUP_WORLD = 165; // deceleration carries the runner this far past the tape
const JOGOFF_WORLD = 170; // slow jog drift to the edge of the course
const STANCE_Y = 78;
const WALK_IN_Y_START = 88;
// Rendered figure height, shared by all three dash drills (forty/threecone/
// shuttle). forty/threecone pass their lean straight to Athlete's own
// `leanDeg` prop now (it pivots around its own figure box internally, never
// the name chip below it — see Athlete.tsx), so this constant no longer
// needs to double as a rotation pivot for those two. The shuttle's hand-
// touch "dip" (scaleY squash, not a lean) still wraps Athlete externally and
// uses this same value for its own pivot, since that effect intentionally
// squashes the whole component including the chip.
const ATHLETE_SIZE = 84;

/** Runner's world-x position as a pure function of turn progress. Three
 * eased "bursts" (explosive start out of the blocks, driving through the
 * tape, then pulling up) each shaped by the shared easeOut curve, stitched
 * together at DASH_BEATS boundaries so position is always continuous. */
function fortyWorldX(progress: number): number {
  const { stance, sprint, jogOff } = DASH_BEATS;
  if (progress <= stance[1]) return START_WORLD;
  if (progress <= sprint[1]) {
    const u = clamp01((progress - sprint[0]) / (sprint[1] - sprint[0]));
    return START_WORLD + (FINISH_WORLD - START_WORLD) * easeOut(u);
  }
  if (progress <= jogOff[0]) {
    const u = clamp01((progress - sprint[1]) / (jogOff[0] - sprint[1]));
    return FINISH_WORLD + (PULLUP_WORLD - FINISH_WORLD) * easeOut(u);
  }
  const u = clamp01((progress - jogOff[0]) / (jogOff[1] - jogOff[0]));
  return PULLUP_WORLD + (JOGOFF_WORLD - PULLUP_WORLD) * u;
}

/** d(world)/d(progress) — the analytic derivative of `fortyWorldX`'s
 * piecewise easeOut curve (easeOut'(u) = 2.2·(1-u)^1.2), used to match limb
 * cadence to ground speed. Pure function of progress; no timers. */
function fortySpeed(progress: number): number {
  const { stance, sprint, jogOff } = DASH_BEATS;
  if (progress <= stance[1]) return 0;
  if (progress <= sprint[1]) {
    const len = sprint[1] - sprint[0];
    const u = clamp01((progress - sprint[0]) / len);
    return ((FINISH_WORLD - START_WORLD) / len) * 2.2 * Math.pow(1 - u, 1.2);
  }
  if (progress <= jogOff[0]) {
    const len = jogOff[0] - sprint[1];
    const u = clamp01((progress - sprint[1]) / len);
    return ((PULLUP_WORLD - FINISH_WORLD) / len) * 2.2 * Math.pow(1 - u, 1.2);
  }
  const len = jogOff[1] - jogOff[0];
  return (JOGOFF_WORLD - PULLUP_WORLD) / len;
}

// Peak d(world)/d(progress) is at the sprint's very first instant (u=0):
// (FINISH_WORLD-START_WORLD)/sprintLen * 2.2 = 120/0.32 * 2.2 = 825. Scaled
// so that peak speed maps to the fastest cadence (0.22s) and near-zero
// speed relaxes toward Athlete's own default cadence (0.46s).
const RUN_CYCLE_K = 0.24 / 825;

function fortyRunCycleSec(progress: number): number {
  return Math.max(0.22, 0.46 - fortySpeed(progress) * RUN_CYCLE_K);
}

/** Forward body lean (degrees) out of the blocks: −22° at the gun, easing
 * to upright (0°) over the first third of the sprint window. Zero outside
 * the sprint (stance/through/jog-off use their own poses, not lean). */
function fortyLean(progress: number): number {
  const { sprint } = DASH_BEATS;
  if (progress < sprint[0]) return 0;
  const easeWindow = (sprint[1] - sprint[0]) / 3;
  const u = clamp01((progress - sprint[0]) / easeWindow);
  return -22 * (1 - easeOut(u));
}

function fortyY(progress: number): number {
  const { walkIn } = DASH_BEATS;
  if (progress >= walkIn[1]) return STANCE_Y;
  const u = easeOut(clamp01(progress / walkIn[1]));
  return WALK_IN_Y_START - (WALK_IN_Y_START - STANCE_Y) * u;
}

function fortyPose(progress: number): AthletePose {
  const { walkIn, stance, jogOff } = DASH_BEATS;
  if (progress < walkIn[1]) return 'walk';
  if (progress < stance[1]) return 'stance';
  if (progress < jogOff[0]) return 'run';
  return 'walk';
}

// --- 3-cone + shuttle: shared choreography ----------------------------------
// Both drills run in a single static frame (no camera pan — the whole route
// fits on screen at once), reuse the walk-in / stance / jog-off beats from
// DASH_BEATS, and turn the sprint+through window [0.28, 0.70] into a route
// window the athlete travels the full waypoint path across. The pure
// geometry helpers driving this (smoothstep, easedPathPosition, nearestPlant,
// plantLean, plantRunCycleSec, routeU, dashPhasePose, routeWalkInY,
// routeJogOffOffset) live in `../turnChoreo` — they're generic over any
// Point[] waypoint list, not specific to either drill, and living there puts
// them alongside `pathPosition`/`DASH_BEATS` where `tests/choreo.test.ts`
// already covers this kind of pure choreography math.

const PLANT_LEAN_DEG = 14;

// --- 3-cone (L-drill) geometry ---------------------------------------------
// Cone 1 at start, Cone 2 five yards on, Cone 3 five yards up from Cone 2.
// Route: C1 -> C2 -> C1 -> C2 -> hook wide around C2 -> C3 -> loop tight
// around C3 -> back to C2 -> finish at C1.
const THREE_CONE_C1: Point = { x: 30, y: 78 };
const THREE_CONE_C2: Point = { x: 62, y: 78 };
const THREE_CONE_C3: Point = { x: 62, y: 50 };
const THREE_CONE_WAYPOINTS: Point[] = [
  THREE_CONE_C1,
  THREE_CONE_C2,
  THREE_CONE_C1,
  THREE_CONE_C2,
  // Bow wide of C2 (x=68, off the C2->C3 line at x=62) before hooking up to
  // C3 — a real L-drill hooks around the *outside* of the cone rather than
  // running straight up the C2->C3 line. Keeping this waypoint collinear
  // with C2->C3 (as the original (62,73) was) made nearestPlant read a
  // straight-line reversal (sign 0) here — no lean, and the cadence-slowing
  // "plant" window still fired in the middle of what should be an
  // unbroken sprint, a visible hitch. Off the line, it registers as the
  // genuine angular cut it visually is.
  { x: 68, y: 73 },
  THREE_CONE_C3,
  { x: 66, y: 47 },
  { x: 62, y: 44 },
  { x: 58, y: 50 },
  THREE_CONE_C2,
  THREE_CONE_C1,
];
const THREE_CONE_CUM = cumulativeDist(THREE_CONE_WAYPOINTS);
const THREE_CONE_CONES: Point[] = [THREE_CONE_C1, THREE_CONE_C2, THREE_CONE_C3];

// --- Shuttle (5-10-5) geometry ----------------------------------------------
// Start straddling the 50 (the "0" line), touch the 72 (right "5"), touch
// the 28 (left "5"), run through the 58.
const SHUTTLE_START: Point = { x: 50, y: 80 };
const SHUTTLE_WAYPOINTS: Point[] = [SHUTTLE_START, { x: 72, y: 80 }, { x: 28, y: 80 }, { x: 58, y: 80 }];
const SHUTTLE_CUM = cumulativeDist(SHUTTLE_WAYPOINTS);
const SHUTTLE_LINES: { x: number; label: string }[] = [
  { x: 28, label: '5' },
  { x: 50, label: '0' },
  { x: 72, label: '5' },
];
// The two touch waypoints (indices 1 and 2), converted from route-fraction
// to overall turn progress once at module load — routeU's mapping is
// linear, so this conversion doesn't depend on any per-render state.
const SHUTTLE_TOUCH_PROGRESS = [1, 2].map(i => {
  const u = SHUTTLE_CUM[i] / SHUTTLE_CUM[SHUTTLE_CUM.length - 1];
  return DASH_BEATS.stance[1] + u * (DASH_BEATS.official - DASH_BEATS.stance[1]);
});
// 120ms hand-touch window, converted to a progress-fraction against the
// turn's actual duration (mirrors OfficialStamp's ms->progress conversion).
const TOUCH_WINDOW_MS = 120;

/** Extracted from the forty branch's inline OFFICIAL treatment (Task 8) so
 * all three dash drills share one stamp: a scale-in plus a white flash
 * frame, both timed in real ms (converted to a progress-delta via
 * `phaseDurationMs`) but still a pure function of `progress` — no
 * Date.now() during render, so late joiners land on the correct frame. */
function OfficialStamp({
  progress, value, unit, phaseDurationMs,
}: {
  progress: number; value: string; unit: string; phaseDurationMs: number;
}) {
  const sinceOfficial = Math.max(0, progress - DASH_BEATS.official);
  const durMs = Math.max(1, phaseDurationMs);
  const scaleU = clamp01(sinceOfficial / (300 / durMs));
  const flashU = clamp01(sinceOfficial / (180 / durMs));
  const stampScale = 0.9 + 0.1 * easeOut(scaleU);
  const flashOpacity = 0.6 * (1 - flashU);

  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 bg-white" style={{ opacity: flashOpacity }} />
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div
          className="display rounded-lg border-2 border-[var(--accent)] bg-[var(--bg)]/90 px-6 py-3 text-center shadow-[0_0_30px_rgba(245,166,35,0.45)]"
          style={{ transform: `scale(${stampScale})` }}
        >
          <p className="text-[10px] tracking-[0.2em] text-[var(--accent)] sm:text-xs">OFFICIAL</p>
          <p className="stat text-2xl sm:text-4xl">{value}{unit}</p>
        </div>
      </div>
    </>
  );
}

export default function DashScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
  bios?: AthleteBio[]; roast?: (athlete: number) => string;
}) {
  const { event, names, colors, phaseDurationMs } = props;
  const meta = EVENT_META[event.type];

  // The 40 gets its own stance → gun → pan → OFFICIAL choreography.
  if (event.type === 'forty') {
    return (
      <EventFrame
        {...props}
        introMessage={`${laneOrder(event.competitors).length} athletes step up to the line`}
        renderTurn={({ athlete: a, turnIndex, lanes, progress, subline }) => {
          const finalValue = event.performances[a];
          const displayValue = countUpStat(progress, finalValue);
          const locked = progress >= DASH_BEATS.official;
          const opacity = edgeFade(progress);

          const runnerWorld = fortyWorldX(progress);
          const cam = cameraX(runnerWorld);
          const vx = runnerWorld - cam;
          const y = fortyY(progress);
          const pose = fortyPose(progress);
          const lean = pose === 'run' ? fortyLean(progress) : 0;
          const runCycleSec = fortyRunCycleSec(progress);

          const startVx = START_WORLD - cam;
          const finishVx = FINISH_WORLD - cam;

          return (
            <>
              <div className="relative flex-1 overflow-hidden px-4 pb-28 pt-6">
                <TrackLines offsetPct={cam} />

                {startVx >= 0 && startVx <= 100 && (
                  <div aria-hidden className="absolute inset-y-0 w-px bg-white/25" style={{ left: `${startVx}%` }} />
                )}
                {finishVx >= 0 && finishVx <= 100 && (
                  <div
                    aria-hidden
                    className="absolute inset-y-0 w-1 bg-[var(--accent)] shadow-[0_0_12px_rgba(245,166,35,0.7)]"
                    style={{ left: `${finishVx}%` }}
                  />
                )}

                <p className="display absolute left-4 top-4 z-10 text-[10px] text-[var(--muted)] sm:text-xs">
                  LANE {turnIndex + 1} / {lanes.length}
                </p>

                <div
                  className="absolute"
                  style={{ left: `${vx}%`, top: `${y}%`, transform: 'translate(-50%, -100%)', opacity }}
                >
                  <Athlete
                    name={names[a]}
                    color={colors[a]}
                    pose={pose}
                    size={ATHLETE_SIZE}
                    facing="right"
                    spotlight
                    leanDeg={lean}
                    runCycleSec={runCycleSec}
                  />
                </div>

                {locked && (
                  <OfficialStamp
                    progress={progress}
                    value={finalValue.toFixed(meta.decimals)}
                    unit={meta.unit}
                    phaseDurationMs={phaseDurationMs}
                  />
                )}
              </div>
              <LowerThird
                visible
                label={meta.label}
                round={event.round}
                athleteName={names[a]}
                athleteColor={colors[a]}
                subline={subline}
                statLabel={locked ? undefined : 'CLOCK'}
                statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
              />
            </>
          );
        }}
      />
    );
  }

  // 3-cone (L-drill): sharp-plant agility route, one static frame.
  if (event.type === 'threecone') {
    return (
      <EventFrame
        {...props}
        introMessage={`${laneOrder(event.competitors).length} athletes eye the cones`}
        renderTurn={({ athlete: a, turnIndex, lanes, progress, subline }) => {
          const finalValue = event.performances[a];
          const displayValue = countUpStat(progress, finalValue);
          const locked = progress >= DASH_BEATS.official;
          const opacity = edgeFade(progress);
          const { stance, official } = DASH_BEATS;

          let x: number;
          let y: number;
          let facing: 'left' | 'right' = 'right';
          let lean = 0;
          let runCycleSec = 0.42;
          const pose = dashPhasePose(progress);

          if (progress < stance[1]) {
            x = THREE_CONE_C1.x;
            y = routeWalkInY(progress, THREE_CONE_C1.y);
          } else if (progress < official) {
            const u = routeU(progress);
            const pos = easedPathPosition(THREE_CONE_WAYPOINTS, THREE_CONE_CUM, u);
            x = pos.x;
            y = pos.y;
            facing = facingFromDx(pos.dx, facing);
            const plant = nearestPlant(THREE_CONE_WAYPOINTS, THREE_CONE_CUM, u);
            lean = plantLean(plant, PLANT_LEAN_DEG);
            runCycleSec = plantRunCycleSec(plant);
          } else {
            const finish = THREE_CONE_WAYPOINTS[THREE_CONE_WAYPOINTS.length - 1]; // back at C1
            const drift = routeJogOffOffset(progress, -1, 0); // final leg (C2 -> C1) runs leftward
            x = finish.x + drift.dx;
            y = finish.y + drift.dy;
            facing = 'left';
          }

          return (
            <>
              <div className="relative flex-1 overflow-hidden px-4 pb-28 pt-6">
                <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
                  LANE {turnIndex + 1} / {lanes.length}
                </p>

                <svg
                  aria-hidden
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polyline
                    points={THREE_CONE_WAYPOINTS.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="rgba(245,166,35,0.28)"
                    strokeWidth="0.6"
                    strokeDasharray="1.6 1.4"
                  />
                </svg>
                {THREE_CONE_CONES.map((c, i) => <Cone key={i} x={c.x} y={c.y} />)}

                <div
                  className="absolute"
                  style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -100%)', opacity }}
                >
                  <Athlete
                    name={names[a]}
                    color={colors[a]}
                    pose={pose}
                    size={ATHLETE_SIZE}
                    facing={facing}
                    spotlight
                    leanDeg={lean}
                    runCycleSec={runCycleSec}
                  />
                </div>

                {locked && (
                  <OfficialStamp
                    progress={progress}
                    value={finalValue.toFixed(meta.decimals)}
                    unit={meta.unit}
                    phaseDurationMs={phaseDurationMs}
                  />
                )}
              </div>
              <LowerThird
                visible
                label={meta.label}
                round={event.round}
                athleteName={names[a]}
                athleteColor={colors[a]}
                subline={subline}
                statLabel={locked ? undefined : 'CLOCK'}
                statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
              />
            </>
          );
        }}
      />
    );
  }

  // Shuttle (5-10-5): hand touch at each line, one static frame.
  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} athletes set for the shuttle`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress, subline }) => {
        const finalValue = event.performances[a];
        const displayValue = countUpStat(progress, finalValue);
        const locked = progress >= DASH_BEATS.official;
        const opacity = edgeFade(progress);
        const { stance, official } = DASH_BEATS;
        const durMs = Math.max(1, phaseDurationMs);
        const touchHalfWindowFrac = (TOUCH_WINDOW_MS / 2) / durMs;

        let x: number;
        let y: number;
        let facing: 'left' | 'right' = 'right';
        let runCycleSec = 0.42;
        let dipScaleY = 1;
        let dipTranslateYPct = 0;
        let pose = dashPhasePose(progress);

        if (progress < stance[1]) {
          x = SHUTTLE_START.x;
          y = routeWalkInY(progress, SHUTTLE_START.y);
        } else if (progress < official) {
          const u = routeU(progress);
          const pos = easedPathPosition(SHUTTLE_WAYPOINTS, SHUTTLE_CUM, u);
          x = pos.x;
          y = pos.y;
          facing = facingFromDx(pos.dx, facing);
          const plant = nearestPlant(SHUTTLE_WAYPOINTS, SHUTTLE_CUM, u);
          runCycleSec = plantRunCycleSec(plant);

          // Hand touch: a triangular dip peaking exactly on the touch
          // instant, 120ms wide, at each of the two interior waypoints
          // (the 72-line and the 28-line) — a down-reach dip + 'catch'
          // pose that reads as the hand hitting the ground.
          const dip = SHUTTLE_TOUCH_PROGRESS.reduce((max, touchProgress) => {
            const d = Math.abs(progress - touchProgress);
            const strength = d >= touchHalfWindowFrac ? 0 : 1 - d / touchHalfWindowFrac;
            return Math.max(max, strength);
          }, 0);
          if (dip > 0.15) pose = 'catch';
          dipScaleY = 1 - 0.14 * dip;
          dipTranslateYPct = 6 * dip;
        } else {
          const finish = SHUTTLE_WAYPOINTS[SHUTTLE_WAYPOINTS.length - 1]; // through the 58
          const drift = routeJogOffOffset(progress, 1, 0); // final leg (28 -> 58) runs rightward
          x = finish.x + drift.dx;
          y = finish.y + drift.dy;
          facing = 'right';
        }

        return (
          <>
            <div className="relative flex-1 overflow-hidden px-4 pb-28 pt-6">
              <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
                LANE {turnIndex + 1} / {lanes.length}
              </p>

              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polyline
                  points={SHUTTLE_WAYPOINTS.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgba(245,166,35,0.28)"
                  strokeWidth="0.6"
                  strokeDasharray="1.6 1.4"
                />
              </svg>
              {SHUTTLE_LINES.map(l => <ShuttleLine key={l.x} x={l.x} label={l.label} />)}

              <div
                className="absolute"
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -100%)', opacity }}
              >
                <div
                  style={{
                    transform: `scaleY(${dipScaleY}) translateY(${dipTranslateYPct}%)`,
                    transformOrigin: `center ${ATHLETE_SIZE}px`,
                  }}
                >
                  <Athlete
                    name={names[a]}
                    color={colors[a]}
                    pose={pose}
                    size={ATHLETE_SIZE}
                    facing={facing}
                    spotlight
                    runCycleSec={runCycleSec}
                  />
                </div>
              </div>

              {locked && (
                <OfficialStamp
                  progress={progress}
                  value={finalValue.toFixed(meta.decimals)}
                  unit={meta.unit}
                  phaseDurationMs={phaseDurationMs}
                />
              )}
            </div>
            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              subline={subline}
              statLabel={locked ? undefined : 'CLOCK'}
              statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
