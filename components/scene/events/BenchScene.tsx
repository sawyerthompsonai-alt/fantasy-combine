'use client';
import Athlete, { type AthletePose } from '../Athlete';
import LowerThird from '../LowerThird';
import EventFrame from './EventFrame';
import {
  laneOrder, edgeFade, clamp01, easeOut, benchLockouts,
  WALK_IN_FRAC, STAT_REVEAL_FRACTION,
} from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';

// --- Scene geometry ---------------------------------------------------
// A fixed-size local stage (px), centered in the available frame — same
// approach the previous bench implementation used (`-left-16` etc.), just
// with more furniture. Every coordinate below is a point in this box.
const BOX_W = 300;
const BOX_H = 172;

const FLOOR_Y = 158; // ground line — spotter's feet, athlete's feet pre/post lift
const HEAD_X = 70; // bench head end (rack side)
const FOOT_X = 224; // bench foot end
const BENCH_TOP_Y = 118; // bench pad top surface
const BENCH_THICK = 14;

// This bench's own rack posts (distinct from WeightRoom's decorative
// power-rack silhouette stage-left) — sit at the head end, hold the bar
// before/after the set.
const RACK_X1 = 48;
const RACK_X2 = 60;
const RACK_TOP_Y = 22;

// Barbell travel: chest (bottom of a rep) <-> lockout (top, arms extended)
// <-> racked (resting on the posts, slightly higher/further back than a
// dead lockout — the small extra travel reads as "racking it").
const CHEST_X = 100;
const CHEST_Y = 104;
const LOCK_X = 88;
const LOCK_Y = 40;
const RACKED_X = 64;
const RACKED_Y = 28;
const RACK_OUT_FRAC = 0.06; // ~240ms of the 4s turn to slide the bar home

const SPOTTER_X = 20; // stands behind the bench head, outside the rack posts

// Athlete rig: positioned by its visual center (not feet) so the same
// translate(-50%,-50%) anchor works continuously through the walk-in
// rotation from standing (0deg) to lying flat (-90deg) without a jump.
const ATH_SIZE = 84;
const ATH_HALF_H = ATH_SIZE / 2;
const STAND_CENTER_X = 262; // walk-in start, off past the foot end
const STAND_CENTER_Y = FLOOR_Y - ATH_HALF_H;
const LIE_CENTER_X = 134;
const LIE_CENTER_Y = BENCH_TOP_Y - 10;
const SITUP_FRAC = 0.075; // 300ms / TURN_MS(4000ms)

/** Bar position + flex + shake for one instant of the perform window.
 * `frac` is 0 at the chest (bottom of a rep) and 1 at lockout (top); each
 * rep is one full chest->lockout->chest->lockout cycle mapped as a
 * triangle wave so consecutive reps join without a jump (a rep always
 * *ends* at lockout, matching where `benchLockouts` places its tick). */
function repFrame(u: number, lockouts: number[]): { frac: number; velocitySign: number; segLen: number; index: number } {
  if (lockouts.length === 0) return { frac: 1, velocitySign: 0, segLen: 1, index: 0 };
  let index = lockouts.length - 1;
  let segStart = lockouts.length > 1 ? lockouts[lockouts.length - 2] : 0;
  for (let i = 0; i < lockouts.length; i++) {
    const start = i === 0 ? 0 : lockouts[i - 1];
    const end = lockouts[i];
    if (u <= end || i === lockouts.length - 1) {
      index = i;
      segStart = start;
      break;
    }
  }
  const segEnd = lockouts[index];
  const segLen = Math.max(segEnd - segStart, 1e-6);
  const t = clamp01((u - segStart) / segLen);
  const frac = Math.abs(2 * t - 1);
  const velocitySign = t < 0.5 ? -1 : t > 0.5 ? 1 : 0;
  return { frac, velocitySign, segLen, index };
}

