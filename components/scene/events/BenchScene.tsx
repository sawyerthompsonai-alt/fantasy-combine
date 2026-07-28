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
import type { AthleteBio } from '@/lib/jokes';

// --- Scene geometry ---------------------------------------------------
// A fixed-size local stage (px), centered in the available frame — same
// approach the previous bench implementation used (`-left-16` etc.), just
// with more furniture. Every coordinate below is a point in this box.
const BOX_W = 300;
const BOX_H = 172;

// Every geometry constant above is a point/length in that 300x172 space.
// Rather than rendering them as raw px in a fixed-size box (which clips on
// short/narrow stages) or measuring a scale factor in JS and applying
// `transform: scale()` (which has a first-paint frame at native size before
// the measurement lands — a real, reproducible pop/clip on phones, since
// the corrective effect only runs after the initial paint), every value is
// converted to a container-query length: `cqw(x)` -> "x/300 of the query
// container's width", `cqh(y)` -> "y/172 of its height". The container is
// established below (`containerType: 'size'` on the sizer box), sized to
// never exceed 300x172 but shrink-to-fit when the stage is smaller — so
// cqw/cqh already encode the "shrink to fit, never clip" behavior natively,
// resolved by the browser during layout (before the very first paint),
// with no JS measurement step and nothing to correct after the fact.
const cqw = (px: number) => `${(px / BOX_W) * 100}cqw`;
const cqh = (px: number) => `${(px / BOX_H) * 100}cqh`;

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

/** Furniture/athlete/barbell rig, scaled to fit the available stage — pure
 * CSS, no SVG/foreignObject (WebKit has a documented history of
 * foreignObject quirks with absolutely-positioned HTML children and with
 * reflow on viewport changes) and no JS measurement step of any kind (a
 * ResizeObserver-driven `transform: scale()` was tried and rejected: its
 * `useState`/`useEffect` correction runs *after* the first paint, so there
 * is a guaranteed frame — on every mount, i.e. essentially any phone join —
 * where the rig renders at native 300x172 before the effect corrects it,
 * overflowing/clipping exactly like the original bug, just transiently).
 *
 * Instead, every child below is positioned/sized with `cqw`/`cqh` (see the
 * helpers above BOX_W/BOX_H) rather than raw px. Those are container-query
 * length units, resolved relative to the "sizer" div's own box — sized via
 * `aspect-ratio` + a container-query width formula (querying the *stage*,
 * one container out) that never exceeds native 300x172 but shrinks to fit
 * when the stage is smaller. Because container-query units are resolved
 * during layout, before paint, there is no separate "measure, then correct"
 * pass and therefore no wrong first frame — the very first paint is already
 * correctly scaled. The sizer establishes its own `containerType: 'size'`
 * so every descendant's cqw/cqh — furniture position *and* size, and each
 * `<Athlete>`'s own footprint via its string `size` prop (see Athlete.tsx)
 * — scales uniformly together, matching what the (now-removed) `transform:
 * scale()` gave visually, just resolved natively instead of in JS. */
