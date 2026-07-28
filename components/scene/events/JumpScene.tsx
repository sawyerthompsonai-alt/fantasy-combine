'use client';
import Athlete, { type AthletePose } from '../Athlete';
import LowerThird from '../LowerThird';
import EventFrame from './EventFrame';
import {
  laneOrder, countUpStat, clamp01, easeOut, STAT_REVEAL_FRACTION,
  staggeredSpin, doublePumpScaleY, dampedKeyframes,
} from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';

type JumpType = 'vertical' | 'broad';

// Plausible display ranges used only to scale the vertec reach / tape
// reading visually — the real stat shown always comes from
// event.performances.
const VERTICAL_RANGE: [number, number] = [10, 48];
const BROAD_RANGE: [number, number] = [78, 148];

function scalePct(value: number, [lo, hi]: [number, number], [outLo, outHi]: [number, number]): number {
  const t = clamp01((value - lo) / (hi - lo));
  return outLo + (outHi - outLo) * t;
}

// --- Vertical jump: vertec geometry ----------------------------------------
// Pole at x 58%, a rack of 12 flags spanning the bottom 32% -> 70% of the
// stage. `reachedFlags` (1..12) is how many flags — counted from the bottom
// — the athlete's measured reach clears; those spin away on the swat while
// the ones above stay put, which is the entire visual story of the event.
// RACK_BOTTOM=32 (not the ~24 a static reading of LowerThird's clearance
// would suggest) because the lowest flag's *rotated* bounding box during its
// spin-away — swinging around `origin-left` through up to 140deg — swings
// its far corner measurably lower than its resting position; verified live
// (390x350 + a 24-char name) that the worst frame of that swing still clears
// LowerThird's top edge with margin.
const VERTEC_X = 58;
const RACK_BOTTOM = 32;
const RACK_TOP = 70;
const FLAG_COUNT = 12;
const FLAG_INDEXES = Array.from({ length: FLAG_COUNT }, (_, i) => i);

function flagYPct(i: number): number {
  return RACK_BOTTOM + (i / (FLAG_COUNT - 1)) * (RACK_TOP - RACK_BOTTOM);
}

const VERT_ATH_X = VERTEC_X - 12;
const VERT_GROUND_Y = 8;

// Turn-progress beats (fractions of the 4s turn window).
const V_WALK_IN: [number, number] = [0, 0.12];
const V_LOAD: [number, number] = [0.12, 0.4];
const V_EXPLODE: [number, number] = [0.4, 0.52];
const V_LAND: [number, number] = [0.52, 0.62];
const V_SWAT_START = 0.46; // "at apex" — mid-explode
const V_FLAG_STAGGER_MS = 30;
const V_FLAG_SPIN_MS = 200;
// Uncrouching (the explosive extension out of the load) finishes by this
// fraction — partway through the explode window, well before the apex swat.
const V_UNCROUCH_END = 0.44;

function verticalPose(progress: number): AthletePose {
  if (progress < V_WALK_IN[1]) return 'walk';
  if (progress < V_LOAD[1]) return 'stance';
  if (progress < V_LAND[1]) return 'jump';
  if (progress < STAT_REVEAL_FRACTION) return 'idle';
  return 'walk';
}

function verticalX(progress: number): number {
  if (progress < V_WALK_IN[1]) {
    const u = easeOut(clamp01(progress / V_WALK_IN[1]));
    return (VERT_ATH_X - 18) + 18 * u;
  }
  if (progress < STAT_REVEAL_FRACTION) return VERT_ATH_X;
  const u = easeOut(clamp01((progress - STAT_REVEAL_FRACTION) / (1 - STAT_REVEAL_FRACTION)));
  return VERT_ATH_X - 18 * u;
}

/** How deep into the load crouch the athlete is right now: 0 (upright) ->
 * 1 (full crouch) by the end of V_LOAD, decaying back to 0 by V_UNCROUCH_END
 * as the explosive extension launches the jump. */
function crouchFactor(progress: number): number {
  if (progress < V_LOAD[0]) return 0;
  if (progress < V_LOAD[1]) return easeOut(clamp01((progress - V_LOAD[0]) / (V_LOAD[1] - V_LOAD[0])));
  if (progress < V_UNCROUCH_END) {
    return 1 - easeOut(clamp01((progress - V_LOAD[1]) / (V_UNCROUCH_END - V_LOAD[1])));
  }
  return 0;
}