function BenchPlate({ cx }: { cx: number }) {
  return (
    <g>
      <circle cx={cx + (cx < 80 ? -4 : 4)} cy="20" r="17" fill="#22252c" stroke="#4a5261" strokeWidth="1.5" opacity="0.85" />
      <circle cx={cx} cy="20" r="17" fill="#1c1f26" stroke="#565f70" strokeWidth="2" />
      <text x={cx} y="24" textAnchor="middle" fontSize="9" fontWeight="800" fill="#aab2c0">45</text>
    </g>
  );
}

export default function BenchScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
}) {
  const { event, names, colors } = props;
  const meta = EVENT_META.bench;

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} athletes chalk their hands · 225 lbs`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress }) => {
        const finalReps = event.performances[a];
        const lockouts = benchLockouts(finalReps);
        const locked = progress >= STAT_REVEAL_FRACTION;
        const opacity = edgeFade(progress);

        // Rep counter — ticks exactly on lockout, driven only by progress.
        const uForCount = clamp01((progress - WALK_IN_FRAC) / (STAT_REVEAL_FRACTION - WALK_IN_FRAC));
        const passedTicks = lockouts.filter(f => f <= uForCount);
        const repCount = passedTicks.length;
        const lastTickU = passedTicks.length ? passedTicks[passedTicks.length - 1] : 0;
        const sinceTick = clamp01((uForCount - lastTickU) / 0.08);
        const pulseScale = passedTicks.length === 0 || locked ? 1 : 1 + 0.15 * (1 - easeOut(sinceTick));

        // Bar position, flex, and struggle shake.
        let barX: number; let barY: number; let flexDeg = 0; let shakeX = 0; let struggling = false;
        if (progress < WALK_IN_FRAC) {
          // Resting on the rack, same spot the first rep's up-stroke ends at
          // (repFrame's segment 0 starts at frac=1, i.e. LOCK_X/LOCK_Y) — so
          // there's no snap when the perform window begins.
          barX = LOCK_X; barY = LOCK_Y;
        } else if (progress < STAT_REVEAL_FRACTION) {
          const u = uForCount;
          const { frac, velocitySign, segLen, index } = repFrame(u, lockouts);
          barX = CHEST_X + (LOCK_X - CHEST_X) * frac;
          barY = CHEST_Y + (LOCK_Y - CHEST_Y) * frac;
          const avgSegLen = 1 / Math.max(finalReps, 1);
          flexDeg = Math.max(-1.2, Math.min(1.2, velocitySign * (avgSegLen / segLen) * 1.2));
          struggling = index >= finalReps - 2;
          if (struggling) shakeX = Math.sin(u * 240) * 1.2;
        } else {
          const rt = easeOut(clamp01((progress - STAT_REVEAL_FRACTION) / RACK_OUT_FRAC));
          barX = LOCK_X + (RACKED_X - LOCK_X) * rt;
          barY = LOCK_Y + (RACKED_Y - LOCK_Y) * rt;
        }

        // Athlete: walk in and lie down, hold through the set, sit up and stand.
        let centerX: number; let centerY: number; let rotationDeg: number; let pose: AthletePose; let facing: 'left' | 'right' = 'right';
        const sitStart = STAT_REVEAL_FRACTION;
        const sitEnd = STAT_REVEAL_FRACTION + SITUP_FRAC;
        if (progress < WALK_IN_FRAC) {
          const wu = clamp01(progress / WALK_IN_FRAC);
          const posT = easeOut(clamp01(wu / 0.7));
          const rotT = easeOut(clamp01((wu - 0.45) / 0.55));
          centerX = STAND_CENTER_X + (LIE_CENTER_X - STAND_CENTER_X) * posT;
          centerY = STAND_CENTER_Y + (LIE_CENTER_Y - STAND_CENTER_Y) * posT;
          rotationDeg = -90 * rotT;
          pose = rotT < 0.85 ? 'walk' : 'lift';
          facing = 'left';
        } else if (progress < sitStart) {
          centerX = LIE_CENTER_X; centerY = LIE_CENTER_Y; rotationDeg = -90; pose = 'lift';
        } else if (progress < sitEnd) {
          const st = easeOut(clamp01((progress - sitStart) / SITUP_FRAC));
          centerX = LIE_CENTER_X;
          centerY = LIE_CENTER_Y + (STAND_CENTER_Y - LIE_CENTER_Y) * st;
          rotationDeg = -90 * (1 - st);
          pose = 'idle';
        } else {
          centerX = LIE_CENTER_X; centerY = STAND_CENTER_Y; rotationDeg = 0; pose = 'idle';
        }

        const spotterX = SPOTTER_X + (struggling ? 4 : 0);

        return (
          <>
            <div className="relative flex-1 px-4 pb-28 pt-6" style={{ opacity }}>
              <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
                LANE {turnIndex + 1} / {lanes.length}
              </p>

              <div className="flex h-full items-center justify-center">
                <div className="relative" style={{ width: BOX_W, height: BOX_H }}>
                  {/* rubber floor is WeightRoom's job — this box only holds furniture */}

                  {/* bench rack posts (head end) */}
                  <div
                    className="absolute rounded-sm bg-[#2b2f38]"
                    style={{ left: RACK_X1, top: RACK_TOP_Y, width: 5, height: FLOOR_Y - RACK_TOP_Y }}
                  />
                  <div
                    className="absolute rounded-sm bg-[#2b2f38]"
                    style={{ left: RACK_X2, top: RACK_TOP_Y, width: 5, height: FLOOR_Y - RACK_TOP_Y }}
                  />
                  <div
                    className="absolute rounded-sm bg-[#3a3f4a]"
                    style={{ left: RACK_X1 - 2, top: RACK_TOP_Y + 4, width: 20, height: 5 }}
                  />

                  {/* spotter, standing behind the bench head */}
                  <div className="absolute -translate-x-1/2" style={{ left: spotterX, bottom: BOX_H - FLOOR_Y }}>
                    <Athlete name="Spotter" color="#5a6170" pose="idle" size={64} dimmed showName={false} />
                  </div>

                  {/* bench pad + legs */}
                  <div
                    className="absolute rounded-md bg-[#23262d] shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
                    style={{ left: HEAD_X, top: BENCH_TOP_Y, width: FOOT_X - HEAD_X, height: BENCH_THICK }}
                  />
                  <div className="absolute bg-[#15171c]" style={{ left: HEAD_X + 8, top: BENCH_TOP_Y + BENCH_THICK, width: 6, height: FLOOR_Y - (BENCH_TOP_Y + BENCH_THICK) }} />
                  <div className="absolute bg-[#15171c]" style={{ left: FOOT_X - 14, top: BENCH_TOP_Y + BENCH_THICK, width: 6, height: FLOOR_Y - (BENCH_TOP_Y + BENCH_THICK) }} />

                  {/* athlete: rotates from standing (walk-in) to lying flat on the bench */}
                  <div
                    className="absolute"
                    style={{ left: centerX, top: centerY, transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)` }}
                  >
                    <Athlete name={names[a]} color={colors[a]} pose={pose} size={ATH_SIZE} facing={facing} showName={false} spotlight />
                  </div>

                  {/* barbell: bar + two 45-plate pairs */}
                  <svg
                    className="absolute overflow-visible"
                    style={{
                      left: barX, top: barY, width: 160, height: 40,
                      transform: `translate(-50%, -50%) rotate(${flexDeg}deg) translateX(${shakeX}px)`,
                    }}
                    viewBox="0 0 160 40"
                  >
                    <line x1="14" y1="20" x2="146" y2="20" stroke="#8a93a3" strokeWidth="4" strokeLinecap="round" />
                    <BenchPlate cx={14} />
                    <BenchPlate cx={146} />
                  </svg>
                </div>
              </div>

              <p
                className="display pointer-events-none absolute bottom-[26%] left-1/2 text-4xl sm:text-5xl"
                style={{
                  transform: `translateX(-50%) scale(${pulseScale})`,
                  color: locked ? 'var(--accent)' : 'var(--text)',
                }}
              >
                {repCount}
              </p>
            </div>
            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              statLabel={locked ? undefined : 'REPS'}
              statValue={`${repCount}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