function BenchApparatus(props: {
  spotterX: number;
  centerX: number; centerY: number; rotationDeg: number; pose: AthletePose; facing: 'left' | 'right';
  name: string; color: string;
  barX: number; barY: number; flexDeg: number; shakeX: number;
}) {
  const { spotterX, centerX, centerY, rotationDeg, pose, facing, name, color, barX, barY, flexDeg, shakeX } = props;

  return (
    <div
      className="relative"
      style={{
        width: `min(${BOX_W}px, 100cqw, calc(100cqh * ${BOX_W} / ${BOX_H}))`,
        aspectRatio: `${BOX_W} / ${BOX_H}`,
        containerType: 'size',
      }}
    >
      {/* rubber floor is WeightRoom's job — this box only holds furniture */}

      {/* bench rack posts (head end) */}
      <div
        className="absolute rounded-sm bg-[#2b2f38]"
        style={{ left: cqw(RACK_X1), top: cqh(RACK_TOP_Y), width: cqw(5), height: cqh(FLOOR_Y - RACK_TOP_Y) }}
      />
      <div
        className="absolute rounded-sm bg-[#2b2f38]"
        style={{ left: cqw(RACK_X2), top: cqh(RACK_TOP_Y), width: cqw(5), height: cqh(FLOOR_Y - RACK_TOP_Y) }}
      />
      <div
        className="absolute rounded-sm bg-[#3a3f4a]"
        style={{ left: cqw(RACK_X1 - 2), top: cqh(RACK_TOP_Y + 4), width: cqw(20), height: cqh(5) }}
      />

      {/* spotter, standing behind the bench head */}
      <div className="absolute -translate-x-1/2" style={{ left: cqw(spotterX), bottom: cqh(BOX_H - FLOOR_Y) }}>
        <Athlete name="Spotter" color="#5a6170" pose="idle" size={cqh(64)} dimmed showName={false} />
      </div>

      {/* bench pad + legs */}
      <div
        className="absolute rounded-md bg-[#23262d] shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
        style={{ left: cqw(HEAD_X), top: cqh(BENCH_TOP_Y), width: cqw(FOOT_X - HEAD_X), height: cqh(BENCH_THICK) }}
      />
      <div className="absolute bg-[#15171c]" style={{ left: cqw(HEAD_X + 8), top: cqh(BENCH_TOP_Y + BENCH_THICK), width: cqw(6), height: cqh(FLOOR_Y - (BENCH_TOP_Y + BENCH_THICK)) }} />
      <div className="absolute bg-[#15171c]" style={{ left: cqw(FOOT_X - 14), top: cqh(BENCH_TOP_Y + BENCH_THICK), width: cqw(6), height: cqh(FLOOR_Y - (BENCH_TOP_Y + BENCH_THICK)) }} />

      {/* athlete: rotates from standing (walk-in) to lying flat on the bench */}
      <div
        className="absolute"
        style={{ left: cqw(centerX), top: cqh(centerY), transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)` }}
      >
        <Athlete name={name} color={color} pose={pose} size={cqh(ATH_SIZE)} facing={facing} showName={false} spotlight />
      </div>

      {/* barbell: bar + two 45-plate pairs */}
      <svg
        className="absolute overflow-visible"
        style={{
          left: cqw(barX), top: cqh(barY), width: cqw(160), height: cqh(40),
          transform: `translate(-50%, -50%) rotate(${flexDeg}deg) translateX(${cqw(shakeX)})`,
        }}
        viewBox="0 0 160 40"
      >
        <line x1="14" y1="20" x2="146" y2="20" stroke="#8a93a3" strokeWidth="4" strokeLinecap="round" />
        <BenchPlate cx={14} />
        <BenchPlate cx={146} />
      </svg>
    </div>
  );
}

export default function BenchScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
  bios?: AthleteBio[]; roast?: (athlete: number) => string;
}) {
  const { event, names, colors } = props;
  const meta = EVENT_META.bench;

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} athletes chalk their hands · 225 lbs`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress, subline }) => {
        const finalReps = event.performances[a];
        const lockouts = benchLockouts(finalReps);
        const locked = progress >= STAT_REVEAL_FRACTION;
        const opacity = edgeFade(progress);

        // Rep counter — ticks exactly on lockout, driven only by progress.
        // `rawU` is intentionally left unclamped above 1 (progress can run
        // past STAT_REVEAL_FRACTION while the bar racks out / athlete sits
        // up) so the *final* rep's pulse — whose lockout lands exactly at
        // u===1, the same instant `locked` flips true — still gets its full
        // 0.08-wide decay window instead of being cut off in the frame it
        // should start.
        const rawU = (progress - WALK_IN_FRAC) / (STAT_REVEAL_FRACTION - WALK_IN_FRAC);
        const uForCount = clamp01(rawU);
        const passedTicks = lockouts.filter(f => f <= uForCount);
        const repCount = passedTicks.length;
        const lastTickU = passedTicks.length ? passedTicks[passedTicks.length - 1] : 0;
        const sinceTick = clamp01((rawU - lastTickU) / 0.08);
        const pulseScale = passedTicks.length === 0 ? 1 : 1 + 0.15 * (1 - easeOut(sinceTick));

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
            <div
              className="relative min-h-0 flex-1 px-4 pb-28 pt-6"
              style={{ opacity, containerType: 'size' }}
            >
              <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
                LANE {turnIndex + 1} / {lanes.length}
              </p>

              {/* `containerType: 'size'` above turns this div into a container-
                  query container sized purely by flex-1 (contain:size — its
                  own size is never influenced by BenchApparatus's content),
                  which BenchApparatus's sizer box below queries via cqw/cqh
                  to shrink-to-fit without ever exceeding native size. Pure
                  CSS, resolved during layout before the first paint — no
                  SVG/foreignObject and no JS measurement step. See
                  BenchApparatus for the full rationale. */}
              <div className="flex h-full min-w-0 items-center justify-center">
                <BenchApparatus
                  spotterX={spotterX}
                  centerX={centerX} centerY={centerY} rotationDeg={rotationDeg} pose={pose} facing={facing}
                  name={names[a]} color={colors[a]}
                  barX={barX} barY={barY} flexDeg={flexDeg} shakeX={shakeX}
                />
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
              subline={subline}
              statLabel={locked ? undefined : 'REPS'}
              statValue={`${repCount}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
