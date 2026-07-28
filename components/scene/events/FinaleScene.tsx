'use client';
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
                  style={{ left: `${vx}%`, top: `${30 + i * 30}%`, transform: 'translate(-50%, -100%)' }}
                >
                  <div style={{ transform: `rotate(${lean}deg)`, transformOrigin: 'center 80px' }}>
                    <Athlete
                      name={names[a]}
                      color={colors[a]}
                      pose={isHold ? 'stance' : 'run'}
                      size={80}
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
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-28 pt-6 text-center">
        {/* Only the athlete pair scales — the message text below stays at
            its natural size so a long name + long copy never gets pushed
            past the viewport edge by an off-center transform-origin (a
            zoom anchored on the champion, who sits left-of-center in this
            row). */}
        <div
          className="flex items-center gap-8 sm:gap-14"
          style={{ transform: `scale(${resultsZoom})`, transformOrigin: '35% center' }}
        >
          <Athlete name={names[champion]} color={colors[champion]} pose="celebrate" size={110} spotlight />
          <Athlete name={names[runnerUp]} color={colors[runnerUp]} pose="idle" size={90} dimmed={pick2Locked} />
        </div>
        {pick1Locked ? (
          <p className="display text-2xl text-[var(--accent)] sm:text-4xl">🏆 {names[champion]} locks the #1 pick!</p>
        ) : pick2Locked ? (
          <p className="display text-xl text-[var(--text)] sm:text-2xl">{names[runnerUp]} locks pick #2…</p>
        ) : (
          <p className="display text-lg text-[var(--muted)] sm:text-xl">tabulating the finish…</p>
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
      {pick1Locked && <Confetti colors={[colors[champion]]} />}
    </>
  );
}
