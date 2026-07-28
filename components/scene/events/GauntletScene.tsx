'use client';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import EventFrame from './EventFrame';
import {
  poseFor, laneOrder, easeOut, edgeFade, clamp01, STAT_REVEAL_FRACTION,
  dampedHops, periodicPulse,
} from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';
import type { EventPhase } from '@/lib/timeline';
import type { AthleteBio } from '@/lib/jokes';

const BALLS = 7;

// Stage geometry (percent-of-stage, top-anchored to match the machine's
// original convention). The turf backdrop (SidelineSet) runs from top:40%
// to the stage bottom, so both landmarks below sit comfortably inside it —
// the machine near the sideline boundary line (top:48%), the catch line a
// bit further downfield/closer to camera.
const MACHINE_X = 7;
const MACHINE_TOP = 55;
const RUNWAY_TOP = 62; // the line the ball travels to meet the jogging athlete
// The athlete is positioned via the existing bottom-anchored Athlete
// convention (DashScene/JumpScene both anchor the figure's feet/name-chip
// this way) — RUNWAY_TOP expressed as a bottom offset is the same physical
// point. At 100-62=38% this clears LowerThird's top edge with wide margin;
// verified live via getBoundingClientRect at 390x350 with a 24-char name
// (see task-12-report.md) — matching Task 11's fix for JumpScene's
// bottom-[16%] overlap by moving well past the ~24% floor that established.
const RUNWAY_BOTTOM = 100 - RUNWAY_TOP;
// Ball tally row: also raised off the old bottom-[16%] baseline per the
// same Task 11 finding, verified live alongside the athlete/machine — 24%
// measured ~14px of clearance at 390x350 with a 24-char name (tighter than
// the ~20-30px margin JumpScene's fix settled on), so this sits at the top
// of Task 11's "~24-32%" range instead.
const TALLY_BOTTOM = 32;

const RUN_CYCLE_SEC = 0.5;
const RECOIL_MS = 60;
const DROP_FLASH_MS = 500;
const TUCK_FRAC = 0.08; // fraction of *overall turn progress* the caught ball stays tucked

// The Athlete figure renders at a fixed px height regardless of stage %
// (see Athlete.tsx's `size` prop), so lifting the tucked ball from its
// bottom-anchored feet up to chest height needs a px offset, not a stage
// percentage. ~55% of the figure's own height (chest sits above the waist)
// plus the name-chip's height+gap below the figure (the anchor is the
// wrapper's bottom edge, which is the chip's bottom, not the feet).
const ATH_SIZE = 84;
const TORSO_LIFT_PX = Math.round(ATH_SIZE * 0.55) + 24;

/** Same runway math the pre-v2 renderer used: a steady left->right jog
 * across the turn window. */
function runwayX(progress: number): number {
  return 15 + 70 * progress;
}

/** Small SVG football — brown ellipse + white laces — used both for balls
 * in flight and the mini tally-row icon. `size` in px. */
function BallIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 20 12.4" aria-hidden>
      <ellipse cx="10" cy="6.2" rx="9.5" ry="6" fill="#7a4321" stroke="#4a2810" strokeWidth="0.6" />
      <line x1="4.5" y1="6.2" x2="15.5" y2="6.2" stroke="#f4f4f2" strokeWidth="0.8" />
      <line x1="7.5" y1="4.7" x2="7.5" y2="7.7" stroke="#f4f4f2" strokeWidth="0.7" />
      <line x1="10" y1="4.4" x2="10" y2="8" stroke="#f4f4f2" strokeWidth="0.7" />
      <line x1="12.5" y1="4.7" x2="12.5" y2="7.7" stroke="#f4f4f2" strokeWidth="0.7" />
    </svg>
  );
}

/** The JUGS machine: two wheels + an angled chassis/barrel pointed downfield
 * toward the catch line, with a brief recoil kick after each launch. */
function JugsMachine({ recoilPx }: { recoilPx: number }) {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      aria-hidden
      style={{ transform: `translateX(${recoilPx}px)` }}
    >
      <circle cx="10" cy="27" r="5.5" fill="#20242c" stroke="#484f5c" strokeWidth="1.4" />
      <circle cx="22" cy="27" r="5.5" fill="#20242c" stroke="#484f5c" strokeWidth="1.4" />
      <rect x="4" y="14" width="24" height="9" rx="2" fill="var(--panel)" stroke="var(--accent)" strokeOpacity="0.6" strokeWidth="1.2" />
      <rect
        x="16" y="2" width="20" height="7" rx="2.5"
        fill="var(--panel)" stroke="var(--accent)" strokeOpacity="0.75" strokeWidth="1.2"
        transform="rotate(24 16 5.5)"
      />
    </svg>
  );
}