/** Small impact squish absorbing the landing, peaking mid-V_LAND. */
function landSquish(progress: number): number {
  if (progress < V_EXPLODE[1] || progress > V_LAND[1]) return 0;
  const u = clamp01((progress - V_EXPLODE[1]) / (V_LAND[1] - V_EXPLODE[1]));
  return Math.sin(Math.PI * u) * 0.08;
}

/** Vertical rise (percent of stage height, added to VERT_GROUND_Y) during
 * the explode: a sine arc up and back down, peaking exactly at V_SWAT_START
 * so the apex of the jump lines up with the flag swat. Scaled by how high
 * the athlete actually reached — a bigger jump reads as a bigger leap. */
function verticalRisePct(progress: number, finalValue: number): number {
  if (progress < V_EXPLODE[0] || progress > V_EXPLODE[1]) return 0;
  const u = clamp01((progress - V_EXPLODE[0]) / (V_EXPLODE[1] - V_EXPLODE[0]));
  const jumpRise = scalePct(finalValue, VERTICAL_RANGE, [8, 30]);
  return Math.sin(Math.PI * u) * jumpRise;
}

// --- Broad jump geometry ----------------------------------------------------
const BOARD_X = 20;
const MAT_START = 32;
const MAT_END = 86;
const MAT_TICKS = [6, 7, 8, 9, 10, 11]; // feet, evenly spread across the mat
// Ground level (percent of stage height, from the bottom) the board/mat/
// tape sit at. LowerThird is `fixed inset-x-0 bottom-0 z-20` — anchored to
// the viewport, not this stage div — and paints over anything low enough to
// fall under its bar. Thin/short furniture (tick marks, the board) has no
// content that grows upward past that bar the way the athlete figure does,
// so it needs real clearance rather than the ~8% the original tape/tick
// concept used, or its labels render unreadably underneath the bar.
//
// LowerThird is now a bounded single-line bar (see components/scene/
// LowerThird.tsx), so its height is predictable — but at the shortest
// realistic viewport (390x350) with the longest realistic name (24 chars,
// lib/rooms.ts's cap), it still measures ~296px from the viewport bottom
// (verified live via getBoundingClientRect). Matching RACK_BOTTOM (below)
// keeps a ~15px clearance margin at that worst case with room to spare.
const BOARD_BOTTOM = 24;
const BOARD_H = 6;
const TAPE_Y = BOARD_BOTTOM + BOARD_H; // mat/board top surface
const ATH_GROUND_Y = BOARD_BOTTOM + BOARD_H / 2; // feet roughly mid-board

const B_WALK_IN: [number, number] = [0, 0.12];
const B_ARM_PUMPS: [number, number] = [0.3, 0.45];
const B_LEAP: [number, number] = [0.45, 0.6];
const B_WOBBLE: [number, number] = [0.6, 0.72];
const B_TAPE: [number, number] = [0.72, 0.85];
const B_WALK_OFF_START = 0.9;

const WOBBLE_POINTS: Array<[number, number]> = [[0, 6], [1 / 3, -4], [2 / 3, 2], [1, 0]];

function broadPose(progress: number): AthletePose {
  if (progress < B_WALK_IN[1]) return 'walk';
  if (progress < B_LEAP[0]) return 'idle'; // set on the board + arm pumps
  if (progress < B_WOBBLE[0]) return 'jump'; // leap, knees tucked
  if (progress < B_WOBBLE[1]) return 'catch'; // stick + wobble reads as arm-balance
  if (progress < B_WALK_OFF_START) return 'idle';
  return 'walk';
}

function broadX(progress: number, landX: number): number {
  if (progress < B_WALK_IN[1]) {
    const u = easeOut(clamp01(progress / B_WALK_IN[1]));
    return (BOARD_X - 15) + 15 * u;
  }
  if (progress < B_LEAP[0]) return BOARD_X;
  if (progress < B_LEAP[1]) {
    const u = easeOut(clamp01((progress - B_LEAP[0]) / (B_LEAP[1] - B_LEAP[0])));
    return BOARD_X + (landX - BOARD_X) * u;
  }
  if (progress < B_WALK_OFF_START) return landX;
  const u = easeOut(clamp01((progress - B_WALK_OFF_START) / (1 - B_WALK_OFF_START)));
  return landX + 10 * u;
}

/** Arc height (px) through the air, taller for a longer jump. */
function broadArcPx(progress: number, landX: number): number {
  if (progress < B_LEAP[0] || progress > B_LEAP[1]) return 0;
  const u = clamp01((progress - B_LEAP[0]) / (B_LEAP[1] - B_LEAP[0]));
  const arcHeight = 16 + (landX - BOARD_X) * 0.35;
  return Math.sin(Math.PI * u) * arcHeight;
}

