'use client';
import Athlete, { type AthletePose } from '../Athlete';
import LowerThird from '../LowerThird';
import TrackLines from '../sets/TrackLines';
import EventFrame from './EventFrame';
import {
  poseFor, laneOrder, countUpStat, pathPosition, facingFromDx, edgeFade, easeOut, clamp01,
  DASH_BEATS, cameraX, STAT_REVEAL_FRACTION, type Point,
} from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';

type WaypointDashType = 'threecone' | 'shuttle';

interface DashConfig {
  /** Percent-space waypoints the runner travels through, in order. */
  waypoints: Point[];
  /** Cone markers (3-cone drill). */
  cones?: Point[];
  /** Touch-line markers, x percentages (shuttle). */
  touchLines?: number[];
  intro: string;
}

const DASH_CONFIG: Record<WaypointDashType, DashConfig> = {
  threecone: {
    waypoints: [{ x: 14, y: 82 }, { x: 46, y: 82 }, { x: 46, y: 50 }, { x: 14, y: 82 }, { x: 88, y: 58 }],
    cones: [{ x: 14, y: 82 }, { x: 46, y: 82 }, { x: 46, y: 50 }],
    intro: 'athletes eye the cones',
  },
  shuttle: {
    waypoints: [{ x: 50, y: 80 }, { x: 76, y: 80 }, { x: 24, y: 80 }, { x: 52, y: 80 }],
    touchLines: [24, 50, 76],
    intro: 'athletes set for the shuttle',
  },
};

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

function TouchLine({ x }: { x: number }) {
  return <div className="absolute bottom-[12%] h-8 w-0.5 -translate-x-1/2 bg-white/25" style={{ left: `${x}%` }} />;
}

// --- 40-yard dash: world-space track geometry (viewport-% units, 3 world
// units ≈ 1 yard — 130 - 10 = 120 world units spans the 40-yard course). ---
const START_WORLD = 10; // start line
const FINISH_WORLD = 130; // 40 yards on
const PULLUP_WORLD = 165; // deceleration carries the runner this far past the tape
const JOGOFF_WORLD = 170; // slow jog drift to the edge of the course
const STANCE_Y = 78;
const WALK_IN_Y_START = 88;
// Rendered figure height, also used to pin the lean rotation's pivot to the
// bottom of the SVG figure (its feet) — Athlete stacks a name chip below
// the figure, so a bare 'center bottom' origin would pivot around the
// bottom of the chip instead and visibly swing the whole figure sideways.
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

export default function DashScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
}) {
  const { event, names, colors, phaseDurationMs } = props;
  const meta = EVENT_META[event.type];

  // The 40 gets its own stance → gun → pan → OFFICIAL choreography; 3-cone
  // and shuttle keep the shared waypoint-path renderer below (rebuilt next
  // in Task 9).
  if (event.type === 'forty') {
    return (
      <EventFrame
        {...props}
        introMessage={`${laneOrder(event.competitors).length} athletes step up to the line`}
        renderTurn={({ athlete: a, turnIndex, lanes, progress }) => {
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

          // OFFICIAL stamp: scale-in + a white flash frame, both timed in
          // real ms (converted to a progress-delta via phaseDurationMs) but
          // still driven purely by `progress` — no Date.now() during render.
          const sinceOfficial = Math.max(0, progress - DASH_BEATS.official);
          const durMs = Math.max(1, phaseDurationMs);
          const scaleU = clamp01(sinceOfficial / (300 / durMs));
          const flashU = clamp01(sinceOfficial / (180 / durMs));
          const stampScale = 0.9 + 0.1 * easeOut(scaleU);
          const flashOpacity = 0.6 * (1 - flashU);

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
                  <div style={{ transform: `rotate(${lean}deg)`, transformOrigin: `center ${ATHLETE_SIZE}px` }}>
                    <Athlete
                      name={names[a]}
                      color={colors[a]}
                      pose={pose}
                      size={ATHLETE_SIZE}
                      facing="right"
                      spotlight
                      runCycleSec={runCycleSec}
                    />
                  </div>
                </div>

                {locked && (
                  <>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-20 bg-white"
                      style={{ opacity: flashOpacity }}
                    />
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                      <div
                        className="display rounded-lg border-2 border-[var(--accent)] bg-[var(--bg)]/90 px-6 py-3 text-center shadow-[0_0_30px_rgba(245,166,35,0.45)]"
                        style={{ transform: `scale(${stampScale})` }}
                      >
                        <p className="text-[10px] tracking-[0.2em] text-[var(--accent)] sm:text-xs">OFFICIAL</p>
                        <p className="stat text-2xl sm:text-4xl">
                          {finalValue.toFixed(meta.decimals)}{meta.unit}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <LowerThird
                visible
                label={meta.label}
                round={event.round}
                athleteName={names[a]}
                athleteColor={colors[a]}
                statLabel={locked ? undefined : 'CLOCK'}
                statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
              />
            </>
          );
        }}
      />
    );
  }

  const type = event.type as WaypointDashType;
  const cfg = DASH_CONFIG[type];

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} ${cfg.intro}`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress }) => {
        const pos = pathPosition(cfg.waypoints, progress);
        const facing = facingFromDx(pos.dx);
        const finalValue = event.performances[a];
        const displayValue = countUpStat(progress, finalValue);
        const locked = progress >= STAT_REVEAL_FRACTION;
        const opacity = edgeFade(progress);

        return (
          <>
            <div className="relative flex-1 px-4 pb-28 pt-6">
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
                  points={cfg.waypoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgba(245,166,35,0.28)"
                  strokeWidth="0.6"
                  strokeDasharray="1.6 1.4"
                />
              </svg>
              {cfg.cones?.map((c, i) => <Cone key={i} x={c.x} y={c.y} />)}
              {cfg.touchLines?.map(x => <TouchLine key={x} x={x} />)}

              <div
                className="absolute"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -100%)',
                  opacity,
                }}
              >
                <Athlete name={names[a]} color={colors[a]} pose={poseFor(event.type)} size={84} facing={facing} spotlight />
              </div>
            </div>
            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              statLabel={locked ? undefined : 'CLOCK'}
              statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