export default function GauntletScene(props: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number; turnIndex?: number; athlete?: number;
  bios?: AthleteBio[]; roast?: (athlete: number) => string;
}) {
  const { event, names, colors, phaseDurationMs } = props;
  const meta = EVENT_META.gauntlet;
  const durMs = Math.max(1, phaseDurationMs);
  const recoilFrac = RECOIL_MS / durMs;
  const flashFrac = DROP_FLASH_MS / durMs;

  return (
    <EventFrame
      {...props}
      introMessage={`${laneOrder(event.competitors).length} athletes run the gauntlet`}
      renderTurn={({ athlete: a, turnIndex, lanes, progress, subline }) => {
        // Deterministic, matching the pre-v2 renderer: the *last* `drops`
        // balls in the 7-ball sequence are the drops, the rest are catches.
        const drops = Math.min(BALLS, event.performances[a]);
        const opacity = edgeFade(progress);
        const thrown = Math.min(BALLS, Math.floor(progress * BALLS));
        const dropsSoFar = Array.from({ length: thrown }, (_, b) => b).filter(b => b >= BALLS - drops).length;
        const revealed = progress >= STAT_REVEAL_FRACTION;
        const recoilPx = -2 * periodicPulse(progress, BALLS, recoilFrac);

        // Find the (at most one, in practice) drop ball whose DROP flash is
        // currently live, so the stamp + band dim can key off a single u.
        let dropFlashU: number | null = null;
        for (let b = BALLS - drops; b < BALLS; b++) {
          const windowStart = b / BALLS;
          const windowEnd = (b + 1) / BALLS;
          const deflectAt = windowStart + 0.75 * (windowEnd - windowStart);
          const u = (progress - deflectAt) / flashFrac;
          if (u >= 0 && u < 1) dropFlashU = u;
        }

        return (
          <>
            <div className="relative flex-1 px-4 pb-28 pt-6" style={{ opacity }}>
              <p className="display absolute left-4 top-4 text-[10px] text-[var(--muted)] sm:text-xs">
                LANE {turnIndex + 1} / {lanes.length}
              </p>

              {/* the JUGS machine firing balls downfield */}
              <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${MACHINE_X}%`, top: `${MACHINE_TOP}%` }}>
                <JugsMachine recoilPx={recoilPx} />
              </div>

              {Array.from({ length: BALLS }, (_, b) => {
                const windowStart = b / BALLS;
                const windowEnd = (b + 1) / BALLS;
                const isDrop = b >= BALLS - drops;
                const targetX = runwayX(windowEnd);
                const localT = clamp01((progress - windowStart) / (windowEnd - windowStart));
                const flightT = Math.min(localT, 0.75) / 0.75;
                const deflectAt = windowStart + 0.75 * (windowEnd - windowStart);

                if (progress < windowStart) return null;

                if (localT <= 0.75) {
                  // In flight: flat-arc from the machine to the catch line,
                  // rotating through the pass — a spiral spinning 1.5 full
                  // turns (540deg) over the flight.
                  const eased = easeOut(flightT);
                  const bx = MACHINE_X + (targetX - MACHINE_X) * eased;
                  const arcBump = -4 * Math.sin(Math.PI * flightT);
                  const by = MACHINE_TOP + (RUNWAY_TOP - MACHINE_TOP) * eased + arcBump;
                  return (
                    <div
                      key={b}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${bx}%`, top: `${by}%`, transform: `rotate(${flightT * 540}deg)` }}
                    >
                      <BallIcon size={15} />
                    </div>
                  );
                }

                if (isDrop) {
                  // Deflects off the hands: two decaying bounces away from
                  // the catch point, tumbling, then gone.
                  const u = clamp01((progress - deflectAt) / flashFrac);
                  if (progress >= deflectAt + flashFrac) return null;
                  const bounce = dampedHops(u, 6, 2.4);
                  const bx = targetX + 10 * u;
                  const by = RUNWAY_TOP + bounce + 9 * u;
                  const rot = 540 + u * 720;
                  const fade = u > 0.85 ? clamp01((1 - u) / 0.15) : 1;
                  return (
                    <div
                      key={b}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${bx}%`, top: `${by}%`, transform: `rotate(${rot}deg)`, opacity: fade }}
                    >
                      <BallIcon size={15} />
                    </div>
                  );
                }

                // Caught: tucks in, pinned to the jogging athlete's torso,
                // for the next TUCK_FRAC of overall turn progress, then fades.
                // Anchored the same way as the Athlete itself (bottom:
                // RUNWAY_BOTTOM%, matching its feet/name-chip baseline) plus
                // a fixed px lift to the chest — the Athlete figure is a
                // fixed-px height (ATH_SIZE) regardless of stage %, so the
                // torso offset has to be px too, not a stage percentage.
                const u = clamp01((progress - deflectAt) / TUCK_FRAC);
                if (progress >= deflectAt + TUCK_FRAC) return null;
                const bx = runwayX(progress);
                const fade = u > 0.7 ? clamp01((1 - u) / 0.3) : 1;
                return (
                  <div
                    key={b}
                    className="absolute"
                    style={{
                      left: `${bx}%`, bottom: `${RUNWAY_BOTTOM}%`,
                      transform: `translate(-30%, -${TORSO_LIFT_PX}px)`, opacity: fade,
                    }}
                  >
                    <BallIcon size={13} />
                  </div>
                );
              })}

              <div className="absolute flex gap-1" style={{ left: '6%', bottom: `${TALLY_BOTTOM}%` }}>
                {Array.from({ length: thrown }, (_, b) =>
                  b >= BALLS - drops ? (
                    <span
                      key={b}
                      className="display flex h-4 items-center rounded-sm border border-red-500 bg-red-950/60 px-1 text-[8px] font-bold leading-none text-red-400"
                    >
                      DROP
                    </span>
                  ) : (
                    <span key={b} className="flex h-4 items-center opacity-90">
                      <BallIcon size={14} />
                    </span>
                  ),
                )}
              </div>

              <div className="absolute -translate-x-1/2" style={{ left: `${runwayX(progress)}%`, bottom: `${RUNWAY_BOTTOM}%` }}>
                <Athlete
                  name={names[a]}
                  color={colors[a]}
                  pose={poseFor('gauntlet')}
                  runCycleSec={RUN_CYCLE_SEC}
                  size={ATH_SIZE}
                  spotlight
                />
              </div>

              {/* Broadcast DROP flash: a white camera-flash pop behind a
                  red-bordered stamp that punches in (scale 1.2 -> 1),
                  holding for DROP_FLASH_MS of progress. */}
              {dropFlashU !== null && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-[6%] h-24 w-40 -translate-x-1/2 -translate-y-1/4 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 70%)',
                    opacity: dropFlashU < 0.2 ? 1 - dropFlashU / 0.2 : 0,
                  }}
                />
              )}
              {dropFlashU !== null && (
                <div
                  className="pointer-events-none absolute left-1/2 top-[6%]"
                  style={{ transform: `translateX(-50%) scale(${1.2 - 0.2 * easeOut(Math.min(dropFlashU / 0.3, 1))})` }}
                >
                  <div className="display rounded-sm border-2 border-red-500 bg-red-600/90 px-3 py-1 text-sm font-extrabold tracking-widest text-white shadow-[0_0_18px_rgba(239,68,68,0.7)] sm:text-base">
                    DROP
                  </div>
                </div>
              )}
            </div>

            {/* crowd/wall band dims briefly while the DROP flash is live —
                the band itself lives in Field, above (outside) this stage
                layer, so a fixed overlay matching its footprint (h-16
                sm:h-24, per Field.tsx) is the only way to reach it. Sits
                below the header (z-40) so LIVE/sound stay clickable, above
                everything else. */}
            {dropFlashU !== null && (
              <div
                aria-hidden
                className="pointer-events-none fixed inset-x-0 top-0 z-30 h-16 bg-black/30 sm:h-24"
                style={{ opacity: dropFlashU < 0.4 ? 1 : clamp01((1 - dropFlashU) / 0.6) }}
              />
            )}

            <LowerThird
              visible
              label={meta.label}
              round={event.round}
              athleteName={names[a]}
              athleteColor={colors[a]}
              subline={subline}
              statLabel={revealed ? undefined : 'DROPS'}
              statValue={`${revealed ? drops : dropsSoFar}${meta.unit}`}
            />
          </>
        );
      }}
    />
  );
}