/** Forward lean (deg) mid-air, knees tucked toward the mark. */
function broadAirRotate(progress: number): number {
  if (progress < B_LEAP[0] || progress > B_LEAP[1]) return 0;
  const u = clamp01((progress - B_LEAP[0]) / (B_LEAP[1] - B_LEAP[0]));
  return -Math.sin(Math.PI * u) * 8;
}

/** Stick-the-landing wobble rotation (deg): damped +6/-4/+2/0. */
function broadWobbleRotate(progress: number): number {
  if (progress < B_WOBBLE[0] || progress > B_WOBBLE[1]) return 0;
  const u = clamp01((progress - B_WOBBLE[0]) / (B_WOBBLE[1] - B_WOBBLE[0]));
  return dampedKeyframes(u, WOBBLE_POINTS);
}

/** Body scaleY: two arm pumps (set on the board) that end loaded at the
 * deeper second dip, decaying quickly back to neutral as the leap launches. */
function broadScaleY(progress: number): number {
  if (progress < B_ARM_PUMPS[0]) return 1;
  if (progress <= B_ARM_PUMPS[1]) {
    const u = clamp01((progress - B_ARM_PUMPS[0]) / (B_ARM_PUMPS[1] - B_ARM_PUMPS[0]));
    return doublePumpScaleY(u, 0.12, 0.14);
  }
  const decayEnd = B_LEAP[0] + (B_LEAP[1] - B_LEAP[0]) * 0.15;
  if (progress < decayEnd) {
    const u = easeOut(clamp01((progress - B_ARM_PUMPS[1]) / (decayEnd - B_ARM_PUMPS[1])));
    return 0.86 + 0.14 * u;
  }
  return 1;
}

