'use client';
import { useMemo } from 'react';
import Athlete from '../Athlete';
import LowerThird from '../LowerThird';
import TrackLines from '../sets/TrackLines';
import Confetti from '../../Confetti';
import { finishTimesMs } from '@/lib/race';
import {
  FINALE_PICK2_LOCK_OFFSET_MS, FINALE_PICK1_LOCK_OFFSET_MS, type EventPhase,
} from '@/lib/timeline';
import {
  easeOut, clamp01, cameraX, sprintWorldX, sprintSpeed, speedToRunCycleSec,
  sprintLean, FINALE_GUN_FRACTION,
} from '../turnChoreo';
import { EVENT_META, type EventResult } from '@/lib/types';

/** Progress fraction of the `run` phase at which the race visually freezes
 * for the photo finish beat. */
const FREEZE_FRACTION = 0.85;
/** Progress fraction at which the camera begins pushing in toward the
 * finish line; the push continues past FREEZE_FRACTION through the rest of
 * the (frozen) frame, reaching full zoom at progress 1. */
const ZOOM_START_FRACTION = 0.68;
/** Peak zoom multiplier reached at the very end of the run phase. */
const ZOOM_MAX = 1.22;

/** Run-phase lane vertical anchors (percent of stage, top-anchored — see
 * `LANE_TOP_PCTS` usage below: the wrapper's `translate(-50%, -100%)` puts
 * this percentage at the *bottom* of the whole Athlete component, including
 * its name chip, so the figure extends *upward* from here and needs real
 * headroom above it. Task 15 review finding: the original 30%/60% pair put
 * lane 0 only 30% down the stage — nowhere near enough room above for an
 * ~80px figure + name chip at a short viewport (390x350) before it clips
 * its head off against the stage's top edge, and the finish-line zoom
 * (`ZOOM_MAX`, transform-origin near the finish line) makes it worse by
 * growing the figure further as the run approaches its end. Both values
 * below sit in the same "near the bottom of the stage" range DashScene's
 * own 40-yard sprinter already uses safely at this exact viewport
 * (STANCE_Y=78 there) — verified empirically at progress 0.2/0.5/0.75/0.95,
 * 390x350, see task-15-report.md. */
const LANE_TOP_PCTS = [64, 82];

/** Run-phase athlete figure height: `vh`-clamped (small on a short
 * viewport, the original 80px on a normal one) rather than a fixed px
 * height — same technique the results screen below already uses for the
 * champion/runner-up pair, for the same reason (headroom at 390x350),
 * applied here for extra margin on top of `LANE_TOP_PCTS` once the
 * finish-line zoom scales the figure up. `sm:`-and-up viewports are tall
 * enough that this clamps at its 80px ceiling, matching the original size
 * exactly — desktop is unaffected. */
const RUN_ATH_SIZE = 'clamp(52px, 20vh, 80px)';

/** World-space track scale (viewport-% units, matches DashScene's 40-yard
 * dash so `cameraX`'s default anchor/track-max line up with the same
 * panning `TrackLines` layer). */
const START_WORLD = 10;
const FINISH_WORLD = 130;

/** Fixed, hand-placed sparkle positions for the intro's camera-flash
 * shimmer over the crowd band — pure decoration, no randomness (a fixed
 * array reads identically for every viewer, unlike Confetti's sanctioned
 * per-mount randomness). */
const SHIMMER_DOTS: { x: number; y: number; delay: number }[] = [
  { x: 6, y: 30, delay: 0 }, { x: 14, y: 62, delay: 0.5 }, { x: 22, y: 22, delay: 1.1 },
  { x: 31, y: 55, delay: 0.2 }, { x: 40, y: 38, delay: 1.4 }, { x: 49, y: 65, delay: 0.7 },
  { x: 58, y: 25, delay: 1.7 }, { x: 67, y: 58, delay: 0.3 }, { x: 76, y: 34, delay: 1.2 },
  { x: 85, y: 60, delay: 0.9 }, { x: 93, y: 24, delay: 1.9 },
];

/**
 * The champ40 finale: simultaneous head-to-head over the `run` phase (no
 * per-athlete turns, no elimination phase — see lib/timeline.ts), a
 * near-tie race that freezes into a photo finish near the end, then a
 * champion celebration during `results` as picks #2 and #1 lock in
 * sequence.
 */