export default function JumpScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
}) {
  const { event, names, colors, phaseDurationMs } = props;
  const type = event.type as JumpType;
  const meta = EVENT_META[event.type];
  const durMs = Math.max(1, phaseDurationMs);

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} athletes chalk up for the ${meta.label.toLowerCase()}`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress }) => {
        const finalValue = event.performances[a];
        const locked = progress >= STAT_REVEAL_FRACTION;
        const laneLabel = (
          <p className="display absolute left-4 top-4 z-10 text-[10px] text-[var(--muted)] sm:text-xs">
            LANE {turnIndex + 1} / {lanes.length}
          </p>
        );

        if (type === 'vertical') {
          const reachedFlags = Math.max(1, Math.round(scalePct(finalValue, VERTICAL_RANGE, [1, FLAG_COUNT])));
          const staggerFrac = V_FLAG_STAGGER_MS / durMs;
          const spinFrac = V_FLAG_SPIN_MS / durMs;

          const flagsSwattedSoFar = FLAG_INDEXES.slice(0, reachedFlags)
            .filter(i => progress >= V_SWAT_START + i * staggerFrac).length;
          const rackDisplay = reachedFlags > 0 ? finalValue * (flagsSwattedSoFar / reachedFlags) : 0;
          const displayValue = locked ? finalValue : rackDisplay;

          const pose = verticalPose(progress);
          const x = verticalX(progress);
          const rise = verticalRisePct(progress, finalValue);
          const crouch = crouchFactor(progress);
          const squish = landSquish(progress);
          const scaleY = 1 - 0.2 * crouch - squish;
          const bodyTranslateYPct = 8 * crouch + squish * 4;

          return (
            <>
              <div className="relative flex-1 overflow-hidden px-4 pb-28 pt-6">
                {laneLabel}

                {/* vertec pole */}
                <div
                  className="absolute w-1.5 -translate-x-1/2 rounded-full bg-gradient-to-t from-[#3a2f1c] to-[#6b5638]"
                  style={{ left: `${VERTEC_X}%`, bottom: '4%', height: `${RACK_TOP - 4 + 6}%` }}
                />

                {/* flag rack: index < reachedFlags spin away on the swat */}
                {FLAG_INDEXES.map(i => {
                  const swatted = i < reachedFlags;
                  const { eased } = swatted
                    ? staggeredSpin(progress, i, V_SWAT_START, staggerFrac, spinFrac)
                    : { eased: 0 };
                  const y = flagYPct(i);
                  return (
                    <div
                      key={i}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${VERTEC_X}%`, bottom: `${y}%` }}
                    >
                      <div
                        className="h-1.5 w-6 origin-left rounded-full sm:h-2 sm:w-9"
                        style={{
                          marginLeft: '3px',
                          background: i % 2 === 0 ? '#f4f4f2' : 'var(--accent)',
                          transform: `translate(${18 * eased}px, ${-10 * eased}px) rotate(${140 * eased}deg)`,
                          opacity: 1 - eased,
                        }}
                      />
                    </div>
                  );
                })}

                <div
                  className="absolute -translate-x-1/2"
                  style={{ left: `${x}%`, bottom: `${VERT_GROUND_Y + rise}%` }}
                >
                  <div style={{ transform: `scaleY(${scaleY}) translateY(${bodyTranslateYPct}%)`, transformOrigin: 'center bottom' }}>
                    <Athlete name={names[a]} color={colors[a]} pose={pose} size={84} spotlight />
                  </div>
                </div>
              </div>
              <LowerThird
                visible
                label={meta.label}
                round={event.round}
                athleteName={names[a]}
                athleteColor={colors[a]}
                statLabel={locked ? undefined : 'REACH'}
                statValue={`${displayValue.toFixed(meta.decimals)}${meta.unit}`}
              />
            </>
          );
        }

        // broad jump: set on the board -> two arm pumps -> leap -> stick + wobble -> tape.
        const landX = scalePct(finalValue, BROAD_RANGE, [MAT_START, MAT_END]);
        const pose = broadPose(progress);
        const x = broadX(progress, landX);
        const arcPx = broadArcPx(progress, landX);
        const airRotate = broadAirRotate(progress);
        const wobbleRotate = broadWobbleRotate(progress);
        const scaleY = broadScaleY(progress);

        const tapeU = progress < B_TAPE[0]
          ? 0
          : easeOut(clamp01((progress - B_TAPE[0]) / (B_TAPE[1] - B_TAPE[0])));
        const tapeWidthPct = (landX - BOARD_X) * tapeU;
        const tapeValue = finalValue * tapeU;

        return (
          <>
            <div className="relative flex-1 overflow-hidden px-4 pb-28 pt-6">
              {laneLabel}

              {/* landing mat with distance tick marks */}
              <div
                className="absolute rounded-sm bg-[var(--panel)]/70"
                style={{ left: `${MAT_START}%`, bottom: `${BOARD_BOTTOM}%`, width: `${MAT_END - MAT_START}%`, height: `${BOARD_H}%` }}
              />
              {MAT_TICKS.map((ft, i) => {
                const tx = MAT_START + (i / (MAT_TICKS.length - 1)) * (MAT_END - MAT_START);
                return (
                  <div key={ft} className="absolute -translate-x-1/2" style={{ left: `${tx}%`, bottom: `${TAPE_Y}%` }}>
                    <div className="h-3 w-0.5 bg-white/50" />
                    <span className="display absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-[8px] text-white/45 sm:text-[10px]">
                      {ft}&apos;
                    </span>
                  </div>
                );
              })}

              {/* takeoff board with foul line */}
              <div
                className="absolute w-[6%] -translate-x-1/2 rounded-sm border-r-2 border-red-500 bg-white/85"
                style={{ left: `${BOARD_X}%`, bottom: `${BOARD_BOTTOM}%`, height: `${BOARD_H}%` }}
              />

              {/* tape measure, extends from the board to the mark after landing */}
              {tapeU > 0 && (
                <>
                  <div
                    className="absolute h-0.5 bg-white/40"
                    style={{ left: `${BOARD_X}%`, bottom: `${TAPE_Y}%`, width: `${tapeWidthPct}%` }}
                  />
                  <div
                    className="display absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-[var(--accent)] sm:text-sm"
                    style={{ left: `${BOARD_X + tapeWidthPct}%`, bottom: `${TAPE_Y + 2}%` }}
                  >
                    {tapeValue.toFixed(meta.decimals)}{meta.unit}
                  </div>
                </>
              )}

              <div
                className="absolute"
                style={{ left: `${x}%`, bottom: `${ATH_GROUND_Y}%`, transform: `translate(-50%, ${-arcPx}px)` }}
              >
                <div style={{ transform: `scaleY(${scaleY}) rotate(${airRotate + wobbleRotate}deg)`, transformOrigin: 'center bottom' }}>
                  <Athlete name={names[a]} color={colors[a]} pose={pose} size={82} spotlight />
                </div>
              </div>
            </div>
            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              statLabel={locked ? undefined : 'DISTANCE'}
              statValue={`${countUpStat(progress, finalValue).toFixed(meta.decimals)}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