export default function FinaleScene({
  event, names, colors, phase, phaseElapsedMs, phaseDurationMs,
}: {
  event: EventResult; names: string[]; colors: string[]; phase: EventPhase;
  phaseElapsedMs: number; phaseDurationMs: number;
}) {
  const meta = EVENT_META.champ40;
  const lanes = [...event.competitors].sort((a, b) => a - b);
  const champion = event.ranking[0];
  const runnerUp = event.ranking[1];
  // Confetti keys its one-time piece generation off this array's identity
  // (see components/Confetti.tsx's `useEffect(..., [colors])`) — FinaleScene
  // re-renders every animation frame via the broadcast's rAF clock, so a
  // fresh `[colors[champion]]` literal on every render would re-fire that
  // effect every frame and regenerate 120 random pieces continuously,
  // restarting them from the top instead of letting them fall. Memoized so
  // the array is only a new reference when the champion or palette actually
  // changes.
  const championConfettiColors = useMemo(() => [colors[champion]], [colors, champion]);

  if (phase === 'intro') {
    return (
      <>
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-10 h-16 overflow-hidden sm:h-24">
          {SHIMMER_DOTS.map((d, i) => (
            <span
              key={i}
              className="finale-shimmer-dot absolute block h-1 w-1 rounded-full bg-white"
              style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${d.delay}s` }}
            />
          ))}
        </div>
        <div className="relative flex flex-1 items-center justify-center gap-10 px-4 pb-28 pt-6 sm:gap-20">
          {lanes.map(a => (
            <Athlete key={a} name={names[a]} color={colors[a]} pose="stance" size={96} spotlight />
          ))}
          <p className="display pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse text-3xl text-[var(--accent)]/70 sm:text-5xl">
            VS
          </p>
        </div>
        <LowerThird visible tone="alert" label={meta.label} round={event.round} message="HEAD-TO-HEAD · FINAL TWO PICKS" />
        <style>{`
          @keyframes finale-shimmer { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.85; } }
          .finale-shimmer-dot { animation: finale-shimmer 2.6s ease-in-out infinite; }
        `}</style>
      </>
    );
  }

  if (phase === 'run') {
    const progress = phaseDurationMs > 0 ? clamp01(phaseElapsedMs / phaseDurationMs) : 1;
    const isHold = progress < FINALE_GUN_FRACTION;
    const frozen = progress >= FREEZE_FRACTION;

    // Each competitor's own eased sprint burst from the gun to their
    // `finishTimesMs` entry (scaled to the sprint's own wall-clock window,
    // not the whole run phase, so the hold beat before the gun never
    // contributes travel time) — keeps the near-tie finish that
    // `finishTimesMs` already encodes.
    const sprintWindowMs = phaseDurationMs * (FREEZE_FRACTION - FINALE_GUN_FRACTION);
    const finishes = finishTimesMs(event.ranking, sprintWindowMs);
    const sprintElapsedMs = Math.max(0, Math.min(progress, FREEZE_FRACTION) - FINALE_GUN_FRACTION) * phaseDurationMs;

    const worldX: Record<number, number> = {};
    const runCycleSec: Record<number, number> = {};
    lanes.forEach(a => {
      const finishMs = finishes[a];
      worldX[a] = sprintWorldX(sprintElapsedMs, finishMs, START_WORLD, FINISH_WORLD);
      const peakSpeed = sprintSpeed(0, finishMs, START_WORLD, FINISH_WORLD);
      const speed = sprintSpeed(sprintElapsedMs, finishMs, START_WORLD, FINISH_WORLD);
      runCycleSec[a] = speedToRunCycleSec(speed, peakSpeed);
    });

    // Camera follows the leader (whoever's furthest along right now).
    const leaderWorld = Math.max(...lanes.map(a => worldX[a]));
    const cam = cameraX(leaderWorld);
    const finishVx = FINISH_WORLD - cam;

    // Lean out of the blocks over the first third of the sprint window.
    const accelU = clamp01((progress - FINALE_GUN_FRACTION) / ((FREEZE_FRACTION - FINALE_GUN_FRACTION) / 3));
    const lean = isHold ? 0 : sprintLean(accelU);

    // Suspense beat: the frame darkens slightly through the hold.
    const holdU = clamp01(progress / FINALE_GUN_FRACTION);
    const vignetteOpacity = isHold ? 0.28 * holdU : 0;

    // Photo-finish white flash: opacity 0.85 -> 0 over ~200ms of elapsed
    // time past the freeze instant, computed purely from progress (so a
    // late joiner still lands on the correct flash frame, not a replayed
    // CSS animation).
    const freezeAtMs = phaseDurationMs * FREEZE_FRACTION;
    const msSinceFreeze = Math.max(0, phaseElapsedMs - freezeAtMs);
    const flashOpacity = frozen ? Math.max(0, 0.85 * (1 - msSinceFreeze / 200)) : 0;

    // The camera continues pushing in on the finish line through the
    // frozen tail of the run phase — but only the runners/finish-tape
    // subtree scales, never TrackLines: a `transform` on an ancestor makes
    // TrackLines' `absolute inset-0` resolve against that transformed box
    // instead of the real stage, collapsing it (Task 5).
    const zoomT = clamp01((progress - ZOOM_START_FRACTION) / (1 - ZOOM_START_FRACTION));
    const zoomScale = 1 + zoomT * (ZOOM_MAX - 1);

    return (
      <>
        <div className="relative flex-1 overflow-hidden px-4 pb-28 pt-6">
          <TrackLines offsetPct={cam} />

          {isHold && (
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: vignetteOpacity }} />
          )}

          <div
            className="absolute inset-0"
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: `${finishVx}% 55%`,
              filter: frozen ? 'grayscale(0.55) contrast(1.15) brightness(0.82)' : undefined,
            }}
          >
            {finishVx >= -10 && finishVx <= 110 && (
              <div
                aria-hidden
                className="absolute inset-y-0 w-1 bg-[var(--accent)] shadow-[0_0_12px_rgba(245,166,35,0.7)]"
                style={{ left: `${finishVx}%` }}
              />
            )}

            {lanes.map((a, i) => {
              const vx = worldX[a] - cam;
              return (
                <div
                  key={a}
                  className="absolute"
                  style={{ left: `${vx}%`, top: `${LANE_TOP_PCTS[i]}%`, transform: 'translate(-50%, -100%)' }}
                >
                  <div style={{ transform: `rotate(${lean}deg)`, transformOrigin: 'center 80px' }}>
                    <Athlete
                      name={names[a]}
                      color={colors[a]}
                      pose={isHold ? 'stance' : 'run'}
                      size={RUN_ATH_SIZE}
                      facing="right"
                      spotlight
                      runCycleSec={runCycleSec[a]}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {frozen && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <p className="display animate-pulse text-2xl text-white/90 sm:text-4xl">📸 PHOTO FINISH</p>
            </div>
          )}
        </div>
        <LowerThird
          visible
          tone="alert"
          label={meta.label}
          message={isHold ? 'SET…' : frozen ? 'PHOTO FINISH…' : 'HEAD-TO-HEAD FOR PICK #1'}
        />
        {/* Full-screen photo-finish flash — `fixed`, a sibling of the stage
            (not nested inside it, and never inside a transformed ancestor),
            so it washes the *entire* broadcast frame including the header
            band and LowerThird, not just the stage's own bounding box. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-30 bg-white" style={{ opacity: flashOpacity }} />
      </>
    );
  }

  // results: champion celebration while pick #2 then pick #1 lock in
  // sequence — a slow zoom pushes in on the champion over the first 2s.
  const pick2Locked = phaseElapsedMs >= FINALE_PICK2_LOCK_OFFSET_MS;
  const pick1Locked = phaseElapsedMs >= FINALE_PICK1_LOCK_OFFSET_MS;
  const resultsZoomU = clamp01(phaseElapsedMs / 2000);
  const resultsZoom = 1 + easeOut(resultsZoomU) * 0.12;

  return (
    <>
      {/* This whole block sits in a box whose height is pinned to the full
          stage (Field's `absolute inset-0` children wrapper) — content
          taller than that box overflows past its bottom edge, behind the
          fixed LowerThird bar (the Task 13 review's Finding 3). At a short
          viewport (390x350) with the app's 24-char name limit, the original
          fixed pt-6/gap-6/pb-28 + text-2xl/xl/lg + 110px/90px athlete
          figures added up to more than the box's height. Two changes fix
          it without any JS measurement: the athlete figures use a `vh`-
          clamped size (small on a short viewport, the original fixed px on
          a normal one) instead of a fixed px height, and the base (mobile)
          padding/gap/text sizes are trimmed — `sm:` sizes are unchanged so
          desktop is unaffected. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-16 pt-2 text-center sm:gap-6 sm:pb-28 sm:pt-6">
        {/* Only the athlete pair scales — the message text below stays at
            its natural size so a long name + long copy never gets pushed
            past the viewport edge by an off-center transform-origin (a
            zoom anchored on the champion, who sits left-of-center in this
            row). */}
        <div
          className="flex items-center gap-4 sm:gap-14"
          style={{ transform: `scale(${resultsZoom})`, transformOrigin: '35% center' }}
        >
          <Athlete name={names[champion]} color={colors[champion]} pose="celebrate" size="clamp(56px, 22vh, 110px)" spotlight />
          <Athlete name={names[runnerUp]} color={colors[runnerUp]} pose="idle" size="clamp(46px, 18vh, 90px)" dimmed={pick2Locked} />
        </div>
        {pick1Locked ? (
          <p className="display text-base text-[var(--accent)] sm:text-4xl">🏆 {names[champion]} locks the #1 pick!</p>
        ) : pick2Locked ? (
          <p className="display text-sm text-[var(--text)] sm:text-2xl">{names[runnerUp]} locks pick #2…</p>
        ) : (
          <p className="display text-sm text-[var(--muted)] sm:text-xl">tabulating the finish…</p>
        )}
      </div>
      <LowerThird
        visible
        tone={pick1Locked ? 'default' : 'alert'}
        label="FINAL RESULTS"
        message={
          pick1Locked
            ? `${names[champion]} · PICK #1`
            : pick2Locked
            ? `${names[runnerUp]} · PICK #2 LOCKED`
            : `${meta.label} · RESULTS`
        }
      />
      {pick1Locked && <Confetti colors={championConfettiColors} />}
    </>
  );
}
